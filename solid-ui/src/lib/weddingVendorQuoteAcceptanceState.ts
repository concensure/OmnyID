// @module-id: wedding.vendor-quote-acceptance-state
// @primary-capability: canonical-wedding-quote-acceptance
// @locs-version: 1.0
import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import { weddingDecisionProjectionToAfpSendInput } from "@/lib/weddingDecisionAfpProjectionState";
import { normalizeWeddingPlanningMetadata, safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};

export type WeddingVenueAcceptanceSuccessorTask = {
  id: string;
  title: string;
  kind: "contract_review" | "research";
  dependencyReleasedBy: string;
  status: "pending";
};

export function weddingVenueAcceptanceSuccessorTasks(input: {
  responseWorkspaceId: string;
  sourceId: string;
  vendorName: string;
}): WeddingVenueAcceptanceSuccessorTask[] {
  const acceptanceId = `wedding_quote_acceptance:${safeWeddingLabel(input.responseWorkspaceId)}:${safeWeddingLabel(input.sourceId)}`;
  const task = (suffix: string, title: string, kind: WeddingVenueAcceptanceSuccessorTask["kind"]): WeddingVenueAcceptanceSuccessorTask => ({
    id: `wedding_task:venue-choice:${safeWeddingLabel(input.responseWorkspaceId)}:${suffix}`,
    title,
    kind,
    dependencyReleasedBy: acceptanceId,
    status: "pending",
  });
  return [
    task("contract", `Review ${input.vendorName}'s contract, deposit and cancellation terms`, "contract_review"),
    task("caterer", "Research and shortlist caterers for the chosen venue", "research"),
    task("photographer", "Research and shortlist photographers for the chosen venue", "research"),
  ];
}

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
  const acceptanceId = `wedding_quote_acceptance:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(sourceId)}`;
  const venueQuote = /^venues?$/i.test(input.quote.vendorCategory ?? "");
  const successorTasks = venueQuote ? weddingVenueAcceptanceSuccessorTasks({
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceId,
    vendorName: input.quote.vendorName,
  }) : [];
  const projection = weddingDecisionProjectionToAfpSendInput({
    id: acceptanceId,
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
  projection.content = {
    ...record(projection.content),
    venue_choice_status: "chosen",
    quote_valid_until: input.quote.validUntil ?? null,
    date_hold_expires_at: input.quote.dateHoldExpiresAt ?? null,
    successor_tasks: successorTasks.map((task) => ({
      id: task.id,
      title: task.title,
      kind: task.kind,
      dependency_released_by: task.dependencyReleasedBy,
      status: task.status,
    })),
    successor_task_creation_policy: successorTasks.length > 0 ? "materialize_once_by_stable_task_id" : null,
    external_commitment_made: false,
  };
  projection.metadata = {
    ...record(projection.metadata),
    venue_choice_status: "chosen",
    vendor_date_hold_expires_at: input.quote.dateHoldExpiresAt ?? null,
    quote_valid_until: input.quote.validUntil ?? null,
    successor_task_ids: successorTasks.map((task) => task.id),
    dependency_releases: successorTasks.length > 0 ? ["caterer", "photographer"] : [],
    successor_task_creation_policy: successorTasks.length > 0 ? "materialize_once_by_stable_task_id" : null,
  };
  return projection;
}
