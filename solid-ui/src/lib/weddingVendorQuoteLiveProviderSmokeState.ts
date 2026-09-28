// @locs-version: 1.0
import {
  weddingVendorQuoteLiveProviderVerificationRecordFromOutput,
  weddingVendorQuoteLiveProviderVerificationRecordState,
} from "@/lib/weddingVendorQuoteReplyProductionReadinessState";
import {
  cleanWeddingProductionLabel,
  cleanWeddingProductionLabels,
} from "@/lib/weddingProductionLabelState";

export type WeddingVendorQuoteLiveProviderSmokeStatus =
  | "ready"
  | "missing_output"
  | "missing_expectations"
  | "invalid_output"
  | "record_blocked";

export type WeddingVendorQuoteLiveProviderSmokeState = {
  status: WeddingVendorQuoteLiveProviderSmokeStatus;
  ready: boolean;
  verificationRecord: Record<string, unknown> | null;
  providerMessageId: string | null;
  proofRef: string | null;
  senderLabel: string | null;
  recipientLabel: string | null;
  subjectLabel: string | null;
  threadLabel: string | null;
  verifiedAtLabel: string | null;
  evidenceLabels: string[];
  blockerLabels: string[];
  nextActionLabels: string[];
  telemetryEvent: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function boundedLabel(prefix: string, value: unknown, maxLength = 180): string | null {
  const cleaned = clean(value);
  return cleaned ? cleanWeddingProductionLabel(`${prefix}: ${cleaned}`, { maxLength, wordAware: true }) : null;
}

function recordLabel(record: Record<string, unknown> | null | undefined, key: string, prefix: string): string | null {
  return record ? boundedLabel(prefix, record[key]) : null;
}

function blockerForMissingExpectations(input: {
  expectedProviderReceiptId?: string | null;
  expectedSender?: string | null;
  expectedRecipient?: string | null;
  expectedSubject?: string | null;
  expectedThreadId?: string | null;
}): string[] {
  return [
    clean(input.expectedProviderReceiptId) ? null : "Expected provider receipt id is required before accepting live Gmail smoke proof.",
    clean(input.expectedSender) ? null : "Expected smoke-test sender is required before accepting live Gmail smoke proof.",
    clean(input.expectedRecipient) ? null : "Expected vendor recipient is required before accepting live Gmail smoke proof.",
    clean(input.expectedSubject) ? null : "Expected approved subject is required before accepting live Gmail smoke proof.",
    clean(input.expectedThreadId) ? null : "Expected vendor quote thread id is required before accepting live Gmail smoke proof.",
  ].filter((label): label is string => Boolean(label));
}

function finish(input: {
  status: WeddingVendorQuoteLiveProviderSmokeStatus;
  verificationRecord?: Record<string, unknown> | null;
  providerMessageId?: string | null;
  proofRef?: string | null;
  evidenceLabels?: string[];
  blockerLabels?: string[];
}): WeddingVendorQuoteLiveProviderSmokeState {
  const ready = input.status === "ready";
  const record = input.verificationRecord ?? null;
  return {
    status: input.status,
    ready,
    verificationRecord: record,
    providerMessageId: input.providerMessageId ?? null,
    proofRef: input.proofRef ?? null,
    senderLabel: recordLabel(record, "from", "Connected Gmail account"),
    recipientLabel: recordLabel(record, "to", "Verified recipient"),
    subjectLabel: recordLabel(record, "subject", "Verified subject"),
    threadLabel: recordLabel(record, "thread_id", "Verified vendor thread"),
    verifiedAtLabel: recordLabel(record, "verified_at", "Verified at"),
    evidenceLabels: cleanWeddingProductionLabels(input.evidenceLabels ?? [], { maxLength: 180, wordAware: true }),
    blockerLabels: cleanWeddingProductionLabels(input.blockerLabels ?? []),
    nextActionLabels: ready
      ? []
      : ["Run the connected Gmail smoke send, copy its verification_record_json output, and retry this release check."],
    telemetryEvent: ready ? null : `wedding_vendor_quote_live_provider_smoke_${input.status}`,
  };
}

export function buildWeddingVendorQuoteLiveProviderSmokeState(input: {
  output?: string | null;
  expectedProviderReceiptId?: string | null;
  expectedSender?: string | null;
  expectedRecipient?: string | null;
  expectedSubject?: string | null;
  expectedThreadId?: string | null;
} = {}): WeddingVendorQuoteLiveProviderSmokeState {
  if (!clean(input.output)) {
    return finish({
      status: "missing_output",
      blockerLabels: ["Live Gmail smoke verification output has not been attached."],
    });
  }

  const missingExpectations = blockerForMissingExpectations(input);
  if (missingExpectations.length > 0) {
    return finish({
      status: "missing_expectations",
      blockerLabels: missingExpectations,
    });
  }

  const parsed = weddingVendorQuoteLiveProviderVerificationRecordFromOutput(input.output);
  if (!parsed.record) {
    return finish({
      status: "invalid_output",
      blockerLabels: [parsed.blockerLabel ?? "Live Gmail smoke verification output is invalid."],
    });
  }

  const record = weddingVendorQuoteLiveProviderVerificationRecordState({
    record: parsed.record,
    expectedProviderReceiptId: input.expectedProviderReceiptId,
    expectedSender: input.expectedSender,
    expectedRecipient: input.expectedRecipient,
    expectedSubject: input.expectedSubject,
    expectedThreadId: input.expectedThreadId,
  });
  if (!record.verified) {
    return finish({
      status: "record_blocked",
      verificationRecord: parsed.record,
      providerMessageId: record.providerMessageId,
      proofRef: record.proofRef,
      blockerLabels: [record.blockerLabel ?? "Live Gmail smoke verification record is not acceptable release proof."],
    });
  }

  return finish({
    status: "ready",
    verificationRecord: parsed.record,
    providerMessageId: record.providerMessageId,
    proofRef: record.proofRef,
    evidenceLabels: [
      record.proofRef ? `Live Gmail smoke send verified: ${record.proofRef}` : null,
      record.providerMessageId ? `Provider message id matched: ${record.providerMessageId}` : null,
      recordLabel(parsed.record, "from", "Connected Gmail account"),
      recordLabel(parsed.record, "to", "Verified recipient"),
      recordLabel(parsed.record, "thread_id", "Verified vendor thread"),
    ].filter((label): label is string => Boolean(label)),
  });
}
