// @locs-version: 1.0
import type { StudyResultContinuationState } from "@/lib/studyResultContinuationState";
import type { StudyResultHandoffState } from "@/lib/studyResultHandoffState";
import type { StudyResultMomentumState } from "@/lib/studyResultMomentumState";
import type { StudyResultValuePathState } from "@/lib/studyResultValuePathState";
import { inferReportKindFromText, reportLabelForKind } from "@/lib/reportSeedMetadata";

export type StudyResultCommandCenterActionId = "files" | "graph" | "search";

export type StudyResultCommandCenterCard = {
  label: string;
  detail: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type StudyResultCommandCenterState = {
  eyebrowLabel: string;
  headline: string;
  detail: string;
  badge: string;
  tone: "sky" | "emerald" | "violet" | "amber";
  cards: StudyResultCommandCenterCard[];
  primaryActionId: StudyResultCommandCenterActionId;
  primaryActionLabel: string;
  secondaryActionId: StudyResultCommandCenterActionId | null;
  secondaryActionLabel: string | null;
};

function toneFromValuePath(
  valuePath: StudyResultValuePathState | null,
  momentum: StudyResultMomentumState | null,
): "sky" | "emerald" | "violet" | "amber" {
  if (valuePath?.grade === "fix_retention") return "amber";
  if (valuePath?.grade === "zettelkasten_ready") return "violet";
  if (valuePath?.grade === "connected_pack_ready") return "emerald";
  if (momentum?.tone === "amber" || momentum?.tone === "sky" || momentum?.tone === "emerald") {
    return momentum.tone;
  }
  return "sky";
}

function continuationCardDetail(continuation: StudyResultContinuationState | null): string {
  if (!continuation) {
    return "The next step should stay close to the same topic so the student gets compounding value instead of restarting from scratch.";
  }
  return continuation.detail;
}

function nextMoveDetail(
  valuePath: StudyResultValuePathState | null,
  handoff: StudyResultHandoffState | null,
): string {
  if (valuePath) return valuePath.detail;
  if (handoff?.steps[0]?.detail) return handoff.steps[0].detail;
  return "Keep the same study topic active and move into the next retained source, graph, or grounded follow-up instead of widening too early.";
}

function reportLabelFromResultState(input: {
  valuePath: StudyResultValuePathState | null;
  continuation: StudyResultContinuationState | null;
  momentum: StudyResultMomentumState | null;
  handoff: StudyResultHandoffState | null;
}): string | null {
  const text = [
    input.valuePath?.headline,
    input.valuePath?.detail,
    input.valuePath?.badge,
    input.continuation?.headline,
    input.continuation?.detail,
    input.momentum?.headline,
    input.momentum?.detail,
    input.handoff?.headline,
    input.handoff?.detail,
    ...(input.valuePath?.cards ?? []).flatMap((card) => [card.label, card.detail]),
    ...(input.continuation?.actions ?? []).flatMap((action) => [action.label, action.description]),
    ...(input.handoff?.steps ?? []).flatMap((step) => [step.label, step.detail, step.actionLabel]),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const kind = inferReportKindFromText(text);
  return kind ? reportLabelForKind(kind) : null;
}

export function buildStudyResultCommandCenterState(input: {
  valuePath: StudyResultValuePathState | null;
  continuation: StudyResultContinuationState | null;
  momentum: StudyResultMomentumState | null;
  handoff: StudyResultHandoffState | null;
}): StudyResultCommandCenterState | null {
  const valuePath = input.valuePath;
  const continuation = input.continuation;
  const momentum = input.momentum;
  const handoff = input.handoff;

  if (!valuePath && !continuation && !momentum && !handoff) return null;
  const reportLabel = reportLabelFromResultState(input);

  return {
    eyebrowLabel: reportLabel
      ? `Best next move from this ${reportLabel}`
      : "Best next move from this study result",
    headline:
      valuePath?.headline
      ?? handoff?.headline
      ?? continuation?.headline
      ?? momentum?.headline
      ?? "This study result is ready for follow-through.",
    detail:
      handoff?.detail
      ?? continuation?.detail
      ?? valuePath?.detail
      ?? momentum?.detail
      ?? "The next step should stay close to the same study topic so the retained result compounds instead of disappearing into a one-off answer.",
    badge:
      valuePath?.badge
      ?? handoff?.badge
      ?? (momentum?.grade === "reusable"
        ? "Reusable memory"
        : momentum?.grade === "developing"
          ? "Developing memory"
          : "One-off answer"),
    tone: toneFromValuePath(valuePath, momentum),
    cards: [
      {
        label: reportLabel ? "What this report created" : "What this created",
        detail:
          momentum?.detail
          ?? "A grounded study result the student can reuse instead of re-explaining from scratch next time.",
        tone: momentum?.tone === "amber" ? "amber" : momentum?.tone === "sky" ? "sky" : "emerald",
      },
      {
        label: "What stays usable",
        detail: continuationCardDetail(continuation),
        tone: valuePath?.grade === "fix_retention" ? "amber" : "sky",
      },
      {
        label: reportLabel ? "Best report follow-through" : "Best next move",
        detail: nextMoveDetail(valuePath, handoff),
        tone: valuePath?.grade === "zettelkasten_ready" ? "violet" : "emerald",
      },
    ],
    primaryActionId: valuePath?.primaryActionId ?? continuation?.actions[0]?.id ?? handoff?.steps[0]?.actionId ?? momentum?.primaryActionId ?? "search",
    primaryActionLabel: valuePath?.primaryActionLabel ?? continuation?.actions[0]?.label ?? handoff?.steps[0]?.actionLabel ?? momentum?.primaryActionLabel ?? "Continue this topic",
    secondaryActionId: valuePath?.secondaryActionId ?? continuation?.actions[1]?.id ?? handoff?.steps[1]?.actionId ?? momentum?.secondaryActionId ?? null,
    secondaryActionLabel: valuePath?.secondaryActionLabel ?? continuation?.actions[1]?.label ?? handoff?.steps[1]?.actionLabel ?? momentum?.secondaryActionLabel ?? null,
  };
}
