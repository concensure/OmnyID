// @locs-version: 2.0
import type { AfpMessage } from "@/lib/api";
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
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
  type WeddingBoundaryLedgerObject,
} from "@/lib/weddingBoundaryLedgerState";
import {
  weddingPersistedBoundaryObjectFromAfpMessage,
  weddingPersistedSeatingConstraintFromAfpMessage,
} from "@/lib/weddingPersistedBoundaryObjectState";
import { weddingRsvpResponseInvitationFromAfpMessage } from "@/lib/weddingRsvpResponseState";
import {
  applyWeddingPersistedTaskDateUpdates,
  weddingPersistedTaskDateUpdateFromAfpMessage,
} from "@/lib/weddingPersistedTaskDateState";
import {
  bool,
  boundedClean,
  clean,
  contentValue,
  importedPrivateLabel,
  numbers,
  optionalBool,
  originalUploadMetadata,
  planIdFrom,
  privateImportSourceUrl,
  record,
  sanitizedSelectedDecisionScope,
  sourceLinks,
  sourceResponseIdFrom,
  strings,
  uniqueStrings,
  usableSourceUrls,
  workspaceIdFrom,
} from "@/lib/weddingPersistedWorkspaceMessageState";
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
} from "@/lib/weddingSeatingConstraintActionState";
import {
  isWeddingSemanticUiKind,
  weddingSemanticUiObjectsFromAfpLikeMessage,
  type WeddingSemanticUiKind,
  type WeddingSemanticUiObject,
} from "@/lib/weddingSemanticUiState";

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
  providerReceiptId?: string | null;
  providerMessageId?: string | null;
  messageId?: string | null;
  clientMessageId?: string | null;
  deliveryChannel?: string | null;
  deliverySubject?: string | null;
  deliveryThreadId?: string | null;
  deliveryInReplyTo?: string | null;
  deliveryReferences?: string[];
  deliveryRecipients?: string[];
  executionMode: string | null;
  providerCapability: string | null;
  requiredProvider: string | null;
  providerCredentialStatus: string | null;
  providerExecutorStatus: string | null;
  providerExecutorConnected: boolean;
  providerResultOk?: boolean;
  externalDeliveryPerformed?: boolean;
  missingDurableProviderReceipt?: boolean;
  providerSetupView: string | null;
  externalProviderRequired: boolean;
  artifactIds: string[];
  scheduleItemIds: string[];
  taskItemIds: string[];
  semanticKind?: WeddingSemanticUiKind | null;
  semanticTags?: string[];
  semanticObject?: WeddingSemanticUiObject | null;
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
  semanticKind?: WeddingSemanticUiKind | null;
  semanticTags?: string[];
  semanticObject?: WeddingSemanticUiObject | null;
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

type ParsedQuoteAttachmentEvidence = {
  text: string;
  parserLabel: string | null;
  fileName: string | null;
};

function parsedAttachmentEvidenceFromMessages(
  messages: readonly AfpMessage[],
  responseWorkspaceId: string,
): Map<string, ParsedQuoteAttachmentEvidence> {
  const byAttachmentId = new Map<string, ParsedQuoteAttachmentEvidence>();
  for (const message of messages) {
    const inWorkspace = workspaceIdFrom(message) === responseWorkspaceId
      || message.thread_id.includes(responseWorkspaceId);
    if (!inWorkspace) continue;
    const tokens = [
      message.type,
      message.kind,
      message.subtype,
      ...strings(message.supertags),
    ].map((value) => clean(value)?.toLowerCase() ?? "").join(" ");
    if (!tokens.includes("parsed_document")) continue;
    const attachmentId = clean(contentValue(message, "source_attachment_id"));
    if (!attachmentId) continue;
    const text = boundedClean(
      contentValue(message, "content_text")
        ?? contentValue(message, "text")
        ?? record(contentValue(message, "parsed_document"))?.content_text
        ?? record(contentValue(message, "document"))?.content_text,
      5000,
    );
    if (!text) continue;
    byAttachmentId.set(attachmentId, {
      text,
      parserLabel: clean(contentValue(message, "parser_used") ?? message.metadata?.extraction_mode),
      fileName: clean(message.metadata?.source_file_name ?? contentValue(message, "title")),
    });
  }
  return byAttachmentId;
}

function attachmentEvidenceForQuoteMessage(
  message: AfpMessage,
  parsedAttachmentEvidence: Map<string, ParsedQuoteAttachmentEvidence>,
): ParsedQuoteAttachmentEvidence | null {
  const quote = record(contentValue(message, "quote"));
  const candidateIds = [
    clean(quote?.sourceAttachmentId ?? quote?.source_attachment_id),
    clean(quote?.attachmentId ?? quote?.attachment_id),
    ...message.attachments.map((attachment) => clean(attachment.id)),
  ].filter((id): id is string => Boolean(id));
  for (const candidateId of candidateIds) {
    const evidence = parsedAttachmentEvidence.get(candidateId);
    if (evidence) return evidence;
  }
  return null;
}

function quoteBodyFromMessage(
  message: AfpMessage,
  parsedAttachmentEvidence: Map<string, ParsedQuoteAttachmentEvidence>,
): string | null {
  const quote = record(contentValue(message, "quote"));
  if (!quote) return null;
  const vendorName = clean(quote.vendorName ?? quote.vendor_name);
  const amountLabel = clean(quote.amountLabel ?? quote.amount_label);
  if (!vendorName || !amountLabel) return null;
  const inclusions = strings(quote.inclusions);
  const parsedAttachment = attachmentEvidenceForQuoteMessage(message, parsedAttachmentEvidence);
  const attachmentText = boundedClean(
    quote.attachmentText
      ?? quote.attachment_text
      ?? quote.attachmentMarkdown
      ?? quote.attachment_markdown
      ?? quote.extractedAttachmentText
      ?? quote.extracted_attachment_text
      ?? quote.parsedAttachmentText
      ?? quote.parsed_attachment_text
      ?? parsedAttachment?.text,
    5000,
  );
  const attachmentTextStatus = clean(quote.attachmentTextStatus ?? quote.attachment_text_status)
    ?? (attachmentText ? "extracted" : null);
  const attachmentParser = clean(quote.attachmentParser ?? quote.attachment_parser ?? quote.parser_used)
    ?? parsedAttachment?.parserLabel
    ?? null;
  return [
    `# ${vendorName} quote`,
    "",
    `Vendor: ${vendorName}`,
    `Quote amount: ${amountLabel}`,
    clean(quote.budgetDeltaLabel ?? quote.budget_delta_label) ? `Budget delta: ${clean(quote.budgetDeltaLabel ?? quote.budget_delta_label)}` : null,
    clean(quote.validUntil ?? quote.valid_until) ? `Valid until: ${clean(quote.validUntil ?? quote.valid_until)}` : null,
    clean(quote.attachmentUrl ?? quote.attachment_url) ? `Original file: ${clean(quote.attachmentUrl ?? quote.attachment_url)}` : null,
    attachmentTextStatus ? `Attachment text status: ${attachmentTextStatus}` : null,
    ...strings(quote.attachmentEvidenceLabels ?? quote.attachment_evidence_labels).map((label) => `Attachment evidence: ${label}`),
    parsedAttachment?.fileName ? `Attachment name: ${parsedAttachment.fileName}` : null,
    attachmentParser ? `Attachment parser: ${attachmentParser}` : null,
    inclusions.length > 0 ? "" : null,
    inclusions.length > 0 ? "## Inclusions" : null,
    inclusions.length > 0 ? "" : null,
    ...inclusions.map((item) => `- ${item}`),
    attachmentText ? "" : null,
    attachmentText ? "## Attachment text" : null,
    attachmentText ? "" : null,
    attachmentText,
  ].filter((line): line is string => line !== null).join("\n");
}

function emailDraftBodyFromMessage(message: AfpMessage): string | null {
  const recipient = clean(contentValue(message, "to"));
  const subject = clean(contentValue(message, "subject"));
  const body = clean(contentValue(message, "text") ?? contentValue(message, "markdown") ?? contentValue(message, "body"));
  if (!subject || !body) return null;
  return [
    recipient ? `Recipient: ${recipient}` : null,
    `Subject: ${subject}`,
    "",
    "## Draft",
    "",
    body,
  ].filter((line): line is string => line !== null).join("\n");
}

function messageToVendorQuoteThreadArtifactInput(
  message: AfpMessage,
  fallback: WeddingPlanningMetadata,
  parsedAttachmentEvidence: Map<string, ParsedQuoteAttachmentEvidence>,
): WeddingArtifactInput | null {
  const workspaceId = workspaceIdFrom(message);
  if (!workspaceId) return null;
  const metadata = baseMetadata(message, fallback);
  const createdAt = Date.parse(message.timestamp) || Date.now();
  const tokens = [
    message.type,
    message.kind,
    message.subtype,
    ...strings(message.supertags),
  ].map((value) => clean(value)?.toLowerCase() ?? "").join(" ");
  if (tokens.includes("wedding_vendor_quote_received")) {
    const bodyText = quoteBodyFromMessage(message, parsedAttachmentEvidence);
    const title = clean(contentValue(message, "title"))
      ?? clean(message.metadata?.vendor_name)
      ?? clean(record(contentValue(message, "quote"))?.vendorName)
      ?? "Vendor quote";
    return bodyText
      ? {
        id: message.id,
        title: `${title.replace(/\s+quote$/i, "")} quote`,
        kind: "vendor_table",
        createdAt,
        metadata: { ...metadata, artifactKind: "vendor_table", recoveredFromVendorThread: true },
        exportTargets: ["markdown", "browser_pdf"],
        sourceLabels: ["Vendor quote thread"],
        sourceLinks: [],
        vendorLabels: [title.replace(/\s+quote$/i, "")],
        bodyText,
      }
      : null;
  }
  if (message.type === "email_draft" && tokens.includes("wedding_vendor_quote_reply_draft")) {
    const bodyText = emailDraftBodyFromMessage(message);
    const subject = clean(contentValue(message, "subject")) ?? "Vendor quote reply";
    return bodyText
      ? {
        id: message.id,
        title: subject,
        kind: "email_draft",
        createdAt,
        metadata: { ...metadata, artifactKind: "email_draft", recoveredFromVendorThread: true },
        exportTargets: ["markdown"],
        sourceLabels: ["Vendor quote reply thread"],
        sourceLinks: [],
        vendorLabels: strings(message.metadata?.vendor_labels),
        bodyText,
      }
      : null;
  }
  return null;
}

function recoveredFromVendorThread(input: WeddingArtifactInput): boolean {
  return Boolean(input.metadata && typeof input.metadata === "object"
    && (input.metadata as Record<string, unknown>).recoveredFromVendorThread === true);
}

function coalescePersistedArtifactInputs(inputs: readonly WeddingArtifactInput[]): WeddingArtifactInput[] {
  const byId = new Map<string, WeddingArtifactInput>();
  const withoutId: WeddingArtifactInput[] = [];
  for (const input of inputs) {
    const id = clean(input.id);
    if (!id) {
      withoutId.push(input);
      continue;
    }
    const current = byId.get(id);
    if (!current) {
      byId.set(id, input);
      continue;
    }
    if (recoveredFromVendorThread(current) && !recoveredFromVendorThread(input)) {
      byId.set(id, input);
    }
  }
  return [...withoutId, ...byId.values()];
}

function messageToScheduleItem(message: AfpMessage, fallback: WeddingPlanningMetadata): WeddingPlanningScheduleItem | null {
  if (message.subtype !== "wedding_event" || workspaceIdFrom(message) === null) return null;
  const metadata = baseMetadata(message, fallback);
  const [semanticObject = null] = weddingSemanticUiObjectsFromAfpLikeMessage(message);
  const semanticKind = semanticObject?.kind ?? (isWeddingSemanticUiKind(message.metadata?.semantic_kind) ? message.metadata.semantic_kind : null);
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
    semanticKind,
    semanticTags: [
      ...new Set([
        ...strings(message.metadata?.semantic_tags),
        ...(semanticObject?.semanticTags ?? []),
        semanticKind,
      ].filter((tag): tag is string => Boolean(tag))),
    ].slice(0, 16),
    semanticObject,
  };
}

function messageToTaskItem(message: AfpMessage, fallback: WeddingPlanningMetadata): WeddingPlanningTaskItem | null {
  if (message.subtype !== "wedding_task" || workspaceIdFrom(message) === null) return null;
  const metadata = baseMetadata(message, fallback);
  const [semanticObject = null] = weddingSemanticUiObjectsFromAfpLikeMessage(message);
  const semanticKind = semanticObject?.kind ?? (isWeddingSemanticUiKind(message.metadata?.semantic_kind) ? message.metadata.semantic_kind : null);
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
    metadata: {
      ...secondOrderTaskMetadata(message, metadata),
      wedding_journey_stage: clean(contentValue(message, "wedding_journey_stage") ?? message.metadata?.wedding_journey_stage),
    },
    linkedArtifactId: clean(contentValue(message, "linked_artifact_id")),
    notes: clean(contentValue(message, "description")),
    semanticKind,
    semanticTags: [
      ...new Set([
        ...strings(message.metadata?.semantic_tags),
        ...(semanticObject?.semanticTags ?? []),
        semanticKind,
      ].filter((tag): tag is string => Boolean(tag))),
    ].slice(0, 16),
    semanticObject,
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
    atmosphereDescription: clean(context?.atmosphereDescription ?? context?.atmosphere_description),
    inspirationImageUrls: strings(context?.inspirationImageUrls ?? context?.inspiration_image_urls),
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
  const delivery = record(contentValue(message, "delivery"));
  const [semanticObject = null] = weddingSemanticUiObjectsFromAfpLikeMessage(message);
  const semanticKind = semanticObject?.kind ?? (isWeddingSemanticUiKind(message.metadata?.semantic_kind) ? message.metadata.semantic_kind : null);
  const semanticTags = [
    ...strings(message.metadata?.semantic_tags),
    ...(semanticObject?.semanticTags ?? []),
    semanticKind,
  ].filter((tag): tag is string => Boolean(tag));
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
    providerReceiptId: clean(contentValue(message, "provider_receipt_id")),
    providerMessageId: clean(contentValue(message, "provider_message_id")),
    messageId: clean(contentValue(message, "message_id")),
    clientMessageId: clean(contentValue(message, "client_message_id")),
    deliveryChannel: clean(contentValue(message, "delivery_channel") ?? delivery?.channel),
    deliverySubject: clean(contentValue(message, "delivery_subject") ?? delivery?.subject),
    deliveryThreadId: clean(contentValue(message, "delivery_thread_id") ?? delivery?.threadId),
    deliveryInReplyTo: clean(contentValue(message, "delivery_in_reply_to") ?? delivery?.inReplyTo),
    deliveryReferences: strings(contentValue(message, "delivery_references") ?? delivery?.references).slice(0, 12),
    deliveryRecipients: strings(contentValue(message, "delivery_recipients") ?? delivery?.to).slice(0, 12),
    executionMode: clean(contentValue(message, "execution_mode")),
    providerCapability: clean(contentValue(message, "provider_capability")),
    requiredProvider: clean(contentValue(message, "required_provider")),
    providerCredentialStatus: clean(contentValue(message, "provider_credential_status")),
    providerExecutorStatus: clean(contentValue(message, "provider_executor_status")),
    providerExecutorConnected: bool(contentValue(message, "provider_executor_connected")),
    providerResultOk: optionalBool(contentValue(message, "provider_result_ok") ?? message.metadata?.provider_result_ok),
    externalDeliveryPerformed: optionalBool(contentValue(message, "external_delivery_performed") ?? message.metadata?.external_delivery_performed),
    missingDurableProviderReceipt: optionalBool(contentValue(message, "missing_durable_provider_receipt") ?? message.metadata?.missing_durable_provider_receipt),
    providerSetupView: clean(contentValue(message, "provider_setup_view")),
    externalProviderRequired: bool(contentValue(message, "external_provider_required")),
    artifactIds: strings(contentValue(message, "artifact_ids")),
    scheduleItemIds: strings(contentValue(message, "schedule_item_ids")),
    taskItemIds: strings(contentValue(message, "task_item_ids")),
    semanticKind,
    semanticTags: [...new Set(semanticTags)].slice(0, 16),
    semanticObject,
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
  const [semanticObject = null] = weddingSemanticUiObjectsFromAfpLikeMessage(message);
  const semanticKind = semanticObject?.kind ?? (isWeddingSemanticUiKind(message.metadata?.semantic_kind) ? message.metadata.semantic_kind : null);
  const semanticTags = [
    ...strings(message.metadata?.semantic_tags),
    ...(semanticObject?.semanticTags ?? []),
    semanticKind,
  ].filter((tag): tag is string => Boolean(tag));
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
    semanticKind,
    semanticTags: [...new Set(semanticTags)].slice(0, 16),
    semanticObject,
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
  const parsedAttachmentEvidence = parsedAttachmentEvidenceFromMessages(input.messages ?? [], metadata.responseWorkspaceId);
  const artifacts = coalescePersistedArtifactInputs(scopedMessages.flatMap((message) => {
    const artifact = messageToArtifactInput(message, metadata)
      ?? messageToVendorQuoteThreadArtifactInput(message, metadata, parsedAttachmentEvidence);
    return artifact ? [artifact] : [];
  }));
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
    const item = weddingPersistedBoundaryObjectFromAfpMessage(message, metadata)
      ?? weddingRsvpResponseInvitationFromAfpMessage(message);
    return item ? [item] : [];
  }));
  const seatingConstraints = scopedMessages.flatMap((message) => {
    const item = weddingPersistedSeatingConstraintFromAfpMessage(message);
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
  const taskDateUpdates = scopedMessages.flatMap((message) => {
    const item = weddingPersistedTaskDateUpdateFromAfpMessage(message);
    return item ? [item] : [];
  });
  const updatedTaskItems = applyWeddingPersistedTaskDateUpdates(taskItems, taskDateUpdates);

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
    taskItems: updatedTaskItems,
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
      || updatedTaskItems.length > 0
      || taskDateUpdates.length > 0,
  };
}
