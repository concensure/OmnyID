import test from "node:test";
import assert from "node:assert/strict";

import {
  isWeddingWorkspaceMenuId,
  loadWeddingWorkspaceMenu,
  loadWeddingWorkspaceMenuFromUrl,
  replaceWeddingWorkspaceMenuInUrl,
  saveWeddingWorkspaceMenu,
  weddingWorkspaceMenuIdFromEvent,
  weddingWorkspaceMenuBadge,
  weddingWorkspaceMenuHint,
  type WeddingWorkspaceMenuBadgeInput,
} from "../src/lib/weddingWorkspaceMenuState.ts";
import { weddingMenuKeyDownStep } from "../src/lib/weddingWorkspaceDesktopMenuState.ts";

function fakeStorage(): Storage {
  const state = new Map<string, string>();
  return {
    getItem: (key: string) => (state.has(key) ? state.get(key)! : null),
    setItem: (key: string, value: string) => {
      state.set(key, value);
    },
    removeItem: (key: string) => {
      state.delete(key);
    },
    clear: () => state.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

function fixture(overrides: Partial<WeddingWorkspaceMenuBadgeInput> = {}): WeddingWorkspaceMenuBadgeInput {
  return {
    budgetTracking: { remainingAmount: 100 } as WeddingWorkspaceMenuBadgeInput["budgetTracking"],
    guestTracking: { pendingCount: 0, guestRowCount: 4, attendingCount: 4 } as WeddingWorkspaceMenuBadgeInput["guestTracking"],
    seatingPlan: { unassignedAttendingCount: 0, assignedSeatCount: 4 } as WeddingWorkspaceMenuBadgeInput["seatingPlan"],
    vendorContactCards: [],
    delegation: { items: [{ id: "helper" }] } as WeddingWorkspaceMenuBadgeInput["delegation"],
    ganttTimeline: { rows: [{ id: "row" }], undatedItems: [] } as WeddingWorkspaceMenuBadgeInput["ganttTimeline"],
    inspiration: { items: [{ id: "inspiration" }] } as WeddingWorkspaceMenuBadgeInput["inspiration"],
    ...overrides,
  };
}

test("isWeddingWorkspaceMenuId accepts only known menu ids", () => {
  assert.equal(isWeddingWorkspaceMenuId("budget"), true);
  assert.equal(isWeddingWorkspaceMenuId("people"), true);
  assert.equal(isWeddingWorkspaceMenuId("plan"), true);
  assert.equal(isWeddingWorkspaceMenuId("tasks"), true);
  assert.equal(isWeddingWorkspaceMenuId("vision"), true);
  assert.equal(isWeddingWorkspaceMenuId("documents"), true);
  assert.equal(isWeddingWorkspaceMenuId("inspiration"), true);
  assert.equal(isWeddingWorkspaceMenuId("helpers"), true);
  assert.equal(isWeddingWorkspaceMenuId("advanced"), true);
  assert.equal(isWeddingWorkspaceMenuId("not-a-menu"), false);
  assert.equal(isWeddingWorkspaceMenuId(null), false);
});

test("desktop wedding menu keyboard navigation wraps predictably", () => {
  assert.equal(weddingMenuKeyDownStep("ArrowRight", 6, 7), 0);
  assert.equal(weddingMenuKeyDownStep("ArrowLeft", 0, 7), 6);
  assert.equal(weddingMenuKeyDownStep("Home", 4, 7), 0);
  assert.equal(weddingMenuKeyDownStep("End", 1, 7), 6);
  assert.equal(weddingMenuKeyDownStep("Enter", 1, 7), null);
});

test("loadWeddingWorkspaceMenu defaults to home and round-trips a saved tab", () => {
  const storage = fakeStorage();
  assert.equal(loadWeddingWorkspaceMenu(storage), "home");
  saveWeddingWorkspaceMenu("timeline", storage);
  assert.equal(loadWeddingWorkspaceMenu(storage), "timeline");
});

test("legacy Vision and Inspiration menu values open Plan", () => {
  const storage = fakeStorage();
  saveWeddingWorkspaceMenu("vision", storage);

  assert.equal(loadWeddingWorkspaceMenu(storage), "plan");
  assert.equal(loadWeddingWorkspaceMenuFromUrl("?weddingMenu=vision"), "plan");
  assert.equal(
    weddingWorkspaceMenuIdFromEvent(new CustomEvent("x", { detail: { menu: "vision" } })),
    "plan",
  );
});

test("loadWeddingWorkspaceMenu falls back to home for a corrupted value", () => {
  const storage = fakeStorage();
  storage.setItem("omnyid.wedding.workspace-menu", "not-a-real-tab");
  assert.equal(loadWeddingWorkspaceMenu(storage), "home");
});

test("loadWeddingWorkspaceMenuFromUrl accepts query or hash tabs", () => {
  assert.equal(loadWeddingWorkspaceMenuFromUrl("?weddingMenu=seating"), "seating");
  assert.equal(loadWeddingWorkspaceMenuFromUrl("?weddingMenu=people"), "people");
  assert.equal(loadWeddingWorkspaceMenuFromUrl("?weddingMenu=plan"), "plan");
  assert.equal(loadWeddingWorkspaceMenuFromUrl("?weddingMenu=tasks"), "tasks");
  assert.equal(loadWeddingWorkspaceMenuFromUrl("?weddingMenu=documents"), "documents");
  assert.equal(loadWeddingWorkspaceMenuFromUrl("?weddingMenu=helpers"), "helpers");
  assert.equal(loadWeddingWorkspaceMenuFromUrl("?weddingMenu=inspiration"), "plan");
  assert.equal(loadWeddingWorkspaceMenuFromUrl("", "#weddingMenu=timeline"), "timeline");
  assert.equal(loadWeddingWorkspaceMenuFromUrl("?weddingMenu=bad"), null);
});

test("replaceWeddingWorkspaceMenuInUrl keeps the current path and writes the selected tab", () => {
  const calls: string[] = [];
  const windowLike = {
    location: { href: "https://example.test/workspace/?x=1#keep" },
    history: {
      state: { ok: true },
      replaceState: (_state: unknown, _title: string, url: string) => calls.push(url),
    },
  } as Pick<Window, "location" | "history">;
  replaceWeddingWorkspaceMenuInUrl("guests", windowLike);
  assert.deepEqual(calls, ["/workspace/?x=1&weddingMenu=guests#keep"]);
});

test("weddingWorkspaceMenuIdFromEvent accepts only known wedding menu shortcuts", () => {
  assert.equal(weddingWorkspaceMenuIdFromEvent(new CustomEvent("x", { detail: { menu: "timeline" } })), "timeline");
  assert.equal(weddingWorkspaceMenuIdFromEvent(new CustomEvent("x", { detail: { menu: "not-real" } })), null);
  assert.equal(weddingWorkspaceMenuIdFromEvent(new Event("x")), null);
});

test("weddingWorkspaceMenuBadge flags an over-budget total on the budget tab", () => {
  const overBudget = fixture({ budgetTracking: { remainingAmount: -250 } as WeddingWorkspaceMenuBadgeInput["budgetTracking"] });
  assert.deepEqual(weddingWorkspaceMenuBadge("budget", overBudget), { label: "Over", tone: "urgent" });
  assert.equal(weddingWorkspaceMenuBadge("budget", fixture()), null);
});

test("weddingWorkspaceMenuBadge surfaces pending RSVPs and unassigned seats as counts", () => {
  const pendingGuests = fixture({ guestTracking: { pendingCount: 4 } as WeddingWorkspaceMenuBadgeInput["guestTracking"] });
  assert.deepEqual(weddingWorkspaceMenuBadge("guests", pendingGuests), { label: "4", tone: "info" });
  assert.equal(weddingWorkspaceMenuBadge("guests", fixture()), null);

  const unassignedSeats = fixture({ seatingPlan: { unassignedAttendingCount: 2 } as WeddingWorkspaceMenuBadgeInput["seatingPlan"] });
  assert.deepEqual(weddingWorkspaceMenuBadge("seating", unassignedSeats), { label: "2", tone: "info" });

  const peopleNeeds = fixture({
    guestTracking: { pendingCount: 4 } as WeddingWorkspaceMenuBadgeInput["guestTracking"],
    seatingPlan: { unassignedAttendingCount: 2 } as WeddingWorkspaceMenuBadgeInput["seatingPlan"],
  });
  assert.deepEqual(weddingWorkspaceMenuBadge("people", peopleNeeds), { label: "6", tone: "info" });
});

test("weddingWorkspaceMenuBadge counts only urgent vendor cards on the queue tab", () => {
  const withVendors = fixture({
    vendorContactCards: [
      { tone: "urgent" } as WeddingWorkspaceMenuBadgeInput["vendorContactCards"][number],
      { tone: "waiting" } as WeddingWorkspaceMenuBadgeInput["vendorContactCards"][number],
      { tone: "urgent" } as WeddingWorkspaceMenuBadgeInput["vendorContactCards"][number],
    ],
  });
  assert.deepEqual(weddingWorkspaceMenuBadge("response_queue", withVendors), { label: "2", tone: "urgent" });
  assert.deepEqual(weddingWorkspaceMenuBadge("plan", withVendors), { label: "2", tone: "urgent" });
  assert.equal(weddingWorkspaceMenuBadge("response_queue", fixture()), null);
});

test("weddingWorkspaceMenuBadge has no badge for tabs without a live count, or when state is unavailable", () => {
  assert.equal(weddingWorkspaceMenuBadge("home", fixture()), null);
  assert.equal(weddingWorkspaceMenuBadge("advanced", fixture()), null);
  assert.equal(weddingWorkspaceMenuBadge("budget", null), null);
});

test("weddingWorkspaceMenuHint marks empty first-run sections without replacing live badges", () => {
  assert.equal(weddingWorkspaceMenuHint("budget", fixture({
    budgetTracking: { budgetTargetAmount: null } as WeddingWorkspaceMenuBadgeInput["budgetTracking"],
  })), "Start");
  assert.equal(weddingWorkspaceMenuHint("guests", fixture({
    guestTracking: { guestRowCount: 0, pendingCount: 0, attendingCount: 0 } as WeddingWorkspaceMenuBadgeInput["guestTracking"],
  })), "Start");
  assert.equal(weddingWorkspaceMenuHint("people", fixture({
    guestTracking: { guestRowCount: 0, pendingCount: 0, attendingCount: 0 } as WeddingWorkspaceMenuBadgeInput["guestTracking"],
  })), "Start");
  assert.equal(weddingWorkspaceMenuHint("people", fixture({
    guestTracking: { guestRowCount: 2, pendingCount: 0, attendingCount: 2 } as WeddingWorkspaceMenuBadgeInput["guestTracking"],
    delegation: { items: [] } as WeddingWorkspaceMenuBadgeInput["delegation"],
  })), "Start");
  assert.equal(weddingWorkspaceMenuHint("inspiration", fixture({
    inspiration: { items: [] } as WeddingWorkspaceMenuBadgeInput["inspiration"],
  })), "Start");
  assert.equal(weddingWorkspaceMenuHint("timeline", fixture({
    ganttTimeline: { rows: [], undatedItems: [] } as WeddingWorkspaceMenuBadgeInput["ganttTimeline"],
  })), "Start");
  assert.equal(weddingWorkspaceMenuHint("plan", fixture({
    ganttTimeline: { rows: [], undatedItems: [] } as WeddingWorkspaceMenuBadgeInput["ganttTimeline"],
    vendorContactCards: [],
  })), "Start");
  assert.equal(weddingWorkspaceMenuHint("advanced", fixture()), null);
  assert.equal(weddingWorkspaceMenuHint("budget", null), null);
});
