// @module-id: wedding.vendor-lifecycle-detail-state
// @primary-capability: evidence-backed-vendor-message-quote-booking-projection
// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingVendorLifecycleRecord } from "@/lib/weddingVendorLifecycleState";

export type WeddingVendorLifecycleMessageRow = {
  id: string;
  state: "draft" | "sent" | "received";
  stateLabel: "Draft" | "Sent" | "Received";
  subject: string | null;
  body: string;
  timestamp: string;
};

export type WeddingVendorLifecycleBookingSummary = {
  statusLabel: string;
  detailLabel: string;
};

const clean = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};

function messageTokens(message: AfpMessage): string {
  const content = record(message.content);
  const metadata = record(message.metadata);
  return [message.type, message.kind, message.subtype, content.kind, metadata.kind, ...(message.supertags ?? [])]
    .map(clean)
    .join(" ")
    .toLowerCase();
}

function messageBody(message: AfpMessage): string {
  const content = record(message.content);
  for (const value of [content.text, content.body, content.markdown, content.message, content.snippet, content.preview]) {
    const body = clean(value);
    if (body) return body;
  }
  return "";
}

function messageState(message: AfpMessage): WeddingVendorLifecycleMessageRow["state"] | null {
  const tokens = messageTokens(message);
  if (!/vendor|enquiry|outreach|message|email|reply|response/.test(tokens)) return null;
  if (/draft/.test(tokens)) return "draft";
  if (/received|inbound|vendor_reply|quote_received/.test(tokens)) return "received";
  if (/sent|delivery|approval_receipt/.test(tokens)) return "sent";
  return null;
}

/** Keep lifecycle bookkeeping out of the visible conversation body. */
export function weddingVendorLifecycleMessageRows(messages: readonly AfpMessage[]): WeddingVendorLifecycleMessageRow[] {
  return messages.flatMap((message): WeddingVendorLifecycleMessageRow[] => {
    const state = messageState(message);
    const body = messageBody(message);
    if (!state || !body) return [];
    const content = record(message.content);
    return [{
      id: message.id,
      state,
      stateLabel: state === "draft" ? "Draft" : state === "received" ? "Received" : "Sent",
      subject: clean(content.subject) || null,
      body,
      timestamp: message.timestamp,
    }];
  }).sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

export function weddingVendorQuoteArtifacts(
  artifacts: readonly WeddingWorkspaceArtifactPreview[],
): WeddingWorkspaceArtifactPreview[] {
  return artifacts
    .filter((artifact) => artifact.preview?.kind === "quote")
    .sort((left, right) => right.createdAt - left.createdAt);
}

export function weddingVendorTermsArtifacts(
  artifacts: readonly WeddingWorkspaceArtifactPreview[],
): WeddingWorkspaceArtifactPreview[] {
  const explicit = artifacts.filter((artifact) => /contract|booking|terms|conditions/i.test(
    `${artifact.title} ${artifact.category} ${artifact.bodyText ?? ""}`,
  ));
  return (explicit.length > 0 ? explicit : weddingVendorQuoteArtifacts(artifacts)).slice(0, 3);
}

export function weddingVendorLifecycleBookingSummary(
  vendor: WeddingVendorLifecycleRecord,
): WeddingVendorLifecycleBookingSummary {
  if (vendor.booked) return {
    statusLabel: "Booking confirmed",
    detailLabel: "This booking is recorded in your Wedding ledger. Review the date, accepted quote and terms below.",
  };
  if (vendor.quoteAccepted) return {
    statusLabel: "Quote accepted — vendor confirmation pending",
    detailLabel: "Your acceptance is recorded, but the booking is not confirmed until the vendor accepts the date and terms.",
  };
  if (vendor.quoteReceived) return {
    statusLabel: "Quote received",
    detailLabel: "Review the normalized quote before accepting any booking terms.",
  };
  if (vendor.enquired) return {
    statusLabel: "Enquiry sent",
    detailLabel: "No booking or accepted quote is recorded yet.",
  };
  return {
    statusLabel: "Not started",
    detailLabel: "No enquiry, accepted quote or booking is recorded for this vendor.",
  };
}
