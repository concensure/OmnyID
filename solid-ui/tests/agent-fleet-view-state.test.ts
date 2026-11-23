import test from "node:test";
import assert from "node:assert/strict";

import {
  activateAgentFleetDelegationDraft,
  agentFleetDelegationDraftCanRun,
  agentFleetDelegationExpiryIso,
  cancelAgentFleetTaskAndReload,
  createAgentFleetDelegationDraft,
  loadAgentFleetViewState,
  resetAgentFleetDelegationDraft,
  revokeAgentFleetDelegationAndReload,
  runAgentFleetDelegationAndReload,
  runAgentFleetDelegationViewState,
} from "../src/lib/agentFleetViewState.ts";

test("agent fleet delegation draft helpers preserve activation, validation, and reset behavior", () => {
  const initial = createAgentFleetDelegationDraft("private");
  assert.deepEqual(initial, {
    active: false,
    scope: "",
    mask: "private",
    expiresAt: "",
    task: "",
  });
  assert.equal(agentFleetDelegationDraftCanRun(initial), false);

  const active = activateAgentFleetDelegationDraft({
    ...initial,
    scope: "email:read",
    expiresAt: "2026-09-01T10:30",
  });
  assert.equal(active.active, true);
  assert.equal(agentFleetDelegationDraftCanRun(active), true);

  assert.deepEqual(resetAgentFleetDelegationDraft("team"), {
    active: false,
    scope: "",
    mask: "team",
    expiresAt: "",
    task: "",
  });
});

test("agentFleetDelegationExpiryIso rejects invalid datetime input", () => {
  assert.equal(agentFleetDelegationExpiryIso(""), null);
  assert.equal(agentFleetDelegationExpiryIso("not-a-date"), null);
  assert.equal(agentFleetDelegationExpiryIso("2026-09-01T10:30"), "2026-09-01T00:30:00.000Z");
});

test("loadAgentFleetViewState preserves typed fleet data on success", async () => {
  const result = await loadAgentFleetViewState(async () => ({
    active_count: 1,
    recent_tasks: [{ id: "task-1", status: "running", priority: "high", created_at: "2026-09-01T00:00:00Z" }],
  }));

  assert.equal(result.error, null);
  assert.equal(result.data.active_count, 1);
  assert.equal(result.data.recent_tasks?.[0]?.id, "task-1");
});

test("revokeAgentFleetDelegationAndReload returns a receipt on failure", async () => {
  const result = await revokeAgentFleetDelegationAndReload("del-1", {
    async revokeDelegation() {
      throw new Error("network timeout");
    },
    async loadFleet() {
      return { active_count: 0 };
    },
  });

  assert.deepEqual(result.data, {});
  assert.equal(result.error?.title, "Delegation revoke could not finish right now");
});

test("cancelAgentFleetTaskAndReload reloads fleet after a successful cancel", async () => {
  const calls: string[] = [];
  const result = await cancelAgentFleetTaskAndReload("task-9", {
    async cancelTask(id) {
      calls.push(`cancel:${id}`);
    },
    async loadFleet() {
      calls.push("load");
      return { active_count: 0, recent_tasks: [] };
    },
  });

  assert.deepEqual(calls, ["cancel:task-9", "load"]);
  assert.equal(result.error, null);
  assert.equal(result.data.active_count, 0);
});

test("runAgentFleetDelegationAndReload returns navigation intent after success", async () => {
  const calls: string[] = [];
  const result = await runAgentFleetDelegationAndReload(
    {
      scope: "email:read",
      mask: "private",
      expiresAt: "2026-09-01T10:30",
      task: "Summarize inbox",
    },
    {
      async createDelegation(payload) {
        calls.push(`${payload.scope}:${payload.mask}:${payload.expires_at}:${payload.task}`);
      },
      async loadFleet() {
        calls.push("load");
        return { active_count: 1 };
      },
    },
  );

  assert.equal(result.notice.tone, "success");
  assert.equal(result.openView, "workflows");
  assert.equal(result.data.active_count, 1);
  assert.deepEqual(calls, ["email:read:private:2026-09-01T00:30:00.000Z:Summarize inbox", "load"]);
});

test("runAgentFleetDelegationAndReload surfaces invalid expiry as a run notice", async () => {
  const result = await runAgentFleetDelegationAndReload(
    {
      scope: "email:read",
      mask: "private",
      expiresAt: "bad-date",
      task: "",
    },
    {
      async createDelegation() {
        throw new Error("should not run");
      },
      async loadFleet() {
        return {};
      },
    },
  );

  assert.deepEqual(result.data, {});
  assert.equal(result.openView, null);
  assert.equal(result.notice.tone, "danger");
});

test("runAgentFleetDelegationViewState adds starter and timing metadata around delegation runs", async () => {
  const success = await runAgentFleetDelegationViewState(
    {
      scope: "calendar:read",
      mask: "team",
      expiresAt: "2026-09-01T10:30",
      task: "Check schedule",
    },
    {
      async createDelegation() {
        return undefined;
      },
      async loadFleet() {
        return { active_count: 2 };
      },
    },
  );
  assert.equal(success.startNotice.tone, "info");
  assert.match(success.startNotice.message, /starting delegation: calendar:read \/ team/i);
  assert.equal(success.navigateAfterMs, 1200);
  assert.equal(success.clearNoticeAfterMs, null);
  assert.equal(success.openView, "workflows");

  const failure = await runAgentFleetDelegationViewState(
    {
      scope: "calendar:read",
      mask: "team",
      expiresAt: "bad",
      task: "",
    },
    {
      async createDelegation() {
        throw new Error("should not run");
      },
      async loadFleet() {
        return {};
      },
    },
  );
  assert.equal(failure.openView, null);
  assert.equal(failure.clearNoticeAfterMs, 3000);
  assert.equal(failure.navigateAfterMs, null);
});
