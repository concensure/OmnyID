import test from "node:test";
import assert from "node:assert/strict";

import {
  authenticateWithPasskey,
  browserSupportsPasskeyAuth,
} from "../src/lib/passkeyAuth.ts";

class MockAuthenticatorAssertionResponse {
  clientDataJSON: ArrayBuffer;
  authenticatorData: ArrayBuffer;
  signature: ArrayBuffer;

  constructor() {
    this.clientDataJSON = Uint8Array.from([1, 2, 3]).buffer;
    this.authenticatorData = Uint8Array.from([4, 5, 6]).buffer;
    this.signature = Uint8Array.from([7, 8, 9]).buffer;
  }
}

class MockPublicKeyCredential {
  id: string;
  response: MockAuthenticatorAssertionResponse;

  constructor(id: string) {
    this.id = id;
    this.response = new MockAuthenticatorAssertionResponse();
  }
}

const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;
const originalFetch = globalThis.fetch;
const originalPublicKeyCredential = globalThis.PublicKeyCredential;
const originalAuthenticatorAssertionResponse = globalThis.AuthenticatorAssertionResponse;

function defineGlobalValue(key: PropertyKey, value: unknown) {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
  });
}

function installPasskeyGlobals() {
  defineGlobalValue("PublicKeyCredential", MockPublicKeyCredential);
  defineGlobalValue("AuthenticatorAssertionResponse", MockAuthenticatorAssertionResponse);
  defineGlobalValue("navigator", {
    credentials: {
      get: async () => new MockPublicKeyCredential("cred-123"),
    },
  });
  defineGlobalValue("window", {
    PublicKeyCredential: MockPublicKeyCredential,
  });
}

function restoreGlobals() {
  defineGlobalValue("fetch", originalFetch);
  defineGlobalValue("navigator", originalNavigator);
  defineGlobalValue("window", originalWindow);
  defineGlobalValue("PublicKeyCredential", originalPublicKeyCredential);
  defineGlobalValue("AuthenticatorAssertionResponse", originalAuthenticatorAssertionResponse);
}

test("browserSupportsPasskeyAuth requires both browser credential types and navigator access", () => {
  restoreGlobals();
  defineGlobalValue("navigator", { credentials: {} });
  defineGlobalValue("window", {});
  defineGlobalValue("PublicKeyCredential", undefined);

  assert.equal(browserSupportsPasskeyAuth(), false);

  installPasskeyGlobals();
  assert.equal(browserSupportsPasskeyAuth(), true);
  restoreGlobals();
});

test("authenticateWithPasskey completes the begin and finish flow through the browser credential API", async () => {
  installPasskeyGlobals();

  const requests: Array<{ url: string; method: string; body: string | null }> = [];
  defineGlobalValue("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = request ? request.url : String(input);
    requests.push({
      url,
      method: init?.method ?? request?.method ?? "GET",
      body: typeof init?.body === "string"
        ? init.body
        : request
          ? await request.clone().text()
          : null,
    });

    if (url.endsWith("/auth/passkey/authenticate/begin-email")) {
      return new Response(JSON.stringify({
        user_id: "user-123",
        options: {
          challenge: "AQID",
          rp_id: "omnyid.example",
          timeout_ms: 60000,
          user_verification: "preferred",
          allow_credentials: [],
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.endsWith("/auth/passkey/authenticate/finish")) {
      return new Response(JSON.stringify({
        token: "session-123",
        user: {
          id: "user-123",
          email: "user@example.com",
          display_name: "User",
          auth_provider: "passkey",
        },
        requires_2fa: false,
        verification_required: false,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("unexpected request", { status: 500 });
  });

  try {
    const result = await authenticateWithPasskey(" USER@Example.com ");

    assert.equal(result.token, "session-123");
    assert.equal(result.user?.id, "user-123");
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.url.endsWith("/auth/passkey/authenticate/begin-email"), true);
    assert.equal(requests[0]?.method, "POST");
    assert.equal(requests[0]?.body, JSON.stringify({ email: "user@example.com" }));
    assert.equal(requests[1]?.url.endsWith("/auth/passkey/authenticate/finish"), true);

    const finishPayload = JSON.parse(requests[1]?.body ?? "{}") as Record<string, unknown>;
    assert.equal(finishPayload.user_id, "user-123");
    assert.equal(finishPayload.credential_id, "cred-123");
    assert.equal(typeof finishPayload.client_data_json, "string");
    assert.equal(typeof finishPayload.authenticator_data, "string");
    assert.equal(typeof finishPayload.signature, "string");
  } finally {
    restoreGlobals();
  }
});

test("authenticateWithPasskey maps credential cancellation into a user-facing error", async () => {
  installPasskeyGlobals();
  defineGlobalValue("navigator", {
    credentials: {
      get: async () => {
        throw new DOMException("cancelled", "NotAllowedError");
      },
    },
  });
  defineGlobalValue("fetch", async () => new Response(JSON.stringify({
    user_id: "user-123",
    options: {
      challenge: "AQID",
      rp_id: "omnyid.example",
      timeout_ms: 60000,
      user_verification: "preferred",
      allow_credentials: [],
    },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));

  try {
    await assert.rejects(
      () => authenticateWithPasskey("user@example.com"),
      /Passkey sign-in was cancelled or no matching passkey was approved on this device\./,
    );
  } finally {
    restoreGlobals();
  }
});
