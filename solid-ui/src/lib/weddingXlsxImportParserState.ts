// @locs-version: 2.0
import JSZip from "jszip";

import {
  WEDDING_IMPORT_MAX_SYNTHESIS_ROWS,
  WEDDING_IMPORT_MAX_TEXT_BYTES,
  type WeddingImportFileInput,
} from "@/lib/weddingImportSynthesisState";

export type WeddingXlsxParseResult = {
  ok: boolean;
  text: string;
  sheetName: string | null;
  rowCount: number;
  columnCount: number;
  formulaCellCount: number;
  warningLabels: string[];
};

export const WEDDING_IMPORT_MAX_XLSX_SHEETS = 8;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlAttribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  return match ? decodeXml(match[1] ?? "") : "";
}

function columnIndexFromCellRef(cellRef: string): number {
  const letters = clean(cellRef).match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "";
  if (!letters) return 0;
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return Math.max(0, index - 1);
}

function tags(source: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "gi");
  return source.match(pattern) ?? [];
}

function textTags(source: string): string[] {
  return (source.match(/<t\b[^>]*>[\s\S]*?<\/t>/gi) ?? [])
    .map((tag) => decodeXml(tag.replace(/^<t\b[^>]*>/i, "").replace(/<\/t>$/i, "")));
}

function valueTag(source: string): string {
  const match = source.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i);
  return match ? decodeXml(match[1] ?? "") : "";
}

function hasFormulaTag(source: string): boolean {
  return /<f\b[^>]*>[\s\S]*?<\/f>|<f\b[^>]*\/>/i.test(source);
}

function parseSharedStrings(xml: string | null | undefined): string[] {
  if (!xml) return [];
  return tags(xml, "si").map((item) => textTags(item).join(""));
}

type WeddingWorkbookSheet = {
  name: string | null;
  relationshipId: string | null;
  hidden: boolean;
};

function workbookSheets(workbookXml: string | null | undefined): WeddingWorkbookSheet[] {
  const sheetTags = workbookXml?.match(/<sheet\b[^>]*\/?>/gi) ?? [];
  return sheetTags.map((sheetTag, index) => ({
    name: clean(xmlAttribute(sheetTag, "name")) || `Sheet ${index + 1}`,
    relationshipId: clean(xmlAttribute(sheetTag, "r:id")) || null,
    hidden: ["hidden", "veryHidden"].includes(clean(xmlAttribute(sheetTag, "state"))),
  }));
}

function safeWorksheetPath(target: string): string | null {
  const normalized = clean(target).replace(/\\/g, "/").replace(/^\/+/, "");
  const path = normalized.startsWith("xl/") ? normalized : `xl/${normalized}`;
  if (path.includes("../") || path.includes("/..")) return null;
  if (!/^xl\/worksheets\/[^/]+\.xml$/i.test(path)) return null;
  return path;
}

function workbookRelationshipTarget(
  relsXml: string | null | undefined,
  relationshipId: string | null,
): { path: string | null; warningLabel: string | null } {
  if (!relsXml || !relationshipId) return { path: null, warningLabel: null };
  const relationshipTags = relsXml.match(/<Relationship\b[^>]*\/?>/gi) ?? [];
  const rel = relationshipTags.find((tag) => xmlAttribute(tag, "Id") === relationshipId);
  const target = clean(rel ? xmlAttribute(rel, "Target") : "");
  if (!target) return { path: null, warningLabel: null };
  const targetMode = clean(rel ? xmlAttribute(rel, "TargetMode") : "");
  const path = targetMode.toLowerCase() === "external" ? null : safeWorksheetPath(target);
  return {
    path,
    warningLabel: path
      ? null
      : `The XLSX worksheet relationship ${relationshipId} points outside readable workbook worksheets and was skipped.`,
  };
}

function cellValue(cellXml: string, sharedStrings: readonly string[]): string {
  const openTag = cellXml.match(/^<c\b[^>]*>/i)?.[0] ?? "";
  const type = clean(xmlAttribute(openTag, "t"));
  if (type === "s") {
    const index = Number.parseInt(valueTag(cellXml), 10);
    return Number.isFinite(index) ? clean(sharedStrings[index]) : "";
  }
  if (type === "inlineStr") return clean(textTags(cellXml).join(""));
  if (type === "b") return valueTag(cellXml) === "1" ? "TRUE" : "FALSE";
  return clean(valueTag(cellXml));
}

function tsvCell(value: string): string {
  return value.includes("\t") || value.includes("\n") || value.includes('"')
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

function parseWorksheetXml(
  sheetXml: string,
  sharedStrings: readonly string[],
  sheetName: string | null,
  workbookTruncated: boolean,
  hiddenSheetCount: number,
): WeddingXlsxParseResult {
  const rows: string[][] = [];
  let rowTruncated = false;
  let formulaCellCount = 0;
  for (const rowXml of tags(sheetXml, "row")) {
    if (rows.length >= WEDDING_IMPORT_MAX_SYNTHESIS_ROWS + 1) {
      rowTruncated = true;
      break;
    }
    const cells: string[] = [];
    for (const cellXml of tags(rowXml, "c")) {
      const openTag = cellXml.match(/^<c\b[^>]*>/i)?.[0] ?? "";
      const columnIndex = columnIndexFromCellRef(xmlAttribute(openTag, "r")) || cells.length;
      if (hasFormulaTag(cellXml)) formulaCellCount += 1;
      cells[columnIndex] = cellValue(cellXml, sharedStrings);
    }
    const compact = cells.map((value) => clean(value));
    if (compact.some(Boolean)) rows.push(compact);
  }
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const text = rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => tsvCell(clean(row[index]))).join("\t")
  ).join("\n");
  return {
    ok: rows.length > 1 && columnCount > 0,
    text,
    sheetName,
    rowCount: Math.max(0, rows.length - 1),
    columnCount,
    formulaCellCount,
    warningLabels: [
      rowTruncated ? `XLSX synthesis was capped at ${WEDDING_IMPORT_MAX_SYNTHESIS_ROWS} rows in-browser.` : null,
      workbookTruncated ? `Only the first ${WEDDING_IMPORT_MAX_XLSX_SHEETS} readable XLSX sheets were synthesized.` : null,
      hiddenSheetCount > 0 ? `${hiddenSheetCount} hidden XLSX sheet${hiddenSheetCount === 1 ? "" : "s"} skipped during browser synthesis.` : null,
      formulaCellCount > 0 ? `${formulaCellCount} formula cell${formulaCellCount === 1 ? "" : "s"} used cached workbook values; verify totals before acting.` : null,
    ].filter((label): label is string => Boolean(label)),
  };
}

export async function parseWeddingXlsxWorkbookArrayBuffer(arrayBuffer: ArrayBuffer): Promise<WeddingXlsxParseResult[]> {
  if (arrayBuffer.byteLength > WEDDING_IMPORT_MAX_TEXT_BYTES) {
    return [{
      ok: false,
      text: "",
      sheetName: null,
      rowCount: 0,
      columnCount: 0,
      formulaCellCount: 0,
      warningLabels: [`XLSX browser parsing is capped at ${Math.round(WEDDING_IMPORT_MAX_TEXT_BYTES / 1_000_000)} MB.`],
    }];
  }
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
    const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
    const sheets = workbookSheets(workbookXml);
    const hiddenSheetCount = sheets.filter((sheet) => sheet.hidden).length;
    const visibleSheets = sheets.filter((sheet) => !sheet.hidden);
    const selectedSheets = (visibleSheets.length > 0 ? visibleSheets : [{ name: "Sheet 1", relationshipId: null, hidden: false }]).slice(0, WEDDING_IMPORT_MAX_XLSX_SHEETS);
    const workbookTruncated = visibleSheets.length > selectedSheets.length;
    const sharedStrings = parseSharedStrings(await zip.file("xl/sharedStrings.xml")?.async("string"));
    const parsedSheets: WeddingXlsxParseResult[] = [];
    for (const [index, sheet] of selectedSheets.entries()) {
      const relationshipTarget = workbookRelationshipTarget(relsXml, sheet.relationshipId);
      const sheetPath = relationshipTarget.path ?? (sheet.relationshipId ? null : `xl/worksheets/sheet${index + 1}.xml`);
      const sheetXml = sheetPath ? await zip.file(sheetPath)?.async("string") : null;
      if (!sheetXml) {
        parsedSheets.push({
          ok: false,
          text: "",
          sheetName: sheet.name,
          rowCount: 0,
          columnCount: 0,
          formulaCellCount: 0,
          warningLabels: [
            relationshipTarget.warningLabel,
            `The XLSX workbook did not expose a readable worksheet for ${sheet.name ?? "the selected sheet"}.`,
            hiddenSheetCount > 0 ? `${hiddenSheetCount} hidden XLSX sheet${hiddenSheetCount === 1 ? "" : "s"} skipped during browser synthesis.` : null,
          ].filter((label): label is string => Boolean(label)),
        });
        continue;
      }
      parsedSheets.push(parseWorksheetXml(sheetXml, sharedStrings, sheet.name, workbookTruncated, hiddenSheetCount));
    }
    return parsedSheets.length > 0
      ? parsedSheets
      : [{
        ok: false,
        text: "",
        sheetName: null,
        rowCount: 0,
        columnCount: 0,
        formulaCellCount: 0,
        warningLabels: ["The XLSX workbook did not expose readable worksheets."],
      }];
  } catch {
    return [{
      ok: false,
      text: "",
      sheetName: null,
      rowCount: 0,
      columnCount: 0,
      formulaCellCount: 0,
      warningLabels: ["The XLSX workbook could not be parsed in the browser."],
    }];
  }
}

export async function parseWeddingXlsxArrayBuffer(arrayBuffer: ArrayBuffer): Promise<WeddingXlsxParseResult> {
  return (await parseWeddingXlsxWorkbookArrayBuffer(arrayBuffer))[0] ?? {
    ok: false,
    text: "",
    sheetName: null,
    rowCount: 0,
    columnCount: 0,
    formulaCellCount: 0,
    warningLabels: ["The XLSX workbook did not expose readable worksheets."],
  };
}

export async function weddingImportFileInputsFromBrowserFile(
  file: File,
  uploadReceipt: WeddingImportFileInput["uploadReceipt"] = null,
): Promise<WeddingImportFileInput[]> {
  const isModernSpreadsheet = /\.xlsx$/i.test(file.name) || /officedocument\.spreadsheetml\.sheet/i.test(file.type);
  const isLegacySpreadsheet = /\.xls$/i.test(file.name) || (/excel/i.test(file.type) && !isModernSpreadsheet);
  if (isModernSpreadsheet) {
    const parsedSheets = await parseWeddingXlsxWorkbookArrayBuffer(await file.arrayBuffer());
    const readableSheets = parsedSheets.filter((sheet) => sheet.ok);
    if (readableSheets.length === 0) return [{
      name: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      lastModified: file.lastModified,
      sourceKind: "spreadsheet",
      text: "",
      parsedSheetName: parsedSheets[0]?.sheetName ?? null,
      parserWarningLabels: parsedSheets.flatMap((sheet) => sheet.warningLabels),
      uploadReceipt,
    }];
    return readableSheets.map((parsed, index) => ({
      name: readableSheets.length === 1 ? file.name : `${file.name} - ${parsed.sheetName ?? `Sheet ${index + 1}`}`,
      mimeType: file.type,
      sizeBytes: file.size,
      lastModified: file.lastModified,
      sourceKind: "spreadsheet",
      text: parsed.text,
      parserName: "browser_xlsx_jszip",
      parsedSheetName: parsed.sheetName,
      parserFormulaCellCount: parsed.formulaCellCount,
      parserWarningLabels: parsed.warningLabels,
      uploadReceipt,
    }));
  }
  return [{
    name: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    lastModified: file.lastModified,
    sourceKind: isLegacySpreadsheet ? "spreadsheet" : null,
    text: !isLegacySpreadsheet && file.size <= WEDDING_IMPORT_MAX_TEXT_BYTES ? await file.text() : "",
    uploadReceipt,
  }];
}

export async function weddingImportFileInputFromBrowserFile(
  file: File,
  uploadReceipt: WeddingImportFileInput["uploadReceipt"] = null,
): Promise<WeddingImportFileInput> {
  return (await weddingImportFileInputsFromBrowserFile(file, uploadReceipt))[0] ?? {
    name: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    lastModified: file.lastModified,
    text: "",
    uploadReceipt,
  };
}
