import assert from "node:assert/strict";
import test from "node:test";

import { googleCalendarConnectFailure } from "@/lib/googleCalendarConnectState";

test("calendar reconnect explains the recent-sign-in security gate", () => {
  const state = googleCalendarConnectFailure(new Error("recent sign-in required for high-risk action"), null);
  assert.equal(state.reauthRequired, true);
  assert.match(state.message, /fresh sign-in/i);
});

test("calendar connect distinguishes missing provider configuration", () => {
  const state = googleCalendarConnectFailure(new Error("unavailable"), {
    configured: false,
    clientIdConfigured: false,
    clientSecretConfigured: false,
    csrfSecretConfigured: true,
    homeserverUrlConfigured: true,
    redirectUri: null,
    requiredAuthorizedRedirectUri: null,
    requiredScopes: [],
    oauthClientSource: null,
  });
  assert.equal(state.reauthRequired, false);
  assert.match(state.message, /not configured/i);
});
