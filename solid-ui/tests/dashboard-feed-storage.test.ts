import test from "node:test";
import assert from "node:assert/strict";

import {
  clearDashboardFeedStoredStringSet,
  clearDashboardFeedLayout,
  loadDashboardFeedReadAt,
  loadDashboardFeedSeenFlag,
  loadDashboardFeedMillis,
  loadDashboardFeedSnoozed,
  loadDashboardFeedStoredLayout,
  loadDashboardFeedStoredSnoozed,
  loadDashboardFeedStoredStringSet,
  pruneExpiredDashboardFeedSnoozed,
  pruneDashboardFeedSnoozedAgainstDismissed,
  loadDashboardFeedStringSet,
  removeDashboardFeedSnoozedIds,
  removeDashboardFeedStringSetIds,
  pruneDashboardFeedSnoozed,
  pruneDashboardFeedStringSet,
  readLocalStorageValue,
  readSessionStorageValue,
  removeLocalStorageValue,
  saveDashboardFeedReadAt,
  saveDashboardFeedGridLayout,
  saveDashboardFeedSeenFlag,
  saveDashboardFeedStoredLayout,
  saveDashboardFeedStoredSnoozed,
  saveDashboardFeedStoredStringSet,
  serializeDashboardFeedSnoozed,
  writeLocalStorageValue,
  writeSessionStorageValue,
} from "../src/lib/dashboardFeedStorage.ts";

test("loadDashboardFeedStringSet keeps only non-empty strings", () => {
  assert.deepEqual(
    [...loadDashboardFeedStringSet('["card-a", "", 42, null, "card-b", "card-a"]')].sort(),
    ["card-a", "card-b"],
  );
});

test("loadDashboardFeedStringSet returns an empty set for malformed payloads", () => {
  assert.equal(loadDashboardFeedStringSet("{bad json").size, 0);
  assert.equal(loadDashboardFeedStringSet('{"not":"an array"}').size, 0);
});

test("dashboard feed stored string-set helpers normalize malformed storage and persist normalized ids", () => {
  const localStorageState = new Map<string, string>();
  const originalLocalStorage = globalThis.localStorage;
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
  try {
    localStorageState.set("feed.set", JSON.stringify(["card-a", "", 42, null, "card-b", "card-a"]));
    assert.deepEqual([...loadDashboardFeedStoredStringSet("feed.set")].sort(), ["card-a", "card-b"]);
    assert.equal(localStorageState.get("feed.set"), JSON.stringify(["card-a", "card-b"]));

    localStorageState.set("feed.set.corrupt", "{bad-json");
    assert.equal(loadDashboardFeedStoredStringSet("feed.set.corrupt").size, 0);
    assert.equal(localStorageState.has("feed.set.corrupt"), false);

    const saved = saveDashboardFeedStoredStringSet("feed.set", new Set(["card-a", "", "card-b", "card-a"] as any));
    assert.deepEqual([...saved].sort(), ["card-a", "card-b"]);
    assert.equal(localStorageState.get("feed.set"), JSON.stringify(["card-a", "card-b"]));
  } finally {
    Object.assign(globalThis, { localStorage: originalLocalStorage });
  }
});

test("dashboard feed stored string-set clear helper removes the saved key", () => {
  const localStorageState = new Map<string, string>();
  const originalLocalStorage = globalThis.localStorage;
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
  try {
    localStorageState.set("feed.set", JSON.stringify(["card-a"]));
    clearDashboardFeedStoredStringSet("feed.set");
    assert.equal(localStorageState.has("feed.set"), false);
  } finally {
    Object.assign(globalThis, { localStorage: originalLocalStorage });
  }
});

test("loadDashboardFeedSnoozed keeps only positive finite numeric wake times", () => {
  const snoozed = loadDashboardFeedSnoozed('{"card-a":123,"card-b":0,"card-c":-5,"card-d":"123","card-e":null,"card-f":456}');
  assert.deepEqual([...snoozed.entries()], [["card-a", 123], ["card-f", 456]]);
});

test("loadDashboardFeedSnoozed returns an empty map for malformed payloads", () => {
  assert.equal(loadDashboardFeedSnoozed("{bad json").size, 0);
  assert.equal(loadDashboardFeedSnoozed('["not","an","object"]').size, 0);
});

test("dashboard feed stored snoozed helpers normalize malformed storage and persist normalized wake times", () => {
  const sessionStorageState = new Map<string, string>();
  const originalSessionStorage = globalThis.sessionStorage;
  Object.assign(globalThis, {
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
  });
  try {
    sessionStorageState.set("feed.snoozed", JSON.stringify({ "card-a": 123, "": 5, "card-b": 0, "card-c": 456 }));
    assert.deepEqual([...loadDashboardFeedStoredSnoozed("feed.snoozed").entries()], [["card-a", 123], ["card-c", 456]]);
    assert.equal(sessionStorageState.get("feed.snoozed"), JSON.stringify({ "card-a": 123, "card-c": 456 }));

    sessionStorageState.set("feed.snoozed.corrupt", "{bad-json");
    assert.equal(loadDashboardFeedStoredSnoozed("feed.snoozed.corrupt").size, 0);
    assert.equal(sessionStorageState.has("feed.snoozed.corrupt"), false);

    const saved = saveDashboardFeedStoredSnoozed(
      "feed.snoozed",
      new Map([["card-a", 123], ["", 5], ["card-b", 0], ["card-c", 456]]),
    );
    assert.deepEqual([...saved.entries()], [["card-a", 123], ["card-c", 456]]);
    assert.equal(
      sessionStorageState.get("feed.snoozed"),
      JSON.stringify({ "card-a": 123, "card-c": 456 }),
    );
  } finally {
    Object.assign(globalThis, { sessionStorage: originalSessionStorage });
  }
});

test("serializeDashboardFeedSnoozed round-trips valid entries", () => {
  const input = new Map<string, number>([["card-a", 111], ["card-b", 222]]);
  assert.deepEqual([...loadDashboardFeedSnoozed(serializeDashboardFeedSnoozed(input)).entries()], [...input.entries()]);
});

test("serializeDashboardFeedSnoozed drops malformed ids and wake times", () => {
  const input = new Map<string, number>([
    ["card-a", 111],
    ["", 222],
    ["card-b", 0],
    ["card-c", Number.NaN],
  ]);

  assert.equal(
    serializeDashboardFeedSnoozed(input),
    JSON.stringify({
      "card-a": 111,
    }),
  );
});

test("loadDashboardFeedMillis accepts only positive integer-like values", () => {
  assert.equal(loadDashboardFeedMillis("123"), 123);
  assert.equal(loadDashboardFeedMillis("0010"), 10);
  assert.equal(loadDashboardFeedMillis("0"), 0);
  assert.equal(loadDashboardFeedMillis("-5"), 0);
  assert.equal(loadDashboardFeedMillis("abc"), 0);
  assert.equal(loadDashboardFeedMillis(null), 0);
});

test("dashboard feed read-at helper normalizes malformed stored values and persists normalized millis", () => {
  const localStorageState = new Map<string, string>();
  const originalLocalStorage = globalThis.localStorage;
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
  try {
    localStorageState.set("feed.read-at", "bad");
    assert.equal(loadDashboardFeedReadAt("feed.read-at"), 0);

    const saved = saveDashboardFeedReadAt("feed.read-at", 1234.9);
    assert.equal(saved, 1234);
    assert.equal(localStorageState.get("feed.read-at"), "1234");
  } finally {
    Object.assign(globalThis, { localStorage: originalLocalStorage });
  }
});

test("dashboard feed seen-flag helper uses an explicit 1/0 contract", () => {
  const localStorageState = new Map<string, string>();
  const originalLocalStorage = globalThis.localStorage;
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
  try {
    localStorageState.set("feed.seen", "yes");
    assert.equal(loadDashboardFeedSeenFlag("feed.seen"), false);

    assert.equal(saveDashboardFeedSeenFlag("feed.seen", true), true);
    assert.equal(localStorageState.get("feed.seen"), "1");

    assert.equal(saveDashboardFeedSeenFlag("feed.seen", false), false);
    assert.equal(localStorageState.get("feed.seen"), "0");
  } finally {
    Object.assign(globalThis, { localStorage: originalLocalStorage });
  }
});

test("dashboard feed layout clear helper removes the saved layout key", () => {
  const localStorageState = new Map<string, string>();
  const originalLocalStorage = globalThis.localStorage;
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
  try {
    localStorageState.set("feed.layout", JSON.stringify([{ id: "card-a" }]));
    clearDashboardFeedLayout("feed.layout");
    assert.equal(localStorageState.has("feed.layout"), false);
  } finally {
    Object.assign(globalThis, { localStorage: originalLocalStorage });
  }
});

test("dashboard feed stored layout helpers normalize malformed rows and persist only visible ids", () => {
  const localStorageState = new Map<string, string>();
  const originalLocalStorage = globalThis.localStorage;
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
  try {
    localStorageState.set(
      "feed.layout",
      JSON.stringify([{ id: "card-a", x: 0 }, null, { id: "card-b", x: 1 }, { id: "card-c", x: 2 }]),
    );
    assert.deepEqual(
      loadDashboardFeedStoredLayout("feed.layout", ["card-a", "card-c"]).map((item) => item.id),
      ["card-a", "card-c"],
    );
    assert.equal(
      localStorageState.get("feed.layout"),
      JSON.stringify([{ id: "card-a", x: 0 }, { id: "card-c", x: 2 }]),
    );

    localStorageState.set("feed.layout.corrupt", "{bad-json");
    assert.deepEqual(loadDashboardFeedStoredLayout("feed.layout.corrupt", ["card-a"]), []);
    assert.equal(localStorageState.has("feed.layout.corrupt"), false);

    const saved = saveDashboardFeedStoredLayout(
      "feed.layout",
      [{ id: "card-a", x: 0 }, { id: "card-b", x: 1 }, { "gs-id": "card-c", x: 2 }] as Array<Record<string, unknown>>,
      ["card-a", "card-c"],
    );
    assert.deepEqual(saved.map((item) => item.id ?? item["gs-id"]), ["card-a", "card-c"]);
    assert.equal(
      localStorageState.get("feed.layout"),
      JSON.stringify([{ id: "card-a", x: 0 }, { "gs-id": "card-c", x: 2 }]),
    );
  } finally {
    Object.assign(globalThis, { localStorage: originalLocalStorage });
  }
});

test("dashboard feed grid-layout helper normalizes grid output and tolerates grid save failures", () => {
  const localStorageState = new Map<string, string>();
  const originalLocalStorage = globalThis.localStorage;
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
  try {
    const saveCalls: unknown[] = [];
    const saved = saveDashboardFeedGridLayout(
      "feed.layout",
      {
        save(saveContent?: boolean) {
          saveCalls.push(saveContent);
          return [
            { id: "card-a", x: 0, content: '<div class="drag-handle">stale card markup</div>' },
            { id: "card-b", x: 1 },
            { "gs-id": "card-c", x: 2 },
          ];
        },
      },
      ["card-a", "card-c"],
    );
    // GridStack.save() defaults saveContent to true, which would capture each
    // card's live innerHTML (drag-handle markup included) into the saved
    // layout. The call site must explicitly opt out.
    assert.deepEqual(saveCalls, [false]);
    assert.deepEqual(saved?.map((item) => item.id ?? item["gs-id"]), ["card-a", "card-c"]);
    assert.ok(saved?.every((item) => !("content" in item)));
    assert.equal(
      localStorageState.get("feed.layout"),
      JSON.stringify([{ id: "card-a", x: 0 }, { "gs-id": "card-c", x: 2 }]),
    );

    assert.equal(
      saveDashboardFeedGridLayout(
        "feed.layout",
        {
          save() {
            throw new Error("grid save failed");
          },
        },
        ["card-a"],
      ),
      null,
    );
    assert.equal(
      localStorageState.get("feed.layout"),
      JSON.stringify([{ id: "card-a", x: 0 }, { "gs-id": "card-c", x: 2 }]),
    );
  } finally {
    Object.assign(globalThis, { localStorage: originalLocalStorage });
  }
});

test("pruneDashboardFeedStringSet drops ids that no longer exist", () => {
  const validIds = new Set(["card-a", "card-c"]);
  assert.deepEqual([...pruneDashboardFeedStringSet(new Set(["card-a", "card-b", "card-c"]), validIds)].sort(), ["card-a", "card-c"]);
});

test("removeDashboardFeedStringSetIds removes only the requested ids", () => {
  assert.deepEqual(
    [...removeDashboardFeedStringSetIds(new Set(["card-a", "card-b", "card-c"]), new Set(["card-b", "card-d"]))].sort(),
    ["card-a", "card-c"],
  );
});

test("pruneDashboardFeedSnoozed drops stale ids and keeps live wake times", () => {
  const validIds = new Set(["card-a", "card-c"]);
  const pruned = pruneDashboardFeedSnoozed(new Map([["card-a", 100], ["card-b", 200], ["card-c", 300]]), validIds);
  assert.deepEqual([...pruned.entries()], [["card-a", 100], ["card-c", 300]]);
});

test("removeDashboardFeedSnoozedIds removes only the requested ids", () => {
  const pruned = removeDashboardFeedSnoozedIds(
    new Map([["card-a", 100], ["card-b", 200], ["card-c", 300]]),
    new Set(["card-b", "card-d"]),
  );
  assert.deepEqual([...pruned.entries()], [["card-a", 100], ["card-c", 300]]);
});

test("pruneExpiredDashboardFeedSnoozed drops expired wake times", () => {
  const pruned = pruneExpiredDashboardFeedSnoozed(
    new Map([["card-a", 100], ["card-b", 200], ["card-c", 400]]),
    200,
  );
  assert.deepEqual([...pruned.entries()], [["card-c", 400]]);
});

test("pruneDashboardFeedSnoozedAgainstDismissed removes overlapping dismissed ids", () => {
  const pruned = pruneDashboardFeedSnoozedAgainstDismissed(
    new Map([["card-a", 100], ["card-b", 200], ["card-c", 300]]),
    new Set(["card-b", "card-d"]),
  );
  assert.deepEqual([...pruned.entries()], [["card-a", 100], ["card-c", 300]]);
});

test("safe storage wrappers tolerate storage access failures", () => {
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  const throwingStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  Object.assign(globalThis, {
    localStorage: throwingStorage,
    sessionStorage: throwingStorage,
  });
  try {
    assert.equal(readLocalStorageValue("feed"), null);
    assert.equal(readSessionStorageValue("feed"), null);
    assert.doesNotThrow(() => writeLocalStorageValue("feed", "value"));
    assert.doesNotThrow(() => writeSessionStorageValue("feed", "value"));
    assert.doesNotThrow(() => removeLocalStorageValue("feed"));
  } finally {
    Object.assign(globalThis, {
      localStorage: originalLocalStorage,
      sessionStorage: originalSessionStorage,
    });
  }
});
