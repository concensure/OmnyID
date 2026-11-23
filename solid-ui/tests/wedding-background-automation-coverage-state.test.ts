import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingBackgroundAutomationCoverageState,
  buildWeddingBackgroundAutomationTaskItems,
} from "@/lib/weddingBackgroundAutomationCoverageState";
import type { WeddingBudgetTrackingState } from "@/lib/weddingBudgetTrackingState";
import type { WeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";
import type { WeddingSeatingPlanState } from "@/lib/weddingSeatingPlanState";

const guests: WeddingGuestTrackingState = {
  guestFileCount: 1,
  guestRowCount: 3,
  attendingCount: 2,
  declinedCount: 0,
  pendingCount: 1,
  householdCount: 2,
  dietaryCount: 1,
  accessibilityCount: 1,
  missingContactCount: 0,
  missingMealCount: 1,
  finalCountOptions: [
    { id: "current", label: "Submit current count (2)", headcount: 2, budgetImpactAmount: 300, riskLabel: "current", recommendationLabel: "ok" },
  ],
  followUpTaskCandidates: [],
  summaryLabel: "3 guests",
  warningLabels: [],
  sourceLabels: [],
};

const budget = { projectedCount: 1, quotedCount: 0 } as WeddingBudgetTrackingState;
const seating = {
  guestRowsConsidered: 3,
  tableCount: 1,
  householdGroupCount: 2,
  dietaryAccessibilityBrief: { dietarySummaryLabels: ["1 vegan"], accessibilitySummaryLabels: ["1 wheelchair access"] },
} as WeddingSeatingPlanState;

test("background automation coverage differentiates OmnyID summaries while provider sync is blocked", () => {
  const state = buildWeddingBackgroundAutomationCoverageState({ guestTracking: guests, budgetTracking: budget, seatingPlan: seating });

  assert.equal(state.status, "partial");
  assert.equal(state.matchedCount, 3);
  assert.ok(state.items.find((item) => item.id === "gmail_vendor_reply_sync")?.status === "blocked");
  assert.ok(state.items.find((item) => item.id === "booked_vendor_timeline_sync")?.status === "blocked");
  assert.equal(state.items.find((item) => item.id === "guest_seating_summary")?.status, "differentiated");
  assert.ok(state.omnyidDifferentiatorLabels.some((label) => /wider life tasks/i.test(label)));
});

test("background automation coverage reports strong when live provider and timeline evidence exist", () => {
  const state = buildWeddingBackgroundAutomationCoverageState({
    guestTracking: guests,
    budgetTracking: budget,
    seatingPlan: seating,
    approvalReceipts: [{
      id: "receipt:gmail",
      requestId: "request:gmail",
      actionKind: "contact_vendor",
      title: "Contact venue",
      status: "executed",
      createdAt: "2026-09-15T00:00:00.000Z",
      disclosureLines: [],
      riskLabels: [],
      blockedReason: null,
      blockKind: null,
      externalId: "gmail:thread-1",
      executionMode: "live",
      providerCapability: "email",
      requiredProvider: "Gmail",
      providerCredentialStatus: "connected",
      providerExecutorStatus: "available",
      providerExecutorConnected: true,
      providerSetupView: null,
      externalProviderRequired: true,
      artifactIds: [],
      scheduleItemIds: [],
      taskItemIds: [],
    }],
    scheduleItems: [{
      id: "schedule:photo",
      title: "Photographer arrival and departure",
      kind: "other",
      startAt: "2028-01-01T09:00:00.000Z",
      endAt: "2028-01-01T22:00:00.000Z",
      notes: "Booked vendor arrival 9am, departure 10pm.",
    }],
  });

  assert.equal(state.status, "strong");
  assert.equal(state.blockedCount, 0);
  assert.equal(state.items.find((item) => item.id === "gmail_vendor_reply_sync")?.status, "matched");
  assert.equal(state.items.find((item) => item.id === "booked_vendor_timeline_sync")?.status, "matched");
});

test("background automation task items make blocked automation gaps actionable", () => {
  const coverage = buildWeddingBackgroundAutomationCoverageState({
    guestTracking: guests,
    budgetTracking: budget,
    seatingPlan: seating,
  });
  const tasks = buildWeddingBackgroundAutomationTaskItems({
    backgroundAutomationCoverage: coverage,
    metadata: {
      wedding_plan_id: "wedding_plan:bg-auto",
      response_workspace_id: "response_workspace:bg-auto",
    },
  });

  assert.ok(tasks.some((task) => task.id === "wedding_background_automation:gmail_vendor_reply_sync"));
  assert.ok(tasks.some((task) =>
    (task.metadata as Record<string, unknown>).background_automation_task === true
    && (task.metadata as Record<string, unknown>).background_automation_id === "booked_vendor_timeline_sync"
  ));

  const deduped = buildWeddingBackgroundAutomationTaskItems({
    backgroundAutomationCoverage: coverage,
    existingTaskItems: [{
      id: "saved:gmail",
      title: "Saved Gmail task",
      kind: "vendor_coordination",
      metadata: { background_automation_id: "gmail_vendor_reply_sync" },
    }],
  });
  assert.equal(deduped.some((task) => task.id === "wedding_background_automation:gmail_vendor_reply_sync"), false);
});
