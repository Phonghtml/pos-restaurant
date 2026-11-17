import { useEffect, useState } from "react";
import { localTables } from "../offline/localView";
import { enqueue, refreshCaches } from "../offline/outbox";
import { uuid } from "../offline/uuid";

type Table = { id: string; name: string; zone: string | null; status: "free" | "occupied"; openOrderId: string | null };

export function TablesScreen({ onOpenOrder }: { onOpenOrder: (tableId: string, tableName: string, orderId: string) => void }) {
  const [tables, setTables] = useState<Table[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => localTables().then((t) => setTables(t as Table[]));

  useEffect(() => {
    load();
    void refreshCaches();
    const onData = () => load();
    window.addEventListener("pos:data", onData);
    const timer = setInterval(() => void refreshCaches().then(load), 5000);
    return () => {
      window.removeEventListener("pos:data", onData);
      clearInterval(timer);
    };
  }, []);

  async function open(t: Table) {
    setError(null);
    if (t.openOrderId) return onOpenOrder(t.id, t.name, t.openOrderId);
    // ເປີດບິນໃນເຄື່ອງກ່ອນ (ໃຊ້ໄດ້ offline); ສົ່ງຂຶ້ນ server ເບື້ອງຫຼັງ
    const orderId = uuid();
    await enqueue("open_order", { orderId, tableId: t.id });
    onOpenOrder(t.id, t.name, orderId);
  }

  return (
    <>
      <h2>ເລືອກໂຕະ</h2>
      {error && <div className="error">{error}</div>}
      <div className="grid">
        {tables.map((t) => (
          <button key={t.id} className={`card ${t.status}`} onClick={() => open(t)}>
            <strong>{t.name}</strong>
            <div className="sub">{t.status === "occupied" ? "ມີລູກຄ້າ" : "ວ່າງ"}</div>
          </button>
        ))}
      </div>
      {tables.length === 0 && <div className="empty">ຍັງບໍ່ມີຂໍ້ມູນໂຕະ (ຕ້ອງເຊື່ອມ server ຢ່າງໜ້ອຍຄັ້ງໜຶ່ງ)</div>}
    </>
  );
}
