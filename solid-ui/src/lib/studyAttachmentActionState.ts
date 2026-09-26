// @locs-version: 1.0
import type { AttachmentGroundingEvidence } from "./attachmentGroundingEvidence";

export type StudyAttachmentActionState = {
  fileActionLabel: string | null;
  graphActionLabel: string | null;
};

function hasAcademicContext(evidence: AttachmentGroundingEvidence): boolean {
  return evidence.sourceDescriptors.some((descriptor) => (
    Boolean(descriptor.academicKind)
    || Boolean(descriptor.academicSummary)
    || Boolean(descriptor.courseTag)
    || Boolean(descriptor.unitTag)
    || Boolean(descriptor.chapterTag)
    || Boolean(descriptor.weekTag)
    || Boolean(descriptor.lectureTag)
    || Boolean(descriptor.zettelkastenStage)
  ));
}

export function buildStudyAttachmentActionState(
  evidence: AttachmentGroundingEvidence | null,
): StudyAttachmentActionState {
  if (!evidence) {
    return {
      fileActionLabel: null,
      graphActionLabel: null,
    };
  }

  const academicContext = hasAcademicContext(evidence);
  const isZettelkasten = evidence.knowledgeMode === "zettelkasten";
  const isConnectedNotes = evidence.knowledgeMode === "connected_notes";
  const isStudyPack = evidence.sourceCount > 1;

  const fileActionLabel =
    evidence.retentionMode === "keep_nothing"
      ? null
      : evidence.retentionMode === "keep_file"
        ? isZettelkasten
          ? "Browse saved source notes"
          : isConnectedNotes && isStudyPack
            ? "Browse saved study pack"
            : academicContext
              ? "Browse saved study files"
              : "Browse saved files"
        : isZettelkasten
          ? "Browse extracted source notes"
          : isConnectedNotes && isStudyPack
            ? "Browse extracted study pack"
            : academicContext
              ? "Browse extracted study notes"
              : "Browse extracted notes";

  const graphActionLabel =
    isZettelkasten
      ? isStudyPack
        ? "Inspect note chains"
        : "Open note chain"
      : isStudyPack
        ? "Inspect strongest links"
        : academicContext
          ? "Open related study graph"
          : "Open knowledge graph";

  return {
    fileActionLabel,
    graphActionLabel,
  };
}
