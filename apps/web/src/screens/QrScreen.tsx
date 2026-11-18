import { useEffect, useState } from "react";
import { api } from "../api";

type QrTable = { tableName: string; url: string; dataUrl: string };

// ໜ້າ admin: ສະແດງ QR ຂອງທຸກໂຕະ ເພື່ອພິມໄປຕິດໂຕະ
export function QrScreen() {
  const [tables, setTables] = useState<QrTable[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ tables: QrTable[] }>("GET", "/api/qr-codes")
      .then((r) => setTables(r.tables))
      .catch((e: any) => setError(e.message));
  }, []);

  return (
    <>
      <div className="row no-print">
        <h2 style={{ margin: 0 }}>QR ໂຕະ</h2>
        <button className="btn" onClick={() => window.print()}>ພິມ</button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="qr-grid">
        {tables.map((t) => (
          <div className="panel qr-card" key={t.url}>
            <strong>{t.tableName}</strong>
            <img src={t.dataUrl} alt={`QR ${t.tableName}`} />
            <div className="sub qr-url">{t.url}</div>
          </div>
        ))}
      </div>
    </>
  );
}
