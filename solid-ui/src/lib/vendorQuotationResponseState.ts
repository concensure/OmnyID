// @module-id: quotation.claimed-vendor-response-state
// @primary-capability: ciphertext-only-vendor-transaction-workspace
// @locs-version: 1.0
// @stability: draft
// @owner: omnyid

import { vendorResponseFingerprint, type QuotationVendorResponse } from "afp-ts/quotation";

import { apiFetch } from "@/lib/api";
import { uploadVendorTransactionAttachment } from "@/lib/vendorTransactionAttachmentApi";
import type { SelectedVendorSenderIdentity } from "@/lib/vendorSenderIdentityState";
import { buildVendorQuotePreview, type VendorQuoteDraft } from "@/lib/vendorQuoteDraftState";
import {
  decryptVendorAgentEnvelope,
  encryptVendorAgentEnvelope,
  loadVendorAgentPublicKeys,
  signVendorAfpMessage,
  type SignableVendorAfpMessage,
  type VendorEncryptedEnvelope,
} from "@/lib/vendorAgentKeys";

export interface VendorTransactionInboxItem {
  invitation_message_id: string;
  vendor_id: string;
  grant_id: string;
  quotation_id: string;
  quotation_version_id: string;
  projection_fingerprint: string;
  expires_at: string;
  envelope: SignableVendorAfpMessage;
}

export interface VendorContextProjectionView {
  grantId: string;
  vendorId: string;
  threadId: string;
  quotationId: string;
  quotationVersionId: string;
  projectionFingerprint: string;
  responseRecipientId: string;
  responseRecipientEncryptionPublicKey: string;
  allowedActions: Array<"answer_questions" | "submit_revision" | "confirm_booking_details">;
  questions: Array<{ id: string; label: string }>;
  approvedFields: Array<{ key: string; value: unknown }>;
}

export interface VendorTransportReceipt {
  receipt_id: string;
  request_id: string;
  request_digest: string;
  status: "accepted" | "rejected";
  message_id?: string;
  failure?: string;
  received_at: string;
}

export const VENDOR_TRANSACTION_INBOX_PATH = "/quotation/vendor-transactions/inbox";
export const VENDOR_TRANSACTION_INVITATIONS_PATH = "/quotation/vendor-transactions/invitations";
export const VENDOR_TRANSACTION_RESPONSES_PATH = "/quotation/vendor-transactions/responses";

type ProjectionPayload = {
  projection?: Record<string, unknown>;
  response_recipient_encryption_public_key?: unknown;
};

const identifier = (value: unknown): string => typeof value === "string" && value.trim().length <= 180
  ? value.trim()
  : "";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};

const prohibitedField = (key: string): boolean => [
  "competitor", "other_vendor", "private_note", "hidden_preference", "full_plan",
  "internal_score", "comparison_score",
].some((prefix) => key === prefix || key.startsWith(`${prefix}.`) || key.startsWith(`${prefix}_`));

export async function loadVendorTransactionInbox(): Promise<VendorTransactionInboxItem[]> {
  const response = await apiFetch<{ transactions?: VendorTransactionInboxItem[] }>(
    VENDOR_TRANSACTION_INBOX_PATH,
  );
  return Array.isArray(response.transactions) ? response.transactions.slice(0, 50) : [];
}

/** Couple-side helper: encrypt an already approved projection to the claimed vendor. */
export async function inviteClaimedVendorTransaction(input: {
  threadId: string;
  grantMessageId: string;
  projection: Record<string, unknown>;
  vendorEncryptionPublicKey: string;
  responseRecipientEncryptionPublicKey: string;
  expiresAt: string;
}): Promise<VendorTransportReceipt> {
  const requestId = `request-${crypto.randomUUID()}`;
  const nonce = `nonce-${crypto.randomUUID()}`;
  const encryption = await encryptVendorAgentEnvelope(
    input.vendorEncryptionPublicKey,
    {
      projection: input.projection,
      response_recipient_encryption_public_key: input.responseRecipientEncryptionPublicKey,
    },
    {
      thread_id: input.threadId,
      grant_message_id: input.grantMessageId,
      request_id: requestId,
      nonce,
      expires_at: input.expiresAt,
    },
  );
  return apiFetch<VendorTransportReceipt>(VENDOR_TRANSACTION_INVITATIONS_PATH, {
    method: "POST",
    bodyJson: {
      thread_id: input.threadId,
      grant_message_id: input.grantMessageId,
      request_id: requestId,
      nonce,
      expires_at: input.expiresAt,
      encryption,
    },
  });
}

export async function unlockVendorTransaction(
  item: VendorTransactionInboxItem,
): Promise<VendorContextProjectionView> {
  const agentId = identifier(item.envelope.to?.[0]);
  const envelope = record(item.envelope.encryption) as unknown as VendorEncryptedEnvelope;
  const decrypted = await decryptVendorAgentEnvelope(agentId, envelope) as ProjectionPayload;
  return projectDecryptedVendorTransaction(item, decrypted);
}

export function projectDecryptedVendorTransaction(
  item: VendorTransactionInboxItem,
  decrypted: ProjectionPayload,
): VendorContextProjectionView {
  const projection = record(decrypted.projection);
  const fields = record(projection.fields);
  const questionIds = Array.isArray(projection.question_ids)
    ? projection.question_ids.map(identifier).filter(Boolean).slice(0, 50)
    : [];
  const allowedActions = Array.isArray(projection.allowed_actions)
    ? projection.allowed_actions.filter((value): value is VendorContextProjectionView["allowedActions"][number] =>
      value === "answer_questions" || value === "submit_revision" || value === "confirm_booking_details")
    : [];
  const exact = {
    grantId: identifier(projection.grant_id),
    vendorId: identifier(projection.recipient_vendor_id),
    threadId: identifier(projection.thread_id),
    quotationId: identifier(projection.quotation_id),
    quotationVersionId: identifier(projection.quotation_version_id),
    projectionFingerprint: identifier(projection.projection_fingerprint).toLowerCase(),
    responseRecipientId: identifier(projection.response_recipient_id),
  };
  if (
    exact.grantId !== item.grant_id
    || exact.vendorId !== item.vendor_id
    || exact.threadId !== item.envelope.thread_id
    || exact.quotationId !== item.quotation_id
    || exact.quotationVersionId !== item.quotation_version_id
    || exact.projectionFingerprint !== item.projection_fingerprint.toLowerCase()
  ) {
    throw new Error("This invitation no longer matches the active transaction.");
  }
  const recipientKey = identifier(decrypted.response_recipient_encryption_public_key);
  if (!/^[0-9a-fA-F]{64}$/.test(recipientKey)) {
    throw new Error("The response recipient encryption key is unavailable.");
  }
  return {
    ...exact,
    allowedActions,
    responseRecipientEncryptionPublicKey: recipientKey,
    questions: questionIds.map((id) => ({
      id,
      label: identifier(fields[`question.${id}`]) || id.replaceAll("_", " "),
    })),
    approvedFields: Object.entries(fields)
      .filter(([key]) => !prohibitedField(key) && !key.startsWith("question."))
      .slice(0, 100)
      .map(([key, value]) => ({ key, value })),
  };
}

export function vendorResponseA2ui(projection: VendorContextProjectionView): Record<string, unknown> {
  return {
    schema_version: "a2ui.v1",
    kind: "form",
    id: `vendor-response-${projection.grantId}`,
    title: "Respond to this quotation request",
    description: "Only the approved transaction context is shown. Your response returns to the couple for review.",
    children: projection.questions.map((question) => ({
      kind: "text_input",
      id: question.id,
      label: question.label,
      required: true,
      max_length: 4000,
    })),
    actions: [{ kind: "submit", id: "submit_vendor_response", label: "Send response for review" }],
  };
}

export async function submitVendorTransactionResponse(input: {
  item: VendorTransactionInboxItem;
  projection: VendorContextProjectionView;
  answers: Record<string, string>;
  attestedBy: string;
  senderIdentity: SelectedVendorSenderIdentity;
  attachments?: QuotationVendorResponse["attachments"];
  sources?: QuotationVendorResponse["sources"];
  quoteDraft?: VendorQuoteDraft;
}): Promise<VendorTransportReceipt> {
  const agentId = identifier(input.item.envelope.to?.[0]);
  const keys = await loadVendorAgentPublicKeys(agentId);
  if (!keys) throw new Error("Vendor agent keys are not available on this device.");
  const unanswered = input.projection.questions.find(({ id }) => !input.answers[id]?.trim());
  if (unanswered) throw new Error(`Answer “${unanswered.label}” before sending.`);
  if (!input.attestedBy.trim()) throw new Error("Enter the authorised representative's name.");

  const now = new Date().toISOString();
  const responseId = `response-${crypto.randomUUID()}`;
  const quote = input.quoteDraft ? buildVendorQuotePreview(input.quoteDraft) : null;
  const response: QuotationVendorResponse = {
    schema_version: "quotation.vendor_response.v1",
    response_id: responseId,
    vendor_id: input.projection.vendorId,
    thread_id: input.projection.threadId,
    grant_id: input.projection.grantId,
    quotation_id: input.projection.quotationId,
    quotation_version_id: input.projection.quotationVersionId,
    projection_fingerprint: input.projection.projectionFingerprint,
    channel: "afp",
    channel_receipt: { receipt_id: `local-${crypto.randomUUID()}`, received_at: now },
    status: "submitted",
    submitted_at: now,
    sender_identity: {
      identity_id: input.senderIdentity.identityId,
      kind: input.senderIdentity.kind,
      address: input.senderIdentity.address,
      display_name: input.senderIdentity.displayName,
    },
    question_answers: input.projection.questions.map(({ id }) => ({
      question_id: id,
      state: "proposed",
      answer: input.answers[id]!.trim(),
      anchors: [],
    })),
    commercial_facts: quote?.facts ?? [],
    explanation: quote?.explanation,
    sources: input.sources ?? [],
    attachments: input.attachments ?? [],
    attestation: {
      attested_by: input.attestedBy.trim(),
      authority: "vendor_representative",
      affirmed: true,
      attested_at: now,
    },
  };
  const responseFingerprint = await vendorResponseFingerprint(response);
  const metadata = {
    schema_version: "quotation.vendor_response_transport.v1",
    grant_message_id: identifier(input.item.envelope.parent_id),
    grant_id: input.projection.grantId,
    vendor_id: input.projection.vendorId,
    quotation_id: input.projection.quotationId,
    quotation_version_id: input.projection.quotationVersionId,
    projection_fingerprint: input.projection.projectionFingerprint,
    response_id: responseId,
    response_fingerprint: responseFingerprint,
    nonce: `nonce-${crypto.randomUUID()}`,
    agent_card_key_id: keys.keyId,
    expires_at: input.item.expires_at,
    sender_identity_id: input.senderIdentity.identityId,
    sender_identity_kind: input.senderIdentity.kind,
  };
  const encryption = await encryptVendorAgentEnvelope(
    input.projection.responseRecipientEncryptionPublicKey,
    response,
    metadata,
  );
  const unsigned: SignableVendorAfpMessage = {
    protocol: "afp-v1",
    id: responseId,
    thread_id: input.projection.threadId,
    parent_id: input.item.invitation_message_id,
    from: agentId,
    to: [input.projection.responseRecipientId],
    timestamp: now,
    type: "wedding_enquiry_response",
    kind: "quotation_vendor_response_submitted",
    subtype: "quotation_vendor_response_submitted",
    content: null,
    metadata,
    encryption,
    views: [],
    references: [],
    attachments: response.attachments.map((attachment) => ({
      id: attachment.attachment_id,
      sha256: attachment.content_hash.replace(/^sha256:/, ""),
    })),
    signature: "",
  };
  const message = await signVendorAfpMessage(agentId, unsigned);
  return apiFetch<VendorTransportReceipt>(VENDOR_TRANSACTION_RESPONSES_PATH, {
    method: "POST",
    bodyJson: {
      request_id: `request-${crypto.randomUUID()}`,
      invitation_message_id: input.item.invitation_message_id,
      sender_identity_id: input.senderIdentity.identityId,
      message,
    },
  });
}

export async function uploadVendorResponseAttachment(
  item: VendorTransactionInboxItem,
  file: File,
): Promise<{
  attachment: QuotationVendorResponse["attachments"][number];
  source: QuotationVendorResponse["sources"][number];
}> {
  return uploadVendorTransactionAttachment(item.invitation_message_id, file);
}
