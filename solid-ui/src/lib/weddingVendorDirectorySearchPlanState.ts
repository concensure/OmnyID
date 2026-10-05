// @locs-version: 1.0
import type { WeddingVendorSearchProviderPlan } from "@/lib/weddingVendorSearchProviderPlanState";

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "wedding_vendor";
}

/** Supplies a harmless request shape for a directory-only pass when paid providers are disabled. */
export function weddingVendorDirectorySearchPlans(input: {
  providerPlans: readonly WeddingVendorSearchProviderPlan[];
  category: string;
  location: string;
}): WeddingVendorSearchProviderPlan[] {
  if (input.providerPlans.length > 0) return [...input.providerPlans];
  const category = input.category.trim() || "wedding vendor";
  return [{
    providerKind: "brave_search", label: "Wedding directory", priority: 1,
    guardrails: ["Directory-only policy prohibits external provider execution."],
    queries: [{ providerKind: "brave_search", category: slug(category), query: `${category} ${input.location.trim()}`.trim(), googlePlaceTypes: [], overpassTags: [], expectedFields: ["name", "website", "phone", "source"], guardrails: ["Directory-only policy prohibits external provider execution."] }],
  }];
}
