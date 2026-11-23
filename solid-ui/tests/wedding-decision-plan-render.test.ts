import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => fs.readFileSync(path.join(here, relative), "utf8");

test("Wedding plan exposes explicit add, not-applicable, undo and restore controls", () => {
  const controls = read("../src/components/WeddingDecisionPlanControls.tsx");
  const focus = read("../src/components/WeddingDecisionFocusCard.tsx");
  assert.match(controls, /\+ Add a decision/);
  assert.match(controls, /Doesn't apply to your wedding\?/);
  assert.match(controls, />Undo</);
  assert.match(controls, /Restore now\?/);
  assert.match(controls, /suggested next task will still need your approval/i);
  assert.match(focus, /Add a follow-up decision/);
  assert.match(focus, /complete_custom/);
});

test("Personal Agent plan has the same editable-plan outcomes without replacing snooze", () => {
  const source = read("../src/components/DecisionOSHomeView.tsx");
  assert.match(source, /\+ Add a decision/);
  assert.match(source, /Doesn't apply to my plan/);
  assert.match(source, /Add a follow-up decision/);
  assert.match(source, /Restore now\?/);
  assert.match(source, /Snooze/);
  assert.match(source, /suggests a task from this decision, you will approve it/i);
});
