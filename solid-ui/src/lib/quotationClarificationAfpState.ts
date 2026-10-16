import type { QuotationClarificationDraft } from "@/lib/quotationClarificationState";

export type ClarificationAfpInput = {
  thread_id: string;
  parent_id?: string | null;
  type: "quotation_clarification_draft" | "quotation_clarification_approval";
  content: Record<string, unknown>;
  references: Array<{ type: string; target: string }>;
  metadata: { privacy: "tenant_private"; e2ee_required: true; schema_version: string };
};

export function clarificationDraftAfpInput(threadId: string, draft: QuotationClarificationDraft): ClarificationAfpInput {
  return {
    thread_id: threadId,
    type: "quotation_clarification_draft",
    content: {
      draft_id: draft.draft_id,
      draft_hash: draft.draft_hash,
      recipient: draft.recipient,
      subject: draft.subject,
      questions: draft.questions,
      quotation_version_id: draft.quotation_version_id,
      comparison_revision: draft.comparison_revision,
    },
    references: [
      { type: "quotation", target: draft.quotation_id },
      { type: "quotation_version", target: draft.quotation_version_id },
      { type: "comparison_revision", target: draft.comparison_revision },
    ],
    metadata: { privacy: "tenant_private", e2ee_required: true, schema_version: "quotation.clarification.v1" },
  };
}

export function clarificationApprovalAfpInput(
  threadId: string,
  draftMessageId: string,
  draft: QuotationClarificationDraft,
  approvalId: string,
  expiresAt: string,
): ClarificationAfpInput {
  return {
    thread_id: threadId,
    parent_id: draftMessageId,
    type: "quotation_clarification_approval",
    content: {
      approval_id: approvalId,
      draft_id: draft.draft_id,
      draft_hash: draft.draft_hash,
      recipient: draft.recipient,
      quotation_version_id: draft.quotation_version_id,
      comparison_revision: draft.comparison_revision,
      expires_at: expiresAt,
    },
    references: [{ type: "clarification_draft", target: draftMessageId }],
    metadata: { privacy: "tenant_private", e2ee_required: true, schema_version: "quotation.clarification.v1" },
  };
}
