import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeDraftReply,
  normalizeInboxSummary,
  normalizePriorityEmail,
} from "../src/lib/firstRunExperienceResponseState.ts";

test("normalizeInboxSummary clamps counts and filters malformed priority emails", () => {
  assert.deepEqual(normalizeInboxSummary({
    total_unread: 12.9,
    needs_reply: -1,
    newsletters: Number.NaN,
    priority_emails: [
      { id: "e1", sender: "", subject: 123, preview: true },
      { sender: "Missing id" },
      null,
    ],
    draft: { email_id: "e1", to: "", subject: "", body: "Reply body" },
  }), {
    total_unread: 12,
    needs_reply: 0,
    newsletters: 0,
    priority_emails: [{
      id: "e1",
      sender: "Unknown sender",
      subject: "123",
      preview: "true",
    }],
    draft: {
      email_id: "e1",
      to: "Unknown recipient",
      subject: "Re:",
      body: "Reply body",
    },
  });
});

test("normalizeDraftReply rejects incomplete draft rows", () => {
  assert.equal(normalizeDraftReply({ email_id: "e1" }), null);
  assert.equal(normalizeDraftReply({ body: "Missing id" }), null);
});

test("normalizePriorityEmail requires a stable email id", () => {
  assert.equal(normalizePriorityEmail({ subject: "No id" }), null);
});
