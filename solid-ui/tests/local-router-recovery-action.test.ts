import test from "node:test";
import assert from "node:assert/strict";

import {
  createLocalRouterRecoveryAction,
  type LocalRouterRecoveryDependencies,
  type LocalRouterRecoveryRefreshResult,
} from "../src/lib/localRouterRecoveryActionCore.ts";

type TestCapabilities = {
  hasReplica: boolean;
  hasIndex: boolean;
  hasLexical: boolean;
  hasTopology: boolean;
  hasVector: boolean;
  canDecrypt: boolean;
};

function createCapabilities(): TestCapabilities {
  return {
    hasReplica: true,
    hasIndex: true,
    hasLexical: true,
    hasTopology: true,
    hasVector: false,
    canDecrypt: false,
  };
}

function createRefreshResult(overrides?: Partial<LocalRouterRecoveryRefreshResult>): LocalRouterRecoveryRefreshResult {
  return {
    available: true,
    refreshed: true,
    reducedWarning: false,
    warningCleared: false,
    stillWarning: false,
    ...overrides,
  };
}

function createDependencies(overrides?: Partial<LocalRouterRecoveryDependencies<TestCapabilities>>): LocalRouterRecoveryDependencies<TestCapabilities> {
  return {
    async getCapabilitiesSnapshot() {
      return createCapabilities();
    },
    async refreshIndexNow() {
      return createRefreshResult();
    },
    ...overrides,
  };
}

test("recovery action refreshes capabilities and reruns the preview", async () => {
  const capabilityUpdates: Array<TestCapabilities | null> = [];
  const previewPhases: string[] = [];
  let releasePreview: (() => void) | null = null;
  const action = createLocalRouterRecoveryAction(
    {
      onCapabilities(capabilities) {
        capabilityUpdates.push(capabilities);
      },
      onRefreshLocalPreview() {
        previewPhases.push("started");
        return new Promise<void>((resolve) => {
          releasePreview = () => {
            previewPhases.push("completed");
            resolve();
          };
        });
      },
    },
    createDependencies(),
  );

  const runPromise = action.run();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(action.refreshingIndex(), true);
  assert.equal(action.refreshingPreview(), true);
  assert.equal(action.refreshFeedback(), null);
  assert.equal(capabilityUpdates.length, 1);
  assert.deepEqual(previewPhases, ["started"]);

  releasePreview?.();
  await runPromise;

  assert.equal(action.refreshingIndex(), false);
  assert.equal(action.refreshingPreview(), false);
  assert.deepEqual(previewPhases, ["started", "completed"]);
  assert.equal(action.refreshFeedback(), "Local index and preview refreshed.");
  assert.equal(typeof action.lastPreviewRefreshAt(), "string");
  assert.equal(action.lastPreviewRefreshKind(), "with_index");
  assert.equal(action.canRerunPreview(), true);
});

test("recovery action reports sustained warning pressure without rerunning preview when index did not refresh", async () => {
  const capabilityUpdates: Array<TestCapabilities | null> = [];
  let previewRuns = 0;
  const action = createLocalRouterRecoveryAction(
    {
      onCapabilities(capabilities) {
        capabilityUpdates.push(capabilities);
      },
      onRefreshLocalPreview() {
        previewRuns += 1;
      },
    },
    createDependencies({
      async refreshIndexNow() {
        return createRefreshResult({
          refreshed: false,
          stillWarning: true,
        });
      },
    }),
  );

  await action.run();

  assert.equal(previewRuns, 0);
  assert.deepEqual(capabilityUpdates, []);
  assert.equal(action.refreshingIndex(), false);
  assert.equal(action.refreshingPreview(), false);
  assert.equal(action.lastPreviewRefreshAt(), null);
  assert.equal(action.lastPreviewRefreshKind(), null);
  assert.equal(action.canRerunPreview(), true);
  assert.equal(
    action.refreshFeedback(),
    "Local index refreshed, but broad refresh pressure remains.",
  );
});

test("recovery action reports failures and clears transient state", async () => {
  const action = createLocalRouterRecoveryAction(
    {
      onCapabilities() {
        throw new Error("should not update capabilities on failure");
      },
    },
    createDependencies({
      async refreshIndexNow() {
        throw new Error("refresh failed");
      },
    }),
  );

  await action.run();

  assert.equal(action.refreshingIndex(), false);
  assert.equal(action.refreshingPreview(), false);
  assert.equal(action.lastPreviewRefreshAt(), null);
  assert.equal(action.lastPreviewRefreshKind(), null);
  assert.equal(action.canRerunPreview(), false);
  assert.equal(action.refreshFeedback(), "Local index refresh failed.");
});

test("recovery action can rerun only the preview without refreshing the index", async () => {
  const calls: string[] = [];
  const action = createLocalRouterRecoveryAction(
    {
      onCapabilities() {
        calls.push("capabilities");
      },
      onRefreshLocalPreview() {
        calls.push("preview");
      },
    },
    createDependencies({
      async getCapabilitiesSnapshot() {
        calls.push("getCapabilities");
        return createCapabilities();
      },
      async refreshIndexNow() {
        calls.push("refreshIndex");
        return createRefreshResult();
      },
    }),
  );

  await action.rerunPreview();

  assert.deepEqual(calls, ["preview"]);
  assert.equal(action.refreshingIndex(), false);
  assert.equal(action.refreshingPreview(), false);
  assert.equal(typeof action.lastPreviewRefreshAt(), "string");
  assert.equal(action.lastPreviewRefreshKind(), "preview_only");
  assert.equal(action.refreshFeedback(), "Local preview refreshed.");
});

test("recovery action clears preview-only freshness when a broader refresh path supersedes it", async () => {
  const action = createLocalRouterRecoveryAction(
    {
      onCapabilities() {
        // no-op
      },
      onRefreshLocalPreview() {
        // no-op
      },
    },
    createDependencies({
      async refreshIndexNow() {
        return createRefreshResult({
          refreshed: false,
          stillWarning: false,
        });
      },
    }),
  );

  await action.rerunPreview();
  assert.equal(action.lastPreviewRefreshKind(), "preview_only");

  await action.run();

  assert.equal(action.lastPreviewRefreshKind(), null);
  assert.equal(action.refreshFeedback(), "Local index refreshed.");
});
