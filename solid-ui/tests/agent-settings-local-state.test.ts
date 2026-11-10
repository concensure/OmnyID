import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import {
  CAP_DOW_KEY,
  CAP_LAST_USED_KEY,
  CAP_USAGE_COUNT_KEY,
  LLM_LATENCY_KEY,
  LLM_PING_KEY,
  LLM_PING_OK_KEY,
  LLM_TEST_HISTORY_KEY,
  LORA_HISTORY_KEY,
  SOUL_SAVED_KEY,
  clearLoraHistory,
  appendLatencyHistoryEntry,
  loadCapabilityDowUsage,
  loadCapabilityLastUsed,
  loadCapabilityUsageCount,
  loadLastLlmPingAt,
  loadLastLlmPingOk,
  loadLatencyHistory,
  loadLoraHistory,
  loadSoulSavedAt,
  loadTestHistory,
  saveCapabilityDowUsage,
  saveCapabilityLastUsed,
  saveCapabilityUsageCount,
  saveLastLlmPingAt,
  saveLastLlmPingOk,
  pushTestHistoryEntry,
  saveLatencyHistory,
  saveLoraHistory,
  saveSoulSavedAt,
  saveTestHistory,
} from "../src/lib/agentSettingsLocalState.ts";

const userId = "user-1";
const latencyKey = accountScopedStorageKey(LLM_LATENCY_KEY, userId);
const testHistoryKey = accountScopedStorageKey(LLM_TEST_HISTORY_KEY, userId);
const loraKey = accountScopedStorageKey(LORA_HISTORY_KEY, userId);
const pingKey = accountScopedStorageKey(LLM_PING_KEY, userId);
const pingOkKey = accountScopedStorageKey(LLM_PING_OK_KEY, userId);
const soulKey = accountScopedStorageKey(SOUL_SAVED_KEY, userId);
const capLastUsedKey = accountScopedStorageKey(CAP_LAST_USED_KEY, userId);
const capUsageCountKey = accountScopedStorageKey(CAP_USAGE_COUNT_KEY, userId);
const capDowKey = accountScopedStorageKey(CAP_DOW_KEY, userId);
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

test("agent settings local history loaders ignore malformed stored rows", () => {
  localStorageState.set(
    latencyKey,
    JSON.stringify([{ ts: 1, ms: 20 }, { ts: "bad", ms: 30 }]),
  );
  localStorageState.set(
    testHistoryKey,
    JSON.stringify([
      { ts: 1, model: " claude ", ms: 42, ok: true, reason: " ok " },
      { ts: 2, model: "", ms: 42, ok: true },
      { ts: 3, model: "bad", ms: "slow", ok: true },
    ]),
  );
  localStorageState.set(
    loraKey,
    JSON.stringify([{ date: " 2026-07-18 ", score: 0.7 }, { date: "", score: 0.2 }]),
  );

  assert.deepEqual(loadLatencyHistory(userId), [{ ts: 1, ms: 20 }]);
  assert.deepEqual(loadTestHistory(userId), [{ ts: 1, model: "claude", ms: 42, ok: true, reason: "ok" }]);
  assert.deepEqual(loadLoraHistory(userId), [{ date: "2026-07-18", score: 0.7 }]);
  assert.equal(localStorageState.get(latencyKey), JSON.stringify([{ ts: 1, ms: 20 }]));
  assert.equal(
    localStorageState.get(testHistoryKey),
    JSON.stringify([{ ts: 1, model: "claude", ms: 42, ok: true, reason: "ok" }]),
  );
  assert.equal(localStorageState.get(loraKey), JSON.stringify([{ date: "2026-07-18", score: 0.7 }]));
});

test("agent settings capability usage loaders keep only valid numeric state", () => {
  localStorageState.set(capLastUsedKey, JSON.stringify({ github: 5, bad: -1, wrong: "7" }));
  localStorageState.set(capUsageCountKey, JSON.stringify({ github: 3, slack: 0, nope: null }));
  localStorageState.set(
    capDowKey,
    JSON.stringify({
      github: [1, 0, 2, 0, 0, 0, 1],
      slack: [1, 2],
      bad: [1, 0, "x", 0, 0, 0, 0],
    }),
  );

  assert.deepEqual(loadCapabilityLastUsed(userId), { github: 5 });
  assert.deepEqual(loadCapabilityUsageCount(userId), { github: 3, slack: 0 });
  assert.deepEqual(loadCapabilityDowUsage(userId), { github: [1, 0, 2, 0, 0, 0, 1] });
  assert.equal(localStorageState.get(capLastUsedKey), JSON.stringify({ github: 5 }));
  assert.equal(localStorageState.get(capUsageCountKey), JSON.stringify({ github: 3, slack: 0 }));
  assert.equal(localStorageState.get(capDowKey), JSON.stringify({ github: [1, 0, 2, 0, 0, 0, 1] }));
});

test("agent settings local state loaders clear unparseable json buckets", () => {
  localStorageState.set(latencyKey, "{bad-json");
  localStorageState.set(testHistoryKey, "{bad-json");
  localStorageState.set(loraKey, "{bad-json");
  localStorageState.set(capLastUsedKey, "{bad-json");
  localStorageState.set(capUsageCountKey, "{bad-json");
  localStorageState.set(capDowKey, "{bad-json");

  assert.deepEqual(loadLatencyHistory(userId), []);
  assert.deepEqual(loadTestHistory(userId), []);
  assert.deepEqual(loadLoraHistory(userId), []);
  assert.deepEqual(loadCapabilityLastUsed(userId), {});
  assert.deepEqual(loadCapabilityUsageCount(userId), {});
  assert.deepEqual(loadCapabilityDowUsage(userId), {});
  assert.equal(localStorageState.has(latencyKey), false);
  assert.equal(localStorageState.has(testHistoryKey), false);
  assert.equal(localStorageState.has(loraKey), false);
  assert.equal(localStorageState.has(capLastUsedKey), false);
  assert.equal(localStorageState.has(capUsageCountKey), false);
  assert.equal(localStorageState.has(capDowKey), false);
});

test("agent settings local state writers persist only normalized records", () => {
  saveLatencyHistory([{ ts: 1, ms: 20 }, { ts: "bad" as never, ms: 30 }], userId);
  saveTestHistory([
    { ts: 1, model: " claude ", ms: 42, ok: true, reason: " ok " },
    { ts: 2, model: "", ms: 42, ok: true },
    { ts: 3, model: "bad", ms: "slow" as never, ok: true },
  ], userId);
  saveLoraHistory([
    { date: " 2026-07-18 ", score: 0.7 },
    { date: "", score: 0.2 },
  ], userId);
  saveCapabilityLastUsed({ github: 5, bad: -1, wrong: "7" as never }, userId);
  saveCapabilityUsageCount({ github: 3, slack: 0, nope: null as never }, userId);
  saveCapabilityDowUsage({
    github: [1, 0, 2, 0, 0, 0, 1],
    slack: [1, 2],
    bad: [1, 0, "x" as never, 0, 0, 0, 0],
  }, userId);

  assert.equal(localStorageState.get(latencyKey), JSON.stringify([{ ts: 1, ms: 20 }]));
  assert.equal(
    localStorageState.get(testHistoryKey),
    JSON.stringify([{ ts: 1, model: "claude", ms: 42, ok: true, reason: "ok" }]),
  );
  assert.equal(localStorageState.get(loraKey), JSON.stringify([{ date: "2026-07-18", score: 0.7 }]));
  assert.equal(localStorageState.get(capLastUsedKey), JSON.stringify({ github: 5 }));
  assert.equal(localStorageState.get(capUsageCountKey), JSON.stringify({ github: 3, slack: 0 }));
  assert.equal(localStorageState.get(capDowKey), JSON.stringify({ github: [1, 0, 2, 0, 0, 0, 1] }));
});

test("agent settings timestamp and flag helpers normalize malformed stored state", () => {
  localStorageState.set(pingKey, "not-a-number");
  localStorageState.set(pingOkKey, "maybe");
  localStorageState.set(soulKey, "-7");

  assert.equal(loadLastLlmPingAt(userId), null);
  assert.equal(loadLastLlmPingOk(userId), false);
  assert.equal(loadSoulSavedAt(userId), null);
  assert.equal(localStorageState.has(pingKey), false);
  assert.equal(localStorageState.get(pingOkKey), "0");
  assert.equal(localStorageState.has(soulKey), false);
});

test("agent settings timestamp and flag writers persist normalized helper-owned values", () => {
  localStorageState.set(loraKey, JSON.stringify([{ date: "2026-07-18", score: 0.7 }]));

  const lastPingAt = saveLastLlmPingAt(1234.9, userId);
  const lastPingOk = saveLastLlmPingOk(true, userId);
  const soulSavedAt = saveSoulSavedAt(5678.2, userId);
  clearLoraHistory(userId);

  assert.equal(lastPingAt, 1234);
  assert.equal(lastPingOk, true);
  assert.equal(soulSavedAt, 5678);
  assert.equal(localStorageState.get(pingKey), "1234");
  assert.equal(localStorageState.get(pingOkKey), "1");
  assert.equal(localStorageState.get(soulKey), "5678");
  assert.equal(localStorageState.has(loraKey), false);
});

test("agent settings local append helpers preserve bounded latency and test history", () => {
  saveLatencyHistory([{ ts: 1, ms: 20 }], userId);
  saveTestHistory([{ ts: 1, model: "claude", ms: 40, ok: true, reason: "ok" }], userId);

  const latency = appendLatencyHistoryEntry({ ts: 2, ms: 30 }, userId, 2);
  const testHistory = pushTestHistoryEntry(
    { ts: 2, model: "gpt-4o-mini", ms: null, ok: false, reason: "timeout" },
    userId,
    2,
  );

  assert.deepEqual(latency, [{ ts: 1, ms: 20 }, { ts: 2, ms: 30 }]);
  assert.deepEqual(testHistory, [
    { ts: 2, model: "gpt-4o-mini", ms: null, ok: false, reason: "timeout" },
    { ts: 1, model: "claude", ms: 40, ok: true, reason: "ok" },
  ]);
  assert.equal(localStorageState.get(latencyKey), JSON.stringify(latency));
  assert.equal(localStorageState.get(testHistoryKey), JSON.stringify(testHistory));
});

test("authenticated agent settings ignore unowned legacy global storage", () => {
  localStorageState.set(LLM_LATENCY_KEY, JSON.stringify([{ ts: 1, ms: 20 }]));
  localStorageState.set(LLM_TEST_HISTORY_KEY, JSON.stringify([{ ts: 1, model: "claude", ms: 42, ok: true }]));
  localStorageState.set(LORA_HISTORY_KEY, JSON.stringify([{ date: "2026-07-18", score: 0.7 }]));
  localStorageState.set(CAP_LAST_USED_KEY, JSON.stringify({ github: 5 }));
  localStorageState.set(CAP_USAGE_COUNT_KEY, JSON.stringify({ github: 3 }));
  localStorageState.set(CAP_DOW_KEY, JSON.stringify({ github: [1, 0, 2, 0, 0, 0, 1] }));
  localStorageState.set(LLM_PING_KEY, "1234");
  localStorageState.set(LLM_PING_OK_KEY, "1");
  localStorageState.set(SOUL_SAVED_KEY, "5678");

  assert.deepEqual(loadLatencyHistory(userId), []);
  assert.deepEqual(loadTestHistory(userId), []);
  assert.deepEqual(loadLoraHistory(userId), []);
  assert.deepEqual(loadCapabilityLastUsed(userId), {});
  assert.deepEqual(loadCapabilityUsageCount(userId), {});
  assert.deepEqual(loadCapabilityDowUsage(userId), {});
  assert.equal(loadLastLlmPingAt(userId), null);
  assert.equal(loadLastLlmPingOk(userId), false);
  assert.equal(loadSoulSavedAt(userId), null);
  assert.equal(localStorageState.has(LLM_LATENCY_KEY), true);
  assert.equal(localStorageState.has(LLM_TEST_HISTORY_KEY), true);
});
