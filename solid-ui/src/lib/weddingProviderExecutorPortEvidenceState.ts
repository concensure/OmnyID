// @locs-version: 2.0
import type { GmailConnectionStatus } from "@/lib/gmailConnectionState";
import type { WeddingApprovalActionKind } from "@/lib/weddingApprovalState";
import {
  weddingProviderApprovalExecutorAvailability,
  type WeddingProviderApprovalExecutorPorts,
} from "@/lib/weddingProviderApprovalExecutorAdapterState";
import {
  buildWeddingProviderExecutorReadinessState,
  type WeddingProviderExecutorReadinessState,
} from "@/lib/weddingProviderExecutorReadinessState";

export type WeddingProviderExecutorPortEvidenceInput = {
  ports?: WeddingProviderApprovalExecutorPorts | null;
  availableExecutors?: Partial<Record<WeddingApprovalActionKind, boolean>> | null;
  gmailStatus?: GmailConnectionStatus | null;
  calendarConnected?: boolean | null;
  registryConnected?: boolean | null;
  vendorSearchConnected?: boolean | null;
  vendorSearchExecutorAvailable?: boolean | null;
};

function availabilityFor(input: WeddingProviderExecutorPortEvidenceInput): Partial<Record<WeddingApprovalActionKind, boolean>> {
  return {
    ...weddingProviderApprovalExecutorAvailability(input.ports),
    ...(input.availableExecutors ?? {}),
  };
}

function emailExecutorAvailable(available: Partial<Record<WeddingApprovalActionKind, boolean>>): boolean {
  return Boolean(available.send_email || available.contact_vendor || available.invite_collaborator);
}

export function buildWeddingProviderExecutorEvidenceFromPorts(
  input: WeddingProviderExecutorPortEvidenceInput = {},
): WeddingProviderExecutorReadinessState[] {
  const available = availabilityFor(input);
  const emailAvailable = emailExecutorAvailable(available);

  return [
    buildWeddingProviderExecutorReadinessState({
      request: null,
      capabilityOverride: "email",
      gmailStatus: input.gmailStatus,
      availableExecutors: { send_email: emailAvailable },
    }),
    buildWeddingProviderExecutorReadinessState({
      request: null,
      capabilityOverride: "calendar",
      calendarConnected: input.calendarConnected,
      availableExecutors: { create_external_calendar_event: available.create_external_calendar_event },
    }),
    buildWeddingProviderExecutorReadinessState({
      request: null,
      capabilityOverride: "registry",
      registryConnected: input.registryConnected,
      availableExecutors: { publish_registry: available.publish_registry },
    }),
    buildWeddingProviderExecutorReadinessState({
      request: null,
      capabilityOverride: "vendor_search",
      vendorSearchConnected: input.vendorSearchConnected,
      vendorSearchExecutorAvailable: input.vendorSearchExecutorAvailable,
    }),
  ];
}
