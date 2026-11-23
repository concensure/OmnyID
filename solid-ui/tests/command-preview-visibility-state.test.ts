import test from "node:test";
import assert from "node:assert/strict";

import {
  commandPreviewUnlockNotice,
  readableCommandPreview,
} from "../src/lib/commandPreviewVisibilityState.js";

test("readableCommandPreview retains a locally decrypted preview", () => {
  const preview = { content: { summary: "Readable result" }, encryption: null };
  const generated = { content: { summary: "Fallback" }, encryption: null };

  assert.equal(readableCommandPreview(preview, generated), preview);
  assert.equal(commandPreviewUnlockNotice(preview), null);
});

test("readableCommandPreview uses the safe response summary when a rich preview remains encrypted", () => {
  const lockedPreview = { content: { ciphertext: "hidden" }, encryption: { alg: "AES-GCM" } };
  const generated = { content: { summary: "Readable fallback" }, encryption: null };

  assert.equal(readableCommandPreview(lockedPreview, generated), generated);
  assert.deepEqual(commandPreviewUnlockNotice(lockedPreview), {
    label: "Detailed response is still locked on this device",
    detail: "Showing the readable response summary instead. Refresh or sign in again to unlock the detailed view.",
  });
});
