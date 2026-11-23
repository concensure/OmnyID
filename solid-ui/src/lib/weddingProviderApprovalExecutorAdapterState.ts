// @locs-version: 2.0
import type { WeddingApprovalActionKind, WeddingApprovalRequestState } from "@/lib/weddingApprovalState";
import type {
  WeddingApprovalExecutionHandlers,
  WeddingApprovalExecutor,
  WeddingApprovalExecutorResult,
} from "@/lib/weddingApprovalExecutionState";
import { safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

export type WeddingProviderApprovalExecutorMode = "dry_run" | "live";

export type WeddingProviderApprovalExecutorPort = (
  request: WeddingApprovalRequestState,
) => Promise<WeddingApprovalExecutorResult> | WeddingApprovalExecutorResult;

export type WeddingProviderApprovalExecutorPorts = {
  sendEmail?: WeddingProviderApprovalExecutorPort | null;
  contactVendor?: WeddingProviderApprovalExecutorPort | null;
  inviteCollaborator?: WeddingProviderApprovalExecutorPort | null;
  createCalendarEvent?: WeddingProviderApprovalExecutorPort | null;
  publishRegistry?: WeddingProviderApprovalExecutorPort | null;
};

export type WeddingProviderApprovalExecutorAdapterInput = {
  mode?: WeddingProviderApprovalExecutorMode | null;
  ports?: WeddingProviderApprovalExecutorPorts | null;
  providerLabel?: string | null;
};

const ACTION_PORT_KEYS: Partial<Record<WeddingApprovalActionKind, keyof WeddingProviderApprovalExecutorPorts>> = {
  send_email: "sendEmail",
  contact_vendor: "contactVendor",
  invite_collaborator: "inviteCollaborator",
  create_external_calendar_event: "createCalendarEvent",
  publish_registry: "publishRegistry",
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function durableProviderReceiptId(result: WeddingApprovalExecutorResult): string | null {
  const externalId = clean(result.externalId);
  if (externalId) return externalId;
  const metadata = result.metadata ?? {};
  return clean(metadata.external_id)
    || clean(metadata.provider_receipt_id)
    || clean(metadata.provider_message_id)
    || clean(metadata.provider_event_id)
    || clean(metadata.provider_publish_id)
    || clean(metadata.message_id)
    || null;
}

function dryRunExternalId(request: WeddingApprovalRequestState): string {
  return [
    "omnyid",
    "wedding_provider_dry_run",
    safeWeddingLabel(request.metadata.responseWorkspaceId),
    safeWeddingLabel(request.actionKind),
    safeWeddingLabel(request.id),
  ].join(":");
}

function dryRunResult(
  request: WeddingApprovalRequestState,
  providerLabel: string | null,
): WeddingApprovalExecutorResult {
  return {
    ok: true,
    externalId: dryRunExternalId(request),
    message: "Provider smoke test passed in dry-run mode. No external email, calendar event, registry publish, or vendor contact was sent.",
    metadata: {
      provider_executor_mode: "dry_run",
      provider_label: providerLabel,
      provider_smoke_test_only: true,
      external_delivery_performed: false,
      dry_run_action_kind: request.actionKind,
      dry_run_recipient_count: request.recipients.length,
      dry_run_artifact_count: request.artifactIds.length,
      dry_run_schedule_item_count: request.scheduleItemIds.length,
    },
  };
}

function missingLivePortResult(actionKind: WeddingApprovalActionKind): WeddingApprovalExecutorResult {
  return {
    ok: false,
    message: `The connected app is not ready for ${actionKind.replace(/_/g, " ")}.`,
    metadata: {
      provider_executor_mode: "live",
      provider_executor_status: "missing",
      provider_executor_connected: false,
      provider_smoke_test_only: false,
      provider_capability: actionKind,
      external_delivery_performed: false,
      missing_provider_port: actionKind,
    },
  };
}

function handlerFor(input: {
  actionKind: WeddingApprovalActionKind;
  mode: WeddingProviderApprovalExecutorMode;
  port?: WeddingProviderApprovalExecutorPort | null;
  providerLabel: string | null;
}): WeddingApprovalExecutor {
  return async (request) => {
    if (input.mode === "dry_run") return dryRunResult(request, input.providerLabel);
    if (!input.port) return missingLivePortResult(input.actionKind);
    const result = await input.port(request);
    return {
      ...result,
      metadata: {
        ...(result.metadata ?? {}),
        provider_executor_mode: "live",
        provider_label: input.providerLabel,
        provider_smoke_test_only: false,
        provider_result_ok: result.ok,
        external_delivery_performed: result.ok && Boolean(durableProviderReceiptId(result)),
      },
    };
  };
}

export function buildWeddingProviderApprovalExecutionHandlers(
  input: WeddingProviderApprovalExecutorAdapterInput = {},
): WeddingApprovalExecutionHandlers {
  const mode = input.mode === "live" ? "live" : "dry_run";
  const providerLabel = clean(input.providerLabel) || null;
  const ports = input.ports ?? {};

  return Object.fromEntries(
    Object.entries(ACTION_PORT_KEYS).map(([actionKind, portKey]) => [
      actionKind,
      handlerFor({
        actionKind: actionKind as WeddingApprovalActionKind,
        mode,
        port: ports[portKey],
        providerLabel,
      }),
    ]),
  ) as WeddingApprovalExecutionHandlers;
}

export function weddingProviderApprovalExecutorAvailability(
  ports: WeddingProviderApprovalExecutorPorts | null | undefined,
): Partial<Record<WeddingApprovalActionKind, boolean>> {
  return {
    send_email: Boolean(ports?.sendEmail),
    contact_vendor: Boolean(ports?.contactVendor),
    invite_collaborator: Boolean(ports?.inviteCollaborator),
    create_external_calendar_event: Boolean(ports?.createCalendarEvent),
    publish_registry: Boolean(ports?.publishRegistry),
  };
}
