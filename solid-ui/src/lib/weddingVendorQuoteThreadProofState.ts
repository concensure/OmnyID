// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import type { WeddingApprovalReceiptState } from "@/lib/weddingApprovalState";
import {
  weddingApprovalReceiptDeliveryThreadId,
  weddingApprovalReceiptToVendorThreadAfpSendInput,
} from "@/lib/weddingApprovalReceiptAfpProjectionState";
import {
  cleanWeddingProductionLabel,
  cleanWeddingProductionLabels,
} from "@/lib/weddingProductionLabelState";

const MAX_DELIVERY_MISSING_FIELDS = 4;
const MAX_DELIVERY_MISSING_FIELD_LABEL_LENGTH = 40;
const MAX_DELIVERY_REFERENCE_LABELS = 6;
const MAX_DELIVERY_REFERENCE_LABEL_LENGTH = 120;

export type WeddingVendorQuoteThreadProofMessageState = {
  id: string;
  title: string;
  body: string;
  timestampLabel: string;
  typeLabel: string;
  proofKind: "quote" | "draft" | "receipt";
  providerLabel: string | null;
  receiptId: string | null;
  receiptIdLabel: string | null;
  clientMessageId: string | null;
  sentToLabel: string | null;
  subjectLabel: string | null;
  inReplyToLabel: string | null;
  deliveryReferencesLabel: string | null;
  deliveryReady: boolean | null;
  deliveryMissingFields: string[];
  isSentProof: boolean;
};

export type WeddingVendorQuoteThreadProofDrawerState = {
  title: string;
  summary: string;
  statusLabel: string;
  statusTone: "success" | "warning" | "neutral";
  sentProofCount: number;
  draftCount: number;
  quoteCount: number;
  latestSentReceiptLabel: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function titleFor(message: AfpMessage): string {
  const content = message.content ?? {};
  const title = clean(content.title);
  const subject = clean(content.subject);
  const kind = clean(message.kind ?? message.subtype ?? message.type).replace(/_/g, " ");
  return title || subject || kind || "Saved AFP message";
}

function bodyFor(message: AfpMessage): string {
  const content = message.content ?? {};
  const candidates = [
    content.summary,
    content.body,
    content.markdown,
    content.text,
    content.message,
    content.preview,
  ];
  for (const candidate of candidates) {
    const text = clean(candidate);
    if (text) return text;
  }
  const html = clean(content.html);
  if (html) {
    const text = stripHtml(html);
    if (text) return text.length > 320 ? `${text.slice(0, 320)}...` : text;
  }
  try {
    const serialized = JSON.stringify(content);
    return serialized.length > 320 ? `${serialized.slice(0, 320)}...` : serialized;
  } catch {
    return "Saved AFP message.";
  }
}

function timestampLabel(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function typeLabelFor(message: AfpMessage): string {
  return message.kind ? `${message.type} | ${message.kind}` : message.type;
}

function firstString(values: readonly unknown[]): string | null {
  for (const value of values) {
    const item = clean(value);
    if (item) return item;
  }
  return null;
}

function receiptDedupeKey(value: string | null | undefined): string | null {
  const id = clean(value);
  return id ? id.toLowerCase() : null;
}

function uniqueSentProofs(
  messages: readonly WeddingVendorQuoteThreadProofMessageState[],
): WeddingVendorQuoteThreadProofMessageState[] {
  const result: WeddingVendorQuoteThreadProofMessageState[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (!message.isSentProof) continue;
    const receiptKey = receiptDedupeKey(message.receiptId);
    if (receiptKey && seen.has(receiptKey)) {
      const existingIndex = result.findIndex((item) => receiptDedupeKey(item.receiptId) === receiptKey);
      if (existingIndex >= 0) result[existingIndex] = message;
      continue;
    }
    result.push(message);
    if (receiptKey) seen.add(receiptKey);
  }
  return result;
}

function stringArrayLabel(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const items = cleanWeddingProductionLabels(value.filter((item): item is string => typeof item === "string"));
  return items.length ? items.join(", ") : null;
}

function boundedStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return cleanWeddingProductionLabels(
    value.filter((item): item is string => typeof item === "string"),
    { maxLength: MAX_DELIVERY_MISSING_FIELD_LABEL_LENGTH, wordAware: true },
  ).slice(0, MAX_DELIVERY_MISSING_FIELDS);
}

function boundedReferenceArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return cleanWeddingProductionLabels(
    value.filter((item): item is string => typeof item === "string"),
    { maxLength: MAX_DELIVERY_REFERENCE_LABEL_LENGTH, wordAware: true },
  ).slice(0, MAX_DELIVERY_REFERENCE_LABELS);
}

function stringListLabel(values: readonly unknown[]): string | null {
  for (const value of values) {
    const item = clean(value);
    if (item) return item;
    const label = stringArrayLabel(value);
    if (label) return label;
  }
  return null;
}

function approvalRequestIdForMessage(message: AfpMessage): string {
  const fromFields = clean(message.content?.approval_request_id)
    || clean(message.metadata?.approval_request_id);
  if (fromFields) return fromFields;
  for (const reference of message.references ?? []) {
    if (reference.type === "approval_request") {
      const target = clean(reference.target);
      if (target) return target;
    }
  }
  return "";
}

function durableReceiptIdFor(receipt: WeddingApprovalReceiptState): string | null {
  return firstString([
    receipt.metadata.external_id,
    receipt.metadata.provider_receipt_id,
    receipt.metadata.provider_message_id,
    receipt.metadata.message_id,
  ]);
}

function durableReceiptIdForMessage(content: Record<string, unknown>, metadata: Record<string, unknown>): {
  id: string | null;
  label: string | null;
} {
  const candidates: Array<{ value: unknown; label: string }> = [
    { value: content.external_id, label: "External receipt" },
    { value: metadata.external_id, label: "External receipt" },
    { value: content.provider_receipt_id, label: "Provider receipt" },
    { value: metadata.provider_receipt_id, label: "Provider receipt" },
    { value: content.provider_message_id, label: "Provider message" },
    { value: metadata.provider_message_id, label: "Provider message" },
    { value: content.message_id, label: "Message ID" },
    { value: metadata.message_id, label: "Message ID" },
  ];
  for (const candidate of candidates) {
    const id = clean(candidate.value);
    if (id) return { id, label: candidate.label };
  }
  return { id: null, label: null };
}

function booleanValue(...values: readonly unknown[]): boolean | null {
  for (const value of values) {
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
  }
  return null;
}

function hasDurableSentProofForMessage(content: Record<string, unknown>, metadata: Record<string, unknown>): boolean {
  if (!durableReceiptIdForMessage(content, metadata).id) return false;
  if (booleanValue(content.external_delivery_performed, metadata.external_delivery_performed) !== true) return false;
  if (booleanValue(content.missing_durable_provider_receipt, metadata.missing_durable_provider_receipt) === true) return false;
  if (booleanValue(content.provider_result_ok, metadata.provider_result_ok) === false) return false;
  return true;
}

function messageTokens(message: AfpMessage): string {
  const content = message.content ?? {};
  const metadata = message.metadata ?? {};
  return [
    message.type,
    message.kind,
    message.subtype,
    ...((message.supertags ?? []).filter((tag): tag is string => typeof tag === "string")),
    content.kind,
    content.ledger_kind,
    metadata.projection,
  ].map(clean).join(" ").toLowerCase();
}

function proofKindFor(message: AfpMessage): WeddingVendorQuoteThreadProofMessageState["proofKind"] | null {
  const tokens = messageTokens(message);
  if (message.type === "approval_receipt" && (
    tokens.includes("wedding_vendor_thread_receipt")
    || tokens.includes("wedding_approval_receipt")
    || Boolean(durableReceiptIdForMessage(message.content ?? {}, message.metadata ?? {}).id)
  )) return "receipt";
  if (message.type === "email_draft" && tokens.includes("wedding_vendor_quote_reply")) return "draft";
  if (tokens.includes("wedding_vendor_quote_received") || tokens.includes("wedding_vendor_quote")) return "quote";
  return null;
}

export function buildWeddingVendorQuoteThreadProofMessageState(
  message: AfpMessage,
): WeddingVendorQuoteThreadProofMessageState | null {
  const proofKind = proofKindFor(message);
  if (!proofKind) return null;
  const content = message.content ?? {};
  const metadata = message.metadata ?? {};
  const delivery = typeof content.delivery === "object" && content.delivery ? content.delivery as Record<string, unknown> : {};
  const providerLabel = cleanWeddingProductionLabel(
    firstString([content.provider, metadata.provider, content.provider_label, metadata.provider_label, ""]),
    { wordAware: true },
  );
  const receipt = durableReceiptIdForMessage(content, metadata);
  const clientMessageId = firstString([content.client_message_id, metadata.client_message_id]);
  const sentToLabel = stringListLabel([
    delivery.to,
    content.to,
    content.delivery_recipients,
    metadata.delivery_recipients,
  ]) ?? firstString([content.recipient, metadata.recipient]);
  const subjectLabel = firstString([
    delivery.subject,
    content.subject,
    metadata.subject,
    content.delivery_subject,
    metadata.delivery_subject,
  ]);
  const inReplyToLabel = firstString([
    delivery.inReplyTo,
    content.delivery_in_reply_to,
    metadata.delivery_in_reply_to,
    content.in_reply_to,
    metadata.in_reply_to,
    message.parent_id,
  ]);
  const deliveryReferences = [
    ...boundedReferenceArray(delivery.references),
    ...boundedReferenceArray(content.delivery_references),
    ...boundedReferenceArray(metadata.delivery_references),
    ...boundedReferenceArray(content.references),
    ...boundedReferenceArray(metadata.references),
  ];
  const deliveryReferencesLabel = stringArrayLabel(boundedReferenceArray(deliveryReferences));
  const deliveryReadyRaw = content.delivery_ready ?? metadata.delivery_ready;
  const deliveryReady = typeof deliveryReadyRaw === "boolean" ? deliveryReadyRaw : null;
  const contentDeliveryMissingFields = boundedStringArray(content.delivery_missing_fields);
  const deliveryMissingFields = contentDeliveryMissingFields.length > 0
    ? contentDeliveryMissingFields
    : boundedStringArray(metadata.delivery_missing_fields);
  const isSentProof = message.type === "approval_receipt" && hasDurableSentProofForMessage(content, metadata);
  return {
    id: message.id,
    title: titleFor(message),
    body: bodyFor(message),
    timestampLabel: timestampLabel(message.timestamp),
    typeLabel: typeLabelFor(message),
    proofKind,
    providerLabel,
    receiptId: receipt.id,
    receiptIdLabel: receipt.label,
    clientMessageId,
    sentToLabel,
    subjectLabel,
    inReplyToLabel,
    deliveryReferencesLabel,
    deliveryReady,
    deliveryMissingFields,
    isSentProof,
  };
}

export function buildWeddingVendorQuoteThreadProofState(
  messages: readonly AfpMessage[],
): WeddingVendorQuoteThreadProofMessageState[] {
  return messages
    .map(buildWeddingVendorQuoteThreadProofMessageState)
    .filter((message): message is WeddingVendorQuoteThreadProofMessageState => message !== null);
}

export function buildWeddingVendorQuoteThreadProofDrawerState(input: {
  vendorName?: string | null;
  messages: readonly WeddingVendorQuoteThreadProofMessageState[];
  loading?: boolean | null;
  error?: string | null;
}): WeddingVendorQuoteThreadProofDrawerState {
  const vendorName = cleanWeddingProductionLabel(input.vendorName ?? null, { wordAware: true }) || "this vendor";
  const sentProofs = uniqueSentProofs(input.messages);
  const latestSentProof = sentProofs[sentProofs.length - 1] ?? null;
  const draftCount = input.messages.filter((message) => message.proofKind === "draft").length;
  const quoteCount = input.messages.filter((message) => message.proofKind === "quote").length;
  if (input.loading) {
    return {
      title: `What was sent to ${vendorName}`,
      summary: "Loading the saved quote thread and delivery proof.",
      statusLabel: "Loading",
      statusTone: "neutral",
      sentProofCount: sentProofs.length,
      draftCount,
      quoteCount,
      latestSentReceiptLabel: latestSentProof?.receiptId ?? null,
    };
  }
  if (clean(input.error)) {
    return {
      title: `What was sent to ${vendorName}`,
      summary: "The local sent proof is still visible, but the full saved thread could not be loaded yet.",
      statusLabel: "Thread needs reload",
      statusTone: sentProofs.length > 0 ? "warning" : "neutral",
      sentProofCount: sentProofs.length,
      draftCount,
      quoteCount,
      latestSentReceiptLabel: latestSentProof?.receiptId ?? null,
    };
  }
  if (sentProofs.length > 0) {
    return {
      title: `What was sent to ${vendorName}`,
      summary: `${sentProofs.length === 1 ? "A sent receipt is" : `${sentProofs.length} sent receipts are`} attached to this quote thread${latestSentProof?.receiptId ? ` (${latestSentProof.receiptIdLabel ?? "receipt"}: ${latestSentProof.receiptId})` : ""}.`,
      statusLabel: "Sent proof found",
      statusTone: "success",
      sentProofCount: sentProofs.length,
      draftCount,
      quoteCount,
      latestSentReceiptLabel: latestSentProof?.receiptId ?? null,
    };
  }
  return {
    title: `What was sent to ${vendorName}`,
    summary: input.messages.length > 0
      ? "The quote and draft are visible, but no provider sent receipt is attached yet."
      : "No saved quote-thread messages were returned yet.",
    statusLabel: input.messages.length > 0 ? "No sent proof yet" : "No thread messages",
    statusTone: input.messages.length > 0 ? "warning" : "neutral",
    sentProofCount: 0,
    draftCount,
    quoteCount,
    latestSentReceiptLabel: null,
  };
}

export function mergeWeddingVendorQuoteThreadProofMessages(
  savedMessages: readonly AfpMessage[],
  localMessages: readonly AfpMessage[],
): AfpMessage[] {
  const result = [...savedMessages];
  const seenIds = new Set(result.map((message) => message.id));
  const seenReceiptIds = new Set(
    buildWeddingVendorQuoteThreadProofState(result)
      .filter((row) => row.isSentProof)
      .map((row) => receiptDedupeKey(row.receiptId))
      .filter((id): id is string => id !== null),
  );
  for (const message of localMessages) {
    if (seenIds.has(message.id)) continue;
    const proof = buildWeddingVendorQuoteThreadProofMessageState(message);
    if (!proof) continue;
    const receiptKey = receiptDedupeKey(proof.receiptId);
    if (proof.isSentProof && receiptKey && seenReceiptIds.has(receiptKey)) continue;
    result.push(message);
    seenIds.add(message.id);
    if (proof.isSentProof && receiptKey) seenReceiptIds.add(receiptKey);
  }
  return result.sort((left, right) => {
    const leftTime = Date.parse(left.timestamp);
    const rightTime = Date.parse(right.timestamp);
    return (Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime);
  });
}

export function weddingVendorQuoteLocalReceiptProofMessage(input: {
  receipt: WeddingApprovalReceiptState | null | undefined;
  threadId: string | null | undefined;
  parentId?: string | null;
}): AfpMessage | null {
  const receipt = input.receipt;
  const threadId = clean(input.threadId);
  if (!receipt || receipt.status !== "executed" || !threadId) return null;
  if (receipt.actionKind !== "send_email") return null;
  if (!durableReceiptIdFor(receipt)) return null;
  const deliveryThreadId = weddingApprovalReceiptDeliveryThreadId(receipt);
  if (deliveryThreadId && deliveryThreadId !== threadId) return null;
  const proof = weddingApprovalReceiptToVendorThreadAfpSendInput(receipt, {
    threadId,
    parentId: input.parentId ?? null,
  });
  if (!proof) return null;
  const content = proof.content && typeof proof.content === "object" && !Array.isArray(proof.content)
    ? proof.content as Record<string, unknown>
    : {};
  return {
    id: `local-${receipt.id}`,
    thread_id: proof.thread_id,
    parent_id: proof.parent_id ?? null,
    from: proof.from,
    to: proof.to,
    timestamp: proof.timestamp ?? receipt.createdAt,
    type: proof.type,
    kind: proof.kind ?? null,
    subtype: proof.subtype ?? null,
    content,
    views: (proof.views ?? []) as AfpMessage["views"],
    attachments: (proof.attachments ?? []) as AfpMessage["attachments"],
    references: (proof.references ?? []) as AfpMessage["references"],
    supertags: proof.supertags ?? [],
    metadata: proof.metadata ?? {},
  };
}

export function weddingVendorQuoteReceiptParentId(
  messages: readonly AfpMessage[],
  approvalRequestId: string | null | undefined,
): string | null {
  const requestId = clean(approvalRequestId);
  if (!requestId) return null;
  type DraftCandidate = { id: string; sortKey: number; index: number };
  let readyDraft: DraftCandidate | null = null;
  let legacyDraft: DraftCandidate | null = null;
  const preferLater = (
    current: DraftCandidate | null,
    candidate: DraftCandidate,
  ) => {
    if (!current) return candidate;
    if (candidate.sortKey > current.sortKey) return candidate;
    if (candidate.sortKey === current.sortKey && candidate.index > current.index) return candidate;
    return current;
  };
  for (const [index, message] of messages.entries()) {
    const approvalRequest = approvalRequestIdForMessage(message);
    if (approvalRequest !== requestId || message.type !== "email_draft") continue;
    const timestamp = Date.parse(message.timestamp);
    const candidate: DraftCandidate = {
      id: message.id,
      sortKey: Number.isFinite(timestamp) ? timestamp : 0,
      index,
    };
    const deliveryReady = message.content?.delivery_ready ?? message.metadata?.delivery_ready;
    if (deliveryReady === true) {
      readyDraft = preferLater(readyDraft, candidate);
      continue;
    }
    if (deliveryReady !== false) legacyDraft = preferLater(legacyDraft, candidate);
  }
  return readyDraft?.id ?? legacyDraft?.id ?? null;
}
