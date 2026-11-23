import test from "node:test";
import assert from "node:assert/strict";

import {
  parseAuthApiResponse,
  parseAuthMessageResponse,
} from "../src/lib/authResponseState.ts";

test("parseAuthApiResponse accepts a complete session response", () => {
  assert.deepEqual(
    parseAuthApiResponse({
      token: "token-1",
      user: {
        id: "user-1",
        email: "user@example.com",
        display_name: "User",
        auth_provider: "password",
      },
      requires_2fa: false,
      verification_required: false,
      account_created: true,
      message: "Signed in",
      email: "user@example.com",
    }),
    {
      token: "token-1",
      user: {
        id: "user-1",
        email: "user@example.com",
        display_name: "User",
        auth_provider: "password",
      },
      requires_2fa: false,
      verification_required: false,
      accountCreated: true,
      message: "Signed in",
      email: "user@example.com",
    },
  );
});

test("parseAuthApiResponse normalizes partial and malformed responses", () => {
  assert.deepEqual(parseAuthApiResponse([]), {
    requires_2fa: false,
    verification_required: false,
  });
  assert.deepEqual(
    parseAuthApiResponse({
      token: 7,
      user: {
        id: "user-1",
        email: "user@example.com",
        display_name: null,
        auth_provider: "password",
      },
      requires_2fa: "yes",
      verification_required: true,
      message: 42,
    }),
    {
      token: undefined,
      user: undefined,
      requires_2fa: false,
      verification_required: true,
      message: undefined,
      email: undefined,
    },
  );
});

test("parseAuthMessageResponse only accepts string messages", () => {
  assert.deepEqual(parseAuthMessageResponse({ message: "Sent" }), { message: "Sent" });
  assert.deepEqual(parseAuthMessageResponse({ message: 7 }), {});
  assert.deepEqual(parseAuthMessageResponse(["Sent"]), {});
});
