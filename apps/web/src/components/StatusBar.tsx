import { useEffect, useState } from "react";
import { dismissFailed, failedEvents, flush, pendingCount } from "../offline/outbox";

// ແຖບສະຖານະ: ອອນລາຍ/ອອບລາຍ, ລາຍການລໍຖ້າ, ລາຍການທີ່ server ປະຕິເສດ
export function StatusBar() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState<{ id: string; type: string; reason?: string }[]>([]);

  const refresh = async () => {
    setPending(await pendingCount());
    setFailed(await failedEvents());
  };

  useEffect(() => {
    refresh();
    const on = () => { setOnline(true); void flush(); };
    const off = () => setOnline(false);
    const data = () => refresh();
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("pos:data", data);
    const t = setInterval(() => { void flush(); }, 10000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("pos:data", data);
      clearInterval(t);
    };
  }, []);

  return (
    <div className="status-bar" style={{ background: online ? "#3fa37a" : "#8a7670", color: "#fff", padding: "7px 16px", fontSize: 14, fontWeight: 600 }}>
      {online ? "ອອນລາຍ" : "ອອບລາຍ (ບັນທຶກໄວ້ໃນເຄື່ອງ)"}
      {pending > 0 && <> · ລໍຖ້າສົ່ງ {pending} ລາຍການ</>}
      {failed.length > 0 && (
        <div style={{ background: "#b3261e", marginTop: 6, padding: 8, borderRadius: 10 }}>
          ມີ {failed.length} ລາຍການຖືກປະຕິເສດ:
          {failed.map((f) => (
            <div key={f.id}>
              {f.type}: {f.reason}{" "}
              <button className="btn secondary" style={{ padding: "2px 8px", marginLeft: 6 }} onClick={() => dismissFailed(f.id).then(refresh)}>ລຶບ</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
