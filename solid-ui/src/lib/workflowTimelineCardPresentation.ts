// @locs-version: 1.0
import { approvalModeLabel } from "afp-ts/continuity";

export type WorkflowTimelineMetadataCard = {
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
  decisionPointId: string | null;
  entryRelation: string;
  integrationFamily: string | null;
  optionCount: number | null;
  outcomeCheckpoint: string | null;
  routingMode: string | null;
  selectedOutgoingEdgeIds: string[];
  selectedOutgoingLabels: string[];
  traceDetailMode: string | null;
  traceExecutionMode: string | null;
  traceKind: string | null;
  tracePhase: string | null;
  traceReason: string | null;
  traceSideEffects: string | null;
  traceSource: string | null;
};

export function workflowTimelineEntryRelationBadge(entryRelation: string) {
  if (entryRelation === "from") {
    return "bg-sky-100 text-sky-700";
  }
  if (entryRelation === "to") {
    return "bg-emerald-100 text-emerald-700";
  }
  return "bg-violet-100 text-violet-700";
}

export function workflowTimelineRelationBadgeClass(entryRelation: string): string {
  return `rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${workflowTimelineEntryRelationBadge(entryRelation)}`;
}

export function workflowTimelineRelationDisplayValue(entryRelation: string): string {
  return entryRelation;
}

export function workflowTimelineRelationInputDisplayValue(entryRelation: string): string {
  return entryRelation;
}

export function workflowTimelineFocusedEdgeDisplayValue(focusedEdge: boolean): boolean {
  return focusedEdge;
}

export function workflowTimelineFocusedEdgeInputDisplayValue(focusedEdge: boolean): boolean {
  return focusedEdge;
}

export function workflowTimelineRelationLabel(entryRelation: string): string {
  return entryRelation;
}

export function workflowTimelineRelationLabelDisplayValue(
  entryRelation: string,
): string {
  return entryRelation;
}

export function workflowTimelineStatusBadgeClass(statusClass: string): string {
  return `rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusClass}`;
}

export function workflowTimelineStatusDisplayClass(statusClass: string): string {
  return statusClass;
}

export function workflowTimelineStatusDisplayValue(statusClass: string): string {
  return statusClass;
}

export function workflowTimelineStatusClassInputDisplayValue(statusClass: string): string {
  return statusClass;
}

export function workflowTimelineStatusLabel(status: string): string {
  return status;
}

export function workflowTimelineStatusLabelDisplayValue(status: string): string {
  return status;
}

export function workflowTimelineStatusInputDisplayValue(status: string): string {
  return status;
}

export function workflowTimelineHeaderDetailClass(
  emphasis: "primary" | "secondary" = "secondary",
): string {
  return emphasis === "primary"
    ? "text-xs uppercase tracking-[0.14em] text-violet-600"
    : "text-xs uppercase tracking-[0.14em] text-violet-500";
}

export function workflowTimelineHeaderDetailEmphasisDisplayValue(
  emphasis: "primary" | "secondary" = "secondary",
): "primary" | "secondary" {
  return emphasis;
}

export function workflowTimelineSecondaryHeaderDetailEmphasisDisplayValue(): "secondary" {
  return "secondary";
}

export function workflowTimelineManifestHeaderDetailEmphasisDisplayValue(): "secondary" {
  return "secondary";
}

export function workflowTimelineRuntimeHeaderDetailEmphasisDisplayValue(): "secondary" {
  return "secondary";
}

export function workflowTimelinePrimaryHeaderDetailLabel(graphNodeLabel: string): string {
  return graphNodeLabel;
}

export function workflowTimelinePrimaryHeaderDetailDisplayValue(
  graphNodeLabel: string,
): string {
  return graphNodeLabel;
}

export function workflowTimelinePrimaryHeaderDetailInputDisplayValue(
  graphNodeLabel: string,
): string {
  return graphNodeLabel;
}

export function workflowTimelineSecondaryHeaderDetailLabel(graphNodeKind: string): string {
  return graphNodeKind;
}

export function workflowTimelineSecondaryHeaderDetailDisplayValue(
  graphNodeKind: string,
): string {
  return graphNodeKind;
}

export function workflowTimelineSecondaryHeaderDetailInputDisplayValue(
  graphNodeKind: string,
): string {
  return graphNodeKind;
}

export function workflowTimelineManifestHeaderDetailLabel(manifestNodeId: string): string {
  return manifestNodeId;
}

export function workflowTimelineOptionalManifestHeaderDetailDisplayValue(
  manifestNodeId: string | null,
): string | null {
  return manifestNodeId;
}

export function workflowTimelineManifestHeaderDetailInputDisplayValue(
  manifestNodeId: string | null,
): string | null {
  return manifestNodeId;
}

export function workflowTimelineManifestHeaderDetailDisplayValue(
  manifestNodeId: string,
): string {
  return manifestNodeId;
}

export function workflowTimelineManifestHeaderDetailValueInputDisplayValue(
  manifestNodeId: string,
): string {
  return manifestNodeId;
}

export function workflowTimelineRequestSummaryLabel(actionRequestSummary: string): string {
  return actionRequestSummary;
}

export function workflowTimelineOptionalRequestSummaryDisplayValue(
  actionRequestSummary: string | null,
): string | null {
  return actionRequestSummary;
}

export function workflowTimelineRequestSummaryInputDisplayValue(
  actionRequestSummary: string | null,
): string | null {
  return actionRequestSummary;
}

export function workflowTimelineRequestSummaryDisplayValue(
  actionRequestSummary: string,
): string {
  return actionRequestSummary;
}

export function workflowTimelineRequestSummaryValueInputDisplayValue(
  actionRequestSummary: string,
): string {
  return actionRequestSummary;
}

export function workflowTimelineResultSummaryLabel(actionResultSummary: string): string {
  return actionResultSummary;
}

export function workflowTimelineOptionalResultSummaryDisplayValue(
  actionResultSummary: string | null,
): string | null {
  return actionResultSummary;
}

export function workflowTimelineResultSummaryInputDisplayValue(
  actionResultSummary: string | null,
): string | null {
  return actionResultSummary;
}

export function workflowTimelineResultSummaryDisplayValue(
  actionResultSummary: string,
): string {
  return actionResultSummary;
}

export function workflowTimelineResultSummaryValueInputDisplayValue(
  actionResultSummary: string,
): string {
  return actionResultSummary;
}

export function workflowTimelineTraceReasonLabel(traceReason: string): string {
  return traceReason;
}

export function workflowTimelineOptionalTraceReasonDisplayValue(
  traceReason: string | null,
): string | null {
  return traceReason;
}

export function workflowTimelineTraceReasonInputDisplayValue(
  traceReason: string | null,
): string | null {
  return traceReason;
}

export function workflowTimelineTraceReasonDisplayValue(traceReason: string): string {
  return traceReason;
}

export function workflowTimelineTraceReasonValueInputDisplayValue(
  traceReason: string,
): string {
  return traceReason;
}

export function workflowTimelineMetadataRowClass(): string {
  return "mt-3 flex min-w-0 flex-wrap gap-2";
}

export function workflowTimelineInlineChipRowClass(): string {
  return "flex min-w-0 flex-wrap items-center gap-2";
}

export function workflowTimelineHeaderDetailRowClass(): string {
  return "mt-1 flex min-w-0 flex-wrap gap-2";
}

export function workflowTimelineTitleRowClass(): string {
  return "flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3";
}

export function workflowTimelineTitleClass(titleClass: string): string {
  return `break-words text-sm font-semibold ${titleClass}`;
}

export function workflowTimelineSurfaceTitleDisplayClass(titleClass: string): string {
  return titleClass;
}

export function workflowTimelineSurfacePresentationTitleDisplayValue(
  presentation: { containerClass: string; titleClass: string },
): string {
  return presentation.titleClass;
}

export function workflowTimelineSurfacePresentationDisplayValue(
  presentation: { containerClass: string; titleClass: string },
): { containerClass: string; titleClass: string } {
  return presentation;
}

export function workflowTimelineSurfacePresentationInputDisplayValue(
  presentation: { containerClass: string; titleClass: string },
): { containerClass: string; titleClass: string } {
  return presentation;
}

export function workflowTimelineCardContainerClass(containerClass: string): string {
  return `min-w-0 rounded-2xl border px-3 py-3 ${containerClass}`;
}

export function workflowTimelineSurfacePresentationContainerDisplayValue(
  presentation: { containerClass: string; titleClass: string },
): string {
  return presentation.containerClass;
}

export function workflowTimelineSurfaceContainerDisplayClass(containerClass: string): string {
  return containerClass;
}

export function workflowTimelineTitleLabel(renderIndex: number, objective: string): string {
  return `${renderIndex}. ${objective}`;
}

export function workflowTimelineTitleRenderIndexDisplayValue(renderIndex: number): number {
  return renderIndex;
}

export function workflowTimelineTitleRenderIndexInputDisplayValue(renderIndex: number): number {
  return renderIndex;
}

export function workflowTimelineTitleObjectiveDisplayValue(objective: string): string {
  return objective;
}

export function workflowTimelineTitleObjectiveInputDisplayValue(objective: string): string {
  return objective;
}

export function workflowTimelineMetadataChipClass(
  tone: "slate" | "violet" | "fuchsia" | "emerald" | "amber" | "sky" | "indigo",
): string {
  return {
    slate:
      "rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-700",
    violet:
      "rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-violet-700",
    fuchsia:
      "rounded-full border border-fuchsia-200/70 bg-fuchsia-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-fuchsia-700",
    emerald:
      "rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-700",
    amber:
      "rounded-full border border-amber-200/70 bg-amber-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-amber-700",
    sky:
      "rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-sky-700",
    indigo:
      "rounded-full border border-indigo-200/70 bg-indigo-50/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-indigo-700",
  }[tone];
}

export function workflowTimelineMetadataChipToneDisplayValue<
  T extends "slate" | "violet" | "fuchsia" | "emerald" | "amber" | "sky" | "indigo",
>(tone: T): T {
  return tone;
}

export function workflowTimelineMiniChipClass(
  tone: "sky-strong" | "sky-soft" | "violet",
): string {
  return {
    "sky-strong":
      "rounded-full border border-sky-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700",
    "sky-soft":
      "rounded-full border border-sky-200/70 bg-white/85 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-sky-600",
    violet:
      "rounded-full border border-violet-200/70 bg-violet-50/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-violet-700",
  }[tone];
}

export function workflowTimelineMiniChipToneDisplayValue<
  T extends "sky-strong" | "sky-soft" | "violet",
>(tone: T): T {
  return tone;
}

export function workflowTimelineInteractiveMiniChipClass(
  tone: "sky-strong" = "sky-strong",
): string {
  return `${workflowTimelineMiniChipClass(tone)} transition hover:bg-white`;
}

export function workflowTimelineSectionLabelClass(tone: "sky" | "violet"): string {
  return tone === "sky"
    ? "text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700"
    : "text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700";
}

export function workflowTimelineSecondaryTextClass(marginTop: "none" | "sm" | "md" = "none"): string {
  return `${marginTop === "sm" ? "mt-1 " : marginTop === "md" ? "mt-2 " : ""}text-xs text-on-surface-variant`;
}

export function workflowTimelineSecondaryTextSpacingDisplayValue<
  T extends "none" | "sm" | "md",
>(marginTop: T = "none" as T): T {
  return marginTop;
}

export function workflowTimelineSectionContainerClass(
  tone: "sky" | "violet",
  paddingY: "md" | "sm" = "md",
): string {
  const paddingClass = paddingY === "sm" ? "py-2" : "py-3";
  return tone === "sky"
    ? `mt-3 rounded-2xl border border-sky-200/70 bg-sky-50/70 px-3 ${paddingClass}`
    : `mt-3 space-y-2 rounded-2xl border border-violet-200/60 bg-violet-50/50 px-3 ${paddingClass}`;
}

export function workflowTimelineSectionToneDisplayValue<T extends "sky" | "violet">(
  tone: T,
): T {
  return tone;
}

export function workflowTimelineSectionPaddingDisplayValue<
  T extends "md" | "sm",
>(padding: T): T {
  return padding;
}

export function workflowTimelineDefaultSectionPaddingDisplayValue(): "md" {
  return "md";
}

export function workflowTimelineSectionTitleDisplayValue<
  T extends "step_events" | "wait_resume_event",
>(title: T): T {
  return title;
}

export function workflowTimelineEventCardClass(): string {
  return "rounded-xl border border-white/70 bg-white/80 px-3 py-2";
}

export function workflowTimelineEventKindChipClass(): string {
  return "rounded-full bg-violet-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700";
}

export function workflowTimelineEventKindLabel(kind: string): string {
  return workflowTimelineTokenLabel(kind);
}

export function workflowTimelineEventKindDisplayValue(kind: string): string {
  return kind;
}

export function workflowTimelineEventKindInputDisplayValue(kind: string): string {
  return kind;
}

export function workflowTimelineEventTitleClass(): string {
  return "text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700";
}

export function workflowTimelineEventTitleLabel(title: string): string {
  return title;
}

export function workflowTimelineEventTitleDisplayValue(title: string): string {
  return title;
}

export function workflowTimelineEventTitleInputDisplayValue(title: string): string {
  return title;
}

export function workflowTimelineEventSummaryLabel(summary: string): string {
  return summary;
}

export function workflowTimelineEventSummaryDisplayValue(summary: string): string {
  return summary;
}

export function workflowTimelineEventSummaryInputDisplayValue(summary: string): string {
  return summary;
}

export function workflowTimelinePolicySummaryLabel(summary: string): string {
  return summary;
}

export function workflowTimelinePolicySummaryDisplayValue(summary: string): string {
  return summary;
}

export function workflowTimelinePolicySummaryInputDisplayValue(summary: string): string {
  return summary;
}

export function workflowTimelinePayloadChipLabel(chip: string): string {
  return chip;
}

export function workflowTimelinePayloadChipDisplayValue(chip: string): string {
  return chip;
}

export function workflowTimelinePayloadChipInputDisplayValue(chip: string): string {
  return chip;
}

export function workflowTimelinePayloadChipsInputDisplayValue(
  chips: string[] | null,
): string[] | null {
  return chips;
}

export function workflowTimelineOptionalPayloadChipsDisplayValue(
  chips: string[] | null,
): string[] | null {
  return chips;
}

export function workflowTimelinePayloadChipsDisplayValue(chips: string[]): string[] {
  return chips;
}

export function workflowTimelinePayloadChipsValueInputDisplayValue(chips: string[]): string[] {
  return chips;
}

export function workflowTimelinePayloadChipRowClass(): string {
  return "mt-2 flex flex-wrap gap-2";
}

export function workflowTimelinePolicySummaryTextClass(): string {
  return "mt-2 text-xs text-sky-900";
}

export function workflowTimelineNarrativeClass(toneClass: string): string {
  return `mt-3 rounded-2xl border px-3 py-2 text-sm ${toneClass}`;
}

export function workflowTimelineNarrativeToneDisplayClass(toneClass: string): string {
  return toneClass;
}

export function workflowTimelineNarrativeLabel(text: string): string {
  return text;
}

export function workflowTimelineNarrativeDisplayValue(text: string): string {
  return text;
}

export function workflowTimelineNarrativeInputDisplayValue(text: string): string {
  return text;
}

export function workflowTimelineStartedCompletedSummary(
  startedAtLabel: string | null,
  completedAtLabel: string | null,
): string | null {
  if (!startedAtLabel && !completedAtLabel) {
    return null;
  }
  if (startedAtLabel && completedAtLabel) {
    return `started ${startedAtLabel} / completed ${completedAtLabel}`;
  }
  if (startedAtLabel) {
    return `started ${startedAtLabel}`;
  }
  return `completed ${completedAtLabel}`;
}

export function workflowTimelineStartedCompletedLabel(summary: string): string {
  return summary;
}

export function workflowTimelineOptionalStartedCompletedDisplayValue(
  summary: string | null,
): string | null {
  return summary;
}

export function workflowTimelineStartedCompletedInputDisplayValue(
  summary: string | null,
): string | null {
  return summary;
}

export function workflowTimelineStartedCompletedDisplayValue(summary: string): string {
  return summary;
}

export function workflowTimelineStartedCompletedValueInputDisplayValue(
  summary: string,
): string {
  return summary;
}

export function workflowTimelineCountSummary(
  count: number,
  noun: string,
  modifier?: string,
): string {
  const label = `${count} ${modifier ? `${modifier} ` : ""}${noun}`;
  return count === 1 ? label : `${label}s`;
}

export function workflowTimelineRuntimeSummary(
  runtimeKind: string,
  stepDuration: string | null,
): string {
  return stepDuration ? `${runtimeKind} / ${stepDuration}` : runtimeKind;
}

export function workflowTimelineRuntimeHeaderDetailLabel(summary: string): string {
  return summary;
}

export function workflowTimelineRuntimeHeaderDetailDisplayValue(summary: string): string {
  return summary;
}

export function workflowTimelineRuntimeSummaryInputDisplayValue(summary: string): string {
  return summary;
}

export function workflowTimelineReplayMatchPresentation(
  matchedOriginalDeployment: boolean,
): { className: string; label: string } {
  if (matchedOriginalDeployment) {
    return {
      className: "border-emerald-200/70 bg-emerald-50/80 text-emerald-700",
      label: "matched replay",
    };
  }
  return {
    className: "border-amber-200/70 bg-amber-50/80 text-amber-700",
    label: "drifted replay",
  };
}

export function workflowTimelineReplayMatchBadgeClass(
  matchedOriginalDeployment: boolean,
): string {
  return `rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] ${workflowTimelineReplayMatchPresentation(
    matchedOriginalDeployment,
  ).className}`;
}

export function workflowTimelineReplayMatchBadgePresentation(
  matchedOriginalDeployment: boolean,
): { className: string; label: string } {
  const replayMatch = workflowTimelineReplayMatchPresentation(matchedOriginalDeployment);
  return {
    className: workflowTimelineReplayMatchBadgeClass(matchedOriginalDeployment),
    label: replayMatch.label,
  };
}

export function workflowTimelineReplayMatchPresentationClassDisplayValue(
  presentation: { className: string; label: string },
): string {
  return presentation.className;
}

export function workflowTimelineReplayMatchPresentationLabelDisplayValue(
  presentation: { className: string; label: string },
): string {
  return presentation.label;
}

export function workflowTimelineReplayMatchDisplayLabel(label: string): string {
  return label;
}

export function workflowTimelineReplayMatchDisplayClass(className: string): string {
  return className;
}

export function workflowTimelineReplayMatchedOriginalDisplayValue(
  matchedOriginalDeployment: boolean | null | undefined,
): boolean | null | undefined {
  return matchedOriginalDeployment;
}

export function workflowTimelineReplayMatchedOriginalInputDisplayValue(
  matchedOriginalDeployment: boolean | null | undefined,
): boolean | null | undefined {
  return matchedOriginalDeployment;
}

export function workflowTimelineOptionalReplayMatchBadgeDisplayValue(
  presentation: { className: string; label: string } | null,
): { className: string; label: string } | null {
  return presentation;
}

export function workflowTimelineReplayMatchBadgeInputDisplayValue(
  presentation: { className: string; label: string } | null,
): { className: string; label: string } | null {
  return presentation;
}

export function workflowTimelineOptionalReplayMatchBadgePresentation(
  matchedOriginalDeployment: boolean | null | undefined,
): { className: string; label: string } | null {
  if (matchedOriginalDeployment === null || matchedOriginalDeployment === undefined) {
    return null;
  }
  return workflowTimelineReplayMatchBadgePresentation(matchedOriginalDeployment);
}

export function workflowTimelineTokenLabel(value: string | null | undefined): string {
  return (value ?? "").replaceAll("_", " ");
}

export function workflowTimelineDistinctResumeKindLabel(
  traceResumeFamily: string | null | undefined,
  traceResumeKind: string | null | undefined,
): string | null {
  if (!traceResumeKind || traceResumeKind === traceResumeFamily) {
    return null;
  }
  return workflowTimelineTokenLabel(traceResumeKind);
}

export function workflowTimelineOptionalDistinctResumeKindDisplayValue(
  resumeKindLabel: string | null,
): string | null {
  return resumeKindLabel;
}

export function workflowTimelineDistinctResumeKindInputDisplayValue(
  resumeKindLabel: string | null,
): string | null {
  return resumeKindLabel;
}

export function workflowTimelineResumeKindFamilyDisplayValue(
  traceResumeFamily: string | null | undefined,
): string | null | undefined {
  return traceResumeFamily;
}

export function workflowTimelineResumeKindFamilyInputDisplayValue(
  traceResumeFamily: string | null | undefined,
): string | null | undefined {
  return traceResumeFamily;
}

export function workflowTimelineResumeKindValueDisplayValue(
  traceResumeKind: string | null | undefined,
): string | null | undefined {
  return traceResumeKind;
}

export function workflowTimelineResumeKindValueInputDisplayValue(
  traceResumeKind: string | null | undefined,
): string | null | undefined {
  return traceResumeKind;
}

export function workflowTimelineDistinctResumeKindDisplayValue(
  resumeKindLabel: string,
): string {
  return resumeKindLabel;
}

export function workflowTimelineDistinctResumeKindValueInputDisplayValue(
  resumeKindLabel: string,
): string {
  return resumeKindLabel;
}

export function workflowTimelineResumeKindDisplayLabel(resumeKindLabel: string): string {
  return resumeKindLabel;
}

export function workflowTimelineStepNodeLabel(
  stepNodeLabel: string | null | undefined,
  stepNodeId: string,
): string {
  return stepNodeLabel ?? stepNodeId;
}

export function workflowTimelineStepNodeButtonLabel(
  stepNodeLabel: string | null | undefined,
  stepNodeId: string,
): string {
  return `node ${workflowTimelineStepNodeLabel(stepNodeLabel, stepNodeId)}`;
}

export function workflowTimelineStepNodeDisplayValue(
  stepNodeLabel: string | null | undefined,
): string | null | undefined {
  return stepNodeLabel;
}

export function workflowTimelineStepNodeLabelInputDisplayValue(
  stepNodeLabel: string | null | undefined,
): string | null | undefined {
  return stepNodeLabel;
}

export function workflowTimelineOptionalStepNodeIdDisplayValue(
  stepNodeId: string | null,
): string | null {
  return stepNodeId;
}

export function workflowTimelineStepNodeIdInputDisplayValue(
  stepNodeId: string | null,
): string | null {
  return stepNodeId;
}

export function workflowTimelineStepNodeIdDisplayValue(stepNodeId: string): string {
  return stepNodeId;
}

export function workflowTimelineStepNodeIdValueInputDisplayValue(
  stepNodeId: string,
): string {
  return stepNodeId;
}

export function workflowTimelinePolicySourceLabel(
  stepPolicyFieldSource: string | null | undefined,
): string {
  return stepPolicyFieldSource ?? "policy update";
}

export function workflowTimelinePolicySourceDisplayValue(
  stepPolicyFieldSource: string | null | undefined,
): string | null | undefined {
  return stepPolicyFieldSource;
}

export function workflowTimelinePolicySourceInputDisplayValue(
  stepPolicyFieldSource: string | null | undefined,
): string | null | undefined {
  return stepPolicyFieldSource;
}

export function workflowTimelineOptionalDeploymentSelectorIdDisplayValue(
  deploymentId: string | null,
): string | null {
  return deploymentId;
}

export function workflowTimelineDeploymentSelectorIdInputDisplayValue(
  deploymentId: string | null,
): string | null {
  return deploymentId;
}

export function workflowTimelineSectionTitle(
  section: "step_events" | "wait_resume_event",
): string {
  return section === "step_events" ? "Step events" : "Wait / resume event";
}

export function workflowTimelineReviewSnapshotLabel(): string {
  return "review snapshot";
}

export function workflowTimelineOptionalPolicyFieldChangesDisplayValue(
  stepPolicyFieldChanges: Array<unknown>,
): Array<unknown> | null {
  return stepPolicyFieldChanges.length > 0 ? stepPolicyFieldChanges : null;
}

export function workflowTimelinePolicyFieldChangesInputDisplayValue(
  stepPolicyFieldChanges: Array<unknown>,
): Array<unknown> {
  return stepPolicyFieldChanges;
}

export function workflowTimelineDecisionPointLabel(decisionPointId: string): string {
  return `decision ${decisionPointId}`;
}

export function workflowTimelineOptionalDecisionPointDisplayValue(
  decisionPointId: string | null,
): string | null {
  return decisionPointId;
}

export function workflowTimelineDecisionPointInputDisplayValue(
  decisionPointId: string | null,
): string | null {
  return decisionPointId;
}

export function workflowTimelineDecisionPointDisplayValue(decisionPointId: string): string {
  return decisionPointId;
}

export function workflowTimelineDecisionPointValueInputDisplayValue(
  decisionPointId: string,
): string {
  return decisionPointId;
}

export function workflowTimelineTargetNodeLabel(selectedNodeId: string): string {
  return `target ${selectedNodeId}`;
}

export function workflowTimelineOptionalTargetNodeDisplayValue(
  selectedNodeId: string | null,
): string | null {
  return selectedNodeId;
}

export function workflowTimelineTargetNodeInputDisplayValue(
  selectedNodeId: string | null,
): string | null {
  return selectedNodeId;
}

export function workflowTimelineTargetNodeDisplayValue(selectedNodeId: string): string {
  return selectedNodeId;
}

export function workflowTimelineTargetNodeValueInputDisplayValue(
  selectedNodeId: string,
): string {
  return selectedNodeId;
}

export function workflowTimelineRouteLabel(selectedConditionLabel: string): string {
  return `route ${selectedConditionLabel}`;
}

export function workflowTimelineOptionalRouteDisplayValue(
  selectedConditionLabel: string | null,
): string | null {
  return selectedConditionLabel;
}

export function workflowTimelineRouteInputDisplayValue(
  selectedConditionLabel: string | null,
): string | null {
  return selectedConditionLabel;
}

export function workflowTimelineRouteDisplayValue(selectedConditionLabel: string): string {
  return selectedConditionLabel;
}

export function workflowTimelineRouteValueInputDisplayValue(
  selectedConditionLabel: string,
): string {
  return selectedConditionLabel;
}

export function workflowTimelineSelectedLabelsLabel(selectedOutgoingLabels: string[]): string {
  return `labels ${workflowTimelineListLabel(selectedOutgoingLabels)}`;
}

export function workflowTimelineOptionalSelectedLabelsDisplayValue(
  selectedOutgoingLabels: string[],
): string[] | null {
  return selectedOutgoingLabels.length > 0 ? selectedOutgoingLabels : null;
}

export function workflowTimelineSelectedLabelsInputDisplayValue(
  selectedOutgoingLabels: string[],
): string[] {
  return selectedOutgoingLabels;
}

export function workflowTimelineSelectedLabelsDisplayValue(
  selectedOutgoingLabels: string[],
): string[] {
  return selectedOutgoingLabels;
}

export function workflowTimelineSelectedLabelsValueInputDisplayValue(
  selectedOutgoingLabels: string[],
): string[] {
  return selectedOutgoingLabels;
}

export function workflowTimelineTraceSourceLabel(traceSource: string): string {
  return `source ${workflowTimelineTokenLabel(traceSource)}`;
}

export function workflowTimelineOptionalTraceSourceDisplayValue(
  traceSource: string | null,
): string | null {
  return traceSource;
}

export function workflowTimelineTraceSourceInputDisplayValue(
  traceSource: string | null,
): string | null {
  return traceSource;
}

export function workflowTimelineTraceSourceDisplayValue(traceSource: string): string {
  return traceSource;
}

export function workflowTimelineTraceSourceValueInputDisplayValue(traceSource: string): string {
  return traceSource;
}

export function workflowTimelineTraceDetailLabel(traceDetailMode: string): string {
  return `detail ${workflowTimelineTokenLabel(traceDetailMode)}`;
}

export function workflowTimelineOptionalTraceDetailDisplayValue(
  traceDetailMode: string | null,
): string | null {
  return traceDetailMode;
}

export function workflowTimelineTraceDetailInputDisplayValue(
  traceDetailMode: string | null,
): string | null {
  return traceDetailMode;
}

export function workflowTimelineTraceDetailDisplayValue(traceDetailMode: string): string {
  return traceDetailMode;
}

export function workflowTimelineTraceDetailValueInputDisplayValue(
  traceDetailMode: string,
): string {
  return traceDetailMode;
}

export function workflowTimelineTraceSideEffectsLabel(traceSideEffects: string): string {
  return `effects ${workflowTimelineTokenLabel(traceSideEffects)}`;
}

export function workflowTimelineOptionalTraceSideEffectsDisplayValue(
  traceSideEffects: string | null,
): string | null {
  return traceSideEffects;
}

export function workflowTimelineTraceSideEffectsInputDisplayValue(
  traceSideEffects: string | null,
): string | null {
  return traceSideEffects;
}

export function workflowTimelineTraceSideEffectsDisplayValue(
  traceSideEffects: string,
): string {
  return traceSideEffects;
}

export function workflowTimelineTraceSideEffectsValueInputDisplayValue(
  traceSideEffects: string,
): string {
  return traceSideEffects;
}

export function workflowTimelineTraceExecutionLabel(traceExecutionMode: string): string {
  return `execution ${workflowTimelineTokenLabel(traceExecutionMode)}`;
}

export function workflowTimelineOptionalTraceExecutionDisplayValue(
  traceExecutionMode: string | null,
): string | null {
  return traceExecutionMode;
}

export function workflowTimelineTraceExecutionInputDisplayValue(
  traceExecutionMode: string | null,
): string | null {
  return traceExecutionMode;
}

export function workflowTimelineTraceExecutionDisplayValue(
  traceExecutionMode: string,
): string {
  return traceExecutionMode;
}

export function workflowTimelineTraceExecutionValueInputDisplayValue(
  traceExecutionMode: string,
): string {
  return traceExecutionMode;
}

export function workflowTimelineTracePhaseLabel(tracePhase: string): string {
  return `phase ${workflowTimelineTokenLabel(tracePhase)}`;
}

export function workflowTimelineOptionalTracePhaseDisplayValue(
  tracePhase: string | null,
): string | null {
  return tracePhase;
}

export function workflowTimelineTracePhaseInputDisplayValue(
  tracePhase: string | null,
): string | null {
  return tracePhase;
}

export function workflowTimelineTracePhaseDisplayValue(tracePhase: string): string {
  return tracePhase;
}

export function workflowTimelineTracePhaseValueInputDisplayValue(
  tracePhase: string,
): string {
  return tracePhase;
}

export function workflowTimelineActionCategoryLabel(actionCategory: string): string {
  return workflowTimelineTokenLabel(actionCategory);
}

export function workflowTimelineOptionalActionCategoryDisplayValue(
  actionCategory: string | null,
): string | null {
  return actionCategory;
}

export function workflowTimelineActionCategoryInputDisplayValue(
  actionCategory: string | null,
): string | null {
  return actionCategory;
}

export function workflowTimelineActionCategoryDisplayValue(
  actionCategory: string,
): string {
  return actionCategory;
}

export function workflowTimelineActionCategoryValueInputDisplayValue(
  actionCategory: string,
): string {
  return actionCategory;
}

export function workflowTimelineIntegrationFamilyLabel(integrationFamily: string): string {
  return workflowTimelineTokenLabel(integrationFamily);
}

export function workflowTimelineOptionalIntegrationFamilyDisplayValue(
  integrationFamily: string | null,
): string | null {
  return integrationFamily;
}

export function workflowTimelineIntegrationFamilyInputDisplayValue(
  integrationFamily: string | null,
): string | null {
  return integrationFamily;
}

export function workflowTimelineIntegrationFamilyDisplayValue(
  integrationFamily: string,
): string {
  return integrationFamily;
}

export function workflowTimelineIntegrationFamilyValueInputDisplayValue(
  integrationFamily: string,
): string {
  return integrationFamily;
}

export function workflowTimelineTraceKindLabel(traceKind: string): string {
  return workflowTimelineTokenLabel(traceKind);
}

export function workflowTimelineOptionalTraceKindDisplayValue(
  traceKind: string | null,
): string | null {
  return traceKind;
}

export function workflowTimelineTraceKindInputDisplayValue(
  traceKind: string | null,
): string | null {
  return traceKind;
}

export function workflowTimelineTraceKindDisplayValue(traceKind: string): string {
  return traceKind;
}

export function workflowTimelineTraceKindValueInputDisplayValue(
  traceKind: string,
): string {
  return traceKind;
}

export function workflowTimelineRoutingModeLabel(routingMode: string): string {
  return workflowTimelineTokenLabel(routingMode);
}

export function workflowTimelineOptionalRoutingModeDisplayValue(
  routingMode: string | null,
): string | null {
  return routingMode;
}

export function workflowTimelineRoutingModeInputDisplayValue(
  routingMode: string | null,
): string | null {
  return routingMode;
}

export function workflowTimelineRoutingModeDisplayValue(routingMode: string): string {
  return routingMode;
}

export function workflowTimelineRoutingModeValueInputDisplayValue(
  routingMode: string,
): string {
  return routingMode;
}

export function workflowTimelineResumeFamilyLabel(traceResumeFamily: string): string {
  return workflowTimelineTokenLabel(traceResumeFamily);
}

export function workflowTimelineOptionalResumeFamilyDisplayValue(
  traceResumeFamily: string | null,
): string | null {
  return traceResumeFamily;
}

export function workflowTimelineResumeFamilyInputDisplayValue(
  traceResumeFamily: string | null,
): string | null {
  return traceResumeFamily;
}

export function workflowTimelineResumeFamilyDisplayValue(
  traceResumeFamily: string,
): string {
  return traceResumeFamily;
}

export function workflowTimelineResumeFamilyValueInputDisplayValue(
  traceResumeFamily: string,
): string {
  return traceResumeFamily;
}

export function workflowTimelineWaitResumeIdLabel(traceWaitResumeId: string): string {
  return traceWaitResumeId;
}

export function workflowTimelineOptionalWaitResumeIdDisplayValue(
  traceWaitResumeId: string | null,
): string | null {
  return traceWaitResumeId;
}

export function workflowTimelineWaitResumeIdInputDisplayValue(
  traceWaitResumeId: string | null,
): string | null {
  return traceWaitResumeId;
}

export function workflowTimelineWaitResumeIdDisplayValue(
  traceWaitResumeId: string,
): string {
  return traceWaitResumeId;
}

export function workflowTimelineWaitResumeIdValueInputDisplayValue(
  traceWaitResumeId: string,
): string {
  return traceWaitResumeId;
}

export function workflowTimelineCheckpointLabel(outcomeCheckpoint: string): string {
  return `checkpoint ${workflowTimelineTokenLabel(outcomeCheckpoint)}`;
}

export function workflowTimelineOptionalCheckpointDisplayValue(
  outcomeCheckpoint: string | null,
): string | null {
  return outcomeCheckpoint;
}

export function workflowTimelineCheckpointInputDisplayValue(
  outcomeCheckpoint: string | null,
): string | null {
  return outcomeCheckpoint;
}

export function workflowTimelineCheckpointDisplayValue(
  outcomeCheckpoint: string,
): string {
  return outcomeCheckpoint;
}

export function workflowTimelineCheckpointValueInputDisplayValue(
  outcomeCheckpoint: string,
): string {
  return outcomeCheckpoint;
}

export function workflowTimelineOutcomeLabel(actionOutcome: string): string {
  return `outcome ${actionOutcome}`;
}

export function workflowTimelineOptionalOutcomeDisplayValue(
  actionOutcome: string | null,
): string | null {
  return actionOutcome;
}

export function workflowTimelineOutcomeInputDisplayValue(
  actionOutcome: string | null,
): string | null {
  return actionOutcome;
}

export function workflowTimelineOutcomeDisplayValue(actionOutcome: string): string {
  return actionOutcome;
}

export function workflowTimelineOutcomeValueInputDisplayValue(actionOutcome: string): string {
  return actionOutcome;
}

export function workflowTimelineConnectorStatusLabel(actionConnectorStatus: string): string {
  return `status ${workflowTimelineTokenLabel(actionConnectorStatus)}`;
}

export function workflowTimelineOptionalConnectorStatusDisplayValue(
  actionConnectorStatus: string | null,
): string | null {
  return actionConnectorStatus;
}

export function workflowTimelineConnectorStatusInputDisplayValue(
  actionConnectorStatus: string | null,
): string | null {
  return actionConnectorStatus;
}

export function workflowTimelineConnectorStatusDisplayValue(
  actionConnectorStatus: string,
): string {
  return actionConnectorStatus;
}

export function workflowTimelineConnectorStatusValueInputDisplayValue(
  actionConnectorStatus: string,
): string {
  return actionConnectorStatus;
}

export function workflowTimelineAuthModeLabel(actionAuthMode: string): string {
  return `auth ${workflowTimelineTokenLabel(actionAuthMode)}`;
}

export function workflowTimelineOptionalAuthModeDisplayValue(
  actionAuthMode: string | null,
): string | null {
  return actionAuthMode;
}

export function workflowTimelineAuthModeInputDisplayValue(
  actionAuthMode: string | null,
): string | null {
  return actionAuthMode;
}

export function workflowTimelineAuthModeDisplayValue(actionAuthMode: string): string {
  return actionAuthMode;
}

export function workflowTimelineAuthModeValueInputDisplayValue(
  actionAuthMode: string,
): string {
  return actionAuthMode;
}

export function workflowTimelineServiceLabel(actionService: string): string {
  return `service ${actionService}`;
}

export function workflowTimelineOptionalServiceDisplayValue(
  actionService: string | null,
): string | null {
  return actionService;
}

export function workflowTimelineServiceInputDisplayValue(
  actionService: string | null,
): string | null {
  return actionService;
}

export function workflowTimelineServiceDisplayValue(actionService: string): string {
  return actionService;
}

export function workflowTimelineServiceValueInputDisplayValue(
  actionService: string,
): string {
  return actionService;
}

export function workflowTimelineProviderLabel(actionProvider: string): string {
  return `provider ${actionProvider}`;
}

export function workflowTimelineOptionalProviderDisplayValue(
  actionProvider: string | null,
): string | null {
  return actionProvider;
}

export function workflowTimelineProviderInputDisplayValue(
  actionProvider: string | null,
): string | null {
  return actionProvider;
}

export function workflowTimelineProviderDisplayValue(actionProvider: string): string {
  return actionProvider;
}

export function workflowTimelineProviderValueInputDisplayValue(
  actionProvider: string,
): string {
  return actionProvider;
}

export function workflowTimelineProviderRequestLabel(actionProviderRequestId: string): string {
  return `request ${actionProviderRequestId}`;
}

export function workflowTimelineOptionalProviderRequestDisplayValue(
  actionProviderRequestId: string | null,
): string | null {
  return actionProviderRequestId;
}

export function workflowTimelineProviderRequestInputDisplayValue(
  actionProviderRequestId: string | null,
): string | null {
  return actionProviderRequestId;
}

export function workflowTimelineProviderRequestDisplayValue(
  actionProviderRequestId: string,
): string {
  return actionProviderRequestId;
}

export function workflowTimelineProviderRequestValueInputDisplayValue(
  actionProviderRequestId: string,
): string {
  return actionProviderRequestId;
}

export function workflowTimelineProviderStatusLabel(actionProviderStatusText: string): string {
  return `provider ${actionProviderStatusText}`;
}

export function workflowTimelineOptionalProviderStatusDisplayValue(
  actionProviderStatusText: string | null,
): string | null {
  return actionProviderStatusText;
}

export function workflowTimelineProviderStatusInputDisplayValue(
  actionProviderStatusText: string | null,
): string | null {
  return actionProviderStatusText;
}

export function workflowTimelineProviderStatusDisplayValue(
  actionProviderStatusText: string,
): string {
  return actionProviderStatusText;
}

export function workflowTimelineProviderStatusValueInputDisplayValue(
  actionProviderStatusText: string,
): string {
  return actionProviderStatusText;
}

export function workflowTimelineDeliveryTierLabel(actionDeliveryTier: string): string {
  return `tier ${actionDeliveryTier}`;
}

export function workflowTimelineOptionalDeliveryTierDisplayValue(
  actionDeliveryTier: string | null,
): string | null {
  return actionDeliveryTier;
}

export function workflowTimelineDeliveryTierInputDisplayValue(
  actionDeliveryTier: string | null,
): string | null {
  return actionDeliveryTier;
}

export function workflowTimelineDeliveryTierDisplayValue(
  actionDeliveryTier: string,
): string {
  return actionDeliveryTier;
}

export function workflowTimelineDeliveryTierValueInputDisplayValue(
  actionDeliveryTier: string,
): string {
  return actionDeliveryTier;
}

export function workflowTimelineActionOperationLabel(actionOperation: string): string {
  return `action ${actionOperation}`;
}

export function workflowTimelineOptionalActionOperationDisplayValue(
  actionOperation: string | null,
): string | null {
  return actionOperation;
}

export function workflowTimelineActionOperationInputDisplayValue(
  actionOperation: string | null,
): string | null {
  return actionOperation;
}

export function workflowTimelineActionOperationDisplayValue(
  actionOperation: string,
): string {
  return actionOperation;
}

export function workflowTimelineActionOperationValueInputDisplayValue(
  actionOperation: string,
): string {
  return actionOperation;
}

export function workflowTimelineDeploymentEnvironmentLabel(
  actionDeploymentEnvironment: string,
): string {
  return `env ${actionDeploymentEnvironment}`;
}

export function workflowTimelineOptionalDeploymentEnvironmentDisplayValue(
  actionDeploymentEnvironment: string | null,
): string | null {
  return actionDeploymentEnvironment;
}

export function workflowTimelineDeploymentEnvironmentInputDisplayValue(
  actionDeploymentEnvironment: string | null,
): string | null {
  return actionDeploymentEnvironment;
}

export function workflowTimelineDeploymentEnvironmentDisplayValue(
  actionDeploymentEnvironment: string,
): string {
  return actionDeploymentEnvironment;
}

export function workflowTimelineDeploymentEnvironmentValueInputDisplayValue(
  actionDeploymentEnvironment: string,
): string {
  return actionDeploymentEnvironment;
}

export function workflowTimelineReplayRunLabel(actionReplayOfRunId: string): string {
  return `replay ${actionReplayOfRunId}`;
}

export function workflowTimelineOptionalReplayRunDisplayValue(
  actionReplayOfRunId: string | null,
): string | null {
  return actionReplayOfRunId;
}

export function workflowTimelineReplayRunInputDisplayValue(
  actionReplayOfRunId: string | null,
): string | null {
  return actionReplayOfRunId;
}

export function workflowTimelineReplayRunDisplayValue(
  actionReplayOfRunId: string,
): string {
  return actionReplayOfRunId;
}

export function workflowTimelineReplayRunValueInputDisplayValue(
  actionReplayOfRunId: string,
): string {
  return actionReplayOfRunId;
}

export function workflowTimelineProviderRouteLabel(actionProviderRoute: string): string {
  return `route ${actionProviderRoute}`;
}

export function workflowTimelineOptionalProviderRouteDisplayValue(
  actionProviderRoute: string | null,
): string | null {
  return actionProviderRoute;
}

export function workflowTimelineProviderRouteInputDisplayValue(
  actionProviderRoute: string | null,
): string | null {
  return actionProviderRoute;
}

export function workflowTimelineProviderRouteDisplayValue(
  actionProviderRoute: string,
): string {
  return actionProviderRoute;
}

export function workflowTimelineProviderRouteValueInputDisplayValue(
  actionProviderRoute: string,
): string {
  return actionProviderRoute;
}

export function workflowTimelineCapabilityLabel(actionCapabilityId: string): string {
  return `capability ${actionCapabilityId}`;
}

export function workflowTimelineOptionalCapabilityDisplayValue(
  actionCapabilityId: string | null,
): string | null {
  return actionCapabilityId;
}

export function workflowTimelineCapabilityInputDisplayValue(
  actionCapabilityId: string | null,
): string | null {
  return actionCapabilityId;
}

export function workflowTimelineCapabilityDisplayValue(
  actionCapabilityId: string,
): string {
  return actionCapabilityId;
}

export function workflowTimelineCapabilityValueInputDisplayValue(
  actionCapabilityId: string,
): string {
  return actionCapabilityId;
}

export function workflowTimelineOnTimeoutLabel(actionOnTimeout: string): string {
  return `on timeout ${actionOnTimeout}`;
}

export function workflowTimelineOptionalOnTimeoutDisplayValue(
  actionOnTimeout: string | null,
): string | null {
  return actionOnTimeout;
}

export function workflowTimelineOnTimeoutInputDisplayValue(
  actionOnTimeout: string | null,
): string | null {
  return actionOnTimeout;
}

export function workflowTimelineOnTimeoutDisplayValue(
  actionOnTimeout: string,
): string {
  return actionOnTimeout;
}

export function workflowTimelineOnTimeoutValueInputDisplayValue(
  actionOnTimeout: string,
): string {
  return actionOnTimeout;
}

export function workflowTimelineAllowedToolsLabel(actionAllowedTools: string[]): string {
  return `tools ${workflowTimelineListLabel(actionAllowedTools)}`;
}

export function workflowTimelineOptionalAllowedToolsDisplayValue(
  actionAllowedTools: string[],
): string[] | null {
  return actionAllowedTools.length > 0 ? actionAllowedTools : null;
}

export function workflowTimelineAllowedToolsInputDisplayValue(
  actionAllowedTools: string[],
): string[] {
  return actionAllowedTools;
}

export function workflowTimelineAllowedToolsDisplayValue(
  actionAllowedTools: string[],
): string[] {
  return actionAllowedTools;
}

export function workflowTimelineAllowedToolsValueInputDisplayValue(
  actionAllowedTools: string[],
): string[] {
  return actionAllowedTools;
}

export function workflowTimelineAllowedCapabilitiesLabel(
  actionAllowedCapabilities: string[],
): string {
  return `allowed caps ${workflowTimelineListLabel(actionAllowedCapabilities)}`;
}

export function workflowTimelineOptionalAllowedCapabilitiesDisplayValue(
  actionAllowedCapabilities: string[],
): string[] | null {
  return actionAllowedCapabilities.length > 0 ? actionAllowedCapabilities : null;
}

export function workflowTimelineAllowedCapabilitiesInputDisplayValue(
  actionAllowedCapabilities: string[],
): string[] {
  return actionAllowedCapabilities;
}

export function workflowTimelineAllowedCapabilitiesDisplayValue(
  actionAllowedCapabilities: string[],
): string[] {
  return actionAllowedCapabilities;
}

export function workflowTimelineAllowedCapabilitiesValueInputDisplayValue(
  actionAllowedCapabilities: string[],
): string[] {
  return actionAllowedCapabilities;
}

export function workflowTimelineOutboundAllowlistLabel(
  actionOutboundAllowlist: string[],
): string {
  return `outbound ${workflowTimelineListLabel(actionOutboundAllowlist)}`;
}

export function workflowTimelineOptionalOutboundAllowlistDisplayValue(
  actionOutboundAllowlist: string[],
): string[] | null {
  return actionOutboundAllowlist.length > 0 ? actionOutboundAllowlist : null;
}

export function workflowTimelineOutboundAllowlistInputDisplayValue(
  actionOutboundAllowlist: string[],
): string[] {
  return actionOutboundAllowlist;
}

export function workflowTimelineOutboundAllowlistDisplayValue(
  actionOutboundAllowlist: string[],
): string[] {
  return actionOutboundAllowlist;
}

export function workflowTimelineOutboundAllowlistValueInputDisplayValue(
  actionOutboundAllowlist: string[],
): string[] {
  return actionOutboundAllowlist;
}

export function workflowTimelineStatusCodeLabel(actionStatusCode: string | number): string {
  return workflowTimelineLabeledValue("code", actionStatusCode);
}

export function workflowTimelineOptionalStatusCodeDisplayValue(
  actionStatusCode: number | null,
): number | null {
  return actionStatusCode;
}

export function workflowTimelineStatusCodeInputDisplayValue(
  actionStatusCode: number | null,
): number | null {
  return actionStatusCode;
}

export function workflowTimelineStatusCodeValueDisplayValue(
  actionStatusCode: number | null,
): string | number {
  return actionStatusCode ?? "";
}

export function workflowTimelineStatusCodeValueInputDisplayValue(
  actionStatusCode: number,
): number {
  return actionStatusCode;
}

export function workflowTimelineStatusCodeDisplayValue(
  actionStatusCode: string | number,
): string | number {
  return actionStatusCode;
}

export function workflowTimelineLatencyLabel(
  actionProviderLatencyMs: string | number,
): string {
  return workflowTimelineLabeledValue("latency", actionProviderLatencyMs, "ms");
}

export function workflowTimelineOptionalLatencyDisplayValue(
  actionProviderLatencyMs: number | null,
): number | null {
  return actionProviderLatencyMs;
}

export function workflowTimelineLatencyInputDisplayValue(
  actionProviderLatencyMs: number | null,
): number | null {
  return actionProviderLatencyMs;
}

export function workflowTimelineLatencyValueDisplayValue(
  actionProviderLatencyMs: number | null,
): string | number {
  return actionProviderLatencyMs ?? "";
}

export function workflowTimelineLatencyValueInputDisplayValue(
  actionProviderLatencyMs: number,
): number {
  return actionProviderLatencyMs;
}

export function workflowTimelineLatencyDisplayValue(
  actionProviderLatencyMs: string | number,
): string | number {
  return actionProviderLatencyMs;
}

export function workflowTimelineReplayDeltaLabel(
  actionReplayChangedNodeCount: string | number,
): string {
  return workflowTimelineLabeledValue("replay delta", actionReplayChangedNodeCount);
}

export function workflowTimelineOptionalReplayDeltaDisplayValue(
  actionReplayChangedNodeCount: number | null,
): number | null {
  return actionReplayChangedNodeCount;
}

export function workflowTimelineReplayDeltaInputDisplayValue(
  actionReplayChangedNodeCount: number | null,
): number | null {
  return actionReplayChangedNodeCount;
}

export function workflowTimelineReplayDeltaValueDisplayValue(
  actionReplayChangedNodeCount: number | null,
): string | number {
  return actionReplayChangedNodeCount ?? "";
}

export function workflowTimelineReplayDeltaValueInputDisplayValue(
  actionReplayChangedNodeCount: number,
): number {
  return actionReplayChangedNodeCount;
}

export function workflowTimelineReplayDeltaDisplayValue(
  actionReplayChangedNodeCount: string | number,
): string | number {
  return actionReplayChangedNodeCount;
}

export function workflowTimelineTimeoutLabel(
  actionTimeoutSeconds: string | number,
): string {
  return workflowTimelineLabeledValue("timeout", actionTimeoutSeconds, "s");
}

export function workflowTimelineOptionalTimeoutDisplayValue(
  actionTimeoutSeconds: number | null,
): number | null {
  return actionTimeoutSeconds;
}

export function workflowTimelineTimeoutInputDisplayValue(
  actionTimeoutSeconds: number | null,
): number | null {
  return actionTimeoutSeconds;
}

export function workflowTimelineTimeoutValueDisplayValue(
  actionTimeoutSeconds: number | null,
): string | number {
  return actionTimeoutSeconds ?? "";
}

export function workflowTimelineTimeoutValueInputDisplayValue(
  actionTimeoutSeconds: number,
): number {
  return actionTimeoutSeconds;
}

export function workflowTimelineTimeoutDisplayValue(
  actionTimeoutSeconds: string | number,
): string | number {
  return actionTimeoutSeconds;
}

export function workflowTimelineAttemptsLabel(
  actionMaxAttempts: string | number,
): string {
  return workflowTimelineLabeledValue("attempts", actionMaxAttempts);
}

export function workflowTimelineOptionalAttemptsDisplayValue(
  actionMaxAttempts: number | null,
): number | null {
  return actionMaxAttempts;
}

export function workflowTimelineAttemptsInputDisplayValue(
  actionMaxAttempts: number | null,
): number | null {
  return actionMaxAttempts;
}

export function workflowTimelineAttemptsValueDisplayValue(
  actionMaxAttempts: number | null,
): string | number {
  return actionMaxAttempts ?? "";
}

export function workflowTimelineAttemptsValueInputDisplayValue(
  actionMaxAttempts: number,
): number {
  return actionMaxAttempts;
}

export function workflowTimelineAttemptsDisplayValue(
  actionMaxAttempts: string | number,
): string | number {
  return actionMaxAttempts;
}

export function workflowTimelineRetriesLabel(
  actionRetryCount: string | number,
): string {
  return workflowTimelineLabeledValue("retries", actionRetryCount);
}

export function workflowTimelineOptionalRetriesDisplayValue(
  actionRetryCount: number | null,
): number | null {
  return actionRetryCount;
}

export function workflowTimelineRetriesInputDisplayValue(
  actionRetryCount: number | null,
): number | null {
  return actionRetryCount;
}

export function workflowTimelineRetriesValueDisplayValue(
  actionRetryCount: number | null,
): string | number {
  return actionRetryCount ?? "";
}

export function workflowTimelineRetriesValueInputDisplayValue(
  actionRetryCount: number,
): number {
  return actionRetryCount;
}

export function workflowTimelineRetriesDisplayValue(
  actionRetryCount: string | number,
): string | number {
  return actionRetryCount;
}

export function workflowTimelineSelectedEdgeCountLabel(
  selectedOutgoingEdgeCount: number,
): string {
  return workflowTimelineCountSummary(selectedOutgoingEdgeCount, "edge", "selected");
}

export function workflowTimelineOptionalSelectedEdgeCountDisplayValue(
  selectedOutgoingEdgeCount: number,
): number | null {
  return selectedOutgoingEdgeCount > 0 ? selectedOutgoingEdgeCount : null;
}

export function workflowTimelineSelectedEdgeCountInputDisplayValue(
  selectedOutgoingEdgeCount: number,
): number {
  return selectedOutgoingEdgeCount;
}

export function workflowTimelineSelectedEdgeCountDisplayValue(
  selectedOutgoingEdgeCount: number,
): number {
  return selectedOutgoingEdgeCount;
}

export function workflowTimelineSelectedEdgeCountValueInputDisplayValue(
  selectedOutgoingEdgeCount: number,
): number {
  return selectedOutgoingEdgeCount;
}

export function workflowTimelineSkippedEdgeCountLabel(
  skippedOutgoingEdgeCount: number,
): string {
  return workflowTimelineCountSummary(skippedOutgoingEdgeCount, "edge", "skipped");
}

export function workflowTimelineOptionalSkippedEdgeCountDisplayValue(
  skippedOutgoingEdgeCount: number,
): number | null {
  return skippedOutgoingEdgeCount > 0 ? skippedOutgoingEdgeCount : null;
}

export function workflowTimelineSkippedEdgeCountInputDisplayValue(
  skippedOutgoingEdgeCount: number,
): number {
  return skippedOutgoingEdgeCount;
}

export function workflowTimelineSkippedEdgeCountDisplayValue(
  skippedOutgoingEdgeCount: number,
): number {
  return skippedOutgoingEdgeCount;
}

export function workflowTimelineSkippedEdgeCountValueInputDisplayValue(
  skippedOutgoingEdgeCount: number,
): number {
  return skippedOutgoingEdgeCount;
}

export function workflowTimelineOptionCountLabel(optionCount: number): string {
  return workflowTimelineCountSummary(optionCount, "option");
}

export function workflowTimelineOptionalOptionCountDisplayValue(
  optionCount: number | null,
): number | null {
  return optionCount;
}

export function workflowTimelineOptionCountInputDisplayValue(
  optionCount: number | null,
): number | null {
  return optionCount;
}

export function workflowTimelineOptionCountValueDisplayValue(
  optionCount: number | null,
): number {
  return optionCount ?? 0;
}

export function workflowTimelineOptionCountDisplayValue(optionCount: number): number {
  return optionCount;
}

export function workflowTimelineOptionCountValueInputDisplayValue(
  optionCount: number,
): number {
  return optionCount;
}

export function workflowTimelineDeploymentButtonKindDisplayValue<
  T extends "deployment" | "original_deploy" | "replay_deploy" | "compared",
>(kind: T): T {
  return kind;
}

export function workflowTimelineDeploymentButtonToneDisplayValue<
  T extends "sky" | "indigo",
>(tone: T): T {
  return tone;
}

export function workflowTimelineDeploymentButtonSelectedDisplayValue(
  selected: boolean,
): boolean {
  return selected;
}

export function workflowTimelineDeploymentButtonSelectionStateDisplayValue(
  selectedDeploymentRecordId: string | null,
  deploymentId: string,
): boolean {
  return selectedDeploymentRecordId === deploymentId;
}

export function workflowTimelineSelectedDeploymentRecordIdInputDisplayValue(
  selectedDeploymentRecordId: string | null,
): string | null {
  return selectedDeploymentRecordId;
}

export function workflowTimelineDeploymentSelectionTargetInputDisplayValue(
  deploymentId: string,
): string {
  return deploymentId;
}

export function workflowTimelineDeploymentFocusTargetInputDisplayValue(
  deploymentId: string,
): string {
  return deploymentId;
}

export function workflowTimelineSelectedNodeTargetInputDisplayValue(nodeId: string): string {
  return nodeId;
}

export function workflowTimelineDeploymentButtonDeploymentIdDisplayValue(
  deploymentId: string,
): string {
  return deploymentId;
}

export function workflowTimelineDeploymentButtonDeploymentIdValueInputDisplayValue(
  deploymentId: string,
): string {
  return deploymentId;
}

export function workflowTimelineOptionalDeploymentIdDisplayValue(
  deploymentId: string | null,
): string | null {
  return deploymentId;
}

export function workflowTimelineDeploymentIdInputDisplayValue(
  deploymentId: string | null,
): string | null {
  return deploymentId;
}

export function workflowTimelineDeploymentButtonLabel(
  kind: "deployment" | "original_deploy" | "replay_deploy" | "compared",
  deploymentId: string,
): string {
  switch (kind) {
    case "deployment":
      return `deployment ${deploymentId}`;
    case "original_deploy":
      return `original deploy ${deploymentId}`;
    case "replay_deploy":
      return `replay deploy ${deploymentId}`;
    case "compared":
      return `compared ${deploymentId}`;
  }
}

export function workflowTimelineListLabel(values: string[]): string {
  return values.join(", ");
}

export function workflowTimelineLabeledValue(
  label: string,
  value: string | number,
  suffix: string = "",
): string {
  return `${label} ${value}${suffix}`;
}

export function workflowTimelineApprovalModeLabel(
  approvalMode: string | null | undefined,
): string {
  return approvalModeLabel(approvalMode ?? undefined);
}

export function workflowTimelineApprovalChipLabel(
  approvalMode: string | null | undefined,
): string {
  return `approval ${workflowTimelineApprovalModeLabel(approvalMode)}`;
}

export function workflowTimelineOptionalApprovalChipDisplayValue(
  approvalMode: string | null,
): string | null {
  return approvalMode;
}

export function workflowTimelineApprovalChipInputDisplayValue(
  approvalMode: string | null,
): string | null {
  return approvalMode;
}

export function workflowTimelineApprovalChipDisplayValue(
  approvalMode: string | null | undefined,
): string | null | undefined {
  return approvalMode;
}

export function workflowTimelineApprovalChipValueInputDisplayValue(
  approvalMode: string,
): string {
  return approvalMode;
}

export function workflowTimelineDeploymentButtonClass(
  selected: boolean,
  tone: "sky" | "indigo" = "sky",
): string {
  if (tone === "sky") {
    return selected
      ? "border-sky-300/80 bg-sky-100 text-sky-800"
      : "border-slate-200/70 bg-slate-50/90 text-slate-700 hover:bg-slate-100";
  }
  return selected
    ? "border-indigo-300/80 bg-indigo-100 text-indigo-800"
    : "border-indigo-200/70 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100";
}

export function workflowTimelineDeploymentButtonShellClass(
  selected: boolean,
  tone: "sky" | "indigo" = "sky",
): string {
  return `max-w-full break-words rounded-full border px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] transition sm:py-1 ${workflowTimelineDeploymentButtonClass(
    selected,
    tone,
  )}`;
}

export function workflowTimelineWaitResumeSurfaceDisplayValue(
  isWaitResumeEvent: boolean,
): boolean {
  return isWaitResumeEvent;
}

export function workflowTimelineWaitResumeSurfaceInputDisplayValue(
  isWaitResumeEvent: boolean,
): boolean {
  return isWaitResumeEvent;
}

export function workflowTimelineWaitResumeEventInputDisplayValue(
  isWaitResumeEvent: boolean,
): boolean {
  return isWaitResumeEvent;
}

export function workflowTimelineOptionalWaitResumeEventDisplayValue(
  isWaitResumeEvent: boolean,
): true | null {
  return isWaitResumeEvent ? true : null;
}

export function workflowTimelineOptionalTraceEventsDisplayValue(
  traceEvents: Array<unknown>,
): Array<unknown> | null {
  return traceEvents.length > 0 ? traceEvents : null;
}

export function workflowTimelineTraceEventsInputDisplayValue(
  traceEvents: Array<unknown>,
): Array<unknown> {
  return traceEvents;
}

export function workflowTimelineTraceEventsDisplayValue(
  traceEvents: Array<unknown>,
): Array<unknown> {
  return traceEvents;
}

export function workflowTimelineSurfacePresentation(isWaitResumeEvent: boolean): {
  containerClass: string;
  titleClass: string;
} {
  if (isWaitResumeEvent) {
    return {
      containerClass: "border-sky-200/70 bg-sky-50/40",
      titleClass: "text-sky-900",
    };
  }
  return {
    containerClass: "border-violet-200/70 bg-white/80",
    titleClass: "text-violet-900",
  };
}

export function workflowTimelineMetadataCardInputDisplayValue(
  card: WorkflowTimelineMetadataCard,
): WorkflowTimelineMetadataCard {
  return card;
}

export function workflowTimelineHasMetadata(card: WorkflowTimelineMetadataCard) {
  return !!(
    card.traceKind ||
    card.tracePhase ||
    card.outcomeCheckpoint ||
    card.traceSource ||
    card.traceDetailMode ||
    card.traceSideEffects ||
    card.traceExecutionMode ||
    card.routingMode ||
    card.selectedOutgoingLabels.length > 0 ||
    card.selectedOutgoingEdgeIds.length > 0 ||
    card.decisionPointId ||
    card.traceReason ||
    card.optionCount !== null ||
    card.actionCategory ||
    card.actionService ||
    card.actionCapabilityId ||
    card.actionOperation ||
    card.integrationFamily ||
    card.actionProvider ||
    card.actionProviderRequestId ||
    card.actionProviderStatusText ||
    card.actionProviderLatencyMs !== null ||
    card.actionDeploymentId ||
    card.actionDeploymentEnvironment ||
    card.actionRuntimeTriggerKind ||
    card.actionReplayOfRunId ||
    card.actionReplayOriginalDeploymentId ||
    card.actionReplayEffectiveDeploymentId ||
    card.actionReplayComparedToDeploymentId ||
    card.actionReplayMatchedOriginalDeployment !== null ||
    card.actionReplayChangedNodeCount !== null ||
    card.actionDeliveryTier ||
    card.actionProviderRoute ||
    card.actionAuthMode ||
    card.actionApprovalMode ||
    card.actionOutcome ||
    card.actionConnectorStatus ||
    card.actionStatusCode !== null ||
    card.actionOnTimeout ||
    card.actionTimeoutSeconds !== null ||
    card.actionMaxAttempts !== null ||
    card.actionRetryCount !== null ||
    card.actionAllowedTools.length > 0 ||
    card.actionAllowedCapabilities.length > 0 ||
    card.actionOutboundAllowlist.length > 0 ||
    card.actionRequestSummary ||
    card.actionResultSummary
  );
}
