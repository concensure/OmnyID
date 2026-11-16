import test from "node:test";
import assert from "node:assert/strict";
import {
  hiddenAttentionCount,
  loadMobileFocusTriageMemory,
  mobileDecisionResearchEligibleIds,
  rankFocusDeckItems,
  saveMobileFocusTriageMemory,
  type FocusDeckItem,
} from "../src/lib/mobileFocusHomeState.ts";

const item = (id: string, dueAt: string | null, deferCount = 0): FocusDeckItem => ({ id, kind: "decision", sourceSurface: "tasks", title: id, recommendedActionLabel: "Open", whyNowLabel: "Now", dueAt, evidenceLabels: [], deferCount, returnedFromLater: false, external: false });
test("mobile focus ranks overdue and near-term work ahead while retaining stable order", () => {
  const ranked = rankFocusDeckItems([item("later", "2026-11-01T00:00:00Z"), item("soon", "2026-10-10T00:00:00Z"), item("overdue", "2026-10-01T00:00:00Z"), item("other", null)], new Date("2026-10-05T00:00:00Z"));
  assert.deepEqual(ranked.map((entry) => entry.id), ["overdue", "soon", "later", "other"]);
});
test("mobile focus makes repeat deferrals visible within their urgency tier", () => {
  const ranked = rankFocusDeckItems([item("first", null, 0), item("returned", null, 2)], new Date("2026-10-05T00:00:00Z"));
  assert.deepEqual(ranked.map((entry) => entry.id), ["returned", "first"]);
  assert.equal(hiddenAttentionCount({ responseCount: 2, overdueDecisionCount: 3 }), 5);
});

test("mobile research is limited to the active decision and immediate successor", () => {
  const eligible = mobileDecisionResearchEligibleIds([
    item("active", null), item("next", null), item("future", null), item("much-later", null),
  ]);
  assert.deepEqual([...eligible], ["active", "next"]);
  assert.equal(eligible.has("future"), false);
});

test("mobile focus keeps completed vendor triage through a route remount", () => {
  const original = globalThis.localStorage;
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
  });
  try {
    saveMobileFocusTriageMemory("account-a", "wedding-workspace", {
      resolvedIds: ["vendor-comparison", "vendor-comparison"],
      deferredIds: ["decision-later"],
    });
    assert.deepEqual(loadMobileFocusTriageMemory("account-a", "wedding-workspace"), {
      resolvedIds: ["vendor-comparison"],
      deferredIds: ["decision-later"],
    });
    assert.deepEqual(loadMobileFocusTriageMemory("recreated-account", "wedding-workspace"), {
      resolvedIds: [],
      deferredIds: [],
    });
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original });
  }
});
