// @locs-version: 1.0
export const WEDDING_VENDOR_QUALITY_MODEL_VERSION = "venue-quality-1" as const;
export type WeddingVenueQualityFactor = "location" | "condition" | "food" | "service" | "capacity" | "facilities" | "exclusivity";
export type WeddingVenueQualityEvidence = { score: number | null; authority?: number | null; recency?: number | null };
const BASE_WEIGHTS: Record<WeddingVenueQualityFactor, number> = {
  location: 0.22, condition: 0.14, food: 0.16, service: 0.18, capacity: 0.10, facilities: 0.08, exclusivity: 0.12,
};

function clamp(value: number, min = 0, max = 1): number { return Math.max(min, Math.min(max, value)); }
function practical(priorities: readonly string[]): boolean {
  return priorities.some((value) => /easy for guests|big guest list|accessible|good food|practical/i.test(value));
}
export function weddingVenueQualityWeights(priorities: readonly string[] = []): Record<WeddingVenueQualityFactor, number> {
  if (!practical(priorities)) return { ...BASE_WEIGHTS };
  return { ...BASE_WEIGHTS, location: 0.19, exclusivity: 0.09, capacity: 0.12, facilities: 0.10, food: 0.18 };
}
export function weddingVenueQualityScore(input: {
  factors: Record<WeddingVenueQualityFactor, WeddingVenueQualityEvidence>;
  priorities?: readonly string[];
}) {
  const weights = weddingVenueQualityWeights(input.priorities);
  let score = 0;
  let coveredWeight = 0;
  let weightedAuthority = 0;
  let weightedRecency = 0;
  for (const key of Object.keys(weights) as WeddingVenueQualityFactor[]) {
    const evidence = input.factors[key];
    const known = typeof evidence.score === "number" && Number.isFinite(evidence.score);
    const factorScore = known ? clamp(evidence.score as number, 1, 5) : 3;
    score += weights[key] * factorScore;
    if (known) {
      coveredWeight += weights[key];
      weightedAuthority += weights[key] * clamp(evidence.authority ?? 0.7);
      weightedRecency += weights[key] * clamp(evidence.recency ?? 0.8);
    }
  }
  const authority = coveredWeight ? weightedAuthority / coveredWeight : 0;
  const recency = coveredWeight ? weightedRecency / coveredWeight : 0;
  const confidence = clamp(coveredWeight * authority * recency);
  const stars = score >= 4.5 ? 5 : score >= 4 ? 4 : score >= 3.5 ? 3 : score >= 3 ? 2 : 1;
  return {
    score,
    confidence,
    stars: confidence >= 0.35 ? stars : null,
    label: confidence >= 0.35 ? `${stars}★ quality` : "Quality not yet assessed",
    weights,
    modelVersion: WEDDING_VENDOR_QUALITY_MODEL_VERSION,
  };
}

export function weddingVendorSentimentScore(platforms: readonly { rating: number; reviewCount: number }[]) {
  const valid = platforms.filter((item) => item.rating >= 1 && item.rating <= 5 && item.reviewCount > 0);
  const reviews = valid.reduce((sum, item) => sum + item.reviewCount, 0);
  const score = (valid.reduce((sum, item) => sum + item.reviewCount * item.rating, 0) + 100 * 4.3) / (reviews + 100);
  const ratings = valid.map((item) => item.rating);
  const disagreement = ratings.length >= 2 && Math.max(...ratings) - Math.min(...ratings) > 0.4;
  const confidence = reviews / (reviews + 50) * (disagreement ? 0.8 : 1);
  return { score, confidence, reviewCount: reviews, disagreement, label: reviews ? `${score.toFixed(1)} sentiment` : "Sentiment not yet assessed" };
}

export function weddingVendorValueScore(input: { quality: number; effectiveCostPerGuest: number; comparableCostsPerGuest: readonly number[] }) {
  const values = input.comparableCostsPerGuest.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (values.length < 5 || !(input.effectiveCostPerGuest > 0)) return { score: null, label: "Value unknown" as const };
  const middle = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  const score = input.quality / (input.effectiveCostPerGuest / median);
  return { score, label: score >= 4.5 ? "Strong value" as const : score >= 3.5 ? "Fair value" as const : "Premium" as const };
}

export function weddingVendorQualitySentimentCalibration(rows: readonly { id: string; quality: number; sentiment: number }[]) {
  const review = rows.filter((row) => Math.abs(row.quality - row.sentiment) >= 0.6);
  const n = rows.length;
  if (n < 2) return { correlation: null, review };
  const qMean = rows.reduce((sum, row) => sum + row.quality, 0) / n;
  const sMean = rows.reduce((sum, row) => sum + row.sentiment, 0) / n;
  const numerator = rows.reduce((sum, row) => sum + (row.quality - qMean) * (row.sentiment - sMean), 0);
  const qVariance = rows.reduce((sum, row) => sum + (row.quality - qMean) ** 2, 0);
  const sVariance = rows.reduce((sum, row) => sum + (row.sentiment - sMean) ** 2, 0);
  return { correlation: qVariance && sVariance ? numerator / Math.sqrt(qVariance * sVariance) : null, review };
}
