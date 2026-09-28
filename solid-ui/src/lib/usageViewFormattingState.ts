// @locs-version: 1.0
function normalizeSummaryPart(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function joinUsageSummaryParts(parts: readonly (string | null | undefined)[]): string {
  return parts
    .map((part) => normalizeSummaryPart(part))
    .filter((part): part is string => part !== null)
    .join(" | ");
}

export function readRuntimeRemediationReceiptMetaLine(args: {
  action: string;
  issuedAtLabel: string | null | undefined;
}): string {
  return joinUsageSummaryParts([
    args.action.replaceAll("_", " "),
    args.issuedAtLabel,
  ]);
}

export function readRuntimeRemediationPressureLine(args: {
  pressureTotalRows: number | null | undefined;
  cleanupMode: string | null | undefined;
}): string {
  const pressureSummary = typeof args.pressureTotalRows === "number"
    ? `${args.pressureTotalRows.toLocaleString()} pressure rows`
    : "Pressure rows unavailable";
  const cleanupSummary = normalizeSummaryPart(args.cleanupMode)
    ? `Cleanup mode: ${args.cleanupMode!.trim()}`
    : null;
  return joinUsageSummaryParts([pressureSummary, cleanupSummary]);
}

export function readUsageEventSummaryLine(args: {
  quantityLabel: string;
  usageUnit: string | null | undefined;
  billingCategory: string | null | undefined;
  source: string | null | undefined;
}): string {
  return joinUsageSummaryParts([
    `${args.quantityLabel} ${String(args.usageUnit ?? "").trim()}`.trim(),
    args.billingCategory,
    args.source,
  ]);
}

export function readUsageQuantitySummaryLine(args: {
  quantityLabel: string;
  usageUnit: string | null | undefined;
}): string {
  return `${args.quantityLabel} ${String(args.usageUnit ?? "").trim()}`.trim();
}

export function readUsageCategorySummaryLine(args: {
  quantityLabel: string;
  usageUnit?: string | null | undefined;
  eventCount: number | null | undefined;
}): string {
  const quantitySummary = readUsageQuantitySummaryLine({
    quantityLabel: args.quantityLabel,
    usageUnit: args.usageUnit ?? "units",
  });
  const normalizedEventCount = Number(args.eventCount ?? 0);
  const eventCountLabel = Number.isFinite(normalizedEventCount) && normalizedEventCount >= 0
    ? `${normalizedEventCount.toFixed(0)} event${normalizedEventCount === 1 ? "" : "s"}`
    : null;
  return joinUsageSummaryParts([
    quantitySummary,
    eventCountLabel ? `across ${eventCountLabel}` : null,
  ]);
}

export function readArtifactSourceSummaryLine(args: {
  artifactUpdatedLabel: string | null | undefined;
  source: string | null | undefined;
}): string {
  return joinUsageSummaryParts([
    normalizeSummaryPart(args.artifactUpdatedLabel)
      ? `Artifact updated ${args.artifactUpdatedLabel!.trim()}.`
      : null,
    normalizeSummaryPart(args.source)
      ? `Source: ${args.source!.trim()}`
      : null,
  ]);
}
