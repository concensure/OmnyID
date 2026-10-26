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
  ownership_verified: boolean;
  expires_at: string | null;
}

export interface VendorClaimSuggestion {
  vendor_slug: string;
  vendor_name: string;
  category: string;
  service_area: string;
}

export interface VendorOwnershipMethod {
  id: "email_domain" | "website_meta" | "social_business";
  label: string;
  available: boolean;
  instant: boolean;
  detail: string;
  target?: string | null;
}

export interface VendorOwnershipStatus {
  claim: Pick<VendorClaim, "claim_id" | "status" | "expires_at" | "ownership_verified">;
  listing: {
    vendor_slug: string;
    vendor_name: string;
    category: string;
    service_area: string;
    website_url?: string | null;
  };
  methods: VendorOwnershipMethod[];
}

export interface VendorWebsiteChallenge {
  proof_id: string;
  method: "website_meta";
  target: string;
  token: string;
  meta_tag: string;
  well_known_path: string;
  dns_record_name: string;
  dns_record_value: string;
  expires_at: string;
}

export interface VendorOwnerProfile {
  vendor_slug: string;
  vendor_name: string;
  category: string;
  service_area: string;
  address?: string | null;
  description: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  website_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  photo_count: number;
  completion_percent: number;
  verified_badge: boolean;
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

export async function getVendorClaimSuggestions(query: string): Promise<VendorClaimSuggestion[]> {
  const response = await apiFetch<{ items?: VendorClaimSuggestion[] }>(`/api/wedding/vendor/suggestions?q=${encodeURIComponent(query)}`);
  return Array.isArray(response.items) ? response.items.slice(0, 8) : [];
}

export const getVendorOwnership = (vendorSlug: string) =>
  apiFetch<VendorOwnershipStatus>(`/api/wedding/vendor/ownership?vendor_slug=${encodeURIComponent(vendorSlug)}`);

export const createVendorWebsiteChallenge = (vendorSlug: string) =>
  apiFetch<VendorWebsiteChallenge>("/api/wedding/vendor/ownership/challenge", {
    method: "POST",
    bodyJson: { vendor_slug: vendorSlug, method: "website_meta" },
  });

export const verifyVendorOwnership = (input: { vendorSlug: string; method: string; token?: string }) =>
  apiFetch<{ status: "verified"; ownership_verified: true; verified_badge: true }>("/api/wedding/vendor/ownership/verify", {
    method: "POST",
    bodyJson: { vendor_slug: input.vendorSlug, method: input.method, token: input.token },
  });

export const releaseVendorOwnershipClaim = (vendorSlug: string) =>
  apiFetch<{ released: true; vendor_slug: string }>("/api/wedding/vendor/ownership/release", {
    method: "POST",
    bodyJson: { vendor_slug: vendorSlug },
  });

export const getVendorOwnerProfile = (vendorSlug: string) =>
  apiFetch<VendorOwnerProfile>(`/api/wedding/vendor/profile?vendor_slug=${encodeURIComponent(vendorSlug)}`);

export const updateVendorOwnerProfile = (vendorSlug: string, profile: Partial<VendorOwnerProfile>) =>
  apiFetch<VendorOwnerProfile>(`/api/wedding/vendor/profile?vendor_slug=${encodeURIComponent(vendorSlug)}`, {
    method: "PUT",
    bodyJson: profile,
  });
