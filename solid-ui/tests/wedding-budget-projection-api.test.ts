import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchWeddingBudgetProjectionMessages,
  sendWeddingBudgetProjection,
} from "../src/lib/weddingBudgetProjectionApi.ts";

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
    });
  } finally {
    globalThis.fetch = priorFetch;
    Object.defineProperty(globalThis, "window", { configurable: true, value: priorWindow });
  }

  assert.equal(requests[0]?.url, "/wedding/budget/projections?wedding_plan_id=plan+one&response_workspace_id=workspace%2Fone");
  assert.equal(requests[1]?.url, "/wedding/budget/projections");
  assert.equal(requests[1]?.body?.wedding_plan_id, "plan one");
  assert.equal(requests[1]?.body?.response_workspace_id, "workspace/one");
  const message = requests[1]?.body?.message as Record<string, unknown>;
  assert.match(String(message.id), /^[0-9A-HJKMNP-TV-Z]{26}$/i);
  assert.deepEqual(message.supertags, ["wedding_budget"]);
});
