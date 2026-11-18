import { useEffect, useState } from "react";
import { fmt, type MenuCategory, type MenuItem } from "../api";

type PublicInfo = { tableName: string; branchName: string; categories: MenuCategory[] };
type PublicOrder = {
  open: boolean;
  totalLak: number;
  items: { id: string; name: string; quantity: number; options: string[]; unitPriceLak: number; pending: boolean; sent: boolean }[];
};
type CartLine = { key: string; item: MenuItem; quantity: number; optionIds: string[]; unitPriceLak: number; optionNames: string[] };

// ໜ້າລູກຄ້າ (ບໍ່ມີ login): ເປີດຈາກ QR ຂອງໂຕະ
async function pub<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

const ERRORS: Record<string, string> = {
  table_not_found: "ບໍ່ພົບໂຕະນີ້ ກະລຸນາສະແກນ QR ໃໝ່",
  required_option_missing: "ກະລຸນາເລືອກຕົວເລືອກໃຫ້ຄົບ",
  price_not_set: "ເມນູນີ້ຍັງບໍ່ພ້ອມສັ່ງ",
  menu_item_not_found: "ເມນູນີ້ບໍ່ມີແລ້ວ ກະລຸນາລອງໃໝ່",
  too_many_requests: "ສັ່ງຖີ່ເກີນໄປ ກະລຸນາລໍຖ້າສັກຄູ່ ແລ້ວລອງໃໝ່",
};

export function CustomerScreen({ token }: { token: string }) {
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [qty, setQty] = useState(1);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const base = `/api/public/tables/${token}`;

  async function loadOrder() {
    try {
      setOrder(await pub<PublicOrder>("GET", `${base}/order`));
    } catch {
      /* ເຊື່ອມຕໍ່ບໍ່ໄດ້ຊົ່ວຄາວ: ລອງໃໝ່ຕອນຮອບຖັດໄປ */
    }
  }

  useEffect(() => {
    pub<PublicInfo>("GET", base)
      .then(setInfo)
      .catch((e: Error) => setError(ERRORS[e.message] ?? "ເຊື່ອມຕໍ່ບໍ່ໄດ້ ກະລຸນາລອງໃໝ່"));
    void loadOrder();
    const timer = setInterval(loadOrder, 8000);
    return () => clearInterval(timer);
  }, [token]);

  function openItem(item: MenuItem) {
    setError(null);
    setDone(null);
    setSelected({});
    setQty(1);
    setPicking(item);
  }

  function addToCart() {
    if (!picking) return;
    const missing = picking.optionGroups.find((g) => g.isRequired && !selected[g.id]);
    if (missing) return setError(`ກະລຸນາເລືອກ: ${missing.name}`);
    const optionIds = Object.values(selected).filter(Boolean);
    const chosen = picking.optionGroups.flatMap((g) => g.options.filter((o) => optionIds.includes(o.id)));
    const unitPriceLak = (picking.priceLak ?? 0) + chosen.reduce((s, o) => s + o.extraPriceLak, 0);
    setCart([
      ...cart,
      {
        key: Math.random().toString(36).slice(2),
        item: picking,
        quantity: qty,
        optionIds,
        unitPriceLak,
        optionNames: chosen.map((o) => o.name),
      },
    ]);
    setPicking(null);
    setError(null);
  }

  async function submit() {
    if (cart.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await pub("POST", `${base}/orders`, {
        items: cart.map((c) => ({ menuItemId: c.item.id, quantity: c.quantity, optionIds: c.optionIds })),
      });
      setCart([]);
      setDone("ສົ່ງອໍເດີແລ້ວ ພະນັກງານຈະຢືນຢັນ ແລະ ສົ່ງເຂົ້າຄົວ");
      await loadOrder();
    } catch (e: any) {
      setError(ERRORS[e.message] ?? "ສົ່ງອໍເດີບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່");
    } finally {
      setBusy(false);
    }
  }

  const cartTotal = cart.reduce((s, c) => s + c.unitPriceLak * c.quantity, 0);

  if (!info && !error) return <div className="muted-center">ກຳລັງໂຫຼດເມນູ...</div>;

  return (
    <>
      <header>
        <strong>{info?.branchName ?? "ເມນູ"} · {info?.tableName ?? ""}</strong>
      </header>
      <main>
        {error && <div className="error">{error}</div>}
        {done && <div className="success-msg">{done}</div>}

        {order?.open && order.items.length > 0 && (
          <div className="panel">
            <strong>ອໍເດີຂອງໂຕະນີ້</strong>
            {order.items.map((i) => (
              <div className="row" key={i.id}>
                <div>
                  {i.name} × {i.quantity}
                  {i.options.length > 0 && <div className="sub">{i.options.join(", ")}</div>}
                </div>
                <div>
                  {i.pending ? <span className="tag">ລໍຖ້າຢືນຢັນ</span> : i.sent ? <span className="tag success">ກຳລັງເຮັດ</span> : null}
                </div>
              </div>
            ))}
            <div className="total-box"><span>ລວມ</span><strong>{fmt(order.totalLak)}</strong></div>
            <div className="sub" style={{ marginTop: 6 }}>ຊຳລະເງິນທີ່ເຄົ້າເຕີ</div>
          </div>
        )}

        {picking && (
          <div className="panel">
            <strong>{picking.name}</strong>
            <div className="qty">
              <button className="btn secondary small" onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1}>−</button>
              <span className="qty-num">{qty}</span>
              <button className="btn secondary small" onClick={() => setQty(Math.min(20, qty + 1))}>+</button>
            </div>
            {picking.optionGroups.map((g) => (
              <div key={g.id} style={{ marginTop: 8 }}>
                <div className="sub">{g.name}{g.isRequired ? " *" : ""}</div>
                <select value={selected[g.id] ?? ""} onChange={(e) => setSelected({ ...selected, [g.id]: e.target.value })}>
                  <option value="">— ເລືອກ —</option>
                  {g.options.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}{o.extraPriceLak ? ` (+${fmt(o.extraPriceLak)})` : ""}</option>
                  ))}
                </select>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn" onClick={addToCart}>ເພີ່ມໃສ່ລາຍການ × {qty}</button>
              <button className="btn secondary" onClick={() => setPicking(null)}>ຍົກເລີກ</button>
            </div>
          </div>
        )}

        {cart.length > 0 && (
          <div className="panel">
            <strong>ລາຍການທີ່ເລືອກ</strong>
            {cart.map((c) => (
              <div className="row" key={c.key}>
                <div>
                  {c.item.name} × {c.quantity}
                  {c.optionNames.length > 0 && <div className="sub">{c.optionNames.join(", ")}</div>}
                </div>
                <div>
                  {fmt(c.unitPriceLak * c.quantity)}
                  <button className="btn secondary small" style={{ marginLeft: 8 }} onClick={() => setCart(cart.filter((x) => x.key !== c.key))}>ລຶບ</button>
                </div>
              </div>
            ))}
            <div className="total-box"><span>ລວມ</span><strong>{fmt(cartTotal)}</strong></div>
            <button className="btn" style={{ marginTop: 10, width: "100%" }} disabled={busy} onClick={submit}>
              ສົ່ງອໍເດີ
            </button>
          </div>
        )}

        {info?.categories.map((c) => {
          const items = c.items.filter((i) => i.priceLak !== null);
          if (items.length === 0) return null;
          return (
            <div key={c.id}>
              <div className="menu-cat"><span>{c.name}</span><span className="count">{items.length} ລາຍການ</span></div>
              <div className="menu-list">
                {items.map((item) => (
                  <button key={item.id} className="menu-row" onClick={() => openItem(item)}>
                    <div className="thumb">{item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : item.name.charAt(0)}</div>
                    <div className="menu-info">
                      <div className="menu-name">{item.name}{item.isSignature && <span className="tag signature">signature</span>}</div>
                      <div className="menu-desc">{item.optionGroups.map((g) => g.name).join(" · ") || " "}</div>
                    </div>
                    <div className="price">{fmt(item.priceLak)}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </main>
    </>
  );
}
