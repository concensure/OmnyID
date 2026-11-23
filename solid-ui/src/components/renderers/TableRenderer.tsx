import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/components/Toast";
import {
  clampTableColumnWidth,
  loadTableColumnDisplayModes,
  loadTableColumnWidths,
  saveTableColumnDisplayModes,
  saveTableColumnWidths,
  tableColumnDisplayStorageKey,
  tableColumnWidthStorageKey,
  type ColumnDisplayMode,
  type ColumnWidthMap,
} from "@/lib/tableRendererLocalState";

type TableRow = Record<string, unknown>;
type ColumnMenuState = { column: string; x: number; y: number } | null;

type TableColumnState = {
  name: string;
  numeric: boolean;
  sticky: boolean;
  displayMode: ColumnDisplayMode;
  widthStyle: Record<string, string> | undefined;
  headerTextClass: string;
  headerCellClass: string;
};

type TableCellState = {
  column: string;
  value: string;
  numeric: boolean;
  sticky: boolean;
  cellClass: string;
  textClass: string;
  widthStyle: Record<string, string> | undefined;
  showCopyButton: boolean;
};

type TableRowState = {
  rowClass: string;
  cells: TableCellState[];
};

const NUMERIC_CELL_PATTERN =
  /^[+-]?(?:[$\u20AC\u00A3\u00A5]\s*)?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?%?$/;

const TABLE_SUMMARY_BADGE_LABEL = "SUM";
const TABLE_WRAP_LABEL = "WRAP";
const TABLE_TRUNCATE_LABEL = "CUT";
const TABLE_SUMMARY_TITLE = "Visible summary";
const TABLE_NO_VALUE_PLACEHOLDER = "-";
const TABLE_COPY_LABEL = "Copy";
const TABLE_MENU_TRUNCATE_LABEL = "Truncate";
const TABLE_MENU_WRAP_LABEL = "Wrap";
const TABLE_EMPTY_ICON = "TB";
const TABLE_EMPTY_TITLE = "No table rows yet";
const TABLE_EMPTY_BODY =
  "This table card does not contain any structured rows or columns to display yet.";

function isNumericCellValue(value: unknown) {
  if (typeof value === "number" || typeof value === "bigint") return true;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return NUMERIC_CELL_PATTERN.test(trimmed);
}

function formatCellValue(value: unknown) {
  if (value == null || value === "") return TABLE_NO_VALUE_PLACEHOLDER;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return TABLE_NO_VALUE_PLACEHOLDER;
    }
  }
  return String(value);
}

function shouldShowCopyButton(value: string) {
  return value !== TABLE_NO_VALUE_PLACEHOLDER && value.trim().length > 0;
}

export function TableRenderer(props: { message: AfpMessage; view?: AfpView }) {
  const storageKey = () =>
    tableColumnDisplayStorageKey(props.message.thread_id ?? props.message.id ?? props.message.type);
  const widthStorageKey = () =>
    tableColumnWidthStorageKey(props.message.thread_id ?? props.message.id ?? props.message.type);
  const tableContent = () => props.message.encryption ? decryptedDisplayContent(props.message) : props.view?.content ?? decryptedDisplayContent(props.message);
  const [columnDisplayModes, setColumnDisplayModes] = createSignal<Record<string, ColumnDisplayMode>>(
    loadTableColumnDisplayModes(storageKey()),
  );
  const [columnWidths, setColumnWidths] = createSignal<ColumnWidthMap>(loadTableColumnWidths(widthStorageKey()));
  const [columnMenu, setColumnMenu] = createSignal<ColumnMenuState>(null);
  const [activeSummaryColumn, setActiveSummaryColumn] = createSignal<string | null>(null);
  const tableRecord = () => afpRecord(tableContent());

  createEffect(() => {
    setColumnDisplayModes(loadTableColumnDisplayModes(storageKey()));
    setColumnWidths(loadTableColumnWidths(widthStorageKey()));
    setColumnMenu(null);
    setActiveSummaryColumn(null);
  });

  const columns = createMemo(() => {
    const raw = tableRecord().columns;
    if (Array.isArray(raw)) {
      return raw.filter((column): column is string => typeof column === "string" && column.trim().length > 0);
    }
    const contentRows = tableRecord().rows;
    if (Array.isArray(contentRows) && contentRows.length > 0) {
      return Object.keys(afpRecord(contentRows[0]));
    }
    return Object.keys(afpRecord(decryptedDisplayContent(props.message))).filter((key) => key !== "views");
  });

  const rows = createMemo(() => {
    const raw = tableRecord().rows;
    if (Array.isArray(raw)) return raw.map(afpRecord).filter((row) => Object.keys(row).length > 0);
    const fallbackRow = afpRecord(decryptedDisplayContent(props.message));
    const fallbackKeys = Object.keys(fallbackRow).filter((key) => key !== "views");
    return fallbackKeys.length > 0 ? [fallbackRow] : [];
  });

  const columnIsNumeric = (column: string) => {
    const presentValues = rows()
      .map((row) => row[column])
      .filter((value) => value != null && value !== "");
    return presentValues.length > 0 && presentValues.every(isNumericCellValue);
  };

  const numericColumnValues = (column: string) =>
    rows()
      .map((row) => row[column])
      .map((value) => {
        if (typeof value === "number") return value;
        if (typeof value === "bigint") return Number(value);
        if (typeof value !== "string") return null;
        const trimmed = value.trim();
        if (!trimmed) return null;
        const normalized = trimmed.replace(/[$\u20AC\u00A3\u00A5,\s%]/g, "");
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
      })
      .filter((value): value is number => value != null && Number.isFinite(value));

  const columnDisplayMode = (column: string) => columnDisplayModes()[column] ?? "wrap";
  const columnWidth = (column: string) => columnWidths()[column];
  const columnWidthStyle = (column: string) => {
    const width = columnWidth(column);
    if (!width) return undefined;
    return {
      width: `${width}px`,
      "min-width": `${width}px`,
    };
  };

  const rendererState = createMemo(() => {
    const columnNames = columns();
    const rowItems = rows();
    const hasStickyFirstColumn = columnNames.length > 1;
    const hasStripedRows = columnNames.length >= 5;
    const table = tableRecord();
    const label: string =
      (typeof table.label === "string" ? table.label : undefined) ??
      (typeof table.title === "string" ? table.title : undefined) ??
      props.message.type;

    const columnStates: TableColumnState[] = columnNames.map((column, index) => {
      const numeric = columnIsNumeric(column);
      const sticky = hasStickyFirstColumn && index === 0;
      const displayMode = columnDisplayMode(column);
      return {
        name: column,
        numeric,
        sticky,
        displayMode,
        widthStyle: columnWidthStyle(column),
        headerTextClass:
          displayMode === "wrap" ? "whitespace-normal break-words" : "truncate",
        headerCellClass: [
          "group relative px-4 py-2 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-outline",
          numeric ? "tabular-nums" : "",
          sticky
            ? "sticky left-0 z-[2] bg-white/20 shadow-[inset_-1px_0_0_rgba(255,255,255,0.16)] backdrop-blur-sm"
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      };
    });

    const activeSummary = activeSummaryColumn();
    const activeSummaryStats = (() => {
      if (!activeSummary || !columnIsNumeric(activeSummary)) return null;
      const values = numericColumnValues(activeSummary);
      if (values.length === 0) return null;
      const sum = values.reduce((accumulator, value) => accumulator + value, 0);
      const average = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      return {
        column: activeSummary,
        count: values.length,
        sum,
        average,
        min,
        max,
      };
    })();

    const rowStates: TableRowState[] = rowItems.map((row, rowIndex) => {
      const rowClass =
        hasStripedRows
          ? rowIndex % 2 === 0
            ? "bg-white/[0.03]"
            : "bg-white/[0.08]"
          : "";

      const cells = columnStates.map((columnState) => {
        const value = formatCellValue(row[columnState.name]);
        const stickyCellClass =
          hasStripedRows
            ? rowIndex % 2 === 0
              ? "bg-[color:rgba(255,255,255,0.03)]"
              : "bg-[color:rgba(255,255,255,0.08)]"
            : "bg-[color:rgba(255,255,255,0.08)]";
        return {
          column: columnState.name,
          value,
          numeric: columnState.numeric,
          sticky: columnState.sticky,
          cellClass: [
            "group relative px-4 py-2.5 pr-12 text-on-surface-variant",
            columnState.numeric ? "font-mono tabular-nums" : "",
            columnState.sticky
              ? `sticky left-0 z-[1] ${stickyCellClass} shadow-[inset_-1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-sm`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
          textClass:
            columnState.displayMode === "wrap"
              ? "block min-w-0 whitespace-pre-wrap break-words"
              : "block min-w-0 truncate",
          widthStyle: columnState.widthStyle,
          showCopyButton: shouldShowCopyButton(value),
        } satisfies TableCellState;
      });

      return {
        rowClass,
        cells,
      };
    });

    return {
      label,
      fromText: props.message.from,
      showTable: columnStates.length > 0 && rowStates.length > 0,
      showEmpty: columnStates.length === 0 || rowStates.length === 0,
      columnStates,
      rowStates,
      stickyFirstColumn: hasStickyFirstColumn,
      activeSummary,
      activeSummaryStats,
    };
  });

  const copyCellValue = async (value: string) => {
    if (!navigator.clipboard?.writeText) {
      toast.error("Clipboard copy is not available in this browser.");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied cell value.");
    } catch {
      toast.error("Could not copy cell value.");
    }
  };

  const persistColumnDisplayModes = (next: Record<string, ColumnDisplayMode>) => {
    setColumnDisplayModes(saveTableColumnDisplayModes(storageKey(), next));
  };

  const persistColumnWidths = (next: ColumnWidthMap) => {
    setColumnWidths(saveTableColumnWidths(widthStorageKey(), next));
  };

  const setColumnDisplayMode = (column: string, mode: ColumnDisplayMode) => {
    persistColumnDisplayModes({ ...columnDisplayModes(), [column]: mode });
    setColumnMenu(null);
  };

  const toggleActiveSummaryColumn = (column: string) => {
    if (!columnIsNumeric(column)) return;
    setActiveSummaryColumn((current) => (current === column ? null : column));
  };

  let resizeState: { column: string; startX: number; startWidth: number } | null = null;

  onMount(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest("[data-table-column-menu]")) {
        setColumnMenu(null);
      }
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!resizeState) return;
      const delta = event.clientX - resizeState.startX;
      persistColumnWidths({
        ...columnWidths(),
        [resizeState.column]: clampTableColumnWidth(resizeState.startWidth + delta),
      });
    };
    const handlePointerUp = () => {
      resizeState = null;
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setColumnMenu(null);
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("keydown", handleEscape);
    onCleanup(() => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("keydown", handleEscape);
    });
  });

  return (
    <div class="space-y-2" data-table-column-menu>
      <div class="flex min-w-0 flex-wrap items-center gap-3">
        <p class="min-w-0 break-words font-mono text-[10px] uppercase tracking-[0.22em] text-outline">{rendererState().label}</p>
        <span class="min-w-0 break-words text-xs text-on-surface-variant sm:ml-auto">{rendererState().fromText}</span>
      </div>

      <Show when={rendererState().showTable}>
        <div class="relative overflow-auto rounded-2xl border border-white/35">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="border-b border-white/25 bg-white/20">
                <For each={rendererState().columnStates}>
                  {(columnState) => (
                    <th
                      onClick={() => toggleActiveSummaryColumn(columnState.name)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setColumnMenu({ column: columnState.name, x: event.clientX, y: event.clientY });
                      }}
                      class={columnState.headerCellClass}
                      style={columnState.widthStyle}
                      title="Right-click for column display options"
                    >
                      <div class="flex min-w-0 flex-wrap items-center gap-2">
                        <span class={columnState.headerTextClass}>{columnState.name}</span>
                        <Show when={columnState.numeric}>
                          <span
                            class={`max-w-full rounded-full border px-1.5 py-1 text-[8px] tracking-[0.12em] break-words ${
                              rendererState().activeSummary === columnState.name
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : "border-white/20 text-outline/70"
                            }`}
                            title="Click to toggle numeric summary footer"
                          >
                            {TABLE_SUMMARY_BADGE_LABEL}
                          </span>
                        </Show>
                        <span class="max-w-full rounded-full border border-white/25 px-1.5 py-1 text-[8px] tracking-[0.12em] text-outline/70 break-words">
                          {columnState.displayMode === "wrap" ? TABLE_WRAP_LABEL : TABLE_TRUNCATE_LABEL}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Resize ${columnState.name} column`}
                        title="Drag to resize column"
                        class="absolute inset-y-0 right-0 z-[3] w-3 cursor-col-resize touch-none"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          resizeState = {
                            column: columnState.name,
                            startX: event.clientX,
                            startWidth:
                              columnWidth(columnState.name) ??
                              event.currentTarget.parentElement?.getBoundingClientRect().width ??
                              160,
                          };
                        }}
                      >
                        <span class="absolute right-0 top-1/2 h-6 w-px -translate-y-1/2 bg-white/35 transition group-hover:bg-primary/45" />
                      </button>
                    </th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={rendererState().rowStates}>
                {(rowState) => (
                  <tr class={`border-b border-white/15 last:border-0 hover:bg-white/20 ${rowState.rowClass}`}>
                    <For each={rowState.cells}>
                      {(cellState) => (
                        <td class={cellState.cellClass} style={cellState.widthStyle}>
                          <span class={cellState.textClass}>{cellState.value}</span>
                          <Show when={cellState.showCopyButton}>
                            <button
                              type="button"
                              class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/20 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface opacity-0 transition hover:bg-black/30 focus:opacity-100 group-hover:opacity-100"
                              aria-label={`Copy ${cellState.column} value`}
                              title="Copy cell value"
                              onClick={() => void copyCellValue(cellState.value)}
                            >
                              {TABLE_COPY_LABEL}
                            </button>
                          </Show>
                        </td>
                      )}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
            <Show when={rendererState().activeSummaryStats}>
              {(stats) => (
                <tfoot>
                  <tr class="border-t border-white/20 bg-white/15">
                    <For each={rendererState().columnStates}>
                      {(columnState) => (
                        <td
                          class={`px-4 py-2 align-top text-[11px] text-on-surface-variant ${
                            columnState.name === stats().column ? "font-mono" : ""
                          } ${
                            columnState.sticky
                              ? "sticky left-0 z-[1] bg-[color:rgba(255,255,255,0.15)] shadow-[inset_-1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-sm"
                              : ""
                          }`}
                          style={columnState.widthStyle}
                        >
                          <Show
                            when={columnState.name === stats().column}
                            fallback={<span class="text-on-surface-variant/25"> </span>}
                          >
                            <div class="space-y-0.5">
                              <p class="font-mono text-[9px] uppercase tracking-[0.16em] text-primary/80">
                                {TABLE_SUMMARY_TITLE}
                              </p>
                              <p>Count {stats().count}</p>
                              <p>Sum {stats().sum.toLocaleString()}</p>
                              <p>
                                Avg{" "}
                                {stats().average.toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })}
                              </p>
                              <p>Min {stats().min.toLocaleString()}</p>
                              <p>Max {stats().max.toLocaleString()}</p>
                            </div>
                          </Show>
                        </td>
                      )}
                    </For>
                  </tr>
                </tfoot>
              )}
            </Show>
          </table>

          <Show when={columnMenu()}>
            {(menu) => (
              <div
                class="fixed z-[80] w-[min(14rem,calc(100vw-2rem))] rounded-2xl border border-white/45 bg-white/97 p-2 shadow-panel backdrop-blur-xl"
                style={{
                  left: `${Math.max(12, Math.min(menu().x, window.innerWidth - 200))}px`,
                  top: `${Math.max(12, Math.min(menu().y, window.innerHeight - 140))}px`,
                }}
              >
                <p class="break-words px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-outline">
                  {menu().column}
                </p>
                <div class="mt-1 flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setColumnDisplayMode(menu().column, "truncate")}
                    class={`rounded-xl px-3 py-2 text-left text-xs transition break-words ${
                      columnDisplayMode(menu().column) === "truncate"
                        ? "bg-primary/10 text-primary"
                        : "text-on-surface hover:bg-primary/[0.05]"
                    }`}
                  >
                    {TABLE_MENU_TRUNCATE_LABEL}
                  </button>
                  <button
                    type="button"
                    onClick={() => setColumnDisplayMode(menu().column, "wrap")}
                    class={`rounded-xl px-3 py-2 text-left text-xs transition break-words ${
                      columnDisplayMode(menu().column) === "wrap"
                        ? "bg-primary/10 text-primary"
                        : "text-on-surface hover:bg-primary/[0.05]"
                    }`}
                  >
                    {TABLE_MENU_WRAP_LABEL}
                  </button>
                </div>
              </div>
            )}
          </Show>
        </div>
      </Show>

      <Show when={rendererState().showEmpty}>
        <EmptyState icon={TABLE_EMPTY_ICON} title={TABLE_EMPTY_TITLE} body={TABLE_EMPTY_BODY} />
      </Show>
    </div>
  );
}
