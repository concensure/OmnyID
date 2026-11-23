import test from "node:test";
import assert from "node:assert/strict";

import type {
  CapabilityDescriptor,
  DeviceSyncPoliciesResponse,
  LlmConfig,
} from "../src/lib/api.ts";
import type { TestHistoryEntry } from "../src/lib/agentSettingsLocalState.ts";
import {
  agentSettingsDevicePolicyEntriesState,
  agentSettingsHasSupportAccessHistory,
  agentSettingsIdentityCardExportState,
  agentSettingsIssuedAtLabel,
  agentSettingsRuntimeRecoveryPacketExportState,
  agentSettingsTestHistoryRowState,
  agentSettingsTestHistoryTimeLabel,
} from "../src/lib/agentSettingsViewState.ts";

test("agent settings view state centralizes issued-date and identity-card export values", () => {
  const llmConfig: LlmConfig = {
    provider: "anthropic",
    model: "claude-opus",
    endpoint: null,
    api_key_present: true,
  };
  const capabilities: CapabilityDescriptor[] = [
    { id: "calendar", description: "Manage events", input_schema: {}, output_schema: null, enabled: true },
  ];
  const now = new Date("2026-08-31T09:15:00.000Z");

  assert.equal(agentSettingsIssuedAtLabel(now), "31 August 2026");
  assert.deepEqual(
    agentSettingsIdentityCardExportState({
      now,
      llmConfig,
      llmModel: "fallback-model",
      llmProvider: "fallback-provider",
      loraConfidenceScore: 0.87,
      capabilities,
    }),
    {
      agentId: `omnyid-${now.getTime().toString(36).toUpperCase()}`,
      model: "claude-opus",
      provider: "anthropic",
      loraScore: "87%",
      issuedAt: "31 August 2026",
      capabilities,
    },
  );
});

test("agent settings view state keeps typed device-policy fallbacks", () => {
  const response: DeviceSyncPoliciesResponse = {
    entries: [{
      device_id: "device-1",
      agent_id: "agent-1",
      device_class: "desktop",
      policy_profile: "balanced",
      sync_slices: null,
      requires_local_key_material: true,
      last_bundle_at: "2026-08-31T00:00:00.000Z",
      last_used_at: null,
      updated_at: "2026-08-31T00:00:00.000Z",
      notes_summary: null,
    }],
  };

  assert.deepEqual(agentSettingsDevicePolicyEntriesState(null), []);
  assert.deepEqual(agentSettingsDevicePolicyEntriesState(response), response.entries);
});

test("agent settings view state centralizes test-history row labels", () => {
  const entry: TestHistoryEntry = {
    ts: Date.UTC(2026, 7, 31, 9, 5, 0),
    model: "claude",
    ms: 142,
    ok: false,
  };

  assert.equal(agentSettingsTestHistoryTimeLabel(entry.ts), new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  assert.deepEqual(agentSettingsTestHistoryRowState(entry), {
    timeLabel: new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    modelLabel: "claude",
    durationLabel: "142ms",
    statusLabel: "NO",
    statusClass: "text-red-400",
  });
});

test("agent settings view state detects support-access history from prepared cards", () => {
  assert.equal(agentSettingsHasSupportAccessHistory(null), false);
  assert.equal(agentSettingsHasSupportAccessHistory([]), false);
  assert.equal(agentSettingsHasSupportAccessHistory([{ title: "granted" }]), true);
});

test("agent settings view state centralizes runtime recovery packet export payloads", () => {
  const result = agentSettingsRuntimeRecoveryPacketExportState({
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
  });

  assert.equal(result.filename, "packet.json");
  assert.match(result.payload, /"packet_name": "packet.json"/);
});
