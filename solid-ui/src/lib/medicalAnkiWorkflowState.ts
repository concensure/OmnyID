// @locs-version: 1.0
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";

export type MedicalAnkiWorkflowKind =
  | "graph_gap_cloze_deck"
  | "vignette_block";

export type MedicalAnkiWorkflowState = {
  workflowKind: MedicalAnkiWorkflowKind | null;
  labels: string[];
  searchTerms: string[];
  focusBadges: string[];
};

function artifactText(artifact: StudyReportArtifact): string {
  return [
    artifact.title,
    artifact.filename,
    artifact.markdown,
    artifact.academicKind,
    artifact.reportKind,
    artifact.outputFormat,
    artifact.courseTag,
    artifact.unitTag,
    artifact.chapterTag,
    ...artifact.sourceLabels,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join("\n");
}

export function buildMedicalAnkiWorkflowState(artifact: StudyReportArtifact): MedicalAnkiWorkflowState {
  const text = artifactText(artifact);
  const isMedicalRecall = artifact.academicKind === "medical_cloze_vignette"
    || /\bmedical\b/i.test(text) && /\b(cloze|vignette|anki|qbank|concept graph)\b/i.test(text);
  if (!isMedicalRecall) {
    return { workflowKind: null, labels: [], searchTerms: [], focusBadges: [] };
  }

  const isGraphGapDeck = /\bmedical graph-gap cloze deck queue\b|\bmedical_gap_cloze_deck\b|\bgraph gaps\b/i.test(text)
    && /\b(cloze|anki-compatible|flashcard)\b/i.test(text);
  const isVignetteBlock = /\bmedical vignette block queue\b|\bmedical_vignette_block\b|\bvignette block from concept graph\b/i.test(text);
  const workflowKind: MedicalAnkiWorkflowKind | null = isGraphGapDeck
    ? "graph_gap_cloze_deck"
    : isVignetteBlock
      ? "vignette_block"
      : null;

  if (!workflowKind) return { workflowKind: null, labels: [], searchTerms: [], focusBadges: [] };

  return {
    workflowKind,
    labels: workflowKind === "graph_gap_cloze_deck"
      ? ["Medical graph-gap cloze deck"]
      : ["Medical vignette block"],
    searchTerms: workflowKind === "graph_gap_cloze_deck"
      ? ["medical_gap_cloze_deck", "medical graph-gap cloze deck", "graph gaps", "anki-compatible cloze rows"]
      : ["medical_vignette_block", "medical vignette block", "concept graph vignette", "clinical application questions"],
    focusBadges: workflowKind === "graph_gap_cloze_deck"
      ? ["medical_workflow:graph_gap_cloze_deck", "medical_gap_cloze_deck"]
      : ["medical_workflow:vignette_block", "medical_vignette_block"],
  };
}
