// @locs-version: 2.0
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingApprovalState,
  type WeddingArtifactKind,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingExportTarget = "markdown" | "html" | "word_doc" | "browser_pdf" | "csv" | "image_planned" | "bundle_planned";
export type WeddingArtifactEvidenceStatus = "source_linked" | "source_labelled" | "source_unverified";

export type WeddingArtifactSummary = {
  id: string;
  title: string;
  kind: WeddingArtifactKind;
  category: string;
  createdAt: number;
  metadata: WeddingPlanningMetadata;
  exportTargets: WeddingExportTarget[];
  approvalState: WeddingApprovalState;
  sourceLabels: string[];
  sourceLinks: WeddingArtifactSourceLink[];
  locationLabels: string[];
  vendorLabels: string[];
  linkedTaskIds: string[];
  linkedCalendarEventIds: string[];
  searchText: string;
};

export type WeddingArtifactSourceLink = {
  label: string;
  url: string;
};

export type WeddingArtifactInput = {
  id?: string | null;
  title?: string | null;
  kind?: WeddingArtifactKind | null;
  createdAt?: number | null;
  metadata?: unknown;
  exportTargets?: readonly string[] | null;
  sourceLabels?: readonly string[] | null;
  sourceLinks?: readonly WeddingArtifactSourceLink[] | null;
  searchLabels?: readonly string[] | null;
  locationLabels?: readonly string[] | null;
  vendorLabels?: readonly string[] | null;
  linkedTaskIds?: readonly string[] | null;
  linkedCalendarEventIds?: readonly string[] | null;
  bodyText?: string | null;
};

const CATEGORY_LABELS: Record<WeddingArtifactKind, string> = {
  research: "Research",
  vendor_table: "Vendors",
  budget_sheet: "Budget",
  guest_list: "Guests",
  timeline: "Timeline",
  email_draft: "Emails",
  legal: "Legal",
  registry: "Registry",
  map_collection: "Maps",
  decision_log: "Decisions",
};

const DEFAULT_EXPORTS: Record<WeddingArtifactKind, WeddingExportTarget[]> = {
  research: ["markdown", "html", "word_doc", "browser_pdf"],
  vendor_table: ["csv", "html", "browser_pdf"],
  budget_sheet: ["csv", "markdown", "html", "word_doc", "browser_pdf"],
  guest_list: ["csv", "html", "browser_pdf"],
  timeline: ["markdown", "html", "word_doc", "browser_pdf"],
  email_draft: ["markdown", "html", "word_doc"],
  legal: ["markdown", "html", "word_doc", "browser_pdf"],
  registry: ["csv", "markdown", "html", "browser_pdf"],
  map_collection: ["html", "browser_pdf", "image_planned"],
  decision_log: ["markdown", "html", "word_doc", "browser_pdf"],
};

const EXPORT_TARGETS = new Set<WeddingExportTarget>([
  "markdown",
  "html",
  "word_doc",
  "browser_pdf",
  "csv",
  "image_planned",
  "bundle_planned",
]);

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 24): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeSourceLinks(values: readonly WeddingArtifactSourceLink[] | null | undefined): WeddingArtifactSourceLink[] {
  const seen = new Set<string>();
  const result: WeddingArtifactSourceLink[] = [];
  for (const value of values ?? []) {
    const label = clean(value?.label);
    const url = clean(value?.url);
    const key = `${label.toLowerCase()}|${url.toLowerCase()}`;
    if (!label || !/^https?:\/\//i.test(url) || seen.has(key)) continue;
    seen.add(key);
    result.push({ label, url });
    if (result.length >= 12) break;
  }
  return result;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeExportTargets(kind: WeddingArtifactKind, values: readonly string[] | null | undefined): WeddingExportTarget[] {
  const explicit = uniqueStrings(values ?? [])
    .filter((value): value is WeddingExportTarget => EXPORT_TARGETS.has(value as WeddingExportTarget));
  return explicit.length > 0 ? explicit : DEFAULT_EXPORTS[kind];
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isWeddingImportArtifactInput(input: WeddingArtifactInput, metadata: WeddingPlanningMetadata): boolean {
  const rawMetadata = metadataRecord(input.metadata);
  return metadata.supertags.some((tag) => /^wedding_import(?:$|:)/i.test(tag))
    || clean(input.id).startsWith("wedding_import:")
    || uniqueStrings([
      ...(input.sourceLabels ?? []),
      ...(input.searchLabels ?? []),
      clean(rawMetadata.originalUploadStatus ?? rawMetadata.original_upload_status),
      clean(rawMetadata.originalUploadAttachmentId ?? rawMetadata.original_upload_attachment_id),
      clean(rawMetadata.originalUploadSha256 ?? rawMetadata.original_upload_sha256),
    ]).some((label) => (
      /^wedding_import(?:$|:)/i.test(label)
      || /original upload/i.test(label)
      || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(label)
      || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(label)
    ));
}

function sensitiveImportSearchValues(input: WeddingArtifactInput): Set<string> {
  const rawMetadata = metadataRecord(input.metadata);
  return new Set(uniqueStrings([
    rawMetadata.originalUploadMessageId ?? rawMetadata.original_upload_message_id,
    rawMetadata.originalUploadAttachmentId ?? rawMetadata.original_upload_attachment_id,
    rawMetadata.originalUploadSha256 ?? rawMetadata.original_upload_sha256,
    rawMetadata.originalUploadFileName ?? rawMetadata.original_upload_file_name,
  ], 24).map((value) => value.toLowerCase()));
}

function safeImportSearchLabels(input: WeddingArtifactInput): string[] {
  const sensitiveValues = sensitiveImportSearchValues(input);
  return uniqueStrings(input.searchLabels ?? [], 24).filter((label) => {
    const normalized = label.toLowerCase();
    if (sensitiveValues.has(normalized)) return false;
    if (/^(?:upload|attachment|att|msg|message)[-_:]?[a-z0-9-]+$/i.test(label)) return false;
    if (/^[a-f0-9]{16,}$/i.test(label)) return false;
    if (/\b[^,\s]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(label)) return false;
    return true;
  });
}

function importSearchBody(input: WeddingArtifactInput): string {
  return clean(input.bodyText)
    .replace(/^# .+$/m, "# Imported private planning file")
    .replace(/\n## Original upload retention\n[\s\S]*?(?=\n## |\s*$)/i, "\n## Original upload retention\n- Original upload receipt retained privately.")
    .replace(/\n## Background synthesis instructions\n[\s\S]*?(?=\n## |\s*$)/i, "");
}

export function weddingArtifactCategoryLabel(kind: WeddingArtifactKind): string {
  return CATEGORY_LABELS[kind];
}

export function weddingArtifactEvidenceStatus(input: {
  sourceLabels?: readonly string[] | null;
  sourceLinks?: readonly WeddingArtifactSourceLink[] | null;
}): WeddingArtifactEvidenceStatus {
  if ((input.sourceLinks ?? []).length > 0) return "source_linked";
  if ((input.sourceLabels ?? []).length > 0) return "source_labelled";
  return "source_unverified";
}

export function normalizeWeddingArtifactSummary(input: WeddingArtifactInput): WeddingArtifactSummary | null {
  const metadata = normalizeWeddingPlanningMetadata({
    ...(input.metadata && typeof input.metadata === "object" ? input.metadata as Record<string, unknown> : {}),
    artifactKind: input.kind ?? (input.metadata && typeof input.metadata === "object"
      ? (input.metadata as Record<string, unknown>).artifactKind ?? (input.metadata as Record<string, unknown>).artifact_kind
      : null),
  });
  if (!metadata.artifactKind) return null;
  const title = clean(input.title) || weddingArtifactCategoryLabel(metadata.artifactKind);
  const createdAt = typeof input.createdAt === "number" && Number.isFinite(input.createdAt) ? input.createdAt : Date.now();
  const sourceLabels = uniqueStrings(input.sourceLabels ?? [], 12);
  const sourceLinks = normalizeSourceLinks(input.sourceLinks);
  const searchLabels = uniqueStrings(input.searchLabels ?? [], 24);
  const locationLabels = uniqueStrings(input.locationLabels ?? [], 12);
  const vendorLabels = uniqueStrings(input.vendorLabels ?? [], 12);
  const linkedTaskIds = uniqueStrings(input.linkedTaskIds ?? [], 12);
  const linkedCalendarEventIds = uniqueStrings(input.linkedCalendarEventIds ?? [], 12);
  const evidenceStatus = weddingArtifactEvidenceStatus({ sourceLabels, sourceLinks });
  const importedPrivateEvidence = isWeddingImportArtifactInput(input, metadata);
  const id = clean(input.id)
    || `wedding_artifact:${safeWeddingLabel(metadata.artifactKind)}:${stableHash([
      metadata.weddingPlanId,
      metadata.responseWorkspaceId,
      title,
      createdAt,
    ].join("|"))}`;
  const exportTargets = normalizeExportTargets(metadata.artifactKind, input.exportTargets);
  const searchableIdentity = importedPrivateEvidence
    ? ["Imported private planning file", metadata.artifactKind, weddingArtifactCategoryLabel(metadata.artifactKind)]
    : [id, title, metadata.artifactKind, weddingArtifactCategoryLabel(metadata.artifactKind)];
  const searchableSourceLabels = importedPrivateEvidence ? ["Imported private planning file"] : sourceLabels;
  const searchableSourceLinks = importedPrivateEvidence ? [] : sourceLinks;
  const searchableSearchLabels = importedPrivateEvidence ? safeImportSearchLabels(input) : searchLabels;
  const searchableBodyText = importedPrivateEvidence ? importSearchBody(input) : clean(input.bodyText);
  const searchText = uniqueStrings([
    ...searchableIdentity,
    metadata.weddingPlanId,
    metadata.responseWorkspaceId,
    metadata.sourceResponseId,
    metadata.privacyScope,
    metadata.approvalState,
    evidenceStatus,
    evidenceStatus.replace(/_/g, " "),
    ...metadata.supertags,
    ...exportTargets,
    ...searchableSourceLabels,
    ...searchableSourceLinks.flatMap((source) => [source.label, source.url]),
    ...searchableSearchLabels,
    ...locationLabels,
    ...vendorLabels,
    ...linkedTaskIds,
    ...linkedCalendarEventIds,
    searchableBodyText.slice(0, 600),
  ], 80).join(" ").toLowerCase();

  return {
    id,
    title,
    kind: metadata.artifactKind,
    category: weddingArtifactCategoryLabel(metadata.artifactKind),
    createdAt,
    metadata,
    exportTargets,
    approvalState: metadata.approvalState,
    sourceLabels,
    sourceLinks,
    locationLabels,
    vendorLabels,
    linkedTaskIds,
    linkedCalendarEventIds,
    searchText,
  };
}

export function normalizeWeddingArtifactSummaries(
  inputs: readonly WeddingArtifactInput[],
): WeddingArtifactSummary[] {
  const seen = new Set<string>();
  return inputs
    .flatMap((input) => {
      const summary = normalizeWeddingArtifactSummary(input);
      if (!summary || seen.has(summary.id)) return [];
      seen.add(summary.id);
      return [summary];
    })
    .sort((left, right) => right.createdAt - left.createdAt);
}
