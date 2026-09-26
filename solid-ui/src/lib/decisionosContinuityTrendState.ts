// @locs-version: 2.0
import type { AfpMessage, DashboardBootstrap } from "@/lib/api";

export type DecisionOsContinuityMetricKey =
  | "urgency_acceleration"
  | "unresolved_queue_pressure"
  | "follow_up_drift_score";

export type DecisionOsContinuityMetrics = Partial<Record<DecisionOsContinuityMetricKey, number>> & {
  recent_signal_count?: number;
  fresh_signal_count?: number;
  deadline_signal_count?: number;
  burst_signal_count?: number;
  reactivation_signal_count?: number;
  context_switch_rate?: number;
  activity_velocity?: number;
};

export type DecisionOsContinuityTrendBar = {
  key: DecisionOsContinuityMetricKey;
  label: string;
  value: number;
  percent: number;
  tone: "high" | "medium" | "low";
};

export type DecisionOsContinuityCalibrationReview = {
  sampleCount: number;
  coveragePercent: number;
  volatility: "insufficient" | "stable" | "variable" | "spiky";
  volatileKeys: DecisionOsContinuityMetricKey[];
  peakPercent: number;
  note: string | null;
};

export type DecisionOsContinuityTrendState = {
  bars: DecisionOsContinuityTrendBar[];
  summaryText: string | null;
  calibrationStatus: "insufficient_history" | "watcher_fallback" | "ready";
  calibrationText: string | null;
  calibrationReview: DecisionOsContinuityCalibrationReview;
  source: "state_snapshot" | "watcher_signals" | "none";
  hasTrend: boolean;
};

type WatcherSignal = NonNullable<DashboardBootstrap["continuity_watcher_signals"]>[number];

const TREND_LABELS: Record<DecisionOsContinuityMetricKey, string> = {
  urgency_acceleration: "Urgency",
  unresolved_queue_pressure: "Queue pressure",
  follow_up_drift_score: "Follow-up drift",
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bounded(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function metricMapFromUnknown(value: unknown): DecisionOsContinuityMetrics | null {
  const source = record(value);
  if (!source) return null;
  const metrics: DecisionOsContinuityMetrics = {};
  for (const [key, raw] of Object.entries(source)) {
    const value = finiteNumber(raw);
    if (value !== null) metrics[key as keyof DecisionOsContinuityMetrics] = value;
  }
  return Object.keys(metrics).length > 0 ? metrics : null;
}

function snapshotMetrics(message: AfpMessage): DecisionOsContinuityMetrics | null {
  return metricMapFromUnknown(message.content?.continuity_metrics)
    ?? metricMapFromUnknown(message.views?.[0]?.content?.continuity_metrics);
}

function snapshotMetricSamples(messages: AfpMessage[] | null | undefined): DecisionOsContinuityMetrics[] {
  return (messages ?? [])
    .filter((message) => message.type === "state_snapshot")
    .flatMap((message) => {
      const metrics = snapshotMetrics(message);
      return metrics ? [metrics] : [];
    });
}

export function latestContinuityMetricsFromMessages(
  messages: AfpMessage[] | null | undefined,
): DecisionOsContinuityMetrics | null {
  return continuityMetricsFromMessages(messages);
}

export function continuityMetricsFromMessages(
  messages: AfpMessage[] | null | undefined,
): DecisionOsContinuityMetrics | null {
  for (const message of [...(messages ?? [])].reverse()) {
    if (message.type !== "state_snapshot") continue;
    const metrics = snapshotMetrics(message);
    if (metrics) return metrics;
  }
  return null;
}

function metricsFromWatcherSignals(signals: WatcherSignal[]): DecisionOsContinuityMetrics | null {
  if (signals.length === 0) return null;
  const active = signals.filter((signal) => signal.suppression_status !== "suppressed" && !signal.decrypt_needed);
  const urgentCount = active.filter((signal) => ["critical", "high", "today"].includes(signal.urgency)).length;
  const reactivatedCount = active.filter((signal) => signal.freshness === "reactivated").length;
  return {
    recent_signal_count: active.length,
    urgency_acceleration: bounded(urgentCount / Math.max(1, active.length)),
    unresolved_queue_pressure: bounded(active.length / 6),
    follow_up_drift_score: bounded(reactivatedCount / Math.max(1, active.length)),
  };
}

function trendBar(key: DecisionOsContinuityMetricKey, raw: number | null | undefined): DecisionOsContinuityTrendBar {
  const value = bounded(raw ?? 0);
  return {
    key,
    label: TREND_LABELS[key],
    value,
    percent: Math.round(value * 100),
    tone: value >= 0.66 ? "high" : value >= 0.34 ? "medium" : "low",
  };
}

function calibrationReview(args: {
  source: DecisionOsContinuityTrendState["source"];
  samples: DecisionOsContinuityMetrics[];
}): DecisionOsContinuityCalibrationReview {
  if (args.source === "watcher_signals") {
    return {
      sampleCount: 0,
      coveragePercent: 0,
      volatility: "insufficient",
      volatileKeys: [],
      peakPercent: 0,
      note: "Watcher fallback only; wait for snapshot history before tuning thresholds.",
    };
  }

  const keys = ["urgency_acceleration", "unresolved_queue_pressure", "follow_up_drift_score"] as const;
  const ranges = keys.map((key) => {
    const values = args.samples
      .map((sample) => finiteNumber(sample[key]))
      .filter((value): value is number => value !== null)
      .map(bounded);
    if (values.length === 0) return { key, range: 0, peak: 0, coverage: 0 };
    return {
      key,
      range: Math.max(...values) - Math.min(...values),
      peak: Math.max(...values),
      coverage: values.length / Math.max(1, args.samples.length),
    };
  });
  const peakPercent = Math.round(Math.max(0, ...ranges.map((entry) => entry.peak)) * 100);
  const coveragePercent = Math.round(Math.min(...ranges.map((entry) => entry.coverage)) * 100);

  if (args.samples.length < 5) {
    return {
      sampleCount: args.samples.length,
      coveragePercent,
      volatility: "insufficient",
      volatileKeys: [],
      peakPercent,
      note: null,
    };
  }

  if (coveragePercent < 60) {
    return {
      sampleCount: args.samples.length,
      coveragePercent,
      volatility: "insufficient",
      volatileKeys: [],
      peakPercent,
      note: "Snapshot history has sparse continuity metric coverage; keep thresholds conservative until newer snapshots dominate.",
    };
  }

  const volatileKeys = ranges
    .filter((entry) => entry.range >= 0.5)
    .map((entry) => entry.key);
  const volatility = ranges.some((entry) => entry.range >= 0.75)
    ? "spiky"
    : volatileKeys.length > 0 ? "variable" : "stable";
  const note = volatility === "stable"
    ? "Snapshot history is stable enough for calibration review."
    : "Snapshot history is volatile; review thresholds before increasing surface intensity.";

  return {
    sampleCount: args.samples.length,
    coveragePercent,
    volatility,
    volatileKeys,
    peakPercent,
    note,
  };
}

function calibrationState(args: {
  source: DecisionOsContinuityTrendState["source"];
  snapshotSampleCount: number;
}): Pick<DecisionOsContinuityTrendState, "calibrationStatus" | "calibrationText"> {
  if (args.source === "watcher_signals") {
    return {
      calibrationStatus: "watcher_fallback",
      calibrationText: "Using live watcher signals until more snapshot history is available.",
    };
  }
  if (args.source === "state_snapshot" && args.snapshotSampleCount >= 5) {
    return {
      calibrationStatus: "ready",
      calibrationText: `${args.snapshotSampleCount} snapshot samples available for calibration review.`,
    };
  }
  if (args.source === "state_snapshot") {
    return {
      calibrationStatus: "insufficient_history",
      calibrationText: `${args.snapshotSampleCount} snapshot sample${args.snapshotSampleCount === 1 ? "" : "s"} available; keep thresholds conservative.`,
    };
  }
  return {
    calibrationStatus: "insufficient_history",
    calibrationText: null,
  };
}

export function decisionOsContinuityTrendState(input: {
  metrics?: DecisionOsContinuityMetrics | null;
  messages?: AfpMessage[] | null;
  watcherSignals?: WatcherSignal[] | null;
}): DecisionOsContinuityTrendState {
  const snapshotSamples = snapshotMetricSamples(input.messages);
  const metrics =
    input.metrics
    ?? continuityMetricsFromMessages(input.messages)
    ?? metricsFromWatcherSignals(input.watcherSignals ?? []);
  const source = input.metrics || snapshotSamples.length > 0
    ? "state_snapshot"
    : metrics ? "watcher_signals" : "none";
  const calibration = calibrationState({
    source,
    snapshotSampleCount: input.metrics ? Math.max(1, snapshotSamples.length) : snapshotSamples.length,
  });
  const reviewSamples = snapshotSamples.length > 0
    ? snapshotSamples
    : input.metrics ? [input.metrics] : [];
  const review = calibrationReview({ source, samples: reviewSamples });
  const effectiveCalibration = source === "state_snapshot"
    && review.sampleCount >= 5
    && review.volatility === "insufficient"
    && review.note
    ? {
      calibrationStatus: "insufficient_history" as const,
      calibrationText: review.note,
    }
    : calibration;
  const bars = metrics
    ? (["urgency_acceleration", "unresolved_queue_pressure", "follow_up_drift_score"] as const)
      .map((key) => trendBar(key, metrics[key]))
      .filter((bar) => bar.percent > 0)
    : [];
  const recentCount = metrics?.recent_signal_count ?? input.watcherSignals?.length ?? 0;
  return {
    bars,
    summaryText: bars.length > 0
      ? `${recentCount} continuity signal${recentCount === 1 ? "" : "s"} shaping this queue.`
      : null,
    ...effectiveCalibration,
    calibrationReview: review,
    source,
    hasTrend: bars.length > 0,
  };
}
