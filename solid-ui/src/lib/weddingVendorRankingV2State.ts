// @locs-version: 1.0
export const WEDDING_VENDOR_RANKING_POLICY_VERSION = "2" as const;
export const WEDDING_VENDOR_RANKING_POLICY_V2_FLAG = "WEDDING_VENDOR_RANKING_POLICY_V2" as const;
export type WeddingVendorV2Component = { weight: number; value: number | null; confidence: number; prior?: number; sentimentReviewCount?: number };
function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }

export function weddingVendorRankingPolicyV2Enabled(env: Record<string, unknown> = {}): boolean {
  const value = env[WEDDING_VENDOR_RANKING_POLICY_V2_FLAG];
  return value === true || (typeof value === "string" && ["1", "true", "on", "yes"].includes(value.toLowerCase()));
}
export function weddingVendorPriorShrunkFit(components: readonly WeddingVendorV2Component[]): number | null {
  const weight = components.reduce((sum, component) => sum + Math.max(0, component.weight), 0);
  if (weight <= 0) return null;
  const utility = components.reduce((sum, component) => {
    const confidence = clamp(component.value === null ? 0 : component.confidence);
    return sum + component.weight * (confidence * (component.value ?? 0.5) + (1 - confidence) * (component.prior ?? 0.5));
  }, 0);
  return Math.round(100 * utility / weight);
}
const STYLE_GROUPS = [
  ["waterfront", "harbour", "beach", "coastal"], ["rustic", "barn", "farm"],
  ["garden", "botanical", "park"], ["modern", "industrial", "warehouse"],
  ["heritage", "historic", "sandstone"],
];
export function weddingVendorExpandedStyleTokens(values: readonly string[]): string[] {
  const normalized = new Set(values.flatMap((value) => value.toLowerCase().match(/[a-z0-9]+/g) ?? []));
  for (const group of STYLE_GROUPS) if (group.some((token) => normalized.has(token))) group.forEach((token) => normalized.add(token));
  return [...normalized].sort();
}
export function weddingVendorStyleUtility(input: { preferences: readonly string[]; styleTags?: readonly string[] | null; editorialSummary?: string | null; snippet?: string | null }) {
  const preferences = weddingVendorExpandedStyleTokens(input.preferences);
  const structured = [...(input.styleTags ?? []), input.editorialSummary ?? ""].join(" ").trim();
  if (!structured) return { value: null, confidence: 0, matched: [] as string[] };
  const evidence = new Set(weddingVendorExpandedStyleTokens(structured.split(/\s+/)));
  const matched = preferences.filter((token) => evidence.has(token));
  return { value: preferences.length ? matched.length / preferences.length : null, confidence: input.styleTags?.length ? 0.8 : 0.6, matched };
}
export function weddingVendorConfidenceV2(input: { coverage: number; authority: number; recency: number; sentimentReviewCount?: number | null; decisiveConflict?: boolean }) {
  const sampleFactor = input.sentimentReviewCount === null || input.sentimentReviewCount === undefined ? 1 : input.sentimentReviewCount / (input.sentimentReviewCount + 50);
  const agreementFactor = input.decisiveConflict ? 0.8 : 1;
  const confidence = clamp(input.coverage) * clamp(input.authority) * clamp(input.recency) * sampleFactor * agreementFactor;
  return { confidence, sampleFactor, agreementFactor, conflictLabel: input.decisiveConflict ? "Sources disagree" : null };
}
