// @locs-version: 2.0
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import {
  WEDDING_IMPORT_MAX_SYNTHESIS_ROWS,
  WEDDING_IMPORT_MAX_TEXT_BYTES,
} from "@/lib/weddingImportSynthesisState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingImportParserReadinessStatus = "ready" | "blocked";

export type WeddingImportParserReadinessState = {
  status: WeddingImportParserReadinessStatus;
  productionReady: boolean;
  statusLabel: string;
  summaryLabel: string;
  importedArtifactCount: number;
  parserNeededCount: number;
  synthesizedCount: number;
  reviewNeededCount: number;
  originalUploadSavedCount: number;
  unsavedOriginalUploadCount: number;
  parserJobReadyCount: number;
  parserJobBlockedCount: number;
  formulaReviewCount: number;
  parserJobRequests: WeddingImportParserJobRequest[];
  maxTextBytes: number;
  maxRowsPerImport: number;
  readyLabels: string[];
  proofReferenceLabels: string[];
  blockerLabels: string[];
  nextActionLabels: string[];
};

export type WeddingImportParserJobRequest = {
  id: string;
  artifactId: string | null;
  title: string;
  fileName: string | null;
  sourceMessageId: string | null;
  attachmentId: string | null;
  sha256: string | null;
  status: "request_ready" | "storage_missing";
  blockerLabels: string[];
  parserInput: Record<string, unknown>;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function boundedClean(value: unknown, limit: number): string {
  return clean(value).slice(0, Math.max(0, limit));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sourceFileName(value: unknown, fallback: unknown): string {
  const raw = boundedClean(value, 180) || boundedClean(fallback, 180);
  const parts = raw.split(/[\\/]+/).map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) ?? "";
}

function sanitizedStorageReceipt(value: unknown): Record<string, unknown> | null {
  const storage = record(value);
  if (Object.keys(storage).length === 0) return null;
  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(storage).slice(0, 16)) {
    const safeKey = boundedClean(key, 80);
    if (!safeKey) continue;
    if (typeof item === "string") sanitized[safeKey] = boundedClean(item, 500);
    else if (typeof item === "number" && Number.isFinite(item)) sanitized[safeKey] = item;
    else if (typeof item === "boolean" || item === null) sanitized[safeKey] = item;
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function textForArtifact(artifact: WeddingArtifactInput): string {
  const metadata = artifact.metadata as unknown as Record<string, unknown> | null;
  const supertags = Array.isArray(metadata?.supertags) ? metadata.supertags.map(clean).join(" ") : "";
  return [
    artifact.title,
    artifact.kind,
    artifact.bodyText,
    artifact.sourceLabels?.join(" "),
    artifact.searchLabels?.join(" "),
    supertags,
  ].map(clean).join(" ").toLowerCase();
}

function isImportedArtifact(artifact: WeddingArtifactInput): boolean {
  const haystack = textForArtifact(artifact);
  return haystack.includes("wedding_import") || haystack.includes("frictionless onboarding") || haystack.includes("one-click import");
}

function importStatusForArtifact(artifact: WeddingArtifactInput): "synthesized" | "needs_parser" | "needs_review" | null {
  const haystack = textForArtifact(artifact);
  if (!isImportedArtifact(artifact)) return null;
  if (haystack.includes("wedding_import_status:needs_parser") || haystack.includes("status: needs parser")) return "needs_parser";
  if (haystack.includes("wedding_import_status:needs_review") || haystack.includes("status: needs review")) return "needs_review";
  if (haystack.includes("wedding_import_status:synthesized") || haystack.includes("status: synthesized")) return "synthesized";
  return "needs_review";
}

function metadataForArtifact(artifact: WeddingArtifactInput): Record<string, unknown> {
  return record(artifact.metadata);
}

function hasStorageReceipt(value: unknown): boolean {
  const storage = record(value);
  return Object.keys(storage).length > 0;
}

function placeholderReceiptPart(value: unknown): boolean {
  const item = clean(value);
  return !item || item === "..." || /\b(?:dry-run|test|example|placeholder|fake|stub|mock)\b/i.test(item);
}

function durableOriginalUploadReceipt(artifact: WeddingArtifactInput): boolean {
  const metadata = metadataForArtifact(artifact);
  return clean(metadata?.originalUploadStatus).toLowerCase() === "saved"
    && !placeholderReceiptPart(metadata.originalUploadMessageId)
    && !placeholderReceiptPart(metadata.originalUploadAttachmentId)
    && !placeholderReceiptPart(metadata.originalUploadSha256)
    && hasStorageReceipt(metadata.originalUploadStorage);
}

function originalUploadSaved(artifact: WeddingArtifactInput): boolean {
  return durableOriginalUploadReceipt(artifact);
}

function originalUploadProofReferenceLabel(artifact: WeddingArtifactInput): string | null {
  if (!durableOriginalUploadReceipt(artifact)) return null;
  const metadata = metadataForArtifact(artifact);
  const messageId = safeWeddingLabel(metadata.originalUploadMessageId);
  const attachmentId = safeWeddingLabel(metadata.originalUploadAttachmentId);
  const sha = safeWeddingLabel(metadata.originalUploadSha256).slice(0, 24);
  if (!messageId || !attachmentId || !sha) return null;
  return `Wedding import original upload proof: ${messageId}:${attachmentId}:${sha}`;
}

function formulaCellCountForArtifact(artifact: WeddingArtifactInput): number {
  const metadata = metadataForArtifact(artifact);
  const value = Number(metadata.importParserFormulaCellCount ?? metadata.import_parser_formula_cell_count ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function buildWeddingImportParserJobRequests(
  artifacts: readonly WeddingArtifactInput[] | null | undefined,
): WeddingImportParserJobRequest[] {
  return (artifacts ?? [])
    .filter((artifact) => importStatusForArtifact(artifact) === "needs_parser")
    .map((artifact, index): WeddingImportParserJobRequest => {
      const metadata = metadataForArtifact(artifact);
      const artifactId = clean(artifact.id);
      const fileName = sourceFileName(metadata.originalUploadFileName, artifact.title);
      const sourceMessageId = boundedClean(metadata.originalUploadMessageId, 200);
      const attachmentId = boundedClean(metadata.originalUploadAttachmentId, 200);
      const sha256 = boundedClean(metadata.originalUploadSha256, 256);
      const storageReceipt = sanitizedStorageReceipt(metadata.originalUploadStorage);
      const storageReceiptReady = hasStorageReceipt(storageReceipt);
      const status: WeddingImportParserJobRequest["status"] = sourceMessageId && attachmentId && sha256 && storageReceiptReady ? "request_ready" : "storage_missing";
      const blockerLabels = [
        sourceMessageId ? null : "Missing original upload source message ID.",
        attachmentId ? null : "Missing original upload attachment ID.",
        sha256 ? null : "Missing original upload SHA-256 hash.",
        storageReceiptReady ? null : "Missing original upload storage receipt.",
      ].filter((label): label is string => Boolean(label));
      return {
        id: `wedding_import_parser_job:${safeWeddingLabel(artifactId ?? fileName ?? `import-${index + 1}`)}`,
        artifactId,
        title: clean(artifact.title) || "Wedding spreadsheet import",
        fileName,
        sourceMessageId,
        attachmentId,
        sha256,
        status,
        blockerLabels,
        parserInput: {
          artifact_id: artifactId,
          source_message_id: sourceMessageId,
          source_attachment_id: attachmentId,
          sha256,
          file_name: fileName,
          mime_type: boundedClean(metadata.originalUploadMimeType, 160),
          size_bytes: metadata.originalUploadSizeBytes ?? null,
          storage: storageReceipt,
        },
      };
    });
}

export function buildWeddingImportParserReadinessState(input: {
  artifacts?: readonly WeddingArtifactInput[] | null;
  csvTextParserReady?: boolean | null;
  accountScopedStorageReady?: boolean | null;
  afpProjectionReady?: boolean | null;
  downstreamSynthesisReady?: boolean | null;
  binarySpreadsheetParserReady?: boolean | null;
  requireDurableOriginalUpload?: boolean | null;
  maxTextBytes?: number | null;
  maxRowsPerImport?: number | null;
} = {}): WeddingImportParserReadinessState {
  const importedArtifacts = (input.artifacts ?? []).filter(isImportedArtifact);
  const statuses = importedArtifacts.map(importStatusForArtifact).filter((status): status is NonNullable<typeof status> => Boolean(status));
  const parserJobRequests = buildWeddingImportParserJobRequests(importedArtifacts);
  const importedArtifactCount = statuses.length;
  const parserNeededCount = statuses.filter((status) => status === "needs_parser").length;
  const reviewNeededCount = statuses.filter((status) => status === "needs_review").length;
  const synthesizedCount = statuses.filter((status) => status === "synthesized").length;
  const requireDurableOriginalUpload = input.requireDurableOriginalUpload ?? true;
  const originalUploadSavedCount = importedArtifacts.filter(originalUploadSaved).length;
  const unsavedOriginalUploadCount = Math.max(0, importedArtifactCount - originalUploadSavedCount);
  const parserJobReadyCount = parserJobRequests.filter((request) => request.status === "request_ready").length;
  const parserJobBlockedCount = parserJobRequests.filter((request) => request.status === "storage_missing").length;
  const formulaReviewCount = importedArtifacts.reduce((total, artifact) => total + formulaCellCountForArtifact(artifact), 0);
  const csvTextParserReady = input.csvTextParserReady ?? true;
  const accountScopedStorageReady = input.accountScopedStorageReady ?? true;
  const afpProjectionReady = input.afpProjectionReady ?? true;
  const downstreamSynthesisReady = input.downstreamSynthesisReady ?? true;
  const binarySpreadsheetParserReady = input.binarySpreadsheetParserReady ?? false;
  const maxTextBytes = input.maxTextBytes ?? WEDDING_IMPORT_MAX_TEXT_BYTES;
  const maxRowsPerImport = input.maxRowsPerImport ?? WEDDING_IMPORT_MAX_SYNTHESIS_ROWS;
  const readyLabels = [
    csvTextParserReady ? `CSV, TSV, and text imports can be organized up to ${maxRowsPerImport} rows.` : null,
    accountScopedStorageReady ? "Imported files are kept in this account's wedding workspace." : null,
    afpProjectionReady ? "Imported details can be saved as wedding planning files." : null,
    downstreamSynthesisReady ? "Guest, budget, seating, task, and planning views use imported details." : null,
    originalUploadSavedCount > 0 ? `${originalUploadSavedCount} original upload${originalUploadSavedCount === 1 ? "" : "s"} saved for later review.` : null,
    parserJobReadyCount > 0 ? `${parserJobReadyCount} spreadsheet import${parserJobReadyCount === 1 ? "" : "s"} can be reprocessed from saved source files.` : null,
    formulaReviewCount > 0 ? `${formulaReviewCount} formula-backed spreadsheet cell${formulaReviewCount === 1 ? "" : "s"} preserved as cached values for review.` : null,
    binarySpreadsheetParserReady ? "Excel workbook import is connected." : null,
  ].filter((label): label is string => Boolean(label));
  const blockerLabels = [
    csvTextParserReady ? null : "CSV, TSV, and text import is unavailable.",
    accountScopedStorageReady ? null : "Account-scoped import storage is unavailable.",
    afpProjectionReady ? null : "Imported details cannot be saved as wedding planning files yet.",
    downstreamSynthesisReady ? null : "Imported details are not appearing in wedding planning views yet.",
    parserNeededCount > 0 && !binarySpreadsheetParserReady
      ? `${parserNeededCount} spreadsheet import${parserNeededCount === 1 ? "" : "s"} need Excel workbook support before production use.`
      : null,
    requireDurableOriginalUpload && unsavedOriginalUploadCount > 0
      ? `${unsavedOriginalUploadCount} imported original file${unsavedOriginalUploadCount === 1 ? "" : "s"} need to be saved before production use.`
      : null,
    parserJobBlockedCount > 0
      ? `${parserJobBlockedCount} spreadsheet import${parserJobBlockedCount === 1 ? "" : "s"} cannot be reprocessed because the original file is not fully saved.`
      : null,
  ].filter((label): label is string => Boolean(label));
  const nextActionLabels = [
    parserNeededCount > 0 && !binarySpreadsheetParserReady
      ? "Connect Excel workbook import before relying on older XLS or unreadable XLSX files."
      : null,
    parserJobReadyCount > 0 && !binarySpreadsheetParserReady
      ? "Reprocess saved spreadsheets once Excel workbook import is connected."
      : null,
    requireDurableOriginalUpload && unsavedOriginalUploadCount > 0
      ? "Save original wedding imports to Files before sharing or relying on them."
      : null,
    formulaReviewCount > 0
      ? "Verify formula-backed budget/payment totals against the original workbook before deposits, contracts, or vendor commitments."
      : null,
    reviewNeededCount > 0 ? `Review ${reviewNeededCount} import${reviewNeededCount === 1 ? "" : "s"} that did not expose clear rows.` : null,
    "Keep original uploads available as private source evidence for audit and reparse.",
  ].filter((label): label is string => Boolean(label));
  const productionReady = blockerLabels.length === 0;
  const status: WeddingImportParserReadinessStatus = productionReady ? "ready" : "blocked";
  const proofReferenceLabels = productionReady
    ? importedArtifactCount === 0
      ? ["Wedding import parser proof: no-current-imports"]
      : importedArtifacts
        .map(originalUploadProofReferenceLabel)
        .filter((label): label is string => Boolean(label))
    : [];

  return {
    status,
    productionReady,
    statusLabel: productionReady ? "Import-ready" : "Parser blocked",
    summaryLabel: importedArtifactCount === 0
      ? `No imported files yet. CSV, TSV, and text imports are ready up to ${Math.round(maxTextBytes / 1_000_000)} MB.`
      : `${importedArtifactCount} imported artifact${importedArtifactCount === 1 ? "" : "s"}: ${synthesizedCount} synthesized, ${reviewNeededCount} need review, ${parserNeededCount} need parser.`,
    importedArtifactCount,
    parserNeededCount,
    synthesizedCount,
    reviewNeededCount,
    originalUploadSavedCount,
    unsavedOriginalUploadCount,
    parserJobReadyCount,
    parserJobBlockedCount,
    formulaReviewCount,
    parserJobRequests,
    maxTextBytes,
    maxRowsPerImport,
    readyLabels,
    proofReferenceLabels,
    blockerLabels,
    nextActionLabels,
  };
}

function existingImportParserTaskKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const metadata = record(item.metadata);
    const blockerId = clean(metadata.wedding_import_parser_blocker_id);
    if (blockerId) keys.add(blockerId);
    const formulaReviewId = clean(metadata.wedding_import_formula_review_id);
    if (formulaReviewId) keys.add(formulaReviewId);
  }
  return keys;
}

function redactedParserJobForTask(request: WeddingImportParserJobRequest): Record<string, unknown> {
  return {
    artifact_id: request.artifactId,
    status: request.status,
    file_name_redacted: Boolean(clean(request.fileName)),
    mime_type: clean(request.parserInput.mime_type),
    size_bytes: typeof request.parserInput.size_bytes === "number" ? request.parserInput.size_bytes : null,
    source_message_receipt_present: Boolean(clean(request.sourceMessageId)),
    source_attachment_receipt_present: Boolean(clean(request.attachmentId)),
    sha256_receipt_present: Boolean(clean(request.sha256)),
    storage_receipt_present: request.status === "request_ready",
    blocker_labels: request.blockerLabels,
  };
}

export function buildWeddingImportParserTaskItems(input: {
  importParserReadiness?: WeddingImportParserReadinessState | null;
  metadata?: unknown;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
}): WeddingPlanningTaskItem[] {
  const readiness = input.importParserReadiness;
  if (!readiness) return [];
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const existingKeys = existingImportParserTaskKeys(input.existingTaskItems ?? []);
  const needsFormulaReview = readiness.formulaReviewCount > 0;
  // Original uploads are persisted by the import pipeline. A missing storage
  // receipt is an operational retry/error, not wedding work for the couple.
  const needsParserWork = readiness.parserNeededCount > 0;
  if (!needsParserWork && !needsFormulaReview) return [];
  const taskKind = needsParserWork ? "parser" : "formula_review";
  const blockerId = `wedding_import_${taskKind}:${safeWeddingLabel(metadata.responseWorkspaceId)}`;
  const id = `wedding_import_${taskKind}_task:${safeWeddingLabel(metadata.responseWorkspaceId)}`;
  if (existingKeys.has(id) || existingKeys.has(blockerId)) return [];
  const title = needsFormulaReview && !needsParserWork
    ? "Verify formula-backed wedding import totals"
    : "Connect wedding spreadsheet import parser";

  return [{
    id,
    title,
    kind: "other",
    dueLabel: "Before production upload",
    priority: "urgent",
    source: "agent",
    reviewStatus: "accepted",
    approvalState: "draft",
    metadata: {
      ...metadata,
      wedding_import_parser_task: true,
      wedding_import_parser_blocker_id: blockerId,
      wedding_import_parser_status: readiness.status,
      wedding_import_parser_needed_count: readiness.parserNeededCount,
      wedding_import_synthesized_count: readiness.synthesizedCount,
      wedding_import_original_upload_saved_count: readiness.originalUploadSavedCount,
      wedding_import_unsaved_original_upload_count: readiness.unsavedOriginalUploadCount,
      wedding_import_parser_job_ready_count: readiness.parserJobReadyCount,
      wedding_import_parser_job_blocked_count: readiness.parserJobBlockedCount,
      wedding_import_formula_cell_review_count: readiness.formulaReviewCount,
      wedding_import_formula_review_id: needsFormulaReview ? blockerId : null,
      wedding_import_parser_jobs: readiness.parserJobRequests.map(redactedParserJobForTask),
      wedding_import_parser_job_receipts_redacted: true,
      production_readiness_oracle_gate: true,
      no_external_send_without_approval: true,
      preparation_checklist: true,
      preparation_checklist_item: "wedding-import-parser-readiness",
      user_selectable: true,
      can_deselect_before_commit: true,
      schedule_basis: "production_readiness_gate",
      second_order_loop: "commitment_timing",
      second_order_evidence_labels: [
        "wedding import parser blocked",
        "wedding import original file storage",
        ...readiness.blockerLabels,
      ],
      searchable_terms: [
        "wedding import parser",
        "wedding import original storage",
        "original upload receipt",
        "parser job request",
        "formula-backed import review",
        "cached workbook values",
        "spreadsheet parser",
        "XLSX",
        "Excel",
        "frictionless onboarding",
        ...readiness.blockerLabels,
        ...readiness.nextActionLabels,
        metadata.weddingPlanId,
        metadata.responseWorkspaceId,
      ].filter(Boolean),
    },
    notes: [
      readiness.summaryLabel,
      ...readiness.blockerLabels,
      ...readiness.nextActionLabels.map((label) => `Next: ${label}`),
    ].join(" "),
  }];
}
