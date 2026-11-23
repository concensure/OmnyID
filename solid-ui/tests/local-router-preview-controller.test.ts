import test from "node:test";
import assert from "node:assert/strict";

import {
  createPreviewController,
  type PreviewControllerScheduler,
} from "../src/lib/localRouterPreviewControllerCore.ts";

type PreviewValue = {
  result: { id: string } | null;
  capabilities: { hasIndex: boolean };
};

function createManualScheduler(): {
  scheduler: PreviewControllerScheduler;
  runNext: () => void;
  pendingCount: () => number;
} {
  let nextHandle = 1;
  const pending = new Map<number, () => void>();
  return {
    scheduler: {
      setTimeout(callback) {
        const handle = nextHandle++;
        pending.set(handle, callback);
        return handle;
      },
      clearTimeout(handle) {
        pending.delete(handle as number);
      },
    },
    runNext() {
      const nextEntry = pending.entries().next().value as [number, () => void] | undefined;
      if (!nextEntry) return;
      const [handle, callback] = nextEntry;
      pending.delete(handle);
      callback();
    },
    pendingCount() {
      return pending.size;
    },
  };
}

test("preview controller keeps the newest load result when requests resolve out of order", async () => {
  const pending = new Map<string, (value: PreviewValue) => void>();
  const controller = createPreviewController<PreviewValue>(
    (query) =>
      new Promise((resolve) => {
        pending.set(query, resolve);
      }),
  );

  const firstLoad = controller.load("alpha");
  const secondLoad = controller.load("beta");

  pending.get("beta")?.({ result: { id: "beta" }, capabilities: { hasIndex: true } });
  const secondResult = await secondLoad;
  pending.get("alpha")?.({ result: { id: "alpha" }, capabilities: { hasIndex: true } });
  const firstResult = await firstLoad;

  assert.deepEqual(secondResult, {
    result: { id: "beta" },
    capabilities: { hasIndex: true },
  });
  assert.equal(firstResult, null);
  assert.deepEqual(controller.preview(), {
    result: { id: "beta" },
    capabilities: { hasIndex: true },
  });
});

test("preview controller debounces scheduled loads and clears pending work for empty queries", async () => {
  const scheduler = createManualScheduler();
  const loadedQueries: string[] = [];
  const controller = createPreviewController<PreviewValue>(
    async (query) => {
      loadedQueries.push(query);
      return {
        result: { id: query },
        capabilities: { hasIndex: true },
      };
    },
    { delayMs: 25, scheduler: scheduler.scheduler },
  );

  controller.schedule("alpha");
  controller.schedule("beta");

  assert.equal(scheduler.pendingCount(), 1);
  scheduler.runNext();
  await Promise.resolve();

  assert.deepEqual(loadedQueries, ["beta"]);
  assert.deepEqual(controller.preview(), {
    result: { id: "beta" },
    capabilities: { hasIndex: true },
  });

  controller.schedule("gamma");
  assert.equal(scheduler.pendingCount(), 1);
  controller.schedule("   ");
  assert.equal(scheduler.pendingCount(), 0);
  assert.equal(controller.preview(), null);
});
