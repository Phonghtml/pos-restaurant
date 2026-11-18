export type Role = "admin" | "cashier" | "kitchen" | "waiter";
export type User = { id: string; branchId: string; role: Role; name: string };

const KEY = "pos.session";

export function getSession(): { token: string; user: User } | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: User) {
  localStorage.setItem(KEY, JSON.stringify({ token, user }));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

// ໜ້າທີ່ແຕ່ລະ role ເຫັນ (ຕ້ອງກົງກັບສິດໃນ API)
export function screensFor(role: Role): ("tables" | "kitchen" | "reports" | "qr")[] {
  switch (role) {
    case "admin": return ["tables", "kitchen", "reports", "qr"];
    case "cashier":
    case "waiter": return ["tables"];
    case "kitchen": return ["kitchen"];
  }
}
