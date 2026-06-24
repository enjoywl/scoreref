import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { I18nProvider } from "./locales";
import App from "./App";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("No #root element");
console.log("[main] mounting React app...");
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <App />
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
console.log("[main] render called");
