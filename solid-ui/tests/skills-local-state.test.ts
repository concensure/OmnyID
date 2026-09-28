import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import {
  ACTIVATION_HISTORY_KEY,
  ACTIVATION_TIMES_KEY,
  PROFILES_KEY,
  loadActivationHistory,
  loadActivationTimes,
  loadProfiles,
  saveActivationHistory,
  saveActivationTimes,
  saveProfiles,
} from "../src/lib/skillsLocalState.ts";

const userId = "user-1";
const activationTimesKey = accountScopedStorageKey(ACTIVATION_TIMES_KEY, userId);
const activationHistoryKey = accountScopedStorageKey(ACTIVATION_HISTORY_KEY, userId);
const profilesKey = accountScopedStorageKey(PROFILES_KEY, userId);
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

test("skills local state loaders filter malformed activation times, history, and profiles", () => {
  localStorageState.set(
    activationTimesKey,
    JSON.stringify({ " writing ": 1721385600000, bad: 0, wrong: "7" }),
  );
  localStorageState.set(
    activationHistoryKey,
    JSON.stringify({
      writing: [
        { activated_at: " 2026-07-18T00:00:00.000Z ", scope: " --session " },
        { activated_at: "", scope: "--session" },
        7,
      ],
      bad: "oops",
    }),
  );
  localStorageState.set(
    profilesKey,
    JSON.stringify([
      {
        id: " profile_1 ",
        name: " Deep Work ",
        skill_ids: [" writing ", "", "writing", 7, "research"],
        created_at: " 2026-07-18T00:00:00.000Z ",
      },
      {
        id: "",
        name: "Bad",
        skill_ids: ["writing"],
        created_at: "2026-07-18T00:00:00.000Z",
      },
    ]),
  );

  assert.deepEqual(loadActivationTimes(userId), { writing: 1721385600000 });
  assert.deepEqual(loadActivationHistory(userId), {
    writing: [{ activated_at: "2026-07-18T00:00:00.000Z", scope: "--session" }],
  });
  assert.deepEqual(loadProfiles(userId), [
    {
      id: "profile_1",
      name: "Deep Work",
      skill_ids: ["writing", "research"],
      created_at: "2026-07-18T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(JSON.parse(localStorageState.get(activationTimesKey) ?? "null"), {
    writing: 1721385600000,
  });
  assert.deepEqual(JSON.parse(localStorageState.get(activationHistoryKey) ?? "null"), {
    writing: [{ activated_at: "2026-07-18T00:00:00.000Z", scope: "--session" }],
  });
  assert.deepEqual(JSON.parse(localStorageState.get(profilesKey) ?? "null"), [
    {
      id: "profile_1",
      name: "Deep Work",
      skill_ids: ["writing", "research"],
      created_at: "2026-07-18T00:00:00.000Z",
    },
  ]);
});

test("skills local state loaders clear unparseable storage buckets", () => {
  localStorageState.set(activationTimesKey, "{bad json");
  localStorageState.set(activationHistoryKey, "{bad json");
  localStorageState.set(profilesKey, "{bad json");

  assert.deepEqual(loadActivationTimes(userId), {});
  assert.deepEqual(loadActivationHistory(userId), {});
  assert.deepEqual(loadProfiles(userId), []);
  assert.equal(localStorageState.has(activationTimesKey), false);
  assert.equal(localStorageState.has(activationHistoryKey), false);
  assert.equal(localStorageState.has(profilesKey), false);
});

test("skills local state writers persist only normalized activation and profile rows", () => {
  saveActivationTimes({ " writing ": 1721385600000, bad: 0 }, userId);
  saveActivationHistory({
    writing: [
      { activated_at: " 2026-07-18T00:00:00.000Z ", scope: " --session " },
      { activated_at: "", scope: "--session" },
    ],
  }, userId);
  saveProfiles([
    {
      id: " profile_1 ",
      name: " Deep Work ",
      skill_ids: [" writing ", "", "writing", "research"],
      created_at: " 2026-07-18T00:00:00.000Z ",
    },
    {
      id: "",
      name: "Bad",
      skill_ids: ["writing"],
      created_at: "2026-07-18T00:00:00.000Z",
    },
  ], userId);

  assert.deepEqual(JSON.parse(localStorageState.get(activationTimesKey) ?? "null"), {
    writing: 1721385600000,
  });
  assert.deepEqual(JSON.parse(localStorageState.get(activationHistoryKey) ?? "null"), {
    writing: [{ activated_at: "2026-07-18T00:00:00.000Z", scope: "--session" }],
  });
  assert.deepEqual(JSON.parse(localStorageState.get(profilesKey) ?? "null"), [
    {
      id: "profile_1",
      name: "Deep Work",
      skill_ids: ["writing", "research"],
      created_at: "2026-07-18T00:00:00.000Z",
    },
  ]);
});

test("skills local state migrates legacy global storage into scoped keys", () => {
  localStorageState.set(ACTIVATION_TIMES_KEY, JSON.stringify({ writing: 1721385600000 }));
  localStorageState.set(
    ACTIVATION_HISTORY_KEY,
    JSON.stringify({ writing: [{ activated_at: "2026-07-18T00:00:00.000Z", scope: "--session" }] }),
  );
  localStorageState.set(
    PROFILES_KEY,
    JSON.stringify([{ id: "profile_1", name: "Deep Work", skill_ids: ["writing"], created_at: "2026-07-18T00:00:00.000Z" }]),
  );

  assert.deepEqual(loadActivationTimes(userId), { writing: 1721385600000 });
  assert.deepEqual(loadActivationHistory(userId), {
    writing: [{ activated_at: "2026-07-18T00:00:00.000Z", scope: "--session" }],
  });
  assert.deepEqual(loadProfiles(userId), [
    { id: "profile_1", name: "Deep Work", skill_ids: ["writing"], created_at: "2026-07-18T00:00:00.000Z" },
  ]);
  assert.equal(localStorageState.has(ACTIVATION_TIMES_KEY), false);
  assert.equal(localStorageState.has(ACTIVATION_HISTORY_KEY), false);
  assert.equal(localStorageState.has(PROFILES_KEY), false);
});
