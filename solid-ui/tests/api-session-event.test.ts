import test from "node:test";
import assert from "node:assert/strict";

import {
  apiFetch,
  getDashboardSession,
  loadPrefs,
  parseRelayWebSocketEvent,
  readSession,
  readSessionChangedEventDetail,
  savePrefs,
  subscribeSessionChangedEvent,
  writeSession,
} from "../src/lib/api.ts";

const localStorageState = new Map<string, string>();
const sessionStorageState = new Map<string, string>();
const listeners = new Map<string, Set<(event: Event) => void>>();
const windowStub = {
  localStorage: {
    getItem(key: string) {
      return localStorageState.has(key) ? localStorageState.get(key)! : null;
    },
    setItem(key: string, value: string) {
      localStorageState.set(key, value);
    },
    removeItem(key: string) {
      localStorageState.delete(key);
    },
  },
  sessionStorage: {
    getItem(key: string) {
      return sessionStorageState.has(key) ? sessionStorageState.get(key)! : null;
    },
    setItem(key: string, value: string) {
      sessionStorageState.set(key, value);
    },
    removeItem(key: string) {
      sessionStorageState.delete(key);
    },
  },
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (typeof listener !== "function") return;
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(listener as (event: Event) => void);
  },
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (typeof listener !== "function") return;
    listeners.get(type)?.delete(listener as (event: Event) => void);
  },
  dispatchEvent() {
    return true;
  },
};

Object.defineProperty(globalThis, "window", {
  value: windowStub,
  configurable: true,
  writable: true,
});

test("readSessionChangedEventDetail uses shared session-change normalization", () => {
  const session = {
    token: "abc",
    user: {
      id: "user_1",
      email: "user@example.com",
      display_name: "User",
      auth_provider: "password",
    },
  };

  assert.deepEqual(
    readSessionChangedEventDetail(new CustomEvent("x", { detail: session })),
    {
      session,
      reason: null,
    },
  );

  assert.deepEqual(
    readSessionChangedEventDetail(new CustomEvent("x", {
      detail: { session: null, reason: "unauthorized" },
    })),
    {
      session: null,
      reason: "unauthorized",
    },
  );

  assert.deepEqual(
    readSessionChangedEventDetail(new CustomEvent("x", {
      detail: { session: null, reason: "account_disabled" },
    })),
    {
      session: null,
      reason: "account_disabled",
    },
  );

  assert.deepEqual(
    readSessionChangedEventDetail(new Event("x")),
    {
      session: null,
      reason: null,
    },
  );
  assert.deepEqual(
    readSessionChangedEventDetail(new CustomEvent("x", { detail: undefined })),
    {
      session: null,
      reason: null,
    },
  );
});

test("subscribeSessionChangedEvent relays normalized detail and unsubscribes cleanly", () => {
  const seen: Array<{ session: unknown; reason: string | null }> = [];
  const unsubscribe = subscribeSessionChangedEvent((detail) => {
    seen.push({ session: detail.session, reason: detail.reason });
  }, window as unknown as Window);

  const session = {
    token: "abc",
    user: {
      id: "user_1",
      email: "user@example.com",
      display_name: "User",
      auth_provider: "password",
    },
  };

  const sessionListeners = [...(listeners.get("omnyid:session-changed") ?? new Set())];
  assert.equal(sessionListeners.length, 1);
  sessionListeners[0](new CustomEvent("omnyid:session-changed", { detail: session }));
  sessionListeners[0](new Event("omnyid:session-changed"));

  assert.deepEqual(seen, [
    { session, reason: null },
    { session: null, reason: null },
  ]);

  unsubscribe();
  assert.equal((listeners.get("omnyid:session-changed")?.size ?? 0), 0);
});

test("workspace prefs persist only the normalized preference contract", () => {
  localStorageState.clear();
  sessionStorageState.clear();

  savePrefs({
    activeView: "",
    openThreadId: 7 as any,
  });

  assert.equal(
    localStorageState.get("omnyid.workspace.prefs"),
    JSON.stringify({
      activeView: "search",
      openThreadId: null,
    }),
  );
  assert.deepEqual(loadPrefs(), {
    activeView: "search",
    openThreadId: null,
  });
});

test("workspace prefs loader rewrites dirty preferences and clears corrupt storage", () => {
  localStorageState.clear();
  sessionStorageState.clear();
  localStorageState.set(
    "omnyid.workspace.prefs.user-1",
    JSON.stringify({ activeView: "", openThreadId: 7 }),
  );

  assert.deepEqual(loadPrefs("user-1"), {
    activeView: "search",
    openThreadId: null,
  });
  assert.equal(
    localStorageState.get("omnyid.workspace.prefs.user-1"),
    JSON.stringify({ activeView: "search", openThreadId: null }),
  );

  localStorageState.set("omnyid.workspace.prefs.user-1", "{bad-json");
  assert.deepEqual(loadPrefs("user-1"), {
    activeView: "search",
    openThreadId: null,
  });
  assert.equal(localStorageState.has("omnyid.workspace.prefs.user-1"), false);
});

test("writeSession persists only the normalized session contract in session storage", () => {
  localStorageState.clear();
  sessionStorageState.clear();

  writeSession({
    token: "",
    user: {
      id: "user_1",
      email: "user@example.com",
      display_name: "User",
      auth_provider: "password",
    },
  } as any);

  assert.equal(localStorageState.has("omnyid.preview.session"), false);
  assert.equal(sessionStorageState.has("omnyid.preview.session"), false);
  assert.equal(readSession(), null);
});

test("parseRelayWebSocketEvent rejects malformed relay frames", () => {
  assert.equal(parseRelayWebSocketEvent("{bad-json"), null);
  assert.equal(parseRelayWebSocketEvent("[]"), null);
  assert.equal(parseRelayWebSocketEvent("{}"), null);
  assert.equal(parseRelayWebSocketEvent({ event: "thread_snapshot", thread_id: 7 }), null);
});

test("parseRelayWebSocketEvent normalizes supported relay fields", () => {
  assert.deepEqual(
    parseRelayWebSocketEvent(JSON.stringify({ event: " message_stored ", thread_id: " thread-1 " })),
    { event: "message_stored", threadId: "thread-1" },
  );
  assert.deepEqual(
    parseRelayWebSocketEvent({ event: "fleet_update", thread_id: "   " }),
    { event: "fleet_update" },
  );
});

test("readSession clears invalid and unparseable persisted sessions", () => {
  localStorageState.clear();
  sessionStorageState.clear();
  sessionStorageState.set(
    "omnyid.preview.session",
    JSON.stringify({
      token: "",
      user: {
        id: "user_1",
        email: "user@example.com",
        display_name: "User",
        auth_provider: "password",
      },
    }),
  );

  assert.equal(readSession(), null);
  assert.equal(sessionStorageState.has("omnyid.preview.session"), false);
  assert.equal(localStorageState.has("omnyid.preview.session"), false);

  sessionStorageState.set("omnyid.preview.session", "{bad-json");
  assert.equal(readSession(), null);
  assert.equal(sessionStorageState.has("omnyid.preview.session"), false);
  assert.equal(localStorageState.has("omnyid.preview.session"), false);
});

test("readSession clears legacy local storage sessions instead of rehydrating them", () => {
  localStorageState.clear();
  sessionStorageState.clear();
  localStorageState.set(
    "omnyid.preview.session",
    JSON.stringify({
      token: "abc",
      user: {
        id: "user_1",
        email: "user@example.com",
        display_name: "User",
        auth_provider: "password",
      },
    }),
  );

  assert.equal(readSession(), null);
  assert.equal(localStorageState.has("omnyid.preview.session"), false);
  assert.equal(sessionStorageState.has("omnyid.preview.session"), false);
});

test("apiFetch clears the local session when the backend reports a disabled account", async () => {
  localStorageState.clear();
  sessionStorageState.clear();

  writeSession({
    token: "abc",
    user: {
      id: "user_1",
      email: "user@example.com",
      display_name: "User",
      auth_provider: "password",
    },
  });

  assert.equal(
    JSON.parse(sessionStorageState.get("omnyid.preview.session") ?? "{}").token,
    "__http_only_cookie__",
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("account access is disabled: abuse review", {
      status: 403,
      headers: { "Content-Type": "text/plain" },
    });

  try {
    await assert.rejects(
      apiFetch("/dashboard/bootstrap"),
      /account access is disabled: abuse review/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(readSession(), null);
  assert.equal(sessionStorageState.has("omnyid.preview.session"), false);
});

test("apiFetch always attaches the Bearer token when a session exists, not just cookie credentials", async () => {
  // The workspace origin (omnyid.com) and the API origin (api.omnyid.com) are
  // different hosts in production, so the login response's Set-Cookie is
  // never stored (publicApiFetch uses credentials:"same-origin" for that
  // cross-origin call) and the cookie path alone leaves every authenticated
  // request unauthenticated. The backend checks the Authorization header
  // before falling back to the cookie (authenticated_user in auth.rs), so
  // Bearer must always be sent whenever a session token is available.
  localStorageState.clear();
  sessionStorageState.clear();

  writeSession({
    token: "abc",
    user: {
      id: "user_1",
      email: "user@example.com",
      display_name: "User",
      auth_provider: "password",
    },
  });

  const originalFetch = globalThis.fetch;
  let seenRequest: { authorization: string | null; credentials: RequestCredentials | undefined } | null = null;
  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers ?? {});
    seenRequest = {
      authorization: headers.get("Authorization"),
      credentials: init?.credentials,
    };
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await apiFetch("/dashboard/bootstrap");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(seenRequest, {
    authorization: "Bearer abc",
    credentials: "include",
  });
});

test("apiFetch sends no Authorization header when there is no session", async () => {
  localStorageState.clear();
  sessionStorageState.clear();

  const originalFetch = globalThis.fetch;
  let seenAuthorization: string | null = "unset";
  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers ?? {});
    seenAuthorization = headers.get("Authorization");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await apiFetch("/dashboard/bootstrap");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(seenAuthorization, null);
});

test("getDashboardSession sends a stable guest browser fingerprint header", async () => {
  localStorageState.clear();
  sessionStorageState.clear();

  const originalFetch = globalThis.fetch;
  let firstHeader: string | null = null;
  let secondHeader: string | null = null;
  let requestCount = 0;
  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers ?? {});
    requestCount += 1;
    if (requestCount === 1) firstHeader = headers.get("X-OmnyID-Browser-Fingerprint");
    if (requestCount === 2) secondHeader = headers.get("X-OmnyID-Browser-Fingerprint");
    return new Response(JSON.stringify({ authenticated: false, session: "ephemeral" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await getDashboardSession();
    await getDashboardSession();
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(typeof firstHeader, "string");
  assert.ok((firstHeader?.length ?? 0) > 8);
  assert.equal(secondHeader, firstHeader);
  assert.equal(localStorageState.get("omnyid.preview.guest_fingerprint"), firstHeader);
});
