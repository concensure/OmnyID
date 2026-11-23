import assert from "node:assert/strict";
import test from "node:test";

import {
  runtimeOperationsOverviewRows,
  runtimeUpdateEventCards,
} from "../src/lib/runtimeOperationsState.ts";
import { dateTimeLabel } from "../src/lib/agentSettingsRuntimeFormat.ts";

test("runtime operations overview rows provide stable fallbacks", () => {
  const rows = runtimeOperationsOverviewRows(null, null);
  assert.deepEqual(rows, [
    { label: "Status", value: "unknown" },
    { label: "Framework", value: "none" },
    { label: "Latest version", value: "unknown" },
    { label: "Current version", value: "unknown" },
    { label: "Update pressure", value: "up to date" },
    { label: "Simulator stage", value: "shadow" },
    { label: "Simulator trust", value: "No simulator rollout posture available" },
    { label: "Latest simulation", value: "No observed simulation yet" },
    { label: "Last checked", value: "- | Not used yet" },
    { label: "Last applied", value: "- | Not used yet" },
    { label: "Last update event", value: "- | Not used yet" },
  ]);
});

test("runtime operations overview rows expose deployment and update posture", () => {
  const rows = runtimeOperationsOverviewRows(
    {
      id: "runtime-1",
      framework: "fastapi",
      status: "healthy",
      workspace_path: "/srv/omnyid",
    },
    {
      current_version: "1.0.0",
      latest_version: "1.1.0",
      update_available: true,
      runtime_status: "healthy",
      last_checked_at: "2026-08-14T09:00:00Z",
      last_applied_at: "2026-08-14T08:00:00Z",
      entries: [
        {
          id: "update-1",
          action: "apply",
          status: "completed",
          created_at: "2026-08-14T10:00:00Z",
          notes_summary: null,
        },
      ],
    },
    {
      highest_rollout_stage: "review",
      enabled_surface_count: 3,
      promotion_enabled_surface_count: 1,
      review_surface_count: 2,
      sampled_surface_count: 1,
      policy_posture_summary:
        "Policy posture: review stage across 3 active surfaces; 1 promotion-enabled; 2 review surfaces; 1 sampled surface.",
      latest_observed_at: "2026-08-14T11:00:00Z",
      observed_rollout_stage: "review",
      observed_calibration_mode: "bounded_deterministic",
      observed_actionable_event_count: 2,
      observed_promotion_candidate_count: 1,
      rollout_alignment_status: "aligned",
      rollout_alignment_summary: "Latest observed simulation matches the planned review posture.",
      surfaces: [],
    },
  );

  assert.equal(rows[0]?.value, "healthy");
  assert.equal(rows[1]?.value, "fastapi");
  assert.equal(rows[2]?.value, "1.1.0");
  assert.equal(rows[3]?.value, "1.0.0");
  assert.equal(rows[4]?.value, "1.0.0 -> 1.1.0");
  assert.equal(rows[5]?.value, "review");
  assert.equal(rows[6]?.value, "Latest observed simulation matches the planned review posture.");
  assert.match(rows[7]?.value ?? "", /stage review/);
  assert.match(rows[8]?.value ?? "", /Used/);
  assert.match(rows[9]?.value ?? "", /Used/);
  assert.match(rows[10]?.value ?? "", /Used/);
});

test("runtime operations overview rows keep policy-only simulator posture visible", () => {
  const rows = runtimeOperationsOverviewRows(
    null,
    null,
    {
      highest_rollout_stage: "promotion",
      enabled_surface_count: 2,
      promotion_enabled_surface_count: 1,
      review_surface_count: 1,
      sampled_surface_count: 0,
      policy_posture_summary:
        "Policy posture: promotion stage across 2 active surfaces; 1 promotion-enabled; 1 review surface; 0 sampled surfaces.",
      rollout_alignment_status: "policy_only",
      rollout_alignment_summary:
        "No observed simulator run has been recorded yet for the current promotion policy posture.",
      surfaces: [],
    },
  );

  assert.equal(rows[5]?.value, "promotion");
  assert.equal(
    rows[6]?.value,
    "No observed simulator run has been recorded yet for the current promotion policy posture.",
  );
  assert.equal(rows[7]?.value, "No observed simulation yet | policy only");
});

test("runtime update event cards normalize recent update event presentation", () => {
  const cards = runtimeUpdateEventCards({
    current_version: "1.0.0",
    latest_version: "1.1.0",
    update_available: true,
    runtime_status: "healthy",
    entries: [
      {
        id: "update-1",
        action: "check",
        status: "completed",
        from_version: null,
        to_version: "1.1.0",
        created_at: "2026-08-14T07:00:00Z",
        notes_summary: { scope: "stable", staged: true },
      },
      {
        id: "update-2",
        action: "apply",
        status: "completed",
        from_version: "1.0.0",
        to_version: null,
        created_at: "2026-08-14T08:00:00Z",
        notes_summary: null,
      },
    ],
  });

  assert.equal(cards.length, 2);
  assert.deepEqual(cards[0], {
    id: "update-1",
    title: "check | completed",
    versionSummary: `unknown -> 1.1.0 | ${dateTimeLabel("2026-08-14T07:00:00Z")}`,
    relativeCreatedAt: cards[0]?.relativeCreatedAt,
    noteChips: ["scope: stable", "staged: true"],
  });
  assert.match(cards[0]?.relativeCreatedAt ?? "", /^Used /);
  assert.equal(cards[1]?.title, "apply | completed");
  assert.match(cards[1]?.versionSummary ?? "", /1\.0\.0 -> pending/);
  assert.equal(cards[1]?.noteChips.length, 0);
});
