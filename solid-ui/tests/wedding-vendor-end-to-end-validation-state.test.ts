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
    vendorProviderConfigured: true,
    liveVendorArtifactSaved: false,
    liveVendorComparisonSaved: false,
    topFiveComparisonExpansionAvailable: false,
    selectedComparisonVendorsConfirmed: false,
    unselectedVendorQueueSuppressed: false,
    dynamicVendorDecisionSurfaceVisible: false,
    selectedVendorDraftTasksProjected: false,
    selectedVendorDraftsApprovalGated: false,
    quoteReplyFlowCount: 0,
    emailProviderReady: false,
    draftReplyContextual: true,
    durableSendReceiptRecorded: false,
    sentQuoteReplyLeavesLiveQueue: false,
    sentQuoteReplyHistoryVisible: false,
    followUpTaskProjected: false,
    responseEvidenceRecorded: false,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.blockedCount, 17);
  assert.ok(state.blockerLabels.some((label) => /date or season, budget comfort/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /concensure\+omnyidtest@gmail\.com/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /Run live vendor search/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /vendor comparison/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /expand to the top five/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /Select one or more vendors/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /unselected comparison vendors/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /selected-vendor consequences/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /internal outreach draft tasks/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /require approval and cannot send externally/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /leaves the live decision queue/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /history\/proof/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /Connect the Gmail\/email executor/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /Record or refresh the vendor thread/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /Remove the disposable test vendor/i.test(label)));
  assert.equal(state.estimatedPassesToUsage, 9);
});

test("vendor end-to-end validation passes when the usage path has proof", () => {
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
    vendorProviderConfigured: true,
    liveVendorArtifactSaved: true,
    liveVendorComparisonSaved: true,
    topFiveComparisonExpansionAvailable: true,
    selectedComparisonVendorsConfirmed: true,
    unselectedVendorQueueSuppressed: true,
    dynamicVendorDecisionSurfaceVisible: true,
    selectedVendorDraftTasksProjected: true,
    selectedVendorDraftsApprovalGated: true,
    quoteReplyFlowCount: 1,
    emailProviderReady: true,
    draftReplyContextual: true,
    durableSendReceiptRecorded: true,
    sentQuoteReplyLeavesLiveQueue: true,
    sentQuoteReplyHistoryVisible: true,
    followUpTaskProjected: true,
    responseEvidenceRecorded: true,
  });

  assert.equal(state.status, "ready_for_usage_validation");
  assert.equal(state.passedCount, 21);
  assert.equal(state.blockedCount, 0);
  assert.deepEqual(state.blockerLabels, []);
  assert.equal(state.estimatedPassesToUsage, 1);
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
    vendorProviderConfigured: true,
    liveVendorArtifactSaved: true,
    liveVendorComparisonSaved: true,
    topFiveComparisonExpansionAvailable: true,
    selectedComparisonVendorsConfirmed: false,
    unselectedVendorQueueSuppressed: false,
    dynamicVendorDecisionSurfaceVisible: false,
    selectedVendorDraftTasksProjected: false,
    selectedVendorDraftsApprovalGated: false,
  });

  assert.equal(state.status, "blocked");
  assert.ok(state.blockerLabels.some((label) => /Selected vendor choices/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /Unselected vendor suppression/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /Dynamic decision surface/i.test(label)));
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
    vendorProviderConfigured: true,
    liveVendorArtifactSaved: true,
    liveVendorComparisonSaved: true,
    topFiveComparisonExpansionAvailable: false,
    selectedComparisonVendorsConfirmed: true,
    unselectedVendorQueueSuppressed: true,
    dynamicVendorDecisionSurfaceVisible: true,
    selectedVendorDraftTasksProjected: true,
    selectedVendorDraftsApprovalGated: true,
  });

  assert.equal(state.status, "blocked");
  assert.ok(state.blockerLabels.some((label) => /Top-five expansion/i.test(label)));
  assert.ok(state.nextActionLabels.some((label) => /expand to the top five/i.test(label)));
  assert.ok(!state.blockerLabels.some((label) => /Vendor comparison: No saved vendor comparison/i.test(label)));
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
    vendorProviderConfigured: true,
    liveVendorArtifactSaved: true,
    liveVendorComparisonSaved: true,
    topFiveComparisonExpansionAvailable: true,
    selectedComparisonVendorsConfirmed: true,
    unselectedVendorQueueSuppressed: true,
    dynamicVendorDecisionSurfaceVisible: true,
    selectedVendorDraftTasksProjected: true,
    selectedVendorDraftsApprovalGated: false,
  });

  assert.equal(state.status, "blocked");
  assert.ok(state.blockerLabels.some((label) => /Selected-vendor draft guard/i.test(label)));
  assert.ok(!state.blockerLabels.some((label) => /Selected-vendor draft tasks/i.test(label)));
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
    vendorProviderConfigured: true,
    liveVendorArtifactSaved: true,
    liveVendorComparisonSaved: true,
    topFiveComparisonExpansionAvailable: true,
    selectedComparisonVendorsConfirmed: true,
    unselectedVendorQueueSuppressed: true,
    dynamicVendorDecisionSurfaceVisible: true,
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
