import { Router } from "express";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { requireAuth, type Role } from "../auth";

// POST /api/sync  { events: [{ id, type, payload, createdAt, deviceId }] }
// ໃຊ້ຕອນເຄື່ອງກັບມາອອນລາຍ: ນຳເຫດການທີ່ເກັບໄວ້ offline ມາ apply ຕາມລຳດັບ.
// id ຂອງເຫດການ = client_uuid (ບໍ່ apply ຊ້ຳ). orderId/itemId/paymentId ສ້າງໂດຍ client (UUID).
export const syncRouter = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_ROLES: Record<string, Role[]> = {
  open_order: ["admin", "cashier", "waiter"],
  add_item: ["admin", "cashier", "waiter"],
  delete_item: ["admin", "cashier", "waiter"],
  send_to_kitchen: ["admin", "cashier", "waiter"],
  pay: ["admin", "cashier"],
};

type Result = { id: string; status: "applied" | "duplicate" | "rejected"; reason?: string; detail?: unknown };

class Reject extends Error {
  constructor(public reason: string, public detail?: unknown) {
    super(reason);
  }
}

async function applyEvent(c: PoolClient, ev: any, branchId: string, staffId: string, deviceId: string) {
  const p = ev.payload ?? {};
  const need = (cond: boolean, reason: string) => { if (!cond) throw new Reject(reason); };

  // ຄົ້ນຫາບິນ ແລະ ກວດວ່າຍັງເປີດຢູ່ ແລະ ເປັນສາຂາດຽວກັນ
  async function openOrder(orderId: string) {
    const r = await c.query(`SELECT status, branch_id FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    if (!r.rows[0] || r.rows[0].branch_id !== branchId) throw new Reject("order_not_found");
    if (r.rows[0].status !== "open") throw new Reject("order_not_open");
  }

  switch (ev.type) {
    case "open_order": {
      need(UUID.test(p.orderId) && UUID.test(p.tableId), "invalid_ids");
      const t = await c.query(`SELECT id FROM tables WHERE id = $1 AND branch_id = $2`, [p.tableId, branchId]);
      if (!t.rows[0]) throw new Reject("table_not_found");
      const existing = await c.query(`SELECT id FROM orders WHERE table_id = $1 AND status = 'open' FOR UPDATE`, [p.tableId]);
      if (existing.rows[0]) {
        if (existing.rows[0].id === p.orderId) return;
        throw new Reject("table_already_has_open_order", { existingOrderId: existing.rows[0].id });
      }
      await c.query(
        `INSERT INTO orders (id, branch_id, table_id, opened_by, device_id) VALUES ($1, $2, $3, $4, $5)`,
        [p.orderId, branchId, p.tableId, staffId, deviceId]
      );
      return;
    }

    case "add_item": {
      need(UUID.test(p.orderId) && UUID.test(p.itemId) && UUID.test(p.menuItemId), "invalid_ids");
      const quantity = Number.isInteger(p.quantity) && p.quantity > 0 ? p.quantity : 1;
      const optionIds: string[] = Array.isArray(p.optionIds) ? p.optionIds : [];
      await openOrder(p.orderId);

      const item = await c.query(`SELECT name, price_lak FROM menu_items WHERE id = $1 AND is_active AND branch_id = $2`, [p.menuItemId, branchId]);
      if (!item.rows[0]) throw new Reject("menu_item_not_found");
      if (item.rows[0].price_lak === null) throw new Reject("price_not_set");

      const groups = await c.query(
        `SELECT g.id, g.name, g.is_required, o.id AS option_id, o.name AS option_name, o.extra_price_lak
         FROM menu_option_groups g JOIN menu_options o ON o.option_group_id = g.id
         WHERE g.menu_item_id = $1`,
        [p.menuItemId]
      );
      const chosen = groups.rows.filter((r) => optionIds.includes(r.option_id));
      if (chosen.length !== optionIds.length) throw new Reject("invalid_option");
      for (const g of groups.rows.filter((r, i, a) => a.findIndex((x) => x.id === r.id) === i)) {
        if (g.is_required && !chosen.some((c2) => c2.id === g.id)) throw new Reject("required_option_missing", { group: g.name });
      }
      const snapshot = chosen.map((ch) => ({ optionId: ch.option_id, name: ch.option_name, extraPriceLak: Number(ch.extra_price_lak) }));
      const unit = Number(item.rows[0].price_lak) + snapshot.reduce((s, o) => s + o.extraPriceLak, 0);

      await c.query(
        `INSERT INTO order_items (id, order_id, menu_item_id, name_snapshot, unit_price_lak, options_snapshot, quantity, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [p.itemId, p.orderId, p.menuItemId, item.rows[0].name, unit, JSON.stringify(snapshot), quantity, p.note ?? null]
      );
      await recalc(c, p.orderId);
      return;
    }

    case "delete_item": {
      need(UUID.test(p.orderId) && UUID.test(p.itemId), "invalid_ids");
      await openOrder(p.orderId);
      const it = await c.query(`SELECT sent_at FROM order_items WHERE id = $1 AND order_id = $2 FOR UPDATE`, [p.itemId, p.orderId]);
      if (!it.rows[0]) return; // ລຶບແລ້ວ: ຖືວ່າສຳເລັດ (idempotent)
      if (it.rows[0].sent_at) throw new Reject("item_already_sent_to_kitchen");
      await c.query(`DELETE FROM order_items WHERE id = $1`, [p.itemId]);
      await recalc(c, p.orderId);
      return;
    }

    case "send_to_kitchen": {
      need(UUID.test(p.orderId), "invalid_ids");
      await openOrder(p.orderId);
      await c.query(`UPDATE order_items SET sent_at = now() WHERE order_id = $1 AND sent_at IS NULL AND pending_confirm = false`, [p.orderId]);
      return;
    }

    case "pay": {
      need(UUID.test(p.orderId) && UUID.test(p.paymentId), "invalid_ids");
      need(["cash", "qr", "card"].includes(p.method), "invalid_method");
      need(Number.isInteger(p.amountLak) && p.amountLak > 0, "invalid_amount");
      if (p.method !== "cash") need(!!p.reference, "reference_required");
      await openOrder(p.orderId);
      const pend = await c.query(`SELECT 1 FROM order_items WHERE order_id = $1 AND pending_confirm LIMIT 1`, [p.orderId]);
      if (pend.rows[0]) throw new Reject("pending_items_not_confirmed");
      const bal = await c.query(
        `SELECT o.total_lak - COALESCE((SELECT SUM(amount_lak) FROM payments WHERE order_id = o.id), 0) AS remaining
         FROM orders o WHERE o.id = $1`,
        [p.orderId]
      );
      const remaining = Number(bal.rows[0].remaining);
      if (p.amountLak > remaining) throw new Reject("amount_exceeds_balance", { remainingLak: remaining });
      await c.query(
        `INSERT INTO payments (id, order_id, method, amount_lak, tendered_lak, reference, received_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [p.paymentId, p.orderId, p.method, p.amountLak, p.method === "cash" ? p.tenderedLak ?? null : null, p.reference ?? null, staffId]
      );
      if (remaining - p.amountLak === 0) {
        await c.query(`UPDATE orders SET status = 'paid', paid_at = now() WHERE id = $1`, [p.orderId]);
      }
      return;
    }

    default:
      throw new Reject("unknown_event_type");
  }
}

async function recalc(c: PoolClient, orderId: string) {
  await c.query(
    `UPDATE orders SET subtotal_lak = s.total, total_lak = s.total
     FROM (SELECT COALESCE(SUM(unit_price_lak * quantity), 0) AS total FROM order_items WHERE order_id = $1) s
     WHERE orders.id = $1`,
    [orderId]
  );
}

syncRouter.post("/", requireAuth, async (req, res, next) => {
  const events: any[] = Array.isArray(req.body?.events) ? req.body.events : [];
  if (events.length === 0 || events.length > 200) {
    return void res.status(400).json({ error: "events must be 1..200 items" });
  }
  const user = req.user!;
  const deviceId = String(req.body?.deviceId ?? "unknown").slice(0, 64);
  const results: Result[] = [];

  for (const ev of events) {
    const id = String(ev?.id ?? "");
    if (!UUID.test(id)) {
      results.push({ id, status: "rejected", reason: "invalid_event_id" });
      continue;
    }
    const allowed = EVENT_ROLES[ev.type];
    if (!allowed) {
      results.push({ id, status: "rejected", reason: "unknown_event_type" });
      continue;
    }
    if (!allowed.includes(user.role)) {
      results.push({ id, status: "rejected", reason: "forbidden" });
      continue;
    }

    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const dup = await c.query(
        `INSERT INTO sync_events (branch_id, device_id, event_type, payload, client_uuid)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (client_uuid) DO NOTHING RETURNING id`,
        [user.branchId, deviceId, ev.type, JSON.stringify(ev.payload ?? {}), id]
      );
      if (dup.rowCount === 0) {
        await c.query("ROLLBACK");
        results.push({ id, status: "duplicate" });
        continue;
      }
      await applyEvent(c, ev, user.branchId, user.id, deviceId);
      await c.query("COMMIT");
      results.push({ id, status: "applied" });
    } catch (err: any) {
      await c.query("ROLLBACK").catch(() => {});
      if (err instanceof Reject) {
        results.push({ id, status: "rejected", reason: err.reason, detail: err.detail });
      } else {
        console.error(err);
        results.push({ id, status: "rejected", reason: "server_error" });
      }
    } finally {
      c.release();
    }
  }

  res.json({ results });
});
