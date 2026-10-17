// @locs-version: 1.0
import type { WeddingVendor } from "@/lib/api";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";

type VendorCard = WeddingWorkspaceArtifactPreview["vendorComparisonCards"][number];

export function safeWeddingVendorImageUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim() ?? "";
  if (/^https:\/\/images\.unsplash\.com\//i.test(candidate)) return candidate;
  if (/^\/wedding\/vendor-photo\/google\?name=places%2f[^&]+(?:&max_width_px=\d{1,4})?$/i.test(candidate)) return candidate;
  if (/^\/api\/wedding\/vendor-photos\/google\//i.test(candidate)) return candidate;
  if (/^https:\/\/omnyid\.com\/wedding\/assets\/venue-photos\/[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp)$/i.test(candidate)) return candidate;
  return null;
}

function normalizedVendorName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function sameDirectoryVendor(cardName: string, vendorName: string): boolean {
  const card = normalizedVendorName(cardName);
  const vendor = normalizedVendorName(vendorName);
  if (!card || !vendor) return false;
  if (card === vendor || card.includes(vendor) || vendor.includes(card)) return true;
  const cardWords = cardName.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
  const vendorWords = vendorName.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
  return cardWords.length > 0 && cardWords.every((word) => vendorWords.some((candidate) => candidate.includes(word) || word.includes(candidate)));
}

/** Current approved directory media supersedes stale saved-card media. */
export function weddingVendorCardWithCurrentPhoto(card: VendorCard, directory: readonly WeddingVendor[] | null | undefined): VendorCard {
  const vendor = directory?.find((entry) => entry.vendorId === card.vendorId)
    ?? directory?.find((entry) => sameDirectoryVendor(card.title, entry.vendorName));
  const photoEntry = vendor?.photos.find((entry) => Boolean(safeWeddingVendorImageUrl(entry.photoUrl)));
  const photoUrl = safeWeddingVendorImageUrl(photoEntry?.photoUrl);
  return photoUrl ? { ...card, imageUrl: photoUrl, imageAlt: photoEntry?.altText ?? `${card.title} photo` } : card;
}
