import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import {
  appendDecisionOsDiaryEntry,
  loadDecisionOsDiaryBuckets,
  loadDecisionOsDiaryEntriesForDate,
  persistDecisionOsDiaryBuckets,
  recordDecisionOsDiaryEntry,
  updateDecisionOsDiaryEntryOutcomeCheck,
} from "../src/lib/decisionOsDiaryState.js";

const userId = "user-1";
const diaryKey = accountScopedStorageKey("omnyid.diary-entries", userId);

function installLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key) ?? null : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: localStorage,
    configurable: true,
    writable: true,
  });

  return localStorage;
}

test("an authenticated diary never inherits another account's legacy unscoped entries", () => {
  const localStorage = installLocalStorage();
  localStorage.setItem("omnyid.diary-entries", JSON.stringify({
    "2026-06-27": [{
      ts: "2026-06-27T09:00:00.000Z",
      type: "note",
      icon: "n",
      title: "Belongs to a previous local session",
    }],
  }));

  assert.deepEqual(loadDecisionOsDiaryBuckets("brand-new-user"), {});
  assert.equal(localStorage.getItem(accountScopedStorageKey("omnyid.diary-entries", "brand-new-user")), null);
});

test("diary state appends a new entry to today's bucket and dispatches it", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();
  let dispatchedTitle = "";

  localStorage.setItem(
    diaryKey,
    JSON.stringify({
      "2026-06-27": [
        {
          ts: "2026-06-27T09:00:00.000Z",
          type: "note",
          icon: "n",
          title: "Existing entry",
        },
      ],
    }),
  );

  const RealDate = Date;
  class MockDate extends Date {
    constructor(...args: any[]) {
      super(args.length > 0 ? args[0] : "2026-06-27T10:00:00.000Z");
    }
    static now() {
      return new RealDate("2026-06-27T10:00:00.000Z").getTime();
    }
  }
  Object.defineProperty(globalThis, "Date", {
    value: MockDate,
    configurable: true,
    writable: true,
  });

  try {
    const nextDay = recordDecisionOsDiaryEntry(
      {
        ts: "2026-06-27T10:00:00.000Z",
        type: "decision",
        icon: "x",
        title: "Approve budget",
        meta: "approved",
        decisionId: "decision-1",
      },
      userId,
      (entry) => {
        dispatchedTitle = entry.title;
      },
    );

    assert.equal(dispatchedTitle, "Approve budget");
    assert.equal(nextDay[0]?.title, "Existing entry");
    assert.equal(nextDay[1]?.title, "Approve budget");
    assert.equal(localStorage.getItem("omnyid.diary-entries"), null);
  } finally {
    Object.defineProperty(globalThis, "Date", {
      value: RealDate,
      configurable: true,
      writable: true,
    });
  }
});

test("diary state updates matching outcome-check timestamps across buckets", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();
  const RealDate = Date;
  class MockDate extends Date {
    constructor(...args: any[]) {
      super(args.length > 0 ? args[0] : "2026-06-27T12:00:00.000Z");
    }
    static now() {
      return new RealDate("2026-06-27T12:00:00.000Z").getTime();
    }
  }
  Object.defineProperty(globalThis, "Date", {
    value: MockDate,
    configurable: true,
    writable: true,
  });

  try {
    recordDecisionOsDiaryEntry({
      ts: "2026-06-27T10:00:00.000Z",
      type: "decision",
      icon: "x",
      title: "Approve budget",
      meta: "approved",
      decisionId: "decision-1",
    }, userId, () => {});
    recordDecisionOsDiaryEntry({
      ts: "2026-06-28T10:00:00.000Z",
      type: "decision",
      icon: "x",
      title: "Approve budget follow-up",
      meta: "approved",
      decisionId: "decision-1",
    }, userId, () => {});

    const updated = updateDecisionOsDiaryEntryOutcomeCheck(
      "decision-1",
      "2026-06-30T10:00:00.000Z",
      userId,
    );

    assert.equal(updated["2026-06-27"][0]?.outcomeCheckAt, "2026-06-30T10:00:00.000Z");
    assert.equal(updated["2026-06-27"][1]?.outcomeCheckAt, "2026-06-30T10:00:00.000Z");
  } finally {
    Object.defineProperty(globalThis, "Date", {
      value: RealDate,
      configurable: true,
      writable: true,
    });
  }
});

test("diary state ignores malformed stored bucket entries", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();
  localStorage.setItem(
    diaryKey,
    JSON.stringify({
      "2026-06-27": [
        {
          ts: "2026-06-27T09:00:00.000Z",
          type: "note",
          icon: "n",
          title: "Valid entry",
        },
        {
          ts: "2026-06-27T10:00:00.000Z",
          type: "decision",
          icon: "x",
          title: 7,
        },
      ],
      "2026-06-28": "bad-bucket",
    }),
  );

  const updated = updateDecisionOsDiaryEntryOutcomeCheck(
    "decision-1",
    "2026-06-30T10:00:00.000Z",
    userId,
  );

  assert.deepEqual(updated["2026-06-27"], [
    {
      ts: "2026-06-27T09:00:00.000Z",
      type: "note",
      icon: "n",
      title: "Valid entry",
    },
  ]);
  assert.deepEqual(updated["2026-06-28"], []);
  assert.equal(
    localStorage.getItem(diaryKey),
    JSON.stringify({
      "2026-06-27": [
        {
          ts: "2026-06-27T09:00:00.000Z",
          type: "note",
          icon: "n",
          title: "Valid entry",
        },
      ],
      "2026-06-28": [],
    }),
  );
});

test("diary state clears unparseable persisted buckets", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();
  localStorage.setItem(diaryKey, "{bad-json");

  assert.deepEqual(loadDecisionOsDiaryBuckets(userId), {});
  assert.equal(localStorage.getItem("omnyid.diary-entries"), null);
  assert.equal(localStorage.getItem(diaryKey), null);
});

test("diary state persists only normalized bucket entries on save", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();
  localStorage.setItem(
    diaryKey,
    JSON.stringify({
      "2026-06-27": [
        {
          ts: "2026-06-27T09:00:00.000Z",
          type: "note",
          icon: "n",
          title: "Valid entry",
        },
      ],
      "2026-06-28": "bad-bucket",
    }),
  );

  updateDecisionOsDiaryEntryOutcomeCheck(
    "decision-1",
    "2026-06-30T10:00:00.000Z",
    userId,
  );

  assert.equal(
    localStorage.getItem(diaryKey),
    JSON.stringify({
      "2026-06-27": [
        {
          ts: "2026-06-27T09:00:00.000Z",
          type: "note",
          icon: "n",
          title: "Valid entry",
        },
      ],
      "2026-06-28": [],
    }),
  );
});

test("diary helper persists normalized buckets for component-owned saves too", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();

  const persisted = persistDecisionOsDiaryBuckets({
    "2026-07-18": [
      {
        ts: "2026-07-18T09:00:00.000Z",
        type: "note",
        icon: "n",
        title: "Valid entry",
      },
      {
        ts: "2026-07-18T10:00:00.000Z",
        type: "decision",
        icon: "x",
        title: 7,
      },
    ],
    "2026-07-19": "bad-bucket",
  } as never, userId);

  assert.deepEqual(persisted, {
    "2026-07-18": [
      {
        ts: "2026-07-18T09:00:00.000Z",
        type: "note",
        icon: "n",
        title: "Valid entry",
      },
    ],
    "2026-07-19": [],
  });
  assert.equal(
    localStorage.getItem(diaryKey),
    JSON.stringify({
      "2026-07-18": [
        {
          ts: "2026-07-18T09:00:00.000Z",
          type: "note",
          icon: "n",
          title: "Valid entry",
        },
      ],
      "2026-07-19": [],
    }),
  );
});

test("diary helper applies component-style per-day and rolling-day limits on append", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();
  localStorage.setItem(
    diaryKey,
    JSON.stringify({
      "2026-07-03": [
        {
          ts: "2026-07-03T09:00:00.000Z",
          type: "note",
          icon: "n",
          title: "Oldest kept",
        },
      ],
      "2026-07-04": [
        {
          ts: "2026-07-04T09:00:00.000Z",
          type: "note",
          icon: "n",
          title: "At daily cap",
        },
      ],
    }),
  );

  const unchanged = appendDecisionOsDiaryEntry(
    {
      ts: "2026-07-04T10:00:00.000Z",
      type: "note",
      icon: "n",
      title: "Should not append",
    },
    userId,
    { maxEntriesPerDay: 1, maxDays: 2 },
  );
  assert.deepEqual(unchanged["2026-07-04"], [
    {
      ts: "2026-07-04T09:00:00.000Z",
      type: "note",
      icon: "n",
      title: "At daily cap",
    },
  ]);

  const appended = appendDecisionOsDiaryEntry(
    {
      ts: "2026-07-05T10:00:00.000Z",
      type: "note",
      icon: "n",
      title: "Newest kept",
    },
    userId,
    { maxEntriesPerDay: 2, maxDays: 2 },
  );

  assert.deepEqual(appended, {
    "2026-07-04": [
      {
        ts: "2026-07-04T09:00:00.000Z",
        type: "note",
        icon: "n",
        title: "At daily cap",
      },
    ],
    "2026-07-05": [
      {
        ts: "2026-07-05T10:00:00.000Z",
        type: "note",
        icon: "n",
        title: "Newest kept",
      },
    ],
  });
});

test("diary helper loads one day of entries sorted chronologically", () => {
  const localStorage = installLocalStorage();
  localStorage.clear();
  localStorage.setItem(
    diaryKey,
    JSON.stringify({
      "2026-07-19": [
        {
          ts: "2026-07-19T12:00:00.000Z",
          type: "note",
          icon: "n",
          title: "Later",
        },
        {
          ts: "2026-07-19T09:00:00.000Z",
          type: "note",
          icon: "n",
          title: "Earlier",
        },
      ],
    }),
  );

  assert.deepEqual(loadDecisionOsDiaryEntriesForDate("2026-07-19", userId), [
    {
      ts: "2026-07-19T09:00:00.000Z",
      type: "note",
      icon: "n",
      title: "Earlier",
    },
    {
      ts: "2026-07-19T12:00:00.000Z",
      type: "note",
      icon: "n",
      title: "Later",
    },
  ]);
});
