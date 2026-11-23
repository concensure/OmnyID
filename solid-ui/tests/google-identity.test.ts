import test from "node:test";
import assert from "node:assert/strict";

import { normalizeGoogleAuthConfig, shouldRetryGoogleAuthError } from "../src/lib/googleIdentity.ts";

test("normalizeGoogleAuthConfig returns client id when enabled", () => {
  assert.equal(
    normalizeGoogleAuthConfig({ enabled: true, client_id: " client-id.apps.googleusercontent.com " }),
    "client-id.apps.googleusercontent.com",
  );
});

test("normalizeGoogleAuthConfig rejects disabled or blank config", () => {
  assert.equal(normalizeGoogleAuthConfig({ enabled: false, client_id: "client-id" }), null);
  assert.equal(normalizeGoogleAuthConfig({ enabled: true, client_id: "   " }), null);
  assert.equal(normalizeGoogleAuthConfig({ enabled: true, client_id: 7 }), null);
  assert.equal(normalizeGoogleAuthConfig(["client-id"]), null);
  assert.equal(normalizeGoogleAuthConfig(null), null);
});

test("Google auth retries only transient browser and upstream failures", () => {
  assert.equal(shouldRetryGoogleAuthError(new Error("Failed to fetch")), true);
  assert.equal(shouldRetryGoogleAuthError(new Error("Request failed with 503")), true);
  assert.equal(shouldRetryGoogleAuthError(new Error("Request failed with 429")), true);
  assert.equal(shouldRetryGoogleAuthError(new Error("Google sign-in was rejected")), false);
});
