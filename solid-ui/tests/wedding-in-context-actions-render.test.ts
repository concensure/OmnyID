import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("wedding-home searches attach their result without becoming background jobs", () => {
  const registry = read("src/lib/weddingHomeSectionRegistry.tsx");
  const queue = read("src/components/ResponseQueueView.tsx");
  assert.match(registry, /<WeddingVendorSearchHomeSection\s+stayOnHome/);
  assert.match(queue, /if \(!options\?\.background\)[\s\S]*setWeddingVendorSearchResultAction\(resultAction\)/);
  assert.match(queue, /background: true/);
});

test("tasks expose responsibility fields and seating exposes an interactive canvas", () => {
  const tasks = read("src/components/WeddingPlanningTasksPanel.tsx");
  const timeline = read("src/components/WeddingTimelinePanel.tsx");
  const journey = read("src/components/WeddingPlanningJourneyStepper.tsx");
  const stageView = read("src/components/WeddingTaskStageView.tsx");
  const ownerControl = read("src/components/WeddingTaskOwnerControl.tsx");
  const workspace = read("src/components/WeddingResponseWorkspaceView.tsx");
  const responsibility = read("src/components/WeddingTaskResponsibilityFields.tsx");
  const seating = read("src/components/WeddingSeatingCanvas.tsx");
  assert.match(tasks, /WeddingTaskResponsibilityFields/);
  assert.match(responsibility, />Owner/);
  assert.match(responsibility, />Consult/);
  assert.match(responsibility, />Last contact/);
  assert.match(responsibility, /\+ Add a person/);
  assert.match(tasks, /WeddingTaskOwnerControl/);
  assert.match(timeline, /WeddingTaskOwnerControl/);
  assert.match(journey, /WeddingTaskOwnerControl/);
  assert.match(stageView, /WeddingTaskOwnerControl/);
  assert.match(ownerControl, /weddingHelperResponsibilityToAfpSendInput/);
  assert.match(ownerControl, /dispatchWeddingTaskResponsibilityChange/);
  assert.match(workspace, /weddingHelperResponsibilityToAfpSendInput/);
  assert.doesNotMatch(workspace, /task_update_source: "wedding_decision_focus"/);
  assert.match(seating, /draggable/);
  assert.match(seating, /Map|Reception floor canvas/);
});

test("vendor contact details offer an explicit map reveal and outreach labels its toolbar", () => {
  const card = read("src/components/WeddingVendorChoiceCard.tsx");
  const toolbar = read("src/components/editor/EditorToolbar.tsx");
  assert.match(card, /WeddingVendorInlineMap/);
  assert.match(card, /aria-expanded=\{mapOpen\(\)\}/);
  assert.match(toolbar, /aria-label="Text formatting"/);
});
