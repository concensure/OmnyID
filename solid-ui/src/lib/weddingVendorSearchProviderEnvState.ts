// @locs-version: 2.0
export type WeddingVendorSearchProviderKind = "brave_search" | "google_places" | "overpass";

export type WeddingVendorSearchProviderEnvState = {
  providers: WeddingVendorSearchProviderEnvStatus[];
  connectedAppIds: string[];
  readyProviderLabels: string[];
  productionReady: boolean;
  missingLabels: string[];
  guardrails: string[];
};

export type WeddingVendorSearchProviderEnvStatus = {
  kind: WeddingVendorSearchProviderKind;
  connectedAppId: string;
  label: string;
  credentialRequired: boolean;
  configured: boolean;
  productionReady: boolean;
  missingLabel: string | null;
  detail: string;
};

type EnvLike = Record<string, string | undefined>;

const PROVIDERS: readonly {
  kind: WeddingVendorSearchProviderKind;
  connectedAppId: string;
  label: string;
  keyNames: readonly string[];
  credentialRequired: boolean;
  detail: string;
}[] = [
  {
    kind: "brave_search",
    connectedAppId: "brave-search-api",
    label: "Brave Search",
    keyNames: [
      "OMNYID_ADMIN_BRAVE_SEARCH_API_KEY",
      "OMNYID_ADMIN_BRAVE_SEARCH_API_KEY_FILE",
      "OMNYID_BRAVE_SEARCH_API_KEY",
      "OMNYID_BRAVE_SEARCH_API_KEY_FILE",
      "BRAVE_SEARCH_API_KEY",
      "BRAVE_SEARCH_API_KEY_FILE",
      "BRAVE_API_KEY",
      "BRAVE_API_KEY_FILE",
    ],
    credentialRequired: true,
    detail: "Broad web/vendor discovery for source-cited shortlist research.",
  },
  {
    kind: "google_places",
    connectedAppId: "google-places-api",
    label: "Google Places API",
    keyNames: [
      "OMNYID_ADMIN_GOOGLE_PLACES_API_KEY",
      "OMNYID_ADMIN_GOOGLE_PLACES_API_KEY_FILE",
      "OMNYID_GOOGLE_PLACES_API_KEY",
      "OMNYID_GOOGLE_PLACES_API_KEY_FILE",
      "GOOGLE_PLACES_API_KEY",
      "GOOGLE_PLACES_API_KEY_FILE",
      "GOOGLE_MAPS_API_KEY",
      "GOOGLE_MAPS_API_KEY_FILE",
    ],
    credentialRequired: true,
    detail: "Near-live place details, phone numbers, websites, opening hours, and review metadata.",
  },
  {
    kind: "overpass",
    connectedAppId: "overpass-api",
    label: "OSM / Overpass API",
    keyNames: ["OMNYID_OVERPASS_API_URL"],
    credentialRequired: false,
    detail: "Open fallback for venue, florist, photographer, and amenity discovery; requires endpoint and contact/rate-limit policy.",
  },
];

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasAny(env: EnvLike, names: readonly string[]): boolean {
  return names.some((name) => Boolean(clean(env[name])));
}

function overpassPolicyReady(env: EnvLike): boolean {
  return Boolean(clean(env.OMNYID_OVERPASS_API_URL))
    && Boolean(clean(env.OMNYID_OVERPASS_CONTACT_EMAIL))
    && Boolean(clean(env.OMNYID_OVERPASS_RATE_LIMIT_PER_MINUTE));
}

export function buildWeddingVendorSearchProviderEnvState(env: EnvLike): WeddingVendorSearchProviderEnvState {
  const providers = PROVIDERS.map((provider): WeddingVendorSearchProviderEnvStatus => {
    const configured = provider.kind === "overpass" ? overpassPolicyReady(env) : hasAny(env, provider.keyNames);
    return {
      kind: provider.kind,
      connectedAppId: provider.connectedAppId,
      label: provider.label,
      credentialRequired: provider.credentialRequired,
      configured,
      productionReady: configured,
      missingLabel: configured
        ? null
        : provider.kind === "overpass"
          ? "Overpass endpoint, contact email, and rate-limit config are required."
          : `${provider.label} API key is missing.`,
      detail: provider.detail,
    };
  });
  const readyProviders = providers.filter((provider) => provider.productionReady);
  return {
    providers,
    connectedAppIds: readyProviders.map((provider) => provider.connectedAppId),
    readyProviderLabels: readyProviders.map((provider) => provider.label),
    productionReady: readyProviders.length > 0,
    missingLabels: providers.flatMap((provider) => provider.missingLabel ? [provider.missingLabel] : []),
    guardrails: [
      "Keep provider keys server-side; the client receives only readiness and source receipts.",
      "Prefer Google Places for live place facts, Brave for broader web discovery, and Overpass as an open fallback.",
      "Every live search result must become a source-cited wedding research artifact or audit receipt.",
      "Vendor search remains scoped to wedding-template work and must not reroute unrelated Master Agent queries.",
    ],
  };
}

export function weddingVendorSearchConnectedAppIdsFromEnv(env: EnvLike): string[] {
  return buildWeddingVendorSearchProviderEnvState(env).connectedAppIds;
}
