// @locs-version: 1.0
import { weddingVendorRankingCardFieldsFromRecord } from "@/lib/weddingVendorRankingState";
import type { WeddingVendorAnchorRow, WeddingVendorAnchorRowStatus } from "@/lib/weddingVendorAnchorRowState";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function canonicalCategory(value: unknown): string {
  const key = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/\b(?:venue|reception|function room|event space)\b/.test(key)) return "venue";
  if (/\b(?:photographer|photography|photo)\b/.test(key)) return "photographer";
  if (/\b(?:videographer|videography|video)\b/.test(key)) return "videographer";
  if (/\b(?:celebrant|officiant)\b/.test(key)) return "celebrant";
  if (/\b(?:florist|floral|flowers)\b/.test(key)) return "florist";
  if (/\b(?:caterer|catering)\b/.test(key)) return "caterer";
  return key;
}

function cardCategory(record: Record<string, unknown>): string {
  const explicit = canonicalCategory(record.category);
  if (explicit) return explicit;
  const vendorId = clean(record.vendor_id);
  const prefix = canonicalCategory(vendorId.split("-")[0]);
  return ["venue", "photographer", "videographer", "celebrant", "florist", "caterer"].includes(prefix)
    ? prefix
    : "";
}

function anchorRows(value: unknown): WeddingVendorAnchorRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): WeddingVendorAnchorRow[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const status = clean(row.status);
    if (!clean(row.anchor) || !["met", "not_met", "unknown"].includes(status)) return [];
    return [{
      anchor: clean(row.anchor),
      status: status as WeddingVendorAnchorRowStatus,
      detail: clean(row.detail),
      componentId: clean(row.component_id),
      verifyQuestion: null,
    }];
  }).slice(0, 4);
}

function safeExternalUrl(value: unknown): string | null {
  const url = clean(value);
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/** Comparison-card imagery permits the licenced Unsplash CDN and the
 * authenticated first-party Google Places proxy. Links are handled separately. */
function unsplashImageUrl(value: unknown): string | null {
  const raw = clean(value);
  if (/^\/wedding\/assets\/(?:venue-photos|images)\/[a-z0-9][a-z0-9/._-]*\.(?:jpe?g|png|webp)$/i.test(raw)) return raw;
  if (/^\/wedding\/vendor-photo\/google\?name=places%2f[^&]+(?:&max_width_px=\d{1,4})?$/i.test(raw)) return raw;
  if (/^\/api\/wedding\/vendor-photos\/google\//i.test(raw)) return raw;
  if (/^\/api\/public\/wedding\/vendor\/photos\/[0-9a-hjkmnp-tv-z]{26}\/(?:full|medium|thumb)$/i.test(raw)) return raw;
  const url = safeExternalUrl(raw);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const isUnsplash = parsed.hostname.toLowerCase() === "images.unsplash.com";
    const isOmnyidVenueAsset = parsed.hostname.toLowerCase() === "omnyid.com"
      && /^\/wedding\/assets\/(?:venue-photos|images)\/[a-z0-9][a-z0-9/._-]*\.(?:jpe?g|png|webp)$/i.test(parsed.pathname)
      && !parsed.search
      && !parsed.hash;
    return isUnsplash || isOmnyidVenueAsset ? url : null;
  } catch {
    return null;
  }
}

/**
 * A persisted comparison can outlive the server-side source-classification
 * rules that produced it.  Keep category/list pages out of the actionable
 * vendor cards even when an old artifact is reopened.
 */
export function isActionableVendorComparisonCard(record: Record<string, unknown>): boolean {
  const title = clean(record.title).toLowerCase();
  const urls = [record.source_url, record.website_url].map(clean).join(" ").toLowerCase();
  const aggregateHost = /(?:^|[/:.])(tagvenue\.com|sydneymusic\.net|easyweddings\.com\.au|weddingwire\.|theknot\.com|wedshed\.com\.au|bridebook\.com|zola\.com)(?:[/:.]|$)/.test(urls);
  const aggregateIdentity = /^(?:venueguide(?:\.au)?|venue guide|easy weddings|easyweddings\.com\.au)$/i.test(title);
  const categoryOrListTitle = /(?:\b(?:best|top)\s+\d*\s*(?:wedding\s+)?(?:venues?|vendors?|suppliers?|celebrants?|bands?|djs?)\b|\blive\s+music\s+venues?\s+in\b|\b(?:venues?|vendors?|suppliers?|celebrants?)\s+(?:in|near)\b|\bcommunity\s+guide\b)/.test(title);
  return !aggregateIdentity && !(aggregateHost && categoryOrListTitle) && !/\b\d+\s+(?:best|top)\b/.test(title);
}

export function vendorComparisonHandoffForArtifact(
  metadata: Record<string, unknown>,
): WeddingWorkspaceArtifactPreview["vendorComparisonHandoff"] {
  const handoff = metadata.vendorComparisonHandoff;
  if (!handoff || typeof handoff !== "object" || Array.isArray(handoff)) return null;
  const record = handoff as Record<string, unknown>;
  const persistedRecommendation = clean(record.recommendationLabel);
  const cards = vendorComparisonCardsForArtifact(metadata);
  const genericRecommendation = /^start by reviewing\b.*\bthen select every vendor\b/i.test(persistedRecommendation)
    || /^compare the \d+ options? below\.?$/i.test(persistedRecommendation);
  const recommendationLabel = genericRecommendation
    ? practicalRecommendationLabel(cards)
    : persistedRecommendation;
  const whyLabels = stringArray(record.whyLabels).slice(0, 5);
  const confidenceLabel = clean(record.confidenceLabel);
  const nextActionLabel = clean(record.nextActionLabel);
  if (!recommendationLabel || whyLabels.length === 0 || !confidenceLabel) return null;
  return {
    recommendationLabel,
    whyLabels,
    confidenceLabel,
    nextActionLabel: nextActionLabel || "Select one or more vendors for approval-gated follow-up.",
  };
}

/** Replace an old action-only sentence with the ranking facts carried by the
 * saved cards. This is intentionally deterministic: opening a document does
 * not invent preference evidence or require a model call. */
function practicalRecommendationLabel(
  cards: readonly WeddingWorkspaceArtifactPreview["vendorComparisonCards"][number][],
): string {
  const first = cards[0];
  if (!first) return "Review the source-backed vendor evidence before choosing who to contact.";
  if (cards.length === 1) return "1 venue fits what you've told us so far; confirm the open questions before contacting them.";
  const metAnchor = first.anchorRows.find((row) => row.status === "met")?.anchor;
  return metAnchor
    ? `${first.title} is strongest on ${metAnchor}.`
    : first.checkedFactsCount > 0
      ? `${first.title} currently leads on ${first.checkedFactsCount} checked fact${first.checkedFactsCount === 1 ? "" : "s"}; compare the open questions before outreach.`
      : `${first.title} currently ranks first on the saved source evidence; compare its open questions before outreach.`;
}

export function vendorComparisonCardsForArtifact(
  metadata: Record<string, unknown>,
): WeddingWorkspaceArtifactPreview["vendorComparisonCards"] {
  const rawCards = Array.isArray(metadata.topChoiceCards) ? metadata.topChoiceCards : [];
  const requestedCategories = new Set(stringArray(metadata.vendorCategories).map(canonicalCategory).filter(Boolean));
  return rawCards.flatMap((item): WeddingWorkspaceArtifactPreview["vendorComparisonCards"] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const knownCategory = cardCategory(record);
    if (requestedCategories.size > 0 && knownCategory && !requestedCategories.has(knownCategory)) return [];
    const title = clean(record.title);
    if (!title || !isActionableVendorComparisonCard(record)) return [];
    const rank = typeof record.rank === "number" && Number.isFinite(record.rank) ? record.rank : 0;
    return [{
      choiceId: clean(record.choice_id) || `${rank}:${title}`,
      rank,
      comparisonCount: typeof record.comparison_count === "number" && Number.isFinite(record.comparison_count)
        ? Math.max(1, Math.floor(record.comparison_count)) : 1,
      title,
      category: knownCategory || null,
      imageUrl: unsplashImageUrl(record.image_url),
      imageAlt: clean(record.image_alt) || `${title} venue image`,
      scoreLabel: clean(record.score_label) || "Ranked source-backed option",
      provider: clean(record.provider) || "Search",
      sourceUrl: safeExternalUrl(record.source_url),
      websiteUrl: safeExternalUrl(record.website_url),
      mapUrl: safeExternalUrl(record.map_url),
      instagramUrl: safeExternalUrl(record.instagram_url),
      email: clean(record.email) || null,
      phone: clean(record.phone) || null,
      address: clean(record.address) || null,
      rationaleLabels: stringArray(record.rationale_labels).slice(0, 5),
      preferenceMatch: clean(record.preference_match) || "Review manually",
      situationFit: clean(record.situation_fit) || "Fit requires source-page review.",
      verificationLabel: clean(record.verification_label) || "Confirm availability, inclusions, and quote before outreach.",
      checkedFactsCount: typeof record.checked_facts_count === "number" && Number.isFinite(record.checked_facts_count)
        ? Math.max(0, Math.floor(record.checked_facts_count)) : 0,
      anchorRows: anchorRows(record.anchor_rows),
      verifyQuestions: stringArray(record.verify_questions).slice(0, 3), facetLabels: stringArray(record.facet_labels).slice(0, 2), vendorFacetIds: stringArray(record.vendor_facet_ids).slice(0, 16), feedbackReasonIds: stringArray(record.feedback_reason_ids).slice(0, 5),
      worthKnowing: clean(record.worth_knowing) || null,
      fitWord: clean(record.fit_word) || null,
      ...weddingVendorRankingCardFieldsFromRecord(record),
    }];
  }).sort((left, right) => left.rank - right.rank).slice(0, 7);
}

export function a2uiContentForArtifact(metadata: Record<string, unknown>): Record<string, unknown> | null {
  const raw = metadata.a2ui;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const rawNodes = Array.isArray(record.nodes) ? record.nodes : Array.isArray(record.components) ? record.components : [];
  const nodes = rawNodes.flatMap((item, index): Record<string, unknown>[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const component = item as Record<string, unknown>;
    const type = clean(component.type);
    if (!type) return [];
    const props = component.props && typeof component.props === "object" && !Array.isArray(component.props)
      ? component.props as Record<string, unknown>
      : {};
    return [{ id: clean(component.id) || `${type}-${index + 1}`, type, props }];
  });
  if (nodes.length === 0) return null;
  return {
    schema_version: clean(record.schema_version) || "a2ui.v1",
    kind: clean(record.kind) || "panel",
    title: clean(record.title),
    description: clean(record.description),
    layout: record.layout && typeof record.layout === "object" && !Array.isArray(record.layout)
      ? record.layout
      : { type: "stack", gap: "md" },
    nodes,
  };
}
