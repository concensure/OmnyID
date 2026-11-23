// @locs-version: 1.0
import { apiFetch } from "@/lib/api";

export type WeddingRsvpTestDeliveryStatus = { enabled: boolean; ready: boolean; provider: string; reason: string };
export function weddingRsvpTestDeliveryProviderStatus() { return apiFetch<WeddingRsvpTestDeliveryStatus>("/wedding/rsvp/tests/status"); }
export function sendApprovedWeddingRsvpTest(input: { threadId: string; approvalMessageId: string }) {
  return apiFetch<{ sent: boolean; replayed: boolean; delivery_status: string; provider_receipt_id?: string | null }>("/wedding/rsvp/tests/send", { method: "POST", bodyJson: { thread_id: input.threadId, approval_message_id: input.approvalMessageId } });
}
