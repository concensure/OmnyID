// @locs-version: 2.0
import type { OperatorUsersResponse } from "@/lib/api";
import {
  buildAdminWeddingAiRoutingPolicyState,
  type AdminWeddingAiRoutingPolicyState,
} from "@/lib/adminWeddingAiRoutingPolicyState";
import {
  buildAdminWeddingOpsBackendMetricsReadinessState,
  type AdminWeddingOpsBackendMetricsReadinessState,
} from "@/lib/adminWeddingOpsBackendMetricsReadinessState";
import type { WeddingProviderExecutorProofPacketState } from "@/lib/weddingProviderExecutorProofPacketState";
import type { WeddingVendorSearchProviderEnvState } from "@/lib/weddingVendorSearchProviderEnvState";
import type { WeddingApiStackState } from "@/lib/weddingApiStackState";

export type AdminWeddingOpsMetricCard = {
  title: string;
  value: string;
  detail: string;
  status: "ready" | "needs_backend" | "local_only";
};

export type AdminWeddingOpsPanelState = {
  title: string;
  intro: string;
  metrics: AdminWeddingOpsMetricCard[];
  toggle: {
    enabled: boolean;
    label: string;
    statusLabel: string;
    detail: string;
    warning: string;
  };
  guardrails: string[];
};

export type AdminWeddingOpsOracleMetrics = {
  diskUsedLabel?: string | null;
  diskTotalLabel?: string | null;
  ramUsedLabel?: string | null;
  ramTotalLabel?: string | null;
  sourceLabel?: string | null;
  collectedAtLabel?: string | null;
  metricAgeMinutes?: number | null;
  maxMetricAgeMinutes?: number | null;
  proofRef?: string | null;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function usagePair(used: string | null, total: string | null): string | null {
  if (used && total) return `${used} / ${total}`;
  return used ?? total;
}

function signedUpValue(users: OperatorUsersResponse | null | undefined): {
  value: string;
  detail: string;
  status: AdminWeddingOpsMetricCard["status"];
} {
  if (typeof users?.total_users === "number" && Number.isFinite(users.total_users)) {
    return {
      value: String(Math.max(0, Math.trunc(users.total_users))),
      detail: "Exact total from the operator users endpoint.",
      status: "ready",
    };
  }
  const visible = users?.users.length ?? 0;
  return {
    value: `At least ${visible}`,
    detail: "Backend total count is not mounted yet; showing the bounded visible admin rows.",
    status: "needs_backend",
  };
}

export function buildAdminWeddingOpsPanelState(args: {
  operatorUsers: OperatorUsersResponse | null | undefined;
  oracleMetrics?: AdminWeddingOpsOracleMetrics | null;
  vendorSearchProviders?: WeddingVendorSearchProviderEnvState | null;
  weddingAiRoutingPolicy?: AdminWeddingAiRoutingPolicyState | null;
  backendMetricsReadiness?: AdminWeddingOpsBackendMetricsReadinessState | null;
  providerExecutorProofPacket?: WeddingProviderExecutorProofPacketState | null;
  apiStack?: WeddingApiStackState | null;
  routeWeddingAiThroughAdmin: boolean;
}): AdminWeddingOpsPanelState {
  const signedUp = signedUpValue(args.operatorUsers);
  const source = clean(args.oracleMetrics?.sourceLabel) ?? "Oracle host metrics endpoint needed";
  const proof = clean(args.oracleMetrics?.proofRef);
  const collectedAt = clean(args.oracleMetrics?.collectedAtLabel);
  const disk = usagePair(clean(args.oracleMetrics?.diskUsedLabel), clean(args.oracleMetrics?.diskTotalLabel));
  const ram = usagePair(clean(args.oracleMetrics?.ramUsedLabel), clean(args.oracleMetrics?.ramTotalLabel));
  const routingPolicy = args.weddingAiRoutingPolicy ?? buildAdminWeddingAiRoutingPolicyState();
  const backendMetrics = args.backendMetricsReadiness ?? buildAdminWeddingOpsBackendMetricsReadinessState({
    operatorUsers: args.operatorUsers,
    oracleMetrics: args.oracleMetrics,
  });
  const routeActive = args.routeWeddingAiThroughAdmin && routingPolicy.productionReady;
  return {
    title: "Admin wedding operations",
    intro: "Admin-only controls for wedding-template operations. These controls must stay scoped to wedding template background work and must not reroute a user's Master Agent query.",
    metrics: [
      {
        title: "Oracle disk",
        value: disk ?? "Metric needed",
        detail: disk
          ? `Reported by ${source}${collectedAt ? ` at ${collectedAt}` : ""}${proof ? `; proof ${proof}` : ""}.`
          : "Mount a server-side Oracle disk metric before showing live capacity.",
        status: disk ? "ready" : "needs_backend",
      },
      {
        title: "Oracle RAM",
        value: ram ?? "Metric needed",
        detail: ram
          ? `Reported by ${source}${collectedAt ? ` at ${collectedAt}` : ""}${proof ? `; proof ${proof}` : ""}.`
          : "Mount a server-side Oracle RAM metric before showing live memory pressure.",
        status: ram ? "ready" : "needs_backend",
      },
      {
        title: "Signed-up users",
        value: signedUp.value,
        detail: signedUp.detail,
        status: signedUp.status,
      },
      {
        title: "Wedding vendor search",
        value: args.vendorSearchProviders?.readyProviderLabels.length
          ? args.vendorSearchProviders.readyProviderLabels.join(", ")
          : "Provider config needed",
        detail: args.vendorSearchProviders?.productionReady
          ? "Server-side provider config is present for wedding vendor research."
          : "Configure Brave Search, Google Places, or OSM/Overpass env before live vendor research.",
        status: args.vendorSearchProviders?.productionReady ? "ready" : "needs_backend",
      },
      {
        title: "Wedding AI routing policy",
        value: routingPolicy.productionReady ? "Backend enforced" : routingPolicy.status === "local_only" ? "Partial proof" : "Policy needed",
        detail: routingPolicy.productionReady
          ? routingPolicy.detail
          : routingPolicy.blockerLabels[0] ?? routingPolicy.detail,
        status: routingPolicy.productionReady ? "ready" : routingPolicy.status === "local_only" ? "local_only" : "needs_backend",
      },
      {
        title: "Ops backend metrics",
        value: backendMetrics.productionReady ? "Backend mounted" : backendMetrics.status === "partial" ? "Partial metrics" : "Metrics needed",
        detail: backendMetrics.productionReady
          ? backendMetrics.summary
          : backendMetrics.blockerLabels[0] ?? backendMetrics.summary,
        status: backendMetrics.productionReady ? "ready" : backendMetrics.status === "partial" ? "local_only" : "needs_backend",
      },
      {
        title: "Connected app proof",
        value: args.providerExecutorProofPacket?.canClearOracleProviderGate
          ? "Proof complete"
          : args.providerExecutorProofPacket?.status === "ready"
            ? "Proof refs needed"
            : "Proof blocked",
        detail: args.providerExecutorProofPacket?.canClearOracleProviderGate
          ? args.providerExecutorProofPacket.summary
          : args.providerExecutorProofPacket?.missingProofRefs[0]
            ?? args.providerExecutorProofPacket?.capabilityPackets.find((packet) => packet.blockers.length)?.blockers[0]
            ?? "Connect app sign-ins, callable actions, smoke receipts, and durable proof refs before Oracle upload.",
        status: args.providerExecutorProofPacket?.canClearOracleProviderGate
          ? "ready"
          : args.providerExecutorProofPacket
            ? "local_only"
            : "needs_backend",
      },
      {
        title: "Wedding API stack",
        value: args.apiStack?.missingRequiredLabels.length
          ? `${args.apiStack.missingRequiredLabels.length} missing`
          : args.apiStack
            ? "Required providers ready"
            : "Stack proof needed",
        detail: args.apiStack?.missingRequiredLabels.length
          ? `Connect ${args.apiStack.missingRequiredLabels.join(", ")} before live discovery, maps, scheduling, weather, or payments are treated as production-ready.`
          : args.apiStack
            ? args.apiStack.summary
            : "Supply the wedding API stack readiness state so admin ops can audit Places, Maps, Calendar, WeatherAPI, Stripe, SMS, and media processing.",
        status: args.apiStack?.missingRequiredLabels.length ? "needs_backend" : args.apiStack ? "ready" : "needs_backend",
      },
    ],
    toggle: {
      enabled: routeActive,
      label: "Route wedding template AI via admin API",
      statusLabel: routeActive
        ? "Backend-enforced wedding routing"
        : args.routeWeddingAiThroughAdmin
          ? "Staged locally; backend policy blocked"
          : "User-scoped by default",
      detail: "Scope is limited to wedding-template background work: planning-file generation, knowledge linking, topology, DecisionOS surfacing, provider-readiness checks, and follow-up loop analysis.",
      warning: routingPolicy.productionReady
        ? "Backend policy must continue to exclude direct Master Agent chat/query traffic and record per-use audit receipts."
        : "This must not route the user's direct Master Agent chat/query through the admin key. Production requires a backend policy endpoint, audit receipts, tenant boundaries, budget guardrails, and per-template enforcement.",
    },
    guardrails: [
      "Do not use the admin API for personal Master Agent queries.",
      "Do not expose admin prompts, keys, or cross-user context to wedding users.",
      "Record an AFP/audit receipt whenever server-side admin-funded wedding background work is used.",
      "Keep user-owned wedding memory, files, decisions, and approvals in the user's account.",
      routingPolicy.productionReady
        ? "Keep the backend policy evidence fresh before Oracle production upload."
        : "Treat the toggle as disabled in production until the backend routing policy is ready.",
      args.providerExecutorProofPacket?.canClearOracleProviderGate
        ? "Connected app proof packet can clear the Oracle connected-app gate."
        : "Keep Oracle upload blocked until the connected app proof packet is complete.",
      args.apiStack?.missingRequiredLabels.length
        ? `Connect required wedding APIs before production: ${args.apiStack.missingRequiredLabels.join(", ")}.`
        : "Keep horizontal wedding APIs as evidence sources; OmnyID storage and AFP records remain the source of truth.",
    ],
  };
}
