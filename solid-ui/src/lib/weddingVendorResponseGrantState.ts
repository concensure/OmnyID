import type { AfpMessage } from "@/lib/api";

export type WeddingVendorResponseGrant = {
  grantMessageId: string;
  grantId: string;
  vendorId: string;
  threadId: string;
  expiresAt: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function weddingVendorResponseGrant(
  messages: readonly AfpMessage[],
  vendorId: string | null | undefined,
  now = new Date(),
): WeddingVendorResponseGrant | null {
  const targetVendorId = vendorId?.trim() ?? "";
  if (!targetVendorId) return null;
  const revoked = new Set(messages.flatMap((message) => {
    if ((message.kind ?? message.subtype) !== "quotation_context_grant_revoked") return [];
    const revocation = record(record(message.content).revocation);
    return typeof revocation.grant_id === "string" ? [revocation.grant_id] : [];
  }));
  return messages.flatMap((message) => {
    if ((message.kind ?? message.subtype) !== "quotation_context_grant") return [];
    const grant = record(record(message.content).grant);
    const grantId = String(grant.grant_id ?? "");
    const expiresAt = String(grant.expires_at ?? "");
    const expiry = Date.parse(expiresAt);
    if (String(grant.target_vendor_id ?? "") !== targetVendorId
      || !grantId || revoked.has(grantId) || !Number.isFinite(expiry) || expiry <= now.getTime()) return [];
    return [{
      grantMessageId: message.id,
      grantId,
      vendorId: targetVendorId,
      threadId: String(grant.thread_id ?? message.thread_id),
      expiresAt,
    }];
  }).sort((left, right) => right.expiresAt.localeCompare(left.expiresAt))[0] ?? null;
}
