import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import {
  buildWeddingVendorQuoteReplyFlowState,
  weddingVendorQuoteDraftAfpSendInput,
  weddingVendorQuoteIncomingAfpMessage,
  weddingVendorQuoteReplyConsentChangeState,
  weddingVendorQuoteReplyDraftPersistenceState,
  weddingVendorQuoteReplyEditorDirtyState,
  weddingVendorQuoteReplyPresentationState,
  weddingVendorQuoteReplyProofPersistenceState,
  weddingVendorQuoteReplyScheduledSendGateFlowState,
  weddingVendorQuoteReplyScheduledSendResolutionState,
  weddingVendorQuoteReplySendGateState,
} from "@/lib/weddingVendorQuoteReplyFlowState";

const quote: WeddingArtifactQuotePreview = {
  kind: "quote",
  vendorName: "Chloe's Florals",
  amount: 799,
  amountLabel: "AUD $799",
  currency: "AUD",
  budgetDeltaAmount: 200,
  budgetDeltaLabel: "$200 over budget",
  inclusions: ["Bridal bouquet", "Ceremony arrangements"],
  validUntil: "2026-10-15",
  attachmentUrl: "https://example.com/chloe-quote.pdf",
};

const metadata = {
  weddingPlanId: "plan-1",
  responseWorkspaceId: "workspace-1",
  sourceResponseId: "response-1",
};

const readyEmailProvider = {
  capability: "email",
  requiredProvider: "Gmail or email provider",
  credentialStatus: "connected",
  executorStatus: "available",
  productionReady: true,
  setupView: "email",
  summary: "Gmail or email provider ready",
  detail: "The connected app is ready.",
} as const;

test("vendor quote scheduled send resolution rechecks the current flow before executing", () => {
  const flow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata: { responseWorkspaceId: "workspace-1" },
    recipient: "chloe@example.com",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
  });
  const openGate = weddingVendorQuoteReplySendGateState({
    flowCanSend: flow.canSend,
    draftPersistence: weddingVendorQuoteReplyDraftPersistenceState({ status: "saved" }),
    providerReadiness: readyEmailProvider,
  });

  assert.deepEqual(weddingVendorQuoteReplyScheduledSendResolutionState({
    flow,
    sendGate: openGate,
  }), {
    canExecute: true,
    request: flow.approvalRequest,
    blockedReason: null,
  });

  const undoFlow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata: { responseWorkspaceId: "workspace-1" },
    recipient: "chloe@example.com",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    undoUntilIso: "2026-09-27T02:00:06.000Z",
    nowIso: "2026-09-27T02:00:05.000Z",
  });
  assert.equal(undoFlow.stage, "sending_undo_window");
  assert.equal(undoFlow.canSend, false);
  assert.deepEqual(weddingVendorQuoteReplyScheduledSendGateFlowState({ flow: undoFlow }), {
    flowCanSend: true,
  });
  assert.deepEqual(weddingVendorQuoteReplyScheduledSendResolutionState({
    flow: undoFlow,
    sendGate: weddingVendorQuoteReplySendGateState({
      flowCanSend: weddingVendorQuoteReplyScheduledSendGateFlowState({ flow: undoFlow }).flowCanSend,
      draftPersistence: weddingVendorQuoteReplyDraftPersistenceState({ status: "saved" }),
      providerReadiness: readyEmailProvider,
    }),
  }), {
    canExecute: true,
    request: undoFlow.approvalRequest,
    blockedReason: null,
  });

  const staleProvider = {
    ...readyEmailProvider,
    credentialStatus: "stale",
    productionReady: false,
    summary: "Reconnect Gmail",
    detail: "Reconnect the email provider before this can be sent.",
  } as const;
  const providerBlockedGate = weddingVendorQuoteReplySendGateState({
    flowCanSend: flow.canSend,
    draftPersistence: weddingVendorQuoteReplyDraftPersistenceState({ status: "saved" }),
    providerReadiness: staleProvider,
  });
  const blocked = weddingVendorQuoteReplyScheduledSendResolutionState({
    flow,
    sendGate: providerBlockedGate,
  });
  assert.equal(blocked.canExecute, false);
  assert.equal(blocked.request, null);
  assert.equal(blocked.blockedReason, "Reconnect the email provider before this can be sent.");
  const undoProviderBlocked = weddingVendorQuoteReplyScheduledSendResolutionState({
    flow: undoFlow,
    sendGate: weddingVendorQuoteReplySendGateState({
      flowCanSend: weddingVendorQuoteReplyScheduledSendGateFlowState({ flow: undoFlow }).flowCanSend,
      draftPersistence: weddingVendorQuoteReplyDraftPersistenceState({ status: "saved" }),
      providerReadiness: staleProvider,
    }),
  });
  assert.equal(undoProviderBlocked.canExecute, false);
  assert.equal(undoProviderBlocked.request, null);
  assert.equal(undoProviderBlocked.blockedReason, "Reconnect the email provider before this can be sent.");

  assert.deepEqual(weddingVendorQuoteReplyScheduledSendResolutionState({
    flow: null,
    sendGate: openGate,
  }), {
    canExecute: false,
    request: null,
    blockedReason: "The reply could not be sent because the quote thread is no longer available.",
  });
});

test("vendor quote consent changes only record newly checked unblocked approvals", () => {
  assert.deepEqual(weddingVendorQuoteReplyConsentChangeState({
    checked: false,
    blocked: false,
    alreadyRecorded: false,
  }), {
    shouldRecord: false,
    ignoredReason: "not_checked",
  });

  assert.deepEqual(weddingVendorQuoteReplyConsentChangeState({
    checked: true,
    blocked: true,
    alreadyRecorded: false,
  }), {
    shouldRecord: false,
    ignoredReason: "blocked",
  });

  assert.deepEqual(weddingVendorQuoteReplyConsentChangeState({
    checked: true,
    blocked: false,
    alreadyRecorded: true,
  }), {
    shouldRecord: false,
    ignoredReason: "already_recorded",
  });

  assert.deepEqual(weddingVendorQuoteReplyConsentChangeState({
    checked: false,
    blocked: false,
    alreadyRecorded: true,
  }), {
    shouldRecord: false,
    ignoredReason: "already_recorded",
  });

  assert.deepEqual(weddingVendorQuoteReplyConsentChangeState({
    checked: true,
    blocked: false,
    alreadyRecorded: false,
  }), {
    shouldRecord: true,
    ignoredReason: null,
  });
});

test("vendor quote sent proof persistence state distinguishes saved proof from proof gaps", () => {
  assert.equal(weddingVendorQuoteReplyProofPersistenceState({ notice: null }), null);
  assert.equal(weddingVendorQuoteReplyProofPersistenceState({ notice: "   " }), null);

  assert.deepEqual(weddingVendorQuoteReplyProofPersistenceState({
    notice: "Approval saved with this wedding and attached to the vendor thread.",
  }), {
    tone: "success",
    label: "Sent proof saved",
    detail: "Approval saved with this wedding and attached to the vendor thread.",
    actionLabel: "View what was sent",
  });

  assert.deepEqual(weddingVendorQuoteReplyProofPersistenceState({
    notice: "Approval finished, but the save record could not be stored.",
  }), {
    tone: "warning",
    label: "Sent, proof still needs attention",
    detail: "Approval finished, but the save record could not be stored.",
    actionLabel: "View saved thread",
  });

  assert.deepEqual(weddingVendorQuoteReplyProofPersistenceState({
    notice: "Approval is saved on this device until account saving is connected.",
  }), {
    tone: "warning",
    label: "Sent, proof still needs attention",
    detail: "Approval is saved on this device until account saving is connected.",
    actionLabel: "View saved thread",
  });
});

test("vendor quote reply presentation keeps high-stakes labels explicit", () => {
  const flow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    undoUntilIso: "2026-09-27T02:00:06.000Z",
    nowIso: "2026-09-27T02:00:00.000Z",
  });

  assert.deepEqual(weddingVendorQuoteReplyPresentationState({
    flow,
    nowIso: "2026-09-27T02:00:00.000Z",
  }), {
    sendButtonLabel: "Send to Chloe's Florals",
    primaryActionKind: "undo_send",
    primaryActionLabel: "Undo send",
    secondaryActionKind: "edit_reply",
    secondaryActionLabel: "Edit reply",
    budgetAcknowledgementLabel: "I understand this is $200 over budget, and I'm okay with that.",
    undoTitle: "Sending to Chloe's Florals in 6s",
    undoDetail: "The reply has not left OmnyID yet. Use Undo if you want to stop it.",
    eyebrowLabel: "Undo window",
    decisionPromptLabel: "The reply has not left OmnyID yet.",
    replySectionLabel: "Suggested reply reviewed",
    showReplyEditor: false,
    readOnlyReplyLabel: "Reply wording is approved for Chloe's Florals.",
  });

  const dirty = weddingVendorQuoteReplyPresentationState({
    flow,
    dirtyState: weddingVendorQuoteReplyEditorDirtyState({
      savedDraft: "Thanks Chloe.",
      editorDraft: "Thanks Chloe, please confirm delivery.",
    }),
  });
  assert.equal(dirty.sendButtonLabel, "Save reply first");
  assert.equal(dirty.primaryActionKind, "save_reply");
  assert.equal(dirty.primaryActionLabel, "Save reply first");
  assert.equal(dirty.secondaryActionKind, "view_quote");
  assert.equal(dirty.showReplyEditor, true);
  assert.equal(dirty.replySectionLabel, "Suggested reply - edit or send as-is");

  const localOnly = weddingVendorQuoteReplyPresentationState({
    flow,
    draftPersistence: weddingVendorQuoteReplyDraftPersistenceState({ status: "local_only" }),
  });
  assert.equal(localOnly.sendButtonLabel, "Save to wedding first");
  assert.equal(localOnly.primaryActionKind, "save_reply");
  assert.equal(localOnly.secondaryActionKind, "view_quote");
  assert.equal(localOnly.showReplyEditor, true);
});

test("vendor quote AFP messages use one durable thread for quote and draft", () => {
  const incoming = weddingVendorQuoteIncomingAfpMessage({
    quote,
    metadata,
    subject: "Floral quote",
    createdAt: "2026-09-27T00:00:00.000Z",
  });
  const flow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
  });
  const draft = weddingVendorQuoteDraftAfpSendInput({
    flow,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    body: "Thanks Chloe, we would like to proceed.",
    parentId: incoming.id,
    createdAt: "2026-09-27T00:01:00.000Z",
  });

  assert.equal(incoming.thread_id, flow.threadId);
  assert.equal(draft.thread_id, flow.threadId);
  assert.equal(draft.parent_id, incoming.id);
  assert.ok(draft.references?.some((reference) =>
    reference.type === "wedding_vendor_quote"
    && reference.target === incoming.id,
  ));
  assert.equal(draft.metadata?.quote_message_id, incoming.id);
  assert.equal(draft.metadata?.wedding_plan_id, flow.metadata.weddingPlanId);
  assert.equal(draft.metadata?.response_workspace_id, flow.metadata.responseWorkspaceId);
  assert.equal(draft.metadata?.source_response_id, flow.metadata.sourceResponseId);
  assert.equal((draft.content as Record<string, unknown>).response_workspace_id, flow.metadata.responseWorkspaceId);
  assert.equal(typeof draft.metadata?.id, "string");
  assert.match(String(draft.metadata?.id), /^afp-/);
  assert.equal(draft.type, "email_draft");
  assert.equal(draft.kind, "wedding_vendor_quote_reply_draft");
  assert.equal(incoming.attachments[0]?.storage.url, "https://example.com/chloe-quote.pdf");
});

test("vendor quote AFP messages reject unsafe attachment urls and malformed timestamps", () => {
  const unsafeQuote: WeddingArtifactQuotePreview = {
    ...quote,
    attachmentUrl: "javascript:alert(1)",
  };
  const incoming = weddingVendorQuoteIncomingAfpMessage({
    quote: unsafeQuote,
    metadata,
    subject: "Floral quote",
    createdAt: "not-a-date",
  });
  const flow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
  });
  const draft = weddingVendorQuoteDraftAfpSendInput({
    flow,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    body: "Thanks Chloe, we would like to proceed.",
    createdAt: "also-not-a-date",
  });

  assert.deepEqual(incoming.attachments, []);
  assert.notEqual(incoming.timestamp, "not-a-date");
  assert.equal(Number.isFinite(Date.parse(incoming.timestamp)), true);
  assert.notEqual(draft.timestamp, "also-not-a-date");
  assert.equal(Number.isFinite(Date.parse(draft.timestamp ?? "")), true);
});

test("vendor quote draft projection preserves the shared Tiptap email editor payload", () => {
  const flow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
  });
  const draft = weddingVendorQuoteDraftAfpSendInput({
    flow,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    body: "Thanks Chloe, we would like to proceed.",
    editorAfpMessage: {
      thread_id: flow.threadId,
      type: "email_draft",
      content: {
        html: "<p>Thanks Chloe, we would like to proceed.</p>",
        text: "Thanks Chloe, we would like to proceed.",
        to: "hello@chloes.example",
        subject: "Floral quote",
      },
      views: [{
        format: "email",
        content: {
          html: "<p>Thanks Chloe, we would like to proceed.</p>",
          to: "hello@chloes.example",
          subject: "Floral quote",
        },
        priority: 1,
      }],
      attachments: [],
      references: [],
      metadata: {
        editor_mode: "email",
        created_via: "TiptapEditor",
      },
    },
  });

  const content = draft.content as Record<string, unknown>;
  const firstView = draft.views?.[0] as { content?: Record<string, unknown> } | undefined;
  assert.equal(content.html, "<p>Thanks Chloe, we would like to proceed.</p>");
  assert.equal(content.approval_request_id, flow.approvalRequest.id);
  assert.equal(content.delivery_ready, true);
  assert.deepEqual(content.delivery_missing_fields, []);
  assert.equal(firstView?.content?.html, "<p>Thanks Chloe, we would like to proceed.</p>");
  assert.equal(firstView?.content?.semantic_object, flow.semanticObject);
  assert.equal(firstView?.content?.delivery_ready, true);
  assert.equal(draft.metadata?.created_via, "TiptapEditor");
  assert.equal(draft.metadata?.delivery_ready, true);
  assert.deepEqual(draft.metadata?.delivery_missing_fields, []);
  assert.ok(draft.supertags?.includes("delivery_ready"));
});

test("vendor quote draft projection marks incomplete delivery without blocking draft persistence", () => {
  const flow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "",
    subject: "Floral quote",
    draftBody: "",
    approvedWording: true,
    budgetImpactAcknowledged: true,
  });
  const draft = weddingVendorQuoteDraftAfpSendInput({
    flow,
    recipient: "",
    subject: "Floral quote",
    body: "",
    createdAt: "2026-09-27T00:02:00.000Z",
  });

  const content = draft.content as Record<string, unknown>;
  const firstView = draft.views?.[0] as { content?: Record<string, unknown> } | undefined;
  assert.equal(draft.type, "email_draft");
  assert.equal(content.delivery_ready, false);
  assert.deepEqual(content.delivery_missing_fields, ["recipient", "body"]);
  assert.equal(firstView?.content?.delivery_ready, false);
  assert.deepEqual(firstView?.content?.delivery_missing_fields, ["recipient", "body"]);
  assert.equal(draft.metadata?.delivery_ready, false);
  assert.deepEqual(draft.metadata?.delivery_missing_fields, ["recipient", "body"]);
  assert.ok(draft.supertags?.includes("delivery_incomplete"));
  assert.ok(!draft.supertags?.includes("delivery_ready"));
});
