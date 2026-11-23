import test from "node:test";
import assert from "node:assert/strict";

import {
  addAgentSettingsCapabilityAndReload,
  applyAgentSettingsRuntimeUpdate,
  checkAgentSettingsRuntimeUpdates,
  copyAgentSettingsKeyPrefix,
  copyAgentSettingsSoulText,
  createAgentSettingsRuntimeSnapshot,
  downloadAgentSettingsRuntimeRecoveryPacketState,
  cycleAgentSettingsCapabilityApprovalModeAndReload,
  deleteAgentSettingsCapabilityAndReload,
  exportAgentSettingsIdentityCardState,
  exportAgentSettingsSovereignDataBundleState,
  hydrateAgentSettingsLlmState,
  importAgentSettingsCapabilitiesAndReload,
  loadAgentSettingsBootstrapState,
  loadAgentSettingsCapabilitiesState,
  loadAgentSettingsIdentityState,
  loadAgentSettingsLlmState,
  loadAgentSettingsRuntimeRecoveryPacket,
  preloadAgentSettingsRuntimeRecoveryPacket,
  saveAgentSettingsLlmStateAndReload,
  saveAgentSettingsSoulStateAndReload,
  testAgentSettingsLlmConnectionState,
  updateAgentSettingsDevicePolicyAndReload,
  updateAgentSettingsRuntimeBackupRetention,
} from "../src/lib/agentSettingsAsyncState.ts";

test("loadAgentSettingsIdentityState returns typed identity and targeted receipts", async () => {
  const success = await loadAgentSettingsIdentityState("Load agent identity", async () => ({
    id: "agent-1",
    soul_md: "Be useful",
    is_master: true,
  }));
  assert.equal(success.error, null);
  assert.equal(success.instance?.id, "agent-1");

  const failure = await loadAgentSettingsIdentityState("Refresh agent personality", async () => {
    throw new Error("network timeout");
  });
  assert.equal(failure.instance, null);
  assert.equal(failure.error?.title, "Refresh agent personality could not finish right now");
});

test("loadAgentSettingsCapabilitiesState preserves loaded capabilities", async () => {
  const result = await loadAgentSettingsCapabilitiesState(async () => [
    {
      id: "cap-1",
      name: "email_guardian",
      description: "Monitor inbox",
      input_schema: {},
      output_schema: null,
      version: "1.0.0",
      tags: ["email"],
      approval_mode: "suggest_only",
      enabled: true,
    },
  ]);

  assert.equal(result.error, null);
  assert.equal(result.capabilities[0]?.id, "cap-1");
});

test("deleteAgentSettingsCapabilityAndReload returns capability receipts on failure", async () => {
  const result = await deleteAgentSettingsCapabilityAndReload("cap-9", {
    async deleteCapability() {
      throw new Error("403 forbidden");
    },
    async loadCapabilities() {
      return [];
    },
  });

  assert.equal(result.capabilities.length, 0);
  assert.equal(result.error?.title, "Remove capability needs a fresh sign-in");
});

test("hydrateAgentSettingsLlmState maps server config into editable settings state", () => {
  const state = hydrateAgentSettingsLlmState({
    id: "cfg-1",
    backend: "hosted",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    monthly_budget_cents: 0,
    usage_cents_current_month: 0,
  });

  assert.deepEqual(state, {
    config: {
      id: "cfg-1",
      backend: "hosted",
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      monthly_budget_cents: 0,
      usage_cents_current_month: 0,
    },
    backend: "byok",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    ollamaUrl: "http://localhost:11434",
  });
});

test("loadAgentSettingsLlmState returns load receipts for invalid or unavailable config", async () => {
  const success = await loadAgentSettingsLlmState(async () => ({
    id: "cfg-2",
    backend: "ollama",
    provider: "local",
    model: "llama3.2",
    ollama_url: "http://localhost:11434",
    monthly_budget_cents: 100,
    usage_cents_current_month: 10,
  }));
  assert.equal(success.error, null);
  assert.equal(success.state?.backend, "ollama");

  const failure = await loadAgentSettingsLlmState(async () => {
    throw new Error("not configured");
  });
  assert.equal(failure.state, null);
  assert.equal(failure.error?.title, "Load model settings needs model setup first");
});

test("loadAgentSettingsBootstrapState centralizes bootstrap fetches and preserves partial failures", async () => {
  const result = await loadAgentSettingsBootstrapState({
    async loadInstance() {
      return {
        id: "agent-1",
        soul_md: "Be useful",
        is_master: true,
      };
    },
    async loadCapabilities() {
      throw new Error("network timeout");
    },
    async loadConfig() {
      return {
        id: "cfg-2",
        backend: "ollama",
        provider: "local",
        model: "llama3.2",
        ollama_url: "http://localhost:11434",
        monthly_budget_cents: 100,
        usage_cents_current_month: 10,
      };
    },
  });

  assert.equal(result.instance?.id, "agent-1");
  assert.equal(result.instanceError, null);
  assert.deepEqual(result.capabilities, []);
  assert.equal(result.capabilitiesError?.title, "Load capabilities could not finish right now");
  assert.equal(result.llmState?.backend, "ollama");
  assert.equal(result.llmError, null);
});

test("saveAgentSettingsLlmStateAndReload saves normalized settings then reloads hydrated state", async () => {
  const calls: string[] = [];
  const result = await saveAgentSettingsLlmStateAndReload(
    {
      backend: "byok",
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "sk-test",
      ollamaUrl: "http://ignored",
    },
    {
      async saveConfig(data) {
        calls.push(JSON.stringify(data));
      },
      async loadConfig() {
        return {
          id: "cfg-3",
          backend: "byok",
          provider: "openai",
          model: "gpt-4o-mini",
          monthly_budget_cents: 200,
          usage_cents_current_month: 25,
        };
      },
    },
  );

  assert.equal(result.error, null);
  assert.equal(result.state?.provider, "openai");
  assert.equal(calls.length, 1);
  assert.match(calls[0]!, /"backend":"byok"/);
  assert.match(calls[0]!, /"api_key":"sk-test"/);
});

test("cycleAgentSettingsCapabilityApprovalModeAndReload patches the next mode then reloads capabilities", async () => {
  const patchCalls: Array<{ id: string; approval_mode: string }> = [];
  const result = await cycleAgentSettingsCapabilityApprovalModeAndReload(
    {
      id: "cap-1",
      name: "email_guardian",
      description: "Monitor inbox",
      input_schema: {},
      output_schema: null,
      version: "1.0.0",
      tags: ["email"],
      approval_mode: "suggest_only",
      created_at: "2026-08-31T00:00:00Z",
      enabled: true,
    },
    {
      async patchCapability(id, patch) {
        patchCalls.push({ id, approval_mode: patch.approval_mode });
      },
      async loadCapabilities() {
        return [
          {
            id: "cap-1",
            name: "email_guardian",
            description: "Monitor inbox",
            input_schema: {},
            output_schema: null,
            version: "1.0.0",
            tags: ["email"],
            approval_mode: "human_approval_required",
            created_at: "2026-08-31T00:00:00Z",
            enabled: true,
          },
        ];
      },
    },
  );

  assert.equal(result.error, null);
  assert.deepEqual(patchCalls, [{ id: "cap-1", approval_mode: "human_approval_required" }]);
  assert.equal(result.capabilities[0]?.approval_mode, "human_approval_required");
});

test("addAgentSettingsCapabilityAndReload returns action-specific receipts on registration failure", async () => {
  const result = await addAgentSettingsCapabilityAndReload(
    {
      name: "email_guardian",
      description: "Monitor inbox",
      input_schema: {},
      output_schema: null,
      version: "1.0.0",
      tags: ["email"],
      approval_mode: "suggest_only",
    },
    {
      async registerCapability() {
        throw new Error("network timeout");
      },
      async loadCapabilities() {
        return [];
      },
    },
  );

  assert.equal(result.capabilities.length, 0);
  assert.equal(result.error?.title, "Add email_guardian could not finish right now");
});

test("importAgentSettingsCapabilitiesAndReload de-duplicates existing and repeated names before reload", async () => {
  const registered: string[] = [];
  const result = await importAgentSettingsCapabilitiesAndReload(
    JSON.stringify([
      {
        name: "existing_cap",
        description: "Already present",
        input_schema: {},
      },
      {
        name: "new_cap",
        description: "First import",
        input_schema: {},
      },
      {
        name: "new_cap",
        description: "Duplicate import row",
        input_schema: {},
      },
    ]),
    ["existing_cap"],
    {
      async registerCapability(input) {
        registered.push(input.name);
      },
      async loadCapabilities() {
        return [
          {
            id: "cap-2",
            name: "new_cap",
            description: "First import",
            input_schema: {},
            output_schema: null,
            version: "1.0.0",
            tags: [],
            approval_mode: "suggest_only",
            created_at: "2026-08-31T00:00:00Z",
            enabled: true,
          },
        ];
      },
    },
  );

  assert.equal(result.error, null);
  assert.equal(result.importedCount, 1);
  assert.deepEqual(registered, ["new_cap"]);
  assert.equal(result.capabilities[0]?.name, "new_cap");
});

test("updateAgentSettingsDevicePolicyAndReload returns updated entries and feedback", async () => {
  const result = await updateAgentSettingsDevicePolicyAndReload(
    {
      deviceId: "device-1",
      profile: "balanced",
    },
    async (input) => ({
      entries: [
        {
          device_id: input.device_id,
          agent_id: "agent-1",
          device_class: "desktop",
          policy_profile: input.policy_profile,
          sync_slices: null,
          requires_local_key_material: true,
          last_bundle_at: "2026-08-31T00:00:00Z",
          updated_at: "2026-08-31T00:00:00Z",
          notes_summary: null,
        },
      ],
    }),
  );

  assert.equal(result.error, null);
  assert.equal(result.feedback, "Updated device-1 to balanced.");
  assert.equal(result.entries[0]?.policy_profile, "balanced");
});

test("runtime helpers return normalized feedback across retention, snapshot, update, and packet actions", async () => {
  const retention = await updateAgentSettingsRuntimeBackupRetention(
    30,
    async () => ({
      policy: {
        retention_days: 30,
        storage_mode: "local",
        support_disabled_by_default: true,
      },
      entries: [],
    }),
  );
  assert.equal(retention.feedback, "Backup retention updated to 30 days.");

  const snapshot = await createAgentSettingsRuntimeSnapshot(async () => ({
    policy: {
      retention_days: 14,
      storage_mode: "local",
      support_disabled_by_default: true,
    },
    entries: [],
  }));
  assert.equal(snapshot.feedback, "Runtime snapshot created.");

  const updates = await checkAgentSettingsRuntimeUpdates(async () => ({
    policy: {
      update_channel: "stable",
      auto_apply: "manual_only",
      support_disabled_by_default: true,
    },
    current_version: "1.0.0",
    latest_version: "1.1.0",
    update_available: true,
    runtime_status: "healthy",
    entries: [],
  }));
  assert.equal(updates.feedback, "Runtime updates checked. Update available.");

  const apply = await applyAgentSettingsRuntimeUpdate(async () => ({
    policy: {
      update_channel: "stable",
      auto_apply: "manual_only",
      support_disabled_by_default: true,
    },
    current_version: "1.0.0",
    latest_version: "1.1.0",
    update_available: false,
    runtime_status: "healthy",
    entries: [],
  }));
  assert.equal(apply.feedback, "Runtime update action recorded.");

  const preview = await loadAgentSettingsRuntimeRecoveryPacket("preview", async () => ({
    generated_at: "2026-08-31T00:00:00Z",
    packet_version: "v1",
    packet_name: "packet.json",
    user: { id: "user-1", email: "test@example.com" },
    recovery_checklist: [],
    privacy_notes: [],
    runtime_backups: {
      policy: {
        retention_days: 14,
        storage_mode: "local",
        support_disabled_by_default: true,
      },
      entries: [],
    },
    runtime_restore_drills: { entries: [] },
    runtime_updates: {
      policy: {
        update_channel: "stable",
        auto_apply: "manual_only",
        support_disabled_by_default: true,
      },
      current_version: "1.0.0",
      latest_version: "1.0.0",
      update_available: false,
      runtime_status: "healthy",
      entries: [],
    },
  }));
  assert.equal(preview.feedback, "Runtime recovery packet loaded for review.");

  const downloads: Array<{ packet_name?: string | null }> = [];
  const download = await downloadAgentSettingsRuntimeRecoveryPacketState({
    async loadPacket() {
      return {
        generated_at: "2026-08-31T00:00:00Z",
        packet_version: "v1",
        packet_name: "packet.json",
        user: { id: "user-1", email: "test@example.com" },
        recovery_checklist: [],
        privacy_notes: [],
        runtime_backups: {
          policy: {
            retention_days: 14,
            storage_mode: "local",
            support_disabled_by_default: true,
          },
          entries: [],
        },
        runtime_restore_drills: { entries: [] },
        runtime_updates: {
          policy: {
            update_channel: "stable",
            auto_apply: "manual_only",
            support_disabled_by_default: true,
          },
          current_version: "1.0.0",
          latest_version: "1.0.0",
          update_available: false,
          runtime_status: "healthy",
          entries: [],
        },
      };
    },
    savePacket(packet) {
      downloads.push(packet);
    },
  });
  assert.equal(download.error, null);
  assert.equal(download.packet?.packet_name, "packet.json");
  assert.equal(downloads.length, 1);

  const downloadFailure = await downloadAgentSettingsRuntimeRecoveryPacketState({
    async loadPacket() {
      return {
        generated_at: "2026-08-31T00:00:00Z",
        packet_version: "v1",
        packet_name: "packet.json",
        user: { id: "user-1", email: "test@example.com" },
        recovery_checklist: [],
        privacy_notes: [],
        runtime_backups: {
          policy: {
            retention_days: 14,
            storage_mode: "local",
            support_disabled_by_default: true,
          },
          entries: [],
        },
        runtime_restore_drills: { entries: [] },
        runtime_updates: {
          policy: {
            update_channel: "stable",
            auto_apply: "manual_only",
            support_disabled_by_default: true,
          },
          current_version: "1.0.0",
          latest_version: "1.0.0",
          update_available: false,
          runtime_status: "healthy",
          entries: [],
        },
      };
    },
    savePacket() {
      throw new Error("disk full");
    },
  });
  assert.equal(downloadFailure.packet, null);
  assert.equal(downloadFailure.error?.title, "Download runtime recovery packet failed");

  const preload = await preloadAgentSettingsRuntimeRecoveryPacket(async () => {
    throw new Error("ignore preload");
  });
  assert.equal(preload, null);
});

test("testAgentSettingsLlmConnectionState records successful ping state and bounded history", async () => {
  const result = await testAgentSettingsLlmConnectionState(
    {
      backend: "byok",
      provider: "openai",
      model: "gpt-4o-mini",
      userId: "user-success",
    },
    {
      async pingConfig() {
        return {
          ok: true,
          backend: "byok",
          provider: "openai",
          http_status: 200,
        };
      },
      now: () => 1_000,
      monotonicNow: (() => {
        const values = [5, 29];
        return () => values.shift() ?? 29;
      })(),
    },
  );

  assert.equal(result.pingResult.ok, true);
  assert.equal(result.pingResult.provider, "openai");
  assert.equal(result.lastPingAt, 1_000);
  assert.equal(result.clearResultAfterMs, 8_000);
  assert.deepEqual(result.latencyHistory, [{ ts: 1_000, ms: 24 }]);
  assert.deepEqual(result.testHistory, [
    { ts: 1_000, model: "gpt-4o-mini", ms: 24, ok: true, reason: undefined },
  ]);
});

test("testAgentSettingsLlmConnectionState returns timeout receipts without mutating last success timestamp", async () => {
  const preserved = await saveAgentSettingsLlmStateAndReload(
    {
      backend: "byok",
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "sk-test",
      ollamaUrl: "http://ignored",
    },
    {
      async saveConfig() {},
      async loadConfig() {
        return {
          id: "cfg-4",
          backend: "byok",
          provider: "openai",
          model: "gpt-4o-mini",
          monthly_budget_cents: 0,
          usage_cents_current_month: 0,
        };
      },
    },
  );
  assert.equal(preserved.error, null);

  const timeoutResult = await testAgentSettingsLlmConnectionState(
    {
      backend: "ollama",
      provider: "local",
      model: "llama3.2",
      userId: "user-timeout",
      timeoutMs: 1,
    },
    {
      async pingConfig() {
        return await new Promise(() => undefined);
      },
      now: () => 2_000,
      monotonicNow: () => 10,
    },
  );

  assert.equal(timeoutResult.pingResult.ok, false);
  assert.equal(timeoutResult.pingResult.receipt?.title, "Test model connection could not finish right now");
  assert.equal(timeoutResult.lastPingAt, null);
  assert.equal(timeoutResult.clearResultAfterMs, null);
  assert.deepEqual(timeoutResult.testHistory, [
    { ts: 2_000, model: "llama3.2", ms: null, ok: false, reason: "timeout" },
  ]);
});

test("identity and soul clipboard helpers return typed receipts for browser blocks", async () => {
  const keyPrefixResult = await copyAgentSettingsKeyPrefix("sk-ant-", async () => {
    throw new Error("clipboard permission denied");
  });
  assert.equal(keyPrefixResult.copied, false);
  assert.equal(keyPrefixResult.error?.title, "Copy expected key prefix was blocked by the browser");

  const soulResult = await copyAgentSettingsSoulText("Be useful", async () => {
    throw new Error("clipboard permission denied");
  });
  assert.equal(soulResult.copied, false);
  assert.equal(soulResult.error?.title, "Copy soul.md was blocked by the browser");
});

test("saveAgentSettingsSoulStateAndReload returns refreshed identity and saved timestamp", async () => {
  const result = await saveAgentSettingsSoulStateAndReload("Updated soul", {
    async saveSoul() {},
    async loadInstance() {
      return {
        id: "agent-2",
        soul_md: "Updated soul",
        is_master: true,
      };
    },
    now: () => 3_000,
    userId: "user-soul",
  });

  assert.equal(result.error, null);
  assert.equal(result.instance?.soul_md, "Updated soul");
  assert.equal(result.savedAt, 3_000);
});

test("saveAgentSettingsSoulStateAndReload maps refresh failures into soul receipts", async () => {
  const result = await saveAgentSettingsSoulStateAndReload("Updated soul", {
    async saveSoul() {},
    async loadInstance() {
      throw new Error("401 unauthorized");
    },
    userId: "user-soul-failure",
  });

  assert.equal(result.instance, null);
  assert.equal(result.error?.title, "Save personality needs a fresh sign-in");
});

test("export utility helpers normalize popup and bundle export failures", () => {
  const identityFailure = exportAgentSettingsIdentityCardState(() => false);
  assert.equal(identityFailure.error?.title, "Export identity card was blocked by the browser");

  const identitySuccess = exportAgentSettingsIdentityCardState(() => true);
  assert.equal(identitySuccess.error, null);

  const bundleFailure = exportAgentSettingsSovereignDataBundleState(() => {
    throw new Error("download blocked by browser");
  });
  assert.equal(bundleFailure.error?.title, "Export sovereign data bundle was blocked by the browser");
});
