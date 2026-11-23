import test from "node:test";
import assert from "node:assert/strict";

import type { AfpMessage, DashboardBootstrap } from "../src/lib/api.ts";
import {
  continuityMetricsFromMessages,
  decisionOsContinuityTrendState,
} from "../src/lib/decisionosContinuityTrendState.ts";

type WatcherSignal = NonNullable<DashboardBootstrap["continuity_watcher_signals"]>[number];

function stateSnapshot(metrics: Record<string, unknown>): AfpMessage {
  return {
    id: "snapshot_1",
    thread_id: "thread_1",
    from: "state_synthesizer",
    timestamp: "2026-09-25T00:00:00Z",
    type: "state_snapshot",
    content: { continuity_metrics: metrics },
    views: [],
    attachments: [],
  };
}

function signal(overrides: Partial<WatcherSignal>): WatcherSignal {
  return {
    id: "sig_1",
    signal_key: "renewal",
    category: "follow_up",
    freshness: "fresh",
    urgency: "high",
    confidence: "0.8",
    source_type: "message",
    source_subtype: "email",
    thread_id: "thread_1",
    source_refs: ["message:1"],
    ...overrides,
  };
}

test("continuityMetricsFromMessages reads the latest state snapshot metrics", () => {
  const metrics = continuityMetricsFromMessages([
    stateSnapshot({ urgency_acceleration: 0.1 }),
    stateSnapshot({ urgency_acceleration: 0.72, recent_signal_count: 3 }),
  ]);

  assert.equal(metrics?.urgency_acceleration, 0.72);
  assert.equal(metrics?.recent_signal_count, 3);
});

test("decisionOsContinuityTrendState builds bounded bars from smoothed metrics", () => {
  const state = decisionOsContinuityTrendState({
    messages: [stateSnapshot({
      urgency_acceleration: 0.8,
      unresolved_queue_pressure: 0.45,
      follow_up_drift_score: 0,
      recent_signal_count: 5,
    })],
  });

  assert.equal(state.source, "state_snapshot");
  assert.equal(state.calibrationStatus, "insufficient_history");
  assert.equal(state.calibrationText, "1 snapshot sample available; keep thresholds conservative.");
  assert.deepEqual(state.calibrationReview, {
    sampleCount: 1,
    coveragePercent: 100,
    volatility: "insufficient",
    volatileKeys: [],
    peakPercent: 80,
    note: null,
  });
  assert.equal(state.hasTrend, true);
  assert.deepEqual(state.bars.map((bar) => [bar.label, bar.percent, bar.tone]), [
    ["Urgency", 80, "high"],
    ["Queue pressure", 45, "medium"],
  ]);
  assert.equal(state.summaryText, "5 continuity signals shaping this queue.");
});

test("decisionOsContinuityTrendState falls back to active watcher signals", () => {
  const state = decisionOsContinuityTrendState({
    watcherSignals: [
      signal({ id: "sig_1", urgency: "high", freshness: "reactivated" }),
      signal({ id: "sig_2", urgency: "low", freshness: "fresh" }),
      signal({ id: "sig_3", suppression_status: "suppressed" }),
      signal({ id: "sig_4", decrypt_needed: true }),
    ],
  });

  assert.equal(state.source, "watcher_signals");
  assert.equal(state.calibrationStatus, "watcher_fallback");
  assert.equal(state.calibrationReview.volatility, "insufficient");
  assert.equal(
    state.calibrationReview.note,
    "Watcher fallback only; wait for snapshot history before tuning thresholds.",
  );
  assert.deepEqual(state.bars.map((bar) => [bar.key, bar.percent]), [
    ["urgency_acceleration", 50],
    ["unresolved_queue_pressure", 33],
    ["follow_up_drift_score", 50],
  ]);
});

test("decisionOsContinuityTrendState stays quiet without metrics or signals", () => {
  const state = decisionOsContinuityTrendState({});

  assert.equal(state.source, "none");
  assert.equal(state.calibrationStatus, "insufficient_history");
  assert.equal(state.hasTrend, false);
  assert.equal(state.summaryText, null);
});

test("decisionOsContinuityTrendState marks calibration review ready with enough snapshots", () => {
  const state = decisionOsContinuityTrendState({
    messages: Array.from({ length: 5 }, (_, index) =>
      stateSnapshot({
        urgency_acceleration: 0.2 + index * 0.05,
        unresolved_queue_pressure: 0.4,
        follow_up_drift_score: 0.12,
        recent_signal_count: 2,
      }),
    ),
  });

  assert.equal(state.source, "state_snapshot");
  assert.equal(state.calibrationStatus, "ready");
  assert.equal(state.calibrationText, "5 snapshot samples available for calibration review.");
  assert.equal(state.calibrationReview.volatility, "stable");
  assert.equal(state.calibrationReview.coveragePercent, 100);
  assert.deepEqual(state.calibrationReview.volatileKeys, []);
  assert.equal(state.calibrationReview.peakPercent, 40);
  assert.equal(state.calibrationReview.note, "Snapshot history is stable enough for calibration review.");
});

test("decisionOsContinuityTrendState flags volatile calibration history", () => {
  const state = decisionOsContinuityTrendState({
    messages: [
      stateSnapshot({ urgency_acceleration: 0.05, unresolved_queue_pressure: 0.2, follow_up_drift_score: 0.1, recent_signal_count: 1 }),
      stateSnapshot({ urgency_acceleration: 0.9, unresolved_queue_pressure: 0.22, follow_up_drift_score: 0.1, recent_signal_count: 4 }),
      stateSnapshot({ urgency_acceleration: 0.15, unresolved_queue_pressure: 0.25, follow_up_drift_score: 0.1, recent_signal_count: 1 }),
      stateSnapshot({ urgency_acceleration: 0.84, unresolved_queue_pressure: 0.24, follow_up_drift_score: 0.1, recent_signal_count: 4 }),
      stateSnapshot({ urgency_acceleration: 0.18, unresolved_queue_pressure: 0.23, follow_up_drift_score: 0.1, recent_signal_count: 2 }),
    ],
  });

  assert.equal(state.calibrationStatus, "ready");
  assert.equal(state.calibrationReview.sampleCount, 5);
  assert.equal(state.calibrationReview.volatility, "spiky");
  assert.equal(state.calibrationReview.coveragePercent, 100);
  assert.deepEqual(state.calibrationReview.volatileKeys, ["urgency_acceleration"]);
  assert.equal(state.calibrationReview.peakPercent, 90);
  assert.equal(
    state.calibrationReview.note,
    "Snapshot history is volatile; review thresholds before increasing surface intensity.",
  );
});

test("decisionOsContinuityTrendState handles larger workspace calibration history", () => {
  const messages = Array.from({ length: 36 }, (_, index) =>
    stateSnapshot({
      urgency_acceleration: 0.18 + (index % 4) * 0.04,
      unresolved_queue_pressure: index % 9 === 0 ? 0.72 : 0.28,
      follow_up_drift_score: index % 6 === 0 ? 0.38 : 0.12,
      recent_signal_count: 12 + (index % 5),
    }),
  );

  const state = decisionOsContinuityTrendState({ messages });

  assert.equal(state.calibrationStatus, "ready");
  assert.equal(state.calibrationReview.sampleCount, 36);
  assert.equal(state.calibrationReview.volatility, "stable");
  assert.equal(state.calibrationReview.coveragePercent, 100);
  assert.deepEqual(state.calibrationReview.volatileKeys, []);
  assert.equal(state.calibrationReview.peakPercent, 72);
  assert.equal(state.calibrationReview.note, "Snapshot history is stable enough for calibration review.");
});

test("decisionOsContinuityTrendState keeps larger sparse workspace history conservative", () => {
  const messages = Array.from({ length: 24 }, (_, index) =>
    stateSnapshot(index < 16
      ? {
        urgency_acceleration: 0.26,
        recent_signal_count: 8,
      }
      : {
        urgency_acceleration: 0.3,
        unresolved_queue_pressure: 0.42,
        follow_up_drift_score: 0.18,
        recent_signal_count: 11,
      }),
  );

  const state = decisionOsContinuityTrendState({ messages });

  assert.equal(state.calibrationStatus, "insufficient_history");
  assert.equal(
    state.calibrationText,
    "Snapshot history has sparse continuity metric coverage; keep thresholds conservative until newer snapshots dominate.",
  );
  assert.equal(state.calibrationReview.sampleCount, 24);
  assert.equal(state.calibrationReview.coveragePercent, 33);
  assert.equal(state.calibrationReview.volatility, "insufficient");
  assert.deepEqual(state.calibrationReview.volatileKeys, []);
  assert.equal(
    state.calibrationReview.note,
    "Snapshot history has sparse continuity metric coverage; keep thresholds conservative until newer snapshots dominate.",
  );
});
