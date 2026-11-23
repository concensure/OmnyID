// @locs-version: 1.0
function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePositiveInteger(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : null;
}

export function readExternalToolSettlementLabel(value: string | null | undefined): string {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.replaceAll("_", " ") : "not settled";
}

export function readExternalToolMeasurementLabel(value: string | null | undefined): string {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.replaceAll("_", " ") : "estimated usage";
}

export function readExternalToolEstimateDetail(args: {
  coverageSummary: string | null | undefined;
  currentMonthStartLabel: string | null | undefined;
}): string {
  const summary = normalizeOptionalText(args.coverageSummary);
  if (summary) return summary;
  if (normalizeOptionalText(args.currentMonthStartLabel)) {
    return `Estimated usage cost since ${args.currentMonthStartLabel!.trim()}. This is not yet invoice-grade billing.`;
  }
  return "Estimated usage cost only. This is not yet invoice-grade billing.";
}

export function readExternalToolRetentionDetail(args: {
  maxEventAgeDays: number | null | undefined;
  maxEventRowsPerUser: number | null | undefined;
}): string {
  const maxAgeDays = normalizePositiveInteger(args.maxEventAgeDays);
  const maxRows = normalizePositiveInteger(args.maxEventRowsPerUser);
  if (maxAgeDays !== null && maxRows !== null) {
    return `Rolling retention keeps about the most recent ${maxRows.toLocaleString()} events per user and prunes events older than ${maxAgeDays} days.`;
  }
  if (maxAgeDays !== null) {
    return `Rolling retention prunes usage events older than ${maxAgeDays} days.`;
  }
  if (maxRows !== null) {
    return `Rolling retention keeps about the most recent ${maxRows.toLocaleString()} events per user.`;
  }
  return "Usage-event history is retained on a rolling basis rather than forever.";
}

export function readExternalToolCostTrustPanelModel(args: {
  estimateDetail: string;
  guidanceCoverage: readonly string[];
  guidanceCaveats: readonly string[];
  externalCoverageCaveats: readonly string[] | null | undefined;
}): {
  heading: string;
  detail: string;
  coverageTitle: string;
  coverageItems: string[];
  caveatsTitle: string;
  caveatItems: string[];
} {
  return {
    heading: "How to read these numbers",
    detail: args.estimateDetail,
    coverageTitle: "What is covered",
    coverageItems: args.guidanceCoverage.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0),
    caveatsTitle: "What may still lag",
    caveatItems: [
      ...args.guidanceCaveats,
      ...(args.externalCoverageCaveats ?? []),
    ].map((entry) => String(entry).trim()).filter((entry) => entry.length > 0),
  };
}
