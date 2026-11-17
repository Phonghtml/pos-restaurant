import { useState } from "react";
import { api } from "../api";
import { saveSession, type User } from "../session";

export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; user: User }>("POST", "/api/auth/login", { username, password });
      saveSession(r.token, r.user);
      onLogin();
    } catch {
      setError("ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap"><form className="login-card" onSubmit={submit}><div className="logo">🍜</div>
      <h2>ເຂົ້າສູ່ລະບົບ</h2>
      <input placeholder="ຊື່ຜູ້ໃຊ້" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
      <input style={{ marginTop: 8 }} type="password" placeholder="ລະຫັດຜ່ານ" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      {error && <div className="error">{error}</div>}
      <button className="btn" style={{ marginTop: 12, width: "100%" }} disabled={busy || !username || !password}>
        ເຂົ້າສູ່ລະບົບ
      </button>
    </form></div>
  );
}
