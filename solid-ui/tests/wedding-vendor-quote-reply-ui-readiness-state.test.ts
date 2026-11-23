// @locs-version: 1.0
import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingProviderExecutorReadinessState } from "@/lib/weddingProviderExecutorReadinessState";
import { weddingVendorQuoteReceiptPersistenceState } from "@/lib/weddingVendorQuoteReceiptPersistenceState";
import { weddingVendorQuoteReplyDraftPersistenceState, weddingVendorQuoteReplyProofPersistenceState } from "@/lib/weddingVendorQuoteReplyFlowState";
import { buildWeddingVendorQuoteReplyUiReadinessState } from "@/lib/weddingVendorQuoteReplyUiReadinessState";
import { WEDDING_PRODUCTION_LABEL_MAX_LENGTH } from "@/lib/weddingProductionLabelState";

const providerReady: WeddingProviderExecutorReadinessState = {
  capability: "email",
  requiredProvider: "Gmail or email provider",
  credentialStatus: "connected",
  executorStatus: "available",
  productionReady: true,
  setupView: "email",
  summary: "Gmail or email provider ready",
  detail: "The connected app is ready.",
};

const readyInput = {
  quoteSummaryMounted: true,
  originalQuoteActionMounted: true,
  inlineEmailEditorMounted: true,
  wordingApprovalControlMounted: true,
  budgetAcknowledgementControlMounted: true,
  sendActionMounted: true,
  primaryDecisionActionMounted: true,
  secondaryDecisionActionMounted: true,
  conditionalReplyEditorMounted: true,
  sentReplyHistoryMounted: true,
  undoWindowMounted: true,
  persistentSentConfirmationMounted: true,
  proofDrawerActionMounted: true,
  proofDrawerStatusMounted: true,
  liveRegionsMounted: true,
  failureTelemetryMounted: true,
  providerReadiness: providerReady,
  draftPersistence: weddingVendorQuoteReplyDraftPersistenceState({ status: "saved" }),
  proofPersistence: weddingVendorQuoteReplyProofPersistenceState({
    notice: "Approval saved with this wedding and attached to the vendor thread.",
  }),
};

test("vendor quote reply UI readiness passes only when the inline review send and proof safeguards are mounted", () => {
  const state = buildWeddingVendorQuoteReplyUiReadinessState(readyInput);

  assert.equal(state.productionReady, true);
  assert.equal(state.status, "ready");
  assert.deepEqual(state.blockerLabels, []);
  assert.equal(state.telemetryEvent, null);
  assert.ok(state.evidenceLabels.includes("Separate budget acknowledgement control mounted"));
  assert.ok(state.evidenceLabels.includes("State-derived primary decision action mounted"));
  assert.ok(state.evidenceLabels.includes("Conditional reply editor visibility mounted"));
  assert.ok(state.evidenceLabels.includes("Undo window mounted before external send"));
});

test("vendor quote reply UI readiness blocks missing editor approval and proof controls", () => {
  const state = buildWeddingVendorQuoteReplyUiReadinessState({
    ...readyInput,
    inlineEmailEditorMounted: false,
    budgetAcknowledgementControlMounted: false,
    proofDrawerActionMounted: false,
  });

  assert.equal(state.productionReady, false);
  assert.equal(state.status, "partial");
  assert.equal(state.telemetryEvent, "wedding_vendor_quote_reply_ui_readiness_blocked");
  assert.ok(state.blockerLabels.includes("Inline email editor is not mounted."));
  assert.ok(state.blockerLabels.includes("Separate budget acknowledgement control is not mounted."));
  assert.ok(state.nextActionLabels.includes("Mount the Tiptap email editor inline in the quote card."));
});

test("vendor quote reply UI readiness requires dynamic decision-thread controls", () => {
  const state = buildWeddingVendorQuoteReplyUiReadinessState({
    ...readyInput,
    primaryDecisionActionMounted: false,
    secondaryDecisionActionMounted: false,
    conditionalReplyEditorMounted: false,
    sentReplyHistoryMounted: false,
  });

  assert.equal(state.productionReady, false);
  assert.ok(state.blockerLabels.includes("State-derived primary decision action is not mounted."));
  assert.ok(state.blockerLabels.includes("State-derived secondary decision action is not mounted."));
  assert.ok(state.blockerLabels.includes("Conditional reply editor visibility is not mounted."));
  assert.ok(state.blockerLabels.includes("Sent reply history/log surface is not mounted."));
  assert.ok(state.nextActionLabels.includes("Drive the primary CTA from the quote-reply decision stage."));
  assert.ok(state.nextActionLabels.includes("Show the Tiptap editor only when wording work is needed."));
});

test("vendor quote reply UI readiness requires provider recovery when Gmail is stale", () => {
  const state = buildWeddingVendorQuoteReplyUiReadinessState({
    ...readyInput,
    providerReadiness: {
      ...providerReady,
      credentialStatus: "stale",
      productionReady: false,
      summary: "Gmail or email provider needs setup",
      detail: "The connected app needs to be signed in again before it can send or sync.",
    },
    providerSetupActionMounted: false,
  });

  assert.equal(state.productionReady, false);
  assert.ok(state.blockerLabels.some((label) => /not production-ready/i.test(label)));
  assert.ok(state.blockerLabels.includes("Provider setup recovery action is not mounted."));
  assert.ok(state.nextActionLabels.includes("Mount the provider setup recovery action."));
});

test("vendor quote reply UI readiness blocks local-only drafts and proof-save attention", () => {
  const state = buildWeddingVendorQuoteReplyUiReadinessState({
    ...readyInput,
    draftPersistence: weddingVendorQuoteReplyDraftPersistenceState({ status: "local_only" }),
    proofPersistence: weddingVendorQuoteReplyProofPersistenceState({
      notice: "Approval finished, but the save record could not be stored.",
    }),
  });

  assert.equal(state.productionReady, false);
  assert.ok(state.blockerLabels.some((label) => /Draft persistence blocks external send/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /Sent proof persistence needs attention/i.test(label)));
  assert.ok(state.nextActionLabels.includes("Block external send until the draft is durably saved."));
  assert.ok(state.nextActionLabels.includes("Treat proof-save attention as not production-ready."));
});

test("vendor quote reply UI readiness uses receipt persistence copy for proof-save recovery", () => {
  const state = buildWeddingVendorQuoteReplyUiReadinessState({
    ...readyInput,
    receiptPersistence: weddingVendorQuoteReceiptPersistenceState({
      approvalSaveAvailable: true,
      approvalSaveSucceeded: true,
      vendorThreadExpected: true,
      vendorThreadProjectionAvailable: false,
    }),
  });

  assert.equal(state.productionReady, false);
  assert.ok(
    state.blockerLabels.includes(
      "Sent proof persistence needs attention: Approval saved, but provider delivery proof was not attached to the vendor thread.",
    ),
  );
  assert.ok(state.nextActionLabels.includes("Treat proof-save attention as not production-ready."));
});

test("vendor quote reply UI readiness rejects approval-only receipt persistence when vendor thread proof is expected", () => {
  const state = buildWeddingVendorQuoteReplyUiReadinessState({
    ...readyInput,
    receiptPersistence: weddingVendorQuoteReceiptPersistenceState({
      approvalSaveAvailable: true,
      approvalSaveSucceeded: true,
      vendorThreadExpected: false,
    }),
  });

  assert.equal(state.productionReady, false);
  assert.ok(
    state.blockerLabels.includes(
      "Sent proof persistence needs attention: Approval saved with this wedding.",
    ),
  );
  assert.ok(state.nextActionLabels.includes("Treat proof-save attention as not production-ready."));
});

test("vendor quote reply UI readiness bounds noisy provider and persistence labels", () => {
  const noisyDetail = `  The connected app needs reauthentication ${"before production send ".repeat(40)}  `;
  const state = buildWeddingVendorQuoteReplyUiReadinessState({
    ...readyInput,
    providerReadiness: {
      ...providerReady,
      productionReady: false,
      summary: `Gmail setup ${"pending ".repeat(80)}`,
      detail: noisyDetail,
    },
    providerSetupActionMounted: false,
    draftPersistence: weddingVendorQuoteReplyDraftPersistenceState({
      status: "local_only",
      error: `  Save failed ${"because IndexedDB was unavailable ".repeat(40)}  `,
    }),
    proofPersistence: weddingVendorQuoteReplyProofPersistenceState({
      notice: `  Approval finished, but proof persistence needs operator review ${"again ".repeat(80)}  `,
    }),
  });

  assert.equal(state.productionReady, false);
  assert.ok(state.blockerLabels.every((label) => label.length <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH));
  assert.ok(state.evidenceLabels.every((label) => label.length <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH));
  assert.ok(state.nextActionLabels.every((label) => label.length <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH));
  assert.ok(state.blockerLabels.some((label) => label.endsWith("...")));
  assert.ok(state.nextActionLabels.includes("Require connected email provider readiness before production send."));
});
