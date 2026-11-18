import { useEffect, useState } from "react";
import { fmt, type MenuCategory, type MenuItem } from "../api";
import { localOrder, type LocalOrder } from "../offline/localView";
import { getCache } from "../offline/cache";
import { enqueue, refreshCaches } from "../offline/outbox";
import { uuid } from "../offline/uuid";
import { QrPanel } from "../components/QrPanel";

type Method = "cash" | "qr" | "card";

export function OrderScreen({ orderId, tableName, onBack }: { orderId: string; tableName: string; onBack: () => void }) {
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [order, setOrder] = useState<LocalOrder | null>(null);
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [method, setMethod] = useState<Method>("cash");
  const [amount, setAmount] = useState("");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");

  const load = () => localOrder(orderId).then(setOrder);

  useEffect(() => {
    getCache<MenuCategory[]>("menu").then((m) => setMenu(m ?? []));
    void refreshCaches([orderId]).then(() => {
      getCache<MenuCategory[]>("menu").then((m) => setMenu(m ?? []));
      load();
    });
    load();
    const onData = () => load();
    window.addEventListener("pos:data", onData);
    return () => window.removeEventListener("pos:data", onData);
  }, [orderId]);

  const isOpen = order?.status === "open";
  const unsent = order?.items.filter((i) => !i.sentAt).length ?? 0;
  const remaining = order?.remainingLak ?? 0;

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setError(null);
    setMessage(null);
    try {
      await fn();
      if (ok) setMessage(ok);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function tap(item: MenuItem) {
    if (item.priceLak === null) return setError(`${item.name}: ຍັງບໍ່ໄດ້ກຳນົດລາຄາ`);
    setSelected({});
    setQty(1);
    setPicking(item);
  }

  function addItem(item: MenuItem, optionIds: string[], quantity: number) {
    const chosen = item.optionGroups.flatMap((g) => g.options.filter((o) => optionIds.includes(o.id)));
    const unitPriceLak = (item.priceLak ?? 0) + chosen.reduce((s, o) => s + o.extraPriceLak, 0);
    return act(() =>
      enqueue("add_item", {
        orderId,
        itemId: uuid(),
        menuItemId: item.id,
        name: item.name,
        unitPriceLak,
        quantity,
        options: chosen.map((o) => ({ name: o.name, optionId: o.id, extraPriceLak: o.extraPriceLak })),
        optionIds,
        note: null,
      })
    );
  }

  function confirmOptions() {
    if (!picking) return;
    const missing = picking.optionGroups.find((g) => g.isRequired && !selected[g.id]);
    if (missing) return setError(`ກະລຸນາເລືອກ: ${missing.name}`);
    const item = picking;
    setPicking(null);
    addItem(item, Object.values(selected), qty);
  }

  function pay() {
    const amt = Number(amount || remaining);
    if (!Number.isInteger(amt) || amt <= 0) return setError("ຈຳນວນເງິນບໍ່ຖືກຕ້ອງ");
    if (amt > remaining) return setError(`ເກີນຍອດຄົງເຫຼືອ (${fmt(remaining)})`);
    if (method !== "cash" && !reference) return setError("ໃສ່ເລກອ້າງອີງ QR/ບັດ");
    const t = Number(tendered || 0);
    if (method === "cash" && t && t < amt) return setError("ເງິນທີ່ຮັບມາໜ້ອຍກວ່າຈຳນວນທີ່ຊຳລະ");
    const change = method === "cash" && t ? t - amt : 0;
    act(
      () =>
        enqueue("pay", {
          orderId,
          paymentId: uuid(),
          method,
          amountLak: amt,
          tenderedLak: method === "cash" && t ? t : null,
          reference: method !== "cash" ? reference : null,
        }),
      `ຊຳລະ ${fmt(amt)} ແລ້ວ${change > 0 ? ` · ເງິນທອນ ${fmt(change)}` : ""}`
    );
    setAmount("");
    setTendered("");
    setReference("");
  }

  if (!order) return <p>ກຳລັງໂຫຼດ... (ຖ້າອອບລາຍ ແລະ ບິນນີ້ຍັງບໍ່ເຄີຍໂຫຼດ ຈະເຫັນບໍ່ໄດ້)</p>;

  return (
    <>
      <div className="row">
        <h2 style={{ margin: 0 }}>{tableName}</h2>
        <button className="btn secondary" onClick={onBack}>ກັບ</button>
      </div>
      {error && <div className="error">{error}</div>}
      {message && <div className="success-msg">{message}</div>}

      <div className="panel">
        <strong>ລາຍການ</strong>
        {order.items.length === 0 && <p>ຍັງບໍ່ມີລາຍການ</p>}
        {order.items.map((i) => (
          <div className="row" key={i.id}>
            <div>
              {i.name} × {i.quantity}
              {i.options.length > 0 && <div className="sub">{i.options.map((o) => o.name).join(", ")}</div>}
            </div>
            <div>
              {fmt(i.unitPriceLak * i.quantity)}
              {isOpen && !i.sentAt && (
                <button className="btn secondary" style={{ marginLeft: 8 }} onClick={() => act(() => enqueue("delete_item", { orderId, itemId: i.id }))}>
                  ລຶບ
                </button>
              )}
              {i.sentAt && <span className="tag">ສົ່ງຄົວແລ້ວ</span>}
            </div>
          </div>
        ))}
        <div className="total-box"><span>ລວມທັງໝົດ</span><strong>{fmt(order.totalLak)}</strong></div>
        {isOpen && (
          <button className="btn" style={{ marginTop: 8, width: "100%" }} disabled={unsent === 0}
            onClick={() => act(() => enqueue("send_to_kitchen", { orderId }), "ສົ່ງໄປຄົວແລ້ວ")}>
            ສົ່ງໄປຄົວ ({unsent} ລາຍການໃໝ່)
          </button>
        )}
        {order.hasPending && <div className="sub" style={{ marginTop: 6 }}>ມີການປ່ຽນແປງລໍຖ້າສົ່ງຂຶ້ນ server</div>}
      </div>

      {isOpen && !picking && (
        <div className="panel">
          <strong>ເມນູ</strong>
          {menu.map((c) => (
            <div key={c.id} style={{ marginTop: 8 }}>
              <div className="menu-cat"><span>{c.name}</span><span className="count">{c.items.length} ລາຍການ</span></div>
              <div className="menu-list">
                {c.items.map((item) => (
                  <button key={item.id} className="menu-row" onClick={() => tap(item)}>
                      <div className="thumb">{item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : item.name.charAt(0)}</div>
                      <div className="menu-info">
                        <div className="menu-name">{item.name}{item.isSignature && <span className="tag signature">signature</span>}</div>
                        <div className="menu-desc">{item.optionGroups.map((g) => g.name).join(" · ") || " "}</div>
                      </div>
                      <div className="price">{item.priceLak === null ? "ຍັງບໍ່ມີລາຄາ" : fmt(item.priceLak)}</div>
                    </button>
                ))}
              </div>
            </div>
          ))}
          {menu.length === 0 && <p>ຍັງບໍ່ມີເມນູ (ຕ້ອງເຊື່ອມ server ຢ່າງໜ້ອຍຄັ້ງໜຶ່ງ)</p>}
        </div>
      )}

      {isOpen && picking && (
        <div className="panel">
          <strong>{picking.name}</strong>
          <div className="qty">
            <button className="btn secondary small" onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1}>−</button>
            <span className="qty-num">{qty}</span>
            <button className="btn secondary small" onClick={() => setQty(qty + 1)}>+</button>
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
            <button className="btn" onClick={confirmOptions}>ເພີ່ມລາຍການ × {qty}</button>
            <button className="btn secondary" onClick={() => setPicking(null)}>ຍົກເລີກ</button>
          </div>
        </div>
      )}

      {isOpen && remaining > 0 && (
        <div className="panel">
          <strong>ຊຳລະເງິນ</strong>
          <div className="sub">ຍອດຄົງເຫຼືອ: {fmt(remaining)}</div>
          <select value={method} onChange={(e) => setMethod(e.target.value as Method)} style={{ marginTop: 8 }}>
            <option value="cash">ເງິນສົດ</option>
            <option value="qr">QR</option>
            <option value="card">ບັດ</option>
          </select>
          <input style={{ marginTop: 8 }} placeholder={`ຈຳນວນ (ຫວ່າງ = ${remaining})`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {method === "qr" && <QrPanel amount={Number(amount || remaining)} />}
          {method === "cash" && (
            <input style={{ marginTop: 8 }} placeholder="ເງິນທີ່ຮັບມາ (ເພື່ອຄິດເງິນທອນ)" inputMode="numeric" value={tendered} onChange={(e) => setTendered(e.target.value)} />
          )}
          {method !== "cash" && (
            <input style={{ marginTop: 8 }} placeholder="ເລກອ້າງອີງ (ບັງຄັບ)" value={reference} onChange={(e) => setReference(e.target.value)} />
          )}
          <button className="btn success" style={{ marginTop: 10, width: "100%" }} onClick={pay}>ຊຳລະເງິນ</button>
        </div>
      )}

      {order.status === "paid" && (
        <div className="panel">
          <strong>ບິນປິດແລ້ວ</strong>
          <div><button className="btn" style={{ marginTop: 8 }} onClick={onBack}>ກັບໄປເລືອກໂຕະ</button></div>
        </div>
      )}
    </>
  );
}
