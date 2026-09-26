// @locs-version: 1.0
import type { AttachmentGroundingEvidence } from "@/lib/attachmentGroundingEvidence";

type RecommendationEvidence = Pick<
  AttachmentGroundingEvidence,
  "sourceCount" | "retentionMode" | "knowledgeMode" | "sourceDescriptors"
>;

export type StudyAdjacentSourceRecommendation = {
  anchorLabel: string;
  nextSourceLabel: string;
  rationaleLabel: string;
  recommendedUploadLabel: string;
  helperLabel: string;
};

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(
    values
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim()),
  )];
}

function dominantAcademicKinds(evidence: RecommendationEvidence): string[] {
  return unique(evidence.sourceDescriptors.map((item) => item.academicKind));
}

function anchorParts(evidence: RecommendationEvidence): string[] {
  return unique([
    evidence.sourceDescriptors.map((item) => item.courseTag)[0],
    evidence.sourceDescriptors.map((item) => item.unitTag)[0],
    evidence.sourceDescriptors.map((item) => item.chapterTag)[0],
    evidence.sourceDescriptors.map((item) => item.weekTag)[0],
    evidence.sourceDescriptors.map((item) => item.lectureTag)[0],
  ]);
}

function anchorLabel(evidence: RecommendationEvidence): string {
  const parts = anchorParts(evidence);
  if (parts.length === 0) return "the same study topic";
  return parts.join(" Â· ");
}

function nextSourceLabel(evidence: RecommendationEvidence): string {
  const kinds = dominantAcademicKinds(evidence);
  if (evidence.retentionMode === "keep_nothing") {
    return "Reuse the same files first with kept extracted notes before adding anything new.";
  }
  if (evidence.knowledgeMode === "zettelkasten") {
    if (kinds.includes("lecture_slides") && !kinds.includes("study_notes")) {
      return "Add a short source note or rough note from the same topic.";
    }
    if ((kinds.includes("study_notes") || kinds.includes("reading_notes")) && !kinds.includes("reading")) {
      return "Add one reading or lecture source that challenges or extends the same note chain.";
    }
    return "Add one adjacent lecture, reading, or rough note that belongs to the same branch.";
  }
  if (kinds.includes("lecture_slides") && !kinds.includes("reading") && !kinds.includes("study_notes")) {
    return "Add one reading, tutorial sheet, or rough note from the same week.";
  }
  if (kinds.includes("reading") && !kinds.includes("lecture_slides") && !kinds.includes("study_notes")) {
    return "Add lecture slides or tutorial notes from the same week.";
  }
  if ((kinds.includes("study_notes") || kinds.includes("reading_notes")) && !kinds.includes("lecture_slides")) {
    return "Add the lecture source those notes came from.";
  }
  if (evidence.sourceCount >= 2) {
    return "Add one adjacent source only if it covers the same concept cluster, week, or assignment.";
  }
  return "Add one related lecture, reading, or rough note from the same topic.";
}

function rationaleLabel(evidence: RecommendationEvidence): string {
  const kinds = dominantAcademicKinds(evidence);
  if (evidence.retentionMode === "keep_nothing") {
    return "Until retention is enabled, reinforcement cannot accumulate across sessions, so adding new files too early just creates more disposable work.";
  }
  if (evidence.knowledgeMode === "zettelkasten") {
    return "The point is to deepen one note branch. A nearby source creates stronger note promotion than opening a new disconnected topic.";
  }
  if (evidence.sourceCount >= 2) {
    return "The current pack already has some overlap. One adjacent source should only be added to densify the same concept cluster, not to widen scope randomly.";
  }
  if (kinds.length <= 1) {
    return "Right now the thread leans on one source type. A complementary source gives supertags and graph links something real to connect.";
  }
  return "A nearby source increases corroboration and makes the next grounded answer more trustworthy under pressure.";
}

export function buildStudyAdjacentSourceRecommendation(
  evidence: AttachmentGroundingEvidence | null,
): StudyAdjacentSourceRecommendation | null {
  if (!evidence || evidence.sourceCount === 0) return null;

  const anchor = anchorLabel(evidence);
  const nextSource = nextSourceLabel(evidence);
  const rationale = rationaleLabel(evidence);

  return {
    anchorLabel: anchor,
    nextSourceLabel: nextSource,
    rationaleLabel: rationale,
    recommendedUploadLabel:
      evidence.retentionMode === "keep_nothing"
        ? "Best with the same study files first, rerun with kept extracted notes."
        : `Best next upload: stay inside ${anchor} and ${nextSource.charAt(0).toLowerCase()}${nextSource.slice(1)}`,
    helperLabel:
      evidence.retentionMode === "keep_nothing"
        ? "Keep extracted notes on before you add more material so the same study thread becomes reusable."
        : `Stay inside ${anchor} on the next run so OmnyID reinforces one reusable study thread instead of scattering knowledge across unrelated uploads.`,
  };
}

export function buildStudyAdjacentSourceRecommendationFromFocus(input: {
  knowledgeMode?: "connected_notes" | "zettelkasten" | "standard" | "all" | null;
  retentionMode?: "keep_file" | "keep_extracted_only" | "keep_nothing" | null;
  sourceCount?: number | null;
  academicKind?: string | null;
  courseTag?: string | null;
  weekTag?: string | null;
  lectureTag?: string | null;
  chapterTag?: string | null;
  unitTag?: string | null;
  zettelkastenStage?: string | null;
}): StudyAdjacentSourceRecommendation | null {
  const sourceCount = typeof input.sourceCount === "number" && input.sourceCount > 0 ? input.sourceCount : 1;

  const evidence: RecommendationEvidence = {
    sourceCount,
    retentionMode: input.retentionMode ?? "keep_extracted_only",
    knowledgeMode:
      input.knowledgeMode === "zettelkasten"
        ? "zettelkasten"
        : "connected_notes",
    sourceDescriptors: [
      {
        title: "Current study focus",
        kindLabel: "Uploaded study source",
        academicKind: input.academicKind ?? null,
        academicSummary: null,
        courseTag: input.courseTag ?? null,
        weekTag: input.weekTag ?? null,
        lectureTag: input.lectureTag ?? null,
        chapterTag: input.chapterTag ?? null,
        unitTag: input.unitTag ?? null,
        zettelkastenStage: input.zettelkastenStage ?? null,
      },
    ],
  };

  const anchor = anchorLabel(evidence);
  const nextSource = nextSourceLabel(evidence);

  return {
    anchorLabel: anchor,
    nextSourceLabel: nextSource,
    rationaleLabel: rationaleLabel(evidence),
    recommendedUploadLabel:
      evidence.retentionMode === "keep_nothing"
        ? "Best with the same study files first, rerun with kept extracted notes."
        : `Best next upload: stay inside ${anchor} and ${nextSource.charAt(0).toLowerCase()}${nextSource.slice(1)}`,
    helperLabel:
      evidence.retentionMode === "keep_nothing"
        ? "Keep extracted notes on before you add more material so the same study thread becomes reusable."
        : `Stay inside ${anchor} on the next run so OmnyID reinforces one reusable study thread instead of scattering knowledge across unrelated uploads.`,
  };
}
