import Dexie, { type Table } from "dexie";

export type OutboxEvent = {
  seq?: number; // ລຳດັບເກັບ (auto)
  id: string; // client_uuid ຂອງເຫດການ
  type: "open_order" | "add_item" | "delete_item" | "send_to_kitchen" | "pay";
  payload: Record<string, any>;
  createdAt: string;
  status: "pending" | "failed";
  reason?: string;
};

export type CacheRow = { key: string; value: any; updatedAt: string };

class PosDb extends Dexie {
  outbox!: Table<OutboxEvent, number>;
  cache!: Table<CacheRow, string>;

  constructor() {
    super("pos-offline");
    this.version(1).stores({
      outbox: "++seq, id, status",
      cache: "key",
    });
  }
}

export const db = new PosDb();
