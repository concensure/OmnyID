import assert from "node:assert/strict";
import test from "node:test";
import { VIEW_NAMES } from "../src/lib/viewNames.ts";
import { mobileNavigationGroups, mobileNavigationLabel } from "../src/lib/mobileGlobalNavigationState.ts";

function visibleIds(overrides: Partial<Parameters<typeof mobileNavigationGroups>[0]> = {}) {
  return mobileNavigationGroups({
    advanced: false, paraViewEnabled: false, studyLensEnabled: false, ...overrides,
  }).flatMap((group) => group.items.map((item) => item.id));
}

test("mobile navigation exposes every standard desktop destination", () => {
  const ids = visibleIds();
  for (const required of [
    "home", "search", "threads", "workflows", "email", "note", "calendar", "database",
    "templates", "reports", "diary", "discover", "contacts", "space_feed", "public_feed",
    "knowledge_graph", "sovereignty_audit", "files", "decision_queue",
    "cofounder_studio", "connected_apps", "pulse", "goals", "agent_settings",
  ]) assert.ok(ids.includes(required as never), `${required} should be available on mobile`);
});

test("mobile navigation keeps the cost dashboard admin-only", () => {
  assert.equal(visibleIds().includes("cost_dashboard"), false);
  assert.equal(visibleIds({ adminAccount: true }).includes("cost_dashboard"), true);
});

test("mobile navigation honors feature visibility without invalid routes", () => {
  const ids = visibleIds({ advanced: true, paraViewEnabled: true, studyLensEnabled: true });
  assert.ok(ids.includes("runner"));
  assert.ok(ids.includes("para"));
  assert.ok(ids.includes("study"));
  assert.ok(ids.every((id) => VIEW_NAMES.includes(id)));
  assert.equal(new Set(ids).size, ids.length);
});

test("mobile navigation search is case-insensitive and searches aliases", () => {
  assert.deepEqual(visibleIds({ query: "MESSAGES" }), ["threads"]);
  assert.deepEqual(visibleIds({ query: "preferences" }), ["agent_settings"]);
  assert.equal(mobileNavigationGroups({ advanced: true, paraViewEnabled: true, studyLensEnabled: true, query: "missing" }).length, 0);
});

test("mobile navigation gives current views readable labels", () => {
  assert.equal(mobileNavigationLabel("search"), "Chat");
  assert.equal(mobileNavigationLabel("agent_settings"), "Settings");
  assert.equal(mobileNavigationLabel("response_queue"), "response queue");
});
