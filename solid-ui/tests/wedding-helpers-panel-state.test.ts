import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingHelperPeople,
  buildWeddingHelperWeeklyAgenda,
  buildWeddingHelperWeeklyAgendaRows,
  buildWeddingHelperWorkloadRows,
  loadWeddingHelperLocalState,
  normalizeWeddingHelperLocalState,
  saveWeddingHelperLocalState,
  weddingHelperResponsibilityToAfpMessage,
  weddingHelperResponsibilityToAfpSendInput,
  weddingHelperTaskDueLabel,
  weddingHelperTaskIsOverdue,
  weddingHelperTaskPriorityLabel,
  weddingHelperWorkloadSuggestion,
  type WeddingHelperPlanningTask,
} from "@/lib/weddingHelpersPanelState";

function task(input: Partial<WeddingHelperPlanningTask> & { id: string; title?: string }): WeddingHelperPlanningTask {
  return {
    id: input.id,
    title: input.title ?? input.id,
    kind: "planning",
    ...input,
  } as WeddingHelperPlanningTask;
}

test("wedding helper task labels tolerate missing dates and priorities", () => {
  assert.equal(weddingHelperTaskDueLabel(task({ id: "missing" })), "Add due date");
  assert.equal(weddingHelperTaskDueLabel(task({ id: "label", dueLabel: "Next week" })), "Next week");
  assert.equal(weddingHelperTaskDueLabel(task({ id: "date", dueAt: "2027-08-01T09:00:00+10:00" })), "2027-08-01");
  assert.equal(weddingHelperTaskPriorityLabel(task({ id: "priority", priority: "urgent" })), "Urgent");
  assert.equal(weddingHelperTaskPriorityLabel(task({ id: "plain" })), "Normal");
});

test("wedding helper overdue check ignores malformed dates", () => {
  const now = new Date("2027-08-10T09:00:00.000Z").getTime();

  assert.equal(weddingHelperTaskIsOverdue(task({ id: "old", dueAt: "2027-08-01T09:00:00.000Z" }), now), true);
  assert.equal(weddingHelperTaskIsOverdue(task({ id: "future", dueAt: "2027-08-20T09:00:00.000Z" }), now), false);
  assert.equal(weddingHelperTaskIsOverdue(task({ id: "bad", dueAt: "not a date" }), now), false);
});

test("wedding helper people dedupe contacts, custom helpers, and partner names calmly", () => {
  assert.deepEqual(buildWeddingHelperPeople(["Alex", " alex ", ""], ["Sam", "sam"]), ["Alex", "Sam", "Partner 1", "Partner 2"]);
  assert.deepEqual(buildWeddingHelperPeople(["Alex"], ["Sam"], ["Claire", "James"]), ["Alex", "Sam", "Claire", "James"]);
  assert.deepEqual(buildWeddingHelperPeople([], [], ["Claire", "Claire"]), ["Claire"]);
});

test("wedding helper workload rows and suggestion flag imbalance neutrally", () => {
  const rows = buildWeddingHelperWorkloadRows({
    people: ["Alex", "Sam"],
    doneTaskIds: {},
    taskAssignees: {},
    now: new Date("2027-08-10T09:00:00.000Z").getTime(),
    tasks: [
      task({ id: "one", assignee: "Alex", dueAt: "2027-08-01T09:00:00.000Z" }),
      task({ id: "two", assignee: "Alex" }),
      task({ id: "three", assignee: "Alex" }),
      task({ id: "four", assignee: "Alex" }),
      task({ id: "five", assignee: "Sam" }),
    ],
  });

  assert.deepEqual(rows.map((row) => [row.name, row.openCount, row.overdueCount]), [["Alex", 4, 1], ["Sam", 1, 0]]);
  assert.equal(rows[0]?.estimatedWorkloadPoints, 5);
  assert.match(rows[0]?.workloadDetailLabel ?? "", /5 workload points/i);
  assert.match(weddingHelperWorkloadSuggestion(rows), /Alex has 4 open tasks and Sam has 1/i);
});

test("wedding helper workload uses urgency and overdue status, not only task count", () => {
  const rows = buildWeddingHelperWorkloadRows({
    people: ["Alex", "Sam"],
    doneTaskIds: {},
    taskAssignees: {},
    now: new Date("2027-08-10T09:00:00.000Z").getTime(),
    tasks: [
      task({ id: "alex-plain", assignee: "Alex", priority: "low" }),
      task({ id: "sam-urgent", assignee: "Sam", priority: "urgent", dueAt: "2027-08-01T09:00:00.000Z" }),
    ],
  });

  const alex = rows.find((row) => row.name === "Alex");
  const sam = rows.find((row) => row.name === "Sam");

  assert.equal(alex?.estimatedWorkloadPoints, 0.5);
  assert.equal(sam?.estimatedWorkloadPoints, 4);
  assert.match(weddingHelperWorkloadSuggestion(rows), /Sam has 1 open task and Alex has 1 open task/i);
});

test("wedding helper weekly agenda puts overdue work first and hides done tasks", () => {
  const agenda = buildWeddingHelperWeeklyAgenda({
    now: new Date("2027-08-10T09:00:00.000Z").getTime(),
    doneTaskIds: { done: true },
    tasks: [
      task({ id: "later", dueAt: "2027-08-20T09:00:00.000Z" }),
      task({ id: "missing" }),
      task({ id: "overdue", dueAt: "2027-08-01T09:00:00.000Z" }),
      task({ id: "done", dueAt: "2027-07-01T09:00:00.000Z" }),
    ],
  });

  assert.deepEqual(agenda.map((item) => item.id), ["overdue", "later", "missing"]);
});

test("wedding helper weekly agenda rows explain the next short planning move", () => {
  const rows = buildWeddingHelperWeeklyAgendaRows({
    now: new Date("2027-08-10T09:00:00.000Z").getTime(),
    doneTaskIds: {},
    taskAssignees: { missing: "Unassigned", consult: "Alex" },
    taskConsultedPeople: { consult: "Sam" },
    tasks: [
      task({ id: "missing", title: "Choose music", dueAt: "2027-08-20T09:00:00.000Z" }),
      task({ id: "consult", title: "Confirm menu", dueAt: "2027-08-21T09:00:00.000Z" }),
      task({ id: "overdue", title: "Pay venue deposit", assignee: "Alex", dueAt: "2027-08-01T09:00:00.000Z" }),
    ],
  });

  assert.equal(rows[0]?.id, "overdue");
  assert.equal(rows[0]?.suggestedActionLabel, "Decide the next move");
  assert.match(rows[1]?.reasonLabel ?? "", /one clear owner/i);
  assert.equal(rows[1]?.suggestedActionLabel, "Pick an owner");
  assert.match(rows[2]?.reasonLabel ?? "", /Sam/i);
  assert.equal(rows[2]?.suggestedActionLabel, "Ask for input");
});

test("wedding helper local state normalizes helpers assignments and dates", () => {
  const state = normalizeWeddingHelperLocalState({
    doneTaskIds: { task_one: true, task_two: false },
    taskAssignees: { task_one: " Alex ", empty: "" },
    taskConsultedPeople: { task_one: "Sam" },
    taskLastContactDates: { task_one: "2027-06-01", bad: "next week" },
    customHelpers: ["Mia", " mia ", "", "Coordinator"],
  });

  assert.deepEqual(state.doneTaskIds, { task_one: true });
  assert.deepEqual(state.taskAssignees, { task_one: "Alex" });
  assert.deepEqual(state.taskConsultedPeople, { task_one: "Sam" });
  assert.deepEqual(state.taskLastContactDates, { task_one: "2027-06-01" });
  assert.deepEqual(state.customHelpers, ["Mia", "Coordinator"]);
});

test("wedding helper local state saves by workspace and survives malformed storage", () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });

  const saved = saveWeddingHelperLocalState("response_workspace:one", {
    doneTaskIds: { task_one: true },
    taskAssignees: { task_one: "Alex" },
    taskConsultedPeople: { task_one: "Sam" },
    taskLastContactDates: { task_one: "2027-06-01" },
    customHelpers: ["Mia"],
  });

  assert.deepEqual(loadWeddingHelperLocalState("response_workspace:one"), saved);
  assert.deepEqual(loadWeddingHelperLocalState("response_workspace:two"), {
    doneTaskIds: {},
    taskAssignees: {},
    taskConsultedPeople: {},
    taskLastContactDates: {},
    customHelpers: [],
  });

  storage.set("omnyid.wedding.helpers.v1:response_workspace:broken", "{bad json");
  assert.deepEqual(loadWeddingHelperLocalState("response_workspace:broken").customHelpers, []);
});

test("wedding helper responsibility projects private AFP context for agents", () => {
  const message = weddingHelperResponsibilityToAfpMessage({
    task: task({
      id: "confirm-wet-weather",
      title: "Confirm wet-weather backup",
      assignee: "Alex",
      dueAt: "2027-08-01T09:00:00.000Z",
      priority: "high",
    }),
    ownerLabel: "Sam",
    consultedLabel: "Mia",
    lastContactDate: "2027-07-20",
    status: "open",
    nowIso: "2027-07-21T00:00:00.000Z",
    metadata: {
      wedding_plan_id: "plan-123",
      response_workspace_id: "workspace-456",
    },
  });

  assert.ok(message);
  assert.equal(message.type, "ledger");
  assert.equal(message.kind, "wedding_helper_responsibility");
  assert.equal(message.subtype, "wedding_helper_responsibility_update");
  assert.deepEqual(message.to, [
    "agent://wedding-planning",
    "agent://tasks",
    "agent://decision-os",
    "agent://knowledge-graph",
    "agent://topology",
  ]);
  assert.equal(message.content.owner_label, "Sam");
  assert.equal(message.content.consulted_label, "Mia");
  assert.equal(message.content.last_contact_date, "2027-07-20");
  assert.equal(message.content.semantic_kind, "wedding_active_loop");
  assert.equal(message.content.semantic_object.title, "Confirm wet-weather backup");
  assert.ok(message.content.semantic_tags.includes("wedding_helper_responsibility"));
  assert.equal(message.metadata?.e2ee_required, true);
  assert.equal(message.metadata?.semantic_kind, "wedding_active_loop");
  assert.ok(message.metadata?.semantic_tags.includes("wedding_workload"));
  assert.ok(message.supertags?.includes("decisionos:wedding_workload"));
  assert.ok(message.supertags?.includes("topology:wedding_responsibility"));
  assert.ok(message.references?.some((reference) => reference.type === "wedding_task" && reference.target === "confirm-wet-weather"));
  assert.ok(message.views.some((view) => view.format === "a2ui"));
  assert.equal(message.views.find((view) => view.format === "a2ui")?.content.semantic_object.kind, "wedding_active_loop");
});

test("wedding helper responsibility send input keeps relational storage enabled", () => {
  const sendInput = weddingHelperResponsibilityToAfpSendInput({
    task: task({ id: "task-one", title: "Book transport" }),
    ownerLabel: "Partner 1",
    status: "done",
    metadata: {
      wedding_plan_id: "plan-123",
      response_workspace_id: "workspace-456",
    },
  });

  assert.ok(sendInput);
  assert.equal(sendInput.store_in_relational, true);
  assert.equal(sendInput.content.kind, "wedding_helper_responsibility");
  assert.equal(sendInput.content.status, "done");
  assert.equal(sendInput.content.semantic_kind, "wedding_active_loop");
  assert.deepEqual(sendInput.metadata?.searchable_terms, [
    "Book transport",
    "task-one",
    "Partner 1",
    "Add due date",
    "Normal",
    "wedding helper responsibility",
    "wedding workload",
  ]);
});

test("wedding helper responsibility marks unassigned work as needing owner action", () => {
  const message = weddingHelperResponsibilityToAfpMessage({
    task: task({ id: "missing-owner", title: "Confirm song list" }),
    ownerLabel: "Unassigned",
    status: "open",
    metadata: {
      wedding_plan_id: "plan-123",
      response_workspace_id: "workspace-456",
    },
  });

  assert.ok(message);
  assert.equal(message.content.semantic_kind, "wedding_approval_required");
  assert.equal(message.content.semantic_object.stateLabel, "Needs owner");
  assert.equal(message.content.semantic_object.actions[0]?.label, "Assign owner");
});

test("wedding helper responsibility projection skips malformed tasks", () => {
  assert.equal(weddingHelperResponsibilityToAfpMessage({ task: task({ id: "" }) }), null);
  assert.equal(weddingHelperResponsibilityToAfpSendInput({ task: task({ id: "missing-title", title: "" }) }), null);
});
