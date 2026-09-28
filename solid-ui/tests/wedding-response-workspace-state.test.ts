import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingResponseWorkspaceState,
} from "../src/lib/weddingResponseWorkspaceState.ts";
import type { WeddingArtifactInput } from "../src/lib/weddingArtifactState.ts";

function artifact(input: Partial<WeddingArtifactInput> & Pick<WeddingArtifactInput, "title" | "kind" | "createdAt">): WeddingArtifactInput {
  return {
    id: `artifact:${String(input.title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    metadata: {
      wedding_plan_id: "wedding_plan:harbour",
      response_workspace_id: "response_workspace:venue-pass",
      source_response_id: "afp:response-1",
    },
    ...input,
  };
}

test("buildWeddingResponseWorkspaceState groups planning files by category", () => {
  const state = buildWeddingResponseWorkspaceState({
    metadata: {
      wedding_plan_id: "wedding_plan:harbour",
      response_workspace_id: "response_workspace:venue-pass",
      source_response_id: "afp:response-1",
    },
    artifacts: [
      artifact({ title: "Venue research", kind: "research", createdAt: 3 }),
      artifact({ title: "Venue shortlist", kind: "vendor_table", createdAt: 2 }),
      artifact({ title: "Venue email", kind: "email_draft", createdAt: 1 }),
    ],
  });

  assert.equal(state.summaryLabel, "3 planning files");
  assert.equal(state.totalArtifacts, 3);
  assert.equal(state.artifacts.length, 3);
  assert.deepEqual(state.categories.map((category) => category.label), ["Research", "Vendors", "Emails"]);
  assert.equal(state.activeArtifact?.title, "Venue research");
  assert.equal(state.continueContext.weddingPlanId, "wedding_plan:harbour");
  assert.equal(state.continueContext.responseWorkspaceId, "response_workspace:venue-pass");
  assert.equal(state.continueContext.sourceResponseId, "afp:response-1");
  assert.equal(state.continueContext.activeArtifactId, state.activeArtifact?.id);
  assert.ok(state.continueContext.supertags.includes("template:wedding_planning"));
});

test("buildWeddingResponseWorkspaceState searches vendors, locations, exports, sources, and body text", () => {
  const state = buildWeddingResponseWorkspaceState({
    metadata: {
      wedding_plan_id: "wedding_plan:harbour",
      response_workspace_id: "response_workspace:venue-pass",
    },
    query: "harbour wet csv",
    artifacts: [
      artifact({
        title: "Venue shortlist",
        kind: "vendor_table",
        createdAt: 2,
        vendorLabels: ["Harbour View Room"],
        locationLabels: ["Sydney"],
        sourceLabels: ["Venue website"],
        exportTargets: ["csv"],
        bodyText: "Wet weather backup available.",
      }),
      artifact({
        title: "Family email",
        kind: "email_draft",
        createdAt: 1,
        bodyText: "Draft update for family.",
      }),
    ],
  });

  assert.equal(state.summaryLabel, "1/2 planning files matched");
  assert.equal(state.artifacts.length, 2);
  assert.equal(state.resultCount, 1);
  assert.equal(state.results[0]?.title, "Venue shortlist");
  assert.deepEqual(state.categories.map((category) => category.label), ["Vendors"]);
  assert.equal(state.hasNoMatches, false);
});

test("buildWeddingResponseWorkspaceState searches artifact evidence status", () => {
  const state = buildWeddingResponseWorkspaceState({
    metadata: {
      wedding_plan_id: "wedding_plan:harbour",
      response_workspace_id: "response_workspace:venue-pass",
    },
    query: "source unverified",
    artifacts: [
      artifact({
        title: "Venue shortlist",
        kind: "vendor_table",
        createdAt: 2,
      }),
      artifact({
        title: "Budget sheet",
        kind: "budget_sheet",
        createdAt: 1,
        sourceLinks: [{ label: "Quote", url: "https://example.com/quote" }],
      }),
    ],
  });

  assert.equal(state.resultCount, 1);
  assert.equal(state.results[0]?.title, "Venue shortlist");
  assert.deepEqual(state.categories.map((category) => category.label), ["Vendors"]);
});

test("buildWeddingResponseWorkspaceState exposes no-match and empty states", () => {
  const noMatch = buildWeddingResponseWorkspaceState({
    metadata: { response_workspace_id: "response_workspace:venue-pass" },
    query: "registry",
    artifacts: [artifact({ title: "Venue shortlist", kind: "vendor_table", createdAt: 1 })],
  });
  const empty = buildWeddingResponseWorkspaceState({
    metadata: { response_workspace_id: "response_workspace:venue-pass" },
    artifacts: [],
  });

  assert.equal(noMatch.hasNoMatches, true);
  assert.match(noMatch.emptyTitle ?? "", /No wedding documents match/i);
  assert.match(noMatch.emptyDetail ?? "", /vendor, location, artifact type/i);
  assert.equal(empty.totalArtifacts, 0);
  assert.match(empty.emptyTitle ?? "", /No wedding documents created/i);
});

test("buildWeddingResponseWorkspaceState treats missing artifacts as an empty workspace", () => {
  const state = buildWeddingResponseWorkspaceState({
    metadata: { response_workspace_id: "response_workspace:receipt-only" },
  });

  assert.equal(state.totalArtifacts, 0);
  assert.equal(state.resultCount, 0);
  assert.equal(state.activeArtifact, null);
  assert.match(state.emptyTitle ?? "", /No wedding documents created/i);
  assert.equal(state.continueContext.responseWorkspaceId, "response_workspace:receipt-only");
});

test("buildWeddingResponseWorkspaceState scopes artifacts to the response workspace", () => {
  const state = buildWeddingResponseWorkspaceState({
    metadata: {
      wedding_plan_id: "wedding_plan:harbour",
      response_workspace_id: "response_workspace:venue-pass",
    },
    artifacts: [
      artifact({ title: "Venue shortlist", kind: "vendor_table", createdAt: 2 }),
      artifact({
        title: "Budget",
        kind: "budget_sheet",
        createdAt: 3,
        metadata: {
          wedding_plan_id: "wedding_plan:harbour",
          response_workspace_id: "response_workspace:budget-pass",
        },
      }),
    ],
  });

  assert.equal(state.totalArtifacts, 1);
  assert.equal(state.results[0]?.title, "Venue shortlist");
  assert.equal(state.categories[0]?.label, "Vendors");
});

test("buildWeddingResponseWorkspaceState honors active artifact selection", () => {
  const state = buildWeddingResponseWorkspaceState({
    metadata: { response_workspace_id: "response_workspace:venue-pass" },
    activeArtifactId: "artifact:venue-email",
    artifacts: [
      artifact({ title: "Venue shortlist", kind: "vendor_table", createdAt: 2 }),
      artifact({ id: "artifact:venue-email", title: "Venue email", kind: "email_draft", createdAt: 1 }),
    ],
  });

  assert.equal(state.activeArtifact?.id, "artifact:venue-email");
  assert.equal(state.continueContext.activeArtifactId, "artifact:venue-email");
});

test("buildWeddingResponseWorkspaceState does not fall back when an explicit active artifact is missing", () => {
  const state = buildWeddingResponseWorkspaceState({
    metadata: { response_workspace_id: "response_workspace:venue-pass" },
    activeArtifactId: "artifact:deleted-vendor-comparison",
    artifacts: [
      artifact({ title: "Venue shortlist", kind: "vendor_table", createdAt: 2 }),
      artifact({ id: "artifact:venue-email", title: "Venue email", kind: "email_draft", createdAt: 1 }),
    ],
  });

  assert.equal(state.activeArtifact, null);
  assert.equal(state.continueContext.activeArtifactId, null);
  assert.equal(state.resultCount, 2);
});
