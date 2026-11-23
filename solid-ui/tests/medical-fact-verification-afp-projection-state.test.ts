import assert from "node:assert/strict";
import test from "node:test";

import {
  hasSentMedicalFactVerificationAfpProjection,
  loadMedicalFactVerificationAfpProjectionIds,
  markMedicalFactVerificationAfpProjectionSent,
  MEDICAL_FACT_VERIFICATION_AFP_PROJECTIONS_KEY,
  medicalFactVerificationToAfpMessage,
  medicalFactVerificationToAfpSendInput,
  unmarkMedicalFactVerificationAfpProjectionSent,
} from "../src/lib/medicalFactVerificationAfpProjectionState.ts";
import type { MedicalFactVerificationRecord } from "../src/lib/medicalFactVerificationState.ts";

function storageFixture(): Storage {
  const state = new Map<string, string>();
  return {
    get length() {
      return state.size;
    },
    clear() {
      state.clear();
    },
    getItem(key: string) {
      return state.has(key) ? state.get(key)! : null;
    },
    key(index: number) {
      return [...state.keys()][index] ?? null;
    },
    removeItem(key: string) {
      state.delete(key);
    },
    setItem(key: string, value: string) {
      state.set(key, value);
    },
  };
}

function record(overrides: Partial<MedicalFactVerificationRecord> = {}): MedicalFactVerificationRecord {
  return {
    id: "medical_fact:metformin",
    targetKind: "passage",
    targetText: "Metformin can rarely cause lactic acidosis in renal impairment.",
    targetHash: "metformin",
    status: "partially_verified",
    confidenceScore: 68,
    confidenceLabel: "medium",
    summary: "Supported by lecture and trusted review; rare-risk wording retained.",
    sourceEvidence: [
      {
        label: "Endocrine pharmacology lecture",
        tier: "student_source",
        locator: "slide 44",
        year: 2026,
        supportsClaim: true,
      },
      {
        label: "Trusted pharmacology review",
        tier: "peer_reviewed_review",
        locator: "adverse effects",
        year: 2024,
        supportsClaim: true,
      },
    ],
    flags: ["probabilistic risk retained"],
    scopeLabels: ["course:med101", "chapter:endocrine-pharm"],
    verificationDepth: "standard",
    verifiedAt: 1_000,
    manualReviewer: null,
    ...overrides,
  };
}

test("medical fact verification AFP projection creates searchable knowledge cards", () => {
  const item = record();
  const message = medicalFactVerificationToAfpMessage(item, "2026-09-11T00:00:00.000Z");

  assert.equal(message.id, `afp-medical-fact-verification:${item.id}`);
  assert.equal(message.type, "knowledge_card");
  assert.equal(message.kind, "knowledge_card");
  assert.equal(message.subtype, "medical_fact_verification");
  assert.deepEqual(message.to, ["agent://study", "agent://knowledge-graph"]);
  assert.ok(message.supertags?.includes("medical_fact_verification"));
  assert.ok(message.supertags?.includes("verification_status:partially_verified"));
  assert.ok(message.supertags?.includes("confidence:medium"));
  assert.ok(message.supertags?.includes("verification_depth:standard"));
  assert.ok(message.supertags?.includes("course:med101"));
  assert.ok(message.supertags?.includes("source_tier:student_source"));
  assert.equal(message.metadata?.medical_fact_verification_status, "partially_verified");
  assert.equal(message.metadata?.medical_fact_confidence_score, 68);
  assert.equal(message.metadata?.medical_fact_source_count, 2);
  assert.equal(message.metadata?.knowledge_graph_seed, true);
  assert.equal(message.metadata?.knowledge_graph_group_key, item.id);
  assert.ok((message.metadata?.knowledge_graph_link_tags as string[]).includes("chapter:endocrine-pharm"));
  assert.ok((message.metadata?.searchable_terms as string[]).includes("Endocrine pharmacology lecture"));
  assert.match(String(message.content.summary), /study verification evidence/i);
  assert.equal(message.content.confidence_label, "medium");
  assert.equal(message.views?.[0]?.content.confidence, "medium (68/100)");
  assert.equal(message.references?.[0]?.type, "medical_fact_verification");
  assert.equal(message.references?.[1]?.type, "medical_verification_source");
  assert.equal(message.references?.[1]?.metadata?.tier, "student_source");

  const sendInput = medicalFactVerificationToAfpSendInput(item, "2026-09-11T00:00:00.000Z");
  assert.equal(sendInput.type, "knowledge_card");
  assert.equal(sendInput.subtype, "medical_fact_verification");
  assert.equal(sendInput.store_in_relational, true);
});

test("medical fact verification AFP projection marks needs-review next action", () => {
  const message = medicalFactVerificationToAfpMessage(record({
    status: "needs_review",
    confidenceScore: 22,
    confidenceLabel: "low",
    sourceEvidence: [
      {
        label: "Conflicting source",
        tier: "trusted_reference",
        locator: "warning",
        year: 2024,
        supportsClaim: false,
      },
    ],
    flags: ["conflicting source"],
  }));

  assert.equal(message.views?.[0]?.content.verification_status, "needs_review");
  assert.match(String(message.views?.[0]?.content.next_action), /manual verification/i);
  assert.ok(message.supertags?.includes("verification_status:needs_review"));
});

test("medical fact verification AFP sent markers are storage-safe and deduped", () => {
  const storage = storageFixture();
  storage.setItem(MEDICAL_FACT_VERIFICATION_AFP_PROJECTIONS_KEY, "{bad-json");

  assert.deepEqual(loadMedicalFactVerificationAfpProjectionIds(storage), []);
  assert.equal(storage.getItem(MEDICAL_FACT_VERIFICATION_AFP_PROJECTIONS_KEY), null);

  markMedicalFactVerificationAfpProjectionSent("record-1", storage);
  markMedicalFactVerificationAfpProjectionSent("record-1", storage);

  assert.equal(hasSentMedicalFactVerificationAfpProjection("record-1", storage), true);
  assert.deepEqual(loadMedicalFactVerificationAfpProjectionIds(storage), ["record-1"]);

  unmarkMedicalFactVerificationAfpProjectionSent("record-1", storage);
  assert.equal(hasSentMedicalFactVerificationAfpProjection("record-1", storage), false);
  assert.equal(storage.getItem(MEDICAL_FACT_VERIFICATION_AFP_PROJECTIONS_KEY), null);
});
