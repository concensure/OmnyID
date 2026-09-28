// @locs-version: 2.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingDecisionSelectionOption } from "@/lib/weddingDecisionSelectionState";
import type { WeddingDecisionReportScopeState } from "@/lib/weddingDecisionReportScopeState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";
import { weddingSemanticObjectFromDecisionProjection } from "@/lib/weddingSemanticUiState";

export const WEDDING_DECISION_AFP_PROJECTIONS_KEY = "omnyid.wedding-decision-afp-projections";

export type WeddingDecisionProjectionInput = {
  id: string;
  metadata?: unknown;
  artifactId: string;
  artifactTitle: string;
  artifactKind: string;
  sourceLabels?: readonly string[] | null;
  sourceUrls?: readonly string[] | null;
  sourceProviderLabels?: readonly string[] | null;
  sourceCountsByProvider?: Record<string, unknown> | null;
  selectedOption: WeddingDecisionSelectionOption;
  reportScope?: WeddingDecisionReportScopeState | null;
  source?: "user" | "agent" | "manual" | "local_selection";
  createdAt?: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function uniqueStrings(values: readonly unknown[], limit = 64): string[] {
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

function uniqueSourceUrls(values: readonly unknown[], limit = 64): string[] {
  return uniqueStrings(values, limit).filter(remoteHttpUrl);
}

function remoteHttpUrl(value: string): boolean {
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

export function isWeddingImportDecisionProjection(input: Pick<WeddingDecisionProjectionInput, "metadata" | "sourceLabels">): boolean {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  return metadata.supertags.some((tag) => /^wedding_import(?:$|:)/i.test(tag))
    || uniqueStrings(input.sourceLabels ?? []).some((label) => (
      /^wedding_import(?:$|:)/i.test(label)
      || /original upload/i.test(label)
      || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(label)
      || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(label)
    ));
}

export function weddingDecisionSourceLabelsForProjection(
  input: Pick<WeddingDecisionProjectionInput, "metadata" | "sourceLabels">,
): string[] {
  const sourceLabels = uniqueStrings(input.sourceLabels ?? []);
  if (!isWeddingImportDecisionProjection(input)) return sourceLabels;
  return sourceLabels.length > 0 ? ["Imported private planning file"] : [];
}

function artifactTitleForProjection(input: WeddingDecisionProjectionInput): string {
  return isWeddingImportDecisionProjection(input) ? "Imported private planning file" : input.artifactTitle;
}

function isPrivateImportSourceUrl(value: string): boolean {
  return /\b(?:upload|uploads|attachment|attachments|storage|parser|source-file|source_file)\b/i.test(value)
    || /\b[^/?#]+\.(?:csv|tsv|xlsx?|ods)(?:$|[?#/])/i.test(value);
}

function isVendorComparisonDecision(input: WeddingDecisionProjectionInput): boolean {
  const metadata = record(input.metadata);
  return record(metadata.vendorComparisonSelection).selectedVendorsContinueToFollowUp === true
    || clean(metadata.source) === "vendor_search_comparison"
    || /top\s+vendor\s+comparison|vendor\s+comparison/i.test(`${input.artifactTitle} ${input.artifactId}`);
}

function vendorComparisonQueuePolicy(input: WeddingDecisionProjectionInput) {
  if (!isVendorComparisonDecision(input)) return null;
  const selection = record(record(input.metadata).vendorComparisonSelection);
  return {
    selected_vendors_continue_to_follow_up: selection.selectedVendorsContinueToFollowUp !== false,
    unselected_vendors_leave_active_queues: selection.unselectedVendorsLeaveActiveQueues !== false,
    unselected_vendors_audit_only: true,
    no_queue_rehydration_for_unselected: true,
    approval_required_before_outreach: selection.approvalRequiredBeforeOutreach !== false,
    no_external_send_without_approval: selection.noExternalSendWithoutApproval !== false,
  };
}

export function weddingDecisionSourceUrlsForProjection(input: WeddingDecisionProjectionInput): string[] {
  const sourceUrls = uniqueSourceUrls(input.sourceUrls ?? []);
  if (!isWeddingImportDecisionProjection(input)) return sourceUrls;
  return sourceUrls.filter((url) => !isPrivateImportSourceUrl(url));
}

function messageToSendInput(message: AfpMessage): SendAfpMessageInput {
  return {
    thread_id: message.thread_id,
    from: message.from,
    to: message.to ?? [],
    timestamp: message.timestamp,
    type: message.type,
    kind: message.kind,
    subtype: message.subtype ?? undefined,
    content: message.content,
    views: message.views,
    attachments: message.attachments,
    references: message.references,
    supertags: message.supertags ?? [],
    metadata: message.metadata,
    store_in_relational: true,
  };
}

function projectionId(metadata: WeddingPlanningMetadata, artifactId: string, optionId: string): string {
  return `wedding_decision:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(artifactId)}:${safeWeddingLabel(optionId)}`;
}

function selectedOptionColumnCells(option: WeddingDecisionSelectionOption): Array<{
  header: string;
  label: string;
  kind: string;
  value: string;
}> {
  const typed = Array.isArray(option.columnCells) ? option.columnCells : [];
  if (typed.length > 0) {
    return typed
      .map((cell) => ({
        header: clean(cell.header),
        label: clean(cell.label) || clean(cell.header) || "Detail",
        kind: clean(cell.kind) || "text",
        value: clean(cell.value),
      }))
      .filter((cell) => cell.value || cell.label);
  }
  return option.cells.map((cell, index) => ({
    header: `Cell ${index + 1}`,
    label: `Cell ${index + 1}`,
    kind: "text",
    value: clean(cell),
  }));
}

function markdownFor(input: WeddingDecisionProjectionInput, metadata: WeddingPlanningMetadata): string {
  const sourceLabels = weddingDecisionSourceLabelsForProjection(input);
  const sourceLabelCount = uniqueStrings(input.sourceLabels ?? []).length;
  const importedPrivateEvidence = isWeddingImportDecisionProjection(input);
  const artifactTitle = artifactTitleForProjection(input);
  const sourceUrls = weddingDecisionSourceUrlsForProjection(input);
  const sourceProviderLabels = uniqueStrings(input.sourceProviderLabels ?? []);
  const sourceCountsByProvider = input.sourceCountsByProvider && typeof input.sourceCountsByProvider === "object"
    ? input.sourceCountsByProvider
    : {};
  const preferenceLines = [
    ...input.selectedOption.preferenceFitLabels.map((label) => `- Fits: ${label}`),
    ...input.selectedOption.tradeoffLabels.map((label) => `- Check: ${label}`),
    ...input.selectedOption.missingPreferenceLabels.map((label) => `- Not evidenced: ${label}`),
  ];
  const reportScope = input.reportScope ?? null;
  const columnCells = selectedOptionColumnCells(input.selectedOption);
  const vendorPolicy = vendorComparisonQueuePolicy(input);
  return [
    "# Wedding decision",
    "",
    `Decision: ${input.selectedOption.label}`,
    "",
    "## Selected option",
    "",
    `- Source artifact: ${artifactTitle}`,
    `- Option: ${input.selectedOption.label}`,
    `- Detail: ${input.selectedOption.detail}`,
    `- Row: ${input.selectedOption.rowIndex + 1}`,
    sourceLabels.length > 0 ? `- Source labels: ${sourceLabels.join(", ")}` : null,
    importedPrivateEvidence ? `- Private import source labels redacted: ${sourceLabelCount}` : null,
    sourceProviderLabels.length > 0 ? `- Source providers: ${sourceProviderLabels.join(", ")}` : null,
    Object.keys(sourceCountsByProvider).length > 0
      ? `- Source counts by provider: ${Object.entries(sourceCountsByProvider).map(([provider, count]) => `${provider}: ${count}`).join(", ")}`
      : null,
    sourceUrls.length > 0 ? `- Source URLs: ${sourceUrls.slice(0, 6).join(", ")}` : null,
    "",
    "## Captured row",
    "",
    ...columnCells.map((cell) => `- ${cell.label}: ${cell.value || "Unknown"}`),
    "",
    "## Preference fit",
    "",
    input.selectedOption.preferenceSummaryLabel,
    "",
    ...(preferenceLines.length > 0 ? preferenceLines : ["- No explicit preference-fit signals were detected for this row."]),
    reportScope ? "" : null,
    reportScope ? "## Report scope" : null,
    reportScope ? "" : null,
    reportScope ? `- Status: ${reportScope.status}` : null,
    reportScope ? `- Instruction: ${reportScope.reportInstructionLabel}` : null,
    ...(reportScope?.blockerLabels ?? []).map((label) => `- Blocker: ${label}`),
    ...(reportScope?.auditContextLabels ?? []).map((label) => `- Audit: ${label}`),
    ...(reportScope?.nextActionLabels ?? []).map((label) => `- Next action: ${label}`),
    "",
    "## Use in future reports",
    "",
    "- Treat this selected option as the active decision scope for follow-up reports and next actions.",
    vendorPolicy
      ? "- Keep only selected vendors in active follow-up queues; unticked vendors are audit/history context only unless the user re-selects them."
      : "- Keep unticked alternatives available in the source artifact for audit and comparison.",
    vendorPolicy ? "- Do not regenerate decision queue or response queue work for unselected vendors from this comparison." : null,
    "- Do not infer booking, payment, legal compliance, availability, or external contact from this decision alone.",
    "",
    "## IDs",
    "",
    `- Wedding plan: ${metadata.weddingPlanId}`,
    `- Wedding workspace: ${metadata.responseWorkspaceId}`,
    `- Artifact: ${input.artifactId}`,
  ].filter((line): line is string => line !== null).join("\n");
}

export function weddingDecisionProjectionToAfpMessage(
  input: WeddingDecisionProjectionInput,
  nowIso = new Date().toISOString(),
): AfpMessage {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const id = clean(input.id) || projectionId(metadata, input.artifactId, input.selectedOption.id);
  const markdown = markdownFor(input, metadata);
  const rawSourceLabelCount = uniqueStrings(input.sourceLabels ?? []).length;
  const importedPrivateEvidence = isWeddingImportDecisionProjection(input);
  const artifactTitle = artifactTitleForProjection(input);
  const sourceLabels = weddingDecisionSourceLabelsForProjection(input);
  const sourceUrls = weddingDecisionSourceUrlsForProjection(input);
  const sourceProviderLabels = uniqueStrings(input.sourceProviderLabels ?? []);
  const sourceCountsByProvider = input.sourceCountsByProvider && typeof input.sourceCountsByProvider === "object"
    ? input.sourceCountsByProvider
    : {};
  const columnCells = selectedOptionColumnCells(input.selectedOption);
  const vendorPolicy = vendorComparisonQueuePolicy(input);
  const budgetDecision = /\bbudget|quote|price|cost|payment|deposit|invoice|contract\b/i
    .test(`${input.artifactKind} ${input.artifactTitle} ${input.selectedOption.label} ${input.selectedOption.detail} ${input.selectedOption.cells.join(" ")}`);
  const semanticObject = weddingSemanticObjectFromDecisionProjection({
    id,
    artifactTitle,
    selectedOption: {
      label: input.selectedOption.label,
      detail: input.selectedOption.detail,
    },
    columnCells,
    reportScope: input.reportScope,
    budgetDecision,
  });
  const searchableTerms = uniqueStrings([
    id,
    "wedding decision",
    budgetDecision ? "wedding budget decision" : null,
    budgetDecision ? "budget topology" : null,
    artifactTitle,
    input.artifactKind,
    input.artifactId,
    ...sourceLabels,
    ...sourceUrls,
    ...sourceProviderLabels,
    input.selectedOption.id,
    input.selectedOption.label,
    input.selectedOption.detail,
    ...columnCells.flatMap((cell) => [cell.label, cell.kind, cell.value]),
    input.selectedOption.preferenceSummaryLabel,
    input.reportScope?.status,
    input.reportScope?.reportInstructionLabel,
    vendorPolicy ? "selected vendors active" : null,
    vendorPolicy ? "unselected vendors audit only" : null,
    vendorPolicy ? "no queue rehydration for unselected vendors" : null,
    ...(input.reportScope?.blockerLabels ?? []),
    ...(input.reportScope?.auditContextLabels ?? []),
    ...input.selectedOption.preferenceFitLabels,
    ...input.selectedOption.tradeoffLabels,
    ...input.selectedOption.cells,
    metadata.weddingPlanId,
    metadata.responseWorkspaceId,
    metadata.sourceResponseId,
  ]);

  return {
    id: `afp-${id}`,
    thread_id: `wedding_decision:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    from: "system://wedding-planning",
    to: ["agent://wedding-planning", "agent://decision-queue", "agent://search", "agent://knowledge-graph"],
    timestamp: clean(input.createdAt) || nowIso,
    type: "decision",
    kind: "note",
    subtype: "wedding_decision_selection",
    supertags: uniqueStrings([
      ...metadata.supertags,
      "wedding",
      "wedding_decision",
      "decision:selected_option",
      budgetDecision ? "wedding_budget" : null,
      budgetDecision ? "topology:wedding_budget" : null,
      budgetDecision ? "decisionos" : null,
      `artifact:${safeWeddingLabel(input.artifactKind)}`,
      `option:${safeWeddingLabel(input.selectedOption.label)}`,
    ]),
    content: {
      kind: "wedding_decision_selection",
      decision_id: id,
      markdown,
      selected_option: {
        id: input.selectedOption.id,
        label: input.selectedOption.label,
        detail: input.selectedOption.detail,
        row_index: input.selectedOption.rowIndex,
        cells: input.selectedOption.cells,
        column_cells: columnCells,
        preference_summary: input.selectedOption.preferenceSummaryLabel,
        preference_fit_labels: input.selectedOption.preferenceFitLabels,
        preference_tradeoff_labels: input.selectedOption.tradeoffLabels,
        missing_preference_labels: input.selectedOption.missingPreferenceLabels,
      },
      report_scope: input.reportScope ? {
        status: input.reportScope.status,
        collapse_alternatives: input.reportScope.collapseAlternatives,
        include_alternatives_as_audit: input.reportScope.includeAlternativesAsAudit,
        instruction: input.reportScope.reportInstructionLabel,
        blockers: input.reportScope.blockerLabels,
        audit_context: input.reportScope.auditContextLabels,
        next_actions: input.reportScope.nextActionLabels,
      } : null,
      artifact_id: input.artifactId,
      artifact_title: artifactTitle,
      artifact_kind: input.artifactKind,
      source_labels: sourceLabels,
      source_label_count: rawSourceLabelCount,
      imported_private_evidence: importedPrivateEvidence,
      source_urls: sourceUrls,
      source_provider_labels: sourceProviderLabels,
      source_counts_by_provider: sourceCountsByProvider,
      vendor_comparison_queue_policy: vendorPolicy,
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      source_response_id: metadata.sourceResponseId,
      privacy_scope: metadata.privacyScope,
      budget_decision: budgetDecision,
      semantic_object: semanticObject,
      source: input.source ?? "local_selection",
    },
    metadata: {
      origin: "wedding_planning",
      projection: "wedding_decision_selection_to_afp",
      budget_decision: budgetDecision,
      decision_id: id,
      selected_option_id: input.selectedOption.id,
      selected_option_label: input.selectedOption.label,
      selected_option_preference_summary: input.selectedOption.preferenceSummaryLabel,
      selected_option_preference_fit_labels: input.selectedOption.preferenceFitLabels,
      selected_option_preference_tradeoff_labels: input.selectedOption.tradeoffLabels,
      selected_option_column_cells: columnCells,
      decision_report_scope_status: input.reportScope?.status ?? null,
      decision_report_scope_instruction: input.reportScope?.reportInstructionLabel ?? null,
      decision_report_scope_blockers: input.reportScope?.blockerLabels ?? [],
      artifact_id: input.artifactId,
      artifact_title: artifactTitle,
      artifact_kind: input.artifactKind,
      source_labels: sourceLabels,
      source_label_count: rawSourceLabelCount,
      imported_private_evidence: importedPrivateEvidence,
      source_urls: sourceUrls,
      source_provider_labels: sourceProviderLabels,
      source_counts_by_provider: sourceCountsByProvider,
      vendor_comparison_queue_policy: vendorPolicy,
      vendor_comparison_selected_vendors_active: vendorPolicy?.selected_vendors_continue_to_follow_up ?? false,
      vendor_comparison_unselected_vendors_audit_only: vendorPolicy?.unselected_vendors_audit_only ?? false,
      vendor_comparison_no_queue_rehydration_for_unselected: vendorPolicy?.no_queue_rehydration_for_unselected ?? false,
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      source_response_id: metadata.sourceResponseId,
      searchable_terms: searchableTerms,
      semantic_kind: semanticObject.kind,
      semantic_tags: semanticObject.semanticTags,
      semantic_object: semanticObject,
    },
    views: [{
      format: "document",
      priority: 1,
      content: {
        decision_id: id,
        title: `Decision: ${input.selectedOption.label}`,
        markdown,
        semantic_object: semanticObject,
      },
    }],
    attachments: [],
    references: uniqueStrings([metadata.sourceResponseId, input.artifactId]).map((target) => ({
      type: target === input.artifactId ? "wedding_artifact" : "wedding_response",
      target,
      label: target === input.artifactId ? "Source planning file" : "Source response",
    })),
  };
}

export function weddingDecisionProjectionToAfpSendInput(
  input: WeddingDecisionProjectionInput,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput {
  return messageToSendInput(weddingDecisionProjectionToAfpMessage(input, nowIso));
}

export function loadWeddingDecisionAfpProjectionIds(storage: Storage = localStorage): string[] {
  const raw = storage.getItem(WEDDING_DECISION_AFP_PROJECTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
  } catch {
    storage.removeItem(WEDDING_DECISION_AFP_PROJECTIONS_KEY);
    return [];
  }
}

export function hasSentWeddingDecisionAfpProjection(id: string, storage: Storage = localStorage): boolean {
  const cleanId = clean(id);
  return cleanId ? loadWeddingDecisionAfpProjectionIds(storage).includes(cleanId) : false;
}

export function markWeddingDecisionAfpProjectionSent(id: string, storage: Storage = localStorage): void {
  const cleanId = clean(id);
  if (!cleanId) return;
  const next = [...new Set([cleanId, ...loadWeddingDecisionAfpProjectionIds(storage)])].slice(0, 300);
  storage.setItem(WEDDING_DECISION_AFP_PROJECTIONS_KEY, JSON.stringify(next));
}
