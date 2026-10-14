// @locs-version: 1.0
import { weddingVendorRankingCardFieldsFromRecord } from "@/lib/weddingVendorRankingState";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
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
  if (/^\/wedding\/vendor-photo\/google\?name=places%2f[^&]+(?:&max_width_px=\d{1,4})?$/i.test(raw)) return raw;
  const url = safeExternalUrl(raw);
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase() === "images.unsplash.com" ? url : null;
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
  const recommendationLabel = clean(record.recommendationLabel);
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

export function vendorComparisonCardsForArtifact(
  metadata: Record<string, unknown>,
): WeddingWorkspaceArtifactPreview["vendorComparisonCards"] {
  const rawCards = Array.isArray(metadata.topChoiceCards) ? metadata.topChoiceCards : [];
  return rawCards.flatMap((item): WeddingWorkspaceArtifactPreview["vendorComparisonCards"] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const title = clean(record.title);
    if (!title || !isActionableVendorComparisonCard(record)) return [];
    const rank = typeof record.rank === "number" && Number.isFinite(record.rank) ? record.rank : 0;
    return [{
      choiceId: clean(record.choice_id) || `${rank}:${title}`,
      rank,
      title,
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
