import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingTaskAlertReminderScheduleItems,
  weddingScheduleItemToAfpCalendarMessage,
  weddingTaskItemToAfpTaskMessage,
} from "@/lib/weddingCalendarProjectionState";
import { weddingNeedToKnowContextToAfpMessage } from "@/lib/weddingNeedToKnowAfpProjectionState";
import { buildWeddingPersistedWorkspaceState } from "@/lib/weddingPersistedWorkspaceState";
import { normalizeWeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";
import { weddingTaskDateToAfpMessage } from "@/lib/weddingTaskDateProjectionState";

const metadata = {
  weddingPlanId: "wedding_plan:persisted",
  responseWorkspaceId: "response_workspace:persisted",
  sourceResponseId: "response:persisted",
  supertags: ["template:wedding_planning", "event:wedding"],
};

function contextMessage() {
  return weddingNeedToKnowContextToAfpMessage({
    metadata: normalizeWeddingPlanningMetadata(metadata),
    planningContext: {
      dateOrSeason: "2027-10-03",
      location: "Sydney NSW",
      guestCount: 90,
      budgetComfort: "Mid-range",
      topPriorities: ["food", "photos"],
      countryCode: "AU",
      noimDownloaded: "no",
      celebrantPath: "need_options",
    },
    answeredLabels: ["Date/season: 2027-10-03", "Location: Sydney NSW", "Guest count: 90"],
    nextQuestionLabel: "Ready to generate the first recommendation set.",
    readyForFirstRecommendations: true,
  }, "2026-09-11T00:00:00.000Z");
}

test("buildWeddingPersistedWorkspaceState preserves second-order task metadata", () => {
  const message = weddingTaskItemToAfpTaskMessage({
    id: "second-order-weather",
    title: "Confirm wet-weather backup for Harbour Hall",
    kind: "vendor_follow_up",
    priority: "high",
    metadata: {
      ...metadata,
      second_order_task: true,
      second_order_loop: "weather_backup",
      second_order_evidence_labels: ["weather-exposed plan", "selected scope: venue: Harbour Hall"],
      second_order_linked_artifact_id: "artifact:venue-table",
      selected_decision_scope: {
        selected_option_label: "Harbour Hall",
        artifact_id: "artifact:venue-table",
      },
    },
    linkedArtifactId: "artifact:venue-table",
  }, "2026-09-11T00:00:00.000Z");
  const state = buildWeddingPersistedWorkspaceState({
    messages: [message],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });
  const taskMetadata = state.taskItems[0]?.metadata as Record<string, unknown>;

  assert.equal(state.taskItems.length, 1);
  assert.equal(taskMetadata.second_order_task, true);
  assert.equal(taskMetadata.second_order_loop, "weather_backup");
  assert.deepEqual(taskMetadata.second_order_evidence_labels, ["weather-exposed plan", "selected scope: venue: Harbour Hall"]);
  assert.equal((taskMetadata.selected_decision_scope as Record<string, unknown>).selected_option_label, "Harbour Hall");
});

test("buildWeddingPersistedWorkspaceState applies persisted task due-date edits", () => {
  const taskMessage = weddingTaskItemToAfpTaskMessage({
    id: "venue-deposit",
    title: "Confirm venue deposit",
    kind: "vendor_follow_up",
    dueAt: "2027-07-01T09:00:00.000Z",
    priority: "high",
    metadata,
  }, "2026-09-11T00:00:00.000Z");
  const updateMessage = weddingTaskDateToAfpMessage({
    taskId: "venue-deposit",
    title: "Confirm venue deposit",
    dueDate: "2027-08-01",
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceMessageId: taskMessage.id,
    nowIso: "2026-09-11T01:00:00.000Z",
  });
  assert.ok(updateMessage);

  const state = buildWeddingPersistedWorkspaceState({
    messages: [taskMessage, updateMessage],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });
  const task = state.taskItems[0];
  const taskMetadata = task?.metadata as Record<string, unknown>;

  assert.equal(state.taskItems.length, 1);
  assert.equal(task?.dueAt, "2027-08-01T09:00:00.000Z");
  assert.equal(taskMetadata.user_edited_due_date, "2027-08-01");
});

test("buildWeddingPersistedWorkspaceState can clear a persisted task due date", () => {
  const taskMessage = weddingTaskItemToAfpTaskMessage({
    id: "venue-deposit",
    title: "Confirm venue deposit",
    kind: "vendor_follow_up",
    dueAt: "2027-07-01T09:00:00.000Z",
    priority: "high",
    metadata,
  }, "2026-09-11T00:00:00.000Z");
  const olderUpdate = weddingTaskDateToAfpMessage({
    taskId: "venue-deposit",
    title: "Confirm venue deposit",
    dueDate: "2027-08-01",
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceMessageId: taskMessage.id,
    nowIso: "2026-09-11T01:00:00.000Z",
  });
  const clearUpdate = weddingTaskDateToAfpMessage({
    taskId: "venue-deposit",
    title: "Confirm venue deposit",
    dueDate: null,
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceMessageId: taskMessage.id,
    nowIso: "2026-09-11T02:00:00.000Z",
  });
  assert.ok(olderUpdate);
  assert.ok(clearUpdate);

  const state = buildWeddingPersistedWorkspaceState({
    messages: [taskMessage, olderUpdate, clearUpdate],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });
  const task = state.taskItems[0];
  const taskMetadata = task?.metadata as Record<string, unknown>;

  assert.equal(state.taskItems.length, 1);
  assert.equal(task?.dueAt, null);
  assert.equal(taskMetadata.user_edited_due_date, null);
});

test("buildWeddingPersistedWorkspaceState redacts legacy imported selected-decision scope metadata on reload", () => {
  const message = weddingTaskItemToAfpTaskMessage({
    id: "second-order-import",
    title: "Confirm imported venue decision",
    kind: "vendor_follow_up",
    priority: "high",
    metadata: {
      ...metadata,
      second_order_task: true,
      second_order_loop: "vendor_confirmation",
      selected_decision_scope: {
        selected_option_label: "Harbour Hall",
        artifact_id: "artifact:venue-table",
        artifact_title: "Imported XLSX: private-family-budget.xlsx",
        artifactTitle: "Imported XLSX: private-family-budget.xlsx",
        source_labels: ["original upload saved", "source: private-family-budget.xlsx"],
        sourceLabels: ["source: private-family-budget.xlsx"],
        source_urls: [
          "http://localhost:8787/private-family-budget.xlsx",
          "https://127.0.0.1/private-family-budget.xlsx",
          "https://storage.example.test/uploads/private-family-budget.xlsx?token=private",
          "https://example.com/vendor-quote",
        ],
        sourceUrls: ["https://storage.example.test/uploads/private-family-budget.xlsx?token=private"],
        metadata_labels: ["source: private-family-budget.xlsx", "needs follow-up"],
        metadataLabels: ["wedding_import:spreadsheet"],
      },
    },
    linkedArtifactId: "artifact:venue-table",
  }, "2026-09-11T00:00:00.000Z");
  const state = buildWeddingPersistedWorkspaceState({
    messages: [message],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });
  const scope = (state.taskItems[0]?.metadata as Record<string, unknown>).selected_decision_scope as Record<string, unknown>;
  const serialized = JSON.stringify(scope);

  assert.equal(scope.selected_option_label, "Harbour Hall");
  assert.equal(scope.artifact_title, "Imported private planning file");
  assert.equal(scope.artifactTitle, undefined);
  assert.deepEqual(scope.source_labels, ["Imported private planning file"]);
  assert.equal(scope.sourceLabels, undefined);
  assert.deepEqual(scope.source_urls, ["https://example.com/vendor-quote"]);
  assert.equal(scope.sourceUrls, undefined);
  assert.deepEqual(scope.metadata_labels, ["needs follow-up"]);
  assert.equal(scope.imported_private_evidence, true);
  assert.equal(serialized.includes("private-family-budget.xlsx"), false);
  assert.equal(serialized.includes("localhost"), false);
  assert.equal(serialized.includes("127.0.0.1"), false);
  assert.equal(serialized.includes("storage.example.test"), false);
  assert.equal(serialized.includes("token=private"), false);
  assert.equal(serialized.includes("original upload saved"), false);
  assert.equal(serialized.includes("wedding_import:spreadsheet"), false);
});

test("buildWeddingPersistedWorkspaceState preserves preparation task kind and alert metadata", () => {
  const message = weddingTaskItemToAfpTaskMessage({
    id: "prep-cake",
    title: "Book cake baker, tasting, design, delivery, and cutting plan",
    kind: "cake",
    dueAt: "2027-07-20T10:00:00.000Z",
    dueLabel: "6-9 months out; final details 4-6 weeks out",
    priority: "high",
    metadata: {
      ...metadata,
      preparation_checklist: true,
      preparation_checklist_item: "cake",
      alert_offset_days: [60, 30, 14],
      schedule_basis: "wedding_date",
      second_order_loop: "vendor_confirmation",
    },
  }, "2026-09-11T00:00:00.000Z");
  const state = buildWeddingPersistedWorkspaceState({
    messages: [message],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });
  const task = state.taskItems[0];
  const taskMetadata = task?.metadata as Record<string, unknown>;

  assert.equal(state.taskItems.length, 1);
  assert.equal(task?.kind, "cake");
  assert.deepEqual(taskMetadata.alert_offset_days, [60, 30, 14]);
  assert.deepEqual(taskMetadata.alert_dates, ["2027-05-21", "2027-06-20", "2027-07-06"]);
  assert.equal(taskMetadata.preparation_checklist_item, "cake");
  assert.equal(taskMetadata.second_order_loop, "vendor_confirmation");
});

test("buildWeddingPersistedWorkspaceState preserves calendar reminder metadata for dedupe", () => {
  const [reminder] = buildWeddingTaskAlertReminderScheduleItems({
    taskItems: [{
      id: "prep-cake",
      title: "Book cake baker",
      kind: "cake",
      dueAt: "2027-07-20T10:00:00.000Z",
      dueLabel: "6-9 months out",
      priority: "high",
      metadata: {
        ...metadata,
        preparation_checklist: true,
        preparation_checklist_item: "cake",
        alert_offset_days: [60],
        alert_dates: ["2027-05-21"],
      },
    }],
  });
  assert.ok(reminder);
  const message = weddingScheduleItemToAfpCalendarMessage(reminder, "2026-09-11T00:00:00.000Z");
  assert.ok(message);

  const state = buildWeddingPersistedWorkspaceState({
    messages: [message],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });
  const schedule = state.scheduleItems[0];
  const scheduleMetadata = schedule?.metadata as Record<string, unknown>;

  assert.equal(state.scheduleItems.length, 1);
  assert.equal(schedule?.kind, "task_reminder");
  assert.equal(scheduleMetadata.alert_reminder, true);
  assert.equal(scheduleMetadata.alert_reminder_for_task_id, "prep-cake");
  assert.equal(scheduleMetadata.alert_date, "2027-05-21");

  const duplicates = buildWeddingTaskAlertReminderScheduleItems({
    taskItems: [{
      id: "prep-cake",
      title: "Book cake baker",
      kind: "cake",
      dueAt: "2027-07-20T10:00:00.000Z",
      metadata: {
        ...metadata,
        alert_offset_days: [60],
        alert_dates: ["2027-05-21"],
      },
    }],
    existingScheduleItems: state.scheduleItems,
  });
  assert.deepEqual(duplicates, []);
});

test("buildWeddingPersistedWorkspaceState treats persisted Need-To-Know context as saved queue context", () => {
  const state = buildWeddingPersistedWorkspaceState({
    messages: [contextMessage()],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
  });

  assert.equal(state.hasPersistedData, true);
  assert.equal(state.artifacts.length, 0);
  assert.equal(state.contextItems.length, 1);
  assert.equal(state.contextItems[0]?.metadata.responseWorkspaceId, metadata.responseWorkspaceId);
  assert.equal(state.contextItems[0]?.readyForFirstRecommendations, true);
});

test("buildWeddingPersistedWorkspaceState ignores messages from other workspaces", () => {
  const message = contextMessage();
  const otherWorkspace = {
    ...message,
    id: "other",
    content: {
      ...message.content,
      response_workspace_id: "response_workspace:other",
    },
    metadata: {
      ...message.metadata,
      response_workspace_id: "response_workspace:other",
    },
  };
  const state = buildWeddingPersistedWorkspaceState({
    messages: [message, otherWorkspace],
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
  });

  assert.equal(state.sourceMessageIds.includes("other"), false);
  assert.equal(state.hasPersistedData, true);
});
