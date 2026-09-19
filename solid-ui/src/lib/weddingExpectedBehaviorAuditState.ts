// @locs-version: 2.0
import type { WeddingCelebrantCoordinationReadinessState } from "@/lib/weddingCelebrantCoordinationReadinessState";
import type { WeddingControlledOutreachReadinessState } from "@/lib/weddingControlledOutreachReadinessState";
import type { WeddingDayOfEmergencyReadinessState } from "@/lib/weddingDayOfEmergencyReadinessState";
import type { WeddingDietaryAccessibilityBriefReadinessState } from "@/lib/weddingDietaryAccessibilityBriefReadinessState";
import type { WeddingFinalConfirmationsReadinessState } from "@/lib/weddingFinalConfirmationsReadinessState";
import type { WeddingFollowUpAutomationReadinessState } from "@/lib/weddingFollowUpAutomationReadinessState";
import type { WeddingGuestFinalCountReadinessState } from "@/lib/weddingGuestFinalCountReadinessState";
import type { WeddingGuestMessagingReadinessState } from "@/lib/weddingGuestMessagingReadinessState";
import type { WeddingLiveRunSheetExecutionReadinessState } from "@/lib/weddingLiveRunSheetExecutionReadinessState";
import type { WeddingPaymentVerificationReadinessState } from "@/lib/weddingPaymentVerificationReadinessState";
import type { WeddingRsvpCollectionReadinessState } from "@/lib/weddingRsvpCollectionReadinessState";
import type { WeddingRunSheetAdjustmentReadinessState } from "@/lib/weddingRunSheetAdjustmentReadinessState";
import type { WeddingSeatingChartReadinessState } from "@/lib/weddingSeatingChartReadinessState";
import type { WeddingVendorScopedSharingReadinessState } from "@/lib/weddingVendorScopedSharingReadinessState";
import type { WeddingWeatherProviderReadinessState } from "@/lib/weddingWeatherProviderReadinessState";

export type WeddingExpectedBehaviorStatus =
  | "in_place"
  | "partial"
  | "provider_blocked"
  | "ui_blocked";

export type WeddingExpectedBehaviorCapability =
  | "decision_surfaces"
  | "need_to_know_probing"
  | "vendor_matching"
  | "controlled_outreach"
  | "follow_up_automation"
  | "legal_deadline_tracking"
  | "celebrant_coordination"
  | "document_checklist"
  | "run_sheet_generation"
  | "run_sheet_adjustments"
  | "vendor_scoped_sharing"
  | "weather_contingency"
  | "final_confirmations_payments"
  | "guest_final_count"
  | "emergency_kit_day_of_prep"
  | "rsvp_collection"
  | "seating_chart"
  | "dietary_accessibility_coordination"
  | "day_of_realtime_run_sheet_updates"
  | "day_of_emergency_handling"
  | "day_of_guest_coordination"
  | "day_of_payment_verification"
  | "post_wedding_thank_you_notes"
  | "post_wedding_feedback_collection"
  | "post_wedding_keepsake_export";

export type WeddingExpectedBehaviorAuditItem = {
  capability: WeddingExpectedBehaviorCapability;
  title: string;
  status: WeddingExpectedBehaviorStatus;
  userFacingLabel: string;
  evidenceLabels: string[];
  blockerLabels: string[];
};

export type WeddingExpectedBehaviorAuditInput = {
  hasPlanningContext?: boolean | null;
  hasDecisionProjection?: boolean | null;
  hasNeedToKnowProbing?: boolean | null;
  hasVendorChecklist?: boolean | null;
  hasVendorSearchPlanning?: boolean | null;
  vendorSearchProviderReady?: boolean | null;
  approvalUiReady?: boolean | null;
  providerExecutorsReady?: boolean | null;
  controlledOutreachReadiness?: WeddingControlledOutreachReadinessState | null;
  followUpAutomationReadiness?: WeddingFollowUpAutomationReadinessState | null;
  hasLegalAdministration?: boolean | null;
  hasAustralianLegalSetup?: boolean | null;
  celebrantCoordinationReadiness?: WeddingCelebrantCoordinationReadinessState | null;
  hasFinalPhaseCoordination?: boolean | null;
  finalConfirmationsReadiness?: WeddingFinalConfirmationsReadinessState | null;
  guestFinalCountReadiness?: WeddingGuestFinalCountReadinessState | null;
  runSheetAdjustmentReadiness?: WeddingRunSheetAdjustmentReadinessState | null;
  vendorScopedSharingReadiness?: WeddingVendorScopedSharingReadinessState | null;
  hasLifecycleManagement?: boolean | null;
  weatherProviderReady?: boolean | null;
  weatherProviderReadiness?: WeddingWeatherProviderReadinessState | null;
  rsvpProviderReady?: boolean | null;
  rsvpCollectionReadiness?: WeddingRsvpCollectionReadinessState | null;
  seatingCanvasReady?: boolean | null;
  seatingChartReadiness?: WeddingSeatingChartReadinessState | null;
  dietaryAccessibilityBriefReadiness?: WeddingDietaryAccessibilityBriefReadinessState | null;
  liveRunSheetExecutionReady?: boolean | null;
  liveRunSheetExecutionReadiness?: WeddingLiveRunSheetExecutionReadinessState | null;
  dayOfEmergencyReadiness?: WeddingDayOfEmergencyReadinessState | null;
  guestMessagingProviderReady?: boolean | null;
  guestMessagingReadiness?: WeddingGuestMessagingReadinessState | null;
  paymentVerificationProviderReady?: boolean | null;
  paymentVerificationReadiness?: WeddingPaymentVerificationReadinessState | null;
  hasPostWeddingWrapUp?: boolean | null;
  hasPostWeddingFeedbackCollection?: boolean | null;
  hasPostWeddingKeepsakeExport?: boolean | null;
};

export type WeddingExpectedBehaviorAuditState = {
  items: WeddingExpectedBehaviorAuditItem[];
  readyCount: number;
  blockedCount: number;
  summaryLabels: string[];
  productionBlockerLabels: string[];
};

function ready(value: unknown): boolean {
  return value === true;
}

function item(
  capability: WeddingExpectedBehaviorCapability,
  title: string,
  status: WeddingExpectedBehaviorStatus,
  evidenceLabels: string[],
  blockerLabels: string[] = [],
): WeddingExpectedBehaviorAuditItem {
  const prefix = status === "in_place"
    ? "Ready"
    : status === "partial"
      ? "Partial"
      : status === "ui_blocked"
        ? "UI needed"
        : "Provider needed";
  return {
    capability,
    title,
    status,
    userFacingLabel: `${prefix}: ${title}`,
    evidenceLabels,
    blockerLabels,
  };
}

export function buildWeddingExpectedBehaviorAuditState(
  input: WeddingExpectedBehaviorAuditInput = {},
): WeddingExpectedBehaviorAuditState {
  const hasPlanningContext = ready(input.hasPlanningContext);
  const hasDecisionProjection = ready(input.hasDecisionProjection);
  const hasNeedToKnowProbing = ready(input.hasNeedToKnowProbing);
  const hasVendorChecklist = ready(input.hasVendorChecklist);
  const hasVendorSearchPlanning = ready(input.hasVendorSearchPlanning);
  const providerExecutorsReady = ready(input.providerExecutorsReady);
  const approvalUiReady = ready(input.approvalUiReady);
  const hasLegalAdministration = ready(input.hasLegalAdministration);
  const hasAustralianLegalSetup = ready(input.hasAustralianLegalSetup);
  const hasFinalPhaseCoordination = ready(input.hasFinalPhaseCoordination);
  const hasLifecycleManagement = ready(input.hasLifecycleManagement);
  const hasPostWeddingWrapUp = ready(input.hasPostWeddingWrapUp);
  const hasPostWeddingFeedbackCollection = ready(input.hasPostWeddingFeedbackCollection);
  const hasPostWeddingKeepsakeExport = ready(input.hasPostWeddingKeepsakeExport);
  const controlledOutreachReady = input.controlledOutreachReadiness
    ? input.controlledOutreachReadiness.productionEvidenceReady
    : approvalUiReady && providerExecutorsReady;
  const controlledOutreachEvidenceLabels = input.controlledOutreachReadiness?.evidenceLabels ?? [];
  const controlledOutreachBlockerLabels = input.controlledOutreachReadiness?.blockerLabels ?? [
    "Needs production approval UI plus email/contact provider executor proof.",
  ];
  const followUpAutomationReady = input.followUpAutomationReadiness
    ? input.followUpAutomationReadiness.productionEvidenceReady
    : providerExecutorsReady;
  const followUpAutomationEvidenceLabels = input.followUpAutomationReadiness?.evidenceLabels ?? [];
  const followUpAutomationBlockerLabels = input.followUpAutomationReadiness?.blockerLabels ?? [
    "Needs connected email/contact executors before automated follow-ups can be sent.",
  ];
  const celebrantCoordinationReady = input.celebrantCoordinationReadiness
    ? input.celebrantCoordinationReadiness.productionEvidenceReady
    : providerExecutorsReady;
  const celebrantCoordinationEvidenceLabels = input.celebrantCoordinationReadiness?.evidenceLabels ?? [];
  const celebrantCoordinationBlockerLabels = input.celebrantCoordinationReadiness?.blockerLabels ?? [
    "Needs live source/search provider before returning celebrants as verified options.",
  ];
  const weatherProviderReady = input.weatherProviderReadiness
    ? input.weatherProviderReadiness.productionEvidenceReady
    : ready(input.weatherProviderReady);
  const weatherEvidenceLabels = input.weatherProviderReadiness?.evidenceLabels ?? [];
  const weatherBlockerLabels = input.weatherProviderReadiness?.blockerLabels ?? [
    "Needs BOM/weather provider evidence before calling forecasts verified or triggering backup changes.",
  ];
  const liveRunSheetExecutionReady = input.liveRunSheetExecutionReadiness
    ? input.liveRunSheetExecutionReadiness.productionEvidenceReady
    : ready(input.liveRunSheetExecutionReady);
  const liveRunSheetEvidenceLabels = input.liveRunSheetExecutionReadiness?.evidenceLabels ?? [];
  const liveRunSheetBlockerLabels = input.liveRunSheetExecutionReadiness?.blockerLabels ?? [
    "Needs live vendor delay intake, dependency recalculation, approval UI, and notification executor proof before real-time updates are claimed.",
  ];
  const guestMessagingReady = input.guestMessagingReadiness
    ? input.guestMessagingReadiness.productionEvidenceReady
    : ready(input.guestMessagingProviderReady);
  const guestMessagingEvidenceLabels = input.guestMessagingReadiness?.evidenceLabels ?? [];
  const guestMessagingBlockerLabels = input.guestMessagingReadiness?.blockerLabels ?? [
    "Needs E2EE/scoped guest messaging provider proof and approval before sending transport or lost-item updates.",
  ];
  const paymentVerificationReady = input.paymentVerificationReadiness
    ? input.paymentVerificationReadiness.productionEvidenceReady
    : ready(input.paymentVerificationProviderReady);
  const paymentVerificationEvidenceLabels = input.paymentVerificationReadiness?.evidenceLabels ?? [];
  const paymentVerificationBlockerLabels = input.paymentVerificationReadiness?.blockerLabels ?? [
    "Needs payment provider or trusted receipt evidence before marking final payments confirmed.",
  ];
  const finalConfirmationsReady = input.finalConfirmationsReadiness
    ? input.finalConfirmationsReadiness.productionEvidenceReady
    : approvalUiReady && providerExecutorsReady;
  const finalConfirmationsEvidenceLabels = input.finalConfirmationsReadiness?.evidenceLabels ?? [];
  const finalConfirmationsBlockerLabels = input.finalConfirmationsReadiness?.blockerLabels ?? [
    "Needs final-phase tasks, approval UI, and email/contact executor proof before auto-reminding vendors or confirming payments.",
  ];
  const guestFinalCountReady = input.guestFinalCountReadiness
    ? input.guestFinalCountReadiness.productionEvidenceReady
    : approvalUiReady;
  const guestFinalCountEvidenceLabels = input.guestFinalCountReadiness?.evidenceLabels ?? [];
  const guestFinalCountBlockerLabels = input.guestFinalCountReadiness?.blockerLabels ?? [
    "Needs final-phase coordination plus approval UI before submitting final counts or treating count decisions as closed.",
  ];
  const runSheetAdjustmentReady = input.runSheetAdjustmentReadiness
    ? input.runSheetAdjustmentReadiness.productionEvidenceReady
    : approvalUiReady;
  const runSheetAdjustmentEvidenceLabels = input.runSheetAdjustmentReadiness?.evidenceLabels ?? [];
  const runSheetAdjustmentBlockerLabels = input.runSheetAdjustmentReadiness?.blockerLabels ?? [
    "Needs approval UI evidence and a focused drag/adjust surface for production execution.",
  ];
  const vendorScopedSharingReady = input.vendorScopedSharingReadiness
    ? input.vendorScopedSharingReadiness.productionEvidenceReady
    : providerExecutorsReady;
  const vendorScopedSharingEvidenceLabels = input.vendorScopedSharingReadiness?.evidenceLabels ?? [];
  const vendorScopedSharingBlockerLabels = input.vendorScopedSharingReadiness?.blockerLabels ?? [
    "Needs provider executors and access-control proof before external sharing.",
  ];
  const rsvpCollectionReady = input.rsvpCollectionReadiness
    ? input.rsvpCollectionReadiness.productionEvidenceReady
    : ready(input.rsvpProviderReady);
  const rsvpCollectionEvidenceLabels = input.rsvpCollectionReadiness?.evidenceLabels ?? [];
  const rsvpCollectionBlockerLabels = input.rsvpCollectionReadiness?.blockerLabels ?? [
    "Needs secure RSVP link/provider implementation before collecting guest responses.",
  ];
  const seatingChartReady = input.seatingChartReadiness
    ? input.seatingChartReadiness.productionEvidenceReady
    : ready(input.seatingCanvasReady);
  const seatingChartEvidenceLabels = input.seatingChartReadiness?.evidenceLabels ?? [];
  const seatingChartBlockerLabels = input.seatingChartReadiness?.blockerLabels ?? [
    "Needs focused seating canvas before drag-to-adjust can be claimed.",
  ];
  const dietaryAccessibilityBriefReady = input.dietaryAccessibilityBriefReadiness
    ? input.dietaryAccessibilityBriefReadiness.productionEvidenceReady
    : providerExecutorsReady;
  const dietaryAccessibilityEvidenceLabels = input.dietaryAccessibilityBriefReadiness?.evidenceLabels ?? [];
  const dietaryAccessibilityBlockerLabels = input.dietaryAccessibilityBriefReadiness?.blockerLabels ?? [
    "Needs provider executors and approved guest data before sending vendor briefs.",
  ];
  const dayOfEmergencyReady = input.dayOfEmergencyReadiness
    ? input.dayOfEmergencyReadiness.productionEvidenceReady
    : approvalUiReady && weatherProviderReady && providerExecutorsReady;
  const dayOfEmergencyEvidenceLabels = input.dayOfEmergencyReadiness?.evidenceLabels ?? [];
  const dayOfEmergencyBlockerLabels = input.dayOfEmergencyReadiness?.blockerLabels ?? [
    "Needs final-phase playbooks, verified weather/source evidence, provider executors, and explicit approval before activating emergency changes.",
  ];

  const items: WeddingExpectedBehaviorAuditItem[] = [
    item(
      "decision_surfaces",
      "Wedding choices surface through DecisionOS / PersonalOS",
      hasDecisionProjection ? "in_place" : "partial",
      hasDecisionProjection
        ? ["Wedding tasks and decisions can be projected into the existing personal operating layer."]
        : ["Wedding planning artifacts exist, but projection evidence has not been supplied to this audit."],
      hasDecisionProjection ? [] : ["Wire or pass DecisionOS projection evidence before marking production-ready."],
    ),
    item(
      "need_to_know_probing",
      "Need-To-Know probing captures enough context before research",
      hasNeedToKnowProbing && hasPlanningContext ? "in_place" : "partial",
      ["Planning context is treated as reusable wedding memory, not a one-off prompt."],
      hasNeedToKnowProbing && hasPlanningContext ? [] : ["Collect date/season, location, budget, vendor needs, legal jurisdiction, and preference constraints before deep vendor research."],
    ),
    item(
      "vendor_matching",
      "Vendor matching can present relevant shortlists",
      hasVendorChecklist && hasVendorSearchPlanning && ready(input.vendorSearchProviderReady) ? "in_place" : "provider_blocked",
      [
        hasVendorChecklist ? "Vendor checklist selection is available." : "Vendor checklist selection is missing.",
        hasVendorSearchPlanning ? "Search query planning is available." : "Search query planning is missing.",
      ],
      ready(input.vendorSearchProviderReady)
        ? []
        : ["Live search/source verification must be connected before claiming 3-5 verified vendor options with pricing, reviews, availability, and portfolios."],
    ),
    item(
      "controlled_outreach",
      "Controlled outreach only sends after explicit approval",
      controlledOutreachReady ? "in_place" : "provider_blocked",
      ["Outreach is modeled as approval-gated work, not automatic spam.", ...controlledOutreachEvidenceLabels],
      controlledOutreachReady ? [] : controlledOutreachBlockerLabels,
    ),
    item(
      "follow_up_automation",
      "Follow-up loops escalate unanswered vendors and contacts",
      followUpAutomationReady ? "in_place" : "provider_blocked",
      [
        "Follow-up tasks use the 5-day follow-up, 7-day user escalation, and 10-day unresponsive ladder.",
        ...followUpAutomationEvidenceLabels,
      ],
      followUpAutomationReady ? [] : followUpAutomationBlockerLabels,
    ),
    item(
      "legal_deadline_tracking",
      "Legal deadlines and NOIM timing are tracked",
      hasLegalAdministration && hasAustralianLegalSetup ? "in_place" : "partial",
      ["NOIM and legal admin are represented as reviewed tasks, reminders, and artifacts."],
      hasLegalAdministration && hasAustralianLegalSetup ? [] : ["Keep jurisdiction-specific legal setup visible and reviewed before production claims."],
    ),
    item(
      "celebrant_coordination",
      "Celebrant coordination uses verified authorised sources",
      hasLegalAdministration && celebrantCoordinationReady ? "in_place" : "provider_blocked",
      ["Celebrant coordination is constrained to verified source/search evidence.", ...celebrantCoordinationEvidenceLabels],
      hasLegalAdministration && celebrantCoordinationReady ? [] : celebrantCoordinationBlockerLabels,
    ),
    item(
      "document_checklist",
      "Required legal documents are tracked without over-retaining sensitive files",
      hasLegalAdministration ? "in_place" : "partial",
      ["Document status is tracked separately from sensitive document storage."],
      hasLegalAdministration ? [] : ["Add legal administration artifact before marking document tracking complete."],
    ),
    item(
      "run_sheet_generation",
      "Final phase run sheet is generated as a structured artifact",
      hasFinalPhaseCoordination ? "in_place" : "partial",
      ["Run-sheet rows are structured enough to project into calendar/tasks."],
      hasFinalPhaseCoordination ? [] : ["Add final-phase coordination before claiming day-of run sheet support."],
    ),
    item(
      "run_sheet_adjustments",
      "Day-of delay adjustments produce approved options",
      hasFinalPhaseCoordination && runSheetAdjustmentReady ? "in_place" : "ui_blocked",
      ["Delay options are modeled as choices rather than hidden automation.", ...runSheetAdjustmentEvidenceLabels],
      hasFinalPhaseCoordination && runSheetAdjustmentReady ? [] : runSheetAdjustmentBlockerLabels,
    ),
    item(
      "vendor_scoped_sharing",
      "Vendors only see their own approved run-sheet details",
      hasFinalPhaseCoordination && vendorScopedSharingReady ? "in_place" : "provider_blocked",
      ["Vendor-scoped sharing rules are explicit in the final-phase artifact.", ...vendorScopedSharingEvidenceLabels],
      hasFinalPhaseCoordination && vendorScopedSharingReady ? [] : vendorScopedSharingBlockerLabels,
    ),
    item(
      "weather_contingency",
      "Weather backup planning is connected to real forecast evidence",
      hasFinalPhaseCoordination && weatherProviderReady ? "in_place" : "provider_blocked",
      ["Weather contingency choices are present and approval-gated.", ...weatherEvidenceLabels],
      weatherProviderReady ? [] : weatherBlockerLabels,
    ),
    item(
      "final_confirmations_payments",
      "Final vendor confirmations and payments are tracked",
      hasFinalPhaseCoordination && finalConfirmationsReady ? "in_place" : "provider_blocked",
      ["Final vendor confirmation and payment-review tasks are represented in the final-phase plan.", ...finalConfirmationsEvidenceLabels],
      hasFinalPhaseCoordination && finalConfirmationsReady ? [] : finalConfirmationsBlockerLabels,
    ),
    item(
      "guest_final_count",
      "Final guest count is presented as a DecisionOS choice",
      hasFinalPhaseCoordination && guestFinalCountReady ? "in_place" : "ui_blocked",
      ["Final guest-count submission is modeled as a choice with wait/risk/budget alternatives.", ...guestFinalCountEvidenceLabels],
      hasFinalPhaseCoordination && guestFinalCountReady ? [] : guestFinalCountBlockerLabels,
    ),
    item(
      "emergency_kit_day_of_prep",
      "Emergency kit and day-of prep are checklist-ready",
      hasFinalPhaseCoordination ? "in_place" : "partial",
      ["Emergency-kit prep is represented as a run-sheet task rather than hidden prose."],
      hasFinalPhaseCoordination ? [] : ["Add final-phase coordination before claiming day-of prep checklist support."],
    ),
    item(
      "rsvp_collection",
      "RSVP collection can capture attendance, meals, and accessibility",
      hasLifecycleManagement && rsvpCollectionReady ? "in_place" : "provider_blocked",
      ["Guest operations are represented in lifecycle tasks.", ...rsvpCollectionEvidenceLabels],
      hasLifecycleManagement && rsvpCollectionReady ? [] : rsvpCollectionBlockerLabels,
    ),
    item(
      "seating_chart",
      "Seating chart can be reviewed and adjusted",
      hasLifecycleManagement && seatingChartReady ? "in_place" : "ui_blocked",
      ["Seating constraints are represented in lifecycle planning.", ...seatingChartEvidenceLabels],
      hasLifecycleManagement && seatingChartReady ? [] : seatingChartBlockerLabels,
    ),
    item(
      "dietary_accessibility_coordination",
      "Dietary and accessibility counts can brief vendors",
      hasLifecycleManagement && dietaryAccessibilityBriefReady ? "in_place" : "provider_blocked",
      ["Caterer/vendor briefing is represented as a lifecycle task.", ...dietaryAccessibilityEvidenceLabels],
      hasLifecycleManagement && dietaryAccessibilityBriefReady ? [] : dietaryAccessibilityBlockerLabels,
    ),
    item(
      "day_of_realtime_run_sheet_updates",
      "Day-of vendor delays can update dependent timelines",
      hasFinalPhaseCoordination && approvalUiReady && liveRunSheetExecutionReady ? "in_place" : "provider_blocked",
      ["Vendor-delay choices are represented as approved run-sheet options with affected parties.", ...liveRunSheetEvidenceLabels],
      hasFinalPhaseCoordination && approvalUiReady && liveRunSheetExecutionReady ? [] : liveRunSheetBlockerLabels,
    ),
    item(
      "day_of_emergency_handling",
      "Day-of emergencies have approved fallback playbooks",
      hasFinalPhaseCoordination && dayOfEmergencyReady ? "in_place" : "provider_blocked",
      ["Vendor no-show and weather emergency playbooks are represented as explicit choices.", ...dayOfEmergencyEvidenceLabels],
      hasFinalPhaseCoordination && dayOfEmergencyReady ? [] : dayOfEmergencyBlockerLabels,
    ),
    item(
      "day_of_guest_coordination",
      "Day-of guest updates and lost-item incidents are scoped",
      hasFinalPhaseCoordination && approvalUiReady && guestMessagingReady ? "in_place" : "provider_blocked",
      ["Guest updates are treated as scoped/E2EE messages, not public broadcast or vendor spam.", ...guestMessagingEvidenceLabels],
      hasFinalPhaseCoordination && approvalUiReady && guestMessagingReady ? [] : guestMessagingBlockerLabels,
    ),
    item(
      "day_of_payment_verification",
      "Day-of and final payments are verified from receipt evidence",
      hasFinalPhaseCoordination && paymentVerificationReady ? "in_place" : "provider_blocked",
      ["Payment confirmation is separated from planning reminders.", ...paymentVerificationEvidenceLabels],
      hasFinalPhaseCoordination && paymentVerificationReady ? [] : paymentVerificationBlockerLabels,
    ),
    item(
      "post_wedding_thank_you_notes",
      "Post-wedding thank-you notes are drafted from confirmed memories",
      hasPostWeddingWrapUp ? "in_place" : "partial",
      ["Thank-you work must remain draft/approval-gated until the user approves sending."],
      hasPostWeddingWrapUp ? [] : ["Add post-wedding wrap-up state with guest, vendor, and family thank-you draft prompts."],
    ),
    item(
      "post_wedding_feedback_collection",
      "Post-wedding vendor feedback is captured privately first",
      hasPostWeddingFeedbackCollection ? "in_place" : "partial",
      ["Vendor ratings and notes should be private by default before any public review or testimonial."],
      hasPostWeddingFeedbackCollection ? [] : ["Add private vendor feedback prompts and link them to the post-wedding decision log."],
    ),
    item(
      "post_wedding_keepsake_export",
      "Wedding log can export as secure PDF or digital scrapbook",
      hasPostWeddingKeepsakeExport ? "in_place" : "partial",
      ["Keepsake exports reuse the artifact/export system rather than creating a separate scrapbook product."],
      hasPostWeddingKeepsakeExport ? [] : ["Add secure PDF and digital scrapbook export options to the post-wedding wrap-up artifact."],
    ),
  ];

  const readyCount = items.filter((auditItem) => auditItem.status === "in_place").length;
  const blockedCount = items.filter((auditItem) => auditItem.status.endsWith("_blocked")).length;
  const productionBlockerLabels = items
    .filter((auditItem) => auditItem.status !== "in_place")
    .flatMap((auditItem) => auditItem.blockerLabels.map((label) => `${auditItem.title}: ${label}`));

  return {
    items,
    readyCount,
    blockedCount,
    summaryLabels: [
      `${readyCount}/${items.length} expected wedding behaviours production-ready`,
      `${blockedCount} expected behaviours need provider or focused UI proof`,
    ],
    productionBlockerLabels,
  };
}
