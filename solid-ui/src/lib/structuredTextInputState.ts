// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export type DatabaseImportInputAnalysis = {
  format: "empty" | "json-array" | "json-object" | "csv" | "lines" | "invalid-json";
  rowCount: number;
  summary: string;
  error?: string;
};

export type DatabaseRecordContentAnalysis = {
  format: "empty" | "json" | "plain" | "invalid-json";
  summary: string;
  error?: string;
};

export type LineEntrySummary = {
  total: number;
  unique: number;
  duplicateCount: number;
  normalized: string[];
};

export function analyzeDatabaseImportInput(text: string): DatabaseImportInputAnalysis {
  const trimmed = text.trim();
  if (!trimmed) {
    return { format: "empty", rowCount: 0, summary: "Paste CSV or JSON to preview records." };
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = parseJsonValue(trimmed);
    if (!parsed.ok) {
      return {
        format: "invalid-json",
        rowCount: 0,
        summary: "Invalid JSON",
        error: "Fix the JSON syntax before importing.",
      };
    }
    if (Array.isArray(parsed.value)) {
      const records = parsed.value.filter(isRecord);
      return {
        format: "json-array",
        rowCount: records.length,
        summary: `JSON array - ${records.length} record${records.length === 1 ? "" : "s"}`,
      };
    }
    if (isRecord(parsed.value)) {
      return { format: "json-object", rowCount: 1, summary: "JSON object - 1 record" };
    }
    return {
      format: "invalid-json",
      rowCount: 0,
      summary: "JSON must be an object or array of objects",
      error: "Use a single object or an array of objects for import.",
    };
  }

  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return {
      format: "lines",
      rowCount: lines.length,
      summary: `Plain lines - ${lines.length} row${lines.length === 1 ? "" : "s"}`,
    };
  }

  const headers = lines[0].split(",").map((header) => header.trim()).filter(Boolean);
  return {
    format: "csv",
    rowCount: Math.max(0, lines.length - 1),
    summary: `CSV - ${Math.max(0, lines.length - 1)} row${lines.length === 2 ? "" : "s"} - ${headers.length} column${headers.length === 1 ? "" : "s"}`,
  };
}

export function analyzeDatabaseRecordContent(text: string): DatabaseRecordContentAnalysis {
  const trimmed = text.trim();
  if (!trimmed) {
    return { format: "empty", summary: "Enter plain text or valid JSON." };
  }
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = parseJsonValue(trimmed);
    if (!parsed.ok) {
      return {
        format: "invalid-json",
        summary: "Invalid JSON",
        error: "Fix the JSON syntax or remove the braces to save plain text.",
      };
    }
    return {
      format: "json",
      summary: Array.isArray(parsed.value) ? "Will save as JSON array" : "Will save as JSON object",
    };
  }
  return { format: "plain", summary: "Will save as plain text" };
}

export function summarizeLineEntries(text: string): LineEntrySummary {
  const normalized = text
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const unique = new Set(normalized);
  return {
    total: normalized.length,
    unique: unique.size,
    duplicateCount: normalized.length - unique.size,
    normalized: Array.from(unique),
  };
}
