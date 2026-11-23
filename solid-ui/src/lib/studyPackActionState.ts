// @locs-version: 1.0
import type { FileLibraryItem } from "@/lib/api";
import { fileLibraryStudyReadiness } from "@/lib/fileLibraryState";
import type { KnowledgeCard } from "@/lib/knowledgeGraphTypes";
import {
  continueStudyFocusLabel,
  openMatchingGraphLabel,
  openRetainedSourcesLabel,
  showStudyReadyFirstLabel,
  showStrongestLinksLabel,
} from "@/lib/studyFocusActionCopy";

export type StudyPackActionState = {
  headline: string;
  detail: string;
  primaryActionLabel: string;
  secondaryActionLabel: string | null;
};

function fileItemsLookStudyLike(items: readonly FileLibraryItem[]): FileLibraryItem[] {
  return items.filter((item) => (
    item.source_kind === "parsed_document"
    || item.source_kind === "transcript"
    || typeof item.source_metadata.academic_kind === "string"
    || typeof item.source_metadata.academic_course_tag === "string"
    || typeof item.source_metadata.academic_week_tag === "string"
    || typeof item.source_metadata.academic_lecture_tag === "string"
    || typeof item.source_metadata.academic_chapter_tag === "string"
    || typeof item.source_metadata.academic_unit_tag === "string"
    || item.source_supertags.some((tag) => (
      tag.startsWith("academic:")
      || tag.startsWith("course:")
      || tag.startsWith("week:")
      || tag.startsWith("chapter:")
      || tag.startsWith("unit:")
      || tag.startsWith("resource:study_material")
    ))
  ));
}

export function buildFileStudyPackActionState(
  items: readonly FileLibraryItem[],
): StudyPackActionState | null {
  const studyItems = fileItemsLookStudyLike(items);
  if (studyItems.length === 0) return null;

  const readyCount = studyItems.filter((item) => fileLibraryStudyReadiness(item) === "ready_now").length;
  const zettelkastenCount = studyItems.filter((item) => item.source_metadata.knowledge_mode === "zettelkasten").length;
  const knowledgeMode = zettelkastenCount > 0 ? "zettelkasten" : "connected_notes";

  if (zettelkastenCount > 0) {
    return {
      headline: "Best next step: develop the note chain",
      detail: readyCount > 0
        ? "This pack already includes Zettelkasten-oriented material, so the highest-value next step is turning the strongest source notes into better linked notes or permanent-note candidates."
        : "This pack is leaning Zettelkasten, but it still needs stronger retained notes. The highest-value next step is to continue the note chain before branching into broader comparison.",
      primaryActionLabel: continueStudyFocusLabel(knowledgeMode),
      secondaryActionLabel: openMatchingGraphLabel(),
    };
  }

  if (studyItems.length >= 2 && readyCount > 0) {
    return {
      headline: "Best next step: compare the retained pack",
      detail: "This view already contains enough related retained study material to compare overlap, contradictions, and revision gaps without re-uploading files.",
      primaryActionLabel: continueStudyFocusLabel(knowledgeMode),
      secondaryActionLabel: openMatchingGraphLabel(),
    };
  }

  if (studyItems.length === 1) {
    return {
      headline: "Best next step: add one related source",
      detail: "A single retained source is useful, but the next big jump in value comes when OmnyID can compare it against a reading, lecture, tutorial, or rough note from the same topic.",
      primaryActionLabel: continueStudyFocusLabel(knowledgeMode),
      secondaryActionLabel: "Add one more source",
    };
  }

  return {
    headline: "Best next step: review what is already study-ready",
    detail: "This pack is still forming. Review the retained material that is already readable first, then add another related source to strengthen retrieval and linking.",
    primaryActionLabel: continueStudyFocusLabel(knowledgeMode),
    secondaryActionLabel: showStudyReadyFirstLabel(),
  };
}

export function buildKnowledgeGraphStudyPackActionState(
  cards: readonly KnowledgeCard[],
): StudyPackActionState | null {
  if (cards.length === 0) return null;
  const strongCount = cards.filter((card) => card.connectionStrength === "high").length;
  const zettelkastenCount = cards.filter((card) => card.knowledgeMode === "zettelkasten").length;

  if (zettelkastenCount > 0) {
    return {
      headline: "Best next step: continue the note chain",
      detail: "This graph focus already contains Zettelkasten-style notes, so the highest-value next step is strengthening permanent-note candidates and weak links before broadening the topic.",
      primaryActionLabel: continueStudyFocusLabel("zettelkasten"),
      secondaryActionLabel: openRetainedSourcesLabel(),
    };
  }

  if (strongCount > 0) {
    return {
      headline: "Best next step: use the strongest links",
      detail: "This graph already has grounded cross-source links, so the highest-value next step is asking for overlap, differences, and revision gaps directly from this focus.",
      primaryActionLabel: continueStudyFocusLabel("connected_notes"),
      secondaryActionLabel: showStrongestLinksLabel(),
    };
  }

  if (cards.length >= 2) {
    return {
      headline: "Best next step: strengthen a developing graph",
      detail: "Useful links are forming, but they are not fully reinforced yet. Continue from this study focus or add one more related source from the same topic to strengthen the network.",
      primaryActionLabel: continueStudyFocusLabel("connected_notes"),
      secondaryActionLabel: openRetainedSourcesLabel(),
    };
  }

  return {
    headline: "Best next step: add another related source",
    detail: "This graph only has one grounded card in focus, so the next major improvement comes from adding a second lecture, reading, or note from the same topic.",
    primaryActionLabel: continueStudyFocusLabel("connected_notes"),
    secondaryActionLabel: openRetainedSourcesLabel(),
  };
}
