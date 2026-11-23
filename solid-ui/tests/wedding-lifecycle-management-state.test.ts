import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingLifecycleManagementState } from "../src/lib/weddingLifecycleManagementState.ts";

test("buildWeddingLifecycleManagementState creates one-page brief with constraints and no-spam policy", () => {
  const state = buildWeddingLifecycleManagementState({
    metadata: {
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: "response_workspace:harbour",
    },
    planningContext: {
      dateOrSeason: "2028-01-20",
      location: "Sydney NSW",
      guestCount: 100,
      topPriorities: ["venue", "photos", "low stress"],
      vendorCategories: ["Photographer", "Band"],
      countryCode: "AU",
    },
  });

  assert.equal(state.onePageBriefArtifact.summary.title, "Wedding lifecycle brief - Sydney NSW");
  assert.match(state.onePageBriefArtifact.markdown, /Priority canvas/i);
  assert.match(state.onePageBriefArtifact.markdown, /12-18 months/i);
  assert.match(state.onePageBriefArtifact.markdown, /at least 1 month and no more than 18 months/i);
  assert.match(state.onePageBriefArtifact.markdown, /No-spam outreach policy/i);
  assert.ok(state.constraints.some((constraint) => constraint.id === "au_noim_window"));
  assert.ok(state.coverage.some((item) => item.id === "vendor_matching" && item.status === "partial"));
  assert.ok(state.taskItems.some((task) => task.kind === "contract_review"));
  assert.ok(state.taskItems.some((task) => task.kind === "rsvp"));
  assert.ok(state.taskItems.some((task) => task.kind === "seating"));
});

test("buildWeddingLifecycleManagementState stays conservative when core facts are missing", () => {
  const state = buildWeddingLifecycleManagementState({});

  assert.ok(state.coverage.some((item) => item.id === "real_world_constraints" && item.status === "missing"));
  assert.match(state.onePageBriefArtifact.markdown, /Date or season: Unknown/i);
  assert.match(state.onePageBriefArtifact.markdown, /Vendor categories: Not selected/i);
  assert.ok(state.outreachPolicyLabels.some((label) => /Opt-in only/i.test(label)));
});
