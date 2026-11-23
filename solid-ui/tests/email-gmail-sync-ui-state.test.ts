import test from "node:test";
import assert from "node:assert/strict";

import { buildEmailGmailSyncUiState } from "../src/lib/emailGmailSyncUiState.ts";

test("email Gmail sync UI stays hidden while Gmail is disconnected", () => {
  const state = buildEmailGmailSyncUiState({
    connected: { connected: false, gmail_email: "", configured: true },
    preference: "new_only",
  });

  assert.equal(state.visible, false);
  assert.equal(state.actionLabel, "Check Gmail");
});

test("email Gmail sync UI explains full inbox history depends on saved email records", () => {
  const state = buildEmailGmailSyncUiState({
    connected: { connected: true, gmail_email: "person@example.com", configured: true },
    preference: "full_inbox",
  });

  assert.equal(state.visible, true);
  assert.equal(state.modeLabel, "Full inbox");
  assert.match(state.detail, /history sync saves it as email records/i);
});

test("email Gmail sync UI summarizes live Gmail check results", () => {
  const state = buildEmailGmailSyncUiState({
    connected: { connected: true, gmail_email: "person@example.com", configured: true },
    preference: "new_only",
    summary: {
      total_unread: 7,
      needs_reply: 2,
      newsletters: 3,
      priority_emails: [],
      draft: null,
    },
  });

  assert.equal(state.title, "Gmail is reachable");
  assert.equal(state.summaryLabel, "7 unread · 2 need reply · 3 newsletters");
  assert.match(state.detail, /New incoming mail appears here after OmnyID syncs/i);
});

test("email Gmail sync UI preserves retry wording after a failed check", () => {
  const state = buildEmailGmailSyncUiState({
    connected: { connected: true, gmail_email: "person@example.com", configured: true },
    preference: "new_only",
    error: "Token expired",
  });

  assert.equal(state.tone, "warning");
  assert.equal(state.actionLabel, "Try again");
  assert.equal(state.detail, "Token expired");
});
