// @locs-version: 1.0
type BillingOperationalGuidanceLike = {
  operational_guidance?: {
    status?: string | null;
    summary?: string | null;
    command?: string | null;
    source?: string | null;
    pressure_status?: string | null;
    pressure_total_rows?: number | null;
    cleanup_mode?: string | null;
    generated_at?: string | null;
  } | null;
} | null | undefined;

export type BillingOperationalGuidanceCardState = {
  title: string;
  detail: string;
  command?: string | null;
  source?: string | null;
  generatedAt?: string | null;
  tone: "warning" | "neutral";
};

function normalizeText(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function readBillingOperationalGuidanceCard(
  billing: BillingOperationalGuidanceLike,
): BillingOperationalGuidanceCardState | null {
  const guidance = billing?.operational_guidance;
  if (!guidance) return null;

  const summary = normalizeText(guidance.summary);
  const status = normalizeText(guidance.status)?.toLowerCase();
  const pressureStatus = normalizeText(guidance.pressure_status)?.replaceAll("_", " ");
  const pressureRows = normalizeCount(guidance.pressure_total_rows);
  const cleanupMode = normalizeText(guidance.cleanup_mode)?.replaceAll("_", " ");

  const details: string[] = [];
  if (summary) details.push(summary);
  if (pressureStatus && pressureRows !== null) {
    details.push(`${pressureStatus} (${pressureRows.toLocaleString()} rows)`);
  } else if (pressureStatus) {
    details.push(pressureStatus);
  }
  if (cleanupMode) {
    details.push(`Cleanup mode: ${cleanupMode}.`);
  }

  return {
    title: status === "no_go" ? "Operational cleanup required" : "Operational guidance active",
    detail: details.join(" "),
    command: normalizeText(guidance.command),
    source: normalizeText(guidance.source),
    generatedAt: normalizeText(guidance.generated_at),
    tone: status === "no_go" ? "warning" : "neutral",
  };
}
