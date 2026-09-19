import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingPostWeddingWrapUpState } from "@/lib/weddingPostWeddingWrapUpState";
import { buildWeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";

const metadata = {
  wedding_plan_id: "wedding_plan:post-wedding",
  response_workspace_id: "response_workspace:post-wedding",
  source_response_id: "afp:post-wedding",
};

test("buildWeddingResponseWorkspaceViewState projects post-wedding wrap-up artifact tasks", () => {
  const wrapUp = buildWeddingPostWeddingWrapUpState({
    metadata,
    coupleLabel: "Maya and Ozan",
    vendorNames: ["Photo Team"],
    knownMemoryLabels: ["first dance under fairy lights"],
    createdAt: 1,
  });
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [wrapUp.artifactInput],
  });

  const taskItems = state.projectionQueue?.groups.find((group) => group.kind === "task")?.items ?? [];
  assert.ok(taskItems.some((item) =>
    /thank-you/i.test(item.title)
    && item.sendInput?.metadata?.post_wedding_wrap_up === true
    && item.sendInput?.metadata?.no_external_send_without_approval === true
  ));
  assert.ok(state.personalOsProjection.rankedItems.some((item) =>
    /thank-you/i.test(item.title)
    && item.evidenceLabels.includes("post-wedding wrap-up")
  ));
});
