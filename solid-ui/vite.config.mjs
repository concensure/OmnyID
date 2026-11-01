import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { resolve } from "node:path";

const emptyShim = resolve(import.meta.dirname, "src/shims/empty.ts");
const sdkRoot = resolve(import.meta.dirname, "../typescript-sdk/src");
const apiProxyTarget = process.env.OMNYID_E2E_API_ORIGIN?.trim() || "http://127.0.0.1:8080";
const apiProxy = {
  "/auth": { target: apiProxyTarget, changeOrigin: true },
  "/dashboard": { target: apiProxyTarget, changeOrigin: true },
  "/agent": { target: apiProxyTarget, changeOrigin: true },
  "/runtime": { target: apiProxyTarget, changeOrigin: true },
  "/user": { target: apiProxyTarget, changeOrigin: true },
  "/feed": { target: apiProxyTarget, changeOrigin: true },
  "/integrations": { target: apiProxyTarget, changeOrigin: true },
  "/task": { target: apiProxyTarget, changeOrigin: true },
  "/multi-edit": { target: apiProxyTarget, changeOrigin: true },
  "/social": { target: apiProxyTarget, changeOrigin: true },
  "/actions": { target: apiProxyTarget, changeOrigin: true },
  "/ui": { target: apiProxyTarget, changeOrigin: true },
  "/healthz": { target: apiProxyTarget, changeOrigin: true },
  "/relay": { target: apiProxyTarget, changeOrigin: true, ws: true },
  "/billing": { target: apiProxyTarget, changeOrigin: true },
  "/practice": { target: apiProxyTarget, changeOrigin: true },
  "/key-bundle": { target: apiProxyTarget, changeOrigin: true },
  "/send": { target: apiProxyTarget, changeOrigin: true },
  "/query": { target: apiProxyTarget, changeOrigin: true },
  "/llm": { target: apiProxyTarget, changeOrigin: true },
  "/api/files": { target: apiProxyTarget, changeOrigin: true },
  "/attachments": { target: apiProxyTarget, changeOrigin: true },
  "/database": { target: apiProxyTarget, changeOrigin: true },
  "/wedding": { target: apiProxyTarget, changeOrigin: true },
};

export default defineConfig({
  root: import.meta.dirname,
  plugins: [solid()],
  resolve: {
    alias: [
      { find: "afp-ts/semantic-router", replacement: resolve(sdkRoot, "semantic-router/index.ts") },
      { find: "afp-ts/workspace-assistance", replacement: resolve(sdkRoot, "workspace-assistance.ts") },
      { find: "afp-ts/continuity", replacement: resolve(sdkRoot, "continuity.ts") },
      { find: "afp-ts/retrieval", replacement: resolve(sdkRoot, "retrieval.ts") },
      { find: "afp-ts/workflows", replacement: resolve(sdkRoot, "workflows.ts") },
      { find: "afp-ts/quotation", replacement: resolve(sdkRoot, "quotation.ts") },
      { find: "afp-ts", replacement: resolve(sdkRoot, "index.ts") },
      { find: "@", replacement: resolve(import.meta.dirname, "src") },
      { find: "voice-input-ts", replacement: resolve(import.meta.dirname, "src/lib/voiceInput.ts") },
      { find: "@electric-sql/pglite/dist/fs/nodefs.js", replacement: emptyShim },
      { find: "@electric-sql/pglite/dist/fs/nodefs", replacement: emptyShim },
      { find: "node:fs", replacement: emptyShim },
      { find: "node:fs/promises", replacement: emptyShim },
      { find: "node:path", replacement: emptyShim },
    ],
  },
  server: {
    port: 4174,
    proxy: apiProxy,
  },
  preview: { proxy: apiProxy },
  optimizeDeps: {
    exclude: ["@electric-sql/pglite"],
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        dashboard: resolve(import.meta.dirname, "dashboard.html"),
        vendor: resolve(import.meta.dirname, "vendor.html"),
        practice: resolve(import.meta.dirname, "practice.html"),
        quotationResponse: resolve(import.meta.dirname, "quotation-response.html"),
        runsheetShare: resolve(import.meta.dirname, "runsheet-share.html"),
        rsvp: resolve(import.meta.dirname, "rsvp.html"),
      },
      onwarn(warning, warn) {
        const message = typeof warning === "string" ? warning : warning.message ?? "";
        const sourceId = typeof warning === "string" ? "" : warning.id ?? "";

        if (
          sourceId.includes("@electric-sql/pglite/dist/fs/nodefs.js") &&
          message.includes('not exported by "__vite-browser-external"')
        ) {
          return;
        }

        if (
          sourceId.includes("@electric-sql/pglite/dist/index.js") &&
          message.includes("Use of eval")
        ) {
          return;
        }

        warn(warning);
      },
      output: {
        manualChunks(id) {
          const normalized = id.replaceAll("\\", "/");

          if (normalized.includes("@electric-sql/pglite")) return "pglite";
          if (normalized.includes("@codemirror/")) return "codemirror";
          if (normalized.includes("@tiptap/")) return "tiptap";
          if (normalized.includes("gridstack")) return "gridstack";
          if (normalized.includes("libsodium-wrappers")) return "crypto";
          if (normalized.includes("solid-js")) return "solid-core";
          if (normalized.includes("/typescript-sdk/") || normalized.includes("/node_modules/afp-ts/")) return "afp-sdk";
          if (normalized.includes("/node_modules/marked/")) return "markdown";

          if (
            normalized.includes("/src/lib/localSemanticRouter") ||
            normalized.includes("/src/lib/localRouter") ||
            normalized.includes("/src/lib/workspaceAssist") ||
            normalized.includes("/src/lib/commandPreview") ||
            normalized.includes("/src/lib/searchPreview") ||
            normalized.includes("/src/lib/searchResultPanelState") ||
            normalized.includes("/src/lib/appCommandPanelState") ||
            normalized.includes("/src/lib/orchestrationPanelState") ||
            normalized.includes("/src/lib/decisionos") ||
            normalized.includes("/src/lib/sampleDashboard")
          ) {
            return "workspace-intelligence";
          }

          if (normalized.includes("/src/components/AgentFleetView")) {
            return "fleet-surface";
          }

          if (normalized.includes("/src/components/DashboardFeed")) {
            return "dashboard-feed-surface";
          }

          if (
            normalized.includes("/src/components/ObjectSearch") ||
            normalized.includes("/src/components/ThreadSemanticRouterPreview")
          ) {
            return "search-surfaces";
          }

          if (normalized.includes("/src/components/AlternateViewsInspector")) {
            return "alternate-views-surface";
          }

        },
      },
    },
  },
  base: "/workspace/",
});
