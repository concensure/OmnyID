// @locs-version: 1.0
import type { WeddingApprovalRequestState } from "@/lib/weddingApprovalState";
import type {
  WeddingApprovalExecutionHandlers,
  WeddingApprovalExecutorResult,
} from "@/lib/weddingApprovalExecutionState";

export type WeddingGmailDraftSendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
};

export type WeddingGmailDraftSendResult = {
  ok: boolean;
  messageId?: string | null;
  clientMessageId?: string | null;
  message?: string | null;
};

export type WeddingGmailDraftSender = (
  input: WeddingGmailDraftSendInput,
) => Promise<WeddingGmailDraftSendResult> | WeddingGmailDraftSendResult;

export function weddingGmailDraftSendResultFromApiResponse(input: {
  ok?: boolean | null;
  messageId?: string | null;
  clientMessageId?: string | null;
  message?: string | null;
}): WeddingGmailDraftSendResult {
  return {
    ok: input.ok === true,
    messageId: input.messageId ?? null,
    clientMessageId: input.clientMessageId ?? null,
    message: clean(input.message) || (input.ok === true
      ? "Gmail sent the approved wedding email."
      : "Gmail did not send this email."),
  };
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueCleanStrings(values: readonly unknown[] | null | undefined, limit = 20): string[] {
  if (!Array.isArray(values)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlFromText(text: string): string {
  return clean(text)
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function emailDeliveryFromRequest(request: WeddingApprovalRequestState): WeddingGmailDraftSendInput | null {
  const delivery = request.delivery;
  if (!delivery || delivery.channel !== "email") return null;
  const to = clean(delivery.to[0]);
  const subject = clean(delivery.subject);
  const text = clean(delivery.text);
  if (!to || !subject || !text) return null;
  return {
    to,
    subject,
    text,
    html: clean(delivery.html) || htmlFromText(text),
    threadId: clean(delivery.threadId) || undefined,
    inReplyTo: clean(delivery.inReplyTo) || undefined,
    references: uniqueCleanStrings(delivery.references),
  };
}

function deliveryFailureMetadata(input: {
  delivery?: WeddingGmailDraftSendInput | null;
  missingFields?: readonly string[];
  messageId?: string | null;
}): Record<string, unknown> {
  const delivery = input.delivery;
  return {
    provider: "gmail",
    provider_capability: "email",
    provider_executor_status: "available",
    provider_executor_connected: true,
    provider_executor_mode: "live",
    provider_result_ok: false,
    external_delivery_performed: false,
    missing_delivery_payload: (input.missingFields?.length ?? 0) > 0,
    delivery_missing_fields: input.missingFields ?? [],
    missing_durable_provider_receipt: !clean(input.messageId),
    delivery_channel: "email",
    delivery_recipients: delivery ? [delivery.to] : [],
    delivery_subject: delivery?.subject,
    delivery_thread_id: delivery?.threadId,
    recipient: delivery?.to,
    subject: delivery?.subject,
    thread_id: delivery?.threadId,
    in_reply_to: delivery?.inReplyTo,
    references: delivery?.references ?? [],
  };
}

function missingDeliveryFields(request: WeddingApprovalRequestState): string[] {
  const delivery = request.delivery;
  if (!delivery || delivery.channel !== "email") return ["delivery"];
  const missing = [
    clean(delivery.to[0]) ? null : "recipient",
    clean(delivery.subject) ? null : "subject",
    clean(delivery.text) ? null : "body",
  ].filter((value): value is string => Boolean(value));
  return missing;
}

export function weddingGmailApprovalExecutor(
  sendDraft: WeddingGmailDraftSender,
) {
  return async (request: WeddingApprovalRequestState): Promise<WeddingApprovalExecutorResult> => {
    const delivery = emailDeliveryFromRequest(request);
    if (!delivery) {
      const missingFields = missingDeliveryFields(request);
      return {
        ok: false,
        message: "This approved email is missing a recipient, subject, or body.",
        metadata: deliveryFailureMetadata({ missingFields }),
      };
    }
    const result = await sendDraft(delivery);
    const messageId = clean(result.messageId);
    const clientMessageId = clean(result.clientMessageId);
    if (!result.ok || !messageId) {
      const metadata = deliveryFailureMetadata({ delivery, messageId });
      return {
        ok: false,
        message: clean(result.message) || "Gmail did not confirm that this message was sent.",
        metadata: {
          ...metadata,
          provider_result_ok: result.ok,
        },
      };
    }
    return {
      ok: true,
      externalId: messageId,
      message: "Sent with Gmail after explicit wedding approval.",
      metadata: {
        provider: "gmail",
        provider_capability: "email",
        provider_executor_status: "available",
        provider_executor_connected: true,
        provider_executor_mode: "live",
        provider_result_ok: true,
        external_delivery_performed: true,
        provider_message_id: messageId,
        external_id: messageId,
        client_message_id: clientMessageId,
        delivery_channel: "email",
        delivery_recipients: [delivery.to],
        delivery_subject: delivery.subject,
        delivery_thread_id: delivery.threadId,
        recipient: delivery.to,
        subject: delivery.subject,
        thread_id: delivery.threadId,
        in_reply_to: delivery.inReplyTo,
        references: delivery.references ?? [],
      },
    };
  };
}

export function buildWeddingGmailApprovalExecutionHandlers(
  sendDraft: WeddingGmailDraftSender,
): WeddingApprovalExecutionHandlers {
  return {
    send_email: weddingGmailApprovalExecutor(sendDraft),
  };
}
