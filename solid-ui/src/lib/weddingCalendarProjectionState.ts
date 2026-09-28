// @locs-version: 2.0
import type { AfpMessage, CalendarEvent, SendAfpMessageInput } from "@/lib/api";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import type {
  WeddingSemanticUiKind,
  WeddingSemanticUiObject,
} from "@/lib/weddingSemanticUiState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingApprovalState,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export {
  WEDDING_CALENDAR_AFP_PROJECTIONS_KEY,
  WEDDING_TASK_AFP_PROJECTIONS_KEY,
  hasSentWeddingProjection,
  loadWeddingProjectionIds,
  markWeddingProjectionSent,
  unmarkWeddingProjectionSent,
} from "@/lib/weddingProjectionStorageState";

export type WeddingPlanningScheduleItemKind =
  | "ceremony"
  | "reception"
  | "venue_tour"
  | "vendor_call"
  | "deposit_due"
  | "contract_review"
  | "noim_reminder"
  | "dress_fitting"
  | "menu_tasting"
  | "rsvp_deadline"
  | "final_numbers_due"
  | "rehearsal"
  | "task_reminder"
  | "other";

export type WeddingPlanningTaskKind =
  | "research"
  | "vendor_follow_up"
  | "budget_review"
  | "guest_list"
  | "legal"
  | "vow"
  | "rings"
  | "first_dance"
  | "cake"
  | "transport"
  | "attire"
  | "hen_party"
  | "beauty"
  | "music"
  | "contract_review"
  | "rsvp"
  | "seating"
  | "vendor_coordination"
  | "document_checklist"
  | "run_sheet"
  | "weather_contingency"
  | "email_draft"
  | "registry"
  | "decision"
  | "other";

export type WeddingPlanningReviewStatus = "accepted" | "needs_review" | "ignored";
export type WeddingPlanningProjectionSource = "agent" | "user" | "upload" | "calendar" | "email" | "vendor" | "manual";

export type WeddingPlanningScheduleItem = {
  id: string;
  title: string;
  kind: WeddingPlanningScheduleItemKind;
  dateLabel?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  allDay?: boolean | null;
  location?: string | null;
  participants?: readonly string[] | null;
  source?: WeddingPlanningProjectionSource | null;
  reviewStatus?: WeddingPlanningReviewStatus | null;
  approvalState?: WeddingApprovalState | null;
  metadata?: unknown;
  linkedArtifactId?: string | null;
  notes?: string | null;
  semanticKind?: WeddingSemanticUiKind | null;
  semanticTags?: string[];
  semanticObject?: WeddingSemanticUiObject | null;
};

export type WeddingPlanningTaskItem = {
  id: string;
  title: string;
  kind: WeddingPlanningTaskKind;
  dueAt?: string | null;
  dueLabel?: string | null;
  priority?: "low" | "normal" | "high" | "urgent" | null;
  assignee?: string | null;
  source?: WeddingPlanningProjectionSource | null;
  reviewStatus?: WeddingPlanningReviewStatus | null;
  approvalState?: WeddingApprovalState | null;
  metadata?: unknown;
  linkedArtifactId?: string | null;
  notes?: string | null;
  semanticKind?: WeddingSemanticUiKind | null;
  semanticTags?: string[];
  semanticObject?: WeddingSemanticUiObject | null;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function importedPrivateLabel(value: string): boolean {
  return /^wedding_import(?:$|:)/i.test(value)
    || /original upload/i.test(value)
    || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(value)
    || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value)
    || /\b[^,\s]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value);
}

function privateImportSourceUrl(value: string): boolean {
  return /\b(?:upload|uploads|attachment|attachments|storage|parser|source-file|source_file)\b/i.test(value)
    || /\b[^/?#]+\.(?:csv|tsv|xlsx?|ods)(?:$|[?#/])/i.test(value);
}

function uniqueTags(values: readonly unknown[], limit = 32): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const tag = clean(value);
    const key = tag?.toLowerCase();
    if (!tag || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= limit) break;
  }
  return result;
}

function sanitizedSelectedDecisionScope(value: unknown): Record<string, unknown> {
  const scope = record(value);
  if (Object.keys(scope).length === 0) return {};
  const {
    artifactTitle: _artifactTitle,
    sourceLabels: _sourceLabels,
    sourceUrls: _sourceUrls,
    metadataLabels: _metadataLabels,
    ...rest
  } = scope;
  const artifactTitle = clean(scope.artifact_title ?? scope.artifactTitle);
  const sourceLabels = uniqueTags(Array.isArray(scope.source_labels) ? scope.source_labels : Array.isArray(scope.sourceLabels) ? scope.sourceLabels : [], 12);
  const metadataLabels = uniqueTags(Array.isArray(scope.metadata_labels) ? scope.metadata_labels : Array.isArray(scope.metadataLabels) ? scope.metadataLabels : [], 12);
  const importedPrivateScope = [
    artifactTitle,
    ...sourceLabels,
    ...metadataLabels,
  ].filter((label): label is string => Boolean(label)).some(importedPrivateLabel);
  const sourceUrls = uniqueTags(Array.isArray(scope.source_urls) ? scope.source_urls : Array.isArray(scope.sourceUrls) ? scope.sourceUrls : [], 12)
    .filter((url) => /^https?:\/\//i.test(url))
    .filter((url) => !importedPrivateScope || !privateImportSourceUrl(url));
  return {
    ...rest,
    artifact_title: importedPrivateScope ? "Imported private planning file" : artifactTitle,
    source_labels: importedPrivateScope && sourceLabels.length > 0 ? ["Imported private planning file"] : sourceLabels,
    source_urls: sourceUrls,
    metadata_labels: importedPrivateScope
      ? metadataLabels.filter((label) => !importedPrivateLabel(label))
      : metadataLabels,
    imported_private_evidence: importedPrivateScope || scope.imported_private_evidence === true,
  };
}

function normalizeMetadata(value: unknown, approvalState?: WeddingApprovalState | null): WeddingPlanningMetadata {
  return {
    ...normalizeWeddingPlanningMetadata(value),
    approvalState: approvalState ?? normalizeWeddingPlanningMetadata(value).approvalState,
  };
}

function approvedOrTentative(approvalState: WeddingApprovalState): CalendarEvent["status"] {
  return approvalState === "approved" || approvalState === "sent" ? "confirmed" : "tentative";
}

function projectionTags(
  metadata: WeddingPlanningMetadata,
  projectionKind: "calendar" | "task",
  itemKind: string,
  values: readonly unknown[],
): string[] {
  return uniqueTags([
    ...metadata.supertags,
    projectionKind,
    `wedding_${projectionKind}`,
    `wedding_${projectionKind}:${safeWeddingLabel(itemKind)}`,
    `approval:${metadata.approvalState}`,
    ...values,
  ]);
}

function taskGraphProjectionTags(projectedMetadata: Record<string, unknown>): string[] {
  const tags = [
    projectedMetadata.budget_payment_review === true || projectedMetadata.budget_quote_verification === true ? "wedding_budget" : null,
    projectedMetadata.budget_payment_review === true ? "wedding_budget:payment_schedule" : null,
    projectedMetadata.budget_quote_verification === true ? "wedding_budget:quote_verification" : null,
    projectedMetadata.budget_payment_review === true || projectedMetadata.budget_quote_verification === true ? "decisionos" : null,
    projectedMetadata.vendor_outreach_from_selected_decision === true ? "wedding_vendor_outreach" : null,
    projectedMetadata.vendor_outreach_from_selected_decision === true ? "decisionos" : null,
    projectedMetadata.wedding_inspiration_task === true ? "wedding_inspiration" : null,
    projectedMetadata.wedding_inspiration_task === true ? "wedding_inspiration:preference_model" : null,
    projectedMetadata.wedding_inspiration_task === true ? "decisionos:wedding_style" : null,
    projectedMetadata.wedding_inspiration_task === true ? "topology:wedding_preference_graph" : null,
    projectedMetadata.second_order_task === true ? "topology:wedding_planning" : null,
    projectedMetadata.second_order_loop ? `topology:${safeWeddingLabel(projectedMetadata.second_order_loop)}` : null,
  ];
  return uniqueTags(tags);
}

function taskMessageRecipients(projectedMetadata: Record<string, unknown>): string[] {
  return uniqueTags([
    "agent://tasks",
    "agent://wedding-planning",
    projectedMetadata.budget_payment_review === true || projectedMetadata.budget_quote_verification === true ? "agent://decision-queue" : null,
    projectedMetadata.budget_payment_review === true || projectedMetadata.budget_quote_verification === true ? "agent://knowledge-graph" : null,
    projectedMetadata.vendor_outreach_from_selected_decision === true ? "agent://decision-queue" : null,
    projectedMetadata.wedding_inspiration_task === true ? "agent://decision-queue" : null,
    projectedMetadata.wedding_inspiration_task === true ? "agent://knowledge-graph" : null,
    projectedMetadata.wedding_inspiration_task === true ? "agent://topology" : null,
    projectedMetadata.second_order_task === true ? "agent://topology" : null,
  ]);
}

function referencesFor(item: WeddingPlanningScheduleItem | WeddingPlanningTaskItem, metadata: WeddingPlanningMetadata) {
  return [
    metadata.sourceResponseId
      ? {
        type: "wedding_response",
        target: metadata.sourceResponseId,
        label: "Source response",
      }
      : null,
    clean(item.linkedArtifactId)
      ? {
        type: "wedding_artifact",
        target: clean(item.linkedArtifactId)!,
        label: "Linked planning file",
      }
      : null,
  ].filter((value): value is NonNullable<typeof value> => Boolean(value));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((label): label is string => typeof label === "string" && label.trim().length > 0)
    : [];
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value
      .map((entry) => typeof entry === "number" ? entry : typeof entry === "string" ? Number(entry) : NaN)
      .filter((entry) => Number.isFinite(entry) && entry >= 0)
    : [];
}

function boundedPositiveInteger(value: unknown, fallback: number | null = null, max = 6): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(Math.ceil(value), max)
    : fallback;
}

function isoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function alertDatesFor(item: WeddingPlanningScheduleItem | WeddingPlanningTaskItem, alertOffsetDays: readonly number[]): string[] {
  if (!("dueAt" in item)) return [];
  const dueAt = clean(item.dueAt);
  if (!dueAt || alertOffsetDays.length === 0) return [];
  const dueDate = new Date(dueAt);
  if (Number.isNaN(dueDate.getTime())) return [];
  const seen = new Set<string>();
  const dates: string[] = [];
  for (const offset of alertOffsetDays) {
    const alertDate = new Date(dueDate);
    alertDate.setUTCDate(alertDate.getUTCDate() - offset);
    const label = isoDateOnly(alertDate);
    if (seen.has(label)) continue;
    seen.add(label);
    dates.push(label);
  }
  return dates;
}

function projectionMetadata(
  item: WeddingPlanningScheduleItem | WeddingPlanningTaskItem,
  metadata: WeddingPlanningMetadata,
  projection: string,
) {
  const itemMetadata = record(item.metadata);
  const secondOrderLoop = clean(itemMetadata.second_order_loop);
  const alertOffsetDays = numberArray(itemMetadata.alert_offset_days);
  const alertDates = uniqueTags([
    ...stringArray(itemMetadata.alert_dates),
    clean(itemMetadata.alert_date),
    ...alertDatesFor(item, alertOffsetDays),
  ], 8);
  const preparationChecklistItem = clean(itemMetadata.preparation_checklist_item);
  const preparationAlertLabels = alertOffsetDays.map((days) => days === 0 ? "Alert on due date" : `Alert ${days} days before`);
  const secondOrderEvidenceLabels = uniqueTags([
    ...stringArray(itemMetadata.second_order_evidence_labels),
    ...preparationAlertLabels,
  ], 8);
  const selectedDecisionScope = sanitizedSelectedDecisionScope(itemMetadata.selected_decision_scope);
  const selectedOptionLabel = clean(selectedDecisionScope.selected_option_label);
  const selectedDecisionArtifactTitle = clean(selectedDecisionScope.artifact_title);
  const outreachEscalationStage = clean(itemMetadata.outreach_escalation_stage);
  const outreachApprovalOptionIds = stringArray(itemMetadata.approval_required_option_ids);
  const vendorId = clean(itemMetadata.vendor_id);
  const vendorContactMethod = clean(itemMetadata.vendor_contact_method);
  const vendorContactReceiptRef = clean(itemMetadata.vendor_contact_receipt_ref);
  const vendorContactThreadId = clean(itemMetadata.vendor_contact_thread_id);
  const followUpDueAt = clean(itemMetadata.follow_up_due_at);
  const budgetPaymentReview = itemMetadata.budget_payment_review === true;
  const budgetQuoteVerification = itemMetadata.budget_quote_verification === true;
  const vendorOutreachFromSelectedDecision = itemMetadata.vendor_outreach_from_selected_decision === true;
  const vendorOutreachRequestChecklist = stringArray(itemMetadata.vendor_outreach_request_checklist);
  const guestFollowUp = itemMetadata.guest_follow_up === true;
  const guestFinalCountDecision = itemMetadata.guest_final_count_decision === true;
  const postWeddingWrapUp = itemMetadata.post_wedding_wrap_up === true;
  const vowPlanningTask = itemMetadata.vow_planning_task === true;
  const seatingAction = itemMetadata.seating_action === true;
  const delegationTask = itemMetadata.delegation_task === true;
  const finalPhaseTask = itemMetadata.final_phase_task === true;
  const legalAdministrationTask = itemMetadata.legal_administration_task === true;
  const vendorSearchReviewTask = itemMetadata.vendor_search_review_task === true;
  const expectedBehaviorGap = itemMetadata.expected_behavior_gap === true;
  const oracleUpdatePlanTask = itemMetadata.oracle_update_plan_task === true;
  const productionRemainingWorkTask = itemMetadata.production_remaining_work_task === true;
  const weddingInspirationTask = itemMetadata.wedding_inspiration_task === true;
  return {
    origin: "wedding_planning",
    projection,
    wedding_plan_id: metadata.weddingPlanId,
    response_workspace_id: metadata.responseWorkspaceId,
    source_response_id: metadata.sourceResponseId,
    source: clean(item.source) ?? "agent",
    approval_state: metadata.approvalState,
    review_status: item.reviewStatus ?? "accepted",
    linked_artifact_id: clean(item.linkedArtifactId),
    second_order_loop: secondOrderLoop,
    second_order_task: itemMetadata.second_order_task === true || Boolean(secondOrderLoop),
    second_order_evidence_labels: secondOrderEvidenceLabels,
    preparation_checklist: itemMetadata.preparation_checklist === true || Boolean(preparationChecklistItem),
    preparation_checklist_item: preparationChecklistItem,
    alert_offset_days: alertOffsetDays,
    alert_dates: alertDates,
    alert_reminder: itemMetadata.alert_reminder === true,
    alert_reminder_for_task_id: clean(itemMetadata.alert_reminder_for_task_id),
    alert_date: clean(itemMetadata.alert_date),
    schedule_basis: clean(itemMetadata.schedule_basis),
    user_selectable: itemMetadata.user_selectable === true,
    can_deselect_before_commit: itemMetadata.can_deselect_before_commit === true,
    outreach_escalation_stage: outreachEscalationStage,
    vendor_id: vendorId,
    outreach_vendor_label: clean(itemMetadata.vendor_label),
    outreach_vendor_type_label: clean(itemMetadata.vendor_type_label),
    vendor_contact_method: vendorContactMethod,
    vendor_contact_receipt_ref: vendorContactReceiptRef,
    vendor_contact_thread_id: vendorContactThreadId,
    follow_up_due_at: followUpDueAt,
    outreach_day_count: typeof itemMetadata.day_count === "number" && Number.isFinite(itemMetadata.day_count)
      ? itemMetadata.day_count
      : null,
    approval_required_option_ids: outreachApprovalOptionIds,
    budget_payment_review: budgetPaymentReview,
    budget_quote_verification: budgetQuoteVerification,
    budget_line_item_id: clean(itemMetadata.budget_line_item_id),
    budget_payment_candidate_id: clean(itemMetadata.budget_payment_candidate_id),
    budget_payment_due_amount_label: clean(itemMetadata.budget_payment_due_amount_label),
    budget_payment_due_date_label: clean(itemMetadata.budget_payment_due_date_label),
    budget_vendor_label: clean(itemMetadata.budget_vendor_label),
    budget_category_label: clean(itemMetadata.budget_category_label),
    budget_source_label: clean(itemMetadata.budget_source_label),
    vendor_outreach_from_selected_decision: vendorOutreachFromSelectedDecision,
    vendor_outreach_line_item_id: clean(itemMetadata.vendor_outreach_line_item_id),
    vendor_outreach_vendor_label: clean(itemMetadata.vendor_outreach_vendor_label),
    vendor_outreach_category_label: clean(itemMetadata.vendor_outreach_category_label),
    vendor_outreach_source_label: clean(itemMetadata.vendor_outreach_source_label),
    vendor_outreach_draft_subject: clean(itemMetadata.vendor_outreach_draft_subject),
    vendor_outreach_draft_body: clean(itemMetadata.vendor_outreach_draft_body),
    vendor_outreach_request_checklist: vendorOutreachRequestChecklist,
    vendor_outreach_draft_requires_approval: itemMetadata.vendor_outreach_draft_requires_approval === true,
    vendor_outreach_provider_receipt_required: itemMetadata.vendor_outreach_provider_receipt_required === true,
    approval_required_before_outreach: itemMetadata.approval_required_before_outreach === true,
    provider_receipt_required: itemMetadata.provider_receipt_required === true,
    guest_follow_up: guestFollowUp,
    guest_follow_up_candidate_id: clean(itemMetadata.guest_follow_up_candidate_id),
    guest_follow_up_reason: clean(itemMetadata.guest_follow_up_reason),
    guest_final_count_decision: guestFinalCountDecision,
    guest_final_count_attending: typeof itemMetadata.guest_final_count_attending === "number" ? itemMetadata.guest_final_count_attending : null,
    guest_final_count_pending: typeof itemMetadata.guest_final_count_pending === "number" ? itemMetadata.guest_final_count_pending : null,
    guest_final_count_option_ids: stringArray(itemMetadata.guest_final_count_option_ids),
    guest_final_count_option_labels: stringArray(itemMetadata.guest_final_count_option_labels),
    guest_final_count_headcounts: numberArray(itemMetadata.guest_final_count_headcounts),
    guest_final_count_risk_labels: stringArray(itemMetadata.guest_final_count_risk_labels),
    post_wedding_wrap_up: postWeddingWrapUp,
    post_wedding_action_id: clean(itemMetadata.post_wedding_action_id),
    no_external_send_without_approval: itemMetadata.no_external_send_without_approval === true,
    vow_planning_task: vowPlanningTask,
    vow_preference: clean(itemMetadata.vow_preference),
    vow_checklist_preview: stringArray(itemMetadata.vow_checklist_preview),
    seating_action: seatingAction,
    seating_action_candidate_id: clean(itemMetadata.seating_action_candidate_id),
    seating_action_reason: clean(itemMetadata.seating_action_reason),
    delegation_task: delegationTask,
    delegated_category: clean(itemMetadata.delegated_category),
    delegated_scope_label: clean(itemMetadata.delegated_scope_label),
    delegated_scope_description: clean(itemMetadata.delegated_scope_description),
    delegated_sensitive_scope_label: clean(itemMetadata.delegated_sensitive_scope_label),
    delegate_name: clean(itemMetadata.delegate_name),
    delegate_relationship: clean(itemMetadata.delegate_relationship),
    delegate_email: clean(itemMetadata.delegate_email),
    delegate_phone: clean(itemMetadata.delegate_phone),
    contacts_projection_recommended: itemMetadata.contacts_projection_recommended === true,
    final_phase_task: finalPhaseTask,
    final_phase_action_id: clean(itemMetadata.final_phase_action_id),
    legal_administration_task: legalAdministrationTask,
    legal_document_checklist_item: clean(itemMetadata.legal_document_checklist_item),
    expected_behavior_gap: expectedBehaviorGap,
    expected_behavior_capability: clean(itemMetadata.expected_behavior_capability),
    expected_behavior_status: clean(itemMetadata.expected_behavior_status),
    expected_behavior_title: clean(itemMetadata.expected_behavior_title),
    expected_behavior_blocker_labels: stringArray(itemMetadata.expected_behavior_blocker_labels),
    oracle_update_plan_task: oracleUpdatePlanTask,
    oracle_update_step_kind: clean(itemMetadata.oracle_update_step_kind),
    oracle_update_step_id: clean(itemMetadata.oracle_update_step_id),
    oracle_update_target_label: clean(itemMetadata.oracle_update_target_label),
    oracle_update_blocked: itemMetadata.oracle_update_blocked === true,
    oracle_update_can_update: itemMetadata.oracle_update_can_update === true,
    oracle_update_blocker_labels: stringArray(itemMetadata.oracle_update_blocker_labels),
    oracle_update_guardrail_labels: stringArray(itemMetadata.oracle_update_guardrail_labels),
    oracle_update_command_label: clean(itemMetadata.oracle_update_command_label),
    production_readiness_oracle_gate: itemMetadata.production_readiness_oracle_gate === true,
    production_remaining_work_task: productionRemainingWorkTask,
    production_remaining_work_item_id: clean(itemMetadata.production_remaining_work_item_id),
    production_remaining_work_tier: clean(itemMetadata.production_remaining_work_tier),
    production_remaining_work_required_for_oracle: itemMetadata.production_remaining_work_required_for_oracle === true,
    production_remaining_work_estimated_passes: boundedPositiveInteger(itemMetadata.production_remaining_work_estimated_passes),
    wedding_inspiration_task: weddingInspirationTask,
    inspiration_task_key: clean(itemMetadata.inspiration_task_key),
    inspiration_tags: stringArray(itemMetadata.inspiration_tags),
    inspiration_item_count: typeof itemMetadata.inspiration_item_count === "number" ? itemMetadata.inspiration_item_count : null,
    preferred_action_label: clean(itemMetadata.preferred_action_label),
    wedding_workspace_menu: clean(itemMetadata.wedding_workspace_menu),
    a2ui_primary_action: clean(itemMetadata.a2ui_primary_action),
    decisionos_scope: clean(itemMetadata.decisionos_scope),
    topology_scope: clean(itemMetadata.topology_scope),
    vendor_search_review_task: vendorSearchReviewTask,
    vendor_search_action_id: clean(itemMetadata.vendor_search_action_id),
    vendor_search_provider_labels: stringArray(itemMetadata.vendor_search_provider_labels),
    vendor_search_provider_kinds: stringArray(itemMetadata.vendor_search_provider_kinds),
    vendor_search_categories: stringArray(itemMetadata.vendor_search_categories),
    vendor_seed_review_task: itemMetadata.vendor_seed_review_task === true,
    vendor_seed_action_id: clean(itemMetadata.vendor_seed_action_id),
    vendor_source_kind: clean(itemMetadata.vendor_source_kind),
    vendor_seed_count: typeof itemMetadata.vendor_seed_count === "number" ? itemMetadata.vendor_seed_count : null,
    stale_seed_count: typeof itemMetadata.stale_seed_count === "number" ? itemMetadata.stale_seed_count : null,
    vendor_price_recheck_count: typeof itemMetadata.vendor_price_recheck_count === "number" ? itemMetadata.vendor_price_recheck_count : null,
    vendor_availability_recheck_count: typeof itemMetadata.vendor_availability_recheck_count === "number" ? itemMetadata.vendor_availability_recheck_count : null,
    vendor_relevance_blocker_count: typeof itemMetadata.vendor_relevance_blocker_count === "number" ? itemMetadata.vendor_relevance_blocker_count : null,
    source_verification_required: itemMetadata.source_verification_required === true,
    vendor_price_freshness_required: itemMetadata.vendor_price_freshness_required === true,
    vendor_availability_freshness_required: itemMetadata.vendor_availability_freshness_required === true,
    selected_decision_required: itemMetadata.selected_decision_required === true,
    collapse_unselected_after_choice: itemMetadata.collapse_unselected_after_choice === true,
    budget_projection_update_required: itemMetadata.budget_projection_update_required === true,
    selected_decision_scope: Object.keys(selectedDecisionScope).length > 0 ? selectedDecisionScope : null,
    searchable_terms: [
      item.title,
      item.kind,
      item.notes,
      secondOrderLoop,
      preparationChecklistItem,
      clean(itemMetadata.alert_reminder_for_task_id),
      clean(itemMetadata.alert_date),
      clean(itemMetadata.schedule_basis),
      outreachEscalationStage,
      vendorId,
      clean(itemMetadata.vendor_label),
      vendorContactMethod,
      vendorContactReceiptRef,
      vendorContactThreadId,
      followUpDueAt,
      budgetQuoteVerification ? "budget quote verification" : null,
      clean(itemMetadata.budget_line_item_id),
      budgetPaymentReview ? "budget payment review" : null,
      clean(itemMetadata.budget_payment_candidate_id),
      clean(itemMetadata.budget_payment_due_amount_label),
      clean(itemMetadata.budget_payment_due_date_label),
      clean(itemMetadata.budget_vendor_label),
      clean(itemMetadata.budget_category_label),
      clean(itemMetadata.budget_source_label),
      guestFollowUp ? "guest follow-up" : null,
      clean(itemMetadata.guest_follow_up_candidate_id),
      clean(itemMetadata.guest_follow_up_reason),
      guestFinalCountDecision ? "final guest count decision" : null,
      ...stringArray(itemMetadata.guest_final_count_option_labels),
      ...stringArray(itemMetadata.guest_final_count_risk_labels),
      postWeddingWrapUp ? "post-wedding wrap-up" : null,
      clean(itemMetadata.post_wedding_action_id),
      vowPlanningTask ? "vow preparation" : null,
      clean(itemMetadata.vow_preference),
      ...stringArray(itemMetadata.vow_checklist_preview),
      seatingAction ? "seating action" : null,
      clean(itemMetadata.seating_action_candidate_id),
      clean(itemMetadata.seating_action_reason),
      delegationTask ? "delegated responsibility" : null,
      clean(itemMetadata.delegated_category),
      clean(itemMetadata.delegated_scope_label),
      clean(itemMetadata.delegate_name),
      clean(itemMetadata.delegate_relationship),
      clean(itemMetadata.delegate_email),
      finalPhaseTask ? "final phase" : null,
      finalPhaseTask ? "final confirmations" : null,
      finalPhaseTask ? "run sheet" : null,
      clean(itemMetadata.final_phase_action_id),
      legalAdministrationTask ? "legal administration" : null,
      legalAdministrationTask ? "NOIM" : null,
      legalAdministrationTask ? "document checklist" : null,
      clean(itemMetadata.legal_document_checklist_item),
      expectedBehaviorGap ? "expected behavior gap" : null,
      expectedBehaviorGap ? "launch check" : null,
      clean(itemMetadata.expected_behavior_capability),
      clean(itemMetadata.expected_behavior_status),
      clean(itemMetadata.expected_behavior_title),
      ...stringArray(itemMetadata.expected_behavior_blocker_labels),
      oracleUpdatePlanTask ? "live wedding planner update" : null,
      oracleUpdatePlanTask ? "live update check" : null,
      clean(itemMetadata.oracle_update_step_kind),
      clean(itemMetadata.oracle_update_step_id),
      clean(itemMetadata.oracle_update_target_label),
      clean(itemMetadata.oracle_update_command_label),
      ...stringArray(itemMetadata.oracle_update_blocker_labels),
      productionRemainingWorkTask ? "production remaining work" : null,
      productionRemainingWorkTask ? "remaining production work" : null,
      productionRemainingWorkTask ? itemMetadata.production_remaining_work_required_for_oracle === true ? "launch blocker" : "production polish" : null,
      clean(itemMetadata.production_remaining_work_item_id),
      clean(itemMetadata.production_remaining_work_tier),
      weddingInspirationTask ? "wedding inspiration" : null,
      weddingInspirationTask ? "style decisions" : null,
      weddingInspirationTask ? "preference model" : null,
      clean(itemMetadata.preferred_action_label),
      clean(itemMetadata.wedding_workspace_menu),
      clean(itemMetadata.a2ui_primary_action),
      clean(itemMetadata.decisionos_scope),
      clean(itemMetadata.topology_scope),
      ...stringArray(itemMetadata.inspiration_tags),
      vendorSearchReviewTask ? "vendor search review" : null,
      vendorSearchReviewTask ? "source freshness" : null,
      vendorSearchReviewTask ? "price availability verification" : null,
      vendorSearchReviewTask ? "approval-gated outreach" : null,
      clean(itemMetadata.vendor_search_action_id),
      ...stringArray(itemMetadata.vendor_search_provider_labels),
      ...stringArray(itemMetadata.vendor_search_provider_kinds),
      ...stringArray(itemMetadata.vendor_search_categories),
      itemMetadata.vendor_seed_review_task === true ? "seeded vendor review" : null,
      clean(itemMetadata.vendor_seed_action_id),
      clean(itemMetadata.vendor_source_kind),
      selectedOptionLabel,
      selectedDecisionArtifactTitle,
      ...preparationAlertLabels,
      ...alertDates,
      ...secondOrderEvidenceLabels,
      ...outreachApprovalOptionIds,
      "wedding planning",
      "wedding",
      metadata.weddingPlanId,
      metadata.responseWorkspaceId,
    ].filter(Boolean),
  };
}

function semanticProjectionFields(item: WeddingPlanningScheduleItem | WeddingPlanningTaskItem): Record<string, unknown> {
  return {
    ...(item.semanticKind ? { semantic_kind: item.semanticKind } : {}),
    ...(item.semanticTags && item.semanticTags.length > 0 ? { semantic_tags: item.semanticTags } : {}),
    ...(item.semanticObject ? { semantic_object: item.semanticObject } : {}),
  };
}

export function shouldProjectWeddingScheduleItemToAfpCalendarEvent(item: WeddingPlanningScheduleItem): boolean {
  return Boolean(clean(item.id) && clean(item.title) && clean(item.startAt))
    && item.reviewStatus !== "needs_review"
    && item.reviewStatus !== "ignored"
    && item.approvalState !== "archived";
}

export function shouldProjectWeddingTaskItemToAfpTaskMessage(item: WeddingPlanningTaskItem): boolean {
  return Boolean(clean(item.id) && clean(item.title))
    && item.reviewStatus !== "ignored"
    && item.approvalState !== "archived";
}

export function weddingScheduleItemToAfpCalendarMessage(
  item: WeddingPlanningScheduleItem,
  nowIso = new Date().toISOString(),
): AfpMessage | null {
  if (!shouldProjectWeddingScheduleItemToAfpCalendarEvent(item)) return null;
  const metadata = normalizeMetadata(item.metadata, item.approvalState);
  const startAt = clean(item.startAt)!;
  const eventId = `afp-wedding-calendar-event:${safeWeddingLabel(item.id)}`;
  const source = clean(item.source) ?? "agent";
  const description = [
    clean(item.notes),
    clean(item.dateLabel) ? `Date context: ${clean(item.dateLabel)}.` : null,
    `Source: ${source}.`,
    `Approval: ${metadata.approvalState}.`,
  ].filter(Boolean).join(" ");
  const semanticFields = semanticProjectionFields(item);

  return {
    id: eventId,
    thread_id: `wedding_calendar_event:${safeWeddingLabel(item.id)}`,
    from: "system://wedding-planning",
    to: ["agent://calendar", "agent://wedding-planning"],
    timestamp: nowIso,
    type: "calendar_event",
    kind: "event",
    subtype: "wedding_event",
    supertags: projectionTags(metadata, "calendar", item.kind, [
      clean(item.location) ? `location:${safeWeddingLabel(item.location)}` : null,
    ]),
    content: {
      kind: "calendar_event",
      title: item.title,
      description,
      start_at: startAt,
      end_at: clean(item.endAt),
      all_day: Boolean(item.allDay),
      location: clean(item.location),
      status: approvedOrTentative(metadata.approvalState),
      source,
      participants: item.participants ?? [],
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      wedding_schedule_item_id: item.id,
      wedding_event_kind: item.kind,
      linked_artifact_id: clean(item.linkedArtifactId),
      ...semanticFields,
    },
    metadata: {
      ...projectionMetadata(item, metadata, "wedding_schedule_item_to_afp_calendar_event"),
      wedding_schedule_item_id: item.id,
      wedding_event_kind: item.kind,
      ...semanticFields,
    },
    views: [
      {
        format: "calendar",
        content: {
          event_id: eventId,
          start_at: startAt,
          end_at: clean(item.endAt),
          title: item.title,
          location: clean(item.location),
          status: approvedOrTentative(metadata.approvalState),
          wedding_plan_id: metadata.weddingPlanId,
          response_workspace_id: metadata.responseWorkspaceId,
          wedding_event_kind: item.kind,
          ...semanticFields,
        },
      },
    ],
    attachments: [],
    references: referencesFor(item, metadata),
  };
}

export function weddingTaskItemToAfpTaskMessage(
  item: WeddingPlanningTaskItem,
  nowIso = new Date().toISOString(),
): AfpMessage | null {
  if (!shouldProjectWeddingTaskItemToAfpTaskMessage(item)) return null;
  const metadata = normalizeMetadata(item.metadata, item.approvalState);
  const taskId = `afp-wedding-task:${safeWeddingLabel(item.id)}`;
  const source = clean(item.source) ?? "agent";
  const projectedMetadata = projectionMetadata(item, metadata, "wedding_task_item_to_afp_task");
  const semanticFields = semanticProjectionFields(item);

  return {
    id: taskId,
    thread_id: `wedding_task:${safeWeddingLabel(item.id)}`,
    from: "system://wedding-planning",
    to: taskMessageRecipients(projectedMetadata),
    timestamp: nowIso,
    type: "task",
    kind: "task",
    subtype: "wedding_task",
    supertags: projectionTags(metadata, "task", item.kind, [
      clean(item.priority) ? `priority:${clean(item.priority)}` : null,
      clean(item.assignee) ? `assignee:${safeWeddingLabel(item.assignee)}` : null,
      ...taskGraphProjectionTags(projectedMetadata),
    ]),
    content: {
      kind: "task",
      task_id: taskId,
      title: item.title,
      description: clean(item.notes),
      due_at: clean(item.dueAt),
      due_date: clean(item.dueAt),
      due_label: clean(item.dueLabel),
      priority: clean(item.priority) ?? "normal",
      assignee: clean(item.assignee),
      status: metadata.approvalState === "archived" ? "archived" : "open",
      milestone: clean(item.dueLabel) ?? "Wedding preparation",
      source,
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      wedding_task_item_id: item.id,
      wedding_task_kind: item.kind,
      linked_artifact_id: clean(item.linkedArtifactId),
      preparation_checklist: projectedMetadata.preparation_checklist,
      preparation_checklist_item: projectedMetadata.preparation_checklist_item,
      alert_offset_days: projectedMetadata.alert_offset_days,
      alert_dates: projectedMetadata.alert_dates,
      schedule_basis: projectedMetadata.schedule_basis,
      second_order_loop: projectedMetadata.second_order_loop,
      second_order_evidence_labels: projectedMetadata.second_order_evidence_labels,
      vendor_id: projectedMetadata.vendor_id,
      vendor_contact_method: projectedMetadata.vendor_contact_method,
      vendor_contact_receipt_ref: projectedMetadata.vendor_contact_receipt_ref,
      vendor_contact_thread_id: projectedMetadata.vendor_contact_thread_id,
      follow_up_due_at: projectedMetadata.follow_up_due_at,
      budget_quote_verification: projectedMetadata.budget_quote_verification,
      budget_line_item_id: projectedMetadata.budget_line_item_id,
      budget_payment_review: projectedMetadata.budget_payment_review,
      budget_payment_candidate_id: projectedMetadata.budget_payment_candidate_id,
      budget_payment_due_amount_label: projectedMetadata.budget_payment_due_amount_label,
      budget_payment_due_date_label: projectedMetadata.budget_payment_due_date_label,
      budget_vendor_label: projectedMetadata.budget_vendor_label,
      budget_category_label: projectedMetadata.budget_category_label,
      budget_source_label: projectedMetadata.budget_source_label,
      vendor_outreach_from_selected_decision: projectedMetadata.vendor_outreach_from_selected_decision,
      vendor_outreach_line_item_id: projectedMetadata.vendor_outreach_line_item_id,
      vendor_outreach_vendor_label: projectedMetadata.vendor_outreach_vendor_label,
      vendor_outreach_category_label: projectedMetadata.vendor_outreach_category_label,
      vendor_outreach_source_label: projectedMetadata.vendor_outreach_source_label,
      vendor_outreach_draft_subject: projectedMetadata.vendor_outreach_draft_subject,
      vendor_outreach_draft_body: projectedMetadata.vendor_outreach_draft_body,
      vendor_outreach_request_checklist: projectedMetadata.vendor_outreach_request_checklist,
      vendor_outreach_draft_requires_approval: projectedMetadata.vendor_outreach_draft_requires_approval,
      vendor_outreach_provider_receipt_required: projectedMetadata.vendor_outreach_provider_receipt_required,
      approval_required_before_outreach: projectedMetadata.approval_required_before_outreach,
      provider_receipt_required: projectedMetadata.provider_receipt_required,
      guest_follow_up: projectedMetadata.guest_follow_up,
      guest_follow_up_candidate_id: projectedMetadata.guest_follow_up_candidate_id,
      guest_follow_up_reason: projectedMetadata.guest_follow_up_reason,
      seating_action: projectedMetadata.seating_action,
      seating_action_candidate_id: projectedMetadata.seating_action_candidate_id,
      seating_action_reason: projectedMetadata.seating_action_reason,
      wedding_inspiration_task: projectedMetadata.wedding_inspiration_task,
      inspiration_tags: projectedMetadata.inspiration_tags,
      preferred_action_label: projectedMetadata.preferred_action_label,
      wedding_workspace_menu: projectedMetadata.wedding_workspace_menu,
      a2ui_primary_action: projectedMetadata.a2ui_primary_action,
      ...semanticFields,
    },
    metadata: {
      ...projectedMetadata,
      wedding_task_item_id: item.id,
      wedding_task_kind: item.kind,
      ...semanticFields,
    },
    views: [
      {
        format: "task",
        content: {
          task_id: taskId,
          title: item.title,
          due_at: clean(item.dueAt),
          priority: clean(item.priority) ?? "normal",
          assignee: clean(item.assignee),
          wedding_plan_id: metadata.weddingPlanId,
          response_workspace_id: metadata.responseWorkspaceId,
          wedding_task_kind: item.kind,
          preparation_checklist_item: projectedMetadata.preparation_checklist_item,
          alert_offset_days: projectedMetadata.alert_offset_days,
          alert_dates: projectedMetadata.alert_dates,
          schedule_basis: projectedMetadata.schedule_basis,
          second_order_loop: projectedMetadata.second_order_loop,
          vendor_id: projectedMetadata.vendor_id,
          vendor_contact_method: projectedMetadata.vendor_contact_method,
          vendor_contact_receipt_ref: projectedMetadata.vendor_contact_receipt_ref,
          vendor_contact_thread_id: projectedMetadata.vendor_contact_thread_id,
          follow_up_due_at: projectedMetadata.follow_up_due_at,
          budget_quote_verification: projectedMetadata.budget_quote_verification,
          budget_payment_review: projectedMetadata.budget_payment_review,
          budget_vendor_label: projectedMetadata.budget_vendor_label,
          budget_category_label: projectedMetadata.budget_category_label,
          budget_payment_due_amount_label: projectedMetadata.budget_payment_due_amount_label,
          budget_payment_due_date_label: projectedMetadata.budget_payment_due_date_label,
          vendor_outreach_from_selected_decision: projectedMetadata.vendor_outreach_from_selected_decision,
          vendor_outreach_vendor_label: projectedMetadata.vendor_outreach_vendor_label,
          vendor_outreach_category_label: projectedMetadata.vendor_outreach_category_label,
          vendor_outreach_draft_subject: projectedMetadata.vendor_outreach_draft_subject,
          vendor_outreach_request_checklist: projectedMetadata.vendor_outreach_request_checklist,
          vendor_outreach_draft_requires_approval: projectedMetadata.vendor_outreach_draft_requires_approval,
          approval_required_before_outreach: projectedMetadata.approval_required_before_outreach,
          provider_receipt_required: projectedMetadata.provider_receipt_required,
          guest_follow_up: projectedMetadata.guest_follow_up,
          seating_action: projectedMetadata.seating_action,
          wedding_inspiration_task: projectedMetadata.wedding_inspiration_task,
          inspiration_tags: projectedMetadata.inspiration_tags,
          preferred_action_label: projectedMetadata.preferred_action_label,
          wedding_workspace_menu: projectedMetadata.wedding_workspace_menu,
          a2ui_primary_action: projectedMetadata.a2ui_primary_action,
          ...semanticFields,
        },
      },
    ],
    attachments: [],
    references: referencesFor(item, metadata),
  };
}

export function buildWeddingTaskAlertReminderScheduleItems(input: {
  taskItems?: readonly WeddingPlanningTaskItem[] | null;
  existingScheduleItems?: readonly WeddingPlanningScheduleItem[] | null;
  limit?: number | null;
}): WeddingPlanningScheduleItem[] {
  const existingKeys = new Set((input.existingScheduleItems ?? []).map((item) => {
    const metadata = record(item.metadata);
    return `${clean(metadata.alert_reminder_for_task_id) ?? ""}:${clean(metadata.alert_date) ?? clean(item.startAt)?.slice(0, 10) ?? ""}`;
  }));
  const reminders: WeddingPlanningScheduleItem[] = [];
  const limit = Math.max(0, input.limit ?? 24);

  for (const task of input.taskItems ?? []) {
    const taskMetadata = record(task.metadata);
    const alertOffsets = numberArray(taskMetadata.alert_offset_days);
    const alertDates = stringArray(taskMetadata.alert_dates).length > 0
      ? stringArray(taskMetadata.alert_dates)
      : alertDatesFor(task, alertOffsets);
    if (!clean(task.id) || !clean(task.title) || alertDates.length === 0) continue;

    alertDates.forEach((date, index) => {
      if (reminders.length >= limit) return;
      const dateLabel = clean(date);
      if (!dateLabel) return;
      const key = `${task.id}:${dateLabel}`;
      if (existingKeys.has(key)) return;
      const offset = alertOffsets[index];
      reminders.push({
        id: `wedding_calendar:task-alert:${safeWeddingLabel(task.id)}:${safeWeddingLabel(dateLabel)}`,
        title: `Reminder: ${task.title}`,
        kind: "task_reminder",
        dateLabel: typeof offset === "number" ? `${offset} days before task due date` : "Wedding task reminder",
        startAt: `${dateLabel}T09:00:00.000Z`,
        allDay: true,
        source: "agent",
        reviewStatus: "accepted",
        approvalState: "draft",
        linkedArtifactId: clean(task.linkedArtifactId),
        metadata: {
          ...taskMetadata,
          alert_reminder: true,
          alert_reminder_for_task_id: task.id,
          alert_date: dateLabel,
          alert_offset_days: typeof offset === "number" ? [offset] : alertOffsets,
          alert_dates: [dateLabel],
          preparation_checklist: taskMetadata.preparation_checklist === true,
          preparation_checklist_item: clean(taskMetadata.preparation_checklist_item),
        },
        notes: [
          clean(task.dueLabel) ? `Task due context: ${clean(task.dueLabel)}.` : null,
          clean(task.dueAt) ? `Task due date: ${clean(task.dueAt)}.` : null,
          clean(task.notes),
        ].filter(Boolean).join(" "),
      });
      existingKeys.add(key);
    });
  }

  return reminders;
}

export function weddingScheduleItemsToAfpCalendarMessages(
  items: readonly WeddingPlanningScheduleItem[],
  nowIso?: string,
): AfpMessage[] {
  return items.flatMap((item): AfpMessage[] => {
    const message = weddingScheduleItemToAfpCalendarMessage(item, nowIso);
    return message ? [message] : [];
  });
}

export function weddingTaskItemsToAfpTaskMessages(items: readonly WeddingPlanningTaskItem[], nowIso?: string): AfpMessage[] {
  return items.flatMap((item): AfpMessage[] => {
    const message = weddingTaskItemToAfpTaskMessage(item, nowIso);
    return message ? [message] : [];
  });
}

export function afpWeddingCalendarMessageToCalendarEvent(message: AfpMessage): CalendarEvent | null {
  const content = decryptedDisplayContent(message);
  const kind = typeof content.kind === "string" ? content.kind : null;
  if (message.type !== "calendar_event" && kind !== "calendar_event") return null;
  const title = clean(content.title);
  const startAt = clean(content.start_at) ?? clean(content.start);
  if (!title || !startAt) return null;
  const status = content.status === "tentative" || content.status === "cancelled" ? content.status : "confirmed";
  return {
    id: message.id,
    title,
    description: clean(content.description),
    start_at: startAt,
    end_at: clean(content.end_at),
    all_day: typeof content.all_day === "boolean" ? content.all_day : false,
    location: clean(content.location),
    status,
    note_kind: message.subtype ?? null,
    prep_lead_minutes: null,
    profile: {
      ...(message.metadata ?? {}),
      afp_message_id: message.id,
      afp_thread_id: message.thread_id,
      supertags: message.supertags ?? [],
    },
  };
}

export function weddingScheduleItemToCalendarEvent(item: WeddingPlanningScheduleItem): CalendarEvent | null {
  const message = weddingScheduleItemToAfpCalendarMessage(item);
  return message ? afpWeddingCalendarMessageToCalendarEvent(message) : null;
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

export function weddingScheduleItemToAfpSendInput(
  item: WeddingPlanningScheduleItem,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput | null {
  const message = weddingScheduleItemToAfpCalendarMessage(item, nowIso);
  return message ? messageToSendInput(message) : null;
}

export function weddingTaskItemToAfpSendInput(
  item: WeddingPlanningTaskItem,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput | null {
  const message = weddingTaskItemToAfpTaskMessage(item, nowIso);
  return message ? messageToSendInput(message) : null;
}
