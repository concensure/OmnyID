// @module-id: wedding.vendor-claim-api
// @primary-capability: claimant-intake-api-client
// @locs-version: 1.0
// @stability: beta
// @owner: omnyid
import { apiFetch } from "@/lib/api";

export interface VendorClaim {
  claim_id: string;
  vendor_slug: string;
  status: string;
  requires_agent_card: boolean;
  expected_agent_id: string;
}

export async function startVendorClaim(input: { vendorSlug: string; declaredRole: string }): Promise<VendorClaim> {
  return apiFetch<VendorClaim>("/api/wedding/vendor/intake", {
    method: "POST",
    bodyJson: { vendor_slug: input.vendorSlug, declared_role: input.declaredRole },
  });
}

export async function getVendorClaim(vendorSlug: string): Promise<VendorClaim | null> {
  const response = await apiFetch<{ claim: VendorClaim | null }>(`/api/wedding/vendor/intake?vendor_slug=${encodeURIComponent(vendorSlug)}`);
  return response.claim ?? null;
}
