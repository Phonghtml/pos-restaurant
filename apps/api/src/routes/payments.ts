import { Router } from "express";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { requireRole } from "../auth";

export const paymentsRouter = Router();

type Method = "cash" | "qr" | "card";
const METHODS: Method[] = ["cash", "qr", "card"];

async function orderBalance(client: PoolClient, orderId: string) {
  const { rows } = await client.query(
    `SELECT o.status, o.total_lak,
            COALESCE((SELECT SUM(amount_lak) FROM payments p WHERE p.order_id = o.id), 0) AS paid
     FROM orders o WHERE o.id = $1`,
    [orderId]
  );
  if (!rows[0]) return null;
  const total = Number(rows[0].total_lak);
  const paid = Number(rows[0].paid);
  return { status: rows[0].status as string, total, paid, remaining: total - paid };
}

// POST /api/orders/:id/payments
// { method: "cash"|"qr"|"card", amountLak, tenderedLak?, reference?, staffId }
// ຮອງຮັບຈ່າຍຫຼາຍຄັ້ງ/ຫຼາຍວິທີໃນບິນດຽວ (ແບ່ງຈ່າຍ). ເມື່ອຈ່າຍຄົບ ບິນຈະປິດອັດຕະໂນມັດ ແລະ ໂຕະຫວ່າງ.
paymentsRouter.post("/:id/payments", requireRole("admin", "cashier"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { method, amountLak, tenderedLak = null, reference = null } = req.body ?? {};
    const staffId = req.user!.id;

    if (!METHODS.includes(method)) {
      return void res.status(400).json({ error: "invalid_method", allowed: METHODS });
    }
    if (!Number.isInteger(amountLak) || amountLak <= 0) {
      return void res.status(400).json({ error: "amountLak must be a positive integer" });
    }
    if ((method === "qr" || method === "card") && !reference) {
      return void res.status(422).json({ error: "reference_required", detail: "ໃສ່ເລກອ້າງອີງ QR/ບັດ" });
    }
    if (method === "cash" && tenderedLak !== null && (!Number.isInteger(tenderedLak) || tenderedLak < amountLak)) {
      return void res.status(422).json({ error: "tendered_less_than_amount" });
    }
    if (method !== "cash" && tenderedLak !== null) {
      return void res.status(422).json({ error: "tendered_only_for_cash" });
    }

    await client.query("BEGIN");
    // ລ໋ອກແຖວບິນກັນຈ່າຍຊ້ຳພ້ອມກັນ
    await client.query(`SELECT 1 FROM orders WHERE id = $1 FOR UPDATE`, [String(req.params.id)]);
    const fresh = await orderBalance(client, String(req.params.id));
    if (!fresh) {
      await client.query("ROLLBACK");
      return void res.status(404).json({ error: "order_not_found" });
    }
    if (fresh.status !== "open") {
      await client.query("ROLLBACK");
      return void res.status(409).json({ error: "order_not_open" });
    }
    if (fresh.total === 0) {
      await client.query("ROLLBACK");
      return void res.status(422).json({ error: "order_is_empty" });
    }
    if (amountLak > fresh.remaining) {
      await client.query("ROLLBACK");
      return void res.status(422).json({ error: "amount_exceeds_balance", remainingLak: fresh.remaining });
    }

    const inserted = await client.query(
      `INSERT INTO payments (order_id, method, amount_lak, tendered_lak, reference, received_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [String(req.params.id), method, amountLak, tenderedLak, reference, staffId]
    );

    const remaining = fresh.remaining - amountLak;
    const change = method === "cash" && tenderedLak !== null ? tenderedLak - amountLak : 0;
    if (remaining === 0) {
      await client.query(`UPDATE orders SET status = 'paid', paid_at = now() WHERE id = $1`, [String(req.params.id)]);
    }
    await client.query("COMMIT");
    res.status(201).json({
      paymentId: inserted.rows[0].id,
      remainingLak: remaining,
      changeLak: change,
      closed: remaining === 0,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// GET /api/orders/:id/payments
paymentsRouter.get("/:id/payments", requireRole("admin", "cashier"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, method, amount_lak, tendered_lak, reference, created_at
       FROM payments WHERE order_id = $1 ORDER BY created_at`,
      [String(req.params.id)]
    );
    res.json({
      payments: rows.map((r) => ({
        id: r.id,
        method: r.method,
        amountLak: Number(r.amount_lak),
        tenderedLak: r.tendered_lak === null ? null : Number(r.tendered_lak),
        reference: r.reference,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});
