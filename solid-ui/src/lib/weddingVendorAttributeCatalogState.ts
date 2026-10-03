// @locs-version: 2.0
// Admin-side view of the vendor attribute catalog: normalising what the server sends, building the
// editable rows for one vendor, and turning only the changed rows into a write payload.
import type { WeddingVendorAttributeEvidence, WeddingVendorAttributeStatus } from "@/lib/weddingVendorRankingState";

export type WeddingVendorAttributeKind = "bool" | "number" | "money" | "text" | "tags" | "enum" | "url" | "time";

export type WeddingVendorAttributeCatalogEntry = {
  key: string;
  label: string;
  kind: WeddingVendorAttributeKind;
  enumValues: string[];
  appliesTo: string[];
  group: string;
};

export type WeddingVendorAttributeFields = {
  attributes?: Record<string, WeddingVendorAttributeEvidence>;
};

export type WeddingVendorAttributeCatalogFields = {
  attributeCatalog?: WeddingVendorAttributeCatalogEntry[];
};

export type WeddingVendorAttributeWrite = {
  key: string;
  value: unknown;
  status: WeddingVendorAttributeStatus;
  confidence?: number | null;
  source_url?: string | null;
};

export type WeddingVendorAttributeWriteFields = {
  attributes?: WeddingVendorAttributeWrite[];
};

/** What the operator has typed for one attribute; strings because they come from form inputs. */
export type WeddingVendorAttributeEdit = {
  status: WeddingVendorAttributeStatus;
  valueText: string;
  sourceUrl: string;
};

export type WeddingVendorAttributeRow = {
  entry: WeddingVendorAttributeCatalogEntry;
  initial: WeddingVendorAttributeEdit;
  authority: string | null;
  confidence: number | null;
};

const KINDS = new Set<string>(["bool", "number", "money", "text", "tags", "enum", "url", "time"]);
const STATUSES = new Set<string>(["known", "estimated", "unknown", "not_applicable"]);
const GROUP_ORDER = ["feasibility", "commercial", "quality", "fit", "risk", "identity"];

export const WEDDING_VENDOR_ATTRIBUTE_STATUS_LABELS: Record<WeddingVendorAttributeStatus, string> = {
  known: "Known",
  estimated: "Estimated",
  unknown: "Unknown",
  not_applicable: "Not applicable",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

export function normalizeWeddingVendorAttributeCatalog(value: unknown): WeddingVendorAttributeCatalogEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): WeddingVendorAttributeCatalogEntry[] => {
    const entry = record(item);
    const key = clean(entry.key);
    const kind = clean(entry.kind);
    if (!key || !KINDS.has(kind)) return [];
    return [{
      key,
      label: clean(entry.label) || key,
      kind: kind as WeddingVendorAttributeKind,
      enumValues: strings(entry.enum_values),
      appliesTo: strings(entry.applies_to),
      group: clean(entry.group) || "other",
    }];
  });
}

function normalizeAttributeMap(value: unknown): Record<string, WeddingVendorAttributeEvidence> {
  const result: Record<string, WeddingVendorAttributeEvidence> = {};
  for (const [key, item] of Object.entries(record(value))) {
    const attribute = record(item);
    const status = clean(attribute.status);
    if (!STATUSES.has(status)) continue;
    result[key] = {
      status: status as WeddingVendorAttributeStatus,
      value: attribute.value ?? null,
      confidence: typeof attribute.confidence === "number" ? attribute.confidence : null,
      authority: clean(attribute.authority) || null,
      source_url: clean(attribute.source_url) || null,
    };
  }
  return result;
}

export function normalizeWeddingVendorAttributeFields(vendor: Record<string, unknown>): WeddingVendorAttributeFields {
  return { attributes: normalizeAttributeMap(vendor.attributes) };
}

export function normalizeWeddingVendorAttributeCatalogFields(response: Record<string, unknown>): WeddingVendorAttributeCatalogFields {
  return { attributeCatalog: normalizeWeddingVendorAttributeCatalog(response.attribute_catalog) };
}

function normalizedCategory(category: string): string {
  return category.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function valueTextFromEvidence(entry: WeddingVendorAttributeCatalogEntry, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (entry.kind === "tags") return Array.isArray(value) ? value.join(", ") : "";
  if (entry.kind === "bool") return value === true ? "true" : value === false ? "false" : "";
  return String(value);
}

function initialEdit(entry: WeddingVendorAttributeCatalogEntry, evidence: WeddingVendorAttributeEvidence | undefined): WeddingVendorAttributeEdit {
  return {
    status: evidence?.status ?? "unknown",
    valueText: evidence && (evidence.status === "known" || evidence.status === "estimated")
      ? valueTextFromEvidence(entry, evidence.value)
      : "",
    sourceUrl: evidence?.source_url ?? "",
  };
}

/** Rows for the keys that apply to the vendor's category, plus any key that already has a value. */
export function weddingVendorAttributeRows(input: {
  catalog: readonly WeddingVendorAttributeCatalogEntry[];
  attributes: Record<string, WeddingVendorAttributeEvidence> | undefined;
  category: string;
}): Array<{ group: string; rows: WeddingVendorAttributeRow[] }> {
  const category = normalizedCategory(input.category);
  const attributes = input.attributes ?? {};
  const visible = input.catalog.filter((entry) => {
    const stored = attributes[entry.key];
    const hasValue = stored && (stored.status === "known" || stored.status === "estimated");
    return hasValue || entry.appliesTo.length === 0 || entry.appliesTo.includes(category);
  });
  const groups = new Map<string, WeddingVendorAttributeRow[]>();
  for (const entry of visible) {
    const evidence = attributes[entry.key];
    const rows = groups.get(entry.group) ?? [];
    rows.push({
      entry,
      initial: initialEdit(entry, evidence),
      authority: evidence?.authority ?? null,
      confidence: evidence?.confidence ?? null,
    });
    groups.set(entry.group, rows);
  }
  const rank = (group: string) => {
    const index = GROUP_ORDER.indexOf(group);
    return index === -1 ? GROUP_ORDER.length : index;
  };
  return [...groups.entries()]
    .sort(([left], [right]) => rank(left) - rank(right) || left.localeCompare(right))
    .map(([group, rows]) => ({ group, rows }));
}

export function parseWeddingVendorAttributeValue(
  entry: WeddingVendorAttributeCatalogEntry,
  valueText: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const text = valueText.trim();
  const fail = (expected: string) => ({ ok: false as const, error: `${entry.label} needs ${expected}.` });
  switch (entry.kind) {
    case "bool":
      return text === "true" ? { ok: true, value: true } : text === "false" ? { ok: true, value: false } : fail("Yes or No");
    case "number":
    case "money": {
      const number = Number(text);
      return text !== "" && Number.isFinite(number) && number >= 0 ? { ok: true, value: number } : fail("a non-negative number");
    }
    case "tags": {
      const tags = text.split(",").map((tag) => tag.trim()).filter(Boolean);
      return tags.length > 0 ? { ok: true, value: tags } : fail("at least one comma-separated tag");
    }
    case "enum":
      return entry.enumValues.includes(text) ? { ok: true, value: text } : fail(`one of ${entry.enumValues.join(", ")}`);
    case "url":
      try {
        const url = new URL(text);
        return url.protocol === "http:" || url.protocol === "https:" ? { ok: true, value: text } : fail("a full http or https URL");
      } catch {
        return fail("a full http or https URL");
      }
    case "time":
      return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? { ok: true, value: text } : fail("a 24-hour time such as 23:00");
    default:
      return text !== "" ? { ok: true, value: text } : fail("some text");
  }
}

function sameEdit(left: WeddingVendorAttributeEdit, right: WeddingVendorAttributeEdit): boolean {
  const carriesValue = (status: WeddingVendorAttributeStatus) => status === "known" || status === "estimated";
  return left.status === right.status
    && left.sourceUrl.trim() === right.sourceUrl.trim()
    && (!carriesValue(left.status) || left.valueText.trim() === right.valueText.trim());
}

const OPERATOR_CONFIDENCE: Partial<Record<WeddingVendorAttributeStatus, number>> = { known: 0.95, estimated: 0.6 };

/** Only rows the operator changed are sent, so untouched evidence keeps its original authority. */
export function buildWeddingVendorAttributeWrites(input: {
  rows: ReadonlyArray<{ rows: readonly WeddingVendorAttributeRow[] }>;
  edits: Record<string, WeddingVendorAttributeEdit | undefined>;
}): { writes: WeddingVendorAttributeWrite[]; errors: string[] } {
  const writes: WeddingVendorAttributeWrite[] = [];
  const errors: string[] = [];
  for (const row of input.rows.flatMap((group) => group.rows)) {
    const edit = input.edits[row.entry.key];
    if (!edit || sameEdit(edit, row.initial)) continue;
    const carriesValue = edit.status === "known" || edit.status === "estimated";
    const sourceUrl = edit.sourceUrl.trim();
    if (!carriesValue) {
      writes.push({ key: row.entry.key, value: null, status: edit.status, confidence: null, source_url: sourceUrl || null });
      continue;
    }
    const parsed = parseWeddingVendorAttributeValue(row.entry, edit.valueText);
    if (!parsed.ok) {
      errors.push(parsed.error);
      continue;
    }
    writes.push({
      key: row.entry.key,
      value: parsed.value,
      status: edit.status,
      confidence: OPERATOR_CONFIDENCE[edit.status] ?? null,
      source_url: sourceUrl || null,
    });
  }
  return { writes, errors };
}
