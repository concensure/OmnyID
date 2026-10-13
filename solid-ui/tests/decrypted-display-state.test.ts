import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDecryptedDisplayState,
  decryptedDisplayLabel,
  decryptedDisplayStringValues,
  ENCRYPTED_MESSAGE_UNAVAILABLE_LABEL,
} from "../src/lib/decryptedDisplayState.ts";

test("buildDecryptedDisplayState returns plaintext values after in-memory decryption", () => {
  const state = buildDecryptedDisplayState({
    encryption: null,
    content: { title: "Venue shortlist", body: "Harbour House is selected." },
  });

  assert.equal(state.decrypted, true);
  assert.equal(state.encrypted, false);
  assert.deepEqual(state.stringValues, ["Venue shortlist", "Harbour House is selected."]);
  assert.equal(state.placeholder, null);
});

test("buildDecryptedDisplayState hides ciphertext-shaped content while encrypted", () => {
  const state = buildDecryptedDisplayState({
    encryption: { scheme: "omnyid-envelope-v1" },
    content: { ciphertext: "abc123", nonce: "nonce123", title: "Should not leak" },
  });

  assert.equal(state.encrypted, true);
  assert.equal(state.decrypted, false);
  assert.deepEqual(state.content, {});
  assert.deepEqual(state.stringValues, []);
  assert.equal(state.placeholder, ENCRYPTED_MESSAGE_UNAVAILABLE_LABEL);
  assert.equal(decryptedDisplayLabel({ encryption: { scheme: "x" }, content: { ciphertext: "secret" } }), ENCRYPTED_MESSAGE_UNAVAILABLE_LABEL);
  assert.deepEqual(decryptedDisplayStringValues({ encryption: { scheme: "x" }, content: { ciphertext: "secret" } }), []);
});

test("buildDecryptedDisplayState does not claim to be decrypting when the envelope is already present", () => {
  const state = buildDecryptedDisplayState({
    encryption: { scheme: "omnyid-envelope-v1", nonce: "nonce123", ciphertext: "abc123" },
    content: { omnyid_encrypted: true },
  });

  assert.equal(state.placeholder, ENCRYPTED_MESSAGE_UNAVAILABLE_LABEL);
});
