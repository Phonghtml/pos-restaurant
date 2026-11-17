import { Router } from "express";
import { pool } from "../db";
import { requireRole } from "../auth";

export const reportsRouter = Router();

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// ວັນທີຂອງບິນຄິດຕາມເວລາລາວ (Asia/Vientiane, UTC+7)
const LOCAL_DAY = `(o.paid_at AT TIME ZONE 'Asia/Vientiane')::date`;

// GET /api/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD  (admin)
reportsRouter.get("/sales", requireRole("admin"), async (req, res, next) => {
  try {
    const branchId = req.user!.branchId;
    const from = String(req.query.from ?? "");
    const to = String(req.query.to ?? from);
    if (!DATE.test(from) || !DATE.test(to)) {
      return void res.status(400).json({ error: "from and to must be YYYY-MM-DD" });
    }
    if (to < from) return void res.status(400).json({ error: "to must be >= from" });

    const totals = await pool.query(
      `SELECT COUNT(*)::int AS bills, COALESCE(SUM(o.total_lak), 0) AS revenue
       FROM orders o
       WHERE o.branch_id = $1 AND o.status = 'paid' AND ${LOCAL_DAY} BETWEEN $2::date AND $3::date`,
      [branchId, from, to]
    );

    const byMethod = await pool.query(
      `SELECT p.method, COALESCE(SUM(p.amount_lak), 0) AS amount, COUNT(*)::int AS count
       FROM payments p JOIN orders o ON o.id = p.order_id
       WHERE o.branch_id = $1 AND o.status = 'paid' AND ${LOCAL_DAY} BETWEEN $2::date AND $3::date
       GROUP BY p.method ORDER BY p.method`,
      [branchId, from, to]
    );

    const topItems = await pool.query(
      `SELECT oi.name_snapshot AS name, SUM(oi.quantity)::int AS quantity,
              SUM(oi.unit_price_lak * oi.quantity) AS revenue
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.branch_id = $1 AND o.status = 'paid' AND ${LOCAL_DAY} BETWEEN $2::date AND $3::date
       GROUP BY oi.name_snapshot
       ORDER BY quantity DESC, revenue DESC
       LIMIT 10`,
      [branchId, from, to]
    );

    res.json({
      from,
      to,
      bills: totals.rows[0].bills,
      revenueLak: Number(totals.rows[0].revenue),
      byMethod: byMethod.rows.map((r) => ({ method: r.method, amountLak: Number(r.amount), count: r.count })),
      topItems: topItems.rows.map((r) => ({ name: r.name, quantity: r.quantity, revenueLak: Number(r.revenue) })),
    });
  } catch (err) {
    next(err);
  }
});
