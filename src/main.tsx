import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App";
import "./index.css";

// Clerk publishable keys are intentionally safe to expose in browser bundles.
// Keep the environment override for future production rotation while ensuring
// Figma Make previews do not lose auth when ignored local env files are absent.
const publishableKey =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ??
  "pk_test_c2tpbGxlZC1weXRob24tOTU5MC5jbGVyay5hY2NvdW50cy5kZXYk";
const app = <App authEnabled />;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={publishableKey}>{app}</ClerkProvider>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}
