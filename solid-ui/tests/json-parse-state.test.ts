import test from "node:test";
import assert from "node:assert/strict";

import { parseJsonValue, parseJsonValueOr } from "../src/lib/jsonParseState.ts";

test("parseJsonValue exposes successful parsed JSON as unknown", () => {
  assert.deepEqual(parseJsonValue('{"a":1}'), { ok: true, value: { a: 1 } });
});

test("parseJsonValue reports malformed JSON without throwing", () => {
  assert.deepEqual(parseJsonValue("{bad-json"), { ok: false });
});

test("parseJsonValueOr falls back for missing or malformed input", () => {
  const fallback = ["fallback"];
  assert.equal(parseJsonValueOr(null, fallback), fallback);
  assert.equal(parseJsonValueOr(undefined, fallback), fallback);
  assert.equal(parseJsonValueOr("{bad-json", fallback), fallback);
  assert.deepEqual(parseJsonValueOr("[1,2]", fallback), [1, 2]);
});
