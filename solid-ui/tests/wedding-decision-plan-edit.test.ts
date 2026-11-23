import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDecisionApplicability,
  customPlanDecisionToAfpSendInput,
  decisionApplicabilityToAfpSendInput,
  decisionPlanEditStateFromMessages,
  directCausalDecisionFollowUps,
  isOptionalServiceDecision,
  loadDecisionPlanEditState,
  newCustomPlanDecision,
  notApplicableDecisionIds,
  saveDecisionPlanEditState,
} from "../src/lib/decisionPlanEditState";

const scope = {
  kind: "wedding" as const,
  key: "workspace-1",
  accountId: "couple-a",
  weddingPlanId: "plan-1",
  responseWorkspaceId: "workspace-1",
};

test("not applicable is a durable choice that suppresses only declared causal follow-ups", () => {
  const items = [
    { id: "hair", title: "Hire a hairstylist" },
    { id: "trial", title: "Book a hair trial", actionMetadata: { parent_decision_id: "hair" } },
    { id: "ready-time", title: "What time do we need to be ready?" },
  ];
  const affected = directCausalDecisionFollowUps(items, "hair");
  assert.deepEqual(affected, [{ id: "trial", title: "Book a hair trial" }]);
  const change = {
    decisionId: "hair", title: "Hire a hairstylist", state: "not_applicable" as const,
    affectedDecisionIds: affected.map((item) => item.id), affectedDecisionTitles: affected.map((item) => item.title),
    changedAt: "2026-11-23T10:00:00.000Z",
  };
  const state = applyDecisionApplicability({ applicability: [], customDecisions: [] }, change);
  assert.deepEqual([...notApplicableDecisionIds(state)].sort(), ["hair", "trial"]);
  assert.equal(notApplicableDecisionIds(state).has("ready-time"), false);
  const input = decisionApplicabilityToAfpSendInput(scope, change);
  assert.equal(input.kind, "decision_plan_applicability");
  assert.equal((input.content as Record<string, unknown>).preserves_existing_artifacts, true);
  assert.equal((input.content as Record<string, unknown>).resurface_policy, "restore_only");
});

test("restore is a later ledger choice and never silently resurrects a decision", () => {
  const messages = [
    { kind: "decision_plan_applicability", content: { kind: "decision_plan_applicability", scope_kind: "wedding", scope_key: "workspace-1", decision_id: "hair", title: "Hire a hairstylist", requested_state: "not_applicable", affected_decision_ids: ["trial"], affected_decision_titles: ["Book a hair trial"], changed_at: "2026-11-23T10:00:00.000Z" } },
    { kind: "decision_plan_applicability", content: { kind: "decision_plan_applicability", scope_kind: "wedding", scope_key: "workspace-1", decision_id: "hair", title: "Hire a hairstylist", requested_state: "restored", affected_decision_ids: [], affected_decision_titles: [], changed_at: "2026-11-23T11:00:00.000Z" } },
  ];
  const state = decisionPlanEditStateFromMessages(messages as never[], scope);
  assert.equal(state.applicability[0].state, "restored");
  assert.equal(notApplicableDecisionIds(state).size, 0);
});

test("custom decisions require only a title and retain optional choices, due date, note and parent", () => {
  const decision = newCustomPlanDecision({
    title: "Who will cue the ceremony music?",
    choices: ["A friend", "The venue coordinator"],
    dueAt: "2027-03-01T12:00:00.000Z",
    note: "Confirm after the venue walkthrough",
    parentDecisionId: "celebrant-booked",
    parentDecisionTitle: "Book our celebrant",
    nowIso: "2026-11-23T12:00:00.000Z",
  });
  const input = customPlanDecisionToAfpSendInput(scope, decision);
  const content = input.content as Record<string, unknown>;
  assert.deepEqual(content.choices, ["A friend", "The venue coordinator"]);
  assert.equal(content.parent_decision_id, "celebrant-booked");
  assert.equal(content.suggested_next_task_requires_approval, true);
  assert.equal(input.thread_id, "wedding_decision:workspace-1");
});

test("optional-service recognition is narrow and does not remove independent timing work", () => {
  assert.equal(isOptionalServiceDecision("Do we want professional hair styling?"), true);
  assert.equal(isOptionalServiceDecision("What time do we need to be ready?"), false);
  assert.equal(isOptionalServiceDecision("Confirm the legal notice deadline"), false);
});

test("optimistic plan state survives account-scoped local reload while AFP catches up", () => {
  const values = new Map<string, string>();
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } } });
  try {
    const custom = newCustomPlanDecision({ title: "Choose ceremony music cue", nowIso: "2026-11-23T12:30:00.000Z" });
    const state = {
      applicability: [{ decisionId: "hair", title: "Hire a hairstylist", state: "not_applicable" as const, affectedDecisionIds: [], affectedDecisionTitles: [], changedAt: "2026-11-23T12:00:00.000Z" }],
      customDecisions: [custom],
    };
    saveDecisionPlanEditState(scope, state);
    assert.deepEqual(loadDecisionPlanEditState(scope), state);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});
