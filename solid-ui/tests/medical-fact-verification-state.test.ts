import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMedicalFactVerificationButtonState,
  buildMedicalFactVerificationRecord,
  buildMedicalFactVerificationRequest,
  buildMedicalFactVerificationSearchEntries,
  findMedicalFactVerificationRecord,
  loadMedicalFactVerificationRecords,
  MEDICAL_FACT_VERIFICATION_RECORDS_KEY,
  saveMedicalFactVerificationRecord,
  searchMedicalFactVerificationRecords,
  scoreMedicalFactVerification,
} from "../src/lib/medicalFactVerificationState.ts";

function storageFixture(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

test("medical fact verification button is gated to medical students and study material", () => {
  const eligible = buildMedicalFactVerificationButtonState({
    userIsMedicalStudent: true,
    selectedText: "Metformin can rarely cause lactic acidosis in renal impairment.",
    courseTag: "course:med101",
    chapterTag: "chapter:endocrine-pharm",
    sourceLabels: ["Endocrine pharmacology lecture"],
  });
  const notMedicalStudent = buildMedicalFactVerificationButtonState({
    userIsMedicalStudent: false,
    selectedText: "Metformin can rarely cause lactic acidosis.",
    courseTag: "course:med101",
  });
  const personal = buildMedicalFactVerificationButtonState({
    userIsMedicalStudent: true,
    selectedText: "I have chest pain and fever, what should I do?",
  });

  assert.equal(eligible.visible, true);
  assert.equal(eligible.label, "Verify facts");
  assert.ok(eligible.targetId?.startsWith("medical_fact:"));
  assert.deepEqual(eligible.scopeLabels.slice(0, 3), [
    "course:med101",
    "chapter:endocrine-pharm",
    "Endocrine pharmacology lecture",
  ]);
  assert.equal(notMedicalStudent.visible, false);
  assert.match(notMedicalStudent.disabledReason ?? "", /medical student mode/i);
  assert.equal(personal.visible, false);
  assert.match(personal.disabledReason ?? "", /personal medical history/i);
});

test("medical fact verification request keeps source and token budgets bounded", () => {
  const request = buildMedicalFactVerificationRequest({
    userIsMedicalStudent: true,
    targetKind: "image",
    imageOcrText: "Diagram note: ACE inhibitors reduce afterload in HFrEF management.",
    courseTag: "course:med101",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    sourceLocators: ["slide 12"],
    depth: "standard",
  });

  assert.equal(request?.targetKind, "image");
  assert.equal(request?.sourceBudget, 3);
  assert.equal(request?.tokenBudgetLabel, "bounded cross-check");
  assert.ok(request?.promptLines.some((line) => /Do not perform open-ended browsing/i.test(line)));
  assert.ok(request?.promptLines.some((line) => /absolute wording/i.test(line)));
  assert.ok(request?.scopeLabels.includes("slide 12"));
});

test("medical fact verification scoring rewards multiple authoritative supporting sources", () => {
  const high = scoreMedicalFactVerification({
    nowYear: 2026,
    flags: [],
    sourceEvidence: [
      { label: "Course textbook", tier: "student_source", locator: "p. 212", year: 2025, supportsClaim: true },
      { label: "Guideline review", tier: "peer_reviewed_review", locator: "table 2", year: 2024, supportsClaim: true },
      { label: "UMLS term", tier: "ontology", locator: "C0025598", year: null, supportsClaim: true },
    ],
  });
  const low = scoreMedicalFactVerification({
    nowYear: 2026,
    flags: ["absolute statement"],
    sourceEvidence: [
      { label: "Unknown snippet", tier: "unknown", locator: null, year: null, supportsClaim: true },
      { label: "Conflicting source", tier: "trusted_reference", locator: "warning", year: 2023, supportsClaim: false },
    ],
  });

  assert.equal(high.status, "verified");
  assert.equal(high.confidenceLabel, "high");
  assert.ok(high.confidenceScore >= 75);
  assert.equal(low.status, "needs_review");
  assert.equal(low.confidenceLabel, "low");
});

test("medical fact verification records persist and can be found by selection", () => {
  const storage = storageFixture();
  const input = {
    userIsMedicalStudent: true,
    selectedText: "Metformin can rarely cause lactic acidosis in renal impairment.",
    courseTag: "course:med101",
    chapterTag: "chapter:endocrine-pharm",
    sourceLabels: ["Endocrine pharmacology lecture"],
  };
  const request = buildMedicalFactVerificationRequest(input);
  assert.ok(request);

  const record = buildMedicalFactVerificationRecord({
    targetKind: "passage",
    targetText: request!.targetText,
    scopeLabels: request!.scopeLabels,
    verificationDepth: request!.depth,
    summary: "Supported by lecture and trusted review; rare-risk wording retained.",
    sourceEvidence: [
      { label: "Endocrine pharmacology lecture", tier: "student_source", locator: "slide 44", year: 2026, supportsClaim: true },
      { label: "Trusted pharmacology review", tier: "peer_reviewed_review", locator: "adverse effects", year: 2024, supportsClaim: true },
    ],
    flags: ["probabilistic risk retained"],
    now: 1_000,
  });
  assert.ok(record);

  const saved = saveMedicalFactVerificationRecord(record!, storage);
  const loaded = loadMedicalFactVerificationRecords(storage);
  const found = findMedicalFactVerificationRecord(input, loaded);
  const raw = storage.getItem(MEDICAL_FACT_VERIFICATION_RECORDS_KEY);

  assert.equal(saved.id, request?.targetId);
  assert.equal(loaded.length, 1);
  assert.equal(found?.id, request?.targetId);
  assert.equal(found?.summary, "Supported by lecture and trusted review; rare-risk wording retained.");
  assert.ok(raw?.includes("Endocrine pharmacology lecture"));
});

test("medical fact verification records are searchable by status, source, and scope", () => {
  const record = buildMedicalFactVerificationRecord({
    targetKind: "passage",
    targetText: "ACE inhibitors are contraindicated in pregnancy.",
    scopeLabels: ["course:med101", "chapter:heart-failure", "system:cardiovascular"],
    verificationDepth: "standard",
    summary: "Verified for exam use with lecture and review source.",
    sourceEvidence: [
      { label: "Heart failure lecture", tier: "student_source", locator: "slide 24", year: 2026, supportsClaim: true },
      { label: "Pharmacology review", tier: "peer_reviewed_review", locator: "contraindications", year: 2024, supportsClaim: true },
      { label: "Ontology term", tier: "ontology", locator: "contraindicated finding", year: null, supportsClaim: true },
    ],
    flags: ["absolute wording reviewed"],
    now: 2_000,
  });
  assert.ok(record);

  const [entry] = buildMedicalFactVerificationSearchEntries([record!]);
  assert.equal(entry?.subtitle, "verified - high confidence - 3 sources");
  assert.ok(entry?.labels.includes("verified"));
  assert.ok(entry?.labels.includes("chapter:heart-failure"));
  assert.ok(entry?.labels.includes("peer_reviewed_review"));
  assert.deepEqual(
    searchMedicalFactVerificationRecords([record!], "pregnancy heart-failure peer_reviewed_review").map((item) => item.id),
    [record!.id],
  );
  assert.deepEqual(searchMedicalFactVerificationRecords([record!], "renal").map((item) => item.id), []);
});
