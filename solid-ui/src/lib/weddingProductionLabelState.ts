// @locs-version: 2.0
export const WEDDING_PRODUCTION_LABEL_MAX_LENGTH = 240;

export type WeddingProductionLabelCleanOptions = {
  maxLength?: number;
  wordAware?: boolean;
};

export function cleanWeddingProductionLabel(
  value: string | null | undefined,
  options: WeddingProductionLabelCleanOptions = {},
): string | null {
  const maxLength = options.maxLength ?? WEDDING_PRODUCTION_LABEL_MAX_LENGTH;
  const cleaned = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!cleaned) return null;
  if (cleaned.length <= maxLength) return cleaned;

  const limit = Math.max(0, maxLength - 3);
  const clipped = cleaned.slice(0, limit).trimEnd();
  if (!options.wordAware) return `${clipped}...`;

  const lastSpace = clipped.lastIndexOf(" ");
  const wordAwareClip = lastSpace >= Math.floor(limit * 0.6) ? clipped.slice(0, lastSpace) : clipped;
  return `${wordAwareClip}...`;
}

export function cleanWeddingProductionLabels(
  values: readonly (string | null | undefined)[],
  options: WeddingProductionLabelCleanOptions = {},
): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const value of values) {
    const label = cleanWeddingProductionLabel(value, options);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

export function joinWeddingProductionLabels(
  values: readonly (string | null | undefined)[],
  options: WeddingProductionLabelCleanOptions = {},
): string {
  return cleanWeddingProductionLabels(values, options).join(" ");
}

export function isWeakWeddingProductionProofReference(label: string): boolean {
  const trimmed = label.trim();
  return trimmed === "..."
    || /^(?:local|receipt|draft|display):/i.test(trimmed)
    || /(?:^|[:\s])(?:dry-run|example|fake|mock|placeholder|stub|test|local-only)(?:[-:\s]|$)/i.test(trimmed)
    || /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i.test(trimmed)
    || /^(?:file|data|blob):/i.test(trimmed);
}

export function durableWeddingProductionProofLabels(
  values: readonly (string | null | undefined)[] | null | undefined,
): string[] {
  return cleanWeddingProductionLabels(values ?? [])
    .filter((label) => !isWeakWeddingProductionProofReference(label));
}

export function hasDurableWeddingProductionProofLabel(
  values: readonly (string | null | undefined)[] | null | undefined,
): boolean {
  return durableWeddingProductionProofLabels(values).length > 0;
}
