// @locs-version: 1.0
import {
  decisionOsPreparedWorkSimulatorSuggestionState,
  decisionOsPreparedWorkSimulatorTileState,
} from "./decisionosPreparedWorkState";
import {
  simulatorPreviewBadgeLabel,
  simulatorPreviewReviewFooter,
  simulatorPreviewSummary,
  type SimulatorPreviewKind,
} from "./simulatorPreviewCopy";

export function decisionOsOperationalCardLabel(
  kind: "continuity" | "responses" | "cost",
): string {
  switch (kind) {
    case "continuity":
      return "Continuity";
    case "responses":
      return "Responses";
    default:
      return "Cost";
  }
}

export function decisionOsOperationalCardBadge(args: {
  kind: "continuity" | "responses";
  isPrimary?: boolean;
  isUrgent?: boolean;
}): string {
  if (args.kind === "continuity") {
    return args.isPrimary ? "leading" : "active";
  }
  return args.isUrgent ? "urgent" : "due soon";
}

export function decisionOsResponseAttentionTitle(count: number): string {
  return `${count} conversation${count === 1 ? "" : "s"} need attention`;
}

export function decisionOsResponseAttentionDetail(title?: string | null): string {
  return title?.trim() || "A response deadline is approaching.";
}

export function decisionOsResponseQueueReviewLabel(hint?: string | null): string {
  return hint?.trim() || "Review response queue";
}

export function decisionOsOperationalCostFooterLabel(progressPercent?: number | null): string {
  return progressPercent !== null && progressPercent !== undefined
    ? `${progressPercent}% of monthly cap - Open cost dashboard`
    : "Open cost dashboard";
}

export function decisionOsOperationalHiddenLabelsSummary(labels: readonly string[]): string {
  return labels.map((label) => label.toLowerCase()).join(" - ");
}

export function decisionOsOperationalContinuityCardState(args: {
  title: string;
  context: string;
  priorityReason: string;
  boundedReason?: string | null;
  rawReason?: string | null;
  consequencePreview?: string | null;
  provenanceCue?: string | null;
  autonomySummary?: string | null;
  sourceSummary?: string | null;
  footer: string;
  destinationLabel: string;
  fieldEngineCue?: string | null;
  isPrimary?: boolean;
}): {
  label: "Continuity";
  title: string;
  badge: string;
  detail: string;
  boundedReason?: string | null;
  rawReason?: string | null;
  consequencePreview?: string | null;
  provenanceCue?: string | null;
  autonomySummary?: string | null;
  priorityRationale: string;
  sourceSummary?: string | null;
  footer: string;
  actionLabel: string;
} {
  const consequencePreview = args.consequencePreview?.trim();
  const provenanceCue = args.provenanceCue?.trim();
  const autonomySummary = args.autonomySummary?.trim();
  return {
    label: "Continuity",
    title: args.title,
    badge: decisionOsOperationalCardBadge({
      kind: "continuity",
      isPrimary: args.isPrimary,
    }),
    detail: args.fieldEngineCue ? `${args.context} ${args.fieldEngineCue}` : args.context,
    boundedReason: args.boundedReason,
    rawReason: args.rawReason,
    ...(consequencePreview ? { consequencePreview } : {}),
    ...(provenanceCue ? { provenanceCue } : {}),
    ...(autonomySummary ? { autonomySummary } : {}),
    priorityRationale: args.priorityReason,
    sourceSummary: args.sourceSummary,
    footer: args.footer,
    actionLabel: `Open ${args.destinationLabel}`,
  };
}

export function decisionOsOperationalSimulatorPreviewCardState(args: {
  kind: SimulatorPreviewKind;
  title: string;
  boundedReason?: string | null;
  consequencePreview?: string | null;
  previewBoundarySummary?: string | null;
  provenanceCue?: string | null;
  autonomySummary?: string | null;
  sourceSummary?: string | null;
  footer?: string | null;
  destinationLabel: string;
}): {
  label: "Preview";
  title: string;
  badge: string;
  detail: string;
  boundedReason: null;
  rawReason: null;
  consequencePreview?: string;
  previewBoundarySummary?: string;
  provenanceCue?: string;
  autonomySummary?: string;
  sourceSummary?: string;
  footer: string;
  actionLabel: string;
} {
  const fallbackDetail = simulatorPreviewSummary(args.kind);
  const fallbackFooter = simulatorPreviewReviewFooter(args.kind);
  const consequencePreview = args.consequencePreview?.trim();
  const previewBoundarySummary = args.previewBoundarySummary?.trim();
  const provenanceCue = args.provenanceCue?.trim();
  const autonomySummary = args.autonomySummary?.trim();
  const sourceSummary = args.sourceSummary?.trim();

  return {
    label: "Preview",
    title: args.title,
    badge: simulatorPreviewBadgeLabel(args.kind),
    detail: args.boundedReason?.trim() || fallbackDetail,
    boundedReason: null,
    rawReason: null,
    ...(consequencePreview ? { consequencePreview } : {}),
    ...(previewBoundarySummary ? { previewBoundarySummary } : {}),
    ...(provenanceCue ? { provenanceCue } : {}),
    ...(autonomySummary ? { autonomySummary } : {}),
    ...(sourceSummary ? { sourceSummary } : {}),
    footer: args.footer?.trim() || fallbackFooter,
    actionLabel: `Open ${args.destinationLabel}`,
  };
}

export function decisionOsOperationalSimulatorPreviewCardStateFromUnknown(args: {
  item: Record<string, unknown> | null | undefined;
  destinationLabel: string;
}): {
  label: "Preview";
  title: string;
  badge: string;
  detail: string;
  boundedReason: null;
  rawReason: null;
  consequencePreview?: string;
  previewBoundarySummary?: string;
  provenanceCue?: string;
  autonomySummary?: string;
  sourceSummary?: string;
  footer: string;
  actionLabel: string;
} | null {
  const tileState = decisionOsPreparedWorkSimulatorTileState(args.item);
  if (!tileState) return null;
  const suggestionState = decisionOsPreparedWorkSimulatorSuggestionState(args.item);
  return decisionOsOperationalSimulatorPreviewCardState({
    kind: tileState.kind,
    title: tileState.title,
    boundedReason: suggestionState?.boundedReason ?? tileState.detail,
    consequencePreview: suggestionState?.consequencePreview ?? tileState.consequencePreview,
    previewBoundarySummary: suggestionState?.previewBoundarySummary ?? tileState.previewBoundarySummary,
    provenanceCue: suggestionState?.provenanceCue ?? tileState.provenanceCue,
    autonomySummary: suggestionState?.autonomySummary ?? tileState.autonomySummary,
    sourceSummary: suggestionState?.sourceSummary ?? tileState.sourceSummary,
    footer:
      suggestionState?.consequencePreview
      ?? suggestionState?.rolloutSummary
      ?? suggestionState?.persistenceReason
      ?? suggestionState?.previewBoundarySummary
      ?? null,
    destinationLabel: args.destinationLabel,
  });
}
