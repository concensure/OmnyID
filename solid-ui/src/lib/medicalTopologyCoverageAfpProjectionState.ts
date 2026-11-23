// @locs-version: 1.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import { buildMedicalTopologySearchState } from "@/lib/medicalAnkiStudyState";
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";

export const MEDICAL_TOPOLOGY_COVERAGE_AFP_PROJECTIONS_KEY = "omnyid.medical-topology-coverage-afp-projections";

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

function projectionId(artifact: StudyReportArtifact): string {
  return `afp-medical-topology-coverage:${artifact.id}`;
}

function threadId(artifact: StudyReportArtifact): string {
  return `medical_topology_coverage:${artifact.id}`;
}

function topologyTags(artifact: StudyReportArtifact): string[] {
  const topology = buildMedicalTopologySearchState(artifact);
  return unique([
    "medical_topology_coverage",
    "medical_cloze_vignette",
    artifact.courseTag,
    artifact.unitTag,
    artifact.chapterTag,
    ...topology.labels.filter((label) =>
      label === "Needs source locator"
      || label === "Source-only topology gap"
      || label === "Review overload topology gap"
      || /^(system|condition|pathophys|pharm|presentation|investigation|management|complication|contraindication)(:|$)/i.test(label)
      || /^\d+ source locators?$/i.test(label)
    ),
  ]);
}

function topologyMetadata(artifact: StudyReportArtifact): Record<string, unknown> | null {
  const topology = buildMedicalTopologySearchState(artifact);
  if (topology.labels.length === 0) return null;
  const linkTags = topologyTags(artifact);
  return {
    origin: "study_report_artifact",
    projection: "medical_topology_coverage_to_afp_knowledge_card",
    knowledge_mode: "connected_notes",
    knowledge_graph_seed: true,
    knowledge_graph_group_key: artifact.id,
    knowledge_graph_link_tags: linkTags,
    academic_kind: "medical_cloze_vignette",
    academic_course_tag: clean(artifact.courseTag),
    academic_unit_tag: clean(artifact.unitTag),
    academic_chapter_tag: clean(artifact.chapterTag),
    report_kind: clean(artifact.reportKind),
    output_format: clean(artifact.outputFormat),
    source_artifact_id: artifact.id,
    topology_labels: topology.labels,
    needs_source_locator: topology.labels.includes("Needs source locator"),
    searchable_terms: unique([
      "medical",
      "topology",
      "coverage",
      "cloze",
      "vignette",
      artifact.courseTag,
      artifact.unitTag,
      artifact.chapterTag,
      artifact.reportKind,
      artifact.outputFormat,
      ...topology.searchTerms,
      ...artifact.sourceLabels,
    ]),
  };
}

export function medicalTopologyCoverageArtifactToAfpMessage(
  artifact: StudyReportArtifact,
  nowIso = new Date().toISOString(),
): AfpMessage | null {
  const topology = buildMedicalTopologySearchState(artifact);
  if (topology.labels.length === 0) return null;
  const metadata = topologyMetadata(artifact);
  if (!metadata) return null;
  const scope = unique([artifact.courseTag, artifact.unitTag, artifact.chapterTag]).join(" - ");
  const needsLocator = topology.labels.includes("Needs source locator");
  return {
    id: projectionId(artifact),
    thread_id: threadId(artifact),
    from: "system://study-lens",
    to: ["agent://study", "agent://knowledge-graph"],
    timestamp: nowIso,
    type: "knowledge_card",
    kind: "knowledge_card",
    subtype: "medical_topology_coverage",
    supertags: topologyTags(artifact),
    content: {
      kind: "medical_topology_coverage",
      title: `Medical topology coverage: ${artifact.title}`,
      summary: [
        "Saved medical topology coverage evidence projected from a study output.",
        scope ? `Scope: ${scope}.` : null,
        needsLocator
          ? "Source-locator gap is visible; do not treat this output as fully grounded until locators are added."
          : "Source-locator evidence is present; preserve it in cloze, vignette, and attempt follow-up.",
      ].filter(Boolean).join(" "),
      topology_labels: topology.labels,
      academic_course_tag: clean(artifact.courseTag),
      academic_unit_tag: clean(artifact.unitTag),
      academic_chapter_tag: clean(artifact.chapterTag),
      report_kind: clean(artifact.reportKind),
      output_format: clean(artifact.outputFormat),
      source_artifact_id: artifact.id,
      source_labels: artifact.sourceLabels,
    },
    metadata,
    views: [
      {
        format: "study",
        content: {
          title: `Medical topology coverage: ${artifact.title}`,
          academic_kind: "medical_cloze_vignette",
          academic_scope: scope,
          next_action: needsLocator
            ? "Add or preserve page, slide, heading, timestamp, or chunk locators before claiming source-grounded coverage."
            : "Use this coverage node to choose gap cards, attempt evidence, review-load reduction, or timed vignette practice.",
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
          projection: "medical_topology_coverage",
          needs_source_locator: needsLocator,
        },
      },
    ],
  };
}

export function medicalTopologyCoverageArtifactToAfpSendInput(
  artifact: StudyReportArtifact,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput | null {
  const message = medicalTopologyCoverageArtifactToAfpMessage(artifact, nowIso);
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

export function loadMedicalTopologyCoverageAfpProjectionIds(storage: Storage = localStorage): string[] {
  const raw = storage.getItem(MEDICAL_TOPOLOGY_COVERAGE_AFP_PROJECTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
  } catch {
    storage.removeItem(MEDICAL_TOPOLOGY_COVERAGE_AFP_PROJECTIONS_KEY);
    return [];
  }
}

export function hasSentMedicalTopologyCoverageAfpProjection(artifactId: string, storage: Storage = localStorage): boolean {
  return loadMedicalTopologyCoverageAfpProjectionIds(storage).includes(artifactId);
}

export function markMedicalTopologyCoverageAfpProjectionSent(artifactId: string, storage: Storage = localStorage): void {
  const cleanId = artifactId.trim();
  if (!cleanId) return;
  const next = [...new Set([cleanId, ...loadMedicalTopologyCoverageAfpProjectionIds(storage)])].slice(0, 300);
  storage.setItem(MEDICAL_TOPOLOGY_COVERAGE_AFP_PROJECTIONS_KEY, JSON.stringify(next));
}

export function unmarkMedicalTopologyCoverageAfpProjectionSent(artifactId: string, storage: Storage = localStorage): void {
  const cleanId = artifactId.trim();
  if (!cleanId) return;
  const next = loadMedicalTopologyCoverageAfpProjectionIds(storage).filter((id) => id !== cleanId);
  if (next.length > 0) storage.setItem(MEDICAL_TOPOLOGY_COVERAGE_AFP_PROJECTIONS_KEY, JSON.stringify(next));
  else storage.removeItem(MEDICAL_TOPOLOGY_COVERAGE_AFP_PROJECTIONS_KEY);
}
