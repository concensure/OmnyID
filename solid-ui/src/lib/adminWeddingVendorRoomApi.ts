// @locs-version: 2.0
import { apiFetch, normalizeAdminWeddingVendorMutationResponse } from "@/lib/api";

const roomsPath = (vendorId: string) => `/admin/wedding/vendors/${encodeURIComponent(vendorId)}/rooms`;

export const upsertAdminWeddingVendorRoom = (vendorId: string, payload: Record<string, unknown>) =>
  apiFetch<unknown>(roomsPath(vendorId), { method: "PUT", bodyJson: payload })
    .then(normalizeAdminWeddingVendorMutationResponse);

export const deleteAdminWeddingVendorRoom = (vendorId: string, roomId: string) =>
  apiFetch<unknown>(`${roomsPath(vendorId)}/${encodeURIComponent(roomId)}`, { method: "DELETE" })
    .then(normalizeAdminWeddingVendorMutationResponse);

/** Sends the raw image bytes; the server re-encodes to WebP, so only JPEG, PNG and WebP are accepted. */
export const uploadAdminWeddingVendorRoomPhoto = (
  vendorId: string,
  roomId: string,
  slot: number,
  file: File,
  altText?: string,
) => {
  const query = altText?.trim() ? `?alt_text=${encodeURIComponent(altText.trim())}` : "";
  return apiFetch<unknown>(
    `${roomsPath(vendorId)}/${encodeURIComponent(roomId)}/photos/${slot}${query}`,
    { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } },
  ).then(normalizeAdminWeddingVendorMutationResponse);
};
