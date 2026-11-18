import { Router } from "express";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { requireRole } from "../auth";

export const kitchenRouter = Router();

type KStatus = "cooking" | "ready" | "served";
// ລຳດັບທີ່ອະນຸຍາດ: pending -> cooking -> ready -> served (ບໍ່ອະນຸຍາດຂ້າມຂັ້ນ)
const NEXT: Record<string, KStatus> = { pending: "cooking", cooking: "ready", ready: "served" };

// POST /api/orders/:id/send-to-kitchen
// ສົ່ງລາຍການທີ່ຍັງບໍ່ເຄີຍສົ່ງໄປຄົວ (ເຮັດຊ້ຳໄດ້ປອດໄພ: ລາຍການທີ່ສົ່ງແລ້ວຈະບໍ່ຖືກສົ່ງຊ້ຳ)
kitchenRouter.post("/orders/:id/send-to-kitchen", requireRole("admin", "cashier", "waiter"), async (req, res, next) => {
  const client: PoolClient = await pool.connect();
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
    const sent = await client.query(
      `UPDATE order_items SET sent_at = now()
       WHERE order_id = $1 AND sent_at IS NULL AND pending_confirm = false
       RETURNING id, name_snapshot, quantity, options_snapshot, note`,
      [String(req.params.id)]
    );
    await client.query("COMMIT");
    res.json({
      sentCount: sent.rowCount,
      items: sent.rows.map((r) => ({
        id: r.id,
        name: r.name_snapshot,
        quantity: r.quantity,
        options: r.options_snapshot,
        note: r.note,
      })),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// GET /api/kitchen/tickets?branchId=...
// ລາຍການທີ່ສົ່ງແລ້ວ ແລະ ຍັງບໍ່ເສີບ, ລຽງຕາມເວລາສົ່ງ (ສຳລັບໜ້າຈໍຄົວ)
kitchenRouter.get("/kitchen/tickets", requireRole("admin", "kitchen"), async (req, res, next) => {
  try {
    const branchId = req.user!.branchId;

    const { rows } = await pool.query(
      `SELECT oi.id, oi.name_snapshot, oi.quantity, oi.options_snapshot, oi.note,
              oi.kitchen_status, oi.sent_at, o.id AS order_id, t.name AS table_name
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN tables t ON t.id = o.table_id
       WHERE o.branch_id = $1 AND o.status = 'open'
         AND oi.sent_at IS NOT NULL AND oi.kitchen_status <> 'served'
       ORDER BY oi.sent_at`,
      [branchId]
    );
    res.json({
      tickets: rows.map((r) => ({
        itemId: r.id,
        orderId: r.order_id,
        table: r.table_name,
        name: r.name_snapshot,
        quantity: r.quantity,
        options: r.options_snapshot,
        note: r.note,
        status: r.kitchen_status,
        sentAt: r.sent_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/kitchen/items/:itemId  { status: "cooking" | "ready" | "served" }
kitchenRouter.patch("/kitchen/items/:itemId", requireRole("admin", "kitchen"), async (req, res, next) => {
  const client: PoolClient = await pool.connect();
  try {
    const { status } = req.body ?? {};
    if (!["cooking", "ready", "served"].includes(status)) {
      return void res.status(400).json({ error: "invalid_status", allowed: ["cooking", "ready", "served"] });
    }

    await client.query("BEGIN");
    const cur = await client.query(
      `SELECT kitchen_status, sent_at FROM order_items WHERE id = $1 FOR UPDATE`,
      [String(req.params.itemId)]
    );
    if (!cur.rows[0]) {
      await client.query("ROLLBACK");
      return void res.status(404).json({ error: "item_not_found" });
    }
    const from = cur.rows[0].kitchen_status as string;
    if (!cur.rows[0].sent_at || NEXT[from] !== status) {
      await client.query("ROLLBACK");
      return void res.status(409).json({ error: "invalid_transition", from, to: status });
    }
    await client.query(`UPDATE order_items SET kitchen_status = $2 WHERE id = $1`, [String(req.params.itemId), status]);
    await client.query("COMMIT");
    res.json({ itemId: String(req.params.itemId), status });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});
