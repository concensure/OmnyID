// @locs-version: 2.0
import type { OperatorUsersResponse } from "@/lib/api";
import type { AdminWeddingOpsOracleMetrics } from "@/lib/adminWeddingOpsState";

export type AdminWeddingOpsBackendMetricsReadinessState = {
  status: "ready" | "partial" | "blocked";
  productionReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
  nextActionLabels: string[];
};

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function durableProofRef(value: unknown): string {
  const ref = clean(value);
  if (!ref) return "";
  if (/^(receipt|local|draft|display):/i.test(ref)) return "";
  if (/^(file|blob|data):/i.test(ref)) return "";
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|::1)(?::|\/|$)/i.test(ref)) return "";
  return ref;
}

function normalizedAge(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}

export function buildAdminWeddingOpsBackendMetricsReadinessState(args: {
  operatorUsers?: OperatorUsersResponse | null;
  oracleMetrics?: AdminWeddingOpsOracleMetrics | null;
  freshnessPolicy?: "optional" | "required" | null;
} = {}): AdminWeddingOpsBackendMetricsReadinessState {
  const exactUserCountReady = typeof args.operatorUsers?.total_users === "number"
    && Number.isFinite(args.operatorUsers.total_users);
  const diskReady = hasText(args.oracleMetrics?.diskUsedLabel) && hasText(args.oracleMetrics?.diskTotalLabel);
  const ramReady = hasText(args.oracleMetrics?.ramUsedLabel) && hasText(args.oracleMetrics?.ramTotalLabel);
  const sourceReady = hasText(args.oracleMetrics?.sourceLabel);
  const freshnessRequired = args.freshnessPolicy === "required";
  const metricAgeMinutes = normalizedAge(args.oracleMetrics?.metricAgeMinutes);
  const maxMetricAgeMinutes = Math.max(1, normalizedAge(args.oracleMetrics?.maxMetricAgeMinutes) ?? 15);
  const ageKnown = metricAgeMinutes != null;
  const rawProofRef = clean(args.oracleMetrics?.proofRef);
  const proofRef = durableProofRef(rawProofRef);
  const freshReady = !freshnessRequired || (ageKnown && metricAgeMinutes <= maxMetricAgeMinutes);
  const proofReady = !freshnessRequired || hasText(proofRef);
  const collectedAtReady = !freshnessRequired || hasText(args.oracleMetrics?.collectedAtLabel);
  const strictMetricChecks = freshnessRequired || ageKnown || hasText(args.oracleMetrics?.proofRef) || hasText(args.oracleMetrics?.collectedAtLabel)
    ? [
      {
        ready: freshReady,
        evidence: `Oracle metrics freshness proof mounted (${metricAgeMinutes ?? "unknown"}m)`,
        blocker: ageKnown
          ? `Oracle metrics are stale: ${metricAgeMinutes}m old, max ${maxMetricAgeMinutes}m.`
          : "Oracle metrics freshness age is not mounted.",
      },
      {
        ready: proofReady,
        evidence: `Oracle metrics proof reference mounted: ${proofRef}`,
        blocker: rawProofRef
          ? "Oracle metrics proof reference must be a durable audit ID or remote proof link, not a local receipt, localhost URL, or browser-only file reference."
          : "Oracle metrics proof reference is not mounted.",
      },
      {
        ready: collectedAtReady,
        evidence: `Oracle metrics collected-at label mounted: ${clean(args.oracleMetrics?.collectedAtLabel)}`,
        blocker: "Oracle metrics collected-at label is not mounted.",
      },
    ]
    : [];
  const checks = [
    {
      ready: exactUserCountReady,
      evidence: "Exact signed-up user count mounted",
      blocker: "Exact signed-up user count endpoint is not mounted.",
    },
    {
      ready: diskReady,
      evidence: "Oracle disk usage metric mounted",
      blocker: "Oracle disk used/total metric is not mounted.",
    },
    {
      ready: ramReady,
      evidence: "Oracle RAM usage metric mounted",
      blocker: "Oracle RAM used/total metric is not mounted.",
    },
    {
      ready: sourceReady,
      evidence: "Oracle metric source label mounted",
      blocker: "Oracle metric source label is not mounted.",
    },
    ...strictMetricChecks,
  ];
  const evidenceLabels = checks.filter((check) => check.ready).map((check) => check.evidence);
  const blockerLabels = checks.filter((check) => !check.ready).map((check) => check.blocker);
  const productionReady = blockerLabels.length === 0;

  return {
    status: productionReady ? "ready" : evidenceLabels.length > 0 ? "partial" : "blocked",
    productionReady,
    summary: productionReady
      ? "Admin wedding operations metrics are mounted from backend sources."
      : "Admin wedding operations metrics are not production-ready yet.",
    evidenceLabels,
    blockerLabels,
    nextActionLabels: blockerLabels.map((label) => {
      if (/user count/i.test(label)) return "Mount exact operator user-count endpoint.";
      if (/disk/i.test(label)) return "Mount Oracle disk used/total metric.";
      if (/RAM/i.test(label)) return "Mount Oracle RAM used/total metric.";
      if (/source label/i.test(label)) return "Mount Oracle metrics source label.";
      if (/freshness|stale/i.test(label)) return "Refresh Oracle metrics and expose metric age.";
      if (/proof reference/i.test(label)) return "Attach durable Oracle metrics proof reference.";
      if (/collected-at/i.test(label)) return "Expose Oracle metrics collected-at label.";
      return "Complete admin wedding ops backend metrics proof.";
    }),
  };
}
