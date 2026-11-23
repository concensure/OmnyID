import { apiFetch } from "@/lib/api";

export type WeddingRsvpReminderProviderStatus = {
  enabled: boolean;
  ready: boolean;
  provider: string;
  reason: string;
};

export type WeddingRsvpReminderSendResult = {
  sent: boolean;
  replayed: boolean;
  deliveryStatus: "provider_accepted" | "delivered" | "failed";
  idempotencyKey: string;
  providerReceiptId: string | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function weddingRsvpReminderProviderStatus(): Promise<WeddingRsvpReminderProviderStatus> {
  const value = record(await apiFetch<unknown>("/wedding/rsvp/reminders/status"));
  return {
    enabled: value.enabled === true,
    ready: value.ready === true,
    provider: typeof value.provider === "string" ? value.provider : "disabled",
    reason: typeof value.reason === "string" ? value.reason : "unavailable",
  };
}

export async function sendApprovedWeddingRsvpReminder(input: {
  threadId: string;
  approvalMessageId: string;
}): Promise<WeddingRsvpReminderSendResult> {
  const value = record(await apiFetch<unknown>("/wedding/rsvp/reminders/send", {
    method: "POST",
    bodyJson: {
      thread_id: input.threadId,
      approval_message_id: input.approvalMessageId,
    },
  }));
  const deliveryStatus = typeof value.delivery_status === "string" ? value.delivery_status : "";
  const idempotencyKey = typeof value.idempotency_key === "string" ? value.idempotency_key : "";
  if (!idempotencyKey || !["provider_accepted", "delivered", "failed"].includes(deliveryStatus)) {
    throw new Error("The reminder provider did not return a durable lifecycle receipt.");
  }
  return {
    sent: value.sent === true,
    replayed: value.replayed === true,
    deliveryStatus: deliveryStatus as WeddingRsvpReminderSendResult["deliveryStatus"],
    idempotencyKey,
    providerReceiptId: typeof value.provider_receipt_id === "string" ? value.provider_receipt_id : null,
  };
}
