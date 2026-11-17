import { api } from "../api";
import { db, type OutboxEvent } from "./db";
import { uuid } from "./uuid";
import { getCache, notifyChanged, setCache } from "./cache";
import { getSession } from "../session";

export type EventType = OutboxEvent["type"];

export async function enqueue(type: EventType, payload: Record<string, any>) {
  const ev: OutboxEvent = { id: uuid(), type, payload, createdAt: new Date().toISOString(), status: "pending" };
  await db.outbox.add(ev);
  notifyChanged();
  void flush();
  return ev;
}

export async function pendingCount() {
  return db.outbox.where("status").equals("pending").count();
}

export async function failedEvents() {
  return db.outbox.where("status").equals("failed").toArray();
}

export async function dismissFailed(id: string) {
  await db.outbox.where("id").equals(id).delete();
  notifyChanged();
}

let flushing = false;

// ສົ່ງເຫດການທີ່ລໍຖ້າຢູ່ຂຶ້ນ server. ປອດໄພກົດຊ້ຳ (server ກັນການ apply ຊ້ຳ)
export async function flush() {
  if (flushing || !navigator.onLine || !getSession()) return;
  flushing = true;
  try {
    const batch = await db.outbox.where("status").equals("pending").sortBy("seq");
    if (batch.length > 0) {
      const { results } = await api<{ results: { id: string; status: string; reason?: string }[] }>("POST", "/api/sync", {
        deviceId: deviceId(),
        events: batch.map((e) => ({ id: e.id, type: e.type, payload: e.payload, createdAt: e.createdAt })),
      });
      const byId = new Map(results.map((r) => [r.id, r]));
      for (const e of batch) {
        const r = byId.get(e.id);
        if (!r) continue;
        if (r.status === "applied" || r.status === "duplicate") {
          await db.outbox.where("id").equals(e.id).delete();
        } else {
          await db.outbox.where("id").equals(e.id).modify({ status: "failed", reason: r.reason ?? "rejected" });
        }
      }
      await refreshCaches([...new Set(batch.map((e) => e.payload.orderId as string | undefined).filter((x): x is string => !!x))]);
    }
  } catch {
    // ຍັງບໍ່ມີເນັດ/server ລົ້ມ: ເຫດການຍັງຢູ່ໃນ outbox ແລະ ຈະລອງໃໝ່
  } finally {
    flushing = false;
    notifyChanged();
  }
}

function deviceId(): string {
  let id = localStorage.getItem("pos.deviceId");
  if (!id) {
    id = uuid();
    localStorage.setItem("pos.deviceId", id);
  }
  return id;
}

// ດຶງຂໍ້ມູນຈາກ server ມາເກັບໄວ້ (ເມນູ, ໂຕະ, ບິນ) ເພື່ອໃຊ້ຕອນອອບລາຍ
export async function refreshCaches(orderIds: string[] = []) {
  if (!navigator.onLine || !getSession()) return;
  try {
    const menu = await api("GET", "/api/menu");
    await setCache("menu", menu.categories);
    const tables = await api("GET", "/api/orders/tables");
    await setCache("tables", tables.tables);
    for (const id of orderIds) {
      const order = await api("GET", `/api/orders/${id}`).catch(() => null);
      if (!order) continue;
      const payments = await api("GET", `/api/orders/${id}/payments`).catch(() => ({ payments: [] }));
      await setCache(`order:${id}`, { ...order, payments: payments.payments });
    }
  } catch {
    // ເງຽບໆ: ຈະລອງໃໝ່ຕອນ flush ຄັ້ງຕໍ່ໄປ
  }
}
