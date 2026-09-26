import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingSeatingDraftSidebarAction } from "@/lib/weddingSeatingPanelActionState";
import type { WeddingSeatingPlanState } from "@/lib/weddingSeatingPlanState";

function seatingPlan(input: Partial<WeddingSeatingPlanState> = {}): WeddingSeatingPlanState {
  return {
    guestRowsConsidered: 4,
    assignedSeatCount: 1,
    unassignedAttendingCount: 3,
    tableCount: 1,
    householdGroupCount: 2,
    vipOrWeddingPartyCount: 0,
    sensitiveConstraintCount: 0,
    accessibilityConstraintCount: 0,
    suggestedTableCount: 1,
    statusLabel: "Needs seating follow-up",
    summaryLabel: "1/4 attending guests assigned.",
    warningLabels: [],
    tableLabels: [],
    tableBriefs: [],
    vendorBriefLines: [],
    actionItems: [],
    dietaryAccessibilityBrief: {
      dietarySummaryLabels: [],
      accessibilitySummaryLabels: [],
      severeAllergyCount: 0,
      approvalRequiredLabels: [],
      correctionLoopLabel: "",
    },
    optimizationPreview: null,
    optimizationPeople: [],
    optimizationTables: [],
    ...input,
  };
}

test("buildWeddingSeatingDraftSidebarAction opens tasks with seating context", () => {
  const action = buildWeddingSeatingDraftSidebarAction(seatingPlan());

  assert.equal(action.kind, "open_tasks");
  assert.equal(action.label, "Draft seating plan");
  assert.equal(action.enabled, true);
  assert.equal(action.reason, null);
  assert.deepEqual(action.contextLabels, ["Seating plan", "4 attending guests", "1 suggested table"]);
  assert.equal(action.metadata?.wedding_seating_draft?.unassigned_attending_count, 3);
});

test("buildWeddingSeatingDraftSidebarAction guides empty seating back to guest entry", () => {
  const action = buildWeddingSeatingDraftSidebarAction(seatingPlan({
    guestRowsConsidered: 0,
    suggestedTableCount: 0,
    statusLabel: "Needs guest data",
  }));

  assert.equal(action.label, "Add attending guests");
  assert.match(action.reason ?? "", /Add attending guests/i);
  assert.deepEqual(action.contextLabels, ["Seating plan", "0 attending guests", "0 suggested tables"]);
});
