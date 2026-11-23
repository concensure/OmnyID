import assert from "node:assert/strict";
import test from "node:test";

import {
  applyWeddingSeatingConstraintAction,
  buildWeddingSeatingConstraintActionFromInstruction,
  runWeddingSeatingConstraintInstruction,
  weddingSeatingConstraintActionToAfpMessage,
} from "@/lib/weddingSeatingConstraintActionState";
import type { WeddingSeatingPersonNode, WeddingSeatingTableNode } from "@/lib/weddingSeatingOptimizationState";

const people: WeddingSeatingPersonNode[] = [
  { id: "mum", label: "Mum", familyId: "family" },
  { id: "uncle-david", label: "Uncle David", familyId: "family" },
  { id: "andrew", label: "Andrew", socialGroups: ["golf group"] },
  { id: "sophie", label: "Sophie", socialGroups: ["university friends"] },
  { id: "claire", label: "Claire", socialGroups: ["university friends"] },
];

const tables: WeddingSeatingTableNode[] = [
  { id: "table-1", label: "Table 1", capacity: 2, accessible: true, distanceToSpeakerMeters: 6 },
  { id: "table-8", label: "Table 8", capacity: 4, accessible: true, distanceToSpeakerMeters: 18 },
];

test("buildWeddingSeatingConstraintActionFromInstruction parses keep-apart instructions", () => {
  const action = buildWeddingSeatingConstraintActionFromInstruction({
    instruction: "Move Uncle David away from Mum. They don't get along.",
    people,
  });

  assert.equal(action?.kind, "keep_apart");
  assert.equal(action?.primaryPersonId, "uncle-david");
  assert.equal(action?.relatedPersonId, "mum");
  assert.match(action?.statusLabel ?? "", /Uncle David and Mum/i);
});

test("applyWeddingSeatingConstraintAction adds reciprocal hard conflict links", () => {
  const action = buildWeddingSeatingConstraintActionFromInstruction({
    instruction: "Move Uncle David away from Mum.",
    people,
  });
  const updated = applyWeddingSeatingConstraintAction(people, action);

  assert.ok(updated.find((person) => person.id === "uncle-david")?.conflictPersonIds?.includes("mum"));
  assert.ok(updated.find((person) => person.id === "mum")?.conflictPersonIds?.includes("uncle-david"));
});

test("runWeddingSeatingConstraintInstruction reruns the deterministic optimizer", () => {
  const result = runWeddingSeatingConstraintInstruction({
    instruction: "Move Uncle David away from Mum.",
    people: people.slice(0, 2),
    tables,
  });
  const mum = result.optimization.assignments.find((assignment) => assignment.personId === "mum");
  const david = result.optimization.assignments.find((assignment) => assignment.personId === "uncle-david");

  assert.equal(result.action?.kind, "keep_apart");
  assert.notEqual(mum?.tableId, david?.tableId);
  assert.equal(result.optimization.hardViolations.length, 0);
});

test("runWeddingSeatingConstraintInstruction can keep a social group together", () => {
  const result = runWeddingSeatingConstraintInstruction({
    instruction: "Try to keep university friends together.",
    people,
    tables,
  });
  const sophie = result.people.find((person) => person.id === "sophie");

  assert.equal(result.action?.kind, "social_group_together");
  assert.ok(sophie?.preferTogetherWithIds?.includes("claire"));
});

test("runWeddingSeatingConstraintInstruction can add a quiet preference", () => {
  const result = runWeddingSeatingConstraintInstruction({
    instruction: "Seat Sophie somewhere quiet.",
    people,
    tables,
  });
  const sophie = result.people.find((person) => person.id === "sophie");

  assert.equal(result.action?.kind, "prefer_quiet");
  assert.ok(sophie?.preferences?.includes("quiet"));
});

test("weddingSeatingConstraintActionToAfpMessage emits a private ledger constraint", () => {
  const action = buildWeddingSeatingConstraintActionFromInstruction({
    instruction: "Move Uncle David away from Mum.",
    people,
  });
  assert.ok(action);
  const message = weddingSeatingConstraintActionToAfpMessage({
    action,
    metadata: { weddingPlanId: "plan-1", responseWorkspaceId: "workspace-1" },
    createdAt: "2026-09-26T00:00:00.000Z",
  });

  assert.equal(message.type, "ledger");
  assert.equal(message.kind, "wedding_seating_constraint");
  assert.ok(message.supertags?.includes("topology:wedding_guest_graph"));
  assert.ok(message.supertags?.includes("decisionos:wedding_seating"));
  assert.equal(message.metadata?.e2ee_required, true);
  assert.ok(message.references?.some((reference) => reference.type === "seating_constraint_primary_person" && reference.target === "uncle-david"));
  assert.equal(message.views[0]?.format, "a2ui");
});
