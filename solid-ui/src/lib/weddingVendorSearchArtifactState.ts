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
};

type RankedVendorSource = {
  id: string;
  rank: number;
  title: string;
  provider: string;
  url: string;
  snippet: string;
  score: number;
  preferenceMatchLabel: string;
  situationFitLabel: string;
  verificationLabel: string;
  rationaleLabels: string[];
};

function vendorChoiceActionRows(choices: readonly RankedVendorSource[]): Array<Record<string, unknown>> {
  return choices.map((choice) => ({
    choice_id: choice.id,
    rank: choice.rank,
    vendor_label: choice.title,
    source_url: choice.url,
    source_provider: choice.provider,
    actions: [
      {
        kind: "select_vendor_for_follow_up",
        label: `Select ${choice.title}`,
        enabled: true,
        requires_user_confirmation: true,
        selection_value: choice.id,
      },
      {
        kind: "open_vendor_source",
        label: "Open source",
        enabled: true,
        href: choice.url,
        external: true,
      },
      {
        kind: "prepare_approval_gated_outreach",
        label: "Prepare follow-up",
        enabled: true,
        requires_user_confirmation: true,
        approval_required_before_outreach: true,
        no_external_send_without_approval: true,
      },
    ],
  }));
}

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

function tokenize(value: unknown): string[] {
  return uniqueStrings(clean(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 4 && !/^(wedding|vendor|vendors|with|from|that|this|have|need|needs|style)$/i.test(token)), 32);
}

function comparisonPreferenceText(input: WeddingVendorComparisonInput): string {
  return [
    input.preferences,
    input.atmosphereDescription,
    input.budgetComfort,
    input.guestCount,
    input.dateOrSeason,
    ...(input.topPriorities ?? []),
    ...(input.vendorCategories ?? []),
    ...(input.inspirationImageUrls ?? []),
  ].filter(Boolean).join(" ");
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
    && /vendor search source packet|vendor_search_executor|source-backed vendor-search|vendor shortlist|google_places|overpass|brave search/i.test([
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

function usableSourceUrl(source: { url?: string | null }): boolean {
  const value = clean(source.url);
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return hostname !== "localhost"
      && hostname !== "127.0.0.1"
      && hostname !== "0.0.0.0"
      && hostname !== "::1"
      && hostname !== "[::1]";
  } catch {
    return false;
  }
}

function sourceHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function rankedVendorSources(input: WeddingVendorComparisonInput): RankedVendorSource[] {
  const execution = input.execution;
  const preferenceTokens = tokenize(comparisonPreferenceText(input));
  const locationTokens = tokenize(input.location);
  const categoryTokens = tokenize((input.vendorCategories ?? []).join(" "));
  const seen = new Set<string>();
  const ranked = execution.sources
    .filter(usableSourceUrl)
    .flatMap((source, index): RankedVendorSource[] => {
      const title = clean(source.title) || sourceHostname(clean(source.url)) || `Vendor ${index + 1}`;
      const url = clean(source.url);
      const provider = clean(source.provider) || clean(execution.providerLabel) || "Search";
      const snippet = clean(source.snippet);
      const key = `${title.toLowerCase()}|${sourceHostname(url).toLowerCase()}`;
      if (!url || seen.has(key)) return [];
      seen.add(key);
      const haystack = `${title} ${snippet} ${provider} ${url}`.toLowerCase();
      const preferenceMatches = preferenceTokens.filter((token) => haystack.includes(token));
      const locationMatches = locationTokens.filter((token) => haystack.includes(token));
      const categoryMatches = categoryTokens.filter((token) => haystack.includes(token));
      const transparentPricing = /\b(package|packages|pricing|price|investment|quote|rates?)\b/i.test(haystack);
      const portfolioSignal = /\b(portfolio|gallery|review|reviews|testimonial|instagram|award)\b/i.test(haystack);
      const availabilitySignal = /\b(available|availability|booking|bookings|calendar|date)\b/i.test(haystack);
      const score = 10
        + preferenceMatches.length * 5
        + categoryMatches.length * 4
        + locationMatches.length * 3
        + (transparentPricing ? 3 : 0)
        + (portfolioSignal ? 2 : 0)
        + (availabilitySignal ? 2 : 0)
        + (/google_places|google/i.test(provider) ? 2 : 0)
        + Math.max(0, 4 - index);
      const rationaleLabels = [
        preferenceMatches.length > 0 ? `Matches ${preferenceMatches.slice(0, 3).join(", ")}` : null,
        categoryMatches.length > 0 ? `Category signal: ${categoryMatches.slice(0, 2).join(", ")}` : null,
        locationMatches.length > 0 ? `Location signal: ${locationMatches.slice(0, 2).join(", ")}` : null,
        transparentPricing ? "Pricing/package language found" : null,
        portfolioSignal ? "Portfolio/review signal found" : null,
        availabilitySignal ? "Availability/booking signal found" : null,
        `Source provider: ${provider}`,
      ].filter((item): item is string => Boolean(item));
      return [{
        id: `vendor_choice:${safeWeddingLabel(title)}:${index + 1}`,
        rank: 0,
        title,
        provider,
        url,
        snippet,
        score,
        preferenceMatchLabel: preferenceMatches.length > 0
          ? preferenceMatches.slice(0, 4).join(", ")
          : "No direct preference keyword match; review manually.",
        situationFitLabel: [
          categoryMatches.length > 0 ? `Category: ${categoryMatches.slice(0, 2).join(", ")}` : null,
          locationMatches.length > 0 ? `Location: ${locationMatches.slice(0, 2).join(", ")}` : null,
          transparentPricing ? "Package/pricing clue" : null,
          portfolioSignal ? "Portfolio/review clue" : null,
        ].filter(Boolean).join("; ") || "Fit requires source-page review.",
        verificationLabel: "Confirm service area, date availability, package inclusions, travel, overtime, cancellation, and final quote before outreach.",
        rationaleLabels,
      }];
    })
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, 5);
  return ranked.map((item, index) => ({ ...item, rank: index + 1 }));
}

function a2uiForComparison(choices: readonly RankedVendorSource[], summary: string): Record<string, unknown> {
  const columns = choices.map((choice) => `#${choice.rank} ${choice.title}`);
  const choiceActions = vendorChoiceActionRows(choices);
  return {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: "Top vendor comparison",
    description: summary,
    components: [{
      type: "comparison_table",
      props: {
        title: choices.length > 3 ? "Top vendor choices" : "Top three vendor choices",
        description: summary,
        columns,
        rows: [
          { label: "Why surfaced", values: choices.map((choice) => choice.rationaleLabels.slice(0, 2).join("; ")) },
          { label: "Preference match", values: choices.map((choice) => choice.preferenceMatchLabel) },
          { label: "Situation fit", values: choices.map((choice) => choice.situationFitLabel) },
          { label: "Verify before action", values: choices.map((choice) => choice.verificationLabel) },
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
        column_actions: choiceActions,
        footer_actions: [
          {
            kind: "confirm_vendor_choices",
            label: "Confirm selected vendors",
            enabled: true,
            requires_user_confirmation: true,
          },
          {
            kind: "prepare_follow_up_for_selected_vendors",
            label: "Prepare follow-up for selected",
            enabled: true,
            requires_user_confirmation: true,
            approval_required_before_outreach: true,
            no_external_send_without_approval: true,
          },
        ],
      },
    }],
    actions: [
      {
        kind: "confirm_vendor_choices",
        label: "Confirm selected vendors",
        enabled: true,
        requires_user_confirmation: true,
      },
      {
        kind: "prepare_follow_up_for_selected_vendors",
        label: "Prepare follow-up for selected",
        enabled: true,
        requires_user_confirmation: true,
        approval_required_before_outreach: true,
      },
    ],
  };
}

function comparisonRecommendationHandoff(input: {
  choices: readonly RankedVendorSource[];
  execution: WeddingVendorSearchExecutionState;
  preferenceSignals?: readonly string[] | null;
  preferences?: string | null;
  location?: string | null;
}): Record<string, unknown> {
  const topChoice = input.choices[0] ?? null;
  const liveSourceCount = input.execution.sources.filter(usableSourceUrl).length;
  const preferenceBackedCount = input.choices.filter((choice) =>
    !/No direct preference keyword match/i.test(choice.preferenceMatchLabel)
  ).length;
  const pricingSignalCount = input.choices.filter((choice) => /pricing|package/i.test(choice.situationFitLabel)).length;
  const confidenceLabel = liveSourceCount >= 3 && preferenceBackedCount >= 2
    ? "Confidence: strong"
    : liveSourceCount >= 2 && (preferenceBackedCount > 0 || pricingSignalCount > 0)
      ? "Confidence: developing"
      : "Confidence: early";
  return {
    recommendationLabel: topChoice
      ? `Start by reviewing ${topChoice.title}, then select every vendor you want OmnyID to pursue.`
      : "Review source-backed vendor options before outreach.",
    whyLabels: [
      `${input.choices.length} source-backed choice${input.choices.length === 1 ? "" : "s"} ranked from live search results`,
      preferenceBackedCount > 0
        ? `${preferenceBackedCount} choice${preferenceBackedCount === 1 ? "" : "s"} matched stated preferences`
        : "Preference fit needs manual review",
      pricingSignalCount > 0
        ? `${pricingSignalCount} choice${pricingSignalCount === 1 ? "" : "s"} surfaced package/pricing language`
        : "Pricing/package evidence is not clear yet",
      compactPreferenceSignalLabel(input.preferenceSignals ?? []),
      clean(input.location) ? `Location context: ${clean(input.location)}` : null,
      `Provider evidence: ${clean(input.execution.providerLabel) || "live search"}`,
    ].filter(Boolean),
    confidenceLabel,
    nextActionLabel: "Select one or more vendors for approval-gated follow-up.",
  };
}

function comparisonMarkdown(input: WeddingVendorComparisonInput, choices: readonly RankedVendorSource[]): string {
  const summary = "Ranked from live source results using preference, category, location, package/pricing, portfolio/review, and availability signals. This is not a booking or endorsement.";
  return [
    "# Top vendor comparison",
    "",
    summary,
    "",
    clean(input.preferences) ? `User preferences: ${clean(input.preferences)}` : null,
    clean(input.atmosphereDescription) ? `Desired atmosphere: ${clean(input.atmosphereDescription)}` : null,
    clean(input.location) ? `Planning location: ${clean(input.location)}` : null,
    clean(input.budgetComfort) ? `Budget comfort: ${clean(input.budgetComfort)}` : null,
    (input.topPriorities ?? []).length > 0 ? `Top priorities: ${(input.topPriorities ?? []).join(", ")}` : null,
    (input.inspirationImageUrls ?? []).length > 0 ? `Inspiration links: ${(input.inspirationImageUrls ?? []).join(", ")}` : null,
    (input.vendorCategories ?? []).length > 0 ? `Vendor categories: ${(input.vendorCategories ?? []).join(", ")}` : null,
    "",
    choices.length > 3 ? "## Top five candidates" : "## Top three",
    "",
    "| Rank | Vendor | Why this surfaced | Preference match | Situation fit | Verify next | Source |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...choices.map((choice) => [
      `| ${choice.rank}`,
      choice.title,
      choice.rationaleLabels.slice(0, 3).join("; "),
      choice.preferenceMatchLabel,
      choice.situationFitLabel,
      choice.verificationLabel,
      choice.url,
    ].join(" | ") + " |"),
    "",
    "## Guardrails",
    "",
    "- Treat this as a comparison starting point, not a recommendation to book.",
    "- Ask the user to tick preferred vendors before drafting outreach.",
    "- Reconfirm current pricing, date availability, inclusions, hidden fees, travel, overtime, cancellation, and deposit terms.",
  ].filter((line): line is string => line !== null).join("\n");
}

function markdownFor(
  execution: WeddingVendorSearchExecutionState,
  sources: readonly WeddingVendorSearchExecutionState["sources"][number][] = execution.sources,
): string {
  const providerKinds = metadataStrings(execution, "provider_kinds");
  const sourceProviderLabels = metadataStrings(execution, "source_provider_labels");
  const sourceCountsByProvider = metadataRecord(execution, "source_counts_by_provider");
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
    "## Provider context",
    "",
    providerKinds.length > 0 ? `Provider kinds: ${providerKinds.join(", ")}` : "Provider kinds: not recorded",
    sourceProviderLabels.length > 0 ? `Source providers returned: ${sourceProviderLabels.join(", ")}` : null,
    Object.keys(sourceCountsByProvider).length > 0
      ? `Source counts by provider: ${Object.entries(sourceCountsByProvider).map(([provider, count]) => `${provider}: ${count}`).join(", ")}`
      : null,
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
    "| Source | Provider | Snippet | URL |",
    "| --- | --- | --- | --- |",
    ...sources.map((source) => `| ${clean(source.title) || "Unknown"} | ${clean(source.provider) || clean(execution.providerLabel) || "Unknown"} | ${clean(source.snippet) || "Review source directly"} | ${source.url} |`),
    "",
    "## Verification actions",
    "",
    "- Open source pages before recommending or shortlisting a vendor.",
    "- Confirm service area, availability, packages, inclusions, hidden fees, and cancellation terms directly.",
    "- Ask the user to tick selected vendors before drafting outreach or collapsing alternatives.",
    ...providerGuardrails.map((guardrail) => `- ${guardrail}`),
  ].filter((line): line is string => line !== null).join("\n");
}

export function buildWeddingVendorSearchArtifactState(input: {
  metadata?: unknown;
  execution: WeddingVendorSearchExecutionState;
}): WeddingVendorSearchArtifactState {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const execution = input.execution;
  if (execution.status !== "executed" || !execution.externalSearchPerformed) {
    return {
      status: "not_created",
      reason: "No live vendor sources were returned yet. Check that admin search/place provider keys are configured, then run the search again.",
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
  const sourceLinks = usableSources.map((source) => ({
    label: source.title,
    url: source.url,
  }));
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
      sourceUrlCount: usableSources.length,
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
  if (execution.status !== "executed" || !execution.externalSearchPerformed) {
    return {
      status: "not_created",
      reason: "Vendor comparison was not created because live vendor search did not execute.",
      metadata,
      artifactInput: null,
      summary: null,
      markdown: null,
      topChoiceCount: 0,
    };
  }
  const choices = rankedVendorSources(input);
  if (choices.length === 0) {
    return {
      status: "not_created",
      reason: "Vendor comparison needs at least one usable source-backed vendor result.",
      metadata,
      artifactInput: null,
      summary: null,
      markdown: null,
      topChoiceCount: 0,
    };
  }
  const markdown = comparisonMarkdown(input, choices);
  const summaryLabel = choices.length > 3
    ? `Top ${Math.min(3, choices.length)} of ${choices.length} source-backed vendor choices are ready; expand for the rest.`
    : choices.length >= 3
      ? "Top three source-backed vendor choices are ready for user comparison."
    : `${choices.length} source-backed vendor choice${choices.length === 1 ? "" : "s"} ready for user comparison.`;
  const sourceLinks = choices.map((choice) => ({
    label: `#${choice.rank} ${choice.title}`,
    url: choice.url,
  }));
  const topChoiceActionRows = vendorChoiceActionRows(choices);
  const preferenceSignals = comparisonPreferenceSignals(input);
  const recommendationHandoff = comparisonRecommendationHandoff({
    choices,
    execution,
    preferenceSignals,
    preferences: input.preferences,
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
      topChoiceLabels: choices.map((choice) => choice.title),
      topChoiceActionRows,
      vendorComparisonPreferenceSignals: preferenceSignals,
      vendorComparisonHandoff: recommendationHandoff,
      vendorComparisonSelection: {
        mode: "multi",
        minSelected: 1,
        confirmAction: "confirm_vendor_choices",
        followUpAction: "prepare_follow_up_for_selected_vendors",
        openSourceAction: "open_vendor_source",
        approvalRequiredBeforeOutreach: true,
        noExternalSendWithoutApproval: true,
        selectedVendorsContinueToFollowUp: true,
        unselectedVendorsLeaveActiveQueues: true,
        closedVendorHistoryRetained: true,
      },
      vendorComparisonRankingSignals: [
        "user_preferences",
        "location",
        "vendor_category",
        "atmosphere_description",
        "top_priorities",
        "inspiration_links",
        "package_pricing_language",
        "portfolio_review_language",
        "availability_language",
      ],
      semantic_object: {
        id: `wedding_vendor_comparison:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
        kind: "wedding_comparison",
        title: "Top vendor comparison",
        stateLabel: "Needs user choice",
        tone: "options",
        summary: summaryLabel,
        comparison: {
          title: choices.length > 3 ? "Top vendor choices" : "Top three vendor choices",
          columns: [
            { label: "Vendor", kind: "option" },
            { label: "Why surfaced", kind: "text" },
            { label: "Preference match", kind: "text" },
            { label: "Verify next", kind: "action" },
          ],
          rows: choices.map((choice) => ({
            id: choice.id,
            cells: [
              `#${choice.rank} ${choice.title}`,
              choice.rationaleLabels.slice(0, 2).join("; "),
              choice.preferenceMatchLabel,
              "Verify and select",
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
      a2ui: a2uiForComparison(choices, summaryLabel),
    },
    sourceLabels: uniqueStrings([
      "Top vendor comparison",
      execution.providerLabel,
      ...sourceProviderLabels,
      ...providerKinds,
      ...vendorCategories,
    ]),
    sourceLinks,
    searchLabels: uniqueStrings([
      "vendor comparison",
      "top three vendors",
      "top five vendors",
      "top vendor choices",
      "vendor shortlist",
      ...choices.flatMap((choice) => [choice.title, choice.preferenceMatchLabel, choice.situationFitLabel]),
      ...preferenceSignals,
    ]),
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
