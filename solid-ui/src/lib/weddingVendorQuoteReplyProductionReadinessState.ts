// @locs-version: 1.0
import type { WeddingVendorQuoteProofRoundTripState } from "@/lib/weddingVendorQuoteProofRoundTripState";
import type { WeddingVendorQuoteProviderSendVerificationState } from "@/lib/weddingVendorQuoteProviderSendVerificationState";
import { buildWeddingVendorQuoteLiveProviderProofRefState } from "@/lib/weddingVendorQuoteLiveProviderProofRefState";
import type { WeddingVendorQuoteReceiptPersistenceState } from "@/lib/weddingVendorQuoteReceiptPersistenceState";
import type { WeddingVendorQuoteReplyUiReadinessState } from "@/lib/weddingVendorQuoteReplyUiReadinessState";
import { cleanWeddingProductionLabels } from "@/lib/weddingProductionLabelState";

export type WeddingVendorQuoteReplyProductionReadinessStatus = "ready" | "partial" | "blocked";

export type WeddingVendorQuoteReplyProductionReadinessState = {
  status: WeddingVendorQuoteReplyProductionReadinessStatus;
  productionReady: boolean;
  summary: string;
  detail: string;
  evidenceLabels: string[];
  blockerLabels: string[];
  nextActionLabels: string[];
  telemetryEvent: string | null;
};

export type WeddingVendorQuoteLiveProviderVerificationRecordState = {
  valid: boolean;
  verified: boolean;
  proofRef: string | null;
  providerMessageId: string | null;
  blockerLabel: string | null;
};

export type WeddingVendorQuoteLiveProviderVerificationRecordParseState = {
  record: Record<string, unknown> | null;
  blockerLabel: string | null;
};

type Check = {
  ready: boolean;
  evidence: string;
  blocker: string;
  nextAction: string;
};

function check(ready: boolean | null | undefined, evidence: string, blocker: string, nextAction: string): Check {
  return {
    ready: ready === true,
    evidence,
    blocker,
    nextAction,
  };
}

function proofCheck(proof: WeddingVendorQuoteProofRoundTripState | null | undefined): Check {
  return check(
    proof?.status === "complete" && proof.hasQuote && proof.hasDraft && proof.hasDurableSentProof,
    "Server thread round-trip reconstructs quote, draft, and durable sent proof",
    proof
      ? `Server thread proof is incomplete: ${proof.status}.`
      : "Server thread proof round-trip has not been verified.",
    "Reload the vendor quote thread and confirm the proof drawer reconstructs quote, draft, and durable provider receipt.",
  );
}

function receiptPersistenceCheck(receipt: WeddingVendorQuoteReceiptPersistenceState | null | undefined): Check {
  return check(
    receipt?.proofAttached === true
      && receipt.proofReliability === "vendor_thread"
      && receipt.needsAttention !== true,
    "Provider receipt persistence attached proof to the vendor thread",
    receipt
      ? `Provider receipt persistence is incomplete: ${receipt.notice}`
      : "Provider receipt persistence has not been verified.",
    receipt?.recoveryActionLabel ?? "Confirm approval receipt persistence and vendor-thread proof save both completed.",
  );
}

function recordString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function cleanExpectation(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function liveProviderExpectationBlocker(input: {
  expectedSender?: string | null;
  expectedRecipient?: string | null;
  expectedSubject?: string | null;
  expectedThreadId?: string | null;
}): string | null {
  if (!cleanExpectation(input.expectedSender)) {
    return "Expected connected Gmail account is required before accepting live provider verification output.";
  }
  if (!cleanExpectation(input.expectedRecipient)) {
    return "Expected vendor recipient is required before accepting live provider verification output.";
  }
  if (!cleanExpectation(input.expectedSubject)) {
    return "Expected approved subject is required before accepting live provider verification output.";
  }
  if (!cleanExpectation(input.expectedThreadId)) {
    return "Expected vendor quote thread id is required before accepting live provider verification output.";
  }
  return null;
}

function liveProviderRecordShapeBlocker(record: Record<string, unknown>, proofRef: string): string | null {
  if (record.schema_version !== 1) {
    return "Live Gmail provider verification record has an unsupported schema version.";
  }
  const verifiedAt = recordString(record, "verified_at");
  const verifiedAtMs = Date.parse(verifiedAt);
  if (!verifiedAt || !Number.isFinite(verifiedAtMs) || new Date(verifiedAtMs).toISOString() !== verifiedAt) {
    return "Live Gmail provider verification record has an invalid verified_at timestamp.";
  }
  const verifiedDate = verifiedAt.slice(0, 10);
  if (!proofRef.startsWith(`gmail:prod-smoke:${verifiedDate}:`)) {
    return "Live Gmail provider verification proof reference does not match the verification date.";
  }
  return null;
}

export function weddingVendorQuoteLiveProviderVerificationRecordFromOutput(
  output: string | null | undefined,
): WeddingVendorQuoteLiveProviderVerificationRecordParseState {
  const text = typeof output === "string" ? output : "";
  const lines = text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.startsWith("verification_record_json="));
  if (lines.length === 0) {
    return {
      record: null,
      blockerLabel: "Live Gmail provider verification output does not include verification_record_json.",
    };
  }
  if (lines.length > 1) {
    return {
      record: null,
      blockerLabel: "Live Gmail provider verification output contains multiple verification_record_json lines.",
    };
  }
  const [line] = lines;
  const rawJson = line.slice("verification_record_json=".length).trim();
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        record: null,
        blockerLabel: "Live Gmail provider verification record JSON is not an object.",
      };
    }
    return {
      record: parsed as Record<string, unknown>,
      blockerLabel: null,
    };
  } catch {
    return {
      record: null,
      blockerLabel: "Live Gmail provider verification record JSON could not be parsed.",
    };
  }
}

export function weddingVendorQuoteLiveProviderVerificationRecordState(input: {
  record?: unknown;
  expectedProviderReceiptId?: string | null;
  expectedSender?: string | null;
  expectedRecipient?: string | null;
  expectedSubject?: string | null;
  expectedThreadId?: string | null;
} = {}): WeddingVendorQuoteLiveProviderVerificationRecordState {
  const record = input.record && typeof input.record === "object" && !Array.isArray(input.record)
    ? input.record as Record<string, unknown>
    : null;
  if (!record) {
    return {
      valid: false,
      verified: false,
      proofRef: null,
      providerMessageId: null,
      blockerLabel: "Live Gmail provider verification record is missing or malformed.",
    };
  }

  const proofRef = recordString(record, "actual_connected_provider_proof_ref");
  const providerMessageId = recordString(record, "provider_message_id");
  const expectedProviderReceiptId = typeof input.expectedProviderReceiptId === "string"
    ? input.expectedProviderReceiptId.trim()
    : "";
  const expectedSender = typeof input.expectedSender === "string" ? input.expectedSender.trim().toLowerCase() : "";
  const expectedRecipient = typeof input.expectedRecipient === "string" ? input.expectedRecipient.trim().toLowerCase() : "";
  const expectedSubject = typeof input.expectedSubject === "string" ? input.expectedSubject.trim() : "";
  const expectedThreadId = typeof input.expectedThreadId === "string" ? input.expectedThreadId.trim() : "";
  const provesOmnyidGmailSend = record.ok === true
    && recordString(record, "verification_kind") === "omnyid_live_gmail_provider_send"
    && recordString(record, "provider").toLowerCase() === "gmail"
    && recordString(record, "send_route") === "/integrations/gmail/send-draft"
    && recordString(record, "status_route").endsWith("/gmail/status")
    && Boolean(providerMessageId)
    && Boolean(proofRef);

  if (!provesOmnyidGmailSend) {
    return {
      valid: false,
      verified: false,
      proofRef: proofRef || null,
      providerMessageId: providerMessageId || null,
      blockerLabel: "Live Gmail provider verification record does not prove an executed OmnyID Gmail send.",
    };
  }

  const shapeBlocker = liveProviderRecordShapeBlocker(record, proofRef);
  if (shapeBlocker) {
    return {
      valid: false,
      verified: false,
      proofRef,
      providerMessageId,
      blockerLabel: shapeBlocker,
    };
  }

  if (expectedProviderReceiptId && providerMessageId.toLowerCase() !== expectedProviderReceiptId.toLowerCase()) {
    return {
      valid: false,
      verified: false,
      proofRef,
      providerMessageId,
      blockerLabel: "Live Gmail provider verification record does not match the verified provider receipt.",
    };
  }

  const actualSender = recordString(record, "from").toLowerCase();
  const actualRecipient = recordString(record, "to").toLowerCase();
  const actualSubject = recordString(record, "subject");
  const actualThreadId = recordString(record, "thread_id") || recordString(record, "delivery_thread_id");
  const mismatchLabel = expectedSender && actualSender !== expectedSender
    ? "Live Gmail provider verification record sender does not match the expected connected Gmail account."
    : expectedRecipient && actualRecipient !== expectedRecipient
    ? "Live Gmail provider verification record recipient does not match the approved vendor email."
    : expectedSubject && actualSubject !== expectedSubject
      ? "Live Gmail provider verification record subject does not match the approved email subject."
      : expectedThreadId && actualThreadId !== expectedThreadId
        ? "Live Gmail provider verification record thread does not match the vendor quote thread."
        : null;
  if (mismatchLabel) {
    return {
      valid: false,
      verified: false,
      proofRef,
      providerMessageId,
      blockerLabel: mismatchLabel,
    };
  }

  const proof = buildWeddingVendorQuoteLiveProviderProofRefState({
    expectedProviderReceiptId: expectedProviderReceiptId || providerMessageId,
    verified: true,
    proofRef,
  });
  return {
    valid: proof.ready,
    verified: proof.ready,
    proofRef: proof.proofRef,
    providerMessageId,
    blockerLabel: proof.blockerLabel,
  };
}

function liveProviderRecordInput(input: {
  actualConnectedProviderSendVerified?: boolean | null;
  actualConnectedProviderProofRef?: string | null;
  actualConnectedProviderVerificationRecord?: unknown;
  actualConnectedProviderVerificationOutput?: string | null;
  providerSendVerification?: WeddingVendorQuoteProviderSendVerificationState | null;
  expectedSender?: string | null;
  expectedRecipient?: string | null;
  expectedSubject?: string | null;
  expectedThreadId?: string | null;
}) {
  if (input.actualConnectedProviderVerificationOutput || input.actualConnectedProviderVerificationRecord) {
    const expectationBlocker = liveProviderExpectationBlocker(input);
    if (expectationBlocker) {
      return {
        verified: false,
        proofRef: null,
        blockerLabel: expectationBlocker,
      };
    }
  }
  if (input.actualConnectedProviderVerificationOutput && !input.actualConnectedProviderVerificationRecord) {
    const parsed = weddingVendorQuoteLiveProviderVerificationRecordFromOutput(input.actualConnectedProviderVerificationOutput);
    if (!parsed.record) {
      return {
        verified: false,
        proofRef: null,
        blockerLabel: parsed.blockerLabel,
      };
    }
    const record = weddingVendorQuoteLiveProviderVerificationRecordState({
      record: parsed.record,
      expectedProviderReceiptId: input.providerSendVerification?.providerReceiptId,
      expectedSender: input.expectedSender,
      expectedRecipient: input.expectedRecipient,
      expectedSubject: input.expectedSubject,
      expectedThreadId: input.expectedThreadId,
    });
    return {
      verified: record.verified,
      proofRef: record.proofRef,
      blockerLabel: record.blockerLabel,
    };
  }
  if (!input.actualConnectedProviderVerificationRecord) {
    return {
      verified: input.actualConnectedProviderSendVerified,
      proofRef: input.actualConnectedProviderProofRef,
      blockerLabel: null,
    };
  }
  const record = weddingVendorQuoteLiveProviderVerificationRecordState({
    record: input.actualConnectedProviderVerificationRecord,
    expectedProviderReceiptId: input.providerSendVerification?.providerReceiptId,
    expectedSender: input.expectedSender,
    expectedRecipient: input.expectedRecipient,
    expectedSubject: input.expectedSubject,
    expectedThreadId: input.expectedThreadId,
  });
  return {
    verified: record.verified,
    proofRef: record.proofRef,
    blockerLabel: record.blockerLabel,
  };
}

function liveProviderCheck(input: {
  actualConnectedProviderSendVerified?: boolean | null;
  actualConnectedProviderProofRef?: string | null;
  actualConnectedProviderVerificationRecord?: unknown;
  actualConnectedProviderVerificationOutput?: string | null;
  providerSendVerification?: WeddingVendorQuoteProviderSendVerificationState | null;
  expectedSender?: string | null;
  expectedRecipient?: string | null;
  expectedSubject?: string | null;
  expectedThreadId?: string | null;
}): Check {
  const recordInput = liveProviderRecordInput(input);
  const proof = buildWeddingVendorQuoteLiveProviderProofRefState({
    expectedProviderReceiptId: input.providerSendVerification?.providerReceiptId,
    verified: recordInput.verified,
    proofRef: recordInput.proofRef,
  });
  return check(
    proof.ready,
    proof.evidenceLabel ?? "Actual connected provider send verified",
    recordInput.blockerLabel ?? proof.blockerLabel ?? "Actual connected Gmail/provider send proof is not attached.",
    "Run a real connected-provider send verification and attach the durable provider proof reference.",
  );
}

function providerVerificationBlocker(
  verification: WeddingVendorQuoteProviderSendVerificationState | null | undefined,
): string {
  if (!verification) return "Provider send verification has not been run.";
  const detail = verification.blockerLabels[0];
  return detail
    ? `Provider send verification failed: ${verification.status}. ${detail}`
    : `Provider send verification failed: ${verification.status}.`;
}

export function buildWeddingVendorQuoteReplyProductionReadinessState(input: {
  uiReadiness?: WeddingVendorQuoteReplyUiReadinessState | null;
  providerSendVerification?: WeddingVendorQuoteProviderSendVerificationState | null;
  proofRoundTrip?: WeddingVendorQuoteProofRoundTripState | null;
  receiptPersistence?: WeddingVendorQuoteReceiptPersistenceState | null;
  fullRegressionPassed?: boolean | null;
  typecheckPassed?: boolean | null;
  buildPassed?: boolean | null;
  weddingSuitePassed?: boolean | null;
  actualConnectedProviderSendVerified?: boolean | null;
  actualConnectedProviderProofRef?: string | null;
  actualConnectedProviderVerificationRecord?: unknown;
  actualConnectedProviderVerificationOutput?: string | null;
  expectedSender?: string | null;
  expectedRecipient?: string | null;
  expectedSubject?: string | null;
  expectedThreadId?: string | null;
} = {}): WeddingVendorQuoteReplyProductionReadinessState {
  const checks: Check[] = [
    check(
      input.uiReadiness?.productionReady,
      "Inline quote reply UI safeguards are mounted",
      input.uiReadiness
        ? `Inline quote reply UI is not ready: ${input.uiReadiness.status}.`
        : "Inline quote reply UI readiness has not been verified.",
      "Verify quote summary, state-derived decision CTAs, conditional Tiptap editor, wording approval, budget acknowledgement, undo, sent confirmation, sent-history log, proof drawer, live regions, and failure telemetry.",
    ),
    check(
      input.providerSendVerification?.verified,
      "Provider send contract and proof reconstruction are verified",
      providerVerificationBlocker(input.providerSendVerification),
      "Verify executed send_email receipts have durable provider ids, delivery flags, and matching proof drawer reconstruction.",
    ),
    proofCheck(input.proofRoundTrip),
    receiptPersistenceCheck(input.receiptPersistence),
    check(
      input.fullRegressionPassed,
      "Full inline flow regression passed",
      "Full inline flow regression has not passed.",
      "Run the edit-save-approve-budget-undo-send-proof regression path.",
    ),
    check(
      input.typecheckPassed,
      "Typecheck passed",
      "Typecheck has not passed.",
      "Run npm run typecheck.",
    ),
    check(
      input.buildPassed,
      "Production build passed",
      "Production build has not passed.",
      "Run npm run build.",
    ),
    check(
      input.weddingSuitePassed,
      "Wedding regression suite passed",
      "Wedding regression suite has not passed.",
      "Run npm run test:wedding.",
    ),
    liveProviderCheck(input),
  ];
  const evidenceLabels = cleanWeddingProductionLabels(checks.filter((item) => item.ready).map((item) => item.evidence));
  const blockerLabels = cleanWeddingProductionLabels(checks.filter((item) => !item.ready).map((item) => item.blocker));
  const nextActionLabels = cleanWeddingProductionLabels(checks.filter((item) => !item.ready).map((item) => item.nextAction));
  const productionReady = blockerLabels.length === 0;

  return {
    status: productionReady ? "ready" : evidenceLabels.length > 0 ? "partial" : "blocked",
    productionReady,
    summary: productionReady
      ? "Vendor quote inline reply v1 is production-ready with live provider proof."
      : "Vendor quote inline reply v1 still has release blockers.",
    detail: productionReady
      ? "The quote, inline reply, wording and budget approvals, undo-send, provider delivery, and proof drawer have all been verified."
      : "Keep the flow behind the hardening gate until the remaining verification items are complete.",
    evidenceLabels,
    blockerLabels,
    nextActionLabels,
    telemetryEvent: productionReady ? null : "wedding_vendor_quote_reply_production_readiness_blocked",
  };
}
