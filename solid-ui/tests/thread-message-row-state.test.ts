import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeThreadMessageCopy,
  threadMessagePreview,
  threadMessagePreviewBullets,
  threadMessageTitle,
} from "../src/lib/threadMessageRowState.ts";

test("thread message row state prefers explicit subject-like titles", () => {
  const title = threadMessageTitle("thread_123", [
    {
      type: "email_inbound",
      content: {
        subject: "Project Apollo status update",
        summary: "Detailed delivery notes for the next sprint.",
      },
    },
  ]);

  assert.equal(title, "Project Apollo status update");
});

test("thread message row state strips noisy full summary wording from previews", () => {
  const preview = threadMessagePreview({
    type: "email_inbound",
    content: {
      summary:
        "Customer called about missing invoice. [Full Summary: Detailed notes here] View Details",
    },
  });

  assert.equal(preview, "Customer called about missing invoice. Detailed notes here");
  assert.equal(
    normalizeThreadMessageCopy("[Full Summary: Detailed notes here] View Details"),
    "Detailed notes here",
  );
});

test("thread message row state avoids repeating the title in the preview", () => {
  const preview = threadMessagePreview({
    type: "slack",
    content: {
      title: "User permission issue",
      summary: "User permission issue The reports section is still blocked for the finance team.",
    },
  });

  assert.equal(preview, "The reports section is still blocked for the finance team.");
});

test("thread message row state shows one decrypting placeholder instead of ciphertext", () => {
  const encrypted = {
    type: "chat",
    content: { title: "Hidden title", ciphertext: "secret-ciphertext", nonce: "secret-nonce" },
    encryption: { scheme: "omnyid-envelope-v1" },
  };

  assert.equal(threadMessageTitle("thread_123", [encrypted]), "Encrypted message - unlock this device to view");
  assert.equal(threadMessagePreview(encrypted), "Encrypted message - unlock this device to view");
});

test("thread message row state derives compact bullets from the cleaned preview", () => {
  const bullets = threadMessagePreviewBullets(
    "The user is blocked from reports. Finance cannot confirm access. We should reply today.",
  );

  assert.deepEqual(bullets, [
    "The user is blocked from reports",
    "Finance cannot confirm access",
    "We should reply today.",
  ]);
});
