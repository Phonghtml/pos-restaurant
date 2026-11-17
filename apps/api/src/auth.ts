import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "crypto";
import type { NextFunction, Request, Response } from "express";

export type Role = "admin" | "cashier" | "kitchen" | "waiter";

export type AuthUser = { id: string; branchId: string; role: Role; name: string };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// ---- ລະຫັດຜ່ານ: scrypt (ບໍ່ຕ້ອງມີ dependency ເພີ່ມ) ----
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(expected, actual);
}

// ---- Token: HMAC-SHA256 ແບບງ່າຍ (payload.signature) ----
const SECRET = process.env.AUTH_SECRET ?? "";
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 ຊົ່ວໂມງ (ໜຶ່ງກະ)

function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function issueToken(user: AuthUser): string {
  if (!SECRET) throw new Error("AUTH_SECRET is not set");
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + TOKEN_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readToken(token: string): AuthUser | null {
  if (!SECRET) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (data.exp < Date.now()) return null;
  const { exp: _exp, ...user } = data;
  return user as AuthUser;
}

// ---- Middleware ----
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const user = token ? readToken(token) : null;
  if (!user) return void res.status(401).json({ error: "unauthorized" });
  req.user = user;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return void res.status(401).json({ error: "unauthorized" });
    if (!roles.includes(req.user.role)) return void res.status(403).json({ error: "forbidden", role: req.user.role });
    next();
  };
}
