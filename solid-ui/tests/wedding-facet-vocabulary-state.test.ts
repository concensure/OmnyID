import assert from "node:assert/strict";
import test from "node:test";
import { WEDDING_FACET_VOCABULARY, validateWeddingFacetVocabulary, weddingFacetById, weddingFacetConflicts, weddingFacetsForPhrase } from "../src/lib/weddingFacetVocabularyState.ts";

test("facet vocabulary has valid ids, conflicts, and unambiguous synonym lookup", () => {
  assert.ok(WEDDING_FACET_VOCABULARY.length >= 40);
  assert.deepEqual(validateWeddingFacetVocabulary(), []);
  assert.equal(weddingFacetById("scale.intimate")?.label, "Intimate");
  assert.deepEqual(weddingFacetsForPhrase("Intimacy and an intimate dinner").map((facet) => facet.id), ["scale.intimate"]);
  assert.deepEqual(weddingFacetConflicts("scale.intimate").map((facet) => facet.id), ["scale.large", "atmosphere.grand"]);
});
