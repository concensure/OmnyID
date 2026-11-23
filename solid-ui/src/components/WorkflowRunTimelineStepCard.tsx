// @locs-version: 1.0
import { For, Show, type Accessor, type JSX } from "solid-js";
import { timelineEventPayloadChips } from "@/lib/workflowRunAnalysis";
import {
  workflowTimelineApprovalModeLabel,
  workflowTimelineOptionalDeploymentEnvironmentDisplayValue,
  workflowTimelineDeploymentButtonShellClass,
  workflowTimelineDeploymentButtonKindDisplayValue,
  workflowTimelineDeploymentButtonDeploymentIdDisplayValue,
  workflowTimelineDeploymentButtonDeploymentIdValueInputDisplayValue,
  workflowTimelineDeploymentFocusTargetInputDisplayValue,
  workflowTimelineOptionalDeploymentIdDisplayValue,
  workflowTimelineDeploymentButtonSelectionStateDisplayValue,
  workflowTimelineDeploymentSelectionTargetInputDisplayValue,
  workflowTimelineDeploymentButtonSelectedDisplayValue,
  workflowTimelineDeploymentButtonToneDisplayValue,
  workflowTimelineDeploymentButtonLabel,
  workflowTimelineDistinctResumeKindLabel,
  workflowTimelineCountSummary,
  workflowTimelineDecisionPointLabel,
  workflowTimelineOptionalDecisionPointDisplayValue,
  workflowTimelineDecisionPointInputDisplayValue,
  workflowTimelineDecisionPointValueInputDisplayValue,
  workflowTimelineDecisionPointDisplayValue,
  workflowTimelineCardContainerClass,
  workflowTimelineFocusedEdgeDisplayValue,
  workflowTimelineFocusedEdgeInputDisplayValue,
  workflowTimelineHeaderDetailClass,
  workflowTimelineHeaderDetailEmphasisDisplayValue,
  workflowTimelineHeaderDetailRowClass,
  workflowTimelineHasMetadata,
  workflowTimelineManifestHeaderDetailDisplayValue,
  workflowTimelineManifestHeaderDetailInputDisplayValue,
  workflowTimelineManifestHeaderDetailValueInputDisplayValue,
  workflowTimelineManifestHeaderDetailEmphasisDisplayValue,
  workflowTimelineOptionalManifestHeaderDetailDisplayValue,
  workflowTimelinePrimaryHeaderDetailDisplayValue,
  workflowTimelinePrimaryHeaderDetailInputDisplayValue,
  workflowTimelinePrimaryHeaderDetailLabel,
  workflowTimelineSecondaryHeaderDetailDisplayValue,
  workflowTimelineSecondaryHeaderDetailInputDisplayValue,
  workflowTimelineSecondaryHeaderDetailEmphasisDisplayValue,
  workflowTimelineSecondaryHeaderDetailLabel,
  workflowTimelineManifestHeaderDetailLabel,
  workflowTimelineTitleRowClass,
  workflowTimelineTitleClass,
  workflowTimelineTitleLabel,
  workflowTimelineTitleObjectiveDisplayValue,
  workflowTimelineTitleObjectiveInputDisplayValue,
  workflowTimelineTitleRenderIndexDisplayValue,
  workflowTimelineTitleRenderIndexInputDisplayValue,
  workflowTimelineLabeledValue,
  workflowTimelineListLabel,
  workflowTimelineInlineChipRowClass,
  workflowTimelineMetadataChipClass,
  workflowTimelineMetadataChipToneDisplayValue,
  workflowTimelineMetadataRowClass,
  workflowTimelineInteractiveMiniChipClass,
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
  workflowTimelinePayloadChipLabel,
  workflowTimelinePayloadChipsInputDisplayValue,
  workflowTimelinePayloadChipsDisplayValue,
  workflowTimelinePayloadChipsValueInputDisplayValue,
  workflowTimelinePayloadChipDisplayValue,
  workflowTimelinePayloadChipInputDisplayValue,
  workflowTimelineOptionalPayloadChipsDisplayValue,
  workflowTimelinePayloadChipRowClass,
  workflowTimelinePolicySummaryLabel,
  workflowTimelineEventSummaryLabel,
  workflowTimelineEventTitleLabel,
  workflowTimelineEventTitleClass,
  workflowTimelineNarrativeDisplayValue,
  workflowTimelineNarrativeInputDisplayValue,
  workflowTimelineNarrativeLabel,
  workflowTimelineNarrativeClass,
  workflowTimelineNarrativeToneDisplayClass,
  workflowTimelineOptionalReplayMatchBadgePresentation,
  workflowTimelineOptionalReplayMatchBadgeDisplayValue,
  workflowTimelinePolicySummaryTextClass,
  workflowTimelinePolicySummaryInputDisplayValue,
  workflowTimelineDeploymentSelectorIdInputDisplayValue,
  workflowTimelinePolicySourceDisplayValue,
  workflowTimelinePolicySourceInputDisplayValue,
  workflowTimelinePolicySourceLabel,
  workflowTimelinePolicyFieldChangesInputDisplayValue,
  workflowTimelineOptionalDeploymentSelectorIdDisplayValue,
  workflowTimelinePolicySummaryDisplayValue,
  workflowTimelineOptionalPolicyFieldChangesDisplayValue,
  workflowTimelineRelationBadgeClass,
  workflowTimelineRelationLabelDisplayValue,
  workflowTimelineRelationDisplayValue,
  workflowTimelineRelationInputDisplayValue,
  workflowTimelineRelationLabel,
  workflowTimelineRequestSummaryInputDisplayValue,
  workflowTimelineRequestSummaryValueInputDisplayValue,
  workflowTimelineRequestSummaryDisplayValue,
  workflowTimelineReviewSnapshotLabel,
  workflowTimelineResultSummaryInputDisplayValue,
  workflowTimelineResultSummaryValueInputDisplayValue,
  workflowTimelineResultSummaryDisplayValue,
  workflowTimelineResultSummaryLabel,
  workflowTimelineOptionalResultSummaryDisplayValue,
  workflowTimelineSecondaryTextClass,
  workflowTimelineSecondaryTextSpacingDisplayValue,
  workflowTimelineSectionContainerClass,
  workflowTimelineDefaultSectionPaddingDisplayValue,
  workflowTimelineSectionPaddingDisplayValue,
  workflowTimelineSectionLabelClass,
  workflowTimelineSectionToneDisplayValue,
  workflowTimelineOptionalSelectedLabelsDisplayValue,
  workflowTimelineSelectedLabelsInputDisplayValue,
  workflowTimelineSelectedLabelsDisplayValue,
  workflowTimelineSelectedLabelsValueInputDisplayValue,
  workflowTimelineSelectedNodeTargetInputDisplayValue,
  workflowTimelineSectionTitleDisplayValue,
  workflowTimelineSelectedLabelsLabel,
  workflowTimelineSectionTitle,
  workflowTimelineRequestSummaryLabel,
  workflowTimelineOptionalRequestSummaryDisplayValue,
  workflowTimelineOptionalRouteDisplayValue,
  workflowTimelineRouteInputDisplayValue,
  workflowTimelineRouteLabel,
  workflowTimelineRouteValueInputDisplayValue,
  workflowTimelineRouteDisplayValue,
  workflowTimelineStepNodeButtonLabel,
  workflowTimelineStepNodeIdInputDisplayValue,
  workflowTimelineStepNodeIdValueInputDisplayValue,
  workflowTimelineStepNodeDisplayValue,
  workflowTimelineStepNodeLabelInputDisplayValue,
  workflowTimelineOptionalStepNodeIdDisplayValue,
  workflowTimelineStepNodeIdDisplayValue,
  workflowTimelineStepNodeLabel,
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
  workflowTimelineOptionalTraceReasonDisplayValue,
  workflowTimelineTraceReasonInputDisplayValue,
  workflowTimelineTraceReasonValueInputDisplayValue,
  workflowTimelineTraceReasonDisplayValue,
  workflowTimelineTraceReasonLabel,
  workflowTimelineTargetNodeLabel,
  workflowTimelineOptionalTargetNodeDisplayValue,
  workflowTimelineTargetNodeInputDisplayValue,
  workflowTimelineTargetNodeValueInputDisplayValue,
  workflowTimelineTargetNodeDisplayValue,
  workflowTimelineTraceSourceInputDisplayValue,
  workflowTimelineOptionalTraceSourceDisplayValue,
  workflowTimelineTraceSourceDisplayValue,
  workflowTimelineTraceSourceValueInputDisplayValue,
  workflowTimelineOptionalAuthModeDisplayValue,
  workflowTimelineAuthModeInputDisplayValue,
  workflowTimelineAuthModeValueInputDisplayValue,
  workflowTimelineAuthModeDisplayValue,
  workflowTimelineAuthModeLabel,
  workflowTimelineOptionalActionOperationDisplayValue,
  workflowTimelineActionOperationInputDisplayValue,
  workflowTimelineActionOperationValueInputDisplayValue,
  workflowTimelineActionOperationDisplayValue,
  workflowTimelineActionOperationLabel,
  workflowTimelineOptionalCheckpointDisplayValue,
  workflowTimelineCheckpointInputDisplayValue,
  workflowTimelineCheckpointValueInputDisplayValue,
  workflowTimelineCheckpointDisplayValue,
  workflowTimelineCheckpointLabel,
  workflowTimelineOptionalConnectorStatusDisplayValue,
  workflowTimelineConnectorStatusDisplayValue,
  workflowTimelineConnectorStatusLabel,
  workflowTimelineOptionalDeliveryTierDisplayValue,
  workflowTimelineDeliveryTierInputDisplayValue,
  workflowTimelineDeliveryTierValueInputDisplayValue,
  workflowTimelineDeliveryTierDisplayValue,
  workflowTimelineDeliveryTierLabel,
  workflowTimelineOptionalOutcomeDisplayValue,
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
  workflowTimelineDeploymentEnvironmentDisplayValue,
  workflowTimelineDeploymentEnvironmentLabel,
  workflowTimelineOptionalProviderRouteDisplayValue,
  workflowTimelineProviderRouteInputDisplayValue,
  workflowTimelineProviderRouteValueInputDisplayValue,
  workflowTimelineProviderRouteDisplayValue,
  workflowTimelineProviderRouteLabel,
  workflowTimelineReplayMatchDisplayClass,
  workflowTimelineReplayMatchDisplayLabel,
  workflowTimelineReplayMatchPresentationClassDisplayValue,
  workflowTimelineReplayMatchPresentationLabelDisplayValue,
  workflowTimelineReplayMatchedOriginalInputDisplayValue,
  workflowTimelineReplayMatchedOriginalDisplayValue,
  workflowTimelineReplayMatchBadgeInputDisplayValue,
  workflowTimelineReplayRunInputDisplayValue,
  workflowTimelineReplayRunValueInputDisplayValue,
  workflowTimelineOptionalReplayRunDisplayValue,
  workflowTimelineReplayRunDisplayValue,
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
  workflowTimelineStatusCodeDisplayValue,
  workflowTimelineStatusCodeLabel,
  workflowTimelineLatencyValueDisplayValue,
  workflowTimelineLatencyDisplayValue,
  workflowTimelineLatencyLabel,
  workflowTimelineDeploymentIdInputDisplayValue,
  workflowTimelineReplayDeltaInputDisplayValue,
  workflowTimelineReplayDeltaValueInputDisplayValue,
  workflowTimelineReplayDeltaValueDisplayValue,
  workflowTimelineOptionalReplayDeltaDisplayValue,
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
  workflowTimelineDistinctResumeKindInputDisplayValue,
  workflowTimelineDistinctResumeKindDisplayValue,
  workflowTimelineResumeKindFamilyInputDisplayValue,
  workflowTimelineResumeKindFamilyDisplayValue,
  workflowTimelineResumeKindValueInputDisplayValue,
  workflowTimelineResumeKindValueDisplayValue,
  workflowTimelineOptionalDistinctResumeKindDisplayValue,
  workflowTimelineDistinctResumeKindValueInputDisplayValue,
  workflowTimelineResumeKindDisplayLabel,
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
  workflowTimelineOptionalActionCategoryDisplayValue,
  workflowTimelineActionCategoryDisplayValue,
  workflowTimelineActionCategoryLabel,
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
  workflowTimelineOptionalResumeFamilyDisplayValue,
  workflowTimelineResumeFamilyValueInputDisplayValue,
  workflowTimelineResumeFamilyDisplayValue,
  workflowTimelineResumeFamilyLabel,
  workflowTimelineWaitResumeIdInputDisplayValue,
  workflowTimelineOptionalWaitResumeIdDisplayValue,
  workflowTimelineWaitResumeIdLabel,
  workflowTimelineWaitResumeIdValueInputDisplayValue,
  workflowTimelineWaitResumeIdDisplayValue,
  workflowTimelineTraceDetailInputDisplayValue,
  workflowTimelineOptionalTraceDetailDisplayValue,
  workflowTimelineTraceDetailDisplayValue,
  workflowTimelineTraceDetailValueInputDisplayValue,
  workflowTimelineTraceDetailLabel,
  workflowTimelineTraceSideEffectsInputDisplayValue,
  workflowTimelineOptionalTraceSideEffectsDisplayValue,
  workflowTimelineTraceSideEffectsValueInputDisplayValue,
  workflowTimelineTraceExecutionInputDisplayValue,
  workflowTimelineOptionalTraceExecutionDisplayValue,
  workflowTimelineTraceExecutionDisplayValue,
  workflowTimelineTraceExecutionValueInputDisplayValue,
  workflowTimelineTraceExecutionLabel,
  workflowTimelineOptionalTracePhaseDisplayValue,
  workflowTimelineTracePhaseInputDisplayValue,
  workflowTimelineTracePhaseValueInputDisplayValue,
  workflowTimelineTracePhaseDisplayValue,
  workflowTimelineTracePhaseLabel,
  workflowTimelineTraceSideEffectsDisplayValue,
  workflowTimelineTraceSideEffectsLabel,
  workflowTimelineTraceSourceLabel,
  workflowTimelineActionCategoryInputDisplayValue,
  workflowTimelineActionCategoryValueInputDisplayValue,
  workflowTimelineIntegrationFamilyInputDisplayValue,
  workflowTimelineIntegrationFamilyValueInputDisplayValue,
  workflowTimelineOutcomeInputDisplayValue,
  workflowTimelineOutcomeValueInputDisplayValue,
  workflowTimelineConnectorStatusInputDisplayValue,
  workflowTimelineConnectorStatusValueInputDisplayValue,
  workflowTimelineRuntimeHeaderDetailEmphasisDisplayValue,
  workflowTimelineRuntimeHeaderDetailDisplayValue,
  workflowTimelineRuntimeHeaderDetailLabel,
  workflowTimelineStartedCompletedDisplayValue,
  workflowTimelineStartedCompletedInputDisplayValue,
  workflowTimelineStartedCompletedValueInputDisplayValue,
  workflowTimelineStartedCompletedLabel,
  workflowTimelineOptionalStartedCompletedDisplayValue,
  workflowTimelineRuntimeSummary,
  workflowTimelineRuntimeSummaryInputDisplayValue,
  workflowTimelineStartedCompletedSummary,
  workflowTimelineSurfacePresentation,
  workflowTimelineMetadataCardInputDisplayValue,
  workflowTimelineSelectedDeploymentRecordIdInputDisplayValue,
  workflowTimelineOptionalWaitResumeEventDisplayValue,
  workflowTimelineWaitResumeEventInputDisplayValue,
  workflowTimelineWaitResumeSurfaceInputDisplayValue,
  workflowTimelineWaitResumeSurfaceDisplayValue,
  workflowTimelineTokenLabel,
} from "@/lib/workflowTimelineCardPresentation";
import {
  workflowTimelineTriggerChipPresentationClassDisplayValue,
  workflowTimelineTriggerChipPresentationLabelDisplayValue,
  workflowTimelineTriggerChipDisplayClass,
  workflowTimelineTriggerChipDisplayLabel,
  workflowTimelineTriggerChipDisplayTitle,
  workflowTimelineTriggerChipPresentationTitleDisplayValue,
  workflowTimelineRuntimeTriggerKindDisplayValue,
  workflowTimelineRuntimeTriggerKindInputDisplayValue,
  workflowTimelineTriggerChipInputDisplayValue,
  workflowTimelineOptionalTriggerChipDisplayValue,
  workflowTimelineOptionalTriggerChipPresentation,
} from "@/lib/workflowTimelineTriggerPresentation";

export type WorkflowRunTimelineStepCardData = {
    actionAllowedCapabilities: string[];
    actionAllowedTools: string[];
    actionApprovalMode: string | null;
    actionAuthMode: string | null;
    actionCapabilityId: string | null;
    actionCategory: string | null;
    actionConnectorStatus: string | null;
    actionDeliveryTier: string | null;
    actionDeploymentEnvironment: string | null;
    actionDeploymentId: string | null;
    actionMaxAttempts: number | null;
    actionOnTimeout: string | null;
    actionOperation: string | null;
    actionOutcome: string | null;
    actionOutboundAllowlist: string[];
    actionProvider: string | null;
    actionProviderLatencyMs: number | null;
    actionProviderRequestId: string | null;
    actionProviderRoute: string | null;
    actionProviderStatusText: string | null;
    actionReplayChangedNodeCount: number | null;
    actionReplayComparedToDeploymentId: string | null;
    actionReplayEffectiveDeploymentId: string | null;
    actionReplayMatchedOriginalDeployment: boolean | null;
    actionReplayOfRunId: string | null;
    actionReplayOriginalDeploymentId: string | null;
    actionRequestSummary: string | null;
    actionResultSummary: string | null;
    actionRetryCount: number | null;
    actionRuntimeTriggerKind: string | null;
    actionService: string | null;
    actionStatusCode: number | null;
    actionTimeoutSeconds: number | null;
    completedAtLabel: string | null;
    decisionPointId: string | null;
    entryRelation: string;
    focusedEdge: boolean;
    graphNodeKind: string;
    graphNodeLabel: string;
    integrationFamily: string | null;
    isWaitResumeEvent: boolean;
    manifestNodeId: string | null;
    narrative: { text: string; toneClass: string };
    objective: string;
    optionCount: number | null;
    outcomeCheckpoint: string | null;
    renderIndex: number;
    routingMode: string | null;
    runtimeKind: string;
    selectedConditionLabel: string | null;
    selectedNodeId: string | null;
    skippedOutgoingEdgeIds: string[];
    selectedOutgoingEdgeIds: string[];
    selectedOutgoingLabels: string[];
    startedAtLabel: string | null;
    status: string;
    statusClass: string;
    stepDeploymentSelectorId: string | null;
    stepDuration: string | null;
    stepNodeId: string | null;
    stepNodeLabel: string | null;
    stepPolicyFieldChanges: Array<unknown>;
    stepPolicyFieldSource: string | null;
    stepPolicyFieldSummary: string;
    timelineIndex: number;
    traceDetailMode: string | null;
    traceEvents: Array<{
      kind: string;
      title: string;
      summary: string;
      payload: unknown;
    }>;
    traceExecutionMode: string | null;
    traceKind: string | null;
    tracePhase: string | null;
    traceReason: string | null;
    traceResumeFamily: string | null;
    traceResumeKind: string | null;
    traceSideEffects: string | null;
    traceSource: string | null;
    traceWaitResumeId: string | null;
};

type WorkflowRunTimelineStepCardProps = {
  card: WorkflowRunTimelineStepCardData;
  focusDeploymentRecord: (deploymentId: string) => void;
  selectedDeploymentRecordId: string | null;
  setSelectedNodeId: (nodeId: string) => void;
};

export function WorkflowRunTimelineStepCard(props: WorkflowRunTimelineStepCardProps) {
  const card = () => props.card;
  const focusedEdge = card().focusedEdge;
  const isWaitResumeEvent = card().isWaitResumeEvent;
  const createIdentityMapper = <T,>() => (value: T) => value;
  const resolveMappedDirectValueInput = <
    TRaw,
    TMapped,
    TInput,
    TDisplay,
  >(
    value: TRaw,
    mapValue: (value: TRaw) => TMapped,
    inputDisplayValue: (value: TMapped) => TInput,
    displayValue: (value: TInput) => TDisplay,
  ) => displayValue(inputDisplayValue(mapValue(value)));
  const createMappedRendererFactory = <
    TSource,
    TValue,
    TMapped,
    TInput,
    TDisplay,
  >(
    resolveDisplay: (
      value: TSource,
      mapValue: (value: TValue) => TMapped,
      inputDisplayValue: (value: TMapped) => TInput,
      displayValue: (value: TInput) => TDisplay,
    ) => TDisplay,
  ) => (
    mapValue: (value: TValue) => TMapped,
    inputDisplayValue: (value: TMapped) => TInput,
    displayValue: (value: TInput) => TDisplay,
  ) => (value: TSource) =>
    resolveDisplay(value, mapValue, inputDisplayValue, displayValue);
  const createMappedDisplayRenderer = <
    TRaw,
    TMapped,
    TInput,
    TDisplay,
  >(
    mapValue: (value: TRaw) => TMapped,
    inputDisplayValue: (value: TMapped) => TInput,
    displayValue: (value: TInput) => TDisplay,
  ) => createMappedRendererFactory(resolveMappedDirectValueInput)(
    mapValue,
    inputDisplayValue,
    displayValue,
  );
  const createDisplayRenderer = <TValue, TInput, TDisplay>(
    inputDisplayValue: (value: TValue) => TInput,
    displayValue: (value: TInput) => TDisplay,
  ) => createMappedDisplayRenderer(
    createIdentityMapper<TValue>(),
    inputDisplayValue,
    displayValue,
  );
  const createDisplayLabelFromRenderer = <TValue, TDisplay>(
    renderDisplay: (value: TValue) => TDisplay,
    label: (value: TDisplay) => string,
  ) => (value: TValue) => label(renderDisplay(value));
  const createMappedDisplayLabelRenderer = <
    TRaw,
    TMapped,
    TInput,
    TDisplay,
  >(
    mapValue: (value: TRaw) => TMapped,
    inputDisplayValue: (value: TMapped) => TInput,
    displayValue: (value: TInput) => TDisplay,
    label: (value: TDisplay) => string,
  ) => createDisplayLabelFromRenderer(
    createMappedDisplayRenderer(
      mapValue,
      inputDisplayValue,
      displayValue,
    ),
    label,
  );
  const createDisplayLabelRenderer = <TValue, TInput, TDisplay>(
    inputDisplayValue: (value: TValue) => TInput,
    displayValue: (value: TInput) => TDisplay,
    label: (value: TDisplay) => string,
  ) => createMappedDisplayLabelRenderer(
    createIdentityMapper<TValue>(),
    inputDisplayValue,
    displayValue,
    label,
  );
  const resolveVisibility = <TValue, TInput, TDisplay>(
    value: TValue,
    inputDisplayValue: (value: TValue) => TInput,
    displayValue: (value: TInput) => TDisplay,
  ) => createDisplayRenderer(
    inputDisplayValue,
    displayValue,
  )(value);
  const resolveMappedVisibility = <TRaw, TMapped, TInput, TDisplay>(
    value: TRaw,
    mapValue: (value: TRaw) => TMapped,
    inputDisplayValue: (value: TMapped) => TInput,
    displayValue: (value: TInput) => TDisplay,
  ) => createMappedDisplayRenderer(
    mapValue,
    inputDisplayValue,
    displayValue,
  )(value);
  const resolveDisplay = <TValue, TInput, TDisplay>(
    value: TValue,
    inputDisplayValue: (value: TValue) => TInput,
    displayValue: (value: TInput) => TDisplay,
  ) => createDisplayRenderer(
    inputDisplayValue,
    displayValue,
  )(value);
  const resolveDisplayLabel = <TValue, TInput, TDisplay>(
    value: TValue,
    inputDisplayValue: (value: TValue) => TInput,
    displayValue: (value: TInput) => TDisplay,
    label: (value: TDisplay) => string,
  ) => createDisplayLabelRenderer(
    inputDisplayValue,
    displayValue,
    label,
  )(value);
  const waitResumeSurface = resolveDisplay(
    isWaitResumeEvent,
    workflowTimelineWaitResumeSurfaceInputDisplayValue,
    workflowTimelineWaitResumeSurfaceDisplayValue,
  );
  const visibleSurfacePresentation = resolveDisplay(
    workflowTimelineSurfacePresentation(waitResumeSurface),
    workflowTimelineSurfacePresentationInputDisplayValue,
    workflowTimelineSurfacePresentationDisplayValue,
  );
  const selectedDeploymentRecordIdInput = workflowTimelineSelectedDeploymentRecordIdInputDisplayValue(
    props.selectedDeploymentRecordId,
  );
  const focusedEdgeVisibility = resolveDisplay(
    focusedEdge,
    workflowTimelineFocusedEdgeInputDisplayValue,
    workflowTimelineFocusedEdgeDisplayValue,
  );
  const resolveResumeKindFamilyDisplay = (value: string | null | undefined) =>
    resolveDisplay(
      value,
      workflowTimelineResumeKindFamilyInputDisplayValue,
      workflowTimelineResumeKindFamilyDisplayValue,
    );
  const resolveResumeKindValueDisplay = (value: string | null | undefined) =>
    resolveDisplay(
      value,
      workflowTimelineResumeKindValueInputDisplayValue,
      workflowTimelineResumeKindValueDisplayValue,
    );
  const resolveRuntimeTriggerKindDisplay = (value: string | null | undefined) =>
    resolveDisplay(
      value,
      workflowTimelineRuntimeTriggerKindInputDisplayValue,
      workflowTimelineRuntimeTriggerKindDisplayValue,
    );
  const resolveReplayMatchedOriginalDisplay = (value: boolean | null | undefined) =>
    resolveDisplay(
      value,
      workflowTimelineReplayMatchedOriginalInputDisplayValue,
      workflowTimelineReplayMatchedOriginalDisplayValue,
    );
  const metadataCardInput = workflowTimelineMetadataCardInputDisplayValue(card());
  const titleRowClass = workflowTimelineTitleRowClass();
  const headerDetailRowClass = workflowTimelineHeaderDetailRowClass();
  const inlineChipRowClass = workflowTimelineInlineChipRowClass();
  const entryRelation = card().entryRelation;
  const statusClass = card().statusClass;
  const status = card().status;
  const renderIndex = card().renderIndex;
  const objective = card().objective;
  const narrativeToneClass = card().narrative.toneClass;
  const narrativeText = card().narrative.text;
  const graphNodeLabel = card().graphNodeLabel;
  const graphNodeKind = card().graphNodeKind;
  const runtimeKind = card().runtimeKind;
  const stepDuration = card().stepDuration;
  const startedAtLabel = card().startedAtLabel;
  const completedAtLabel = card().completedAtLabel;
  const manifestNodeId = card().manifestNodeId;
  const stepPolicyFieldChanges = card().stepPolicyFieldChanges;
  const stepPolicyFieldSource = card().stepPolicyFieldSource;
  const stepPolicyFieldSummary = card().stepPolicyFieldSummary;
  const traceEvents = card().traceEvents;
  const stepNodeId = card().stepNodeId;
  const stepDeploymentSelectorId = card().stepDeploymentSelectorId;
  const actionRequestSummary = card().actionRequestSummary;
  const actionResultSummary = card().actionResultSummary;
  const traceReason = card().traceReason;
  const traceResumeFamily = card().traceResumeFamily;
  const traceResumeKind = card().traceResumeKind;
  const traceWaitResumeId = card().traceWaitResumeId;
  const actionDeploymentId = card().actionDeploymentId;
  const actionDeploymentEnvironment = card().actionDeploymentEnvironment;
  const actionRuntimeTriggerKind = card().actionRuntimeTriggerKind;
  const actionReplayOfRunId = card().actionReplayOfRunId;
  const actionReplayOriginalDeploymentId = card().actionReplayOriginalDeploymentId;
  const actionReplayEffectiveDeploymentId = card().actionReplayEffectiveDeploymentId;
  const actionReplayComparedDeploymentId = card().actionReplayComparedToDeploymentId;
  const actionReplayMatchedOriginalDeployment = card().actionReplayMatchedOriginalDeployment;
  const traceSource = card().traceSource;
  const traceDetailMode = card().traceDetailMode;
  const traceSideEffects = card().traceSideEffects;
  const traceExecutionMode = card().traceExecutionMode;
  const actionCategory = card().actionCategory;
  const integrationFamily = card().integrationFamily;
  const actionOutcome = card().actionOutcome;
  const actionConnectorStatus = card().actionConnectorStatus;
  const actionStatusCode = card().actionStatusCode;
  const actionAuthMode = card().actionAuthMode;
  const actionApprovalMode = card().actionApprovalMode;
  const actionService = card().actionService;
  const actionProvider = card().actionProvider;
  const actionProviderRequestId = card().actionProviderRequestId;
  const actionProviderStatusText = card().actionProviderStatusText;
  const actionProviderLatencyMs = card().actionProviderLatencyMs;
  const actionReplayChangedNodeCount = card().actionReplayChangedNodeCount;
  const actionDeliveryTier = card().actionDeliveryTier;
  const actionProviderRoute = card().actionProviderRoute;
  const actionCapabilityId = card().actionCapabilityId;
  const actionOperation = card().actionOperation;
  const actionTimeoutSeconds = card().actionTimeoutSeconds;
  const actionMaxAttempts = card().actionMaxAttempts;
  const actionRetryCount = card().actionRetryCount;
  const actionOnTimeout = card().actionOnTimeout;
  const actionAllowedTools = card().actionAllowedTools;
  const actionAllowedCapabilities = card().actionAllowedCapabilities;
  const actionOutboundAllowlist = card().actionOutboundAllowlist;
  const tracePhase = card().tracePhase;
  const outcomeCheckpoint = card().outcomeCheckpoint;
  const traceKind = card().traceKind;
  const routingMode = card().routingMode;
  const selectedConditionLabel = card().selectedConditionLabel;
  const selectedNodeId = card().selectedNodeId;
  const selectedOutgoingLabels = card().selectedOutgoingLabels;
  const selectedOutgoingEdgeCount = card().selectedOutgoingEdgeIds.length;
  const skippedOutgoingEdgeCount = card().skippedOutgoingEdgeIds.length;
  const decisionPointId = card().decisionPointId;
  const optionCount = card().optionCount;
  const stepNodeLabel = card().stepNodeLabel;
  const visibleSurfaceContainerClass = resolveDisplay(
    visibleSurfacePresentation,
    workflowTimelineSurfacePresentationContainerDisplayValue,
    workflowTimelineSurfaceContainerDisplayClass,
  );
  const visibleSurfaceTitleClass = resolveDisplay(
    visibleSurfacePresentation,
    workflowTimelineSurfacePresentationTitleDisplayValue,
    workflowTimelineSurfaceTitleDisplayClass,
  );
  const primaryHeaderDetailLabel = resolveDisplayLabel(
    graphNodeLabel,
    workflowTimelinePrimaryHeaderDetailInputDisplayValue,
    workflowTimelinePrimaryHeaderDetailDisplayValue,
    workflowTimelinePrimaryHeaderDetailLabel,
  );
  const secondaryHeaderDetailLabel = resolveDisplayLabel(
    graphNodeKind,
    workflowTimelineSecondaryHeaderDetailInputDisplayValue,
    workflowTimelineSecondaryHeaderDetailDisplayValue,
    workflowTimelineSecondaryHeaderDetailLabel,
  );
  const runtimeHeaderDetailLabel = resolveDisplayLabel(
    workflowTimelineRuntimeSummary(runtimeKind, stepDuration),
    workflowTimelineRuntimeSummaryInputDisplayValue,
    workflowTimelineRuntimeHeaderDetailDisplayValue,
    workflowTimelineRuntimeHeaderDetailLabel,
  );
  const startedCompletedSummary = resolveMappedVisibility(
    null,
    () => workflowTimelineStartedCompletedSummary(startedAtLabel, completedAtLabel),
    workflowTimelineStartedCompletedInputDisplayValue,
    workflowTimelineOptionalStartedCompletedDisplayValue,
  );
  const manifestHeaderDetailVisibility = resolveVisibility(
    manifestNodeId,
    workflowTimelineManifestHeaderDetailInputDisplayValue,
    workflowTimelineOptionalManifestHeaderDetailDisplayValue,
  );
  const metadataRowClass = workflowTimelineMetadataRowClass();
  const hasMetadata = workflowTimelineHasMetadata(metadataCardInput);
  const policyFieldChangesVisibility = resolveVisibility(
    stepPolicyFieldChanges,
    workflowTimelinePolicyFieldChangesInputDisplayValue,
    workflowTimelineOptionalPolicyFieldChangesDisplayValue,
  );
  const policySourceChipLabel = resolveDisplayLabel(
    stepPolicyFieldSource,
    workflowTimelinePolicySourceInputDisplayValue,
    workflowTimelinePolicySourceDisplayValue,
    workflowTimelinePolicySourceLabel,
  );
  const policySummaryLabel = resolveDisplayLabel(
    stepPolicyFieldSummary,
    workflowTimelinePolicySummaryInputDisplayValue,
    workflowTimelinePolicySummaryDisplayValue,
    workflowTimelinePolicySummaryLabel,
  );
  const traceEventsVisibility = resolveVisibility(
    traceEvents,
    workflowTimelineTraceEventsInputDisplayValue,
    workflowTimelineOptionalTraceEventsDisplayValue,
  );
  const waitResumeEventVisibility = resolveVisibility(
    isWaitResumeEvent,
    workflowTimelineWaitResumeEventInputDisplayValue,
    workflowTimelineOptionalWaitResumeEventDisplayValue,
  );
  const stepNodeIdVisibility = resolveVisibility(
    stepNodeId,
    workflowTimelineStepNodeIdInputDisplayValue,
    workflowTimelineOptionalStepNodeIdDisplayValue,
  );
  const deploymentSelectorIdVisibility = resolveVisibility(
    stepDeploymentSelectorId,
    workflowTimelineDeploymentSelectorIdInputDisplayValue,
    workflowTimelineOptionalDeploymentSelectorIdDisplayValue,
  );
  const requestSummaryVisibility = resolveVisibility(
    actionRequestSummary,
    workflowTimelineRequestSummaryInputDisplayValue,
    workflowTimelineOptionalRequestSummaryDisplayValue,
  );
  const resultSummaryVisibility = resolveVisibility(
    actionResultSummary,
    workflowTimelineResultSummaryInputDisplayValue,
    workflowTimelineOptionalResultSummaryDisplayValue,
  );
  const traceReasonVisibility = resolveVisibility(
    traceReason,
    workflowTimelineTraceReasonInputDisplayValue,
    workflowTimelineOptionalTraceReasonDisplayValue,
  );
  const startedCompletedSpacing = "sm" as const;
  const requestSummarySpacing = "md" as const;
  const resultSummarySpacing = "sm" as const;
  const traceReasonSpacing = "md" as const;
  const policySummaryTextClass = workflowTimelinePolicySummaryTextClass();
  const eventCardClass = workflowTimelineEventCardClass();
  const resumeFamilyVisibility = resolveVisibility(
    traceResumeFamily,
    workflowTimelineResumeFamilyInputDisplayValue,
    workflowTimelineOptionalResumeFamilyDisplayValue,
  );
  const distinctResumeKindVisibility = resolveMappedVisibility(
    null,
    () =>
      workflowTimelineDistinctResumeKindLabel(
        resolveResumeKindFamilyDisplay(traceResumeFamily),
        resolveResumeKindValueDisplay(traceResumeKind),
      ),
    workflowTimelineDistinctResumeKindInputDisplayValue,
    workflowTimelineOptionalDistinctResumeKindDisplayValue,
  );
  const waitResumeIdVisibility = resolveVisibility(
    traceWaitResumeId,
    workflowTimelineWaitResumeIdInputDisplayValue,
    workflowTimelineOptionalWaitResumeIdDisplayValue,
  );
  const actionDeploymentVisibility = resolveVisibility(
    actionDeploymentId,
    workflowTimelineDeploymentIdInputDisplayValue,
    workflowTimelineOptionalDeploymentIdDisplayValue,
  );
  const deploymentEnvironmentVisibility = resolveVisibility(
    actionDeploymentEnvironment,
    workflowTimelineDeploymentEnvironmentInputDisplayValue,
    workflowTimelineOptionalDeploymentEnvironmentDisplayValue,
  );
  const runtimeTriggerChipVisibility = resolveMappedVisibility(
    actionRuntimeTriggerKind,
    (value: string | null) =>
      workflowTimelineOptionalTriggerChipPresentation(
        resolveRuntimeTriggerKindDisplay(value),
      ),
    workflowTimelineTriggerChipInputDisplayValue,
    workflowTimelineOptionalTriggerChipDisplayValue,
  );
  const replayRunVisibility = resolveVisibility(
    actionReplayOfRunId,
    workflowTimelineReplayRunInputDisplayValue,
    workflowTimelineOptionalReplayRunDisplayValue,
  );
  const replayOriginalDeploymentVisibility = resolveVisibility(
    actionReplayOriginalDeploymentId,
    workflowTimelineDeploymentIdInputDisplayValue,
    workflowTimelineOptionalDeploymentIdDisplayValue,
  );
  const replayEffectiveDeploymentVisibility = resolveVisibility(
    actionReplayEffectiveDeploymentId,
    workflowTimelineDeploymentIdInputDisplayValue,
    workflowTimelineOptionalDeploymentIdDisplayValue,
  );
  const replayComparedDeploymentVisibility = resolveVisibility(
    actionReplayComparedDeploymentId,
    workflowTimelineDeploymentIdInputDisplayValue,
    workflowTimelineOptionalDeploymentIdDisplayValue,
  );
  const replayMatchBadgeVisibility = resolveMappedVisibility(
    actionReplayMatchedOriginalDeployment,
    (value: boolean | null) =>
      workflowTimelineOptionalReplayMatchBadgePresentation(
        resolveReplayMatchedOriginalDisplay(value),
      ),
    workflowTimelineReplayMatchBadgeInputDisplayValue,
    workflowTimelineOptionalReplayMatchBadgeDisplayValue,
  );
  const traceSourceVisibility = resolveVisibility(
    traceSource,
    workflowTimelineTraceSourceInputDisplayValue,
    workflowTimelineOptionalTraceSourceDisplayValue,
  );
  const traceDetailVisibility = resolveVisibility(
    traceDetailMode,
    workflowTimelineTraceDetailInputDisplayValue,
    workflowTimelineOptionalTraceDetailDisplayValue,
  );
  const traceSideEffectsVisibility = resolveVisibility(
    traceSideEffects,
    workflowTimelineTraceSideEffectsInputDisplayValue,
    workflowTimelineOptionalTraceSideEffectsDisplayValue,
  );
  const traceExecutionVisibility = resolveVisibility(
    traceExecutionMode,
    workflowTimelineTraceExecutionInputDisplayValue,
    workflowTimelineOptionalTraceExecutionDisplayValue,
  );
  const actionCategoryVisibility = resolveVisibility(
    actionCategory,
    workflowTimelineActionCategoryInputDisplayValue,
    workflowTimelineOptionalActionCategoryDisplayValue,
  );
  const integrationFamilyVisibility = resolveVisibility(
    integrationFamily,
    workflowTimelineIntegrationFamilyInputDisplayValue,
    workflowTimelineOptionalIntegrationFamilyDisplayValue,
  );
  const outcomeVisibility = resolveVisibility(
    actionOutcome,
    workflowTimelineOutcomeInputDisplayValue,
    workflowTimelineOptionalOutcomeDisplayValue,
  );
  const connectorStatusVisibility = resolveVisibility(
    actionConnectorStatus,
    workflowTimelineConnectorStatusInputDisplayValue,
    workflowTimelineOptionalConnectorStatusDisplayValue,
  );
  const statusCodeVisibility = resolveVisibility(
    actionStatusCode,
    workflowTimelineStatusCodeInputDisplayValue,
    workflowTimelineOptionalStatusCodeDisplayValue,
  );
  const authModeVisibility = resolveVisibility(
    actionAuthMode,
    workflowTimelineAuthModeInputDisplayValue,
    workflowTimelineOptionalAuthModeDisplayValue,
  );
  const approvalChipVisibility = resolveVisibility(
    actionApprovalMode,
    workflowTimelineApprovalChipInputDisplayValue,
    workflowTimelineOptionalApprovalChipDisplayValue,
  );
  const serviceVisibility = resolveVisibility(
    actionService,
    workflowTimelineServiceInputDisplayValue,
    workflowTimelineOptionalServiceDisplayValue,
  );
  const providerVisibility = resolveVisibility(
    actionProvider,
    workflowTimelineProviderInputDisplayValue,
    workflowTimelineOptionalProviderDisplayValue,
  );
  const providerRequestVisibility = resolveVisibility(
    actionProviderRequestId,
    workflowTimelineProviderRequestInputDisplayValue,
    workflowTimelineOptionalProviderRequestDisplayValue,
  );
  const providerStatusVisibility = resolveVisibility(
    actionProviderStatusText,
    workflowTimelineProviderStatusInputDisplayValue,
    workflowTimelineOptionalProviderStatusDisplayValue,
  );
  const latencyVisibility = resolveVisibility(
    actionProviderLatencyMs,
    workflowTimelineLatencyInputDisplayValue,
    workflowTimelineOptionalLatencyDisplayValue,
  );
  const replayDeltaVisibility = resolveVisibility(
    actionReplayChangedNodeCount,
    workflowTimelineReplayDeltaInputDisplayValue,
    workflowTimelineOptionalReplayDeltaDisplayValue,
  );
  const deliveryTierVisibility = resolveVisibility(
    actionDeliveryTier,
    workflowTimelineDeliveryTierInputDisplayValue,
    workflowTimelineOptionalDeliveryTierDisplayValue,
  );
  const providerRouteVisibility = resolveVisibility(
    actionProviderRoute,
    workflowTimelineProviderRouteInputDisplayValue,
    workflowTimelineOptionalProviderRouteDisplayValue,
  );
  const capabilityVisibility = resolveVisibility(
    actionCapabilityId,
    workflowTimelineCapabilityInputDisplayValue,
    workflowTimelineOptionalCapabilityDisplayValue,
  );
  const actionOperationVisibility = resolveVisibility(
    actionOperation,
    workflowTimelineActionOperationInputDisplayValue,
    workflowTimelineOptionalActionOperationDisplayValue,
  );
  const timeoutVisibility = resolveVisibility(
    actionTimeoutSeconds,
    workflowTimelineTimeoutInputDisplayValue,
    workflowTimelineOptionalTimeoutDisplayValue,
  );
  const attemptsVisibility = resolveVisibility(
    actionMaxAttempts,
    workflowTimelineAttemptsInputDisplayValue,
    workflowTimelineOptionalAttemptsDisplayValue,
  );
  const retriesVisibility = resolveVisibility(
    actionRetryCount,
    workflowTimelineRetriesInputDisplayValue,
    workflowTimelineOptionalRetriesDisplayValue,
  );
  const onTimeoutVisibility = resolveVisibility(
    actionOnTimeout,
    workflowTimelineOnTimeoutInputDisplayValue,
    workflowTimelineOptionalOnTimeoutDisplayValue,
  );
  const allowedToolsVisibility = resolveVisibility(
    actionAllowedTools,
    workflowTimelineAllowedToolsInputDisplayValue,
    workflowTimelineOptionalAllowedToolsDisplayValue,
  );
  const allowedCapabilitiesVisibility = resolveVisibility(
    actionAllowedCapabilities,
    workflowTimelineAllowedCapabilitiesInputDisplayValue,
    workflowTimelineOptionalAllowedCapabilitiesDisplayValue,
  );
  const outboundAllowlistVisibility = resolveVisibility(
    actionOutboundAllowlist,
    workflowTimelineOutboundAllowlistInputDisplayValue,
    workflowTimelineOptionalOutboundAllowlistDisplayValue,
  );
  const tracePhaseVisibility = resolveVisibility(
    tracePhase,
    workflowTimelineTracePhaseInputDisplayValue,
    workflowTimelineOptionalTracePhaseDisplayValue,
  );
  const checkpointVisibility = resolveVisibility(
    outcomeCheckpoint,
    workflowTimelineCheckpointInputDisplayValue,
    workflowTimelineOptionalCheckpointDisplayValue,
  );
  const traceKindVisibility = resolveVisibility(
    traceKind,
    workflowTimelineTraceKindInputDisplayValue,
    workflowTimelineOptionalTraceKindDisplayValue,
  );
  const routingModeVisibility = resolveVisibility(
    routingMode,
    workflowTimelineRoutingModeInputDisplayValue,
    workflowTimelineOptionalRoutingModeDisplayValue,
  );
  const routeVisibility = resolveVisibility(
    selectedConditionLabel,
    workflowTimelineRouteInputDisplayValue,
    workflowTimelineOptionalRouteDisplayValue,
  );
  const targetNodeVisibility = resolveVisibility(
    selectedNodeId,
    workflowTimelineTargetNodeInputDisplayValue,
    workflowTimelineOptionalTargetNodeDisplayValue,
  );
  const selectedLabelsVisibility = resolveVisibility(
    selectedOutgoingLabels,
    workflowTimelineSelectedLabelsInputDisplayValue,
    workflowTimelineOptionalSelectedLabelsDisplayValue,
  );
  const selectedEdgeCountVisibility = resolveVisibility(
    selectedOutgoingEdgeCount,
    workflowTimelineSelectedEdgeCountInputDisplayValue,
    workflowTimelineOptionalSelectedEdgeCountDisplayValue,
  );
  const skippedEdgeCountVisibility = resolveVisibility(
    skippedOutgoingEdgeCount,
    workflowTimelineSkippedEdgeCountInputDisplayValue,
    workflowTimelineOptionalSkippedEdgeCountDisplayValue,
  );
  const decisionPointVisibility = resolveVisibility(
    decisionPointId,
    workflowTimelineDecisionPointInputDisplayValue,
    workflowTimelineOptionalDecisionPointDisplayValue,
  );
  const optionCountVisibility = resolveVisibility(
    optionCount,
    workflowTimelineOptionCountInputDisplayValue,
    workflowTimelineOptionalOptionCountDisplayValue,
  );
  const resumeFamilyTone = "sky-strong" as const;
  const distinctResumeKindTone = "sky-strong" as const;
  const waitResumeIdTone = "sky-soft" as const;
  const focusDeploymentRecordTarget = (deploymentId: string) =>
    props.focusDeploymentRecord(
      workflowTimelineDeploymentFocusTargetInputDisplayValue(deploymentId),
    );
  const setSelectedNodeTarget = (nodeId: string) =>
    props.setSelectedNodeId(
      workflowTimelineSelectedNodeTargetInputDisplayValue(nodeId),
    );
  const stepNodeDisplayLabel = workflowTimelineStepNodeDisplayValue(
    workflowTimelineStepNodeLabelInputDisplayValue(stepNodeLabel),
  );
  const reviewSnapshotLabel = workflowTimelineReviewSnapshotLabel();
  const createButtonRenderer = <TArgs extends unknown[]>(
    resolve: (...args: TArgs) => {
      className: string;
      content: JSX.Element | string;
      onClick: () => void;
    },
  ) => (...args: TArgs) => {
    const { className, content, onClick } = resolve(...args);
    return (
      <button
        type="button"
        class={className}
        onClick={onClick}
      >
        {content}
      </button>
    );
  };
  const renderDeploymentButton = createButtonRenderer(
    (
      deploymentKind: "deployment" | "original_deploy" | "replay_deploy" | "compared",
      buttonTone: "sky" | "indigo",
      deploymentId: () => string,
    ) => {
      const resolvedDeploymentId = deploymentId();
      const deploymentButtonId = workflowTimelineDeploymentButtonDeploymentIdDisplayValue(
        workflowTimelineDeploymentButtonDeploymentIdValueInputDisplayValue(
          resolvedDeploymentId,
        ),
      );
      const deploymentButtonSelected = workflowTimelineDeploymentButtonSelectedDisplayValue(
        workflowTimelineDeploymentButtonSelectionStateDisplayValue(
          selectedDeploymentRecordIdInput,
          workflowTimelineDeploymentSelectionTargetInputDisplayValue(
            resolvedDeploymentId,
          ),
        ),
      );
      return {
        className: workflowTimelineDeploymentButtonShellClass(
          deploymentButtonSelected,
          workflowTimelineDeploymentButtonToneDisplayValue(buttonTone),
        ),
        onClick: () => focusDeploymentRecordTarget(resolvedDeploymentId),
        content: workflowTimelineDeploymentButtonLabel(
          workflowTimelineDeploymentButtonKindDisplayValue(deploymentKind),
          deploymentButtonId,
        ),
      };
    },
  );
  const renderClassedElement = (
    tag: "div" | "p" | "span",
    className: string,
    content: JSX.Element | string,
    title?: string,
  ) => tag === "div"
    ? <div class={className} title={title}>{content}</div>
    : tag === "p"
      ? <p class={className} title={title}>{content}</p>
      : <span class={className} title={title}>{content}</span>;
  const createElementRenderer = (
    tag: "div" | "p" | "span",
  ) => (
    className: string,
    content: JSX.Element | string,
    title?: string,
  ) => renderClassedElement(tag, className, content, title);
  const createTextElementRenderer = (
    tag: "div" | "p" | "span",
  ) => (
    className: string,
    content: string,
    title?: string,
  ) => createElementRenderer(tag)(className, content, title);
  const renderTextParagraph = createTextElementRenderer("p");
  const renderTextBlock = createTextElementRenderer("div");
  const renderDivContent = createElementRenderer("div");
  const renderStaticElement = (content: JSX.Element) => content;
  const renderDeferredBlockFactory = <TArgs extends unknown[]>(
    render: (...args: TArgs) => JSX.Element,
    ...args: TArgs
  ) => () => render(...args);
  const renderBlockSequence = (...blocks: Array<() => JSX.Element>) => (
    <>
      {blocks.map((block) => block())}
    </>
  );
  const createDeferredBlockRenderer = <TArgs extends unknown[]>(
    render: (...args: TArgs) => JSX.Element,
  ) => (...args: TArgs) => renderDeferredBlockFactory(render, ...args);
  const renderBlockGroup = createDeferredBlockRenderer(renderBlockSequence);
  const renderStaticElementBlock = createDeferredBlockRenderer(renderStaticElement);
  const renderClassedSpan = createTextElementRenderer("span");
  const renderBlockElement = (
    tag: "div" | "p" | "span",
    className: string,
    ...blocks: Array<() => JSX.Element>
  ) => renderClassedElement(
    tag,
    className,
    renderBlockSequence(...blocks),
  );
  const createBlockElementRenderer = (
    tag: "div" | "p" | "span",
  ) => (
    className: string,
    ...blocks: Array<() => JSX.Element>
  ) => renderBlockElement(tag, className, ...blocks);
  const renderDivElement = createBlockElementRenderer("div");
  const renderDivBlock = createDeferredBlockRenderer(renderDivElement);
  const createTonedSpanRenderer = <TTone,>(
    renderClass: (tone: TTone) => string,
  ) => (
    tone: TTone,
    content: string,
  ) => renderClassedSpan(renderClass(tone), content);
  const createMappedValueDisplayRenderer = <
    TValue,
    TMapped,
    TInput,
    TDisplay,
  >(
    mapValue: (value: TValue) => TMapped,
    inputDisplayValue: (value: TMapped) => TInput,
    displayValue: (value: TInput) => TDisplay,
  ) => createMappedRendererFactory(resolveMappedDirectValueInput)(
    mapValue,
    inputDisplayValue,
    displayValue,
  );
  const createMappedValueDisplayLabelRenderer = <
    TValue,
    TMapped,
    TInput,
    TDisplay,
  >(
    mapValue: (value: TValue) => TMapped,
    inputDisplayValue: (value: TMapped) => TInput,
    displayValue: (value: TInput) => TDisplay,
    label: (display: TDisplay) => string,
  ) => createDisplayLabelFromRenderer(
    createMappedValueDisplayRenderer(
      mapValue,
      inputDisplayValue,
      displayValue,
    ),
    label,
  );
  const resolveValueDisplay = <TValue, TInput, TDisplay>(
    value: TValue,
    inputDisplayValue: (value: TValue) => TInput,
    displayValue: (value: TInput) => TDisplay,
  ) => createMappedValueDisplayRenderer(
    createIdentityMapper<TValue>(),
    inputDisplayValue,
    displayValue,
  )(value);
  const resolveValueDisplayLabel = <TValue, TInput, TDisplay>(
    value: TValue,
    inputDisplayValue: (value: TValue) => TInput,
    displayValue: (value: TInput) => TDisplay,
    label: (display: TDisplay) => string,
  ) => createMappedValueDisplayLabelRenderer(
    createIdentityMapper<TValue>(),
    inputDisplayValue,
    displayValue,
    label,
  )(value);
  const renderResolvedSpan = <TValue,>(
    value: TValue,
    resolveClass: (value: TValue) => string,
    resolveLabel: (value: TValue) => string,
    resolveTitle?: (value: TValue) => string | undefined,
  ) => renderClassedSpan(
    resolveClass(value),
    resolveLabel(value),
    resolveTitle?.(value),
  );
  const renderMiniChip = createTonedSpanRenderer(
    (tone: "sky-strong" | "sky-soft" | "violet") =>
      workflowTimelineMiniChipClass(
        workflowTimelineMiniChipToneDisplayValue(tone),
      ),
  );
  const renderMetadataChip = createTonedSpanRenderer(
    (tone: "slate" | "violet" | "fuchsia" | "emerald" | "amber" | "sky" | "indigo") =>
      workflowTimelineMetadataChipClass(
        workflowTimelineMetadataChipToneDisplayValue(tone),
      ),
  );
  const renderOptionalContent = <T,>(
    value: T | null | undefined | false,
    content: (item: Accessor<NonNullable<T>>) => JSX.Element,
  ) => (
    <Show when={value}>
      {(item) => content(item)}
    </Show>
  );
  const createOptionalMappedRenderer = <TArgs extends unknown[], TValue>(
    render: (item: Accessor<TValue>, ...args: TArgs) => JSX.Element,
  ) => (
    value: TValue | null | undefined | false,
    ...args: TArgs
  ) => renderOptionalContent(
    value,
    (item) => render(item as Accessor<TValue>, ...args),
  );
  const createOptionalMappedBlockRenderer = <TArgs extends unknown[], TValue>(
    render: (item: Accessor<TValue>, ...args: TArgs) => JSX.Element,
  ) => createDeferredBlockRenderer(
    createOptionalMappedRenderer(render),
  );
  const renderOptionalPresenceBlock = createOptionalMappedBlockRenderer(
    <T,>(
      _item: Accessor<T>,
      content: () => JSX.Element,
    ) => content(),
  );
  const createOptionalArgumentLabeledRenderer = <TArg,>(
    renderLabel: (arg: TArg, label: string) => JSX.Element,
  ) => createOptionalMappedRenderer(
    <T,>(
      item: Accessor<T>,
      arg: TArg,
      content: (item: Accessor<T>) => string,
    ) => renderLabel(arg, content(item)),
  );
  const createOptionalLabeledBlockRenderer = <TArg,>(
    renderLabel: (arg: TArg, label: string) => JSX.Element,
  ) => createDeferredBlockRenderer(
    createOptionalArgumentLabeledRenderer(renderLabel),
  );
  const renderOptionalMetadataChipBlock = createOptionalLabeledBlockRenderer(
    renderMetadataChip,
  );
  const renderOptionalMiniChipBlock = createOptionalLabeledBlockRenderer(
    renderMiniChip,
  );
  const renderInteractiveMiniChip = createButtonRenderer(
    (
      tone: "sky-strong",
      onClick: () => void,
      content: string,
    ) => ({
      className: workflowTimelineInteractiveMiniChipClass(
        workflowTimelineMiniChipToneDisplayValue(tone),
      ),
      onClick,
      content,
    }),
  );
  const renderOptionalInteractiveMiniChipBlock = createOptionalMappedBlockRenderer(
    <T,>(
      item: Accessor<T>,
      tone: "sky-strong",
      onClick: (item: Accessor<T>) => void,
      content: (item: Accessor<T>) => string,
    ) =>
      renderInteractiveMiniChip(tone, () => onClick(item), content(item)),
  );
  const renderHeaderDetail = (
    emphasis: "primary" | "secondary" | "manifest" | "runtime",
    content: string,
  ) => {
    const emphasisTone = emphasis === "primary"
      ? workflowTimelineHeaderDetailEmphasisDisplayValue("primary")
      : emphasis === "secondary"
        ? workflowTimelineSecondaryHeaderDetailEmphasisDisplayValue()
        : emphasis === "manifest"
          ? workflowTimelineManifestHeaderDetailEmphasisDisplayValue()
          : workflowTimelineRuntimeHeaderDetailEmphasisDisplayValue();
    return renderClassedSpan(
      workflowTimelineHeaderDetailClass(emphasisTone),
      content,
    );
  };
  const renderSecondaryText = (
    spacing: "sm" | "md",
    content: string,
  ) => renderTextParagraph(
    workflowTimelineSecondaryTextClass(
      resolveValueDisplay(
        spacing,
        workflowTimelineSecondaryTextSpacingDisplayValue,
        (value) => value,
      ),
    ),
    content,
  );
  const renderOptionalSecondaryTextBlock = createOptionalLabeledBlockRenderer(
    renderSecondaryText,
  );
  const renderSectionHeading = (
    tone: "sky" | "violet",
    title: "step_events" | "wait_resume_event",
    as: "p" | "span" = "p",
  ) => {
    const className = workflowTimelineSectionLabelClass(
      resolveValueDisplay(
        tone,
        workflowTimelineSectionToneDisplayValue,
        (value) => value,
      ),
    );
    const content = resolveValueDisplay(
      title,
      workflowTimelineSectionTitleDisplayValue,
      (sectionTitle: "step_events" | "wait_resume_event") =>
        workflowTimelineSectionTitle(sectionTitle),
    );
    return as === "p"
      ? renderTextParagraph(className, content)
      : renderClassedSpan(className, content);
  };
  const stepEventsSectionHeading = renderSectionHeading("violet", "step_events");
  const waitResumeSectionHeading = renderSectionHeading("sky", "wait_resume_event", "span");
  const renderSectionContainer = (
    tone: "sky" | "violet",
    padding: "md" | "sm",
    content: JSX.Element,
  ) => {
    const sectionTone = resolveValueDisplay(
      tone,
      workflowTimelineSectionToneDisplayValue,
      (value: "sky" | "violet") => value,
    );
    const sectionPadding = padding === "md"
      ? workflowTimelineDefaultSectionPaddingDisplayValue()
      : resolveValueDisplay(
        padding,
        workflowTimelineSectionPaddingDisplayValue,
        (value: "sm" | "md") => value,
      );
    return renderDivContent(
      workflowTimelineSectionContainerClass(
        sectionTone,
        sectionPadding,
      ),
      content,
    );
  };
  const renderOptionalSectionContainerBlock = createOptionalMappedBlockRenderer(
    <T,>(
      item: Accessor<T>,
      tone: "sky" | "violet",
      padding: "md" | "sm",
      content: (item: Accessor<T>) => JSX.Element,
    ) => renderSectionContainer(tone, padding, content(item)),
  );
  const renderSectionInlineChipRow = (...blocks: Array<() => JSX.Element>) => renderDivElement(
    inlineChipRowClass,
    ...blocks,
  );
  const renderSectionInlineChipRowBlock = createDeferredBlockRenderer(
    renderSectionInlineChipRow,
  );
  const renderOptionalHeaderDetailBlock = createOptionalLabeledBlockRenderer(
    renderHeaderDetail,
  );
  const renderEventHeading = (kind: string, title: string) => {
    const eventKindLabel = resolveValueDisplayLabel(
      kind,
      workflowTimelineEventKindInputDisplayValue,
      workflowTimelineEventKindDisplayValue,
      workflowTimelineEventKindLabel,
    );
    const eventTitleLabel = resolveValueDisplayLabel(
      title,
      workflowTimelineEventTitleInputDisplayValue,
      workflowTimelineEventTitleDisplayValue,
      workflowTimelineEventTitleLabel,
    );
    return renderDivElement(
      inlineChipRowClass,
      () => renderClassedSpan(workflowTimelineEventKindChipClass(), eventKindLabel),
      () => renderClassedSpan(workflowTimelineEventTitleClass(), eventTitleLabel),
    );
  };
  const renderPayloadChipRow = (payloadChips: string[]) =>
    renderDivContent(
      workflowTimelinePayloadChipRowClass(),
      <>
      <For
        each={workflowTimelinePayloadChipsDisplayValue(
          workflowTimelinePayloadChipsValueInputDisplayValue(
            payloadChips,
          ),
        )}
      >
        {(chip) =>
          renderMiniChip(
            "violet",
            resolveValueDisplayLabel(
              chip,
              workflowTimelinePayloadChipInputDisplayValue,
              workflowTimelinePayloadChipDisplayValue,
              workflowTimelinePayloadChipLabel,
            ),
          )}
      </For>
      </>,
    );
  const renderOptionalPayloadChipRowBlock = createOptionalMappedBlockRenderer(
    (item: Accessor<string[]>) => renderPayloadChipRow(item()),
  );
  const renderDisplayBadgeObject = <T extends {
    className: string;
    label: string;
    title?: string;
  }>(
    badge: T,
    classDisplayValue: (value: string) => string,
    labelDisplayValue: (value: string) => string,
    titleDisplayValue?: (value: string) => string,
  ) => renderResolvedSpan(
    badge,
    (value) => classDisplayValue(value.className),
    (value) => labelDisplayValue(value.label),
    titleDisplayValue === undefined
      ? undefined
      : (value) =>
        value.title === undefined ? undefined : titleDisplayValue(value.title),
  );
  const createOptionalBadgeBlockRenderer = <TValue, TMapped extends {
    className: string;
    label: string;
    title?: string;
  }>(
    mapBadge: (item: Accessor<TValue>) => TMapped,
    classDisplayValue: (value: string) => string,
    labelDisplayValue: (value: string) => string,
    titleDisplayValue?: (value: string) => string,
  ) => createOptionalMappedBlockRenderer(
    (item: Accessor<TValue>) =>
      renderDisplayBadgeObject(
        mapBadge(item),
        classDisplayValue,
        labelDisplayValue,
        titleDisplayValue,
      ),
  );
  const renderOptionalTriggerChipBlock = createOptionalBadgeBlockRenderer(
    (item: Accessor<{
      className: string;
      label: string;
      title: string;
    }>) => ({
      className: workflowTimelineTriggerChipPresentationClassDisplayValue(item()),
      label: workflowTimelineTriggerChipPresentationLabelDisplayValue(item()),
      title: workflowTimelineTriggerChipPresentationTitleDisplayValue(item()),
    }),
    workflowTimelineTriggerChipDisplayClass,
    workflowTimelineTriggerChipDisplayLabel,
    workflowTimelineTriggerChipDisplayTitle,
  );
  const renderOptionalReplayMatchBadgeBlock = createOptionalBadgeBlockRenderer(
    (item: Accessor<{
      className: string;
      label: string;
    }>) => ({
      className: workflowTimelineReplayMatchPresentationClassDisplayValue(item()),
      label: workflowTimelineReplayMatchPresentationLabelDisplayValue(item()),
    }),
    workflowTimelineReplayMatchDisplayClass,
    workflowTimelineReplayMatchDisplayLabel,
  );
  const renderOptionalDeploymentButtonBlock = createOptionalMappedBlockRenderer((
    item: Accessor<string>,
    deploymentKind: "deployment" | "original_deploy" | "replay_deploy" | "compared",
    buttonTone: "sky" | "indigo",
  ) => renderDeploymentButton(deploymentKind, buttonTone, () => item()));
  const resolveMappedAccessorDisplay = <
    TValue,
    TMapped,
    TDisplayInput,
    TDisplay,
  >(
    value: Accessor<TValue>,
    mapValue: (value: TValue) => TMapped,
    displayInputValue: (value: TMapped) => TDisplayInput,
    displayValue: (value: TDisplayInput) => TDisplay,
  ) => displayValue(displayInputValue(mapValue(value())));
  const createMappedAccessorDisplayRenderer = <
    TValue,
    TMapped,
    TDisplayInput,
    TDisplay,
  >(
    mapValue: (value: TValue) => TMapped,
    displayInputValue: (value: TMapped) => TDisplayInput,
    displayValue: (value: TDisplayInput) => TDisplay,
  ) => createMappedRendererFactory(resolveMappedAccessorDisplay)(
    mapValue,
    displayInputValue,
    displayValue,
  );
  const createAccessorDisplayRenderer = <TValue, TDisplayInput, TDisplay>(
    displayInputValue: (value: TValue) => TDisplayInput,
    displayValue: (value: TDisplayInput) => TDisplay,
  ) => createMappedAccessorDisplayRenderer(
    createIdentityMapper<TValue>(),
    displayInputValue,
    displayValue,
  );
  const createMappedAccessorDisplayLabelRenderer = <
    TValue,
    TMapped,
    TDisplayInput,
    TDisplay,
  >(
    mapValue: (value: TValue) => TMapped,
    displayInputValue: (value: TMapped) => TDisplayInput,
    displayValue: (value: TDisplayInput) => TDisplay,
    label: (display: TDisplay) => string,
  ) => createDisplayLabelFromRenderer(
    createMappedAccessorDisplayRenderer(
      mapValue,
      displayInputValue,
      displayValue,
    ),
    label,
  );
  const createAccessorDisplayLabelRenderer = <TValue, TDisplayInput, TDisplay>(
    displayInputValue: (value: TValue) => TDisplayInput,
    displayValue: (value: TDisplayInput) => TDisplay,
    label: (display: TDisplay) => string,
  ) => createMappedAccessorDisplayLabelRenderer(
    createIdentityMapper<TValue>(),
    displayInputValue,
    displayValue,
    label,
  );
  const createNestedMappedDisplayLabelRenderer = <
    TValue,
    TMapped,
    TDisplayInput,
    TDisplay,
  >(
    mapValue: (value: TValue) => TMapped,
    displayInputValue: (value: TMapped) => TDisplayInput,
    displayValue: (value: TDisplayInput) => TDisplay,
    label: (display: TDisplay) => string,
  ) => createMappedAccessorDisplayLabelRenderer(
    mapValue,
    displayInputValue,
    displayValue,
    label,
  );
  const resolveAccessorDisplay = <TValue, TDisplayInput, TDisplay>(
    value: Accessor<TValue>,
    displayInputValue: (value: TValue) => TDisplayInput,
    displayValue: (value: TDisplayInput) => TDisplay,
  ) => createMappedAccessorDisplayRenderer(
    createIdentityMapper<TValue>(),
    displayInputValue,
    displayValue,
  )(value);
  const resolveAccessorDisplayLabel = <TValue, TDisplayInput, TDisplay>(
    value: Accessor<TValue>,
    displayInputValue: (value: TValue) => TDisplayInput,
    displayValue: (value: TDisplayInput) => TDisplay,
    label: (display: TDisplay) => string,
  ) => createMappedAccessorDisplayLabelRenderer(
    createIdentityMapper<TValue>(),
    displayInputValue,
    displayValue,
    label,
  )(value);
  const createMetadataChipLabelRenderer = createAccessorDisplayLabelRenderer;
  const createNumericMetadataChipLabelRenderer = createNestedMappedDisplayLabelRenderer;
  const renderManifestHeaderDetailLabel = (value: Accessor<string>) =>
    resolveAccessorDisplayLabel(
      value,
      workflowTimelineManifestHeaderDetailValueInputDisplayValue,
      workflowTimelineManifestHeaderDetailDisplayValue,
      workflowTimelineManifestHeaderDetailLabel,
    );
  const renderRequestSummaryLabel = (value: Accessor<string>) =>
    resolveAccessorDisplayLabel(
      value,
      workflowTimelineRequestSummaryValueInputDisplayValue,
      workflowTimelineRequestSummaryDisplayValue,
      workflowTimelineRequestSummaryLabel,
    );
  const renderResultSummaryLabel = (value: Accessor<string>) =>
    resolveAccessorDisplayLabel(
      value,
      workflowTimelineResultSummaryValueInputDisplayValue,
      workflowTimelineResultSummaryDisplayValue,
      workflowTimelineResultSummaryLabel,
    );
  const handleStepNodeFocus = (nodeId: Accessor<string>) => {
    setSelectedNodeTarget(nodeId());
  };
  const renderStepNodeIdDisplay = (value: Accessor<string>) =>
    resolveAccessorDisplay(
      value,
      workflowTimelineStepNodeIdValueInputDisplayValue,
      workflowTimelineStepNodeIdDisplayValue,
    );
  const renderStepNodeActionLabel = (
    nodeId: Accessor<string>,
  ) => workflowTimelineStepNodeButtonLabel(
      stepNodeDisplayLabel,
      renderStepNodeIdDisplay(nodeId),
    );
  const handleDeploymentSelectorFocus = (deploymentId: Accessor<string>) => {
    focusDeploymentRecordTarget(deploymentId());
  };
  const renderTraceReasonLabel = (value: Accessor<string>) =>
    resolveAccessorDisplayLabel(
      value,
      workflowTimelineTraceReasonValueInputDisplayValue,
      workflowTimelineTraceReasonDisplayValue,
      workflowTimelineTraceReasonLabel,
    );
  const renderResumeFamilyChipLabel = (value: Accessor<string>) =>
    resolveAccessorDisplayLabel(
      value,
      workflowTimelineResumeFamilyValueInputDisplayValue,
      workflowTimelineResumeFamilyDisplayValue,
      workflowTimelineResumeFamilyLabel,
    );
  const renderDistinctResumeKindChipLabel = (value: Accessor<string>) =>
    resolveAccessorDisplayLabel(
      value,
      workflowTimelineDistinctResumeKindValueInputDisplayValue,
      workflowTimelineDistinctResumeKindDisplayValue,
      workflowTimelineResumeKindDisplayLabel,
    );
  const renderWaitResumeIdChipLabel = (value: Accessor<string>) =>
    resolveAccessorDisplayLabel(
      value,
      workflowTimelineWaitResumeIdValueInputDisplayValue,
      workflowTimelineWaitResumeIdDisplayValue,
      workflowTimelineWaitResumeIdLabel,
    );
  const renderStartedCompletedSummaryLabel = (value: Accessor<string>) =>
    resolveAccessorDisplayLabel(
      value,
      workflowTimelineStartedCompletedValueInputDisplayValue,
      workflowTimelineStartedCompletedDisplayValue,
      workflowTimelineStartedCompletedLabel,
    );
  const renderTraceSourceChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineTraceSourceValueInputDisplayValue,
    workflowTimelineTraceSourceDisplayValue,
    workflowTimelineTraceSourceLabel,
  );
  const renderTraceDetailChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineTraceDetailValueInputDisplayValue,
    workflowTimelineTraceDetailDisplayValue,
    workflowTimelineTraceDetailLabel,
  );
  const renderTraceSideEffectsChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineTraceSideEffectsValueInputDisplayValue,
    workflowTimelineTraceSideEffectsDisplayValue,
    workflowTimelineTraceSideEffectsLabel,
  );
  const renderTraceExecutionChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineTraceExecutionValueInputDisplayValue,
    workflowTimelineTraceExecutionDisplayValue,
    workflowTimelineTraceExecutionLabel,
  );
  const renderActionCategoryChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineActionCategoryValueInputDisplayValue,
    workflowTimelineActionCategoryDisplayValue,
    workflowTimelineActionCategoryLabel,
  );
  const renderIntegrationFamilyChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineIntegrationFamilyValueInputDisplayValue,
    workflowTimelineIntegrationFamilyDisplayValue,
    workflowTimelineIntegrationFamilyLabel,
  );
  const renderOutcomeChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineOutcomeValueInputDisplayValue,
    workflowTimelineOutcomeDisplayValue,
    workflowTimelineOutcomeLabel,
  );
  const renderConnectorStatusChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineConnectorStatusValueInputDisplayValue,
    workflowTimelineConnectorStatusDisplayValue,
    workflowTimelineConnectorStatusLabel,
  );
  const renderStatusCodeChipLabel = createNumericMetadataChipLabelRenderer(
    workflowTimelineStatusCodeValueInputDisplayValue,
    workflowTimelineStatusCodeValueDisplayValue,
    workflowTimelineStatusCodeDisplayValue,
    workflowTimelineStatusCodeLabel,
  );
  const renderAuthModeChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineAuthModeValueInputDisplayValue,
    workflowTimelineAuthModeDisplayValue,
    workflowTimelineAuthModeLabel,
  );
  const renderApprovalChipLabelValue = createMetadataChipLabelRenderer(
    workflowTimelineApprovalChipValueInputDisplayValue,
    workflowTimelineApprovalChipDisplayValue,
    workflowTimelineApprovalChipLabel,
  );
  const renderServiceChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineServiceValueInputDisplayValue,
    workflowTimelineServiceDisplayValue,
    workflowTimelineServiceLabel,
  );
  const renderProviderChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineProviderValueInputDisplayValue,
    workflowTimelineProviderDisplayValue,
    workflowTimelineProviderLabel,
  );
  const renderProviderRequestChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineProviderRequestValueInputDisplayValue,
    workflowTimelineProviderRequestDisplayValue,
    workflowTimelineProviderRequestLabel,
  );
  const renderProviderStatusChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineProviderStatusValueInputDisplayValue,
    workflowTimelineProviderStatusDisplayValue,
    workflowTimelineProviderStatusLabel,
  );
  const renderLatencyChipLabel = createNumericMetadataChipLabelRenderer(
    workflowTimelineLatencyValueInputDisplayValue,
    workflowTimelineLatencyValueDisplayValue,
    workflowTimelineLatencyDisplayValue,
    workflowTimelineLatencyLabel,
  );
  const renderDeploymentEnvironmentChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineDeploymentEnvironmentValueInputDisplayValue,
    workflowTimelineDeploymentEnvironmentDisplayValue,
    workflowTimelineDeploymentEnvironmentLabel,
  );
  const renderReplayRunChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineReplayRunValueInputDisplayValue,
    workflowTimelineReplayRunDisplayValue,
    workflowTimelineReplayRunLabel,
  );
  const renderReplayDeltaChipLabel = createNumericMetadataChipLabelRenderer(
    workflowTimelineReplayDeltaValueInputDisplayValue,
    workflowTimelineReplayDeltaValueDisplayValue,
    workflowTimelineReplayDeltaDisplayValue,
    workflowTimelineReplayDeltaLabel,
  );
  const renderDeliveryTierChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineDeliveryTierValueInputDisplayValue,
    workflowTimelineDeliveryTierDisplayValue,
    workflowTimelineDeliveryTierLabel,
  );
  const renderProviderRouteChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineProviderRouteValueInputDisplayValue,
    workflowTimelineProviderRouteDisplayValue,
    workflowTimelineProviderRouteLabel,
  );
  const renderCapabilityChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineCapabilityValueInputDisplayValue,
    workflowTimelineCapabilityDisplayValue,
    workflowTimelineCapabilityLabel,
  );
  const renderActionOperationChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineActionOperationValueInputDisplayValue,
    workflowTimelineActionOperationDisplayValue,
    workflowTimelineActionOperationLabel,
  );
  const renderTimeoutChipLabel = createNumericMetadataChipLabelRenderer(
    workflowTimelineTimeoutValueInputDisplayValue,
    workflowTimelineTimeoutValueDisplayValue,
    workflowTimelineTimeoutDisplayValue,
    workflowTimelineTimeoutLabel,
  );
  const renderAttemptsChipLabel = createNumericMetadataChipLabelRenderer(
    workflowTimelineAttemptsValueInputDisplayValue,
    workflowTimelineAttemptsValueDisplayValue,
    workflowTimelineAttemptsDisplayValue,
    workflowTimelineAttemptsLabel,
  );
  const renderRetriesChipLabel = createNumericMetadataChipLabelRenderer(
    workflowTimelineRetriesValueInputDisplayValue,
    workflowTimelineRetriesValueDisplayValue,
    workflowTimelineRetriesDisplayValue,
    workflowTimelineRetriesLabel,
  );
  const renderOnTimeoutChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineOnTimeoutValueInputDisplayValue,
    workflowTimelineOnTimeoutDisplayValue,
    workflowTimelineOnTimeoutLabel,
  );
  const renderAllowedToolsChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineAllowedToolsValueInputDisplayValue,
    workflowTimelineAllowedToolsDisplayValue,
    workflowTimelineAllowedToolsLabel,
  );
  const renderAllowedCapabilitiesChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineAllowedCapabilitiesValueInputDisplayValue,
    workflowTimelineAllowedCapabilitiesDisplayValue,
    workflowTimelineAllowedCapabilitiesLabel,
  );
  const renderOutboundAllowlistChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineOutboundAllowlistValueInputDisplayValue,
    workflowTimelineOutboundAllowlistDisplayValue,
    workflowTimelineOutboundAllowlistLabel,
  );
  const renderTracePhaseChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineTracePhaseValueInputDisplayValue,
    workflowTimelineTracePhaseDisplayValue,
    workflowTimelineTracePhaseLabel,
  );
  const renderCheckpointChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineCheckpointValueInputDisplayValue,
    workflowTimelineCheckpointDisplayValue,
    workflowTimelineCheckpointLabel,
  );
  const renderTraceKindChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineTraceKindValueInputDisplayValue,
    workflowTimelineTraceKindDisplayValue,
    workflowTimelineTraceKindLabel,
  );
  const renderRoutingModeChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineRoutingModeValueInputDisplayValue,
    workflowTimelineRoutingModeDisplayValue,
    workflowTimelineRoutingModeLabel,
  );
  const renderRouteChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineRouteValueInputDisplayValue,
    workflowTimelineRouteDisplayValue,
    workflowTimelineRouteLabel,
  );
  const renderTargetNodeChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineTargetNodeValueInputDisplayValue,
    workflowTimelineTargetNodeDisplayValue,
    workflowTimelineTargetNodeLabel,
  );
  const renderSelectedLabelsChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineSelectedLabelsValueInputDisplayValue,
    workflowTimelineSelectedLabelsDisplayValue,
    workflowTimelineSelectedLabelsLabel,
  );
  const renderSelectedEdgeCountChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineSelectedEdgeCountValueInputDisplayValue,
    workflowTimelineSelectedEdgeCountDisplayValue,
    workflowTimelineSelectedEdgeCountLabel,
  );
  const renderSkippedEdgeCountChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineSkippedEdgeCountValueInputDisplayValue,
    workflowTimelineSkippedEdgeCountDisplayValue,
    workflowTimelineSkippedEdgeCountLabel,
  );
  const renderDecisionPointChipLabel = createMetadataChipLabelRenderer(
    workflowTimelineDecisionPointValueInputDisplayValue,
    workflowTimelineDecisionPointDisplayValue,
    workflowTimelineDecisionPointLabel,
  );
  const renderOptionCountChipLabel = createNumericMetadataChipLabelRenderer(
    workflowTimelineOptionCountValueInputDisplayValue,
    workflowTimelineOptionCountValueDisplayValue,
    workflowTimelineOptionCountDisplayValue,
    workflowTimelineOptionCountLabel,
  );
  const metadataSectionGroups: Array<() => JSX.Element> = [
    renderBlockGroup(
      renderOptionalMetadataChipBlock(
        traceSourceVisibility,
        "slate",
        renderTraceSourceChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        traceDetailVisibility,
        "slate",
        renderTraceDetailChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        traceSideEffectsVisibility,
        "slate",
        renderTraceSideEffectsChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        traceExecutionVisibility,
        "slate",
        renderTraceExecutionChipLabel,
      ),
    ),
    renderBlockGroup(
      renderOptionalMetadataChipBlock(
        actionCategoryVisibility,
        "violet",
        renderActionCategoryChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        integrationFamilyVisibility,
        "fuchsia",
        renderIntegrationFamilyChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        outcomeVisibility,
        "emerald",
        renderOutcomeChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        connectorStatusVisibility,
        "emerald",
        renderConnectorStatusChipLabel,
      ),
    ),
    renderBlockGroup(
      renderOptionalMetadataChipBlock(
        statusCodeVisibility,
        "emerald",
        renderStatusCodeChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        authModeVisibility,
        "amber",
        renderAuthModeChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        approvalChipVisibility,
        "amber",
        renderApprovalChipLabelValue,
      ),
    ),
    renderBlockGroup(
      renderOptionalMetadataChipBlock(
        serviceVisibility,
        "sky",
        renderServiceChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        providerVisibility,
        "sky",
        renderProviderChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        providerRequestVisibility,
        "sky",
        renderProviderRequestChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        providerStatusVisibility,
        "sky",
        renderProviderStatusChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        latencyVisibility,
        "indigo",
        renderLatencyChipLabel,
      ),
    ),
    renderBlockGroup(
      renderOptionalDeploymentButtonBlock(
        actionDeploymentVisibility,
        "deployment",
        "sky",
      ),
      renderOptionalMetadataChipBlock(
        deploymentEnvironmentVisibility,
        "slate",
        renderDeploymentEnvironmentChipLabel,
      ),
      renderOptionalTriggerChipBlock(runtimeTriggerChipVisibility),
      renderOptionalMetadataChipBlock(
        replayRunVisibility,
        "slate",
        renderReplayRunChipLabel,
      ),
      renderOptionalDeploymentButtonBlock(
        replayOriginalDeploymentVisibility,
        "original_deploy",
        "indigo",
      ),
      renderOptionalDeploymentButtonBlock(
        replayEffectiveDeploymentVisibility,
        "replay_deploy",
        "indigo",
      ),
      renderOptionalDeploymentButtonBlock(
        replayComparedDeploymentVisibility,
        "compared",
        "indigo",
      ),
      renderOptionalReplayMatchBadgeBlock(replayMatchBadgeVisibility),
      renderOptionalMetadataChipBlock(
        replayDeltaVisibility,
        "indigo",
        renderReplayDeltaChipLabel,
      ),
    ),
    renderBlockGroup(
      renderOptionalMetadataChipBlock(
        deliveryTierVisibility,
        "slate",
        renderDeliveryTierChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        providerRouteVisibility,
        "slate",
        renderProviderRouteChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        capabilityVisibility,
        "sky",
        renderCapabilityChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        actionOperationVisibility,
        "sky",
        renderActionOperationChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        timeoutVisibility,
        "indigo",
        renderTimeoutChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        attemptsVisibility,
        "indigo",
        renderAttemptsChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        retriesVisibility,
        "indigo",
        renderRetriesChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        onTimeoutVisibility,
        "indigo",
        renderOnTimeoutChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        allowedToolsVisibility,
        "slate",
        renderAllowedToolsChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        allowedCapabilitiesVisibility,
        "slate",
        renderAllowedCapabilitiesChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        outboundAllowlistVisibility,
        "slate",
        renderOutboundAllowlistChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        tracePhaseVisibility,
        "violet",
        renderTracePhaseChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        checkpointVisibility,
        "emerald",
        renderCheckpointChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        traceKindVisibility,
        "violet",
        renderTraceKindChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        routingModeVisibility,
        "sky",
        renderRoutingModeChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        routeVisibility,
        "sky",
        renderRouteChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        targetNodeVisibility,
        "sky",
        renderTargetNodeChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        selectedLabelsVisibility,
        "emerald",
        renderSelectedLabelsChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        selectedEdgeCountVisibility,
        "emerald",
        renderSelectedEdgeCountChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        skippedEdgeCountVisibility,
        "slate",
        renderSkippedEdgeCountChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        decisionPointVisibility,
        "amber",
        renderDecisionPointChipLabel,
      ),
      renderOptionalMetadataChipBlock(
        optionCountVisibility,
        "amber",
        renderOptionCountChipLabel,
      ),
    ),
  ];
  const secondaryTextBlocks: Array<() => JSX.Element> = [
    renderOptionalSecondaryTextBlock(
      startedCompletedSummary,
      startedCompletedSpacing,
      renderStartedCompletedSummaryLabel,
    ),
    renderOptionalSecondaryTextBlock(
      requestSummaryVisibility,
      requestSummarySpacing,
      renderRequestSummaryLabel,
    ),
    renderOptionalSecondaryTextBlock(
      resultSummaryVisibility,
      resultSummarySpacing,
      renderResultSummaryLabel,
    ),
    renderOptionalSecondaryTextBlock(
      traceReasonVisibility,
      traceReasonSpacing,
      renderTraceReasonLabel,
    ),
  ];
  const titleRowBlocks: Array<() => JSX.Element> = [
    renderStaticElementBlock(
      renderTextParagraph(
        workflowTimelineTitleClass(
          visibleSurfaceTitleClass,
        ),
        workflowTimelineTitleLabel(
          resolveValueDisplay(
            renderIndex,
            workflowTimelineTitleRenderIndexInputDisplayValue,
            workflowTimelineTitleRenderIndexDisplayValue,
          ),
          resolveValueDisplay(
            objective,
            workflowTimelineTitleObjectiveInputDisplayValue,
            workflowTimelineTitleObjectiveDisplayValue,
          ),
        ),
      ),
    ),
    renderSectionInlineChipRowBlock(
      renderOptionalPresenceBlock(
        focusedEdgeVisibility,
        () =>
          renderResolvedSpan(
            null,
            () =>
              workflowTimelineRelationBadgeClass(
                resolveValueDisplay(
                  entryRelation,
                  workflowTimelineRelationInputDisplayValue,
                  workflowTimelineRelationDisplayValue,
                ),
              ),
            () =>
              resolveValueDisplayLabel(
                entryRelation,
                workflowTimelineRelationInputDisplayValue,
                workflowTimelineRelationLabelDisplayValue,
                workflowTimelineRelationLabel,
              ),
          ),
      ),
      renderStaticElementBlock(
        renderResolvedSpan(
          null,
          () =>
            workflowTimelineStatusBadgeClass(
              workflowTimelineStatusDisplayClass(
                resolveValueDisplay(
                  statusClass,
                  workflowTimelineStatusClassInputDisplayValue,
                  workflowTimelineStatusDisplayValue,
                ),
              ),
            ),
          () =>
            resolveValueDisplayLabel(
              status,
              workflowTimelineStatusInputDisplayValue,
              workflowTimelineStatusLabelDisplayValue,
              workflowTimelineStatusLabel,
            ),
        ),
      ),
    ),
  ];
  const headerDetailBlocks: Array<() => JSX.Element> = [
    renderStaticElementBlock(
      renderHeaderDetail("primary", primaryHeaderDetailLabel),
    ),
    renderStaticElementBlock(
      renderHeaderDetail("secondary", secondaryHeaderDetailLabel),
    ),
    renderStaticElementBlock(
      renderHeaderDetail("runtime", runtimeHeaderDetailLabel),
    ),
    renderOptionalHeaderDetailBlock(
      manifestHeaderDetailVisibility,
      "manifest",
      renderManifestHeaderDetailLabel,
    ),
  ];
  const policySectionBlocks: Array<() => JSX.Element> = [
    renderSectionInlineChipRowBlock(
      renderStaticElementBlock(
        renderMiniChip("sky-strong", policySourceChipLabel),
      ),
      renderOptionalInteractiveMiniChipBlock(
        stepNodeIdVisibility,
        "sky-strong",
        handleStepNodeFocus,
        renderStepNodeActionLabel,
      ),
      renderOptionalInteractiveMiniChipBlock(
        deploymentSelectorIdVisibility,
        "sky-strong",
        handleDeploymentSelectorFocus,
        () => reviewSnapshotLabel,
      ),
    ),
    renderStaticElementBlock(
      renderTextParagraph(policySummaryTextClass, policySummaryLabel),
    ),
  ];
  const waitResumeSectionBlocks: Array<() => JSX.Element> = [
    renderStaticElementBlock(waitResumeSectionHeading),
    renderOptionalMiniChipBlock(
      resumeFamilyVisibility,
      resumeFamilyTone,
      renderResumeFamilyChipLabel,
    ),
    renderOptionalMiniChipBlock(
      distinctResumeKindVisibility,
      distinctResumeKindTone,
      renderDistinctResumeKindChipLabel,
    ),
    renderOptionalMiniChipBlock(
      waitResumeIdVisibility,
      waitResumeIdTone,
      renderWaitResumeIdChipLabel,
    ),
  ];
  const renderTraceEventCard = (event: WorkflowRunTimelineStepCardData["traceEvents"][number]) => {
    const eventSummaryLabel = resolveValueDisplayLabel(
      event.summary,
      workflowTimelineEventSummaryInputDisplayValue,
      workflowTimelineEventSummaryDisplayValue,
      workflowTimelineEventSummaryLabel,
    );
    return renderDivElement(
      eventCardClass,
      renderStaticElementBlock(
        renderEventHeading(event.kind, event.title),
      ),
      renderStaticElementBlock(
        renderSecondaryText("sm", eventSummaryLabel),
      ),
      renderOptionalPayloadChipRowBlock(
        workflowTimelineOptionalPayloadChipsDisplayValue(
          workflowTimelinePayloadChipsInputDisplayValue(
            timelineEventPayloadChips(event.payload),
          ),
        ),
      ),
    );
  };
  const lowerSectionBlocks: Array<() => JSX.Element> = [
    renderOptionalSectionContainerBlock(
      policyFieldChangesVisibility,
      "sky",
      "md",
      () =>
        renderBlockGroup(
          ...policySectionBlocks,
        )(),
    ),
    renderOptionalSectionContainerBlock<
      [
        WorkflowRunTimelineStepCardData["traceEvents"] | null,
      ][number] extends never ? never : WorkflowRunTimelineStepCardData["traceEvents"]
    >(
      traceEventsVisibility as WorkflowRunTimelineStepCardData["traceEvents"] | null,
      "violet",
      "md",
      (traceEvents) => {
        const traceEventItems =
          workflowTimelineTraceEventsDisplayValue(traceEvents()) as WorkflowRunTimelineStepCardData["traceEvents"];
        return renderBlockSequence(
          renderStaticElementBlock(stepEventsSectionHeading),
          () => (
            <For each={traceEventItems}>
              {(event) => renderTraceEventCard(event)}
            </For>
          ),
        );
      },
    ),
    renderOptionalSectionContainerBlock(
      waitResumeEventVisibility,
      "sky",
      "sm",
      () =>
        renderSectionInlineChipRowBlock(
          ...waitResumeSectionBlocks,
        )(),
    ),
  ];
  const narrativeBlock = renderStaticElementBlock(
    renderTextBlock(
      workflowTimelineNarrativeClass(
        workflowTimelineNarrativeToneDisplayClass(narrativeToneClass),
      ),
      resolveValueDisplayLabel(
        narrativeText,
        workflowTimelineNarrativeInputDisplayValue,
        workflowTimelineNarrativeDisplayValue,
        workflowTimelineNarrativeLabel,
      ),
    ),
  );
  const cardBodyBlocks: Array<() => JSX.Element> = [
    renderDivBlock(
      titleRowClass,
      ...titleRowBlocks,
    ),
    renderDivBlock(
      headerDetailRowClass,
      renderBlockGroup(
        ...headerDetailBlocks,
      ),
    ),
    ...secondaryTextBlocks,
    renderOptionalPresenceBlock(
      hasMetadata,
      () =>
        renderDivBlock(
          metadataRowClass,
          ...metadataSectionGroups,
        )(),
    ),
    ...lowerSectionBlocks,
    narrativeBlock,
  ];
  return (
    renderDivContent(
      workflowTimelineCardContainerClass(
        visibleSurfaceContainerClass,
      ),
      renderBlockGroup(
        ...cardBodyBlocks,
      )(),
    )
  );
}
