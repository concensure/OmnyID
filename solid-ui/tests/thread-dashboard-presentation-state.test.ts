import test from "node:test";
import assert from "node:assert/strict";

import {
  threadDashboardAvailableFiltersFromContent,
  threadDashboardActionDefinition,
  THREAD_DASHBOARD_CLEAR_FILTERS_LABEL,
  threadDashboardActionButtonState,
  threadDashboardActionIcon,
  threadDashboardMatchesFilters,
  threadDashboardRelativeTime,
  threadDashboardRowPresentationState,
  threadDashboardSummaryState,
  threadDashboardThreadsFromContent,
} from "../src/lib/threadDashboardPresentationState.ts";

test("thread dashboard presentation state exposes ASCII-safe action icons", () => {
  assert.deepEqual(
    [
      threadDashboardActionIcon("reply"),
      threadDashboardActionIcon("summarise"),
      threadDashboardActionIcon("calendar"),
      threadDashboardActionIcon("task"),
      threadDashboardActionIcon("archive"),
    ],
    ["RP", "SM", "CA", "TS", "AR"],
  );
});

test("thread dashboard presentation state exposes an ASCII-safe clear-filters label", () => {
  assert.equal(THREAD_DASHBOARD_CLEAR_FILTERS_LABEL, "Clear filters x");
});

test("thread dashboard presentation state formats relative time for recent activity", () => {
  assert.equal(
    threadDashboardRelativeTime("2026-08-18T11:58:30.000Z", Date.parse("2026-08-18T12:00:00.000Z")),
    "1m ago",
  );
});

test("thread dashboard presentation state normalizes malformed thread payloads into bounded records", () => {
  assert.deepEqual(
    threadDashboardThreadsFromContent({
      threads: [
        {
          id: 17,
          from: "Ava",
          subject: null,
          last_activity: undefined,
          suggested_action: "Review",
          action_reason: 19,
          confidence: "0.9",
          labels: ["legal", 7],
          needs_attention: "yes",
        },
      ],
    }),
    [
      {
        id: "17",
        from: "Ava",
        from_email: undefined,
        subject: "",
        last_activity: "",
        suggested_action: "Review",
        action_reason: "19",
        confidence: undefined,
        labels: ["legal", "7"],
        needs_attention: true,
      },
    ],
  );
});

test("thread dashboard presentation state normalizes malformed available-filter payloads", () => {
  assert.deepEqual(
    threadDashboardAvailableFiltersFromContent({
      available_filters: {
        contacts: ["Ava", 7],
        labels: "bad",
        supertags: [null, "priority"],
      },
    }),
    {
      contacts: ["Ava", "7"],
      labels: [],
      supertags: ["null", "priority"],
    },
  );
});

test("thread dashboard presentation state builds pending action buttons with shared labels and icons", () => {
  assert.deepEqual(
    threadDashboardActionButtonState("archive", "pending"),
    {
      id: "archive",
      label: "Archive",
      icon: "AR",
      state: "pending",
      disabled: true,
      className: "rounded border border-white/15 bg-white/8 px-2 py-1 text-[10px] font-medium text-on-surface-variant transition hover:bg-white/15 hover:text-on-surface disabled:opacity-50",
    },
  );
});

test("thread dashboard presentation state exposes shared action objectives", () => {
  assert.equal(
    threadDashboardActionDefinition("calendar").objective({
      from: "Ava",
      subject: "Contract review",
    }),
    "Extract any scheduling information from the email thread from Ava with subject \"Contract review\" and create a calendar event. Ask the user to confirm the event details before adding.",
  );
});

test("thread dashboard presentation state derives row trust, attention, and tooltip visibility from the shared helpers", () => {
  const row = threadDashboardRowPresentationState({
    thread: {
      id: "thread-1",
      from: "Ava",
      subject: "Contract review",
      last_activity: "2026-08-18T11:58:30.000Z",
      suggested_action: "Review the contract.",
      action_reason: "Review today before the contract deadline slips.",
      confidence: 0.82,
      labels: ["legal"],
      needs_attention: true,
    },
    rowActionStates: { reply: "done", archive: "pending" },
    tooltipRowId: "thread-1",
    attentionFallbackTitle: "Needs attention",
  });

  assert.equal(row.fromText, "Ava");
  assert.equal(row.subjectText, "Contract review");
  assert.equal(row.labels[0], "legal");
  assert.equal(row.showAttention, true);
  assert.equal(row.attentionTitle, "Review today before the contract deadline slips.");
  assert.equal(row.suggestedActionText, "Review the contract.");
  assert.equal(row.boundedReasonText, "Review today before the contract deadline slips.");
  assert.equal(row.actionReasonText, null);
  assert.equal(row.showSuggestedAction, true);
  assert.equal(row.showConfidence, true);
  assert.equal(row.confidenceText, "82%");
  assert.equal(row.showTooltip, true);
  assert.equal(row.actionButtons.find((button) => button.id === "reply")?.state, "done");
  assert.equal(row.actionButtons.find((button) => button.id === "archive")?.disabled, true);
});

test("thread dashboard presentation state matches threads against archived, contact, label, and tag filters", () => {
  const thread = {
    id: "thread-1",
    from: "Ava",
    from_email: "ava@example.com",
    subject: "Contract review",
    last_activity: "2026-08-18T11:58:30.000Z",
    labels: ["legal"],
  };

  assert.equal(
    threadDashboardMatchesFilters({
      thread,
      archivedIds: new Set<string>(),
      filters: { contactFilter: "ava", labelFilter: "legal", tagFilter: "deadline" },
      reasonFilterText: "review today before the contract deadline slips.",
    }),
    true,
  );

  assert.equal(
    threadDashboardMatchesFilters({
      thread,
      archivedIds: new Set(["thread-1"]),
      filters: { contactFilter: "", labelFilter: "", tagFilter: "" },
      reasonFilterText: "",
    }),
    false,
  );
});

test("thread dashboard presentation state builds top-level summary flags from visible rows and active filters", () => {
  const summary = threadDashboardSummaryState({
    visibleThreads: [{ showAttention: true }, { showAttention: false }],
    filters: { contactFilter: "ava", labelFilter: "", tagFilter: "" },
    undoThreadSubject: "Contract review",
  });

  assert.deepEqual(summary, {
    attentionCount: 1,
    showAttentionCount: true,
    hasActiveFilters: true,
    visibleThreadCountText: "2 threads",
    showEmpty: false,
    showUndoNotice: true,
    undoSummary: "Thread archived - Contract review",
  });
});
