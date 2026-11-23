// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import {
  buildWeddingVendorQuoteThreadProofDrawerState,
  buildWeddingVendorQuoteThreadProofState,
  mergeWeddingVendorQuoteThreadProofMessages,
  type WeddingVendorQuoteThreadProofDrawerState,
  type WeddingVendorQuoteThreadProofMessageState,
} from "@/lib/weddingVendorQuoteThreadProofState";

export type WeddingVendorQuoteProofRoundTripStatus =
  | "loading"
  | "server_error_with_local_proof"
  | "server_error_missing_proof"
  | "complete"
  | "missing_thread_context"
  | "missing_sent_proof"
  | "empty";

export type WeddingVendorQuoteProofRoundTripState = {
  status: WeddingVendorQuoteProofRoundTripStatus;
  messages: WeddingVendorQuoteThreadProofMessageState[];
  drawer: WeddingVendorQuoteThreadProofDrawerState;
  hasQuote: boolean;
  hasDraft: boolean;
  hasDurableSentProof: boolean;
  telemetryEvent: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function statusFor(input: {
  loading?: boolean | null;
  error?: string | null;
  messages: readonly WeddingVendorQuoteThreadProofMessageState[];
  drawer: WeddingVendorQuoteThreadProofDrawerState;
}): WeddingVendorQuoteProofRoundTripStatus {
  if (input.loading) return "loading";
  const hasError = Boolean(clean(input.error));
  const hasDurableSentProof = input.drawer.sentProofCount > 0;
  const hasQuote = input.messages.some((message) => message.proofKind === "quote");
  const hasDraft = input.messages.some((message) => message.proofKind === "draft");
  if (hasError) return hasDurableSentProof ? "server_error_with_local_proof" : "server_error_missing_proof";
  if (hasDurableSentProof) return hasQuote && hasDraft ? "complete" : "missing_thread_context";
  if (input.messages.length > 0) return "missing_sent_proof";
  return "empty";
}

function telemetryEventFor(status: WeddingVendorQuoteProofRoundTripStatus): string | null {
  if (status === "server_error_with_local_proof") return "wedding_vendor_quote_proof_thread_reload_failed_local_proof_available";
  if (status === "server_error_missing_proof") return "wedding_vendor_quote_proof_thread_reload_failed_missing_proof";
  if (status === "missing_thread_context") return "wedding_vendor_quote_proof_thread_missing_context";
  if (status === "missing_sent_proof") return "wedding_vendor_quote_proof_thread_missing_sent_proof";
  if (status === "empty") return "wedding_vendor_quote_proof_thread_empty";
  return null;
}

export function buildWeddingVendorQuoteProofRoundTripState(input: {
  vendorName?: string | null;
  serverMessages: readonly AfpMessage[];
  localMessages?: readonly AfpMessage[] | null;
  loading?: boolean | null;
  error?: string | null;
}): WeddingVendorQuoteProofRoundTripState {
  const messages = buildWeddingVendorQuoteThreadProofState(
    mergeWeddingVendorQuoteThreadProofMessages(input.serverMessages, input.localMessages ?? []),
  );
  const drawer = buildWeddingVendorQuoteThreadProofDrawerState({
    vendorName: input.vendorName,
    messages,
    loading: input.loading,
    error: input.error,
  });
  const status = statusFor({
    loading: input.loading,
    error: input.error,
    messages,
    drawer,
  });
  return {
    status,
    messages,
    drawer,
    hasQuote: messages.some((message) => message.proofKind === "quote"),
    hasDraft: messages.some((message) => message.proofKind === "draft"),
    hasDurableSentProof: drawer.sentProofCount > 0,
    telemetryEvent: telemetryEventFor(status),
  };
}
