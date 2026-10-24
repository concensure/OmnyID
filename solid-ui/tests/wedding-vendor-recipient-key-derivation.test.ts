import assert from "node:assert/strict";
import test from "node:test";

import { deriveRecipientAeadKey } from "../src/lib/vendorAgentKeys.ts";

test("browser recipient key derivation matches the Rust envelope contract", async () => {
  const key = await deriveRecipientAeadKey(
    new Uint8Array(32).fill(1),
    new Uint8Array(32).fill(2),
    new Uint8Array(32).fill(3),
    "vendor-test-key",
  );

  assert.equal(
    Buffer.from(key).toString("hex"),
    "85b2b7b403145c1ed0eeecb51aa228472855d18d1cad9902ab6e99da78941eb0",
  );
});

test("browser recipient key derivation rejects malformed or missing key identity", async () => {
  await assert.rejects(
    deriveRecipientAeadKey(
      new Uint8Array(31),
      new Uint8Array(32),
      new Uint8Array(32),
      "vendor-test-key",
    ),
    /invalid/i,
  );
  await assert.rejects(
    deriveRecipientAeadKey(
      new Uint8Array(32),
      new Uint8Array(32),
      new Uint8Array(32),
      "",
    ),
    /invalid/i,
  );
});
