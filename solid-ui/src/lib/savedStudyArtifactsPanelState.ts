// @locs-version: 1.0
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";
import {
  buildStudyArtifactFilterChips,
  type StudyArtifactFilterChip,
} from "@/lib/studyArtifactSearchIndexState";
import {
  buildStudyArtifactSearchResults,
  type StudyArtifactSearchResult,
} from "@/lib/studyArtifactSearchResultState";
import type { MedicalFactVerificationRecord } from "@/lib/medicalFactVerificationState";
import {
  buildMedicalFactVerificationResults,
  type MedicalFactVerificationResult,
} from "@/lib/medicalFactVerificationResultState";

export type SavedStudyArtifactsPanelState = {
  query: string;
  resultLimit: number;
  totalCount: number;
  resultCount: number;
  hiddenCount: number;
  hasQuery: boolean;
  hasNoMatches: boolean;
  summaryLabel: string;
  emptyTitle: string | null;
  emptyDetail: string | null;
  results: StudyArtifactSearchResult[];
  filterChips: StudyArtifactFilterChip[];
  medicalFactVerificationTotalCount: number;
  medicalFactVerificationResultCount: number;
  medicalFactVerificationResults: MedicalFactVerificationResult[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedLimit(limit: number | null | undefined): number {
  return typeof limit === "number" && Number.isFinite(limit)
    ? Math.max(1, Math.floor(limit))
    : 5;
}

export function buildSavedStudyArtifactsPanelState(input: {
  artifacts: readonly StudyReportArtifact[];
  medicalFactVerifications?: readonly MedicalFactVerificationRecord[] | null;
  query?: string | null;
  showAll?: boolean;
  previewLimit?: number | null;
  fullLimit?: number | null;
}): SavedStudyArtifactsPanelState {
  const query = clean(input.query);
  const previewLimit = normalizedLimit(input.previewLimit);
  const fullLimit = normalizedLimit(input.fullLimit ?? 20);
  const resultLimit = input.showAll ? fullLimit : previewLimit;
  const fullResults = buildStudyArtifactSearchResults(input.artifacts, query, fullLimit);
  const medicalFactVerificationRecords = input.medicalFactVerifications ?? [];
  const fullMedicalFactVerificationResults = buildMedicalFactVerificationResults(
    medicalFactVerificationRecords,
    query,
    fullLimit,
  );
  const results = fullResults.slice(0, resultLimit);
  const remainingResultSlots = Math.max(0, resultLimit - results.length);
  const medicalFactVerificationResults = fullMedicalFactVerificationResults.slice(0, remainingResultSlots);
  const fullEvidenceCount = fullResults.length + fullMedicalFactVerificationResults.length;
  const visibleEvidenceCount = results.length + medicalFactVerificationResults.length;
  const totalEvidenceCount = input.artifacts.length + medicalFactVerificationRecords.length;
  const hasQuery = query.length > 0;
  const hasNoMatches = hasQuery
    && (input.artifacts.length > 0 || medicalFactVerificationRecords.length > 0)
    && fullResults.length === 0
    && fullMedicalFactVerificationResults.length === 0;

  return {
    query,
    resultLimit,
    totalCount: input.artifacts.length,
    resultCount: results.length,
    hiddenCount: Math.max(0, fullEvidenceCount - visibleEvidenceCount),
    hasQuery,
    hasNoMatches,
    summaryLabel: hasQuery
      ? `${fullEvidenceCount}/${totalEvidenceCount} matched`
      : `${totalEvidenceCount} saved`,
    emptyTitle: hasNoMatches ? "No saved reports match this search." : null,
    emptyDetail: hasNoMatches
      ? "Try a report type, course tag, chapter, unit, source filename, answer policy, export target, or keyword from the output."
      : null,
    results,
    filterChips: buildStudyArtifactFilterChips(input.artifacts),
    medicalFactVerificationTotalCount: medicalFactVerificationRecords.length,
    medicalFactVerificationResultCount: medicalFactVerificationResults.length,
    medicalFactVerificationResults,
  };
}
