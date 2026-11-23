// @module-id: wedding.vendor-photo-licence-api
// @primary-capability: vendor-photo-licence-receipt
// @locs-version: 2.0
// @stability: draft
// @owner: omnyid
import { API_BASE, apiFetch, sessionBearerToken } from "@/lib/api";

export interface VendorPhotoLicenceDocument {
  agreement_version: string;
  agreement_sha256: string;
  agreement_url: string;
  consent_label: string;
}

export interface VendorPhotoLicenceReceipt {
  photo_licence_id: string;
  accepted_at: string;
  agreement_version: string;
}

export async function fetchVendorPhotoLicenceDocument(): Promise<VendorPhotoLicenceDocument> {
  return apiFetch<VendorPhotoLicenceDocument>("/api/wedding/vendor/photo-licence");
}

export async function acceptVendorPhotoLicence(input: {
  vendorSlug: string;
  agreementVersion: string;
}): Promise<VendorPhotoLicenceReceipt> {
  return apiFetch<VendorPhotoLicenceReceipt>("/api/wedding/vendor/photo-licence", {
    method: "POST",
    bodyJson: {
      vendor_slug: input.vendorSlug,
      agreement_version: input.agreementVersion,
      accepted: true,
    },
  });
}

export async function uploadLicensedVendorPhoto(input: {
  vendorSlug: string;
  photoLicenceId: string;
  file: File;
  altText?: string;
  isCover?: boolean;
}): Promise<{ asset_id: string; photo_licence_id: string; url: string }> {
  const body = new FormData();
  body.append("vendor_slug", input.vendorSlug);
  body.append("photo_licence_id", input.photoLicenceId);
  body.append("file", input.file, input.file.name);
  if (input.altText?.trim()) body.append("alt_text", input.altText.trim());
  body.append("is_cover", input.isCover ? "true" : "false");
  const headers = new Headers();
  const token = sessionBearerToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE}/api/wedding/vendor/photos`, {
    method: "POST",
    credentials: "include",
    headers,
    body,
  });
  const responseText = await response.text();
  let payload: Record<string, unknown> | null = null;
  try {
    payload = responseText ? JSON.parse(responseText) as Record<string, unknown> : null;
  } catch {
    payload = null;
  }
  if (!response.ok || !payload || typeof payload.asset_id !== "string" || typeof payload.url !== "string" || typeof payload.photo_licence_id !== "string") {
    throw new Error(
      (typeof payload?.error === "string" && payload.error)
      || (responseText.trim() && responseText.length <= 240 ? responseText.trim() : "")
      || "Photo upload could not be completed.",
    );
  }
  return { asset_id: payload.asset_id, photo_licence_id: payload.photo_licence_id, url: payload.url };
}

export interface VendorManagedPhoto {
  asset_id: string;
  alt_text: string | null;
  is_cover: boolean;
  status: "live" | "hidden";
  url: string;
  purge_after: string | null;
}

export async function listVendorManagedPhotos(vendorSlug: string): Promise<VendorManagedPhoto[]> {
  const response = await apiFetch<{ photos?: VendorManagedPhoto[] }>(
    `/api/wedding/vendor/photos?vendor_slug=${encodeURIComponent(vendorSlug)}`,
  );
  return Array.isArray(response.photos) ? response.photos : [];
}

export async function scheduleVendorPhotoRemoval(vendorSlug: string, assetId: string): Promise<void> {
  await apiFetch(`/api/wedding/vendor/photos/${encodeURIComponent(assetId)}?vendor_slug=${encodeURIComponent(vendorSlug)}`, {
    method: "DELETE",
  });
}
