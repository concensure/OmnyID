// @locs-version: 2.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingProjectionDispatchReceiptState } from "@/lib/weddingProjectionDispatchState";

export type WeddingVendorContactProjectionMethod =
  | "master_agent"
  | "agent_email_draft"
  | "personal_email"
  | "phone"
  | "website_form"
  | "other";

export type WeddingVendorContactProjectionRequest = {
  vendorId: string;
  body: {
    contact_method: WeddingVendorContactProjectionMethod;
    follow_up_due_at?: string | null;
    response_received_at?: string | null;
    thread_id?: string | null;
    receipt_ref?: string | null;
    notes?: string | null;
  };
};

export type WeddingVendorReplyProjectionInput = {
  vendorId?: string | null;
  vendorLabel?: string | null;
  threadId?: string | null;
  receiptRef?: string | null;
  responseReceivedAt?: string | null;
  messageSubject?: string | null;
  messageSnippet?: string | null;
  sourceLabel?: string | null;
};

export type WeddingVendorReplyKnownContact = {
  vendorId?: string | null;
  vendorName?: string | null;
  threadId?: string | null;
  receiptRef?: string | null;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function validMethod(value: unknown): WeddingVendorContactProjectionMethod {
  const method = clean(value);
  if (
    method === "master_agent"
    || method === "agent_email_draft"
    || method === "personal_email"
    || method === "phone"
    || method === "website_form"
    || method === "other"
  ) {
    return method;
  }
  return "agent_email_draft";
}

function plusDays(nowIso: string, days: number): string | null {
  const now = new Date(nowIso);
  if (!Number.isFinite(now.getTime())) return null;
  now.setUTCDate(now.getUTCDate() + days);
  return now.toISOString();
}

function nextFollowUpDueAt(stage: string | null, nowIso: string): string | null {
  if (stage === "initial_outreach") return plusDays(nowIso, 5);
  if (stage === "follow_up_due") return plusDays(nowIso, 2);
  return null;
}

function savedTaskItems(receipt: WeddingProjectionDispatchReceiptState): Map<string, string | null> {
  const saved = new Map<string, string | null>();
  for (const item of receipt.savedItems) {
    if (item.kind === "task") saved.set(item.sourceId, clean(item.messageId));
  }
  return saved;
}

function matchingVendorId(
  reply: WeddingVendorReplyProjectionInput,
  knownContacts: readonly WeddingVendorReplyKnownContact[],
): string | null {
  const direct = clean(reply.vendorId);
  if (direct) return direct;
  const threadId = clean(reply.threadId);
  const receiptRef = clean(reply.receiptRef);
  const vendorLabel = clean(reply.vendorLabel)?.toLowerCase() ?? null;
  const match = knownContacts.find((contact) => {
    const contactThread = clean(contact.threadId);
    const contactReceipt = clean(contact.receiptRef);
    const contactName = clean(contact.vendorName)?.toLowerCase() ?? null;
    return Boolean(
      (threadId && contactThread && threadId === contactThread)
      || (receiptRef && contactReceipt && receiptRef === contactReceipt)
      || (vendorLabel && contactName && vendorLabel === contactName),
    );
  });
  return clean(match?.vendorId);
}

function replyNotes(input: WeddingVendorReplyProjectionInput): string | null {
  const parts = [
    clean(input.sourceLabel),
    clean(input.messageSubject) ? `Subject: ${clean(input.messageSubject)}` : null,
    clean(input.messageSnippet),
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" | ").slice(0, 500) : null;
}

function knownContactMatchesMessage(
  message: AfpMessage,
  knownContacts: readonly WeddingVendorReplyKnownContact[],
): WeddingVendorReplyKnownContact | null {
  const metadata = record(message.metadata);
  const content = record(message.content);
  const threadCandidates = [
    message.thread_id,
    clean(metadata.thread_id),
    clean(metadata.gmail_thread_id),
    clean(metadata.email_thread_id),
    clean(content.thread_id),
    clean(content.gmail_thread_id),
  ].filter((item): item is string => Boolean(item));
  const receiptCandidates = [
    message.id,
    clean(metadata.receipt_ref),
    clean(metadata.message_id),
    clean(metadata.gmail_message_id),
    clean(content.message_id),
    clean(content.gmail_message_id),
  ].filter((item): item is string => Boolean(item));
  return knownContacts.find((contact) => {
    const threadId = clean(contact.threadId);
    const receiptRef = clean(contact.receiptRef);
    return Boolean(
      (threadId && threadCandidates.includes(threadId))
      || (receiptRef && receiptCandidates.includes(receiptRef)),
    );
  }) ?? null;
}

function messageLooksLikeVendorReply(message: AfpMessage, knownMatch: WeddingVendorReplyKnownContact | null): boolean {
  if (knownMatch) return true;
  const metadata = record(message.metadata);
  const content = record(message.content);
  const tags = strings(message.supertags);
  const text = [
    message.type,
    message.kind,
    message.subtype,
    ...tags,
    clean(metadata.origin),
    clean(metadata.provider),
    clean(metadata.source),
    clean(metadata.vendor_id),
    clean(metadata.vendor_label),
    clean(content.kind),
    clean(content.subject),
    clean(content.snippet),
  ].filter(Boolean).join(" ").toLowerCase();
  return /\b(vendor|wedding_vendor|vendor_reply|vendor response|supplier|quote reply|gmail|email)\b/.test(text)
    && /\b(reply|response|re:|inbound|received|availability|quote|package)\b/.test(text);
}

function replyInputFromMessage(
  message: AfpMessage,
  knownContacts: readonly WeddingVendorReplyKnownContact[],
): WeddingVendorReplyProjectionInput | null {
  const metadata = record(message.metadata);
  const content = record(message.content);
  const knownMatch = knownContactMatchesMessage(message, knownContacts);
  if (!messageLooksLikeVendorReply(message, knownMatch)) return null;
  return {
    vendorId: clean(metadata.vendor_id) ?? clean(content.vendor_id) ?? clean(knownMatch?.vendorId),
    vendorLabel: clean(metadata.vendor_label) ?? clean(content.vendor_label) ?? clean(knownMatch?.vendorName),
    threadId: clean(metadata.vendor_contact_thread_id)
      ?? clean(metadata.thread_id)
      ?? clean(metadata.gmail_thread_id)
      ?? clean(content.thread_id)
      ?? clean(content.gmail_thread_id)
      ?? clean(knownMatch?.threadId)
      ?? message.thread_id,
    receiptRef: clean(metadata.vendor_contact_receipt_ref)
      ?? clean(metadata.receipt_ref)
      ?? clean(metadata.gmail_message_id)
      ?? clean(content.message_id)
      ?? clean(content.gmail_message_id)
      ?? clean(knownMatch?.receiptRef)
      ?? message.id,
    responseReceivedAt: clean(metadata.response_received_at)
      ?? clean(metadata.received_at)
      ?? clean(content.received_at)
      ?? message.timestamp,
    messageSubject: clean(metadata.subject) ?? clean(content.subject) ?? clean(content.title),
    messageSnippet: clean(metadata.snippet) ?? clean(content.snippet) ?? clean(content.body_preview) ?? clean(content.markdown),
    sourceLabel: clean(metadata.provider) ?? clean(metadata.origin) ?? "AFP vendor reply",
  };
}

export function weddingVendorContactProjectionRequests(input: {
  receipt: WeddingProjectionDispatchReceiptState;
  sendInputs?: readonly SendAfpMessageInput[] | null;
  nowIso?: string | null;
}): WeddingVendorContactProjectionRequest[] {
  const saved = savedTaskItems(input.receipt);
  const nowIso = clean(input.nowIso) ?? new Date().toISOString();
  const requests: WeddingVendorContactProjectionRequest[] = [];
  const seen = new Set<string>();

  for (const sendInput of input.sendInputs ?? []) {
    if (sendInput.type !== "task") continue;
    const metadata = record(sendInput.metadata);
    const taskId = clean(metadata.wedding_task_item_id);
    const savedMessageId = taskId ? saved.get(taskId) : null;
    if (!taskId || !saved.has(taskId)) continue;
    const vendorId = clean(metadata.vendor_id);
    const stage = clean(metadata.outreach_escalation_stage);
    if (!vendorId || (stage !== "initial_outreach" && stage !== "follow_up_due")) continue;
    const key = `${vendorId}:${taskId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    requests.push({
      vendorId,
      body: {
        contact_method: validMethod(metadata.vendor_contact_method),
        follow_up_due_at: nextFollowUpDueAt(stage, nowIso),
        thread_id: clean(metadata.vendor_contact_thread_id) ?? clean(sendInput.thread_id),
        receipt_ref: clean(metadata.vendor_contact_receipt_ref) ?? savedMessageId,
        notes: clean(record(sendInput.content).title) ?? clean(metadata.outreach_vendor_label),
      },
    });
  }

  return requests;
}

export function weddingVendorReplyInputsFromAfpMessages(input: {
  messages?: readonly AfpMessage[] | null;
  knownContacts?: readonly WeddingVendorReplyKnownContact[] | null;
}): WeddingVendorReplyProjectionInput[] {
  const knownContacts = input.knownContacts ?? [];
  const seen = new Set<string>();
  const replies: WeddingVendorReplyProjectionInput[] = [];
  for (const message of input.messages ?? []) {
    const reply = replyInputFromMessage(message, knownContacts);
    if (!reply) continue;
    const key = [
      clean(reply.vendorId) ?? clean(reply.vendorLabel) ?? "",
      clean(reply.threadId) ?? "",
      clean(reply.receiptRef) ?? "",
      clean(reply.responseReceivedAt) ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    replies.push(reply);
  }
  return replies;
}

export function weddingVendorReplyProjectionRequests(input: {
  replies?: readonly WeddingVendorReplyProjectionInput[] | null;
  knownContacts?: readonly WeddingVendorReplyKnownContact[] | null;
  nowIso?: string | null;
}): WeddingVendorContactProjectionRequest[] {
  const nowIso = clean(input.nowIso) ?? new Date().toISOString();
  const knownContacts = input.knownContacts ?? [];
  const requests: WeddingVendorContactProjectionRequest[] = [];
  const seen = new Set<string>();
  for (const reply of input.replies ?? []) {
    const vendorId = matchingVendorId(reply, knownContacts);
    if (!vendorId) continue;
    const responseReceivedAt = clean(reply.responseReceivedAt) ?? nowIso;
    const key = `${vendorId}:${clean(reply.threadId) ?? ""}:${clean(reply.receiptRef) ?? ""}:${responseReceivedAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    requests.push({
      vendorId,
      body: {
        contact_method: "other",
        response_received_at: responseReceivedAt,
        follow_up_due_at: null,
        thread_id: clean(reply.threadId),
        receipt_ref: clean(reply.receiptRef),
        notes: replyNotes(reply) ?? "Vendor reply recorded; continue from the response instead of sending another follow-up.",
      },
    });
  }
  return requests;
}
