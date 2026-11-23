import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingSeatingAlternativeResults,
  buildWeddingSeatingOptimizationResult,
  compactWeddingSeatingOptimizationResults,
  weddingSeatingOptimizationResultFromAfpMessage,
  weddingSeatingOptimizationResultToAfpMessage,
  type WeddingSeatingPersonNode,
  type WeddingSeatingTableNode,
} from "@/lib/weddingSeatingOptimizationState";

const tables: WeddingSeatingTableNode[] = [
  {
    id: "table-1",
    label: "Table 1",
    capacity: 10,
    accessible: false,
    distanceToExitMeters: 21,
    distanceToSpeakerMeters: 4,
  },
  {
    id: "table-3",
    label: "Table 3",
    capacity: 10,
    accessible: true,
    distanceToExitMeters: 8,
    distanceToSpeakerMeters: 19,
  },
];

test("buildWeddingSeatingOptimizationResult seats mobility and hearing needs at accessible quiet tables", () => {
  const people: WeddingSeatingPersonNode[] = [
    {
      id: "aunt-lin",
      label: "Aunt Lin",
      familyId: "chen-family",
      languages: ["Mandarin"],
    },
    {
      id: "grandma-chen",
      label: "Grandma Chen",
      familyId: "chen-family",
      relationshipLabel: "bride grandmother",
      languages: ["Mandarin"],
      accessibilityNeeds: ["mobility", "hearing"],
      preferences: ["quiet"],
    },
  ];

  const result = buildWeddingSeatingOptimizationResult({ people, tables });
  const grandma = result.assignments.find((assignment) => assignment.personId === "grandma-chen");

  assert.equal(grandma?.tableId, "table-3");
  assert.equal(result.hardViolations.length, 0);
  assert.ok(grandma?.reasonLabels.some((label) => /mobility/i.test(label)));
  assert.ok(result.softSignals.some((signal) => /shares a language/i.test(signal.reasonLabel)));
  assert.ok(result.explanationLabels.some((label) => /No hard seating rule/i.test(label)));
});

test("buildWeddingSeatingOptimizationResult keeps known conflicts at different tables", () => {
  const people: WeddingSeatingPersonNode[] = [
    {
      id: "mum",
      label: "Mum",
      familyId: "family-a",
    },
    {
      id: "uncle-david",
      label: "Uncle David",
      familyId: "family-a",
      conflictPersonIds: ["mum"],
      preferAwayFromIds: ["mum"],
    },
  ];

  const result = buildWeddingSeatingOptimizationResult({ people, tables });
  const mum = result.assignments.find((assignment) => assignment.personId === "mum");
  const david = result.assignments.find((assignment) => assignment.personId === "uncle-david");

  assert.notEqual(mum?.tableId, david?.tableId);
  assert.equal(result.hardViolations.length, 0);
});

test("buildWeddingSeatingOptimizationResult respects capacity before soft fit", () => {
  const result = buildWeddingSeatingOptimizationResult({
    tables: [{ id: "small", label: "Small table", capacity: 1 }],
    people: [
      { id: "alex", label: "Alex" },
      { id: "sam", label: "Sam" },
    ],
  });

  assert.equal(result.assignments.length, 2);
  assert.ok(result.hardViolations.some((violation) => violation.type === "table_capacity"));
  assert.equal(result.applyLabel, "Review before applying");
});

test("buildWeddingSeatingOptimizationResult seats children with guardians when possible", () => {
  const result = buildWeddingSeatingOptimizationResult({
    tables,
    people: [
      { id: "parent", label: "Parent Lee", householdId: "lee" },
      {
        id: "child",
        label: "Child Lee",
        householdId: "lee",
        ageBand: "child",
        childGuardianIds: ["parent"],
      },
    ],
  });
  const parent = result.assignments.find((assignment) => assignment.personId === "parent");
  const child = result.assignments.find((assignment) => assignment.personId === "child");

  assert.equal(child?.tableId, parent?.tableId);
  assert.equal(result.hardViolations.length, 0);
  assert.ok(child?.reasonLabels.some((label) => /guardian/i.test(label)));
});

test("buildWeddingSeatingOptimizationResult flags socially isolated guests", () => {
  const result = buildWeddingSeatingOptimizationResult({
    tables: [{ id: "table-9", label: "Table 9", capacity: 10 }],
    people: [
      { id: "sophie", label: "Sophie", languages: ["English"], socialGroups: ["uni"] },
      { id: "jamie", label: "Jamie", languages: ["French"], socialGroups: ["work"] },
    ],
  });

  assert.ok(result.proactiveIssueLabels.some((label) => /Sophie.*no clear connection/i.test(label)));
});

test("buildWeddingSeatingAlternativeResults returns distinct reviewable drafts", () => {
  const alternatives = buildWeddingSeatingAlternativeResults({
    tables: [
      { id: "table-1", label: "Table 1", capacity: 2 },
      { id: "table-2", label: "Table 2", capacity: 2 },
      { id: "table-3", label: "Table 3", capacity: 2 },
    ],
    people: [
      { id: "alex", label: "Alex" },
      { id: "sam", label: "Sam" },
      { id: "casey", label: "Casey" },
    ],
    count: 2,
  });
  const fingerprints = alternatives.map((result) => result.assignments.map((assignment) => `${assignment.personId}:${assignment.tableId}`).join("|"));

  assert.equal(alternatives.length, 2);
  assert.equal(new Set(fingerprints).size, 2);
  assert.match(alternatives[0]?.explanationLabels[0] ?? "", /Alternative 1/i);
});

test("compactWeddingSeatingOptimizationResults keeps the latest copy of each distinct draft", () => {
  const first = buildWeddingSeatingOptimizationResult({
    tables,
    people: [{ id: "alex", label: "Alex" }],
  });
  const duplicateLater = { ...first, savedAt: "2026-09-27T00:00:00.000Z" };
  const different = buildWeddingSeatingOptimizationResult({
    tables,
    tableOrderPreferenceIds: ["table-3", "table-1"],
    people: [{ id: "alex", label: "Alex" }],
  });
  const compacted = compactWeddingSeatingOptimizationResults([first, different, duplicateLater]);

  assert.equal(compacted.length, 2);
  assert.equal(compacted.at(-1)?.savedAt, "2026-09-27T00:00:00.000Z");
  assert.equal(compacted.at(-1)?.fingerprint, first.fingerprint);
});

test("weddingSeatingOptimizationResultToAfpMessage emits ledger, topology tags, and typed seating references", () => {
  const result = buildWeddingSeatingOptimizationResult({
    tables,
    people: [
      { id: "aunt-lin", label: "Aunt Lin", familyId: "chen-family", languages: ["Mandarin"] },
      {
        id: "grandma-chen",
        label: "Grandma Chen",
        familyId: "chen-family",
        languages: ["Mandarin"],
        accessibilityNeeds: ["mobility"],
      },
    ],
  });
  const message = weddingSeatingOptimizationResultToAfpMessage({
    result,
    metadata: {
      weddingPlanId: "plan-1",
      responseWorkspaceId: "workspace-1",
      supertags: ["custom:wedding"],
    },
    createdAt: "2026-09-26T00:00:00.000Z",
  });

  assert.equal(message.type, "ledger");
  assert.equal(message.kind, "wedding_seating_optimization");
  assert.ok(message.supertags?.includes("topology:wedding_guest_graph"));
  assert.ok(message.supertags?.includes("decisionos:wedding_seating"));
  assert.ok(message.references?.some((reference) => reference.type === "seats_person_at_table" && reference.target === "grandma-chen"));
  assert.equal(message.metadata?.e2ee_required, true);
  assert.equal(message.metadata?.semantic_kind, "wedding_comparison");
  assert.equal(message.content.semantic_object.kind, "wedding_comparison");
  assert.equal(message.content.semantic_object.comparison.title, "Seating draft");
  assert.ok(message.content.semantic_tags.includes("wedding_seating_optimization"));
  assert.equal(message.views[0]?.format, "a2ui");
  assert.equal(message.views[0]?.content.semantic_object.kind, "wedding_comparison");
  assert.equal(Array.isArray(message.content.assignments), true);
  const restored = weddingSeatingOptimizationResultFromAfpMessage(message);
  assert.equal(restored?.assignments.length, result.assignments.length);
  assert.equal(restored?.assignments.find((assignment) => assignment.personId === "grandma-chen")?.personLabel, "Grandma Chen");
  assert.deepEqual(restored?.explanationLabels, result.explanationLabels);
  assert.equal(restored?.semanticKind, "wedding_comparison");
  assert.equal(restored?.semanticObject?.comparison?.columns[0]?.label, "Table");
});
