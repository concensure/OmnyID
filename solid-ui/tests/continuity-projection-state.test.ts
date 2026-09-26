import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildContinuityPersonalOsProjectionState,
  buildContinuityProjectionQueueSelectionState,
  buildContinuityProjectionQueueState,
  type ContinuityRankedItem,
} from "../src/lib/continuityProjectionState.ts";

test("buildContinuityProjectionQueueState groups pending sent and blocked work", () => {
  const queue = buildContinuityProjectionQueueState({
    items: [
      {
        id: "task:1",
        sourceId: "1",
        kind: "task",
        title: "Save task",
        status: "pending",
        statusLabel: "Ready",
        blockedReason: null,
        sendInput: { thread_id: "thread", type: "task", content: { title: "Save task" } },
      },
      {
        id: "task:2",
        sourceId: "2",
        kind: "task",
        title: "Saved task",
        status: "sent",
        statusLabel: "Saved",
        blockedReason: null,
        sendInput: null,
      },
      {
        id: "task:3",
        sourceId: "3",
        kind: "task",
        title: "Blocked task",
        status: "blocked",
        statusLabel: "Blocked",
        blockedReason: "Needs title",
        sendInput: null,
      },
    ],
  });

  assert.equal(queue.pendingItems.length, 1);
  assert.equal(queue.sentItems.length, 1);
  assert.equal(queue.blockedItems.length, 1);
  assert.equal(queue.pendingSendInputs.length, 1);
  assert.equal(queue.canDispatch, true);
});

test("buildContinuityProjectionQueueSelectionState filters deselected pending items", () => {
  const queue = buildContinuityProjectionQueueState({
    items: [
      {
        id: "task:1",
        sourceId: "1",
        kind: "task",
        title: "One",
        status: "pending",
        statusLabel: "Ready",
        blockedReason: null,
        sendInput: { thread_id: "thread", type: "task", content: { title: "One" } },
      },
      {
        id: "task:2",
        sourceId: "2",
        kind: "task",
        title: "Two",
        status: "pending",
        statusLabel: "Ready",
        blockedReason: null,
        sendInput: { thread_id: "thread", type: "task", content: { title: "Two" } },
      },
    ],
  });

  const selection = buildContinuityProjectionQueueSelectionState({
    queue,
    deselectedItemIds: { "task:2": true },
  });

  assert.equal(selection.selectedPendingCount, 1);
  assert.equal(selection.totalPendingCount, 2);
  assert.equal(selection.queue.pendingSendInputs.length, 1);
});

test("buildContinuityPersonalOsProjectionState ranks pressure and limits decision focus", () => {
  const items: ContinuityRankedItem[] = [
    {
      id: "task:low",
      kind: "task",
      title: "Later task",
      pressureFamily: "obligation",
      rankWeight: 12,
      dueLabel: null,
      dueAt: null,
      explanation: "Later.",
      evidenceLabels: ["task"],
      sourceSurface: "tasks",
      simulatorSeedKind: "commitment",
    },
    {
      id: "decision:high",
      kind: "decision",
      title: "Confirm venue shortlist",
      pressureFamily: "knowledge",
      rankWeight: 42,
      dueLabel: null,
      dueAt: null,
      explanation: "Needs evidence.",
      evidenceLabels: ["decision"],
      sourceSurface: "decision_queue",
      simulatorSeedKind: "context",
    },
  ];

  const projection = buildContinuityPersonalOsProjectionState({
    items,
    summarySubject: "wedding",
    decisionFocusLimit: 1,
  });

  assert.equal(projection.hasSignal, true);
  assert.equal(projection.rankedItems[0]?.id, "decision:high");
  assert.equal(projection.fieldEnginePrimaryType, "knowledge");
  assert.equal(projection.decisionLoadRelief.focusItems.length, 1);
  assert.match(projection.simulatorSeedSummary ?? "", /bounded context preview seed/);
});
