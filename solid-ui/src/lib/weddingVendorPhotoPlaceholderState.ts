// @locs-version: 2.0

export type WeddingVendorPhotoPlaceholder = {
  initials: string;
  toneClass: string;
  label: string;
};

// Deterministic tint rotation from the wedding palette only (tailwind.config.cjs:34-44).
// Never add a hex value here — add another wedding-* token to tailwind.config.cjs first.
const WEDDING_PHOTO_PLACEHOLDER_TONES: readonly string[] = [
  "bg-wedding-surface-blush text-wedding-accent",
  "bg-wedding-surface-muted text-wedding-text",
  "bg-wedding-warm-note text-wedding-text",
  "bg-wedding-accent/10 text-wedding-accent",
];

function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (words.length === 0) return "?";
  return words.map((word) => word.charAt(0).toUpperCase()).join("");
}

export function weddingVendorPhotoPlaceholder(input: {
  vendorName: string;
  category?: string | null;
}): WeddingVendorPhotoPlaceholder {
  const vendorName = input.vendorName.trim();
  const category = input.category?.trim() || null;
  const toneClass = WEDDING_PHOTO_PLACEHOLDER_TONES[
    stableHash(vendorName || "vendor") % WEDDING_PHOTO_PLACEHOLDER_TONES.length
  ];
  return {
    initials: initialsFromName(vendorName),
    toneClass,
    label: category ?? "Vendor",
  };
}
