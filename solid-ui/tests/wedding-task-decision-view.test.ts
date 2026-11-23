import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import type { AfpMessage } from "@/lib/api";
import { buildActiveTaskDecisionViewState } from "@/lib/activeTaskDecisionViewState";

function message(input: Partial<AfpMessage> & { id: string; type: string; content: Record<string, unknown> }): AfpMessage {
  return {
    thread_id: "thread:wedding-plan",
    parent_id: null,
    from: "system://planner",
    to: [],
    subtype: null,
    timestamp: "2026-10-20T00:00:00.000Z",
    metadata: {},
    encryption: null,
    ...input,
  } as AfpMessage;
}

test("task view keeps lifecycle colours textual and lists multiple decisions in source order", () => {
  const state = buildActiveTaskDecisionViewState([
    message({
      id: "decision:venue",
      type: "decision",
      content: {
        decision_id: "decision:venue",
        task_id: "task:book-venue",
        title: "Choose the venue",
        options: [{ id: "garden", label: "Garden Hall" }, { id: "harbour", label: "Harbour House" }],
        selected_option: { id: "harbour", label: "Harbour House" },
      },
    }),
    message({
      id: "task:book-venue:create",
      type: "task",
      content: {
        task_id: "task:book-venue",
        title: "Book the venue",
        status: "in progress",
        decisions: [{
          id: "decision:date",
          title: "Choose the date",
          options: ["18 September", "25 September"],
        }],
      },
    }),
  ]);

  assert.equal(state.items.length, 1);
  assert.equal(state.items[0]?.status, "in_progress");
  assert.deepEqual(state.items[0]?.decisions.map((decision) => decision.title), ["Choose the date", "Choose the venue"]);
  assert.equal(state.items[0]?.decisions[1]?.chosenOptionLabel, "Harbour House");
  assert.equal(state.items[0]?.decisions[1]?.options.find((option) => option.chosen)?.label, "Harbour House");
  assert.equal(state.counts.in_progress, 1);

  const source = readFileSync(resolve(process.cwd(), "src/components/ActiveTasksDecisionView.tsx"), "utf8");
  assert.match(source, /pending: "border-amber-200/);
  assert.match(source, /in_progress: "border-sky-200/);
  assert.match(source, /decided: "border-emerald-200/);
  assert.match(source, /skipped: "border-slate-200/);
  assert.match(source, /Chosen option/);
  assert.match(source, /<ol class="space-y-4">/);
});

test("latest task revision yields decided and skipped states without leaking technical text", () => {
  const state = buildActiveTaskDecisionViewState([
    message({
      id: "task:flowers:create",
      type: "task",
      content: { task_id: "task:flowers", title: "Choose flowers", status: "pending", description: "schema_version: 2 fingerprint abc" },
    }),
    message({
      id: "task:flowers:done",
      type: "task",
      timestamp: "2026-10-20T01:00:00.000Z",
      content: {
        task_id: "task:flowers",
        status: "completed",
        decision: { title: "Choose a palette", options: ["Warm", "Cool"], selected_option_label: "Warm" },
      },
    }),
    message({
      id: "task:favours",
      type: "task",
      content: { task_id: "task:favours", title: "Choose favours", status: "skipped" },
    }),
  ]);

  assert.equal(state.items.find((item) => item.id === "task:flowers")?.status, "decided");
  assert.equal(state.items.find((item) => item.id === "task:flowers")?.description, null);
  assert.equal(state.items.find((item) => item.id === "task:favours")?.status, "skipped");
  assert.equal(state.counts.decided, 1);
  assert.equal(state.counts.skipped, 1);
});

test("App delegates its formerly empty Active To-Dos page to the decision-aware view", () => {
  const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  assert.match(source, /return <ActiveTasksDecisionView \{\.\.\.props\} \/>/);
  assert.doesNotMatch(source, /AFP task messages not yet completed or overdue/);
});
