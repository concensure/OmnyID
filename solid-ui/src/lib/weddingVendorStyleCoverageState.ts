// @locs-version: 1.0

export const WEDDING_VENDOR_STYLE_MATCH_MINIMUM = 50;

export type WeddingVendorStyleCoverage = {
  category: string;
  listedVendors: number;
  vendorsWithStyleTags: number;
};

export function weddingVendorStyleMatchAvailable(
  coverage: WeddingVendorStyleCoverage,
  minimum = WEDDING_VENDOR_STYLE_MATCH_MINIMUM,
): boolean {
  return coverage.vendorsWithStyleTags >= minimum;
}

export function weddingVendorStyleMatchDisclosure(
  coverage: WeddingVendorStyleCoverage,
  minimum = WEDDING_VENDOR_STYLE_MATCH_MINIMUM,
): string | null {
  if (!weddingVendorStyleMatchAvailable(coverage, minimum)) return null;
  const label = coverage.category.trim() || "vendor";
  return `Style matching is available for ${label} because ${coverage.vendorsWithStyleTags} listings have style evidence.`;
}
