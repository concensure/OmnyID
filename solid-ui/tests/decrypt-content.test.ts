import test from "node:test";
import assert from "node:assert/strict";

import { parseDecryptedAfpContent } from "../src/lib/decrypt.ts";

test("parseDecryptedAfpContent accepts decrypted object content", () => {
  assert.deepEqual(parseDecryptedAfpContent('{"text":"hello","count":2}'), {
    text: "hello",
    count: 2,
  });
});

test("parseDecryptedAfpContent rejects malformed and non-object content", () => {
  assert.equal(parseDecryptedAfpContent("{bad-json"), null);
  assert.equal(parseDecryptedAfpContent("[]"), null);
  assert.equal(parseDecryptedAfpContent("null"), null);
  assert.equal(parseDecryptedAfpContent('"plain text"'), null);
});
