import type { WeddingVendor } from "@/lib/api";

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function tokenScore(query: string, candidate: string): number {
  if (!query) return 1;
  if (candidate === query) return 1;
  if (candidate.startsWith(query)) return 0.94;
  if (candidate.includes(query)) return 0.88;
  const queryTokens = query.split(" ").filter(Boolean);
  const candidateTokens = candidate.split(" ").filter(Boolean);
  if (!queryTokens.length || !candidateTokens.length) return 0;
  const scores = queryTokens.map((queryToken) => {
    const exact = candidateTokens.some((candidateToken) => candidateToken === queryToken);
    if (exact) return 1;
    const prefix = candidateTokens.some((candidateToken) => candidateToken.startsWith(queryToken) || queryToken.startsWith(candidateToken));
    if (prefix) return 0.9;
    return Math.max(...candidateTokens.map((candidateToken) => {
      const longest = Math.max(queryToken.length, candidateToken.length);
      if (!longest) return 0;
      return 1 - editDistance(queryToken, candidateToken) / longest;
    }), 0);
  });
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export function adminWeddingVendorCategories(vendors: WeddingVendor[]): string[] {
  return [...new Set(vendors.map((vendor) => vendor.category.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

export function filterAdminWeddingVendors(
  vendors: WeddingVendor[],
  query: string,
  category: string,
): WeddingVendor[] {
  const normalizedQuery = normalized(query);
  const normalizedCategory = normalized(category);
  return vendors
    .filter((vendor) => !normalizedCategory || normalized(vendor.category) === normalizedCategory)
    .map((vendor) => {
      const nameScore = tokenScore(normalizedQuery, normalized(vendor.vendorName));
      const supportingScore = Math.max(
        tokenScore(normalizedQuery, normalized(vendor.vendorSlug)),
        tokenScore(normalizedQuery, normalized(vendor.category)),
        tokenScore(normalizedQuery, normalized(vendor.serviceArea)),
      );
      return { vendor, score: normalizedQuery ? Math.max(nameScore, supportingScore * 0.82) : 1 };
    })
    .filter((entry) => entry.score >= 0.62)
    .sort((left, right) => right.score - left.score || left.vendor.vendorName.localeCompare(right.vendor.vendorName))
    .map((entry) => entry.vendor);
}

export function adminWeddingVendorClaimLabel(claimStatus: string): string {
  switch (claimStatus.trim().toLowerCase()) {
    case "verified": return "Claimed and verified";
    case "claimed": return "Claimed — verification pending";
    case "claim_pending": return "Claim started";
    case "disputed": return "Claim disputed";
    default: return "Unclaimed listing";
  }
}
