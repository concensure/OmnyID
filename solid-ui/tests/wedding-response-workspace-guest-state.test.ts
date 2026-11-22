import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingGuestBoundaryDraftObjects } from "../src/lib/weddingGuestBoundaryDraftState.ts";
import { buildWeddingHomeOverviewActionTiles } from "../src/lib/weddingHomeOverviewState.ts";
import { buildWeddingInspirationItem } from "../src/lib/weddingInspirationState.ts";
import { buildWeddingRsvpReconciliationState } from "../src/lib/weddingRsvpReconciliationState.ts";
import { buildWeddingRsvpVendorExportPreview } from "../src/lib/weddingRsvpExportState.ts";
import { buildWeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";
import { buildWeddingPeopleAggregateState } from "../src/lib/weddingWorkspaceAggregateState.ts";
import {
  weddingResponseWorkspaceMetadata as metadata,
} from "./wedding-response-workspace-fixtures.ts";

test("buildWeddingResponseWorkspaceViewState exposes guest operations tracking", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [{
      id: "artifact:guests",
      title: "Guest list",
      kind: "guest_list",
      createdAt: 1,
      metadata,
      bodyText: [
        "| Name | RSVP | Email | Meal | Dietary | Accessibility |",
        "| --- | --- | --- | --- | --- | --- |",
        "| Alex | Yes | alex@example.test | Fish | Nut allergy | Wheelchair access |",
        "| Blair | Pending |  |  | Vegan |  |",
      ].join("\n"),
    }],
  });

  assert.equal(state.guestTracking.guestFileCount, 1);
  assert.equal(state.guestTracking.guestRowCount, 2);
  assert.equal(state.guestTracking.attendingCount, 1);
  assert.equal(state.guestTracking.pendingCount, 1);
  assert.equal(state.guestTracking.dietaryCount, 2);
  assert.equal(state.guestTracking.accessibilityCount, 1);
  assert.ok(state.guestTracking.warningLabels.some((label) => /RSVP/i.test(label)));
  assert.equal(state.boundaryState.activePolicyCount, 2);
  assert.equal(state.boundaryState.guestCount, 2);
  assert.ok(state.boundaryTopology.nodes.some((node) => node.kind === "boundary_policy"));
  assert.ok(state.boundaryTopology.nodes.some((node) => node.kind === "guest" && node.label === "Alex"));
  assert.ok(state.projectionQueue?.queue.pendingItems.some((item) => item.kind === "boundary" && /Guest changes/i.test(item.title)));
  assert.ok(state.projectionQueue?.dispatchPayload?.sendInputs.some((input) => input.type === "ledger" && input.kind === "wedding_boundary_policy"));
});

test("buildWeddingResponseWorkspaceViewState counts saved boundary guests in guest tracking", () => {
  const boundaryObjects = buildWeddingGuestBoundaryDraftObjects({
    displayName: "Casey Morgan",
    householdLabel: "Friends",
    rsvpStatus: "Attending",
    contactLabel: "casey@example.test",
    mealPreference: "Vegetarian",
    dietaryNote: "No shellfish",
    accessibilityNote: "Step-free entry",
  }, metadata, "2026-09-25T00:00:00.000Z");
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    boundaryObjects,
  });

  assert.equal(state.guestTracking.guestFileCount, 0);
  assert.equal(state.guestTracking.guestRowCount, 1);
  assert.equal(state.guestTracking.attendingCount, 1);
  assert.equal(state.guestTracking.pendingCount, 0);
  assert.equal(state.guestTracking.householdCount, 1);
  assert.equal(state.guestTracking.dietaryCount, 1);
  assert.equal(state.guestTracking.accessibilityCount, 1);
  assert.equal(state.guestTracking.missingContactCount, 0);
  assert.equal(state.guestTracking.missingMealCount, 0);
  assert.ok(state.guestTracking.sourceLabels.includes("Saved guest records"));
  assert.equal(state.guestTracking.guestRows[0]?.householdLabel, "Friends");
  assert.equal(state.seatingPlan.guestRowsConsidered, 1);
  assert.equal(state.seatingPlan.unassignedAttendingCount, 1);
  assert.equal(state.seatingPlan.suggestedTableCount, 1);
  assert.equal(state.seatingPlan.accessibilityConstraintCount, 1);
  assert.ok(state.seatingPlan.dietaryAccessibilityBrief.dietarySummaryLabels.some((label) => /shellfish/i.test(label)));
  assert.ok(state.seatingPlan.actionItems.some((item) => /Assign 1 attending guest/i.test(item.title)));
  assert.ok(state.planningTaskItems.some((item) => item.id === "wedding_seating_action:assign_tables"));
  assert.ok(state.planningTaskItems.some((item) => item.id === "wedding_seating_action:brief_accessibility"));
  assert.ok(state.projectionQueue?.dispatchPayload?.sendInputs.some((input) =>
    input.type === "task"
    && input.kind === "task"
    && input.metadata?.seating_action_candidate_id === "wedding_seating_action:assign_tables",
  ));
  assert.ok(state.personalOsProjection.rankedItems.some((item) =>
    item.id === "task:wedding_seating_action:assign_tables"
    && item.sourceSurface === "tasks"
    && item.evidenceLabels.includes("seating action"),
  ));
  const eventId = state.guestTracking.guestRows[0]?.eventResponses[0]?.eventId ?? "";
  const homeGuestTile = buildWeddingHomeOverviewActionTiles(state).find((tile) => tile.id === "guests");
  const peopleGuestSummary = buildWeddingPeopleAggregateState(state).summaryItems?.find((item) => item.id === "guests");
  const reconciliation = buildWeddingRsvpReconciliationState({ guestTracking: state.guestTracking, eventId });
  const catererExport = buildWeddingRsvpVendorExportPreview({ guestTracking: state.guestTracking, eventId, audience: "caterer" });
  assert.equal(homeGuestTile?.valueLabel, "1");
  assert.equal(peopleGuestSummary?.label, "1 guest");
  assert.equal(state.seatingPlan.guestRowsConsidered, state.guestTracking.attendingCount);
  assert.equal(reconciliation.cateringHeadcount, state.guestTracking.attendingCount);
  assert.equal(catererExport.rowCount, state.guestTracking.attendingCount);
});

test("buildWeddingResponseWorkspaceViewState exposes seating draft tracking", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [{
      id: "artifact:guests",
      title: "Guest list",
      kind: "guest_list",
      createdAt: 1,
      metadata,
      bodyText: [
        "| Name | RSVP | Table | Household | Role | Seating note | Accessibility |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        "| Alex | Yes | Table 1 | Bride family | Parent | VIP table | Wheelchair access |",
        "| Blair | Attending |  | Friends | Guest | Divorced - keep apart |  |",
      ].join("\n"),
    }],
  });

  assert.equal(state.seatingPlan.guestRowsConsidered, 2);
  assert.equal(state.seatingPlan.assignedSeatCount, 1);
  assert.equal(state.seatingPlan.unassignedAttendingCount, 1);
  assert.equal(state.seatingPlan.householdGroupCount, 2);
  assert.equal(state.seatingPlan.sensitiveConstraintCount, 1);
  assert.equal(state.seatingPlan.accessibilityConstraintCount, 1);
  assert.ok(state.seatingPlan.warningLabels.some((label) => /not assigned/i.test(label)));
});

test("buildWeddingResponseWorkspaceViewState applies saved seating constraints to the draft", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [{
      id: "artifact:guests",
      title: "Guest list",
      kind: "guest_list",
      createdAt: 1,
      metadata,
      bodyText: [
        "| Name | RSVP | Household |",
        "| --- | --- | --- |",
        "| Mum | Yes | Family |",
        "| Uncle David | Yes | Family |",
      ].join("\n"),
    }],
    seatingConstraints: [{
      id: "constraint:keep-apart",
      kind: "keep_apart",
      instruction: "Move Uncle David away from Mum.",
      primaryPersonId: "uncle-david",
      relatedPersonId: "mum",
      confidence: "high",
      statusLabel: "Uncle David and Mum will be kept apart in the next seating draft.",
    }],
  });
  const mum = state.seatingPlan.optimizationPreview?.assignments.find((assignment) => assignment.personId === "mum");
  const david = state.seatingPlan.optimizationPreview?.assignments.find((assignment) => assignment.personId === "uncle-david");

  assert.ok(mum);
  assert.ok(david);
  assert.notEqual(mum.tableId, david.tableId);
});

test("buildWeddingResponseWorkspaceViewState shows a saved seating draft after refresh", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    seatingOptimizations: [{
      assignments: [{
        personId: "grandma-chen",
        personLabel: "Grandma Chen",
        tableId: "table-3",
        tableLabel: "Table 3",
        score: 14,
        reasonLabels: ["Accessible table and quieter seating"],
      }],
      totalScore: 14,
      hardViolations: [],
      softSignals: [],
      explanationLabels: ["Saved seating draft is ready to review."],
      proactiveIssueLabels: [],
      applyLabel: "Apply seating plan",
      alternativeLabel: "Show alternatives",
      savedAt: "2026-09-25T00:00:00.000Z",
    }, {
      assignments: [{
        personId: "grandma-chen",
        personLabel: "Grandma Chen",
        tableId: "table-4",
        tableLabel: "Table 4",
        score: 12,
        reasonLabels: ["Kept near family"],
      }],
      totalScore: 12,
      hardViolations: [],
      softSignals: [],
      explanationLabels: ["Newer seating draft is ready."],
      proactiveIssueLabels: [],
      applyLabel: "Apply seating plan",
      alternativeLabel: "Show alternatives",
      savedAt: "2026-09-26T00:00:00.000Z",
    }],
  });

  assert.equal(state.seatingPlan.optimizationPreview?.assignments[0]?.personLabel, "Grandma Chen");
  assert.equal(state.seatingPlan.optimizationPreview?.assignments[0]?.tableLabel, "Table 4");
  assert.equal(state.seatingPlan.optimizationPreview?.explanationLabels[0], "Newer seating draft is ready.");
  assert.equal(state.seatingDraftCards.length, 2);
  assert.equal(state.seatingDraftCards[0]?.title, "Current seating draft");
  assert.equal(state.seatingDraftCards[0]?.isCurrent, true);
  assert.equal(state.seatingDraftCards[1]?.statusLabel, "Saved");
  assert.match(state.seatingDraftCards[1]?.detailLabel ?? "", /25 Sept 2026/);
});

test("buildWeddingResponseWorkspaceViewState hides archived seating drafts", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    seatingOptimizations: [{
      assignments: [{
        personId: "grandma-chen",
        personLabel: "Grandma Chen",
        tableId: "table-3",
        tableLabel: "Table 3",
        score: 14,
        reasonLabels: ["Accessible table and quieter seating"],
      }],
      totalScore: 14,
      hardViolations: [],
      softSignals: [],
      explanationLabels: ["Saved seating draft is ready to review."],
      proactiveIssueLabels: [],
      applyLabel: "Apply seating plan",
      alternativeLabel: "Show alternatives",
      savedAt: "2026-09-25T00:00:00.000Z",
    }, {
      assignments: [{
        personId: "grandma-chen",
        personLabel: "Grandma Chen",
        tableId: "table-4",
        tableLabel: "Table 4",
        score: 12,
        reasonLabels: ["Kept near family"],
      }],
      totalScore: 12,
      hardViolations: [],
      softSignals: [],
      explanationLabels: ["Newer seating draft is ready."],
      proactiveIssueLabels: [],
      applyLabel: "Apply seating plan",
      alternativeLabel: "Show alternatives",
      savedAt: "2026-09-26T00:00:00.000Z",
    }],
    seatingDraftArchives: [{
      id: "archive:old",
      fingerprint: "grandma-chen:table-3",
      statusLabel: "Saved seating draft hidden.",
      reasonLabel: null,
      createdAt: "2026-09-26T00:10:00.000Z",
    }],
  });

  assert.equal(state.seatingDraftCards.length, 1);
  assert.equal(state.seatingDraftCards[0]?.result.assignments[0]?.tableLabel, "Table 4");
  assert.equal(state.seatingArchivedDraftCards.length, 1);
  assert.equal(state.seatingArchivedDraftCards[0]?.result.assignments[0]?.tableLabel, "Table 3");
});

test("buildWeddingResponseWorkspaceViewState exposes inspiration preference state", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    inspirationItems: [
      buildWeddingInspirationItem({
        title: "Reception inspiration",
        note: "warm lighting, candles, and long table",
        createdAt: "2026-09-26T00:00:00.000Z",
      }),
      buildWeddingInspirationItem({
        title: "Venue inspiration",
        note: "warm garden venue",
        createdAt: "2026-09-26T00:01:00.000Z",
      }),
    ],
  });

  assert.equal(state.inspiration.items.length, 2);
  assert.ok(state.inspiration.tagCounts.some((entry) => entry.tag === "warm lighting"));
  assert.match(state.inspiration.insight?.detail ?? "", /warm lighting/i);
  assert.ok(state.experienceModel.traits.some((trait) => trait.label === "Warm and intimate"));
  assert.match(state.experienceModel.summaryLabel, /warm/i);
  assert.ok(state.planningTaskItems.some((task) => task.metadata
    && typeof task.metadata === "object"
    && (task.metadata as Record<string, unknown>).wedding_inspiration_task === true));
});
