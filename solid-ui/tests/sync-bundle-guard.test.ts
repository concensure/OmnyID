import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

test("sync client does not ship the missing Electric PGLite subpath", () => {
  const syncSource = read("src/lib/sync.ts");
  const viteConfig = read("vite.config.mjs");
  const viteConfigTs = read("vite.config.ts");
  const combined = [syncSource, viteConfig, viteConfigTs].join("\n");

  assert.equal(
    combined.includes("@electric-sql/pglite/electric"),
    false,
    "Do not import or externalize the missing Electric PGLite subpath; browsers cannot resolve the bare specifier.",
  );
  assert.equal(
    syncSource.includes("@vite-ignore"),
    false,
    "Sync imports must go through Vite resolution so missing packages fail at build time, not in production browsers.",
  );
  assert.equal(
    /external\s*:\s*\([^)]*\)\s*=>/.test(viteConfig),
    false,
    "The sync bundle must not use a Rollup external escape hatch for browser-only package imports.",
  );
});

test("sync client explicitly skips Electric sync until a compatible extension exists", () => {
  const syncSource = read("src/lib/sync.ts");

  assert.match(syncSource, /pgliteElectricExtensionAvailable/);
  assert.match(syncSource, /skipping local-first sync/);
});
