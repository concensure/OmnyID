import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeAgentTask,
  normalizeTaskDetailResponse,
  type AgentTask,
} from "../src/lib/taskDetailResponseState.ts";

const FALLBACK_TASK: AgentTask = {
  id: "task_fallback",
  intent: "Fallback intent",
  content: "Fallback content",
  status: "pending",
  priority: "normal",
  created_at: "2026-08-13T00:00:00Z",
  started_at: null,
  thread_id: "thread_fallback",
};

test("normalizeTaskDetailResponse keeps JSON payloads and fills missing scalars from fallback task", () => {
  assert.deepEqual(normalizeTaskDetailResponse({
    status: "done",
    priority: 5,
    plan_json: { steps: ["one"] },
    result_json: ["ok"],
    error: 404,
  }, FALLBACK_TASK), {
    id: "task_fallback",
    intent: "Fallback intent",
    content: "Fallback content",
    status: "done",
    priority: "5",
    created_at: "2026-08-13T00:00:00Z",
    started_at: null,
    thread_id: "thread_fallback",
    plan_json: { steps: ["one"] },
    result_json: ["ok"],
    error: "404",
  });
});

test("normalizeAgentTask rejects malformed tasks without any stable id", () => {
  assert.equal(normalizeAgentTask({ status: "pending" }), null);
  assert.equal(normalizeTaskDetailResponse(null), null);
});

test("normalizeTaskDetailResponse preserves explicit null started_at and error fields", () => {
  assert.deepEqual(normalizeTaskDetailResponse({
    id: "task_1",
    status: "executing",
    priority: "high",
    created_at: "2026-08-13T01:00:00Z",
    started_at: null,
    error: null,
  }), {
    id: "task_1",
    intent: undefined,
    content: undefined,
    status: "executing",
    priority: "high",
    created_at: "2026-08-13T01:00:00Z",
    started_at: null,
    thread_id: undefined,
    plan_json: undefined,
    result_json: undefined,
    error: null,
  });
});
