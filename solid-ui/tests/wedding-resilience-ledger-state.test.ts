import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api.ts";
import {
  weddingPreferenceConflictToAfpMessage,
} from "../src/lib/weddingPreferenceConflictAfpProjectionState.ts";
import { buildWeddingPreferenceConflictState } from "../src/lib/weddingPreferenceConflictState.ts";
import {
  weddingRealityChangeRecoveryToAfpMessage,
} from "../src/lib/weddingRealityChangeRecoveryAfpProjectionState.ts";
import { buildWeddingRealityChangeRecoveryState } from "../src/lib/weddingRealityChangeRecoveryState.ts";
import {
  buildWeddingResilienceLedgerState,
} from "../src/lib/weddingResilienceLedgerState.ts";

function conflictMessage(workspaceId = "response_workspace:harbour", timestamp = "2026-09-27T00:00:00.000Z"): AfpMessage {
  return weddingPreferenceConflictToAfpMessage(buildWeddingPreferenceConflictState({
    metadata: {
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: workspaceId,
    },
    decisionArea: "wedding scale",
    preferences: [
      { personLabel: "Claire", preferenceLabel: "40 guests", underlyingValue: "meaningful interaction", strength: 0.91 },
      { personLabel: "James", preferenceLabel: "120 guests", underlyingValue: "family inclusion", strength: 0.88 },
    ],
  }), timestamp);
}

function alignedMessage(): AfpMessage {
  return weddingPreferenceConflictToAfpMessage(buildWeddingPreferenceConflictState({
    metadata: {
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: "response_workspace:harbour",
    },
    decisionArea: "ceremony tone",
    preferences: [
      { personLabel: "Claire", preferenceLabel: "relaxed", underlyingValue: "comfort", strength: 0.7 },
      { personLabel: "James", preferenceLabel: "warm", underlyingValue: "comfort", strength: 0.75 },
    ],
  }), "2026-09-27T00:01:00.000Z");
}

function recoveryMessage(
  workspaceId = "response_workspace:harbour",
  timestamp = "2026-09-27T00:02:00.000Z",
): AfpMessage {
  return weddingRealityChangeRecoveryToAfpMessage(buildWeddingRealityChangeRecoveryState({
    metadata: {
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: workspaceId,
    },
    disruptionText: "The photographer cancelled.",
    vendorName: "Northlight Studio",
    vendorCategory: "photographer",
    contractText: "Deposit $1200 refundable if supplier cancels.",
    originalPreferenceText: "candid documentary photography",
    budgetLimit: 5_000,
    replacementCandidates: [{
      id: "vendor:aurora",
      label: "Aurora Documentary Weddings",
      availableOnDate: true,
      priceEstimate: 4_800,
      fitLabels: ["documentary"],
      sourceLabel: "Google Places",
    }],
  }), timestamp);
}

test("buildWeddingResilienceLedgerState reads AFP messages and scopes them by workspace", () => {
  const state = buildWeddingResilienceLedgerState({
    responseWorkspaceId: "response_workspace:harbour",
    messages: [
      conflictMessage(),
      recoveryMessage(),
      recoveryMessage("response_workspace:other", "2026-09-27T00:03:00.000Z"),
    ],
  });

  assert.equal(state.preferenceConflicts.length, 1);
  assert.equal(state.recoveryPlans.length, 1);
  assert.equal(state.attentionItems.length, 2);
  assert.ok(state.attentionItems.some((item) => item.actionLabel === "Review values"));
  assert.ok(state.attentionItems.some((item) => item.actionLabel === "Compare replacements"));
});

test("buildWeddingResilienceLedgerState dedupes newer conflict and recovery records", () => {
  const olderConflict = conflictMessage("response_workspace:harbour", "2026-09-27T00:00:00.000Z");
  const newerConflict = {
    ...conflictMessage("response_workspace:harbour", "2026-09-27T00:05:00.000Z"),
    id: "afp-newer-conflict",
  };
  const olderRecovery = recoveryMessage("response_workspace:harbour", "2026-09-27T00:01:00.000Z");
  const newerRecovery = {
    ...recoveryMessage("response_workspace:harbour", "2026-09-27T00:06:00.000Z"),
    id: "afp-newer-recovery",
  };

  const state = buildWeddingResilienceLedgerState({
    responseWorkspaceId: "response_workspace:harbour",
    messages: [olderConflict, olderRecovery, newerConflict, newerRecovery],
  });

  assert.equal(state.preferenceConflicts.length, 1);
  assert.equal(state.recoveryPlans.length, 1);
  assert.ok(state.attentionItems.some((item) => item.sourceMessageId === "afp-newer-conflict"));
  assert.ok(state.attentionItems.some((item) => item.sourceMessageId === "afp-newer-recovery"));
});

test("buildWeddingResilienceLedgerState ignores aligned, unrelated, and malformed messages", () => {
  const state = buildWeddingResilienceLedgerState({
    messages: [
      alignedMessage(),
      { ...conflictMessage(), subtype: "wedding_decision_selection" },
      { ...recoveryMessage(), content: { kind: "wedding_recovery_plan" } },
    ],
  });

  assert.equal(state.preferenceConflicts.length, 1);
  assert.equal(state.recoveryPlans.length, 0);
  assert.deepEqual(state.attentionItems, []);
  assert.equal(state.summaryLabel, "No partner conflicts or recovery plans need attention.");
});

test("buildWeddingResilienceLedgerState sets attention priority and practical labels", () => {
  const message = recoveryMessage();
  const state = buildWeddingResilienceLedgerState({ messages: [message] });
  const item = state.attentionItems[0];

  assert.equal(item?.kind, "recovery_plan");
  assert.equal(item?.priority, "urgent");
  assert.equal(item?.actionLabel, "Compare replacements");
  assert.ok(item?.metadataLabels.includes("Northlight Studio"));
  assert.equal(state.urgentCount, 1);
  assert.equal(state.summaryLabel, "1 urgent, 1 total wedding resilience item.");
});

test("buildWeddingResilienceLedgerState keeps a saved deferral quiet until expiry", () => {
  const initial = buildWeddingResilienceLedgerState({ messages: [conflictMessage()] });
  const item = initial.attentionItems[0]!;
  const fingerprint = [item.id, item.kind, "attention", "home", ...item.metadataLabels]
    .filter(Boolean).join("|").toLowerCase();
  const hidden = buildWeddingResilienceLedgerState({
    messages: [conflictMessage()],
    nowIso: "2026-10-20T00:00:00Z",
    decisionDeferrals: [{
      focusItemId: item.id,
      createdAt: "2026-10-19T00:00:00Z",
      staleAfterAt: "2026-10-26T00:00:00Z",
      dependencyFingerprint: fingerprint,
    }],
  });
  const resurfaced = buildWeddingResilienceLedgerState({
    messages: [conflictMessage()],
    nowIso: "2026-10-27T00:00:00Z",
    decisionDeferrals: hidden.preferenceConflicts.length ? [{
      focusItemId: item.id,
      createdAt: "2026-10-19T00:00:00Z",
      staleAfterAt: "2026-10-26T00:00:00Z",
      dependencyFingerprint: fingerprint,
    }] : [],
  });

  assert.equal(hidden.attentionItems.length, 0);
  assert.equal(hidden.preferenceConflicts.length, 1);
  assert.equal(resurfaced.attentionItems.length, 1);
});
