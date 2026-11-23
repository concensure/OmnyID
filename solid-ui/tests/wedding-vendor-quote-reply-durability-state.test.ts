import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingApprovalReceiptState } from "@/lib/weddingApprovalState";
import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import {
  buildWeddingVendorQuoteReplyFlowState,
  weddingVendorQuoteReplyDraftEditEffect,
  weddingVendorQuoteReplyDraftPersistenceState,
  weddingVendorQuoteReplyDraftSaveCompletionState,
  weddingVendorQuoteReplyDraftSyncState,
  weddingVendorQuoteReplyEditorDirtyState,
  weddingVendorQuoteReplyExecutionSelectionState,
  weddingVendorQuoteReplyHomeSurfaceState,
  weddingVendorQuoteReplyRequestMatchState,
  weddingVendorQuoteReplyBusyLabelState,
  weddingVendorQuoteReplyContextualSurfaceState,
  weddingVendorQuoteReplyPendingSendRetryState,
  weddingVendorQuoteReplyPendingSendTokenState,
  weddingVendorQuoteReplyPresentationState,
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

test("vendor quote reply flow only marks executed email receipts as sent", () => {
  const calendarExecution = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      requestId: "calendar-request",
      actionKind: "create_external_calendar_event",
      status: "executed",
      canRetry: false,
      externalId: "gcal-event-123",
      message: "Calendar event created.",
      receipt: {
        id: "calendar-receipt",
        requestId: "calendar-request",
        actionKind: "create_external_calendar_event",
        title: "Create venue tour",
        status: "executed",
        createdAt: "2026-09-27T01:00:07.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: { external_id: "gcal-event-123" },
      },
    },
  });
  const blockedReceipt = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      requestId: "email-request",
      actionKind: "send_email",
      status: "executed",
      canRetry: false,
      externalId: "gmail-message-123",
      message: "Sent.",
      receipt: {
        id: "email-receipt",
        requestId: "email-request",
        actionKind: "send_email",
        title: "Send reply to Chloe's Florals",
        status: "blocked",
        createdAt: "2026-09-27T01:00:07.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: {
          external_id: "gmail-message-123",
          external_delivery_performed: true,
        },
      },
    },
  });

  assert.equal(calendarExecution.stage, "blocked");
  assert.equal(calendarExecution.sentReceiptId, null);
  assert.match(calendarExecution.failureMessage ?? "", /missing a provider receipt/i);
  assert.equal(blockedReceipt.stage, "blocked");
  assert.equal(blockedReceipt.sentReceiptId, null);
  assert.match(blockedReceipt.failureMessage ?? "", /missing a provider receipt/i);
});

test("vendor quote reply flow does not mark failed provider receipts as sent", () => {
  const baseExecution = {
    requestId: "email-request",
    actionKind: "send_email" as const,
    status: "executed" as const,
    canRetry: false,
    externalId: "gmail-message-123",
    message: "Sent.",
    receipt: {
      id: "email-receipt",
      requestId: "email-request",
      actionKind: "send_email" as const,
      title: "Send reply to Chloe's Florals",
      status: "executed" as const,
      createdAt: "2026-09-27T01:00:07.000Z",
      disclosureLines: [],
      riskLabels: [],
      metadata: { external_id: "gmail-message-123" },
    },
  };
  const failedDelivery = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      ...baseExecution,
      receipt: {
        ...baseExecution.receipt,
        metadata: {
          ...baseExecution.receipt.metadata,
          external_delivery_performed: false,
          missing_durable_provider_receipt: false,
        },
      },
    },
  });
  const missingDurableReceipt = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      ...baseExecution,
      receipt: {
        ...baseExecution.receipt,
        metadata: {
          ...baseExecution.receipt.metadata,
          external_delivery_performed: true,
          missing_durable_provider_receipt: true,
        },
      },
    },
  });
  const providerResultFailed = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      ...baseExecution,
      receipt: {
        ...baseExecution.receipt,
        metadata: {
          ...baseExecution.receipt.metadata,
          provider_result_ok: false,
          external_delivery_performed: true,
          missing_durable_provider_receipt: false,
        },
      },
    },
  });

  for (const flow of [failedDelivery, missingDurableReceipt, providerResultFailed]) {
    assert.equal(flow.stage, "blocked");
    assert.equal(flow.sentReceiptId, null);
    assert.match(flow.failureMessage ?? "", /missing a provider receipt/i);
    assert.equal(flow.semanticObject.stateLabel, "Needs attention");
  }
});

test("vendor quote reply flow suppresses malformed sent receipt timestamps", () => {
  const sent = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      requestId: "email-request",
      actionKind: "send_email",
      status: "executed",
      canRetry: false,
      externalId: "gmail-message-123",
      message: "Sent.",
      receipt: {
        id: "email-receipt",
        requestId: "email-request",
        actionKind: "send_email",
        title: "Send reply to Chloe's Florals",
        status: "executed",
        createdAt: "not-a-date",
        disclosureLines: [],
        riskLabels: [],
        metadata: {
          external_id: "gmail-message-123",
          external_delivery_performed: true,
        },
      },
    },
  });

  assert.equal(sent.stage, "sent");
  assert.equal(sent.sentConfirmationLabel, "Sent to Chloe's Florals.");
  assert.doesNotMatch(sent.summary, /not-a-date/);
});

test("vendor quote reply flow preserves provider failure messages without hiding the draft", () => {
  const failed = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      requestId: "wedding_vendor_quote_reply:wedding_vendor_quote_workspace_1_chloes_florals_floral_quote:send",
      actionKind: "send_email",
      status: "failed",
      canRetry: true,
      externalId: null,
      message: "Gmail token expired. Reconnect Gmail before sending.",
      receipt: {
        id: "receipt-1",
        requestId: "wedding_vendor_quote_reply:wedding_vendor_quote_workspace_1_chloes_florals_floral_quote:send",
        actionKind: "send_email",
        title: "Send reply to Chloe's Florals",
        status: "blocked",
        createdAt: "2026-09-27T02:00:00.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: {
          blocked_reason: "Gmail token expired. Reconnect Gmail before sending.",
        },
      },
    },
  });

  assert.equal(failed.stage, "blocked");
  assert.equal(failed.canSend, true);
  assert.equal(failed.draftBody, "Thanks Chloe, we would like to proceed.");
  assert.equal(failed.failureMessage, "Gmail token expired. Reconnect Gmail before sending.");
  assert.match(failed.summary, /Gmail token expired/i);
  assert.equal(failed.semanticObject.stateLabel, "Needs attention");
  assert.equal(weddingVendorQuoteReplyPresentationState({ flow: failed }).primaryActionKind, "send");
  assert.equal(weddingVendorQuoteReplyPresentationState({ flow: failed }).primaryActionLabel, "Try sending again");
  assert.equal(failed.semanticObject.actions[0]?.label, "Try sending again");
  assert.equal(failed.semanticObject.actions[0]?.kind, "send_vendor_quote_reply");

  const retrying = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: failed.draftBody,
    approvedWording: true,
    budgetImpactAcknowledged: true,
    undoUntilIso: "2026-09-27T02:00:06.000Z",
    execution: {
      requestId: failed.approvalRequest.id,
      actionKind: "send_email",
      status: "failed",
      canRetry: true,
      externalId: null,
      message: "Gmail token expired. Reconnect Gmail before sending.",
      receipt: {
        id: "receipt-1",
        requestId: failed.approvalRequest.id,
        actionKind: "send_email",
        title: "Send reply to Chloe's Florals",
        status: "blocked",
        createdAt: "2026-09-27T02:00:00.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: {
          blocked_reason: "Gmail token expired. Reconnect Gmail before sending.",
        },
      },
    },
  });

  assert.equal(retrying.stage, "sending_undo_window");
  assert.equal(retrying.canSend, false);
});

test("vendor quote draft edits revoke stale wording approval and provider failure state", () => {
  assert.deepEqual(weddingVendorQuoteReplyDraftEditEffect({
    previousDraft: "Thanks Chloe.",
    nextDraft: "Thanks Chloe.",
    approvedWording: true,
    hadExecution: true,
  }), {
    changed: false,
    approvedWording: true,
    clearExecution: false,
  });

  assert.deepEqual(weddingVendorQuoteReplyDraftEditEffect({
    previousDraft: "Thanks Chloe.",
    nextDraft: "Thanks Chloe, please confirm the delivery window.",
    approvedWording: true,
    hadExecution: true,
  }), {
    changed: true,
    approvedWording: false,
    clearExecution: true,
  });
});

test("vendor quote execution selection suppresses stale persisted execution after edits", () => {
  const persisted = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      requestId: "request:persisted",
      actionKind: "send_email",
      status: "blocked",
      canRetry: true,
      externalId: null,
      message: "Gmail token expired.",
      receipt: {
        id: "receipt:persisted",
        requestId: "request:persisted",
        actionKind: "send_email",
        title: "Send reply to Chloe's Florals",
        status: "blocked",
        createdAt: "2026-09-27T01:00:07.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: {},
      },
    },
  }).execution;
  const local = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, please confirm delivery.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      requestId: "request:local",
      actionKind: "send_email",
      status: "executed",
      canRetry: false,
      externalId: "gmail-local",
      message: "Sent.",
      receipt: {
        id: "receipt:local",
        requestId: "request:local",
        actionKind: "send_email",
        title: "Send reply to Chloe's Florals",
        status: "executed",
        createdAt: "2026-09-27T01:01:07.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: {
          external_id: "gmail-local",
          external_delivery_performed: true,
        },
      },
    },
  }).execution;

  assert.equal(weddingVendorQuoteReplyExecutionSelectionState({
    persistedExecution: persisted,
  }).execution?.requestId, "request:persisted");
  assert.equal(weddingVendorQuoteReplyExecutionSelectionState({
    persistedExecution: persisted,
    cleared: true,
  }).execution, null);
  assert.equal(weddingVendorQuoteReplyExecutionSelectionState({
    localExecution: local,
    persistedExecution: persisted,
    cleared: true,
  }).execution?.requestId, "request:local");
});

test("vendor quote request matching only clears the active receipt for that request", () => {
  assert.deepEqual(weddingVendorQuoteReplyRequestMatchState({
    requestId: "request:chloe",
    currentRequestId: "request:chloe",
  }), {
    matches: true,
  });

  assert.deepEqual(weddingVendorQuoteReplyRequestMatchState({
    requestId: "request:chloe",
    currentRequestId: "request:venue",
  }), {
    matches: false,
  });

  assert.deepEqual(weddingVendorQuoteReplyRequestMatchState({
    requestId: "request:chloe",
    currentRequestId: null,
  }), {
    matches: false,
  });
});

test("vendor quote editor dirty state blocks sending until edited wording is saved", () => {
  assert.deepEqual(weddingVendorQuoteReplyEditorDirtyState({
    savedDraft: "Thanks Chloe.",
    editorDraft: "Thanks Chloe.",
    approvedWording: true,
  }), {
    dirty: false,
    approvalMatchesSavedDraft: true,
    sendBlockedReason: null,
  });

  const dirty = weddingVendorQuoteReplyEditorDirtyState({
    savedDraft: "Thanks Chloe.",
    editorDraft: "Thanks Chloe, please confirm delivery.",
    approvedWording: true,
  });

  assert.equal(dirty.dirty, true);
  assert.equal(dirty.approvalMatchesSavedDraft, false);
  assert.match(dirty.sendBlockedReason ?? "", /Save the edited reply before sending/i);
});

test("vendor quote draft sync adopts saved changes without clobbering active edits", () => {
  assert.deepEqual(weddingVendorQuoteReplyDraftSyncState({
    currentDraft: "Thanks Chloe.",
    previousSavedDraft: "Thanks Chloe.",
    nextSavedDraft: "Thanks Chloe, saved wording.",
  }), {
    draft: "Thanks Chloe, saved wording.",
    syncedDraftBody: "Thanks Chloe, saved wording.",
    adoptedSavedDraft: true,
  });

  assert.deepEqual(weddingVendorQuoteReplyDraftSyncState({
    currentDraft: "Thanks Chloe, local unsaved edit.",
    previousSavedDraft: "Thanks Chloe.",
    nextSavedDraft: "Thanks Chloe, saved wording.",
  }), {
    draft: "Thanks Chloe, local unsaved edit.",
    syncedDraftBody: "Thanks Chloe, saved wording.",
    adoptedSavedDraft: false,
  });
});

test("vendor quote draft persistence blocks approval and sending for local-only wording", () => {
  assert.deepEqual(weddingVendorQuoteReplyDraftPersistenceState({ status: "saved" }), {
    status: "saved",
    tone: "success",
    label: "Reply saved",
    detail: "The latest wording is saved to this wedding record.",
    blocksApproval: false,
    blocksExternalSend: false,
  });

  const localOnly = weddingVendorQuoteReplyDraftPersistenceState({ status: "local_only" });

  assert.equal(localOnly.tone, "warning");
  assert.equal(localOnly.blocksApproval, true);
  assert.equal(localOnly.blocksExternalSend, true);
  assert.match(localOnly.detail, /durable thread history/i);
});

test("vendor quote draft save completion ignores stale async results", () => {
  assert.deepEqual(weddingVendorQuoteReplyDraftSaveCompletionState({
    attemptId: 2,
    currentAttemptId: 2,
  }), {
    shouldApply: true,
  });

  assert.deepEqual(weddingVendorQuoteReplyDraftSaveCompletionState({
    attemptId: 1,
    currentAttemptId: 2,
  }), {
    shouldApply: false,
  });

  assert.deepEqual(weddingVendorQuoteReplyDraftSaveCompletionState({
    attemptId: null,
    currentAttemptId: 2,
  }), {
    shouldApply: false,
  });
});

test("vendor quote send gate blocks dirty drafts, local-only drafts, and provider gaps", () => {
  const readyPersistence = weddingVendorQuoteReplyDraftPersistenceState({ status: "saved" });
  const localOnly = weddingVendorQuoteReplyDraftPersistenceState({ status: "local_only" });

  assert.deepEqual(weddingVendorQuoteReplySendGateState({
    flowCanSend: true,
    dirtyState: weddingVendorQuoteReplyEditorDirtyState({
      savedDraft: "Thanks Chloe.",
      editorDraft: "Thanks Chloe, please confirm delivery.",
    }),
    draftPersistence: readyPersistence,
  }), {
    canStartSend: false,
    blockedBy: "dirty_draft",
    blockedReason: "Save the edited reply before sending so approval applies to the latest wording.",
  });

  assert.equal(weddingVendorQuoteReplySendGateState({
    flowCanSend: true,
    draftPersistence: localOnly,
  }).blockedBy, "draft_persistence");

  assert.deepEqual(weddingVendorQuoteReplySendGateState({
    flowCanSend: true,
    draftPersistence: readyPersistence,
    providerReadiness: {
      capability: "email",
      requiredProvider: "Gmail or email provider",
      credentialStatus: "missing",
      executorStatus: "available",
      productionReady: false,
      setupView: "email",
      summary: "Gmail or email provider needs setup",
      detail: "Connect the app account before this can be sent or synced outside OmnyID.",
    },
  }), {
    canStartSend: false,
    blockedBy: "provider",
    blockedReason: "Connect the app account before this can be sent or synced outside OmnyID.",
  });

  assert.deepEqual(weddingVendorQuoteReplySendGateState({
    flowCanSend: true,
    draftPersistence: readyPersistence,
    providerReadiness: {
      capability: "email",
      requiredProvider: "Gmail or email provider",
      credentialStatus: "connected",
      executorStatus: "available",
      productionReady: true,
      setupView: "email",
      summary: "Gmail or email provider ready",
      detail: "The connected app is ready.",
    },
  }), {
    canStartSend: true,
    blockedBy: null,
    blockedReason: null,
  });
});
