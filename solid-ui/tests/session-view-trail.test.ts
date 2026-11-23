import test from "node:test";
import assert from "node:assert/strict";

import {
  loadSessionViewTrail,
  recordSessionViewVisit,
  saveSessionViewTrail,
  SESSION_VIEW_TRAIL_KEY,
  type SessionViewTrailEntry,
} from "../src/lib/sessionViewTrail.ts";

const sessionStorageState = new Map<string, string>();

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

test("recordSessionViewVisit moves the newest visit to the front without duplicates", () => {
  const entries: SessionViewTrailEntry[] = [
    { view: "threads", viewedAt: 100 },
    { view: "email", viewedAt: 90 },
    { view: "search", viewedAt: 80 },
  ];

  assert.deepEqual(
    recordSessionViewVisit(entries, "email", 120),
    [
      { view: "email", viewedAt: 120 },
      { view: "threads", viewedAt: 100 },
      { view: "search", viewedAt: 80 },
    ],
  );
});

test("loadSessionViewTrail sorts by recency and discards invalid rows", () => {
  sessionStorageState.set(
    SESSION_VIEW_TRAIL_KEY,
    JSON.stringify([
      { view: " email ", viewedAt: 20 },
      { view: "not-a-real-view", viewedAt: 50 },
      { nope: true },
      { view: "threads", viewedAt: 40 },
      { view: "search", viewedAt: 10 },
    ]),
  );

  assert.deepEqual(
    loadSessionViewTrail(),
    [
      { view: "threads", viewedAt: 40 },
      { view: "email", viewedAt: 20 },
      { view: "search", viewedAt: 10 },
    ],
  );
  assert.equal(
    sessionStorageState.get(SESSION_VIEW_TRAIL_KEY),
    JSON.stringify([
      { view: "threads", viewedAt: 40 },
      { view: "email", viewedAt: 20 },
      { view: "search", viewedAt: 10 },
    ]),
  );
});

test("loadSessionViewTrail clears unparseable persisted trails", () => {
  sessionStorageState.set(SESSION_VIEW_TRAIL_KEY, "{bad-json");

  assert.deepEqual(loadSessionViewTrail(), []);
  assert.equal(sessionStorageState.has(SESSION_VIEW_TRAIL_KEY), false);
});

test("saveSessionViewTrail persists only normalized recent view rows", () => {
  const saved = saveSessionViewTrail([
    { view: " email " as never, viewedAt: 20 },
    { view: "not-a-real-view" as never, viewedAt: 50 },
    { view: "threads", viewedAt: 40 },
    { view: "search", viewedAt: Number.NaN },
  ]);

  assert.deepEqual(saved, [
    { view: "threads", viewedAt: 40 },
    { view: "email", viewedAt: 20 },
  ]);
  assert.equal(
    sessionStorageState.get(SESSION_VIEW_TRAIL_KEY),
    JSON.stringify([
      { view: "threads", viewedAt: 40 },
      { view: "email", viewedAt: 20 },
    ]),
  );
});
