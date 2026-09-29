// @locs-version: 1.0
import type { ExternalToolBillingStatus } from "@/lib/api";
import type { WeddingApiStackState } from "@/lib/weddingApiStackState";
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import { parseJsonValue } from "@/lib/jsonParseState";

export type AdminThirdPartyToolScope = "all_users" | "wedding_template";

export type AdminThirdPartyToolPolicyRecord = {
  toolId: string;
  enabledForAllUsers?: boolean | null;
  enabledForWeddingTemplate?: boolean | null;
  monthlyFreeQuotaLabel?: string | null;
  quotaUsedLabel?: string | null;
};

export type AdminThirdPartyToolPolicyRow = {
  toolId: string;
  label: string;
  use: string;
  requiredForWedding: boolean;
  enabledForAllUsers: boolean;
  enabledForWeddingTemplate: boolean;
  monthToDateCostLabel: string;
  monthToDateUsageLabel: string;
  quotaLabel: string;
  meteringStatusLabel: string;
  meteringDetailLabel: string;
  usageEventSourceLabel: string;
  usageMetadataLabel: string;
  weddingScopeProofLabel: string;
  statusLabel: string;
  warningLabel: string | null;
};

export type AdminThirdPartyToolPolicyState = {
  rows: AdminThirdPartyToolPolicyRow[];
  summary: string;
  overallCostLabel: string;
  sourceLabel: string;
  guardrails: string[];
};

export type AdminThirdPartyToolPolicyInput = {
  apiStack?: WeddingApiStackState | null;
  billing?: ExternalToolBillingStatus | null;
  policies?: readonly AdminThirdPartyToolPolicyRecord[] | null;
  policySourceLabel?: string | null;
  formatCostLabel: (amount: number | null | undefined) => string;
};

const ADMIN_THIRD_PARTY_TOOL_POLICY_KEY = "omnyid.admin_third_party_tool_policy.v1";

const DEFAULT_SHARED_TOOL_USES: Record<string, string> = {
  "brave-search-api": "Live browser search for source-backed vendor discovery, website checks, reviews, and availability clues.",
  "exa-search-api": "Semantic web-search fallback for source-backed vendor discovery, highlights, and vendor-fit evidence.",
  "google-places-api": "Venue and vendor discovery with place IDs, contact details, ratings, locations, and websites.",
  "google-maps-platform": "Maps, travel time, route checks, and venue logistics.",
  gcal: "Calendar appointments, payment reminders, tastings, deadlines, and follow-up dates.",
  weatherapi: "Weather forecasts, alert checks, and outdoor contingency planning.",
  "twilio-messaging": "Approved SMS reminders for RSVPs, guests, vendors, and follow-ups.",
  stripe: "OmnyID subscriptions first; future vendor payments stay approval-gated.",
  cloudinary: "Optional thumbnails and media transforms while OmnyID storage stays canonical.",
};

const TOOL_BILLING_ALIASES: Record<string, string[]> = {
  "brave-search-api": ["brave_search", "brave-search", "brave search api", "browser search", "web search"],
  "exa-search-api": ["exa_search", "exa-search", "exa search api", "exa", "semantic search", "web search"],
  "google-places-api": ["google_places", "google-places", "places-api", "google places api", "places"],
  "google-maps-platform": ["google_maps", "google-maps", "maps", "google maps platform", "google maps"],
  gcal: ["google_calendar", "google-calendar", "google-calendar-api", "google calendar api", "calendar"],
  weatherapi: ["weather-api", "weather_api", "weatherapi.com", "weather"],
  "twilio-messaging": ["twilio", "twilio-sms", "twilio_sms", "twilio messaging", "twilio sms", "sms"],
  stripe: ["stripe-billing", "stripe_payments", "stripe payments"],
  cloudinary: ["cloudinary-media", "cloudinary_media", "media transforms", "image transforms"],
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function quantityLabel(quantity: number, unit: string | null): string {
  const rounded = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2);
  const normalizedUnit = unit || "usage unit";
  const pluralSuffix = quantity === 1 || normalizedUnit.endsWith("s") ? "" : "s";
  return `${rounded} ${normalizedUnit}${pluralSuffix}`;
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function normalizedToolAliases(toolId: string): Set<string> {
  const base = normalized(toolId);
  const aliases = [
    base,
    base.replaceAll("-", "_"),
    base.replaceAll("_", "-"),
    base.replaceAll(/[-_]+/g, " "),
    ...(TOOL_BILLING_ALIASES[base] ?? []),
  ];
  return new Set(aliases.map(normalized).filter(Boolean));
}

function normalizePolicyRecord(value: unknown): AdminThirdPartyToolPolicyRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const toolId = clean(record.toolId);
  if (!toolId) return null;
  return {
    toolId,
    enabledForAllUsers: record.enabledForAllUsers === true,
    enabledForWeddingTemplate: record.enabledForWeddingTemplate === true,
    monthlyFreeQuotaLabel: clean(record.monthlyFreeQuotaLabel),
    quotaUsedLabel: clean(record.quotaUsedLabel),
  };
}

function normalizePolicyRecords(value: unknown): AdminThirdPartyToolPolicyRecord[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Map<string, AdminThirdPartyToolPolicyRecord>();
  for (const entry of value) {
    const normalizedEntry = normalizePolicyRecord(entry);
    if (normalizedEntry) deduped.set(normalized(normalizedEntry.toolId), normalizedEntry);
  }
  return Array.from(deduped.values()).sort((a, b) => a.toolId.localeCompare(b.toolId));
}

function policyByToolId(policies: readonly AdminThirdPartyToolPolicyRecord[] | null | undefined) {
  return new Map((policies ?? []).map((policy) => [normalized(policy.toolId), policy]));
}

function billedUsageForTool(billing: ExternalToolBillingStatus | null | undefined, toolId: string) {
  const aliases = normalizedToolAliases(toolId);
  const items = (billing?.items ?? []).filter((item) => {
    const slug = normalized(item.tool_slug ?? "");
    const key = normalized(item.provider_key ?? "");
    const name = normalized(item.tool_name ?? "");
    return aliases.has(slug) || aliases.has(key) || aliases.has(name) || Array.from(aliases).some((alias) => alias.length > 3 && name.includes(alias));
  });
  return {
    quantity: items.reduce((sum, item) => sum + Math.max(0, Number(item.total_quantity ?? 0)), 0),
    cost: items.reduce((sum, item) => sum + Math.max(0, Number(item.total_estimated_cost_usd ?? 0)), 0),
    eventCount: items.reduce((sum, item) => sum + Math.max(0, Number(item.event_count ?? 0)), 0),
    unit: clean(items[0]?.usage_unit) ?? "requests",
  };
}

function weddingScopeProof(input: {
  billing: ExternalToolBillingStatus | null | undefined;
  toolId: string;
  enabledForWeddingTemplate: boolean;
  quantity: number;
  eventCount: number;
}): { weddingScopeProofLabel: string; warningLabel: string | null } {
  if (!input.enabledForWeddingTemplate) {
    return { weddingScopeProofLabel: "Wedding scope off", warningLabel: null };
  }
  if (!input.billing) {
    return {
      weddingScopeProofLabel: "Wedding scope proof waits for usage data.",
      warningLabel: null,
    };
  }
  if (input.quantity <= 0 && input.eventCount <= 0) {
    return {
      weddingScopeProofLabel: "No wedding usage recorded yet.",
      warningLabel: null,
    };
  }
  const aliases = normalizedToolAliases(input.toolId);
  const weddingEvents = input.billing.recent_events.filter((event) => {
    const slug = normalized(event.tool_slug ?? "");
    const key = normalized(event.provider_key ?? "");
    const name = normalized(event.tool_name ?? "");
    const source = normalized(event.source ?? "");
    const billingCategory = normalized(event.billing_category ?? "");
    const providerCategory = normalized(event.provider_category ?? "");
    const matchesTool = aliases.has(slug)
      || aliases.has(key)
      || aliases.has(name)
      || Array.from(aliases).some((alias) => alias.length > 3 && name.includes(alias));
    const isWeddingScoped = source.includes("wedding_shared_tool_usage_event")
      || source.includes("wedding_planner_shared_tool")
      || (source.includes("wedding") && source.includes("usage"))
      || billingCategory.includes("wedding")
      || providerCategory.includes("wedding");
    return matchesTool && isWeddingScoped;
  });
  if (weddingEvents.length > 0) {
    return {
      weddingScopeProofLabel: `${weddingEvents.length} recent wedding-scoped usage event${weddingEvents.length === 1 ? "" : "s"}.`,
      warningLabel: null,
    };
  }
  return {
    weddingScopeProofLabel: "Aggregate usage exists, but recent events do not show wedding_shared_tool_usage_event proof.",
    warningLabel: "Wedding-only shared tools should emit wedding_shared_tool_usage_event so usage can be audited per user and per wedding plan.",
  };
}

function meteringStatus(input: {
  billing: ExternalToolBillingStatus | null | undefined;
  enabledForAllUsers: boolean;
  enabledForWeddingTemplate: boolean;
  quantity: number;
  eventCount: number;
}): { meteringStatusLabel: string; meteringDetailLabel: string; warningLabel: string | null } {
  const enabled = input.enabledForAllUsers || input.enabledForWeddingTemplate;
  if (!enabled) {
    return {
      meteringStatusLabel: "Metering idle",
      meteringDetailLabel: "This tool is not admin-funded yet.",
      warningLabel: null,
    };
  }
  if (!input.billing) {
    return {
      meteringStatusLabel: "Metering proof missing",
      meteringDetailLabel: "Usage cannot be audited until backend billing status is loaded.",
      warningLabel: "Admin-funded tools should not be enabled without visible per-user and total usage metering.",
    };
  }
  if (input.quantity <= 0 && input.eventCount <= 0) {
    return {
      meteringStatusLabel: "No usage recorded",
      meteringDetailLabel: "Enabled, but no usage events have been recorded this month.",
      warningLabel: "If users have used this provider, check that wedding_shared_tool_usage_event is writing usage events.",
    };
  }
  return {
    meteringStatusLabel: "Metering active",
    meteringDetailLabel: `${input.eventCount || 1} usage event${input.eventCount === 1 ? "" : "s"} recorded this month.`,
    warningLabel: null,
  };
}

function rowStatus(row: {
  enabledForAllUsers: boolean;
  enabledForWeddingTemplate: boolean;
  requiredForWedding: boolean;
}): { statusLabel: string; warningLabel: string | null } {
  if (row.enabledForAllUsers) return { statusLabel: "Enabled for all users", warningLabel: null };
  if (row.enabledForWeddingTemplate) return { statusLabel: "Enabled for wedding planner", warningLabel: null };
  return {
    statusLabel: "User-managed",
    warningLabel: row.requiredForWedding
      ? "Wedding planner users may be blocked unless this is enabled by admin or connected by the user."
      : null,
  };
}

function policySourceLabel(value: string | null | undefined): string {
  switch (value) {
    case "admin-third-party-tool-policy-file":
      return "Saved admin policy";
    case "admin-third-party-tool-policy-env":
      return "Deployment defaults";
    case "admin-third-party-tool-policy-local":
      return "Saved in this browser";
    default:
      return "Policy source not reported";
  }
}

export function buildAdminThirdPartyToolPolicyState(
  input: AdminThirdPartyToolPolicyInput,
): AdminThirdPartyToolPolicyState {
  const policies = policyByToolId(input.policies);
  const apiProviders = input.apiStack?.providers ?? [];
  const providerIds = new Set([
    ...apiProviders.map((provider) => provider.connectedAppId),
    "brave-search-api",
    "exa-search-api",
    "google-places-api",
    "google-maps-platform",
    "weatherapi",
    "twilio-messaging",
    "stripe",
    "cloudinary",
  ]);
  let totalCost = 0;
  const rows = Array.from(providerIds).map((toolId): AdminThirdPartyToolPolicyRow => {
    const provider = apiProviders.find((candidate) => candidate.connectedAppId === toolId);
    const policy = policies.get(normalized(toolId));
    const usage = billedUsageForTool(input.billing, toolId);
    totalCost += usage.cost;
    const enabledForAllUsers = policy?.enabledForAllUsers === true;
    const enabledForWeddingTemplate = policy?.enabledForWeddingTemplate === true;
    const status = rowStatus({
      enabledForAllUsers,
      enabledForWeddingTemplate,
      requiredForWedding: provider?.productionCritical === true,
    });
    const metering = meteringStatus({
      billing: input.billing,
      enabledForAllUsers,
      enabledForWeddingTemplate,
      quantity: usage.quantity,
      eventCount: usage.eventCount,
    });
    const scopeProof = weddingScopeProof({
      billing: input.billing,
      toolId,
      enabledForWeddingTemplate,
      quantity: usage.quantity,
      eventCount: usage.eventCount,
    });
    return {
      toolId,
      label: provider?.label ?? toolId.replaceAll("-", " "),
      use: provider?.omnyidUse ?? DEFAULT_SHARED_TOOL_USES[toolId] ?? "Third-party tool used by OmnyID workflows.",
      requiredForWedding: provider?.productionCritical === true,
      enabledForAllUsers,
      enabledForWeddingTemplate,
      monthToDateCostLabel: input.formatCostLabel(usage.cost),
      monthToDateUsageLabel: usage.quantity > 0 ? quantityLabel(usage.quantity, usage.unit) : "No recorded usage",
      quotaLabel: clean(policy?.quotaUsedLabel) ?? clean(policy?.monthlyFreeQuotaLabel) ?? "Quota not set",
      meteringStatusLabel: metering.meteringStatusLabel,
      meteringDetailLabel: metering.meteringDetailLabel,
      usageEventSourceLabel: provider?.usageEventSource
        ? `Usage event: ${provider.usageEventSource}`
        : "Usage event: external tool usage event",
      usageMetadataLabel: provider?.usageMetadataFields.length
        ? `Records ${provider.usageMetadataFields.join(", ")}`
        : "Records user, provider, operation, quantity, and estimated cost.",
      weddingScopeProofLabel: scopeProof.weddingScopeProofLabel,
      ...status,
      warningLabel: metering.warningLabel ?? scopeProof.warningLabel ?? status.warningLabel,
    };
  }).sort((a, b) => Number(b.requiredForWedding) - Number(a.requiredForWedding) || a.label.localeCompare(b.label));
  const enabledCount = rows.filter((row) => row.enabledForAllUsers || row.enabledForWeddingTemplate).length;
  return {
    rows,
    summary: `${enabledCount} shared provider${enabledCount === 1 ? "" : "s"} enabled by admin.`,
    overallCostLabel: input.formatCostLabel(totalCost),
    sourceLabel: policySourceLabel(input.policySourceLabel),
    guardrails: [
      "Admin-enabled tools must be metered per user and as an overall account summary.",
      "Wedding-only enablement must stay scoped to wedding planner background work and approved actions.",
      "Users should not need to bring their own API keys for admin-funded wedding planner tools.",
    ],
  };
}

export function nextAdminThirdPartyToolPolicy(
  policies: readonly AdminThirdPartyToolPolicyRecord[],
  toolId: string,
  scope: AdminThirdPartyToolScope,
  enabled: boolean,
): AdminThirdPartyToolPolicyRecord[] {
  const normalizedId = normalized(toolId);
  const next = policies.filter((policy) => normalized(policy.toolId) !== normalizedId);
  const current = policies.find((policy) => normalized(policy.toolId) === normalizedId);
  next.push({
    ...current,
    toolId,
    enabledForAllUsers: scope === "all_users" ? enabled : current?.enabledForAllUsers ?? false,
    enabledForWeddingTemplate: scope === "wedding_template" ? enabled : current?.enabledForWeddingTemplate ?? false,
  });
  return next.sort((a, b) => a.toolId.localeCompare(b.toolId));
}

export function loadAdminThirdPartyToolPolicies(userId: string | null | undefined): AdminThirdPartyToolPolicyRecord[] {
  const key = accountScopedStorageKey(ADMIN_THIRD_PARTY_TOOL_POLICY_KEY, userId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) return [];
    return normalizePolicyRecords(parsed.value);
  } catch {
    return [];
  }
}

export function saveAdminThirdPartyToolPolicies(
  userId: string | null | undefined,
  policies: readonly AdminThirdPartyToolPolicyRecord[],
): AdminThirdPartyToolPolicyRecord[] {
  const normalizedPolicies = normalizePolicyRecords(policies);
  try {
    localStorage.setItem(
      accountScopedStorageKey(ADMIN_THIRD_PARTY_TOOL_POLICY_KEY, userId),
      JSON.stringify(normalizedPolicies),
    );
  } catch {
    // Ignore storage failures; server persistence is the production source of truth.
  }
  return normalizedPolicies;
}
