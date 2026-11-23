import assert from "node:assert/strict";
import test from "node:test";

import { buildMedicalConceptGraphCapabilityState } from "../src/lib/medicalConceptGraphCapabilityState.ts";

test("medical concept graph capability reports partial foundation from current study architecture", () => {
  const state = buildMedicalConceptGraphCapabilityState({
    hasRetainedSources: true,
    hasKnowledgeGraph: true,
    hasStructuredDrillExports: true,
  });

  assert.equal(state.level, "partial_foundation");
  assert.match(state.headline, /foundation/i);
  assert.ok(state.currentStrengths.some((item) => /chapter/i.test(item)));
  assert.ok(state.missingCapabilities.some((item) => /ontology/i.test(item)));
  assert.ok(state.missingCapabilities.some((item) => /Attempt history/i.test(item)));
  assert.match(state.defensibilitySummary, /SME-reviewed medical graph/i);
});

test("medical concept graph capability requires ontology and dynamic renderer for availability", () => {
  const state = buildMedicalConceptGraphCapabilityState({
    hasMedicalOntology: true,
    hasDynamicQuestionRenderer: true,
  });

  assert.equal(state.level, "available_now");
  assert.equal(state.missingCapabilities.length, 0);
  assert.match(state.defensibilitySummary, /ontology/i);
  assert.match(state.currentStrengths.join(" "), /freshly phrased recall/i);
});
