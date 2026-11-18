import express from "express";
import { menuRouter } from "./routes/menu";
import { ordersRouter } from "./routes/orders";
import { paymentsRouter } from "./routes/payments";
import { branchesRouter } from "./routes/branches";
import { kitchenRouter } from "./routes/kitchen";
import { authRouter } from "./routes/auth";
import { reportsRouter } from "./routes/reports";
import { syncRouter } from "./routes/sync";
import { publicRouter } from "./routes/public";
import { qrRouter } from "./routes/qrcodes";
import { requireAuth } from "./auth";

const app = express();
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/public", publicRouter); // ລູກຄ້າ QR: ບໍ່ຕ້ອງ login (ຕ້ອງຢູ່ກ່ອນ requireAuth ຂອງ /api)
app.use("/api/auth", authRouter);
app.use("/api/menu", requireAuth, menuRouter);
app.use("/api/orders", requireAuth, ordersRouter);
app.use("/api/orders", requireAuth, paymentsRouter);
app.use("/api/branches", requireAuth, branchesRouter);
app.use("/api", requireAuth, kitchenRouter);
app.use("/api/reports", requireAuth, reportsRouter);
app.use("/api/sync", syncRouter);
app.use("/api/qr-codes", requireAuth, qrRouter);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`POS API listening on http://localhost:${port}`);
});
