import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import { buildWeddingVowPlanningState } from "@/lib/weddingVowPlanningState";

const metadata = {
  wedding_plan_id: "wedding_plan:vow-workspace",
  response_workspace_id: "response_workspace:vow-workspace",
  source_response_id: "afp:vow-workspace",
};

test("buildWeddingResponseWorkspaceViewState projects vow artifact tasks into Tasks and PersonalOS", () => {
  const vow = buildWeddingVowPlanningState({
    metadata,
    preference: "create",
    styleId: "story_based",
    relationshipFactLabels: ["They value quiet Sunday walks"],
  });
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [vow.artifact.input],
  });

  const taskItems = state.projectionQueue?.groups.find((group) => group.kind === "task")?.items ?? [];
  assert.ok(taskItems.some((item) =>
    /Pick vow style/i.test(item.title)
    && item.sendInput?.metadata?.vow_planning_task === true
    && item.sendInput?.metadata?.vow_preference === "create"
  ));
  assert.ok(state.personalOsProjection.rankedItems.some((item) =>
    /Pick vow style/i.test(item.title)
    && item.evidenceLabels.includes("vow preparation")
  ));
});
