import { useEffect, useState } from "react";
import { TablesScreen } from "./screens/TablesScreen";
import { OrderScreen } from "./screens/OrderScreen";
import { KitchenScreen } from "./screens/KitchenScreen";
import { ReportsScreen } from "./screens/ReportsScreen";
import { QrScreen } from "./screens/QrScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { clearSession, getSession, screensFor } from "./session";
import { api } from "./api";
import { StatusBar } from "./components/StatusBar";
import { refreshCaches } from "./offline/outbox";

type View =
  | { name: "tables" }
  | { name: "order"; tableName: string; orderId: string }
  | { name: "kitchen" }
  | { name: "reports" }
  | { name: "qr" };

export function App() {
  const [session, setSession] = useState(getSession());
  const [view, setView] = useState<View>({ name: "tables" });

  useEffect(() => {
    const onLogout = () => setSession(null);
    window.addEventListener("pos:logout", onLogout);
    return () => window.removeEventListener("pos:logout", onLogout);
  }, []);

  if (!session) {
    return (
      <main>
        <LoginScreen onLogin={() => { setSession(getSession()); setView({ name: "tables" }); }} />
      </main>
    );
  }

  const user = session.user;
  void refreshCaches();
  const screens = screensFor(user.role);
  const defaultView: View = { name: screens[0] === "kitchen" ? "kitchen" : "tables" };
  const current: View = screens.includes(view.name as any) || view.name === "order" ? view : defaultView;

  async function logout() {
    try { await api("POST", "/api/auth/logout"); } catch { /* ignore */ }
    clearSession();
    setSession(null);
  }

  return (
    <>
      <header>
        <strong>POS · {user.name}</strong>
        <div>
          {screens.includes("tables") && <button onClick={() => setView({ name: "tables" })}>ໂຕະ</button>}{" "}
          {screens.includes("kitchen") && <button onClick={() => setView({ name: "kitchen" })}>ຄົວ</button>}{" "}
          {screens.includes("reports") && <button onClick={() => setView({ name: "reports" })}>ລາຍງານ</button>}{" "}
          {screens.includes("qr") && <button onClick={() => setView({ name: "qr" })}>QR</button>}{" "}
          <button onClick={logout}>ອອກ</button>
        </div>
      </header>
      <StatusBar />
      <main>
        {current.name === "tables" && (
          <TablesScreen onOpenOrder={(_tableId, tableName, orderId) => setView({ name: "order", tableName, orderId })} />
        )}
        {current.name === "order" && (
          <OrderScreen key={current.orderId} tableName={current.tableName} orderId={current.orderId} onBack={() => setView({ name: "tables" })} />
        )}
        {current.name === "kitchen" && <KitchenScreen />}
        {current.name === "reports" && <ReportsScreen />}
        {current.name === "qr" && <QrScreen />}
      </main>
    </>
  );
}
