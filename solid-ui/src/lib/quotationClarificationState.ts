export type ClarificationQuestion = { fact_key: string; question: string };

export type QuotationClarificationDraft = {
  draft_id: string;
  draft_hash: string;
  quotation_id: string;
  quotation_version_id: string;
  comparison_revision: string;
  recipient: string;
  subject: string;
  questions: ClarificationQuestion[];
  created_at: string;
};

export type QuotationClarificationState = {
  status: "editing" | "approval_required" | "sending" | "sent" | "answered" | "failed";
  draft: QuotationClarificationDraft;
  approvalId: string | null;
  approvalDraftHash: string | null;
  providerReceiptId: string | null;
  error: string | null;
};

export function editClarificationQuestion(
  state: QuotationClarificationState,
  factKey: string,
  question: string,
): QuotationClarificationState {
  const cleaned = question.trim();
  if (!cleaned || cleaned.length > 500) return { ...state, error: "Questions must be between 1 and 500 characters." };
  return {
    ...state,
    status: "editing",
    approvalId: null,
    approvalDraftHash: null,
    providerReceiptId: null,
    error: null,
    draft: {
      ...state.draft,
      draft_hash: "",
      questions: state.draft.questions.map((candidate) => candidate.fact_key === factKey ? { ...candidate, question: cleaned } : candidate),
    },
  };
}

export function approvalMatchesDraft(state: QuotationClarificationState): boolean {
  return Boolean(
    state.status === "approval_required"
    && state.approvalId
    && state.draft.draft_hash
    && state.approvalDraftHash === state.draft.draft_hash,
  );
}

export function beginClarificationSend(state: QuotationClarificationState): QuotationClarificationState {
  if (!approvalMatchesDraft(state)) {
    return { ...state, status: "editing", error: "This draft changed. Review and approve it again." };
  }
  return { ...state, status: "sending", error: null };
}

export function recordClarificationReceipt(
  state: QuotationClarificationState,
  providerReceiptId: string,
): QuotationClarificationState {
  if (state.status !== "sending" || !providerReceiptId.trim()) {
    return { ...state, status: "failed", error: "The send receipt was not saved." };
  }
  return { ...state, status: "sent", providerReceiptId, error: null };
}
