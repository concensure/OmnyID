import test from "node:test";
import assert from "node:assert/strict";

import { parseLedgerSessionFallbackJwk } from "../src/lib/profileLedger.ts";

test("parseLedgerSessionFallbackJwk rejects malformed stored keys", () => {
  assert.equal(parseLedgerSessionFallbackJwk("{bad-json"), null);
  assert.equal(parseLedgerSessionFallbackJwk("[]"), null);
  assert.equal(parseLedgerSessionFallbackJwk(JSON.stringify({ kty: "oct" })), null);
});

test("parseLedgerSessionFallbackJwk accepts minimal AES JWK fields", () => {
  assert.deepEqual(
    parseLedgerSessionFallbackJwk(JSON.stringify({
      kty: "oct",
      k: "abc",
      alg: "A256GCM",
      ext: true,
      key_ops: ["encrypt", "decrypt", 7],
    })),
    {
      kty: "oct",
      k: "abc",
      alg: "A256GCM",
      ext: true,
      key_ops: ["encrypt", "decrypt"],
    },
  );
});
