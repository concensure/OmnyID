import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingRichResponseRendererState } from "@/lib/weddingRichResponseRendererState";
import { buildWeddingPresentationState } from "@/lib/weddingPresentationState";
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";

function artifact(input: Partial<WeddingArtifactInput> & Pick<WeddingArtifactInput, "title" | "kind" | "createdAt">): WeddingArtifactInput {
  return {
    id: `artifact:${String(input.title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    metadata: {
      wedding_plan_id: "wedding_plan:rich",
      response_workspace_id: "response_workspace:rich",
      source_response_id: "response:rich",
    },
    sourceLabels: ["Agent research"],
    ...input,
  };
}

test("buildWeddingRichResponseRendererState maps wedding presentation into travel-style sections", () => {
  const presentation = buildWeddingPresentationState({
    title: "Sydney wedding planning pass",
    metadata: {
      wedding_plan_id: "wedding_plan:rich",
      response_workspace_id: "response_workspace:rich",
      source_response_id: "response:rich",
    },
    planningContext: {
      dateOrSeason: "Spring 2027",
      location: "Sydney",
      guestCount: 90,
      budgetComfort: "mid-range",
      topPriorities: ["food", "photos"],
    },
    artifacts: [
      artifact({ title: "Venue map", kind: "map_collection", createdAt: 8, locationLabels: ["Sydney Harbour"] }),
      artifact({ title: "Run sheet", kind: "timeline", createdAt: 7, linkedCalendarEventIds: ["calendar:ceremony"] }),
      artifact({ title: "Budget sheet", kind: "budget_sheet", createdAt: 6 }),
      artifact({ title: "Vendor shortlist", kind: "vendor_table", createdAt: 5 }),
      artifact({ title: "Venue email", kind: "email_draft", createdAt: 4 }),
    ],
  });

  const state = buildWeddingRichResponseRendererState(presentation);

  assert.equal(state.renderer, "wedding_travel_style_response");
  assert.equal(state.workspaceId, "response_workspace:rich");
  assert.equal(state.primaryAction.kind, "open_planning_files");
  assert.equal(state.accessibilityFallbackLabel, "");
  assert.deepEqual(
    state.sections.map((section) => [section.id, section.layoutHint]),
    [
      ["overview", "hero"],
      ["map", "media"],
      ["timeline", "timeline"],
      ["budget", "cards"],
      ["vendors", "cards"],
      ["drafts", "actions"],
      ["artifacts", "cards"],
      ["continue", "actions"],
    ],
  );
  assert.equal(state.sections.find((section) => section.id === "map")?.blocks[0]?.kind, "map");
  assert.equal(state.sections.find((section) => section.id === "timeline")?.blocks[0]?.kind, "timeline");
  assert.equal(state.sections.find((section) => section.id === "budget")?.blocks[0]?.kind, "table");
  assert.equal(state.sections.find((section) => section.id === "drafts")?.blocks[0]?.kind, "draft");
  assert.equal(state.continueChatAction?.kind, "continue_chat");
});

test("buildWeddingRichResponseRendererState keeps card actions button-addressable", () => {
  const presentation = buildWeddingPresentationState({
    metadata: {
      wedding_plan_id: "wedding_plan:rich",
      response_workspace_id: "response_workspace:rich",
      source_response_id: "response:rich",
    },
    planningContext: {
      dateOrSeason: "Spring 2027",
      location: "Sydney",
      guestCount: 90,
      budgetComfort: "mid-range",
      topPriorities: ["food"],
    },
    artifacts: [
      artifact({ title: "Vendor shortlist", kind: "vendor_table", createdAt: 5 }),
    ],
  });

  const state = buildWeddingRichResponseRendererState(presentation);
  const vendorAction = state.sections.find((section) => section.id === "vendors")?.blocks[0]?.primaryAction;

  assert.equal(vendorAction?.responseWorkspaceId, "response_workspace:rich");
  assert.match(vendorAction?.actionId ?? "", /^wedding:open_planning_files:vendors:/);
  assert.match(vendorAction?.accessibleLabel ?? "", /vendors/i);
  assert.ok(state.sections.every((section) => section.blocks.every((block) => block.primaryAction || block.secondaryAction)));
});
