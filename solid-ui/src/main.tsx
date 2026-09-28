import { render } from "solid-js/web";
import { ErrorBoundary } from "solid-js";
import App from "./App";
import { ViewportProvider } from "@/context/ViewportContext";
import { dispatchSwUpdateReadyEvent } from "@/lib/swUpdateEvent";
import { applyFontBodyPreference, loadFontBodyPreference } from "@/lib/fontBodyPreference";
import { applyFontScalePreference, loadFontScalePreference } from "@/lib/fontScalePreference";
import "./index.css";

// ── Service Worker registration (U-01: update-ready notification) ─────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const hadServiceWorkerController = Boolean(navigator.serviceWorker.controller);
    let refreshingForUpdatedWorker = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadServiceWorkerController) return;
      if (refreshingForUpdatedWorker) return;
      refreshingForUpdatedWorker = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("/workspace/sw.js", { scope: "/workspace/" })
      .then((reg) => {
        void reg.update().catch(() => undefined);

        // A new SW version found and installed — notify the app.
        const notifyUpdate = (sw: ServiceWorker) => {
          if (sw.state === "installed") {
            sw.postMessage({ type: "SKIP_WAITING" });
            dispatchSwUpdateReadyEvent({ sw });
          }
        };

        // Already waiting from a previous load?
        if (reg.waiting) {
          notifyUpdate(reg.waiting);
        }

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              notifyUpdate(installing);
            }
          });
        });
      })
      .catch((err) => {
        console.warn("[SW] Registration failed:", err);
      });
  });
}

applyFontScalePreference(loadFontScalePreference());
applyFontBodyPreference(loadFontBodyPreference());

render(
  () => (
    <ErrorBoundary fallback={(err, reset) => (
      <div style={{ display: "flex", "flex-direction": "column", "align-items": "center", "justify-content": "center", "min-height": "100vh", gap: "12px", "font-family": "Inter, sans-serif", color: "#1a1c1b" }}>
        <p style={{ "font-size": "1.1rem", "font-weight": "600" }}>Something went wrong</p>
        <p style={{ "font-size": "0.8rem", color: "#737781", "max-width": "420px", "text-align": "center" }}>{(err as Error)?.message ?? String(err)}</p>
        <button onClick={reset} style={{ "margin-top": "8px", padding: "8px 20px", "border-radius": "9999px", border: "1px solid #31568e", background: "transparent", color: "#31568e", cursor: "pointer", "font-size": "0.8rem" }}>
          Reload
        </button>
      </div>
    )}>
      <ViewportProvider>
        <App />
      </ViewportProvider>
    </ErrorBoundary>
  ),
  document.getElementById("root")!
);
