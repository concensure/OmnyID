// @locs-version: 2.0
import type { GmailConnectionStatus } from "@/lib/gmailConnectionState";
import type { WeddingApprovalActionKind, WeddingApprovalRequestState } from "@/lib/weddingApprovalState";

export type WeddingProviderCapability = "email" | "calendar" | "registry" | "vendor_search" | "sharing" | "none";

export type WeddingProviderExecutorReadinessState = {
  capability: WeddingProviderCapability;
  requiredProvider: string | null;
  credentialStatus: "not_required" | "missing" | "connected" | "stale";
  executorStatus: "not_required" | "missing" | "available";
  productionReady: boolean;
  setupView: "email" | "calendar" | "connected_apps" | null;
  summary: string;
  detail: string;
};

export type WeddingProviderExecutorReadinessInput = {
  request: WeddingApprovalRequestState | null | undefined;
  capabilityOverride?: WeddingProviderCapability | null;
  gmailStatus?: GmailConnectionStatus | null;
  calendarConnected?: boolean | null;
  registryConnected?: boolean | null;
  vendorSearchConnected?: boolean | null;
  availableExecutors?: Partial<Record<WeddingApprovalActionKind, boolean>> | null;
  vendorSearchExecutorAvailable?: boolean | null;
};

export const WEDDING_VENDOR_SEARCH_CONNECTED_APP_IDS = [
  "brave-search-api",
  "exa-search-api",
  "google-places-api",
  "overpass-api",
] as const;

function emailCredentialStatus(status: GmailConnectionStatus | null | undefined) {
  if (!status?.connected) return "missing" as const;
  if (status.token_expired || status.expires_within_24h) return "stale" as const;
  return "connected" as const;
}

function capabilityFor(kind: WeddingApprovalActionKind): WeddingProviderCapability {
  if (kind === "send_email" || kind === "contact_vendor" || kind === "invite_collaborator") return "email";
  if (kind === "create_external_calendar_event") return "calendar";
  if (kind === "publish_registry") return "registry";
  if (kind === "share_artifact" || kind === "export_sensitive_bundle") return "sharing";
  return "none";
}

function providerFor(capability: WeddingProviderCapability): string | null {
  if (capability === "email") return "Gmail or email provider";
  if (capability === "calendar") return "Google Calendar or calendar provider";
  if (capability === "registry") return "Registry provider";
  if (capability === "vendor_search") return "Brave Search, EXA Search, Google Places, or OSM/Overpass provider";
  return null;
}

function setupViewFor(capability: WeddingProviderCapability): WeddingProviderExecutorReadinessState["setupView"] {
  if (capability === "email") return "email";
  if (capability === "calendar") return "calendar";
  if (capability === "registry" || capability === "vendor_search") return "connected_apps";
  return null;
}

function credentialStatusFor(input: WeddingProviderExecutorReadinessInput, capability: WeddingProviderCapability) {
  if (capability === "none" || capability === "sharing") return "not_required" as const;
  if (capability === "email") return emailCredentialStatus(input.gmailStatus);
  if (capability === "calendar") return input.calendarConnected ? "connected" : "missing";
  if (capability === "registry") return input.registryConnected ? "connected" : "missing";
  if (capability === "vendor_search") return input.vendorSearchConnected ? "connected" : "missing";
  return "not_required" as const;
}

function executorAvailableForCapability(
  input: WeddingProviderExecutorReadinessInput,
  capability: WeddingProviderCapability,
): boolean {
  if (capability === "email") {
    return Boolean(
      input.availableExecutors?.send_email ||
      input.availableExecutors?.contact_vendor ||
      input.availableExecutors?.invite_collaborator,
    );
  }
  if (capability === "calendar") return Boolean(input.availableExecutors?.create_external_calendar_event);
  if (capability === "registry") return Boolean(input.availableExecutors?.publish_registry);
  return false;
}

export function buildWeddingProviderExecutorReadinessState(
  input: WeddingProviderExecutorReadinessInput,
): WeddingProviderExecutorReadinessState {
  const request = input.request;
  const capability = input.capabilityOverride ?? (request ? capabilityFor(request.actionKind) : "none");
  const credentialStatus = credentialStatusFor(input, capability);
  const executorStatus = capability === "vendor_search"
    ? input.vendorSearchExecutorAvailable ? "available" : "missing"
    : capability === "none" || capability === "sharing"
    ? "not_required"
    : request && input.availableExecutors?.[request.actionKind]
      ? "available"
      : !request && executorAvailableForCapability(input, capability)
        ? "available"
        : "missing";
  const productionReady = credentialStatus !== "missing"
    && credentialStatus !== "stale"
    && executorStatus !== "missing";
  const requiredProvider = providerFor(capability);

  if (capability === "none") {
    return {
      capability,
      requiredProvider,
      credentialStatus,
      executorStatus,
      productionReady,
      setupView: null,
      summary: "No external provider required",
      detail: "This wedding action can remain inside OmnyID.",
    };
  }

  if (capability === "sharing") {
    return {
      capability,
      requiredProvider,
      credentialStatus,
      executorStatus,
      productionReady,
      setupView: null,
      summary: "OmnyID sharing checks",
      detail: "OmnyID will ask for approval and show what is included before anything is shared.",
    };
  }

  return {
    capability,
    requiredProvider,
    credentialStatus,
    executorStatus,
    productionReady,
    setupView: setupViewFor(capability),
    summary: productionReady
      ? `${requiredProvider} ready`
      : `${requiredProvider} needs setup`,
    detail: executorStatus === "missing"
      ? "You can approve this in OmnyID now, but sending or syncing it outside OmnyID needs a connected app."
      : credentialStatus === "stale"
        ? "The connected app needs to be signed in again before it can send or sync."
        : credentialStatus === "missing"
          ? "Connect the app account before this can be sent or synced outside OmnyID."
          : "The connected app is ready.",
  };
}

export function connectedAppsHaveWeddingVendorSearchProvider(
  connectedAppIds: readonly string[] | null | undefined,
): boolean {
  const connected = new Set((connectedAppIds ?? []).map((id) => id.trim().toLowerCase()));
  return WEDDING_VENDOR_SEARCH_CONNECTED_APP_IDS.some((id) => connected.has(id));
}

export function buildWeddingVendorSearchProviderReadinessFromConnectedApps(input: {
  connectedAppIds?: readonly string[] | null;
  executorAvailable?: boolean | null;
} = {}): WeddingProviderExecutorReadinessState {
  return buildWeddingProviderExecutorReadinessState({
    request: null,
    capabilityOverride: "vendor_search",
    vendorSearchConnected: connectedAppsHaveWeddingVendorSearchProvider(input.connectedAppIds),
    vendorSearchExecutorAvailable: input.executorAvailable,
  });
}
