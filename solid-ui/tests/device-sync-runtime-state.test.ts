import assert from "node:assert/strict";
import test from "node:test";

import { dateTimeLabel, relativeTimeLabel } from "../src/lib/agentSettingsRuntimeFormat.ts";
import {
  deviceSyncPolicyCardState,
  deviceSyncPolicyCardStates,
  deviceSyncClassBreakdownLabel,
  deviceSyncLatestDeviceLabel,
  deviceSyncLatestLastUsedAt,
  deviceSyncLatestPolicyActivityLabel,
  deviceSyncLatestPolicyNote,
  deviceSyncLocalKeyDeviceCount,
  deviceSyncLocalKeysLabel,
  deviceSyncPolicyCount,
  deviceSyncProvisionedLabel,
  deviceSyncRuntimeHasSummary,
  deviceSyncRuntimeSummaryCardState,
  deviceSyncUsedDeviceCount,
  deviceSyncUsedLabel,
} from "../src/lib/deviceSyncRuntimeState.ts";

test("device sync runtime selectors provide stable fallbacks", () => {
  assert.equal(deviceSyncRuntimeHasSummary(null), false);
  assert.equal(deviceSyncPolicyCount(null, null), 0);
  assert.equal(deviceSyncUsedDeviceCount(null, null), 0);
  assert.equal(deviceSyncLocalKeyDeviceCount(null, null), 0);
  assert.equal(deviceSyncProvisionedLabel(null, null), "0 device policies");
  assert.equal(deviceSyncUsedLabel(null, null), "0 active bootstrap records");
  assert.equal(deviceSyncLocalKeysLabel(null, null), "0 devices need local key material");
  assert.equal(deviceSyncClassBreakdownLabel(null), "0 desktop | 0 mobile | 0 watch");
  assert.equal(deviceSyncLatestPolicyActivityLabel(null), "unknown | unknown");
  assert.equal(deviceSyncLatestDeviceLabel(null), "device unknown");
  assert.equal(deviceSyncLatestLastUsedAt(null), null);
  assert.equal(deviceSyncLatestPolicyNote(null), null);
  assert.deepEqual(deviceSyncRuntimeSummaryCardState(null), {
    classBreakdownLabel: "0 desktop | 0 mobile | 0 watch",
    latestActivityLabel: "unknown | unknown",
    latestDeviceLabel: "device unknown",
    latestLastUsedLine: `last used ${dateTimeLabel(null)}`,
    latestLastUsedRelativeLine: relativeTimeLabel(null),
    latestPolicyNote: null,
  });
  assert.deepEqual(deviceSyncPolicyCardStates(null), []);
});

test("device sync runtime selectors prefer runtime summary fields over policy-derived fallbacks", () => {
  const runtimeSummary = {
    device_policy_count: 4,
    used_device_count: 3,
    local_key_device_count: 1,
    desktop_device_count: 2,
    mobile_device_count: 1,
    watch_device_count: 1,
    latest_device_id: "device-4",
    latest_device_class: "mobile",
    latest_policy_profile: "travel",
    latest_last_used_at: "2026-08-14T06:00:00Z",
    latest_policy_note: "Travel profile staged for the next bootstrap.",
  };
  const policies = [
    {
      device_id: "device-1",
      agent_id: "agent-1",
      device_class: "desktop",
      policy_profile: "primary",
      sync_slices: null,
      requires_local_key_material: true,
      last_bundle_at: "2026-08-13T06:00:00Z",
      updated_at: "2026-08-13T06:00:00Z",
      notes_summary: null,
    },
  ];

  assert.equal(deviceSyncRuntimeHasSummary(runtimeSummary), true);
  assert.equal(deviceSyncPolicyCount(runtimeSummary, policies), 4);
  assert.equal(deviceSyncUsedDeviceCount(runtimeSummary, policies), 3);
  assert.equal(deviceSyncLocalKeyDeviceCount(runtimeSummary, policies), 1);
  assert.equal(deviceSyncProvisionedLabel(runtimeSummary, policies), "4 device policies");
  assert.equal(deviceSyncUsedLabel(runtimeSummary, policies), "3 active bootstrap records");
  assert.equal(deviceSyncLocalKeysLabel(runtimeSummary, policies), "1 device needs local key material");
  assert.equal(deviceSyncClassBreakdownLabel(runtimeSummary), "2 desktop | 1 mobile | 1 watch");
  assert.equal(deviceSyncLatestPolicyActivityLabel(runtimeSummary), "mobile | travel");
  assert.equal(deviceSyncLatestDeviceLabel(runtimeSummary), "device device-4");
  assert.equal(deviceSyncLatestLastUsedAt(runtimeSummary), "2026-08-14T06:00:00Z");
  assert.equal(deviceSyncLatestPolicyNote(runtimeSummary), "Travel profile staged for the next bootstrap.");
  assert.deepEqual(deviceSyncRuntimeSummaryCardState(runtimeSummary), {
    classBreakdownLabel: "2 desktop | 1 mobile | 1 watch",
    latestActivityLabel: "mobile | travel",
    latestDeviceLabel: "device device-4",
    latestLastUsedLine: `last used ${dateTimeLabel("2026-08-14T06:00:00Z")}`,
    latestLastUsedRelativeLine: relativeTimeLabel("2026-08-14T06:00:00Z"),
    latestPolicyNote: "Travel profile staged for the next bootstrap.",
  });
});

test("device sync runtime selectors derive fallback counts from policy entries when runtime summary is absent", () => {
  const policies = [
    {
      device_id: "device-1",
      agent_id: "agent-1",
      device_class: "desktop",
      policy_profile: "primary",
      sync_slices: null,
      requires_local_key_material: true,
      last_bundle_at: "2026-08-13T06:00:00Z",
      last_used_at: "2026-08-14T05:00:00Z",
      updated_at: "2026-08-13T06:00:00Z",
      notes_summary: null,
    },
    {
      device_id: "device-2",
      agent_id: "agent-1",
      device_class: "mobile",
      policy_profile: "travel",
      sync_slices: null,
      requires_local_key_material: false,
      last_bundle_at: "2026-08-12T06:00:00Z",
      updated_at: "2026-08-12T06:00:00Z",
      notes_summary: null,
    },
  ];

  assert.equal(deviceSyncPolicyCount(null, policies), 2);
  assert.equal(deviceSyncUsedDeviceCount(null, policies), 1);
  assert.equal(deviceSyncLocalKeyDeviceCount(null, policies), 1);
  assert.equal(deviceSyncProvisionedLabel(null, policies), "2 device policies");
  assert.equal(deviceSyncUsedLabel(null, policies), "1 active bootstrap records");
  assert.equal(deviceSyncLocalKeysLabel(null, policies), "1 device needs local key material");
});

test("device sync policy card selectors normalize per-device presentation", () => {
  const entry = {
    device_id: "device-2",
    agent_id: "agent-1",
    device_class: "mobile",
    policy_profile: "travel",
    sync_slices: {
      journal: true,
      memory: false,
    },
    requires_local_key_material: false,
    last_bundle_at: "2026-08-12T06:00:00Z",
    last_used_at: "2026-08-14T05:00:00Z",
    updated_at: "2026-08-13T06:00:00Z",
    notes_summary: {
      policy_note: "Travel profile staged for the next bootstrap.",
      source: "ops-console",
      default_profile: "balanced",
      approval: "required",
    },
  };

  const card = deviceSyncPolicyCardState(entry);
  assert.deepEqual(deviceSyncPolicyCardState(entry), {
    deviceId: "device-2",
    policyProfile: "travel",
    deviceClassLine: `mobile device | ${relativeTimeLabel(entry.last_used_at)} | bundled ${dateTimeLabel(entry.last_bundle_at)}`,
    lastUsedLine: `last used ${dateTimeLabel(entry.last_used_at)}`,
    policyUpdatedLine: `policy updated ${dateTimeLabel(entry.updated_at)}`,
    bundledUpdatedLine: `bundled ${relativeTimeLabel(entry.last_bundle_at)} | updated ${relativeTimeLabel(entry.updated_at)}`,
    policyNote: "Travel profile staged for the next bootstrap.",
    profileChips: ["travel", "metadata-only"],
    sourceChips: ["source: ops-console", "default: balanced"],
    policyDetailChips: ["approval: required"],
    syncScopeChips: ["journal: true", "memory: false"],
  });
  assert.equal(card.policyProfile, "travel");
  assert.deepEqual(deviceSyncPolicyCardStates([entry]).map((card) => card.deviceId), ["device-2"]);
});
