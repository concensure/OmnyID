import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { resolve } from "node:path";

const emptyShim = resolve(__dirname, "src/shims/empty.ts");

export default defineConfig({
  root: __dirname,
  plugins: [solid()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "voice-input-ts": resolve(__dirname, "../../voice input/dist/index.mjs"),
      "@electric-sql/pglite/dist/fs/nodefs.js": emptyShim,
      "@electric-sql/pglite/dist/fs/nodefs": emptyShim,
      "node:fs": emptyShim,
      "node:fs/promises": emptyShim,
      "node:path": emptyShim,
    }
  },
  server: {
    port: 4174,
    proxy: {
      '/auth':        { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/dashboard':   { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/agent':       { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/runtime':     { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/user':        { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/feed':        { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/integrations':{ target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/task':        { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/multi-edit':  { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/social':      { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/actions':     { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/ui':          { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/healthz':     { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/relay':       { target: 'http://127.0.0.1:8080', changeOrigin: true, ws: true },
      '/key-bundle':  { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/send':        { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/query':       { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/llm':         { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/attachments': { target: 'http://127.0.0.1:8080', changeOrigin: true },
    }
  },
  optimizeDeps: {
    exclude: ["@electric-sql/pglite", "@electric-sql/pglite/electric"]
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        dashboard: resolve(__dirname, "dashboard.html"),
      },
      external: (id) => id === "@electric-sql/pglite/electric",
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
          if (id.includes("@electric-sql/pglite")) return "pglite";
          if (id.includes("@codemirror/")) return "codemirror";
          if (id.includes("@tiptap/")) return "tiptap";
          if (id.includes("gridstack")) return "gridstack";
          if (id.includes("libsodium-wrappers")) return "crypto";
          if (id.includes("solid-js")) return "solid-core";
          if (
            id.includes("/src/components/BentoGrid.tsx")
            || id.includes("/src/components/HomeQueuesSection.tsx")
            || id.includes("/src/components/DecisionOSHomeView.tsx")
            || id.includes("/src/components/DecisionQueue")
            || id.includes("/src/components/ResponseQueue")
            || id.includes("/src/components/Queue")
            || id.includes("/src/components/OperationalPressureRow.tsx")
            || id.includes("/src/components/CognitiveBentoRow.tsx")
            || id.includes("/src/components/DailyBriefingBar.tsx")
          ) return "home-workspace";
          if (
            id.includes("/src/components/ThreadView.tsx")
            || id.includes("/src/components/ThreadsListView.tsx")
            || id.includes("/src/components/EmailView.tsx")
            || id.includes("/src/components/ContactsView.tsx")
            || id.includes("/src/components/PublicFeedView.tsx")
            || id.includes("/src/components/SpacesView.tsx")
            || id.includes("/src/components/DashboardFeed.tsx")
            || id.includes("/src/components/DiscoverView.tsx")
            || id.includes("/src/components/DiaryView.tsx")
            || id.includes("/src/components/DatabaseView.tsx")
            || id.includes("/src/components/MonthlyCalendarView.tsx")
            || id.includes("/src/components/TemplatesView.tsx")
            || id.includes("/src/components/KnowledgeGraphView.tsx")
            || id.includes("/src/components/CofounderStudioView.tsx")
            || id.includes("/src/components/PythonRunnerView.tsx")
            || id.includes("/src/components/ConnectedAppsView.tsx")
            || id.includes("/src/components/CostDashboardView.tsx")
            || id.includes("/src/components/ToolsView.tsx")
            || id.includes("/src/components/AgentSettingsView.tsx")
          ) return "app-views";
        },
      },
    },
  },
  base: "/workspace/"
});
