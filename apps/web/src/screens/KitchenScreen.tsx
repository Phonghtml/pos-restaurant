import { useEffect, useState } from "react";
import { api } from "../api";

type Ticket = {
  itemId: string;
  table: string | null;
  name: string;
  quantity: number;
  options: { name: string }[];
  note: string | null;
  status: "pending" | "cooking" | "ready" | "served";
};

const LABEL: Record<Ticket["status"], string> = { pending: "ລໍຖ້າ", cooking: "ກຳລັງເຮັດ", ready: "ສຳເລັດ", served: "ເສີບແລ້ວ" };
const NEXT: Partial<Record<Ticket["status"], "cooking" | "ready" | "served">> = { pending: "cooking", cooking: "ready", ready: "served" };
const BTN: Partial<Record<Ticket["status"], string>> = { pending: "ເລີ່ມເຮັດ", cooking: "ສຳເລັດ", ready: "ເສີບແລ້ວ" };

// ໜ້າຈໍຄົວຕ້ອງໃຊ້ server (ບໍ່ອອບລາຍ) ເພາະຕ້ອງເຫັນສະຖານະຄົວແບບສົດ
export function KitchenScreen() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api<{ tickets: Ticket[] }>("GET", "/api/kitchen/tickets")
      .then((r) => { setTickets(r.tickets); setError(null); })
      .catch((e) => setError(navigator.onLine ? e.message : "ບໍ່ມີເນັດ: ໜ້າຈໍຄົວຕ້ອງເຊື່ອມ server"));

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  async function advance(t: Ticket) {
    const next = NEXT[t.status];
    if (!next) return;
    try {
      await api("PATCH", `/api/kitchen/items/${t.itemId}`, { status: next });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <>
      <h2>ໜ້າຈໍຄົວ</h2>
      {error && <div className="error">{error}</div>}
      {tickets.length === 0 && !error && <div className="empty">ບໍ່ມີລາຍການ</div>}
      {tickets.map((t) => (
        <div key={t.itemId} className="panel">
          <div className="row">
            <div>
              <strong>{t.table ?? "-"}</strong> · {t.name} × {t.quantity}
              {t.options.length > 0 && <div className="sub">{t.options.map((o) => o.name).join(", ")}</div>}
              {t.note && <div className="sub">ໝາຍເຫດ: {t.note}</div>}
            </div>
            <div>
              <span className="tag">{LABEL[t.status]}</span>
              {NEXT[t.status] && (
                <button className="btn" style={{ marginLeft: 8 }} onClick={() => advance(t)}>{BTN[t.status]}</button>
              )}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
