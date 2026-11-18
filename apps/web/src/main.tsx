import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";
import { CustomerScreen } from "./screens/CustomerScreen";

// ລິ້ງ QR ຂອງໂຕະ (/t/<token>) ເປີດໜ້າສັ່ງອາຫານຂອງລູກຄ້າ ໂດຍບໍ່ຕ້ອງ login
const tableToken = window.location.pathname.match(/^\/t\/([a-f0-9]{32})\/?$/)?.[1];

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {tableToken ? <CustomerScreen token={tableToken} /> : <App />}
  </StrictMode>
);
