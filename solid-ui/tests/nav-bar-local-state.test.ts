import test from "node:test";
import assert from "node:assert/strict";

import {
  clearNavBarWorkflowFlag,
  loadNavBarAgentActiveSince,
  loadNavBarLastRun,
  loadNavBarLastVisited,
  loadNavBarLlmLastPingFailed,
  loadNavBarSeenFlag,
  loadNavBarSessionStarted,
  loadNavBarSessionRunsStarted,
  loadNavBarWorkflowFlag,
  saveNavBarAgentActiveSince,
  saveNavBarLastRun,
  saveNavBarLastVisited,
  saveNavBarSeenFlag,
  saveNavBarSessionStarted,
  saveNavBarSessionRunsStarted,
  saveNavBarWorkflowFlag,
} from "../src/lib/navBarLocalState.ts";

const localStorageState = new Map<string, string>();
const sessionStorageState = new Map<string, string>();

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

test("nav bar local state loaders keep only valid persisted records", () => {
  localStorageState.set("nav.lastvisit", JSON.stringify({ " search ": 10, bad: -1, wrong: "x" }));
  localStorageState.set("nav.workflow", "1");
  localStorageState.set("nav.seen", "1");
  localStorageState.set("omnyid.llm.last_ping_ok", "0");
  localStorageState.set(
    "omnyid.fleet.lastrun",
    JSON.stringify({ name: " agent ", finishedAt: 42 }),
  );
  localStorageState.set(
    "omnyid.fleet.active_since",
    JSON.stringify({ "alpha ": 5, beta: -1, wrong: "7" }),
  );
  sessionStorageState.set("omnyid.session.runs_started", "7");

  assert.deepEqual(loadNavBarLastVisited("nav.lastvisit"), { search: 10 });
  assert.equal(loadNavBarWorkflowFlag("nav.workflow"), true);
  assert.equal(loadNavBarSeenFlag("nav.seen"), true);
  assert.equal(loadNavBarLlmLastPingFailed(), true);
  assert.deepEqual(loadNavBarLastRun(), { name: "agent", finishedAt: 42 });
  assert.deepEqual(loadNavBarAgentActiveSince(), { alpha: 5 });
  assert.equal(loadNavBarSessionRunsStarted(), 7);
  assert.equal(localStorageState.get("nav.lastvisit"), JSON.stringify({ search: 10 }));
  assert.equal(localStorageState.get("omnyid.fleet.lastrun"), JSON.stringify({ name: "agent", finishedAt: 42 }));
  assert.equal(localStorageState.get("omnyid.fleet.active_since"), JSON.stringify({ alpha: 5 }));
});

test("nav bar local state loaders fall back cleanly on malformed storage", () => {
  localStorageState.set("nav.lastvisit.bad", JSON.stringify([]));
  localStorageState.set("nav.workflow.bad", "0");
  localStorageState.set("nav.seen.bad", "true");
  localStorageState.set("omnyid.fleet.lastrun", JSON.stringify({ name: "", finishedAt: "x" }));
  localStorageState.set("omnyid.fleet.active_since", JSON.stringify([]));
  sessionStorageState.set("omnyid.session.started", "-5");
  sessionStorageState.set("omnyid.session.runs_started", "bad");

  assert.deepEqual(loadNavBarLastVisited("nav.lastvisit.bad"), {});
  assert.equal(loadNavBarWorkflowFlag("nav.workflow.bad"), false);
  assert.equal(loadNavBarSeenFlag("nav.seen.bad"), false);
  assert.equal(loadNavBarLastRun(), null);
  assert.deepEqual(loadNavBarAgentActiveSince(), {});
  assert.equal(loadNavBarSessionStarted(), null);
  assert.equal(loadNavBarSessionRunsStarted(), 0);
  assert.equal(localStorageState.get("nav.workflow.bad"), "0");
  assert.equal(localStorageState.get("nav.seen.bad"), "0");
  assert.equal(localStorageState.has("omnyid.fleet.lastrun"), false);
  assert.equal(localStorageState.get("omnyid.fleet.active_since"), JSON.stringify({}));
  assert.equal(sessionStorageState.has("omnyid.session.started"), false);
  assert.equal(sessionStorageState.get("omnyid.session.runs_started"), "0");
});

test("nav bar llm ping flag canonicalizes malformed values to ok", () => {
  localStorageState.set("omnyid.llm.last_ping_ok", "maybe");

  assert.equal(loadNavBarLlmLastPingFailed(), false);
  assert.equal(localStorageState.get("omnyid.llm.last_ping_ok"), "1");
});

test("nav bar local state json loaders clear unparseable persisted values", () => {
  localStorageState.clear();
  sessionStorageState.clear();
  localStorageState.set("nav.lastvisit.corrupt", "{bad-json");
  localStorageState.set("omnyid.fleet.lastrun", "{bad-json");
  localStorageState.set("omnyid.fleet.active_since", "{bad-json");

  assert.deepEqual(loadNavBarLastVisited("nav.lastvisit.corrupt"), {});
  assert.equal(loadNavBarLastRun(), null);
  assert.deepEqual(loadNavBarAgentActiveSince(), {});
  assert.equal(localStorageState.has("nav.lastvisit.corrupt"), false);
  assert.equal(localStorageState.has("omnyid.fleet.lastrun"), false);
  assert.equal(localStorageState.has("omnyid.fleet.active_since"), false);
});

test("nav bar local state writers persist only normalized records", () => {
  localStorageState.clear();
  sessionStorageState.clear();

  saveNavBarLastVisited("nav.lastvisit.save", {
    " search ": 10,
    bad: -1,
    wrong: "x" as any,
  });
  saveNavBarWorkflowFlag("nav.workflow.save", true);
  saveNavBarSeenFlag("nav.seen.save", true);
  saveNavBarLastRun({
    name: " agent ",
    finishedAt: 42,
  });
  saveNavBarAgentActiveSince({
    "alpha ": 5,
    beta: -1,
    wrong: "7" as any,
  });
  const sessionStarted = saveNavBarSessionStarted(17.8);
  saveNavBarSessionRunsStarted(-3);

  assert.equal(
    localStorageState.get("nav.lastvisit.save"),
    JSON.stringify({ search: 10 }),
  );
  assert.equal(localStorageState.get("nav.workflow.save"), "1");
  assert.equal(localStorageState.get("nav.seen.save"), "1");
  assert.equal(
    localStorageState.get("omnyid.fleet.lastrun"),
    JSON.stringify({ name: "agent", finishedAt: 42 }),
  );
  assert.equal(
    localStorageState.get("omnyid.fleet.active_since"),
    JSON.stringify({ alpha: 5 }),
  );
  assert.equal(sessionStarted, 17);
  assert.equal(sessionStorageState.get("omnyid.session.started"), "17");
  assert.equal(sessionStorageState.get("omnyid.session.runs_started"), "0");
});

test("nav bar workflow flag helper can clear the persisted workflow-result marker", () => {
  localStorageState.set("nav.workflow.clear", "1");

  clearNavBarWorkflowFlag("nav.workflow.clear");

  assert.equal(localStorageState.has("nav.workflow.clear"), false);
});
