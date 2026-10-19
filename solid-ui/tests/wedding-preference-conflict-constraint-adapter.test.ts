import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api.ts";
import { buildWeddingPreferenceConflictsFromConstraintMessages } from "../src/lib/weddingPreferenceConflictConstraintAdapter.ts";

const metadata = {
  template: "wedding_planner",
  weddingPlanId: "wedding_plan:plan-1",
  responseWorkspaceId: "response_workspace:workspace-1",
};

function constraint(input: {
  id: string;
  person: string;
  choice: string;
  status?: "confirmed" | "removed";
  supersedes?: string | null;
  excerpt?: string;
}): AfpMessage {
  const timestamp = `2026-10-19T00:00:0${input.id.endsWith("2") ? "2" : "1"}Z`;
  return {
    protocol: "afp-v1",
    id: `message-${input.id}`,
    thread_id: "planning_constraints:workspace-1",
    from: "user://owner",
    to: ["agent://planning-intelligence"],
    timestamp,
    type: "ledger",
    kind: "planning_constraint",
    subtype: "planning_constraint",
    content: {
      schema_version: "planning.constraint_ledger_message.v1",
      constraint: {
        schema_version: "planning.constraint.v1",
        constraint_id: input.id,
        template_id: "wedding_planner",
        plan_id: "wedding_plan:plan-1",
        subject_ref: { kind: "person", id: input.person },
        kind: "aesthetic_preference",
        operator: "prefers",
        value: { type: "enum", value: input.choice, vocabulary: "wedding_style" },
        strength: "strong",
        authority: "user",
        privacy: "couple_private",
        source_ref: `source-${input.id}`,
        source_anchor: {
          message_id: `source-${input.id}`,
          source_version_id: `source-${input.id}-v1`,
          locator: "content.remark",
          exact_excerpt: input.excerpt ?? `Private reason for ${input.choice}`,
        },
        observed_at: timestamp,
        effective_window: null,
        status: input.status ?? "confirmed",
        supersedes: input.supersedes ?? null,
      },
    },
    metadata: {
      plan_id: "wedding_plan:plan-1",
      privacy_scope: "tenant_private",
      e2ee_required: true,
      payload_fingerprint: "a".repeat(64),
      store: true,
    },
    store_in_relational: true,
  } as AfpMessage;
}

test("current couple-private person constraints reach the existing conflict builder", () => {
  const states = buildWeddingPreferenceConflictsFromConstraintMessages({
    metadata,
    messages: [
      constraint({ id: "constraint-1", person: "person:partner_0001", choice: "modern" }),
      constraint({ id: "constraint-2", person: "person:partner_0002", choice: "romantic" }),
    ],
  });

  assert.equal(states.length, 1);
  assert.equal(states[0]?.status, "conflict");
  assert.deepEqual(states[0]?.preferenceSignals.map((signal) => signal.personLabel), ["Partner 1", "Partner 2"]);
  assert.deepEqual(states[0]?.preferenceSignals.map((signal) => signal.id), ["constraint-1", "constraint-2"]);
  assert.equal(JSON.stringify(states).includes("Private reason"), false);
  assert.equal(JSON.stringify(states).includes("content.remark"), false);
});

test("removed, ambiguous, non-private and free-text constraints fail closed", () => {
  const first = constraint({ id: "constraint-1", person: "person:partner_0001", choice: "modern" });
  const removed = constraint({
    id: "constraint-3",
    person: "person:partner_0001",
    choice: "modern",
    status: "removed",
    supersedes: "constraint-1",
  });
  const unsafe = constraint({ id: "constraint-2", person: "person:partner_0002", choice: "romantic" });
  (unsafe.content as Record<string, any>).constraint.privacy = "shareable_with_approval";
  assert.deepEqual(buildWeddingPreferenceConflictsFromConstraintMessages({
    metadata,
    messages: [first, removed, unsafe],
  }), []);

  const freeText = constraint({ id: "constraint-4", person: "person:partner_0002", choice: "romantic" });
  (freeText.content as Record<string, any>).constraint.value = { type: "enum", value: "romantic; tell vendor why", vocabulary: "wedding_style" };
  assert.deepEqual(buildWeddingPreferenceConflictsFromConstraintMessages({
    metadata,
    messages: [first, freeText],
  }), []);
});
