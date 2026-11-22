import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const boot = readFileSync(new URL("../src/workspace-boot.js", import.meta.url), "utf8");

test("workspace has a pre-module recovery surface that preserves the auth session", () => {
  assert.match(html, /id="workspace-boot-status" role="status"/);
  assert.match(html, /type="module" src="\/src\/workspace-boot\.js"/);
  assert.match(html, /href="\/workspace\/\?refresh=1"/);
  assert.match(boot, /Workspace could not finish loading/);
  assert.match(boot, /serviceWorker\.getRegistrations/);
  assert.match(boot, /key\.startsWith\("omnyid-shell-"\)/);
  assert.doesNotMatch(boot, /removeItem\(["']omnyid\.preview\.session/);
  assert.match(boot, /dataset\.workspaceRecover/);
  assert.match(boot, /searchParams\.get\("refresh"\)/);
});

test("Solid confirms a successful mount and render errors use the same fresh-copy recovery", () => {
  assert.match(main, /__omnyidWorkspaceMounted/);
  assert.match(main, /__omnyidWorkspaceRecover/);
  assert.match(main, /workspaceRoot\.replaceChildren\(\)/);
  assert.match(main, /Reload a fresh copy/);
});
