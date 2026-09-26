// @locs-version: 1.0
import type { AttachmentGroundingEvidence } from "@/lib/attachmentGroundingEvidence";

export type StudySourceMapSummary = {
  descriptorCount: number;
  academicKinds: string[];
  courseTags: string[];
  weekTags: string[];
  lectureTags: string[];
  chapterTags: string[];
  unitTags: string[];
  zettelkastenStages: string[];
  headline: string;
  retrievalSummary: string;
  nextStepSummary: string;
};

function uniqueValues(
  descriptors: AttachmentGroundingEvidence["sourceDescriptors"],
  selector: (item: AttachmentGroundingEvidence["sourceDescriptors"][number]) => string | null,
): string[] {
  return [...new Set(
    descriptors
      .map(selector)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim()),
  )];
}

function buildHeadline(
  evidence: AttachmentGroundingEvidence,
  courses: string[],
  weeks: string[],
  chapters: string[],
  units: string[],
): string {
  if (courses.length === 1 && (chapters.length === 1 || units.length === 1)) {
    const scope = [courses[0], units[0], chapters[0]].filter(Boolean).join(` ${String.fromCharCode(183)} `);
    return `${scope} organized for grounded study retrieval.`;
  }
  if (courses.length === 1 && weeks.length === 1) {
    return `${courses[0]} ${String.fromCharCode(183)} ${weeks[0]} organized for grounded study retrieval.`;
  }
  if (courses.length > 1) {
    return `${courses.length} course contexts detected across ${evidence.sourceCount} uploaded study sources.`;
  }
  if (evidence.sourceCount > 1) {
    return `${evidence.sourceCount} study sources linked into one connected study set.`;
  }
  return "One study source classified and grounded for later retrieval.";
}

function buildRetrievalSummary(
  evidence: AttachmentGroundingEvidence,
  academicKinds: string[],
  zettelkastenStages: string[],
  chapterTags: string[],
  unitTags: string[],
): string {
  if (evidence.retentionMode === "keep_nothing") {
    return "This run stays grounded only in the current answer because nothing will be retained after completion.";
  }
  if (chapterTags.length > 0 || unitTags.length > 0) {
    const scope = [...unitTags, ...chapterTags].join(", ");
    return `Retained with academic scope tags (${scope}) so quizzes, flashcards, exam prep, Files, and Linked ideas can be filtered by unit or chapter.`;
  }
  if (evidence.knowledgeMode === "zettelkasten") {
    return zettelkastenStages.length > 0
      ? `Retained through supertags and Zettelkasten stages such as ${zettelkastenStages.join(", ")}.`
      : "Retained through supertags, source-note links, and the Zettelkasten lens.";
  }
  if (academicKinds.length > 0) {
    return `Retained through supertags and study classifications such as ${academicKinds.join(", ")} so Files and Linked ideas stay searchable.`;
  }
  return "Retained through extracted content, supertags, and graph links so the material stays searchable later.";
}

function buildNextStepSummary(
  evidence: AttachmentGroundingEvidence,
  courseTags: string[],
  weekTags: string[],
  chapterTags: string[],
  unitTags: string[],
): string {
  if (evidence.retentionMode === "keep_nothing") {
    return "If this answer is useful, rerun the upload with Keep extracted notes so the study material remains searchable.";
  }
  if (chapterTags.length > 0 || unitTags.length > 0) {
    const scope = [...unitTags, ...chapterTags].join(", ");
    return `Next best step: run quiz, flashcards, or exam prep using the saved ${scope} focus, then open Files or Linked ideas to inspect the retained source map.`;
  }
  if (evidence.knowledgeMode === "zettelkasten") {
    return "Next best step: open the Zettelkasten lens to review source notes, follow links, and promote permanent notes.";
  }
  if (evidence.sourceCount > 1) {
    return "Next best step: open Linked ideas to inspect overlap and divergence across the uploaded study sources.";
  }
  if (courseTags.length === 1 || weekTags.length === 1) {
    return "Next best step: open Files to review the retained source, then follow the course or week filter into the graph.";
  }
  return "Next best step: open Files to review the retained source and continue from the linked study graph.";
}

export function summarizeStudySourceMap(
  evidence: AttachmentGroundingEvidence | null,
): StudySourceMapSummary | null {
  if (!evidence || evidence.sourceDescriptors.length === 0) return null;
  const academicKinds = uniqueValues(evidence.sourceDescriptors, (item) => item.academicKind);
  const courseTags = uniqueValues(evidence.sourceDescriptors, (item) => item.courseTag);
  const weekTags = uniqueValues(evidence.sourceDescriptors, (item) => item.weekTag);
  const lectureTags = uniqueValues(evidence.sourceDescriptors, (item) => item.lectureTag);
  const chapterTags = uniqueValues(evidence.sourceDescriptors, (item) => item.chapterTag ?? null);
  const unitTags = uniqueValues(evidence.sourceDescriptors, (item) => item.unitTag ?? null);
  const zettelkastenStages = uniqueValues(evidence.sourceDescriptors, (item) => item.zettelkastenStage);
  return {
    descriptorCount: evidence.sourceDescriptors.length,
    academicKinds,
    courseTags,
    weekTags,
    lectureTags,
    chapterTags,
    unitTags,
    zettelkastenStages,
    headline: buildHeadline(evidence, courseTags, weekTags, chapterTags, unitTags),
    retrievalSummary: buildRetrievalSummary(evidence, academicKinds, zettelkastenStages, chapterTags, unitTags),
    nextStepSummary: buildNextStepSummary(evidence, courseTags, weekTags, chapterTags, unitTags),
  };
}
