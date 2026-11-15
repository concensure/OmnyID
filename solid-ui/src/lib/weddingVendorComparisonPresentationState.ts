// @locs-version: 2.0
// Presentation of a ranked vendor comparison: cards, action rows, A2UI panel, handoff and markdown.
// The ranking itself lives in weddingVendorRankingState.ts; nothing here scores or reorders vendors.
import type {
  WeddingVendorNextAction,
  WeddingVendorRankedCandidate,
  WeddingVendorRankingResult,
} from "@/lib/weddingVendorRankingState";
import {
  weddingVendorRoomCardRowsToRecords,
  weddingVendorRoomsComparisonLabel,
} from "@/lib/weddingVendorRoomState";
import { weddingVendorShortlistMedia } from "@/lib/weddingVendorShortlistPolicyState";
import { weddingVendorAnchorRows, weddingVendorVerifyQuestions } from "@/lib/weddingVendorAnchorRowState";
import { weddingFacetById } from "@/lib/weddingFacetVocabularyState";
import { phoneTelHref } from "@/lib/phoneTelHref";

export type WeddingVendorComparisonContext = {
  preferences?: string | null;
  location?: string | null;
  atmosphereDescription?: string | null;
  budgetComfort?: string | null;
  inspirationImageUrls?: readonly string[] | null;
  topPriorities?: readonly string[] | null;
  vendorCategories?: readonly string[] | null;
  guestCount?: string | null;
};

export const COMPARISON_RANKING_SUMMARY =
  "Ranked by hard constraints first, then fit; confidence is shown separately. Unknown facts are never treated as negatives. Not a booking or endorsement.";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function usableSourceUrl(source: { url?: string | null }): boolean {
  const value = clean(source.url);
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname !== "localhost"
      && hostname !== "127.0.0.1"
      && hostname !== "0.0.0.0"
      && hostname !== "::1"
      && hostname !== "[::1]";
  } catch {
    return false;
  }
}

export function sourceUrlLinks(
  source: { title?: string | null; url?: string | null; website_url?: string | null; map_url?: string | null; instagram_url?: string | null },
  labelPrefix = "",
): Array<{ label: string; url: string }> {
  const title = clean(source.title) || "Vendor source";
  const entries = [
    { label: `${labelPrefix}${title}`, url: clean(source.url) },
    { label: `${labelPrefix}${title} website`, url: clean(source.website_url) },
    { label: `${labelPrefix}${title} Instagram`, url: clean(source.instagram_url) },
    { label: `${labelPrefix}${title} map/reviews`, url: clean(source.map_url) },
  ];
  const seen = new Set<string>();
  return entries.flatMap((entry) => {
    if (!usableSourceUrl({ url: entry.url })) return [];
    const key = entry.url.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [entry];
  });
}

function uniqueStrings(values: readonly unknown[], limit = 24): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function matchedPriorityAnchor(choice: WeddingVendorRankedCandidate, priorities: readonly string[] | null | undefined): string | null {
  const matched = new Set(choice.matchedPreferenceTokens.map((token) => token.toLowerCase()));
  return (priorities ?? []).map(clean).find((priority) =>
    priority.toLowerCase().split(/[^a-z0-9]+/).some((token) => token.length >= 4 && matched.has(token)),
  ) ?? null;
}

export function scoreLabelFor(choice: WeddingVendorRankedCandidate): string {
  return `${choice.fitLabel} · ${choice.confidenceLabel}`;
}

export function weddingVendorFacetLabels(choice: WeddingVendorRankedCandidate): string[] {
  const requested = new Set(choice.profileFacetIds ?? []);
  const requestedDimensions = new Set([...requested].map((id) => weddingFacetById(id)?.dimension).filter((value): value is string => Boolean(value)));
  const related = (choice.vendorFacets ?? []).filter((facet) => requested.has(facet.facetId) || requestedDimensions.has(weddingFacetById(facet.facetId)?.dimension ?? ""));
  const fallback = related.length > 0 ? related : (choice.vendorFacets ?? []).filter((facet) => weddingFacetById(facet.facetId)?.dimension === "setting");
  return fallback.sort((left, right) => right.confidence - left.confidence || left.facetId.localeCompare(right.facetId)).slice(0, 2).flatMap((facet) => weddingFacetById(facet.facetId)?.label ?? []);
}

export function weddingVendorFitWord(choice: WeddingVendorRankedCandidate): string {
  const confirmedCriteria = choice.components.filter((component) => component.known && component.confidence >= 0.7 && component.value >= 0.6).length;
  const availabilityVerified = ["confirmed_available", "temporary_hold"].includes(choice.availabilityState);
  if (availabilityVerified && choice.unknownHardConstraints.length === 0 && confirmedCriteria >= 2) return "Verified match";
  if (choice.fit !== null && choice.fit >= 70 && confirmedCriteria >= 2 && choice.confidenceBucket !== "low") return "Strong match";
  if ((choice.fit !== null && choice.fit >= 45) || confirmedCriteria > 0 || choice.matchedPreferenceTokens.length > 0) return "Potential match";
  return "Suggested option";
}

export function weddingVendorWorthKnowing(choice: WeddingVendorRankedCandidate): string | null {
  const con = choice.reasons?.filter((reason) => reason.polarity === "con" && reason.evidence.length > 0).sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id))[0];
  if (con) return con.claim;
  return null;
}

export function vendorChoiceActionRows(choices: readonly WeddingVendorRankedCandidate[]): Array<Record<string, unknown>> {
  return choices.map((choice) => {
    const actions: Array<Record<string, unknown>> = [
      {
        kind: "select_vendor_for_follow_up",
        label: `Select ${choice.title}`,
        enabled: true,
        requires_user_confirmation: true,
        selection_value: choice.id,
      },
    ];
    const addLinkAction = (kind: string, label: string, href: string | null) => {
      const url = clean(href);
      if (!url || !usableSourceUrl({ url })) return;
      if (actions.some((action) => clean(action.href).toLowerCase() === url.toLowerCase())) return;
      actions.push({ kind, label, enabled: true, href: url, external: true });
    };
    addLinkAction("open_vendor_website", "Open website", choice.websiteUrl);
    addLinkAction("open_vendor_map", "Open map/reviews", choice.mapUrl);
    addLinkAction("open_vendor_source", "Open source", choice.url);
    actions.push({
      kind: "prepare_approval_gated_outreach",
      label: choice.group === "verify" ? "Prepare enquiry" : "Review enquiry",
      enabled: true,
      requires_user_confirmation: true,
      approval_required_before_outreach: true,
      no_external_send_without_approval: true,
    });
    return {
      choice_id: choice.id,
      rank: choice.rank,
      vendor_label: choice.title,
      source_url: choice.url,
      website_url: choice.websiteUrl,
      map_url: choice.mapUrl,
      address: choice.address,
      phone: choice.phone,
      email: choice.email,
      instagram_url: choice.instagramUrl,
      source_provider: choice.provider,
      actions,
    };
  });
}

export function vendorChoiceCards(
  choices: readonly WeddingVendorRankedCandidate[],
  weddingPlanId: string | null = null,
  context: Pick<WeddingVendorComparisonContext, "preferences" | "atmosphereDescription" | "topPriorities" | "location" | "budgetComfort"> & { guestCount?: string | null } = {},
): Array<Record<string, unknown>> {
  return choices.map((choice) => {
    const media = weddingVendorShortlistMedia({ vendorName: choice.title, imageUrl: choice.imageUrl });
    const anchorRows = weddingVendorAnchorRows(choice, context);
    const verifyQuestions = weddingVendorVerifyQuestions(anchorRows, choice.reasons ? [] : choice.unknownHardConstraints);
    const preferenceText = [context.preferences, context.atmosphereDescription, ...(context.topPriorities ?? [])].map(clean).join(" ");
    const feedbackReasonIds = [
      /\b(?:intimate|small|micro|boutique)\b/i.test(preferenceText) ? "too_big" : null,
      preferenceText ? "not_our_style" : null,
      clean(context.location) ? "too_far" : null,
      clean(context.budgetComfort) ? "too_expensive" : null,
      "other",
    ].filter((reason): reason is string => Boolean(reason));
    return {
    choice_id: choice.id,
    rank: choice.rank,
    comparison_count: choices.length,
    title: choice.title,
    category: choice.category,
    image_url: media.url,
    image_alt: media.alt,
    media_kind: media.kind,
    media_label: media.label,
    provider: choice.provider,
    source_url: choice.url,
    website_url: choice.websiteUrl,
    map_url: choice.mapUrl,
    address: choice.address,
    phone: choice.phone,
    email: choice.email,
    instagram_url: choice.instagramUrl,
    score: choice.score,
    score_label: scoreLabelFor(choice),
    checked_facts_count: choice.components.filter((component) => component.known).length,
    anchor_rows: anchorRows.map((row) => ({
      anchor: row.anchor,
      status: row.status,
      detail: row.detail,
      component_id: row.componentId,
    })),
    verify_questions: verifyQuestions,
    facet_labels: weddingVendorFacetLabels(choice),
    vendor_facet_ids: (choice.vendorFacets ?? []).map((facet) => facet.facetId).sort(),
    worth_knowing: weddingVendorWorthKnowing(choice),
    fit_word: weddingVendorFitWord(choice),
    reasons: choice.reasons,
    preference_match: choice.matchedPreferenceTokens.length > 0 ? `Matched: ${choice.matchedPreferenceTokens.slice(0, 4).join(", ")}` : "",
    situation_fit: "",
    rooms: weddingVendorRoomCardRowsToRecords(choice.rooms),
    rationale_labels: [...choice.riskFlags].slice(0, 5),
    verification_label: choice.verificationLabel,
    group: choice.group,
    availability_state: choice.availabilityState,
    availability_label: choice.availabilityLabel,
    confidence_label: choice.confidenceLabel,
    vendor_id: choice.vendorId,
    vendor_slug: choice.vendorSlug,
    wedding_plan_id: weddingPlanId,
    unknown_constraints: choice.unknownHardConstraints,
    feedback_reason_ids: feedbackReasonIds,
    };
  });
}

export function vendorChoiceContactDetails(choice: WeddingVendorRankedCandidate): Record<string, unknown> {
  return {
    choice_id: choice.id,
    vendor_label: choice.title,
    website_url: choice.websiteUrl,
    map_url: choice.mapUrl,
    instagram_url: choice.instagramUrl,
    email: choice.email,
    phone: choice.phone,
    address: choice.address,
    source_url: choice.url,
    source_provider: choice.provider,
  };
}

export function contactSummaryLabel(choice: WeddingVendorRankedCandidate): string {
  const labels = [
    choice.websiteUrl ? "website" : null,
    choice.instagramUrl ? "Instagram" : null,
    choice.email ? "email" : null,
    choice.phone ? "phone" : null,
    choice.address ? "address" : null,
    choice.mapUrl ? "map" : null,
  ].filter(Boolean);
  return labels.length > 0 ? labels.join(", ") : "Open source to verify contact details";
}

function contactSummaryMarkdown(choice: WeddingVendorRankedCandidate): string {
  const links = [
    choice.websiteUrl && usableSourceUrl({ url: choice.websiteUrl }) ? `[website](${choice.websiteUrl})` : null,
    choice.instagramUrl && usableSourceUrl({ url: choice.instagramUrl }) ? `[Instagram](${choice.instagramUrl})` : null,
    choice.email ? `[email](mailto:${choice.email}?subject=${encodeURIComponent(`Wedding enquiry for ${choice.title}`)})` : null,
    choice.phone && phoneTelHref(choice.phone) ? `[phone](${phoneTelHref(choice.phone)})` : null,
    choice.address ? `[address](https://www.openstreetmap.org/search?query=${encodeURIComponent(choice.address)})` : null,
    choice.mapUrl && usableSourceUrl({ url: choice.mapUrl }) ? `[map](${choice.mapUrl})` : null,
  ].filter((value): value is string => Boolean(value));
  return links.length > 0 ? links.join(", ") : "No contact details found";
}

function compactPreferenceSignalLabel(signals: readonly string[]): string | null {
  const labels = signals
    .map((signal) => {
      const [label, ...rest] = clean(signal).split(":");
      const detail = clean(rest.join(":"));
      if (!label || !detail) return clean(signal);
      const boundedDetail = detail.length > 36 ? `${detail.slice(0, 33).trim()}...` : detail;
      return `${label}: ${boundedDetail}`;
    })
    .filter(Boolean)
    .slice(0, 3);
  return labels.length > 0 ? `Intake signals used: ${labels.join("; ")}` : null;
}

export function a2uiForComparison(
  choices: readonly WeddingVendorRankedCandidate[],
  summary: string,
  weddingPlanId: string | null = null,
  context: Pick<WeddingVendorComparisonContext, "topPriorities" | "location" | "budgetComfort" | "guestCount"> = {},
): Record<string, unknown> {
  const columns = choices.map((choice) => `#${choice.rank} ${choice.title}`);
  const cards = vendorChoiceCards(choices, weddingPlanId, context);
  const anchorRows = choices.flatMap((choice) => weddingVendorAnchorRows(choice, context));
  const anchors = [...new Set(anchorRows.map((row) => row.anchor))];
  return {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: "Top vendor comparison",
    description: summary,
    components: [
      {
        type: "vendor_recommendation_cards",
        props: {
          title: choices.length === 3 ? "Recommended top three" : "Suitable vendors found so far",
          cards,
        },
      },
      {
        type: "comparison_table",
        props: {
          title: choices.length === 3 ? "Top three vendor choices" : "Suitable vendor choices found so far",
          description: summary,
          columns,
          rows: [
            { label: "Fit and confidence", values: choices.map((choice) => scoreLabelFor(choice)) },
            { label: "Availability", values: choices.map((choice) => choice.availabilityLabel) },
            ...anchors.map((anchor) => ({ label: anchor, values: choices.map((choice) => {
              const row = weddingVendorAnchorRows(choice, context).find((item) => item.anchor === anchor);
              return row ? `${row.status === "met" ? "✓" : row.status === "not_met" ? "✗" : "?"} ${row.detail}` : "? Not confirmed";
            }) })),
            { label: "Rooms and pricing", values: choices.map((choice) => weddingVendorRoomsComparisonLabel(choice.rooms)) },
            { label: "Contact details", values: choices.map((choice) => contactSummaryLabel(choice)) },
            { label: "Source", values: choices.map((choice) => choice.url) },
          ],
          selection: {
            mode: "multi",
            id_field: "choice_id",
            min_selected: 1,
            confirm_action: {
              kind: "confirm_vendor_choices",
              label: "Confirm selected vendors",
              requires_user_confirmation: true,
              approval_required_before_outreach: true,
            },
          },
        },
      },
    ],
  };
}

export function comparisonRecommendationHandoff(input: {
  choices: readonly WeddingVendorRankedCandidate[];
  result: WeddingVendorRankingResult;
  providerLabel?: string | null;
  preferenceSignals?: readonly string[] | null;
  location?: string | null;
  topPriorities?: readonly string[] | null;
  atmosphereDescription?: string | null;
}): Record<string, unknown> {
  const topChoice = input.choices[0] ?? null;
  const runnerUp = input.choices[1] ?? null;
  const preferenceBackedCount = input.choices.filter((choice) =>
    !/No direct preference keyword match/i.test(choice.preferenceMatchLabel)
  ).length;
  const costEvidenceCount = input.choices.filter((choice) =>
    choice.components.some((component) => component.id === "cost" && component.known)
  ).length;
  const { bookable, verify, excluded, booked } = input.result;
  const nextAction = input.result.nextActions[0] ?? null;
  const total = booked.length + bookable.length + verify.length;
  const styleAnchor = topChoice?.reasons?.find((reason) => reason.polarity === "pro" && reason.evidence.length > 0)?.anchor ?? (topChoice ? matchedPriorityAnchor(topChoice, input.topPriorities) : null);
  const topStyle = topChoice?.components.find((component) => component.id === "style");
  const topLocation = topChoice?.components.find((component) => component.id === "location");
  const strongestAnchor = topStyle?.known && topStyle.value >= 0.6 && styleAnchor
    ? styleAnchor
    : topLocation?.known && topLocation.value >= 0.6 && clean(input.location)
      ? clean(input.location)
      : null;
  const runnerAnchor = runnerUp?.reasons?.find((reason) => reason.polarity === "pro" && reason.evidence.length > 0)?.anchor ?? null;
  const checkedFactorCount = topChoice?.components.filter((component) => component.known).length ?? 0;
  const recommendationLabel = topChoice
    ? runnerUp
      ? strongestAnchor && runnerAnchor
        ? `${topChoice.title} fits ${strongestAnchor} best; ${runnerUp.title} is stronger on ${runnerAnchor}.`
        : `${topChoice.title} currently ranks first on ${checkedFactorCount} checked factor${checkedFactorCount === 1 ? "" : "s"}; compare its open questions with ${runnerUp.title}.`
      : `${total} venue fits what you've told us so far.`
    : "Review source-backed vendor options before outreach.";
  return {
    recommendationLabel,
    whyLabels: [
      `${total} source-backed vendor${total === 1 ? "" : "s"} found: ${booked.length} booked, ${bookable.length} bookable, ${verify.length} awaiting availability confirmation`,
      excluded.length > 0 ? `${excluded.length} excluded by a hard constraint or unavailability` : null,
      preferenceBackedCount > 0
        ? `${preferenceBackedCount} choice${preferenceBackedCount === 1 ? "" : "s"} matched stated preferences`
        : null,
      costEvidenceCount > 0
        ? `${costEvidenceCount} choice${costEvidenceCount === 1 ? "" : "s"} have price evidence to compare against budget`
        : null,
      compactPreferenceSignalLabel(input.preferenceSignals ?? []),
      clean(input.location) ? `Location context: ${clean(input.location)}` : null,
    ].filter(Boolean),
    confidenceLabel: topChoice ? `Confidence: ${topChoice.confidenceBucket}` : "Confidence: low",
    nextActionLabel: nextAction?.label ?? "Select one or more vendors for approval-gated follow-up.",
  };
}

function candidateTable(choices: readonly WeddingVendorRankedCandidate[]): string[] {
  return [
    "| Rank | Vendor | Fit | Availability | Why this surfaced | Contact details | Verify next | Source |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...choices.map((choice) => [
      `| ${choice.rank}`,
      choice.title,
      scoreLabelFor(choice),
      choice.availabilityLabel,
      [choice.priorityMatchLabel, ...choice.rationaleLabels.slice(0, 2)].join("; "),
      contactSummaryMarkdown(choice),
      choice.verificationLabel,
      choice.url,
    ].join(" | ") + " |"),
  ];
}

function nextActionLines(actions: readonly WeddingVendorNextAction[]): string[] {
  return actions.length > 0
    ? actions.map((action, index) => `${index + 1}. ${action.label} (${action.reason})`)
    : ["- No outstanding checks; select the vendors you want OmnyID to pursue."];
}

export function comparisonMarkdown(input: {
  context: WeddingVendorComparisonContext;
  result: WeddingVendorRankingResult;
  choices: readonly WeddingVendorRankedCandidate[];
}): string {
  const { context, result, choices } = input;
  const booked = choices.filter((choice) => choice.group === "booked");
  const bookable = choices.filter((choice) => choice.group === "bookable");
  const verify = choices.filter((choice) => choice.group === "verify");
  const topPriorities = context.topPriorities ?? [];
  const inspiration = context.inspirationImageUrls ?? [];
  const categories = context.vendorCategories ?? [];
  return [
    "# Top vendor comparison",
    "",
    COMPARISON_RANKING_SUMMARY,
    "",
    clean(context.preferences) ? `User preferences: ${clean(context.preferences)}` : null,
    clean(context.atmosphereDescription) ? `Desired atmosphere: ${clean(context.atmosphereDescription)}` : null,
    clean(context.location) ? `Planning location: ${clean(context.location)}` : null,
    clean(context.budgetComfort) ? `Budget comfort: ${clean(context.budgetComfort)}` : null,
    topPriorities.length > 0 ? `Top priorities: ${topPriorities.join(", ")}` : null,
    inspiration.length > 0 ? `Inspiration links: ${inspiration.join(", ")}` : null,
    categories.length > 0 ? `Vendor categories: ${categories.join(", ")}` : null,
    "",
    ...(booked.length > 0 ? ["## Booked", "", ...candidateTable(booked), ""] : []),
    "## Bookable candidates",
    "",
    ...(bookable.length > 0 ? candidateTable(bookable) : ["None confirmed available for your date yet."]),
    "",
    "## High-potential — availability needs confirmation",
    "",
    ...(verify.length > 0 ? candidateTable(verify) : ["No other candidates are waiting on availability."]),
    "",
    "## Excluded",
    "",
    ...(result.excluded.length > 0
      ? result.excluded.slice(0, 5).map((choice) => `- ${choice.title} (${choice.fitLabel}): ${choice.exclusionReason}`)
      : ["Nothing has been excluded."]),
    "",
    "## Suggested next actions",
    "",
    ...nextActionLines(result.nextActions),
    "",
    "## Guardrails",
    "",
    "- Treat this as a comparison starting point, not a recommendation to book.",
    "- Ask the user to tick preferred vendors before drafting outreach.",
    "- Reconfirm current pricing, date availability, inclusions, hidden fees, travel, overtime, cancellation, and deposit terms.",
  ].filter((line): line is string => line !== null).join("\n");
}

export function comparisonSummaryLabel(choices: readonly WeddingVendorRankedCandidate[], result: WeddingVendorRankingResult): string {
  const bookable = result.bookable.length + result.booked.length;
  const verify = result.verify.length;
  return `${choices.length} source-backed vendor choice${choices.length === 1 ? "" : "s"} ready: ${bookable} bookable, ${verify} awaiting availability confirmation.`;
}

export function comparisonSearchLabels(choices: readonly WeddingVendorRankedCandidate[], preferenceSignals: readonly string[]): string[] {
  return uniqueStrings([
    "vendor comparison",
    "top three vendors",
    "top vendor choices",
    "vendor shortlist",
    ...choices.flatMap((choice) => [choice.title, choice.preferenceMatchLabel, choice.situationFitLabel]),
    ...preferenceSignals,
  ]);
}
