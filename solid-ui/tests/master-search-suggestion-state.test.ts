import assert from "node:assert/strict";
import test from "node:test";

import { masterSearchSuggestionsVisible } from "../src/lib/masterSearchSuggestionState.ts";

test("submitted master-search suggestions stay dismissed until the query changes", () => {
  assert.equal(masterSearchSuggestionsVisible({ requested: true, query: "garden venues", dismissedForQuery: "garden venues" }), false);
  assert.equal(masterSearchSuggestionsVisible({ requested: true, query: "garden venues near water", dismissedForQuery: "garden venues" }), true);
  assert.equal(masterSearchSuggestionsVisible({ requested: true, query: "", dismissedForQuery: null }), true);
  assert.equal(masterSearchSuggestionsVisible({ requested: false, query: "garden venues", dismissedForQuery: null }), false);
});
