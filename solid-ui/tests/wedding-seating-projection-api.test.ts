import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchWeddingSeatingProjectionMessages,
  isWeddingSeatingProjection,
  sendWeddingSeatingProjection,
  WeddingSeatingProjectionConflictError,
  weddingSeatingProjectionExpectedRevision,
} from "../src/lib/weddingSeatingProjectionApi.ts";
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

function optimisation(id: string, revision?: number): AfpMessage {
  return {
    id,
    thread_id: "wedding_seating:workspace",
    from: "system://wedding-planning",
    to: [],
    timestamp: "2026-11-23T00:00:00.000Z",
    type: "ledger",
    kind: "wedding_seating_optimization",
    subtype: "wedding_seating_optimization",
    content: { ledger_kind: "wedding_seating_optimization", assignment_fingerprint: "one:table-1" },
    views: [], attachments: [], references: [], supertags: ["wedding_seating"],
    metadata: revision ? { seatingRevision: revision } : {},
  };
}

test("Wedding seating projection API binds reads and writes to plan plus workspace", async () => {
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
      ? { success: true, message_id: "message-1", owner_user_id: "owner", actor_user_id: "partner", artifact_id: "wedding-seating-current-plan", revision: 2 }
      : { tags: ["wedding_seating"], match: "all", count: 0, messages: [] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const scope = { weddingPlanId: "plan one", responseWorkspaceId: "workspace/one" };
  try {
    await fetchWeddingSeatingProjectionMessages(scope);
    await sendWeddingSeatingProjection(scope, {
      id: "seating-logical-id",
      thread_id: "wedding_seating:workspace",
      from: "system://wedding-planning",
      to: ["agent://wedding-planning"],
      type: "ledger",
      kind: "wedding_seating_optimization",
      subtype: "wedding_seating_optimization",
      content: { ledger_kind: "wedding_seating_optimization", assignment_fingerprint: "one:table-1" },
      supertags: ["wedding_seating"],
      metadata: { weddingPlanId: "plan one", responseWorkspaceId: "workspace/one" },
    }, 1);
  } finally {
    globalThis.fetch = priorFetch;
    Object.defineProperty(globalThis, "window", { configurable: true, value: priorWindow });
  }

  assert.equal(requests[0]?.url, "/wedding/seating/projections?wedding_plan_id=plan+one&response_workspace_id=workspace%2Fone");
  assert.equal(requests[1]?.url, "/wedding/seating/projections");
  assert.equal(requests[1]?.body?.wedding_plan_id, "plan one");
  assert.equal(requests[1]?.body?.response_workspace_id, "workspace/one");
  assert.equal(requests[1]?.body?.expected_revision, 1);
  assert.deepEqual((requests[1]?.body?.message as Record<string, unknown>).supertags, ["wedding_seating"]);
});

test("Wedding seating revisions are per plan constraint and draft archive artifact", () => {
  const legacy = optimisation("plan-legacy");
  const revisionThree = optimisation("plan-r3", 3);
  const archive = {
    ...optimisation("archive-r2", 2),
    kind: "wedding_seating_draft_archive",
    subtype: "wedding_seating_draft_archive",
    content: { ledger_kind: "wedding_seating_draft_archive", seating_draft_fingerprint: "one:table-1", archive_action: "hide" },
  };
  const planInput = { kind: "wedding_seating_optimization", content: {} };
  const archiveInput = { kind: "wedding_seating_draft_archive", content: { seating_draft_fingerprint: "one:table-1" } };

  assert.equal(weddingSeatingProjectionExpectedRevision([], planInput), 0);
  assert.equal(weddingSeatingProjectionExpectedRevision([legacy, revisionThree, archive], planInput), 3);
  assert.equal(weddingSeatingProjectionExpectedRevision([legacy, revisionThree, archive], archiveInput), 2);
  assert.equal(isWeddingSeatingProjection(archive), true);
});

test("Wedding seating API exposes stale shared writes as a reviewable conflict", async () => {
  const priorWindow = globalThis.window;
  const priorFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() },
  });
  globalThis.fetch = async () => new Response(
    "wedding_seating_revision_conflict: expected 1, current 2. This shared seating plan changed elsewhere.",
    { status: 409 },
  );
  try {
    await assert.rejects(() => sendWeddingSeatingProjection(
      { weddingPlanId: "plan", responseWorkspaceId: "workspace" },
      { thread_id: "thread", from: "user://couple", to: [], type: "ledger", kind: "wedding_seating_optimization", content: {} },
      1,
    ), (error) => error instanceof WeddingSeatingProjectionConflictError
      && error.expectedRevision === 1 && error.currentRevision === 2);
  } finally {
    globalThis.fetch = priorFetch;
    Object.defineProperty(globalThis, "window", { configurable: true, value: priorWindow });
  }
});
