import test from "node:test";
import assert from "node:assert/strict";

import {
  guestGmailRedirectMessage,
  signedInGmailRedirectFallbackMessage,
} from "../src/lib/gmailRedirectState.ts";

test("guestGmailRedirectMessage explains post-auth reconnect requirement", () => {
  assert.equal(
    guestGmailRedirectMessage("connected"),
    "Gmail authorization finished. Sign in to this workspace again to verify the connection.",
  );
});

test("guestGmailRedirectMessage reflects configuration and failure states", () => {
  assert.equal(
    guestGmailRedirectMessage("not_configured"),
    "Gmail OAuth is not configured on this server.",
  );
  assert.equal(
    guestGmailRedirectMessage("error"),
    "Gmail connection failed. Sign in and try again.",
  );
});

test("signedInGmailRedirectFallbackMessage reflects stored-connection failure and generic errors", () => {
  assert.equal(
    signedInGmailRedirectFallbackMessage("connected"),
    "Gmail authorization finished, but this workspace could not confirm a stored Gmail connection. Try reconnecting. If it still fails, check the server Gmail OAuth configuration.",
  );
  assert.equal(
    signedInGmailRedirectFallbackMessage("not_configured"),
    "Gmail OAuth is not configured on this server.",
  );
  assert.equal(
    signedInGmailRedirectFallbackMessage("error"),
    "Gmail connection failed. Try again.",
  );
});

test("signedInGmailRedirectFallbackMessage explains actionable Gmail OAuth callback failures", () => {
  assert.match(
    signedInGmailRedirectFallbackMessage("redirect_mismatch"),
    /same OMNYID_GMAIL_REDIRECT_URI/i,
  );
  assert.match(
    signedInGmailRedirectFallbackMessage("invalid_client"),
    /client ID and client secret/i,
  );
  assert.match(
    signedInGmailRedirectFallbackMessage("token_exchange_failed"),
    /authorization code/i,
  );
  assert.match(
    signedInGmailRedirectFallbackMessage("store_failed"),
    /could not save the Gmail token/i,
  );
});
