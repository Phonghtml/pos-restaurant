import { useEffect, useState } from "react";
import { api, fmt } from "../api";

type Sales = {
  from: string;
  to: string;
  bills: number;
  revenueLak: number;
  byMethod: { method: string; amountLak: number; count: number }[];
  topItems: { name: string; quantity: number; revenueLak: number }[];
};

const METHOD_LABEL: Record<string, string> = { cash: "ເງິນສົດ", qr: "QR", card: "ບັດ" };
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Vientiane" });

export function ReportsScreen() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<Sales | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api<Sales>("GET", `/api/reports/sales?from=${from}&to=${to}`)
      .then(setData)
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  return (
    <>
      <h2>ລາຍງານຍອດຂາຍ</h2>
      <div className="panel" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: "auto" }} />
        <span>ຫາ</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: "auto" }} />
        <button className="btn" onClick={load}>ສະແດງ</button>
      </div>
      {error && <div className="error">{error}</div>}
      {data && (
        <>
          <div className="panel">
            <div className="row"><span>ຈຳນວນບິນ</span><strong>{data.bills}</strong></div>
            <div className="row"><span>ຍອດຂາຍລວມ</span><strong>{fmt(data.revenueLak)}</strong></div>
          </div>
          <div className="panel">
            <strong>ແຍກຕາມວິທີຊຳລະ</strong>
            {data.byMethod.length === 0 && <p>ບໍ່ມີຂໍ້ມູນ</p>}
            {data.byMethod.map((m) => (
              <div className="row" key={m.method}>
                <span>{METHOD_LABEL[m.method] ?? m.method} ({m.count} ຄັ້ງ)</span>
                <strong>{fmt(m.amountLak)}</strong>
              </div>
            ))}
          </div>
          <div className="panel">
            <strong>ເມນູຂາຍດີ (10 ອັນດັບ)</strong>
            {data.topItems.length === 0 && <p>ບໍ່ມີຂໍ້ມູນ</p>}
            {data.topItems.map((t) => (
              <div className="row" key={t.name}>
                <span>{t.name} × {t.quantity}</span>
                <strong>{fmt(t.revenueLak)}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
