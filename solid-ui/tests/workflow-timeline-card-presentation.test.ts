import assert from "node:assert/strict";
import test from "node:test";

import {
  workflowTimelineApprovalModeLabel,
  workflowTimelineCardContainerClass,
  workflowTimelineDeploymentButtonClass,
  workflowTimelineDeploymentButtonDeploymentIdDisplayValue,
  workflowTimelineDeploymentIdInputDisplayValue,
  workflowTimelineOptionalDeploymentIdDisplayValue,
  workflowTimelineDeploymentButtonKindDisplayValue,
  workflowTimelineDeploymentFocusTargetInputDisplayValue,
  workflowTimelineDeploymentSelectionTargetInputDisplayValue,
  workflowTimelineDeploymentButtonSelectionStateDisplayValue,
  workflowTimelineDeploymentButtonSelectedDisplayValue,
  workflowTimelineDeploymentButtonToneDisplayValue,
  workflowTimelineDeploymentButtonLabel,
  workflowTimelineDeploymentButtonShellClass,
  workflowTimelineDeploymentButtonDeploymentIdValueInputDisplayValue,
  workflowTimelineCountSummary,
  workflowTimelineDecisionPointLabel,
  workflowTimelineOptionalDecisionPointDisplayValue,
  workflowTimelineDecisionPointInputDisplayValue,
  workflowTimelineDecisionPointValueInputDisplayValue,
  workflowTimelineDecisionPointDisplayValue,
  workflowTimelineFocusedEdgeDisplayValue,
  workflowTimelineFocusedEdgeInputDisplayValue,
  workflowTimelineDistinctResumeKindLabel,
  workflowTimelineDistinctResumeKindInputDisplayValue,
  workflowTimelineEntryRelationBadge,
  workflowTimelineHeaderDetailClass,
  workflowTimelineHeaderDetailEmphasisDisplayValue,
  workflowTimelineHeaderDetailRowClass,
  workflowTimelineHasMetadata,
  workflowTimelineInteractiveMiniChipClass,
  workflowTimelineInlineChipRowClass,
  workflowTimelineLabeledValue,
  workflowTimelineListLabel,
  workflowTimelineManifestHeaderDetailInputDisplayValue,
  workflowTimelineManifestHeaderDetailValueInputDisplayValue,
  workflowTimelineManifestHeaderDetailEmphasisDisplayValue,
  workflowTimelineManifestHeaderDetailDisplayValue,
  workflowTimelineOptionalManifestHeaderDetailDisplayValue,
  workflowTimelineManifestHeaderDetailLabel,
  workflowTimelinePrimaryHeaderDetailDisplayValue,
  workflowTimelinePrimaryHeaderDetailInputDisplayValue,
  workflowTimelineSecondaryHeaderDetailDisplayValue,
  workflowTimelineSecondaryHeaderDetailInputDisplayValue,
  workflowTimelineOptionalRequestSummaryDisplayValue,
  workflowTimelineRequestSummaryValueInputDisplayValue,
  workflowTimelineRequestSummaryDisplayValue,
  workflowTimelineOptionalResultSummaryDisplayValue,
  workflowTimelineResultSummaryValueInputDisplayValue,
  workflowTimelineResultSummaryDisplayValue,
  workflowTimelineMetadataChipClass,
  workflowTimelineMetadataChipToneDisplayValue,
  workflowTimelineMetadataRowClass,
  workflowTimelineMiniChipClass,
  workflowTimelineMiniChipToneDisplayValue,
  workflowTimelineEventCardClass,
  workflowTimelineEventKindChipClass,
  workflowTimelineEventKindDisplayValue,
  workflowTimelineEventKindInputDisplayValue,
  workflowTimelineEventKindLabel,
  workflowTimelineEventSummaryDisplayValue,
  workflowTimelineEventSummaryInputDisplayValue,
  workflowTimelineEventTitleDisplayValue,
  workflowTimelineEventTitleInputDisplayValue,
  workflowTimelinePayloadChipsInputDisplayValue,
  workflowTimelinePayloadChipsDisplayValue,
  workflowTimelinePayloadChipsValueInputDisplayValue,
  workflowTimelinePayloadChipLabel,
  workflowTimelinePayloadChipDisplayValue,
  workflowTimelinePayloadChipInputDisplayValue,
  workflowTimelineOptionalPayloadChipsDisplayValue,
  workflowTimelineEventSummaryLabel,
  workflowTimelinePayloadChipRowClass,
  workflowTimelinePolicySummaryLabel,
  workflowTimelinePolicySummaryInputDisplayValue,
  workflowTimelineEventTitleLabel,
  workflowTimelineEventTitleClass,
  workflowTimelineNarrativeDisplayValue,
  workflowTimelineNarrativeInputDisplayValue,
  workflowTimelineNarrativeLabel,
  workflowTimelineNarrativeClass,
  workflowTimelineNarrativeToneDisplayClass,
  workflowTimelineOptionalReplayMatchBadgePresentation,
  workflowTimelineOptionalReplayMatchBadgeDisplayValue,
  workflowTimelineReplayMatchBadgeInputDisplayValue,
  workflowTimelinePolicySummaryTextClass,
  workflowTimelineDeploymentSelectorIdInputDisplayValue,
  workflowTimelineOptionalDeploymentSelectorIdDisplayValue,
  workflowTimelinePolicyFieldChangesInputDisplayValue,
  workflowTimelinePolicySourceInputDisplayValue,
  workflowTimelinePolicySourceDisplayValue,
  workflowTimelinePolicySourceLabel,
  workflowTimelinePolicySummaryDisplayValue,
  workflowTimelineOptionalPolicyFieldChangesDisplayValue,
  workflowTimelinePrimaryHeaderDetailLabel,
  workflowTimelineReplayMatchBadgeClass,
  workflowTimelineReplayMatchDisplayClass,
  workflowTimelineReplayMatchDisplayLabel,
  workflowTimelineReplayMatchPresentationClassDisplayValue,
  workflowTimelineReplayMatchPresentationLabelDisplayValue,
  workflowTimelineReplayMatchedOriginalInputDisplayValue,
  workflowTimelineReplayMatchedOriginalDisplayValue,
  workflowTimelineReplayRunInputDisplayValue,
  workflowTimelineReplayRunValueInputDisplayValue,
  workflowTimelineOptionalReplayRunDisplayValue,
  workflowTimelineReplayMatchBadgePresentation,
  workflowTimelineReplayRunDisplayValue,
  workflowTimelineRequestSummaryInputDisplayValue,
  workflowTimelineRequestSummaryLabel,
  workflowTimelineResultSummaryInputDisplayValue,
  workflowTimelineResultSummaryLabel,
  workflowTimelineReviewSnapshotLabel,
  workflowTimelineRelationBadgeClass,
  workflowTimelineRelationDisplayValue,
  workflowTimelineRelationInputDisplayValue,
  workflowTimelineRelationLabelDisplayValue,
  workflowTimelineRelationLabel,
  workflowTimelineReplayMatchPresentation,
  workflowTimelineOptionalRouteDisplayValue,
  workflowTimelineRouteLabel,
  workflowTimelineRouteValueInputDisplayValue,
  workflowTimelineRouteDisplayValue,
  workflowTimelineRuntimeHeaderDetailEmphasisDisplayValue,
  workflowTimelineSecondaryHeaderDetailLabel,
  workflowTimelineSecondaryHeaderDetailEmphasisDisplayValue,
  workflowTimelineSelectedLabelsLabel,
  workflowTimelineSecondaryTextClass,
  workflowTimelineSecondaryTextSpacingDisplayValue,
  workflowTimelineSectionContainerClass,
  workflowTimelineDefaultSectionPaddingDisplayValue,
  workflowTimelineSectionPaddingDisplayValue,
  workflowTimelineSectionLabelClass,
  workflowTimelineSectionToneDisplayValue,
  workflowTimelineSectionTitleDisplayValue,
  workflowTimelineSectionTitle,
  workflowTimelineOptionalSelectedLabelsDisplayValue,
  workflowTimelineSelectedLabelsInputDisplayValue,
  workflowTimelineSelectedLabelsDisplayValue,
  workflowTimelineSelectedLabelsValueInputDisplayValue,
  workflowTimelineSelectedNodeTargetInputDisplayValue,
  workflowTimelineStepNodeButtonLabel,
  workflowTimelineStepNodeIdInputDisplayValue,
  workflowTimelineStepNodeIdValueInputDisplayValue,
  workflowTimelineStepNodeLabelInputDisplayValue,
  workflowTimelineStepNodeDisplayValue,
  workflowTimelineOptionalStepNodeIdDisplayValue,
  workflowTimelineStepNodeIdDisplayValue,
  workflowTimelineStatusBadgeClass,
  workflowTimelineStatusClassInputDisplayValue,
  workflowTimelineStatusDisplayValue,
  workflowTimelineStatusDisplayClass,
  workflowTimelineStatusLabelDisplayValue,
  workflowTimelineStatusInputDisplayValue,
  workflowTimelineStatusLabel,
  workflowTimelineSurfaceContainerDisplayClass,
  workflowTimelineOptionalTraceEventsDisplayValue,
  workflowTimelineTraceEventsInputDisplayValue,
  workflowTimelineTraceEventsDisplayValue,
  workflowTimelineSurfacePresentationDisplayValue,
  workflowTimelineSurfacePresentationInputDisplayValue,
  workflowTimelineSurfacePresentationContainerDisplayValue,
  workflowTimelineSurfacePresentationTitleDisplayValue,
  workflowTimelineSurfaceTitleDisplayClass,
  workflowTimelineMetadataCardInputDisplayValue,
  workflowTimelineStepNodeLabel,
  workflowTimelineTargetNodeLabel,
  workflowTimelineOptionalTargetNodeDisplayValue,
  workflowTimelineTargetNodeValueInputDisplayValue,
  workflowTimelineTargetNodeDisplayValue,
  workflowTimelineTraceSourceInputDisplayValue,
  workflowTimelineTraceSourceValueInputDisplayValue,
  workflowTimelineTitleClass,
  workflowTimelineTitleLabel,
  workflowTimelineTitleObjectiveDisplayValue,
  workflowTimelineTitleObjectiveInputDisplayValue,
  workflowTimelineTitleRenderIndexDisplayValue,
  workflowTimelineTitleRenderIndexInputDisplayValue,
  workflowTimelineTitleRowClass,
  workflowTimelineOptionalAuthModeDisplayValue,
  workflowTimelineAuthModeInputDisplayValue,
  workflowTimelineAuthModeValueInputDisplayValue,
  workflowTimelineOptionalActionOperationDisplayValue,
  workflowTimelineActionOperationInputDisplayValue,
  workflowTimelineActionOperationValueInputDisplayValue,
  workflowTimelineAuthModeDisplayValue,
  workflowTimelineAuthModeLabel,
  workflowTimelineActionOperationDisplayValue,
  workflowTimelineActionOperationLabel,
  workflowTimelineOptionalCheckpointDisplayValue,
  workflowTimelineCheckpointInputDisplayValue,
  workflowTimelineCheckpointValueInputDisplayValue,
  workflowTimelineCheckpointDisplayValue,
  workflowTimelineCheckpointLabel,
  workflowTimelineOptionalConnectorStatusDisplayValue,
  workflowTimelineConnectorStatusInputDisplayValue,
  workflowTimelineConnectorStatusValueInputDisplayValue,
  workflowTimelineConnectorStatusDisplayValue,
  workflowTimelineConnectorStatusLabel,
  workflowTimelineOptionalDeliveryTierDisplayValue,
  workflowTimelineDeliveryTierInputDisplayValue,
  workflowTimelineDeliveryTierValueInputDisplayValue,
  workflowTimelineDeliveryTierDisplayValue,
  workflowTimelineDeliveryTierLabel,
  workflowTimelineOptionalOutcomeDisplayValue,
  workflowTimelineOutcomeInputDisplayValue,
  workflowTimelineOutcomeValueInputDisplayValue,
  workflowTimelineOutcomeDisplayValue,
  workflowTimelineOutcomeLabel,
  workflowTimelineOptionalServiceDisplayValue,
  workflowTimelineServiceInputDisplayValue,
  workflowTimelineServiceValueInputDisplayValue,
  workflowTimelineOptionalProviderDisplayValue,
  workflowTimelineProviderInputDisplayValue,
  workflowTimelineProviderValueInputDisplayValue,
  workflowTimelineProviderDisplayValue,
  workflowTimelineProviderLabel,
  workflowTimelineOptionalProviderRequestDisplayValue,
  workflowTimelineProviderRequestInputDisplayValue,
  workflowTimelineProviderRequestValueInputDisplayValue,
  workflowTimelineProviderRequestDisplayValue,
  workflowTimelineProviderRequestLabel,
  workflowTimelineOptionalProviderStatusDisplayValue,
  workflowTimelineProviderStatusInputDisplayValue,
  workflowTimelineProviderStatusValueInputDisplayValue,
  workflowTimelineProviderStatusDisplayValue,
  workflowTimelineProviderStatusLabel,
  workflowTimelineServiceDisplayValue,
  workflowTimelineServiceLabel,
  workflowTimelineApprovalChipLabel,
  workflowTimelineApprovalChipInputDisplayValue,
  workflowTimelineApprovalChipValueInputDisplayValue,
  workflowTimelineOptionalApprovalChipDisplayValue,
  workflowTimelineApprovalChipDisplayValue,
  workflowTimelineDeploymentEnvironmentInputDisplayValue,
  workflowTimelineDeploymentEnvironmentValueInputDisplayValue,
  workflowTimelineOptionalDeploymentEnvironmentDisplayValue,
  workflowTimelineDeploymentEnvironmentDisplayValue,
  workflowTimelineDeploymentEnvironmentLabel,
  workflowTimelineOptionalProviderRouteDisplayValue,
  workflowTimelineProviderRouteInputDisplayValue,
  workflowTimelineProviderRouteValueInputDisplayValue,
  workflowTimelineProviderRouteDisplayValue,
  workflowTimelineProviderRouteLabel,
  workflowTimelineReplayRunLabel,
  workflowTimelineOptionalCapabilityDisplayValue,
  workflowTimelineCapabilityInputDisplayValue,
  workflowTimelineCapabilityValueInputDisplayValue,
  workflowTimelineCapabilityDisplayValue,
  workflowTimelineCapabilityLabel,
  workflowTimelineOptionalOnTimeoutDisplayValue,
  workflowTimelineOnTimeoutInputDisplayValue,
  workflowTimelineOnTimeoutValueInputDisplayValue,
  workflowTimelineOnTimeoutDisplayValue,
  workflowTimelineOnTimeoutLabel,
  workflowTimelineOptionalAllowedToolsDisplayValue,
  workflowTimelineAllowedToolsInputDisplayValue,
  workflowTimelineAllowedToolsValueInputDisplayValue,
  workflowTimelineAllowedToolsDisplayValue,
  workflowTimelineAllowedToolsLabel,
  workflowTimelineOptionalAllowedCapabilitiesDisplayValue,
  workflowTimelineAllowedCapabilitiesInputDisplayValue,
  workflowTimelineAllowedCapabilitiesValueInputDisplayValue,
  workflowTimelineAllowedCapabilitiesDisplayValue,
  workflowTimelineAllowedCapabilitiesLabel,
  workflowTimelineOptionalOutboundAllowlistDisplayValue,
  workflowTimelineOutboundAllowlistInputDisplayValue,
  workflowTimelineOutboundAllowlistValueInputDisplayValue,
  workflowTimelineOutboundAllowlistDisplayValue,
  workflowTimelineOutboundAllowlistLabel,
  workflowTimelineOptionalStatusCodeDisplayValue,
  workflowTimelineStatusCodeInputDisplayValue,
  workflowTimelineStatusCodeValueInputDisplayValue,
  workflowTimelineStatusCodeValueDisplayValue,
  workflowTimelineOptionalLatencyDisplayValue,
  workflowTimelineLatencyInputDisplayValue,
  workflowTimelineLatencyValueInputDisplayValue,
  workflowTimelineLatencyValueDisplayValue,
  workflowTimelineOptionalReplayDeltaDisplayValue,
  workflowTimelineReplayDeltaInputDisplayValue,
  workflowTimelineReplayDeltaValueInputDisplayValue,
  workflowTimelineReplayDeltaValueDisplayValue,
  workflowTimelineStatusCodeDisplayValue,
  workflowTimelineStatusCodeLabel,
  workflowTimelineLatencyDisplayValue,
  workflowTimelineLatencyLabel,
  workflowTimelineReplayDeltaDisplayValue,
  workflowTimelineReplayDeltaLabel,
  workflowTimelineTimeoutInputDisplayValue,
  workflowTimelineTimeoutValueInputDisplayValue,
  workflowTimelineTimeoutValueDisplayValue,
  workflowTimelineOptionalTimeoutDisplayValue,
  workflowTimelineTimeoutDisplayValue,
  workflowTimelineTimeoutLabel,
  workflowTimelineAttemptsInputDisplayValue,
  workflowTimelineAttemptsValueInputDisplayValue,
  workflowTimelineAttemptsValueDisplayValue,
  workflowTimelineOptionalAttemptsDisplayValue,
  workflowTimelineAttemptsDisplayValue,
  workflowTimelineAttemptsLabel,
  workflowTimelineRetriesInputDisplayValue,
  workflowTimelineRetriesValueInputDisplayValue,
  workflowTimelineRetriesValueDisplayValue,
  workflowTimelineOptionalRetriesDisplayValue,
  workflowTimelineRetriesDisplayValue,
  workflowTimelineRetriesLabel,
  workflowTimelineOptionalResumeFamilyDisplayValue,
  workflowTimelineOptionalDistinctResumeKindDisplayValue,
  workflowTimelineDistinctResumeKindDisplayValue,
  workflowTimelineDistinctResumeKindValueInputDisplayValue,
  workflowTimelineResumeKindFamilyInputDisplayValue,
  workflowTimelineResumeKindFamilyDisplayValue,
  workflowTimelineResumeKindValueInputDisplayValue,
  workflowTimelineResumeKindValueDisplayValue,
  workflowTimelineOptionalSelectedEdgeCountDisplayValue,
  workflowTimelineSelectedEdgeCountInputDisplayValue,
  workflowTimelineSelectedEdgeCountDisplayValue,
  workflowTimelineSelectedEdgeCountValueInputDisplayValue,
  workflowTimelineSelectedEdgeCountLabel,
  workflowTimelineOptionalSkippedEdgeCountDisplayValue,
  workflowTimelineSkippedEdgeCountInputDisplayValue,
  workflowTimelineSkippedEdgeCountDisplayValue,
  workflowTimelineSkippedEdgeCountValueInputDisplayValue,
  workflowTimelineSkippedEdgeCountLabel,
  workflowTimelineOptionalOptionCountDisplayValue,
  workflowTimelineOptionCountInputDisplayValue,
  workflowTimelineOptionCountLabel,
  workflowTimelineOptionCountValueInputDisplayValue,
  workflowTimelineOptionCountValueDisplayValue,
  workflowTimelineOptionCountDisplayValue,
  workflowTimelineActionCategoryInputDisplayValue,
  workflowTimelineActionCategoryValueInputDisplayValue,
  workflowTimelineOptionalActionCategoryDisplayValue,
  workflowTimelineActionCategoryDisplayValue,
  workflowTimelineActionCategoryLabel,
  workflowTimelineIntegrationFamilyInputDisplayValue,
  workflowTimelineIntegrationFamilyValueInputDisplayValue,
  workflowTimelineOptionalIntegrationFamilyDisplayValue,
  workflowTimelineIntegrationFamilyDisplayValue,
  workflowTimelineIntegrationFamilyLabel,
  workflowTimelineOptionalTraceKindDisplayValue,
  workflowTimelineTraceKindInputDisplayValue,
  workflowTimelineTraceKindValueInputDisplayValue,
  workflowTimelineTraceKindDisplayValue,
  workflowTimelineTraceKindLabel,
  workflowTimelineOptionalRoutingModeDisplayValue,
  workflowTimelineRoutingModeInputDisplayValue,
  workflowTimelineRoutingModeValueInputDisplayValue,
  workflowTimelineRoutingModeDisplayValue,
  workflowTimelineRoutingModeLabel,
  workflowTimelineResumeFamilyInputDisplayValue,
  workflowTimelineResumeFamilyValueInputDisplayValue,
  workflowTimelineResumeFamilyDisplayValue,
  workflowTimelineResumeFamilyLabel,
  workflowTimelineOptionalWaitResumeIdDisplayValue,
  workflowTimelineResumeKindDisplayLabel,
  workflowTimelineTraceReasonInputDisplayValue,
  workflowTimelineTraceReasonValueInputDisplayValue,
  workflowTimelineWaitResumeIdDisplayValue,
  workflowTimelineWaitResumeIdValueInputDisplayValue,
  workflowTimelineWaitResumeIdInputDisplayValue,
  workflowTimelineWaitResumeIdLabel,
  workflowTimelineTraceDetailInputDisplayValue,
  workflowTimelineOptionalTraceDetailDisplayValue,
  workflowTimelineTraceDetailValueInputDisplayValue,
  workflowTimelineTraceDetailDisplayValue,
  workflowTimelineTraceDetailLabel,
  workflowTimelineTraceSideEffectsInputDisplayValue,
  workflowTimelineOptionalTraceSideEffectsDisplayValue,
  workflowTimelineTraceSideEffectsValueInputDisplayValue,
  workflowTimelineTraceExecutionInputDisplayValue,
  workflowTimelineOptionalTraceExecutionDisplayValue,
  workflowTimelineTraceExecutionValueInputDisplayValue,
  workflowTimelineTraceExecutionDisplayValue,
  workflowTimelineTraceExecutionLabel,
  workflowTimelineOptionalTracePhaseDisplayValue,
  workflowTimelineTracePhaseInputDisplayValue,
  workflowTimelineTracePhaseValueInputDisplayValue,
  workflowTimelineTracePhaseDisplayValue,
  workflowTimelineTracePhaseLabel,
  workflowTimelineTraceReasonDisplayValue,
  workflowTimelineTraceReasonLabel,
  workflowTimelineRouteInputDisplayValue,
  workflowTimelineTraceSideEffectsDisplayValue,
  workflowTimelineTraceSideEffectsLabel,
  workflowTimelineOptionalTraceSourceDisplayValue,
  workflowTimelineTraceSourceDisplayValue,
  workflowTimelineTraceSourceLabel,
  workflowTimelineTargetNodeInputDisplayValue,
  workflowTimelineRuntimeHeaderDetailDisplayValue,
  workflowTimelineStartedCompletedDisplayValue,
  workflowTimelineStartedCompletedValueInputDisplayValue,
  workflowTimelineStartedCompletedInputDisplayValue,
  workflowTimelineStartedCompletedLabel,
  workflowTimelineRuntimeHeaderDetailLabel,
  workflowTimelineRuntimeSummary,
  workflowTimelineRuntimeSummaryInputDisplayValue,
  workflowTimelineSelectedDeploymentRecordIdInputDisplayValue,
  workflowTimelineOptionalStartedCompletedDisplayValue,
  workflowTimelineStartedCompletedSummary,
  workflowTimelineSurfacePresentation,
  workflowTimelineOptionalWaitResumeEventDisplayValue,
  workflowTimelineWaitResumeEventInputDisplayValue,
  workflowTimelineWaitResumeSurfaceInputDisplayValue,
  workflowTimelineWaitResumeSurfaceDisplayValue,
  workflowTimelineTokenLabel,
  workflowTimelineOptionalTraceReasonDisplayValue,
  type WorkflowTimelineMetadataCard,
} from "../src/lib/workflowTimelineCardPresentation.ts";

function makeWorkflowTimelineMetadataCard(
  overrides: Partial<WorkflowTimelineMetadataCard> = {},
): WorkflowTimelineMetadataCard {
  return {
    actionAllowedCapabilities: [],
    actionAllowedTools: [],
    actionApprovalMode: null,
    actionAuthMode: null,
    actionCapabilityId: null,
    actionCategory: null,
    actionConnectorStatus: null,
    actionDeliveryTier: null,
    actionDeploymentEnvironment: null,
    actionDeploymentId: null,
    actionMaxAttempts: null,
    actionOnTimeout: null,
    actionOperation: null,
    actionOutcome: null,
    actionOutboundAllowlist: [],
    actionProvider: null,
    actionProviderLatencyMs: null,
    actionProviderRequestId: null,
    actionProviderRoute: null,
    actionProviderStatusText: null,
    actionReplayChangedNodeCount: null,
    actionReplayComparedToDeploymentId: null,
    actionReplayEffectiveDeploymentId: null,
    actionReplayMatchedOriginalDeployment: null,
    actionReplayOfRunId: null,
    actionReplayOriginalDeploymentId: null,
    actionRequestSummary: null,
    actionResultSummary: null,
    actionRetryCount: null,
    actionRuntimeTriggerKind: null,
    actionService: null,
    actionStatusCode: null,
    actionTimeoutSeconds: null,
    decisionPointId: null,
    entryRelation: "related",
    integrationFamily: null,
    optionCount: null,
    outcomeCheckpoint: null,
    routingMode: null,
    selectedOutgoingEdgeIds: [],
    selectedOutgoingLabels: [],
    traceDetailMode: null,
    traceExecutionMode: null,
    traceKind: null,
    tracePhase: null,
    traceReason: null,
    traceSideEffects: null,
    traceSource: null,
    ...overrides,
  };
}

test("workflowTimelineEntryRelationBadge preserves relation-specific palette rules", () => {
  assert.equal(workflowTimelineEntryRelationBadge("from"), "bg-sky-100 text-sky-700");
  assert.equal(workflowTimelineEntryRelationBadge("to"), "bg-emerald-100 text-emerald-700");
  assert.equal(workflowTimelineEntryRelationBadge("related"), "bg-violet-100 text-violet-700");
});

test("workflowTimelineRelationBadgeClass preserves full relation badge styling", () => {
  assert.equal(
    workflowTimelineRelationBadgeClass("from"),
    "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] bg-sky-100 text-sky-700",
  );
  assert.equal(
    workflowTimelineRelationBadgeClass("related"),
    "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] bg-violet-100 text-violet-700",
  );
});

test("workflowTimelineRelationDisplayValue preserves rendered relation badge tone input", () => {
  assert.equal(workflowTimelineRelationDisplayValue("from"), "from");
  assert.equal(workflowTimelineRelationDisplayValue("related"), "related");
});

test("workflowTimelineFocusedEdgeDisplayValue preserves focused-edge visibility input", () => {
  assert.equal(workflowTimelineFocusedEdgeInputDisplayValue(true), true);
  assert.equal(workflowTimelineFocusedEdgeInputDisplayValue(false), false);
  assert.equal(workflowTimelineFocusedEdgeDisplayValue(true), true);
  assert.equal(workflowTimelineFocusedEdgeDisplayValue(false), false);
});

test("workflowTimelineRelationLabel preserves focused-edge relation copy", () => {
  assert.equal(workflowTimelineRelationInputDisplayValue("from"), "from");
  assert.equal(workflowTimelineRelationInputDisplayValue("related"), "related");
  assert.equal(workflowTimelineRelationLabelDisplayValue("from"), "from");
  assert.equal(workflowTimelineRelationLabelDisplayValue("related"), "related");
  assert.equal(workflowTimelineRelationLabel("from"), "from");
  assert.equal(workflowTimelineRelationLabel("related"), "related");
});

test("workflowTimelineStatusBadgeClass preserves full status badge styling", () => {
  assert.equal(
    workflowTimelineStatusBadgeClass("bg-emerald-100 text-emerald-700"),
    "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] bg-emerald-100 text-emerald-700",
  );
});

test("workflowTimelineStatusDisplayClass preserves rendered status badge tone", () => {
  assert.equal(
    workflowTimelineStatusClassInputDisplayValue("bg-emerald-100 text-emerald-700"),
    "bg-emerald-100 text-emerald-700",
  );
  assert.equal(
    workflowTimelineStatusDisplayValue("bg-emerald-100 text-emerald-700"),
    "bg-emerald-100 text-emerald-700",
  );
  assert.equal(
    workflowTimelineStatusDisplayClass("bg-emerald-100 text-emerald-700"),
    "bg-emerald-100 text-emerald-700",
  );
});

test("workflowTimelineStatusLabel preserves top-row status copy", () => {
  assert.equal(workflowTimelineStatusInputDisplayValue("succeeded"), "succeeded");
  assert.equal(workflowTimelineStatusInputDisplayValue("waiting"), "waiting");
  assert.equal(workflowTimelineStatusLabelDisplayValue("succeeded"), "succeeded");
  assert.equal(workflowTimelineStatusLabelDisplayValue("waiting"), "waiting");
  assert.equal(workflowTimelineStatusLabel("succeeded"), "succeeded");
  assert.equal(workflowTimelineStatusLabel("waiting"), "waiting");
});

test("workflowTimelineReplayMatchDisplayLabel preserves rendered replay badge copy", () => {
  assert.equal(
    workflowTimelineReplayMatchPresentationLabelDisplayValue({
      className: "rounded-full border px-3 py-1 text-[11px]",
      label: "matched replay",
    }),
    "matched replay",
  );
  assert.equal(
    workflowTimelineReplayMatchDisplayLabel("matched replay"),
    "matched replay",
  );
  assert.equal(
    workflowTimelineReplayMatchDisplayLabel("drifted replay"),
    "drifted replay",
  );
});

test("workflowTimelineReplayMatchDisplayClass preserves rendered replay badge shell", () => {
  assert.equal(
    workflowTimelineReplayMatchPresentationClassDisplayValue({
      className: "rounded-full border px-3 py-1 text-[11px]",
      label: "matched replay",
    }),
    "rounded-full border px-3 py-1 text-[11px]",
  );
  assert.equal(
    workflowTimelineReplayMatchDisplayClass("rounded-full border px-3 py-1 text-[11px]"),
    "rounded-full border px-3 py-1 text-[11px]",
  );
});

test("workflowTimelineHeaderDetailClass preserves primary and secondary header detail tones", () => {
  assert.equal(
    workflowTimelineHeaderDetailClass("primary"),
    "text-xs uppercase tracking-[0.14em] text-violet-600",
  );
  assert.equal(
    workflowTimelineHeaderDetailClass(),
    "text-xs uppercase tracking-[0.14em] text-violet-500",
  );
});

test("workflowTimelineHeaderDetailEmphasisDisplayValue preserves rendered header emphasis", () => {
  assert.equal(
    workflowTimelineHeaderDetailEmphasisDisplayValue("primary"),
    "primary",
  );
  assert.equal(
    workflowTimelineHeaderDetailEmphasisDisplayValue(),
    "secondary",
  );
});

test("workflowTimelineSecondaryHeaderDetailEmphasisDisplayValue preserves rendered secondary header emphasis", () => {
  assert.equal(
    workflowTimelineSecondaryHeaderDetailEmphasisDisplayValue(),
    "secondary",
  );
});

test("workflowTimelineManifestHeaderDetailEmphasisDisplayValue preserves rendered manifest header emphasis", () => {
  assert.equal(
    workflowTimelineManifestHeaderDetailEmphasisDisplayValue(),
    "secondary",
  );
});

test("workflowTimelineRuntimeHeaderDetailEmphasisDisplayValue preserves rendered runtime header emphasis", () => {
  assert.equal(
    workflowTimelineRuntimeHeaderDetailEmphasisDisplayValue(),
    "secondary",
  );
});

test("workflowTimelinePrimaryHeaderDetailLabel preserves graph-node header copy", () => {
  assert.equal(
    workflowTimelinePrimaryHeaderDetailInputDisplayValue("Decision Router"),
    "Decision Router",
  );
  assert.equal(
    workflowTimelinePrimaryHeaderDetailDisplayValue("Decision Router"),
    "Decision Router",
  );
  assert.equal(
    workflowTimelinePrimaryHeaderDetailLabel("Decision Router"),
    "Decision Router",
  );
});

test("workflowTimelineSecondaryHeaderDetailLabel preserves graph-node kind copy", () => {
  assert.equal(
    workflowTimelineSecondaryHeaderDetailInputDisplayValue("decision"),
    "decision",
  );
  assert.equal(
    workflowTimelineSecondaryHeaderDetailDisplayValue("decision"),
    "decision",
  );
  assert.equal(
    workflowTimelineSecondaryHeaderDetailLabel("decision"),
    "decision",
  );
});

test("workflowTimelineManifestHeaderDetailLabel preserves manifest header copy", () => {
  assert.equal(
    workflowTimelineManifestHeaderDetailInputDisplayValue("node.deploy.primary"),
    "node.deploy.primary",
  );
  assert.equal(workflowTimelineManifestHeaderDetailInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalManifestHeaderDetailDisplayValue("node.deploy.primary"),
    "node.deploy.primary",
  );
  assert.equal(workflowTimelineOptionalManifestHeaderDetailDisplayValue(null), null);
  assert.equal(
    workflowTimelineManifestHeaderDetailValueInputDisplayValue("node.deploy.primary"),
    "node.deploy.primary",
  );
  assert.equal(
    workflowTimelineManifestHeaderDetailDisplayValue("node.deploy.primary"),
    "node.deploy.primary",
  );
  assert.equal(
    workflowTimelineManifestHeaderDetailLabel("node.deploy.primary"),
    "node.deploy.primary",
  );
});

test("workflowTimelineRequestSummaryLabel preserves request summary copy", () => {
  assert.equal(workflowTimelineRequestSummaryInputDisplayValue("POST /agents/run"), "POST /agents/run");
  assert.equal(workflowTimelineRequestSummaryInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalRequestSummaryDisplayValue("POST /agents/run"),
    "POST /agents/run",
  );
  assert.equal(workflowTimelineOptionalRequestSummaryDisplayValue(null), null);
  assert.equal(
    workflowTimelineRequestSummaryValueInputDisplayValue("POST /agents/run"),
    "POST /agents/run",
  );
  assert.equal(
    workflowTimelineRequestSummaryDisplayValue("POST /agents/run"),
    "POST /agents/run",
  );
  assert.equal(
    workflowTimelineRequestSummaryLabel("POST /agents/run"),
    "POST /agents/run",
  );
});

test("workflowTimelineResultSummaryLabel preserves result summary copy", () => {
  assert.equal(workflowTimelineResultSummaryInputDisplayValue("200 OK"), "200 OK");
  assert.equal(workflowTimelineResultSummaryInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalResultSummaryDisplayValue("200 OK"),
    "200 OK",
  );
  assert.equal(workflowTimelineOptionalResultSummaryDisplayValue(null), null);
  assert.equal(
    workflowTimelineResultSummaryValueInputDisplayValue("200 OK"),
    "200 OK",
  );
  assert.equal(
    workflowTimelineResultSummaryDisplayValue("200 OK"),
    "200 OK",
  );
  assert.equal(
    workflowTimelineResultSummaryLabel("200 OK"),
    "200 OK",
  );
});

test("workflowTimelineTraceReasonLabel preserves trace reason copy", () => {
  assert.equal(workflowTimelineTraceReasonInputDisplayValue("waiting for approval"), "waiting for approval");
  assert.equal(workflowTimelineTraceReasonInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalTraceReasonDisplayValue("waiting for approval"),
    "waiting for approval",
  );
  assert.equal(workflowTimelineOptionalTraceReasonDisplayValue(null), null);
  assert.equal(
    workflowTimelineTraceReasonValueInputDisplayValue("waiting for approval"),
    "waiting for approval",
  );
  assert.equal(
    workflowTimelineTraceReasonDisplayValue("waiting for approval"),
    "waiting for approval",
  );
  assert.equal(
    workflowTimelineTraceReasonLabel("waiting for approval"),
    "waiting for approval",
  );
});

test("workflowTimelineHeaderDetailRowClass preserves header detail row layout", () => {
  assert.equal(
    workflowTimelineHeaderDetailRowClass(),
    "mt-1 flex min-w-0 flex-wrap gap-2",
  );
});

test("workflowTimelineTitleRowClass preserves top title row layout", () => {
  assert.equal(
    workflowTimelineTitleRowClass(),
    "flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3",
  );
});

test("workflowTimelineTitleClass preserves top title text shell", () => {
  assert.equal(
    workflowTimelineTitleClass("text-violet-700"),
    "break-words text-sm font-semibold text-violet-700",
  );
});

test("workflowTimelineSurfaceTitleDisplayClass preserves rendered surface title tone", () => {
  assert.deepEqual(
    workflowTimelineSurfacePresentationInputDisplayValue({
      containerClass: "border-sky-200/80 bg-sky-50/70",
      titleClass: "text-sky-700",
    }),
    {
      containerClass: "border-sky-200/80 bg-sky-50/70",
      titleClass: "text-sky-700",
    },
  );
  assert.equal(
    workflowTimelineSurfacePresentationTitleDisplayValue({
      containerClass: "border-sky-200/80 bg-sky-50/70",
      titleClass: "text-sky-700",
    }),
    "text-sky-700",
  );
  assert.equal(
    workflowTimelineSurfaceTitleDisplayClass("text-violet-700"),
    "text-violet-700",
  );
});

test("workflowTimelineTitleLabel preserves the rendered objective title copy", () => {
  assert.equal(workflowTimelineTitleRenderIndexInputDisplayValue(3), 3);
  assert.equal(workflowTimelineTitleRenderIndexDisplayValue(3), 3);
  assert.equal(
    workflowTimelineTitleObjectiveInputDisplayValue("Review deployment health"),
    "Review deployment health",
  );
  assert.equal(
    workflowTimelineTitleObjectiveDisplayValue("Review deployment health"),
    "Review deployment health",
  );
  assert.equal(
    workflowTimelineTitleLabel(3, "Review deployment health"),
    "3. Review deployment health",
  );
});

test("workflowTimelineCardContainerClass preserves outer card shell", () => {
  assert.equal(
    workflowTimelineCardContainerClass("border-sky-200/80 bg-sky-50/70"),
    "min-w-0 rounded-2xl border px-3 py-3 border-sky-200/80 bg-sky-50/70",
  );
});

test("workflowTimelineSurfaceContainerDisplayClass preserves rendered surface container tone", () => {
  assert.equal(
    workflowTimelineSurfacePresentationContainerDisplayValue({
      containerClass: "border-sky-200/80 bg-sky-50/70",
      titleClass: "text-sky-700",
    }),
    "border-sky-200/80 bg-sky-50/70",
  );
  assert.equal(
    workflowTimelineSurfaceContainerDisplayClass("border-sky-200/80 bg-sky-50/70"),
    "border-sky-200/80 bg-sky-50/70",
  );
});

test("workflowTimelineMetadataChipClass preserves metadata chip tone shells", () => {
  assert.equal(
    workflowTimelineMetadataChipClass("slate"),
    "rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700",
  );
  assert.equal(
    workflowTimelineMetadataChipClass("sky"),
    "rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-sky-700",
  );
  assert.equal(
    workflowTimelineMetadataChipClass("indigo"),
    "rounded-full border border-indigo-200/70 bg-indigo-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-indigo-700",
  );
});

test("workflowTimelineMetadataChipToneDisplayValue preserves rendered metadata chip tones", () => {
  assert.equal(workflowTimelineMetadataChipToneDisplayValue("slate"), "slate");
  assert.equal(workflowTimelineMetadataChipToneDisplayValue("violet"), "violet");
  assert.equal(workflowTimelineMetadataChipToneDisplayValue("fuchsia"), "fuchsia");
  assert.equal(workflowTimelineMetadataChipToneDisplayValue("emerald"), "emerald");
  assert.equal(workflowTimelineMetadataChipToneDisplayValue("amber"), "amber");
  assert.equal(workflowTimelineMetadataChipToneDisplayValue("sky"), "sky");
  assert.equal(workflowTimelineMetadataChipToneDisplayValue("indigo"), "indigo");
});

test("workflowTimelineMiniChipToneDisplayValue preserves rendered mini-chip tones", () => {
  assert.equal(workflowTimelineMiniChipToneDisplayValue("sky-strong"), "sky-strong");
  assert.equal(workflowTimelineMiniChipToneDisplayValue("sky-soft"), "sky-soft");
  assert.equal(workflowTimelineMiniChipToneDisplayValue("violet"), "violet");
});

test("workflowTimelineMetadataRowClass preserves the metadata chip row shell", () => {
  assert.equal(
    workflowTimelineMetadataRowClass(),
    "mt-3 flex min-w-0 flex-wrap gap-2",
  );
});

test("workflowTimelineInlineChipRowClass preserves shared inline chip row layout", () => {
  assert.equal(
    workflowTimelineInlineChipRowClass(),
    "flex min-w-0 flex-wrap items-center gap-2",
  );
});

test("workflowTimelineMiniChipClass preserves compact chip shells", () => {
  assert.equal(
    workflowTimelineMiniChipClass("sky-strong"),
    "rounded-full border border-sky-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700",
  );
  assert.equal(
    workflowTimelineMiniChipClass("sky-soft"),
    "rounded-full border border-sky-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-sky-600",
  );
  assert.equal(
    workflowTimelineMiniChipClass("violet"),
    "rounded-full border border-violet-200/70 bg-violet-50/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-violet-700",
  );
});

test("workflowTimelineInteractiveMiniChipClass preserves interactive compact chip styling", () => {
  assert.equal(
    workflowTimelineInteractiveMiniChipClass("sky-strong"),
    "rounded-full border border-sky-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700 transition hover:bg-white",
  );
});

test("workflowTimelineSectionLabelClass preserves section heading tones", () => {
  assert.equal(
    workflowTimelineSectionLabelClass("violet"),
    "text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700",
  );
  assert.equal(
    workflowTimelineSectionLabelClass("sky"),
    "text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700",
  );
  assert.equal(workflowTimelineSectionTitle("step_events"), "Step events");
  assert.equal(workflowTimelineSectionTitle("wait_resume_event"), "Wait / resume event");
});

test("workflowTimelineSecondaryTextClass preserves muted summary spacing rules", () => {
  assert.equal(workflowTimelineSecondaryTextClass(), "text-xs text-on-surface-variant");
  assert.equal(workflowTimelineSecondaryTextClass("sm"), "mt-1 text-xs text-on-surface-variant");
  assert.equal(workflowTimelineSecondaryTextClass("md"), "mt-2 text-xs text-on-surface-variant");
});

test("workflowTimelineSecondaryTextSpacingDisplayValue preserves rendered summary spacing choices", () => {
  assert.equal(workflowTimelineSecondaryTextSpacingDisplayValue(), "none");
  assert.equal(workflowTimelineSecondaryTextSpacingDisplayValue("sm"), "sm");
  assert.equal(workflowTimelineSecondaryTextSpacingDisplayValue("md"), "md");
});

test("workflowTimelineSectionContainerClass preserves sky and violet section wrappers", () => {
  assert.equal(
    workflowTimelineSectionContainerClass("sky"),
    "mt-3 rounded-2xl border border-sky-200/70 bg-sky-50/70 px-3 py-3",
  );
  assert.equal(
    workflowTimelineSectionContainerClass("violet"),
    "mt-3 space-y-2 rounded-2xl border border-violet-200/60 bg-violet-50/50 px-3 py-3",
  );
  assert.equal(
    workflowTimelineSectionContainerClass("sky", "sm"),
    "mt-3 rounded-2xl border border-sky-200/70 bg-sky-50/70 px-3 py-2",
  );
});

test("workflowTimelineSectionToneDisplayValue preserves rendered section tones", () => {
  assert.equal(workflowTimelineSectionToneDisplayValue("sky"), "sky");
  assert.equal(workflowTimelineSectionToneDisplayValue("violet"), "violet");
});

test("workflowTimelineSectionPaddingDisplayValue preserves rendered section padding modes", () => {
  assert.equal(workflowTimelineSectionPaddingDisplayValue("md"), "md");
  assert.equal(workflowTimelineSectionPaddingDisplayValue("sm"), "sm");
});

test("workflowTimelineDefaultSectionPaddingDisplayValue preserves rendered default section padding", () => {
  assert.equal(
    workflowTimelineDefaultSectionPaddingDisplayValue(),
    "md",
  );
});

test("workflowTimelineSectionTitleDisplayValue preserves rendered section title keys", () => {
  assert.equal(workflowTimelineSectionTitleDisplayValue("step_events"), "step_events");
  assert.equal(
    workflowTimelineSectionTitleDisplayValue("wait_resume_event"),
    "wait_resume_event",
  );
});

test("workflowTimelineDeploymentButtonKindDisplayValue preserves rendered deployment button kinds", () => {
  assert.equal(workflowTimelineDeploymentIdInputDisplayValue("dep_123"), "dep_123");
  assert.equal(workflowTimelineDeploymentIdInputDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalDeploymentIdDisplayValue("dep_123"), "dep_123");
  assert.equal(
    workflowTimelineOptionalDeploymentIdDisplayValue("dep_replay_original"),
    "dep_replay_original",
  );
  assert.equal(
    workflowTimelineOptionalDeploymentIdDisplayValue("dep_replay_effective"),
    "dep_replay_effective",
  );
  assert.equal(
    workflowTimelineOptionalDeploymentIdDisplayValue("dep_replay_compared"),
    "dep_replay_compared",
  );
  assert.equal(workflowTimelineOptionalDeploymentIdDisplayValue(null), null);
  assert.equal(
    workflowTimelineDeploymentButtonKindDisplayValue("deployment"),
    "deployment",
  );
  assert.equal(
    workflowTimelineDeploymentButtonKindDisplayValue("original_deploy"),
    "original_deploy",
  );
  assert.equal(
    workflowTimelineDeploymentButtonKindDisplayValue("replay_deploy"),
    "replay_deploy",
  );
  assert.equal(
    workflowTimelineDeploymentButtonKindDisplayValue("compared"),
    "compared",
  );
});

test("workflowTimelineDeploymentButtonToneDisplayValue preserves rendered deployment button tones", () => {
  assert.equal(
    workflowTimelineDeploymentButtonToneDisplayValue("sky"),
    "sky",
  );
  assert.equal(
    workflowTimelineDeploymentButtonToneDisplayValue("indigo"),
    "indigo",
  );
});

test("workflowTimelineDeploymentButtonSelectedDisplayValue preserves rendered deployment button selection state", () => {
  assert.equal(
    workflowTimelineSelectedDeploymentRecordIdInputDisplayValue("dep_123"),
    "dep_123",
  );
  assert.equal(workflowTimelineSelectedDeploymentRecordIdInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineDeploymentSelectionTargetInputDisplayValue("dep_123"),
    "dep_123",
  );
  assert.equal(
    workflowTimelineDeploymentFocusTargetInputDisplayValue("dep_123"),
    "dep_123",
  );
  assert.equal(
    workflowTimelineDeploymentButtonSelectionStateDisplayValue("dep_123", "dep_123"),
    true,
  );
  assert.equal(
    workflowTimelineDeploymentButtonSelectionStateDisplayValue("dep_999", "dep_123"),
    false,
  );
  assert.equal(
    workflowTimelineDeploymentButtonSelectedDisplayValue(true),
    true,
  );
  assert.equal(
    workflowTimelineDeploymentButtonSelectedDisplayValue(false),
    false,
  );
});

test("workflowTimeline event row helpers preserve card, pill, title, and summary styling", () => {
  assert.deepEqual(
    workflowTimelinePayloadChipsInputDisplayValue(["size 2", "has payload"]),
    ["size 2", "has payload"],
  );
  assert.equal(workflowTimelinePayloadChipsInputDisplayValue(null), null);
  assert.deepEqual(
    workflowTimelineOptionalPayloadChipsDisplayValue(["size 2", "has payload"]),
    ["size 2", "has payload"],
  );
  assert.equal(workflowTimelineOptionalPayloadChipsDisplayValue(null), null);
  assert.deepEqual(
    workflowTimelinePayloadChipsValueInputDisplayValue(["size 2", "has payload"]),
    ["size 2", "has payload"],
  );
  assert.deepEqual(
    workflowTimelinePayloadChipsDisplayValue(["size 2", "has payload"]),
    ["size 2", "has payload"],
  );
  assert.equal(
    workflowTimelineEventCardClass(),
    "rounded-xl border border-white/70 bg-white/80 px-3 py-2",
  );
  assert.equal(
    workflowTimelineEventKindChipClass(),
    "rounded-full bg-violet-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700",
  );
  assert.equal(
    workflowTimelineEventKindInputDisplayValue("wait_resume_timeout"),
    "wait_resume_timeout",
  );
  assert.equal(
    workflowTimelineEventKindDisplayValue("wait_resume_timeout"),
    "wait_resume_timeout",
  );
  assert.equal(workflowTimelineEventKindLabel("wait_resume_timeout"), "wait resume timeout");
  assert.equal(
    workflowTimelineEventTitleClass(),
    "text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700",
  );
  assert.equal(
    workflowTimelineEventTitleDisplayValue("request queued"),
    "request queued",
  );
  assert.equal(
    workflowTimelineEventTitleInputDisplayValue("request queued"),
    "request queued",
  );
  assert.equal(
    workflowTimelineEventTitleLabel("request queued"),
    "request queued",
  );
  assert.equal(
    workflowTimelineEventSummaryInputDisplayValue("request queued for approval"),
    "request queued for approval",
  );
  assert.equal(
    workflowTimelineEventSummaryDisplayValue("request queued for approval"),
    "request queued for approval",
  );
  assert.equal(
    workflowTimelineEventSummaryLabel("request queued for approval"),
    "request queued for approval",
  );
  assert.equal(
    workflowTimelineEventSummaryLabel("awaiting provider response"),
    "awaiting provider response",
  );
  assert.equal(
    workflowTimelinePayloadChipInputDisplayValue("tenant: acme"),
    "tenant: acme",
  );
  assert.equal(
    workflowTimelinePayloadChipDisplayValue("tenant: acme"),
    "tenant: acme",
  );
  assert.equal(
    workflowTimelinePayloadChipLabel("tenant: acme"),
    "tenant: acme",
  );
  assert.equal(
    workflowTimelinePolicySummaryLabel("policy fields updated from replay snapshot"),
    "policy fields updated from replay snapshot",
  );
  assert.equal(
    workflowTimelinePolicySummaryInputDisplayValue(
      "policy fields updated from replay snapshot",
    ),
    "policy fields updated from replay snapshot",
  );
  assert.equal(
    workflowTimelinePolicySummaryDisplayValue("policy fields updated from replay snapshot"),
    "policy fields updated from replay snapshot",
  );
  assert.equal(
    workflowTimelinePayloadChipLabel("retrying provider"),
    "retrying provider",
  );
  assert.equal(
    workflowTimelinePayloadChipRowClass(),
    "mt-2 flex flex-wrap gap-2",
  );
  assert.equal(
    workflowTimelinePolicySummaryTextClass(),
    "mt-2 text-xs text-sky-900",
  );
});

test("workflowTimelineNarrativeClass preserves narrative callout shell", () => {
  assert.equal(
    workflowTimelineNarrativeClass("border-emerald-200 bg-emerald-50 text-emerald-900"),
    "mt-3 rounded-2xl border px-3 py-2 text-sm border-emerald-200 bg-emerald-50 text-emerald-900",
  );
});

test("workflowTimelineNarrativeToneDisplayClass preserves rendered narrative tone", () => {
  assert.equal(
    workflowTimelineNarrativeToneDisplayClass("border-emerald-200 bg-emerald-50 text-emerald-900"),
    "border-emerald-200 bg-emerald-50 text-emerald-900",
  );
});

test("workflowTimelineNarrativeLabel preserves narrative copy", () => {
  assert.equal(
    workflowTimelineNarrativeInputDisplayValue("Replay diverged after provider fallback."),
    "Replay diverged after provider fallback.",
  );
  assert.equal(
    workflowTimelineNarrativeDisplayValue("Replay diverged after provider fallback."),
    "Replay diverged after provider fallback.",
  );
  assert.equal(
    workflowTimelineNarrativeLabel("Replay diverged after provider fallback."),
    "Replay diverged after provider fallback.",
  );
});

test("workflowTimelineDeploymentButtonShellClass preserves deployment button shell styling", () => {
  assert.equal(
    workflowTimelineDeploymentButtonShellClass(true, "sky"),
    "max-w-full break-words rounded-full border px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] transition sm:py-1 border-sky-300/80 bg-sky-100 text-sky-800",
  );
  assert.equal(
    workflowTimelineDeploymentButtonShellClass(false, "indigo"),
    "max-w-full break-words rounded-full border px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] transition sm:py-1 border-indigo-200/70 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100",
  );
  assert.equal(
    workflowTimelineDeploymentButtonDeploymentIdValueInputDisplayValue("dep_123"),
    "dep_123",
  );
  assert.equal(
    workflowTimelineDeploymentButtonDeploymentIdDisplayValue("dep_123"),
    "dep_123",
  );
  assert.equal(workflowTimelineDeploymentButtonLabel("deployment", "dep_123"), "deployment dep_123");
  assert.equal(
    workflowTimelineDeploymentButtonLabel("original_deploy", "dep_123"),
    "original deploy dep_123",
  );
  assert.equal(
    workflowTimelineDeploymentButtonLabel("replay_deploy", "dep_123"),
    "replay deploy dep_123",
  );
  assert.equal(workflowTimelineDeploymentButtonLabel("compared", "dep_123"), "compared dep_123");
});

test("workflowTimelineReplayMatchBadgeClass preserves the full replay badge shell", () => {
  assert.equal(
    workflowTimelineReplayMatchBadgeClass(true),
    "rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] border-emerald-200/70 bg-emerald-50/80 text-emerald-700",
  );
  assert.equal(
    workflowTimelineReplayMatchBadgeClass(false),
    "rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] border-amber-200/70 bg-amber-50/80 text-amber-700",
  );
});

test("workflowTimelineReplayMatchBadgePresentation preserves the full replay badge contract", () => {
  assert.deepEqual(workflowTimelineReplayMatchBadgePresentation(true), {
    className:
      "rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] border-emerald-200/70 bg-emerald-50/80 text-emerald-700",
    label: "matched replay",
  });
  assert.deepEqual(workflowTimelineReplayMatchBadgePresentation(false), {
    className:
      "rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] border-amber-200/70 bg-amber-50/80 text-amber-700",
    label: "drifted replay",
  });
});

test("workflowTimelineOptionalReplayMatchBadgePresentation preserves optional replay badge rules", () => {
  assert.equal(workflowTimelineReplayMatchedOriginalInputDisplayValue(false), false);
  assert.equal(workflowTimelineReplayMatchedOriginalInputDisplayValue(null), null);
  assert.equal(workflowTimelineReplayMatchedOriginalDisplayValue(false), false);
  assert.equal(workflowTimelineReplayMatchedOriginalDisplayValue(null), null);
  assert.deepEqual(
    workflowTimelineOptionalReplayMatchBadgeDisplayValue(
      workflowTimelineReplayMatchBadgeInputDisplayValue(
        workflowTimelineOptionalReplayMatchBadgePresentation(false),
      ),
    ),
    {
      className:
        "rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] border-amber-200/70 bg-amber-50/80 text-amber-700",
      label: "drifted replay",
    },
  );
  assert.deepEqual(
    workflowTimelineReplayMatchBadgeInputDisplayValue({
      className:
        "rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] border-amber-200/70 bg-amber-50/80 text-amber-700",
      label: "drifted replay",
    }),
    {
      className:
        "rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] border-amber-200/70 bg-amber-50/80 text-amber-700",
      label: "drifted replay",
    },
  );
  assert.deepEqual(
    workflowTimelineOptionalReplayMatchBadgeDisplayValue({
      className:
        "rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] border-amber-200/70 bg-amber-50/80 text-amber-700",
      label: "drifted replay",
    }),
    {
      className:
        "rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] border-amber-200/70 bg-amber-50/80 text-amber-700",
      label: "drifted replay",
    },
  );
  assert.equal(workflowTimelineOptionalReplayMatchBadgeDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalReplayMatchBadgePresentation(null), null);
  assert.equal(workflowTimelineOptionalReplayMatchBadgePresentation(undefined), null);
  assert.deepEqual(workflowTimelineOptionalReplayMatchBadgePresentation(false), {
    className:
      "rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] border-amber-200/70 bg-amber-50/80 text-amber-700",
    label: "drifted replay",
  });
});

test("workflowTimelineStartedCompletedSummary preserves started/completed copy rules", () => {
  assert.equal(
    workflowTimelineOptionalStartedCompletedDisplayValue(
      workflowTimelineStartedCompletedInputDisplayValue(
        workflowTimelineStartedCompletedSummary("2m ago", "just now"),
      ),
    ),
    "started 2m ago / completed just now",
  );
  assert.equal(
    workflowTimelineStartedCompletedInputDisplayValue("started 2m ago / completed just now"),
    "started 2m ago / completed just now",
  );
  assert.equal(workflowTimelineStartedCompletedInputDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalStartedCompletedDisplayValue(null), null);
  assert.equal(workflowTimelineStartedCompletedSummary(null, null), null);
  assert.equal(workflowTimelineStartedCompletedSummary("2m ago", null), "started 2m ago");
  assert.equal(workflowTimelineStartedCompletedSummary(null, "just now"), "completed just now");
  assert.equal(
    workflowTimelineStartedCompletedSummary("2m ago", "just now"),
    "started 2m ago / completed just now",
  );
});

test("workflowTimelineStartedCompletedLabel preserves rendered summary copy", () => {
  assert.equal(
    workflowTimelineStartedCompletedValueInputDisplayValue(
      "started 2m ago / completed just now",
    ),
    "started 2m ago / completed just now",
  );
  assert.equal(
    workflowTimelineStartedCompletedDisplayValue("started 2m ago / completed just now"),
    "started 2m ago / completed just now",
  );
  assert.equal(
    workflowTimelineStartedCompletedLabel("started 2m ago / completed just now"),
    "started 2m ago / completed just now",
  );
});

test("workflowTimelineCountSummary preserves singular and plural card metadata copy", () => {
  assert.equal(workflowTimelineCountSummary(1, "edge", "selected"), "1 selected edge");
  assert.equal(workflowTimelineCountSummary(3, "edge", "selected"), "3 selected edges");
  assert.equal(workflowTimelineCountSummary(2, "edge", "skipped"), "2 skipped edges");
  assert.equal(workflowTimelineCountSummary(1, "option"), "1 option");
  assert.equal(workflowTimelineCountSummary(4, "option"), "4 options");
});

test("workflowTimelineRuntimeSummary preserves runtime and duration copy", () => {
  assert.equal(workflowTimelineRuntimeSummaryInputDisplayValue("action"), "action");
  assert.equal(
    workflowTimelineRuntimeSummaryInputDisplayValue("action / 42s"),
    "action / 42s",
  );
  assert.equal(workflowTimelineRuntimeSummary("action", null), "action");
  assert.equal(workflowTimelineRuntimeSummary("action", "42s"), "action / 42s");
});

test("workflowTimelineRuntimeHeaderDetailLabel preserves rendered runtime header copy", () => {
  assert.equal(
    workflowTimelineRuntimeHeaderDetailDisplayValue("action / 320ms"),
    "action / 320ms",
  );
  assert.equal(
    workflowTimelineRuntimeHeaderDetailLabel("action / 320ms"),
    "action / 320ms",
  );
});

test("workflowTimelineReplayMatchPresentation preserves replay drift badge policy", () => {
  assert.deepEqual(workflowTimelineReplayMatchPresentation(true), {
    className: "border-emerald-200/70 bg-emerald-50/80 text-emerald-700",
    label: "matched replay",
  });
  assert.deepEqual(workflowTimelineReplayMatchPresentation(false), {
    className: "border-amber-200/70 bg-amber-50/80 text-amber-700",
    label: "drifted replay",
  });
});

test("workflowTimelineTokenLabel normalizes underscore-delimited metadata labels", () => {
  assert.equal(workflowTimelineTokenLabel("wait_resume_timeout"), "wait resume timeout");
  assert.equal(workflowTimelineTokenLabel("node_completed"), "node completed");
  assert.equal(workflowTimelineTokenLabel("manual"), "manual");
  assert.equal(workflowTimelineTokenLabel(null), "");
});

test("workflowTimelineDistinctResumeKindLabel preserves wait/resume kind display rules", () => {
  assert.equal(
    workflowTimelineResumeKindFamilyInputDisplayValue("wait_resume_timeout"),
    "wait_resume_timeout",
  );
  assert.equal(
    workflowTimelineResumeKindValueInputDisplayValue("human_resume"),
    "human_resume",
  );
  assert.equal(
    workflowTimelineResumeKindFamilyDisplayValue("wait_resume_timeout"),
    "wait_resume_timeout",
  );
  assert.equal(
    workflowTimelineResumeKindValueDisplayValue("human_resume"),
    "human_resume",
  );
  assert.equal(
    workflowTimelineDistinctResumeKindLabel("wait_resume_timeout", "wait_resume_timeout"),
    null,
  );
  assert.equal(
    workflowTimelineDistinctResumeKindLabel("wait_resume_timeout", "human_resume"),
    "human resume",
  );
  assert.equal(workflowTimelineDistinctResumeKindLabel(null, null), null);
});

test("workflowTimelineResumeKindDisplayLabel preserves rendered resume-kind copy", () => {
  assert.equal(
    workflowTimelineDistinctResumeKindInputDisplayValue("human resume"),
    "human resume",
  );
  assert.equal(workflowTimelineDistinctResumeKindInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalDistinctResumeKindDisplayValue("human resume"),
    "human resume",
  );
  assert.equal(workflowTimelineOptionalDistinctResumeKindDisplayValue(null), null);
  assert.equal(
    workflowTimelineDistinctResumeKindDisplayValue("human resume"),
    "human resume",
  );
  assert.equal(
    workflowTimelineDistinctResumeKindValueInputDisplayValue("human resume"),
    "human resume",
  );
  assert.equal(
    workflowTimelineResumeKindDisplayLabel("human resume"),
    "human resume",
  );
});

test("workflowTimelineStepNodeLabel preserves policy snapshot node label fallback", () => {
  assert.equal(workflowTimelineStepNodeLabel("Policy node", "node_123"), "Policy node");
  assert.equal(workflowTimelineStepNodeLabel(null, "node_123"), "node_123");
  assert.equal(workflowTimelineStepNodeLabelInputDisplayValue("Policy node"), "Policy node");
  assert.equal(workflowTimelineStepNodeLabelInputDisplayValue(null), null);
  assert.equal(workflowTimelineStepNodeDisplayValue("Policy node"), "Policy node");
  assert.equal(workflowTimelineStepNodeDisplayValue(null), null);
  assert.equal(workflowTimelineStepNodeIdInputDisplayValue("node_123"), "node_123");
  assert.equal(workflowTimelineStepNodeIdInputDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalStepNodeIdDisplayValue("node_123"), "node_123");
  assert.equal(workflowTimelineOptionalStepNodeIdDisplayValue(null), null);
  assert.equal(
    workflowTimelineSelectedNodeTargetInputDisplayValue("node_123"),
    "node_123",
  );
  assert.equal(workflowTimelineStepNodeIdValueInputDisplayValue("node_123"), "node_123");
  assert.equal(workflowTimelineStepNodeIdDisplayValue("node_123"), "node_123");
  assert.equal(
    workflowTimelineStepNodeButtonLabel("Policy node", "node_123"),
    "node Policy node",
  );
  assert.equal(
    workflowTimelineStepNodeButtonLabel(null, "node_123"),
    "node node_123",
  );
});

test("workflowTimelinePolicySourceLabel preserves policy snapshot source fallback", () => {
  assert.equal(workflowTimelinePolicySourceLabel("approval diff"), "approval diff");
  assert.equal(workflowTimelinePolicySourceLabel(null), "policy update");
});

test("workflowTimelinePolicySourceDisplayValue preserves rendered policy source input", () => {
  assert.equal(
    workflowTimelinePolicySourceInputDisplayValue("approval diff"),
    "approval diff",
  );
  assert.equal(workflowTimelinePolicySourceInputDisplayValue(null), null);
  assert.equal(
    workflowTimelinePolicySourceDisplayValue("approval diff"),
    "approval diff",
  );
  assert.equal(workflowTimelinePolicySourceDisplayValue(null), null);
});

test("workflowTimelineOptionalPolicyFieldChangesDisplayValue preserves policy section visibility input", () => {
  assert.deepEqual(
    workflowTimelinePolicyFieldChangesInputDisplayValue([{ key: "region" }]),
    [{ key: "region" }],
  );
  assert.deepEqual(
    workflowTimelineOptionalPolicyFieldChangesDisplayValue([{ key: "region" }]),
    [{ key: "region" }],
  );
  assert.equal(workflowTimelineOptionalPolicyFieldChangesDisplayValue([]), null);
});

test("workflowTimelineOptionalTraceEventsDisplayValue preserves step-events section visibility input", () => {
  assert.deepEqual(
    workflowTimelineTraceEventsInputDisplayValue([{ kind: "started" }]),
    [{ kind: "started" }],
  );
  assert.deepEqual(
    workflowTimelineOptionalTraceEventsDisplayValue([{ kind: "started" }]),
    [{ kind: "started" }],
  );
  assert.equal(workflowTimelineOptionalTraceEventsDisplayValue([]), null);
});

test("workflowTimelineTraceEventsDisplayValue preserves rendered step-events list input", () => {
  const traceEvents = [{ kind: "started" }, { kind: "completed" }];
  assert.deepEqual(workflowTimelineTraceEventsDisplayValue(traceEvents), traceEvents);
});

test("workflowTimelineReviewSnapshotLabel preserves policy snapshot action copy", () => {
  assert.equal(
    workflowTimelineDeploymentSelectorIdInputDisplayValue("deploy_123"),
    "deploy_123",
  );
  assert.equal(workflowTimelineDeploymentSelectorIdInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalDeploymentSelectorIdDisplayValue("deploy_123"),
    "deploy_123",
  );
  assert.equal(workflowTimelineOptionalDeploymentSelectorIdDisplayValue(null), null);
  assert.equal(workflowTimelineReviewSnapshotLabel(), "review snapshot");
});

test("workflowTimelineDecisionPointLabel preserves decision chip copy", () => {
  assert.equal(
    workflowTimelineDecisionPointInputDisplayValue("decision_42"),
    "decision_42",
  );
  assert.equal(workflowTimelineDecisionPointInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalDecisionPointDisplayValue("decision_42"),
    "decision_42",
  );
  assert.equal(workflowTimelineOptionalDecisionPointDisplayValue(null), null);
  assert.equal(
    workflowTimelineDecisionPointValueInputDisplayValue("decision_42"),
    "decision_42",
  );
  assert.equal(
    workflowTimelineDecisionPointDisplayValue("decision_42"),
    "decision_42",
  );
  assert.equal(workflowTimelineDecisionPointLabel("decision_42"), "decision decision_42");
});

test("workflowTimelineTargetNodeLabel preserves selected-target chip copy", () => {
  assert.equal(workflowTimelineTargetNodeInputDisplayValue("node_42"), "node_42");
  assert.equal(workflowTimelineTargetNodeInputDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalTargetNodeDisplayValue("node_42"), "node_42");
  assert.equal(workflowTimelineOptionalTargetNodeDisplayValue(null), null);
  assert.equal(workflowTimelineTargetNodeValueInputDisplayValue("node_42"), "node_42");
  assert.equal(workflowTimelineTargetNodeDisplayValue("node_42"), "node_42");
  assert.equal(workflowTimelineTargetNodeLabel("node_42"), "target node_42");
});

test("workflowTimelineTraceSourceLabel preserves trace-source chip copy", () => {
  assert.equal(
    workflowTimelineTraceSourceInputDisplayValue("wait_resume_timeout"),
    "wait_resume_timeout",
  );
  assert.equal(workflowTimelineTraceSourceInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineTraceSourceValueInputDisplayValue("wait_resume_timeout"),
    "wait_resume_timeout",
  );
  assert.equal(
    workflowTimelineOptionalTraceSourceDisplayValue("wait_resume_timeout"),
    "wait_resume_timeout",
  );
  assert.equal(workflowTimelineOptionalTraceSourceDisplayValue(null), null);
  assert.equal(
    workflowTimelineTraceSourceDisplayValue("wait_resume_timeout"),
    "wait_resume_timeout",
  );
  assert.equal(workflowTimelineTraceSourceLabel("wait_resume_timeout"), "source wait resume timeout");
});

test("workflowTimelineTraceDetailLabel preserves trace-detail chip copy", () => {
  assert.equal(
    workflowTimelineTraceDetailInputDisplayValue("full_payload"),
    "full_payload",
  );
  assert.equal(workflowTimelineTraceDetailInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineTraceDetailValueInputDisplayValue("full_payload"),
    "full_payload",
  );
  assert.equal(
    workflowTimelineOptionalTraceDetailDisplayValue("full_payload"),
    "full_payload",
  );
  assert.equal(workflowTimelineOptionalTraceDetailDisplayValue(null), null);
  assert.equal(
    workflowTimelineTraceDetailDisplayValue("full_payload"),
    "full_payload",
  );
  assert.equal(workflowTimelineTraceDetailLabel("full_payload"), "detail full payload");
});

test("workflowTimelineTraceSideEffectsLabel preserves trace-side-effects chip copy", () => {
  assert.equal(
    workflowTimelineTraceSideEffectsInputDisplayValue("writes_memory"),
    "writes_memory",
  );
  assert.equal(workflowTimelineTraceSideEffectsInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineTraceSideEffectsValueInputDisplayValue("writes_memory"),
    "writes_memory",
  );
  assert.equal(
    workflowTimelineOptionalTraceSideEffectsDisplayValue("writes_memory"),
    "writes_memory",
  );
  assert.equal(workflowTimelineOptionalTraceSideEffectsDisplayValue(null), null);
  assert.equal(
    workflowTimelineTraceSideEffectsDisplayValue("writes_memory"),
    "writes_memory",
  );
  assert.equal(
    workflowTimelineTraceSideEffectsLabel("writes_memory"),
    "effects writes memory",
  );
});

test("workflowTimelineTraceExecutionLabel preserves trace-execution chip copy", () => {
  assert.equal(
    workflowTimelineTraceExecutionInputDisplayValue("background_run"),
    "background_run",
  );
  assert.equal(workflowTimelineTraceExecutionInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineTraceExecutionValueInputDisplayValue("background_run"),
    "background_run",
  );
  assert.equal(
    workflowTimelineOptionalTraceExecutionDisplayValue("background_run"),
    "background_run",
  );
  assert.equal(workflowTimelineOptionalTraceExecutionDisplayValue(null), null);
  assert.equal(
    workflowTimelineTraceExecutionDisplayValue("background_run"),
    "background_run",
  );
  assert.equal(
    workflowTimelineTraceExecutionLabel("background_run"),
    "execution background run",
  );
});

test("workflowTimelineTracePhaseLabel preserves trace-phase chip copy", () => {
  assert.equal(
    workflowTimelineTracePhaseInputDisplayValue("preflight_check"),
    "preflight_check",
  );
  assert.equal(workflowTimelineTracePhaseInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalTracePhaseDisplayValue("preflight_check"),
    "preflight_check",
  );
  assert.equal(workflowTimelineOptionalTracePhaseDisplayValue(null), null);
  assert.equal(
    workflowTimelineTracePhaseValueInputDisplayValue("preflight_check"),
    "preflight_check",
  );
  assert.equal(
    workflowTimelineTracePhaseDisplayValue("preflight_check"),
    "preflight_check",
  );
  assert.equal(
    workflowTimelineTracePhaseLabel("preflight_check"),
    "phase preflight check",
  );
});

test("workflowTimelineCheckpointLabel preserves checkpoint chip copy", () => {
  assert.equal(
    workflowTimelineCheckpointInputDisplayValue("after_retry"),
    "after_retry",
  );
  assert.equal(workflowTimelineCheckpointInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalCheckpointDisplayValue("after_retry"),
    "after_retry",
  );
  assert.equal(workflowTimelineOptionalCheckpointDisplayValue(null), null);
  assert.equal(
    workflowTimelineCheckpointValueInputDisplayValue("after_retry"),
    "after_retry",
  );
  assert.equal(
    workflowTimelineCheckpointDisplayValue("after_retry"),
    "after_retry",
  );
  assert.equal(
    workflowTimelineCheckpointLabel("after_retry"),
    "checkpoint after retry",
  );
});

test("workflowTimelineOutcomeLabel preserves outcome chip copy", () => {
  assert.equal(workflowTimelineOutcomeInputDisplayValue("completed"), "completed");
  assert.equal(workflowTimelineOutcomeInputDisplayValue(null), null);
  assert.equal(workflowTimelineOutcomeValueInputDisplayValue("completed"), "completed");
  assert.equal(workflowTimelineOptionalOutcomeDisplayValue("completed"), "completed");
  assert.equal(workflowTimelineOptionalOutcomeDisplayValue(null), null);
  assert.equal(workflowTimelineOutcomeDisplayValue("completed"), "completed");
  assert.equal(workflowTimelineOutcomeLabel("completed"), "outcome completed");
});

test("workflowTimelineConnectorStatusLabel preserves connector-status chip copy", () => {
  assert.equal(
    workflowTimelineConnectorStatusInputDisplayValue("rate_limited"),
    "rate_limited",
  );
  assert.equal(workflowTimelineConnectorStatusInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineConnectorStatusValueInputDisplayValue("rate_limited"),
    "rate_limited",
  );
  assert.equal(
    workflowTimelineOptionalConnectorStatusDisplayValue("rate_limited"),
    "rate_limited",
  );
  assert.equal(workflowTimelineOptionalConnectorStatusDisplayValue(null), null);
  assert.equal(
    workflowTimelineConnectorStatusDisplayValue("rate_limited"),
    "rate_limited",
  );
  assert.equal(
    workflowTimelineConnectorStatusLabel("rate_limited"),
    "status rate limited",
  );
});

test("workflowTimelineAuthModeLabel preserves auth-mode chip copy", () => {
  assert.equal(
    workflowTimelineAuthModeInputDisplayValue("service_account"),
    "service_account",
  );
  assert.equal(workflowTimelineAuthModeInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalAuthModeDisplayValue("service_account"),
    "service_account",
  );
  assert.equal(workflowTimelineOptionalAuthModeDisplayValue(null), null);
  assert.equal(
    workflowTimelineAuthModeValueInputDisplayValue("service_account"),
    "service_account",
  );
  assert.equal(workflowTimelineAuthModeDisplayValue("service_account"), "service_account");
  assert.equal(
    workflowTimelineAuthModeLabel("service_account"),
    "auth service account",
  );
});

test("workflowTimelineServiceLabel preserves service chip copy", () => {
  assert.equal(workflowTimelineServiceInputDisplayValue("slack"), "slack");
  assert.equal(workflowTimelineServiceInputDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalServiceDisplayValue("slack"), "slack");
  assert.equal(workflowTimelineOptionalServiceDisplayValue(null), null);
  assert.equal(workflowTimelineServiceValueInputDisplayValue("slack"), "slack");
  assert.equal(workflowTimelineServiceDisplayValue("slack"), "slack");
  assert.equal(workflowTimelineServiceLabel("slack"), "service slack");
});

test("workflowTimelineProviderLabel preserves provider chip copy", () => {
  assert.equal(workflowTimelineProviderInputDisplayValue("openai"), "openai");
  assert.equal(workflowTimelineProviderInputDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalProviderDisplayValue("openai"), "openai");
  assert.equal(workflowTimelineOptionalProviderDisplayValue(null), null);
  assert.equal(workflowTimelineProviderValueInputDisplayValue("openai"), "openai");
  assert.equal(workflowTimelineProviderDisplayValue("openai"), "openai");
  assert.equal(workflowTimelineProviderLabel("openai"), "provider openai");
});

test("workflowTimelineProviderRequestLabel preserves provider-request chip copy", () => {
  assert.equal(workflowTimelineProviderRequestInputDisplayValue("req_123"), "req_123");
  assert.equal(workflowTimelineProviderRequestInputDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalProviderRequestDisplayValue("req_123"), "req_123");
  assert.equal(workflowTimelineOptionalProviderRequestDisplayValue(null), null);
  assert.equal(
    workflowTimelineProviderRequestValueInputDisplayValue("req_123"),
    "req_123",
  );
  assert.equal(workflowTimelineProviderRequestDisplayValue("req_123"), "req_123");
  assert.equal(
    workflowTimelineProviderRequestLabel("req_123"),
    "request req_123",
  );
});

test("workflowTimelineProviderStatusLabel preserves provider-status chip copy", () => {
  assert.equal(workflowTimelineProviderStatusInputDisplayValue("queued"), "queued");
  assert.equal(workflowTimelineProviderStatusInputDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalProviderStatusDisplayValue("queued"), "queued");
  assert.equal(workflowTimelineOptionalProviderStatusDisplayValue(null), null);
  assert.equal(
    workflowTimelineProviderStatusValueInputDisplayValue("queued"),
    "queued",
  );
  assert.equal(workflowTimelineProviderStatusDisplayValue("queued"), "queued");
  assert.equal(
    workflowTimelineProviderStatusLabel("queued"),
    "provider queued",
  );
});

test("workflowTimelineDeliveryTierLabel preserves delivery-tier chip copy", () => {
  assert.equal(workflowTimelineDeliveryTierInputDisplayValue("priority"), "priority");
  assert.equal(workflowTimelineDeliveryTierInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalDeliveryTierDisplayValue("priority"),
    "priority",
  );
  assert.equal(workflowTimelineOptionalDeliveryTierDisplayValue(null), null);
  assert.equal(
    workflowTimelineDeliveryTierValueInputDisplayValue("priority"),
    "priority",
  );
  assert.equal(
    workflowTimelineDeliveryTierDisplayValue("priority"),
    "priority",
  );
  assert.equal(
    workflowTimelineDeliveryTierLabel("priority"),
    "tier priority",
  );
});

test("workflowTimelineActionOperationLabel preserves action-operation chip copy", () => {
  assert.equal(
    workflowTimelineActionOperationInputDisplayValue("send_message"),
    "send_message",
  );
  assert.equal(workflowTimelineActionOperationInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalActionOperationDisplayValue("send_message"),
    "send_message",
  );
  assert.equal(workflowTimelineOptionalActionOperationDisplayValue(null), null);
  assert.equal(
    workflowTimelineActionOperationValueInputDisplayValue("send_message"),
    "send_message",
  );
  assert.equal(
    workflowTimelineActionOperationDisplayValue("send_message"),
    "send_message",
  );
  assert.equal(
    workflowTimelineActionOperationLabel("send_message"),
    "action send_message",
  );
});

test("workflowTimelineApprovalChipLabel preserves approval chip copy", () => {
  assert.equal(
    workflowTimelineApprovalChipInputDisplayValue("human_approval"),
    "human_approval",
  );
  assert.equal(workflowTimelineApprovalChipInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalApprovalChipDisplayValue("human_approval"),
    "human_approval",
  );
  assert.equal(workflowTimelineOptionalApprovalChipDisplayValue(null), null);
  assert.equal(
    workflowTimelineApprovalChipValueInputDisplayValue("human_approval"),
    "human_approval",
  );
  assert.equal(
    workflowTimelineApprovalChipDisplayValue("human_approval"),
    "human_approval",
  );
  assert.equal(
    workflowTimelineApprovalChipLabel("human_approval"),
    "approval human approval",
  );
});

test("workflowTimelineDeploymentEnvironmentLabel preserves deployment-environment chip copy", () => {
  assert.equal(
    workflowTimelineDeploymentEnvironmentInputDisplayValue("staging"),
    "staging",
  );
  assert.equal(workflowTimelineDeploymentEnvironmentInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalDeploymentEnvironmentDisplayValue("staging"),
    "staging",
  );
  assert.equal(
    workflowTimelineOptionalDeploymentEnvironmentDisplayValue(null),
    null,
  );
  assert.equal(
    workflowTimelineDeploymentEnvironmentValueInputDisplayValue("staging"),
    "staging",
  );
  assert.equal(
    workflowTimelineDeploymentEnvironmentDisplayValue("staging"),
    "staging",
  );
  assert.equal(
    workflowTimelineDeploymentEnvironmentLabel("staging"),
    "env staging",
  );
});

test("workflowTimelineReplayRunLabel preserves replay-run chip copy", () => {
  assert.equal(workflowTimelineReplayRunInputDisplayValue("run_123"), "run_123");
  assert.equal(workflowTimelineReplayRunInputDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalReplayRunDisplayValue("run_123"), "run_123");
  assert.equal(workflowTimelineOptionalReplayRunDisplayValue(null), null);
  assert.equal(workflowTimelineReplayRunValueInputDisplayValue("run_123"), "run_123");
  assert.equal(workflowTimelineReplayRunDisplayValue("run_123"), "run_123");
  assert.equal(workflowTimelineReplayRunLabel("run_123"), "replay run_123");
});

test("workflowTimelineProviderRouteLabel preserves provider-route chip copy", () => {
  assert.equal(
    workflowTimelineProviderRouteInputDisplayValue("priority_lane"),
    "priority_lane",
  );
  assert.equal(workflowTimelineProviderRouteInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalProviderRouteDisplayValue("priority_lane"),
    "priority_lane",
  );
  assert.equal(workflowTimelineOptionalProviderRouteDisplayValue(null), null);
  assert.equal(
    workflowTimelineProviderRouteValueInputDisplayValue("priority_lane"),
    "priority_lane",
  );
  assert.equal(
    workflowTimelineProviderRouteDisplayValue("priority_lane"),
    "priority_lane",
  );
  assert.equal(
    workflowTimelineProviderRouteLabel("priority_lane"),
    "route priority_lane",
  );
});

test("workflowTimelineCapabilityLabel preserves capability chip copy", () => {
  assert.equal(
    workflowTimelineCapabilityInputDisplayValue("cap_sync"),
    "cap_sync",
  );
  assert.equal(workflowTimelineCapabilityInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalCapabilityDisplayValue("cap_sync"),
    "cap_sync",
  );
  assert.equal(workflowTimelineOptionalCapabilityDisplayValue(null), null);
  assert.equal(
    workflowTimelineCapabilityValueInputDisplayValue("cap_sync"),
    "cap_sync",
  );
  assert.equal(
    workflowTimelineCapabilityDisplayValue("cap_sync"),
    "cap_sync",
  );
  assert.equal(
    workflowTimelineCapabilityLabel("cap_sync"),
    "capability cap_sync",
  );
});

test("workflowTimelineOnTimeoutLabel preserves timeout-policy chip copy", () => {
  assert.equal(
    workflowTimelineOnTimeoutInputDisplayValue("retry"),
    "retry",
  );
  assert.equal(workflowTimelineOnTimeoutInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalOnTimeoutDisplayValue("retry"),
    "retry",
  );
  assert.equal(workflowTimelineOptionalOnTimeoutDisplayValue(null), null);
  assert.equal(
    workflowTimelineOnTimeoutValueInputDisplayValue("retry"),
    "retry",
  );
  assert.equal(
    workflowTimelineOnTimeoutDisplayValue("retry"),
    "retry",
  );
  assert.equal(
    workflowTimelineOnTimeoutLabel("retry"),
    "on timeout retry",
  );
});

test("workflowTimelineAllowedToolsLabel preserves allowed-tools chip copy", () => {
  assert.deepEqual(
    workflowTimelineAllowedToolsInputDisplayValue(["search", "browser"]),
    ["search", "browser"],
  );
  assert.deepEqual(
    workflowTimelineOptionalAllowedToolsDisplayValue(["search", "browser"]),
    ["search", "browser"],
  );
  assert.equal(workflowTimelineOptionalAllowedToolsDisplayValue([]), null);
  assert.deepEqual(
    workflowTimelineAllowedToolsValueInputDisplayValue(["search", "browser"]),
    ["search", "browser"],
  );
  assert.deepEqual(
    workflowTimelineAllowedToolsDisplayValue(["search", "browser"]),
    ["search", "browser"],
  );
  assert.equal(
    workflowTimelineAllowedToolsLabel(["search", "browser"]),
    "tools search, browser",
  );
});

test("workflowTimelineAllowedCapabilitiesLabel preserves allowed-capabilities chip copy", () => {
  assert.deepEqual(
    workflowTimelineAllowedCapabilitiesInputDisplayValue(["write", "deploy"]),
    ["write", "deploy"],
  );
  assert.deepEqual(
    workflowTimelineOptionalAllowedCapabilitiesDisplayValue(["write", "deploy"]),
    ["write", "deploy"],
  );
  assert.equal(workflowTimelineOptionalAllowedCapabilitiesDisplayValue([]), null);
  assert.deepEqual(
    workflowTimelineAllowedCapabilitiesValueInputDisplayValue(["write", "deploy"]),
    ["write", "deploy"],
  );
  assert.deepEqual(
    workflowTimelineAllowedCapabilitiesDisplayValue(["write", "deploy"]),
    ["write", "deploy"],
  );
  assert.equal(
    workflowTimelineAllowedCapabilitiesLabel(["write", "deploy"]),
    "allowed caps write, deploy",
  );
});

test("workflowTimelineOutboundAllowlistLabel preserves outbound-allowlist chip copy", () => {
  assert.deepEqual(
    workflowTimelineOutboundAllowlistInputDisplayValue([
      "api.openai.com",
      "example.com",
    ]),
    ["api.openai.com", "example.com"],
  );
  assert.deepEqual(
    workflowTimelineOptionalOutboundAllowlistDisplayValue([
      "api.openai.com",
      "example.com",
    ]),
    ["api.openai.com", "example.com"],
  );
  assert.equal(workflowTimelineOptionalOutboundAllowlistDisplayValue([]), null);
  assert.deepEqual(
    workflowTimelineOutboundAllowlistValueInputDisplayValue([
      "api.openai.com",
      "example.com",
    ]),
    ["api.openai.com", "example.com"],
  );
  assert.deepEqual(
    workflowTimelineOutboundAllowlistDisplayValue([
      "api.openai.com",
      "example.com",
    ]),
    ["api.openai.com", "example.com"],
  );
  assert.equal(
    workflowTimelineOutboundAllowlistLabel(["api.openai.com", "example.com"]),
    "outbound api.openai.com, example.com",
  );
});

test("workflowTimelineStatusCodeLabel preserves status-code chip copy", () => {
  assert.equal(workflowTimelineStatusCodeInputDisplayValue(429), 429);
  assert.equal(workflowTimelineStatusCodeInputDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalStatusCodeDisplayValue(429), 429);
  assert.equal(workflowTimelineOptionalStatusCodeDisplayValue(null), null);
  assert.equal(workflowTimelineStatusCodeValueInputDisplayValue(429), 429);
  assert.equal(workflowTimelineStatusCodeValueDisplayValue(429), 429);
  assert.equal(workflowTimelineStatusCodeValueDisplayValue(null), "");
  assert.equal(workflowTimelineStatusCodeDisplayValue(429), 429);
  assert.equal(workflowTimelineStatusCodeLabel(429), "code 429");
});

test("workflowTimelineLatencyLabel preserves latency chip copy", () => {
  assert.equal(workflowTimelineLatencyInputDisplayValue(83), 83);
  assert.equal(workflowTimelineLatencyInputDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalLatencyDisplayValue(83), 83);
  assert.equal(workflowTimelineOptionalLatencyDisplayValue(null), null);
  assert.equal(workflowTimelineLatencyValueInputDisplayValue(83), 83);
  assert.equal(workflowTimelineLatencyValueDisplayValue(83), 83);
  assert.equal(workflowTimelineLatencyValueDisplayValue(null), "");
  assert.equal(workflowTimelineLatencyDisplayValue(83), 83);
  assert.equal(workflowTimelineLatencyLabel(83), "latency 83ms");
});

test("workflowTimelineReplayDeltaLabel preserves replay-delta chip copy", () => {
  assert.equal(workflowTimelineReplayDeltaInputDisplayValue(2), 2);
  assert.equal(workflowTimelineReplayDeltaInputDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalReplayDeltaDisplayValue(2), 2);
  assert.equal(workflowTimelineOptionalReplayDeltaDisplayValue(null), null);
  assert.equal(workflowTimelineReplayDeltaValueInputDisplayValue(2), 2);
  assert.equal(workflowTimelineReplayDeltaValueDisplayValue(2), 2);
  assert.equal(workflowTimelineReplayDeltaValueDisplayValue(null), "");
  assert.equal(workflowTimelineReplayDeltaDisplayValue(2), 2);
  assert.equal(workflowTimelineReplayDeltaLabel(2), "replay delta 2");
});

test("workflowTimelineTimeoutLabel preserves timeout chip copy", () => {
  assert.equal(workflowTimelineTimeoutInputDisplayValue(30), 30);
  assert.equal(workflowTimelineTimeoutInputDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalTimeoutDisplayValue(30), 30);
  assert.equal(workflowTimelineOptionalTimeoutDisplayValue(null), null);
  assert.equal(workflowTimelineTimeoutValueInputDisplayValue(30), 30);
  assert.equal(workflowTimelineTimeoutValueDisplayValue(30), 30);
  assert.equal(workflowTimelineTimeoutValueDisplayValue(null), "");
  assert.equal(workflowTimelineTimeoutDisplayValue(30), 30);
  assert.equal(workflowTimelineTimeoutLabel(30), "timeout 30s");
});

test("workflowTimelineAttemptsLabel preserves attempts chip copy", () => {
  assert.equal(workflowTimelineAttemptsInputDisplayValue(3), 3);
  assert.equal(workflowTimelineAttemptsInputDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalAttemptsDisplayValue(3), 3);
  assert.equal(workflowTimelineOptionalAttemptsDisplayValue(null), null);
  assert.equal(workflowTimelineAttemptsValueInputDisplayValue(3), 3);
  assert.equal(workflowTimelineAttemptsValueDisplayValue(3), 3);
  assert.equal(workflowTimelineAttemptsValueDisplayValue(null), "");
  assert.equal(workflowTimelineAttemptsDisplayValue(3), 3);
  assert.equal(workflowTimelineAttemptsLabel(3), "attempts 3");
});

test("workflowTimelineRetriesLabel preserves retries chip copy", () => {
  assert.equal(workflowTimelineRetriesInputDisplayValue(1), 1);
  assert.equal(workflowTimelineRetriesInputDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalRetriesDisplayValue(1), 1);
  assert.equal(workflowTimelineOptionalRetriesDisplayValue(null), null);
  assert.equal(workflowTimelineRetriesValueInputDisplayValue(1), 1);
  assert.equal(workflowTimelineRetriesValueDisplayValue(1), 1);
  assert.equal(workflowTimelineRetriesValueDisplayValue(null), "");
  assert.equal(workflowTimelineRetriesDisplayValue(1), 1);
  assert.equal(workflowTimelineRetriesLabel(1), "retries 1");
});

test("workflowTimelineSelectedEdgeCountLabel preserves selected-edge chip copy", () => {
  assert.equal(workflowTimelineSelectedEdgeCountInputDisplayValue(2), 2);
  assert.equal(workflowTimelineSelectedEdgeCountInputDisplayValue(0), 0);
  assert.equal(workflowTimelineOptionalSelectedEdgeCountDisplayValue(2), 2);
  assert.equal(workflowTimelineOptionalSelectedEdgeCountDisplayValue(0), null);
  assert.equal(workflowTimelineSelectedEdgeCountValueInputDisplayValue(2), 2);
  assert.equal(workflowTimelineSelectedEdgeCountDisplayValue(2), 2);
  assert.equal(workflowTimelineSelectedEdgeCountLabel(2), "2 selected edges");
});

test("workflowTimelineSkippedEdgeCountLabel preserves skipped-edge chip copy", () => {
  assert.equal(workflowTimelineSkippedEdgeCountInputDisplayValue(2), 2);
  assert.equal(workflowTimelineSkippedEdgeCountInputDisplayValue(0), 0);
  assert.equal(workflowTimelineOptionalSkippedEdgeCountDisplayValue(2), 2);
  assert.equal(workflowTimelineOptionalSkippedEdgeCountDisplayValue(0), null);
  assert.equal(workflowTimelineSkippedEdgeCountValueInputDisplayValue(2), 2);
  assert.equal(workflowTimelineSkippedEdgeCountDisplayValue(2), 2);
  assert.equal(workflowTimelineSkippedEdgeCountLabel(2), "2 skipped edges");
});

test("workflowTimelineOptionCountLabel preserves option-count chip copy", () => {
  assert.equal(workflowTimelineOptionCountInputDisplayValue(4), 4);
  assert.equal(workflowTimelineOptionCountInputDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalOptionCountDisplayValue(4), 4);
  assert.equal(workflowTimelineOptionalOptionCountDisplayValue(null), null);
  assert.equal(workflowTimelineOptionCountValueInputDisplayValue(4), 4);
  assert.equal(workflowTimelineOptionCountValueDisplayValue(4), 4);
  assert.equal(workflowTimelineOptionCountValueDisplayValue(null), 0);
  assert.equal(workflowTimelineOptionCountDisplayValue(4), 4);
  assert.equal(workflowTimelineOptionCountLabel(4), "4 options");
});

test("workflowTimelineActionCategoryLabel preserves action-category chip copy", () => {
  assert.equal(
    workflowTimelineActionCategoryInputDisplayValue("data_sync"),
    "data_sync",
  );
  assert.equal(workflowTimelineActionCategoryInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineActionCategoryValueInputDisplayValue("data_sync"),
    "data_sync",
  );
  assert.equal(
    workflowTimelineOptionalActionCategoryDisplayValue("data_sync"),
    "data_sync",
  );
  assert.equal(workflowTimelineOptionalActionCategoryDisplayValue(null), null);
  assert.equal(workflowTimelineActionCategoryDisplayValue("data_sync"), "data_sync");
  assert.equal(
    workflowTimelineActionCategoryLabel("data_sync"),
    "data sync",
  );
});

test("workflowTimelineIntegrationFamilyLabel preserves integration-family chip copy", () => {
  assert.equal(
    workflowTimelineIntegrationFamilyInputDisplayValue("third_party_api"),
    "third_party_api",
  );
  assert.equal(workflowTimelineIntegrationFamilyInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineIntegrationFamilyValueInputDisplayValue("third_party_api"),
    "third_party_api",
  );
  assert.equal(
    workflowTimelineOptionalIntegrationFamilyDisplayValue("third_party_api"),
    "third_party_api",
  );
  assert.equal(workflowTimelineOptionalIntegrationFamilyDisplayValue(null), null);
  assert.equal(
    workflowTimelineIntegrationFamilyDisplayValue("third_party_api"),
    "third_party_api",
  );
  assert.equal(
    workflowTimelineIntegrationFamilyLabel("third_party_api"),
    "third party api",
  );
});

test("workflowTimelineTraceKindLabel preserves trace-kind chip copy", () => {
  assert.equal(
    workflowTimelineTraceKindInputDisplayValue("wait_resume_timeout"),
    "wait_resume_timeout",
  );
  assert.equal(workflowTimelineTraceKindInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalTraceKindDisplayValue("wait_resume_timeout"),
    "wait_resume_timeout",
  );
  assert.equal(workflowTimelineOptionalTraceKindDisplayValue(null), null);
  assert.equal(
    workflowTimelineTraceKindValueInputDisplayValue("wait_resume_timeout"),
    "wait_resume_timeout",
  );
  assert.equal(
    workflowTimelineTraceKindDisplayValue("wait_resume_timeout"),
    "wait_resume_timeout",
  );
  assert.equal(
    workflowTimelineTraceKindLabel("wait_resume_timeout"),
    "wait resume timeout",
  );
});

test("workflowTimelineRoutingModeLabel preserves routing-mode chip copy", () => {
  assert.equal(
    workflowTimelineRoutingModeInputDisplayValue("branch_select"),
    "branch_select",
  );
  assert.equal(workflowTimelineRoutingModeInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalRoutingModeDisplayValue("branch_select"),
    "branch_select",
  );
  assert.equal(workflowTimelineOptionalRoutingModeDisplayValue(null), null);
  assert.equal(
    workflowTimelineRoutingModeValueInputDisplayValue("branch_select"),
    "branch_select",
  );
  assert.equal(
    workflowTimelineRoutingModeDisplayValue("branch_select"),
    "branch_select",
  );
  assert.equal(
    workflowTimelineRoutingModeLabel("branch_select"),
    "branch select",
  );
});

test("workflowTimelineResumeFamilyLabel preserves resume-family chip copy", () => {
  assert.equal(
    workflowTimelineResumeFamilyInputDisplayValue("wait_resume_timeout"),
    "wait_resume_timeout",
  );
  assert.equal(workflowTimelineResumeFamilyInputDisplayValue(null), null);
  assert.equal(
    workflowTimelineOptionalResumeFamilyDisplayValue("wait_resume_timeout"),
    "wait_resume_timeout",
  );
  assert.equal(workflowTimelineOptionalResumeFamilyDisplayValue(null), null);
  assert.equal(
    workflowTimelineResumeFamilyValueInputDisplayValue("wait_resume_timeout"),
    "wait_resume_timeout",
  );
  assert.equal(
    workflowTimelineResumeFamilyDisplayValue("wait_resume_timeout"),
    "wait_resume_timeout",
  );
  assert.equal(
    workflowTimelineResumeFamilyLabel("wait_resume_timeout"),
    "wait resume timeout",
  );
});

test("workflowTimelineWaitResumeIdLabel preserves wait-resume id chip copy", () => {
  assert.equal(workflowTimelineWaitResumeIdInputDisplayValue("wr_123"), "wr_123");
  assert.equal(workflowTimelineWaitResumeIdInputDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalWaitResumeIdDisplayValue("wr_123"), "wr_123");
  assert.equal(workflowTimelineOptionalWaitResumeIdDisplayValue(null), null);
  assert.equal(workflowTimelineWaitResumeIdValueInputDisplayValue("wr_123"), "wr_123");
  assert.equal(workflowTimelineWaitResumeIdDisplayValue("wr_123"), "wr_123");
  assert.equal(workflowTimelineWaitResumeIdLabel("wr_123"), "wr_123");
});

test("workflowTimelineRouteLabel preserves selected-condition chip copy", () => {
  assert.equal(workflowTimelineRouteInputDisplayValue("approved"), "approved");
  assert.equal(workflowTimelineRouteInputDisplayValue(null), null);
  assert.equal(workflowTimelineOptionalRouteDisplayValue("approved"), "approved");
  assert.equal(workflowTimelineOptionalRouteDisplayValue(null), null);
  assert.equal(workflowTimelineRouteValueInputDisplayValue("approved"), "approved");
  assert.equal(workflowTimelineRouteDisplayValue("approved"), "approved");
  assert.equal(workflowTimelineRouteLabel("approved"), "route approved");
});

test("workflowTimelineSelectedLabelsLabel preserves selected-labels chip copy", () => {
  assert.deepEqual(
    workflowTimelineSelectedLabelsInputDisplayValue(["approved", "fallback"]),
    ["approved", "fallback"],
  );
  assert.deepEqual(
    workflowTimelineOptionalSelectedLabelsDisplayValue(["approved", "fallback"]),
    ["approved", "fallback"],
  );
  assert.equal(workflowTimelineOptionalSelectedLabelsDisplayValue([]), null);
  assert.deepEqual(
    workflowTimelineSelectedLabelsValueInputDisplayValue(["approved", "fallback"]),
    ["approved", "fallback"],
  );
  assert.deepEqual(
    workflowTimelineSelectedLabelsDisplayValue(["approved", "fallback"]),
    ["approved", "fallback"],
  );
  assert.equal(
    workflowTimelineSelectedLabelsLabel(["approved", "fallback"]),
    "labels approved, fallback",
  );
});

test("workflowTimelineListLabel preserves ordered chip list formatting", () => {
  assert.equal(workflowTimelineListLabel([]), "");
  assert.equal(workflowTimelineListLabel(["email"]), "email");
  assert.equal(workflowTimelineListLabel(["email", "calendar"]), "email, calendar");
});

test("workflowTimelineLabeledValue preserves metric and status chip copy", () => {
  assert.equal(workflowTimelineLabeledValue("code", 200), "code 200");
  assert.equal(workflowTimelineLabeledValue("latency", 83, "ms"), "latency 83ms");
  assert.equal(workflowTimelineLabeledValue("timeout", 30, "s"), "timeout 30s");
});

test("workflowTimelineApprovalModeLabel preserves approval-mode copy rules", () => {
  assert.equal(workflowTimelineApprovalModeLabel("autonomous"), "Autonomous");
  assert.equal(workflowTimelineApprovalModeLabel("suggest_only"), "Suggest only");
  assert.equal(workflowTimelineApprovalModeLabel("human_approval_required"), "Requires approval");
  assert.equal(workflowTimelineApprovalModeLabel(null), "Unknown");
});

test("workflowTimelineDeploymentButtonClass preserves selected and replay button tones", () => {
  assert.equal(
    workflowTimelineDeploymentButtonClass(true, "sky"),
    "border-sky-300/80 bg-sky-100 text-sky-800",
  );
  assert.equal(
    workflowTimelineDeploymentButtonClass(false, "sky"),
    "border-slate-200/70 bg-slate-50/90 text-slate-700 hover:bg-slate-100",
  );
  assert.equal(
    workflowTimelineDeploymentButtonClass(true, "indigo"),
    "border-indigo-300/80 bg-indigo-100 text-indigo-800",
  );
  assert.equal(
    workflowTimelineDeploymentButtonClass(false, "indigo"),
    "border-indigo-200/70 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100",
  );
});

test("workflowTimelineWaitResumeSurfaceDisplayValue preserves rendered wait-resume surface state", () => {
  assert.equal(workflowTimelineWaitResumeSurfaceInputDisplayValue(true), true);
  assert.equal(workflowTimelineWaitResumeSurfaceInputDisplayValue(false), false);
  assert.equal(workflowTimelineWaitResumeSurfaceDisplayValue(true), true);
  assert.equal(workflowTimelineWaitResumeSurfaceDisplayValue(false), false);
});

test("workflowTimelineOptionalWaitResumeEventDisplayValue preserves wait-resume section visibility input", () => {
  assert.equal(workflowTimelineWaitResumeEventInputDisplayValue(true), true);
  assert.equal(workflowTimelineWaitResumeEventInputDisplayValue(false), false);
  assert.equal(workflowTimelineOptionalWaitResumeEventDisplayValue(true), true);
  assert.equal(workflowTimelineOptionalWaitResumeEventDisplayValue(false), null);
});

test("workflowTimelineSurfacePresentation preserves wait/resume and default card palettes", () => {
  assert.deepEqual(
    workflowTimelineSurfacePresentationDisplayValue({
      containerClass: "border-sky-200/70 bg-sky-50/40",
      titleClass: "text-sky-900",
    }),
    {
      containerClass: "border-sky-200/70 bg-sky-50/40",
      titleClass: "text-sky-900",
    },
  );
  assert.deepEqual(workflowTimelineSurfacePresentation(true), {
    containerClass: "border-sky-200/70 bg-sky-50/40",
    titleClass: "text-sky-900",
  });
  assert.deepEqual(workflowTimelineSurfacePresentation(false), {
    containerClass: "border-violet-200/70 bg-white/80",
    titleClass: "text-violet-900",
  });
});

test("workflowTimelineHasMetadata stays false for cards without metadata", () => {
  assert.deepEqual(
    workflowTimelineMetadataCardInputDisplayValue(makeWorkflowTimelineMetadataCard()),
    makeWorkflowTimelineMetadataCard(),
  );
  assert.equal(workflowTimelineHasMetadata(makeWorkflowTimelineMetadataCard()), false);
});

test("workflowTimelineHasMetadata detects trace and routing metadata", () => {
  assert.deepEqual(
    workflowTimelineMetadataCardInputDisplayValue(
      makeWorkflowTimelineMetadataCard({
        traceKind: "decision",
      }),
    ),
    makeWorkflowTimelineMetadataCard({
      traceKind: "decision",
    }),
  );
  assert.equal(
    workflowTimelineHasMetadata(
      makeWorkflowTimelineMetadataCard({
        traceKind: "decision",
      }),
    ),
    true,
  );
  assert.equal(
    workflowTimelineHasMetadata(
      makeWorkflowTimelineMetadataCard({
        selectedOutgoingLabels: ["approved"],
      }),
    ),
    true,
  );
});

test("workflowTimelineHasMetadata treats numeric and boolean action state as metadata", () => {
  assert.equal(
    workflowTimelineHasMetadata(
      makeWorkflowTimelineMetadataCard({
        actionProviderLatencyMs: 0,
      }),
    ),
    true,
  );
  assert.equal(
    workflowTimelineHasMetadata(
      makeWorkflowTimelineMetadataCard({
        actionReplayMatchedOriginalDeployment: false,
      }),
    ),
    true,
  );
});
