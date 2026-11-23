// @locs-version: 1.0
import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingVendorQuoteProofRoundTripState } from "@/lib/weddingVendorQuoteProofRoundTripState";
import type { WeddingVendorQuoteProviderSendVerificationState } from "@/lib/weddingVendorQuoteProviderSendVerificationState";
import { weddingVendorQuoteReceiptPersistenceState } from "@/lib/weddingVendorQuoteReceiptPersistenceState";
import {
  buildWeddingVendorQuoteReplyProductionReadinessState,
  weddingVendorQuoteLiveProviderVerificationRecordFromOutput,
  weddingVendorQuoteLiveProviderVerificationRecordState,
} from "@/lib/weddingVendorQuoteReplyProductionReadinessState";
import type { WeddingVendorQuoteReplyUiReadinessState } from "@/lib/weddingVendorQuoteReplyUiReadinessState";

const uiReady: WeddingVendorQuoteReplyUiReadinessState = {
  status: "ready",
  productionReady: true,
  summary: "Vendor quote reply UI has the required review, undo, provider, and proof safeguards.",
  detail: "Ready.",
  evidenceLabels: ["Inline controls mounted"],
  blockerLabels: [],
  nextActionLabels: [],
  telemetryEvent: null,
};

const providerVerified: WeddingVendorQuoteProviderSendVerificationState = {
  status: "verified",
  verified: true,
  providerReceiptId: "gmail-message-123",
  telemetryEvent: null,
  evidenceLabels: ["provider: gmail", "external delivery performed", "proof drawer reconstructed sent proof"],
  blockerLabels: [],
};

const proofComplete: WeddingVendorQuoteProofRoundTripState = {
  status: "complete",
  messages: [],
  drawer: {
    title: "What was sent to Chloe's Florals",
    summary: "A sent receipt is attached.",
    statusLabel: "Sent proof found",
    statusTone: "success",
    sentProofCount: 1,
    draftCount: 1,
    quoteCount: 1,
    latestSentReceiptLabel: "gmail-message-123",
  },
  hasQuote: true,
  hasDraft: true,
  hasDurableSentProof: true,
  telemetryEvent: null,
};

const contractReadyInput = {
  uiReadiness: uiReady,
  providerSendVerification: providerVerified,
  proofRoundTrip: proofComplete,
  receiptPersistence: weddingVendorQuoteReceiptPersistenceState({
    approvalSaveAvailable: true,
    approvalSaveSucceeded: true,
    vendorThreadExpected: true,
    vendorThreadProjectionAvailable: true,
    vendorThreadSaveSucceeded: true,
  }),
  fullRegressionPassed: true,
  typecheckPassed: true,
  buildPassed: true,
  weddingSuitePassed: true,
};

const liveVerifierRecord = {
  schema_version: 1,
  verification_kind: "omnyid_live_gmail_provider_send",
  ok: true,
  from: "admin@omnyid.com",
  to: "concensure@gmail.com",
  subject: "OmnyID Gmail provider verification - verify-123",
  thread_id: "wedding_vendor_quote:live-provider-verification:verify-123",
  status_route: "/integrations/gmail/status",
  send_route: "/integrations/gmail/send-draft",
  provider: "gmail",
  provider_message_id: "gmail-message-123",
  client_message_id: "local-gmail-123",
  actual_connected_provider_proof_ref: "gmail:prod-smoke:2026-09-27:gmail-message-123",
  verified_at: "2026-09-27T10:00:00.000Z",
};

const liveVerifierOutput = [
  "LIVE_GMAIL_PROVIDER_SEND_CONFIRMED",
  "from=admin@omnyid.com",
  "to=concensure@gmail.com",
  "subject=OmnyID Gmail provider verification - verify-123",
  "provider_message_id=gmail-message-123",
  "client_message_id=local-gmail-123",
  "actual_connected_provider_proof_ref=gmail:prod-smoke:2026-09-27:gmail-message-123",
  `verification_record_json=${JSON.stringify(liveVerifierRecord)}`,
].join("\n");

test("vendor quote production readiness stays blocked until live provider proof is attached", () => {
  const state = buildWeddingVendorQuoteReplyProductionReadinessState(contractReadyInput);

  assert.equal(state.productionReady, false);
  assert.equal(state.status, "partial");
  assert.equal(state.telemetryEvent, "wedding_vendor_quote_reply_production_readiness_blocked");
  assert.ok(state.evidenceLabels.includes("Provider send contract and proof reconstruction are verified"));
  assert.ok(state.blockerLabels.includes("Actual connected Gmail/provider send has not been verified."));
  assert.ok(state.nextActionLabels.includes("Run a real connected-provider send verification and attach the durable provider proof reference."));
});

test("vendor quote production readiness distinguishes verified send from missing attached proof", () => {
  const state = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    actualConnectedProviderSendVerified: true,
  });

  assert.equal(state.productionReady, false);
  assert.equal(state.status, "partial");
  assert.ok(state.blockerLabels.includes("Actual connected Gmail/provider send proof is not attached."));
});

test("vendor quote production readiness passes only with live connected-provider proof", () => {
  const state = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    actualConnectedProviderSendVerified: true,
    actualConnectedProviderProofRef: "gmail:prod-smoke:2026-09-27:gmail-message-123",
  });

  assert.equal(state.productionReady, true);
  assert.equal(state.status, "ready");
  assert.equal(state.telemetryEvent, null);
  assert.deepEqual(state.blockerLabels, []);
  assert.ok(state.evidenceLabels.includes("Actual connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-123"));
});

test("vendor quote production readiness accepts the live verifier proof ref output", () => {
  const state = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    actualConnectedProviderSendVerified: true,
    actualConnectedProviderProofRef: "gmail:prod-smoke:2026-09-27:gmail-message-123",
  });

  assert.equal(state.productionReady, true);
  assert.ok(
    state.evidenceLabels.includes(
      "Actual connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-123",
    ),
  );
});

test("vendor quote production readiness accepts the live verifier JSON record", () => {
  const state = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    actualConnectedProviderVerificationRecord: liveVerifierRecord,
    expectedSender: "admin@omnyid.com",
    expectedRecipient: "concensure@gmail.com",
    expectedSubject: "OmnyID Gmail provider verification - verify-123",
    expectedThreadId: "wedding_vendor_quote:live-provider-verification:verify-123",
  });

  assert.equal(state.productionReady, true);
  assert.ok(
    state.evidenceLabels.includes(
      "Actual connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-123",
    ),
  );
});

test("vendor quote production readiness accepts raw live verifier output", () => {
  const state = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    actualConnectedProviderVerificationOutput: liveVerifierOutput,
    expectedSender: "admin@omnyid.com",
    expectedRecipient: "concensure@gmail.com",
    expectedSubject: "OmnyID Gmail provider verification - verify-123",
    expectedThreadId: "wedding_vendor_quote:live-provider-verification:verify-123",
  });

  assert.equal(state.productionReady, true);
  assert.ok(
    state.evidenceLabels.includes(
      "Actual connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-123",
    ),
  );
});

test("vendor quote production readiness accepts a connected Gmail sender distinct from the app user", () => {
  const connectedRecord = {
    ...liveVerifierRecord,
    from: "concensure@gmail.com",
    provider_message_id: "gmail-message-concensure-123",
    actual_connected_provider_proof_ref: "gmail:prod-smoke:2026-09-27:gmail-message-concensure-123",
  };
  const state = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    providerSendVerification: {
      ...providerVerified,
      providerReceiptId: "gmail-message-concensure-123",
    },
    actualConnectedProviderVerificationOutput: [
      "LIVE_GMAIL_PROVIDER_SEND_CONFIRMED",
      "from=concensure@gmail.com",
      "provider_message_id=gmail-message-concensure-123",
      "actual_connected_provider_proof_ref=gmail:prod-smoke:2026-09-27:gmail-message-concensure-123",
      `verification_record_json=${JSON.stringify(connectedRecord)}`,
    ].join("\n"),
    expectedSender: "concensure@gmail.com",
    expectedRecipient: "concensure@gmail.com",
    expectedSubject: "OmnyID Gmail provider verification - verify-123",
    expectedThreadId: "wedding_vendor_quote:live-provider-verification:verify-123",
  });

  assert.equal(state.productionReady, true);
  assert.equal(state.status, "ready");
  assert.ok(
    state.evidenceLabels.includes(
      "Actual connected provider send verified: gmail:prod-smoke:2026-09-27:gmail-message-concensure-123",
    ),
  );
});

test("vendor quote production readiness rejects live verifier output without release expectations", () => {
  const missingSender = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    actualConnectedProviderVerificationRecord: liveVerifierRecord,
    expectedRecipient: "concensure@gmail.com",
    expectedSubject: "OmnyID Gmail provider verification - verify-123",
    expectedThreadId: "wedding_vendor_quote:live-provider-verification:verify-123",
  });
  const missingRecipient = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    actualConnectedProviderVerificationOutput: liveVerifierOutput,
    expectedSender: "admin@omnyid.com",
    expectedSubject: "OmnyID Gmail provider verification - verify-123",
    expectedThreadId: "wedding_vendor_quote:live-provider-verification:verify-123",
  });

  assert.equal(missingSender.productionReady, false);
  assert.ok(
    missingSender.blockerLabels.includes(
      "Expected connected Gmail account is required before accepting live provider verification output.",
    ),
  );
  assert.equal(missingRecipient.productionReady, false);
  assert.ok(
    missingRecipient.blockerLabels.includes(
      "Expected vendor recipient is required before accepting live provider verification output.",
    ),
  );
});

test("live verifier output parser extracts only the structured JSON record", () => {
  const parsed = weddingVendorQuoteLiveProviderVerificationRecordFromOutput(liveVerifierOutput);

  assert.equal(parsed.blockerLabel, null);
  assert.deepEqual(parsed.record, liveVerifierRecord);
});

test("live verifier output parser fails closed without structured JSON", () => {
  const parsed = weddingVendorQuoteLiveProviderVerificationRecordFromOutput(
    "LIVE_GMAIL_PROVIDER_SEND_CONFIRMED\nactual_connected_provider_proof_ref=gmail:prod-smoke:2026-09-27:gmail-message-123",
  );

  assert.equal(parsed.record, null);
  assert.equal(parsed.blockerLabel, "Live Gmail provider verification output does not include verification_record_json.");
});

test("live verifier output parser fails closed with duplicate structured JSON records", () => {
  const parsed = weddingVendorQuoteLiveProviderVerificationRecordFromOutput([
    liveVerifierOutput,
    `verification_record_json=${JSON.stringify({
      ...liveVerifierRecord,
      provider_message_id: "other-message-id",
    })}`,
  ].join("\n"));

  assert.equal(parsed.record, null);
  assert.equal(
    parsed.blockerLabel,
    "Live Gmail provider verification output contains multiple verification_record_json lines.",
  );
});

test("vendor quote production readiness rejects malformed verifier output JSON", () => {
  const state = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    actualConnectedProviderVerificationOutput: "verification_record_json={bad-json",
    expectedSender: "admin@omnyid.com",
    expectedRecipient: "concensure@gmail.com",
    expectedSubject: "OmnyID Gmail provider verification - verify-123",
    expectedThreadId: "wedding_vendor_quote:live-provider-verification:verify-123",
  });

  assert.equal(state.productionReady, false);
  assert.ok(
    state.blockerLabels.includes("Live Gmail provider verification record JSON could not be parsed."),
  );
});

test("vendor quote production readiness rejects live verifier delivery mismatches", () => {
  const state = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    actualConnectedProviderVerificationRecord: liveVerifierRecord,
    expectedSender: "admin@omnyid.com",
    expectedRecipient: "wrong@example.com",
    expectedSubject: "OmnyID Gmail provider verification - verify-123",
    expectedThreadId: "wedding_vendor_quote:live-provider-verification:verify-123",
  });

  assert.equal(state.productionReady, false);
  assert.ok(
    state.blockerLabels.includes(
      "Live Gmail provider verification record recipient does not match the approved vendor email.",
    ),
  );
});

test("vendor quote production readiness rejects live verifier sender mismatches", () => {
  const state = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    actualConnectedProviderVerificationRecord: liveVerifierRecord,
    expectedSender: "other@omnyid.com",
    expectedRecipient: "concensure@gmail.com",
    expectedSubject: "OmnyID Gmail provider verification - verify-123",
    expectedThreadId: "wedding_vendor_quote:live-provider-verification:verify-123",
  });

  assert.equal(state.productionReady, false);
  assert.ok(
    state.blockerLabels.includes(
      "Live Gmail provider verification record sender does not match the expected connected Gmail account.",
    ),
  );
});

test("vendor quote production readiness rejects live verifier thread mismatches", () => {
  const state = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    actualConnectedProviderVerificationRecord: liveVerifierRecord,
    expectedSender: "admin@omnyid.com",
    expectedRecipient: "concensure@gmail.com",
    expectedSubject: "OmnyID Gmail provider verification - verify-123",
    expectedThreadId: "wedding_vendor_quote:wrong-thread",
  });

  assert.equal(state.productionReady, false);
  assert.ok(
    state.blockerLabels.includes(
      "Live Gmail provider verification record thread does not match the vendor quote thread.",
    ),
  );
});

test("live verifier JSON record adapter fails closed on mismatched provider ids", () => {
  const record = weddingVendorQuoteLiveProviderVerificationRecordState({
    record: {
      ...liveVerifierRecord,
      provider_message_id: "other-message-id",
    },
    expectedProviderReceiptId: "gmail-message-123",
  });

  assert.equal(record.valid, false);
  assert.equal(record.verified, false);
  assert.equal(record.providerMessageId, "other-message-id");
  assert.equal(record.blockerLabel, "Live Gmail provider verification record does not match the verified provider receipt.");
});

test("vendor quote production readiness rejects malformed live verifier JSON records", () => {
  const state = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    actualConnectedProviderVerificationRecord: {
      ...liveVerifierRecord,
      ok: true,
      send_route: "/gmail/send",
      actual_connected_provider_proof_ref: "gmail:prod-smoke:2026-09-27:gmail-message-123",
    },
    expectedSender: "admin@omnyid.com",
    expectedRecipient: "concensure@gmail.com",
    expectedSubject: "OmnyID Gmail provider verification - verify-123",
    expectedThreadId: "wedding_vendor_quote:live-provider-verification:verify-123",
  });

  assert.equal(state.productionReady, false);
  assert.ok(
    state.blockerLabels.includes(
      "Live Gmail provider verification record does not prove an executed OmnyID Gmail send.",
    ),
  );
});

test("vendor quote production readiness rejects live verifier records with unsupported schema or stale proof refs", () => {
  const baseInput = {
    ...contractReadyInput,
    expectedSender: "admin@omnyid.com",
    expectedRecipient: "concensure@gmail.com",
    expectedSubject: "OmnyID Gmail provider verification - verify-123",
    expectedThreadId: "wedding_vendor_quote:live-provider-verification:verify-123",
  };
  const unsupportedSchema = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...baseInput,
    actualConnectedProviderVerificationRecord: {
      ...liveVerifierRecord,
      schema_version: 2,
    },
  });
  const invalidTimestamp = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...baseInput,
    actualConnectedProviderVerificationRecord: {
      ...liveVerifierRecord,
      verified_at: "2026-09-27T10:00:00+00:00",
    },
  });
  const staleProofRef = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...baseInput,
    actualConnectedProviderVerificationRecord: {
      ...liveVerifierRecord,
      actual_connected_provider_proof_ref: "gmail:prod-smoke:2026-09-26:gmail-message-123",
    },
  });

  assert.equal(unsupportedSchema.productionReady, false);
  assert.ok(unsupportedSchema.blockerLabels.includes(
    "Live Gmail provider verification record has an unsupported schema version.",
  ));
  assert.equal(invalidTimestamp.productionReady, false);
  assert.ok(invalidTimestamp.blockerLabels.includes(
    "Live Gmail provider verification record has an invalid verified_at timestamp.",
  ));
  assert.equal(staleProofRef.productionReady, false);
  assert.ok(staleProofRef.blockerLabels.includes(
    "Live Gmail provider verification proof reference does not match the verification date.",
  ));
});


test("vendor quote production readiness rejects local or dry-run proof refs as release evidence", () => {
  const state = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    actualConnectedProviderSendVerified: true,
    actualConnectedProviderProofRef: "omnyid:wedding_provider_dry_run:email",
  });

  assert.equal(state.productionReady, false);
  assert.equal(state.status, "partial");
  assert.ok(
    state.blockerLabels.some((label) => /durable provider\/audit ID|dry-run|localhost|browser-only/i.test(label)),
  );
  assert.ok(state.nextActionLabels.includes("Run a real connected-provider send verification and attach the durable provider proof reference."));
});

test("vendor quote production readiness rejects proof refs that do not match provider verification", () => {
  const state = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    actualConnectedProviderSendVerified: true,
    actualConnectedProviderProofRef: "gmail:prod-smoke:2026-09-27:other-message-id",
  });

  assert.equal(state.productionReady, false);
  assert.equal(state.status, "partial");
  assert.ok(
    state.blockerLabels.includes(
      "Actual connected Gmail/provider proof reference does not match the verified provider receipt.",
    ),
  );
});

test("vendor quote production readiness reports proof round-trip gaps separately", () => {
  const state = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    proofRoundTrip: {
      ...proofComplete,
      status: "missing_sent_proof",
      hasDurableSentProof: false,
      drawer: {
        ...proofComplete.drawer,
        sentProofCount: 0,
        latestSentReceiptLabel: null,
      },
    },
    actualConnectedProviderSendVerified: true,
    actualConnectedProviderProofRef: "gmail:prod-smoke:2026-09-27:gmail-message-123",
  });

  assert.equal(state.productionReady, false);
  assert.ok(state.blockerLabels.includes("Server thread proof is incomplete: missing_sent_proof."));
  assert.ok(state.nextActionLabels.includes("Reload the vendor quote thread and confirm the proof drawer reconstructs quote, draft, and durable provider receipt."));
});

test("vendor quote production readiness requires receipt persistence proof on the vendor thread", () => {
  const state = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    receiptPersistence: weddingVendorQuoteReceiptPersistenceState({
      approvalSaveAvailable: true,
      approvalSaveSucceeded: true,
      vendorThreadExpected: true,
      vendorThreadProjectionAvailable: true,
      vendorThreadSaveSucceeded: false,
    }),
    actualConnectedProviderSendVerified: true,
    actualConnectedProviderProofRef: "gmail:prod-smoke:2026-09-27:gmail-message-123",
  });

  assert.equal(state.productionReady, false);
  assert.ok(
    state.blockerLabels.includes(
      "Provider receipt persistence is incomplete: Approval saved, but the vendor-thread proof copy could not be attached yet.",
    ),
  );
  assert.ok(state.nextActionLabels.includes("Retry thread proof save"));
});

test("vendor quote production readiness blocks sent proof without quote and draft context", () => {
  const state = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    proofRoundTrip: {
      ...proofComplete,
      status: "missing_thread_context",
      hasQuote: true,
      hasDraft: false,
    },
    actualConnectedProviderSendVerified: true,
    actualConnectedProviderProofRef: "gmail:prod-smoke:2026-09-27:gmail-message-123",
  });

  assert.equal(state.productionReady, false);
  assert.ok(state.blockerLabels.includes("Server thread proof is incomplete: missing_thread_context."));
});

test("vendor quote production readiness includes provider verification failure detail", () => {
  const state = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    providerSendVerification: {
      ...providerVerified,
      status: "provider_not_live",
      verified: false,
      telemetryEvent: "wedding_vendor_quote_provider_send_provider_not_live",
      blockerLabels: ["The receipt does not prove a connected live Gmail provider execution."],
    },
    actualConnectedProviderSendVerified: true,
    actualConnectedProviderProofRef: "gmail:prod-smoke:2026-09-27:gmail-message-123",
  });

  assert.equal(state.productionReady, false);
  assert.ok(
    state.blockerLabels.includes(
      "Provider send verification failed: provider_not_live. The receipt does not prove a connected live Gmail provider execution.",
    ),
  );
});

test("vendor quote production readiness bounds noisy provider verification blockers", () => {
  const noisyDetail = `  The   receipt   does   not prove live Gmail delivery because ${"provider metadata ".repeat(40)} `;
  const state = buildWeddingVendorQuoteReplyProductionReadinessState({
    ...contractReadyInput,
    providerSendVerification: {
      ...providerVerified,
      status: "provider_not_live",
      verified: false,
      telemetryEvent: "wedding_vendor_quote_provider_send_provider_not_live",
      blockerLabels: [noisyDetail],
    },
    actualConnectedProviderSendVerified: true,
    actualConnectedProviderProofRef: "gmail:prod-smoke:2026-09-27:gmail-message-123",
  });

  assert.equal(state.productionReady, false);
  assert.ok(state.blockerLabels.every((label) => label.length <= 240));
  assert.ok(
    state.blockerLabels.some((label) => label.startsWith(
      "Provider send verification failed: provider_not_live. The receipt does not prove live Gmail delivery because provider metadata",
    )),
  );
  assert.ok(state.blockerLabels.some((label) => label.endsWith("...")));
});

test("vendor quote production readiness is blocked when nothing has been verified", () => {
  const state = buildWeddingVendorQuoteReplyProductionReadinessState();

  assert.equal(state.productionReady, false);
  assert.equal(state.status, "blocked");
  assert.equal(state.evidenceLabels.length, 0);
  assert.ok(state.blockerLabels.some((label) => /UI readiness has not been verified/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /Provider send verification has not been run/i.test(label)));
});
