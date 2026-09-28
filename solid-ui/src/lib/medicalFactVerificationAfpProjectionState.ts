// @locs-version: 1.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { MedicalFactVerificationRecord } from "@/lib/medicalFactVerificationState";

export const MEDICAL_FACT_VERIFICATION_AFP_PROJECTIONS_KEY = "omnyid.medical-fact-verification-afp-projections";

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

function projectionId(record: MedicalFactVerificationRecord): string {
  return `afp-medical-fact-verification:${record.id}`;
}

function threadId(record: MedicalFactVerificationRecord): string {
  return `medical_fact_verification:${record.id}`;
}

function titleForRecord(record: MedicalFactVerificationRecord): string {
  return record.targetText.length > 80
    ? `${record.targetText.slice(0, 77).trimEnd()}...`
    : record.targetText;
}

function supertagsForRecord(record: MedicalFactVerificationRecord): string[] {
  return unique([
    "medical_fact_verification",
    "medical_study_verification",
    `verification_status:${record.status}`,
    `confidence:${record.confidenceLabel}`,
    `verification_depth:${record.verificationDepth}`,
    record.targetKind === "image" ? "source:image_ocr" : "source:passage",
    ...record.scopeLabels,
    ...record.flags.map((flag) => `verification_flag:${flag.toLowerCase().replace(/[^a-z0-9:_-]+/g, "_")}`),
    ...record.sourceEvidence.map((source) => `source_tier:${source.tier}`),
  ]);
}

function metadataForRecord(record: MedicalFactVerificationRecord): Record<string, unknown> {
  const linkTags = unique([
    "medical_fact_verification",
    `verification_status:${record.status}`,
    `confidence:${record.confidenceLabel}`,
    `verification_depth:${record.verificationDepth}`,
    ...record.scopeLabels,
    ...record.sourceEvidence.map((source) => `source_tier:${source.tier}`),
  ]);
  return {
    origin: "medical_fact_verification",
    projection: "medical_fact_verification_to_afp_knowledge_card",
    knowledge_mode: "connected_notes",
    knowledge_graph_seed: true,
    knowledge_graph_group_key: record.id,
    knowledge_graph_link_tags: linkTags,
    academic_kind: "medical_cloze_vignette",
    medical_fact_verification_status: record.status,
    medical_fact_confidence_score: record.confidenceScore,
    medical_fact_confidence_label: record.confidenceLabel,
    medical_fact_verification_depth: record.verificationDepth,
    medical_fact_target_kind: record.targetKind,
    medical_fact_target_hash: record.targetHash,
    medical_fact_source_count: record.sourceEvidence.length,
    medical_fact_flags: record.flags,
    manual_reviewer: clean(record.manualReviewer),
    verified_at: record.verifiedAt,
    searchable_terms: unique([
      "medical",
      "fact verification",
      "verified fact",
      record.targetText,
      record.summary,
      record.status,
      record.confidenceLabel,
      record.verificationDepth,
      ...record.scopeLabels,
      ...record.flags,
      ...record.sourceEvidence.flatMap((source) => [
        source.label,
        source.tier,
        source.locator,
        source.year ? String(source.year) : null,
        source.supportsClaim ? "supports claim" : "conflicts with claim",
      ]),
    ]),
  };
}

export function medicalFactVerificationToAfpMessage(
  record: MedicalFactVerificationRecord,
  nowIso = new Date().toISOString(),
): AfpMessage {
  const title = titleForRecord(record);
  const scope = record.scopeLabels.join(" - ");
  return {
    id: projectionId(record),
    thread_id: threadId(record),
    from: "system://study-lens",
    to: ["agent://study", "agent://knowledge-graph"],
    timestamp: nowIso,
    type: "knowledge_card",
    kind: "knowledge_card",
    subtype: "medical_fact_verification",
    supertags: supertagsForRecord(record),
    content: {
      kind: "medical_fact_verification",
      title,
      summary: [
        `Medical fact verification recorded as ${record.status.replace(/_/g, " ")} with ${record.confidenceLabel} confidence (${record.confidenceScore}/100).`,
        scope ? `Scope: ${scope}.` : null,
        record.sourceEvidence.length > 0 ? `Sources checked: ${record.sourceEvidence.length}.` : "No source evidence recorded.",
        record.flags.length > 0 ? `Flags: ${record.flags.join("; ")}.` : null,
        record.summary,
        "Use this as study verification evidence, not as patient-specific medical advice.",
      ].filter(Boolean).join(" "),
      target_text: record.targetText,
      target_kind: record.targetKind,
      status: record.status,
      confidence_score: record.confidenceScore,
      confidence_label: record.confidenceLabel,
      verification_depth: record.verificationDepth,
      source_count: record.sourceEvidence.length,
      flags: record.flags,
      scope_labels: record.scopeLabels,
      manual_reviewer: clean(record.manualReviewer),
      verified_at: record.verifiedAt,
    },
    metadata: metadataForRecord(record),
    views: [
      {
        format: "study",
        content: {
          title,
          academic_kind: "medical_cloze_vignette",
          verification_status: record.status,
          confidence: `${record.confidenceLabel} (${record.confidenceScore}/100)`,
          source_count: record.sourceEvidence.length,
          next_action: record.status === "needs_review"
            ? "Run a standard or manual verification before converting this fact into exam-critical cards."
            : "Reuse this verified fact as source-aware study evidence.",
        },
      },
    ],
    attachments: [],
    references: [
      {
        type: "medical_fact_verification",
        target: record.id,
        label: title,
        metadata: {
          status: record.status,
          confidence_score: record.confidenceScore,
          target_hash: record.targetHash,
        },
      },
      ...record.sourceEvidence.slice(0, 6).map((source) => ({
        type: "medical_verification_source",
        target: source.label,
        label: source.locator ? `${source.label} (${source.locator})` : source.label,
        metadata: {
          tier: source.tier,
          locator: clean(source.locator),
          year: source.year,
          supports_claim: source.supportsClaim,
        },
      })),
    ],
  };
}

export function medicalFactVerificationToAfpSendInput(
  record: MedicalFactVerificationRecord,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput {
  const message = medicalFactVerificationToAfpMessage(record, nowIso);
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

export function loadMedicalFactVerificationAfpProjectionIds(storage: Storage = localStorage): string[] {
  const raw = storage.getItem(MEDICAL_FACT_VERIFICATION_AFP_PROJECTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
  } catch {
    storage.removeItem(MEDICAL_FACT_VERIFICATION_AFP_PROJECTIONS_KEY);
    return [];
  }
}

export function hasSentMedicalFactVerificationAfpProjection(recordId: string, storage: Storage = localStorage): boolean {
  return loadMedicalFactVerificationAfpProjectionIds(storage).includes(recordId);
}

export function markMedicalFactVerificationAfpProjectionSent(recordId: string, storage: Storage = localStorage): void {
  const cleanId = recordId.trim();
  if (!cleanId) return;
  const next = [...new Set([cleanId, ...loadMedicalFactVerificationAfpProjectionIds(storage)])].slice(0, 400);
  storage.setItem(MEDICAL_FACT_VERIFICATION_AFP_PROJECTIONS_KEY, JSON.stringify(next));
}

export function unmarkMedicalFactVerificationAfpProjectionSent(recordId: string, storage: Storage = localStorage): void {
  const cleanId = recordId.trim();
  if (!cleanId) return;
  const next = loadMedicalFactVerificationAfpProjectionIds(storage).filter((id) => id !== cleanId);
  if (next.length > 0) storage.setItem(MEDICAL_FACT_VERIFICATION_AFP_PROJECTIONS_KEY, JSON.stringify(next));
  else storage.removeItem(MEDICAL_FACT_VERIFICATION_AFP_PROJECTIONS_KEY);
}
