import test from "node:test";
import assert from "node:assert/strict";

import { normalizeGoogleAuthConfig } from "../src/lib/googleIdentity.ts";

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
