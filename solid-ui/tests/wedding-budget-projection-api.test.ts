import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchWeddingBudgetProjectionMessages,
  sendWeddingBudgetProjection,
  WeddingBudgetProjectionConflictError,
  weddingBudgetProjectionExpectedRevision,
} from "../src/lib/weddingBudgetProjectionApi.ts";
import type { AfpMessage } from "../src/lib/api.ts";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test("Wedding budget projection API binds reads and writes to plan plus workspace", async () => {
  const priorWindow = globalThis.window;
  const priorFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> | null }> = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() },
  });
  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null,
    });
    const payload = init?.method === "POST"
      ? { success: true, message_id: "message-1", owner_user_id: "owner", actor_user_id: "partner" }
      : { tags: ["wedding_budget"], match: "all", count: 0, messages: [] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const scope = { weddingPlanId: "plan one", responseWorkspaceId: "workspace/one" };
  try {
    await fetchWeddingBudgetProjectionMessages(scope);
    await sendWeddingBudgetProjection(scope, {
      id: "budget-logical-id",
      thread_id: "wedding-budget-thread",
      from: "system://wedding-planning",
      to: ["agent://wedding-planning"],
      type: "decision",
      subtype: "wedding_decision_selection",
      content: { kind: "wedding_decision_selection" },
      supertags: ["wedding_budget"],
      metadata: { wedding_plan_id: "plan one", response_workspace_id: "workspace/one" },
    }, 0);
  } finally {
    globalThis.fetch = priorFetch;
    Object.defineProperty(globalThis, "window", { configurable: true, value: priorWindow });
  }

  assert.equal(requests[0]?.url, "/wedding/budget/projections?wedding_plan_id=plan+one&response_workspace_id=workspace%2Fone");
  assert.equal(requests[1]?.url, "/wedding/budget/projections");
  assert.equal(requests[1]?.body?.wedding_plan_id, "plan one");
  assert.equal(requests[1]?.body?.response_workspace_id, "workspace/one");
  assert.equal(requests[1]?.body?.expected_revision, 0);
  const message = requests[1]?.body?.message as Record<string, unknown>;
  assert.match(String(message.id), /^[0-9A-HJKMNP-TV-Z]{26}$/i);
  assert.deepEqual(message.supertags, ["wedding_budget"]);
});

test("Wedding budget revisions are per artifact and legacy records begin at revision one", () => {
  const allocation = {
    id: "allocation-1", thread_id: "thread", from: "user://couple", to: [], timestamp: new Date().toISOString(),
    type: "decision", content: { artifact_id: "wedding-budget-allocation" }, views: [], attachments: [], references: [],
    supertags: ["wedding_budget"], metadata: {},
  } satisfies AfpMessage;
  const allocationRevisionThree = { ...allocation, id: "allocation-3", metadata: { budgetRevision: 3 } };
  const contribution = { ...allocation, id: "contribution-1", content: { artifact_id: "wedding-budget-contribution:workspace:alex" } };
  const input = {
    thread_id: "thread", from: "user://couple", to: [], type: "decision",
    content: { artifact_id: "wedding-budget-allocation" },
  };

  assert.equal(weddingBudgetProjectionExpectedRevision([], input), 0);
  assert.equal(weddingBudgetProjectionExpectedRevision([allocation], input), 1);
  assert.equal(weddingBudgetProjectionExpectedRevision([allocation, allocationRevisionThree, contribution], input), 3);
});

test("Wedding budget API exposes stale shared writes as a reviewable conflict", async () => {
  const priorWindow = globalThis.window;
  const priorFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() },
  });
  globalThis.fetch = async () => new Response(
    "wedding_budget_revision_conflict: expected 1, current 2. This shared budget changed elsewhere.",
    { status: 409 },
  );
  try {
    await assert.rejects(() => sendWeddingBudgetProjection(
      { weddingPlanId: "plan", responseWorkspaceId: "workspace" },
      { thread_id: "thread", from: "user://couple", to: [], type: "decision", content: { artifact_id: "wedding-budget-allocation" } },
      1,
    ), (error) => error instanceof WeddingBudgetProjectionConflictError
      && error.expectedRevision === 1 && error.currentRevision === 2);
  } finally {
    globalThis.fetch = priorFetch;
    Object.defineProperty(globalThis, "window", { configurable: true, value: priorWindow });
  }
});
