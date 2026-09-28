import assert from "node:assert/strict";
import test from "node:test";

import {
  runtimeUpdatesActionState,
  runtimeUpdatesCurrentVersionLabel,
  runtimeUpdatesEntries,
  runtimeUpdatesHasAvailableUpdate,
  runtimeUpdatesLastAppliedAt,
  runtimeUpdatesLastCheckedAt,
  runtimeUpdatesLatestEventAt,
  runtimeUpdatesLatestVersionLabel,
  runtimeUpdatesPanel,
  runtimeUpdatesPolicy,
  runtimeUpdatesPolicyAutoApply,
  runtimeUpdatesPolicySupportPostureLabel,
  runtimeUpdatesPolicyUpdateChannel,
  runtimeUpdatesPolicyViewState,
  runtimeUpdatesPressureLabel,
} from "../src/lib/runtimeUpdatesState.ts";

test("runtime update panel selector provides stable fallbacks", () => {
  assert.equal(runtimeUpdatesPanel(null), null);
  assert.deepEqual(runtimeUpdatesEntries(null), []);
  assert.equal(runtimeUpdatesPolicy(null), null);
  assert.equal(runtimeUpdatesCurrentVersionLabel(null), "unknown");
  assert.equal(runtimeUpdatesLatestVersionLabel(null), "unknown");
  assert.equal(runtimeUpdatesHasAvailableUpdate(null), false);
  assert.equal(runtimeUpdatesPressureLabel(null), "up to date");
  assert.equal(runtimeUpdatesLastCheckedAt(null), null);
  assert.equal(runtimeUpdatesLastAppliedAt(null), null);
  assert.equal(runtimeUpdatesLatestEventAt(null), null);
  assert.equal(runtimeUpdatesPolicyUpdateChannel(null), "stable");
  assert.equal(runtimeUpdatesPolicyAutoApply(null), "manual_only");
  assert.equal(runtimeUpdatesPolicySupportPostureLabel(null), "disabled by default");
  assert.deepEqual(runtimeUpdatesPolicyViewState(null), {
    updateChannel: "stable",
    autoApply: "manual_only",
    supportPostureLine: "Support posture: disabled by default",
  });
  assert.deepEqual(runtimeUpdatesActionState(null, null), {
    canCheck: true,
    canApply: false,
    checkBusy: false,
    applyBusy: false,
    checkLabel: "Check updates",
    applyLabel: "Apply update",
  });
  assert.deepEqual(runtimeUpdatesPanel({
    current_version: "1.0.0",
    latest_version: "1.0.0",
    update_available: false,
    runtime_status: "healthy",
    entries: [],
    panel: { title: "Updates ready" },
  }), {
    title: "Updates ready",
  });
});

test("runtime update selectors expose version event and policy state consistently", () => {
  const runtimeUpdates = {
    current_version: "1.0.0",
    latest_version: "1.1.0",
    update_available: true,
    runtime_status: "healthy",
    last_checked_at: "2026-08-14T09:00:00Z",
    last_applied_at: "2026-08-14T08:00:00Z",
    entries: [
      {
        id: "update-1",
        action: "check",
        status: "completed",
        created_at: "2026-08-14T07:00:00Z",
        notes_summary: null,
      },
      {
        id: "update-2",
        action: "apply",
        status: "completed",
        created_at: "2026-08-14T10:00:00Z",
        notes_summary: null,
      },
    ],
    policy: {
      update_channel: "stable",
      auto_apply: "scaffold_refresh_only",
      support_disabled_by_default: false,
    },
  };

  assert.equal(runtimeUpdatesCurrentVersionLabel(runtimeUpdates), "1.0.0");
  assert.equal(runtimeUpdatesLatestVersionLabel(runtimeUpdates), "1.1.0");
  assert.equal(runtimeUpdatesHasAvailableUpdate(runtimeUpdates), true);
  assert.equal(runtimeUpdatesPressureLabel(runtimeUpdates), "1.0.0 -> 1.1.0");
  assert.equal(runtimeUpdatesLastCheckedAt(runtimeUpdates), "2026-08-14T09:00:00Z");
  assert.equal(runtimeUpdatesLastAppliedAt(runtimeUpdates), "2026-08-14T08:00:00Z");
  assert.equal(runtimeUpdatesLatestEventAt(runtimeUpdates), "2026-08-14T10:00:00Z");
  assert.equal(runtimeUpdatesEntries(runtimeUpdates).length, 2);
  assert.equal(runtimeUpdatesPolicyUpdateChannel(runtimeUpdates), "stable");
  assert.equal(runtimeUpdatesPolicyAutoApply(runtimeUpdates), "scaffold_refresh_only");
  assert.equal(runtimeUpdatesPolicySupportPostureLabel(runtimeUpdates), "customized");
  assert.deepEqual(runtimeUpdatesPolicyViewState(runtimeUpdates), {
    updateChannel: "stable",
    autoApply: "scaffold_refresh_only",
    supportPostureLine: "Support posture: customized",
  });
  assert.deepEqual(runtimeUpdatesActionState("apply", runtimeUpdates), {
    canCheck: false,
    canApply: false,
    checkBusy: false,
    applyBusy: true,
    checkLabel: "Check updates",
    applyLabel: "Applying...",
  });
});
