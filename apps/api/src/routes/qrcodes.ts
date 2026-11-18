import { Router } from "express";
import QRCode from "qrcode";
import { pool } from "../db";
import { requireRole } from "../auth";

// QR ຂອງແຕ່ລະໂຕະ (ສຳລັບ admin ພິມໄປຕິດໂຕະ)
// ຕ້ອງຕັ້ງ PUBLIC_BASE_URL ໃນ .env ເປັນ ໂດເມນທີ່ລູກຄ້າເປີດໄດ້ ເຊັ່ນ https://pos.yourdomain.com
export const qrRouter = Router();

qrRouter.get("/", requireRole("admin"), async (req, res, next) => {
  try {
    const base = (process.env.PUBLIC_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
    const { rows } = await pool.query(
      `SELECT name, qr_token FROM tables WHERE branch_id = $1 ORDER BY name`,
      [req.user!.branchId]
    );
    const tables = await Promise.all(
      rows.map(async (r) => {
        const url = `${base}/t/${r.qr_token}`;
        return { tableName: r.name, url, dataUrl: await QRCode.toDataURL(url, { width: 360, margin: 1 }) };
      })
    );
    res.json({ tables });
  } catch (err) {
    next(err);
  }
});
