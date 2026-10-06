import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const componentSource = readFileSync(resolve(process.cwd(), "src/components/MobileHomeMenuSheet.tsx"), "utf8");
const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

test("the mobile menu trigger is global and exposes its dialog state", () => {
  assert.match(componentSource, /aria-controls=\{DIALOG_ID\}/);
  assert.match(componentSource, /aria-expanded=\{mobileFocusMenuOpen\(\)\}/);
  assert.doesNotMatch(componentSource, /activeView !== "home"/);
  assert.match(appSource, /activeView=\{activeView\(\)\}/);
});

test("the mobile navigation dialog preserves keyboard and page context", () => {
  assert.match(componentSource, /aria-modal="true"/);
  assert.match(componentSource, /event\.key === "Escape"/);
  assert.match(componentSource, /event\.key !== "Tab"/);
  assert.match(componentSource, /document\.body\.style\.overflow = "hidden"/);
  assert.match(componentSource, /returnFocus\?\.isConnected && returnFocus\.focus\(\)/);
  assert.match(componentSource, /aria-current=\{props\.current \? "page" : undefined\}/);
});

test("mobile route selection closes the menu and focuses the destination", () => {
  assert.match(componentSource, /close\(\);\s*props\.onSelectApp\(view\)/);
  assert.match(componentSource, /document\.getElementById\("workspace-shell"\)/);
  assert.match(appSource, /id="workspace-shell" tabindex="-1"/);
});
