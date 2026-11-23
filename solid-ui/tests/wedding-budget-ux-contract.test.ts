import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const tracker = readFileSync(resolve(process.cwd(), "src/components/WeddingBudgetTrackerCard.tsx"), "utf8");
const hub = readFileSync(resolve(process.cwd(), "src/components/WeddingBudgetEvidenceHub.tsx"), "utf8");
const panels = readFileSync(resolve(process.cwd(), "src/components/WeddingWorkspaceContextPanels.tsx"), "utf8");
const workspace = readFileSync(resolve(process.cwd(), "src/lib/weddingResponseWorkspaceViewState.ts"), "utf8");

test("Budget target opens the canonical editor and custom categories use the existing save flow", () => {
  assert.match(tracker, /aria-label="Edit total wedding budget"/);
  assert.match(tracker, /totalBudgetInput\?\.focus/);
  assert.match(hub, /item\.id === "target"/);
  assert.match(hub, /props\.onEditBudgetTarget\?\.\(\)/);
  assert.match(panels, /focusBudgetRequest=\{budgetFocusRequest\(\)\}/);
  assert.match(tracker, /Add your own category/);
  assert.match(tracker, /buildWeddingBudgetAllocationProjectionInput\(draft\(\)/);
  assert.doesNotMatch(tracker, />Use<\/button>/);
  assert.doesNotMatch(tracker, /Extra costs to check/);
});

test("unapproved preparation templates are not projected as account tasks", () => {
  assert.match(workspace, /Preparation templates are a catalogue, not evidence/);
  assert.match(workspace, /const preparationTaskItems: WeddingPlanningTaskItem\[\] = \[\]/);
});
