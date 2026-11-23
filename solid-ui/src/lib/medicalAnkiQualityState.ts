// @locs-version: 1.0
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";

export type MedicalAnkiQualityState = {
  hasQualitySignal: boolean;
  shallowFirstOrderCount: number;
  hasShallowUpgradeAction: boolean;
  hasReviewOverloadSignal: boolean;
  labels: string[];
  searchTerms: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

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

export function buildMedicalAnkiQualityState(artifact: StudyReportArtifact): MedicalAnkiQualityState {
  const text = artifactText(artifact);
  const isMedicalRecall = artifact.academicKind === "medical_cloze_vignette"
    || /\bmedical\b/i.test(text) && /\b(cloze|vignette|anki|qbank|reasoning_order)\b/i.test(text);
  if (!isMedicalRecall) {
    return {
      hasQualitySignal: false,
      shallowFirstOrderCount: 0,
      hasShallowUpgradeAction: false,
      hasReviewOverloadSignal: false,
      labels: [],
      searchTerms: [],
    };
  }

  const firstOrderCount = text.match(/\breasoning_order\s*[:=]\s*first_order\b/gi)?.length ?? 0;
  const shallowFlagCount = text.match(/\bquality_flag\s*[:=]\s*(?:shallow|first_order|needs_application|needs_vignette)\b/gi)?.length ?? 0;
  const shallowFirstOrderCount = firstOrderCount + shallowFlagCount;
  const hasShallowUpgradeAction = shallowFirstOrderCount > 0
    || /\bmedical shallow first-order card upgrade\b|\bquality_action:upgrade_first_order\b|\bupgrade shallow first-order\b/i.test(text);
  const hasReviewOverloadSignal = /\breview overload\b|\bbloat control\b|\bdeck load\b|\btoo many generated rows\b|\breduce review load\b/i.test(text)
    || (artifact.structuredItemCount ?? 0) >= 120;

  const labels = uniqueStrings([
    hasShallowUpgradeAction ? "Medical shallow-card upgrade" : null,
    shallowFirstOrderCount > 0 ? `${shallowFirstOrderCount} shallow first-order signal${shallowFirstOrderCount === 1 ? "" : "s"}` : null,
    hasReviewOverloadSignal ? "Medical review-load control" : null,
  ]);
  const searchTerms = uniqueStrings([
    ...labels,
    hasShallowUpgradeAction ? "medical_shallow_card_upgrade" : null,
    hasShallowUpgradeAction ? "quality_action:upgrade_first_order" : null,
    hasShallowUpgradeAction ? "first_order shallow needs_application needs_vignette card quality" : null,
    hasReviewOverloadSignal ? "review overload reduce review load bloat control deck load" : null,
  ]);

  return {
    hasQualitySignal: labels.length > 0,
    shallowFirstOrderCount,
    hasShallowUpgradeAction,
    hasReviewOverloadSignal,
    labels,
    searchTerms,
  };
}
