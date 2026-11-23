import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";
import type { WeddingArtifactInput } from "../src/lib/weddingArtifactState.ts";

const metadata = {
  wedding_plan_id: "wedding_plan:guest-ops",
  response_workspace_id: "response_workspace:guest-ops",
  source_response_id: "afp:guest-response",
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
    "| Name | RSVP | Email | Meal |",
    "| --- | --- | --- | --- |",
    "| Alex | Yes | alex@example.test | Fish |",
    "| Blair | Pending |  |  |",
    "| Drew | Attending | drew@example.test |  |",
  ].join("\n"),
});

test("buildWeddingResponseWorkspaceViewState projects guest follow-up gaps into tasks", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [guestList],
  });

  const taskItems = state.projectionQueue?.groups.find((group) => group.kind === "task")?.items ?? [];
  assert.ok(taskItems.some((item) =>
    /pending RSVP/i.test(item.title) && item.sourceId === "wedding_guest_follow_up:pending_rsvps"
  ));
  assert.ok(taskItems.some((item) =>
    /meal choices/i.test(item.title) && item.sendInput?.metadata?.guest_follow_up === true
  ));
  assert.ok(state.personalOsProjection.rankedItems.some((item) =>
    /pending RSVP|meal choices/i.test(item.title)
    && item.evidenceLabels.includes("guest follow-up")
  ));
});

test("buildWeddingResponseWorkspaceViewState suppresses duplicate guest follow-up tasks", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [guestList],
    taskItems: [{
      id: "task:pending-rsvps",
      title: "Follow up pending RSVPs",
      kind: "guest_list",
      source: "agent",
      metadata: {
        ...metadata,
        guest_follow_up: true,
        guest_follow_up_candidate_id: "wedding_guest_follow_up:pending_rsvps",
      },
    }],
  });

  const taskItems = state.projectionQueue?.groups.find((group) => group.kind === "task")?.items ?? [];
  assert.equal(taskItems.some((item) => item.sourceId === "wedding_guest_follow_up:pending_rsvps"), false);
  assert.ok(taskItems.some((item) => item.sourceId === "wedding_guest_follow_up:missing_meals"));
});
