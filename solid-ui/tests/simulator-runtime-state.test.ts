import assert from "node:assert/strict";
import test from "node:test";

import {
  dateTimeLabel,
  relativeTimeLabel,
} from "../src/lib/agentSettingsRuntimeFormat.ts";
import {
  simulatorRuntimeCompactObservationSummary,
  simulatorRuntimeCompactTrustSummary,
  simulatorRuntimeCalibrationModeChips,
  simulatorRuntimeEnabledSurfacesLabel,
  simulatorRuntimeHasSummary,
  simulatorRuntimeHighestRolloutStageLabel,
  simulatorRuntimeObservedCalibrationModeLabel,
  simulatorRuntimeObservedRolloutStageLabel,
  simulatorRuntimePromotionSurfacesLabel,
  simulatorRuntimeReviewSurfacesLabel,
  simulatorRuntimeSampledSurfacesLabel,
  simulatorRuntimeSummaryCardState,
  simulatorRuntimeSurfaceStageChips,
} from "../src/lib/simulatorRuntimeState.ts";

test("simulator runtime selectors provide stable fallbacks", () => {
  assert.equal(simulatorRuntimeHasSummary(null), false);
  assert.equal(simulatorRuntimeHighestRolloutStageLabel(null), "shadow");
  assert.equal(simulatorRuntimeEnabledSurfacesLabel(null), "0 active surfaces");
  assert.equal(simulatorRuntimePromotionSurfacesLabel(null), "0 promotion-enabled");
  assert.equal(simulatorRuntimeReviewSurfacesLabel(null), "0 review surfaces");
  assert.equal(simulatorRuntimeSampledSurfacesLabel(null), "0 sampled surfaces");
  assert.equal(simulatorRuntimeObservedRolloutStageLabel(null), null);
  assert.equal(simulatorRuntimeObservedCalibrationModeLabel(null), null);
  assert.equal(simulatorRuntimeCompactTrustSummary(null), "");
  assert.equal(simulatorRuntimeCompactObservationSummary(null), null);
  assert.deepEqual(simulatorRuntimeSurfaceStageChips(null), []);
  assert.deepEqual(simulatorRuntimeCalibrationModeChips(null), []);
  assert.deepEqual(simulatorRuntimeSummaryCardState(null), {
    highestRolloutStageLabel: "shadow",
    enabledSurfacesLabel: "0 active surfaces",
    promotionSurfacesLabel: "0 promotion-enabled",
    reviewSurfacesLabel: "0 review surfaces",
    sampledSurfacesLabel: "0 sampled surfaces",
    rolloutTrustLines: [],
    observedSummaryLines: [],
    surfaceStageChips: [],
    calibrationModeChips: [],
    policySummaryLines: [],
    calibrationNoteLines: [],
  });
});

test("simulator runtime selectors summarize rollout posture from bootstrap state", () => {
  const summary = {
    enabled_surface_count: 3,
    promotion_enabled_surface_count: 1,
    review_surface_count: 2,
    sampled_surface_count: 2,
    highest_rollout_stage: "review",
    policy_posture_summary: "Policy posture: review stage across 3 active surfaces; 1 promotion-enabled; 2 review surfaces; 2 sampled surfaces.",
    latest_observed_at: "2026-08-18T05:00:00Z",
    observed_rollout_stage: "review",
    observed_calibration_mode: "bounded_deterministic",
    observed_projection_summary: "Bounded simulation traced 4 step(s) across 1 rollout(s).",
    observed_review_summary: "Simulator preview stays bounded on synthesizer with 1 reviewable promotion candidate.",
    observed_actionable_event_count: 4,
    observed_promotion_candidate_count: 1,
    observed_review_surface_count: 1,
    observed_calibration_notes: [
      "Deterministic bounded preview stayed within a single rollout.",
      "1 review surface remained available for promoted previews.",
    ],
    rollout_alignment_status: "aligned",
    rollout_alignment_summary: "Latest observed simulation matches the planned review posture.",
    surfaces: [
      {
        surface: "planning",
        rollout_stage: "review",
        calibration_mode: "shadow_compare",
        policy_summary: "Simulator preview stays bounded on planning without promotion write-back.",
        calibration_notes: ["Promotion write-back is suppressed by rollout policy."],
      },
      {
        surface: "synthesizer",
        rollout_stage: "promotion",
        calibration_mode: "heuristic_first",
        policy_summary: "Simulator preview stays bounded on synthesizer with review surfaces enabled.",
        calibration_notes: ["Review surfaces stay available for bounded simulator previews."],
      },
      {
        surface: "watcher",
        rollout_stage: "sampled",
        calibration_mode: "sampled_only",
        policy_summary: "Simulator preview disabled for watcher by rollout policy.",
        calibration_notes: ["Rollout policy disabled simulator execution for this surface."],
      },
    ],
  };

  assert.equal(simulatorRuntimeHasSummary(summary), true);
  assert.equal(simulatorRuntimeHighestRolloutStageLabel(summary), "review");
  assert.equal(simulatorRuntimeObservedRolloutStageLabel(summary), "review");
  assert.equal(
    simulatorRuntimeObservedCalibrationModeLabel(summary),
    "bounded deterministic",
  );
  assert.equal(
    simulatorRuntimeCompactTrustSummary(summary),
    "Latest observed simulation matches the planned review posture.",
  );
  assert.equal(
    simulatorRuntimeCompactObservationSummary(summary),
    "Latest simulator observation is review / bounded deterministic.",
  );
  assert.equal(simulatorRuntimeEnabledSurfacesLabel(summary), "3 active surfaces");
  assert.equal(simulatorRuntimePromotionSurfacesLabel(summary), "1 promotion-enabled");
  assert.equal(simulatorRuntimeReviewSurfacesLabel(summary), "2 review surfaces");
  assert.equal(simulatorRuntimeSampledSurfacesLabel(summary), "2 sampled surfaces");
  assert.deepEqual(simulatorRuntimeSurfaceStageChips(summary), [
    "planning: review",
    "synthesizer: promotion",
    "watcher: sampled",
  ]);
  assert.deepEqual(simulatorRuntimeCalibrationModeChips(summary), [
    "planning: shadow compare",
    "synthesizer: heuristic first",
    "watcher: sampled only",
  ]);
  assert.deepEqual(simulatorRuntimeSummaryCardState(summary), {
    highestRolloutStageLabel: "review",
    enabledSurfacesLabel: "3 active surfaces",
    promotionSurfacesLabel: "1 promotion-enabled",
    reviewSurfacesLabel: "2 review surfaces",
    sampledSurfacesLabel: "2 sampled surfaces",
    rolloutTrustLines: [
      "Policy posture: review stage across 3 active surfaces; 1 promotion-enabled; 2 review surfaces; 2 sampled surfaces.",
      "Latest observed simulation matches the planned review posture.",
    ],
    observedSummaryLines: [
      `observed at ${dateTimeLabel("2026-08-18T05:00:00Z")}`,
      relativeTimeLabel("2026-08-18T05:00:00Z"),
      "observed stage: review",
      "observed mode: bounded deterministic",
      "Bounded simulation traced 4 step(s) across 1 rollout(s).",
      "Simulator preview stays bounded on synthesizer with 1 reviewable promotion candidate.",
      "4 actionable events",
      "1 promotion candidate",
      "1 review surface in latest observation",
      "Deterministic bounded preview stayed within a single rollout.",
      "1 review surface remained available for promoted previews.",
    ],
    surfaceStageChips: [
      "planning: review",
      "synthesizer: promotion",
      "watcher: sampled",
    ],
    calibrationModeChips: [
      "planning: shadow compare",
      "synthesizer: heuristic first",
      "watcher: sampled only",
    ],
    policySummaryLines: [
      "planning: Simulator preview stays bounded on planning without promotion write-back.",
      "synthesizer: Simulator preview stays bounded on synthesizer with review surfaces enabled.",
      "watcher: Simulator preview disabled for watcher by rollout policy.",
    ],
    calibrationNoteLines: [
      "planning: Promotion write-back is suppressed by rollout policy.",
      "synthesizer: Review surfaces stay available for bounded simulator previews.",
      "watcher: Rollout policy disabled simulator execution for this surface.",
    ],
  });
});

test("simulator runtime selectors surface rollout drift when observation trails policy", () => {
  const summary = {
    enabled_surface_count: 1,
    promotion_enabled_surface_count: 1,
    review_surface_count: 1,
    sampled_surface_count: 0,
    highest_rollout_stage: "promotion",
    policy_posture_summary: "Policy posture: promotion stage across 1 active surface; 1 promotion-enabled; 1 review surface; 0 sampled surfaces.",
    observed_rollout_stage: "shadow",
    observed_calibration_mode: "bounded_deterministic",
    rollout_alignment_status: "below_policy",
    rollout_alignment_summary:
      "Latest observed simulation remains below policy posture: observed shadow while policy is promotion.",
    surfaces: [
      {
        surface: "synthesizer",
        rollout_stage: "promotion",
        calibration_mode: "bounded_deterministic",
        policy_summary: "Simulator preview stays bounded on synthesizer with review surfaces enabled.",
        calibration_notes: [],
      },
    ],
  };

  assert.deepEqual(simulatorRuntimeSummaryCardState(summary).rolloutTrustLines, [
    "Policy posture: promotion stage across 1 active surface; 1 promotion-enabled; 1 review surface; 0 sampled surfaces.",
    "Latest observed simulation remains below policy posture: observed shadow while policy is promotion.",
  ]);
  assert.equal(
    simulatorRuntimeCompactTrustSummary(summary),
    "Latest observed simulation remains below policy posture: observed shadow while policy is promotion.",
  );
  assert.equal(
    simulatorRuntimeCompactObservationSummary(summary),
    "Latest simulator observation is shadow / bounded deterministic.",
  );
});
