// @locs-version: 2.0
import {
  normalizeWeddingArtifactSummary,
  type WeddingArtifactInput,
  type WeddingArtifactSummary,
} from "@/lib/weddingArtifactState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import type { WeddingDecisionProjectionInput } from "@/lib/weddingDecisionAfpProjectionState";
import type { WeddingVendorSearchExecutionState } from "@/lib/weddingVendorSearchExecutorState";
import {
  a2uiForComparison,
  comparisonMarkdown,
  comparisonRecommendationHandoff,
  comparisonSearchLabels,
  comparisonSummaryLabel,
  sourceUrlLinks,
  usableSourceUrl,
  vendorChoiceActionRows,
  vendorChoiceCards,
  vendorChoiceContactDetails,
} from "@/lib/weddingVendorComparisonPresentationState";
import {
  normalizeWeddingVendorSourceEvidence,
  rankWeddingVendorCandidates,
  type WeddingVendorRankedCandidate,
  type WeddingVendorRankingResult,
  type WeddingVendorRankingSource,
} from "@/lib/weddingVendorRankingState";
import {
  selectWeddingVendorShortlist,
  type WeddingVendorShortlistOutcome,
} from "@/lib/weddingVendorShortlistPolicyState";
import {
  WEDDING_VENDOR_PATTERN_VERSION,
  WEDDING_VENDOR_SELECTION_ACTIONS,
  WEDDING_VENDOR_SELECTION_PATTERN_ID,
  verifyWeddingDecisionPattern,
  weddingDecisionPattern,
  weddingDecisionPatternAllowsProjection,
} from "@/lib/weddingVendorDecisionPatternState";

export type WeddingVendorSearchArtifactState = {
  status: "created" | "not_created";
  reason: string | null;
  metadata: WeddingPlanningMetadata;
  artifactInput: WeddingArtifactInput | null;
  summary: WeddingArtifactSummary | null;
  markdown: string | null;
  sourceCount: number;
};

export type WeddingVendorComparisonArtifactState = {
  status: "created" | "not_created";
  reason: string | null;
  metadata: WeddingPlanningMetadata;
  artifactInput: WeddingArtifactInput | null;
  summary: WeddingArtifactSummary | null;
  markdown: string | null;
  topChoiceCount: number;
};

export type WeddingVendorSearchTaskItemsInput = {
  artifacts?: readonly WeddingArtifactInput[] | null;
  selectedDecisionItems?: readonly WeddingDecisionProjectionInput[] | null;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
  metadata?: unknown;
};

export type WeddingVendorComparisonInput = {
  metadata?: unknown;
  execution: WeddingVendorSearchExecutionState;
  preferences?: string | null;
  location?: string | null;
  dateOrSeason?: string | null;
  guestCount?: string | null;
  budgetComfort?: string | null;
  atmosphereDescription?: string | null;
  inspirationImageUrls?: readonly string[] | null;
  topPriorities?: readonly string[] | null;
  vendorCategories?: readonly string[] | null;
  targetCategory?: string | null;
  requireExactlyThree?: boolean;
  canRunOnlineFallback?: boolean;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

function decodeSnippetText(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripSnippetHtml(value: string): string {
  return decodeSnippetText(value).replace(/<\/?[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function vendorNameFromHighlightedSnippet(value: string): string | null {
  const decoded = decodeSnippetText(value);
  const match = decoded.match(/<strong>([^<]{3,90})<\/strong>/i);
  const candidate = stripSnippetHtml(match?.[1] ?? "");
  if (!candidate || /\b(?:best|top|venues?|locations?|packages?|pricing|request pricing)\b/i.test(candidate)) return null;
  return candidate;
}

function comparisonPreferenceSignals(input: WeddingVendorComparisonInput): string[] {
  return uniqueStrings([
    clean(input.preferences) ? `Preferences: ${clean(input.preferences)}` : null,
    clean(input.atmosphereDescription) ? `Atmosphere: ${clean(input.atmosphereDescription)}` : null,
    clean(input.budgetComfort) ? `Budget comfort: ${clean(input.budgetComfort)}` : null,
    ...(input.topPriorities ?? []).map((priority) => `Priority: ${priority}`),
    ...(input.inspirationImageUrls ?? []).map((url) => `Inspiration link: ${url}`),
  ], 12);
}

function artifactId(metadata: WeddingPlanningMetadata, execution: WeddingVendorSearchExecutionState): string {
  return [
    "wedding_artifact",
    "vendor_search_sources",
    safeWeddingLabel(metadata.responseWorkspaceId),
    safeWeddingLabel(execution.queries[0] ?? "search"),
  ].join(":");
}

function comparisonArtifactId(metadata: WeddingPlanningMetadata, execution: WeddingVendorSearchExecutionState): string {
  return [
    "wedding_artifact",
    "vendor_comparison_top3",
    safeWeddingLabel(metadata.responseWorkspaceId),
    safeWeddingLabel(execution.queries[0] ?? "comparison"),
  ].join(":");
}

function metadataStrings(execution: WeddingVendorSearchExecutionState, key: string): string[] {
  const value = execution.receiptMetadata[key];
  if (Array.isArray(value)) return uniqueStrings(value);
  return uniqueStrings([value]);
}

function metadataRecord(execution: WeddingVendorSearchExecutionState, key: string): Record<string, unknown> {
  const value = execution.receiptMetadata[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function artifactStrings(artifact: WeddingArtifactInput, key: string): string[] {
  const value = record(artifact.metadata)[key];
  if (Array.isArray(value)) return uniqueStrings(value);
  return uniqueStrings([value]);
}

function isVendorSearchArtifact(artifact: WeddingArtifactInput): boolean {
  const metadata = record(artifact.metadata);
  return artifact.kind === "vendor_table"
    && /vendor search source packet|vendor_search_executor|source-backed vendor-search|vendor shortlist|google_places|overpass|brave search|exa_search|exa search/i.test([
      clean(artifact.id),
      clean(artifact.title),
      clean(artifact.bodyText),
      clean(metadata.source),
      artifactStrings(artifact, "sourceProviderLabels").join(" "),
      artifactStrings(artifact, "providerKinds").join(" "),
    ].join("\n"));
}

function isVendorComparisonArtifact(artifact: WeddingArtifactInput): boolean {
  const metadata = record(artifact.metadata);
  return artifact.kind === "vendor_table"
    && /vendor_search_comparison|top vendor comparison|top three vendor choices|wedding_vendor_comparison/i.test([
      clean(artifact.id),
      clean(artifact.title),
      clean(artifact.bodyText),
      clean(metadata.source),
      clean(record(metadata.semantic_object).id),
      clean(record(metadata.semantic_object).kind),
    ].join("\n"));
}

function existingVendorSearchTaskKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const metadata = record(item.metadata);
    const actionId = clean(metadata.vendor_search_action_id);
    if (metadata.vendor_search_review_task === true && actionId) keys.add(actionId);
    if (metadata.vendor_comparison_decision_task === true && actionId) keys.add(actionId);
  }
  return keys;
}

function vendorSearchTask(
  metadata: WeddingPlanningMetadata,
  artifact: WeddingArtifactInput,
  actionId: string,
  title: string,
  kind: WeddingPlanningTaskItem["kind"],
  notes: string,
  priority: WeddingPlanningTaskItem["priority"],
  extraMetadata: Record<string, unknown> = {},
): WeddingPlanningTaskItem {
  const providerLabels = artifactStrings(artifact, "sourceProviderLabels");
  const providerKinds = artifactStrings(artifact, "providerKinds");
  const vendorCategories = artifactStrings(artifact, "vendorCategories");
  return {
    id: `wedding_vendor_search_task:${safeWeddingLabel(actionId)}:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    title,
    kind,
    priority,
    source: "agent",
    reviewStatus: "accepted",
    approvalState: "draft",
    metadata: {
      ...metadata,
      vendor_search_review_task: true,
      vendor_search_action_id: actionId,
      vendor_search_provider_labels: providerLabels,
      vendor_search_provider_kinds: providerKinds,
      vendor_search_categories: vendorCategories,
      source_verification_required: true,
      preparation_checklist: true,
      preparation_checklist_item: `vendor-search-${actionId}`,
      user_selectable: true,
      can_deselect_before_commit: true,
      second_order_loop: "vendor_evidence_freshness",
      second_order_task: true,
      second_order_evidence_labels: [
        "Source-backed vendor notes",
        "Pricing and availability are not booking evidence",
        "User must tick preferred vendors before narrowing",
      ],
      searchable_terms: [
        "vendor search",
        "vendor shortlist",
        "price freshness",
        "availability verification",
        "selected vendors",
        ...providerLabels,
        ...providerKinds,
        ...vendorCategories,
      ],
      ...extraMetadata,
    },
    linkedArtifactId: clean(artifact.id) || null,
    notes,
  };
}

function vendorComparisonTask(
  metadata: WeddingPlanningMetadata,
  artifact: WeddingArtifactInput,
): WeddingPlanningTaskItem {
  const artifactMetadata = record(artifact.metadata);
  const topChoiceLabels = uniqueStrings(Array.isArray(artifactMetadata.topChoiceLabels) ? artifactMetadata.topChoiceLabels : [], 6);
  const actionId = "choose-top-vendor-comparison";
  return vendorSearchTask(
    metadata,
    artifact,
    actionId,
    "Choose preferred vendors from the top-three comparison",
    "decision",
    [
      topChoiceLabels.length > 0
        ? `Review the ranked comparison for ${topChoiceLabels.slice(0, 3).join(", ")}.`
        : "Review the ranked top-three vendor comparison.",
      "Ask the user to tick one or more preferred vendors before narrowing reports or drafting outreach.",
      "Keep alternatives visible until the user confirms a preference.",
    ].join(" "),
    "high",
    {
      vendor_comparison_decision_task: true,
      vendor_comparison_top_choice_labels: topChoiceLabels,
      selected_decision_required: true,
      collapse_unselected_after_choice: true,
      approval_required_before_outreach: true,
      a2ui_primary_action: "open_vendor_comparison",
      wedding_workspace_menu: "documents",
      second_order_loop: "vendor_choice_narrowing",
      second_order_evidence_labels: [
        "Top-three source-backed vendor comparison",
        "User must choose before outreach",
        "Alternatives stay visible until confirmed",
      ],
    },
  );
}

function publicImageUrl(value: unknown): string | null {
  const url = clean(value);
  // Do not render arbitrary third-party image URLs in couple-facing cards. The
  // directory's verified-photo policy allows only the stable Unsplash host.
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.toLowerCase() === "images.unsplash.com"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function sourceHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function rankingSourcesFor(input: WeddingVendorComparisonInput): WeddingVendorRankingSource[] {
  const execution = input.execution;
  const seen = new Set<string>();
  return execution.sources.filter(usableSourceUrl).flatMap((source, index): WeddingVendorRankingSource[] => {
    const rawSnippet = clean(source.snippet);
    const title = vendorNameFromHighlightedSnippet(rawSnippet)
      || clean(source.title)
      || sourceHostname(clean(source.url))
      || `Vendor ${index + 1}`;
    const url = clean(source.url);
    const key = `${title.toLowerCase()}|${sourceHostname(url).toLowerCase()}`;
    if (!url || seen.has(key)) return [];
    seen.add(key);
    return [{
      ...normalizeWeddingVendorSourceEvidence(source as unknown as Record<string, unknown>),
      id: `vendor_choice:${safeWeddingLabel(title)}:${index + 1}`,
      title,
      provider: clean(source.provider) || clean(execution.providerLabel) || "Search",
      url,
      websiteUrl: clean(source.website_url) || null,
      mapUrl: clean(source.map_url) || null,
      imageUrl: publicImageUrl(source.photo_url),
      address: clean(source.address) || null,
      phone: clean(source.phone) || null,
      email: clean(source.email) || null,
      instagramUrl: clean(source.instagram_url) || null,
      snippet: stripSnippetHtml(rawSnippet),
    }];
  });
}

/** Cards and the table show what the couple can act on: booked, then bookable, then the best to verify. */
function rankedVendorChoices(input: WeddingVendorComparisonInput): {
  result: WeddingVendorRankingResult;
  choices: WeddingVendorRankedCandidate[];
  shortlist: WeddingVendorShortlistOutcome | null;
} {
  const result = rankWeddingVendorCandidates({
    sources: rankingSourcesFor(input),
    requirements: {
      guestCount: input.guestCount,
      budgetComfort: input.budgetComfort,
      dateOrSeason: input.dateOrSeason,
      location: input.location,
      preferences: input.preferences,
      topPriorities: input.topPriorities,
      atmosphereDescription: input.atmosphereDescription,
      vendorCategories: input.vendorCategories,
    },
  });
  const legacyChoices = [
    ...result.booked,
    ...result.bookable.slice(0, 3),
    ...result.verify.slice(0, 3),
  ].map((choice, index) => ({ ...choice, rank: index + 1 }));
  if (!input.requireExactlyThree) return { result, choices: legacyChoices, shortlist: null };

  const targetCategory = clean(input.targetCategory) || clean(input.vendorCategories?.[0]);
  const shortlist = selectWeddingVendorShortlist({
    targetCategory,
    bookable: result.bookable,
    verify: result.verify,
    canRunOnlineFallback: input.canRunOnlineFallback,
  });
  const rankedById = new Map([...result.bookable, ...result.verify].map((choice) => [choice.id, choice]));
  // A shortfall is not an empty result. Keep every suitable source-backed
  // candidate visible while the search honestly reports how many are missing.
  const choices = shortlist.candidates.flatMap((choice, index) => {
    const ranked = rankedById.get(choice.id);
    return ranked ? [{ ...ranked, rank: index + 1 }] : [];
  });
  return { result, choices, shortlist };
}

function markdownFor(
  execution: WeddingVendorSearchExecutionState,
  sources: readonly WeddingVendorSearchExecutionState["sources"][number][] = execution.sources,
): string {
  const vendorCategories = metadataStrings(execution, "vendor_categories");
  const googlePlaceTypes = metadataStrings(execution, "google_place_types");
  const overpassTags = metadataStrings(execution, "overpass_tags");
  const expectedFields = metadataStrings(execution, "expected_fields");
  const providerGuardrails = metadataStrings(execution, "provider_guardrails");
  return [
    "# Vendor search notes",
    "",
    "These notes record source-backed vendor-search evidence. They are not a booking, quote, availability confirmation, or endorsement.",
    "",
    "## Search context",
    "",
    vendorCategories.length > 0 ? `Vendor categories: ${vendorCategories.join(", ")}` : "Vendor categories: inferred from source titles only",
    googlePlaceTypes.length > 0 ? `Google place types: ${googlePlaceTypes.join(", ")}` : null,
    overpassTags.length > 0 ? `Overpass tags: ${overpassTags.join(", ")}` : null,
    expectedFields.length > 0 ? `Expected fields: ${expectedFields.join(", ")}` : null,
    "",
    "## Search queries",
    "",
    ...execution.queries.map((query) => `- ${query}`),
    "",
    "## Source results",
    "",
    "| Vendor | Confirmed page detail | URL |",
    "| --- | --- | --- |",
    ...sources.map((source) => `| ${clean(source.title) || "Unknown"} | ${clean(source.snippet) || ""} | ${source.url} |`),
    "",
    "## Verification actions",
    "",
    "- Open source pages before recommending or shortlisting a vendor.",
    "- Ask the user to tick selected vendors before drafting outreach or collapsing alternatives.",
    ...providerGuardrails.map((guardrail) => `- ${guardrail}`),
  ].filter((line): line is string => line !== null).join("\n");
}

function vendorSearchResultsCanCreateArtifacts(execution: WeddingVendorSearchExecutionState): boolean {
  return execution.status === "executed" || execution.status === "cached";
}

export function buildWeddingVendorSearchArtifactState(input: {
  metadata?: unknown;
  execution: WeddingVendorSearchExecutionState;
}): WeddingVendorSearchArtifactState {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const execution = input.execution;
  if (!vendorSearchResultsCanCreateArtifacts(execution)) {
    return {
      status: "not_created",
      reason: "No source-backed vendor results were returned yet. Check admin directory coverage or provider keys, then run the search again.",
      metadata,
      artifactInput: null,
      summary: null,
      markdown: null,
      sourceCount: 0,
    };
  }
  const usableSources = execution.sources.filter(usableSourceUrl);
  if (usableSources.length === 0) {
    return {
      status: "not_created",
      reason: "Live vendor search ran, but returned no usable vendor source URLs. Try a more specific category, location, or date window.",
      metadata,
      artifactInput: null,
      summary: null,
      markdown: null,
      sourceCount: 0,
    };
  }

  const unusableSourceCount = Math.max(0, execution.sources.length - usableSources.length);
  const markdown = markdownFor(execution, usableSources);
  const sourceLinks = usableSources.flatMap((source) => sourceUrlLinks(source));
  const sourceLabels = uniqueStrings([
    execution.providerLabel,
    ...metadataStrings(execution, "provider_kinds"),
    ...metadataStrings(execution, "source_provider_labels"),
    ...metadataStrings(execution, "vendor_categories"),
    ...metadataStrings(execution, "google_place_types"),
    ...metadataStrings(execution, "overpass_tags"),
    ...usableSources.map((source) => source.provider),
  ]);
  const vendorLabels = uniqueStrings(usableSources.map((source) => source.title));
  const artifactInput: WeddingArtifactInput = {
    id: artifactId(metadata, execution),
    title: "Vendor search notes",
    kind: "vendor_table",
    metadata: {
      ...metadata,
      artifactKind: "vendor_table",
      source: "vendor_search_executor",
      providerLabel: execution.providerLabel,
      providerKinds: metadataStrings(execution, "provider_kinds"),
      sourceProviderLabels: metadataStrings(execution, "source_provider_labels"),
      sourceCountsByProvider: metadataRecord(execution, "source_counts_by_provider"),
      vendorCategories: metadataStrings(execution, "vendor_categories"),
      googlePlaceTypes: metadataStrings(execution, "google_place_types"),
      overpassTags: metadataStrings(execution, "overpass_tags"),
      sourceUrlCount: sourceLinks.length,
      sourceWebsiteUrlCount: usableSources.filter((source) => usableSourceUrl({ url: source.website_url })).length,
      sourceMapUrlCount: usableSources.filter((source) => usableSourceUrl({ url: source.map_url })).length,
      unusableSourceUrlCount: unusableSourceCount,
    },
    sourceLabels,
      sourceLinks,
    vendorLabels,
    bodyText: markdown,
    exportTargets: ["csv", "html", "browser_pdf"],
  };
  const summary = normalizeWeddingArtifactSummary(artifactInput);

  return {
    status: summary ? "created" : "not_created",
    reason: summary ? null : "Vendor search notes could not be prepared.",
    metadata,
    artifactInput: summary ? artifactInput : null,
    summary,
    markdown: summary ? markdown : null,
    sourceCount: summary?.sourceLinks.length ?? 0,
  };
}

export function buildWeddingVendorComparisonArtifactState(
  input: WeddingVendorComparisonInput,
): WeddingVendorComparisonArtifactState {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const execution = input.execution;
  if (!vendorSearchResultsCanCreateArtifacts(execution)) {
    return {
      status: "not_created",
      reason: "Vendor comparison was not created because no source-backed vendor results were available.",
      metadata,
      artifactInput: null,
      summary: null,
      markdown: null,
      topChoiceCount: 0,
    };
  }
  const { result, choices, shortlist } = rankedVendorChoices(input);
  if (choices.length === 0) {
    return {
      status: "not_created",
      reason: shortlist?.reason ?? "Vendor comparison needs at least one usable source-backed vendor result.",
      metadata,
      artifactInput: null,
      summary: null,
      markdown: null,
      topChoiceCount: 0,
    };
  }
  const selectionPattern = weddingDecisionPattern(
    WEDDING_VENDOR_SELECTION_PATTERN_ID,
    WEDDING_VENDOR_PATTERN_VERSION,
  );
  const targetCategory = clean(input.targetCategory) || clean(input.vendorCategories?.[0]);
  const patternVerification = verifyWeddingDecisionPattern({
    patternId: WEDDING_VENDOR_SELECTION_PATTERN_ID,
    patternVersion: WEDDING_VENDOR_PATTERN_VERSION,
    situationType: "vendor_shortlist_ready",
    presentInputs: [
      metadata.weddingPlanId ? "wedding_plan_id" : "",
      targetCategory ? "category" : "",
      choices.length ? "candidate_count" : "",
    ],
    presentEvidence: [
      choices.every((choice) => Boolean(clean(choice.vendorId) || clean(choice.id))) ? "candidate_identities" : "",
      choices.every((choice) => Boolean(clean(choice.url))) ? "candidate_sources" : "",
      choices.every((choice) => Boolean(clean(choice.email) || clean(choice.phone) || clean(choice.websiteUrl) || clean(choice.url)))
        ? "request_routes"
        : "",
    ],
    allowedActions: WEDDING_VENDOR_SELECTION_ACTIONS,
    executionContracts: ["wedding.vendor_outreach@1"],
    optionalGaps: [
      clean(input.budgetComfort) ? null : "budget_context",
      clean(input.guestCount) ? null : "guest_count",
      clean(input.dateOrSeason) ? null : "date_or_season",
      comparisonPreferenceSignals(input).length ? null : "preferences",
      input.requireExactlyThree || choices.length === 3 ? null : "legacy_exact_three_not_enforced",
    ].filter((value): value is string => Boolean(value)),
  });
  if (!weddingDecisionPatternAllowsProjection(patternVerification)) {
    return {
      status: "not_created",
      reason: `Vendor comparison blocked by ${patternVerification.outcome.toLowerCase().replaceAll("_", " ")}.`,
      metadata,
      artifactInput: null,
      summary: null,
      markdown: null,
      topChoiceCount: 0,
    };
  }
  const markdown = comparisonMarkdown({ context: input, result, choices });
  const summaryLabel = comparisonSummaryLabel(choices, result);
  const sourceLinks = choices.flatMap((choice) => sourceUrlLinks({
    title: choice.title,
    url: choice.url,
    website_url: choice.websiteUrl,
    instagram_url: choice.instagramUrl,
    map_url: choice.mapUrl,
  }, `#${choice.rank} `));
  const topChoiceActionRows = vendorChoiceActionRows(choices);
  const topChoiceCards = vendorChoiceCards(choices, metadata.weddingPlanId || null);
  const preferenceSignals = comparisonPreferenceSignals(input);
  const recommendationHandoff = comparisonRecommendationHandoff({
    choices,
    result,
    providerLabel: execution.providerLabel,
    preferenceSignals,
    location: input.location,
  });
  const providerKinds = metadataStrings(execution, "provider_kinds");
  const sourceProviderLabels = metadataStrings(execution, "source_provider_labels");
  const sourceCountsByProvider = metadataRecord(execution, "source_counts_by_provider");
  const vendorCategories = metadataStrings(execution, "vendor_categories");
  const artifactInput: WeddingArtifactInput = {
    id: comparisonArtifactId(metadata, execution),
    title: "Top vendor comparison",
    kind: "vendor_table",
    metadata: {
      ...metadata,
      artifactKind: "vendor_table",
      source: "vendor_search_comparison",
      parentVendorSearchSource: "vendor_search_executor",
      providerLabel: execution.providerLabel,
      providerKinds,
      sourceProviderLabels,
      sourceCountsByProvider,
      vendorCategories,
      sourceUrlCount: sourceLinks.length,
      parentSourceUrlCount: execution.sources.filter(usableSourceUrl).length,
      topChoiceCount: choices.length,
      shortlistStatus: shortlist?.status ?? "legacy",
      shortlistShortfall: shortlist?.shortfall ?? Math.max(0, 3 - choices.length),
      shortlistReason: shortlist?.reason ?? null,
      patternId: WEDDING_VENDOR_SELECTION_PATTERN_ID,
      patternVersion: WEDDING_VENDOR_PATTERN_VERSION,
      situationType: "vendor_shortlist_ready",
      projectionRecipe: selectionPattern?.projectionRecipe,
      executionContract: selectionPattern?.executionContracts[0],
      patternVerification,
      topChoiceLabels: choices.map((choice) => choice.title),
      topChoiceActionRows,
      topChoiceCards,
      topChoiceContactDetails: choices.map((choice) => vendorChoiceContactDetails(choice)),
      vendorComparisonPreferenceSignals: preferenceSignals,
      vendorComparisonNextActions: result.nextActions,
      vendorComparisonHandoff: recommendationHandoff,
      vendorComparisonSelection: {
        mode: "multi",
        minSelected: 1,
        confirmAction: "confirm_vendor_choices",
        followUpAction: "prepare_follow_up_for_selected_vendors",
        openSourceAction: "open_vendor_source",
        openWebsiteAction: "open_vendor_website",
        openMapAction: "open_vendor_map",
        approvalRequiredBeforeOutreach: true,
        noExternalSendWithoutApproval: true,
        selectedVendorsContinueToFollowUp: true,
        unselectedVendorsLeaveActiveQueues: true,
        closedVendorHistoryRetained: true,
      },
      vendorComparisonRankingSignals: [
        "eligibility_hard_constraints",
        "availability_state",
        "personal_utility",
        "evidence_confidence",
        "next_action_value",
      ],
      semantic_object: {
        id: `wedding_vendor_comparison:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
        kind: "wedding_comparison",
        title: "Top vendor comparison",
        stateLabel: "Needs user choice",
        tone: "options",
        summary: summaryLabel,
        comparison: {
          title: choices.length === 3 ? "Top three vendor choices" : "Suitable vendor choices found so far",
          columns: [
            { label: "Vendor", kind: "option" },
            { label: "Why surfaced", kind: "text" },
            { label: "Fit and confidence", kind: "text" },
            { label: "Availability", kind: "text" },
            { label: "Verify next", kind: "action" },
          ],
          rows: choices.map((choice) => ({
            id: choice.id,
            cells: [
              `#${choice.rank} ${choice.title}`,
              choice.rationaleLabels.slice(0, 2).join("; "),
              `${choice.fitLabel} · ${choice.confidenceLabel}`,
              choice.availabilityLabel,
              choice.group === "verify" ? "Check availability and select" : "Verify and select",
            ],
          })),
        },
        actions: [
          {
            label: "Choose preferred vendors",
            kind: "confirm_vendor_choices",
            enabled: true,
            targetMenu: "documents",
          },
          {
            label: "Prepare follow-up for selected",
            kind: "prepare_follow_up_for_selected_vendors",
            enabled: true,
            targetMenu: "response_queue",
          },
          {
            label: "Open vendor sources",
            kind: "open_vendor_sources",
            enabled: true,
            targetMenu: "documents",
          },
        ],
        semanticTags: ["wedding_comparison", "wedding_decision", "wedding_approval_required"],
      },
      a2ui: a2uiForComparison(choices, summaryLabel, metadata.weddingPlanId || null),
    },
    sourceLabels: uniqueStrings([
      "Top vendor comparison",
      execution.providerLabel,
      ...sourceProviderLabels,
      ...providerKinds,
      ...vendorCategories,
    ]),
    sourceLinks,
    searchLabels: comparisonSearchLabels(choices, preferenceSignals),
    vendorLabels: choices.map((choice) => choice.title),
    bodyText: markdown,
    exportTargets: ["markdown", "html", "browser_pdf"],
  };
  const summary = normalizeWeddingArtifactSummary(artifactInput);

  return {
    status: summary ? "created" : "not_created",
    reason: summary ? null : "Vendor comparison could not be prepared.",
    metadata,
    artifactInput: summary ? artifactInput : null,
    summary,
    markdown: summary ? markdown : null,
    topChoiceCount: summary ? choices.length : 0,
  };
}

export function buildWeddingVendorSearchTaskItems(input: WeddingVendorSearchTaskItemsInput): WeddingPlanningTaskItem[] {
  const artifact = (input.artifacts ?? []).find(isVendorSearchArtifact);
  const comparisonArtifact = (input.artifacts ?? []).find(isVendorComparisonArtifact);
  if (!artifact && !comparisonArtifact) return [];
  const metadata = normalizeWeddingPlanningMetadata(input.metadata ?? artifact?.metadata ?? comparisonArtifact?.metadata);
  const existingKeys = existingVendorSearchTaskKeys(input.existingTaskItems ?? []);
  const comparisonArtifactId = clean(comparisonArtifact?.id);
  const hasSelectedComparisonVendors = Boolean(comparisonArtifactId)
    && (input.selectedDecisionItems ?? []).some((item) => clean(item.artifactId) === comparisonArtifactId);
  const tasks = [
    ...(artifact && !comparisonArtifact ? [
      vendorSearchTask(
        metadata,
        artifact,
        "review-source-freshness",
        "Review vendor source freshness before recommending shortlist",
        "research",
        "Open source pages and confirm each vendor still serves the wedding location/category. Do not treat stale search snippets as current evidence.",
        "high",
        {
          vendor_price_freshness_required: true,
          vendor_availability_freshness_required: true,
        },
      ),
      vendorSearchTask(
        metadata,
        artifact,
        "choose-preferred-vendors",
        "Tick preferred vendor options before narrowing reports",
        "decision",
        "Ask the user to choose preferred vendors from these notes. Collapse non-selected options only after the user ticks a choice or asks to keep comparing.",
        "high",
        {
          selected_decision_required: true,
          collapse_unselected_after_choice: true,
        },
      ),
      vendorSearchTask(
        metadata,
        artifact,
        "verify-price-availability",
        "Verify price, package inclusions, and availability for selected vendors",
        "budget_review",
        "Projected prices should update the wedding budget until an actual quote or contract replaces them. Verify hidden fees, deposit terms, travel, overtime, and cancellation policy.",
        "high",
        {
          vendor_price_freshness_required: true,
          vendor_availability_freshness_required: true,
          budget_projection_update_required: true,
        },
      ),
      vendorSearchTask(
        metadata,
        artifact,
        "approval-gated-outreach",
        "Prepare approval-gated vendor outreach and follow-up",
        "vendor_follow_up",
        "Draft outreach only for user-selected vendors. Do not send contact details, emails, or follow-ups unless the user explicitly approves that vendor and message.",
        "high",
        {
          no_external_send_without_approval: true,
          approval_required_before_outreach: true,
          approval_required_option_ids: ["send_initial_outreach", "send_one_follow_up", "share_contact_info"],
          outreach_escalation_stage: "initial_outreach",
        },
      ),
    ] : []),
    ...(comparisonArtifact && !hasSelectedComparisonVendors ? [vendorComparisonTask(metadata, comparisonArtifact)] : []),
  ];
  return tasks.filter((item) => {
    const actionId = clean(record(item.metadata).vendor_search_action_id);
    return !existingKeys.has(item.id) && !existingKeys.has(actionId);
  });
}
