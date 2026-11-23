// @locs-version: 1.0
import type { KnowledgeOrganizationMode } from "@/lib/api";

export type StudyFocusKnowledgeMode =
  | "all"
  | KnowledgeOrganizationMode
  | "unclassified";

export function continueStudyFocusLabel(mode: StudyFocusKnowledgeMode): string {
  return mode === "zettelkasten"
    ? "Continue note chain"
    : "Ask from this study focus";
}

export function openMatchingGraphLabel(): string {
  return "Open matching graph view";
}

export function openRetainedSourcesLabel(): string {
  return "Open retained sources";
}

export function showStudyReadyFirstLabel(): string {
  return "Show study-ready first";
}

export function planNextSourceLabel(): string {
  return "Plan next source";
}

export function showStrongestLinksLabel(): string {
  return "Show strongest links";
}

export function focusReviewQueueLabel(): string {
  return "Focus review queue";
}
