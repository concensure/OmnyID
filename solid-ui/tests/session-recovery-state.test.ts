import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSessionEndedNotice,
  normalizeSessionChangedDetail,
} from "../src/lib/sessionRecoveryState.ts";

test("normalizeSessionChangedDetail supports legacy raw session payloads", () => {
  assert.deepEqual(
    normalizeSessionChangedDetail({
      token: "abc",
      user: {
        id: "user_1",
        email: "user@example.com",
        display_name: "User",
        auth_provider: "password",
      },
    }),
    {
      session: {
        token: "abc",
        user: {
          id: "user_1",
          email: "user@example.com",
          display_name: "User",
          auth_provider: "password",
        },
      },
      reason: null,
    },
  );
});

test("normalizeSessionChangedDetail preserves explicit unauthorized session end reason", () => {
  assert.deepEqual(
    normalizeSessionChangedDetail({
      session: null,
      reason: "unauthorized",
    }),
    {
      session: null,
      reason: "unauthorized",
    },
  );
});

test("normalizeSessionChangedDetail preserves explicit account-disabled session end reason", () => {
  assert.deepEqual(
    normalizeSessionChangedDetail({
      session: null,
      reason: "account_disabled",
    }),
    {
      session: null,
      reason: "account_disabled",
    },
  );
});

test("normalizeSessionChangedDetail treats array details as legacy raw sessions", () => {
  const detail = [{ token: "array-session" }];
  assert.deepEqual(normalizeSessionChangedDetail(detail), {
    session: detail,
    reason: null,
  });
});

test("buildSessionEndedNotice opens sign-in recovery for unauthorized session loss", () => {
  assert.deepEqual(buildSessionEndedNotice("unauthorized"), {
    showAuthModal: true,
    tone: "error",
    text: "Your session has expired. Sign in again to continue.",
  });
});

test("buildSessionEndedNotice keeps manual sign-out distinct from expiry", () => {
  assert.deepEqual(buildSessionEndedNotice("manual_sign_out"), {
    showAuthModal: false,
    tone: "success",
    text: "You have signed out.",
  });
});

test("buildSessionEndedNotice keeps disabled accounts out of the sign-in recovery loop", () => {
  assert.deepEqual(buildSessionEndedNotice("account_disabled"), {
    showAuthModal: false,
    tone: "error",
    text: "Account access is disabled. Contact support or an operator to restore access.",
  });
});
