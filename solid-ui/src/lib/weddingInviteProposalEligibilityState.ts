// @locs-version: 1.0
import type { WeddingVendor } from "@/lib/api";

export type WeddingInviteProposalRecipientRoute =
  | "authenticated_vendor"
  | "verified_email"
  | "unclaimed_referral"
  | "ineligible";

export type WeddingInviteProposalEligibility = {
  eligible: boolean;
  route: WeddingInviteProposalRecipientRoute;
  label: string;
  reason: string;
  vendor: WeddingVendor | null;
};

type Candidate = {
  vendorId?: string | null;
  vendorName: string;
  category?: string | null;
  email?: string | null;
};

function normalized(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    : "";
}

function categoryGroup(value: unknown): string {
  const key = normalized(value);
  if (/\b(?:venues?|receptions?|function rooms?|event spaces?)\b/.test(key)) return "venue";
  if (/\b(?:photographers?|photography|photos?|videographers?|videography|videos?)\b/.test(key)) return "photo_video";
  if (/\b(?:celebrants?|officiants?)\b/.test(key)) return "celebrant";
  if (/\b(?:florists?|floral|flowers?|decor|styling)\b/.test(key)) return "flowers_decor";
  if (/\b(?:caterers?|catering|food|beverages?)\b/.test(key)) return "catering";
  if (/\b(?:bands?|music|djs?|entertainment)\b/.test(key)) return "entertainment";
  if (/\b(?:planners?|coordinators?)\b/.test(key)) return "planner";
  return key;
}

const PLACE_GROUPS: ReadonlyArray<{ id: string; terms: RegExp }> = [
  { id: "nsw", terms: /\b(?:nsw|new south wales|sydney|newcastle|wollongong|blue mountains|central coast|hunter valley)\b/ },
  { id: "vic", terms: /\b(?:vic|victoria|melbourne|geelong)\b/ },
  { id: "qld", terms: /\b(?:qld|queensland|brisbane|gold coast|sunshine coast|cairns)\b/ },
  { id: "sa", terms: /\b(?:sa|south australia|adelaide)\b/ },
  { id: "wa", terms: /\b(?:wa|western australia|perth)\b/ },
  { id: "tas", terms: /\b(?:tas|tasmania|hobart|launceston)\b/ },
  { id: "act", terms: /\b(?:act|canberra)\b/ },
  { id: "nt", terms: /\b(?:nt|northern territory|darwin)\b/ },
];

function placeGroup(value: unknown): string | null {
  const key = normalized(value);
  return PLACE_GROUPS.find((group) => group.terms.test(key))?.id ?? null;
}

function locationCompatible(serviceArea: string, requestedLocation: string | null): boolean {
  if (!requestedLocation?.trim()) return true;
  const area = normalized(serviceArea);
  if (!area || /\b(?:australia wide|nationwide|all australia|remote|online)\b/.test(area)) return true;
  const requested = normalized(requestedLocation);
  if (area.includes(requested) || requested.includes(area)) return true;
  const areaGroup = placeGroup(area);
  const requestedGroup = placeGroup(requested);
  return !areaGroup || !requestedGroup || areaGroup === requestedGroup;
}

function hasOptOut(vendor: WeddingVendor): boolean {
  const evidence = vendor.evidence ?? {};
  const optOut = evidence["proposal_opt_out"] === true
    || evidence["contact_opt_out"] === true
    || evidence["do_not_contact"] === true;
  return optOut || vendor.caveatLabels.some((label) => /(?:proposal|contact).*(?:opt.?out|suppressed)|do not contact/i.test(label));
}

function verifiedEmail(vendor: WeddingVendor): boolean {
  const evidence = vendor.evidence ?? {};
  return evidence["contact_email_verified"] === true || evidence["email_verified"] === true;
}

function matchDirectoryVendor(candidate: Candidate, vendors: readonly WeddingVendor[]): WeddingVendor | null {
  const id = candidate.vendorId?.trim();
  if (id) {
    const byId = vendors.find((vendor) => vendor.vendorId === id);
    if (byId) return byId;
  }
  const name = normalized(candidate.vendorName);
  return vendors.find((vendor) => normalized(vendor.vendorName) === name) ?? null;
}

export function weddingInviteProposalRecipientEligibility(input: {
  candidate: Candidate;
  vendorDirectory?: readonly WeddingVendor[] | null;
  requestedCategory?: string | null;
  requestedLocation?: string | null;
}): WeddingInviteProposalEligibility {
  const vendor = matchDirectoryVendor(input.candidate, input.vendorDirectory ?? []);
  if (!vendor) {
    return { eligible: false, route: "ineligible", label: "Needs a directory record", reason: "Add or verify this business in the vendor directory before inviting it.", vendor: null };
  }
  if (vendor.status !== "active") {
    return { eligible: false, route: "ineligible", label: "Unavailable for invitations", reason: "This listing is not currently active.", vendor };
  }
  if (vendor.claimStatus === "disputed") {
    return { eligible: false, route: "ineligible", label: "Ownership under review", reason: "Wait until the listing ownership review is resolved.", vendor };
  }
  if (hasOptOut(vendor)) {
    return { eligible: false, route: "ineligible", label: "Does not accept invitations", reason: "This business has asked not to receive proposal invitations.", vendor };
  }
  const requestedCategory = categoryGroup(input.requestedCategory ?? input.candidate.category);
  const vendorCategory = categoryGroup(vendor.category);
  if (requestedCategory && vendorCategory && requestedCategory !== vendorCategory) {
    return { eligible: false, route: "ineligible", label: "Different vendor category", reason: `This listing is for ${vendor.category}, not the selected request.`, vendor };
  }
  if (!locationCompatible(vendor.serviceArea, input.requestedLocation ?? null)) {
    return { eligible: false, route: "ineligible", label: "Outside the service area", reason: `This business lists ${vendor.serviceArea} as its service area.`, vendor };
  }
  if (vendor.claimStatus === "verified" && vendor.linkedAgentId) {
    return { eligible: true, route: "authenticated_vendor", label: "Verified OmnyID vendor", reason: "The proposal can use the vendor's verified private OmnyID channel after your approval.", vendor };
  }
  const email = vendor.contactEmail?.trim() || input.candidate.email?.trim();
  if (email && verifiedEmail(vendor)) {
    return { eligible: true, route: "verified_email", label: "Verified business email", reason: "The proposal can use the verified business email after your approval.", vendor };
  }
  if (email) {
    return { eligible: true, route: "unclaimed_referral", label: "Scoped vendor link", reason: "The vendor can receive a private, expiring proposal link without creating an account.", vendor };
  }
  return { eligible: false, route: "ineligible", label: "No private delivery route", reason: "Add a supported business email or wait for the vendor to claim this listing.", vendor };
}
