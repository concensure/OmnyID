import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";
import type { WeddingArtifactInput } from "../src/lib/weddingArtifactState.ts";

const metadata = {
  wedding_plan_id: "wedding_plan:seating",
  response_workspace_id: "response_workspace:seating",
  source_response_id: "afp:seating-response",
};

function artifact(input: Partial<WeddingArtifactInput> & Pick<WeddingArtifactInput, "title" | "kind" | "createdAt">): WeddingArtifactInput {
  return {
    id: `artifact:${String(input.title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    metadata,
    sourceLabels: ["Guest list upload"],
    ...input,
  };
}

const guestList = artifact({
  title: "Guest list",
  kind: "guest_list",
  createdAt: 1,
  bodyText: [
    "| Name | RSVP | Table | Household | Role | Seating note | Accessibility |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    "| Alex | Yes | Table 1 | Bride family | Parent | VIP table | Wheelchair access |",
    "| Casey | Confirmed |  | Groom friends | VIP | Divorced - do not seat with Drew |  |",
  ].join("\n"),
});

test("buildWeddingResponseWorkspaceViewState projects seating action gaps into tasks", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [guestList],
  });

  const taskItems = state.projectionQueue?.groups.find((group) => group.kind === "task")?.items ?? [];
  assert.ok(taskItems.some((item) =>
    item.sourceId === "wedding_seating_action:assign_tables"
    && item.sendInput?.metadata?.seating_action === true
  ));
  assert.ok(taskItems.some((item) => item.sourceId === "wedding_seating_action:confirm_sensitive_constraints"));
  assert.ok(taskItems.some((item) => item.sourceId === "wedding_seating_action:brief_accessibility"));
  assert.ok(state.personalOsProjection.rankedItems.some((item) =>
    /Assign|sensitive seating|accessibility/i.test(item.title)
    && item.evidenceLabels.includes("seating action")
  ));
});

test("buildWeddingResponseWorkspaceViewState suppresses duplicate seating action tasks", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [guestList],
    taskItems: [{
      id: "task:assign-tables",
      title: "Assign unassigned guests",
      kind: "seating",
      source: "agent",
      metadata: {
        ...metadata,
        seating_action: true,
        seating_action_candidate_id: "wedding_seating_action:assign_tables",
      },
    }],
  });

  const taskItems = state.projectionQueue?.groups.find((group) => group.kind === "task")?.items ?? [];
  assert.equal(taskItems.some((item) => item.sourceId === "wedding_seating_action:assign_tables"), false);
  assert.ok(taskItems.some((item) => item.sourceId === "wedding_seating_action:confirm_sensitive_constraints"));
});
