import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingCelebrantCoordinationReadinessState } from "@/lib/weddingCelebrantCoordinationReadinessState";
import {
  buildWeddingExpectedBehaviorAuditState,
} from "@/lib/weddingExpectedBehaviorAuditState";
import { buildWeddingControlledOutreachReadinessState } from "@/lib/weddingControlledOutreachReadinessState";
import { buildWeddingDayOfEmergencyReadinessState } from "@/lib/weddingDayOfEmergencyReadinessState";
import { buildWeddingDietaryAccessibilityBriefReadinessState } from "@/lib/weddingDietaryAccessibilityBriefReadinessState";
import { buildWeddingFinalConfirmationsReadinessState } from "@/lib/weddingFinalConfirmationsReadinessState";
import { buildWeddingFollowUpAutomationReadinessState } from "@/lib/weddingFollowUpAutomationReadinessState";
import { buildWeddingGuestFinalCountReadinessState } from "@/lib/weddingGuestFinalCountReadinessState";
import { buildWeddingGuestMessagingReadinessState } from "@/lib/weddingGuestMessagingReadinessState";
import { buildWeddingLiveRunSheetExecutionReadinessState } from "@/lib/weddingLiveRunSheetExecutionReadinessState";
import { buildWeddingPaymentVerificationReadinessState } from "@/lib/weddingPaymentVerificationReadinessState";
import { buildWeddingRsvpCollectionReadinessState } from "@/lib/weddingRsvpCollectionReadinessState";
import { buildWeddingRunSheetAdjustmentReadinessState } from "@/lib/weddingRunSheetAdjustmentReadinessState";
import { buildWeddingSeatingChartReadinessState } from "@/lib/weddingSeatingChartReadinessState";
import { buildWeddingVendorScopedSharingReadinessState } from "@/lib/weddingVendorScopedSharingReadinessState";
import { buildWeddingWeatherProviderReadinessState } from "@/lib/weddingWeatherProviderReadinessState";

test("buildWeddingExpectedBehaviorAuditState marks all expected behaviours ready when evidence is supplied", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasPlanningContext: true,
    hasDecisionProjection: true,
    hasNeedToKnowProbing: true,
    hasVendorChecklist: true,
    hasVendorSearchPlanning: true,
    vendorSearchProviderReady: true,
    approvalUiReady: true,
    providerExecutorsReady: true,
    hasLegalAdministration: true,
    hasAustralianLegalSetup: true,
    hasFinalPhaseCoordination: true,
    hasLifecycleManagement: true,
    weatherProviderReady: true,
    rsvpProviderReady: true,
    seatingCanvasReady: true,
    liveRunSheetExecutionReady: true,
    guestMessagingProviderReady: true,
    paymentVerificationProviderReady: true,
    hasPostWeddingWrapUp: true,
    hasPostWeddingFeedbackCollection: true,
    hasPostWeddingKeepsakeExport: true,
  });

  assert.equal(state.readyCount, state.items.length);
  assert.equal(state.blockedCount, 0);
  assert.deepEqual(state.productionBlockerLabels, []);
  assert.ok(state.summaryLabels[0].startsWith(`${state.items.length}/${state.items.length}`));
});

test("buildWeddingExpectedBehaviorAuditState blocks vendor and weather claims without live providers", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasPlanningContext: true,
    hasDecisionProjection: true,
    hasNeedToKnowProbing: true,
    hasVendorChecklist: true,
    hasVendorSearchPlanning: true,
    hasFinalPhaseCoordination: true,
  });

  const vendorMatching = state.items.find((item) => item.capability === "vendor_matching");
  const weather = state.items.find((item) => item.capability === "weather_contingency");

  assert.equal(vendorMatching?.status, "provider_blocked");
  assert.ok(vendorMatching?.blockerLabels.some((label) => label.includes("Live search/source verification")));
  assert.equal(weather?.status, "provider_blocked");
  assert.ok(weather?.blockerLabels.some((label) => label.includes("BOM/weather provider evidence")));
});

test("buildWeddingExpectedBehaviorAuditState accepts structured verified weather evidence", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    approvalUiReady: true,
    providerExecutorsReady: true,
    weatherProviderReadiness: buildWeddingWeatherProviderReadinessState({
      provider: "bom",
      providerConnected: true,
      forecastLocationsRequested: 2,
      forecastLocationsVerified: 2,
      maxForecastAgeMinutes: 30,
      hasSourceTimestamp: true,
      hasUserFacingCaveat: true,
      hasFallbackManualCheck: true,
      errorCount: 0,
    }),
  });

  const weather = state.items.find((item) => item.capability === "weather_contingency");
  const emergency = state.items.find((item) => item.capability === "day_of_emergency_handling");

  assert.equal(weather?.status, "in_place");
  assert.ok(weather?.evidenceLabels.some((label) => /2\/2 forecast locations verified/i.test(label)));
  assert.equal(emergency?.status, "in_place");
});

test("buildWeddingExpectedBehaviorAuditState keeps manual weather fallback provider-blocked for live claims", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    approvalUiReady: true,
    providerExecutorsReady: true,
    weatherProviderReadiness: buildWeddingWeatherProviderReadinessState({
      providerConnected: false,
      forecastLocationsRequested: 1,
      forecastLocationsVerified: 0,
      hasUserFacingCaveat: true,
      hasFallbackManualCheck: true,
    }),
  });

  const weather = state.items.find((item) => item.capability === "weather_contingency");
  const emergency = state.items.find((item) => item.capability === "day_of_emergency_handling");

  assert.equal(weather?.status, "provider_blocked");
  assert.ok(weather?.blockerLabels.some((label) => /not connected/i.test(label)));
  assert.equal(emergency?.status, "provider_blocked");
});

test("buildWeddingExpectedBehaviorAuditState accepts structured live run-sheet execution proof", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    approvalUiReady: true,
    liveRunSheetExecutionReadiness: buildWeddingLiveRunSheetExecutionReadinessState({
      liveDelayIntakeConnected: true,
      dependencyRecalculationReady: true,
      scopedNotificationRoutesReady: true,
      approvalReceiptsPersisted: true,
      offlineFallbackReady: true,
      testedScenarioCount: 2,
      failedScenarioCount: 0,
    }),
  });

  const runSheetUpdates = state.items.find((item) => item.capability === "day_of_realtime_run_sheet_updates");

  assert.equal(runSheetUpdates?.status, "in_place");
  assert.ok(runSheetUpdates?.evidenceLabels.some((label) => /2 live run-sheet scenarios tested/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState accepts structured run-sheet adjustment proof", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    runSheetAdjustmentReadiness: buildWeddingRunSheetAdjustmentReadinessState({
      delayOptionModelReady: true,
      dependencyImpactPreviewReady: true,
      approvalUiReady: true,
      dragOrButtonAdjustmentReady: true,
      calendarTaskProjectionReady: true,
      receiptPersistenceReady: true,
      coordinatorFallbackReady: true,
      testedAdjustmentScenarioCount: 2,
      failedAdjustmentScenarioCount: 0,
    }),
  });

  const adjustments = state.items.find((item) => item.capability === "run_sheet_adjustments");

  assert.equal(adjustments?.status, "in_place");
  assert.ok(adjustments?.evidenceLabels.some((label) => /2 run-sheet adjustment scenarios tested/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState keeps run-sheet adjustment handoff UI-blocked for focused-control claims", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    runSheetAdjustmentReadiness: buildWeddingRunSheetAdjustmentReadinessState({
      delayOptionModelReady: true,
      dependencyImpactPreviewReady: true,
      approvalUiReady: true,
      calendarTaskProjectionReady: true,
      coordinatorFallbackReady: true,
      testedAdjustmentScenarioCount: 1,
    }),
  });

  const adjustments = state.items.find((item) => item.capability === "run_sheet_adjustments");

  assert.equal(adjustments?.status, "ui_blocked");
  assert.ok(adjustments?.blockerLabels.some((label) => /Drag\/button adjustment controls/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState keeps coordinator handoff blocked for live run-sheet claims", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    approvalUiReady: true,
    liveRunSheetExecutionReadiness: buildWeddingLiveRunSheetExecutionReadinessState({
      approvalReceiptsPersisted: true,
      offlineFallbackReady: true,
      testedScenarioCount: 1,
    }),
  });

  const runSheetUpdates = state.items.find((item) => item.capability === "day_of_realtime_run_sheet_updates");

  assert.equal(runSheetUpdates?.status, "provider_blocked");
  assert.ok(runSheetUpdates?.blockerLabels.some((label) => /vendor-delay intake/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState accepts structured controlled outreach proof", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    controlledOutreachReadiness: buildWeddingControlledOutreachReadinessState({
      approvalUiReady: true,
      contactInfoConsentReady: true,
      vendorSafePayloadReady: true,
      emailOrContactExecutorReady: true,
      noSpamPolicyReady: true,
      providerSetupFallbackReady: true,
      receiptPersistenceReady: true,
      rejectionPathReady: true,
      testedOutreachScenarioCount: 2,
      failedOutreachScenarioCount: 0,
    }),
  });

  const outreach = state.items.find((item) => item.capability === "controlled_outreach");

  assert.equal(outreach?.status, "in_place");
  assert.ok(outreach?.evidenceLabels.some((label) => /2 controlled-outreach scenarios tested/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState keeps manual controlled outreach blocked for live send claims", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    controlledOutreachReadiness: buildWeddingControlledOutreachReadinessState({
      approvalUiReady: true,
      contactInfoConsentReady: true,
      vendorSafePayloadReady: true,
      noSpamPolicyReady: true,
      providerSetupFallbackReady: true,
      rejectionPathReady: true,
      testedOutreachScenarioCount: 1,
    }),
  });

  const outreach = state.items.find((item) => item.capability === "controlled_outreach");

  assert.equal(outreach?.status, "provider_blocked");
  assert.ok(outreach?.blockerLabels.some((label) => /Email\/contact executor/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState accepts structured celebrant coordination proof", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasLegalAdministration: true,
    celebrantCoordinationReadiness: buildWeddingCelebrantCoordinationReadinessState({
      australianLegalSetupReady: true,
      officialRegisterSourceReady: true,
      locationScopeReady: true,
      vendorSearchProviderReady: true,
      noimGuardrailsReady: true,
      noBookingNoLodgementCaveatReady: true,
      approvalUiReady: true,
      contactExecutorReady: true,
      testedCelebrantScenarioCount: 2,
      failedCelebrantScenarioCount: 0,
    }),
  });

  const celebrant = state.items.find((item) => item.capability === "celebrant_coordination");

  assert.equal(celebrant?.status, "in_place");
  assert.ok(celebrant?.evidenceLabels.some((label) => /2 celebrant coordination scenarios tested/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState keeps official-source celebrant handoff blocked for live claims", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasLegalAdministration: true,
    celebrantCoordinationReadiness: buildWeddingCelebrantCoordinationReadinessState({
      australianLegalSetupReady: true,
      officialRegisterSourceReady: true,
      locationScopeReady: true,
      noimGuardrailsReady: true,
      noBookingNoLodgementCaveatReady: true,
      testedCelebrantScenarioCount: 1,
    }),
  });

  const celebrant = state.items.find((item) => item.capability === "celebrant_coordination");

  assert.equal(celebrant?.status, "provider_blocked");
  assert.ok(celebrant?.blockerLabels.some((label) => /search provider/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState accepts structured vendor-scoped sharing proof", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    vendorScopedSharingReadiness: buildWeddingVendorScopedSharingReadinessState({
      runSheetPacketGenerationReady: true,
      vendorAudienceScopeReady: true,
      minimumNecessaryFieldsReady: true,
      privacyRedactionReady: true,
      approvalUiReady: true,
      sharingExecutorReady: true,
      accessControlReady: true,
      receiptPersistenceReady: true,
      revocationOrCorrectionReady: true,
      testedSharingScenarioCount: 2,
      failedSharingScenarioCount: 0,
    }),
  });

  const sharing = state.items.find((item) => item.capability === "vendor_scoped_sharing");

  assert.equal(sharing?.status, "in_place");
  assert.ok(sharing?.evidenceLabels.some((label) => /2 vendor-scoped sharing scenarios tested/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState keeps vendor-scoped sharing handoff blocked for live sharing claims", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    vendorScopedSharingReadiness: buildWeddingVendorScopedSharingReadinessState({
      runSheetPacketGenerationReady: true,
      vendorAudienceScopeReady: true,
      minimumNecessaryFieldsReady: true,
      privacyRedactionReady: true,
      approvalUiReady: true,
      revocationOrCorrectionReady: true,
      testedSharingScenarioCount: 1,
    }),
  });

  const sharing = state.items.find((item) => item.capability === "vendor_scoped_sharing");

  assert.equal(sharing?.status, "provider_blocked");
  assert.ok(sharing?.blockerLabels.some((label) => /Sharing executor/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState accepts structured follow-up automation proof", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    followUpAutomationReadiness: buildWeddingFollowUpAutomationReadinessState({
      escalationLadderReady: true,
      approvalGateReady: true,
      emailOrContactExecutorReady: true,
      oneFollowUpLimitReady: true,
      userEscalationReady: true,
      unresponsiveAlternativeReady: true,
      receiptPersistenceReady: true,
      manualCallMoveOnOptionsReady: true,
      testedFollowUpScenarioCount: 4,
      failedFollowUpScenarioCount: 0,
    }),
  });

  const followUp = state.items.find((item) => item.capability === "follow_up_automation");

  assert.equal(followUp?.status, "in_place");
  assert.ok(followUp?.evidenceLabels.some((label) => /4 follow-up automation scenarios tested/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState keeps manual follow-up ladder blocked for live send claims", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    followUpAutomationReadiness: buildWeddingFollowUpAutomationReadinessState({
      escalationLadderReady: true,
      approvalGateReady: true,
      oneFollowUpLimitReady: true,
      userEscalationReady: true,
      unresponsiveAlternativeReady: true,
      manualCallMoveOnOptionsReady: true,
      testedFollowUpScenarioCount: 3,
    }),
  });

  const followUp = state.items.find((item) => item.capability === "follow_up_automation");

  assert.equal(followUp?.status, "provider_blocked");
  assert.ok(followUp?.blockerLabels.some((label) => /Email\/contact executor/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState accepts structured guest messaging proof", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    approvalUiReady: true,
    guestMessagingReadiness: buildWeddingGuestMessagingReadinessState({
      secureGuestChannelConnected: true,
      scopedAudienceControlsReady: true,
      optInContactSourceReady: true,
      rateLimitAndNoSpamPolicyReady: true,
      approvalReceiptsPersisted: true,
      deliveryReceiptsAvailable: true,
      emergencyFallbackReady: true,
      testedMessageScenarioCount: 2,
      failedMessageScenarioCount: 0,
    }),
  });

  const guestCoordination = state.items.find((item) => item.capability === "day_of_guest_coordination");

  assert.equal(guestCoordination?.status, "in_place");
  assert.ok(guestCoordination?.evidenceLabels.some((label) => /2 guest-message scenarios tested/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState accepts structured day-of emergency proof", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    dayOfEmergencyReadiness: buildWeddingDayOfEmergencyReadinessState({
      emergencyPlaybooksReady: true,
      vendorNoShowFallbackReady: true,
      weatherEmergencyActivationReady: true,
      verifiedWeatherOrSourceReady: true,
      scopedNotificationReady: true,
      approvalUiReady: true,
      executorReady: true,
      auditReceiptReady: true,
      manualCoordinatorFallbackReady: true,
      testedEmergencyScenarioCount: 2,
      failedEmergencyScenarioCount: 0,
    }),
  });

  const emergency = state.items.find((item) => item.capability === "day_of_emergency_handling");

  assert.equal(emergency?.status, "in_place");
  assert.ok(emergency?.evidenceLabels.some((label) => /2 day-of emergency scenarios tested/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState keeps day-of emergency handoff blocked for live activation claims", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    dayOfEmergencyReadiness: buildWeddingDayOfEmergencyReadinessState({
      emergencyPlaybooksReady: true,
      vendorNoShowFallbackReady: true,
      weatherEmergencyActivationReady: true,
      approvalUiReady: true,
      auditReceiptReady: true,
      manualCoordinatorFallbackReady: true,
      testedEmergencyScenarioCount: 1,
    }),
  });

  const emergency = state.items.find((item) => item.capability === "day_of_emergency_handling");

  assert.equal(emergency?.status, "provider_blocked");
  assert.ok(emergency?.blockerLabels.some((label) => /Verified weather\/source evidence/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState keeps guest messaging handoff blocked for live claims", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    approvalUiReady: true,
    guestMessagingReadiness: buildWeddingGuestMessagingReadinessState({
      scopedAudienceControlsReady: true,
      approvalReceiptsPersisted: true,
      emergencyFallbackReady: true,
      testedMessageScenarioCount: 1,
    }),
  });

  const guestCoordination = state.items.find((item) => item.capability === "day_of_guest_coordination");

  assert.equal(guestCoordination?.status, "provider_blocked");
  assert.ok(guestCoordination?.blockerLabels.some((label) => /Secure guest messaging channel/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState accepts structured payment verification proof", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    paymentVerificationReadiness: buildWeddingPaymentVerificationReadinessState({
      trustedReceiptSourceConnected: true,
      vendorInvoiceMatchingReady: true,
      amountAndDueDateChecksReady: true,
      sensitiveReceiptStoragePolicyReady: true,
      auditReceiptPersisted: true,
      manualUploadFallbackReady: true,
      testedPaymentScenarioCount: 2,
      failedPaymentScenarioCount: 0,
    }),
  });

  const payment = state.items.find((item) => item.capability === "day_of_payment_verification");

  assert.equal(payment?.status, "in_place");
  assert.ok(payment?.evidenceLabels.some((label) => /2 payment verification scenarios tested/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState keeps manual payment review blocked for live confirmation claims", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    paymentVerificationReadiness: buildWeddingPaymentVerificationReadinessState({
      sensitiveReceiptStoragePolicyReady: true,
      auditReceiptPersisted: true,
      manualUploadFallbackReady: true,
      testedPaymentScenarioCount: 1,
    }),
  });

  const payment = state.items.find((item) => item.capability === "day_of_payment_verification");

  assert.equal(payment?.status, "provider_blocked");
  assert.ok(payment?.blockerLabels.some((label) => /Trusted receipt or payment source/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState accepts structured final-confirmation proof", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    finalConfirmationsReadiness: buildWeddingFinalConfirmationsReadinessState({
      vendorConfirmationTasksReady: true,
      approvalUiReady: true,
      emailOrContactExecutorReady: true,
      reminderCadenceReady: true,
      noSpamPolicyReady: true,
      guestFinalCountDecisionReady: true,
      paymentReviewLinked: true,
      auditReceiptsPersisted: true,
      manualFallbackReady: true,
      testedFinalConfirmationScenarioCount: 2,
      failedFinalConfirmationScenarioCount: 0,
    }),
  });

  const finalConfirmations = state.items.find((item) => item.capability === "final_confirmations_payments");

  assert.equal(finalConfirmations?.status, "in_place");
  assert.ok(finalConfirmations?.evidenceLabels.some((label) => /2 final-confirmation scenarios tested/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState accepts structured guest final-count proof", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    guestFinalCountReadiness: buildWeddingGuestFinalCountReadinessState({
      rsvpCountSourceReady: true,
      catererDeadlineKnown: true,
      waitRiskOptionReady: true,
      budgetImpactOptionReady: true,
      approvalUiReady: true,
      submissionExecutorReady: true,
      auditReceiptReady: true,
      manualFallbackReady: true,
      testedGuestCountScenarioCount: 2,
      failedGuestCountScenarioCount: 0,
    }),
  });

  const finalCount = state.items.find((item) => item.capability === "guest_final_count");

  assert.equal(finalCount?.status, "in_place");
  assert.ok(finalCount?.evidenceLabels.some((label) => /2 guest final-count scenarios tested/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState keeps guest final-count handoff UI-blocked for live submission claims", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    guestFinalCountReadiness: buildWeddingGuestFinalCountReadinessState({
      rsvpCountSourceReady: true,
      catererDeadlineKnown: true,
      waitRiskOptionReady: true,
      budgetImpactOptionReady: true,
      approvalUiReady: true,
      auditReceiptReady: true,
      manualFallbackReady: true,
      testedGuestCountScenarioCount: 1,
    }),
  });

  const finalCount = state.items.find((item) => item.capability === "guest_final_count");

  assert.equal(finalCount?.status, "ui_blocked");
  assert.ok(finalCount?.blockerLabels.some((label) => /submission executor/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState keeps final-confirmation handoff blocked for live reminder claims", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    finalConfirmationsReadiness: buildWeddingFinalConfirmationsReadinessState({
      vendorConfirmationTasksReady: true,
      approvalUiReady: true,
      guestFinalCountDecisionReady: true,
      paymentReviewLinked: true,
      auditReceiptsPersisted: true,
      manualFallbackReady: true,
      testedFinalConfirmationScenarioCount: 1,
    }),
  });

  const finalConfirmations = state.items.find((item) => item.capability === "final_confirmations_payments");

  assert.equal(finalConfirmations?.status, "provider_blocked");
  assert.ok(finalConfirmations?.blockerLabels.some((label) => /Email\/contact executor/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState accepts structured RSVP collection proof", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasLifecycleManagement: true,
    rsvpCollectionReadiness: buildWeddingRsvpCollectionReadinessState({
      secureLinkProviderConnected: true,
      guestIdentityScopeReady: true,
      mealDietaryAccessibilityFieldsReady: true,
      noThirdPartyTrackingPolicyReady: true,
      responseExportReady: true,
      auditReceiptsPersisted: true,
      manualEntryFallbackReady: true,
      testedRsvpScenarioCount: 2,
      failedRsvpScenarioCount: 0,
    }),
  });

  const rsvp = state.items.find((item) => item.capability === "rsvp_collection");

  assert.equal(rsvp?.status, "in_place");
  assert.ok(rsvp?.evidenceLabels.some((label) => /2 RSVP scenarios tested/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState keeps manual RSVP handoff blocked for live collection claims", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasLifecycleManagement: true,
    rsvpCollectionReadiness: buildWeddingRsvpCollectionReadinessState({
      guestIdentityScopeReady: true,
      mealDietaryAccessibilityFieldsReady: true,
      auditReceiptsPersisted: true,
      manualEntryFallbackReady: true,
      testedRsvpScenarioCount: 1,
    }),
  });

  const rsvp = state.items.find((item) => item.capability === "rsvp_collection");

  assert.equal(rsvp?.status, "provider_blocked");
  assert.ok(rsvp?.blockerLabels.some((label) => /Secure RSVP link provider/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState accepts structured seating chart proof", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasLifecycleManagement: true,
    seatingChartReadiness: buildWeddingSeatingChartReadinessState({
      focusedCanvasReady: true,
      householdGroupingReady: true,
      vipAndRoleConstraintsReady: true,
      sensitiveSeatingConstraintsReady: true,
      accessibilityNeedsReady: true,
      dragAndButtonControlsReady: true,
      revisionHistoryReady: true,
      exportOrVendorBriefReady: true,
      testedSeatingScenarioCount: 2,
      failedSeatingScenarioCount: 0,
    }),
  });

  const seating = state.items.find((item) => item.capability === "seating_chart");

  assert.equal(seating?.status, "in_place");
  assert.ok(seating?.evidenceLabels.some((label) => /2 seating scenarios tested/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState keeps seating handoff UI-blocked for interactive canvas claims", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasLifecycleManagement: true,
    seatingChartReadiness: buildWeddingSeatingChartReadinessState({
      householdGroupingReady: true,
      sensitiveSeatingConstraintsReady: true,
      accessibilityNeedsReady: true,
      exportOrVendorBriefReady: true,
      testedSeatingScenarioCount: 1,
    }),
  });

  const seating = state.items.find((item) => item.capability === "seating_chart");

  assert.equal(seating?.status, "ui_blocked");
  assert.ok(seating?.blockerLabels.some((label) => /Focused seating canvas/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState accepts structured dietary accessibility brief proof", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasLifecycleManagement: true,
    dietaryAccessibilityBriefReadiness: buildWeddingDietaryAccessibilityBriefReadinessState({
      verifiedRsvpCountsReady: true,
      dietaryCategoriesNormalized: true,
      allergySeverityHandlingReady: true,
      accessibilityNeedsScoped: true,
      vendorAudienceScopeReady: true,
      approvalReceiptsPersisted: true,
      deliveryOrExportReady: true,
      correctionLoopReady: true,
      testedBriefScenarioCount: 2,
      failedBriefScenarioCount: 0,
    }),
  });

  const brief = state.items.find((item) => item.capability === "dietary_accessibility_coordination");

  assert.equal(brief?.status, "in_place");
  assert.ok(brief?.evidenceLabels.some((label) => /2 dietary\/accessibility brief scenarios tested/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState keeps dietary accessibility handoff blocked for live brief claims", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasLifecycleManagement: true,
    dietaryAccessibilityBriefReadiness: buildWeddingDietaryAccessibilityBriefReadinessState({
      verifiedRsvpCountsReady: true,
      vendorAudienceScopeReady: true,
      approvalReceiptsPersisted: true,
      correctionLoopReady: true,
      testedBriefScenarioCount: 1,
    }),
  });

  const brief = state.items.find((item) => item.capability === "dietary_accessibility_coordination");

  assert.equal(brief?.status, "provider_blocked");
  assert.ok(brief?.blockerLabels.some((label) => /Dietary categories/i.test(label)));
});

test("buildWeddingExpectedBehaviorAuditState keeps legal and run-sheet support separate from external execution", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasLegalAdministration: true,
    hasAustralianLegalSetup: true,
    hasFinalPhaseCoordination: true,
    approvalUiReady: false,
    providerExecutorsReady: false,
  });

  assert.equal(state.items.find((item) => item.capability === "legal_deadline_tracking")?.status, "in_place");
  assert.equal(state.items.find((item) => item.capability === "document_checklist")?.status, "in_place");
  assert.equal(state.items.find((item) => item.capability === "run_sheet_generation")?.status, "in_place");
  assert.equal(state.items.find((item) => item.capability === "emergency_kit_day_of_prep")?.status, "in_place");
  assert.equal(state.items.find((item) => item.capability === "final_confirmations_payments")?.status, "provider_blocked");
  assert.equal(state.items.find((item) => item.capability === "day_of_realtime_run_sheet_updates")?.status, "provider_blocked");
  assert.equal(state.items.find((item) => item.capability === "day_of_emergency_handling")?.status, "provider_blocked");
  assert.equal(state.items.find((item) => item.capability === "day_of_guest_coordination")?.status, "provider_blocked");
  assert.equal(state.items.find((item) => item.capability === "day_of_payment_verification")?.status, "provider_blocked");
  assert.equal(state.items.find((item) => item.capability === "guest_final_count")?.status, "ui_blocked");
  assert.equal(state.items.find((item) => item.capability === "controlled_outreach")?.status, "provider_blocked");
  assert.equal(state.items.find((item) => item.capability === "run_sheet_adjustments")?.status, "ui_blocked");
});

test("buildWeddingExpectedBehaviorAuditState marks day-of execution ready only with live provider evidence", () => {
  const state = buildWeddingExpectedBehaviorAuditState({
    hasFinalPhaseCoordination: true,
    approvalUiReady: true,
    providerExecutorsReady: true,
    weatherProviderReady: true,
    liveRunSheetExecutionReady: true,
    guestMessagingProviderReady: true,
    paymentVerificationProviderReady: true,
  });

  assert.equal(state.items.find((item) => item.capability === "day_of_realtime_run_sheet_updates")?.status, "in_place");
  assert.equal(state.items.find((item) => item.capability === "day_of_emergency_handling")?.status, "in_place");
  assert.equal(state.items.find((item) => item.capability === "day_of_guest_coordination")?.status, "in_place");
  assert.equal(state.items.find((item) => item.capability === "day_of_payment_verification")?.status, "in_place");
});
