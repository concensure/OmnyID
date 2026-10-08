// @module-id: wedding.vendor-photo-licence-api
// @primary-capability: vendor-photo-licence-receipt
// @locs-version: 2.0
// @stability: draft
// @owner: omnyid
import { apiFetch } from "@/lib/api";

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
