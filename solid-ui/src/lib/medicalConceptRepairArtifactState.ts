// @locs-version: 1.0
import { MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND } from "@/lib/medicalAnkiStudyState";
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";

export type MedicalConceptRepairArtifactState = {
  isMedicalConceptRepair: boolean;
  repairKind: "missed_topic_repair" | "concept_edge_repair" | null;
  relationshipIds: string[];
  scoreBands: Array<"weak" | "unattempted" | "solid">;
  labels: string[];
  searchTerms: string[];
};

function unique(values: readonly (string | null | undefined)[], limit = 12): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = value?.trim();
    const key = item?.toLowerCase();
    if (!item || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function extractRelationshipIds(text: string): string[] {
  const ids = new Set<string>();
  const patterns = [
    /\brelationship_id:\s*([^|\n]+)/gi,
    /\bmedical_edge:([^\s|,\n]+)/gi,
    /\bknowledge_graph_group_key:\s*([^|\n]+)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[1]?.trim();
      if (value) ids.add(value);
    }
  }
  return [...ids].slice(0, 8);
}

function extractScoreBands(text: string): Array<"weak" | "unattempted" | "solid"> {
  const bands = new Set<"weak" | "unattempted" | "solid">();
  for (const match of text.matchAll(/\bscore_band:(weak|unattempted|solid)\b/gi)) {
    const band = match[1]?.toLowerCase();
    if (band === "weak" || band === "unattempted" || band === "solid") bands.add(band);
  }
  if (/\bbelow 70%|\bweak concept edge|\bweak or unattempted concept edge/i.test(text)) bands.add("weak");
  if (/\bnot attempted yet|\bunattempted concept edge/i.test(text)) bands.add("unattempted");
  return [...bands];
}

export function buildMedicalConceptRepairArtifactState(
  artifact: StudyReportArtifact,
): MedicalConceptRepairArtifactState {
  const text = [
    artifact.title,
    artifact.filename,
    artifact.markdown,
    artifact.academicKind,
    artifact.courseTag,
    artifact.unitTag,
    artifact.chapterTag,
    ...artifact.sourceLabels,
  ].filter(Boolean).join("\n");
  const isMedical = artifact.academicKind === MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND
    || /\bmedical_cloze_vignette|medical concept-edge|medical_edge_attempt|medical_concept_edge_review\b/i.test(text);
  const isMissedTopicRepair = /\bmedical missed-topic repair queue|missed_topic:|medical_missed_question_topics\b/i.test(text);
  const isConceptEdgeRepair = /\bmedical concept-edge repair queue|medical concept-edge review|medical_edge_attempt|medical_edge:|medical_concept_edge_review\b/i.test(text);
  const repairKind: MedicalConceptRepairArtifactState["repairKind"] = !isMedical
    ? null
    : isConceptEdgeRepair
      ? "concept_edge_repair"
      : isMissedTopicRepair
        ? "missed_topic_repair"
        : null;
  const relationshipIds = repairKind === "concept_edge_repair" ? extractRelationshipIds(text) : [];
  const scoreBands = repairKind === "concept_edge_repair" ? extractScoreBands(text) : [];
  const labels = unique([
    repairKind === "concept_edge_repair" ? "Medical concept-edge repair" : null,
    repairKind === "missed_topic_repair" ? "Medical missed-topic repair" : null,
    ...scoreBands.map((band) => `score band:${band}`),
    ...relationshipIds.map((id) => `relationship:${id}`),
  ]);
  const searchTerms = unique([
    repairKind ?? null,
    repairKind === "concept_edge_repair" ? "medical_concept_edge_repair" : null,
    repairKind === "missed_topic_repair" ? "medical_missed_topic_repair" : null,
    "medical repair",
    ...scoreBands.map((band) => `score_band:${band}`),
    ...relationshipIds,
  ]);

  return {
    isMedicalConceptRepair: repairKind !== null,
    repairKind,
    relationshipIds,
    scoreBands,
    labels,
    searchTerms,
  };
}
