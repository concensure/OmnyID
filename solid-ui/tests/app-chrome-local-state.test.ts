import test from "node:test";
import assert from "node:assert/strict";

import {
  advancedNavStorageKey,
  loadAdvancedNavEnabled,
  loadSidebarSeen,
  loadThreadSeenCount,
  loadWorkflowNewResultFlag,
  saveAdvancedNavEnabled,
  saveSidebarSeen,
  saveThreadSeenCount,
  saveWorkflowNewResultFlag,
  sidebarSeenStorageKey,
  threadSeenCountStorageKey,
  workflowNewResultStorageKey,
} from "../src/lib/appChromeLocalState.ts";

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

test("app chrome local state builds scoped keys", () => {
  assert.equal(workflowNewResultStorageKey("user-1"), "omnyid.workflow.new_result.user-1");
  assert.equal(threadSeenCountStorageKey("user-1"), "omnyid.thread.seen_count.user-1");
  assert.equal(advancedNavStorageKey("user-1"), "omnyid.nav.advanced.user-1");
  assert.equal(sidebarSeenStorageKey("user-1"), "omnyid.sidebar.seen.user-1");
});

test("app chrome local state loaders normalize malformed stored values", () => {
  localStorageState.set(threadSeenCountStorageKey("user-2"), "-7");
  localStorageState.set(advancedNavStorageKey("user-2"), "yes");
  localStorageState.set(workflowNewResultStorageKey("user-2"), "0");
  localStorageState.set(sidebarSeenStorageKey("user-2"), "true");

  assert.equal(loadThreadSeenCount("user-2"), 0);
  assert.equal(loadAdvancedNavEnabled("user-2"), false);
  assert.equal(loadWorkflowNewResultFlag("user-2"), false);
  assert.equal(loadSidebarSeen("user-2"), false);
  assert.equal(localStorageState.get(threadSeenCountStorageKey("user-2")), "0");
  assert.equal(localStorageState.get(advancedNavStorageKey("user-2")), "0");
  assert.equal(localStorageState.has(workflowNewResultStorageKey("user-2")), false);
  assert.equal(localStorageState.get(sidebarSeenStorageKey("user-2")), "0");
});

test("app chrome local state writers persist normalized values", () => {
  assert.equal(saveThreadSeenCount("user-3", 12.9), 12);
  assert.equal(localStorageState.get(threadSeenCountStorageKey("user-3")), "12");

  assert.equal(saveAdvancedNavEnabled("user-3", true), true);
  assert.equal(localStorageState.get(advancedNavStorageKey("user-3")), "1");

  assert.equal(saveSidebarSeen("user-3", true), true);
  assert.equal(localStorageState.get(sidebarSeenStorageKey("user-3")), "1");

  assert.equal(saveWorkflowNewResultFlag("user-3", true), true);
  assert.equal(localStorageState.get(workflowNewResultStorageKey("user-3")), "1");

  assert.equal(saveWorkflowNewResultFlag("user-3", false), false);
  assert.equal(localStorageState.has(workflowNewResultStorageKey("user-3")), false);
});
