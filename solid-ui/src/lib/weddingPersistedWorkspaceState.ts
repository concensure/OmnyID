// @locs-version: 2.0
import type { AfpMessage } from "@/lib/api";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import type { WeddingArtifactInput, WeddingArtifactSourceLink } from "@/lib/weddingArtifactState";
import type {
  WeddingPlanningScheduleItem,
  WeddingPlanningScheduleItemKind,
  WeddingPlanningTaskItem,
  WeddingPlanningTaskKind,
} from "@/lib/weddingCalendarProjectionState";
import type { WeddingNeedToKnowProjectionContext } from "@/lib/weddingNeedToKnowAfpProjectionState";
import type { WeddingPlanningContext } from "@/lib/weddingNeedToKnowProbingState";
import type { WeddingApprovalActionKind, WeddingApprovalBlockKind } from "@/lib/weddingApprovalState";
import {
  coalesceWeddingBoundaryLedgerObjects,
  type WeddingBoundaryChangeRequest,
  type WeddingBoundaryDecisionRationale,
  type WeddingBoundaryEventInvitation,
  type WeddingBoundaryGuestProfile,
  type WeddingBoundaryHousehold,
  type WeddingBoundaryLedgerKind,
  type WeddingBoundaryLedgerObject,
  type WeddingBoundaryPolicy,
  type WeddingBoundaryPolicyEnforcement,
  type WeddingBoundaryPolicyRuleType,
  type WeddingBoundaryRequestStatus,
  type WeddingBoundaryRole,
  type WeddingBoundaryRoleAssignment,
  type WeddingBoundaryVisibility,
} from "@/lib/weddingBoundaryLedgerState";
import {
  normalizeWeddingPlanningMetadata,
  type WeddingArtifactKind,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";
import {
  weddingSeatingOptimizationResultFromAfpMessage,
  type WeddingSeatingOptimizationResult,
} from "@/lib/weddingSeatingOptimizationState";
import {
  weddingSeatingDraftArchiveFromAfpMessage,
  type WeddingSeatingDraftArchiveRecord,
} from "@/lib/weddingSeatingDraftArchiveState";
import {
  buildWeddingInspirationState,
  weddingInspirationItemsFromAfpMessage,
  type WeddingInspirationItem,
} from "@/lib/weddingInspirationState";
import type {
  WeddingSeatingConstraintAction,
  WeddingSeatingConstraintKind,
} from "@/lib/weddingSeatingConstraintActionState";

export type WeddingPersistedApprovalReceipt = {
  id: string;
  requestId: string;
  actionKind: WeddingApprovalActionKind | "unknown";
  title: string;
  status: "executed" | "blocked";
  createdAt: string;
  disclosureLines: string[];
  riskLabels: string[];
  blockedReason: string | null;
  blockKind: WeddingApprovalBlockKind | null;
  externalId: string | null;
  executionMode: string | null;
  providerCapability: string | null;
  requiredProvider: string | null;
  providerCredentialStatus: string | null;
  providerExecutorStatus: string | null;
  providerExecutorConnected: boolean;
  providerSetupView: string | null;
  externalProviderRequired: boolean;
  artifactIds: string[];
  scheduleItemIds: string[];
  taskItemIds: string[];
};

export type WeddingPersistedDecisionRecord = {
  id: string;
  artifactId: string;
  artifactTitle: string;
  artifactKind: string;
  selectedOptionId: string;
  selectedOptionLabel: string;
  selectedOptionDetail: string;
  selectedOptionCells: string[];
  sourceLabels?: string[];
  sourceUrls?: string[];
  sourceProviderLabels?: string[];
  createdAt: string;
  source: string | null;
  metadataLabels: string[];
};

export type WeddingPersistedDecisionDeferral = {
  id: string;
  focusItemId: string;
  focusItemKind: string;
  title: string;
  pressureFamily: string | null;
  sourceSurface: string | null;
  dueLabel: string | null;
  dueAt: string | null;
  explanation: string | null;
  evidenceLabels: string[];
  createdAt: string;
  deferredUntilAt?: string | null;
  staleAfterAt?: string | null;
  dependencyFingerprint?: string | null;
  metadataLabels: string[];
};

export type WeddingPersistedWorkspaceState = {
  metadata: WeddingPlanningMetadata;
  artifacts: WeddingArtifactInput[];
  contextItems: WeddingNeedToKnowProjectionContext[];
  approvalReceipts: WeddingPersistedApprovalReceipt[];
  decisionRecords: WeddingPersistedDecisionRecord[];
  decisionDeferrals: WeddingPersistedDecisionDeferral[];
  boundaryObjects: WeddingBoundaryLedgerObject[];
  seatingConstraints: WeddingSeatingConstraintAction[];
  seatingOptimizations: WeddingSeatingOptimizationResult[];
  seatingDraftArchives: WeddingSeatingDraftArchiveRecord[];
  inspirationItems: WeddingInspirationItem[];
  scheduleItems: WeddingPlanningScheduleItem[];
  taskItems: WeddingPlanningTaskItem[];
  sourceMessageIds: string[];
  hasPersistedData: boolean;
};

const ARTIFACT_KINDS = new Set<WeddingArtifactKind>([
  "research",
  "vendor_table",
  "budget_sheet",
  "guest_list",
  "timeline",
  "email_draft",
  "legal",
  "registry",
  "map_collection",
  "decision_log",
]);

const SCHEDULE_KINDS = new Set<WeddingPlanningScheduleItemKind>([
  "ceremony",
  "reception",
  "venue_tour",
  "vendor_call",
  "deposit_due",
  "contract_review",
  "noim_reminder",
  "dress_fitting",
  "menu_tasting",
  "rsvp_deadline",
  "final_numbers_due",
  "rehearsal",
  "task_reminder",
  "other",
]);

const TASK_KINDS = new Set<WeddingPlanningTaskKind>([
  "research",
  "vendor_follow_up",
  "budget_review",
  "guest_list",
  "legal",
  "vow",
  "rings",
  "first_dance",
  "cake",
  "transport",
  "attire",
  "hen_party",
  "beauty",
  "music",
  "contract_review",
  "rsvp",
  "seating",
  "vendor_coordination",
  "document_checklist",
  "run_sheet",
  "weather_contingency",
  "email_draft",
  "registry",
  "decision",
  "other",
]);

const APPROVAL_ACTION_KINDS = new Set<WeddingApprovalActionKind>([
  "send_email",
  "share_artifact",
  "invite_collaborator",
  "create_external_calendar_event",
  "contact_vendor",
  "publish_registry",
  "export_sensitive_bundle",
]);

const BOUNDARY_KINDS = new Set<WeddingBoundaryLedgerKind>([
  "wedding_boundary_policy",
  "wedding_boundary_role_assignment",
  "wedding_boundary_household",
  "wedding_boundary_guest_profile",
  "wedding_boundary_event_invitation",
  "wedding_boundary_change_request",
  "wedding_boundary_decision_rationale",
  "wedding_boundary_decline_template",
  "wedding_boundary_visibility_page",
]);

const BOUNDARY_VISIBILITIES = new Set<WeddingBoundaryVisibility>([
  "couple_only",
  "approved_shared",
  "family_visible",
  "vendor_logistics",
]);

const BOUNDARY_POLICY_RULE_TYPES = new Set<WeddingBoundaryPolicyRuleType>([
  "plus_one",
  "children",
  "invitation_scope",
  "access",
  "seating",
  "communication",
]);

const BOUNDARY_POLICY_ENFORCEMENTS = new Set<WeddingBoundaryPolicyEnforcement>([
  "block",
  "require_approval",
  "warn",
]);

const BOUNDARY_ROLES = new Set<WeddingBoundaryRole>([
  "couple",
  "parent_family",
  "helper",
  "vendor",
  "guest",
]);

const BOUNDARY_REQUEST_STATUSES = new Set<WeddingBoundaryRequestStatus>([
  "pending",
  "approved",
  "declined",
  "auto_blocked",
]);

const SEATING_CONSTRAINT_KINDS = new Set<WeddingSeatingConstraintKind>([
  "keep_apart",
  "prefer_together",
  "prefer_quiet",
  "social_group_together",
]);

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boundedClean(value: unknown, limit: number): string | null {
  const trimmed = clean(value);
  return trimmed ? trimmed.slice(0, Math.max(0, limit)) : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function uniqueStrings(value: unknown, limit = 32): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of strings(value)) {
    const tag = item.trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= limit) break;
  }
  return result;
}

function usableSourceUrls(value: unknown): string[] {
  return strings(value).filter((url) => /^https?:\/\//i.test(url.trim()));
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

function numbers(value: unknown): number[] {
  return Array.isArray(value)
    ? value
      .map((item) => typeof item === "number" ? item : typeof item === "string" ? Number(item) : NaN)
      .filter((item) => Number.isFinite(item) && item >= 0)
    : [];
}

function bool(value: unknown): boolean {
  return value === true || value === "true";
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function sourceFileName(value: unknown, fallback: unknown): string | null {
  const raw = boundedClean(value, 180) ?? boundedClean(fallback, 180);
  const parts = raw?.split(/[\\/]+/).map((part) => part.trim()).filter(Boolean) ?? [];
  return parts.at(-1) ?? null;
}

function sanitizedStorageReceipt(value: unknown): Record<string, unknown> | null {
  const storage = record(value);
  if (!storage) return null;
  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(storage).slice(0, 16)) {
    const safeKey = boundedClean(key, 80);
    if (!safeKey) continue;
    if (typeof item === "string") sanitized[safeKey] = boundedClean(item, 500);
    else if (typeof item === "number" && Number.isFinite(item)) sanitized[safeKey] = item;
    else if (typeof item === "boolean" || item === null) sanitized[safeKey] = item;
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function originalUploadMetadata(message: AfpMessage, title: string): Record<string, unknown> {
  const originalUpload = record(contentValue(message, "original_upload"));
  const sizeBytes = contentValue(message, "original_upload_size_bytes") ?? originalUpload?.original_upload_size_bytes;
  return {
    originalUploadStatus: boundedClean(contentValue(message, "original_upload_status") ?? originalUpload?.original_upload_status, 80),
    originalUploadMessageId: boundedClean(contentValue(message, "original_upload_message_id") ?? originalUpload?.original_upload_message_id, 200),
    originalUploadAttachmentId: boundedClean(contentValue(message, "original_upload_attachment_id") ?? originalUpload?.original_upload_attachment_id, 200),
    originalUploadSha256: boundedClean(contentValue(message, "original_upload_sha256") ?? originalUpload?.original_upload_sha256, 256),
    originalUploadFileName: sourceFileName(contentValue(message, "original_upload_file_name") ?? originalUpload?.original_upload_file_name, title),
    originalUploadMimeType: boundedClean(contentValue(message, "original_upload_mime_type") ?? originalUpload?.original_upload_mime_type, 160),
    originalUploadSizeBytes: typeof sizeBytes === "number" && Number.isFinite(sizeBytes) ? Math.max(0, sizeBytes) : null,
    originalUploadStorage: sanitizedStorageReceipt(contentValue(message, "original_upload_storage") ?? originalUpload?.original_upload_storage),
    originalUploadFailureLabel: boundedClean(contentValue(message, "original_upload_failure_label") ?? originalUpload?.original_upload_failure_label, 240),
  };
}

function sanitizedSelectedDecisionScope(value: unknown): Record<string, unknown> | null {
  const scope = record(value);
  if (!scope) return null;
  const artifactTitle = clean(scope.artifact_title ?? scope.artifactTitle);
  const sourceLabels = uniqueStrings(scope.source_labels ?? scope.sourceLabels, 12);
  const metadataLabels = uniqueStrings(scope.metadata_labels ?? scope.metadataLabels, 12);
  const importedPrivateScope = [
    artifactTitle,
    ...sourceLabels,
    ...metadataLabels,
  ].filter((label): label is string => Boolean(label)).some(importedPrivateLabel);
  const sourceUrls = uniqueStrings(scope.source_urls ?? scope.sourceUrls, 12)
    .filter((url) => /^https?:\/\//i.test(url))
    .filter((url) => !importedPrivateScope || !privateImportSourceUrl(url));

  return {
    ...scope,
    artifact_title: importedPrivateScope ? "Imported private planning file" : artifactTitle,
    artifactTitle: undefined,
    source_labels: importedPrivateScope && sourceLabels.length > 0 ? ["Imported private planning file"] : sourceLabels,
    sourceLabels: undefined,
    source_urls: sourceUrls,
    sourceUrls: undefined,
    metadata_labels: importedPrivateScope
      ? metadataLabels.filter((label) => !importedPrivateLabel(label))
      : metadataLabels,
    metadataLabels: undefined,
    imported_private_evidence: importedPrivateScope || scope.imported_private_evidence === true,
  };
}

function sourceLinks(value: unknown): WeddingArtifactSourceLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): WeddingArtifactSourceLink[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const label = clean(record.label);
    const url = clean(record.url);
    return label && url && /^https?:\/\//i.test(url) ? [{ label, url }] : [];
  });
}

function contentValue(message: AfpMessage, key: string): unknown {
  return decryptedDisplayContent(message)[key] ?? message.metadata?.[key];
}

function secondOrderTaskMetadata(message: AfpMessage, metadata: WeddingPlanningMetadata): WeddingPlanningMetadata | Record<string, unknown> {
  const secondOrderLoop = clean(contentValue(message, "second_order_loop"));
  const preparationChecklistItem = clean(contentValue(message, "preparation_checklist_item"));
  const alertOffsetDays = numbers(contentValue(message, "alert_offset_days"));
  const alertDates = strings(contentValue(message, "alert_dates"));
  if (!secondOrderLoop && !preparationChecklistItem && alertOffsetDays.length === 0 && alertDates.length === 0) return metadata;
  return {
    ...metadata,
    second_order_task: message.metadata?.second_order_task === true || Boolean(secondOrderLoop),
    second_order_loop: secondOrderLoop,
    second_order_evidence_labels: strings(contentValue(message, "second_order_evidence_labels")),
    second_order_linked_artifact_id: clean(message.metadata?.second_order_linked_artifact_id),
    selected_decision_scope: sanitizedSelectedDecisionScope(message.metadata?.selected_decision_scope),
    preparation_checklist: contentValue(message, "preparation_checklist") === true || Boolean(preparationChecklistItem),
    preparation_checklist_item: preparationChecklistItem,
    alert_offset_days: alertOffsetDays,
    alert_dates: alertDates,
    schedule_basis: clean(contentValue(message, "schedule_basis")),
  };
}

function scheduleItemMetadata(message: AfpMessage, metadata: WeddingPlanningMetadata): WeddingPlanningMetadata | Record<string, unknown> {
  const alertReminderForTaskId = clean(contentValue(message, "alert_reminder_for_task_id"));
  const alertDate = clean(contentValue(message, "alert_date"));
  const alertOffsetDays = numbers(contentValue(message, "alert_offset_days"));
  const alertDates = strings(contentValue(message, "alert_dates"));
  const preparationChecklistItem = clean(contentValue(message, "preparation_checklist_item"));
  if (!alertReminderForTaskId && !alertDate && alertOffsetDays.length === 0 && alertDates.length === 0 && !preparationChecklistItem) {
    return metadata;
  }
  return {
    ...metadata,
    alert_reminder: contentValue(message, "alert_reminder") === true || Boolean(alertReminderForTaskId || alertDate),
    alert_reminder_for_task_id: alertReminderForTaskId,
    alert_date: alertDate,
    alert_offset_days: alertOffsetDays,
    alert_dates: alertDates,
    preparation_checklist: contentValue(message, "preparation_checklist") === true || Boolean(preparationChecklistItem),
    preparation_checklist_item: preparationChecklistItem,
  };
}

function workspaceIdFrom(message: AfpMessage): string | null {
  return clean(contentValue(message, "response_workspace_id")) ?? clean(message.metadata?.responseWorkspaceId);
}

function planIdFrom(message: AfpMessage): string | null {
  return clean(contentValue(message, "wedding_plan_id")) ?? clean(message.metadata?.weddingPlanId);
}

function sourceResponseIdFrom(message: AfpMessage): string | null {
  return clean(contentValue(message, "source_response_id")) ?? clean(message.metadata?.sourceResponseId);
}

function artifactKindFrom(value: unknown): WeddingArtifactKind | null {
  return typeof value === "string" && ARTIFACT_KINDS.has(value as WeddingArtifactKind)
    ? value as WeddingArtifactKind
    : null;
}

function scheduleKindFrom(value: unknown): WeddingPlanningScheduleItemKind {
  return typeof value === "string" && SCHEDULE_KINDS.has(value as WeddingPlanningScheduleItemKind)
    ? value as WeddingPlanningScheduleItemKind
    : "other";
}

function taskKindFrom(value: unknown): WeddingPlanningTaskKind {
  return typeof value === "string" && TASK_KINDS.has(value as WeddingPlanningTaskKind)
    ? value as WeddingPlanningTaskKind
    : "other";
}

function approvalActionKindFrom(value: unknown): WeddingApprovalActionKind | "unknown" {
  return typeof value === "string" && APPROVAL_ACTION_KINDS.has(value as WeddingApprovalActionKind)
    ? value as WeddingApprovalActionKind
    : "unknown";
}

function approvalBlockKindFrom(value: unknown): WeddingApprovalBlockKind | null {
  if (
    value === "needs_user_approval"
    || value === "provider_missing"
    || value === "unsupported_integration"
    || value === "privacy_scope"
  ) return value;
  return null;
}

function boundaryKindFrom(value: unknown): WeddingBoundaryLedgerKind | null {
  return typeof value === "string" && BOUNDARY_KINDS.has(value as WeddingBoundaryLedgerKind)
    ? value as WeddingBoundaryLedgerKind
    : null;
}

function boundaryVisibilityFrom(value: unknown): WeddingBoundaryVisibility | null {
  return typeof value === "string" && BOUNDARY_VISIBILITIES.has(value as WeddingBoundaryVisibility)
    ? value as WeddingBoundaryVisibility
    : null;
}

function boundaryPolicyRuleTypeFrom(value: unknown): WeddingBoundaryPolicyRuleType {
  return typeof value === "string" && BOUNDARY_POLICY_RULE_TYPES.has(value as WeddingBoundaryPolicyRuleType)
    ? value as WeddingBoundaryPolicyRuleType
    : "invitation_scope";
}

function boundaryPolicyEnforcementFrom(value: unknown): WeddingBoundaryPolicyEnforcement {
  return typeof value === "string" && BOUNDARY_POLICY_ENFORCEMENTS.has(value as WeddingBoundaryPolicyEnforcement)
    ? value as WeddingBoundaryPolicyEnforcement
    : "require_approval";
}

function boundaryRoleFrom(value: unknown): WeddingBoundaryRole {
  return typeof value === "string" && BOUNDARY_ROLES.has(value as WeddingBoundaryRole)
    ? value as WeddingBoundaryRole
    : "helper";
}

function boundaryRequestStatusFrom(value: unknown): WeddingBoundaryRequestStatus {
  return typeof value === "string" && BOUNDARY_REQUEST_STATUSES.has(value as WeddingBoundaryRequestStatus)
    ? value as WeddingBoundaryRequestStatus
    : "pending";
}

function seatingConstraintKindFrom(value: unknown): WeddingSeatingConstraintKind | null {
  return typeof value === "string" && SEATING_CONSTRAINT_KINDS.has(value as WeddingSeatingConstraintKind)
    ? value as WeddingSeatingConstraintKind
    : null;
}

function noimValue(value: unknown): WeddingPlanningContext["noimDownloaded"] {
  if (value === true || value === false) return value;
  const normalized = clean(value);
  return normalized === "yes" || normalized === "no" || normalized === "unknown" ? normalized : null;
}

function baseMetadata(message: AfpMessage, fallback: WeddingPlanningMetadata): WeddingPlanningMetadata {
  return normalizeWeddingPlanningMetadata({
    ...(message.metadata ?? {}),
    weddingPlanId: planIdFrom(message) ?? fallback.weddingPlanId,
    responseWorkspaceId: workspaceIdFrom(message) ?? fallback.responseWorkspaceId,
    sourceResponseId: sourceResponseIdFrom(message) ?? fallback.sourceResponseId,
    privacyScope: contentValue(message, "privacy_scope") ?? message.metadata?.privacy_scope ?? fallback.privacyScope,
    approvalState: contentValue(message, "approval_state") ?? message.metadata?.approval_state ?? fallback.approvalState,
    supertags: message.supertags ?? fallback.supertags,
  });
}

function messageToArtifactInput(message: AfpMessage, fallback: WeddingPlanningMetadata): WeddingArtifactInput | null {
  const kind = artifactKindFrom(contentValue(message, "artifact_kind"));
  const workspaceId = workspaceIdFrom(message);
  if (message.subtype !== "wedding_artifact" || !kind || !workspaceId) return null;
  const metadata = baseMetadata(message, fallback);
  const title = clean(contentValue(message, "title")) ?? clean(message.metadata?.artifact_title) ?? "Wedding planning file";
  return {
    id: clean(contentValue(message, "artifact_id")) ?? message.id,
    title,
    kind,
    createdAt: Date.parse(message.timestamp) || Date.now(),
    metadata: {
      ...metadata,
      artifactKind: kind,
      ...originalUploadMetadata(message, title),
    },
    exportTargets: strings(contentValue(message, "export_targets")),
    sourceLabels: strings(contentValue(message, "source_labels")),
    sourceLinks: sourceLinks(contentValue(message, "source_links")),
    locationLabels: strings(contentValue(message, "location_labels")),
    vendorLabels: strings(contentValue(message, "vendor_labels")),
    linkedTaskIds: strings(contentValue(message, "linked_task_ids")),
    linkedCalendarEventIds: strings(contentValue(message, "linked_calendar_event_ids")),
    bodyText: clean(contentValue(message, "markdown")) ?? clean(contentValue(message, "csv")),
  };
}

function messageToScheduleItem(message: AfpMessage, fallback: WeddingPlanningMetadata): WeddingPlanningScheduleItem | null {
  if (message.subtype !== "wedding_event" || workspaceIdFrom(message) === null) return null;
  const metadata = baseMetadata(message, fallback);
  return {
    id: clean(contentValue(message, "wedding_schedule_item_id")) ?? message.id,
    title: clean(contentValue(message, "title")) ?? "Wedding date",
    kind: scheduleKindFrom(contentValue(message, "wedding_event_kind")),
    startAt: clean(contentValue(message, "start_at")),
    endAt: clean(contentValue(message, "end_at")),
    allDay: contentValue(message, "all_day") === true,
    location: clean(contentValue(message, "location")),
    participants: strings(contentValue(message, "participants")),
    source: "agent",
    reviewStatus: "accepted",
    approvalState: metadata.approvalState,
    metadata: scheduleItemMetadata(message, metadata),
    linkedArtifactId: clean(contentValue(message, "linked_artifact_id")),
    notes: clean(contentValue(message, "description")),
  };
}

function messageToTaskItem(message: AfpMessage, fallback: WeddingPlanningMetadata): WeddingPlanningTaskItem | null {
  if (message.subtype !== "wedding_task" || workspaceIdFrom(message) === null) return null;
  const metadata = baseMetadata(message, fallback);
  return {
    id: clean(contentValue(message, "wedding_task_item_id")) ?? message.id,
    title: clean(contentValue(message, "title")) ?? "Wedding task",
    kind: taskKindFrom(contentValue(message, "wedding_task_kind")),
    dueAt: clean(contentValue(message, "due_at")),
    dueLabel: clean(contentValue(message, "due_label")),
    priority: clean(contentValue(message, "priority")) as WeddingPlanningTaskItem["priority"],
    assignee: clean(contentValue(message, "assignee")),
    source: "agent",
    reviewStatus: "accepted",
    approvalState: metadata.approvalState,
    metadata: secondOrderTaskMetadata(message, metadata),
    linkedArtifactId: clean(contentValue(message, "linked_artifact_id")),
    notes: clean(contentValue(message, "description")),
  };
}

function messageToNeedToKnowContext(
  message: AfpMessage,
  fallback: WeddingPlanningMetadata,
): WeddingNeedToKnowProjectionContext | null {
  if (message.subtype !== "wedding_need_to_know" || workspaceIdFrom(message) === null) return null;
  const metadata = baseMetadata(message, fallback);
  const context = record(contentValue(message, "planning_context"));
  const topPriorities = strings(context?.topPriorities ?? context?.top_priorities);
  const planningContext: WeddingPlanningContext = {
    dateOrSeason: clean(context?.dateOrSeason ?? context?.date_or_season),
    location: clean(context?.location),
    guestCount: typeof context?.guestCount === "number"
      ? context.guestCount
      : clean(context?.guestCount ?? context?.guest_count),
    budgetComfort: clean(context?.budgetComfort ?? context?.budget_comfort),
    topPriorities,
    countryCode: clean(context?.countryCode ?? context?.country_code),
    legalJurisdiction: clean(context?.legalJurisdiction ?? context?.legal_jurisdiction),
    noimDownloaded: noimValue(context?.noimDownloaded ?? context?.noim_downloaded),
    celebrantPath: clean(context?.celebrantPath ?? context?.celebrant_path),
    culturalOrReligiousRequirements: clean(context?.culturalOrReligiousRequirements ?? context?.cultural_or_religious_requirements),
    accessibilityRequirements: clean(context?.accessibilityRequirements ?? context?.accessibility_requirements),
    dietaryRequirements: clean(context?.dietaryRequirements ?? context?.dietary_requirements),
    familyOrStakeholderRoles: clean(context?.familyOrStakeholderRoles ?? context?.family_or_stakeholder_roles),
    decisionContext: clean(context?.decisionContext ?? context?.decision_context) as WeddingPlanningContext["decisionContext"],
  };
  return {
    metadata,
    planningContext,
    answeredLabels: strings(contentValue(message, "answered_labels")),
    nextQuestionLabel: clean(contentValue(message, "next_question_label")) ?? "Continue wedding planning.",
    readyForFirstRecommendations: contentValue(message, "ready_for_first_recommendations") === true,
    projectionSaved: true,
  };
}

function messageToApprovalReceipt(message: AfpMessage): WeddingPersistedApprovalReceipt | null {
  if (message.subtype !== "wedding_approval_receipt" || workspaceIdFrom(message) === null) return null;
  const status = contentValue(message, "status");
  return {
    id: clean(contentValue(message, "receipt_id")) ?? message.id,
    requestId: clean(contentValue(message, "request_id")) ?? "",
    actionKind: approvalActionKindFrom(contentValue(message, "action_kind")),
    title: clean(contentValue(message, "title")) ?? "Wedding approval receipt",
    status: status === "executed" ? "executed" : "blocked",
    createdAt: clean(contentValue(message, "created_at")) ?? message.timestamp,
    disclosureLines: strings(contentValue(message, "disclosure_lines")),
    riskLabels: strings(contentValue(message, "risk_labels")),
    blockedReason: clean(contentValue(message, "blocked_reason")),
    blockKind: approvalBlockKindFrom(contentValue(message, "block_kind") ?? message.metadata?.block_kind),
    externalId: clean(contentValue(message, "external_id")),
    executionMode: clean(contentValue(message, "execution_mode")),
    providerCapability: clean(contentValue(message, "provider_capability")),
    requiredProvider: clean(contentValue(message, "required_provider")),
    providerCredentialStatus: clean(contentValue(message, "provider_credential_status")),
    providerExecutorStatus: clean(contentValue(message, "provider_executor_status")),
    providerExecutorConnected: bool(contentValue(message, "provider_executor_connected")),
    providerSetupView: clean(contentValue(message, "provider_setup_view")),
    externalProviderRequired: bool(contentValue(message, "external_provider_required")),
    artifactIds: strings(contentValue(message, "artifact_ids")),
    scheduleItemIds: strings(contentValue(message, "schedule_item_ids")),
    taskItemIds: strings(contentValue(message, "task_item_ids")),
  };
}

function messageToDecisionRecord(message: AfpMessage): WeddingPersistedDecisionRecord | null {
  if (message.subtype !== "wedding_decision_selection" || workspaceIdFrom(message) === null) return null;
  const selectedOption = record(contentValue(message, "selected_option"));
  const id = clean(contentValue(message, "decision_id")) ?? message.id;
  const artifactId = clean(contentValue(message, "artifact_id"));
  const artifactTitle = clean(contentValue(message, "artifact_title"));
  const artifactKind = clean(contentValue(message, "artifact_kind"));
  const selectedOptionId = clean(selectedOption?.id ?? message.metadata?.selected_option_id);
  const selectedOptionLabel = clean(selectedOption?.label ?? message.metadata?.selected_option_label);
  if (!id || !artifactId || !artifactTitle || !selectedOptionId || !selectedOptionLabel) return null;

  const selectedOptionDetail = clean(selectedOption?.detail) ?? "Selected option is saved for future wedding reports.";
  const rawSourceLabels = strings(contentValue(message, "source_labels") ?? message.metadata?.source_labels).slice(0, 12);
  const rawSourceUrls = usableSourceUrls(contentValue(message, "source_urls") ?? message.metadata?.source_urls).slice(0, 12);
  const sourceProviderLabels = strings(contentValue(message, "source_provider_labels") ?? message.metadata?.source_provider_labels).slice(0, 12);
  const importedPrivateDecision = [
    artifactId,
    artifactTitle,
    ...rawSourceLabels,
    ...strings(message.metadata?.supertags),
  ].filter(Boolean).some(importedPrivateLabel);
  const safeArtifactTitle = importedPrivateDecision ? "Imported private planning file" : artifactTitle;
  const sourceLabels = importedPrivateDecision && rawSourceLabels.length > 0
    ? ["Imported private planning file"]
    : rawSourceLabels;
  const sourceUrls = importedPrivateDecision
    ? rawSourceUrls.filter((url) => !privateImportSourceUrl(url))
    : rawSourceUrls;
  const sourceMetadataLabels = importedPrivateDecision
    ? sourceLabels
    : rawSourceLabels.slice(0, 3);
  return {
    id,
    artifactId,
    artifactTitle: safeArtifactTitle,
    artifactKind: artifactKind ?? "unknown",
    selectedOptionId,
    selectedOptionLabel,
    selectedOptionDetail,
    selectedOptionCells: strings(selectedOption?.cells).slice(0, 12),
    sourceLabels,
    sourceUrls,
    sourceProviderLabels,
    createdAt: clean(contentValue(message, "created_at")) ?? message.timestamp,
    source: clean(contentValue(message, "source")),
    metadataLabels: [
      safeArtifactTitle,
      artifactKind ? artifactKind.replace(/_/g, " ") : null,
      selectedOptionId,
      ...sourceProviderLabels.slice(0, 3),
      ...sourceMetadataLabels,
      clean(message.metadata?.projection),
    ].filter((label): label is string => Boolean(label)),
  };
}

function messageToDecisionDeferral(message: AfpMessage): WeddingPersistedDecisionDeferral | null {
  if (message.subtype !== "wedding_decision_deferral" || workspaceIdFrom(message) === null) return null;
  const id = clean(contentValue(message, "deferral_id")) ?? clean(message.metadata?.deferral_id) ?? message.id;
  const focusItemId = clean(contentValue(message, "focus_item_id") ?? message.metadata?.focus_item_id);
  const title = clean(contentValue(message, "title") ?? message.metadata?.focus_item_title);
  if (!id || !focusItemId || !title) return null;
  const focusItemKind = clean(contentValue(message, "focus_item_kind") ?? message.metadata?.focus_item_kind) ?? "unknown";
  const pressureFamily = clean(contentValue(message, "pressure_family"));
  const sourceSurface = clean(contentValue(message, "source_surface"));
  const dueLabel = clean(contentValue(message, "due_label"));
  const dueAt = clean(contentValue(message, "due_at"));
  const explanation = clean(contentValue(message, "explanation"));
  const evidenceLabels = strings(contentValue(message, "evidence_labels")).slice(0, 8);
  const deferredUntilAt = clean(contentValue(message, "deferred_until_at") ?? message.metadata?.deferred_until_at);
  const staleAfterAt = clean(contentValue(message, "stale_after_at") ?? message.metadata?.stale_after_at);
  const dependencyFingerprint = clean(contentValue(message, "dependency_fingerprint") ?? message.metadata?.dependency_fingerprint);
  return {
    id,
    focusItemId,
    focusItemKind,
    title,
    pressureFamily,
    sourceSurface,
    dueLabel,
    dueAt,
    explanation,
    evidenceLabels,
    createdAt: clean(contentValue(message, "created_at")) ?? message.timestamp,
    deferredUntilAt,
    staleAfterAt,
    dependencyFingerprint,
    metadataLabels: [
      "deferred decision",
      focusItemKind.replace(/_/g, " "),
      pressureFamily?.replace(/_/g, " "),
      sourceSurface?.replace(/_/g, " "),
      dueLabel,
      deferredUntilAt ? `bring back ${deferredUntilAt.slice(0, 10)}` : null,
      clean(message.metadata?.projection),
    ].filter((label): label is string => Boolean(label)),
  };
}

function messageToSeatingConstraint(message: AfpMessage): WeddingSeatingConstraintAction | null {
  if (message.subtype !== "wedding_seating_constraint" || workspaceIdFrom(message) === null) return null;
  const kind = seatingConstraintKindFrom(contentValue(message, "constraint_kind") ?? message.metadata?.seating_constraint_kind);
  const instruction = clean(contentValue(message, "instruction"));
  if (!kind || !instruction) return null;
  const confidenceValue = clean(contentValue(message, "confidence"));
  const confidence = confidenceValue === "high" || confidenceValue === "medium" || confidenceValue === "low"
    ? confidenceValue
    : "medium";
  return {
    id: clean(contentValue(message, "constraint_id")) ?? message.id,
    kind,
    instruction,
    primaryPersonId: clean(message.references?.find((reference) => reference.type === "seating_constraint_primary_person")?.target),
    relatedPersonId: clean(message.references?.find((reference) => reference.type === "seating_constraint_related_person")?.target),
    socialGroup: clean(message.references?.find((reference) => reference.type === "seating_constraint_social_group")?.target),
    confidence,
    statusLabel: clean(contentValue(message, "status_label")) ?? "Seating instruction saved.",
  };
}

function boundaryBase(message: AfpMessage, fallback: WeddingPlanningMetadata): {
  id: string;
  title: string;
  status: string | null;
  visibility: WeddingBoundaryVisibility | null;
  createdAt: string;
  metadata: Record<string, unknown>;
} {
  return {
    id: clean(contentValue(message, "boundary_object_id")) ?? clean(message.metadata?.boundary_object_id) ?? message.id,
    title: clean(contentValue(message, "title")) ?? "Wedding boundary record",
    status: clean(contentValue(message, "status")),
    visibility: boundaryVisibilityFrom(contentValue(message, "visibility")),
    createdAt: clean(contentValue(message, "created_at")) ?? message.timestamp,
    metadata: {
      ...baseMetadata(message, fallback),
      persisted_afp_message_id: message.id,
      persisted_boundary_ledger: true,
    },
  };
}

function messageToBoundaryObject(message: AfpMessage, fallback: WeddingPlanningMetadata): WeddingBoundaryLedgerObject | null {
  const kind = boundaryKindFrom(message.subtype ?? message.kind ?? contentValue(message, "ledger_kind"));
  if (!kind || workspaceIdFrom(message) === null) return null;
  const base = boundaryBase(message, fallback);
  if (kind === "wedding_boundary_policy") {
    return {
      ...base,
      kind,
      ruleType: boundaryPolicyRuleTypeFrom(contentValue(message, "rule_type")),
      enforcement: boundaryPolicyEnforcementFrom(contentValue(message, "enforcement")),
      plainLanguage: clean(contentValue(message, "plain_language")) ?? base.title,
      scope: clean(contentValue(message, "scope")) as WeddingBoundaryPolicy["scope"],
      approvedBy: strings(contentValue(message, "approved_by")),
    };
  }
  if (kind === "wedding_boundary_role_assignment") {
    const personId = clean(contentValue(message, "person_id"));
    if (!personId) return null;
    return {
      ...base,
      kind,
      personId,
      role: boundaryRoleFrom(contentValue(message, "role")),
      canView: strings(contentValue(message, "can_view")),
      canSuggest: strings(contentValue(message, "can_suggest")) as WeddingBoundaryRoleAssignment["canSuggest"],
      canEdit: strings(contentValue(message, "can_edit")) as WeddingBoundaryRoleAssignment["canEdit"],
      requiresApprovalFor: strings(contentValue(message, "requires_approval_for")) as WeddingBoundaryRoleAssignment["requiresApprovalFor"],
      privateNotesVisible: bool(contentValue(message, "private_notes_visible")),
    };
  }
  if (kind === "wedding_boundary_household") {
    const householdId = clean(contentValue(message, "household_id"));
    if (!householdId) return null;
    return {
      ...base,
      kind,
      householdId,
      displayName: clean(contentValue(message, "display_name")) ?? base.title,
      primaryContactPersonId: clean(contentValue(message, "primary_contact_person_id")),
      memberPersonIds: strings(contentValue(message, "member_person_ids")),
      familySide: clean(contentValue(message, "family_side")) as WeddingBoundaryHousehold["familySide"],
    };
  }
  if (kind === "wedding_boundary_guest_profile") {
    const personId = clean(contentValue(message, "person_id"));
    if (!personId) return null;
    return {
      ...base,
      kind,
      personId,
      displayName: clean(contentValue(message, "display_name")) ?? base.title,
      householdId: clean(contentValue(message, "household_id")),
      ageBand: clean(contentValue(message, "age_band")) as WeddingBoundaryGuestProfile["ageBand"],
      relationshipLabel: clean(contentValue(message, "relationship_label")),
      familySide: clean(contentValue(message, "family_side")) as WeddingBoundaryGuestProfile["familySide"],
    };
  }
  if (kind === "wedding_boundary_event_invitation") {
    const invitationId = clean(contentValue(message, "invitation_id"));
    const eventId = clean(contentValue(message, "event_id"));
    const personId = clean(contentValue(message, "person_id"));
    if (!invitationId || !eventId || !personId) return null;
    return {
      ...base,
      kind,
      invitationId,
      eventId,
      personId,
      invitationStatus: clean(contentValue(message, "invitation_status")) as WeddingBoundaryEventInvitation["invitationStatus"] ?? "invited",
      plusOneAllowed: bool(contentValue(message, "plus_one_allowed")),
      childrenInvited: bool(contentValue(message, "children_invited")),
      visibleToGuest: contentValue(message, "visible_to_guest") !== false,
    };
  }
  if (kind === "wedding_boundary_change_request") {
    const requestId = clean(contentValue(message, "request_id"));
    const requestedBy = clean(contentValue(message, "requested_by"));
    if (!requestId || !requestedBy) return null;
    return {
      ...base,
      kind,
      requestId,
      requestedBy,
      changeType: clean(contentValue(message, "change_type")) as WeddingBoundaryChangeRequest["changeType"] ?? "add_guest",
      targetPersonId: clean(contentValue(message, "target_person_id")),
      targetEventId: clean(contentValue(message, "target_event_id")),
      targetHouseholdId: clean(contentValue(message, "target_household_id")),
      requestStatus: boundaryRequestStatusFrom(contentValue(message, "request_status")),
      approvalRequired: bool(contentValue(message, "approval_gate_recorded")) || bool(contentValue(message, "approval_required")),
      policyIds: strings(contentValue(message, "policy_ids")),
      publicReason: clean(contentValue(message, "public_reason")),
    };
  }
  if (kind === "wedding_boundary_decision_rationale") {
    const decisionId = clean(contentValue(message, "decision_id"));
    if (!decisionId) return null;
    return {
      ...base,
      kind,
      decisionId,
      linkedPolicyId: clean(contentValue(message, "linked_policy_id")),
      summaryPublic: clean(contentValue(message, "summary_public")),
      rationaleCiphertext: clean(contentValue(message, "encrypted_private_payload")) ?? "",
    } satisfies WeddingBoundaryDecisionRationale;
  }
  return null;
}

export function buildWeddingPersistedWorkspaceState(input: {
  messages?: readonly AfpMessage[] | null;
  weddingPlanId: string;
  responseWorkspaceId: string;
  sourceResponseId?: string | null;
}): WeddingPersistedWorkspaceState {
  const metadata = normalizeWeddingPlanningMetadata({
    weddingPlanId: input.weddingPlanId,
    responseWorkspaceId: input.responseWorkspaceId,
    sourceResponseId: input.sourceResponseId ?? null,
    supertags: ["template:wedding_planning", "event:wedding", "response_workspace"],
  });
  const scopedMessages = (input.messages ?? []).filter((message) => workspaceIdFrom(message) === metadata.responseWorkspaceId);
  const artifacts = scopedMessages.flatMap((message) => {
    const artifact = messageToArtifactInput(message, metadata);
    return artifact ? [artifact] : [];
  });
  const contextItems = scopedMessages.flatMap((message) => {
    const item = messageToNeedToKnowContext(message, metadata);
    return item ? [item] : [];
  });
  const approvalReceipts = scopedMessages.flatMap((message) => {
    const item = messageToApprovalReceipt(message);
    return item ? [item] : [];
  });
  const decisionRecords = scopedMessages.flatMap((message) => {
    const item = messageToDecisionRecord(message);
    return item ? [item] : [];
  });
  const decisionDeferrals = scopedMessages.flatMap((message) => {
    const item = messageToDecisionDeferral(message);
    return item ? [item] : [];
  });
  const boundaryObjects = coalesceWeddingBoundaryLedgerObjects(scopedMessages.flatMap((message) => {
    const item = messageToBoundaryObject(message, metadata);
    return item ? [item] : [];
  }));
  const seatingConstraints = scopedMessages.flatMap((message) => {
    const item = messageToSeatingConstraint(message);
    return item ? [item] : [];
  });
  const seatingOptimizations = scopedMessages
    .flatMap((message) => {
      const item = weddingSeatingOptimizationResultFromAfpMessage(message);
      return item ? [{ item, timestamp: Date.parse(message.timestamp) || 0 }] : [];
    })
    .sort((left, right) => left.timestamp - right.timestamp)
    .map((entry) => entry.item);
  const seatingDraftArchives = scopedMessages
    .flatMap((message) => {
      const item = weddingSeatingDraftArchiveFromAfpMessage(message);
      return item ? [{ item, timestamp: Date.parse(message.timestamp) || 0 }] : [];
    })
    .sort((left, right) => left.timestamp - right.timestamp)
    .map((entry) => entry.item);
  const inspirationItems = buildWeddingInspirationState(scopedMessages
    .flatMap((message) => weddingInspirationItemsFromAfpMessage(message).map((item) => ({
      item,
      timestamp: Date.parse(message.timestamp) || Date.parse(item.createdAt) || 0,
    })))
    .sort((left, right) => left.timestamp - right.timestamp)
    .map((entry) => entry.item)).items;
  const scheduleItems = scopedMessages.flatMap((message) => {
    const item = messageToScheduleItem(message, metadata);
    return item ? [item] : [];
  });
  const taskItems = scopedMessages.flatMap((message) => {
    const item = messageToTaskItem(message, metadata);
    return item ? [item] : [];
  });

  return {
    metadata,
    artifacts,
    contextItems,
    approvalReceipts,
    decisionRecords,
    decisionDeferrals,
    boundaryObjects,
    seatingConstraints,
    seatingOptimizations,
    seatingDraftArchives,
    inspirationItems,
    scheduleItems,
    taskItems,
    sourceMessageIds: scopedMessages.map((message) => message.id),
    hasPersistedData: artifacts.length > 0
      || contextItems.length > 0
      || approvalReceipts.length > 0
      || decisionRecords.length > 0
      || decisionDeferrals.length > 0
      || boundaryObjects.length > 0
      || seatingConstraints.length > 0
      || seatingOptimizations.length > 0
      || seatingDraftArchives.length > 0
      || inspirationItems.length > 0
      || scheduleItems.length > 0
      || taskItems.length > 0,
  };
}
