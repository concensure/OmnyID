import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "@/lib/api";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";
import {
  weddingVendorLifecycleBookingSummary,
  weddingVendorLifecycleMessageRows,
  weddingVendorQuoteArtifacts,
  weddingVendorTermsArtifacts,
} from "@/lib/weddingVendorLifecycleDetailState";

const message = (input: Partial<AfpMessage> & Pick<AfpMessage, "id" | "timestamp">): AfpMessage => ({
  id: input.id,
  thread_id: "thread:vendor",
  from: "couple",
  timestamp: input.timestamp,
  type: input.type ?? "wedding",
  kind: input.kind,
  subtype: input.subtype,
  content: input.content ?? {},
  views: [],
  attachments: [],
});

test("message detail keeps sent history and clearly labels the newest unsent draft", () => {
  const rows = weddingVendorLifecycleMessageRows([
    message({ id: "sent", timestamp: "2026-11-01T01:00:00Z", kind: "wedding_vendor_outreach_sent", content: { subject: "Venue enquiry", text: "Could you confirm availability?" } }),
    message({ id: "draft", timestamp: "2026-11-02T01:00:00Z", kind: "wedding_vendor_outreach_draft", content: { subject: "Follow-up", text: "Just checking in." } }),
    message({ id: "favourite", timestamp: "2026-11-03T01:00:00Z", kind: "wedding_vendor_contact_reference", content: { selected_for_follow_up: true } }),
  ]);
  assert.deepEqual(rows.map((row) => [row.id, row.stateLabel]), [["sent", "Sent"], ["draft", "Draft"]]);
  assert.equal(rows[1]?.body, "Just checking in.");
});

const artifact = (id: string, title: string, preview: WeddingWorkspaceArtifactPreview["preview"], bodyText = ""): WeddingWorkspaceArtifactPreview => ({
  artifactId: id, title, kind: "quote", category: "vendor", createdAt: id === "new" ? 2 : 1,
  approvalState: "draft", metadataLabels: [], sourceLabels: [], sourceLinks: [], vendorComparisonHandoff: null,
  vendorComparisonCards: [], persistedSelectedVendorChoices: [], a2uiContent: null,
  evidenceSummary: { statusLabel: "", sourceCountLabel: "", warningLabel: null, labels: [] }, bodyText, preview,
  exportManifest: { filename: "", format: "markdown", mediaType: "text/markdown", content: "" },
  approvalRequest: null, integrationReadiness: { statusLabel: "", blockerLabels: [], readyLabels: [] }, emptyBodyLabel: "No text",
} as unknown as WeddingWorkspaceArtifactPreview);

test("quote and booking projections retain source documents and explicit terms", () => {
  const quote = artifact("new", "Harbour quote", { kind: "quote", vendorName: "Harbour Room", amount: 12000, amountLabel: "$12,000", currency: "AUD", budgetDeltaAmount: null, budgetDeltaLabel: null, inclusions: [], validUntil: null, attachmentUrl: "/quote.pdf" });
  const terms = artifact("terms", "Harbour booking terms", { kind: "document", summaryLines: [] }, "Cancellation terms");
  const notes = artifact("notes", "Vendor search notes", { kind: "document", summaryLines: [] }, "# Vendor search notes\n\n| Vendor | Match |\n| --- | --- |\n| Harbour | Strong |\n");
  const duplicateTerms = { ...terms };
  assert.deepEqual(weddingVendorQuoteArtifacts([terms, quote]).map((item) => item.artifactId), ["new"]);
  assert.deepEqual(weddingVendorTermsArtifacts([quote, notes, terms, duplicateTerms]).map((item) => item.artifactId), ["terms"]);
  assert.equal(weddingVendorLifecycleBookingSummary({
    key: "harbour", vendorId: null, vendorName: "Harbour Room", enquired: true, favourited: true,
    quoteReceived: true, quoteAccepted: true, booked: false, reminderAt: null, followUpDismissed: false,
    followUpDismissedAt: null, sourceMessageIds: [],
  }).statusLabel, "Quote accepted — vendor confirmation pending");
});
