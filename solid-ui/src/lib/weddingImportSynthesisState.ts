// @locs-version: 2.0
import type { WeddingGeneratedArtifact } from "@/lib/weddingArtifactGenerationState";
import { normalizeWeddingArtifactSummary, type WeddingArtifactInput } from "@/lib/weddingArtifactState";
import { accountScopedStorageKey, accountScopedStorageReadKey } from "@/lib/accountScopedStorage";
import type { AfpAttachment } from "@/lib/api";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingArtifactKind,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingImportSourceKind = "csv" | "tsv" | "spreadsheet" | "google_sheets" | "the_knot" | "text" | "unknown";
export type WeddingImportDeclaredKind = "budget" | "guest_list" | "seating_chart" | "vendor_list" | "timeline" | "general_planning";
export type WeddingImportSynthesisStatus = "synthesized" | "needs_parser" | "needs_review";

export type WeddingImportFileInput = {
  name: string;
  text?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  lastModified?: number | null;
  sourceKind?: WeddingImportSourceKind | null;
  parserName?: string | null;
  parsedSheetName?: string | null;
  parserFormulaCellCount?: number | null;
  parserWarningLabels?: readonly string[] | null;
  uploadReceipt?: WeddingImportUploadReceipt | null;
  declaredKind?: WeddingImportDeclaredKind | null;
};

export type WeddingImportUploadReceipt = {
  status: "saved" | "failed" | "not_attempted";
  messageId?: string | null;
  attachment?: AfpAttachment | null;
  failureLabel?: string | null;
};

export type WeddingImportSynthesisItem = {
  fileName: string;
  sourceKind: WeddingImportSourceKind;
  status: WeddingImportSynthesisStatus;
  artifactKind: WeddingArtifactKind;
  rowCount: number;
  columnLabels: string[];
  summaryLabels: string[];
  warningLabels: string[];
  truncated: boolean;
  generatedArtifact: WeddingGeneratedArtifact;
};

export type WeddingImportSynthesisState = {
  metadata: WeddingPlanningMetadata;
  items: WeddingImportSynthesisItem[];
  generatedArtifacts: WeddingGeneratedArtifact[];
  artifactInputs: WeddingArtifactInput[];
  summaryLabel: string;
  readyCount: number;
  reviewCount: number;
  parserNeededCount: number;
};

export const WEDDING_IMPORT_STORAGE_KEY_PREFIX = "omnyid.wedding-imports.v1";
export const WEDDING_IMPORT_MAX_TEXT_BYTES = 2_000_000;
export const WEDDING_IMPORT_MAX_SYNTHESIS_ROWS = 500;
export const WEDDING_IMPORT_PREVIEW_ROWS = 200;

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

function hasStorageReceipt(value: unknown): boolean {
  return Object.keys(record(value)).length > 0;
}

function placeholderReceiptPart(value: unknown): boolean {
  const item = clean(value);
  return !item || item === "..." || /\b(?:dry-run|test|example|placeholder|fake|stub|mock)\b/i.test(item);
}

function durableUploadReceipt(receipt: WeddingImportUploadReceipt | null | undefined): boolean {
  return receipt?.status === "saved"
    && !placeholderReceiptPart(receipt.messageId)
    && !placeholderReceiptPart(receipt.attachment?.id)
    && !placeholderReceiptPart(receipt.attachment?.sha256)
    && hasStorageReceipt(receipt.attachment?.storage);
}

function normalizedUploadReceipt(
  receipt: WeddingImportUploadReceipt | null | undefined,
): WeddingImportUploadReceipt | null {
  if (!receipt || receipt.status === "not_attempted") return receipt ?? null;
  if (receipt.status === "failed") return receipt;
  if (durableUploadReceipt(receipt)) return receipt;
  return {
    ...receipt,
    status: "failed",
    failureLabel: clean(receipt.failureLabel)
      || "Original upload receipt is incomplete; message ID, attachment ID, SHA-256, and storage receipt are required.",
  };
}

function durableOriginalUploadMetadata(metadata: Record<string, unknown>): boolean {
  return clean(metadata.originalUploadStatus).toLowerCase() === "saved"
    && !placeholderReceiptPart(metadata.originalUploadMessageId)
    && !placeholderReceiptPart(metadata.originalUploadAttachmentId)
    && !placeholderReceiptPart(metadata.originalUploadSha256)
    && hasStorageReceipt(metadata.originalUploadStorage);
}

function sanitizedOriginalUploadMetadata(metadata: Record<string, unknown>, fallbackTitle: unknown): Record<string, unknown> {
  const status = clean(metadata.originalUploadStatus).toLowerCase();
  return {
    ...metadata,
    originalUploadStatus: status || metadata.originalUploadStatus,
    originalUploadMessageId: boundedClean(metadata.originalUploadMessageId, 200) || null,
    originalUploadAttachmentId: boundedClean(metadata.originalUploadAttachmentId, 200) || null,
    originalUploadSha256: boundedClean(metadata.originalUploadSha256, 256) || null,
    originalUploadFileName: sourceFileName(metadata.originalUploadFileName, fallbackTitle) || null,
    originalUploadMimeType: boundedClean(metadata.originalUploadMimeType, 160) || null,
    originalUploadSizeBytes: typeof metadata.originalUploadSizeBytes === "number" && Number.isFinite(metadata.originalUploadSizeBytes)
      ? Math.max(0, metadata.originalUploadSizeBytes)
      : null,
    originalUploadStorage: sanitizedStorageReceipt(metadata.originalUploadStorage),
    originalUploadFailureLabel: boundedClean(metadata.originalUploadFailureLabel, 240) || null,
  };
}

function sanitizeStoredImportArtifactInput(
  input: WeddingArtifactInput,
  markdown: string,
): { input: WeddingArtifactInput; markdown: string } {
  const metadata = sanitizedOriginalUploadMetadata(record(input.metadata), input.title);
  if (clean(metadata.originalUploadStatus).toLowerCase() !== "saved" || durableOriginalUploadMetadata(metadata)) {
    return {
      input: {
        ...input,
        metadata,
      },
      markdown,
    };
  }

  const failureLabel = clean(metadata.originalUploadFailureLabel)
    || "Original upload receipt is incomplete; message ID, attachment ID, SHA-256, and storage receipt are required.";
  const sanitizedMetadata = {
    ...metadata,
    originalUploadStatus: "failed",
    originalUploadFailureLabel: failureLabel,
    supertags: Array.isArray(metadata.supertags)
      ? metadata.supertags.map((tag) =>
        clean(tag) === "wedding_import_upload:saved" ? "wedding_import_upload:failed" : tag
      )
      : metadata.supertags,
  };
  const sanitizedSearchLabels = (input.searchLabels ?? []).map((label) =>
    /original upload saved/i.test(label) ? "original upload not saved" : label
  );
  const sanitizedMarkdown = markdown
    .replace(/- Original upload saved to OmnyID Files/g, `- Original upload storage failed: ${failureLabel}`);

  return {
    input: {
      ...input,
      metadata: sanitizedMetadata,
      searchLabels: sanitizedSearchLabels,
    },
    markdown: sanitizedMarkdown,
  };
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

function csvCell(value: unknown): string {
  return `"${clean(value).replace(/"/g, '""')}"`;
}

function sourceKindForFile(file: WeddingImportFileInput): WeddingImportSourceKind {
  if (file.sourceKind) return file.sourceKind;
  const name = clean(file.name).toLowerCase();
  const mime = clean(file.mimeType).toLowerCase();
  if (name.endsWith(".csv") || mime.includes("csv")) return "csv";
  if (name.endsWith(".tsv") || mime.includes("tab-separated")) return "tsv";
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || mime.includes("spreadsheet") || mime.includes("excel")) return "spreadsheet";
  if (/google|sheet/i.test(name)) return "google_sheets";
  if (/knot/i.test(name)) return "the_knot";
  if (name.endsWith(".txt") || mime.includes("text")) return "text";
  return "unknown";
}

function delimiterFor(kind: WeddingImportSourceKind, text: string): string {
  if (kind === "tsv") return "\t";
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  const commas = (sample.match(/,/g) ?? []).length;
  const tabs = (sample.match(/\t/g) ?? []).length;
  return tabs > commas ? "\t" : ",";
}

function parseDelimited(
  text: string,
  delimiter: string,
  maxDataRows = WEDDING_IMPORT_MAX_SYNTHESIS_ROWS,
): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let truncated = false;
  const maxRows = Math.max(1, maxDataRows + 1);
  const pushRow = (nextRow: string[]) => {
    if (!nextRow.some(Boolean)) return;
    if (rows.length >= maxRows) {
      truncated = true;
      return;
    }
    rows.push(nextRow);
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      pushRow(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  pushRow(row);
  return { rows, truncated };
}

function normalizedHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function inferArtifactKind(headers: readonly string[], fileName: string, declaredKind?: WeddingImportDeclaredKind | null): WeddingArtifactKind {
  if (declaredKind === "budget") return "budget_sheet";
  if (declaredKind === "guest_list" || declaredKind === "seating_chart") return "guest_list";
  if (declaredKind === "vendor_list") return "vendor_table";
  if (declaredKind === "timeline") return "timeline";
  if (declaredKind === "general_planning") return "research";
  const haystack = `${headers.map(normalizedHeader).join(" ")} ${fileName.toLowerCase()}`;
  const score = (pattern: RegExp) => (haystack.match(pattern) ?? []).length;
  const guestScore = score(/\b(rsvp|guest|attendee|invite|invitation|meal|dietary|allergy|accessibility|table|household)\b/g);
  const budgetScore = score(/\b(budget|estimate|cost|paid|payment|due|deposit|balance|invoice|quote|amount|gst|tax)\b/g);
  const vendorScore = score(/\b(vendor|venue|photographer|celebrant|caterer|florist|contact|capacity|package|source)\b/g);
  if (guestScore > 0 && guestScore >= budgetScore && guestScore >= vendorScore) return "guest_list";
  if (budgetScore > 0 && budgetScore > vendorScore) return "budget_sheet";
  if (vendorScore > 0) return "vendor_table";
  return "research";
}

function titleFor(kind: WeddingArtifactKind, fileName: string): string {
  const base = clean(fileName).replace(/\.[^.]+$/, "") || "Imported wedding file";
  if (kind === "guest_list") return `Imported guest list - ${base}`;
  if (kind === "budget_sheet") return `Imported budget - ${base}`;
  if (kind === "vendor_table") return `Imported vendor list - ${base}`;
  return `Imported planning file - ${base}`;
}

function markdownTable(headers: readonly string[], rows: readonly (readonly string[])[]): string[] {
  if (headers.length === 0 || rows.length === 0) return [];
  return [
    `| ${headers.map((header) => clean(header) || "Column").join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${headers.map((_, index) => clean(row[index]) || " ").join(" | ")} |`),
    "",
  ];
}

function csvRows(headers: readonly string[], rows: readonly (readonly string[])[]): string | null {
  if (headers.length === 0 || rows.length === 0) return null;
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((_, index) => csvCell(row[index])).join(",")),
  ].join("\n");
}

function columnLabelsFor(headers: readonly string[]): string[] {
  return uniqueStrings(headers.map((header) => clean(header) || "Unnamed column"), 16);
}

function sourceLabel(kind: WeddingImportSourceKind, fileName: string): string {
  const label = kind === "google_sheets"
    ? "Google Sheets import"
    : kind === "the_knot"
      ? "The Knot import"
      : kind === "spreadsheet" ? "Spreadsheet import" : kind === "csv" ? "CSV import" : kind === "tsv" ? "TSV import" : "User upload";
  return `${label}: ${clean(fileName) || "uploaded file"}`;
}

function uploadReceiptLabels(receipt: WeddingImportUploadReceipt | null | undefined): string[] {
  if (!receipt || receipt.status === "not_attempted") return ["Original upload storage: not attempted"];
  if (receipt.status === "failed") {
    const failure = clean(receipt.failureLabel);
    return [`Original upload storage failed${failure ? `: ${failure}` : ""}`];
  }
  return [
    "Original upload saved to OmnyID Files",
    receipt.messageId ? `Upload source message: ${receipt.messageId}` : null,
    receipt.attachment?.id ? `Attachment: ${receipt.attachment.id}` : null,
    receipt.attachment?.sha256 ? `SHA-256: ${receipt.attachment.sha256}` : null,
  ].filter((value): value is string => Boolean(value));
}

function artifactId(metadata: WeddingPlanningMetadata, kind: WeddingArtifactKind, fileName: string): string {
  return `wedding_import:${safeWeddingLabel(kind)}:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(fileName)}`;
}

function makeArtifact(input: WeddingArtifactInput, markdown: string, csv: string | null): WeddingGeneratedArtifact {
  const summary = normalizeWeddingArtifactSummary({ ...input, bodyText: markdown });
  if (!summary) {
    throw new Error("Wedding import artifact could not be normalized.");
  }
  return { input: { ...input, bodyText: markdown }, summary, markdown, csv };
}

function synthesizeImport(file: WeddingImportFileInput, metadata: WeddingPlanningMetadata): WeddingImportSynthesisItem {
  const fileName = clean(file.name) || "uploaded-wedding-file";
  const sourceKind = sourceKindForFile(file);
  const uploadReceipt = normalizedUploadReceipt(file.uploadReceipt);
  const text = clean(file.text);
  const parserName = clean(file.parserName);
  const parsedSheetName = clean(file.parsedSheetName);
  const parserFormulaCellCount = Number.isFinite(file.parserFormulaCellCount ?? NaN)
    ? Math.max(0, Math.trunc(file.parserFormulaCellCount ?? 0))
    : 0;
  const parserWarningLabels = uniqueStrings(file.parserWarningLabels ?? [], 8);
  const parserRequired = sourceKind === "spreadsheet" && !text;
  const parsed = parserRequired ? { rows: [], truncated: false } : parseDelimited(text, delimiterFor(sourceKind, text));
  const rows = parsed.rows;
  const headers = rows[0] ?? [];
  const dataRows = rows.slice(1).filter((row) => row.some(Boolean));
  const artifactKind = inferArtifactKind(headers, fileName, file.declaredKind);
  const title = titleFor(artifactKind, fileName);
  const status: WeddingImportSynthesisStatus = parserRequired
    ? "needs_parser"
    : dataRows.length > 0 && headers.length > 0 ? "synthesized" : "needs_review";
  const columnLabels = columnLabelsFor(headers);
  const warningLabels = [
    parserRequired ? "Binary spreadsheet parsing needs a backend parser before rows can be synthesized." : null,
    parsed.truncated ? `Import synthesis was capped at ${WEDDING_IMPORT_MAX_SYNTHESIS_ROWS} rows in-browser; preserve the original file for full backend parsing.` : null,
    status === "needs_review" ? "Imported file did not expose clear rows; review before relying on it." : null,
    "Imported values are user-provided evidence; verify stale vendor pricing, RSVP status, and payment records before acting.",
    ...parserWarningLabels,
  ].filter((value): value is string => Boolean(value));
  const summaryLabels = [
    `${dataRows.length} row${dataRows.length === 1 ? "" : "s"} detected`,
    `${headers.length} column${headers.length === 1 ? "" : "s"} detected`,
    (file.declaredKind ?? artifactKind).replace(/_/g, " "),
    sourceKind.replace(/_/g, " "),
  ];
  const limitedRows = dataRows.slice(0, WEDDING_IMPORT_PREVIEW_ROWS);
  const markdown = [
    `# ${title}`,
    "",
    "Imported by frictionless wedding onboarding. The original upload is treated as private planning evidence and should be saved to the wedding workspace before sharing.",
    "",
    "## Import summary",
    "",
    `- File: ${fileName}`,
    `- Source type: ${sourceKind.replace(/_/g, " ")}`,
    `- Status: ${status.replace(/_/g, " ")}`,
    `- Planning area chosen by user: ${(file.declaredKind ?? "not specified").replace(/_/g, " ")}`,
    `- Projected planner view: ${artifactKind.replace(/_/g, " ")}`,
    parserName ? `- Read with: ${parserName}` : null,
    parsedSheetName ? `- Sheet: ${parsedSheetName}` : null,
    parserFormulaCellCount > 0 ? `- Formula cells detected: ${parserFormulaCellCount}` : null,
    `- Rows detected: ${dataRows.length}`,
    `- Columns detected: ${headers.length}`,
    parsed.truncated ? `- Import preview limit: first ${WEDDING_IMPORT_MAX_SYNTHESIS_ROWS} rows` : null,
    file.sizeBytes ? `- Size: ${file.sizeBytes} bytes` : null,
    file.lastModified ? `- Last modified: ${new Date(file.lastModified).toISOString()}` : null,
    "",
    "## Original file",
    "",
    ...uploadReceiptLabels(uploadReceipt).map((label) => `- ${label}`),
    "",
    "## Columns",
    "",
    ...(columnLabels.length > 0 ? columnLabels.map((label) => `- ${label}`) : ["- No clear columns detected yet."]),
    "",
    "## Extracted rows",
    "",
    ...markdownTable(headers, limitedRows),
    limitedRows.length < dataRows.length ? `Only the first ${limitedRows.length} rows are shown here; the saved import keeps the full row set.` : null,
    "",
    "## How this import will be used",
    "",
    "- Use this import as a guest list, budget, vendor list, or general planning file.",
    "- Keep the filename, row count, column labels, and user-provided values with the saved file.",
    "- Update wedding files, tasks, budget summaries, guest summaries, and dependency notes from this evidence.",
    "- Do not send messages, contact vendors, publish registry data, or share private guest/budget details without user approval.",
    "",
    "## Warnings",
    "",
    ...warningLabels.map((label) => `- ${label}`),
  ].filter((value): value is string => value !== null).join("\n");

  const generatedArtifact = makeArtifact({
    id: artifactId(metadata, artifactKind, fileName),
    title,
    kind: artifactKind,
    metadata: {
      ...metadata,
      artifactKind,
      privacyScope: "private",
      approvalState: status === "needs_parser" ? "pending_user_approval" : "draft",
      supertags: [
        ...metadata.supertags,
        "wedding_import",
        `wedding_import:${sourceKind}`,
        `wedding_import_status:${status}`,
        `wedding_import_upload:${uploadReceipt?.status ?? "not_attempted"}`,
      ],
      originalUploadStatus: uploadReceipt?.status ?? "not_attempted",
      originalUploadMessageId: uploadReceipt?.messageId ?? null,
      originalUploadAttachmentId: uploadReceipt?.attachment?.id ?? null,
      originalUploadSha256: uploadReceipt?.attachment?.sha256 ?? null,
      originalUploadFileName: uploadReceipt?.attachment?.name ?? fileName,
      originalUploadMimeType: uploadReceipt?.attachment?.mime_type ?? file.mimeType ?? null,
      originalUploadSizeBytes: uploadReceipt?.attachment?.size_bytes ?? file.sizeBytes ?? null,
      originalUploadStorage: uploadReceipt?.attachment?.storage ?? null,
      originalUploadFailureLabel: uploadReceipt?.failureLabel ?? null,
      importParserName: parserName || null,
      importParsedSheetName: parsedSheetName || null,
      importParserFormulaCellCount: parserFormulaCellCount,
      importParserWarningLabels: parserWarningLabels,
      importDeclaredKind: file.declaredKind ?? null,
    },
    sourceLabels: [sourceLabel(sourceKind, fileName)],
    searchLabels: [
      "frictionless onboarding",
      "one-click import",
      "spreadsheet import",
      uploadReceipt?.status === "saved" ? "original upload saved" : "original upload not saved",
      uploadReceipt?.messageId ?? null,
      uploadReceipt?.attachment?.id ?? null,
      uploadReceipt?.attachment?.sha256 ?? null,
      parserName || null,
      parsedSheetName || null,
      parserFormulaCellCount > 0 ? `${parserFormulaCellCount} formula cells` : null,
      sourceKind,
      status,
      ...columnLabels,
    ].filter((value): value is string => Boolean(value)),
    vendorLabels: artifactKind === "vendor_table" ? uniqueStrings(dataRows.map((row) => row[0]), 16) : [],
    exportTargets: artifactKind === "research" ? ["markdown", "html", "word_doc", "browser_pdf"] : ["csv", "markdown", "html", "browser_pdf"],
    bodyText: markdown,
  }, markdown, csvRows(headers, dataRows));

  return {
    fileName,
    sourceKind,
    status,
    artifactKind,
    rowCount: dataRows.length,
    columnLabels,
    summaryLabels,
    warningLabels,
    truncated: parsed.truncated,
    generatedArtifact,
  };
}

export function buildWeddingImportSynthesisState(input: {
  metadata?: unknown;
  files?: readonly WeddingImportFileInput[] | null;
}): WeddingImportSynthesisState {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const items = (input.files ?? [])
    .filter((file) => clean(file.name))
    .map((file) => synthesizeImport(file, metadata));
  const generatedArtifacts = items.map((item) => item.generatedArtifact);
  const readyCount = items.filter((item) => item.status === "synthesized").length;
  const reviewCount = items.filter((item) => item.status === "needs_review").length;
  const parserNeededCount = items.filter((item) => item.status === "needs_parser").length;

  return {
    metadata,
    items,
    generatedArtifacts,
    artifactInputs: generatedArtifacts.map((artifact) => artifact.input),
    summaryLabel: items.length === 0
      ? "No wedding imports yet"
      : `${items.length} import${items.length === 1 ? "" : "s"} added: ${readyCount} synthesized, ${reviewCount} need review, ${parserNeededCount} need parser`,
    readyCount,
    reviewCount,
    parserNeededCount,
  };
}

export function weddingImportStorageKey(responseWorkspaceId: string): string {
  return `${WEDDING_IMPORT_STORAGE_KEY_PREFIX}:${safeWeddingLabel(responseWorkspaceId)}`;
}

export function weddingImportScopedStorageKey(responseWorkspaceId: string, userId?: string | null): string {
  return accountScopedStorageKey(weddingImportStorageKey(responseWorkspaceId), userId ?? null);
}

function normalizedStoredImportArtifact(value: unknown, responseWorkspaceId: string): WeddingGeneratedArtifact | null {
  if (!value || typeof value !== "object") return null;
  const artifact = value as Partial<WeddingGeneratedArtifact>;
  if (!artifact.input || typeof artifact.input !== "object" || typeof artifact.markdown !== "string") return null;
  const sanitized = sanitizeStoredImportArtifactInput(artifact.input as WeddingArtifactInput, artifact.markdown);
  const input = sanitized.input;
  const summary = normalizeWeddingArtifactSummary({ ...input, bodyText: sanitized.markdown });
  if (!summary || summary.metadata.responseWorkspaceId !== responseWorkspaceId) return null;
  return {
    input: {
      ...input,
      id: summary.id,
      title: summary.title,
      kind: summary.kind,
      sourceLinks: summary.sourceLinks,
      bodyText: sanitized.markdown,
    },
    summary,
    markdown: sanitized.markdown,
    csv: typeof artifact.csv === "string" ? artifact.csv : null,
  };
}

export function loadWeddingImportedArtifacts(
  responseWorkspaceId: string,
  storage: Storage = localStorage,
  userId?: string | null,
): WeddingGeneratedArtifact[] {
  const scopedKey = weddingImportScopedStorageKey(responseWorkspaceId, userId);
  const legacyKey = weddingImportStorageKey(responseWorkspaceId);
  const scopedRaw = storage.getItem(scopedKey);
  const raw = scopedRaw ?? storage.getItem(accountScopedStorageReadKey(legacyKey, userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      storage.removeItem(scopedKey);
      if (legacyKey !== scopedKey) storage.removeItem(legacyKey);
      return [];
    }
    const artifacts = parsed.flatMap((item): WeddingGeneratedArtifact[] => {
      const artifact = normalizedStoredImportArtifact(item, responseWorkspaceId);
      return artifact ? [artifact] : [];
    });
    return artifacts;
  } catch {
    storage.removeItem(scopedKey);
    if (legacyKey !== scopedKey) storage.removeItem(legacyKey);
    return [];
  }
}

export function saveWeddingImportedArtifacts(
  responseWorkspaceId: string,
  artifacts: readonly WeddingGeneratedArtifact[],
  storage: Storage = localStorage,
  userId?: string | null,
): void {
  const key = weddingImportScopedStorageKey(responseWorkspaceId, userId);
  const existing = loadWeddingImportedArtifacts(responseWorkspaceId, storage, userId);
  const byId = new Map<string, WeddingGeneratedArtifact>();
  for (const artifact of [...existing, ...artifacts]) {
    const normalized = normalizedStoredImportArtifact(artifact, responseWorkspaceId);
    if (normalized) byId.set(normalized.summary.id, normalized);
  }
  storage.setItem(key, JSON.stringify(Array.from(byId.values()).slice(-80)));
}
