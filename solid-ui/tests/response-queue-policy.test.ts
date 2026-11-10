import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import {
  RESPONSE_QUEUE_POLICY_KEY,
  defaultResponseQueuePolicy,
  loadResponseQueuePolicy,
  saveResponseQueuePolicy,
} from "../src/lib/responseQueuePolicy.ts";

const userId = "user-1";
const scopedPolicyKey = accountScopedStorageKey(RESPONSE_QUEUE_POLICY_KEY, userId);
const localStorageState = new Map<string, string>();

Object.assign(globalThis, {
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
});

test.beforeEach(() => {
  localStorageState.clear();
});

test("loadResponseQueuePolicy defaults when storage is empty or malformed", () => {
  assert.deepEqual(loadResponseQueuePolicy(userId), defaultResponseQueuePolicy());
  localStorageState.set(scopedPolicyKey, "{bad-json");
  assert.deepEqual(loadResponseQueuePolicy(userId), defaultResponseQueuePolicy());
  assert.equal(localStorageState.has(scopedPolicyKey), false);
});

test("loadResponseQueuePolicy keeps only valid numeric and boolean fields", () => {
  localStorageState.set(
    scopedPolicyKey,
    JSON.stringify({
      supplier_due_hours: 12,
      friend_due_hours: "48",
      general_due_hours: Number.POSITIVE_INFINITY,
      prioritize_with_local_llm: false,
      allow_remote_fallback: "yes",
    }),
  );

  assert.deepEqual(loadResponseQueuePolicy(userId), {
    supplier_due_hours: 12,
    friend_due_hours: 48,
    general_due_hours: 36,
    prioritize_with_local_llm: false,
    allow_remote_fallback: true,
  });
  assert.equal(
    localStorageState.get(scopedPolicyKey),
    JSON.stringify({
      supplier_due_hours: 12,
      friend_due_hours: 48,
      general_due_hours: 36,
      prioritize_with_local_llm: false,
      allow_remote_fallback: true,
    }),
  );
});

test("loadResponseQueuePolicy rejects non-object payloads", () => {
  localStorageState.set(scopedPolicyKey, JSON.stringify(["bad"]));
  assert.deepEqual(loadResponseQueuePolicy(userId), defaultResponseQueuePolicy());
});

test("saveResponseQueuePolicy persists only normalized numeric and boolean fields", () => {
  saveResponseQueuePolicy({
    supplier_due_hours: 12,
    friend_due_hours: "48" as unknown as number,
    general_due_hours: Number.POSITIVE_INFINITY,
    prioritize_with_local_llm: false,
    allow_remote_fallback: "yes" as unknown as boolean,
  }, userId);

  assert.deepEqual(
    JSON.parse(localStorageState.get(scopedPolicyKey) ?? "null"),
    {
      supplier_due_hours: 12,
      friend_due_hours: 48,
      general_due_hours: 36,
      prioritize_with_local_llm: false,
      allow_remote_fallback: true,
    },
  );
});

test("authenticated response queue policy ignores an unowned legacy global key", () => {
  localStorageState.set(RESPONSE_QUEUE_POLICY_KEY, JSON.stringify({
    supplier_due_hours: 12,
    friend_due_hours: 24,
    general_due_hours: 36,
    prioritize_with_local_llm: false,
    allow_remote_fallback: true,
  }));

  assert.deepEqual(loadResponseQueuePolicy(userId), {
    supplier_due_hours: 24,
    friend_due_hours: 48,
    general_due_hours: 36,
    prioritize_with_local_llm: true,
    allow_remote_fallback: true,
  });
  assert.equal(localStorageState.has(RESPONSE_QUEUE_POLICY_KEY), true);
  assert.equal(localStorageState.get(scopedPolicyKey), undefined);
});
