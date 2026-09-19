// @locs-version: 2.0
import type { WeddingDecisionInput } from "@/lib/weddingKnowledgeGraphState";
import type { WeddingPersistedDecisionRecord } from "@/lib/weddingPersistedWorkspaceState";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function usableSourceUrls(values: readonly unknown[] | null | undefined): string[] {
  return (values ?? [])
    .map((value) => clean(value))
    .filter((value) => /^https?:\/\//i.test(value));
}

function privateImportSourceUrl(value: string): boolean {
  return /\b(?:upload|uploads|attachment|attachments|storage|parser|source-file|source_file)\b/i.test(value)
    || /\b[^/?#]+\.(?:csv|tsv|xlsx?|ods)(?:$|[?#/])/i.test(value);
}

function importedPrivateLabel(value: string): boolean {
  return /^wedding_import(?:$|:)/i.test(value)
    || /original upload/i.test(value)
    || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(value)
    || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value)
    || /\b[^,\s]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value);
}

function isImportedPrivateDecision(record: WeddingPersistedDecisionRecord): boolean {
  return [
    record.artifactId,
    record.artifactTitle,
    ...(record.sourceLabels ?? []),
    ...(record.metadataLabels ?? []),
  ].map(clean).some(importedPrivateLabel);
}

function artifactTitleForGraph(record: WeddingPersistedDecisionRecord): string {
  return isImportedPrivateDecision(record) ? "Imported private planning file" : record.artifactTitle;
}

function sourceLabelsForGraph(record: WeddingPersistedDecisionRecord): string[] {
  const sourceLabels = record.sourceLabels ?? [];
  if (!isImportedPrivateDecision(record)) return [...sourceLabels];
  return sourceLabels.length > 0 ? ["Imported private planning file"] : [];
}

function sourceUrlsForGraph(record: WeddingPersistedDecisionRecord): string[] {
  const sourceUrls = usableSourceUrls(record.sourceUrls);
  if (!isImportedPrivateDecision(record)) return sourceUrls;
  return sourceUrls.filter((url) => !privateImportSourceUrl(url));
}

export function weddingPersistedDecisionRecordsToGraphDecisions(
  records?: readonly WeddingPersistedDecisionRecord[] | null,
): WeddingDecisionInput[] {
  return (records ?? []).flatMap((record): WeddingDecisionInput[] => {
    const id = clean(record.id);
    const label = clean(record.selectedOptionLabel);
    const artifactId = clean(record.artifactId);
    if (!id || !label || !artifactId) return [];
    const artifactKind = clean(record.artifactKind) || "planning file";
    return [{
      id,
      title: `Selected ${artifactKind.replace(/_/g, " ")}: ${label}`,
      status: "decided",
      sourceArtifactId: artifactId,
      selectedOptionId: clean(record.selectedOptionId) || null,
      selectedOptionLabel: label,
      selectedOptionDetail: clean(record.selectedOptionDetail) || null,
      constrains: [],
      requiresApproval: false,
      metadata: {
        decision_source: "persisted_wedding_decision_selection",
        artifact_id: artifactId,
        artifact_title: artifactTitleForGraph(record),
        artifact_kind: record.artifactKind,
        selected_option_id: record.selectedOptionId,
        selected_option_label: record.selectedOptionLabel,
        selected_option_detail: record.selectedOptionDetail,
        source_labels: sourceLabelsForGraph(record),
        source_urls: sourceUrlsForGraph(record),
        source_provider_labels: record.sourceProviderLabels ?? [],
        created_at: record.createdAt,
      },
    }];
  });
}
