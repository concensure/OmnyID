// @locs-version: 1.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import {
  buildMedicalAnkiWorkflowState,
  type MedicalAnkiWorkflowKind,
} from "@/lib/medicalAnkiWorkflowState";
import {
  buildMedicalTrustedReferenceArtifactState,
  medicalDetailZoomLabel,
} from "@/lib/medicalTrustedReferenceState";
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";

export const MEDICAL_ANKI_WORKFLOW_AFP_PROJECTIONS_KEY = "omnyid.medical-anki-workflow-afp-projections";

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function unique(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item?.toLowerCase();
    if (!item || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function workflowLabel(kind: MedicalAnkiWorkflowKind): string {
  return kind === "graph_gap_cloze_deck" ? "Medical graph-gap cloze deck" : "Medical vignette block";
}

function projectionId(artifact: StudyReportArtifact): string {
  return `afp-medical-anki-workflow:${artifact.id}`;
}

function threadId(artifact: StudyReportArtifact): string {
  return `medical_anki_workflow:${artifact.id}`;
}

function workflowSupertags(artifact: StudyReportArtifact, workflowKind: MedicalAnkiWorkflowKind): string[] {
  const trustedReference = buildMedicalTrustedReferenceArtifactState(artifact);
  return unique([
    "medical_anki_workflow",
    workflowKind === "graph_gap_cloze_deck" ? "medical_gap_cloze_deck" : "medical_vignette_block",
    "medical_cloze_vignette",
    trustedReference.hasMedicalTrustedReferenceSignal ? "medical_trusted_grounding" : null,
    trustedReference.hasMedicalTrustedReferenceSignal ? `detail_zoom:${trustedReference.detailZoom}` : null,
    trustedReference.usesTrustedReferenceSupport ? "trusted_reference:supported" : null,
    trustedReference.usesStudentSourcePrimaryRule ? "trusted_reference:student_source_primary" : null,
    trustedReference.restrictsClinicalDatasetUse ? "trusted_reference:clinical_dataset_restricted" : null,
    artifact.courseTag,
    artifact.unitTag,
    artifact.chapterTag,
    artifact.reportKind ? `report:${artifact.reportKind}` : null,
    artifact.outputFormat ? `output:${artifact.outputFormat}` : null,
  ]);
}

function workflowMetadata(artifact: StudyReportArtifact, workflowKind: MedicalAnkiWorkflowKind): Record<string, unknown> {
  const trustedReference = buildMedicalTrustedReferenceArtifactState(artifact);
  const graphLinkTags = unique([
    "medical_cloze_vignette",
    workflowKind === "graph_gap_cloze_deck" ? "medical_gap_cloze_deck" : "medical_vignette_block",
    trustedReference.hasMedicalTrustedReferenceSignal ? "medical_trusted_grounding" : null,
    trustedReference.hasMedicalTrustedReferenceSignal ? `detail_zoom:${trustedReference.detailZoom}` : null,
    trustedReference.usesTrustedReferenceSupport ? "trusted_reference:supported" : null,
    trustedReference.usesStudentSourcePrimaryRule ? "trusted_reference:student_source_primary" : null,
    trustedReference.restrictsClinicalDatasetUse ? "trusted_reference:clinical_dataset_restricted" : null,
    artifact.courseTag,
    artifact.unitTag,
    artifact.chapterTag,
  ]);
  return {
    origin: "study_report_artifact",
    projection: "medical_anki_workflow_to_afp_knowledge_card",
    knowledge_mode: "connected_notes",
    knowledge_graph_seed: true,
    knowledge_graph_group_key: artifact.id,
    knowledge_graph_link_tags: graphLinkTags,
    academic_kind: "medical_cloze_vignette",
    academic_course_tag: clean(artifact.courseTag),
    academic_unit_tag: clean(artifact.unitTag),
    academic_chapter_tag: clean(artifact.chapterTag),
    medical_anki_workflow_kind: workflowKind,
    medical_detail_zoom: trustedReference.hasMedicalTrustedReferenceSignal ? trustedReference.detailZoom : null,
    medical_detail_zoom_label: trustedReference.hasMedicalTrustedReferenceSignal
      ? medicalDetailZoomLabel(trustedReference.detailZoom)
      : null,
    medical_trusted_grounding: trustedReference.hasMedicalTrustedReferenceSignal,
    medical_trusted_reference_supported: trustedReference.usesTrustedReferenceSupport,
    medical_student_source_primary: trustedReference.usesStudentSourcePrimaryRule,
    medical_clinical_dataset_restricted: trustedReference.restrictsClinicalDatasetUse,
    report_kind: clean(artifact.reportKind),
    output_format: clean(artifact.outputFormat),
    source_artifact_id: artifact.id,
    searchable_terms: unique([
      "medical",
      "anki",
      "cloze",
      "vignette",
      workflowKind,
      workflowKind === "graph_gap_cloze_deck" ? "medical_gap_cloze_deck" : "medical_vignette_block",
      trustedReference.hasMedicalTrustedReferenceSignal ? "medical trusted grounding" : null,
      trustedReference.hasMedicalTrustedReferenceSignal ? `detail_zoom:${trustedReference.detailZoom}` : null,
      trustedReference.usesTrustedReferenceSupport ? "trusted reference supported" : null,
      trustedReference.usesStudentSourcePrimaryRule ? "student source primary" : null,
      trustedReference.restrictsClinicalDatasetUse ? "clinical dataset restricted" : null,
      artifact.courseTag,
      artifact.unitTag,
      artifact.chapterTag,
      artifact.reportKind,
      artifact.outputFormat,
      ...artifact.sourceLabels,
    ]),
  };
}

export function medicalAnkiWorkflowArtifactToAfpMessage(
  artifact: StudyReportArtifact,
  nowIso = new Date().toISOString(),
): AfpMessage | null {
  const workflowState = buildMedicalAnkiWorkflowState(artifact);
  if (!workflowState.workflowKind) return null;
  const trustedReference = buildMedicalTrustedReferenceArtifactState(artifact);
  const label = workflowLabel(workflowState.workflowKind);
  const scope = unique([artifact.courseTag, artifact.unitTag, artifact.chapterTag]).join(" - ");
  return {
    id: projectionId(artifact),
    thread_id: threadId(artifact),
    from: "system://study-lens",
    to: ["agent://study", "agent://knowledge-graph"],
    timestamp: nowIso,
    type: "knowledge_card",
    kind: "knowledge_card",
    subtype: "medical_anki_workflow",
    supertags: workflowSupertags(artifact, workflowState.workflowKind),
    content: {
      kind: "medical_anki_workflow",
      title: `${label}: ${artifact.title}`,
      summary: [
        `${label} saved as reusable medical study workflow evidence.`,
        scope ? `Scope: ${scope}.` : null,
        trustedReference.hasMedicalTrustedReferenceSignal
          ? `Trusted grounding: ${medicalDetailZoomLabel(trustedReference.detailZoom)} detail zoom; student source primary=${trustedReference.usesStudentSourcePrimaryRule ? "yes" : "no"}; trusted reference supported=${trustedReference.usesTrustedReferenceSupport ? "yes" : "no"}.`
          : null,
        workflowState.workflowKind === "graph_gap_cloze_deck"
          ? "Use this to continue source-backed graph-gap cloze/vignette generation without duplicating covered cards."
          : "Use this to continue freshly phrased clinical vignette blocks from the same concept graph.",
      ].filter(Boolean).join(" "),
      workflow_kind: workflowState.workflowKind,
      academic_course_tag: clean(artifact.courseTag),
      academic_unit_tag: clean(artifact.unitTag),
      academic_chapter_tag: clean(artifact.chapterTag),
      report_kind: clean(artifact.reportKind),
      output_format: clean(artifact.outputFormat),
      medical_detail_zoom: trustedReference.hasMedicalTrustedReferenceSignal ? trustedReference.detailZoom : null,
      medical_trusted_grounding: trustedReference.hasMedicalTrustedReferenceSignal,
      medical_trusted_reference_supported: trustedReference.usesTrustedReferenceSupport,
      medical_student_source_primary: trustedReference.usesStudentSourcePrimaryRule,
      medical_clinical_dataset_restricted: trustedReference.restrictsClinicalDatasetUse,
      source_artifact_id: artifact.id,
      source_labels: artifact.sourceLabels,
    },
    metadata: workflowMetadata(artifact, workflowState.workflowKind),
    views: [
      {
        format: "study",
        content: {
          title: `${label}: ${artifact.title}`,
          academic_kind: "medical_cloze_vignette",
          workflow_kind: workflowState.workflowKind,
          medical_detail_zoom: trustedReference.hasMedicalTrustedReferenceSignal
            ? medicalDetailZoomLabel(trustedReference.detailZoom)
            : null,
          medical_trusted_grounding: trustedReference.hasMedicalTrustedReferenceSignal,
          academic_scope: scope,
          next_action: workflowState.workflowKind === "graph_gap_cloze_deck"
            ? "Continue graph-gap cloze/vignette generation from retained sources and concept tags."
            : "Run another freshly phrased vignette block from this concept graph.",
        },
      },
    ],
    attachments: [],
    references: [
      {
        type: "study_report_artifact",
        target: artifact.id,
        label: artifact.title,
        metadata: {
          medical_anki_workflow_kind: workflowState.workflowKind,
          proprietary_text_stored: false,
          medical_detail_zoom: trustedReference.hasMedicalTrustedReferenceSignal ? trustedReference.detailZoom : null,
          medical_trusted_grounding: trustedReference.hasMedicalTrustedReferenceSignal,
        },
      },
    ],
  };
}

export function medicalAnkiWorkflowArtifactToAfpSendInput(
  artifact: StudyReportArtifact,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput | null {
  const message = medicalAnkiWorkflowArtifactToAfpMessage(artifact, nowIso);
  if (!message) return null;
  return {
    thread_id: message.thread_id,
    from: message.from,
    to: message.to ?? ["agent://study", "agent://knowledge-graph"],
    timestamp: message.timestamp,
    type: message.type,
    kind: message.kind,
    subtype: message.subtype ?? undefined,
    content: message.content,
    views: message.views,
    attachments: message.attachments,
    references: message.references,
    metadata: message.metadata,
    store_in_relational: true,
  };
}

export function loadMedicalAnkiWorkflowAfpProjectionIds(storage: Storage = localStorage): string[] {
  const raw = storage.getItem(MEDICAL_ANKI_WORKFLOW_AFP_PROJECTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
  } catch {
    storage.removeItem(MEDICAL_ANKI_WORKFLOW_AFP_PROJECTIONS_KEY);
    return [];
  }
}

export function hasSentMedicalAnkiWorkflowAfpProjection(artifactId: string, storage: Storage = localStorage): boolean {
  return loadMedicalAnkiWorkflowAfpProjectionIds(storage).includes(artifactId);
}

export function markMedicalAnkiWorkflowAfpProjectionSent(artifactId: string, storage: Storage = localStorage): void {
  const cleanId = artifactId.trim();
  if (!cleanId) return;
  const next = [...new Set([cleanId, ...loadMedicalAnkiWorkflowAfpProjectionIds(storage)])].slice(0, 300);
  storage.setItem(MEDICAL_ANKI_WORKFLOW_AFP_PROJECTIONS_KEY, JSON.stringify(next));
}

export function unmarkMedicalAnkiWorkflowAfpProjectionSent(artifactId: string, storage: Storage = localStorage): void {
  const cleanId = artifactId.trim();
  if (!cleanId) return;
  const next = loadMedicalAnkiWorkflowAfpProjectionIds(storage).filter((id) => id !== cleanId);
  if (next.length > 0) storage.setItem(MEDICAL_ANKI_WORKFLOW_AFP_PROJECTIONS_KEY, JSON.stringify(next));
  else storage.removeItem(MEDICAL_ANKI_WORKFLOW_AFP_PROJECTIONS_KEY);
}
