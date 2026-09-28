// @locs-version: 1.0
// @module-id: ui.wedding-vendor-provider-capability-state
// @primary-capability: response-queue-wedding-workspace
// @stability: beta
import type { WeddingProviderCapabilitiesResponse } from "@/lib/api";
import type { WeddingVendorSearchProviderKind } from "@/lib/weddingVendorSearchProviderEnvState";

const WEDDING_LIVE_VENDOR_SEARCH_PROVIDER_KINDS = new Set<WeddingVendorSearchProviderKind>([
  "google_places",
  "brave_search",
  "overpass",
]);

export function weddingConfiguredVendorSearchProviderKinds(
  capabilities: WeddingProviderCapabilitiesResponse | null | undefined,
): WeddingVendorSearchProviderKind[] {
  return (capabilities?.providers ?? [])
    .filter((provider) => provider.configured)
    .map((provider) => provider.kind)
    .filter((kind): kind is WeddingVendorSearchProviderKind =>
      WEDDING_LIVE_VENDOR_SEARCH_PROVIDER_KINDS.has(kind as WeddingVendorSearchProviderKind),
    );
}

export function weddingConfiguredVendorSearchProviderLabel(
  capabilities: WeddingProviderCapabilitiesResponse | null | undefined,
  kinds: readonly WeddingVendorSearchProviderKind[],
): string {
  const labels = (capabilities?.providers ?? [])
    .filter((provider) => provider.configured && kinds.includes(provider.kind as WeddingVendorSearchProviderKind))
    .map((provider) => provider.label.trim())
    .filter(Boolean);
  return labels.length > 0 ? labels.join(", ") : "connected providers";
}
