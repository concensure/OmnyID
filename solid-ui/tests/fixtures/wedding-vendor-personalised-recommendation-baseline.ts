import type {
  WeddingVendorAttributeEvidence,
  WeddingVendorRankingRequirements,
  WeddingVendorRankingSource,
} from "../../src/lib/weddingVendorRankingState.ts";

function attribute(value: unknown): WeddingVendorAttributeEvidence {
  return {
    status: "known",
    value,
    confidence: 0.8,
    authority: "directory",
  };
}

/**
 * Consent-safe reproduction of the documented sparse Bondi Icebergs record.
 * It deliberately contains no couple data other than the synthetic requirements below.
 */
export const WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE: WeddingVendorRankingSource = {
  id: "venue-bondi-icebergs-club",
  vendor_id: "venue-bondi-icebergs-club",
  title: "Bondi Icebergs Club",
  provider: "Directory",
  url: "https://icebergs.example.test/weddings",
  websiteUrl: "https://icebergs.example.test/weddings",
  mapUrl: null,
  imageUrl: null,
  address: "1 Notts Avenue, Bondi Beach NSW 2026",
  phone: null,
  email: null,
  instagramUrl: null,
  snippet: "Ocean-pool venue overlooking Bondi Beach for wedding receptions.",
  category: "venue",
  attributes: {
    style_tags: attribute(["iconic", "panoramic views", "swimming club"]),
    editorial_summary: attribute("An ocean-pool reception setting with panoramic Bondi Beach views."),
    location_setting_class: attribute("iconic_waterfront"),
    in_house_catering: attribute(true),
    indoor_space: attribute(true),
    reception_on_site: attribute(true),
  },
};

export const WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS: WeddingVendorRankingRequirements = {
  topPriorities: ["Intimacy"],
  location: "Bondi, Sydney",
  vendorCategories: ["venue"],
};
