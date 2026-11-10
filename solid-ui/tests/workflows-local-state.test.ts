import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import {
  NODE_COMMENTS_KEY,
  WORKFLOW_BRANCH_FAMILY_COLLAPSE_STORAGE_KEY,
  WORKFLOW_HAS_RUN_KEY,
  WORKFLOW_RUN_STATS_KEY,
  WORKFLOW_TAGS_STORAGE_KEY,
  WORKFLOW_VERSIONS_KEY,
  loadCollapsedWorkflowBranchFamilies,
  loadWorkflowHasRun,
  loadWorkflowNodeComments,
  loadWorkflowRunStats,
  loadWorkflowTags,
  loadWorkflowVersions,
  saveCollapsedWorkflowBranchFamilies,
  saveWorkflowHasRun,
  saveWorkflowNodeComments,
  saveWorkflowRunStats,
  saveWorkflowTags,
  saveWorkflowVersions,
  workflowHasRunAfterMark,
  workflowRunStatsAfterUpdate,
  workflowRunStatsFromRuns,
  workflowVersionsAfterSnapshot,
} from "../src/lib/workflowsLocalState.ts";

function createStorage() {
  const storage = new Map<string, string>();
  return {
    getItem(key: string) {
      return storage.has(key) ? storage.get(key)! : null;
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
    removeItem(key: string) {
      storage.delete(key);
    },
    clear() {
      storage.clear();
    },
  };
}

function createThrowingStorage() {
  return {
    getItem() {
      throw new Error("storage read blocked");
    },
    setItem() {
      throw new Error("storage write blocked");
    },
    removeItem() {
      throw new Error("storage remove blocked");
    },
    clear() {
      throw new Error("storage clear blocked");
    },
  };
}

test("workflow local state loaders filter malformed persisted values", () => {
  const localStorage = createStorage();
  const userId = "user-1";
  const tagsKey = accountScopedStorageKey(WORKFLOW_TAGS_STORAGE_KEY, userId);
  const commentsKey = accountScopedStorageKey(NODE_COMMENTS_KEY, userId);
  const hasRunKey = accountScopedStorageKey(WORKFLOW_HAS_RUN_KEY, userId);
  const runStatsKey = accountScopedStorageKey(WORKFLOW_RUN_STATS_KEY, userId);
  const versionsKey = accountScopedStorageKey(WORKFLOW_VERSIONS_KEY, userId);
  const collapsedKey = accountScopedStorageKey(WORKFLOW_BRANCH_FAMILY_COLLAPSE_STORAGE_KEY, userId);
  Object.assign(globalThis, {
    localStorage,
    window: { localStorage },
  });

  localStorage.setItem(
    tagsKey,
    JSON.stringify({
      "workflow-a": ["alpha", " Alpha ", "   "],
      "   ": ["ignored"],
      "workflow-b": "not-an-array",
    }),
  );
  localStorage.setItem(
    commentsKey,
    JSON.stringify({
      "node-a": " keep trimmed comment ",
      "node-empty": "   ",
      "   ": "ignored",
      "node-b": 2,
    }),
  );
  localStorage.setItem(
    hasRunKey,
    JSON.stringify(["workflow-a", "   ", 3]),
  );
  localStorage.setItem(
    runStatsKey,
    JSON.stringify({
      "workflow-a": { ok: 2, fail: 1 },
      "workflow-b": { ok: -1, fail: 1 },
      "workflow-c": { ok: "2", fail: 0 },
    }),
  );
  localStorage.setItem(
    versionsKey,
    JSON.stringify({
      "workflow-a": [
        { nodes: [], ts: "2026-07-18T00:00:00.000Z" },
        { nodes: [], ts: "   " },
        { nodes: [], ts: "not-a-date" },
        { nodes: "bad", ts: "2026-07-18T00:00:00.000Z" },
      ],
      "   ": [{ nodes: [], ts: "2026-07-18T00:00:00.000Z" }],
      "workflow-b": "bad",
    }),
  );
  localStorage.setItem(
    collapsedKey,
    JSON.stringify(["family-a", "   ", 4]),
  );

  assert.deepEqual(loadWorkflowTags(userId), { "workflow-a": ["alpha"] });
  assert.deepEqual(loadWorkflowNodeComments(userId), { "node-a": "keep trimmed comment" });
  assert.deepEqual([...loadWorkflowHasRun(userId)], ["workflow-a"]);
  assert.deepEqual(loadWorkflowRunStats(userId), { "workflow-a": { ok: 2, fail: 1 } });
  assert.deepEqual(loadWorkflowVersions(userId), {
    "workflow-a": [{ nodes: [], ts: "2026-07-18T00:00:00.000Z" }],
  });
  assert.deepEqual([...loadCollapsedWorkflowBranchFamilies(userId)], ["family-a"]);
  assert.equal(
    localStorage.getItem(tagsKey),
    JSON.stringify({ "workflow-a": ["alpha"] }),
  );
  assert.equal(
    localStorage.getItem(commentsKey),
    JSON.stringify({ "node-a": "keep trimmed comment" }),
  );
  assert.equal(localStorage.getItem(hasRunKey), JSON.stringify(["workflow-a"]));
  assert.equal(
    localStorage.getItem(runStatsKey),
    JSON.stringify({ "workflow-a": { ok: 2, fail: 1 } }),
  );
  assert.equal(
    localStorage.getItem(versionsKey),
    JSON.stringify({ "workflow-a": [{ nodes: [], ts: "2026-07-18T00:00:00.000Z" }] }),
  );
  assert.equal(
    localStorage.getItem(collapsedKey),
    JSON.stringify(["family-a"]),
  );
});

test("workflow local state loaders clear unparseable persisted json", () => {
  const localStorage = createStorage();
  const userId = "user-1";
  Object.assign(globalThis, {
    localStorage,
    window: { localStorage },
  });
  const keys = [
    accountScopedStorageKey(WORKFLOW_TAGS_STORAGE_KEY, userId),
    accountScopedStorageKey(NODE_COMMENTS_KEY, userId),
    accountScopedStorageKey(WORKFLOW_HAS_RUN_KEY, userId),
    accountScopedStorageKey(WORKFLOW_RUN_STATS_KEY, userId),
    accountScopedStorageKey(WORKFLOW_VERSIONS_KEY, userId),
    accountScopedStorageKey(WORKFLOW_BRANCH_FAMILY_COLLAPSE_STORAGE_KEY, userId),
  ];
  for (const key of keys) localStorage.setItem(key, "{bad-json");

  assert.deepEqual(loadWorkflowTags(userId), {});
  assert.deepEqual(loadWorkflowNodeComments(userId), {});
  assert.deepEqual([...loadWorkflowHasRun(userId)], []);
  assert.deepEqual(loadWorkflowRunStats(userId), {});
  assert.deepEqual(loadWorkflowVersions(userId), {});
  assert.deepEqual([...loadCollapsedWorkflowBranchFamilies(userId)], []);
  for (const key of keys) assert.equal(localStorage.getItem(key), null);
});

test("workflow local state tolerates unavailable browser storage", () => {
  Object.assign(globalThis, {
    localStorage: undefined,
    window: {},
  });

  assert.doesNotThrow(() => saveWorkflowTags({ "workflow-a": ["alpha"] }, "user-1"));
  assert.doesNotThrow(() => saveWorkflowNodeComments({ "node-a": "comment" }, "user-1"));
  assert.doesNotThrow(() => saveWorkflowHasRun(new Set(["workflow-a"]), "user-1"));
  assert.doesNotThrow(() => saveWorkflowRunStats({ "workflow-a": { ok: 1, fail: 0 } }, "user-1"));
  assert.doesNotThrow(() =>
    saveWorkflowVersions({ "workflow-a": [{ nodes: [], ts: "2026-07-18T00:00:00.000Z" }] }, "user-1"),
  );
  assert.doesNotThrow(() => saveCollapsedWorkflowBranchFamilies(new Set(["family-a"]), "user-1"));

  assert.deepEqual(loadWorkflowTags("user-1"), {});
  assert.deepEqual(loadWorkflowNodeComments("user-1"), {});
  assert.deepEqual([...loadWorkflowHasRun("user-1")], []);
  assert.deepEqual(loadWorkflowRunStats("user-1"), {});
  assert.deepEqual(loadWorkflowVersions("user-1"), {});
  assert.deepEqual([...loadCollapsedWorkflowBranchFamilies("user-1")], []);
});

test("workflow local state tolerates storage read and write failures", () => {
  const localStorage = createThrowingStorage();
  Object.assign(globalThis, {
    localStorage,
    window: { localStorage },
  });

  assert.doesNotThrow(() => saveWorkflowTags({ "workflow-a": ["alpha"] }, "user-1"));
  assert.doesNotThrow(() => saveWorkflowNodeComments({ "node-a": "comment" }, "user-1"));
  assert.doesNotThrow(() => saveWorkflowHasRun(new Set(["workflow-a"]), "user-1"));
  assert.doesNotThrow(() => saveWorkflowRunStats({ "workflow-a": { ok: 1, fail: 0 } }, "user-1"));
  assert.doesNotThrow(() =>
    saveWorkflowVersions({ "workflow-a": [{ nodes: [], ts: "2026-07-18T00:00:00.000Z" }] }, "user-1"),
  );
  assert.doesNotThrow(() => saveCollapsedWorkflowBranchFamilies(new Set(["family-a"]), "user-1"));

  assert.deepEqual(loadWorkflowTags("user-1"), {});
  assert.deepEqual(loadWorkflowNodeComments("user-1"), {});
  assert.deepEqual([...loadWorkflowHasRun("user-1")], []);
  assert.deepEqual(loadWorkflowRunStats("user-1"), {});
  assert.deepEqual(loadWorkflowVersions("user-1"), {});
  assert.deepEqual([...loadCollapsedWorkflowBranchFamilies("user-1")], []);
});

test("workflow local state writers persist only normalized values", () => {
  const localStorage = createStorage();
  const userId = "user-1";
  const hasRunKey = accountScopedStorageKey(WORKFLOW_HAS_RUN_KEY, userId);
  const commentsKey = accountScopedStorageKey(NODE_COMMENTS_KEY, userId);
  const tagsKey = accountScopedStorageKey(WORKFLOW_TAGS_STORAGE_KEY, userId);
  const runStatsKey = accountScopedStorageKey(WORKFLOW_RUN_STATS_KEY, userId);
  const versionsKey = accountScopedStorageKey(WORKFLOW_VERSIONS_KEY, userId);
  const collapsedKey = accountScopedStorageKey(WORKFLOW_BRANCH_FAMILY_COLLAPSE_STORAGE_KEY, userId);
  Object.assign(globalThis, {
    localStorage,
    window: { localStorage },
  });

  saveWorkflowHasRun(new Set(["workflow-a", "   ", "workflow-a"]), userId);
  const nodeComments: Record<string, string> = {
    "node-a": " keep trimmed comment ",
    "node-empty": "   ",
    "   ": "ignored",
  };
  Object.assign(nodeComments, { "node-b": 2 });
  saveWorkflowNodeComments(nodeComments, userId);
  saveWorkflowTags({
    "workflow-a": ["alpha", " Alpha ", "   "],
    "   ": ["ignored"],
    "workflow-b": [],
  }, userId);
  saveWorkflowRunStats({
    "workflow-a": { ok: 2, fail: 1 },
    "   ": { ok: 1, fail: 1 },
    "workflow-b": { ok: -1, fail: 0 },
  }, userId);
  saveWorkflowVersions({
    "workflow-a": [
      { nodes: [], ts: "2026-07-18T00:00:00.000Z" },
      { nodes: [], ts: "   " },
      { nodes: [], ts: "not-a-date" },
    ],
    "   ": [{ nodes: [], ts: "2026-07-18T00:00:00.000Z" }],
  }, userId);
  saveCollapsedWorkflowBranchFamilies(new Set(["family-a", "   ", "family-a"]), userId);

  assert.equal(
    localStorage.getItem(hasRunKey),
    JSON.stringify(["workflow-a"]),
  );
  assert.equal(
    localStorage.getItem(commentsKey),
    JSON.stringify({
      "node-a": "keep trimmed comment",
    }),
  );
  assert.equal(
    localStorage.getItem(tagsKey),
    JSON.stringify({
      "workflow-a": ["alpha"],
    }),
  );
  assert.equal(
    localStorage.getItem(runStatsKey),
    JSON.stringify({
      "workflow-a": { ok: 2, fail: 1 },
    }),
  );
  assert.equal(
    localStorage.getItem(versionsKey),
    JSON.stringify({
      "workflow-a": [{ nodes: [], ts: "2026-07-18T00:00:00.000Z" }],
    }),
  );
  assert.equal(
    localStorage.getItem(collapsedKey),
    JSON.stringify(["family-a"]),
  );
});

test("authenticated workflow state ignores unowned legacy global keys", () => {
  const localStorage = createStorage();
  const userId = "user-1";
  const tagsKey = accountScopedStorageKey(WORKFLOW_TAGS_STORAGE_KEY, userId);
  const commentsKey = accountScopedStorageKey(NODE_COMMENTS_KEY, userId);
  const hasRunKey = accountScopedStorageKey(WORKFLOW_HAS_RUN_KEY, userId);
  const runStatsKey = accountScopedStorageKey(WORKFLOW_RUN_STATS_KEY, userId);
  const versionsKey = accountScopedStorageKey(WORKFLOW_VERSIONS_KEY, userId);
  const collapsedKey = accountScopedStorageKey(WORKFLOW_BRANCH_FAMILY_COLLAPSE_STORAGE_KEY, userId);
  Object.assign(globalThis, {
    localStorage,
    window: { localStorage },
  });

  localStorage.setItem(WORKFLOW_TAGS_STORAGE_KEY, JSON.stringify({ "workflow-a": ["alpha"] }));
  localStorage.setItem(NODE_COMMENTS_KEY, JSON.stringify({ "node-a": "comment" }));
  localStorage.setItem(WORKFLOW_HAS_RUN_KEY, JSON.stringify(["workflow-a"]));
  localStorage.setItem(WORKFLOW_RUN_STATS_KEY, JSON.stringify({ "workflow-a": { ok: 2, fail: 1 } }));
  localStorage.setItem(
    WORKFLOW_VERSIONS_KEY,
    JSON.stringify({ "workflow-a": [{ nodes: [], ts: "2026-07-18T00:00:00.000Z" }] }),
  );
  localStorage.setItem(WORKFLOW_BRANCH_FAMILY_COLLAPSE_STORAGE_KEY, JSON.stringify(["family-a"]));

  assert.deepEqual(loadWorkflowTags(userId), {});
  assert.deepEqual(loadWorkflowNodeComments(userId), {});
  assert.deepEqual([...loadWorkflowHasRun(userId)], []);
  assert.deepEqual(loadWorkflowRunStats(userId), {});
  assert.deepEqual(loadWorkflowVersions(userId), {});
  assert.deepEqual([...loadCollapsedWorkflowBranchFamilies(userId)], []);

  assert.notEqual(localStorage.getItem(WORKFLOW_TAGS_STORAGE_KEY), null);
  assert.equal(localStorage.getItem(tagsKey), null);
  assert.equal(localStorage.getItem(commentsKey), null);
  assert.equal(localStorage.getItem(hasRunKey), null);
  assert.equal(localStorage.getItem(runStatsKey), null);
  assert.equal(localStorage.getItem(versionsKey), null);
  assert.equal(localStorage.getItem(collapsedKey), null);
});

test("workflow local state reducers mark runs and compute run stats", () => {
  const current = new Set(["workflow-a"]);
  assert.deepEqual([...workflowHasRunAfterMark(current, "workflow-b")], ["workflow-a", "workflow-b"]);
  assert.deepEqual([...workflowHasRunAfterMark(current, null)], ["workflow-a"]);

  assert.deepEqual(
    workflowRunStatsFromRuns([
      { status: "completed" },
      { status: "success" },
      { status: "done" },
      { status: "failed" },
      { status: "error" },
      { status: "cancelled" },
      { status: "running" },
    ]),
    { ok: 3, fail: 3 },
  );
  assert.equal(workflowRunStatsFromRuns([{ status: "running" }]), null);

  const stats = { "workflow-a": { ok: 1, fail: 0 } };
  assert.equal(workflowRunStatsAfterUpdate(stats, "workflow-b", [{ status: "running" }]), stats);
  assert.deepEqual(workflowRunStatsAfterUpdate(stats, "workflow-b", [{ status: "failed" }]), {
    "workflow-a": { ok: 1, fail: 0 },
    "workflow-b": { ok: 0, fail: 1 },
  });
});

test("workflow local state reducer prepends capped version snapshots", () => {
  const current = {
    "workflow-a": [
      { nodes: [{ id: "old-1" }], ts: "2026-07-18T00:00:00.000Z" },
      { nodes: [{ id: "old-2" }], ts: "2026-07-17T00:00:00.000Z" },
    ],
  };

  assert.deepEqual(
    workflowVersionsAfterSnapshot(
      current,
      "workflow-a",
      { nodes: [{ id: "new" }], ts: "2026-07-19T00:00:00.000Z" },
      2,
    ),
    {
      "workflow-a": [
        { nodes: [{ id: "new" }], ts: "2026-07-19T00:00:00.000Z" },
        { nodes: [{ id: "old-1" }], ts: "2026-07-18T00:00:00.000Z" },
      ],
    },
  );
  assert.equal(
    workflowVersionsAfterSnapshot(current, null, { nodes: [], ts: "2026-07-19T00:00:00.000Z" }),
    current,
  );
});
