// @locs-version: 1.0
// Pure utility-component calculations shared by the ranking orchestrator.  The
// dependency functions are injected so this module cannot acquire a runtime
// cycle back to the ranking policy orchestrator.
import type { WeddingVendorRankingSource, WeddingVendorUtilityComponent } from "@/lib/weddingVendorRankingState";

export type WeddingVendorRankingUtilityContext = {
  now: Date;
  guests: number | null;
  budget: number | null;
  standingReception: boolean;
  preferenceTokens: string[];
  locationTokens: string[];
};

export type WeddingVendorAttributeView = {
  present: boolean;
  value: unknown;
  confidence: number;
  authority: string | null;
  retrievedAt: string | null;
};

export type WeddingVendorUtilityDependencies = {
  attributeOf: (source: WeddingVendorRankingSource, key: string) => WeddingVendorAttributeView;
  budgetUtility: (price: number, budget: number) => number;
  qualityUtility: (rating: number, reviewCount: number) => { value: number; confidence: number };
};

const VENUE_WEIGHTS = { style: 0.25, cost: 0.2, location: 0.15, capacity: 0.12, quality: 0.13, planning: 0.08, risk: 0.07 };
const VENDOR_WEIGHTS = { style: 0.12, cost: 0.2, location: 0.15, capacity: 0, quality: 0.13, planning: 0, risk: 0.2 };
const PLANNING_INCLUSIONS = ["coordinator", "furniture", "linen", "av", "ceremony_setup", "wet_weather_setup", "catering"];
const AUTHORITY_FACTOR: Record<string, number> = { operator: 1, vendor_reply: 1, primary_official: 0.9, independent_aggregate: 0.8, directory: 0.5, editorial: 0.4, inferred: 0.3 };
const STALE_AFTER_MS = 365 * 24 * 60 * 60 * 1000;

function clean(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function finiteNumber(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }

function component(id: string, label: string, weight: number, evidence: { value: number; confidence: number; authority: string | null; retrievedAt?: string | null } | null): WeddingVendorUtilityComponent {
  return { id, label, weight, value: evidence?.value ?? 0, confidence: evidence?.confidence ?? 0, known: evidence !== null, authority: evidence?.authority ?? null, retrievedAt: evidence?.retrievedAt ?? null };
}

function textOf(source: WeddingVendorRankingSource, deps: WeddingVendorUtilityDependencies): string {
  const summary = deps.attributeOf(source, "editorial_summary");
  const styleTags = deps.attributeOf(source, "style_tags");
  return [source.title, source.snippet, typeof summary.value === "string" ? summary.value : "", Array.isArray(styleTags.value) ? styleTags.value.join(" ") : ""].join(" ").toLowerCase();
}

export function styleEvidence(source: WeddingVendorRankingSource, context: WeddingVendorRankingUtilityContext, deps: WeddingVendorUtilityDependencies) {
  if (context.preferenceTokens.length === 0) return { evidence: null, matched: [] as string[] };
  const text = textOf(source, deps);
  if (text.replace(/\s+/g, " ").trim().length < 20) return { evidence: null, matched: [] as string[] };
  const matched = context.preferenceTokens.filter((token) => text.includes(token));
  const tags = deps.attributeOf(source, "style_tags");
  const summary = deps.attributeOf(source, "editorial_summary");
  const structured = tags.present ? tags : summary;
  return { matched, evidence: { value: Math.min(1, matched.length / Math.min(context.preferenceTokens.length, 5)), confidence: structured.present ? structured.confidence : 0.5, authority: structured.present ? structured.authority : "directory", retrievedAt: structured.retrievedAt } };
}

export function costEvidence(source: WeddingVendorRankingSource, context: WeddingVendorRankingUtilityContext, deps: WeddingVendorUtilityDependencies) {
  if (context.budget === null) return null;
  const total = deps.attributeOf(source, "price_estimate_total_aud");
  const totalValue = finiteNumber(total.value);
  if (total.present && totalValue !== null) return total.confidence >= 0.5 ? { value: deps.budgetUtility(totalValue, context.budget), confidence: total.confidence, authority: total.authority, retrievedAt: total.retrievedAt } : null;
  const perHead = deps.attributeOf(source, "price_per_head_aud");
  const perHeadValue = finiteNumber(perHead.value);
  return perHead.present && perHeadValue !== null && context.guests !== null && perHead.confidence >= 0.5
    ? { value: deps.budgetUtility(perHeadValue * context.guests, context.budget), confidence: perHead.confidence * 0.8, authority: perHead.authority, retrievedAt: perHead.retrievedAt } : null;
}

export function locationEvidence(source: WeddingVendorRankingSource, context: WeddingVendorRankingUtilityContext, deps: WeddingVendorUtilityDependencies) {
  const address = clean(source.address);
  if (context.locationTokens.length === 0 || !address) return null;
  const matches = context.locationTokens.some((token) => `${address} ${textOf(source, deps)}`.toLowerCase().includes(token));
  return { value: matches ? 1 : 0.3, confidence: 0.8, authority: /google/i.test(source.provider) ? "independent_aggregate" : "directory", retrievedAt: null };
}

export function capacityEvidence(source: WeddingVendorRankingSource, context: WeddingVendorRankingUtilityContext, deps: WeddingVendorUtilityDependencies) {
  if (context.guests === null) return null;
  const capacity = deps.attributeOf(source, context.standingReception ? "capacity_standing_max" : "capacity_seated_max");
  const capacityValue = finiteNumber(capacity.value);
  if (!capacity.present || capacityValue === null || capacityValue <= 0) return null;
  const ratio = context.guests / capacityValue;
  return { value: ratio > 0.9 ? 0.6 : ratio < 0.33 ? 0.7 : 1, confidence: capacity.confidence, authority: capacity.authority, retrievedAt: capacity.retrievedAt };
}

export function qualityEvidence(source: WeddingVendorRankingSource, deps: WeddingVendorUtilityDependencies) {
  const rating = deps.attributeOf(source, "rating_google");
  const count = deps.attributeOf(source, "review_count_google");
  const ratingValue = finiteNumber(rating.value) ?? finiteNumber(source.rating);
  const countValue = finiteNumber(count.value) ?? finiteNumber(source.review_count);
  if (ratingValue === null || countValue === null) return null;
  return { ...deps.qualityUtility(ratingValue, countValue), authority: rating.present ? rating.authority : "independent_aggregate", retrievedAt: rating.retrievedAt };
}

export function planningEvidence(source: WeddingVendorRankingSource, deps: WeddingVendorUtilityDependencies) {
  const inclusions = deps.attributeOf(source, "inclusions");
  if (!inclusions.present || !Array.isArray(inclusions.value)) return null;
  const present = inclusions.value.map((item) => clean(item).toLowerCase().replace(/[\s-]+/g, "_"));
  const covered = PLANNING_INCLUSIONS.filter((item) => present.some((entry) => entry.includes(item))).length;
  return { value: covered / PLANNING_INCLUSIONS.length, confidence: inclusions.confidence, authority: inclusions.authority, retrievedAt: inclusions.retrievedAt };
}

export function riskEvidence(source: WeddingVendorRankingSource, deps: WeddingVendorUtilityDependencies) {
  const views = ["public_liability_insurance", "contract_provided", "backup_shooter", "equipment_redundancy"].map((key) => deps.attributeOf(source, key)).filter((view) => view.present && typeof view.value === "boolean");
  const scores: number[] = views.map((view) => view.value === true ? 1 : 0);
  const response = deps.attributeOf(source, "response_time_hours");
  const hours = finiteNumber(response.value);
  if (response.present && hours !== null) scores.push(hours <= 48 ? 1 : hours <= 96 ? 0.5 : 0);
  const all = [...views, ...(response.present && hours !== null ? [response] : [])];
  if (scores.length === 0) return null;
  return { value: scores.reduce((sum, score) => sum + score, 0) / scores.length, confidence: all.reduce((sum, view) => sum + view.confidence, 0) / all.length, authority: all[0]?.authority ?? null, retrievedAt: all[0]?.retrievedAt ?? null };
}

export function buildComponents(source: WeddingVendorRankingSource, venue: boolean, context: WeddingVendorRankingUtilityContext, deps: WeddingVendorUtilityDependencies) {
  const weights = venue ? VENUE_WEIGHTS : VENDOR_WEIGHTS;
  const style = styleEvidence(source, context, deps);
  return { components: [component("style", "Style and preferences", weights.style, style.evidence), component("cost", "Cost against budget", weights.cost, costEvidence(source, context, deps)), component("location", "Location", weights.location, locationEvidence(source, context, deps)), ...(venue ? [component("capacity", "Capacity comfort", weights.capacity, capacityEvidence(source, context, deps))] : []), component("quality", "Reviews and reputation", weights.quality, qualityEvidence(source, deps)), ...(venue ? [component("planning", "Planning burden", weights.planning, planningEvidence(source, deps))] : []), component("risk", "Execution risk", weights.risk, riskEvidence(source, deps))], matchedPreferenceTokens: style.matched };
}

export function computeFit(components: readonly WeddingVendorUtilityComponent[]): number | null {
  const known = components.filter((item) => item.known);
  const weight = known.reduce((sum, item) => sum + item.weight, 0);
  return known.length === 0 || weight <= 0 ? null : Math.round(100 * known.reduce((sum, item) => sum + item.weight * item.value, 0) / weight);
}

export function computeConfidence(components: readonly WeddingVendorUtilityComponent[], now: Date): number {
  const totalWeight = components.reduce((sum, item) => sum + item.weight, 0);
  const known = components.filter((item) => item.known);
  if (totalWeight <= 0 || known.length === 0) return 0;
  const coverage = known.reduce((sum, item) => sum + item.weight, 0) / totalWeight;
  const authority = known.reduce((sum, item) => sum + (AUTHORITY_FACTOR[item.authority ?? ""] ?? 0.5), 0) / known.length;
  const recency = known.reduce((sum, item) => { const at = item.retrievedAt ? Date.parse(item.retrievedAt.replace(" ", "T")) : NaN; return sum + (Number.isFinite(at) && now.getTime() - at > STALE_AFTER_MS ? 0.5 : 1); }, 0) / known.length;
  return coverage * authority * recency;
}
