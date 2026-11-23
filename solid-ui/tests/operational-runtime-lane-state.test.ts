import assert from "node:assert/strict";
import test from "node:test";

import { operationalRuntimeLaneState } from "../src/lib/operationalRuntimeLaneState.ts";

test("operational runtime lane state reflects observed simulator posture", () => {
  const state = operationalRuntimeLaneState(
    "fastapi",
    "healthy",
    {
      id: "runtime-1",
      framework: "fastapi",
      status: "healthy",
      workspace_path: "/srv/omnyid",
    },
    {
      highest_rollout_stage: "review",
      enabled_surface_count: 3,
      promotion_enabled_surface_count: 1,
      review_surface_count: 2,
      sampled_surface_count: 1,
      policy_posture_summary:
        "Policy posture: review stage across 3 active surfaces; 1 promotion-enabled; 2 review surfaces; 1 sampled surface.",
      latest_observed_at: "2026-08-18T11:00:00Z",
      observed_rollout_stage: "review",
      observed_calibration_mode: "bounded_deterministic",
      rollout_alignment_status: "aligned",
      rollout_alignment_summary: "Latest observed simulation matches the planned review posture.",
      surfaces: [],
    },
  );

  assert.deepEqual(state, {
    title: "fastapi runtime healthy | simulator review",
    detail:
      "Deployment and update telemetry are available. Latest simulator observation is review / bounded deterministic. Latest observed simulation matches the planned review posture.",
    reason: "simulator observation at review / bounded deterministic",
  });
});

test("operational runtime lane state preserves policy-only simulator posture without deployment", () => {
  const state = operationalRuntimeLaneState(
    null,
    "unknown",
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

  assert.deepEqual(state, {
    title: "Runtime unknown",
    detail:
      "No active runtime deployment is attached yet. Simulator rollout is promotion across 2 active surfaces. No observed simulator run has been recorded yet for the current promotion policy posture.",
    reason: "simulator rollout policy summarized",
  });
});

test("operational runtime lane state prioritizes the recorded operator gate when present", () => {
  const state = operationalRuntimeLaneState(
    "fastapi",
    "healthy",
    {
      id: "runtime-1",
      framework: "fastapi",
      status: "healthy",
      workspace_path: "/srv/omnyid",
    },
    {
      highest_rollout_stage: "review",
      enabled_surface_count: 3,
      promotion_enabled_surface_count: 1,
      review_surface_count: 2,
      sampled_surface_count: 1,
      policy_posture_summary:
        "Policy posture: review stage across 3 active surfaces; 1 promotion-enabled; 2 review surfaces; 1 sampled surface.",
      latest_observed_at: "2026-08-18T11:00:00Z",
      observed_rollout_stage: "review",
      observed_calibration_mode: "bounded_deterministic",
      rollout_alignment_status: "aligned",
      rollout_alignment_summary: "Latest observed simulation matches the planned review posture.",
      surfaces: [],
    },
    {
      status: "no_go",
      summary: "Execute the bounded operational-history cleanup, rerun proof, and refresh the gate.",
      command: "./scripts/oracle-prune-operational-history.ps1 -Apply",
      source: "artifacts/production-go-no-go-current/production-go-no-go.json",
      pressure_status: "operational_history_present",
      pressure_total_rows: 19800,
      cleanup_mode: "dry_run",
      generated_at: "2026-08-28T08:55:00Z",
    },
  );

  assert.deepEqual(state, {
    title: "fastapi runtime healthy | simulator review",
    detail:
      "Deployment and update telemetry are available. Execute the bounded operational-history cleanup, rerun proof, and refresh the gate. Latest simulator observation is review / bounded deterministic. Latest observed simulation matches the planned review posture.",
    reason: "operator gate operational_history_present",
  });
});

test("operational runtime lane state still records operator guidance when the gate has no pressure status", () => {
  const state = operationalRuntimeLaneState(
    "fastapi",
    "healthy",
    {
      id: "runtime-1",
      framework: "fastapi",
      status: "healthy",
      workspace_path: "/srv/omnyid",
    },
    null,
    {
      status: "review",
      summary: "Refresh the production readiness report before enabling broader rollout.",
      command: "./scripts/refresh-production-readiness.ps1",
      source: "artifacts/production-go-no-go-current/production-go-no-go.json",
      pressure_status: null,
      pressure_total_rows: null,
      cleanup_mode: null,
      generated_at: "2026-08-30T09:15:00Z",
    },
  );

  assert.deepEqual(state, {
    title: "fastapi runtime healthy",
    detail:
      "Deployment and update telemetry are available. Refresh the production readiness report before enabling broader rollout.",
    reason: "operator gate recorded",
  });
});
