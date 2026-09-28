import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import { loadUserProfile, PROFILE_KEY, saveUserProfile } from "../src/lib/profileLocalState.ts";

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

test("loadUserProfile normalizes malformed persisted profile rows", () => {
  localStorageState.clear();
  localStorageState.set(
    accountScopedStorageKey(PROFILE_KEY, "user-1"),
    JSON.stringify({
      displayName: "  Ozan  ",
      bio: 7,
      avatar: "  🙂  ",
      websites: [" github ", "", "github", 9, " x "],
    }),
  );

  assert.deepEqual(loadUserProfile("user-1"), {
    displayName: "Ozan",
    bio: "",
    avatar: "🙂",
    websites: ["github", "x"],
  });
});

test("loadUserProfile falls back to defaults for malformed persisted payloads", () => {
  localStorageState.clear();
  localStorageState.set(accountScopedStorageKey(PROFILE_KEY, "user-1"), JSON.stringify(["bad"]));

  assert.deepEqual(loadUserProfile("user-1"), {
    displayName: "",
    bio: "",
    avatar: "🧑",
    websites: [],
  });
});

test("saveUserProfile persists the normalized profile contract", () => {
  localStorageState.clear();
  saveUserProfile({
    displayName: "  Ozan  ",
    bio: "  builder  ",
    avatar: "   ",
    websites: [" github ", "", "github", " x "],
  }, "user-1");

  assert.deepEqual(JSON.parse(localStorageState.get(accountScopedStorageKey(PROFILE_KEY, "user-1")) ?? "null"), {
    displayName: "Ozan",
    bio: "builder",
    avatar: "🧑",
    websites: ["github", "x"],
  });
});

test("loadUserProfile rewrites normalized persisted profiles", () => {
  localStorageState.clear();
  localStorageState.set(
    accountScopedStorageKey(PROFILE_KEY, "user-1"),
    JSON.stringify({
      displayName: "  Ozan  ",
      bio: 7,
      avatar: "  A  ",
      websites: [" github ", "", "github", 9, " x "],
    }),
  );

  assert.deepEqual(loadUserProfile("user-1"), {
    displayName: "Ozan",
    bio: "",
    avatar: "A",
    websites: ["github", "x"],
  });
  assert.deepEqual(JSON.parse(localStorageState.get(accountScopedStorageKey(PROFILE_KEY, "user-1")) ?? "null"), {
    displayName: "Ozan",
    bio: "",
    avatar: "A",
    websites: ["github", "x"],
  });
});

test("loadUserProfile clears unparseable persisted profiles", () => {
  localStorageState.clear();
  localStorageState.set(accountScopedStorageKey(PROFILE_KEY, "user-1"), "{bad json");

  const profile = loadUserProfile("user-1");
  assert.equal(profile.displayName, "");
  assert.equal(profile.bio, "");
  assert.equal(profile.avatar.length > 0, true);
  assert.deepEqual(profile.websites, []);
  assert.equal(localStorageState.has(accountScopedStorageKey(PROFILE_KEY, "user-1")), false);
});

test("loadUserProfile migrates legacy global profile storage into the scoped key", () => {
  localStorageState.clear();
  localStorageState.set(PROFILE_KEY, JSON.stringify({ displayName: " Ozan " }));

  assert.deepEqual(loadUserProfile("user-1"), {
    displayName: "Ozan",
    bio: "",
    avatar: "🧑",
    websites: [],
  });
  assert.equal(localStorageState.has(PROFILE_KEY), false);
  assert.equal(
    localStorageState.get(accountScopedStorageKey(PROFILE_KEY, "user-1")),
    JSON.stringify({ displayName: "Ozan", bio: "", avatar: "🧑", websites: [] }),
  );
});
