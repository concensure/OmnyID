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

export type WeddingVendorSearchTaskItemsInput = {
  artifacts?: readonly WeddingArtifactInput[] | null;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
  metadata?: unknown;
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

function artifactId(metadata: WeddingPlanningMetadata, execution: WeddingVendorSearchExecutionState): string {
  return [
    "wedding_artifact",
    "vendor_search_sources",
    safeWeddingLabel(metadata.responseWorkspaceId),
    safeWeddingLabel(execution.queries[0] ?? "search"),
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

function existingVendorSearchTaskKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const metadata = record(item.metadata);
    const actionId = clean(metadata.vendor_search_action_id);
    if (metadata.vendor_search_review_task === true && actionId) keys.add(actionId);
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

function usableSourceUrl(source: { url?: string | null }): boolean {
  return /^https?:\/\//i.test(clean(source.url));
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
      reason: "Vendor search did not run live, so no source-backed vendor notes were created.",
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
      reason: "Live vendor search returned no usable HTTP(S) source URLs.",
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

export function buildWeddingVendorSearchTaskItems(input: WeddingVendorSearchTaskItemsInput): WeddingPlanningTaskItem[] {
  const artifact = (input.artifacts ?? []).find(isVendorSearchArtifact);
  if (!artifact) return [];
  const metadata = normalizeWeddingPlanningMetadata(input.metadata ?? artifact.metadata);
  const existingKeys = existingVendorSearchTaskKeys(input.existingTaskItems ?? []);
  const tasks = [
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
  ];
  return tasks.filter((item) => {
    const actionId = clean(record(item.metadata).vendor_search_action_id);
    return !existingKeys.has(item.id) && !existingKeys.has(actionId);
  });
}
