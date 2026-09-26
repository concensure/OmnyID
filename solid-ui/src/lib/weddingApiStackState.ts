// @locs-version: 1.0
export type WeddingApiStackNeed =
  | "vendor_discovery"
  | "maps_travel"
  | "calendar"
  | "weather"
  | "sms"
  | "payments"
  | "media_processing";

export type WeddingApiStackStatus = "ready" | "optional" | "missing";

export type WeddingApiStackProvider = {
  need: WeddingApiStackNeed;
  providerId: string;
  connectedAppId: string;
  label: string;
  omnyidUse: string;
  productionCritical: boolean;
  optional: boolean;
  status: WeddingApiStackStatus;
  ontologyRole: string;
  meteringRequired: boolean;
  usageEventSource: string;
  usageMetadataFields: string[];
  adminEnablementScopes: string[];
  guardrails: string[];
};

export type WeddingApiStackState = {
  providers: WeddingApiStackProvider[];
  readyProviderLabels: string[];
  missingRequiredLabels: string[];
  optionalProviderLabels: string[];
  meteringContractLabels: string[];
  requiredUsageMetadataFields: string[];
  guardrails: string[];
  summary: string;
};

export type WeddingApiStackInput = {
  connectedAppIds?: readonly string[] | null;
};

type WeddingApiStackProviderDefinition = Omit<
  WeddingApiStackProvider,
  "status" | "meteringRequired" | "usageEventSource" | "usageMetadataFields" | "adminEnablementScopes"
>;

const WEDDING_API_STACK: readonly WeddingApiStackProviderDefinition[] = [
  {
    need: "vendor_discovery",
    providerId: "google_places",
    connectedAppId: "google-places-api",
    label: "Google Places API",
    omnyidUse: "Discover venues and vendors, then anchor them as real place/vendor entities.",
    productionCritical: true,
    optional: false,
    ontologyRole: "Vendor entity/location evidence",
    guardrails: [
      "Use Places for entity facts, location, ratings, phone, website, and place ids.",
      "Do not infer package pricing or wedding availability from place ratings.",
    ],
  },
  {
    need: "maps_travel",
    providerId: "google_maps",
    connectedAppId: "google-maps-platform",
    label: "Google Maps Platform",
    omnyidUse: "Plan guest travel, venue distances, transport timing, and accessibility routes.",
    productionCritical: true,
    optional: false,
    ontologyRole: "Venue travel/accessibility topology",
    guardrails: [
      "Use Maps for travel/time facts, not vendor quality claims.",
      "Keep route evidence attached to the venue, event, and guest-logistics records.",
    ],
  },
  {
    need: "calendar",
    providerId: "google_calendar",
    connectedAppId: "gcal",
    label: "Google Calendar API",
    omnyidUse: "Create appointments, tastings, payment reminders, deadlines, and follow-up dates.",
    productionCritical: true,
    optional: false,
    ontologyRole: "Wedding deadline and appointment projection",
    guardrails: [
      "Only write calendar events after user approval or clear user action.",
      "Every calendar projection must link back to the source wedding task or decision.",
    ],
  },
  {
    need: "weather",
    providerId: "weatherapi",
    connectedAppId: "weatherapi",
    label: "WeatherAPI",
    omnyidUse: "Support outdoor-event contingency planning with forecast and alert evidence.",
    productionCritical: true,
    optional: false,
    ontologyRole: "Weather contingency evidence",
    guardrails: [
      "Show weather uncertainty clearly; never treat long-range forecasts as guaranteed.",
      "Keep a manual check fallback when live forecast evidence is missing.",
    ],
  },
  {
    need: "sms",
    providerId: "twilio",
    connectedAppId: "twilio-messaging",
    label: "Twilio Messaging",
    omnyidUse: "Send approved RSVP reminders, guest notifications, and supplier follow-ups.",
    productionCritical: false,
    optional: true,
    ontologyRole: "Approved outreach execution",
    guardrails: [
      "Never send SMS without explicit approval and recipient scope.",
      "Record send receipts, failures, and last-contact timestamps per guest/vendor.",
    ],
  },
  {
    need: "payments",
    providerId: "stripe",
    connectedAppId: "stripe",
    label: "Stripe",
    omnyidUse: "Run OmnyID subscriptions first; future vendor payment flows stay approval-gated.",
    productionCritical: true,
    optional: false,
    ontologyRole: "Subscription and payment receipt evidence",
    guardrails: [
      "Use Stripe for OmnyID billing before any vendor-payment automation.",
      "Vendor deposits require explicit human approval and a linked contract/payment schedule.",
    ],
  },
  {
    need: "media_processing",
    providerId: "cloudinary",
    connectedAppId: "cloudinary",
    label: "Cloudinary",
    omnyidUse: "Optionally generate thumbnails/transforms while OmnyID storage remains canonical.",
    productionCritical: false,
    optional: true,
    ontologyRole: "Inspiration media derivative",
    guardrails: [
      "Do not make Cloudinary the source of record; keep canonical files in OmnyID storage.",
      "Media derivatives must link back to the original inspiration object.",
    ],
  },
];

const WEDDING_SHARED_TOOL_USAGE_SOURCE = "wedding_shared_tool_usage_event";

const REQUIRED_USAGE_METADATA_FIELDS = [
  "user_id",
  "provider_id",
  "template_scope",
  "wedding_plan_id",
  "operation",
  "quantity",
  "estimated_cost",
  "provider_request_id",
];

const ADMIN_ENABLEMENT_SCOPES = ["all users", "wedding planner only"];

export function buildWeddingApiStackState(input: WeddingApiStackInput = {}): WeddingApiStackState {
  const connected = new Set(input.connectedAppIds ?? []);
  const providers = WEDDING_API_STACK.map((provider): WeddingApiStackProvider => {
    const ready = connected.has(provider.connectedAppId);
    return {
      ...provider,
      status: ready ? "ready" : provider.optional ? "optional" : "missing",
      meteringRequired: true,
      usageEventSource: WEDDING_SHARED_TOOL_USAGE_SOURCE,
      usageMetadataFields: REQUIRED_USAGE_METADATA_FIELDS,
      adminEnablementScopes: ADMIN_ENABLEMENT_SCOPES,
    };
  });
  const readyProviderLabels = providers.filter((provider) => provider.status === "ready").map((provider) => provider.label);
  const missingRequiredLabels = providers
    .filter((provider) => provider.status === "missing" && provider.productionCritical)
    .map((provider) => provider.label);
  const optionalProviderLabels = providers
    .filter((provider) => provider.optional && provider.status !== "ready")
    .map((provider) => provider.label);
  const meteringContractLabels = providers.map((provider) =>
    `${provider.label}: ${provider.usageEventSource} with ${provider.usageMetadataFields.join(", ")}`,
  );
  return {
    providers,
    readyProviderLabels,
    missingRequiredLabels,
    optionalProviderLabels,
    meteringContractLabels,
    requiredUsageMetadataFields: REQUIRED_USAGE_METADATA_FIELDS,
    guardrails: [
      "Use horizontal APIs for discovery, maps, scheduling, weather, messaging, billing, and media processing; do not start with a giant static vendor database.",
      "Provider facts become AFP-backed vendor, event, route, weather, outreach, payment, or inspiration evidence with typed references.",
      "Every vendor recommendation needs source receipts and must preserve pricing, availability, and booking uncertainty.",
      "Every admin-funded provider call must write wedding_shared_tool_usage_event before it appears in external-tool usage billing.",
    ],
    summary: missingRequiredLabels.length === 0
      ? "Wedding API stack has the required production providers connected."
      : `Wedding API stack is missing ${missingRequiredLabels.length} required provider${missingRequiredLabels.length === 1 ? "" : "s"}.`,
  };
}
