import test from "node:test";
import assert from "node:assert/strict";
import {
  clearWeddingNavigationIntent,
  consumeWeddingNavigationIntent,
  loadWeddingNavigationIntent,
  saveWeddingNavigationIntent,
  WEDDING_NAVIGATION_INTENT_KEY,
} from "@/lib/weddingNavigationLocalState";
import { buildWeddingNavigationIntentFromPresentationAction } from "@/lib/weddingNavigationState";
import type { WeddingPresentationAction } from "@/lib/weddingPresentationState";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as Storage;
}

function throwingStorage(): Storage {
  return {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  } as unknown as Storage;
}

function action(): WeddingPresentationAction {
  return {
    kind: "open_planning_files",
    label: "Open planning files",
    weddingPlanId: "wedding_plan:local",
    responseWorkspaceId: "response_workspace:local",
    sourceResponseId: "response-local",
    artifactId: "artifact-local",
    sectionId: "artifacts",
  };
}

test("saveWeddingNavigationIntent stores normalized latest intent with timestamp", () => {
  const storage = memoryStorage();
  const intent = buildWeddingNavigationIntentFromPresentationAction(action());
  intent.metadata.continue_context = { version: 1, summaryLabel: "Saved chat context" };
  const saved = saveWeddingNavigationIntent(intent, {
    storage,
    nowIso: "2026-09-12T00:00:00.000Z",
  });

  assert.equal(saved?.savedAt, "2026-09-12T00:00:00.000Z");
  assert.equal(loadWeddingNavigationIntent(storage)?.responseWorkspaceId, "response_workspace:local");
  assert.equal(loadWeddingNavigationIntent(storage)?.surface, "planning_files");
  assert.deepEqual(loadWeddingNavigationIntent(storage)?.metadata.continue_context, {
    version: 1,
    summaryLabel: "Saved chat context",
  });
});

test("consumeWeddingNavigationIntent preserves active context for cross-surface wedding navigation", () => {
  const storage = memoryStorage();
  const intent = buildWeddingNavigationIntentFromPresentationAction(action());
  saveWeddingNavigationIntent(intent, { storage, nowIso: "2026-09-12T00:00:00.000Z" });

  const consumed = consumeWeddingNavigationIntent(storage);

  assert.equal(consumed?.artifactId, "artifact-local");
  assert.equal(loadWeddingNavigationIntent(storage)?.artifactId, "artifact-local");
});

test("clearWeddingNavigationIntent removes a pending intent", () => {
  const storage = memoryStorage();
  saveWeddingNavigationIntent(buildWeddingNavigationIntentFromPresentationAction(action()), { storage });

  clearWeddingNavigationIntent(storage);

  assert.equal(loadWeddingNavigationIntent(storage), null);
});

test("loadWeddingNavigationIntent removes malformed or invalid stored values", () => {
  const storage = memoryStorage();
  storage.setItem(WEDDING_NAVIGATION_INTENT_KEY, "{bad-json");

  assert.equal(loadWeddingNavigationIntent(storage), null);
  assert.equal(storage.getItem(WEDDING_NAVIGATION_INTENT_KEY), null);

  storage.setItem(WEDDING_NAVIGATION_INTENT_KEY, JSON.stringify({
    view: "calendar",
    surface: "unsupported",
    weddingPlanId: "wedding_plan:x",
    responseWorkspaceId: "response_workspace:x",
    savedAt: "2026-09-12T00:00:00.000Z",
  }));

  assert.equal(loadWeddingNavigationIntent(storage), null);
  assert.equal(storage.getItem(WEDDING_NAVIGATION_INTENT_KEY), null);
});

test("wedding navigation local state tolerates unavailable storage", () => {
  const intent = buildWeddingNavigationIntentFromPresentationAction(action());
  const storage = throwingStorage();

  assert.equal(saveWeddingNavigationIntent(intent, { storage }), null);
  assert.equal(loadWeddingNavigationIntent(storage), null);
  assert.equal(consumeWeddingNavigationIntent(storage), null);
  assert.doesNotThrow(() => clearWeddingNavigationIntent(storage));
});
