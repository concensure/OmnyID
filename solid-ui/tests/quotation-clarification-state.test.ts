import assert from "node:assert/strict";
import test from "node:test";

import { clarificationApprovalAfpInput, clarificationDraftAfpInput } from "@/lib/quotationClarificationAfpState";
import { beginClarificationSend, editClarificationQuestion, recordClarificationReceipt, type QuotationClarificationState } from "@/lib/quotationClarificationState";

function state(): QuotationClarificationState {
  return {
    status: "approval_required",
    approvalId: "approval-1",
    approvalDraftHash: "sha256:abc",
    providerReceiptId: null,
    error: null,
    draft: {
      draft_id: "draft-1",
      draft_hash: "sha256:abc",
      quotation_id: "quote-1",
      quotation_version_id: "quote-1-v2",
      comparison_revision: "compare-v3",
      recipient: "vendor@example.test",
      subject: "Quotation questions",
      questions: [{ fact_key: "beverages", question: "What is the beverage price?" }],
      created_at: "2026-10-17T10:00:00Z",
    },
  };
}

test("editing invalidates prior approval", () => {
  const edited = editClarificationQuestion(state(), "beverages", "Is GST included in the beverage price?");
  assert.equal(edited.status, "editing");
  assert.equal(edited.approvalId, null);
  assert.equal(beginClarificationSend(edited).error, "This draft changed. Review and approve it again.");
});

test("approved sends require and retain a provider receipt", () => {
  const sending = beginClarificationSend(state());
  assert.equal(sending.status, "sending");
  assert.equal(recordClarificationReceipt(sending, "provider-1").status, "sent");
  assert.equal(recordClarificationReceipt(sending, "").status, "failed");
});

test("draft and approval AFP messages are private, linked, and revision bound", () => {
  const current = state();
  const draft = clarificationDraftAfpInput("thread-1", current.draft);
  const approval = clarificationApprovalAfpInput("thread-1", "draft-message-1", current.draft, "approval-1", "2026-10-17T11:00:00Z");
  assert.equal(draft.metadata.e2ee_required, true);
  assert.equal(approval.parent_id, "draft-message-1");
  assert.equal(approval.content.draft_hash, "sha256:abc");
  assert.equal(JSON.stringify(draft).includes("competitor"), false);
});
