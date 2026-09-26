import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import {
  WEDDING_BUDGET_ALLOCATION_ARTIFACT_ID,
  WEDDING_BUDGET_ALLOCATION_ARTIFACT_KIND,
  WEDDING_BUDGET_ALLOCATION_SELECTED_OPTION_ID,
} from "@/lib/weddingBudgetAllocationState";
import {
  weddingArtifact as artifact,
  weddingResponseWorkspaceMetadata as metadata,
} from "./wedding-response-workspace-fixtures.ts";

test("wedding workspace connects catering budget allocation to guest final-count impact", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [artifact({
      title: "Guest list",
      kind: "guest_list",
      createdAt: 1,
      bodyText: [
        "| Name | RSVP |",
        "| --- | --- |",
        "| Alex | Confirmed |",
        "| Blair | Confirmed |",
        "| Casey | Pending |",
      ].join("\n"),
    })],
    decisionRecords: [{
      id: "decision:budget-allocation",
      artifactId: WEDDING_BUDGET_ALLOCATION_ARTIFACT_ID,
      artifactTitle: "Wedding Budget",
      artifactKind: WEDDING_BUDGET_ALLOCATION_ARTIFACT_KIND,
      selectedOptionId: WEDDING_BUDGET_ALLOCATION_SELECTED_OPTION_ID,
      selectedOptionLabel: "AUD 15000 total",
      selectedOptionDetail: "Allocated wedding budget.",
      selectedOptionCells: [
        "Venue & Ceremony: AUD 5,000",
        "Catering & Drinks: AUD 600",
        "Photography & Video: AUD 3,000",
        "Attire & Beauty: AUD 1,000",
        "Flowers & Decor: AUD 1,000",
        "Entertainment & Music: AUD 1,000",
        "Stationery, Transport & Other: AUD 3,400",
      ],
      createdAt: "2026-09-25T00:00:00.000Z",
      source: "user",
      metadataLabels: [],
    }],
  });

  assert.equal(state.guestTracking.finalCountOptions[0]?.headcount, 2);
  assert.equal(state.guestTracking.finalCountOptions[0]?.budgetImpactAmount, 400);
  assert.equal(state.guestTracking.finalCountOptions[1]?.headcount, 3);
  assert.equal(state.guestTracking.finalCountOptions[1]?.budgetImpactAmount, 600);
});
