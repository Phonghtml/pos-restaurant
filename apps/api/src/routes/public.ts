import { Router } from "express";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { loadMenu } from "./menu";

// API ສາທາລະນະສຳລັບລູກຄ້າທີ່ສະແກນ QR ທີ່ໂຕະ (ບໍ່ຕ້ອງ login)
// ລູກຄ້າເຫັນແຕ່ເມນູ ແລະ ສັ່ງໄດ້ສະເພາະໂຕະຂອງຕົນ (ດ້ວຍ qr_token)
export const publicRouter = Router();

// ໄອດີຂອງພະນັກງານ "qr-customer" (ເປີດບິນແທນລູກຄ້າ, login ບໍ່ໄດ້)
const QR_STAFF_ID = "00000000-0000-0000-0000-000000005002";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[0-9a-f]{32}$/;

class Reject extends Error {
  constructor(public code: string, public status = 422) {
    super(code);
  }
}

// ຈຳກັດ 60 ຄຳຂໍ/ນາທີ ຕໍ່ IP (ກັນສະແປມ)
const hits = new Map<string, { count: number; resetAt: number }>();
publicRouter.use((req, res, next) => {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  h.count += 1;
  if (h.count > 60) return void res.status(429).json({ error: "too_many_requests" });
  next();
});

async function findTable(token: string) {
  if (!TOKEN.test(token)) return null;
  const { rows } = await pool.query(
    `SELECT t.id, t.name, t.branch_id, b.name AS branch_name
     FROM tables t JOIN branches b ON b.id = t.branch_id
     WHERE t.qr_token = $1`,
    [token]
  );
  return rows[0] ?? null;
}

// GET /api/public/tables/:token  ຊື່ໂຕະ + ເມນູ
publicRouter.get("/tables/:token", async (req, res, next) => {
  try {
    const t = await findTable(String(req.params.token));
    if (!t) return void res.status(404).json({ error: "table_not_found" });
    const categories = await loadMenu(t.branch_id);
    res.json({ tableName: t.name, branchName: t.branch_name, categories });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/tables/:token/order  ບິນປັດຈຸບັນຂອງໂຕະ (ບໍ່ມີຂໍ້ມູນພະນັກງານ/ການຊຳລະ)
publicRouter.get("/tables/:token/order", async (req, res, next) => {
  try {
    const t = await findTable(String(req.params.token));
    if (!t) return void res.status(404).json({ error: "table_not_found" });
    const o = await pool.query(`SELECT id, total_lak FROM orders WHERE table_id = $1 AND status = 'open'`, [t.id]);
    if (!o.rows[0]) return void res.json({ open: false, totalLak: 0, items: [] });
    const items = await pool.query(
      `SELECT id, name_snapshot, unit_price_lak, options_snapshot, quantity, sent_at, pending_confirm
       FROM order_items WHERE order_id = $1 ORDER BY created_at`,
      [o.rows[0].id]
    );
    res.json({
      open: true,
      totalLak: Number(o.rows[0].total_lak),
      items: items.rows.map((i) => ({
        id: i.id,
        name: i.name_snapshot,
        unitPriceLak: Number(i.unit_price_lak),
        quantity: i.quantity,
        options: (i.options_snapshot ?? []).map((x: { name: string }) => x.name),
        pending: i.pending_confirm,
        sent: !!i.sent_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ກວດ ແລະ ເພີ່ມ 1 ລາຍການ: ລາຄາ ແລະ ຊື່ມາຈາກຖານຂໍ້ມູນ, ລາຍການນີ້ລໍຖ້າພະນັກງານຢືນຢັນ
async function addLine(
  c: PoolClient,
  orderId: string,
  branchId: string,
  menuItemId: string,
  quantity: number,
  optionIds: string[]
) {
  const item = await c.query(
    `SELECT name, price_lak FROM menu_items WHERE id = $1 AND branch_id = $2 AND is_active`,
    [menuItemId, branchId]
  );
  if (!item.rows[0]) throw new Reject("menu_item_not_found", 404);
  if (item.rows[0].price_lak === null) throw new Reject("price_not_set");

  const groups = await c.query(
    `SELECT g.id, g.name, g.is_required, o.id AS option_id, o.name AS option_name, o.extra_price_lak
     FROM menu_option_groups g JOIN menu_options o ON o.option_group_id = g.id
     WHERE g.menu_item_id = $1`,
    [menuItemId]
  );
  const chosen = groups.rows.filter((r) => optionIds.includes(r.option_id));
  if (chosen.length !== new Set(optionIds).size) throw new Reject("invalid_option");

  // ແຕ່ລະກຸ່ມເລືອກໄດ້ 1 ຕົວເລືອກ
  const seen = new Set<string>();
  for (const ch of chosen) {
    if (seen.has(ch.id)) throw new Reject("invalid_option");
    seen.add(ch.id);
  }
  for (const gid of new Set(groups.rows.map((r) => r.id))) {
    const g = groups.rows.find((r) => r.id === gid)!;
    if (g.is_required && !seen.has(gid)) throw new Reject("required_option_missing");
  }

  const snapshot = chosen.map((ch) => ({
    optionId: ch.option_id,
    name: ch.option_name,
    extraPriceLak: Number(ch.extra_price_lak),
  }));
  const unit = Number(item.rows[0].price_lak) + snapshot.reduce((s, o) => s + o.extraPriceLak, 0);

  await c.query(
    `INSERT INTO order_items (order_id, menu_item_id, name_snapshot, unit_price_lak, options_snapshot, quantity, pending_confirm)
     VALUES ($1, $2, $3, $4, $5, $6, true)`,
    [orderId, menuItemId, item.rows[0].name, unit, JSON.stringify(snapshot), quantity]
  );
}

// POST /api/public/tables/:token/orders  { items: [{ menuItemId, quantity, optionIds[] }] }
publicRouter.post("/tables/:token/orders", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const t = await findTable(String(req.params.token));
    if (!t) return void res.status(404).json({ error: "table_not_found" });

    const input: { menuItemId: string; quantity: number; optionIds?: string[] }[] = Array.isArray(req.body?.items)
      ? req.body.items
      : [];
    if (input.length === 0 || input.length > 20) {
      return void res.status(400).json({ error: "items_must_be_1_to_20" });
    }
    for (const it of input) {
      if (!it || typeof it.menuItemId !== "string" || !UUID.test(it.menuItemId)) {
        return void res.status(400).json({ error: "invalid_menu_item" });
      }
      if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 20) {
        return void res.status(400).json({ error: "invalid_quantity" });
      }
      if (it.optionIds !== undefined && (!Array.isArray(it.optionIds) || it.optionIds.some((x) => typeof x !== "string" || !UUID.test(x)))) {
        return void res.status(400).json({ error: "invalid_options" });
      }
    }

    await client.query("BEGIN");
    await client.query(`SELECT 1 FROM tables WHERE id = $1 FOR UPDATE`, [t.id]);
    const existing = await client.query(
      `SELECT id FROM orders WHERE table_id = $1 AND status = 'open' FOR UPDATE`,
      [t.id]
    );
    let orderId: string;
    if (existing.rows[0]) {
      orderId = existing.rows[0].id;
    } else {
      const created = await client.query(
        `INSERT INTO orders (branch_id, table_id, opened_by) VALUES ($1, $2, $3) RETURNING id`,
        [t.branch_id, t.id, QR_STAFF_ID]
      );
      orderId = created.rows[0].id;
    }

    for (const it of input) {
      await addLine(client, orderId, t.branch_id, it.menuItemId, it.quantity, it.optionIds ?? []);
    }

    await client.query(
      `UPDATE orders SET subtotal_lak = s.total, total_lak = s.total
       FROM (SELECT COALESCE(SUM(unit_price_lak * quantity), 0) AS total FROM order_items WHERE order_id = $1) s
       WHERE orders.id = $1`,
      [orderId]
    );
    await client.query("COMMIT");
    res.status(201).json({ orderId, added: input.length });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err instanceof Reject) return void res.status(err.status).json({ error: err.code });
    next(err);
  } finally {
    client.release();
  }
});
