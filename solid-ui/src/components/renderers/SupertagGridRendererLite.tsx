// @locs-version: 1.0
import { createMemo, For, Show } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";

type GridColumn = { field: string; label: string };
type GridRow = {
  cells: Record<string, unknown>;
  supertags: string[];
  ledgerId?: string;
  threadId?: string;
};

type GridColumnView = {
  field: string;
  label: string;
};

type GridCellView = {
  valueText: string;
};

type GridRowView = {
  supertags: string[];
  cells: GridCellView[];
};

type GridRendererState = {
  title: string;
  columns: GridColumnView[];
  rows: GridRowView[];
  rowCountText: string;
  columnCountText: string;
  summaryText: string;
  showRows: boolean;
};

const EMPTY_CELL_TEXT = "-";
const EMPTY_STATE_TEXT = "No grid rows available.";
const DEFAULT_TITLE = "Supertag grid";
const SUPERTAGS_HEADER = "Supertags";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function resolveGridContent(message: AfpMessage): Record<string, unknown> {
  const view = message.views?.find((entry) => entry.format === "supertag_grid") as AfpView | undefined;
  const safeMessageContent = decryptedDisplayContent(message);
  const candidate = message.encryption ? safeMessageContent : view?.content ?? safeMessageContent;
  return isRecord(candidate) ? candidate : {};
}

function parseRows(raw: unknown): GridRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((entry) => ({
      cells: isRecord(entry.cells) ? entry.cells : {},
      supertags: Array.isArray(entry.supertags)
        ? entry.supertags.map((tag) => String(tag ?? "")).filter(Boolean)
        : [],
      ledgerId: asString(entry.ledger_id) || undefined,
      threadId: asString(entry.thread_id) || undefined,
    }));
}

function parseColumns(raw: unknown, rows: GridRow[]): GridColumn[] {
  if (Array.isArray(raw)) {
    const parsedColumns = raw
      .filter(isRecord)
      .map((entry) => ({
        field: asString(entry.field),
        label: asString(entry.label, asString(entry.field)),
      }))
      .filter((entry) => entry.field);
    if (parsedColumns.length > 0) return parsedColumns;
  }

  const firstCells = rows[0]?.cells ?? {};
  return Object.keys(firstCells).map((field) => ({ field, label: field }));
}

function pluralizedCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildRendererState(message: AfpMessage): GridRendererState {
  const content = resolveGridContent(message);
  const parsedRows = parseRows(content.rows);
  const parsedColumns = parseColumns(content.columns, parsedRows);
  const rowCountText = pluralizedCount(parsedRows.length, "row", "rows");
  const columnCountText = pluralizedCount(parsedColumns.length, "col", "cols");

  return {
    title: asString(content.title, DEFAULT_TITLE),
    columns: parsedColumns.map((column) => ({
      field: column.field,
      label: column.label,
    })),
    rows: parsedRows.map((row) => ({
      supertags: row.supertags,
      cells: parsedColumns.map((column) => ({
        valueText: String(row.cells[column.field] ?? "") || EMPTY_CELL_TEXT,
      })),
    })),
    rowCountText,
    columnCountText,
    summaryText: `${rowCountText} | ${columnCountText}`,
    showRows: parsedRows.length > 0,
  };
}

export function SupertagGridRenderer(props: { message: AfpMessage }) {
  const rendererState = createMemo(() => buildRendererState(props.message));

  return (
    <div class="space-y-3">
      <div class="flex flex-wrap items-center gap-3">
        <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-outline">
          {rendererState().title}
        </p>
        <span class="text-[10px] text-on-surface-variant/70">{rendererState().summaryText}</span>
      </div>

      <Show
        when={rendererState().showRows}
        fallback={
          <div class="rounded-xl border border-dashed border-white/12 bg-white/4 px-4 py-6 text-sm text-on-surface-variant">
            {EMPTY_STATE_TEXT}
          </div>
        }
      >
        <div class="overflow-x-auto rounded-xl border border-white/12 bg-white/6">
          <table class="min-w-full text-left text-xs">
            <thead class="border-b border-white/10 bg-white/8">
              <tr>
                <th class="px-3 py-2 font-medium text-on-surface-variant">{SUPERTAGS_HEADER}</th>
                <For each={rendererState().columns}>
                  {(column) => (
                    <th class="px-3 py-2 font-medium text-on-surface-variant">{column.label}</th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/8">
              <For each={rendererState().rows}>
                {(row) => (
                  <tr>
                    <td class="px-3 py-2 align-top">
                      <div class="flex flex-wrap gap-1">
                        <For each={row.supertags}>
                          {(tag) => (
                            <span class="rounded-full border border-primary/18 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                              {tag}
                            </span>
                          )}
                        </For>
                      </div>
                    </td>
                    <For each={row.cells}>
                      {(cell) => (
                        <td class="px-3 py-2 align-top text-on-surface-variant">{cell.valueText}</td>
                      )}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
}
