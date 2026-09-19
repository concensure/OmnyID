// @locs-version: 2.0
import {
  type WeddingApprovalActionKind,
  type WeddingApprovalRequestState,
} from "@/lib/weddingApprovalState";
import {
  type WeddingApprovalExecutionHandlers,
  type WeddingApprovalExecutorResult,
} from "@/lib/weddingApprovalExecutionState";
import { safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";
import {
  buildWeddingProviderExecutorReadinessState,
  type WeddingProviderExecutorReadinessInput,
} from "@/lib/weddingProviderExecutorReadinessState";

const ACTION_LABELS: Record<WeddingApprovalActionKind, string> = {
  send_email: "Email draft",
  share_artifact: "Artifact share",
  invite_collaborator: "Collaborator invite",
  create_external_calendar_event: "Calendar event",
  contact_vendor: "Vendor contact",
  publish_registry: "Registry publish",
  export_sensitive_bundle: "Sensitive bundle export",
};

const EXTERNAL_PROVIDER_ACTIONS = new Set<WeddingApprovalActionKind>([
  "send_email",
  "create_external_calendar_event",
  "contact_vendor",
  "invite_collaborator",
  "publish_registry",
]);

function internalExecutionId(request: WeddingApprovalRequestState): string {
  return [
    "omnyid",
    "wedding_action",
    safeWeddingLabel(request.metadata.responseWorkspaceId),
    safeWeddingLabel(request.actionKind),
    safeWeddingLabel(request.id),
  ].join(":");
}

function stageApprovedWeddingAction(
  request: WeddingApprovalRequestState,
  readinessInput: Omit<WeddingProviderExecutorReadinessInput, "request"> = {},
): WeddingApprovalExecutorResult {
  const needsExternalProvider = EXTERNAL_PROVIDER_ACTIONS.has(request.actionKind);
  const readiness = buildWeddingProviderExecutorReadinessState({
    ...readinessInput,
    request,
  });
  return {
    ok: true,
    externalId: internalExecutionId(request),
    message: needsExternalProvider
      ? `${ACTION_LABELS[request.actionKind]} approved and staged inside OmnyID. External delivery still requires the connected provider executor.`
      : `${ACTION_LABELS[request.actionKind]} approved and staged inside OmnyID.`,
    metadata: {
      execution_mode: "omnyid_internal_approval_handoff",
      provider_capability: readiness.capability,
      required_provider: readiness.requiredProvider,
      provider_credential_status: readiness.credentialStatus,
      provider_executor_status: readiness.executorStatus,
      provider_executor_connected: readiness.executorStatus === "available",
      provider_setup_view: readiness.setupView,
      external_provider_required: needsExternalProvider,
      staged_action_kind: request.actionKind,
      staged_recipient_count: request.recipients.length,
      staged_artifact_count: request.artifactIds.length,
      staged_schedule_item_count: request.scheduleItemIds.length,
      staged_task_item_count: request.taskItemIds.length,
    },
  };
}

export function buildWeddingDefaultApprovalExecutionHandlers(): WeddingApprovalExecutionHandlers {
  const readinessInput: Omit<WeddingProviderExecutorReadinessInput, "request"> = {};
  return {
    send_email: (request) => stageApprovedWeddingAction(request, readinessInput),
    share_artifact: (request) => stageApprovedWeddingAction(request, readinessInput),
    invite_collaborator: (request) => stageApprovedWeddingAction(request, readinessInput),
    create_external_calendar_event: (request) => stageApprovedWeddingAction(request, readinessInput),
    contact_vendor: (request) => stageApprovedWeddingAction(request, readinessInput),
    publish_registry: (request) => stageApprovedWeddingAction(request, readinessInput),
    export_sensitive_bundle: (request) => stageApprovedWeddingAction(request, readinessInput),
  };
}
