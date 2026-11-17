// ສ້າງມຸມມອງ "ປັດຈຸບັນ" ໃຫ້ UI: ສະແນບສຳເນົາຈາກ server (cache) + ເຫດການທີ່ລໍຖ້າຢູ່ໃນ outbox
import { getCache } from "./cache";
import { db, type OutboxEvent } from "./db";

export type LocalItem = {
  id: string;
  name: string;
  unitPriceLak: number;
  quantity: number;
  options: { name: string }[];
  note: string | null;
  sentAt: string | null;
};

export type LocalOrder = {
  id: string;
  tableId: string | null;
  status: "open" | "paid";
  items: LocalItem[];
  payments: { id: string; method: string; amountLak: number }[];
  totalLak: number;
  paidLak: number;
  remainingLak: number;
  hasPending: boolean;
};

type ServerOrder = {
  id: string;
  tableId: string;
  status: "open" | "paid" | "void";
  items: { id: string; name: string; unitPriceLak: number; options: { name: string }[]; quantity: number; note: string | null; sentAt: string | null }[];
  payments: { id: string; method: string; amountLak: number }[];
};

export async function localOrder(orderId: string): Promise<LocalOrder | null> {
  const base = await getCache<ServerOrder>(`order:${orderId}`);
  const pending = await db.outbox.where("status").equals("pending").sortBy("seq");
  const mine = pending.filter((e) => e.payload.orderId === orderId);
  const created = mine.find((e) => e.type === "open_order");
  if (!base && !created) return null;

  const o: { tableId: string | null; status: "open" | "paid"; items: LocalItem[]; payments: LocalOrder["payments"] } = {
    tableId: base?.tableId ?? created?.payload.tableId ?? null,
    status: base?.status === "paid" ? "paid" : "open",
    items: (base?.items ?? []).map((i) => ({ ...i })),
    payments: [...(base?.payments ?? [])],
  };

  for (const e of mine) apply(o, e);

  const totalLak = o.items.reduce((s, i) => s + i.unitPriceLak * i.quantity, 0);
  const paidLak = o.payments.reduce((s, p) => s + p.amountLak, 0);
  return {
    id: orderId,
    ...o,
    totalLak,
    paidLak,
    remainingLak: totalLak - paidLak,
    hasPending: mine.length > 0,
  };
}

function apply(o: { status: "open" | "paid"; items: LocalItem[]; payments: LocalOrder["payments"] }, e: OutboxEvent) {
  const p = e.payload;
  switch (e.type) {
    case "add_item":
      o.items.push({
        id: p.itemId,
        name: p.name,
        unitPriceLak: p.unitPriceLak,
        quantity: p.quantity,
        options: p.options ?? [],
        note: p.note ?? null,
        sentAt: null,
      });
      break;
    case "delete_item":
      o.items = o.items.filter((i) => i.id !== p.itemId || i.sentAt);
      break;
    case "send_to_kitchen":
      o.items = o.items.map((i) => (i.sentAt ? i : { ...i, sentAt: e.createdAt }));
      break;
    case "pay": {
      o.payments.push({ id: p.paymentId, method: p.method, amountLak: p.amountLak });
      const total = o.items.reduce((s, i) => s + i.unitPriceLak * i.quantity, 0);
      const paid = o.payments.reduce((s, x) => s + x.amountLak, 0);
      if (paid >= total) o.status = "paid";
      break;
    }
    default:
      break;
  }
}

// ໂຕະ: ສະຖານະຈາກ cache + ການເປີດບິນ/ຊຳລະທີ່ລໍຖ້າຢູ່
export async function localTables() {
  const tables = (await getCache<any[]>("tables")) ?? [];
  const pending = await db.outbox.where("status").equals("pending").sortBy("seq");
  const opened = new Map<string, string>(); // tableId -> orderId
  for (const e of pending) if (e.type === "open_order") opened.set(e.payload.tableId, e.payload.orderId);

  const out = [];
  for (const t of tables) {
    let openOrderId: string | null = t.openOrderId ?? null;
    if (opened.has(t.id)) openOrderId = opened.get(t.id)!;
    if (openOrderId) {
      const lo = await localOrder(openOrderId);
      if (lo && lo.status === "paid") openOrderId = null;
    }
    out.push({ ...t, openOrderId, status: openOrderId ? "occupied" : "free" });
  }
  return out;
}

