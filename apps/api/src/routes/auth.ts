import { Router } from "express";
import { pool } from "../db";
import { issueToken, requireAuth, verifyPassword } from "../auth";

export const authRouter = Router();

// POST /api/auth/login { username, password }
authRouter.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {};
    if (!username || !password) return void res.status(400).json({ error: "username and password are required" });

    const { rows } = await pool.query(
      `SELECT id, branch_id, name, role, password_hash, is_active FROM staff WHERE username = $1`,
      [username]
    );
    const s = rows[0];
    // ຕອບຂໍ້ຄວາມດຽວກັນທັງກໍລະນີບໍ່ມີ user ແລະ ລະຫັດຜິດ (ປ້ອງກັນເດົາ username)
    if (!s || !s.is_active || !verifyPassword(password, s.password_hash)) {
      return void res.status(401).json({ error: "invalid_credentials" });
    }
    const user = { id: s.id, branchId: s.branch_id, role: s.role, name: s.name };
    res.json({ token: issueToken(user), user });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/logout  (token ເປັນແບບ stateless, client ລຶບເອງ; endpoint ນີ້ມີໄວ້ສຳລັບອະນາຄົດ)
authRouter.post("/logout", requireAuth, (_req, res) => {
  res.json({ ok: true });
});
