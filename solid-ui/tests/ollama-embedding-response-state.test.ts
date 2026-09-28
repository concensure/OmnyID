import test from "node:test";
import assert from "node:assert/strict";

import { parseOllamaEmbeddingResponse } from "../src/lib/ollamaEmbeddingResponseState.ts";

test("parseOllamaEmbeddingResponse accepts finite numeric embedding entries", () => {
  assert.deepEqual(parseOllamaEmbeddingResponse({ embedding: [1, "2.5", "bad", Infinity] }), [1, 2.5]);
  assert.equal(parseOllamaEmbeddingResponse({ embedding: ["bad"] }), null);
  assert.equal(parseOllamaEmbeddingResponse({ embedding: "bad" }), null);
});
