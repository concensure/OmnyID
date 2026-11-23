// @locs-version: 1.0
import type { WeddingProjectionQueueViewState } from "@/lib/weddingProjectionQueueViewState";

export type WeddingSelectedVendorFollowUpCtaState = {
  noticeLabel: string;
  target: "projection_queue" | "saved_or_empty";
  targetSectionId: "approval" | null;
  shouldScrollToTarget: boolean;
};

export function buildWeddingSelectedVendorFollowUpCtaState(
  queue: WeddingProjectionQueueViewState | null | undefined,
): WeddingSelectedVendorFollowUpCtaState {
  const decisionCount = queue?.vendorDecisionPolicyCards.length ?? 0;
  const draftCount = queue?.vendorOutreachDraftCards.length ?? 0;
  if (decisionCount > 0 && draftCount > 0) {
    return {
      noticeLabel: `Selected vendor decision${decisionCount === 1 ? "" : "s"} and follow-up draft task${draftCount === 1 ? "" : "s"} ready to save. Use the approval card to keep selected vendors active, move unselected vendors to the log, and save outreach drafts without sending anything externally.`,
      target: "projection_queue",
      targetSectionId: "approval",
      shouldScrollToTarget: true,
    };
  }

  if (decisionCount > 0) {
    return {
      noticeLabel: `Selected vendor decision${decisionCount === 1 ? "" : "s"} ready to save. Use the approval card to keep selected vendors active and move unselected vendors to the log.`,
      target: "projection_queue",
      targetSectionId: "approval",
      shouldScrollToTarget: true,
    };
  }

  if (draftCount > 0) {
    return {
      noticeLabel: `Vendor follow-up draft${draftCount === 1 ? "" : "s"} ready to save. Use the approval card to keep draft tasks without sending anything externally.`,
      target: "projection_queue",
      targetSectionId: "approval",
      shouldScrollToTarget: true,
    };
  }

  const pendingCount = queue?.queue.pendingItems.length ?? 0;
  if (pendingCount > 0) {
    return {
      noticeLabel: `${pendingCount} wedding planning item${pendingCount === 1 ? "" : "s"} ready to save. Review the approval card before leaving this flow.`,
      target: "projection_queue",
      targetSectionId: "approval",
      shouldScrollToTarget: true,
    };
  }

  return {
    noticeLabel: "No selected-vendor follow-up is waiting to save right now. Choose one or more vendors first, or refresh after saving.",
    target: "saved_or_empty",
    targetSectionId: null,
    shouldScrollToTarget: false,
  };
}
