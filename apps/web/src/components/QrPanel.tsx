import { useEffect, useState } from "react";
import { api, fmt } from "../api";

type PaymentAccount = { bank: string | null; accountNo: string; accountName: string | null };

// ສະແດງ QR ຮັບເງິນ + ບັນຊີ ໃຫ້ລູກຄ້າສະແກນ/ໂອນ
// ຮູບ QR ໃຫ້ວາງໄວ້ທີ່ apps/web/public/payment/qr.jpg (ບໍ່ commit ເຂົ້າ git)
export function QrPanel({ amount }: { amount: number }) {
  const [account, setAccount] = useState<PaymentAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imgOk, setImgOk] = useState(true);

  useEffect(() => {
    api<PaymentAccount>("GET", "/api/branches/payment-account")
      .then(setAccount)
      .catch((e: any) => setError(e.message === "payment_account_not_set" ? "ຍັງບໍ່ໄດ້ຕັ້ງບັນຊີຮັບເງິນ" : "ໂຫຼດບັນຊີບໍ່ໄດ້ (ອອບລາຍ?)"));
  }, []);

  return (
    <div className="qr-box">
      {imgOk && (
        <img src="/payment/qr.jpg" alt="QR ຮັບເງິນ" onError={() => setImgOk(false)} />
      )}
      <div className="qr-amount">{fmt(amount)}</div>
      {account && (
        <div className="sub">
          {account.bank && <div>ທະນາຄານ: {account.bank}</div>}
          <div>ເລກບັນຊີ: <strong>{account.accountNo}</strong></div>
          {account.accountName && <div>ຊື່ບັນຊີ: {account.accountName}</div>}
        </div>
      )}
      {error && <div className="sub">{error}</div>}
      {!imgOk && <div className="sub">ຍັງບໍ່ມີຮູບ QR (public/payment/qr.jpg)</div>}
    </div>
  );
}
