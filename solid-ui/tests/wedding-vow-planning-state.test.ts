import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingVowPlanningTaskItems,
  buildWeddingVowPlanningState,
  normalizeWeddingVowPreference,
  weddingVowStyleOption,
} from "../src/lib/weddingVowPlanningState.ts";

test("buildWeddingVowPlanningState creates personal vow inspiration without inventing relationship facts", () => {
  const state = buildWeddingVowPlanningState({
    metadata: {
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: "response_workspace:harbour",
    },
    preference: "create",
    styleId: "story_based",
    relationshipFactLabels: ["Met during medical school", "They value quiet Sunday walks"],
    customChecklistItems: ["Confirm whether vows are private or ceremony-facing"],
  });

  assert.equal(state.preference, "create");
  assert.equal(state.selectedStyle?.id, "story_based");
  assert.equal(state.artifact.summary.kind, "research");
  assert.match(state.artifact.markdown, /Story-based/i);
  assert.match(state.artifact.markdown, /Met during medical school/i);
  assert.ok(state.checklistItems.some((item) => /private or ceremony-facing/i.test(item)));
  assert.ok(state.taskItems.every((task) => task.kind === "vow"));
  assert.ok(state.taskItems.every((task) => task.dueLabel === "Early prep / anytime"));
});

test("buildWeddingVowPlanningState provides standard vow and conservative empty-memory label", () => {
  const state = buildWeddingVowPlanningState({
    preference: "standard",
    styleId: "light_funny",
  });

  assert.equal(state.preference, "standard");
  assert.match(state.artifact.markdown, /Use a standard vow/i);
  assert.match(state.artifact.markdown, /No relationship facts from saved OmnyID memory/i);
  assert.match(state.artifact.markdown, /I take you as my partner in marriage/i);
});

test("vow preference and style helpers normalize expected values", () => {
  assert.equal(normalizeWeddingVowPreference("create"), "create");
  assert.equal(normalizeWeddingVowPreference("bad"), "undecided");
  assert.equal(weddingVowStyleOption("Warm and personal")?.id, "warm_personal");
});

test("buildWeddingVowPlanningTaskItems recovers vow tasks from saved artifacts", () => {
  const state = buildWeddingVowPlanningState({
    metadata: {
      wedding_plan_id: "wedding_plan:vows",
      response_workspace_id: "response_workspace:vows",
    },
    preference: "create",
    styleId: "warm_personal",
  });
  const tasks = buildWeddingVowPlanningTaskItems({
    artifacts: [state.artifact.input],
    metadata: state.artifact.input.metadata,
  });

  assert.equal(tasks.length, 3);
  assert.ok(tasks.every((task) => task.kind === "vow"));
  assert.ok(tasks.every((task) => task.linkedArtifactId === state.artifact.input.id));
  assert.ok(tasks.every((task) =>
    (task.metadata as Record<string, unknown>).vow_planning_task === true
    && (task.metadata as Record<string, unknown>).preparation_checklist_item === "vow_preparation"
  ));
});

test("buildWeddingVowPlanningTaskItems suppresses saved vow tasks", () => {
  const state = buildWeddingVowPlanningState({ preference: "standard" });
  const tasks = buildWeddingVowPlanningTaskItems({
    artifacts: [state.artifact.input],
    existingTaskItems: [{
      id: state.taskItems[0]?.id ?? "task:vow",
      title: "Choose vow path",
      kind: "vow",
      metadata: { vow_planning_task: true, wedding_task_kind: "vow" },
    }],
  });

  assert.equal(tasks.length, 0);
});
