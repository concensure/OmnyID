import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingVendorEndToEndValidationState } from "@/lib/weddingVendorEndToEndValidationState";

test("vendor end-to-end validation lists blockers across search response and follow-up", () => {
  const state = buildWeddingVendorEndToEndValidationState({
    expectedPlannerEmail: "concensure@gmail.com",
    actualPlannerEmail: "concensure@gmail.com",
    expectedTestVendorEmail: "concensure+omnyidtest@gmail.com",
    quoteRecipientEmail: "concensure+omnyidtest@gmail.com",
    testVendorCleanupRequired: true,
    testVendorCleanupConfirmed: false,
    vendorSearchReadiness: {
      status: "blocked",
      label: "Live vendor search needs intake basics",
      missing: ["date or season", "budget comfort"],
      searchBrief: [],
      searchQueries: [],
      guardrails: [],
    },
    vendorSearchLaunchQuery: "",
    vendorProviderConfigured: true,
    liveVendorArtifactSaved: false,
    liveVendorComparisonSaved: false,
    topFiveComparisonExpansionAvailable: false,
    selectedComparisonVendorsConfirmed: false,
    unselectedVendorQueueSuppressed: false,
    dynamicVendorDecisionSurfaceVisible: false,
    vendorApprovalCardModeled: false,
    vendorApprovalCardCtaCopy: "",
    selectedVendorDraftTasksProjected: false,
    selectedVendorDraftsApprovalGated: false,
    quoteReplyFlowCount: 0,
    emailProviderReady: false,
    quoteAttachmentRequiresExtraction: true,
    quoteAttachmentExtractionReady: false,
    draftReplyContextual: true,
    durableSendReceiptRecorded: false,
    sentQuoteReplyLeavesLiveQueue: false,
    sentQuoteReplyHistoryVisible: false,
    followUpTaskProjected: false,
    responseEvidenceRecorded: false,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionReady, false);
  assert.equal(state.productionStatus, "production_blocked");
  assert.equal(state.blockedCount, 21);
  assert.ok(state.blockerLabels.some((label) => /date or season, budget comfort/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /concensure\+omnyidtest@gmail\.com/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /Run live vendor search/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /concrete vendor-search query/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /vendor comparison/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /opens the saved vendor search result/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /expand to the top five/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /Select one or more vendors/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /unselected comparison vendors/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /selected-vendor consequences/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /compact selected-vendor card with CTA copy/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /internal outreach draft tasks/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /require approval and cannot send externally/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /leaves the live decision queue/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /history\/proof/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /Connect the Gmail\/email executor/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /Parse the vendor quote attachment/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /Record or refresh the vendor thread/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /Remove the disposable test vendor/i.test(label)));
  assert.ok(state.productionBlockerLabels.some((label) => /Usage workflow is still blocked/i.test(label)));
  assert.ok(state.productionNextActionLabels.some((label) => /Clear the usage workflow blockers/i.test(label)));
  assert.equal(state.estimatedPassesToUsage, 11);
});

test("vendor end-to-end validation can pass usage validation while production proof is still missing", () => {
  const state = buildWeddingVendorEndToEndValidationState({
    expectedPlannerEmail: "concensure@gmail.com",
    actualPlannerEmail: "concensure@gmail.com",
    expectedTestVendorEmail: "concensure+omnyidtest@gmail.com",
    quoteRecipientEmail: "concensure+omnyidtest@gmail.com",
    testVendorCleanupRequired: true,
    testVendorCleanupConfirmed: true,
    vendorSearchReadiness: {
      status: "ready",
      label: "Ready for live vendor search",
      missing: [],
      searchBrief: [],
      searchQueries: ["Sydney wedding florist packages"],
      guardrails: [],
    },
    vendorSearchLaunchQuery: "Sydney wedding florist packages",
    vendorProviderConfigured: true,
    liveVendorArtifactSaved: true,
    liveVendorComparisonSaved: true,
    topFiveComparisonExpansionAvailable: true,
    selectedComparisonVendorsConfirmed: true,
    unselectedVendorQueueSuppressed: true,
    dynamicVendorDecisionSurfaceVisible: true,
    vendorApprovalCardModeled: true,
    vendorApprovalCardCtaCopy: "Save 2 vendor follow-up items",
    selectedVendorDraftTasksProjected: true,
    selectedVendorDraftsApprovalGated: true,
    quoteReplyFlowCount: 1,
    emailProviderReady: true,
    quoteAttachmentRequiresExtraction: true,
    quoteAttachmentExtractionReady: true,
    draftReplyContextual: true,
    durableSendReceiptRecorded: true,
    sentQuoteReplyLeavesLiveQueue: true,
    sentQuoteReplyHistoryVisible: true,
    followUpTaskProjected: true,
    responseEvidenceRecorded: true,
  });

  assert.equal(state.status, "ready_for_usage_validation");
  assert.equal(state.productionReady, false);
  assert.equal(state.productionStatus, "production_blocked");
  assert.equal(state.passedCount, 25);
  assert.equal(state.blockedCount, 0);
  assert.deepEqual(state.blockerLabels, []);
  assert.ok(state.productionBlockerLabels.some((label) => /Admin credential policy/i.test(label)));
  assert.ok(state.productionBlockerLabels.some((label) => /deployed server-side probe/i.test(label)));
  assert.ok(state.productionBlockerLabels.some((label) => /Gmail OAuth redirect/i.test(label)));
  assert.ok(state.productionBlockerLabels.some((label) => /deployed new-user smoke test/i.test(label)));
  assert.equal(state.estimatedPassesToUsage, 1);
});

test("vendor end-to-end validation only marks production ready with deployed provider OAuth and smoke proof", () => {
  const state = buildWeddingVendorEndToEndValidationState({
    vendorSearchReadiness: {
      status: "ready",
      label: "Ready for live vendor search",
      missing: [],
      searchBrief: [],
      searchQueries: ["Sydney wedding florist packages"],
      guardrails: [],
    },
    vendorSearchLaunchQuery: "Sydney wedding florist packages",
    vendorProviderConfigured: true,
    liveVendorArtifactSaved: true,
    liveVendorComparisonSaved: true,
    topFiveComparisonExpansionAvailable: true,
    selectedComparisonVendorsConfirmed: true,
    unselectedVendorQueueSuppressed: true,
    dynamicVendorDecisionSurfaceVisible: true,
    vendorApprovalCardModeled: true,
    vendorApprovalCardCtaCopy: "Save 2 vendor follow-up items",
    selectedVendorDraftTasksProjected: true,
    selectedVendorDraftsApprovalGated: true,
    quoteReplyFlowCount: 1,
    emailProviderReady: true,
    quoteAttachmentRequiresExtraction: true,
    quoteAttachmentExtractionReady: true,
    draftReplyContextual: true,
    durableSendReceiptRecorded: true,
    sentQuoteReplyLeavesLiveQueue: true,
    sentQuoteReplyHistoryVisible: true,
    followUpTaskProjected: true,
    responseEvidenceRecorded: true,
    adminCredentialPolicyReady: true,
    liveProviderServerProbePassed: true,
    gmailOAuthRedirectVerified: true,
    deployedWorkspaceSmokeTestPassed: true,
  });

  assert.equal(state.status, "ready_for_usage_validation");
  assert.equal(state.productionReady, true);
  assert.equal(state.productionStatus, "production_ready");
  assert.deepEqual(state.productionBlockerLabels, []);
  assert.deepEqual(state.productionNextActionLabels, []);
});

test("vendor end-to-end validation distinguishes comparison from selected-vendor confirmation", () => {
  const state = buildWeddingVendorEndToEndValidationState({
    expectedPlannerEmail: "concensure@gmail.com",
    actualPlannerEmail: "concensure@gmail.com",
    vendorSearchReadiness: {
      status: "ready",
      label: "Ready for live vendor search",
      missing: [],
      searchBrief: [],
      searchQueries: ["Sydney wedding florist packages"],
      guardrails: [],
    },
    vendorSearchLaunchQuery: "Sydney wedding florist packages",
    vendorProviderConfigured: true,
    liveVendorArtifactSaved: true,
    liveVendorComparisonSaved: true,
    topFiveComparisonExpansionAvailable: true,
    selectedComparisonVendorsConfirmed: false,
    unselectedVendorQueueSuppressed: false,
    dynamicVendorDecisionSurfaceVisible: false,
    vendorApprovalCardModeled: false,
    vendorApprovalCardCtaCopy: null,
    selectedVendorDraftTasksProjected: false,
    selectedVendorDraftsApprovalGated: false,
  });

  assert.equal(state.status, "blocked");
  assert.ok(state.blockerLabels.some((label) => /Selected vendor choices/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /Unselected vendor suppression/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /Dynamic decision surface/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /Vendor approval card/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /Selected-vendor draft tasks/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /Selected-vendor draft guard/i.test(label)));
  assert.ok(!state.blockerLabels.some((label) => /Vendor comparison/i.test(label)));
  assert.ok(!state.blockerLabels.some((label) => /Top-five expansion/i.test(label)));
});

test("vendor end-to-end validation blocks comparison that cannot expand to top five", () => {
  const state = buildWeddingVendorEndToEndValidationState({
    expectedPlannerEmail: "concensure@gmail.com",
    actualPlannerEmail: "concensure@gmail.com",
    vendorSearchReadiness: {
      status: "ready",
      label: "Ready for live vendor search",
      missing: [],
      searchBrief: [],
      searchQueries: ["Sydney wedding florist packages"],
      guardrails: [],
    },
    vendorSearchLaunchQuery: "Sydney wedding florist packages",
    vendorProviderConfigured: true,
    liveVendorArtifactSaved: true,
    liveVendorComparisonSaved: true,
    topFiveComparisonExpansionAvailable: false,
    selectedComparisonVendorsConfirmed: true,
    unselectedVendorQueueSuppressed: true,
    dynamicVendorDecisionSurfaceVisible: true,
    vendorApprovalCardModeled: true,
    vendorApprovalCardCtaCopy: "Save 1 vendor decision",
    selectedVendorDraftTasksProjected: true,
    selectedVendorDraftsApprovalGated: true,
  });

  assert.equal(state.status, "blocked");
  assert.ok(state.blockerLabels.some((label) => /Top-five expansion/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /expand to the top five/i.test(label)));
  assert.ok(!state.blockerLabels.some((label) => /Vendor comparison: No saved vendor comparison/i.test(label)));
});

test("vendor end-to-end validation blocks saved search output without an open handoff target", () => {
  const state = buildWeddingVendorEndToEndValidationState({
    vendorSearchReadiness: {
      status: "ready",
      label: "Ready for live vendor search",
      missing: [],
      searchBrief: [],
      searchQueries: ["Sydney wedding florist packages"],
      guardrails: [],
    },
    vendorSearchLaunchQuery: "Sydney wedding florist packages",
    vendorProviderConfigured: true,
    liveVendorArtifactSaved: true,
    liveVendorComparisonSaved: true,
    vendorSearchResultOpenTargetAvailable: false,
    topFiveComparisonExpansionAvailable: true,
  });

  assert.equal(state.status, "blocked");
  assert.ok(state.blockerLabels.some((label) => /Search result handoff/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /opens the saved vendor search result/i.test(label)));
});

test("vendor end-to-end validation blocks selected-vendor drafts that are not approval gated", () => {
  const state = buildWeddingVendorEndToEndValidationState({
    expectedPlannerEmail: "concensure@gmail.com",
    actualPlannerEmail: "concensure@gmail.com",
    vendorSearchReadiness: {
      status: "ready",
      label: "Ready for live vendor search",
      missing: [],
      searchBrief: [],
      searchQueries: ["Sydney wedding florist packages"],
      guardrails: [],
    },
    vendorSearchLaunchQuery: "Sydney wedding florist packages",
    vendorProviderConfigured: true,
    liveVendorArtifactSaved: true,
    liveVendorComparisonSaved: true,
    topFiveComparisonExpansionAvailable: true,
    selectedComparisonVendorsConfirmed: true,
    unselectedVendorQueueSuppressed: true,
    dynamicVendorDecisionSurfaceVisible: true,
    vendorApprovalCardModeled: true,
    vendorApprovalCardCtaCopy: "Save 1 vendor draft",
    selectedVendorDraftTasksProjected: true,
    selectedVendorDraftsApprovalGated: false,
  });

  assert.equal(state.status, "blocked");
  assert.ok(state.blockerLabels.some((label) => /Selected-vendor draft guard/i.test(label)));
  assert.ok(!state.blockerLabels.some((label) => /Selected-vendor draft tasks/i.test(label)));
});

test("vendor end-to-end validation blocks vendor approval cards without CTA copy", () => {
  const state = buildWeddingVendorEndToEndValidationState({
    vendorSearchReadiness: {
      status: "ready",
      label: "Ready for live vendor search",
      missing: [],
      searchBrief: [],
      searchQueries: ["Sydney wedding florist packages"],
      guardrails: [],
    },
    vendorSearchLaunchQuery: "Sydney wedding florist packages",
    vendorProviderConfigured: true,
    liveVendorArtifactSaved: true,
    liveVendorComparisonSaved: true,
    topFiveComparisonExpansionAvailable: true,
    selectedComparisonVendorsConfirmed: true,
    unselectedVendorQueueSuppressed: true,
    dynamicVendorDecisionSurfaceVisible: true,
    vendorApprovalCardModeled: true,
    vendorApprovalCardCtaCopy: "",
    selectedVendorDraftTasksProjected: true,
    selectedVendorDraftsApprovalGated: true,
  });

  assert.equal(state.status, "blocked");
  assert.ok(state.blockerLabels.some((label) => /Vendor approval card/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /CTA copy/i.test(label)));
});

test("vendor end-to-end validation blocks ready intake without a launch query", () => {
  const state = buildWeddingVendorEndToEndValidationState({
    vendorSearchReadiness: {
      status: "ready",
      label: "Ready for live vendor search",
      missing: [],
      searchBrief: [],
      searchQueries: ["Sydney wedding florist packages"],
      guardrails: [],
    },
    vendorSearchLaunchQuery: "",
    vendorProviderConfigured: true,
  });

  assert.equal(state.status, "blocked");
  assert.ok(state.blockerLabels.some((label) => /Onboarding search query/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /approved onboarding context/i.test(label)));
});

test("vendor end-to-end validation blocks sent replies that are not logged as history", () => {
  const state = buildWeddingVendorEndToEndValidationState({
    expectedPlannerEmail: "concensure@gmail.com",
    actualPlannerEmail: "concensure@gmail.com",
    vendorSearchReadiness: {
      status: "ready",
      label: "Ready for live vendor search",
      missing: [],
      searchBrief: [],
      searchQueries: ["Sydney wedding florist packages"],
      guardrails: [],
    },
    vendorSearchLaunchQuery: "Sydney wedding florist packages",
    vendorProviderConfigured: true,
    liveVendorArtifactSaved: true,
    liveVendorComparisonSaved: true,
    topFiveComparisonExpansionAvailable: true,
    selectedComparisonVendorsConfirmed: true,
    unselectedVendorQueueSuppressed: true,
    dynamicVendorDecisionSurfaceVisible: true,
    vendorApprovalCardModeled: true,
    vendorApprovalCardCtaCopy: "Save 1 vendor draft",
    selectedVendorDraftTasksProjected: true,
    selectedVendorDraftsApprovalGated: true,
    quoteReplyFlowCount: 1,
    emailProviderReady: true,
    draftReplyContextual: true,
    durableSendReceiptRecorded: true,
    sentQuoteReplyLeavesLiveQueue: false,
    sentQuoteReplyHistoryVisible: false,
  });

  assert.equal(state.status, "blocked");
  assert.ok(state.blockerLabels.some((label) => /Sent reply leaves live queue/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /Sent reply history/i.test(label)));
  assert.ok(!state.blockerLabels.some((label) => /Durable send proof/i.test(label)));
});

test("vendor end-to-end validation blocks wrong planner or vendor smoke accounts", () => {
  const state = buildWeddingVendorEndToEndValidationState({
    expectedPlannerEmail: "concensure@gmail.com",
    actualPlannerEmail: "other@example.com",
    expectedTestVendorEmail: "concensure+omnyidtest@gmail.com",
    quoteRecipientEmail: "real.vendor@example.com",
  });

  assert.equal(state.status, "blocked");
  assert.ok(state.blockerLabels.some((label) => /Expected concensure@gmail\.com, got other@example\.com/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /Expected test vendor concensure\+omnyidtest@gmail\.com, got real.vendor@example\.com/i.test(label)));
});
