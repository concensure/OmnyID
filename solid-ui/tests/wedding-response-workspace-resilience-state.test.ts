import assert from "node:assert/strict";
import test from "node:test";

import {
  weddingPreferenceConflictToAfpMessage,
} from "../src/lib/weddingPreferenceConflictAfpProjectionState.ts";
import { buildWeddingPreferenceConflictsFromConstraintMessages } from "../src/lib/weddingPreferenceConflictConstraintAdapter.ts";
import { buildWeddingPreferenceConflictState } from "../src/lib/weddingPreferenceConflictState.ts";
import {
  weddingRealityChangeRecoveryToAfpMessage,
} from "../src/lib/weddingRealityChangeRecoveryAfpProjectionState.ts";
import { buildWeddingRealityChangeRecoveryState } from "../src/lib/weddingRealityChangeRecoveryState.ts";
import { buildWeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";
import { weddingResponseWorkspaceMetadata as metadata } from "./wedding-response-workspace-fixtures.ts";
import type { AfpMessage } from "../src/lib/api.ts";

function preferenceConstraint(
  id: string,
  person: string,
  choice: string,
  second: number,
  supersedes: string | null = null,
): AfpMessage {
  const timestamp = `2026-10-19T00:00:0${second}Z`;
  return {
    protocol: "afp-v1", id: `message-${id}`, thread_id: "planning_constraints:workspace", from: "user://owner",
    to: ["agent://planning-intelligence"], timestamp, type: "ledger", kind: "planning_constraint", subtype: "planning_constraint",
    content: { schema_version: "planning.constraint_ledger_message.v1", constraint: {
      schema_version: "planning.constraint.v1", constraint_id: id, template_id: "wedding_planner",
      plan_id: metadata.wedding_plan_id, subject_ref: { kind: "person", id: person }, kind: "aesthetic_preference",
      operator: "prefers", value: { type: "enum", value: choice, vocabulary: "wedding_style" },
      strength: "strong", authority: "user", privacy: "couple_private", source_ref: `source-${id}`,
      source_anchor: { message_id: `source-${id}`, source_version_id: `source-${id}-v1`, locator: "content.remark", exact_excerpt: `Private ${choice} reason` },
      observed_at: timestamp, effective_window: null, status: "confirmed", supersedes,
    } },
    metadata: { plan_id: metadata.wedding_plan_id, privacy_scope: "tenant_private", e2ee_required: true, payload_fingerprint: "a".repeat(64), store: true }, store_in_relational: true,
  } as AfpMessage;
}

function conflictMessage() {
  return weddingPreferenceConflictToAfpMessage(buildWeddingPreferenceConflictState({
    metadata,
    decisionArea: "wedding scale",
    preferences: [
      { personLabel: "Claire", preferenceLabel: "40 guests", underlyingValue: "meaningful interaction", strength: 0.91 },
      { personLabel: "James", preferenceLabel: "120 guests", underlyingValue: "family inclusion", strength: 0.88 },
    ],
  }), "2026-09-27T00:00:00.000Z");
}

function recoveryMessage() {
  return weddingRealityChangeRecoveryToAfpMessage(buildWeddingRealityChangeRecoveryState({
    metadata,
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
  }), "2026-09-27T00:02:00.000Z");
}

test("buildWeddingResponseWorkspaceViewState exposes resilience display cards from AFP messages", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    afpMessages: [conflictMessage(), recoveryMessage()],
  });

  assert.equal(state.resilience.cards.length, 2);
  assert.equal(state.resilience.hasUrgentItem, true);
  assert.ok(state.resilience.cards.some((card) => card.primaryAction.label === "Review values"));
  assert.ok(state.resilience.cards.some((card) => card.primaryAction.label === "Compare replacements"));
  assert.ok(state.resilience.cards.every((card) => !/afp|ledger|projection/i.test([
    card.title,
    card.eyebrowLabel,
    card.detailLabel,
    card.statusLabel,
    card.evidenceLabel,
    card.primaryAction.label,
    card.secondaryAction.label,
  ].join(" "))));
});

test("buildWeddingResponseWorkspaceViewState keeps resilience quiet without AFP resilience messages", () => {
  const state = buildWeddingResponseWorkspaceViewState({ metadata });

  assert.deepEqual(state.resilience.cards, []);
  assert.equal(state.resilience.reviewAllAction.enabled, false);
  assert.match(state.resilience.emptyLabel ?? "", /one clear next step/i);
});

test("buildWeddingResponseWorkspaceViewState derives one conflict and queue item from canonical constraints", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    afpMessages: [
      preferenceConstraint("constraint-1", "person:partner_0001", "modern", 1),
      preferenceConstraint("constraint-2", "person:partner_0002", "romantic", 2),
    ],
    nowIso: "2026-10-19T00:01:00Z",
  });

  assert.equal(state.resilience.cards.length, 1);
  assert.equal(state.resilience.cards[0]?.primaryAction.label, "Review values");
  assert.equal(state.resilience.cards[0]?.lifecycleActions.length, 0);
  const conflictItems = state.projectionQueue?.queue.items.filter((item) => item.kind === "preference_conflict") ?? [];
  assert.equal(conflictItems.length, 1);
  assert.equal(conflictItems[0]?.status, "pending");
  assert.equal(JSON.stringify(state.resilience).includes("Private modern reason"), false);
  assert.equal(JSON.stringify(state.projectionQueue).includes("Private romantic reason"), false);
});

test("persisted conflict revisions deduplicate until a constraint successor reopens review", () => {
  const initialConstraints = [
    preferenceConstraint("constraint-1", "person:partner_0001", "modern", 1),
    preferenceConstraint("constraint-2", "person:partner_0002", "romantic", 2),
  ];
  const [initialConflict] = buildWeddingPreferenceConflictsFromConstraintMessages({
    metadata,
    messages: initialConstraints,
  });
  assert.ok(initialConflict);
  const persisted = weddingPreferenceConflictToAfpMessage(initialConflict, "2026-10-19T00:00:03Z");

  const replayed = buildWeddingResponseWorkspaceViewState({
    metadata,
    afpMessages: [...initialConstraints, persisted],
    nowIso: "2026-10-19T00:01:00Z",
  });
  assert.equal(replayed.projectionQueue?.queue.items.filter((item) => item.kind === "preference_conflict").length, 0);
  assert.equal(replayed.resilience.cards[0]?.lifecycleActions.length, 2);

  const changed = buildWeddingResponseWorkspaceViewState({
    metadata,
    afpMessages: [
      ...initialConstraints,
      preferenceConstraint("constraint-3", "person:partner_0002", "industrial", 4, "constraint-2"),
      persisted,
    ],
    nowIso: "2026-10-19T00:01:00Z",
  });
  assert.equal(changed.projectionQueue?.queue.items.filter((item) => item.kind === "preference_conflict").length, 1);
  assert.equal(changed.resilience.cards[0]?.lifecycleActions.length, 0);
});
