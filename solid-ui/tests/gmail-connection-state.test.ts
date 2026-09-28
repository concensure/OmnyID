import test from "node:test";
import assert from "node:assert/strict";

import {
  gmailActionAvailabilityState,
  gmailConnectionWarningState,
  gmailOAuthConfigFailureMessage,
  normalizeGmailConnectionStatus,
  normalizeGmailOAuthConfig,
  oauthUrlFromResponse,
} from "../src/lib/gmailConnectionState.ts";

test("normalizeGmailConnectionStatus rejects malformed payload fields", () => {
  const status = normalizeGmailConnectionStatus({
    connected: "true",
    gmail_email: { address: "alex@example.com" },
    configured: "yes",
    token_expiry: 123,
    connected_at: ["yesterday"],
    token_expired: "false",
    expires_within_24h: 1,
  });

  assert.deepEqual(status, {
    connected: false,
    gmail_email: "",
    configured: true,
    token_expiry: undefined,
    connected_at: undefined,
    token_expired: undefined,
    expires_within_24h: undefined,
  });
});

test("normalizeGmailConnectionStatus accepts status aliases from integration adapters", () => {
  const status = normalizeGmailConnectionStatus({
    connected: true,
    gmailEmail: "admin@omnyid.com",
    configured: true,
    tokenExpiry: "2026-09-28T00:00:00Z",
    connectedAt: "2026-09-27T00:00:00Z",
    tokenExpired: false,
    expiresWithin24h: true,
  });

  assert.deepEqual(status, {
    connected: true,
    gmail_email: "admin@omnyid.com",
    configured: true,
    token_expiry: "2026-09-28T00:00:00Z",
    connected_at: "2026-09-27T00:00:00Z",
    token_expired: false,
    expires_within_24h: true,
  });
});

test("oauthUrlFromResponse only accepts https redirect urls", () => {
  assert.equal(
    oauthUrlFromResponse({ url: "https://accounts.google.com/o/oauth2/v2/auth" }),
    "https://accounts.google.com/o/oauth2/v2/auth",
  );
  assert.throws(() => oauthUrlFromResponse({ url: "javascript:alert(1)" }), /Invalid OAuth redirect URL/);
  assert.throws(() => oauthUrlFromResponse({ url: "/local/callback" }), /Invalid OAuth redirect URL/);
  assert.throws(() => oauthUrlFromResponse({}), /Invalid OAuth redirect URL/);
});

test("normalizeGmailOAuthConfig accepts redacted OAuth diagnostics", () => {
  const config = normalizeGmailOAuthConfig({
    configured: true,
    client_id_configured: true,
    client_secret_configured: true,
    csrf_secret_configured: true,
    homeserver_url_configured: true,
    redirect_uri: "https://api.omnyid.com/gmail/callback",
    required_authorized_redirect_uri: "https://api.omnyid.com/gmail/callback",
    required_scopes: ["https://www.googleapis.com/auth/gmail.modify"],
  });

  assert.equal(config.configured, true);
  assert.equal(config.requiredAuthorizedRedirectUri, "https://api.omnyid.com/gmail/callback");
  assert.deepEqual(config.requiredScopes, ["https://www.googleapis.com/auth/gmail.modify"]);
});

test("gmailOAuthConfigFailureMessage names missing config or required redirect URI", () => {
  assert.match(
    gmailOAuthConfigFailureMessage(normalizeGmailOAuthConfig({
      client_id_configured: false,
      client_secret_configured: true,
      csrf_secret_configured: false,
      homeserver_url_configured: true,
    })),
    /client ID, session secret/i,
  );
  assert.match(
    gmailOAuthConfigFailureMessage(normalizeGmailOAuthConfig({
      configured: true,
      client_id_configured: true,
      client_secret_configured: true,
      csrf_secret_configured: true,
      homeserver_url_configured: true,
      required_authorized_redirect_uri: "https://api.omnyid.com/gmail/callback",
    })),
    /https:\/\/api\.omnyid\.com\/gmail\/callback/,
  );
});

test("gmailConnectionWarningState returns danger state for expired tokens", () => {
  const warning = gmailConnectionWarningState({
    connected: true,
    gmail_email: "alex@example.com",
    configured: true,
    token_expired: true,
    expires_within_24h: false,
    token_expiry: "2026-07-05T23:00:00Z",
  });

  assert.equal(warning?.tone, "danger");
  assert.equal(warning?.title, "Gmail token expired");
});

test("gmailConnectionWarningState returns warning state inside 24 hour window", () => {
  const warning = gmailConnectionWarningState(
    {
      connected: true,
      gmail_email: "alex@example.com",
      configured: true,
      token_expired: false,
      expires_within_24h: true,
      token_expiry: "2026-07-06T12:00:00Z",
    },
    Date.parse("2026-07-06T00:00:00Z"),
  );

  assert.equal(warning?.tone, "warning");
  assert.match(warning?.detail ?? "", /expires in 12h/i);
});

test("gmailConnectionWarningState returns null for healthy connections", () => {
  const warning = gmailConnectionWarningState({
    connected: true,
    gmail_email: "alex@example.com",
    configured: true,
    token_expired: false,
    expires_within_24h: false,
    token_expiry: "2026-07-08T00:00:00Z",
  });

  assert.equal(warning, null);
});

test("gmailActionAvailabilityState blocks actions for expired tokens", () => {
  const availability = gmailActionAvailabilityState({
    connected: true,
    gmail_email: "alex@example.com",
    configured: true,
    token_expired: true,
    expires_within_24h: false,
    token_expiry: "2026-07-05T23:00:00Z",
  });

  assert.equal(availability?.blocking, true);
  assert.equal(availability?.actionLabel, "Reconnect Gmail");
  assert.match(availability?.summary ?? "", /token expired/i);
});

test("gmailActionAvailabilityState warns without blocking inside 24 hour window", () => {
  const availability = gmailActionAvailabilityState(
    {
      connected: true,
      gmail_email: "alex@example.com",
      configured: true,
      token_expired: false,
      expires_within_24h: true,
      token_expiry: "2026-07-06T12:00:00Z",
      connected_at: "2026-07-05T20:00:00Z",
    },
    Date.parse("2026-07-06T00:00:00Z"),
  );

  assert.equal(availability?.blocking, false);
  assert.equal(availability?.actionLabel, "Reconnect Gmail");
  assert.match(availability?.summary ?? "", /expires in 12h/i);
});

test("gmailActionAvailabilityState reports healthy connected status", () => {
  const availability = gmailActionAvailabilityState(
    {
      connected: true,
      gmail_email: "alex@example.com",
      configured: true,
      token_expired: false,
      expires_within_24h: false,
      connected_at: "2026-07-05T22:00:00Z",
    },
    Date.parse("2026-07-06T00:00:00Z"),
  );

  assert.equal(availability?.blocking, false);
  assert.equal(availability?.actionLabel, null);
  assert.match(availability?.summary ?? "", /connected/i);
  assert.match(availability?.summary ?? "", /synced 2h ago/i);
});
