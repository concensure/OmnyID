// @locs-version: 2.0
import type { GmailConnectionStatus } from "@/lib/gmailConnectionState";
import type {
  WeddingProviderApprovalExecutorMode,
  WeddingProviderApprovalExecutorPorts,
} from "@/lib/weddingProviderApprovalExecutorAdapterState";
import type {
  WeddingProviderCapability,
  WeddingProviderExecutorReadinessState,
} from "@/lib/weddingProviderExecutorReadinessState";

export type WeddingProviderAdapterReadinessInput = {
  mode?: WeddingProviderApprovalExecutorMode | null;
  ports?: WeddingProviderApprovalExecutorPorts | null;
  gmailStatus?: GmailConnectionStatus | null;
  calendarConnected?: boolean | null;
  registryConnected?: boolean | null;
};

export type WeddingProviderAdapterReadinessState = {
  mode: WeddingProviderApprovalExecutorMode;
  providerReadiness: WeddingProviderExecutorReadinessState[];
  smokeTestProgressLabels: string[];
  livePortLabels: string[];
  productionEvidenceReady: boolean;
};

function emailCredentialStatus(status: GmailConnectionStatus | null | undefined) {
  if (!status?.connected) return "missing" as const;
  if (status.token_expired || status.expires_within_24h) return "stale" as const;
  return "connected" as const;
}

function readiness(input: {
  capability: Exclude<WeddingProviderCapability, "sharing" | "none" | "vendor_search">;
  requiredProvider: string;
  credentialStatus: WeddingProviderExecutorReadinessState["credentialStatus"];
  hasLiveExecutor: boolean;
  setupView: WeddingProviderExecutorReadinessState["setupView"];
  mode: WeddingProviderApprovalExecutorMode;
}): WeddingProviderExecutorReadinessState {
  const executorStatus = input.mode === "live" && input.hasLiveExecutor ? "available" : "missing";
  const productionReady = input.credentialStatus === "connected" && executorStatus === "available";
  const dryRunOnly = input.mode === "dry_run" && input.hasLiveExecutor;

  return {
    capability: input.capability,
    requiredProvider: input.requiredProvider,
    credentialStatus: input.credentialStatus,
    executorStatus,
    productionReady,
    setupView: input.setupView,
    summary: productionReady
      ? `${input.requiredProvider} executor ready`
      : dryRunOnly
        ? `${input.requiredProvider} smoke-test port present; live execution still disabled`
        : `${input.requiredProvider} executor not production-ready`,
    detail: productionReady
      ? "Provider credentials and a live executor port are both available."
      : dryRunOnly
        ? "Dry-run smoke tests can run, but this must not satisfy production external delivery proof."
        : input.credentialStatus === "missing"
          ? "Connect the provider account before external execution can run."
          : input.credentialStatus === "stale"
            ? "The executor exists, but credentials need reconnection before production use."
            : "Register a live provider executor port before external delivery can run.",
  };
}

export function buildWeddingProviderAdapterReadinessState(
  input: WeddingProviderAdapterReadinessInput = {},
): WeddingProviderAdapterReadinessState {
  const mode = input.mode === "live" ? "live" : "dry_run";
  const ports = input.ports ?? {};
  const emailHasPort = Boolean(ports.sendEmail || ports.contactVendor || ports.inviteCollaborator);
  const calendarHasPort = Boolean(ports.createCalendarEvent);
  const registryHasPort = Boolean(ports.publishRegistry);
  const providerReadiness = [
    readiness({
      capability: "email",
      requiredProvider: "Gmail or email provider",
      credentialStatus: emailCredentialStatus(input.gmailStatus),
      hasLiveExecutor: emailHasPort,
      setupView: "email",
      mode,
    }),
    readiness({
      capability: "calendar",
      requiredProvider: "Google Calendar or calendar provider",
      credentialStatus: input.calendarConnected ? "connected" : "missing",
      hasLiveExecutor: calendarHasPort,
      setupView: "calendar",
      mode,
    }),
    readiness({
      capability: "registry",
      requiredProvider: "Registry provider",
      credentialStatus: input.registryConnected ? "connected" : "missing",
      hasLiveExecutor: registryHasPort,
      setupView: "connected_apps",
      mode,
    }),
  ];

  return {
    mode,
    providerReadiness,
    smokeTestProgressLabels: mode === "dry_run"
      ? providerReadiness
        .filter((provider) => provider.credentialStatus === "connected")
        .map((provider) => `${provider.requiredProvider} can be smoke-tested without external delivery.`)
      : [],
    livePortLabels: [
      emailHasPort ? "email live port registered" : null,
      calendarHasPort ? "calendar live port registered" : null,
      registryHasPort ? "registry live port registered" : null,
    ].filter((label): label is string => Boolean(label)),
    productionEvidenceReady: providerReadiness.every((provider) => provider.productionReady),
  };
}
