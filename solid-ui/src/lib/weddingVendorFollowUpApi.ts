import { apiFetch, normalizeWeddingVendorContactResponse } from "@/lib/api";
export { weddingVendorReminderToAfpSendInput } from "@/lib/weddingVendorLifecycleState";

export const rescheduleWeddingVendorFollowUp = (vendorId: string, followUpDueAt: string) =>
  apiFetch<unknown>(`/wedding/vendors/${encodeURIComponent(vendorId)}/follow-up`, {
    method: "PATCH",
    bodyJson: { follow_up_due_at: followUpDueAt },
  }).then(normalizeWeddingVendorContactResponse);
