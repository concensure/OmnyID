// @locs-version: 1.0
import type { WeddingVendorAvailabilityState } from "@/lib/weddingVendorRankingState";
import type { WeddingVendorOutreachFlowState } from "@/lib/weddingVendorOutreachFlowState";
import type { WEDDING_VENDOR_SELECTION_ACTIONS } from "@/lib/weddingVendorDecisionPatternState";

export type WeddingVendorChoiceIntent = typeof WEDDING_VENDOR_SELECTION_ACTIONS[number];
export type WeddingVendorChoiceActionState = { intent: WeddingVendorChoiceIntent; label: string; startsOutreach: boolean };

export function weddingVendorChoiceActionState(input: {
  availabilityState: WeddingVendorAvailabilityState;
  outreachStage?: WeddingVendorOutreachFlowState["stage"] | null;
  quoteExists?: boolean | null;
  bookingContractExists?: boolean | null;
}): WeddingVendorChoiceActionState {
  if (input.bookingContractExists) return { intent: "START_PURCHASE_OR_BOOKING", label: "Review booking terms", startsOutreach: false };
  if (input.quoteExists) return { intent: "REVIEW_QUOTE", label: "Compare quote", startsOutreach: false };
  if (input.outreachStage === "sent" || input.availabilityState === "enquiry_sent" || input.availabilityState === "awaiting_response") {
    return { intent: "VIEW_EVIDENCE", label: "View conversation", startsOutreach: false };
  }
  if (input.outreachStage === "draft_ready" || input.outreachStage === "send_failed") {
    return { intent: "REQUEST_QUOTE", label: "Review enquiry", startsOutreach: true };
  }
  if (["confirmed_unavailable", "booked"].includes(input.availabilityState)) {
    return { intent: "VIEW_EVIDENCE", label: "View evidence", startsOutreach: false };
  }
  return { intent: "CHECK_AVAILABILITY_AND_REQUEST_QUOTE", label: "Prepare enquiry", startsOutreach: true };
}
