import { Router } from "express";
import { pool } from "../db";
import { requireRole } from "../auth";

export const branchesRouter = Router();

// GET /api/branches/:id/payment-account
// ສົ່ງບັນຊີຮັບເງິນ QR/ໂອນ ເພື່ອສະແດງໃຫ້ລູກຄ້າ/ພະນັກງານເຫັນ (ຕ້ອງມີ auth ກ່ອນນຳໃຊ້ຈິງ)
branchesRouter.get("/:id/payment-account", requireRole("admin", "cashier"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT payment_bank, payment_account_no, payment_account_name
       FROM branches WHERE id = $1`,
      [String(req.params.id)]
    );
    if (!rows[0]) return void res.status(404).json({ error: "branch_not_found" });
    if (!rows[0].payment_account_no) {
      return void res.status(404).json({ error: "payment_account_not_set" });
    }
    res.json({
      bank: rows[0].payment_bank,
      accountNo: rows[0].payment_account_no,
      accountName: rows[0].payment_account_name,
    });
  } catch (err) {
    next(err);
  }
});
