import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

test("App renders command fallback notice in the command preview panel", () => {
  assert.match(appSource, /<Show when=\{commandFallbackNotice\(\)\}>/);
  assert.match(appSource, /notice\(\)\.label/);
  assert.match(appSource, /notice\(\)\.detail/);
  assert.match(appSource, /notice\(\)\.actionView === "agent_settings"/);
  assert.match(appSource, /selectKnownView\(notice\(\)\.actionView\)/);
});
