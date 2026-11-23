import test from "node:test";
import assert from "node:assert/strict";

import {
  loadReasoningTraceExpanded,
  reasoningTraceStorageKey,
  saveReasoningTraceExpanded,
} from "../src/lib/generativeCardLocalState.ts";

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

test("reasoning trace storage key includes thread, card, and section ids", () => {
  assert.equal(
    reasoningTraceStorageKey("thread-1", "card-2", "section-3"),
    "omnyid.reasoning-trace:thread-1:card-2:section-3",
  );
});

test("reasoning trace expansion defaults to collapsed for malformed stored values", () => {
  sessionStorageState.set("omnyid.reasoning-trace:t:c:s", "yes");
  assert.equal(loadReasoningTraceExpanded("omnyid.reasoning-trace:t:c:s"), false);
  assert.equal(sessionStorageState.get("omnyid.reasoning-trace:t:c:s"), "0");
  assert.equal(loadReasoningTraceExpanded(null), false);
});

test("reasoning trace expansion persists explicit expanded and collapsed flags", () => {
  const storageKey = reasoningTraceStorageKey("thread-1", "card-2", "section-3");

  saveReasoningTraceExpanded(storageKey, true);
  assert.equal(sessionStorageState.get(storageKey), "1");
  assert.equal(loadReasoningTraceExpanded(storageKey), true);

  saveReasoningTraceExpanded(storageKey, false);
  assert.equal(sessionStorageState.get(storageKey), "0");
  assert.equal(loadReasoningTraceExpanded(storageKey), false);
});
