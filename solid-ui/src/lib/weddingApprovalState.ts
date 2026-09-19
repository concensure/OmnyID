// @locs-version: 2.0
import type { WeddingArtifactSummary } from "@/lib/weddingArtifactState";
import type {
  WeddingPlanningScheduleItem,
  WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import { weddingArtifactWarningLabels } from "@/lib/weddingExportState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingArtifactKind,
  type WeddingPrivacyScope,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingApprovalActionKind =
  | "send_email"
  | "share_artifact"
  | "invite_collaborator"
  | "create_external_calendar_event"
  | "contact_vendor"
  | "publish_registry"
  | "export_sensitive_bundle";

export type WeddingApprovalBlockKind =
  | "needs_user_approval"
  | "provider_missing"
  | "unsupported_integration"
  | "privacy_scope";

export type WeddingApprovalRequestInput = {
  id?: string | null;
  actionKind: WeddingApprovalActionKind;
  title: string;
  metadata?: unknown;
  artifacts?: readonly WeddingArtifactSummary[] | null;
  scheduleItems?: readonly WeddingPlanningScheduleItem[] | null;
  taskItems?: readonly WeddingPlanningTaskItem[] | null;
  recipients?: readonly string[] | null;
  shareScope?: WeddingPrivacyScope | null;
  externalProvider?: string | null;
  proposedMessage?: string | null;
  decisionScopes?: readonly {
    title: string;
    detail?: string | null;
    artifactId?: string | null;
    artifactTitle?: string | null;
  }[] | null;
  userApproved?: boolean | null;
};

export type WeddingApprovalRequestState = {
  id: string;
  actionKind: WeddingApprovalActionKind;
  title: string;
  metadata: WeddingPlanningMetadata;
  requiresApproval: true;
  userApproved: boolean;
  canExecute: boolean;
  blockedReason: string | null;
  blockKind: WeddingApprovalBlockKind | null;
  shareScope: WeddingPrivacyScope;
  recipients: string[];
  disclosureLines: string[];
  riskLabels: string[];
  artifactIds: string[];
  scheduleItemIds: string[];
  taskItemIds: string[];
  approvalButtonLabel: string;
  executeButtonLabel: string;
};

export type WeddingIntegrationReadinessState = {
  capability: "email" | "calendar" | "sharing" | "registry" | "none";
  status: "not_required" | "needs_provider" | "ready_after_approval" | "ready" | "unsupported";
  providerLabel: string | null;
  title: string;
  detail: string;
  setupActionLabel: string | null;
};

export type WeddingApprovalReceiptState = {
  id: string;
  requestId: string;
  actionKind: WeddingApprovalActionKind;
  title: string;
  status: "executed" | "blocked";
  createdAt: string;
  disclosureLines: string[];
  riskLabels: string[];
  metadata: Record<string, unknown>;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 40): string[] {
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

function requestId(input: WeddingApprovalRequestInput, metadata: WeddingPlanningMetadata): string {
  return clean(input.id)
    || `wedding_approval:${safeWeddingLabel(input.actionKind)}:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(input.title)}`;
}

function actionLabel(kind: WeddingApprovalActionKind): string {
  const labels: Record<WeddingApprovalActionKind, string> = {
    send_email: "Send email",
    share_artifact: "Share artifact",
    invite_collaborator: "Invite collaborator",
    create_external_calendar_event: "Create external calendar event",
    contact_vendor: "Contact vendor",
    publish_registry: "Publish registry",
    export_sensitive_bundle: "Export sensitive bundle",
  };
  return labels[kind];
}

function approvalOnlyBlocked(reason: string | null): boolean {
  return reason === "Explicit user approval is required before this wedding action can run.";
}

function connectedProviderLabel(value: unknown): string | null {
  const provider = clean(value);
  if (!provider) return null;
  return provider
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function defaultScope(kind: WeddingApprovalActionKind, inputScope: WeddingPrivacyScope | null | undefined): WeddingPrivacyScope {
  if (inputScope) return inputScope;
  if (kind === "contact_vendor") return "shared_vendor";
  if (kind === "invite_collaborator") return "shared_partner";
  return "private";
}

function importedPrivateLabel(value: string): boolean {
  return /^wedding_import(?:$|:)/i.test(value)
    || /original upload/i.test(value)
    || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(value)
    || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value)
    || /\b[^,\s]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value);
}

function isWeddingImportArtifact(artifact: WeddingArtifactSummary): boolean {
  return artifact.id.startsWith("wedding_import:")
    || artifact.metadata.supertags.some((tag) => /^wedding_import(?:$|:)/i.test(tag))
    || [
      artifact.title,
      ...artifact.sourceLabels,
    ].some((label) => importedPrivateLabel(clean(label)));
}

function artifactTitleForDisclosure(artifact: WeddingArtifactSummary): string {
  return isWeddingImportArtifact(artifact) ? "Imported private planning file" : artifact.title;
}

function decisionScopeArtifactTitleForDisclosure(value: unknown): string {
  const title = clean(value);
  if (!title) return "";
  return importedPrivateLabel(title) ? "Imported private planning file" : title;
}

function artifactDisclosure(artifacts: readonly WeddingArtifactSummary[], shareScope: WeddingPrivacyScope): string[] {
  return artifacts.flatMap((artifact) => [
    `${artifactTitleForDisclosure(artifact)} (${artifact.kind.replace(/_/g, " ")})`,
    artifact.vendorLabels.length > 0 ? `Vendors: ${artifact.vendorLabels.slice(0, 3).join(", ")}` : null,
    artifact.locationLabels.length > 0 ? `Locations: ${artifact.locationLabels.slice(0, 3).join(", ")}` : null,
    shareScope === "shared_vendor" && artifact.kind === "vendor_table"
      ? "Vendor sharing may disclose comparison context; review before sending."
      : null,
  ]).filter((value): value is string => Boolean(value));
}

function scheduleDisclosure(items: readonly WeddingPlanningScheduleItem[]): string[] {
  return items.map((item) => `${item.title}: ${clean(item.startAt) || clean(item.dateLabel) || "date not set"}`);
}

function taskDisclosure(items: readonly WeddingPlanningTaskItem[]): string[] {
  return items.map((item) => `${item.title}: ${clean(item.dueAt) || clean(item.dueLabel) || "no due date"}`);
}

function decisionScopeDisclosure(scopes: NonNullable<WeddingApprovalRequestInput["decisionScopes"]>): string[] {
  return scopes.flatMap((scope) => {
    const title = clean(scope.title);
    if (!title) return [];
    const artifactTitle = decisionScopeArtifactTitleForDisclosure(scope.artifactTitle);
    const source = artifactTitle ? ` from ${artifactTitle}` : "";
    const detail = clean(scope.detail);
    return [`Selected decision scope: ${title}${source}${detail ? ` - ${detail}` : ""}`];
  });
}

function riskLabelsFor(input: {
  actionKind: WeddingApprovalActionKind;
  artifacts: readonly WeddingArtifactSummary[];
  shareScope: WeddingPrivacyScope;
  externalProvider: string | null;
  decisionScopes: NonNullable<WeddingApprovalRequestInput["decisionScopes"]>;
}): string[] {
  return uniqueStrings([
    ...input.artifacts.flatMap(weddingArtifactWarningLabels),
    input.shareScope === "shared_vendor" && input.artifacts.some((artifact) => artifact.kind === "budget_sheet")
      ? "Vendor-facing shares must not include private budget ceilings by default."
      : null,
    input.shareScope === "shared_vendor" && input.artifacts.some((artifact) => artifact.kind === "guest_list")
      ? "Vendor-facing shares must not include unrelated guest details by default."
      : null,
    input.actionKind === "create_external_calendar_event" && !input.externalProvider
      ? "External calendar provider is not connected yet."
      : null,
    input.actionKind === "publish_registry"
      ? "Registry publishing stages a local draft first; external publishing requires an explicit registry integration."
      : null,
    input.decisionScopes.length > 0 && (
      input.actionKind === "send_email"
      || input.actionKind === "share_artifact"
      || input.actionKind === "contact_vendor"
    )
      ? "This approval is scoped to the selected shortlist item; do not include unticked alternatives unless the user asks to compare."
      : null,
  ]);
}

const VENDOR_BLOCKED_SHARE_KINDS = new Set<WeddingArtifactKind>([
  "budget_sheet",
  "guest_list",
  "decision_log",
  "email_draft",
  "registry",
]);

function vendorBlockedShareReason(input: {
  actionKind: WeddingApprovalActionKind;
  artifacts: readonly WeddingArtifactSummary[];
  shareScope: WeddingPrivacyScope;
}): string | null {
  if (input.actionKind !== "share_artifact" || input.shareScope !== "shared_vendor") return null;
  const blockedArtifacts = input.artifacts.filter((artifact) =>
    VENDOR_BLOCKED_SHARE_KINDS.has(artifact.kind) || isWeddingImportArtifact(artifact)
  );
  if (blockedArtifacts.length === 0) return null;
  const labels = blockedArtifacts
    .slice(0, 3)
    .map((artifact) => isWeddingImportArtifact(artifact) ? "imported file" : artifact.kind.replace(/_/g, " "))
    .join(", ");
  return `Vendor-facing shares cannot include private planning files by default (${labels}). Remove those artifacts or choose a non-vendor share scope.`;
}

export function buildWeddingApprovalRequestState(input: WeddingApprovalRequestInput): WeddingApprovalRequestState {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const artifacts = input.artifacts ?? [];
  const scheduleItems = input.scheduleItems ?? [];
  const taskItems = input.taskItems ?? [];
  const decisionScopes = input.decisionScopes ?? [];
  const shareScope = defaultScope(input.actionKind, input.shareScope);
  const recipients = uniqueStrings(input.recipients ?? []);
  const riskLabels = riskLabelsFor({
    actionKind: input.actionKind,
    artifacts,
    shareScope,
    externalProvider: clean(input.externalProvider) || null,
    decisionScopes,
  });
  const disclosureLines = uniqueStrings([
    `Action: ${actionLabel(input.actionKind)}`,
    `Scope: ${shareScope.replace(/_/g, " ")}`,
    recipients.length > 0 ? `Recipients: ${recipients.join(", ")}` : null,
    clean(input.externalProvider) ? `Provider: ${clean(input.externalProvider)}` : null,
    ...artifactDisclosure(artifacts, shareScope),
    ...decisionScopeDisclosure(decisionScopes),
    ...scheduleDisclosure(scheduleItems),
    ...taskDisclosure(taskItems),
    clean(input.proposedMessage) ? `Message preview: ${clean(input.proposedMessage).slice(0, 240)}` : null,
  ]);
  const userApproved = Boolean(input.userApproved);
  const providerBlocked = input.actionKind === "create_external_calendar_event" && !clean(input.externalProvider);
  const unsupportedBlocked = false;
  const privacyBlockedReason = vendorBlockedShareReason({
    actionKind: input.actionKind,
    artifacts,
    shareScope,
  });
  const canExecute = userApproved && !providerBlocked && !unsupportedBlocked && !privacyBlockedReason;
  const blockKind: WeddingApprovalBlockKind | null = canExecute
    ? null
    : providerBlocked
      ? "provider_missing"
      : unsupportedBlocked
        ? "unsupported_integration"
        : privacyBlockedReason
          ? "privacy_scope"
          : "needs_user_approval";

  return {
    id: requestId(input, metadata),
    actionKind: input.actionKind,
    title: input.title,
    metadata,
    requiresApproval: true,
    userApproved,
    canExecute,
    blockKind,
    blockedReason: blockKind === null
      ? null
      : blockKind === "provider_missing"
        ? "Connect a calendar provider before creating an external calendar event."
        : blockKind === "unsupported_integration"
          ? "Registry publishing is not available yet."
          : blockKind === "privacy_scope"
            ? privacyBlockedReason
            : "Explicit user approval is required before this wedding action can run.",
    shareScope,
    recipients,
    disclosureLines,
    riskLabels,
    artifactIds: artifacts.map((artifact) => artifact.id),
    scheduleItemIds: scheduleItems.map((item) => item.id),
    taskItemIds: taskItems.map((item) => item.id),
    approvalButtonLabel: "Approve wedding action",
    executeButtonLabel: canExecute ? actionLabel(input.actionKind) : "Approval required",
  };
}

export function buildWeddingApprovalReceiptState(
  request: WeddingApprovalRequestState,
  nowIso = new Date().toISOString(),
): WeddingApprovalReceiptState {
  return {
    id: `wedding_approval_receipt:${safeWeddingLabel(request.id)}:${safeWeddingLabel(nowIso)}`,
    requestId: request.id,
    actionKind: request.actionKind,
    title: request.title,
    status: request.canExecute ? "executed" : "blocked",
    createdAt: nowIso,
    disclosureLines: request.disclosureLines,
    riskLabels: request.riskLabels,
    metadata: {
      wedding_plan_id: request.metadata.weddingPlanId,
      response_workspace_id: request.metadata.responseWorkspaceId,
      source_response_id: request.metadata.sourceResponseId,
      share_scope: request.shareScope,
      artifact_ids: request.artifactIds,
      schedule_item_ids: request.scheduleItemIds,
      task_item_ids: request.taskItemIds,
      blocked_reason: request.blockedReason,
      block_kind: request.blockKind,
    },
  };
}

export function approveWeddingApprovalRequestState(
  request: WeddingApprovalRequestState,
): WeddingApprovalRequestState {
  if (request.userApproved) return request;
  const canExecute = request.blockKind === "needs_user_approval" && approvalOnlyBlocked(request.blockedReason);
  return {
    ...request,
    userApproved: true,
    canExecute,
    blockedReason: canExecute ? null : request.blockedReason,
    blockKind: canExecute ? null : request.blockKind,
    executeButtonLabel: canExecute ? actionLabel(request.actionKind) : request.executeButtonLabel,
  };
}

export function buildWeddingIntegrationReadinessState(
  request: WeddingApprovalRequestState | null | undefined,
): WeddingIntegrationReadinessState {
  if (!request) {
    return {
      capability: "none",
      status: "not_required",
      providerLabel: null,
      title: "No external integration required",
      detail: "The active wedding file does not have an external action pending.",
      setupActionLabel: null,
    };
  }
  const providerLabel = connectedProviderLabel(
    request.disclosureLines.find((line) => /^Provider:/i.test(line))?.replace(/^Provider:\s*/i, ""),
  );
  if (request.actionKind === "create_external_calendar_event") {
    return {
      capability: "calendar",
      status: providerLabel ? request.canExecute ? "ready" : "ready_after_approval" : "needs_provider",
      providerLabel,
      title: providerLabel ? `${providerLabel} calendar ready` : "Calendar provider needed",
      detail: providerLabel
        ? "Calendar creation can run only after user approval and through the connected executor."
        : "Connect Google Calendar or another supported calendar provider before creating external wedding events.",
      setupActionLabel: providerLabel ? null : "Connect calendar",
    };
  }
  if (request.actionKind === "send_email" || request.actionKind === "contact_vendor") {
    return {
      capability: "email",
      status: providerLabel ? request.canExecute ? "ready" : "ready_after_approval" : "needs_provider",
      providerLabel,
      title: providerLabel ? `${providerLabel} email ready` : "Email provider needed",
      detail: providerLabel
        ? "Email/contact execution can run only after user approval and through the connected executor."
        : "Connect Gmail or another supported email provider before sending vendor messages from OmnyID.",
      setupActionLabel: providerLabel ? null : "Connect email",
    };
  }
  if (request.actionKind === "publish_registry") {
    return {
      capability: "registry",
      status: providerLabel ? request.canExecute ? "ready" : "ready_after_approval" : "needs_provider",
      providerLabel,
      title: providerLabel ? `${providerLabel} registry ready` : "Registry provider needed",
      detail: providerLabel
        ? "Registry publishing can run only after user approval and through the connected executor."
        : "Registry drafts can be approved and staged in OmnyID, but external publishing needs a supported registry provider.",
      setupActionLabel: providerLabel ? null : "Connect registry",
    };
  }
  if (request.actionKind === "share_artifact" || request.actionKind === "invite_collaborator" || request.actionKind === "export_sensitive_bundle") {
    return {
      capability: "sharing",
      status: request.canExecute ? "ready" : request.userApproved ? "ready_after_approval" : "not_required",
      providerLabel,
      title: "OmnyID sharing approval",
      detail: "Sharing and sensitive exports use OmnyID approval, privacy scope, and disclosure checks before execution.",
      setupActionLabel: null,
    };
  }
  return {
    capability: "none",
    status: "not_required",
    providerLabel: null,
    title: "No external integration required",
    detail: "This approval request does not require an external provider.",
    setupActionLabel: null,
  };
}
