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

export function weddingVendorSearchProviderBlockedReason(
  capabilities: WeddingProviderCapabilitiesResponse | null | undefined,
): string | null {
  if (!capabilities) return "Checking admin-funded vendor search providers...";
  const providers = (capabilities.providers ?? []).filter((provider) =>
    WEDDING_LIVE_VENDOR_SEARCH_PROVIDER_KINDS.has(provider.kind as WeddingVendorSearchProviderKind),
  );
  if (providers.some((provider) => provider.configured)) return null;
  if (providers.length === 0) return "Vendor search provider status is unavailable.";

  const keyedButDisabled = providers
    .filter((provider) => provider.credentialConfigured && !provider.sharedCreditEnabled)
    .map((provider) => provider.label.trim())
    .filter(Boolean);
  if (keyedButDisabled.length > 0) {
    return `${keyedButDisabled.join(", ")} ${keyedButDisabled.length === 1 ? "has" : "have"} an admin key, but wedding shared-credit access is off. Enable the wedding-template toggle in admin settings.`;
  }

  const enabledButMissingKey = providers
    .filter((provider) => provider.sharedCreditEnabled && provider.credentialRequired && !provider.credentialConfigured)
    .map((provider) => provider.label.trim())
    .filter(Boolean);
  if (enabledButMissingKey.length > 0) {
    return `${enabledButMissingKey.join(", ")} ${enabledButMissingKey.length === 1 ? "is" : "are"} enabled for wedding use, but the admin API key is missing.`;
  }

  return "Vendor search needs an admin-configured search provider. No API key is required from this user.";
}

export function weddingVendorSearchProviderCautionReason(
  capabilities: WeddingProviderCapabilitiesResponse | null | undefined,
): string | null {
  const providers = (capabilities?.providers ?? []).filter((provider) =>
    provider.configured
      && WEDDING_LIVE_VENDOR_SEARCH_PROVIDER_KINDS.has(provider.kind as WeddingVendorSearchProviderKind),
  );
  const cautionLabels = providers
    .filter((provider) => {
      const status = provider.verificationStatus?.trim().toLowerCase();
      return status === "unverified" || status === "needs_attention";
    })
    .map((provider) => provider.diagnosticLabel?.trim() || `${provider.label.trim()} is configured but not live-verified yet.`)
    .filter(Boolean);
  if (cautionLabels.length === 0) return null;
  return cautionLabels.slice(0, 2).join(" ");
}
