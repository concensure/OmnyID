// @locs-version: 1.0
import type { AttachmentGroundingEvidence } from "@/lib/attachmentGroundingEvidence";

export type StudyResultMomentumActionId = "files" | "graph" | "search";

export type StudyResultMomentumState = {
  grade: "one_off" | "developing" | "reusable";
  headline: string;
  detail: string;
  tone: "amber" | "sky" | "emerald";
  primaryActionId: StudyResultMomentumActionId;
  primaryActionLabel: string;
  secondaryActionId: StudyResultMomentumActionId | null;
  secondaryActionLabel: string | null;
};

function hasAcademicContext(evidence: AttachmentGroundingEvidence): boolean {
  return evidence.sourceDescriptors.some((item) =>
    Boolean(item.academicKind || item.courseTag || item.unitTag || item.chapterTag || item.weekTag || item.lectureTag || item.zettelkastenStage),
  );
}

function hasZettelkastenStage(evidence: AttachmentGroundingEvidence): boolean {
  return evidence.sourceDescriptors.some((item) => Boolean(item.zettelkastenStage));
}

export function buildStudyResultMomentumState(
  evidence: AttachmentGroundingEvidence | null,
): StudyResultMomentumState | null {
  if (!evidence || evidence.sourceCount === 0) return null;

  if (evidence.retentionMode === "keep_nothing") {
    return {
      grade: "one_off",
      headline: "This answer is useful, but it did not create reusable study memory.",
      detail: "The result is grounded in the current chat only. Keep extracted notes on the next run when you want Files, supertags, and the graph to remember this material afterward.",
      tone: "amber",
      primaryActionId: "search",
      primaryActionLabel: "Rerun with retention",
      secondaryActionId: null,
      secondaryActionLabel: null,
    };
  }

  if (evidence.knowledgeMode === "zettelkasten") {
    return {
      grade: hasZettelkastenStage(evidence) || evidence.sourceCount > 1 ? "reusable" : "developing",
      headline: hasZettelkastenStage(evidence)
        ? "This run created reusable note-chain material."
        : "This run started a Zettelkasten path, but it still needs reinforcement.",
      detail: hasZettelkastenStage(evidence)
        ? "Source notes, review states, or linked note stages are present, so the next step is to inspect the chain and promote stronger notes."
        : "The material is retained, but one more related lecture, reading, or rough note should make the Zettelkasten chain more valuable.",
      tone: hasZettelkastenStage(evidence) || evidence.sourceCount > 1 ? "emerald" : "sky",
      primaryActionId: "graph",
      primaryActionLabel: "Open Zettelkasten view",
      secondaryActionId: "files",
      secondaryActionLabel: "Review retained sources",
    };
  }

  if (evidence.sourceCount >= 2 && hasAcademicContext(evidence)) {
    return {
      grade: "reusable",
      headline: "This run created a reusable connected study pack.",
      detail: "Multiple grounded sources were retained with study context, so Files and Linked ideas should now be useful immediately for overlap, revision gaps, and follow-up questions.",
      tone: "emerald",
      primaryActionId: "graph",
      primaryActionLabel: "Open Linked ideas",
      secondaryActionId: "files",
      secondaryActionLabel: "Open retained sources",
    };
  }

  return {
    grade: "developing",
    headline: "This run created one reusable study source.",
    detail: hasAcademicContext(evidence)
      ? "The source is retained with study metadata, so it is already reusable in Files. Add one more related source next to strengthen Linked ideas."
      : "The source is retained, but stronger study classification or one more related file should make later retrieval much better.",
    tone: "sky",
    primaryActionId: "files",
    primaryActionLabel: "Open retained source",
    secondaryActionId: "search",
    secondaryActionLabel: "Add one more related source",
  };
}
