import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingDecisionFocusSidebarAction } from "../src/lib/weddingDecisionFocusActionState.ts";
import type { WeddingPersonalOsRankedItem } from "../src/lib/weddingPersonalOsProjectionState.ts";

function item(input: Partial<WeddingPersonalOsRankedItem> & Pick<WeddingPersonalOsRankedItem, "sourceSurface" | "title">): WeddingPersonalOsRankedItem {
  return {
    id: `item:${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    kind: "task",
    title: input.title,
    pressureFamily: "obligation",
    rankWeight: 42,
    dueLabel: null,
    dueAt: null,
    explanation: "Focus explanation.",
    evidenceLabels: ["payment review"],
    simulatorSeedKind: "commitment",
    ...input,
  };
}

test("buildWeddingDecisionFocusSidebarAction routes task focus to Tasks with compact metadata", () => {
  const action = buildWeddingDecisionFocusSidebarAction({
    summaryLabel: "Focus on 2 wedding decisions now; 1 can wait.",
    backlogCount: 1,
    focusItems: [
      item({ title: "Verify venue balance before payment", sourceSurface: "tasks" }),
      item({ title: "Decide final caterer headcount", sourceSurface: "decision_queue" }),
    ],
  });

  const packet = action.metadata?.decision_focus as Record<string, unknown>;
  const focusItems = packet.focus_items as Array<Record<string, unknown>>;
  assert.equal(action.kind, "open_tasks");
  assert.equal(action.label, "Open Tasks");
  assert.equal(action.enabled, true);
  assert.deepEqual(action.contextLabels, ["Verify venue balance before payment", "Decide final caterer headcount"]);
  assert.equal(packet.summary_label, "Focus on 2 wedding decisions now; 1 can wait.");
  assert.equal(packet.backlog_count, 1);
  assert.equal(packet.top_source_surface, "tasks");
  assert.equal(focusItems[0]?.title, "Verify venue balance before payment");
  assert.deepEqual(focusItems[0]?.evidence_labels, ["payment review"]);
});

test("buildWeddingDecisionFocusSidebarAction routes calendar and decision focus to their destination surfaces", () => {
  const calendarAction = buildWeddingDecisionFocusSidebarAction({
    summaryLabel: "Focus on 1 wedding decision now; 0 can wait.",
    backlogCount: 0,
    focusItems: [item({ title: "Review ceremony hold date", sourceSurface: "calendar", kind: "calendar_event" })],
  });
  const decisionAction = buildWeddingDecisionFocusSidebarAction({
    summaryLabel: "Focus on 1 wedding decision now; 0 can wait.",
    backlogCount: 0,
    focusItems: [item({ title: "Confirm selected venue", sourceSurface: "decision_queue", kind: "decision" })],
  });

  assert.equal(calendarAction.kind, "open_calendar");
  assert.equal(calendarAction.label, "Open Calendar");
  assert.equal(decisionAction.kind, "approve_action");
  assert.equal(decisionAction.label, "Open Decision Queue");
});

test("buildWeddingDecisionFocusSidebarAction disables empty focus packets without dropping metadata", () => {
  const action = buildWeddingDecisionFocusSidebarAction({
    summaryLabel: "No decision-heavy wedding items need focus right now.",
    backlogCount: 0,
    focusItems: [],
  });

  assert.equal(action.kind, "open_tasks");
  assert.equal(action.enabled, false);
  assert.match(action.reason ?? "", /No decision-heavy wedding focus items/i);
  assert.deepEqual((action.metadata?.decision_focus as Record<string, unknown>).focus_items, []);
});
