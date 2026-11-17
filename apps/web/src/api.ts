import { clearSession, getSession } from "./session";

export class ApiError extends Error {
  constructor(public status: number, public body: any) {
    super(body?.error ?? `HTTP ${status}`);
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const session = getSession();
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  if (session) headers["Authorization"] = `Bearer ${session.token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(new Event("pos:logout"));
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? "-" : `${n.toLocaleString("en-US")} ກີບ`;

export type MenuOption = { id: string; name: string; extraPriceLak: number };
export type MenuGroup = { id: string; name: string; isRequired: boolean; options: MenuOption[] };
export type MenuItem = { id: string; name: string; priceLak: number | null; isSignature: boolean; optionGroups: MenuGroup[] };
export type MenuCategory = { id: string; name: string; items: MenuItem[] };
