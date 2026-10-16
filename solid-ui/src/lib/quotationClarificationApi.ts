import { apiFetch, sendAfpMessage } from "@/lib/api";
import {
  clarificationApprovalAfpInput,
  clarificationDraftAfpInput,
} from "@/lib/quotationClarificationAfpState";
import type { QuotationClarificationDraft } from "@/lib/quotationClarificationState";

export type PersistedClarification = {
  draftMessageId: string;
  approvalMessageId: string;
};

export type QuotationClarificationSendResult = {
  sent: boolean;
  replayed: boolean;
  idempotencyKey: string;
  providerReceiptId: string;
};

function messageId(value: unknown): string {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return typeof record.message_id === "string" ? record.message_id.trim() : "";
}

export async function persistApprovedQuotationClarification(input: {
  threadId: string;
  actorId: string;
  draft: QuotationClarificationDraft;
  approvalId: string;
  expiresAt: string;
}): Promise<PersistedClarification> {
  const draft = clarificationDraftAfpInput(input.threadId, input.draft);
  const draftResult = await sendAfpMessage({
    ...draft,
    id: input.draft.draft_id,
    from: input.actorId,
    to: ["agent://quotation-intelligence"],
    timestamp: input.draft.created_at,
    kind: "quotation_clarification_draft",
    subtype: "quotation_clarification_draft",
    store_in_relational: true,
  });
  const draftMessageId = messageId(draftResult);
  if (!draftMessageId) throw new Error("Clarification draft was not persisted.");
  const approval = clarificationApprovalAfpInput(
    input.threadId,
    draftMessageId,
    input.draft,
    input.approvalId,
    input.expiresAt,
  );
  const approvalResult = await sendAfpMessage({
    ...approval,
    id: input.approvalId,
    from: input.actorId,
    to: ["agent://quotation-intelligence"],
    timestamp: new Date().toISOString(),
    kind: "quotation_clarification_approval",
    subtype: "quotation_clarification_approval",
    store_in_relational: true,
  });
  const approvalMessageId = messageId(approvalResult);
  if (!approvalMessageId) throw new Error("Clarification approval was not persisted.");
  return { draftMessageId, approvalMessageId };
}

export async function sendApprovedQuotationClarification(input: {
  threadId: string;
  draftMessageId: string;
  approvalMessageId: string;
}): Promise<QuotationClarificationSendResult> {
  const value = await apiFetch<unknown>("/quotation/clarifications/send", {
    method: "POST",
    bodyJson: {
      thread_id: input.threadId,
      draft_message_id: input.draftMessageId,
      approval_message_id: input.approvalMessageId,
    },
  });
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const idempotencyKey = typeof record.idempotency_key === "string" ? record.idempotency_key : "";
  const providerReceiptId = typeof record.provider_receipt_id === "string" ? record.provider_receipt_id : "";
  if (record.sent !== true || !idempotencyKey || !providerReceiptId) {
    throw new Error("Clarification send did not return a durable provider receipt.");
  }
  return {
    sent: true,
    replayed: record.replayed === true,
    idempotencyKey,
    providerReceiptId,
  };
}
