import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { resolve } from "node:path";

const emptyShim = resolve(__dirname, "src/shims/empty.ts");

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@electric-sql/pglite/dist/fs/nodefs.js": emptyShim,
      "@electric-sql/pglite/dist/fs/nodefs": emptyShim,
      "node:fs": emptyShim,
      "node:fs/promises": emptyShim,
      "node:path": emptyShim,
    }
  },
  server: {
    port: 4174
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
          if (id.includes("gridstack")) return "gridstack";
          if (id.includes("libsodium-wrappers")) return "crypto";
          if (id.includes("solid-js")) return "solid-core";
        },
      },
    },
  },
  base: "/workspace/"
});
