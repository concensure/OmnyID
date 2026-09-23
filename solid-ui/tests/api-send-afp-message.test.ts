import assert from "node:assert/strict";
import test from "node:test";

import { sendAfpMessage, sendAfpPayloadMessage } from "@/lib/api";

const localStorageState = new Map<string, string>();
const sessionStorageState = new Map<string, string>();
const storageStub = (state: Map<string, string>) => ({
  getItem: (key: string) => state.get(key) ?? null,
  setItem: (key: string, value: string) => state.set(key, value),
  removeItem: (key: string) => state.delete(key),
});

Object.defineProperty(globalThis, "window", {
  value: {
    localStorage: storageStub(localStorageState),
    sessionStorage: storageStub(sessionStorageState),
  },
  configurable: true,
  writable: true,
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

test("sendAfpMessage keeps top-level supertags in the /send body", async () => {
  const originalFetch = globalThis.fetch;
  let seenBody: Record<string, unknown> | null = null;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "/send");
    seenBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return jsonResponse({ success: true, message_id: "afp-1" });
  };

  try {
    await sendAfpMessage({
      thread_id: "thread-1",
      from: "agent://wedding-planning",
      to: ["agent://knowledge-graph"],
      type: "task",
      content: { title: "Review payment schedule" },
      supertags: ["wedding_budget", "wedding_budget:payment_schedule", "topology:budget_drift"],
      store_in_relational: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(seenBody?.supertags, [
    "wedding_budget",
    "wedding_budget:payment_schedule",
    "topology:budget_drift",
  ]);
  assert.equal(seenBody?.store_in_relational, true);
});

test("sendAfpPayloadMessage filters malformed supertags but preserves valid routing tags", async () => {
  const originalFetch = globalThis.fetch;
  let seenBody: Record<string, unknown> | null = null;
  globalThis.fetch = async (_input, init) => {
    seenBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return jsonResponse({ success: true, message_id: "afp-2" });
  };

  try {
    await sendAfpPayloadMessage({
      thread_id: "thread-1",
      from: "agent://wedding-planning",
      to: ["agent://decision-queue"],
      type: "decision",
      content: { title: "Approve venue shortlist" },
      supertags: ["wedding_decision", 7, "decisionos", null],
      store_in_relational: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(seenBody?.supertags, ["wedding_decision", "decisionos"]);
});
