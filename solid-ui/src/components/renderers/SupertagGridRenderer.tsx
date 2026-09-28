// @locs-version: 1.0
/**
 * SupertagGridRenderer — Notion/Airtable-style database view.
 *
 * UX batch 1–6: row badges, expand, CSV, skeleton, persistence, pinning, inline edit,
 *   group-by, highlighting, search, drag-reorder, col visibility, aggregates, duplicate,
 *   density, zebra, presets, notes, bulk select, sparklines, filter counts, rename,
 *   edit history, cross-grid link, multi-level sort, access indicator, col reorder,
 *   global search, row templates, conditional cell rules, minimap.
 * UX batch 7: row annotation pins (UX #31), column statistics bar (UX #32),
 *   clipboard paste row import (UX #33), row expiry / stale-row flag (UX #34),
 *   saved filter combinator AND/OR (UX #35).
 * Formula bar: SUM/AVG/MIN/MAX/MEDIAN/STDDEV + compound interest (FV/CAGR/PMT) +
 *   advanced IF conditional aggregation.
 */
import {
  createEffect, createMemo, createSignal, For, onCleanup, onMount, Show,
} from "solid-js";
import type { AfpMessage } from "@/lib/api";
import { queueUiCommand, safeHref } from "@/lib/api";
import { fetchInlineEntityExchangeRate } from "@/lib/inlineEntityExternalData";
import {
  buildGridMutationFailureReceipt,
  type GridMutationFailureReceipt,
} from "@/lib/gridMutationFailureState";
import {
  hasSupertagGridStorageQuotaHit,
  loadSupertagGridStored,
  saveSupertagGridStored,
  supertagGridStorageKey,
} from "@/lib/supertagGridLocalState";
import {
  normalizeSupertagGridRuntimeState,
  parseSupertagGridCrossRowDrop,
  parseSupertagGridShareHash,
} from "@/lib/supertagGridRuntimeState";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import {
  surfaceDateTimeLabel,
  surfaceDateTitleLabel,
  surfaceNoteHeaderTimestamp,
  surfaceTimeLabel,
} from "@/lib/surfaceTimestampPresentation";
import { A2UIFormulaField } from "@/components/renderers/A2UIFormulaField";
import { TiptapEditor } from "@/components/editor/TiptapEditor";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GridColumn {
  field: string;
  label: string;
  kind: "text" | "number" | "date" | "tag" | "formula" | "checkbox" | "url" | string;
  formula?: string;
  width?: number;
}

interface GridRow {
  ledger_id?: string;
  thread_id?: string;
  cells: Record<string, unknown>;
  supertags: string[];
}

interface HighlightRule {
  field: string;
  op: "eq" | "neq" | "gt" | "lt" | "contains" | "empty";
  value?: string;
  color: "red" | "amber" | "emerald" | "sky" | "violet";
}

type Density = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";
type DensityBucket = "compact" | "comfortable" | "spacious";
const DENSITY_MODES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;

interface SortKey { field: string; asc: boolean; }

interface EditHistoryEntry {
  ts: string; field: string; label: string; oldVal: string; newVal: string;
}

interface RowTemplate { name: string; values: Record<string, string>; }

interface CellRule {
  field: string;
  op: "gt" | "lt" | "eq" | "neq" | "contains" | "empty";
  value?: string;
  color: "red" | "amber" | "emerald" | "sky" | "violet";
}

interface GridPersistedState {
  sortKeys: SortKey[];
  colOrder: string[];
  activeFilters: string[];
  pinnedCols: string[];
  groupBy: boolean;
  hiddenCols: string[];
  density: Density;
  zebraStripe: boolean;
  filterCombinator?: "and" | "or";
}

interface ViewPreset { name: string; state: GridPersistedState; }

interface RowFormatRule {
  field: string;
  op: "gt" | "lt" | "eq" | "neq" | "contains" | "empty";
  value?: string;
  color: "red" | "amber" | "emerald" | "sky" | "violet";
}

interface FilterBookmark { name: string; filters: string[]; combinator: "and" | "or"; }

interface RowAnnotation { text: string; ts: string; }

interface ColVisRule {
  id: string;
  triggerField: string;
  op: "gt" | "lt" | "eq" | "neq" | "contains" | "empty";
  value: string;
  hideField: string;
}

interface CurrencyConversion {
  sourceCurrency: string;
  targetCurrency: string;
  rate: number;
  lastFetched: number; // Date.now()
  mode: "static" | "hourly" | "daily";
}

const MAJOR_CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "HKD", "SGD",
  "NZD", "INR", "MXN", "BRL", "ZAR", "KRW", "NOK", "SEK", "DKK", "PLN", "TRY", "SAR", "AED",
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function asStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseColumns(raw: unknown): GridColumn[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((c) => ({
    field: asStr(c.field),
    label: asStr(c.label) || asStr(c.field),
    kind: asStr(c.kind) || "text",
    formula: typeof c.formula === "string" ? c.formula : undefined,
    width: typeof c.width === "number" ? c.width : undefined,
  }));
}

function parseRows(raw: unknown): GridRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((r) => ({
    ledger_id: typeof r.ledger_id === "string" ? r.ledger_id : undefined,
    thread_id: typeof r.thread_id === "string" ? r.thread_id : undefined,
    cells: afpRecord(r.cells),
    supertags: Array.isArray(r.supertags)
      ? r.supertags.filter((t): t is string => typeof t === "string")
      : [],
  }));
}

function parseHighlightRules(raw: unknown): HighlightRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((r) => ({
    field: asStr(r.field),
    op: (asStr(r.op) || "eq") as HighlightRule["op"],
    value: typeof r.value === "string" ? r.value : undefined,
    color: (asStr(r.color) || "amber") as HighlightRule["color"],
  }));
}

function isStaleRow(row: GridRow): boolean {
  const exp = asStr(row.cells["_expires"] ?? row.cells["expires"]);
  if (!exp) return false;
  try { return new Date(exp) < new Date(); } catch { return false; }
}

function parseClipboardTable(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes("\t") ? "\t" : ",";
  return lines.map((line) => {
    if (sep === "\t") return line.split("\t").map((c) => c.trim());
    const cells: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQ = !inQ; }
      } else if (ch === "," && !inQ) { cells.push(cur); cur = ""; }
      else { cur += ch; }
    }
    cells.push(cur);
    return cells;
  });
}

function fmtNum(n: number): string {
  if (!isFinite(n)) return "—";
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(2);
}

// ── localStorage ──────────────────────────────────────────────────────────────

function gridDateLabel(timestamp: string): string {
  return surfaceDateTitleLabel(timestamp) || timestamp;
}

function gridDateTimeLabel(timestamp: string): string {
  return surfaceDateTimeLabel(timestamp) || timestamp;
}

function gridHistoryTimestampLabel(timestamp: string): string {
  return surfaceNoteHeaderTimestamp(timestamp) || timestamp;
}

function gridTimeLabel(timestamp: string | number | null | undefined): string {
  if (typeof timestamp === "number") {
    const date = new Date(timestamp);
    if (!Number.isNaN(date.getTime())) {
      const iso = date.toISOString();
      return surfaceTimeLabel(iso) || iso;
    }
    return String(timestamp);
  }
  return surfaceTimeLabel(timestamp) || timestamp || "";
}

const lsKey = supertagGridStorageKey;

function lsGet<T>(key: string, fallback: T): T {
  return loadSupertagGridStored(key, fallback);
}
let _lsQuotaHit = false;
function lsSet(key: string, v: unknown): boolean {
  const saved = saveSupertagGridStored(key, v);
  if (hasSupertagGridStorageQuotaHit()) _lsQuotaHit = true;
  return saved;
}

// ── Formula evaluator ─────────────────────────────────────────────────────────

function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// evalFormula: column names are substituted with their numeric values, then the
// resulting expression is validated against a strict numeric-operators-only
// whitelist before execution — no arbitrary code can reach new Function.
// Recursive-descent arithmetic parser — avoids new Function() / eval and CSP unsafe-eval.
// Grammar: expr = term (('+' | '-') term)*
//          term = factor (('*' | '/') factor)*
//          factor = '-' factor | '(' expr ')' | number
function parseArith(src: string): number {
  let pos = 0;
  function skip() { while (pos < src.length && src[pos] === " ") pos++; }
  function parseExpr(): number {
    let v = parseTerm();
    skip();
    while (pos < src.length && (src[pos] === "+" || src[pos] === "-")) {
      const op = src[pos++]; skip();
      const r = parseTerm();
      v = op === "+" ? v + r : v - r;
      skip();
    }
    return v;
  }
  function parseTerm(): number {
    let v = parseFactor();
    skip();
    while (pos < src.length && (src[pos] === "*" || src[pos] === "/")) {
      const op = src[pos++]; skip();
      const r = parseFactor();
      if (op === "/" && r === 0) throw new Error("div/0");
      v = op === "*" ? v * r : v / r;
      skip();
    }
    return v;
  }
  function parseFactor(): number {
    skip();
    if (src[pos] === "-") { pos++; return -parseFactor(); }
    if (src[pos] === "(") {
      pos++;
      const v = parseExpr();
      skip();
      if (src[pos] !== ")") throw new Error("expected )");
      pos++;
      return v;
    }
    const start = pos;
    while (pos < src.length && /[\d.]/.test(src[pos])) pos++;
    if (pos === start) throw new Error("expected number at " + pos);
    return parseFloat(src.slice(start, pos));
  }
  const result = parseExpr();
  skip();
  if (pos !== src.length) throw new Error("unexpected: " + src[pos]);
  return result;
}

function evalFormula(formula: string, cells: Record<string, unknown>): string | null {
  try {
    let expr = formula;
    for (const [key, val] of Object.entries(cells)) {
      const num = parseFloat(asStr(val));
      if (!isNaN(num)) expr = expr.replace(new RegExp(`\\b${escapeRegex(key)}\\b`, "g"), String(num));
    }
    // Strict whitelist before parsing: only digits, whitespace, arithmetic operators, parens, dot, comma
    if (!/^[\d\s+\-*/().,]+$/.test(expr)) return null;
    const result = parseArith(expr.replace(/,/g, ""));
    if (!isFinite(result)) return null;
    return result % 1 === 0 ? result.toLocaleString() : result.toFixed(2);
  } catch { return null; }
}

// ── CSV export ────────────────────────────────────────────────────────────────

function csvCell(v: unknown) {
  const s = asStr(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(title: string, columns: GridColumn[], rows: GridRow[]) {
  const header = ["Tags", ...columns.map((c) => c.label)].map(csvCell).join(",");
  const body = rows.map((row) => {
    const cells = columns.map((col) => {
      const v = row.cells[col.field];
      if (col.kind === "formula" && col.formula) return evalFormula(col.formula, row.cells) ?? asStr(v);
      return Array.isArray(v) ? (v as unknown[]).join("; ") : asStr(v);
    });
    return [row.supertags.join("; "), ...cells].map(csvCell).join(",");
  });
  const csv = [header, ...body].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `${title.replace(/\s+/g, "_")}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ── Conditional highlighting ──────────────────────────────────────────────────

const HIGHLIGHT_CLASSES: Record<string, string> = {
  red:     "border-l-2 border-l-red-400/70 !bg-red-500/5",
  amber:   "border-l-2 border-l-amber-400/70 !bg-amber-500/5",
  emerald: "border-l-2 border-l-emerald-400/70 !bg-emerald-500/5",
  sky:     "border-l-2 border-l-sky-400/70 !bg-sky-500/5",
  violet:  "border-l-2 border-l-violet-400/70 !bg-violet-500/5",
};

const CELL_RULE_CLASSES: Record<string, string> = {
  red:     "bg-red-500/15 text-red-200",
  amber:   "bg-amber-500/15 text-amber-200",
  emerald: "bg-emerald-500/15 text-emerald-200",
  sky:     "bg-sky-500/15 text-sky-200",
  violet:  "bg-violet-500/15 text-violet-200",
};
const CELL_RULE_DOT: Record<string, string> = {
  red: "bg-red-400", amber: "bg-amber-400", emerald: "bg-emerald-400", sky: "bg-sky-400", violet: "bg-violet-400",
};

function evalRule(cell: string, op: string, value = ""): boolean {
  switch (op) {
    case "gt": return parseFloat(cell) > parseFloat(value);
    case "lt": return parseFloat(cell) < parseFloat(value);
    case "eq": return cell === value;
    case "neq": return cell !== value;
    case "contains": return cell.toLowerCase().includes(value.toLowerCase());
    case "empty": return cell === "";
    default: return false;
  }
}

function rowHighlightClass(row: GridRow, rules: HighlightRule[]): string {
  for (const rule of rules) {
    if (evalRule(asStr(row.cells[rule.field]), rule.op, rule.value))
      return HIGHLIGHT_CLASSES[rule.color] ?? "";
  }
  return "";
}

function cellRuleClass(value: unknown, field: string, rules: CellRule[]): string {
  for (const rule of rules) {
    if (rule.field === field && evalRule(asStr(value), rule.op, rule.value))
      return CELL_RULE_CLASSES[rule.color] ?? "";
  }
  return "";
}

// ── Tag colours ───────────────────────────────────────────────────────────────

const TAG_PALETTE = [
  "bg-violet-500/20 text-violet-300 border-violet-400/30",
  "bg-sky-500/20 text-sky-300 border-sky-400/30",
  "bg-emerald-500/20 text-emerald-300 border-emerald-400/30",
  "bg-amber-500/20 text-amber-300 border-amber-400/30",
  "bg-rose-500/20 text-rose-300 border-rose-400/30",
  "bg-pink-500/20 text-pink-300 border-pink-400/30",
  "bg-cyan-500/20 text-cyan-300 border-cyan-400/30",
];

function tagColor(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xffff;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

function TagPill(props: { label: string; small?: boolean }) {
  return (
    <span class={`inline-flex items-center rounded-full border px-[0.45em] py-[0.1em] font-medium ${props.small ? "text-[0.58rem]" : "text-[0.65rem]"} ${tagColor(props.label)}`}>
      {props.label}
    </span>
  );
}

function normalizeDensity(value: unknown): Density {
  if (value === "compact") return "3";
  if (value === "comfortable") return "7";
  if (value === "spacious") return "10";
  const normalized = typeof value === "number" ? String(Math.round(value)) : String(value ?? "").trim();
  return DENSITY_MODES.includes(normalized as Density) ? normalized as Density : "7";
}

function densityBucket(d: Density): DensityBucket {
  const level = Number(d);
  if (level <= 4) return "compact";
  if (level >= 9) return "spacious";
  return "comfortable";
}

function densityScaleLabel(d: Density): string {
  if (d === "1") return "A";
  if (d === "10") return "A";
  return "";
}

function densityScaleLabelClass(d: Density): string {
  if (d === "1") return "text-[0.55rem] leading-none";
  if (d === "10") return "text-sm leading-none";
  return "h-1.5 w-1.5 rounded-full bg-current opacity-70";
}

function densityPadding(d: Density) {
  const bucket = densityBucket(d);
  if (bucket === "compact") return "4px 12px";
  if (bucket === "spacious") return "14px 12px";
  return "8px 12px";
}

// ── Cell renderer ─────────────────────────────────────────────────────────────

function CellContent(props: { col: GridColumn; value: unknown; cells: Record<string, unknown> }) {
  const v = () => props.value;
  if (props.col.kind === "checkbox")
    return <span class={`inline-block w-3.5 h-3.5 rounded border ${v() ? "bg-emerald-500 border-emerald-400" : "border-white/30 bg-white/5"}`} />;
  if (props.col.kind === "tag") {
    const tags = () => Array.isArray(v()) ? (v() as unknown[]).map(String)
      : asStr(v()).split(",").map((t) => t.trim()).filter(Boolean);
    return <div class="flex flex-wrap gap-1"><For each={tags()}>{(t) => <TagPill label={t} small />}</For></div>;
  }
  if (props.col.kind === "date") {
    const raw = asStr(v()); if (!raw) return <span class="text-on-surface-variant/40">—</span>;
    try { const d = new Date(raw); if (isNaN(d.getTime())) return <span>{raw}</span>;
      return <span class="whitespace-nowrap text-on-surface-variant">{gridDateLabel(raw)}</span>;
    } catch { return <span>{raw}</span>; }
  }
  if (props.col.kind === "url") {
    const url = asStr(v()); if (!url) return <span class="text-on-surface-variant/40">—</span>;
    return <a href={safeHref(url)} target="_blank" rel="noopener noreferrer" class="truncate text-sky-400 hover:underline">{url.replace(/^https?:\/\//, "")}</a>;
  }
  if (props.col.kind === "number") {
    const n = parseFloat(asStr(v())); if (isNaN(n)) return <span class="text-on-surface-variant/40">—</span>;
    return <span class="tabular-nums">{n.toLocaleString()}</span>;
  }
  if (props.col.kind === "formula") {
    const evaluated = props.col.formula ? evalFormula(props.col.formula, props.cells) : null;
    if (evaluated !== null) return <span class="tabular-nums font-medium text-amber-200">{evaluated}</span>;
    const latex = props.col.formula ?? asStr(v());
    if (!latex) return <span class="text-on-surface-variant/40">—</span>;
    return <span class="font-mono text-xs text-amber-300/70" title={latex}>ƒ {latex.length > 18 ? latex.slice(0, 18) + "…" : latex}</span>;
  }
  const text = asStr(v());
  return text ? <span class="truncate">{text}</span> : <span class="text-on-surface-variant/40">—</span>;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRows(props: { colCount: number; count?: number }) {
  return (
    <For each={Array.from({ length: props.count ?? 4 })}>
      {(_, i) => (
        <tr class={`border-t border-white/8 ${i() % 2 === 1 ? "bg-white/[0.02]" : ""}`}>
          <For each={Array.from({ length: props.colCount + 1 })}>
            {(__, j) => <td class="px-3 py-2.5"><div class={`h-3 rounded-full animate-pulse bg-white/10 ${j() === 0 ? "w-16" : j() % 3 === 0 ? "w-12" : j() % 2 === 0 ? "w-24" : "w-20"}`} /></td>}
          </For>
        </tr>
      )}
    </For>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FormulaColumnModal(props: { col: GridColumn; onClose: () => void }) {
  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={props.onClose}>
      <div class="w-full max-w-lg mx-4 glass-surface rounded-2xl border border-white/20 p-5 shadow-panel" onClick={(e) => e.stopPropagation()}>
        <div class="flex items-center justify-between mb-4">
          <p class="font-semibold text-on-surface">{props.col.label}</p>
          <button type="button" class="text-on-surface-variant hover:text-on-surface transition text-lg leading-none" onClick={props.onClose}>✕</button>
        </div>
        <A2UIFormulaField title="Column formula" label="LaTeX" value={props.col.formula ?? ""} mode="display" />
      </div>
    </div>
  );
}

function RowDetailPanel(props: { row: GridRow; columns: GridColumn[]; colSpan: number; onClose: () => void }) {
  const allFields = () => {
    const declared = new Set(props.columns.map((c) => c.field));
    const extra = Object.keys(props.row.cells).filter((k) => !declared.has(k));
    return [...props.columns, ...extra.map((k) => ({ field: k, label: k, kind: "text" as const }))];
  };
  return (
    <tr><td colSpan={props.colSpan} class="px-0 pb-0 pt-0">
      <div class="mx-3 mb-3 rounded-xl border border-white/15 bg-white/[0.04] overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 border-b border-white/8">
          <div class="flex flex-wrap gap-1"><For each={props.row.supertags}>{(t) => <TagPill label={t} />}</For></div>
          <button type="button" class="text-[0.65rem] text-on-surface-variant hover:text-on-surface transition" onClick={props.onClose}>✕ close</button>
        </div>
        <div class="grid grid-cols-2 gap-x-6 gap-y-1.5 px-4 py-3">
          <For each={allFields()}>{(col) => (<>
            <span class="font-mono text-[0.6rem] uppercase tracking-[0.15em] text-outline self-center">{col.label}</span>
            <span class="text-sm text-on-surface break-words"><CellContent col={col} value={props.row.cells[col.field]} cells={props.row.cells} /></span>
          </>)}</For>
          <Show when={props.row.ledger_id}>
            <span class="font-mono text-[0.6rem] uppercase tracking-[0.15em] text-outline self-center">Ledger</span>
            <span class="font-mono text-[0.6rem] text-on-surface-variant/50">{props.row.ledger_id}</span>
          </Show>
        </div>
      </div>
    </td></tr>
  );
}

function GroupHeader(props: { tag: string; count: number; colSpan: number; collapsed: boolean; onToggle: () => void }) {
  return (
    <tr class="border-t border-white/15 bg-white/[0.035] cursor-pointer select-none" onClick={props.onToggle}>
      <td colSpan={props.colSpan} class="px-3 py-1.5">
        <div class="flex items-center gap-2">
          <span class="text-[0.6rem] text-on-surface-variant">{props.collapsed ? "▶" : "▼"}</span>
          <TagPill label={props.tag} />
          <span class="text-[0.6rem] text-on-surface-variant/60 font-mono">{props.count} {props.count === 1 ? "row" : "rows"}</span>
        </div>
      </td>
    </tr>
  );
}

function SelectAllCheckbox(props: { allSelected: boolean; someSelected: boolean; onToggle: (v: boolean) => void }) {
  let el!: HTMLInputElement;
  createEffect(() => { el.indeterminate = props.someSelected && !props.allSelected; });
  return <input type="checkbox" ref={el} class="w-3.5 h-3.5 rounded accent-primary cursor-pointer" checked={props.allSelected} onChange={(e) => props.onToggle(e.currentTarget.checked)} />;
}

function ColumnSparkline(props: { values: number[] }) {
  const bars = () => {
    const vals = props.values; if (vals.length < 2) return null;
    const min = Math.min(...vals), max = Math.max(...vals); if (min === max) return null;
    const N = 8; const buckets = new Array<number>(N).fill(0);
    for (const v of vals) { const idx = Math.min(Math.floor(((v - min) / (max - min)) * N), N - 1); buckets[idx]++; }
    const peak = Math.max(...buckets);
    return buckets.map((c, i) => ({ x: i * 5, h: peak > 0 ? Math.max(2, Math.round((c / peak) * 12)) : 2 }));
  };
  return (
    <Show when={bars() !== null}>
      <svg width="40" height="12" style="display:block;margin-top:3px" class="opacity-25 group-hover/th:opacity-60 transition-opacity">
        <For each={bars()!}>{(bar) => <rect x={bar.x} y={12 - bar.h} width="4" height={bar.h} rx="0.5" fill="rgb(56 189 248)" />}</For>
      </svg>
    </Show>
  );
}

function EditHistoryPanel(props: { entries: EditHistoryEntry[]; colSpan: number; onClose: () => void }) {
  return (
    <tr><td colSpan={props.colSpan} class="px-3 pb-2 pt-0" onClick={(e) => e.stopPropagation()}>
      <div class="mt-0.5 rounded-lg border border-sky-400/20 bg-sky-500/5 px-3 py-2">
        <div class="flex items-center justify-between mb-1.5">
          <p class="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-outline">Edit history</p>
          <button type="button" class="text-[0.6rem] text-on-surface-variant/50 hover:text-on-surface-variant" onClick={props.onClose}>✕</button>
        </div>
        <div class="space-y-1">
          <For each={[...props.entries].reverse()}>{(entry) => (
            <div class="flex items-baseline gap-2 text-[0.65rem]">
              <span class="text-on-surface-variant/50 font-mono shrink-0 w-28 truncate">
                {gridHistoryTimestampLabel(entry.ts)}
              </span>
              <span class="text-outline shrink-0 truncate max-w-[60px]">{entry.label}</span>
              <span class="text-on-surface-variant/50 line-through truncate max-w-[80px]">{entry.oldVal || "—"}</span>
              <span class="text-sky-300 truncate max-w-[120px]">→ {entry.newVal}</span>
            </div>
          )}</For>
        </div>
      </div>
    </td></tr>
  );
}

function MinimapStrip(props: {
  rows: GridRow[];
  highlightRules: HighlightRule[];
  selected: Set<string>;
  editHistory: Record<string, EditHistoryEntry[]>;
  rowKeys: string[];
  scrollRatio: number;
  viewportRatio: number;
  onSeek: (r: number) => void;
}) {
  const H = 280; const W = 10;
  const barH = () => Math.max(1, H / Math.max(1, props.rows.length));
  const thumbH = () => Math.max(16, props.viewportRatio * H);
  const thumbY = () => props.scrollRatio * (H - thumbH());
  return (
    <svg width={W} height={H} class="shrink-0 rounded cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
      style={{ "min-height": `${H}px` }}
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); props.onSeek((e.clientY - r.top) / r.height); }}>
      <rect width={W} height={H} fill="rgba(255,255,255,0.04)" rx="3" />
      <For each={props.rows}>{(row, i) => {
        const y = () => i() * barH();
        const hl = rowHighlightClass(row, props.highlightRules);
        const key = props.rowKeys[i()] ?? "";
        const color = () => {
          if (props.selected.has(key)) return "rgba(99,102,241,0.7)";
          if ((props.editHistory[key]?.length ?? 0) > 0) return "rgba(56,189,248,0.5)";
          if (isStaleRow(row)) return "rgba(251,146,60,0.6)";
          if (hl.includes("red")) return "rgba(248,113,113,0.5)";
          if (hl.includes("amber")) return "rgba(251,191,36,0.5)";
          if (hl.includes("emerald")) return "rgba(52,211,153,0.5)";
          return "rgba(255,255,255,0.18)";
        };
        return <rect x="1" y={y()} width={W - 2} height={Math.max(1, barH() - 0.5)} fill={color()} rx="0.5" />;
      }}</For>
      <rect x="0" y={thumbY()} width={W} height={thumbH()} fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" stroke-width="0.5" rx="2" />
    </svg>
  );
}

function ColumnMenuPopover(props: {
  columns: GridColumn[]; hiddenCols: Set<string>; density: Density; zebraStripe: boolean;
  onToggleCol: (f: string) => void; onDensity: (d: Density) => void; onZebra: () => void; onClose: () => void;
}) {
  return (
    <div class="absolute right-0 top-full mt-1.5 z-[200] w-52 rounded-2xl border border-white/30 bg-white/95 py-2 shadow-2xl backdrop-blur-md" onClick={(e) => e.stopPropagation()}>
      <p class="px-3 pt-1 pb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-on-surface-variant/50">Columns</p>
      <For each={props.columns}>{(col) => (
        <button type="button" class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-on-surface-variant hover:bg-white/60 transition" onClick={() => props.onToggleCol(col.field)}>
          <span class={`inline-block h-3.5 w-3.5 rounded border flex-shrink-0 transition ${!props.hiddenCols.has(col.field) ? "bg-primary border-primary" : "border-white/40 bg-transparent"}`} />
          {col.label}
        </button>
      )}</For>
      <div class="mx-3 my-2 border-t border-white/30" />
      <p class="px-3 pb-1 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-on-surface-variant/50">Density</p>
      <div class="grid grid-cols-5 gap-1 px-3 pb-1.5">
        {DENSITY_MODES.map((d) => (
          <button type="button" class={`inline-flex min-h-7 items-center justify-center rounded-lg border text-[0.6rem] font-medium transition ${props.density === d ? "border-primary/60 bg-primary/10 text-primary" : "border-white/30 text-on-surface-variant hover:bg-white/50"}`} onClick={() => props.onDensity(d)} aria-pressed={props.density === d} aria-label={`Text density ${d} of 10`} title={`Text density ${d} of 10`}>
            <span class={densityScaleLabelClass(d)}>{densityScaleLabel(d)}</span>
          </button>
        ))}
      </div>
      <div class="mx-3 my-1 border-t border-white/30" />
      <button type="button" class="flex w-full items-center justify-between px-3 py-1.5 text-xs text-on-surface-variant hover:bg-white/60 transition" onClick={props.onZebra}>
        <span>Zebra rows</span>
        <span class={`h-3 w-6 rounded-full transition ${props.zebraStripe ? "bg-primary" : "bg-white/40"}`} />
      </button>
    </div>
  );
}

function PresetPopover(props: {
  presets: ViewPreset[]; presetName: string;
  onNameInput: (v: string) => void; onSave: () => void;
  onLoad: (p: ViewPreset) => void; onDelete: (n: string) => void; onClose: () => void;
}) {
  return (
    <div class="absolute right-0 top-full mt-1.5 z-[200] w-60 rounded-2xl border border-white/30 bg-white/95 py-2 shadow-2xl backdrop-blur-md" onClick={(e) => e.stopPropagation()}>
      <p class="px-3 pt-1 pb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-on-surface-variant/50">Save current view</p>
      <div class="flex items-center gap-1.5 px-3 pb-2">
        <input type="text" placeholder="Preset name…" class="flex-1 rounded-md border border-white/30 bg-white/60 text-xs text-on-surface px-2 py-1 outline-none focus:border-sky-400/60"
          value={props.presetName} onInput={(e) => props.onNameInput(e.currentTarget.value)} onKeyDown={(e) => {
            if (e.key === "Enter") {
              recordShortcutUse("form_submit");
              props.onSave();
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              recordShortcutUse("form_cancel");
              props.onClose();
            }
          }} />
        <button type="button" disabled={!props.presetName.trim()} class="rounded-md border border-white/30 bg-primary/10 px-2 py-1 text-[0.65rem] font-medium text-primary hover:bg-primary/20 disabled:opacity-40 transition" onClick={props.onSave}>Save</button>
      </div>
      <Show when={props.presets.length > 0}>
        <div class="mx-3 my-1 border-t border-white/30" />
        <p class="px-3 py-1 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-on-surface-variant/50">Saved presets</p>
        <For each={props.presets}>{(preset) => (
          <div class="group flex items-center gap-1 px-3 py-1 hover:bg-white/40 transition">
            <button type="button" class="flex-1 text-left text-xs text-on-surface-variant hover:text-on-surface truncate" onClick={() => { props.onLoad(preset); props.onClose(); }}>{preset.name}</button>
            <button type="button" class="opacity-0 group-hover:opacity-100 text-[0.6rem] text-on-surface-variant/60 hover:text-red-400 transition shrink-0" onClick={() => props.onDelete(preset.name)}>✕</button>
          </div>
        )}</For>
      </Show>
    </div>
  );
}

function TemplatesPopover(props: { templates: RowTemplate[]; onApply: (t: RowTemplate) => void; onDelete: (n: string) => void; onClose: () => void }) {
  return (
    <div class="absolute right-0 top-full mt-1.5 z-[200] w-56 rounded-2xl border border-white/30 bg-white/95 py-2 shadow-2xl backdrop-blur-md" onClick={(e) => e.stopPropagation()}>
      <p class="px-3 pt-1 pb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-on-surface-variant/50">Row templates</p>
      <Show when={props.templates.length === 0}>
        <p class="px-3 pb-2 text-[0.65rem] text-on-surface-variant/50 italic">None saved. Fill an add-row form and click 💾.</p>
      </Show>
      <For each={props.templates}>{(t) => (
        <div class="group flex items-center gap-1 px-3 py-1.5 hover:bg-white/40 transition">
          <button type="button" class="flex-1 text-left text-xs text-on-surface-variant hover:text-on-surface truncate" onClick={() => { props.onApply(t); props.onClose(); }}>{t.name}</button>
          <button type="button" class="opacity-0 group-hover:opacity-100 text-[0.6rem] text-on-surface-variant/60 hover:text-red-400 transition shrink-0" onClick={() => props.onDelete(t.name)}>✕</button>
        </div>
      )}</For>
    </div>
  );
}

function CellRulePopover(props: { field: string; label: string; rules: CellRule[]; onAdd: (r: CellRule) => void; onDelete: (i: number) => void; onClose: () => void }) {
  const [op, setOp] = createSignal<CellRule["op"]>("gt");
  const [val, setVal] = createSignal("");
  const [color, setColor] = createSignal<CellRule["color"]>("amber");
  const fieldRules = () => props.rules.filter((r) => r.field === props.field);
  return (
    <div class="absolute right-0 top-full mt-1.5 z-[300] w-64 rounded-2xl border border-white/30 bg-white/95 py-2 shadow-2xl backdrop-blur-md" onClick={(e) => e.stopPropagation()}>
      <p class="px-3 pt-1 pb-1 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-on-surface-variant/50">Cell rules — {props.label}</p>
      <Show when={fieldRules().length > 0}>
        <For each={props.rules}>{(rule, i) => {
          if (rule.field !== props.field) return null;
          return (
            <div class="flex items-center gap-2 px-3 py-1 text-[0.65rem] text-on-surface-variant">
              <span class={`w-2 h-2 rounded-full shrink-0 ${CELL_RULE_DOT[rule.color]}`} />
              <span class="flex-1 truncate">{rule.op} {rule.value ?? ""}</span>
              <button type="button" class="text-[0.6rem] hover:text-red-400 transition" onClick={() => props.onDelete(i())}>✕</button>
            </div>
          );
        }}</For>
        <div class="mx-3 my-1 border-t border-white/30" />
      </Show>
      <div class="px-3 pb-1.5 space-y-1.5">
        <select class="w-full rounded border border-white/30 bg-white/60 text-xs text-on-surface px-1 py-0.5 outline-none"
          value={op()} onChange={(e) => setOp(e.currentTarget.value as CellRule["op"])}>
          <option value="gt">&gt; greater than</option>
          <option value="lt">&lt; less than</option>
          <option value="eq">= equals</option>
          <option value="neq">≠ not equals</option>
          <option value="contains">⊃ contains</option>
          <option value="empty">∅ is empty</option>
        </select>
        <Show when={op() !== "empty"}>
          <input type="text" placeholder="value…" class="w-full rounded border border-white/30 bg-white/60 text-xs text-on-surface px-2 py-0.5 outline-none focus:border-sky-400/60"
            value={val()} onInput={(e) => setVal(e.currentTarget.value)} onKeyDown={(e) => {
              if (e.key === "Enter") {
                recordShortcutUse("form_submit");
                props.onAdd({ field: props.field, op: op(), value: val() || undefined, color: color() });
                setVal("");
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                recordShortcutUse("form_cancel");
                props.onClose();
              }
            }} />
        </Show>
        <div class="flex items-center gap-1.5">
          <span class="text-[0.6rem] text-on-surface-variant/60 shrink-0">Color:</span>
          {(["red", "amber", "emerald", "sky", "violet"] as const).map((c) => (
            <button type="button" class={`w-3.5 h-3.5 rounded-full transition ${CELL_RULE_DOT[c]} ${color() === c ? "ring-2 ring-white/60 ring-offset-1" : "opacity-50 hover:opacity-100"}`} onClick={() => setColor(c)} />
          ))}
          <div class="flex-1" />
          <button type="button" class="text-[0.65rem] border border-white/30 bg-primary/10 px-2 py-0.5 rounded-md text-primary hover:bg-primary/20 transition"
            onClick={() => { props.onAdd({ field: props.field, op: op(), value: op() === "empty" ? undefined : val() || undefined, color: color() }); setVal(""); }}>Add</button>
        </div>
      </div>
    </div>
  );
}

// ── Row Format Rules Panel (UX #38) ──────────────────────────────────────────

function RowFormatRulesPanel(props: {
  columns: GridColumn[];
  rules: RowFormatRule[];
  onAdd: (r: RowFormatRule) => void;
  onDelete: (i: number) => void;
  onClose: () => void;
}) {
  const [field, setField] = createSignal(props.columns[0]?.field ?? "");
  const [op, setOp] = createSignal<RowFormatRule["op"]>("gt");
  const [val, setVal] = createSignal("");
  const [color, setColor] = createSignal<RowFormatRule["color"]>("amber");
  return (
    <div class="rounded-xl border border-amber-400/20 bg-amber-500/[0.04] px-3 py-2.5 space-y-2 text-xs" onClick={(e) => e.stopPropagation()}>
      <div class="flex items-center justify-between">
        <p class="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-amber-400/70">Row format rules</p>
        <button type="button" class="text-[0.6rem] text-on-surface-variant/40 hover:text-on-surface-variant" onClick={props.onClose}>✕</button>
      </div>
      <Show when={props.rules.length > 0}>
        <div class="space-y-0.5">
          <For each={props.rules}>{(rule, i) => (
            <div class="flex items-center gap-2 text-[0.65rem]">
              <span class={`w-2 h-2 rounded-full shrink-0 ${CELL_RULE_DOT[rule.color]}`} />
              <span class="text-outline shrink-0 truncate max-w-[60px]">{props.columns.find((c) => c.field === rule.field)?.label ?? rule.field}</span>
              <span class="text-on-surface-variant flex-1 truncate">{rule.op} {rule.value ?? ""}</span>
              <button type="button" class="text-[0.6rem] hover:text-red-400 transition shrink-0" onClick={() => props.onDelete(i())}>✕</button>
            </div>
          )}</For>
        </div>
        <div class="border-t border-white/10" />
      </Show>
      <div class="flex flex-wrap gap-1.5 items-end">
        <select class="rounded border border-white/20 bg-black/30 text-xs text-on-surface px-1 py-0.5 outline-none"
          value={field()} onChange={(e) => setField(e.currentTarget.value)}>
          <For each={props.columns}>{(c) => <option value={c.field}>{c.label}</option>}</For>
        </select>
        <select class="rounded border border-white/20 bg-black/30 text-xs text-on-surface px-1 py-0.5 outline-none"
          value={op()} onChange={(e) => setOp(e.currentTarget.value as RowFormatRule["op"])}>
          <option value="gt">&gt;</option><option value="lt">&lt;</option>
          <option value="eq">=</option><option value="neq">≠</option>
          <option value="contains">contains</option><option value="empty">empty</option>
        </select>
        <Show when={op() !== "empty"}>
          <input type="text" placeholder="value…" class="w-16 rounded border border-white/20 bg-black/30 text-xs text-on-surface px-1.5 py-0.5 outline-none focus:border-amber-400/50"
            value={val()} onInput={(e) => setVal(e.currentTarget.value)} />
        </Show>
        <div class="flex items-center gap-1">
          {(["red", "amber", "emerald", "sky", "violet"] as const).map((c) => (
            <button type="button" class={`w-3 h-3 rounded-full transition ${CELL_RULE_DOT[c]} ${color() === c ? "ring-2 ring-white/60" : "opacity-50 hover:opacity-100"}`} onClick={() => setColor(c)} />
          ))}
        </div>
        <button type="button" class="text-[0.65rem] border border-amber-400/30 text-amber-300/80 rounded-full px-2 py-0.5 hover:bg-amber-500/10 transition"
          onClick={() => { props.onAdd({ field: field(), op: op(), value: op() === "empty" ? undefined : val() || undefined, color: color() }); setVal(""); }}>
          + Add rule
        </button>
      </div>
    </div>
  );
}

// ── Formula Bar ───────────────────────────────────────────────────────────────

function evalCrossColExpr(expr: string, rows: GridRow[]): { results: number[]; error: string | null } {
  // Replace column field names with their numeric row values, then evaluate per row.
  // Only pure numeric arithmetic is permitted (same whitelist as evalFormula).
  const results: number[] = [];
  for (const row of rows) {
    let e = expr;
    for (const [key, val] of Object.entries(row.cells)) {
      const n = parseFloat(asStr(val));
      if (!isNaN(n)) e = e.replace(new RegExp(`\\b${escapeRegex(key)}\\b`, "g"), String(n));
    }
    if (!/^[\d\s+\-*/().,]+$/.test(e)) continue;
    try {
      const r = parseArith(e.replace(/,/g, ""));
      if (isFinite(r)) results.push(r);
    } catch { /* skip row */ }
  }
  return { results, error: results.length === 0 ? "No numeric results" : null };
}

function FormulaBar(props: {
  effectiveCols: GridColumn[];
  rows: GridRow[];
  viewId: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const LS_KEY = () => lsKey(props.viewId, "fbar");
  const numericCols = () => props.effectiveCols.filter((c) => c.kind === "number" || c.kind === "formula");
  const saved = lsGet<{ col?: string; rate?: string; nPeriods?: string }>(lsKey(props.viewId, "fbar"), {});
  const [col, setCol] = createSignal(saved.col ?? "");
  const [advancedOpen, setAdvancedOpen] = createSignal(false);
  const [rate, setRate] = createSignal(saved.rate ?? "7");
  const [nPeriods, setNPeriods] = createSignal(saved.nPeriods ?? "10");
  const [pvOverride, setPvOverride] = createSignal("");
  const [ifOp, setIfOp] = createSignal<CellRule["op"]>("gt");
  const [ifVal, setIfVal] = createSignal("");
  const [ifThenAgg, setIfThenAgg] = createSignal<"count" | "sum" | "avg">("count");
  const [ifElseAgg, setIfElseAgg] = createSignal<"count" | "sum" | "avg">("count");
  const [exprMode, setExprMode] = createSignal(false);
  const [crossExpr, setCrossExpr] = createSignal("");

  createEffect(() => { lsSet(LS_KEY(), { col: col(), rate: rate(), nPeriods: nPeriods() }); });

  // Auto-select first numeric column when list is available
  createEffect(() => {
    const first = numericCols()[0]?.field;
    if (first && !col()) setCol(first);
  });

  const colDef = () => props.effectiveCols.find((c) => c.field === col());
  const colLabel = () => colDef()?.label ?? col();

  const nums = createMemo((): number[] => {
    const field = col(); if (!field) return [];
    const cd = colDef();
    return props.rows.flatMap((r) => {
      if (cd?.kind === "formula" && cd.formula) {
        const ev = evalFormula(cd.formula, r.cells);
        const n = ev !== null ? parseFloat(ev) : NaN;
        return isNaN(n) ? [] : [n];
      }
      const n = parseFloat(asStr(r.cells[field]));
      return isNaN(n) ? [] : [n];
    });
  });

  const stats = createMemo(() => {
    const ns = nums(); if (!ns.length) return null;
    const sum = ns.reduce((a, b) => a + b, 0);
    const mean = sum / ns.length;
    const sorted = [...ns].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const variance = ns.reduce((a, b) => a + (b - mean) ** 2, 0) / ns.length;
    return { sum, mean, median, min: sorted[0], max: sorted[sorted.length - 1], stddev: Math.sqrt(variance), count: ns.length, total: props.rows.length };
  });

  const fv = createMemo(() => {
    const s = stats(); if (!s) return null;
    const r = parseFloat(rate()) / 100, n = parseInt(nPeriods());
    const pv = pvOverride() ? parseFloat(pvOverride()) : s.sum;
    if (isNaN(r) || isNaN(n) || isNaN(pv)) return null;
    return pv * Math.pow(1 + r, n);
  });

  const cagr = createMemo(() => {
    const ns = nums(); if (ns.length < 2) return null;
    const start = ns[0], end = ns[ns.length - 1], n = ns.length - 1;
    if (start <= 0 || n === 0) return null;
    return (Math.pow(end / start, 1 / n) - 1) * 100;
  });

  const pmt = createMemo(() => {
    const s = stats(); if (!s) return null;
    const r = parseFloat(rate()) / 100, n = parseInt(nPeriods());
    const p = pvOverride() ? parseFloat(pvOverride()) : s.sum;
    if (isNaN(r) || isNaN(n) || isNaN(p) || r === 0) return null;
    return p * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  });

  const ifResult = createMemo(() => {
    const field = col(); if (!field || (ifOp() !== "empty" && !ifVal())) return null;
    const matching: number[] = [], noMatch: number[] = [];
    for (const row of props.rows) {
      const cell = asStr(row.cells[field]);
      const n = parseFloat(cell);
      const matches = evalRule(cell, ifOp(), ifVal());
      (matches ? matching : noMatch).push(isNaN(n) ? 0 : n);
    }
    const agg = (arr: number[], t: string) => {
      if (!arr.length) return 0;
      if (t === "sum") return arr.reduce((a, b) => a + b, 0);
      if (t === "avg") return arr.reduce((a, b) => a + b, 0) / arr.length;
      return arr.length;
    };
    return { matchCount: matching.length, noMatchCount: noMatch.length, thenResult: agg(matching, ifThenAgg()), elseResult: agg(noMatch, ifElseAgg()) };
  });

  const crossResult = createMemo(() => {
    const e = crossExpr().trim(); if (!e || !exprMode()) return null;
    return evalCrossColExpr(e, props.rows);
  });
  const crossStats = createMemo(() => {
    const r = crossResult(); if (!r || r.results.length === 0) return null;
    const ns = r.results;
    const sum = ns.reduce((a, b) => a + b, 0);
    const mean = sum / ns.length;
    const sorted = [...ns].sort((a, b) => a - b);
    return { sum, mean, min: sorted[0], max: sorted[sorted.length - 1], count: ns.length };
  });

  const STAT_LABELS = [["SUM", () => stats() ? fmtNum(stats()!.sum) : "—"], ["AVG", () => stats() ? fmtNum(stats()!.mean) : "—"], ["MIN", () => stats() ? fmtNum(stats()!.min) : "—"], ["MAX", () => stats() ? fmtNum(stats()!.max) : "—"], ["MED", () => stats() ? fmtNum(stats()!.median) : "—"], ["σ", () => stats() ? fmtNum(stats()!.stddev) : "—"], ["CNT", () => stats() ? String(stats()!.count) : "—"]] as const;

  return (
    <div class="rounded-xl border border-white/15 bg-white/[0.03] overflow-hidden text-xs">
      <button type="button" class="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] transition text-left" onClick={props.onToggle}>
        <span class="text-amber-400/80 font-mono font-semibold">ƒx</span>
        <span class="font-semibold text-on-surface text-[0.7rem]">Formula Bar</span>
        <Show when={col() && stats()}>
          <span class="text-[0.6rem] text-on-surface-variant/50 font-mono">{colLabel()} · {stats()!.count} values</span>
        </Show>
        <span class="ml-auto text-on-surface-variant/40 text-[0.6rem]">{props.collapsed ? "▶" : "▼"}</span>
      </button>

      <Show when={!props.collapsed}>
        <div class="border-t border-white/10 px-3 pb-3 pt-2 space-y-3">
          {/* Mode toggle */}
          <div class="flex gap-1">
            <button type="button" class={`text-[0.6rem] border rounded-full px-2 py-0.5 transition ${!exprMode() ? "border-amber-400/50 bg-amber-500/10 text-amber-300" : "border-white/20 text-on-surface-variant/50 hover:bg-white/5"}`}
              onClick={() => setExprMode(false)}>Single column</button>
            <button type="button" class={`text-[0.6rem] border rounded-full px-2 py-0.5 transition ${exprMode() ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300" : "border-white/20 text-on-surface-variant/50 hover:bg-white/5"}`}
              onClick={() => setExprMode(true)}>Cross-column expr</button>
          </div>

          {/* Cross-column expression */}
          <Show when={exprMode()}>
            <div class="space-y-2">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-outline font-mono text-[0.6rem] uppercase tracking-[0.15em] shrink-0">Expr</span>
                <input type="text" placeholder="e.g. price * quantity" class="flex-1 min-w-[160px] rounded border border-white/20 bg-black/30 text-xs text-on-surface px-2 py-0.5 outline-none focus:border-emerald-400/50 font-mono"
                  value={crossExpr()} onInput={(e) => setCrossExpr(e.currentTarget.value)} />
                <span class="text-[0.55rem] text-on-surface-variant/40">Use column field names</span>
              </div>
              <Show when={crossStats()}>
                {(s) => (
                  <div class="grid grid-cols-4 gap-px rounded-lg overflow-hidden border border-emerald-400/15">
                    {([["SUM", fmtNum(s().sum)], ["AVG", fmtNum(s().mean)], ["MIN", fmtNum(s().min)], ["MAX", fmtNum(s().max)]] as const).map(([label, val]) => (
                      <div class="bg-emerald-500/[0.04] px-2 py-1.5 text-center">
                        <div class="text-[0.5rem] font-mono uppercase tracking-[0.15em] text-outline">{label}</div>
                        <div class="text-[0.75rem] font-semibold text-emerald-200 tabular-nums mt-0.5">{val}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Show>
              <Show when={crossResult()?.error && crossExpr().trim()}>
                <p class="text-[0.6rem] text-red-400/70">{crossResult()!.error}</p>
              </Show>
            </div>
          </Show>

          {/* Column selector */}
          <Show when={!exprMode()}>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-outline font-mono text-[0.6rem] uppercase tracking-[0.15em] shrink-0">Column</span>
            <select class="rounded-md border border-white/20 bg-black/30 text-xs text-on-surface px-2 py-0.5 outline-none focus:border-amber-400/60"
              value={col()} onChange={(e) => setCol(e.currentTarget.value)}>
              <option value="">— select —</option>
              <For each={numericCols()}>{(c) => <option value={c.field}>{c.label}</option>}</For>
            </select>
            <Show when={numericCols().length === 0}>
              <span class="text-[0.6rem] text-on-surface-variant/40 italic">No numeric columns in this view</span>
            </Show>
          </div>

          {/* Stats grid */}
          <Show when={stats()}>
            {(s) => (
              <div class="grid grid-cols-4 gap-px rounded-lg overflow-hidden border border-white/10">
                <For each={STAT_LABELS}>{([label, valueFn]) => (
                  <div class="bg-white/[0.03] px-2 py-1.5 text-center">
                    <div class="text-[0.5rem] font-mono uppercase tracking-[0.15em] text-outline">{label}</div>
                    <div class="text-[0.75rem] font-semibold text-on-surface tabular-nums mt-0.5">{(valueFn as () => string)()}</div>
                  </div>
                )}</For>
              </div>
            )}
          </Show>

          {/* Financial / Compound */}
          <Show when={stats()}>
            <div class="rounded-lg border border-amber-400/15 bg-amber-500/[0.04] px-3 py-2 space-y-2">
              <p class="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-amber-400/60">Compound &amp; Financial</p>
              <div class="flex flex-wrap items-center gap-3">
                <div class="flex items-center gap-1.5">
                  <span class="text-outline text-[0.6rem] shrink-0">Rate %</span>
                  <input type="number" step="0.1" class="w-16 rounded border border-white/20 bg-black/30 text-xs px-1.5 py-0.5 text-on-surface outline-none focus:border-amber-400/50 tabular-nums"
                    value={rate()} onInput={(e) => setRate(e.currentTarget.value)} />
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="text-outline text-[0.6rem] shrink-0">Periods</span>
                  <input type="number" class="w-14 rounded border border-white/20 bg-black/30 text-xs px-1.5 py-0.5 text-on-surface outline-none focus:border-amber-400/50 tabular-nums"
                    value={nPeriods()} onInput={(e) => setNPeriods(e.currentTarget.value)} />
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="text-outline text-[0.6rem] shrink-0">PV override</span>
                  <input type="number" placeholder={stats() ? fmtNum(stats()!.sum) : ""} class="w-20 rounded border border-white/20 bg-black/30 text-xs px-1.5 py-0.5 text-on-surface outline-none focus:border-amber-400/50 tabular-nums"
                    value={pvOverride()} onInput={(e) => setPvOverride(e.currentTarget.value)} />
                </div>
              </div>
              <div class="flex flex-wrap gap-5 text-xs">
                <div><span class="text-outline text-[0.6rem]">FV = </span><span class="text-amber-300 font-semibold tabular-nums">{fv() !== null ? fmtNum(fv()!) : "—"}</span></div>
                <Show when={cagr() !== null}><div><span class="text-outline text-[0.6rem]">CAGR = </span><span class="text-emerald-300 font-semibold tabular-nums">{cagr()!.toFixed(2)}%</span></div></Show>
                <div><span class="text-outline text-[0.6rem]">PMT = </span><span class="text-sky-300 font-semibold tabular-nums">{pmt() !== null ? fmtNum(pmt()!) : "—"}</span></div>
              </div>
              <p class="text-[0.55rem] text-on-surface-variant/30">FV = PV×(1+r)^n &nbsp;·&nbsp; PMT = loan payment per period &nbsp;·&nbsp; CAGR uses first→last values</p>
            </div>
          </Show>

          {/* Advanced: IF condition */}
          <div>
            <button type="button" class={`flex items-center gap-1 text-[0.65rem] transition ${advancedOpen() ? "text-violet-300" : "text-on-surface-variant/60 hover:text-on-surface-variant"}`}
              onClick={() => setAdvancedOpen((v) => !v)}>
              <span class="text-[0.55rem]">{advancedOpen() ? "▼" : "▶"}</span> Advanced — IF condition
            </button>
            <Show when={advancedOpen()}>
              <div class="mt-2 rounded-lg border border-violet-400/20 bg-violet-500/[0.04] px-3 py-2 space-y-2">
                <p class="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-violet-400/60">Conditional aggregation</p>
                <div class="flex flex-wrap items-center gap-1.5 text-[0.65rem]">
                  <span class="text-outline shrink-0">IF</span>
                  <span class="font-mono text-sky-300/80 shrink-0 truncate max-w-[80px]" title={colLabel()}>[{colLabel()}]</span>
                  <select class="rounded border border-white/20 bg-black/30 px-1 py-0.5 text-xs text-on-surface outline-none"
                    value={ifOp()} onChange={(e) => setIfOp(e.currentTarget.value as CellRule["op"])}>
                    <option value="gt">&gt;</option><option value="lt">&lt;</option>
                    <option value="eq">=</option><option value="neq">≠</option>
                    <option value="contains">contains</option><option value="empty">is empty</option>
                  </select>
                  <Show when={ifOp() !== "empty"}>
                    <input type="text" placeholder="value…" class="w-16 rounded border border-white/20 bg-black/30 px-1.5 py-0.5 text-xs text-on-surface outline-none focus:border-violet-400/50"
                      value={ifVal()} onInput={(e) => setIfVal(e.currentTarget.value)} />
                  </Show>
                  <span class="text-outline shrink-0">THEN</span>
                  <select class="rounded border border-white/20 bg-black/30 px-1 py-0.5 text-xs text-on-surface outline-none"
                    value={ifThenAgg()} onChange={(e) => setIfThenAgg(e.currentTarget.value as "count" | "sum" | "avg")}>
                    <option value="count">COUNT</option><option value="sum">SUM</option><option value="avg">AVG</option>
                  </select>
                  <span class="text-outline shrink-0">ELSE</span>
                  <select class="rounded border border-white/20 bg-black/30 px-1 py-0.5 text-xs text-on-surface outline-none"
                    value={ifElseAgg()} onChange={(e) => setIfElseAgg(e.currentTarget.value as "count" | "sum" | "avg")}>
                    <option value="count">COUNT</option><option value="sum">SUM</option><option value="avg">AVG</option>
                  </select>
                </div>
                <Show when={ifResult()}>
                  {(r) => (
                    <div class="flex flex-wrap gap-5 text-[0.65rem] pt-1">
                      <div><span class="text-outline">Match ({r().matchCount} rows): </span><span class="text-emerald-300 font-semibold tabular-nums">{fmtNum(r().thenResult)}</span></div>
                      <div><span class="text-outline">No match ({r().noMatchCount} rows): </span><span class="text-on-surface-variant tabular-nums">{fmtNum(r().elseResult)}</span></div>
                    </div>
                  )}
                </Show>
              </div>
            </Show>
          </div>
          </Show>{/* end !exprMode */}
        </div>
      </Show>
    </div>
  );
}

// ── Paste Import Modal (UX #33) ───────────────────────────────────────────────

function PasteImportModal(props: {
  columns: GridColumn[];
  rows: string[][];
  colMap: Record<number, string>;
  onMapChange: (idx: number, field: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const PREVIEW = 8;
  const headerRow = () => props.rows[0] ?? [];
  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={props.onCancel}>
      <div class="w-full max-w-3xl mx-4 glass-surface rounded-2xl border border-white/20 p-5 shadow-panel max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div class="flex items-center justify-between mb-3">
          <div>
            <p class="font-semibold text-on-surface">Import from clipboard</p>
            <p class="text-xs text-on-surface-variant mt-0.5">{props.rows.length} row{props.rows.length === 1 ? "" : "s"} detected · Map columns below</p>
          </div>
          <button type="button" class="text-on-surface-variant hover:text-on-surface transition text-lg leading-none" onClick={props.onCancel}>✕</button>
        </div>
        {/* Column mapping */}
        <div class="flex flex-wrap gap-2 mb-3">
          <For each={headerRow()}>{(_, i) => (
            <div class="flex items-center gap-1">
              <span class="text-[0.6rem] text-outline font-mono">Col {i() + 1}</span>
              <span class="text-on-surface-variant/40 text-[0.6rem]">→</span>
              <select class="rounded-md border border-white/20 bg-black/30 text-xs text-on-surface px-1.5 py-0.5 outline-none focus:border-sky-400/60"
                value={props.colMap[i()] ?? ""} onChange={(e) => props.onMapChange(i(), e.currentTarget.value)}>
                <option value="">Skip</option>
                <For each={props.columns.filter((c) => c.kind !== "formula")}>{(c) => <option value={c.field}>{c.label}</option>}</For>
              </select>
            </div>
          )}</For>
        </div>
        {/* Preview table */}
        <div class="overflow-auto rounded-lg border border-white/10 mb-4">
          <table class="w-full text-xs text-left">
            <thead>
              <tr class="border-b border-white/10 bg-white/4">
                <For each={headerRow()}>{(_, i) => (
                  <th class="px-2 py-1.5 font-mono text-[0.6rem] uppercase text-outline">
                    {props.colMap[i()] ? (props.columns.find((c) => c.field === props.colMap[i()])?.label ?? props.colMap[i()]) : `Col ${i() + 1}`}
                  </th>
                )}</For>
              </tr>
            </thead>
            <tbody>
              <For each={props.rows.slice(0, PREVIEW)}>{(row, ri) => (
                <tr class={`border-t border-white/8 ${ri() % 2 === 1 ? "bg-white/[0.02]" : ""}`}>
                  <For each={row}>{(cell, ci) => (
                    <td class={`px-2 py-1 text-on-surface max-w-[150px] truncate ${!props.colMap[ci()] ? "opacity-30" : ""}`}>
                      {cell || <span class="text-on-surface-variant/30">—</span>}
                    </td>
                  )}</For>
                </tr>
              )}</For>
            </tbody>
          </table>
          <Show when={props.rows.length > PREVIEW}>
            <p class="text-center text-[0.65rem] text-on-surface-variant/50 py-2 border-t border-white/8">
              … and {props.rows.length - PREVIEW} more rows
            </p>
          </Show>
        </div>
        <div class="flex gap-2 justify-end">
          <button type="button" class="rounded-lg border border-white/15 px-3 py-1 text-xs text-on-surface-variant hover:bg-white/10 transition" onClick={props.onCancel}>Cancel</button>
          <button type="button" disabled={props.pending || Object.keys(props.colMap).length === 0}
            class="rounded-lg border border-sky-400/40 bg-sky-500/10 text-sky-300 px-3 py-1 text-xs font-medium hover:bg-sky-500/20 disabled:opacity-40 transition"
            onClick={props.onConfirm}>
            {props.pending ? "Importing…" : `Import ${props.rows.length} row${props.rows.length === 1 ? "" : "s"} →`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Currency Converter Panel ──────────────────────────────────────────────────

// ── UX #47: Conditional Column Visibility Rules panel ────────────────────────

function ColVisRulesPanel(props: {
  columns: GridColumn[];
  rules: ColVisRule[];
  onAdd: (rule: ColVisRule) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [triggerField, setTriggerField] = createSignal(props.columns[0]?.field ?? "");
  const [op, setOp] = createSignal<ColVisRule["op"]>("gt");
  const [value, setValue] = createSignal("");
  const [hideField, setHideField] = createSignal(props.columns[0]?.field ?? "");
  const OPS: ColVisRule["op"][] = ["gt", "lt", "eq", "neq", "contains", "empty"];
  const submit = () => {
    if (!triggerField() || !hideField()) return;
    props.onAdd({ id: `cvr-${Date.now()}`, triggerField: triggerField(), op: op(), value: value(), hideField: hideField() });
    setValue("");
  };
  return (
    <div class="absolute right-0 top-full mt-1.5 z-[250] w-72 rounded-2xl border border-white/20 bg-black/90 py-2.5 shadow-2xl backdrop-blur-md" onClick={(e) => e.stopPropagation()}>
      <div class="flex items-center justify-between px-3 pb-1.5">
        <p class="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-on-surface-variant/50">Column visibility rules</p>
        <button type="button" class="text-[0.6rem] text-on-surface-variant/40 hover:text-on-surface-variant" onClick={props.onClose}>✕</button>
      </div>
      <div class="px-3 space-y-2 pb-2">
        <p class="text-[0.58rem] text-on-surface-variant/40 leading-relaxed">Hide a column when any row matches a condition in another column.</p>
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-[0.58rem] text-outline shrink-0">When</span>
          <select class="flex-1 rounded border border-white/20 bg-black/40 text-xs text-on-surface px-1 py-0.5 outline-none" value={triggerField()} onChange={(e) => setTriggerField(e.currentTarget.value)}>
            <For each={props.columns}>{(c) => <option value={c.field}>{c.label}</option>}</For>
          </select>
          <select class="rounded border border-white/20 bg-black/40 text-xs text-on-surface px-1 py-0.5 outline-none" value={op()} onChange={(e) => setOp(e.currentTarget.value as ColVisRule["op"])}>
            <For each={OPS}>{(o) => <option value={o}>{o}</option>}</For>
          </select>
          <Show when={op() !== "empty"}>
            <input type="text" placeholder="value" class="w-16 rounded border border-white/20 bg-black/40 text-xs text-on-surface px-1 py-0.5 outline-none"
              value={value()} onInput={(e) => setValue(e.currentTarget.value)} />
          </Show>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-[0.58rem] text-outline shrink-0">Hide</span>
          <select class="flex-1 rounded border border-white/20 bg-black/40 text-xs text-on-surface px-1 py-0.5 outline-none" value={hideField()} onChange={(e) => setHideField(e.currentTarget.value)}>
            <For each={props.columns}>{(c) => <option value={c.field}>{c.label}</option>}</For>
          </select>
          <button type="button" disabled={!triggerField() || !hideField()} class="shrink-0 rounded-md border border-indigo-400/40 bg-indigo-500/10 text-indigo-300 text-[0.65rem] px-2 py-0.5 hover:bg-indigo-500/20 disabled:opacity-40 transition"
            onClick={submit}>+ Add</button>
        </div>
      </div>
      <Show when={props.rules.length > 0}>
        <div class="border-t border-white/10 pt-2 px-3 space-y-1.5">
          <For each={props.rules}>{(rule) => (
            <div class="flex items-center gap-2 group/cvr">
              <span class="flex-1 text-[0.6rem] text-on-surface-variant/70 truncate">
                {rule.triggerField} {rule.op} {rule.op !== "empty" ? rule.value : ""} → hide {rule.hideField}
              </span>
              <button type="button" class="opacity-0 group-hover/cvr:opacity-100 text-[0.6rem] text-red-400/60 hover:text-red-400 transition" onClick={() => props.onRemove(rule.id)}>✕</button>
            </div>
          )}</For>
        </div>
      </Show>
    </div>
  );
}

// ── UX #46: Row Annotations Timeline ─────────────────────────────────────────

function RowAnnotationsPanel(props: {
  annotations: RowAnnotation[];
  input: string;
  onInput: (v: string) => void;
  onAdd: () => void;
  onDelete: (idx: number) => void;
  colSpan: number;
  onClose: () => void;
}) {
  return (
    <tr>
      <td colSpan={props.colSpan} class="px-3 pb-3 pt-0" onClick={(e) => e.stopPropagation()}>
        <div class="rounded-xl border border-violet-400/20 bg-violet-500/[0.04] px-3 py-2.5 space-y-2">
          <div class="flex items-center justify-between mb-1">
            <span class="text-[0.6rem] font-mono uppercase tracking-[0.18em] text-violet-400/60">Annotations</span>
            <button type="button" class="text-[0.6rem] text-on-surface-variant/40 hover:text-on-surface-variant transition" onClick={props.onClose}>✕</button>
          </div>
          <div class="flex gap-1.5">
            <input type="text" placeholder="Add annotation…"
              class="flex-1 rounded-md border border-white/20 bg-black/30 text-xs text-on-surface px-2 py-1 outline-none focus:border-violet-400/50"
              value={props.input} onInput={(e) => props.onInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  recordShortcutUse("form_submit");
                  props.onAdd();
                }
                if (e.key === "Escape") {
                  recordShortcutUse("form_cancel");
                  props.onClose();
                }
              }}
              ref={(el) => setTimeout(() => el?.focus(), 0)} />
            <button type="button" disabled={!props.input.trim()} class="shrink-0 rounded-md border border-violet-400/40 bg-violet-500/10 text-violet-300 text-[0.65rem] px-2 py-0.5 hover:bg-violet-500/20 disabled:opacity-40 transition"
              onClick={props.onAdd}>📍 Pin</button>
          </div>
          <Show when={props.annotations.length === 0}>
            <p class="text-[0.6rem] text-on-surface-variant/30 italic py-1">No annotations yet.</p>
          </Show>
          <For each={props.annotations}>{(ann, i) => (
            <div class="flex items-start gap-2 group/ann">
              <div class="flex-1 min-w-0">
                <p class="text-xs text-on-surface leading-snug">{ann.text}</p>
                <p class="text-[0.55rem] text-on-surface-variant/40 mt-0.5">{gridDateTimeLabel(ann.ts)}</p>
              </div>
              <button type="button" class="opacity-0 group-hover/ann:opacity-100 shrink-0 text-[0.6rem] text-on-surface-variant/40 hover:text-red-400 transition"
                onClick={() => props.onDelete(i())}>✕</button>
            </div>
          )}</For>
        </div>
      </td>
    </tr>
  );
}

// ── UX #50: What-If Row Simulator ─────────────────────────────────────────────

function WhatIfPanel(props: {
  columns: GridColumn[];
  row: GridRow;
  values: Record<string, string>;
  onInput: (field: string, val: string) => void;
  colSpan: number;
  onClose: () => void;
}) {
  const editableCols = () => props.columns.filter((c) => c.kind === "number" || c.kind === "formula");
  const simCells = (): Record<string, unknown> => {
    const base = { ...props.row.cells };
    for (const [k, v] of Object.entries(props.values)) { if (v !== "") base[k] = v; }
    return base;
  };
  return (
    <tr>
      <td colSpan={props.colSpan} class="px-3 pb-3 pt-0" onClick={(e) => e.stopPropagation()}>
        <div class="rounded-xl border border-sky-400/20 bg-sky-500/[0.03] px-3 py-2.5 space-y-2">
          <div class="flex items-center justify-between mb-1">
            <span class="text-[0.6rem] font-mono uppercase tracking-[0.18em] text-sky-400/60">What-If Simulator</span>
            <button type="button" class="text-[0.6rem] text-on-surface-variant/40 hover:text-on-surface-variant transition" onClick={props.onClose}>✕</button>
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-2">
            <For each={editableCols()}>{(col) => {
              const origVal = () => asStr(props.row.cells[col.field]);
              const simVal = () => props.values[col.field] ?? origVal();
              const changed = () => simVal() !== origVal();
              if (col.kind === "formula") {
                const origResult = () => col.formula ? evalFormula(col.formula, props.row.cells) ?? origVal() : origVal();
                const simResult = () => col.formula ? evalFormula(col.formula, simCells()) ?? simVal() : simVal();
                return (
                  <div class="col-span-2 flex items-center gap-3">
                    <span class="text-[0.6rem] text-outline font-mono uppercase tracking-widest w-24 shrink-0 truncate">{col.label}</span>
                    <span class="text-on-surface-variant/50 text-xs tabular-nums line-through">{origResult()}</span>
                    <span class={`text-xs tabular-nums font-semibold ${changed() ? "text-sky-300" : "text-on-surface-variant/50"}`}>→ {simResult()}</span>
                  </div>
                );
              }
              return (
                <div class="flex items-center gap-2">
                  <span class="text-[0.6rem] text-outline font-mono uppercase tracking-widest w-20 shrink-0 truncate">{col.label}</span>
                  <input type="number" class={`flex-1 rounded border bg-black/30 text-xs text-on-surface px-1.5 py-0.5 outline-none tabular-nums ${changed() ? "border-sky-400/50 focus:border-sky-400" : "border-white/20 focus:border-white/40"}`}
                    value={simVal()} onInput={(e) => props.onInput(col.field, e.currentTarget.value)} />
                  <Show when={changed()}>
                    <span class="text-[0.55rem] text-on-surface-variant/40 shrink-0">(was {origVal() || "—"})</span>
                  </Show>
                </div>
              );
            }}</For>
          </div>
          <p class="text-[0.55rem] text-on-surface-variant/30 pt-1">Changes are simulation-only — no data is modified.</p>
        </div>
      </td>
    </tr>
  );
}

function CurrencyConverterPanel(props: {
  field: string;
  label: string;
  conversion: CurrencyConversion | undefined;
  loading: boolean;
  error: string;
  onFetch: (src: string, tgt: string) => void;
  onRemove: () => void;
  onModeChange: (mode: CurrencyConversion["mode"]) => void;
  onClose: () => void;
}) {
  const [src, setSrc] = createSignal(props.conversion?.sourceCurrency ?? "USD");
  const [tgt, setTgt] = createSignal(props.conversion?.targetCurrency ?? "EUR");
  return (
    <div
      class="absolute left-0 top-full mt-1.5 z-[350] w-72 rounded-2xl border border-emerald-400/30 bg-black/90 py-2 shadow-2xl backdrop-blur-md text-xs"
      onClick={(e) => e.stopPropagation()}
    >
      <div class="flex items-center justify-between px-3 pt-1 pb-1.5">
        <p class="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-emerald-400/60">⇌ Currency — {props.label}</p>
        <button type="button" class="text-on-surface-variant/40 hover:text-on-surface-variant transition text-[0.65rem]" onClick={props.onClose}>✕</button>
      </div>
      <div class="px-3 space-y-2 pb-2">
        <div class="flex items-center gap-2">
          <span class="text-outline text-[0.6rem] shrink-0 w-10">From</span>
          <select
            class="flex-1 rounded border border-white/20 bg-black/40 text-xs text-on-surface px-1 py-0.5 outline-none focus:border-emerald-400/50"
            value={src()} onChange={(e) => setSrc(e.currentTarget.value)}
          >
            <For each={[...MAJOR_CURRENCIES]}>{(c) => <option value={c}>{c}</option>}</For>
          </select>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-outline text-[0.6rem] shrink-0 w-10">To</span>
          <select
            class="flex-1 rounded border border-white/20 bg-black/40 text-xs text-on-surface px-1 py-0.5 outline-none focus:border-emerald-400/50"
            value={tgt()} onChange={(e) => setTgt(e.currentTarget.value)}
          >
            <For each={[...MAJOR_CURRENCIES]}>{(c) => <option value={c}>{c}</option>}</For>
          </select>
          <button
            type="button"
            disabled={props.loading || src() === tgt()}
            class="shrink-0 rounded-md border border-emerald-400/50 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 transition"
            onClick={() => props.onFetch(src(), tgt())}
          >
            {props.loading ? "…" : "Fetch"}
          </button>
        </div>
        <Show when={props.error}>
          <p class="text-[0.6rem] text-red-400">{props.error}</p>
        </Show>
        <Show when={props.conversion}>
          {(conv) => (
            <div class="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] px-2.5 py-2 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-on-surface-variant/70 text-[0.65rem]">1 {conv().sourceCurrency} =</span>
                <span class="font-bold text-emerald-300 tabular-nums">{conv().rate.toFixed(5)} {conv().targetCurrency}</span>
              </div>
              <p class="text-[0.55rem] text-on-surface-variant/40">
                Fetched {gridTimeLabel(conv().lastFetched)}
              </p>
              <div class="flex gap-1">
                {(["static", "hourly", "daily"] as const).map((m) => (
                  <button
                    type="button"
                    class={`flex-1 rounded-md border py-0.5 text-[0.6rem] font-medium transition ${conv().mode === m ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300" : "border-white/15 text-on-surface-variant/50 hover:bg-white/5"}`}
                    onClick={() => props.onModeChange(m)}
                  >{m}</button>
                ))}
              </div>
              <p class="text-[0.55rem] text-on-surface-variant/30 leading-relaxed">
                Static = locked rate · Hourly/Daily = auto-refresh
              </p>
              <button
                type="button"
                class="w-full text-center text-[0.6rem] text-red-400/60 hover:text-red-400 transition"
                onClick={props.onRemove}
              >✕ Remove conversion</button>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SupertagGridRenderer(props: { message: AfpMessage }) {
  const c = () => afpRecord(decryptedDisplayContent(props.message));
  const viewId = () => asStr(c().view_id) || props.message.id || "grid";
  const title = () => asStr(c().title) || "Database";
  const description = () => asStr(c().description) || "";
  const allowEdit = () => Boolean(c().allow_edit);
  const supertTagFilter = () =>
    Array.isArray(c().supertag_filter) ? (c().supertag_filter as unknown[]).map(String) : [];

  const accessMode = (): "user_editable" | "agent_managed" | "locked" => {
    const am = asStr(c().access_mode);
    if (am === "locked") return "locked";
    if (am === "agent_managed") return "agent_managed";
    if (am === "user_editable") return "user_editable";
    return allowEdit() ? "user_editable" : "agent_managed";
  };

  const columns = createMemo(() => parseColumns(c().columns));
  const allRows = createMemo(() => parseRows(c().rows));
  const highlightRules = createMemo(() => parseHighlightRules(c().highlight_rules));

  // ── State ─────────────────────────────────────────────────────────────────
  const [sortKeys, setSortKeys] = createSignal<SortKey[]>([]);
  const [colOrder, setColOrder] = createSignal<string[]>([]);
  const [activeFilters, setActiveFilters] = createSignal<Set<string>>(new Set(supertTagFilter()));
  const [pinnedCols, setPinnedCols] = createSignal<Set<string>>(new Set());
  const [groupBy, setGroupBy] = createSignal(false);
  const [hiddenCols, setHiddenCols] = createSignal<Set<string>>(new Set());
  const [density, setDensity] = createSignal<Density>("7");
  const [zebraStripe, setZebraStripe] = createSignal(true);
  const [filterCombinator, setFilterCombinator] = createSignal<"and" | "or">("or");
  const [presets, setPresets] = createSignal<ViewPreset[]>([]);
  const [showPresetMenu, setShowPresetMenu] = createSignal(false);
  const [presetName, setPresetName] = createSignal("");
  const [rowNotes, setRowNotes] = createSignal<Record<string, string>>({});
  const [editingNote, setEditingNote] = createSignal<string | null>(null);
  const [selectedRows, setSelectedRows] = createSignal<Set<string>>(new Set());
  const [batchTag, setBatchTag] = createSignal("");
  const [batchPending, setBatchPending] = createSignal(false);
  const [colLabelOverrides, setColLabelOverrides] = createSignal<Record<string, string>>({});
  const [renamingCol, setRenamingCol] = createSignal<string | null>(null);
  const [renameValue, setRenameValue] = createSignal("");
  const [editHistory, setEditHistory] = createSignal<Record<string, EditHistoryEntry[]>>({});
  const [viewingHistoryRow, setViewingHistoryRow] = createSignal<string | null>(null);
  const [linkSuccess, setLinkSuccess] = createSignal(false);
  const [editRequested, setEditRequested] = createSignal(false);
  const [editRequestSent, setEditRequestSent] = createSignal(false);
  const [dragColField, setDragColField] = createSignal<string | null>(null);
  const [dragOverColField, setDragOverColField] = createSignal<string | null>(null);
  const [showGlobalSearch, setShowGlobalSearch] = createSignal(false);
  const [globalSearchTerm, setGlobalSearchTerm] = createSignal("");
  const [globalMatchIdx, setGlobalMatchIdx] = createSignal(0);
  const [templates, setTemplates] = createSignal<RowTemplate[]>([]);
  const [showTemplatesMenu, setShowTemplatesMenu] = createSignal(false);
  const [saveTemplateName, setSaveTemplateName] = createSignal("");
  const [cellRules, setCellRules] = createSignal<CellRule[]>([]);
  const [showCellRulePopover, setShowCellRulePopover] = createSignal<string | null>(null);
  const [scrollTop, setScrollTop] = createSignal(0);
  const [scrollHeight, setScrollHeight] = createSignal(0);
  const [clientHeight, setClientHeight] = createSignal(0);
  const [statsBarCol, setStatsBarCol] = createSignal<string | null>(null);
  const [pasteVisible, setPasteVisible] = createSignal(false);
  const [pasteData, setPasteData] = createSignal<string[][]>([]);
  const [pasteColMap, setPasteColMap] = createSignal<Record<number, string>>({});
  const [pastePending, setPastePending] = createSignal(false);
  const [archiveStalePending, setArchiveStalePending] = createSignal(false);
  const [showFormulaBar, setShowFormulaBar] = createSignal(false);
  const [formulaBarCollapsed, setFormulaBarCollapsed] = createSignal(false);

  // ── New feature signals ─────────────────────────────────────────────────
  const [pageSize, setPageSize] = createSignal(150);
  const [currentPage, setCurrentPage] = createSignal(0);
  const [storageWarning, setStorageWarning] = createSignal(false);
  const [dataBars, setDataBars] = createSignal<Set<string>>(new Set()); // UX #36
  const [diffMode, setDiffMode] = createSignal(false); // UX #37
  const [rowFormatRules, setRowFormatRules] = createSignal<RowFormatRule[]>([]); // UX #38
  const [showFormatRules, setShowFormatRules] = createSignal(false); // UX #38
  const [colNotes, setColNotes] = createSignal<Record<string, string>>({}); // UX #39
  const [editingColNote, setEditingColNote] = createSignal<string | null>(null); // UX #39
  const [filterBookmarks, setFilterBookmarks] = createSignal<FilterBookmark[]>([]); // UX #40
  const [bookmarkName, setBookmarkName] = createSignal(""); // UX #40

  // ── UX #41–45 + Currency signals ─────────────────────────────────────────
  const [heatmapCol, setHeatmapCol] = createSignal<string | null>(null); // UX #41
  const [focusedRowIdx, setFocusedRowIdx] = createSignal<number | null>(null); // UX #43
  const [numGroupBy, setNumGroupBy] = createSignal<{ field: string; buckets: number } | null>(null); // UX #44
  const [showNumGroupPanel, setShowNumGroupPanel] = createSignal(false); // UX #44 popover
  const [ngField, setNgField] = createSignal(""); // UX #44 panel state
  const [ngBuckets, setNgBuckets] = createSignal(5); // UX #44 panel state
  const [shareCopied, setShareCopied] = createSignal(false); // UX #45
  const [currencyConversions, setCurrencyConversions] = createSignal<Record<string, CurrencyConversion>>({}); // Currency
  const [showCurrencyPanel, setShowCurrencyPanel] = createSignal<string | null>(null); // Currency
  const [currencyLoading, setCurrencyLoading] = createSignal<Record<string, boolean>>({}); // Currency
  const [currencyErrors, setCurrencyErrors] = createSignal<Record<string, string>>({}); // Currency

  // ── UX #46–50 signals ────────────────────────────────────────────────────
  const [rowAnnotations, setRowAnnotations] = createSignal<Record<string, RowAnnotation[]>>({}); // UX #46
  const [showAnnotationsPanel, setShowAnnotationsPanel] = createSignal<string | null>(null); // UX #46
  const [annotationInput, setAnnotationInput] = createSignal(""); // UX #46
  const [colVisRules, setColVisRules] = createSignal<ColVisRule[]>([]); // UX #47
  const [showColVisPanel, setShowColVisPanel] = createSignal(false); // UX #47
  const [whatIfRowKey, setWhatIfRowKey] = createSignal<string | null>(null); // UX #50
  const [whatIfValues, setWhatIfValues] = createSignal<Record<string, string>>({}); // UX #50

  let gridScrollRef!: HTMLDivElement;
  let globalSearchInputRef!: HTMLInputElement;
  let containerRef!: HTMLDivElement;
  const currencyIntervalRef = new Map<string, ReturnType<typeof setInterval>>();

  // ── onMount ───────────────────────────────────────────────────────────────
  onMount(() => {
    const saved = lsGet<GridPersistedState | null>(lsKey(viewId(), "state"), null);
    if (saved) {
      const legacy: Record<string, unknown> = isRecord(saved) ? saved : {};
      const normalized = normalizeSupertagGridRuntimeState(saved);
      if (normalized) {
        setSortKeys(normalized.sortKeys);
        setColOrder(normalized.colOrder);
        setActiveFilters(new Set(normalized.activeFilters));
        setPinnedCols(new Set(normalized.pinnedCols));
        setHiddenCols(new Set(normalized.hiddenCols));
        if (typeof normalized.groupBy === "boolean") setGroupBy(normalized.groupBy);
        if (normalized.density) setDensity(normalized.density);
        if (typeof normalized.zebraStripe === "boolean") setZebraStripe(normalized.zebraStripe);
        if (normalized.filterCombinator) setFilterCombinator(normalized.filterCombinator);
      }
      else if (typeof legacy.sortField === "string" && legacy.sortField)
        setSortKeys([{ field: legacy.sortField, asc: (legacy.sortAsc as boolean) ?? true }]);
    }
    setPresets(lsGet(lsKey(viewId(), "presets"), []));
    setRowNotes(lsGet(lsKey(viewId(), "notes"), {}));
    setColLabelOverrides(lsGet(lsKey(viewId(), "col_labels"), {}));
    setEditHistory(lsGet(lsKey(viewId(), "edit_history"), {}));
    setTemplates(lsGet(lsKey(viewId(), "templates"), []));
    setCellRules(lsGet(lsKey(viewId(), "cell_rules"), []));
    setRowFormatRules(lsGet(lsKey(viewId(), "row_fmt_rules"), []));
    setFilterBookmarks(lsGet(lsKey(viewId(), "filter_bookmarks"), []));
    setColNotes(lsGet(lsKey(viewId(), "col_notes"), {}));
    setRowAnnotations(lsGet(lsKey(viewId(), "row_annotations"), {}));
    setColVisRules(lsGet(lsKey(viewId(), "col_vis_rules"), []));
    if (_lsQuotaHit) setStorageWarning(true);
    setTimeout(() => {
      if (gridScrollRef) { setScrollHeight(gridScrollRef.scrollHeight); setClientHeight(gridScrollRef.clientHeight); }
    }, 100);

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        const active = document.activeElement;
        if (active && !containerRef?.contains(active) && active !== document.body) return;
        if (displayRows().length === 0) return;
        e.preventDefault(); setShowGlobalSearch(true);
        setTimeout(() => globalSearchInputRef?.focus(), 30);
      }
      if (e.key === "Escape" && showGlobalSearch()) { setShowGlobalSearch(false); setGlobalSearchTerm(""); }
    };
    const onPaste = (e: ClipboardEvent) => {
      if (pasteVisible()) return;
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) return;
      if (active && !containerRef?.contains(active) && active !== document.body) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text.trim()) return;
      const parsed = parseClipboardTable(text);
      if (parsed.length === 0) return;
      e.preventDefault();
      const initialMap: Record<number, string> = {};
      const editableCols = columns().filter((c) => c.kind !== "formula");
      parsed[0]?.forEach((_, i) => { if (editableCols[i]) initialMap[i] = editableCols[i].field; });
      setPasteData(parsed); setPasteColMap(initialMap); setPasteVisible(true);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("paste", onPaste);

    // UX #45: restore view from share link
    const sharedState = parseSupertagGridShareHash(window.location.hash, viewId());
    if (sharedState) {
      setSortKeys(sharedState.sortKeys);
      setColOrder(sharedState.colOrder);
      setActiveFilters(new Set(sharedState.activeFilters));
      setPinnedCols(new Set(sharedState.pinnedCols));
      setHiddenCols(new Set(sharedState.hiddenCols));
      if (typeof sharedState.groupBy === "boolean") setGroupBy(sharedState.groupBy);
      if (sharedState.density) setDensity(sharedState.density);
      if (typeof sharedState.zebraStripe === "boolean") setZebraStripe(sharedState.zebraStripe);
      if (sharedState.filterCombinator) setFilterCombinator(sharedState.filterCombinator);
    }

    onCleanup(() => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("paste", onPaste);
      for (const id of currencyIntervalRef.values()) clearInterval(id);
    });
  });

  createEffect(() => {
    lsSet(lsKey(viewId(), "state"), {
      sortKeys: sortKeys(), colOrder: colOrder(), activeFilters: [...activeFilters()],
      pinnedCols: [...pinnedCols()], groupBy: groupBy(), hiddenCols: [...hiddenCols()],
      density: density(), zebraStripe: zebraStripe(), filterCombinator: filterCombinator(),
    });
  });

  // Surface quota warning whenever a save fails
  createEffect(() => { if (_lsQuotaHit) setStorageWarning(true); });

  // ── Row format rule helpers (UX #38) ──────────────────────────────────────
  const addRowFormatRule = (r: RowFormatRule) => {
    const updated = [...rowFormatRules(), r];
    setRowFormatRules(updated); lsSet(lsKey(viewId(), "row_fmt_rules"), updated);
  };
  const deleteRowFormatRule = (i: number) => {
    const updated = rowFormatRules().filter((_, j) => j !== i);
    setRowFormatRules(updated); lsSet(lsKey(viewId(), "row_fmt_rules"), updated);
  };
  const rowUserHighlight = (row: GridRow): string => {
    for (const rule of rowFormatRules()) {
      if (evalRule(asStr(row.cells[rule.field]), rule.op, rule.value))
        return HIGHLIGHT_CLASSES[rule.color] ?? "";
    }
    return "";
  };

  // ── Filter bookmark helpers (UX #40) ─────────────────────────────────────
  const saveFilterBookmark = () => {
    const name = bookmarkName().trim(); if (!name) return;
    const bm: FilterBookmark = { name, filters: [...activeFilters()], combinator: filterCombinator() };
    const updated = [...filterBookmarks().filter((b) => b.name !== name), bm];
    setFilterBookmarks(updated); lsSet(lsKey(viewId(), "filter_bookmarks"), updated); setBookmarkName("");
  };
  const applyFilterBookmark = (bm: FilterBookmark) => {
    setActiveFilters(new Set(bm.filters)); setFilterCombinator(bm.combinator);
  };
  const deleteFilterBookmark = (name: string) => {
    const updated = filterBookmarks().filter((b) => b.name !== name);
    setFilterBookmarks(updated); lsSet(lsKey(viewId(), "filter_bookmarks"), updated);
  };

  // ── Column note helpers (UX #39) ─────────────────────────────────────────
  const saveColNote = (field: string, text: string) => {
    const updated = { ...colNotes() };
    if (text.trim()) updated[field] = text; else delete updated[field];
    setColNotes(updated); lsSet(lsKey(viewId(), "col_notes"), updated);
  };

  // ── Data bar / colMinMax (UX #36) ─────────────────────────────────────────
  const colMinMax = createMemo(() => {
    const result: Record<string, { min: number; max: number }> = {};
    for (const [field, vals] of Object.entries(sparklineValues())) {
      if (vals.length > 0) result[field] = { min: Math.min(...vals), max: Math.max(...vals) };
    }
    return result;
  });
  const toggleDataBar = (field: string) =>
    setDataBars((p) => { const n = new Set(p); n.has(field) ? n.delete(field) : n.add(field); return n; });

  // ── UX #41: Heat-map row background ──────────────────────────────────────
  const heatRowStyle = (row: GridRow): Record<string, string> => {
    const field = heatmapCol();
    if (!field) return {};
    const mm = colMinMax()[field];
    if (!mm || mm.min === mm.max) return {};
    const n = parseFloat(asStr(row.cells[field]));
    if (isNaN(n)) return {};
    const pct = (n - mm.min) / (mm.max - mm.min);
    return { background: `rgba(251,191,36,${(pct * 0.22).toFixed(3)})` };
  };

  // ── UX #42: Freeze pane — pin all cols up to and including `field` ────────
  const freezeTo = (field: string) => {
    const cols = orderedColumns();
    const idx = cols.findIndex((c) => c.field === field);
    if (idx < 0) return;
    setPinnedCols(new Set(cols.slice(0, idx + 1).map((c) => c.field)));
  };

  // ── UX #45: Share / snapshot link ────────────────────────────────────────
  const copyShareLink = () => {
    try {
      const encoded = btoa(JSON.stringify(currentState()));
      const base = window.location.href.replace(/#.*/, "");
      void navigator.clipboard.writeText(`${base}#sgrid_${viewId()}=${encoded}`);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch { /* clipboard denied */ }
  };

  // ── Currency helpers ─────────────────────────────────────────────────────
  const fetchExchangeRate = async (field: string, source: string, target: string, mode: CurrencyConversion["mode"]) => {
    setCurrencyLoading((p) => ({ ...p, [field]: true }));
    setCurrencyErrors((p) => ({ ...p, [field]: "" }));
    try {
      const { rate } = await fetchInlineEntityExchangeRate({ from: source, to: target });
      if (rate === null) throw new Error("Exchange rate unavailable");
      const conv: CurrencyConversion = { sourceCurrency: source, targetCurrency: target, rate, lastFetched: Date.now(), mode };
      setCurrencyConversions((p) => ({ ...p, [field]: conv }));
      const prev = currencyIntervalRef.get(field);
      if (prev) { clearInterval(prev); currencyIntervalRef.delete(field); }
      if (mode !== "static") {
        const ms = mode === "hourly" ? 3_600_000 : 86_400_000;
        const id = setInterval(() => void fetchExchangeRate(field, source, target, mode), ms);
        currencyIntervalRef.set(field, id);
      }
    } catch (err) {
      setCurrencyErrors((p) => ({ ...p, [field]: err instanceof Error ? err.message : "Fetch failed" }));
    } finally {
      setCurrencyLoading((p) => ({ ...p, [field]: false }));
    }
  };

  const removeCurrencyConversion = (field: string) => {
    const prev = currencyIntervalRef.get(field);
    if (prev) { clearInterval(prev); currencyIntervalRef.delete(field); }
    setCurrencyConversions((p) => { const n = { ...p }; delete n[field]; return n; });
  };

  const updateCurrencyMode = (field: string, mode: CurrencyConversion["mode"]) => {
    const conv = currencyConversions()[field];
    if (!conv) return;
    const prev = currencyIntervalRef.get(field);
    if (prev) { clearInterval(prev); currencyIntervalRef.delete(field); }
    setCurrencyConversions((p) => ({ ...p, [field]: { ...p[field]!, mode } }));
    if (mode !== "static") {
      const ms = mode === "hourly" ? 3_600_000 : 86_400_000;
      const id = setInterval(() => void fetchExchangeRate(field, conv.sourceCurrency, conv.targetCurrency, mode), ms);
      currencyIntervalRef.set(field, id);
    }
  };

  // ── UX #46: Row annotations ───────────────────────────────────────────────
  const addAnnotation = (key: string, text: string) => {
    if (!text.trim()) return;
    const updated = { ...rowAnnotations(), [key]: [{ text: text.trim(), ts: new Date().toISOString() }, ...(rowAnnotations()[key] ?? [])] };
    setRowAnnotations(updated); lsSet(lsKey(viewId(), "row_annotations"), updated);
    setAnnotationInput("");
  };
  const deleteAnnotation = (key: string, idx: number) => {
    const arr = [...(rowAnnotations()[key] ?? [])];
    arr.splice(idx, 1);
    const updated = { ...rowAnnotations(), [key]: arr };
    setRowAnnotations(updated); lsSet(lsKey(viewId(), "row_annotations"), updated);
  };

  // ── UX #47: Column visibility rules ──────────────────────────────────────
  const saveColVisRules = (rules: ColVisRule[]) => {
    setColVisRules(rules); lsSet(lsKey(viewId(), "col_vis_rules"), rules);
  };
  const addColVisRule = (rule: ColVisRule) => saveColVisRules([...colVisRules().filter((r) => r.id !== rule.id), rule]);
  const removeColVisRule = (id: string) => saveColVisRules(colVisRules().filter((r) => r.id !== id));

  // ── UX #48: Multi-cell copy ───────────────────────────────────────────────
  const copySelectedAsMarkdown = () => {
    const sel = selectedRows();
    const rows = displayRows().filter((r, i) => sel.has(rowKey(r, i)));
    if (!rows.length) return;
    const cols = effectiveColumns();
    const header = `| ${cols.map((c) => c.label).join(" | ")} |`;
    const sep = `| ${cols.map(() => "---").join(" | ")} |`;
    const body = rows.map((row) => `| ${cols.map((col) => {
      if (col.kind === "formula" && col.formula) return evalFormula(col.formula, row.cells) ?? asStr(row.cells[col.field]);
      return asStr(row.cells[col.field]).replace(/\|/g, "\\|");
    }).join(" | ")} |`);
    void navigator.clipboard.writeText([header, sep, ...body].join("\n"));
  };
  const copySelectedAsCsv = () => {
    const sel = selectedRows();
    const rows = displayRows().filter((r, i) => sel.has(rowKey(r, i)));
    if (!rows.length) return;
    exportCsv(`${title()}_selection`, effectiveColumns(), rows);
  };

  // ── UX #49: Column trend ──────────────────────────────────────────────────
  const computeTrend = (values: number[]): { arrow: string; label: string; cls: string } => {
    if (values.length < 3) return { arrow: "→", label: "insufficient data", cls: "text-on-surface-variant/40" };
    const third = Math.max(1, Math.floor(values.length / 3));
    const first = values.slice(0, third).reduce((a, b) => a + b, 0) / third;
    const last = values.slice(-third).reduce((a, b) => a + b, 0) / third;
    const pct = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
    if (pct > 10) return { arrow: "↗", label: `+${pct.toFixed(1)}%`, cls: "text-emerald-400" };
    if (pct > 3) return { arrow: "→↗", label: `+${pct.toFixed(1)}%`, cls: "text-emerald-400/70" };
    if (pct < -10) return { arrow: "↘", label: `${pct.toFixed(1)}%`, cls: "text-red-400" };
    if (pct < -3) return { arrow: "→↘", label: `${pct.toFixed(1)}%`, cls: "text-red-400/70" };
    return { arrow: "→", label: `${pct.toFixed(1)}%`, cls: "text-on-surface-variant/50" };
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const currentState = (): GridPersistedState => ({
    sortKeys: sortKeys(), colOrder: colOrder(), activeFilters: [...activeFilters()],
    pinnedCols: [...pinnedCols()], groupBy: groupBy(), hiddenCols: [...hiddenCols()],
    density: density(), zebraStripe: zebraStripe(), filterCombinator: filterCombinator(),
  });
  const saveCurrentAsPreset = () => {
    const name = presetName().trim(); if (!name) return;
    const updated = [...presets().filter((p) => p.name !== name), { name, state: currentState() }];
    setPresets(updated); lsSet(lsKey(viewId(), "presets"), updated); setPresetName("");
  };
  const loadPreset = (p: ViewPreset) => {
    const s = p.state;
    if (Array.isArray(s.sortKeys)) setSortKeys(s.sortKeys);
    if (Array.isArray(s.colOrder)) setColOrder(s.colOrder);
    setActiveFilters(new Set(s.activeFilters));
    if (Array.isArray(s.pinnedCols)) setPinnedCols(new Set(s.pinnedCols));
    if (typeof s.groupBy === "boolean") setGroupBy(s.groupBy);
    if (Array.isArray(s.hiddenCols)) setHiddenCols(new Set(s.hiddenCols));
    if (s.density) setDensity(normalizeDensity(s.density));
    if (typeof s.zebraStripe === "boolean") setZebraStripe(s.zebraStripe);
    if (s.filterCombinator) setFilterCombinator(s.filterCombinator);
  };
  const deletePreset = (name: string) => {
    const updated = presets().filter((p) => p.name !== name);
    setPresets(updated); lsSet(lsKey(viewId(), "presets"), updated);
  };

  const setNote = (key: string, text: string) => {
    const updated = { ...rowNotes() };
    if (text.trim()) updated[key] = text; else delete updated[key];
    setRowNotes(updated); lsSet(lsKey(viewId(), "notes"), updated);
  };

  const rowKey = (row: GridRow, idx: number) => row.ledger_id ?? String(idx);
  const toggleSelectRow = (key: string) =>
    setSelectedRows((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const selectAll = () => setSelectedRows(new Set<string>(displayRows().map((r, i) => rowKey(r, i))));
  const clearSelection = () => setSelectedRows(new Set<string>());

  const handleBatchTag = async () => {
    const tag = batchTag().trim(); if (!tag) return;
    setBatchPending(true);
    try {
      await queueUiCommand({ query: `Add supertag "${tag}" to rows ${[...selectedRows()].join(", ")} in "${title()}" (view_id=${viewId()})`, thread_id: props.message.thread_id ?? null });
      setBatchTag(""); clearSelection();
    } catch { /* non-blocking */ } finally { setBatchPending(false); }
  };

  const effectiveLabel = (col: GridColumn) => colLabelOverrides()[col.field] ?? col.label;
  const commitRename = async (field: string) => {
    const name = renameValue().trim(); setRenamingCol(null);
    const updated = { ...colLabelOverrides() };
    if (name) updated[field] = name; else delete updated[field];
    setColLabelOverrides(updated); lsSet(lsKey(viewId(), "col_labels"), updated);
    if (name) try { await queueUiCommand({ query: `Rename column "${field}" to "${name}" in "${title()}" (view_id=${viewId()})`, thread_id: props.message.thread_id ?? null }); } catch { /* non-blocking */ }
  };

  const requestEditAccess = async () => {
    if (editRequested()) return; setEditRequested(true);
    try { await queueUiCommand({ query: `Request edit access for view "${title()}" (view_id=${viewId()})`, thread_id: props.message.thread_id ?? null }); setEditRequestSent(true); }
    catch { setEditRequested(false); }
  };

  const saveAsTemplate = (name: string, values: Record<string, string>) => {
    if (!name.trim()) return;
    const updated = [...templates().filter((t) => t.name !== name.trim()), { name: name.trim(), values }];
    setTemplates(updated); lsSet(lsKey(viewId(), "templates"), updated);
  };
  const deleteTemplate = (name: string) => {
    const updated = templates().filter((t) => t.name !== name);
    setTemplates(updated); lsSet(lsKey(viewId(), "templates"), updated);
  };

  const addCellRule = (rule: CellRule) => {
    const updated = [...cellRules(), rule];
    setCellRules(updated); lsSet(lsKey(viewId(), "cell_rules"), updated);
  };
  const deleteCellRule = (idx: number) => {
    const updated = cellRules().filter((_, i) => i !== idx);
    setCellRules(updated); lsSet(lsKey(viewId(), "cell_rules"), updated);
  };

  const handleColDragStart = (field: string, e: DragEvent) => {
    setDragColField(field);
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("application/sgrid-col", field); }
    e.stopPropagation();
  };
  const handleColDragOver = (field: string, e: DragEvent) => {
    if (!e.dataTransfer?.types.includes("application/sgrid-col")) return;
    e.preventDefault(); e.dataTransfer!.dropEffect = "move";
    setDragOverColField(field); e.stopPropagation();
  };
  const handleColDrop = async (toField: string, e: DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const fromField = dragColField(); setDragColField(null); setDragOverColField(null);
    if (!fromField || fromField === toField) return;
    const current = orderedColumns().map((c) => c.field);
    const from = current.indexOf(fromField), to = current.indexOf(toField);
    if (from === -1 || to === -1) return;
    const next = [...current]; const [m] = next.splice(from, 1); next.splice(to, 0, m);
    setColOrder(next);
    try { await queueUiCommand({ query: `Reorder columns in "${title()}" (view_id=${viewId()}): ${next.join(", ")}`, thread_id: props.message.thread_id ?? null }); } catch { /* non-blocking */ }
  };
  const handleColDragEnd = () => { setDragColField(null); setDragOverColField(null); };

  const [colSearchValues, setColSearchValues] = createSignal<Record<string, string>>({});
  const [activeSearchCol, setActiveSearchCol] = createSignal<string | null>(null);
  const setColSearch = (f: string, v: string) => setColSearchValues((p) => ({ ...p, [f]: v }));
  const clearColSearch = (f: string) => setColSearchValues((p) => { const n = { ...p }; delete n[f]; return n; });

  const filteredRows = createMemo(() => {
    let rows = allRows();
    const af = activeFilters();
    if (af.size > 0) {
      if (filterCombinator() === "and")
        rows = rows.filter((r) => [...af].every((f) => r.supertags.includes(f)));
      else
        rows = rows.filter((r) => r.supertags.some((t) => af.has(t)));
    }
    for (const [field, query] of Object.entries(colSearchValues())) {
      if (!query) continue;
      const q = query.toLowerCase();
      rows = rows.filter((r) => asStr(r.cells[field]).toLowerCase().includes(q));
    }
    return rows;
  });

  const tagCounts = createMemo((): Record<string, number> => {
    let rows = allRows();
    for (const [field, query] of Object.entries(colSearchValues())) {
      if (!query) continue;
      const q = query.toLowerCase();
      rows = rows.filter((r) => asStr(r.cells[field]).toLowerCase().includes(q));
    }
    const counts: Record<string, number> = {};
    for (const row of rows) for (const tag of row.supertags) counts[tag] = (counts[tag] ?? 0) + 1;
    return counts;
  });

  const isFiltered = () => filteredRows().length !== allRows().length;
  const toggleFilter = (tag: string) =>
    setActiveFilters((p) => { const n = new Set(p); n.has(tag) ? n.delete(tag) : n.add(tag); return n; });

  const sortedRows = createMemo(() => {
    const sk = sortKeys(); if (sk.length === 0) return filteredRows();
    const cols = columns();
    return [...filteredRows()].sort((a, b) => {
      for (const { field, asc } of sk) {
        const kind = cols.find((c) => c.field === field)?.kind ?? "text";
        const av = a.cells[field], bv = b.cells[field];
        let cmp = 0;
        if (kind === "number" || kind === "formula") { const an = parseFloat(asStr(av)), bn = parseFloat(asStr(bv)); cmp = (isNaN(an) ? -Infinity : an) - (isNaN(bn) ? -Infinity : bn); }
        else if (kind === "date") { const ad = new Date(asStr(av)).getTime(), bd = new Date(asStr(bv)).getTime(); cmp = (isNaN(ad) ? -Infinity : ad) - (isNaN(bd) ? -Infinity : bd); }
        else if (kind === "checkbox") { cmp = (av ? 1 : 0) - (bv ? 1 : 0); }
        else { cmp = asStr(av).localeCompare(asStr(bv)); }
        if (cmp !== 0) return asc ? cmp : -cmp;
      }
      return 0;
    });
  });

  const toggleSort = (field: string, shiftKey: boolean) => {
    if (shiftKey) {
      setSortKeys((p) => { const ex = p.find((k) => k.field === field); return ex ? p.map((k) => k.field === field ? { ...k, asc: !k.asc } : k) : [...p, { field, asc: true }]; });
    } else {
      setSortKeys((p) => p.length === 1 && p[0].field === field ? [{ field, asc: !p[0].asc }] : [{ field, asc: true }]);
    }
  };

  const [collapsedGroups, setCollapsedGroups] = createSignal<Set<string>>(new Set());
  const [manualRows, setManualRows] = createSignal<GridRow[] | null>(null);
  const [dragRowIdx, setDragRowIdx] = createSignal<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = createSignal<number | null>(null);
  const [reorderSuccess, setReorderSuccess] = createSignal(false);

  createEffect(() => { allRows(); setManualRows(null); });
  const displayRows = createMemo(() => manualRows() ?? sortedRows());

  // Pagination — reset page whenever the filtered/sorted set changes
  createEffect(() => { displayRows(); setCurrentPage(0); });
  const pageRows = createMemo(() => {
    const rows = displayRows();
    if (showGlobalSearch() && globalSearchTerm()) return rows; // search shows all
    const ps = pageSize(); const cp = currentPage();
    if (rows.length <= ps) return rows;
    return rows.slice(cp * ps, (cp + 1) * ps);
  });
  const totalPages = () => Math.max(1, Math.ceil(displayRows().length / pageSize()));
  const isPaginated = () => displayRows().length > pageSize() && !(showGlobalSearch() && globalSearchTerm());

  const groupedRows = createMemo((): Map<string, GridRow[]> | null => {
    const ng = numGroupBy();
    if (ng) {
      // UX #44: numeric range grouping
      const rows = displayRows();
      const vals = rows.flatMap((r) => { const n = parseFloat(asStr(r.cells[ng.field])); return isNaN(n) ? [] : [n]; });
      if (!vals.length) return null;
      const minV = Math.min(...vals), maxV = Math.max(...vals);
      if (minV === maxV) return null;
      const bW = (maxV - minV) / ng.buckets;
      const bucketKeys: string[] = Array.from({ length: ng.buckets }, (_, i) => {
        const lo = minV + i * bW, hi = minV + (i + 1) * bW;
        return `${fmtNum(lo)} – ${fmtNum(i === ng.buckets - 1 ? maxV : hi)}`;
      });
      const groups = new Map<string, GridRow[]>(bucketKeys.map((k) => [k, []]));
      for (const row of rows) {
        const n = parseFloat(asStr(row.cells[ng.field]));
        if (isNaN(n)) { if (!groups.has("—")) groups.set("—", []); groups.get("—")!.push(row); continue; }
        const bi = Math.min(Math.floor((n - minV) / bW), ng.buckets - 1);
        groups.get(bucketKeys[bi])!.push(row);
      }
      return groups;
    }
    if (!groupBy()) return null;
    const groups = new Map<string, GridRow[]>();
    for (const row of displayRows()) {
      const key = row.supertags[0] ?? "Untagged";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return groups;
  });
  const toggleGroupCollapse = (tag: string) =>
    setCollapsedGroups((p) => { const n = new Set(p); n.has(tag) ? n.delete(tag) : n.add(tag); return n; });

  const globalMatchRows = createMemo((): number[] => {
    const term = globalSearchTerm().toLowerCase().trim();
    if (!term || !showGlobalSearch()) return [];
    return displayRows().reduce<number[]>((acc, row, idx) => {
      const match = Object.values(row.cells).some((v) => asStr(v).toLowerCase().includes(term))
        || row.supertags.some((t) => t.toLowerCase().includes(term));
      if (match) acc.push(idx);
      return acc;
    }, []);
  });
  createEffect(() => {
    const matches = globalMatchRows(); const idx = globalMatchIdx();
    if (!matches.length) return;
    const rowIdx = matches[Math.min(idx, matches.length - 1)];
    const tr = gridScrollRef?.querySelector<HTMLElement>(`[data-row-idx="${rowIdx}"]`);
    tr?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
  const prevMatch = () => { const m = globalMatchRows(); if (!m.length) return; setGlobalMatchIdx((i) => (i - 1 + m.length) % m.length); };
  const nextMatch = () => { const m = globalMatchRows(); if (!m.length) return; setGlobalMatchIdx((i) => (i + 1) % m.length); };

  const handleDragStart = (idx: number) => (e: DragEvent) => {
    setDragRowIdx(idx);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(idx));
      const row = displayRows()[idx];
      if (row) e.dataTransfer.setData("application/sgrid-row", JSON.stringify({ sourceViewId: viewId(), sourceTitle: title(), ledger_id: row.ledger_id, cells: row.cells, supertags: row.supertags }));
    }
  };
  const handleDragOver = (idx: number) => (e: DragEvent) => {
    if (e.dataTransfer?.types.includes("application/sgrid-col")) return;
    e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  };
  const handleDrop = async (toIdx: number, e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer?.types.includes("application/sgrid-col")) return;
    const crossData = e.dataTransfer?.getData("application/sgrid-row");
    if (crossData) {
      const p = parseSupertagGridCrossRowDrop(crossData);
      if (p && p.sourceViewId !== viewId()) {
        const targetRow = displayRows()[toIdx];
        const targetId = targetRow?.ledger_id ?? `row-${toIdx}`;
        const srcDesc = p.ledgerId ?? Object.values(p.cells).slice(0, 2).map(String).join(", ");
        await queueUiCommand({ query: `Link row "${srcDesc}" from "${p.sourceTitle}" to "${targetId}" in "${title()}" (view_id=${viewId()})`, thread_id: props.message.thread_id ?? null });
        setLinkSuccess(true); setTimeout(() => setLinkSuccess(false), 3000);
        setDragRowIdx(null); setDragOverIdx(null); return;
      }
    }
    const fromIdx = dragRowIdx();
    if (fromIdx === null || fromIdx === toIdx) { setDragRowIdx(null); setDragOverIdx(null); return; }
    const base = [...displayRows()]; const [moved] = base.splice(fromIdx, 1); base.splice(toIdx, 0, moved);
    setManualRows(base); setDragRowIdx(null); setDragOverIdx(null);
    const ids = base.map((r) => r.ledger_id ?? "").filter(Boolean).join(", ");
    if (ids) try { await queueUiCommand({ query: `Reorder rows in "${title()}" (view_id=${viewId()}). New order: ${ids}`, thread_id: props.message.thread_id ?? null }); setReorderSuccess(true); setTimeout(() => setReorderSuccess(false), 3000); } catch { /* non-blocking */ }
  };
  const handleDragEnd = () => { setDragRowIdx(null); setDragOverIdx(null); };

  const orderedColumns = createMemo(() => {
    const order = colOrder(); const pinned = [...pinnedCols()]; const cols = columns();
    let sorted: GridColumn[];
    if (order.length > 0) {
      const map = new Map(cols.map((c) => [c.field, c]));
      sorted = [...order.flatMap((f) => map.has(f) ? [map.get(f)!] : []), ...cols.filter((c) => !order.includes(c.field))];
    } else { sorted = cols; }
    return [...sorted.filter((c) => pinned.includes(c.field)), ...sorted.filter((c) => !pinned.includes(c.field))];
  });
  const visibleColumns = createMemo(() => {
    const hidden = new Set(hiddenCols());
    for (const rule of colVisRules()) {
      const matches = allRows().some((row) => evalRule(asStr(row.cells[rule.triggerField]), rule.op, rule.value));
      if (matches) hidden.add(rule.hideField);
    }
    return orderedColumns().filter((c) => !hidden.has(c.field));
  });
  const effectiveColumns = createMemo(() => visibleColumns().map((col) => ({ ...col, label: effectiveLabel(col) })));

  const pinnedOffsets = createMemo(() => {
    const offsets: Record<string, number> = {}; let acc = 0;
    for (const col of orderedColumns()) {
      if (!pinnedCols().has(col.field)) break;
      offsets[col.field] = acc; acc += (col.width ?? 3) * 60;
    }
    return offsets;
  });
  const togglePin = (field: string) => setPinnedCols((p) => { const n = new Set(p); n.has(field) ? n.delete(field) : n.add(field); return n; });
  const toggleHidden = (field: string) => setHiddenCols((p) => { const n = new Set(p); n.has(field) ? n.delete(field) : n.add(field); return n; });
  const totalColCount = () => visibleColumns().length + ((groupBy() || !!numGroupBy()) ? 1 : 3);

  const sparklineValues = createMemo((): Record<string, number[]> => {
    const rows = allRows(); const result: Record<string, number[]> = {};
    for (const col of columns()) {
      if (col.kind !== "number" && col.kind !== "formula") continue;
      result[col.field] = rows.map((r) => {
        if (col.kind === "formula" && col.formula) { const ev = evalFormula(col.formula, r.cells); return ev !== null ? parseFloat(ev) : NaN; }
        return parseFloat(asStr(r.cells[col.field]));
      }).filter((n) => !isNaN(n));
    }
    return result;
  });

  const statBarStats = createMemo(() => {
    const field = statsBarCol(); if (!field) return null;
    const cd = columns().find((c) => c.field === field);
    const nums = displayRows().flatMap((r) => {
      if (cd?.kind === "formula" && cd.formula) { const ev = evalFormula(cd.formula, r.cells); const n = ev !== null ? parseFloat(ev) : NaN; return isNaN(n) ? [] : [n]; }
      const n = parseFloat(asStr(r.cells[field])); return isNaN(n) ? [] : [n];
    });
    if (!nums.length) return null;
    const sum = nums.reduce((a, b) => a + b, 0), mean = sum / nums.length;
    const sorted = [...nums].sort((a, b) => a - b);
    return { sum, mean, min: sorted[0], max: sorted[sorted.length - 1], count: nums.length };
  });

  const staleCount = createMemo(() => displayRows().filter((r) => isStaleRow(r)).length);
  const archiveStale = async () => {
    setArchiveStalePending(true);
    const stale = displayRows().filter((r) => isStaleRow(r));
    const ids = stale.map((r) => r.ledger_id ?? "").filter(Boolean).join(", ");
    try { await queueUiCommand({ query: `Archive ${stale.length} stale rows in "${title()}" (view_id=${viewId()})${ids ? ": " + ids : ""}`, thread_id: props.message.thread_id ?? null }); }
    catch { /* non-blocking */ } finally { setArchiveStalePending(false); }
  };

  const submitPaste = async () => {
    setPastePending(true);
    try {
      const cm = pasteColMap();
      const mapped = pasteData().map((row) => {
        const cells: Record<string, string> = {};
        for (const [idxStr, field] of Object.entries(cm)) {
          const idx = parseInt(idxStr);
          if (field && row[idx] !== undefined) cells[field] = row[idx];
        }
        return cells;
      }).filter((cells) => Object.keys(cells).length > 0);
      if (!mapped.length) return;
      const cols = columns();
      const desc = mapped.map((cells) => Object.entries(cells).map(([f, v]) => `${cols.find((c) => c.field === f)?.label ?? f}: ${v}`).join(", ")).join(" | ");
      await queueUiCommand({ query: `Add ${mapped.length} rows to "${title()}" (view_id=${viewId()}): ${desc}`, thread_id: props.message.thread_id ?? null });
      setPasteVisible(false); setPasteData([]); setPasteColMap({});
    } catch { /* non-blocking */ } finally { setPastePending(false); }
  };

  const [showColMenu, setShowColMenu] = createSignal(false);
  const [expandedIdx, setExpandedIdx] = createSignal<number | null>(null);
  const [formulaModal, setFormulaModal] = createSignal<GridColumn | null>(null);
  const [hoveredRowIdx, setHoveredRowIdx] = createSignal<number | null>(null);
  const [editingCell, setEditingCell] = createSignal<{ rowKey: string; field: string } | null>(null);
  const [pendingEdits, setPendingEdits] = createSignal<Map<string, Record<string, string>>>(new Map());
  const [submittingEdits, setSubmittingEdits] = createSignal(false);
  const [editSubmitError, setEditSubmitError] = createSignal<GridMutationFailureReceipt | null>(null);
  const [editSubmitSuccess, setEditSubmitSuccess] = createSignal(false);
  const setPendingEdit = (key: string, field: string, val: string) =>
    setPendingEdits((p) => { const n = new Map(p); n.set(key, { ...(n.get(key) ?? {}), [field]: val }); return n; });
  const clearPendingEdit = (key: string, field: string) =>
    setPendingEdits((p) => { const n = new Map(p); const e = { ...(n.get(key) ?? {}) }; delete e[field]; Object.keys(e).length ? n.set(key, e) : n.delete(key); return n; });
  const pendingEditCount = () => { let n = 0; for (const e of pendingEdits().values()) n += Object.keys(e).length; return n; };

  const submitEdits = async () => {
    setSubmittingEdits(true); setEditSubmitError(null); setEditSubmitSuccess(false);
    const captured: Array<{ key: string; field: string; val: string }> = [];
    for (const [key, edits] of pendingEdits()) for (const [field, val] of Object.entries(edits)) captured.push({ key, field, val });
    try {
      const strs = captured.map(({ key, field, val }) => `${key}.${columns().find((c) => c.field === field)?.label ?? field} = ${val}`);
      await queueUiCommand({ query: `Apply edits to "${title()}" (view_id=${viewId()}): ${strs.join("; ")}`, thread_id: props.message.thread_id ?? null });
      const ts = new Date().toISOString(); const newHist = { ...editHistory() };
      for (const { key, field, val } of captured) {
        const label = columns().find((c) => c.field === field)?.label ?? field;
        const origRow = displayRows().find((r, i) => rowKey(r, i) === key);
        newHist[key] = [...(newHist[key] ?? []), { ts, field, label, oldVal: origRow ? asStr(origRow.cells[field]) : "", newVal: val }];
      }
      setEditHistory(newHist); lsSet(lsKey(viewId(), "edit_history"), newHist);
      setEditSubmitSuccess(true); setPendingEdits(new Map()); setEditingCell(null);
    } catch (err) {
      setEditSubmitError(
        buildGridMutationFailureReceipt(
          "Submit grid edits",
          err instanceof Error ? err.message : "Failed.",
        ),
      );
    }
    finally { setSubmittingEdits(false); }
  };

  const footerStats = createMemo(() => {
    const rows = displayRows(); if (!rows.length) return null;
    return visibleColumns().map((col) => {
      const vals = rows.map((r) => r.cells[col.field]);
      if (col.kind === "number" || col.kind === "formula") {
        const nums = vals.map((v) => { if (col.kind === "formula" && col.formula) { const row = rows.find((r) => r.cells[col.field] === v); const ev = row ? evalFormula(col.formula, row.cells) : null; return ev !== null ? parseFloat(ev) : NaN; } return parseFloat(asStr(v)); }).filter((n) => !isNaN(n));
        if (!nums.length) return { kind: "empty" as const, text: "—" };
        const sum = nums.reduce((a, b) => a + b, 0), avg = sum / nums.length;
        return { kind: "number" as const, sum: fmtNum(sum), avg: fmtNum(avg) };
      }
      if (col.kind === "checkbox") return { kind: "checkbox" as const, text: `${vals.filter(Boolean).length}/${vals.length}` };
      return { kind: "text" as const, text: `${vals.filter((v) => asStr(v) !== "").length} filled` };
    });
  });

  const [addRowOpen, setAddRowOpen] = createSignal(false);
  const [fieldValues, setFieldValues] = createSignal<Record<string, string>>({});
  const [proposing, setProposing] = createSignal(false);
  const [proposeError, setProposeError] = createSignal<GridMutationFailureReceipt | null>(null);
  const [proposeSuccess, setProposeSuccess] = createSignal(false);
  const openWithValues = (vals: Record<string, string>) => { setFieldValues(vals); setAddRowOpen(true); setProposeSuccess(false); };
  const submitPropose = async () => {
    setProposing(true); setProposeError(null); setProposeSuccess(false);
    try {
      const fv = fieldValues();
      const pairs = columns().filter((col) => fv[col.field]).map((col) => `${col.label}: ${fv[col.field]}`).join(", ");
      await queueUiCommand({ query: `Add row to "${title()}" (view_id=${viewId()}): ${pairs}`, thread_id: props.message.thread_id ?? null });
      setProposeSuccess(true); setAddRowOpen(false); setFieldValues({});
    } catch (err) {
      setProposeError(
        buildGridMutationFailureReceipt(
          "Propose row",
          err instanceof Error ? err.message : "Failed.",
        ),
      );
    }
    finally { setProposing(false); }
  };

  const handleScroll = (e: Event) => {
    const el = e.currentTarget as HTMLDivElement;
    setScrollTop(el.scrollTop); setScrollHeight(el.scrollHeight); setClientHeight(el.clientHeight);
  };
  const scrollRatio = () => scrollHeight() > clientHeight() ? scrollTop() / (scrollHeight() - clientHeight()) : 0;
  const viewportRatio = () => scrollHeight() > 0 ? Math.min(1, clientHeight() / scrollHeight()) : 1;
  const seekMinimap = (ratio: number) => {
    if (!gridScrollRef) return;
    gridScrollRef.scrollTop = ratio * (gridScrollRef.scrollHeight - gridScrollRef.clientHeight);
    setScrollTop(gridScrollRef.scrollTop);
  };

  const handleExport = () => exportCsv(title(), effectiveColumns(), displayRows());
  const showSkeleton = () => columns().length > 0 && allRows().length === 0;

  const rowClass = (idx: number, isExpanded: boolean, highlight: string, selected: boolean, isMatch: boolean, hasAnnotation: boolean, stale: boolean) => {
    const even = zebraStripe() && idx % 2 === 1 ? "bg-white/[0.02]" : "";
    const expanded = isExpanded ? "bg-white/10" : even;
    const sel = selected ? "!bg-primary/5" : "";
    const match = isMatch ? "outline outline-1 outline-sky-400/40" : "";
    const leftBorder = stale
      ? "border-l-2 border-l-orange-400/60 !bg-amber-500/[0.03]"
      : (!highlight && hasAnnotation ? "border-l-2 border-l-amber-400/40" : "");
    return `border-t border-white/8 cursor-pointer ${expanded} hover:bg-white/6 transition ${highlight} ${sel} ${match} ${leftBorder}`;
  };

  const closeAllPopovers = () => {
    setShowColMenu(false); setShowPresetMenu(false); setShowTemplatesMenu(false);
    setRenamingCol(null); setShowCellRulePopover(null); setStatsBarCol(null);
    setShowCurrencyPanel(null); setShowNumGroupPanel(false);
    setShowColVisPanel(false); setShowAnnotationsPanel(null); setWhatIfRowKey(null);
  };

  return (
    <div ref={containerRef} class="space-y-3" onClick={closeAllPopovers}>

      {/* Header */}
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p class="font-semibold text-on-surface">{title()}</p>
          <Show when={description()}><p class="text-xs text-on-surface-variant mt-0.5">{description()}</p></Show>
        </div>
        <div class="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
          <span class="text-[0.65rem] text-on-surface-variant border border-white/20 rounded-full px-2 py-0.5">
            <Show when={isFiltered()} fallback={<>{displayRows().length} row{displayRows().length === 1 ? "" : "s"}</>}>
              {displayRows().length} of {allRows().length}
            </Show>
          </span>
          <Show when={accessMode() === "locked"}>
            <span class="text-[0.6rem] text-on-surface-variant/50 border border-white/15 rounded-full px-2 py-0.5">🔒 Locked</span>
          </Show>
          <Show when={accessMode() === "agent_managed"}>
            <button type="button" disabled={editRequested()} onClick={(e) => { e.stopPropagation(); void requestEditAccess(); }}
              class={`text-[0.6rem] border rounded-full px-2 py-0.5 transition ${editRequestSent() ? "border-emerald-400/30 text-emerald-300/70 cursor-default" : "border-amber-400/30 text-amber-300/70 hover:bg-amber-500/10"}`}>
              {editRequestSent() ? "✓ Edit requested" : "🌐 Agent view"}
            </button>
          </Show>
          <button type="button" onClick={(e) => { e.stopPropagation(); setShowFormulaBar((v) => !v); if (!showFormulaBar()) setFormulaBarCollapsed(false); }}
            class={`text-[0.65rem] border rounded-full px-2 py-0.5 transition ${showFormulaBar() ? "border-amber-400/50 bg-amber-500/10 text-amber-300" : "border-white/20 text-on-surface-variant hover:bg-white/10"}`}
            title="Formula bar (ƒx)">ƒx</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); setShowFormatRules((v) => !v); }}
            class={`text-[0.65rem] border rounded-full px-2 py-0.5 transition ${showFormatRules() ? "border-amber-400/50 bg-amber-500/10 text-amber-300" : rowFormatRules().length > 0 ? "border-amber-400/30 text-amber-300/70 hover:bg-white/10" : "border-white/20 text-on-surface-variant hover:bg-white/10"}`}
            title="Row format rules">◈ {rowFormatRules().length > 0 ? rowFormatRules().length : "Format"}</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); setDiffMode((v) => !v); }}
            class={`text-[0.65rem] border rounded-full px-2 py-0.5 transition ${diffMode() ? "border-sky-400/50 bg-sky-500/10 text-sky-300" : "border-white/20 text-on-surface-variant hover:bg-white/10"}`}
            title="Diff mode — highlight cells changed since last edit">Δ Diff</button>
          {/* UX #41: heat-map column picker */}
          <div class="relative">
            <select
              class={`text-[0.65rem] border rounded-full px-2 py-0.5 transition cursor-pointer bg-transparent outline-none ${heatmapCol() ? "border-amber-400/50 text-amber-300" : "border-white/20 text-on-surface-variant hover:bg-white/10"}`}
              title="Row heat-map: colour rows by column value intensity"
              value={heatmapCol() ?? ""}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { e.stopPropagation(); setHeatmapCol(e.currentTarget.value || null); }}
            >
              <option value="">◉ Heat-map…</option>
              <For each={visibleColumns().filter((c) => c.kind === "number" || c.kind === "formula")}>{(c) => <option value={c.field}>{effectiveLabel(c)}</option>}</For>
            </select>
          </div>
          {/* UX #44: numeric range groups */}
          <div class="relative">
            <button type="button"
              class={`text-[0.65rem] border rounded-full px-2 py-0.5 transition ${numGroupBy() ? "border-amber-400/50 bg-amber-500/10 text-amber-300" : "border-white/20 text-on-surface-variant hover:bg-white/10"}`}
              title="Group rows by numeric range buckets"
              onClick={(e) => { e.stopPropagation(); setShowNumGroupPanel((v) => !v); }}>
              ⊟ Range{numGroupBy() ? ` (${numGroupBy()!.buckets})` : ""}
            </button>
            <Show when={showNumGroupPanel()}>
              <div class="absolute right-0 top-full mt-1.5 z-[200] w-60 rounded-2xl border border-white/20 bg-black/90 py-2 shadow-2xl backdrop-blur-md" onClick={(e) => e.stopPropagation()}>
                <p class="px-3 pt-1 pb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-on-surface-variant/50">Numeric range groups</p>
                <div class="px-3 space-y-2 pb-2">
                  <div class="flex items-center gap-2">
                    <span class="text-outline text-[0.6rem] shrink-0">Column</span>
                    <select class="flex-1 rounded border border-white/20 bg-black/40 text-xs text-on-surface px-1 py-0.5 outline-none"
                      value={ngField()} onChange={(e) => setNgField(e.currentTarget.value)}>
                      <option value="">— pick —</option>
                      <For each={visibleColumns().filter((c) => c.kind === "number" || c.kind === "formula")}>{(c) => <option value={c.field}>{effectiveLabel(c)}</option>}</For>
                    </select>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-outline text-[0.6rem] shrink-0">Buckets</span>
                    <input type="number" min="2" max="20" class="w-16 rounded border border-white/20 bg-black/40 text-xs text-on-surface px-1.5 py-0.5 outline-none tabular-nums"
                      value={ngBuckets()} onInput={(e) => setNgBuckets(Math.max(2, parseInt(e.currentTarget.value) || 5))} />
                  </div>
                  <div class="flex gap-1.5 pt-0.5">
                    <button type="button" disabled={!ngField()} class="flex-1 rounded-md border border-amber-400/40 bg-amber-500/10 text-amber-300 text-[0.65rem] py-0.5 hover:bg-amber-500/20 disabled:opacity-40 transition"
                      onClick={() => { if (ngField()) { setNumGroupBy({ field: ngField(), buckets: ngBuckets() }); setShowNumGroupPanel(false); } }}>Apply</button>
                    <Show when={numGroupBy()}>
                      <button type="button" class="flex-1 rounded-md border border-white/15 text-on-surface-variant/60 text-[0.65rem] py-0.5 hover:bg-white/5 transition"
                        onClick={() => { setNumGroupBy(null); setShowNumGroupPanel(false); }}>Clear</button>
                    </Show>
                  </div>
                </div>
              </div>
            </Show>
          </div>
          {/* UX #45: share/snapshot link */}
          <button type="button" onClick={(e) => { e.stopPropagation(); copyShareLink(); }}
            class={`text-[0.65rem] border rounded-full px-2 py-0.5 transition ${shareCopied() ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300" : "border-white/20 text-on-surface-variant hover:bg-white/10"}`}
            title="Copy shareable link to current view state">
            {shareCopied() ? "✓ Copied!" : "⎦ Share"}
          </button>
          {/* UX #47: conditional column visibility rules */}
          <div class="relative">
            <button type="button" onClick={(e) => { e.stopPropagation(); setShowColVisPanel((v) => !v); }}
              class={`text-[0.65rem] border rounded-full px-2 py-0.5 transition ${showColVisPanel() ? "border-indigo-400/50 bg-indigo-500/10 text-indigo-300" : colVisRules().length > 0 ? "border-indigo-400/30 text-indigo-300/70 hover:bg-white/10" : "border-white/20 text-on-surface-variant hover:bg-white/10"}`}
              title="Conditional column visibility rules">
              ⊘ {colVisRules().length > 0 ? colVisRules().length : "ColRules"}
            </button>
            <Show when={showColVisPanel()}>
              <ColVisRulesPanel
                columns={columns()} rules={colVisRules()}
                onAdd={addColVisRule} onRemove={removeColVisRule}
                onClose={() => setShowColVisPanel(false)}
              />
            </Show>
          </div>
          {/* UX #48: copy selection as Markdown/CSV */}
          <Show when={selectedRows().size > 0}>
            <button type="button" class="text-[0.65rem] border border-sky-400/30 text-sky-300/70 rounded-full px-2 py-0.5 hover:bg-sky-500/10 transition"
              title="Copy selected rows as Markdown table" onClick={() => copySelectedAsMarkdown()}>⊡ MD</button>
          </Show>
          <button type="button" onClick={(e) => { e.stopPropagation(); setShowGlobalSearch((v) => !v); setTimeout(() => globalSearchInputRef?.focus(), 30); }}
            class={`text-[0.65rem] border rounded-full px-2 py-0.5 transition ${showGlobalSearch() ? "border-sky-400/50 bg-sky-500/10 text-sky-300" : "border-white/20 text-on-surface-variant hover:bg-white/10"}`}
            title="Global search (Ctrl+F)">🔍 Search</button>
          <button type="button" class={`text-[0.65rem] border rounded-full px-2 py-0.5 transition ${groupBy() ? "border-violet-400/50 bg-violet-500/10 text-violet-300" : "border-white/20 text-on-surface-variant hover:bg-white/10"}`}
            onClick={(e) => { e.stopPropagation(); setGroupBy((v) => !v); }}>⊞ Group</button>
          <Show when={displayRows().length > 0}>
            <button type="button" class="text-[0.65rem] text-on-surface-variant border border-white/20 rounded-full px-2 py-0.5 hover:bg-white/10 transition" onClick={handleExport}>↓ CSV</button>
          </Show>
          <Show when={pendingEditCount() > 0}>
            <button type="button" disabled={submittingEdits()} onClick={() => void submitEdits()} class="text-[0.65rem] border border-amber-400/50 bg-amber-500/10 text-amber-300 rounded-full px-2 py-0.5 hover:bg-amber-500/20 disabled:opacity-50 transition">
              {submittingEdits() ? "Sending…" : `Submit ${pendingEditCount()} edit${pendingEditCount() === 1 ? "" : "s"} →`}
            </button>
          </Show>
          <Show when={allowEdit()}>
            <div class="relative">
              <button type="button" onClick={(e) => { e.stopPropagation(); setShowTemplatesMenu((v) => !v); setShowPresetMenu(false); setShowColMenu(false); }}
                class={`text-[0.65rem] border rounded-full px-2 py-0.5 transition ${showTemplatesMenu() ? "border-violet-400/50 bg-violet-500/10 text-violet-300" : templates().length > 0 ? "border-violet-400/30 text-violet-300/70 hover:bg-white/10" : "border-white/20 text-on-surface-variant hover:bg-white/10"}`}>
                📋 {templates().length > 0 ? templates().length : "Templates"}</button>
              <Show when={showTemplatesMenu()}>
                <TemplatesPopover templates={templates()} onApply={(t) => openWithValues(t.values)} onDelete={deleteTemplate} onClose={() => setShowTemplatesMenu(false)} />
              </Show>
            </div>
          </Show>
          <div class="relative">
            <button type="button" onClick={(e) => { e.stopPropagation(); setShowPresetMenu((v) => !v); setShowColMenu(false); setShowTemplatesMenu(false); }}
              class={`text-[0.65rem] border rounded-full px-2 py-0.5 transition ${showPresetMenu() ? "border-violet-400/50 bg-violet-500/10 text-violet-300" : presets().length > 0 ? "border-violet-400/30 text-violet-300/70 hover:bg-white/10" : "border-white/20 text-on-surface-variant hover:bg-white/10"}`}>
              {presets().length > 0 ? `⊠ ${presets().length}` : "⊠ Preset"}</button>
            <Show when={showPresetMenu()}>
              <PresetPopover presets={presets()} presetName={presetName()} onNameInput={setPresetName} onSave={saveCurrentAsPreset} onLoad={loadPreset} onDelete={deletePreset} onClose={() => setShowPresetMenu(false)} />
            </Show>
          </div>
          <div class="relative">
            <button type="button" onClick={(e) => { e.stopPropagation(); setShowColMenu((v) => !v); setShowPresetMenu(false); setShowTemplatesMenu(false); }}
              class={`text-[0.65rem] border rounded-full px-2 py-0.5 transition ${showColMenu() ? "border-sky-400/50 bg-sky-500/10 text-sky-300" : "border-white/20 text-on-surface-variant hover:bg-white/10"}`}>⚙ View</button>
            <Show when={showColMenu()}>
              <ColumnMenuPopover columns={columns()} hiddenCols={hiddenCols()} density={density()} zebraStripe={zebraStripe()} onToggleCol={toggleHidden} onDensity={setDensity} onZebra={() => setZebraStripe((v) => !v)} onClose={() => setShowColMenu(false)} />
            </Show>
          </div>
        </div>
      </div>

      {/* Global search bar */}
      <Show when={showGlobalSearch()}>
        <div class="flex items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-500/5 px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
          <span class="text-sky-400/60 text-sm">🔍</span>
          <input ref={globalSearchInputRef} type="text" placeholder="Search all columns…"
            class="flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant/40"
            value={globalSearchTerm()}
            onInput={(e) => { setGlobalSearchTerm(e.currentTarget.value); setGlobalMatchIdx(0); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.shiftKey ? prevMatch() : nextMatch(); } if (e.key === "Escape") { setShowGlobalSearch(false); setGlobalSearchTerm(""); } }} />
          <Show when={globalSearchTerm()}>
            <span class="text-[0.65rem] text-on-surface-variant/60 font-mono shrink-0">
              {globalMatchRows().length === 0 ? "no matches" : `${globalMatchIdx() + 1} / ${globalMatchRows().length}`}
            </span>
            <button type="button" class="text-[0.65rem] text-on-surface-variant/50 hover:text-on-surface-variant px-1" onClick={prevMatch}>↑</button>
            <button type="button" class="text-[0.65rem] text-on-surface-variant/50 hover:text-on-surface-variant px-1" onClick={nextMatch}>↓</button>
          </Show>
          <button type="button" class="text-[0.65rem] text-on-surface-variant/40 hover:text-on-surface-variant transition" onClick={() => { setShowGlobalSearch(false); setGlobalSearchTerm(""); }}>✕</button>
        </div>
      </Show>

      {/* Diff preview */}
      <Show when={pendingEditCount() > 0}>
        <div class="rounded-lg border border-amber-400/20 bg-amber-500/5 px-3 py-2 space-y-1">
          <p class="font-mono text-[0.6rem] uppercase tracking-widest text-outline mb-1">Pending changes</p>
          <For each={[...pendingEdits().entries()]}>{([key, edits]) => (
            <For each={Object.entries(edits)}>{([field, val]) => {
              const colLbl = columns().find((c) => c.field === field)?.label ?? field;
              const original = displayRows().find((r, i) => rowKey(r, i) === key);
              return (
                <div class="flex items-center gap-2 text-[0.65rem]">
                  <span class="text-outline font-mono w-20 shrink-0 truncate">{colLbl}</span>
                  <span class="text-on-surface-variant/50 line-through truncate max-w-[80px]">{original ? asStr(original.cells[field]) || "—" : "—"}</span>
                  <span class="text-amber-300 truncate max-w-[120px]">→ {val}</span>
                  <button type="button" class="text-on-surface-variant/40 hover:text-red-400 transition ml-auto shrink-0" onClick={() => clearPendingEdit(key, field)}>✕</button>
                </div>
              );
            }}</For>
          )}</For>
          <Show when={editSubmitError()}>
            <div class="space-y-1 pt-1">
              <p class="text-[0.65rem] font-medium text-red-400">{editSubmitError()?.title}</p>
              <p class="text-[0.65rem] text-on-surface-variant">{editSubmitError()?.summary}</p>
              <p class="text-[0.6rem] text-on-surface-variant/80">{editSubmitError()?.nextStep}</p>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={editSubmitSuccess()}><p class="text-[0.65rem] text-emerald-400 border border-emerald-400/20 rounded-lg px-3 py-1.5">✓ Edits submitted.</p></Show>
      <Show when={reorderSuccess()}><p class="text-[0.65rem] text-sky-400 border border-sky-400/20 rounded-lg px-3 py-1.5">✓ Row order sent to agent.</p></Show>
      <Show when={linkSuccess()}><p class="text-[0.65rem] text-violet-400 border border-violet-400/20 rounded-lg px-3 py-1.5">✓ Row link proposal sent.</p></Show>
      <Show when={storageWarning()}>
        <p class="text-[0.65rem] text-orange-300 border border-orange-400/20 rounded-lg px-3 py-1.5 flex items-center gap-2">
          ⚠ localStorage quota exceeded — view settings may not persist.
          <button type="button" class="ml-auto text-[0.6rem] opacity-60 hover:opacity-100" onClick={() => setStorageWarning(false)}>✕</button>
        </p>
      </Show>

      {/* UX #40: Filter bookmarks */}
      <Show when={filterBookmarks().length > 0 || activeFilters().size > 0}>
        <div class="flex flex-wrap gap-1.5 items-center" onClick={(e) => e.stopPropagation()}>
          <span class="text-[0.6rem] font-mono uppercase tracking-widest text-outline mr-0.5">Bookmarks</span>
          <For each={filterBookmarks()}>{(bm) => (
            <div class="group flex items-center gap-0.5">
              <button type="button" class="text-[0.6rem] border border-white/15 rounded-full px-2 py-0.5 text-on-surface-variant hover:border-sky-400/40 hover:text-sky-300 transition"
                onClick={() => applyFilterBookmark(bm)} title={`${bm.filters.join(", ")} (${bm.combinator.toUpperCase()})`}>{bm.name}</button>
              <button type="button" class="opacity-0 group-hover:opacity-100 text-[0.55rem] text-on-surface-variant/40 hover:text-red-400 transition" onClick={() => deleteFilterBookmark(bm.name)}>✕</button>
            </div>
          )}</For>
          <Show when={activeFilters().size > 0}>
            <div class="flex items-center gap-1">
              <input type="text" placeholder="Bookmark name…" class="rounded border border-white/15 bg-black/20 text-[0.6rem] text-on-surface px-1.5 py-0.5 outline-none focus:border-sky-400/50 w-24"
                value={bookmarkName()} onInput={(e) => setBookmarkName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    recordShortcutUse("form_submit");
                    saveFilterBookmark();
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    recordShortcutUse("form_cancel");
                    setBookmarkName("");
                  }
                }} />
              <button type="button" disabled={!bookmarkName().trim()} class="text-[0.6rem] border border-sky-400/30 text-sky-300/70 rounded-full px-1.5 py-0.5 hover:bg-sky-500/10 disabled:opacity-40 transition"
                onClick={saveFilterBookmark}>+ Save</button>
            </div>
          </Show>
        </div>
      </Show>

      {/* Supertag filters + UX #35 AND/OR toggle */}
      <Show when={supertTagFilter().length > 0}>
        <div class="flex flex-wrap gap-1.5 items-center">
          <span class="text-[0.6rem] font-mono uppercase tracking-widest text-outline mr-1">Filter</span>
          <Show when={activeFilters().size > 1}>
            <button type="button"
              class={`text-[0.6rem] font-mono font-semibold border rounded-full px-2 py-0.5 transition ${filterCombinator() === "and" ? "border-indigo-400/50 bg-indigo-500/10 text-indigo-300" : "border-violet-400/30 bg-violet-500/5 text-violet-300/70"}`}
              onClick={(e) => { e.stopPropagation(); setFilterCombinator((v) => v === "and" ? "or" : "and"); }}
              title="AND = row must match all · OR = row matches any">
              {filterCombinator() === "and" ? "AND" : "OR"}
            </button>
          </Show>
          <For each={supertTagFilter()}>{(tag) => {
            const count = () => tagCounts()[tag] ?? 0;
            return (
              <button type="button" onClick={() => toggleFilter(tag)}
                class={`inline-flex items-center gap-1 rounded-full border px-[0.55em] py-[0.15em] text-[0.65rem] font-medium transition ${activeFilters().has(tag) ? tagColor(tag) : "border-white/15 bg-white/5 text-on-surface-variant opacity-50"}`}>
                {activeFilters().has(tag) && "✓ "}{tag}<span class="font-mono opacity-70">({count()})</span>
              </button>
            );
          }}</For>
          <Show when={isFiltered()}>
            <span class="text-[0.6rem] text-on-surface-variant/50 ml-1 italic">showing {displayRows().length} of {allRows().length}</span>
          </Show>
        </div>
      </Show>

      {/* UX #38: User row format rules panel */}
      <Show when={showFormatRules()}>
        <RowFormatRulesPanel columns={visibleColumns()} rules={rowFormatRules()} onAdd={addRowFormatRule} onDelete={deleteRowFormatRule} onClose={() => setShowFormatRules(false)} />
      </Show>

      {/* UX #34: stale row banner */}
      <Show when={staleCount() > 0}>
        <div class="flex items-center gap-3 rounded-lg border border-orange-400/25 bg-orange-500/5 px-3 py-1.5">
          <span class="text-[0.65rem] text-orange-300">⏰ {staleCount()} stale row{staleCount() === 1 ? "" : "s"} (past _expires date)</span>
          <button type="button" disabled={archiveStalePending()} onClick={() => void archiveStale()}
            class="text-[0.6rem] border border-orange-400/30 text-orange-300/80 rounded-full px-2 py-0.5 hover:bg-orange-500/10 disabled:opacity-40 transition ml-auto">
            {archiveStalePending() ? "…" : "Archive all stale"}
          </button>
        </div>
      </Show>

      <Show when={proposeSuccess()}><p class="text-[0.65rem] text-emerald-400 border border-emerald-400/20 rounded-lg px-3 py-1.5">✓ Row proposal sent.</p></Show>

      {/* Formula bar */}
      <Show when={showFormulaBar()}>
        <FormulaBar effectiveCols={effectiveColumns()} rows={displayRows()} viewId={viewId()} collapsed={formulaBarCollapsed()} onToggle={() => setFormulaBarCollapsed((v) => !v)} />
      </Show>

      {/* Grid + minimap */}
      <div class="flex gap-1.5 items-stretch">
        <div ref={gridScrollRef} tabIndex={0} class="overflow-auto rounded-xl border border-white/15 bg-white/4 flex-1 outline-none" onScroll={handleScroll}
          onKeyDown={(e) => {
            if (showGlobalSearch()) return;
            const rows = pageRows();
            if (!rows.length) return;
            const fi = focusedRowIdx() ?? -1;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              const next = fi < 0 ? 0 : Math.min(rows.length - 1, fi + 1);
              setFocusedRowIdx(next);
              gridScrollRef.querySelector<HTMLElement>(`[data-row-idx="${currentPage() * pageSize() + next}"]`)?.scrollIntoView({ block: "nearest" });
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              const next = fi <= 0 ? 0 : fi - 1;
              setFocusedRowIdx(next);
              gridScrollRef.querySelector<HTMLElement>(`[data-row-idx="${currentPage() * pageSize() + next}"]`)?.scrollIntoView({ block: "nearest" });
            } else if (e.key === "Enter" && fi >= 0) {
              e.preventDefault();
              const absI = currentPage() * pageSize() + fi;
              setExpandedIdx((v) => v === absI ? null : absI);
            } else if (e.key === " " && fi >= 0) {
              e.preventDefault();
              toggleSelectRow(rowKey(rows[fi], currentPage() * pageSize() + fi));
            } else if ((e.key === "e" || e.key === "E") && fi >= 0 && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              const firstEditable = effectiveColumns().find((c) => c.kind !== "formula" && c.kind !== "checkbox");
              if (firstEditable && allowEdit())
                setEditingCell({ rowKey: rowKey(rows[fi], currentPage() * pageSize() + fi), field: firstEditable.field });
            } else if (e.key === "Escape") {
              setFocusedRowIdx(null);
            }
          }}>
          <Show when={columns().length > 0} fallback={<p class="px-4 py-6 text-sm text-on-surface-variant text-center">No columns defined.</p>}>
            <table class="w-full text-left text-sm border-collapse">
              <thead>
                <tr class="border-b border-white/10 bg-white/4">
                  <Show when={!groupBy()}>
                    <th class="w-8 px-2 align-middle">
                      <SelectAllCheckbox
                        allSelected={selectedRows().size === displayRows().length && displayRows().length > 0}
                        someSelected={selectedRows().size > 0 && selectedRows().size < displayRows().length}
                        onToggle={(checked) => checked ? selectAll() : clearSelection()}
                      />
                    </th>
                    <th class="w-6 px-1" />
                  </Show>
                  <th class="px-3 py-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-outline whitespace-nowrap w-[90px]">Tags</th>
                  <For each={visibleColumns()}>{(col) => {
                    const isPinned = () => pinnedCols().has(col.field);
                    const isDragOver = () => dragOverColField() === col.field && dragColField() !== col.field;
                    const thStyle = () => isPinned()
                      ? { position: "sticky" as const, left: `${pinnedOffsets()[col.field] ?? 0}px`, "z-index": "10", background: "rgb(15 15 25 / 0.9)" }
                      : col.width ? { width: `${col.width * 60}px` } : {};
                    const sortIdx = () => sortKeys().findIndex((k) => k.field === col.field);
                    const sortKey = () => sortKeys()[sortIdx()];
                    const hasColRules = () => cellRules().some((r) => r.field === col.field);
                    const isStatsActive = () => statsBarCol() === col.field;
                    return (
                      <th
                        class={`relative px-3 py-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-outline whitespace-nowrap select-none ${isPinned() ? "backdrop-blur-sm" : ""} ${isDragOver() ? "border-l-2 border-l-sky-400" : ""}`}
                        style={thStyle()}
                        draggable={renamingCol() !== col.field}
                        onDragStart={(e) => handleColDragStart(col.field, e)}
                        onDragOver={(e) => handleColDragOver(col.field, e)}
                        onDrop={(e) => void handleColDrop(col.field, e)}
                        onDragEnd={handleColDragEnd}>
                        <div class="flex items-center gap-1 group/th">
                          <Show when={col.kind === "formula"}><span class="text-amber-400/80">ƒ</span></Show>
                          <Show when={col.kind === "checkbox"}><span class="text-emerald-400/80">✓</span></Show>
                          <Show when={renamingCol() === col.field}
                            fallback={
                              <span class="cursor-pointer hover:text-on-surface-variant transition"
                                onClick={(e) => { if (col.kind === "formula") setFormulaModal(col); else toggleSort(col.field, e.shiftKey); }}
                                onDblClick={(e) => { e.stopPropagation(); setRenamingCol(col.field); setRenameValue(effectiveLabel(col)); }}>
                                {effectiveLabel(col)}
                              </span>
                            }>
                            <input type="text" class="w-full min-w-[60px] max-w-[140px] rounded border border-sky-400/50 bg-black/30 text-[0.6rem] text-on-surface px-1 py-0.5 outline-none font-mono uppercase tracking-[0.18em]"
                              value={renameValue()} onInput={(e) => setRenameValue(e.currentTarget.value)}
                              onBlur={() => void commitRename(col.field)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  recordShortcutUse("form_submit");
                                  void commitRename(col.field);
                                }
                                if (e.key === "Escape") {
                                  recordShortcutUse("form_cancel");
                                  setRenamingCol(null);
                                }
                              }}
                              ref={(el) => setTimeout(() => el?.focus(), 0)} onClick={(e) => e.stopPropagation()} />
                          </Show>
                          <Show when={sortIdx() >= 0}>
                            <span class="text-[0.6rem] text-sky-400 font-mono">{sortKey()?.asc ? "↑" : "↓"}{sortKeys().length > 1 ? sortIdx() + 1 : ""}</span>
                          </Show>
                          <button type="button" class={`transition text-[0.6rem] leading-none ml-0.5 ${isPinned() ? "text-sky-400" : "opacity-0 group-hover/th:opacity-100 text-on-surface-variant/60 hover:text-sky-400"}`}
                            onClick={(e) => { e.stopPropagation(); togglePin(col.field); }}>
                            {isPinned() ? "📌" : "⋯"}
                          </button>
                          <button type="button" class={`transition text-[0.6rem] leading-none ${activeSearchCol() === col.field || colSearchValues()[col.field] ? "text-sky-400" : "opacity-0 group-hover/th:opacity-100 text-on-surface-variant/60 hover:text-sky-400"}`}
                            onClick={(e) => { e.stopPropagation(); setActiveSearchCol((v) => v === col.field ? null : col.field); }}>🔍</button>
                          <Show when={col.kind === "number" || col.kind === "formula"}>
                            <button type="button" class={`transition text-[0.6rem] leading-none font-bold ${isStatsActive() ? "text-indigo-400" : "opacity-0 group-hover/th:opacity-100 text-on-surface-variant/60 hover:text-indigo-400"}`}
                              onClick={(e) => { e.stopPropagation(); setStatsBarCol((v) => v === col.field ? null : col.field); }} title="Column statistics (Σ)">Σ</button>
                          </Show>
                          <button type="button" class={`transition text-[0.6rem] leading-none ${hasColRules() ? "text-amber-400" : "opacity-0 group-hover/th:opacity-100 text-on-surface-variant/60 hover:text-amber-400"}`}
                            onClick={(e) => { e.stopPropagation(); setShowCellRulePopover((v) => v === col.field ? null : col.field); }}>◈</button>
                          {/* UX #36: data bar toggle */}
                          <Show when={col.kind === "number" || col.kind === "formula"}>
                            <button type="button" class={`transition text-[0.6rem] leading-none ${dataBars().has(col.field) ? "text-indigo-400" : "opacity-0 group-hover/th:opacity-100 text-on-surface-variant/60 hover:text-indigo-400"}`}
                              title="Toggle data bars" onClick={(e) => { e.stopPropagation(); toggleDataBar(col.field); }}>▦</button>
                          </Show>
                          {/* UX #41: heatmap toggle */}
                          <Show when={col.kind === "number" || col.kind === "formula"}>
                            <button type="button" class={`transition text-[0.6rem] leading-none ${heatmapCol() === col.field ? "text-amber-400" : "opacity-0 group-hover/th:opacity-100 text-on-surface-variant/60 hover:text-amber-400"}`}
                              title="Row heat-map by this column" onClick={(e) => { e.stopPropagation(); setHeatmapCol((v) => v === col.field ? null : col.field); }}>◉</button>
                          </Show>
                          {/* Currency converter */}
                          <Show when={col.kind === "number" || col.kind === "formula"}>
                            <button type="button" class={`transition text-[0.6rem] leading-none ${currencyConversions()[col.field] ? "text-emerald-400" : "opacity-0 group-hover/th:opacity-100 text-on-surface-variant/60 hover:text-emerald-400"}`}
                              title={currencyConversions()[col.field] ? `Converting to ${currencyConversions()[col.field]!.targetCurrency}` : "Live currency converter"}
                              onClick={(e) => { e.stopPropagation(); setShowCurrencyPanel((v) => v === col.field ? null : col.field); }}>⇌</button>
                          </Show>
                          {/* UX #42: freeze pane */}
                          <button type="button" class={`transition text-[0.6rem] leading-none opacity-0 group-hover/th:opacity-100 text-on-surface-variant/60 hover:text-sky-300`}
                            title="Freeze all columns up to here" onClick={(e) => { e.stopPropagation(); if (pinnedCols().has(col.field) && [...pinnedCols()].pop() === col.field) setPinnedCols(new Set<string>()); else freezeTo(col.field); }}>❄</button>
                          {/* UX #39: column note button */}
                          <button type="button" class={`transition text-[0.6rem] leading-none ${colNotes()[col.field] ? "text-yellow-400" : "opacity-0 group-hover/th:opacity-100 text-on-surface-variant/60 hover:text-yellow-400"}`}
                            title={colNotes()[col.field] ?? "Add column note"}
                            onClick={(e) => { e.stopPropagation(); setEditingColNote(editingColNote() === col.field ? null : col.field); }}>✎</button>
                        </div>
                        {/* UX #39: column note inline editor */}
                        <Show when={editingColNote() === col.field}>
                          <div class="mt-1 normal-case tracking-normal font-sans" onClick={(e) => e.stopPropagation()}>
                            <input type="text" placeholder="Column note…"
                              class="w-full rounded border border-yellow-400/30 bg-black/30 text-[0.65rem] text-on-surface px-1.5 py-0.5 outline-none focus:border-yellow-400/60 font-sans tracking-normal normal-case"
                              value={colNotes()[col.field] ?? ""}
                              onInput={(e) => saveColNote(col.field, e.currentTarget.value)}
                              onBlur={() => setEditingColNote(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  recordShortcutUse("form_submit");
                                  setEditingColNote(null);
                                }
                                if (e.key === "Escape") {
                                  recordShortcutUse("form_cancel");
                                  setEditingColNote(null);
                                }
                              }}
                              ref={(el) => setTimeout(() => el?.focus(), 0)} />
                          </div>
                        </Show>
                        <Show when={(col.kind === "number" || col.kind === "formula") && (sparklineValues()[col.field]?.length ?? 0) >= 2}>
                          <div class="flex items-center gap-1">
                            <ColumnSparkline values={sparklineValues()[col.field] ?? []} />
                            {/* UX #49: trend arrow */}
                            <Show when={(sparklineValues()[col.field]?.length ?? 0) >= 3}>
                              {(() => { const t = computeTrend(sparklineValues()[col.field] ?? []); return (
                                <span class={`text-[0.7rem] leading-none font-bold ${t.cls}`} title={`Trend: ${t.label}`}>{t.arrow}</span>
                              ); })()}
                            </Show>
                          </div>
                        </Show>
                        <Show when={activeSearchCol() === col.field}>
                          <div class="mt-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <input type="text" placeholder="search…" class="w-full min-w-[72px] rounded border border-white/20 bg-black/30 text-[0.65rem] text-on-surface px-1.5 py-0.5 outline-none focus:border-sky-400/60 normal-case tracking-normal font-sans"
                              value={colSearchValues()[col.field] ?? ""} onInput={(e) => setColSearch(col.field, e.currentTarget.value)} />
                            <Show when={colSearchValues()[col.field]}>
                              <button type="button" class="text-[0.6rem] text-on-surface-variant/50 hover:text-red-400 shrink-0" onClick={() => clearColSearch(col.field)}>✕</button>
                            </Show>
                          </div>
                        </Show>
                        <Show when={showCellRulePopover() === col.field}>
                          <CellRulePopover field={col.field} label={effectiveLabel(col)} rules={cellRules()} onAdd={addCellRule} onDelete={deleteCellRule} onClose={() => setShowCellRulePopover(null)} />
                        </Show>
                        <Show when={showCurrencyPanel() === col.field}>
                          <CurrencyConverterPanel
                            field={col.field} label={effectiveLabel(col)}
                            conversion={currencyConversions()[col.field]}
                            loading={currencyLoading()[col.field] ?? false}
                            error={currencyErrors()[col.field] ?? ""}
                            onFetch={(s, t) => void fetchExchangeRate(col.field, s, t, "static")}
                            onRemove={() => { removeCurrencyConversion(col.field); setShowCurrencyPanel(null); }}
                            onModeChange={(m) => updateCurrencyMode(col.field, m)}
                            onClose={() => setShowCurrencyPanel(null)}
                          />
                        </Show>
                      </th>
                    );
                  }}</For>
                </tr>
                {/* UX #32: column stats row */}
                <Show when={statsBarCol() !== null && statBarStats() !== null}>
                  <tr class="border-b border-indigo-400/20 bg-indigo-500/[0.04]">
                    <Show when={!groupBy()}><td colspan="2" /><td class="px-3 py-1 font-mono text-[0.55rem] text-indigo-400/60 whitespace-nowrap">Σ stats</td></Show>
                    <Show when={groupBy()}><td class="px-3 py-1 font-mono text-[0.55rem] text-indigo-400/60">Σ stats</td></Show>
                    <For each={visibleColumns()}>{(col) => {
                      if (col.field !== statsBarCol()) return <td class="px-2 py-1" />;
                      const s = statBarStats()!;
                      return (
                        <td class="px-3 py-1">
                          <div class="flex gap-3 flex-wrap text-[0.65rem] tabular-nums">
                            <span><span class="text-outline text-[0.55rem]">Σ </span><span class="text-indigo-200 font-semibold">{fmtNum(s.sum)}</span></span>
                            <span><span class="text-outline text-[0.55rem]">μ </span><span class="text-on-surface-variant">{fmtNum(s.mean)}</span></span>
                            <span><span class="text-outline text-[0.55rem]">↓ </span><span class="text-on-surface-variant">{fmtNum(s.min)}</span></span>
                            <span><span class="text-outline text-[0.55rem]">↑ </span><span class="text-on-surface-variant">{fmtNum(s.max)}</span></span>
                            <span><span class="text-outline text-[0.55rem]"># </span><span class="text-on-surface-variant">{s.count}</span></span>
                          </div>
                        </td>
                      );
                    }}</For>
                  </tr>
                </Show>
              </thead>
              <tbody>
                <Show when={showSkeleton()}><SkeletonRows colCount={visibleColumns().length} count={4} /></Show>
                <Show when={!showSkeleton() && displayRows().length === 0}>
                  <tr><td colSpan={totalColCount()} class="px-4 py-8 text-center text-sm text-on-surface-variant">No matching entries</td></tr>
                </Show>
                <Show when={!showSkeleton() && !groupBy()}>
                  <For each={pageRows()}>{(row, idx) => {
                    const absIdx = () => currentPage() * pageSize() + idx();
                    const rKey = () => rowKey(row, absIdx());
                    const highlight = () => rowUserHighlight(row) || rowHighlightClass(row, highlightRules());
                    const isExpanded = () => expandedIdx() === absIdx();
                    const isDragTarget = () => dragOverIdx() === absIdx();
                    const isSelected = () => selectedRows().has(rKey());
                    const hasNote = () => Boolean(rowNotes()[rKey()]);
                    const hasHistory = () => (editHistory()[rKey()] ?? []).length > 0;
                    const isGlobalMatch = () => globalMatchRows().includes(absIdx());
                    const stale = () => isStaleRow(row);
                    const isFocused = () => focusedRowIdx() === idx();
                    return (
                      <>
                        <tr data-row-idx={absIdx()}
                          class={`${rowClass(absIdx(), isExpanded(), highlight(), isSelected(), isGlobalMatch(), hasNote(), stale())} ${isDragTarget() ? "outline outline-2 outline-sky-400/60" : ""} ${isFocused() ? "ring-2 ring-inset ring-sky-400/50" : ""}`}
                          style={heatRowStyle(row)}
                          onMouseEnter={() => { setHoveredRowIdx(absIdx()); setFocusedRowIdx(idx()); }} onMouseLeave={() => setHoveredRowIdx(null)}
                          onDragOver={handleDragOver(absIdx())} onDrop={(e) => void handleDrop(absIdx(), e)} onDragEnd={handleDragEnd}
                          onClick={() => { expandedIdx() === absIdx() ? setExpandedIdx(null) : setExpandedIdx(absIdx()); }}>
                          <td class="w-8 px-2 align-middle" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" class="w-3.5 h-3.5 rounded accent-primary cursor-pointer" checked={isSelected()} onChange={() => toggleSelectRow(rKey())} />
                          </td>
                          <td class="w-6 px-1 align-middle">
                            <span class={`flex cursor-grab items-center justify-center text-[0.65rem] text-on-surface-variant/40 hover:text-on-surface-variant transition select-none ${hoveredRowIdx() === absIdx() ? "opacity-100" : "opacity-0"}`}
                              draggable="true" onDragStart={handleDragStart(absIdx())} onClick={(e) => e.stopPropagation()}>⠿</span>
                          </td>
                          <td class="px-3 align-middle" style={{ padding: densityPadding(density()) }}>
                            <div class="flex flex-wrap gap-1 min-w-[80px]">
                              <Show when={stale()}><span class="text-[0.6rem] text-orange-400/80 leading-none self-center" title="Past expiry date">⏰</span></Show>
                              <For each={row.supertags}>{(t) => <TagPill label={t} small />}</For>
                              <Show when={hasNote() && editingNote() !== rKey()}>
                                <span class="text-[0.55rem] text-amber-400/70 leading-none self-center" title={rowNotes()[rKey()]}>💬</span>
                              </Show>
                            </div>
                          </td>
                          <For each={visibleColumns()}>{(col) => {
                            const isPinned = () => pinnedCols().has(col.field);
                            const tdStyle = () => ({
                              ...(isPinned() ? { position: "sticky" as const, left: `${pinnedOffsets()[col.field] ?? 0}px`, "z-index": "5", background: "rgb(15 15 25 / 0.85)" } : {}),
                              padding: densityPadding(density()),
                            });
                            const isEditing = () => { const ec = editingCell(); return ec?.rowKey === rKey() && ec?.field === col.field; };
                            const pendingVal = () => pendingEdits().get(rKey())?.[col.field];
                            const canEdit = () => allowEdit() && col.kind !== "formula" && col.kind !== "checkbox";
                            const crc = () => cellRuleClass(row.cells[col.field], col.field, cellRules());
                            // Currency display override
                            const currencyDisplay = (): string | undefined => {
                              const conv = currencyConversions()[col.field];
                              if (!conv) return undefined;
                              const n = parseFloat(asStr(row.cells[col.field]));
                              if (isNaN(n)) return undefined;
                              const cv = n * conv.rate;
                              return `${conv.targetCurrency} ${cv % 1 === 0 ? cv.toLocaleString() : cv.toFixed(2)}`;
                            };
                            // UX #36: data bar background
                            const dataBarStyle = () => {
                              if (!dataBars().has(col.field)) return {};
                              const mm = colMinMax()[col.field];
                              if (!mm || mm.min === mm.max) return {};
                              const n = parseFloat(asStr(row.cells[col.field]));
                              if (isNaN(n)) return {};
                              const pct = Math.round(((n - mm.min) / (mm.max - mm.min)) * 100);
                              return { background: `linear-gradient(to right, rgba(99,102,241,0.18) ${pct}%, transparent ${pct}%)` };
                            };
                            // UX #37: diff highlight — orange tint if value differs from last history entry
                            const diffHighlight = () => {
                              if (!diffMode()) return "";
                              const hist = editHistory()[rKey()];
                              if (!hist?.length) return "";
                              const last = [...hist].reverse().find((e) => e.field === col.field);
                              if (!last) return "";
                              const current = asStr(row.cells[col.field]);
                              return last.newVal !== current ? "ring-1 ring-inset ring-orange-400/50 bg-orange-500/10" : "ring-1 ring-inset ring-emerald-400/30";
                            };
                            return (
                              <td class={`align-middle text-on-surface max-w-[200px] ${isPinned() ? "backdrop-blur-sm" : ""} ${crc()} ${diffHighlight()}`} style={{ ...tdStyle(), ...dataBarStyle() }}
                                onClick={(e) => { if (canEdit()) { e.stopPropagation(); setEditingCell(isEditing() ? null : { rowKey: rKey(), field: col.field }); } }}>
                                <Show when={isEditing()}
                                  fallback={
                                    <span class={pendingVal() !== undefined ? "text-amber-300 underline decoration-dotted cursor-pointer" : currencyDisplay() !== undefined ? "text-emerald-300/90 tabular-nums" : ""}>
                                      {pendingVal() !== undefined
                                        ? (pendingVal() as string)
                                        : currencyDisplay() !== undefined
                                          ? (currencyDisplay() as string)
                                          : <CellContent col={col} value={row.cells[col.field]} cells={row.cells} />}
                                    </span>
                                  }>
                                  <input type={col.kind === "number" ? "number" : col.kind === "date" ? "date" : "text"}
                                    class="w-full rounded border border-amber-400/40 bg-black/30 text-xs text-on-surface px-1.5 py-0.5 outline-none focus:border-amber-400/80"
                                    value={pendingVal() ?? asStr(row.cells[col.field])}
                                    onInput={(e) => setPendingEdit(rKey(), col.field, e.currentTarget.value)}
                                    onBlur={() => setEditingCell(null)} onKeyDown={(e) => {
                                      if (e.key === "Escape") {
                                        recordShortcutUse("form_cancel");
                                        setEditingCell(null);
                                      }
                                    }}
                                    ref={(el) => setTimeout(() => el?.focus(), 0)} onClick={(e) => e.stopPropagation()} />
                                </Show>
                              </td>
                            );
                          }}</For>
                          {(() => {
                            const hasAnnotations = () => (rowAnnotations()[rKey()] ?? []).length > 0;
                            return (
                              <Show when={hoveredRowIdx() === absIdx() || hasNote() || hasHistory() || hasAnnotations() || whatIfRowKey() === rKey()}>
                                <td class="w-20 px-1 align-middle" onClick={(e) => e.stopPropagation()}>
                                  <div class="flex items-center gap-0.5">
                                    <button type="button" class={`text-[0.7rem] transition ${hasNote() ? "text-amber-400" : "text-on-surface-variant/40 hover:text-amber-400"}`}
                                      title={hasNote() ? "Edit note" : "Add note"} onClick={() => setEditingNote(editingNote() === rKey() ? null : rKey())}>💬</button>
                                    <Show when={hasHistory()}>
                                      <button type="button" class={`text-[0.7rem] transition ${viewingHistoryRow() === rKey() ? "text-sky-400" : "text-sky-400/50 hover:text-sky-400"}`}
                                        title="Edit history" onClick={() => setViewingHistoryRow(viewingHistoryRow() === rKey() ? null : rKey())}>⏱</button>
                                    </Show>
                                    {/* UX #46: annotation timeline */}
                                    <button type="button" class={`text-[0.7rem] transition ${hasAnnotations() ? "text-violet-400" : "text-on-surface-variant/40 hover:text-violet-400"}`}
                                      title={hasAnnotations() ? `${(rowAnnotations()[rKey()] ?? []).length} annotation(s)` : "Pin annotation"}
                                      onClick={() => { setShowAnnotationsPanel((v) => v === rKey() ? null : rKey()); setAnnotationInput(""); }}>📍</button>
                                    {/* UX #50: what-if simulator */}
                                    <button type="button" class={`text-[0.7rem] transition ${whatIfRowKey() === rKey() ? "text-sky-400" : "text-on-surface-variant/40 hover:text-sky-400"}`}
                                      title="What-If Simulator"
                                      onClick={() => { setWhatIfRowKey((v) => v === rKey() ? null : rKey()); setWhatIfValues({}); }}>▷</button>
                                    <Show when={allowEdit()}>
                                      <button type="button" class="text-[0.7rem] text-on-surface-variant/40 hover:text-emerald-400 transition" title="Duplicate"
                                        onClick={() => { const vals: Record<string, string> = {}; for (const col of columns()) { if (col.kind !== "formula") vals[col.field] = asStr(row.cells[col.field]); } openWithValues(vals); }}>⊕</button>
                                    </Show>
                                  </div>
                                </td>
                              </Show>
                            );
                          })()}
                        </tr>
                        <Show when={editingNote() === rKey()}>
                          <tr><td colSpan={totalColCount()} class="px-3 pb-2 pt-0" onClick={(e) => e.stopPropagation()}>
                            <TiptapEditor
                              mode="compact"
                              appearance="minimal"
                              class="w-full"
                              contentClass="min-h-[3.5rem] rounded-lg border border-amber-400/30 bg-black/30 px-2 py-1.5 text-xs text-on-surface"
                              showToolbar={false}
                              showFooter={false}
                              enableSlashCommands={false}
                              submitShortcut="none"
                              placeholder="Private note (stored locally)…"
                              initialContent={rowNotes()[rKey()] ?? ""}
                              clearOnSend={false}
                              onSend={async () => {}}
                              onChange={(text) => setNote(rKey(), text)}
                              onReady={(handle) => queueMicrotask(() => handle.focus())}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  setEditingNote(null);
                                  return true;
                                }
                                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                                  event.preventDefault();
                                  setEditingNote(null);
                                  return true;
                                }
                                return undefined;
                              }}
                            />
                          </td></tr>
                        </Show>
                        {/* UX #46: annotations timeline panel */}
                        <Show when={showAnnotationsPanel() === rKey()}>
                          <RowAnnotationsPanel
                            annotations={rowAnnotations()[rKey()] ?? []}
                            input={annotationInput()}
                            onInput={setAnnotationInput}
                            onAdd={() => addAnnotation(rKey(), annotationInput())}
                            onDelete={(i) => deleteAnnotation(rKey(), i)}
                            colSpan={totalColCount()}
                            onClose={() => setShowAnnotationsPanel(null)}
                          />
                        </Show>
                        {/* UX #50: what-if simulator panel */}
                        <Show when={whatIfRowKey() === rKey()}>
                          <WhatIfPanel
                            columns={effectiveColumns()}
                            row={row}
                            values={whatIfValues()}
                            onInput={(field, val) => setWhatIfValues((p) => ({ ...p, [field]: val }))}
                            colSpan={totalColCount()}
                            onClose={() => setWhatIfRowKey(null)}
                          />
                        </Show>
                        <Show when={viewingHistoryRow() === rKey()}>
                          <EditHistoryPanel entries={editHistory()[rKey()] ?? []} colSpan={totalColCount()} onClose={() => setViewingHistoryRow(null)} />
                        </Show>
                        <Show when={isExpanded()}>
                          <RowDetailPanel row={row} columns={effectiveColumns()} colSpan={totalColCount()} onClose={() => setExpandedIdx(null)} />
                        </Show>

                      </>
                    );
                  }}</For>
                </Show>
                <Show when={!showSkeleton() && (groupBy() || !!numGroupBy())}>
                  <For each={[...(groupedRows() ?? new Map<string, GridRow[]>()).entries()]}>{([tag, rows]) => (
                    <>
                      <GroupHeader tag={tag} count={rows.length} colSpan={totalColCount()} collapsed={collapsedGroups().has(tag)} onToggle={() => toggleGroupCollapse(tag)} />
                      <Show when={!collapsedGroups().has(tag)}>
                        <For each={rows}>{(row, idx) => (
                          <tr class={`border-t border-white/8 cursor-default ${zebraStripe() && idx() % 2 === 1 ? "bg-white/[0.02]" : ""} hover:bg-white/5 transition ${rowHighlightClass(row, highlightRules())} ${isStaleRow(row) ? "border-l-2 border-l-orange-400/50 !bg-amber-500/[0.03]" : ""}`}>
                            <td class="px-3 align-middle" style={{ padding: densityPadding(density()) }}>
                              <div class="flex flex-wrap gap-1 min-w-[80px]">
                                <Show when={isStaleRow(row)}><span class="text-[0.6rem] text-orange-400/80 self-center">⏰</span></Show>
                                <For each={row.supertags}>{(t) => <TagPill label={t} small />}</For>
                              </div>
                            </td>
                            <For each={visibleColumns()}>{(col) => (
                              <td class={`px-3 align-middle text-on-surface max-w-[200px] ${cellRuleClass(row.cells[col.field], col.field, cellRules())}`} style={{ padding: densityPadding(density()) }}>
                                <CellContent col={col} value={row.cells[col.field]} cells={row.cells} />
                              </td>
                            )}</For>
                          </tr>
                        )}</For>
                      </Show>
                    </>
                  )}</For>
                </Show>
              </tbody>
              <Show when={footerStats() !== null && !groupBy()}>
                <tfoot>
                  <tr class="border-t-2 border-white/20 bg-white/[0.03]">
                    <td class="w-8 px-2" /><td class="w-6 px-1" />
                    <td class="px-3 py-1.5"><span class="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-outline">Total</span></td>
                    <For each={visibleColumns()}>{(col, i) => {
                      const stat = () => footerStats()?.[i()];
                      return (
                        <td class="px-3 py-1.5 tabular-nums text-[0.7rem] text-on-surface-variant">
                          <Show when={stat()?.kind === "number"}>
                            <span title={`Avg: ${(stat() as { avg: string }).avg}`}>{(stat() as { sum: string }).sum}</span>
                            <span class="ml-1 text-[0.6rem] text-outline">avg {(stat() as { avg: string }).avg}</span>
                          </Show>
                          <Show when={stat()?.kind === "checkbox" || stat()?.kind === "text"}>
                            <span class="text-outline">{(stat() as { text: string }).text}</span>
                          </Show>
                        </td>
                      );
                    }}</For>
                  </tr>
                </tfoot>
              </Show>
            </table>
          </Show>
        </div>
        <Show when={displayRows().length > 15 && displayRows().length <= 600}>
          <MinimapStrip
            rows={displayRows()} highlightRules={highlightRules()} selected={selectedRows()}
            editHistory={editHistory()} rowKeys={displayRows().map((r, i) => r.ledger_id ?? String(i))}
            scrollRatio={scrollRatio()} viewportRatio={viewportRatio()} onSeek={seekMinimap}
          />
        </Show>
      </div>

      {/* Pagination controls */}
      <Show when={isPaginated()}>
        <div class="flex items-center gap-2 flex-wrap justify-between text-xs" onClick={(e) => e.stopPropagation()}>
          <div class="flex items-center gap-1">
            <button type="button" disabled={currentPage() === 0} class="rounded border border-white/20 px-2 py-0.5 text-on-surface-variant hover:bg-white/10 disabled:opacity-30 transition"
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}>← Prev</button>
            <span class="text-on-surface-variant/60 font-mono text-[0.65rem] px-1">
              Page {currentPage() + 1} / {totalPages()} · {displayRows().length} rows
            </span>
            <button type="button" disabled={currentPage() >= totalPages() - 1} class="rounded border border-white/20 px-2 py-0.5 text-on-surface-variant hover:bg-white/10 disabled:opacity-30 transition"
              onClick={() => setCurrentPage((p) => Math.min(totalPages() - 1, p + 1))}>Next →</button>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-[0.6rem] text-outline">Rows/page</span>
            {([50, 100, 150, 300] as const).map((n) => (
              <button type="button" class={`text-[0.6rem] border rounded-full px-1.5 py-0.5 transition ${pageSize() === n ? "border-sky-400/50 bg-sky-500/10 text-sky-300" : "border-white/20 text-on-surface-variant hover:bg-white/10"}`}
                onClick={() => { setPageSize(n); setCurrentPage(0); }}>{n}</button>
            ))}
          </div>
        </div>
      </Show>

      <Show when={selectedRows().size > 0}>
        <div class="rounded-xl border border-white/20 bg-white/[0.07] backdrop-blur-md px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <span class="text-[0.7rem] font-semibold text-on-surface">{selectedRows().size} selected</span>
          <div class="flex-1 min-w-0" />
          <div class="flex items-center gap-1.5">
            <input type="text" placeholder="Tag name…" class="rounded-md border border-white/20 bg-black/30 text-xs text-on-surface px-2 py-0.5 outline-none focus:border-violet-400/60 w-28"
              value={batchTag()} onInput={(e) => setBatchTag(e.currentTarget.value)} onKeyDown={(e) => {
                if (e.key === "Enter") {
                  recordShortcutUse("form_submit");
                  void handleBatchTag();
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  recordShortcutUse("form_cancel");
                  setBatchTag("");
                }
              }} />
            <button type="button" disabled={!batchTag().trim() || batchPending()} onClick={() => void handleBatchTag()}
              class="text-[0.65rem] border border-violet-400/40 bg-violet-500/10 text-violet-300 rounded-full px-2 py-0.5 hover:bg-violet-500/20 disabled:opacity-40 transition">{batchPending() ? "…" : "Tag"}</button>
          </div>
          <button type="button" class="text-[0.65rem] border border-sky-400/40 bg-sky-500/10 text-sky-300 rounded-full px-2 py-0.5 hover:bg-sky-500/20 transition"
            onClick={() => { const sel = selectedRows(); exportCsv(`${title()}_selection`, effectiveColumns(), displayRows().filter((r, i) => sel.has(rowKey(r, i)))); }}>↓ Export</button>
          <button type="button" class="text-[0.65rem] text-on-surface-variant border border-white/20 rounded-full px-2 py-0.5 hover:bg-white/10 transition" onClick={clearSelection}>✕ Clear</button>
        </div>
      </Show>

      <Show when={allowEdit()}>
        <Show when={addRowOpen()}
          fallback={<button type="button" class="text-[0.65rem] text-on-surface-variant border border-white/20 rounded-lg px-[0.6em] py-[0.3em] hover:bg-white/10 transition" onClick={() => openWithValues({})}>+ Add row</button>}>
          <div class="rounded-xl border border-white/15 bg-white/5 px-4 py-3 space-y-2">
            <p class="text-xs font-semibold text-on-surface">New row (proposed change)</p>
            <For each={columns().filter((c) => c.kind !== "formula")}>{(col) => (
              <div class="flex items-center gap-3">
                <label class="font-mono text-[0.6rem] uppercase tracking-widest text-outline w-24 shrink-0">{effectiveLabel(col)}</label>
                <input type={col.kind === "number" ? "number" : col.kind === "date" ? "date" : "text"} placeholder={col.kind}
                  class="flex-1 rounded-md border border-white/20 bg-surface text-xs text-on-surface px-2 py-1 outline-none focus:border-sky-400/60"
                  value={fieldValues()[col.field] ?? ""} onInput={(e) => setFieldValues((p) => ({ ...p, [col.field]: e.currentTarget.value }))} />
              </div>
            )}</For>
            <Show when={Object.values(fieldValues()).some(Boolean)}>
              <div class="flex items-center gap-2 pt-1 border-t border-white/10">
                <input type="text" placeholder="Template name…"
                  class="flex-1 rounded-md border border-white/20 bg-black/20 text-xs text-on-surface px-2 py-0.5 outline-none focus:border-violet-400/60"
                  value={saveTemplateName()} onInput={(e) => setSaveTemplateName(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && saveTemplateName().trim()) {
                      recordShortcutUse("form_submit");
                      saveAsTemplate(saveTemplateName(), fieldValues());
                      setSaveTemplateName("");
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      recordShortcutUse("form_cancel");
                      setSaveTemplateName("");
                    }
                  }} />
                <button type="button" disabled={!saveTemplateName().trim()} class="text-[0.65rem] border border-violet-400/30 text-violet-300/70 rounded-full px-2 py-0.5 hover:bg-violet-500/10 disabled:opacity-40 transition"
                  onClick={() => { saveAsTemplate(saveTemplateName(), fieldValues()); setSaveTemplateName(""); }}>💾 Save template</button>
              </div>
            </Show>
            <Show when={proposeError()}>
              <div class="space-y-1">
                <p class="text-[0.65rem] font-medium text-red-400">{proposeError()?.title}</p>
                <p class="text-[0.65rem] text-on-surface-variant">{proposeError()?.summary}</p>
                <p class="text-[0.6rem] text-on-surface-variant/80">{proposeError()?.nextStep}</p>
              </div>
            </Show>
            <div class="flex gap-2 pt-1">
              <button type="button" disabled={proposing()} onClick={() => void submitPropose()}
                class="rounded-lg border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-on-surface hover:bg-white/20 disabled:opacity-40 transition">
                {proposing() ? "Sending…" : "Propose"}
              </button>
              <button type="button" class="rounded-lg border border-white/15 px-3 py-1 text-xs text-on-surface-variant hover:bg-white/10 transition"
                onClick={() => { setAddRowOpen(false); setProposeError(null); }}>Cancel</button>
            </div>
          </div>
        </Show>
      </Show>

      <Show when={formulaModal()}>{(col) => <FormulaColumnModal col={col()} onClose={() => setFormulaModal(null)} />}</Show>

      <Show when={pasteVisible() && pasteData().length > 0}>
        <PasteImportModal
          columns={columns().filter((c) => c.kind !== "formula")}
          rows={pasteData()}
          colMap={pasteColMap()}
          onMapChange={(idx, field) => setPasteColMap((p) => ({ ...p, [idx]: field }))}
          onConfirm={() => void submitPaste()}
          onCancel={() => { setPasteVisible(false); setPasteData([]); setPasteColMap({}); }}
          pending={pastePending()}
        />
      </Show>
    </div>
  );
}
