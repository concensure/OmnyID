import assert from "node:assert/strict";
import test from "node:test";

import { subscribeWeddingNavigationAppBridge } from "../src/lib/weddingNavigationAppBridge.ts";
import {
  OPEN_WEDDING_PLANNING_INTENT_EVENT,
  type WeddingNavigationIntent,
} from "../src/lib/weddingNavigationState.ts";
import { WEDDING_NAVIGATION_INTENT_KEY } from "../src/lib/weddingNavigationLocalState.ts";
import type { ViewName } from "../src/lib/viewNames.ts";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const intent: WeddingNavigationIntent = {
  view: "calendar",
  surface: "calendar",
  weddingPlanId: "wedding_plan_bridge",
  responseWorkspaceId: "wedding_workspace_bridge",
  sourceResponseId: "response_bridge",
  artifactId: "artifact_timeline",
  sectionId: "timeline",
  notice: "Opening wedding dates in Calendar.",
  metadata: {
    template: "wedding_planning",
  },
};

test("subscribeWeddingNavigationAppBridge saves intent and navigates to destination view", () => {
  const target = new EventTarget() as Window;
  const storage = new MemoryStorage();
  const selectedViews: ViewName[] = [];
  const saved: WeddingNavigationIntent[] = [];
  const unsubscribe = subscribeWeddingNavigationAppBridge({
    target,
    storage,
    nowIso: "2026-09-12T10:10:00.000Z",
    selectView: (view) => selectedViews.push(view),
    onSaved: (value) => saved.push(value),
  });

  target.dispatchEvent(new CustomEvent(OPEN_WEDDING_PLANNING_INTENT_EVENT, { detail: intent }));

  const stored = JSON.parse(storage.getItem(WEDDING_NAVIGATION_INTENT_KEY) ?? "{}");
  assert.deepEqual(selectedViews, ["calendar"]);
  assert.equal(saved[0]?.responseWorkspaceId, "wedding_workspace_bridge");
  assert.equal(stored.savedAt, "2026-09-12T10:10:00.000Z");
  assert.equal(stored.view, "calendar");

  unsubscribe();
  target.dispatchEvent(new CustomEvent(OPEN_WEDDING_PLANNING_INTENT_EVENT, { detail: { ...intent, view: "tasks" } }));
  assert.deepEqual(selectedViews, ["calendar"]);
});

test("subscribeWeddingNavigationAppBridge ignores malformed wedding navigation events", () => {
  const target = new EventTarget() as Window;
  const storage = new MemoryStorage();
  const selectedViews: ViewName[] = [];
  const unsubscribe = subscribeWeddingNavigationAppBridge({
    target,
    storage,
    selectView: (view) => selectedViews.push(view),
  });

  target.dispatchEvent(new CustomEvent(OPEN_WEDDING_PLANNING_INTENT_EVENT, {
    detail: {
      view: "calendar",
      surface: "calendar",
      weddingPlanId: "",
      responseWorkspaceId: "workspace",
    },
  }));

  assert.deepEqual(selectedViews, []);
  assert.equal(storage.getItem(WEDDING_NAVIGATION_INTENT_KEY), null);
  unsubscribe();
});
