// @locs-version: 2.0
import type { WeddingVendor, WeddingVendorWritePayload } from "@/lib/api";

export type AdminWeddingVendorDraft = {
  vendorId: string | null;
  vendorSlug: string;
  vendorName: string;
  category: string;
  serviceArea: string;
  address: string;
  websiteUrl: string;
  contactPhone: string;
  contactEmail: string;
  sourceUrl: string;
  sourceLabel: string;
  sourceCheckedAt: string;
  status: "active" | "hidden" | "archived";
  notes: string;
  caveatLabels: string;
  photo1Url: string;
  photo1Alt: string;
  photo2Url: string;
  photo2Alt: string;
  photo3Url: string;
  photo3Alt: string;
};

export type AdminWeddingVendorPayloadResult = {
  payload: WeddingVendorWritePayload | null;
  errors: string[];
};

export const emptyAdminWeddingVendorDraft = (): AdminWeddingVendorDraft => ({
  vendorId: null,
  vendorSlug: "",
  vendorName: "",
  category: "Venue",
  serviceArea: "Sydney, NSW",
  address: "",
  websiteUrl: "",
  contactPhone: "",
  contactEmail: "",
  sourceUrl: "",
  sourceLabel: "",
  sourceCheckedAt: "",
  status: "active",
  notes: "",
  caveatLabels: "User approval required before outreach",
  photo1Url: "",
  photo1Alt: "",
  photo2Url: "",
  photo2Alt: "",
  photo3Url: "",
  photo3Alt: "",
});

function clean(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function adminWeddingVendorSlugFromName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validateOptionalUrl(value: string, label: string, errors: string[]) {
  const trimmed = value.trim();
  if (trimmed && !validHttpUrl(trimmed)) {
    errors.push(`${label} must be a full http or https URL.`);
  }
}

function validDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function adminWeddingVendorDraftFromVendor(vendor: WeddingVendor): AdminWeddingVendorDraft {
  const photo = (slot: number) => vendor.photos.find((entry) => entry.slot === slot);
  return {
    vendorId: vendor.vendorId,
    vendorSlug: vendor.vendorSlug,
    vendorName: vendor.vendorName,
    category: vendor.category,
    serviceArea: vendor.serviceArea,
    address: vendor.address ?? "",
    websiteUrl: vendor.websiteUrl ?? "",
    contactPhone: vendor.contactPhone ?? "",
    contactEmail: vendor.contactEmail ?? "",
    sourceUrl: vendor.sourceUrl ?? "",
    sourceLabel: vendor.sourceLabel ?? "",
    sourceCheckedAt: vendor.sourceCheckedAt ?? "",
    status: vendor.status === "hidden" || vendor.status === "archived" ? vendor.status : "active",
    notes: vendor.notes ?? "",
    caveatLabels: vendor.caveatLabels.join("\n"),
    photo1Url: photo(1)?.photoUrl ?? "",
    photo1Alt: photo(1)?.altText ?? "",
    photo2Url: photo(2)?.photoUrl ?? "",
    photo2Alt: photo(2)?.altText ?? "",
    photo3Url: photo(3)?.photoUrl ?? "",
    photo3Alt: photo(3)?.altText ?? "",
  };
}

export function buildAdminWeddingVendorPayload(draft: AdminWeddingVendorDraft): AdminWeddingVendorPayloadResult {
  const errors: string[] = [];
  const vendorName = draft.vendorName.trim();
  const category = draft.category.trim();
  const serviceArea = draft.serviceArea.trim();
  const vendorSlug = draft.vendorSlug.trim() || adminWeddingVendorSlugFromName(vendorName);
  if (!vendorName) errors.push("Vendor name is required.");
  if (!vendorSlug) errors.push("Vendor slug is required.");
  if (vendorSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(vendorSlug)) {
    errors.push("Vendor slug must use lowercase letters, numbers, and single hyphens.");
  }
  if (!category) errors.push("Category is required.");
  if (!serviceArea) errors.push("Service area is required.");
  validateOptionalUrl(draft.websiteUrl, "Website URL", errors);
  validateOptionalUrl(draft.sourceUrl, "Source URL", errors);
  if (draft.sourceCheckedAt.trim() && !validDateOnly(draft.sourceCheckedAt.trim())) {
    errors.push("Source checked date must be YYYY-MM-DD.");
  }

  const photoPairs = [
    { slot: 1, url: draft.photo1Url, alt: draft.photo1Alt },
    { slot: 2, url: draft.photo2Url, alt: draft.photo2Alt },
    { slot: 3, url: draft.photo3Url, alt: draft.photo3Alt },
  ];
  for (const photo of photoPairs) {
    validateOptionalUrl(photo.url, `Photo ${photo.slot} URL`, errors);
  }
  if (errors.length > 0) return { payload: null, errors };

  return {
    payload: {
      vendor_slug: vendorSlug,
      vendor_name: vendorName,
      category,
      service_area: serviceArea,
      address: clean(draft.address),
      website_url: clean(draft.websiteUrl),
      contact_phone: clean(draft.contactPhone),
      contact_email: clean(draft.contactEmail),
      source_url: clean(draft.sourceUrl),
      source_label: clean(draft.sourceLabel),
      source_checked_at: clean(draft.sourceCheckedAt),
      status: draft.status,
      notes: clean(draft.notes),
      evidence: {
        address: clean(draft.address),
        price_basis: "not verified; request quote",
        availability_basis: "not verified; request date-specific availability",
      },
      caveat_labels: draft.caveatLabels
        .split(/\r?\n|,/)
        .map((label) => label.trim())
        .filter(Boolean),
      photos: photoPairs
        .filter((photo) => clean(photo.url))
        .map((photo) => ({
          slot: photo.slot,
          photo_url: photo.url.trim(),
          alt_text: clean(photo.alt),
          source_label: clean(draft.sourceLabel),
          source_url: clean(draft.sourceUrl),
          retrieved_at: clean(draft.sourceCheckedAt),
          licence_metadata: {},
        })),
    },
    errors: [],
  };
}
