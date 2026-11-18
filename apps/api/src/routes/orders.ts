import { Router } from "express";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { requireRole } from "../auth";

export const ordersRouter = Router();

type Totals = { subtotalLak: number; totalLak: number };

// ຄິດຍອດຈາກລາຍການທັງໝົດ (ບໍ່ມີ VAT)
async function recalcTotals(client: PoolClient, orderId: string): Promise<Totals> {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(unit_price_lak * quantity), 0) AS subtotal
     FROM order_items WHERE order_id = $1`,
    [orderId]
  );
  const subtotal = Number(rows[0].subtotal);
  await client.query(
    `UPDATE orders SET subtotal_lak = $2, total_lak = $2 WHERE id = $1`,
    [orderId, subtotal]
  );
  return { subtotalLak: subtotal, totalLak: subtotal };
}

// GET /api/orders/tables?branchId=...  ສະຖານະໂຕະ
ordersRouter.get("/tables", requireRole("admin", "cashier", "waiter"), async (req, res, next) => {
  try {
    const branchId = req.user!.branchId;

    const { rows } = await pool.query(
      `SELECT t.id, t.name, z.name AS zone, o.id AS open_order_id
       FROM tables t
       LEFT JOIN zones z ON z.id = t.zone_id
       LEFT JOIN orders o ON o.table_id = t.id AND o.status = 'open'
       WHERE t.branch_id = $1
       ORDER BY z.name, t.name`,
      [branchId]
    );
    res.json({
      tables: rows.map((r) => ({
        id: r.id,
        name: r.name,
        zone: r.zone,
        status: r.open_order_id ? "occupied" : "free",
        openOrderId: r.open_order_id,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders  { branchId, tableId, staffId, clientUuid? }
// ເປີດບິນໃໝ່ໃຫ້ໂຕະ; ຖ້າໂຕະມີບິນເປີດຢູ່ແລ້ວ ຈະສົ່ງບິນເກົ່າກັບມາ
ordersRouter.post("/", requireRole("admin", "cashier", "waiter"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { tableId, clientUuid, deviceId } = req.body ?? {};
    const branchId = req.user!.branchId;
    const staffId = req.user!.id;
    if (!tableId) {
      return void res.status(400).json({ error: "tableId is required" });
    }

    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT id FROM orders WHERE table_id = $1 AND status = 'open' FOR UPDATE`,
      [tableId]
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      return void res.json({ orderId: existing.rows[0].id, created: false });
    }

    const { rows } = await client.query(
      `INSERT INTO orders (branch_id, table_id, opened_by, device_id, client_uuid)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (client_uuid) DO UPDATE SET client_uuid = EXCLUDED.client_uuid
       RETURNING id`,
      [branchId, tableId, staffId, deviceId ?? null, clientUuid ?? null]
    );
    await client.query("COMMIT");
    res.status(201).json({ orderId: rows[0].id, created: true });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// GET /api/orders/:id  ບິນພ້ອມລາຍການ ແລະ ຍອດ
ordersRouter.get("/:id", requireRole("admin", "cashier", "waiter"), async (req, res, next) => {
  try {
    const { rows: orderRows } = await pool.query(
      `SELECT id, table_id, status, subtotal_lak, total_lak FROM orders WHERE id = $1`,
      [String(req.params.id)]
    );
    if (!orderRows[0]) return void res.status(404).json({ error: "order_not_found" });

    const { rows: itemRows } = await pool.query(
      `SELECT id, menu_item_id, name_snapshot, unit_price_lak, options_snapshot, quantity, note, kitchen_status, sent_at, pending_confirm
       FROM order_items WHERE order_id = $1 ORDER BY created_at`,
      [String(req.params.id)]
    );
    const o = orderRows[0];
    res.json({
      id: o.id,
      tableId: o.table_id,
      status: o.status,
      totals: {
        subtotalLak: Number(o.subtotal_lak),
        totalLak: Number(o.total_lak),
      },
      items: itemRows.map((i) => ({
        id: i.id,
        menuItemId: i.menu_item_id,
        name: i.name_snapshot,
        unitPriceLak: Number(i.unit_price_lak),
        options: i.options_snapshot,
        quantity: i.quantity,
        note: i.note,
        kitchenStatus: i.kitchen_status,
        sentAt: i.sent_at,
        pendingConfirm: i.pending_confirm,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/:id/items  { menuItemId, quantity, optionIds[], note?, clientUuid? }
// ລາຄາ ແລະ ຊື່ ຖືກດຶງຈາກຖານຂໍ້ມູນ (ບໍ່ເຊື່ອຈາກ client) ແລ້ວ snapshot ໄວ້ໃນລາຍການ
ordersRouter.post("/:id/items", requireRole("admin", "cashier", "waiter"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { menuItemId, quantity = 1, optionIds = [], note = null } = req.body ?? {};
    if (!menuItemId || !Number.isInteger(quantity) || quantity < 1) {
      return void res.status(400).json({ error: "menuItemId and positive integer quantity are required" });
    }

    await client.query("BEGIN");

    const order = await client.query(`SELECT status FROM orders WHERE id = $1 FOR UPDATE`, [String(req.params.id)]);
    if (!order.rows[0]) {
      await client.query("ROLLBACK");
      return void res.status(404).json({ error: "order_not_found" });
    }
    if (order.rows[0].status !== "open") {
      await client.query("ROLLBACK");
      return void res.status(409).json({ error: "order_not_open" });
    }

    const item = await client.query(
      `SELECT id, name, price_lak FROM menu_items WHERE id = $1 AND is_active`,
      [menuItemId]
    );
    if (!item.rows[0]) {
      await client.query("ROLLBACK");
      return void res.status(404).json({ error: "menu_item_not_found" });
    }
    if (item.rows[0].price_lak === null) {
      await client.query("ROLLBACK");
      return void res.status(422).json({ error: "price_not_set", menuItemId });
    }

    // ກວດວ່າຕົວເລືອກຂອງເມນູນີ້ແທ້ ແລະ ກຸ່ມບັງຄັບຖືກເລືອກແລ້ວ
    const groups = await client.query(
      `SELECT g.id, g.name, g.is_required, o.id AS option_id, o.name AS option_name, o.extra_price_lak
       FROM menu_option_groups g
       JOIN menu_options o ON o.option_group_id = g.id
       WHERE g.menu_item_id = $1`,
      [menuItemId]
    );
    const chosen = groups.rows.filter((r) => optionIds.includes(r.option_id));
    for (const g of new Set(groups.rows.map((r) => r.id))) {
      const grp = groups.rows.find((r) => r.id === g)!;
      const picked = chosen.some((c) => c.id === g);
      if (grp.is_required && !picked) {
        await client.query("ROLLBACK");
        return void res.status(422).json({ error: "required_option_missing", group: grp.name });
      }
    }
    if (chosen.length !== optionIds.length) {
      await client.query("ROLLBACK");
      return void res.status(422).json({ error: "invalid_option" });
    }

    const optionsSnapshot = chosen.map((c) => ({
      optionId: c.option_id,
      name: c.option_name,
      extraPriceLak: Number(c.extra_price_lak),
    }));
    const extra = optionsSnapshot.reduce((sum, o) => sum + o.extraPriceLak, 0);
    const unitPrice = Number(item.rows[0].price_lak) + extra;

    const inserted = await client.query(
      `INSERT INTO order_items (order_id, menu_item_id, name_snapshot, unit_price_lak, options_snapshot, quantity, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [String(req.params.id), menuItemId, item.rows[0].name, unitPrice, JSON.stringify(optionsSnapshot), quantity, note]
    );

    const totals = await recalcTotals(client, String(req.params.id));
    await client.query("COMMIT");
    res.status(201).json({ itemId: inserted.rows[0].id, totals });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// POST /api/orders/:id/confirm-items
// ພະນັກງານຢືນຢັນລາຍການທີ່ລູກຄ້າສັ່ງຜ່ານ QR ແລ້ວ (ຫຼັງຢືນຢັນ ສາມາດກົດສົ່ງໄປຄົວໄດ້)
ordersRouter.post("/:id/confirm-items", requireRole("admin", "cashier", "waiter"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const order = await client.query(`SELECT status FROM orders WHERE id = $1 FOR UPDATE`, [String(req.params.id)]);
    if (!order.rows[0]) {
      await client.query("ROLLBACK");
      return void res.status(404).json({ error: "order_not_found" });
    }
    if (order.rows[0].status !== "open") {
      await client.query("ROLLBACK");
      return void res.status(409).json({ error: "order_not_open" });
    }
    const r = await client.query(
      `UPDATE order_items SET pending_confirm = false WHERE order_id = $1 AND pending_confirm RETURNING id`,
      [String(req.params.id)]
    );
    await client.query("COMMIT");
    res.json({ confirmedCount: r.rowCount });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// DELETE /api/orders/:id/items/:itemId  ລຶບລາຍການ (ໄດ້ສະເພາະບິນທີ່ເປີດຢູ່)
ordersRouter.delete("/:id/items/:itemId", requireRole("admin", "cashier", "waiter"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const order = await client.query(`SELECT status FROM orders WHERE id = $1 FOR UPDATE`, [String(req.params.id)]);
    if (!order.rows[0]) {
      await client.query("ROLLBACK");
      return void res.status(404).json({ error: "order_not_found" });
    }
    if (order.rows[0].status !== "open") {
      await client.query("ROLLBACK");
      return void res.status(409).json({ error: "order_not_open" });
    }
    const item = await client.query(
      `SELECT sent_at FROM order_items WHERE id = $1 AND order_id = $2 FOR UPDATE`,
      [String(req.params.itemId), String(req.params.id)]
    );
    if (!item.rows[0]) {
      await client.query("ROLLBACK");
      return void res.status(404).json({ error: "item_not_found" });
    }
    if (item.rows[0].sent_at) {
      await client.query("ROLLBACK");
      return void res.status(409).json({ error: "item_already_sent_to_kitchen" });
    }
    await client.query(`DELETE FROM order_items WHERE id = $1`, [String(req.params.itemId)]);
    const totals = await recalcTotals(client, String(req.params.id));
    await client.query("COMMIT");
    res.json({ totals });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});
