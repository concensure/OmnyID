import { createSignal } from "solid-js";
import { render } from "solid-js/web";

import QuotationClarificationCard from "../../src/components/QuotationClarificationCard";
import QuotationClosureCard from "../../src/components/QuotationClosureCard";
import QuotationEvidenceDrawer from "../../src/components/QuotationEvidenceDrawer";
import QuotationReviewCard from "../../src/components/QuotationReviewCard";
import "../../src/index.css";
import { sourceLocatorLabel } from "../../src/lib/quotationEvidenceState";
import {
  editClarificationEnvelope,
  editClarificationQuestion,
  recordClarificationReceipt,
  type QuotationClarificationState,
} from "../../src/lib/quotationClarificationState";
import type { QuotationClosureState } from "../../src/lib/quotationClosureState";
import type { QuotationReviewField } from "../../src/lib/quotationReviewState";

const evidence = {
  state: "confirmed" as const,
  sourceId: "quote-email-1",
  sourceVersionId: "quote-email-1-v1",
  locator: "page:2",
  exactExcerpt: "Venue hire is AUD 12,500 <img src=x onerror=alert(1)>",
};

const reviewFields: QuotationReviewField[] = [{
  id: "venue-hire",
  label: "Venue hire",
  valueLabel: "AUD 12,500.00",
  group: "totals",
  materiality: "high",
  confidenceBps: 9_500,
  reviewed: false,
  evidence,
}];

function Fixture() {
  const [drawerOpen, setDrawerOpen] = createSignal(false);
  const [returnFocus, setReturnFocus] = createSignal<HTMLElement | null>(null);
  const [lastReviewAction, setLastReviewAction] = createSignal("none");
  const [lastClosureAction, setLastClosureAction] = createSignal("none");
  const [clarification, setClarification] = createSignal<QuotationClarificationState>({
    status: "approval_required",
    approvalId: "approval-fixture-1",
    approvalDraftHash: "sha256:fixture-1",
    providerReceiptId: null,
    error: null,
    draft: {
      draft_id: "draft-fixture-1",
      draft_hash: "sha256:fixture-1",
      quotation_id: "quote-1",
      quotation_version_id: "quote-1-v2",
      comparison_revision: "comparison-1",
      recipient: "vendor@example.test",
      subject: "Questions about your quotation",
      questions: [
        { fact_key: "beverages", question: "Is beverage service included?" },
        { fact_key: "availability", question: "Is 14 November 2026 available?" },
      ],
      created_at: "2026-10-17T10:00:00Z",
    },
  });
  const closure: QuotationClosureState = {
    quotationId: "quote-1",
    quotationVersionId: "quote-1-v2",
    status: "contract_reviewed",
    revision: "closure-3",
    changedTerms: [],
    changedTermsReviewed: true,
    evidenceRefs: ["contract-email-1"],
    deadlineAt: "2026-11-01T09:00:00Z",
    deposit: { amountMinor: 250_000, currency: "AUD", isFee: false },
  };

  const approve = () => setClarification((current) => {
    const draftHash = `sha256:fixture-${current.draft.recipient}-${current.draft.subject}`;
    return {
      ...current,
      status: "approval_required",
      approvalId: "approval-fixture-2",
      approvalDraftHash: draftHash,
      error: null,
      draft: { ...current.draft, draft_hash: draftHash },
    };
  });
  const send = () => setClarification((current) => recordClarificationReceipt(
    { ...current, status: "sending", error: null },
    "provider-fixture-1",
  ));

  return (
    <div class="mx-auto min-h-screen max-w-5xl space-y-6 bg-slate-50 p-4 text-slate-950">
      <header>
        <h1 class="text-2xl font-bold">Quotation intelligence</h1>
        <p class="text-sm text-slate-700">Controlled review, clarification, and closure fixture.</p>
      </header>
      <QuotationReviewCard
        title="Review Harbour House quotation"
        parserStatus="ready"
        fields={reviewFields}
        onAction={(action) => setLastReviewAction(action.action)}
        onOpenEvidence={(_field, trigger) => {
          setReturnFocus(trigger);
          setDrawerOpen(true);
        }}
      />
      <p data-testid="review-action" aria-live="polite">Review action: {lastReviewAction()}</p>
      <QuotationClarificationCard
        state={clarification()}
        onQuestionChange={(factKey, value) => setClarification((current) => editClarificationQuestion(current, factKey, value))}
        onRecipientChange={(value) => setClarification((current) => editClarificationEnvelope(current, { recipient: value }))}
        onSubjectChange={(value) => setClarification((current) => editClarificationEnvelope(current, { subject: value }))}
        onRequestApproval={approve}
        onSend={send}
      />
      <p data-testid="clarification-status" aria-live="polite">
        {clarification().status}{clarification().providerReceiptId ? ` · ${clarification().providerReceiptId}` : ""}
      </p>
      <QuotationClosureCard state={closure} onAction={setLastClosureAction} />
      <p data-testid="closure-action" aria-live="polite">Closure action: {lastClosureAction()}</p>
      <QuotationEvidenceDrawer
        open={drawerOpen()}
        title="Venue hire evidence"
        excerpt={evidence.exactExcerpt}
        locatorLabel={sourceLocatorLabel(evidence)}
        sourceAvailable
        returnFocus={returnFocus()}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}

render(() => <Fixture />, document.getElementById("root")!);
