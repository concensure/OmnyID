// @locs-version: 1.0
import type { FocusDeckItem } from "@/lib/mobileFocusHomeState";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingVendorOutreachFlowState } from "@/lib/weddingVendorOutreachFlowState";

export function buildWeddingVendorDeckProjectionState(input: {
  artifactPreviews: readonly WeddingWorkspaceArtifactPreview[];
  outreachFlows?: readonly WeddingVendorOutreachFlowState[] | null;
  blockedReason?: string | null;
}): FocusDeckItem[] {
  const result: FocusDeckItem[] = [];
  const comparison = input.artifactPreviews.find((preview) => preview.vendorComparisonCards.length === 3);
  const activeOutreach = (input.outreachFlows ?? []).filter((flow) => flow.stage !== "idle");
  if (comparison && activeOutreach.length === 0) {
    result.push({
      id: `vendor-comparison:${comparison.artifactId}`,
      kind: "vendor_comparison",
      sourceSurface: "wedding_vendor_comparison",
      title: comparison.title,
      recommendedActionLabel: comparison.vendorComparisonHandoff?.recommendationLabel ?? "Compare three vendors",
      whyNowLabel: comparison.vendorComparisonHandoff?.nextActionLabel ?? "Review the ranked shortlist and choose the next safe action.",
      dueAt: null,
      evidenceLabels: comparison.vendorComparisonHandoff?.whyLabels ?? [],
      deferCount: 0,
      returnedFromLater: false,
      external: false,
      vendorComparison: { artifactId: comparison.artifactId, cards: comparison.vendorComparisonCards },
    });
  }
  for (const flow of activeOutreach) {
    const sent = flow.stage === "sent";
    result.push({
      id: `vendor-${sent ? "receipt" : "draft"}:${flow.choiceId}`,
      kind: sent ? "vendor_receipt" : "vendor_draft",
      sourceSurface: "wedding_vendor_outreach",
      title: sent ? `Enquiry sent to ${flow.vendorName}` : `Draft for ${flow.vendorName}`,
      recommendedActionLabel: sent ? "Done" : `Send to ${flow.vendorName}`,
      whyNowLabel: sent
        ? `Provider receipt ${flow.receiptRef ?? "saved"}; follow up in five days.`
        : flow.blockedReason ?? "Review the persisted draft. Nothing is sent until you press Send.",
      dueAt: null,
      evidenceLabels: flow.groundedOnLabels,
      deferCount: 0,
      returnedFromLater: false,
      external: !sent,
      vendorOutreachFlow: flow,
    });
  }
  if (input.blockedReason && result.length === 0) {
    result.push({
      id: "vendor-blocked",
      kind: "vendor_blocked",
      sourceSurface: "wedding_vendor_search",
      title: "Vendor shortlist needs one detail",
      recommendedActionLabel: "Complete planning basics",
      whyNowLabel: input.blockedReason,
      dueAt: null,
      evidenceLabels: [],
      deferCount: 0,
      returnedFromLater: false,
      external: false,
    });
  }
  return result;
}
