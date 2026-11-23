import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingRealityChangeRecoveryState } from "../src/lib/weddingRealityChangeRecoveryState.ts";

test("buildWeddingRealityChangeRecoveryState turns vendor cancellation into a recovery plan", () => {
  const state = buildWeddingRealityChangeRecoveryState({
    metadata: {
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: "response_workspace:harbour",
    },
    disruptionText: "The photographer cancelled this morning.",
    vendorName: "Northlight Studio",
    vendorCategory: "photographer",
    weddingDate: "2027-09-18",
    location: "Sydney NSW",
    contractText: "Deposit $1200. If the supplier cancels, the deposit is refundable within 14 days.",
    originalPreferenceText: "candid documentary photography, calm communication, eight hours",
    budgetLimit: 5_000,
    replacementCandidates: [
      {
        id: "vendor:aurora",
        label: "Aurora Documentary Weddings",
        availableOnDate: true,
        priceEstimate: 4_800,
        fitLabels: ["documentary", "calm communication"],
        sourceLabel: "Google Places",
      },
      {
        id: "vendor:lux",
        label: "Lux Editorial",
        availableOnDate: true,
        priceEstimate: 7_200,
        fitLabels: ["editorial"],
        sourceLabel: "Search result",
      },
      {
        id: "vendor:busy",
        label: "Already Booked Studio",
        availableOnDate: false,
        priceEstimate: 4_000,
      },
    ],
  });

  assert.equal(state.subtype, "vendor_cancelled");
  assert.equal(state.disruptionObject.kind, "wedding_disruption_event");
  assert.equal(state.disruptionObject.severity, "urgent");
  assert.equal(state.recoveryPlanObject.kind, "wedding_recovery_plan");
  assert.ok(state.recoveryPlanObject.references.some((ref) => ref.type === "responds_to"));
  assert.equal(state.contractEntitlement.depositAmount, 1200);
  assert.match(state.contractEntitlement.refundLabel ?? "", /refund/i);
  assert.ok(state.recoverySteps.some((step) => step.id === "review-contract" && step.status === "needs_review"));
  assert.equal(state.shortlist.length, 2);
  assert.equal(state.shortlist[0]?.label, "Aurora Documentary Weddings");
  assert.equal(state.shortlist[0]?.budgetLabel, "Within stated budget");
  assert.match(state.decisionNeededLabel, /Choose one replacement photographer/i);
  assert.match(state.approvalGateLabel, /explicit approval/i);
  assert.equal(state.a2ui.kind, "wedding_recovery_plan");
});

test("buildWeddingRealityChangeRecoveryState blocks external action until contract and requirements exist", () => {
  const state = buildWeddingRealityChangeRecoveryState({
    disruptionText: "Something changed with the supplier.",
    vendorName: "Unknown Supplier",
    vendorCategory: "florist",
  });

  assert.equal(state.subtype, "unknown");
  assert.equal(state.contractEntitlement.depositAmount, null);
  assert.ok(state.recoverySteps.some((step) => step.id === "review-contract" && step.status === "blocked"));
  assert.ok(state.recoverySteps.some((step) => step.id === "recover-original-requirements" && step.status === "blocked"));
  assert.deepEqual(state.shortlist, []);
  assert.match(state.decisionNeededLabel, /Confirm the missing florist requirements/i);
});
