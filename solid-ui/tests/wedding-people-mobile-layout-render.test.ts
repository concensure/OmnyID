import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const contextPanels = readFileSync(
  resolve(process.cwd(), "src/components/WeddingWorkspaceContextPanels.tsx"),
  "utf8",
);
const mobilePage = readFileSync(
  resolve(process.cwd(), "src/components/WeddingMobilePage.tsx"),
  "utf8",
);

test("People summary stacks status badges before wider phone layouts", () => {
  assert.match(contextPanels, /grid grid-cols-1 gap-2[\s\S]*min-\[420px\]:grid-cols-2/);
  assert.match(contextPanels, /p-5 shadow-card sm:rounded-\[28px\] sm:p-4/);
});

test("People actions have distinct content and full-width mobile CTAs", () => {
  assert.match(contextPanels, /<article class="flex min-w-0 flex-col rounded-2xl/);
  assert.match(contextPanels, /min-h-12 w-full rounded-xl bg-amber-900/);
  assert.doesNotMatch(contextPanels, /inline-flex rounded-full bg-amber-900 px-3 py-1 text-\[11px\]/);
});

test("mobile pages reserve space above the tab bar and floating Sprout control", () => {
  assert.match(mobilePage, /pb-\[calc\(8rem\+env\(safe-area-inset-bottom\)\)\]/);
});
