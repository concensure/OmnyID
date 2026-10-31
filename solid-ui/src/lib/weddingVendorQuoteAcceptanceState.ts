// @module-id: wedding.vendor-quote-acceptance-state
// @primary-capability: canonical-wedding-quote-acceptance
// @locs-version: 1.0
import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import { weddingDecisionProjectionToAfpSendInput } from "@/lib/weddingDecisionAfpProjectionState";
import { normalizeWeddingPlanningMetadata, safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

export function weddingVendorQuoteAcceptanceToAfpSendInput(input: {
  metadata: unknown;
  quote: WeddingArtifactQuotePreview;
  sourceId: string;
}): SendAfpMessageInput {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const sourceId = input.sourceId.trim() || `quote:${safeWeddingLabel(input.quote.vendorName)}`;
  const cells = [
    `Vendor: ${input.quote.vendorName}`,
    `Accepted quote: ${input.quote.amountLabel}`,
    input.quote.validUntil ? `Valid until: ${input.quote.validUntil}` : "Valid until: Not stated",
    input.quote.packageLabel ? `Package: ${input.quote.packageLabel}` : "",
  ].filter(Boolean);
  return weddingDecisionProjectionToAfpSendInput({
    id: `wedding_quote_acceptance:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(sourceId)}`,
    metadata: {
      ...metadata,
      supertags: [...metadata.supertags, "wedding_vendor_quote_accepted"],
    },
    artifactId: sourceId,
    artifactTitle: `Accepted quote from ${input.quote.vendorName}`,
    artifactKind: "vendor_quote",
    sourceLabels: ["Vendor quote", "Normalized quote"],
    selectedOption: {
      id: `accepted:${safeWeddingLabel(input.quote.vendorName)}`,
      rowIndex: 0,
      label: input.quote.vendorName,
      detail: `Accepted quote: ${input.quote.amountLabel}`,
      cells,
      columnCells: [
        { header: "Vendor", label: "Vendor", kind: "vendor", value: input.quote.vendorName },
        { header: "Quote", label: "Quote", kind: "money", value: input.quote.amountLabel },
        { header: "Valid until", label: "Valid until", kind: "date", value: input.quote.validUntil ?? "Not stated" },
      ],
      selected: true,
      preferenceFitLabels: [],
      missingPreferenceLabels: [],
      tradeoffLabels: [],
      preferenceSummaryLabel: "The couple accepted this vendor quote after review.",
    },
    source: "user",
  });
}
