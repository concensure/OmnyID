import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureWeddingRunSheetProjection,
  loadWeddingRunSheetProjection,
  normalizeWeddingRunSheetProjectionState,
} from "../src/lib/weddingRunSheetProjectionApi.ts";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test("projection API state maps server checkpoints and ledger messages", () => {
  const state = normalizeWeddingRunSheetProjectionState({
    checkpoint: {
      source_cursor: "cursor-2",
      source_fingerprint: "fnv1a-12345678",
      projector_version: 1,
    },
    messages: [{
      id: "message-1",
      message_type: "database_record",
      timestamp: "2026-10-29T00:00:00Z",
      content: { kind: "database_record" },
      metadata: { model_calls: 0 },
    }],
  });
  assert.deepEqual(state.checkpoint, {
    sourceCursor: "cursor-2",
    sourceFingerprint: "fnv1a-12345678",
    projectorVersion: 1,
  });
  assert.equal(state.messages[0].type, "database_record");
  assert.equal((state.messages[0].metadata as Record<string, unknown>).model_calls, 0);
});

test("projection API state rejects incomplete checkpoint and malformed messages", () => {
  const state = normalizeWeddingRunSheetProjectionState({
    checkpoint: { source_cursor: "cursor-only" },
    messages: [{ id: "missing-type" }, null, "bad"],
  });
  assert.equal(state.checkpoint, null);
  assert.deepEqual(state.messages, []);
});

test("projection API sends the exact plan and workspace to install and load", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
    },
  });
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null,
    });
    return new Response(JSON.stringify({ checkpoint: null, messages: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const scope = {
      databaseId: "database:wedding-run-sheet:plan-1",
      weddingPlanId: "plan-1",
      responseWorkspaceId: "workspace-1",
    };
    await ensureWeddingRunSheetProjection(scope);
    await loadWeddingRunSheetProjection(scope);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }

  assert.deepEqual(calls[0], {
    url: "/database/wedding-runsheet/install",
    body: {
      database_id: "database:wedding-run-sheet:plan-1",
      wedding_plan_id: "plan-1",
      response_workspace_id: "workspace-1",
    },
  });
  assert.match(calls[1]?.url ?? "", /response_workspace_id=workspace-1/);
});
