import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../styles/theme.css";
import { DashboardApp } from "./dashboard_app";

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <DashboardApp />
    </StrictMode>
  );
}
