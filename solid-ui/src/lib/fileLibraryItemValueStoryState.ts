// @locs-version: 1.0
import type { FileLibraryItem } from "@/lib/api";
import {
  fileLibraryAcademicCourseTag,
  fileLibraryAcademicChapterTag,
  fileLibraryAcademicKind,
  fileLibraryAcademicLectureTag,
  fileLibraryAcademicUnitTag,
  fileLibraryAcademicWeekTag,
  fileLibraryPolicyOutcome,
  fileLibraryRetentionMode,
  fileLibraryStudyReadiness,
  fileLibraryZettelkastenStage,
} from "@/lib/fileLibraryState";

export type FileLibraryItemValueSignal = {
  label: string;
  value: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type FileLibraryItemValueStoryState = {
  grade: "fragile" | "developing" | "strong";
  headline: string;
  detail: string;
  nextStep: string;
  signals: FileLibraryItemValueSignal[];
};

function visibleStudyTags(item: FileLibraryItem): string[] {
  return item.source_supertags
    .filter((tag) => /^(topic|course|unit|chapter|week|lecture|academic|zk):/i.test(tag))
    .filter((tag, index, all) => tag.trim().length > 0 && all.indexOf(tag) === index)
    .slice(0, 4);
}

function anchorLabel(item: FileLibraryItem): string {
  return fileLibraryAcademicCourseTag(item)
    ?? fileLibraryAcademicUnitTag(item)
    ?? fileLibraryAcademicChapterTag(item)
    ?? fileLibraryAcademicWeekTag(item)
    ?? fileLibraryAcademicLectureTag(item)
    ?? visibleStudyTags(item)[0]
    ?? item.name;
}

export function buildFileLibraryItemValueStoryState(
  item: FileLibraryItem,
): FileLibraryItemValueStoryState | null {
  const readiness = fileLibraryStudyReadiness(item);
  const retentionMode = fileLibraryRetentionMode(item);
  const knowledgeMode = typeof item.source_metadata.knowledge_mode === "string" ? item.source_metadata.knowledge_mode : null;
  const academicKind = fileLibraryAcademicKind(item);
  const courseTag = fileLibraryAcademicCourseTag(item);
  const unitTag = fileLibraryAcademicUnitTag(item);
  const chapterTag = fileLibraryAcademicChapterTag(item);
  const weekTag = fileLibraryAcademicWeekTag(item);
  const lectureTag = fileLibraryAcademicLectureTag(item);
  const zettelkastenStage = fileLibraryZettelkastenStage(item);
  const studyTags = visibleStudyTags(item);
  const policyOutcome = fileLibraryPolicyOutcome(item);
  const anchor = anchorLabel(item);
  const hasDenseAnchors =
    (
      studyTags.length >= 2
      || Boolean(courseTag && weekTag)
      || Boolean(courseTag && unitTag)
      || Boolean(courseTag && chapterTag)
      || Boolean(unitTag && chapterTag)
      || Boolean(lectureTag)
    )
    && knowledgeMode !== "zettelkasten"
    || zettelkastenStage === "permanent_note"
    || zettelkastenStage === "review_pending";

  if (
    !academicKind
    && !courseTag
    && !unitTag
    && !chapterTag
    && !weekTag
    && !lectureTag
    && !zettelkastenStage
    && studyTags.length === 0
    && !policyOutcome
  ) {
    return null;
  }

  const signals: FileLibraryItemValueSignal[] = [];

  if (studyTags.length >= 2) {
    signals.push({
      label: "Supertag coverage",
      value: `This file already carries multiple study supertags (${studyTags.join(", ")}), which makes it easier to reopen by concept, week, course, or note stage instead of filename recall.`,
      tone: "violet",
    });
  } else if (studyTags.length === 1) {
    signals.push({
      label: "Supertag coverage",
      value: `This file already has one clear study anchor (${studyTags[0]}), but one adjacent source on the same topic would make retrieval much stronger.`,
      tone: "sky",
    });
  } else {
    signals.push({
      label: "Supertag gap",
      value: "This file is retained, but it still has weak visible study tagging. Its value will improve once it is reinforced by another related study source.",
      tone: "amber",
    });
  }

  if (courseTag || unitTag || chapterTag || weekTag || lectureTag || academicKind) {
    const contextBits = [academicKind?.replace(/_/g, " "), courseTag, unitTag, chapterTag, weekTag, lectureTag].filter((value): value is string => Boolean(value));
    signals.push({
      label: "Academic anchor",
      value: `The file is already grounded to ${contextBits.join(" Â· ")}, so it can participate in a real study thread rather than sitting as generic storage.`,
      tone: "emerald",
    });
  }

  if (zettelkastenStage) {
    signals.push({
      label: "Note-chain role",
      value: `This file is already participating in Zettelkasten stage ${zettelkastenStage.replace(/_/g, " ")}, so the next move is to deepen the same branch rather than uploading broadly.`,
      tone: "violet",
    });
  } else if (knowledgeMode === "zettelkasten") {
    signals.push({
      label: "Note-chain role",
      value: "This file is organized for Zettelkasten-style development, but it still needs a clearer review or permanent-note stage to become stronger.",
      tone: "sky",
    });
  } else if (knowledgeMode === "connected_notes") {
    signals.push({
      label: "Connected-notes role",
      value: "This file is already part of the connected-notes path, which means the next value comes from graph overlap and grounded follow-up questions, not manual folders.",
      tone: "emerald",
    });
  }

  if (retentionMode === "keep_nothing") {
    signals.push({
      label: "Retention risk",
      value: "This file was used in a session-only path, so it will not behave like reusable study memory until the same material is retained on a future run.",
      tone: "amber",
    });
  }

  if (readiness === "ready_now" && hasDenseAnchors) {
    return {
      grade: "strong",
      headline: "This file is strong enough to use as a live study anchor.",
      detail: `Because ${anchor} is retained, classified, and already tagged for study retrieval, it should be immediately useful in Files, the graph, and grounded follow-up questions.`,
      nextStep: zettelkastenStage
        ? "Open the related notes or graph and continue the same note branch."
        : "Ask from this file now, then compare it against one adjacent source only if you want denser overlap.",
      signals: signals.slice(0, 4),
    };
  }

  if (readiness === "developing" || readiness === "ready_now") {
    return {
      grade: "developing",
      headline: "This file is useful now, but it still needs reinforcement.",
      detail: `The file already has enough structure around ${anchor} to stay findable, but not enough yet to act like fully dependable connected study memory under pressure.`,
      nextStep: zettelkastenStage
        ? "Stay on the same branch and add one adjacent source or follow-up question that deepens this note stage."
        : "Use this file for one grounded follow-up now, then add one adjacent lecture, reading, or note from the same topic.",
      signals: signals.slice(0, 4),
    };
  }

  return {
    grade: "fragile",
    headline: "This file is retained more like storage than a dependable study asset.",
    detail: `The file is visible in the library, but ${anchor} still lacks enough retained study structure to behave like zero-maintenance connected notes on its own.`,
    nextStep: "Keep the file if needed, but strengthen it with extracted retention, clearer study tagging, or one adjacent source from the same topic.",
    signals: signals.slice(0, 4),
  };
}
