import { db } from "./db";

export async function getCache<T>(key: string): Promise<T | null> {
  const row = await db.cache.get(key);
  return row ? (row.value as T) : null;
}

export async function setCache(key: string, value: unknown) {
  await db.cache.put({ key, value, updatedAt: new Date().toISOString() });
}

// ແຈ້ງ UI ໃຫ້ອ່ານຂໍ້ມູນໃໝ່ເມື່ອ outbox ຫຼື cache ປ່ຽນ
export function notifyChanged() {
  window.dispatchEvent(new Event("pos:data"));
}
