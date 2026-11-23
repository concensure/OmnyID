import test from "node:test";
import assert from "node:assert/strict";

import {
  clearDashboardFeedScopeTransientState,
  pruneDashboardFeedActiveTypes,
} from "../src/lib/dashboardFeedScopeState.ts";

test("clearDashboardFeedScopeTransientState clears scope-bound feed ui state", () => {
  assert.deepEqual(
    clearDashboardFeedScopeTransientState({
      bulkDismissPending: true,
      showDismissed: true,
      snoozedToastId: "card-2",
      undoDismissId: "card-1",
    }),
    {
      bulkDismissPending: false,
      showDismissed: false,
      snoozedToastId: null,
      undoDismissId: null,
    },
  );
});

test("clearDashboardFeedScopeTransientState is stable for already-cleared state", () => {
  assert.deepEqual(
    clearDashboardFeedScopeTransientState({
      bulkDismissPending: false,
      showDismissed: false,
      snoozedToastId: null,
      undoDismissId: null,
    }),
    {
      bulkDismissPending: false,
      showDismissed: false,
      snoozedToastId: null,
      undoDismissId: null,
    },
  );
});

test("pruneDashboardFeedActiveTypes keeps only types still available in scope", () => {
  assert.deepEqual(
    [...pruneDashboardFeedActiveTypes(new Set(["note", "task", "email"]), ["task", "email"])].sort(),
    ["email", "task"],
  );
});

test("pruneDashboardFeedActiveTypes returns an empty set when nothing remains in scope", () => {
  assert.deepEqual(
    [...pruneDashboardFeedActiveTypes(new Set(["note"]), ["task", "email"])],
    [],
  );
});

test("pruneDashboardFeedActiveTypes preserves current types while the available list is temporarily empty", () => {
  assert.deepEqual(
    [...pruneDashboardFeedActiveTypes(new Set(["note", "task"]), [])].sort(),
    ["note", "task"],
  );
});
