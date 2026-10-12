// @locs-version: 1.0
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { sendAfpMessage } from "@/lib/api";
import type { DashboardBootstrap } from "@/lib/api";
import {
  buildDatabaseViewFailureReceipt,
  type DatabaseViewFailureReceipt,
} from "@/lib/databaseViewFailureState";
import {
  databaseColumnDefs,
  databaseImportPreviewRows,
  databaseImportRows,
  databaseRecordsFromMessages,
  databaseSchemaColumnsFromMessages,
  formatDatabaseEditableValue,
  parseDatabaseEditedValue,
  type DatabaseViewColumnDef as ColDef,
  type DatabaseViewRecord as DbRecord,
} from "@/lib/databaseViewState";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { dashboardBootstrapMessages } from "@/lib/dashboardBootstrapState";
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import { surfaceShortDateLabel } from "@/lib/surfaceTimestampPresentation";
import {
  analyzeDatabaseImportInput,
  analyzeDatabaseRecordContent,
} from "@/lib/structuredTextInputState";

type DatabaseMessage = {
  id: string;
  type: string;
  content: unknown;
  timestamp: string;
};

function sendRecord(table: string, data: unknown) {
  const threadId = `db_${table}_${Date.now()}`;
  return sendAfpMessage({
    thread_id: threadId,
    from: "user@omnyid.local",
    to: ["agent://database"],
    type: "database_record",
    content: { kind: "database_record", table, data },
    metadata: {
      origin: "database_view",
      database_table: table,
    },
    memory_scope: {
      memory_space: "personal",
      author_mask: "private",
      author_type: "human",
      human_only: true,
    },
  });
}

function sendRecordUpdate(table: string, targetRecordId: string, patch: Record<string, unknown>) {
  const threadId = `db_${table}_${targetRecordId}`;
  return sendAfpMessage({
    thread_id: threadId,
    from: "user@omnyid.local",
    to: ["agent://database"],
    type: "note:ledger_update",
    content: {
      kind: "database_record_update",
      table,
      target_record_id: targetRecordId,
      patch,
    },
    metadata: {
      origin: "database_view",
      database_table: table,
      target_record_id: targetRecordId,
    },
    memory_scope: {
      memory_space: "personal",
      author_mask: "private",
      author_type: "human",
      human_only: true,
    },
  });
}

function sendSchemaUpdate(table: string, column: ColDef) {
  return sendAfpMessage({
    thread_id: `db_${table}_schema`,
    from: "user@omnyid.local",
    to: ["agent://database"],
    type: "database_schema_update",
    content: { kind: "database_schema_update", table, column },
    metadata: { origin: "database_view", database_table: table },
    memory_scope: {
      memory_space: "personal",
      author_mask: "private",
      author_type: "human",
      human_only: true,
    },
  });
}

function GhostGrid(props: {
  headers: string[];
  tableName: string;
  onHeaderEdit: (idx: number, val: string) => void;
  onTableNameEdit: (val: string) => void;
}) {
  const ROWS = 6;
  return (
    <div class="animate-fade-in">
      <div class="mb-3 flex items-center gap-2">
        <input
          value={props.tableName || ""}
          onInput={(e) => props.onTableNameEdit(e.currentTarget.value)}
          placeholder="Unnamed Table"
          class="rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-on-surface/60 outline-none placeholder:text-on-surface-variant/35 focus:border-primary/25 focus:bg-white/30 focus:text-on-surface transition"
          title="Click to name this table"
        />
        <span class="text-[10px] text-on-surface-variant/35 italic">Click any header or cell to begin</span>
      </div>
      <div class="overflow-x-auto rounded-2xl border border-white/40 bg-white/30">
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-white/30 bg-white/50">
              <For each={props.headers}>
                {(h, i) => (
                  <th class="px-3 py-2 text-left">
                    <input
                      value={h}
                      onBlur={(e) => props.onHeaderEdit(i(), e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          recordShortcutUse("form_submit");
                          e.currentTarget.blur();
                        }
                        if (e.key === "Escape") {
                          recordShortcutUse("form_cancel");
                          e.currentTarget.blur();
                        }
                      }}
                      class="w-full bg-transparent font-semibold text-on-surface/60 outline-none focus:text-on-surface focus:border-b focus:border-primary/40 transition"
                    />
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: ROWS }, (_, r) => (
              <tr class="border-b border-white/20 last:border-0">
                <For each={props.headers}>
                  {(_, c) => (
                    <td class="px-3 py-2">
                      <div class={`h-3 rounded-full bg-on-surface/6 ${c() === 0 ? "w-24" : c() === 3 ? "w-12" : "w-16"}`} />
                    </td>
                  )}
                </For>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImportModal(props: {
  defaultTable: string;
  onClose: () => void;
  onCreated: (messages: DatabaseMessage[]) => void;
}) {
  const [raw, setRaw] = createSignal("");
  const [table, setTable] = createSignal(props.defaultTable || "imported");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | DatabaseViewFailureReceipt>("");
  const [preview, setPreview] = createSignal<string[][]>([]);
  const importState = createMemo(() => analyzeDatabaseImportInput(raw()));

  function handlePaste(text: string) {
    setError("");
    setRaw(text);
    try {
      const rows = databaseImportRows(text);
      if (rows.length > 0) {
        setPreview(databaseImportPreviewRows(rows));
      } else { setPreview([]); }
    } catch { setPreview([]); }
  }

  async function doImport() {
    if (busy()) return;
    if (importState().format === "invalid-json") {
      setError(importState().error ?? "Fix the JSON syntax before importing.");
      return;
    }
    const rows = databaseImportRows(raw());
    if (rows.length === 0) { setError("No records found — paste CSV or JSON."); return; }
    setBusy(true);
    try {
      const timestamp = new Date().toISOString();
      const messages: DatabaseMessage[] = [];
      for (const row of rows) {
        const result = await sendRecord(table(), row);
        messages.push({
          id: result.message_id,
          type: "database_record",
          timestamp,
          content: { kind: "database_record", table: table(), data: row },
        });
      }
      props.onCreated(messages);
      props.onClose();
    } catch (err) {
      setError(
        buildDatabaseViewFailureReceipt(
          "Import records",
          err instanceof Error ? err.message : "Import failed.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function requestClose() {
    if (busy()) return;
    props.onClose();
  }

  return (
    <div class="fixed inset-0 z-[200] flex items-center justify-center bg-on-surface/30 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          recordShortcutUse("form_cancel");
          requestClose();
        }
      }}>
      <div class="w-full max-w-lg rounded-3xl border border-white/45 bg-white/96 p-6 shadow-panel backdrop-blur-xl">
        <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-outline mb-4">Import Data</p>
        <input type="text" placeholder="Table name" value={table()} onInput={(e) => { setError(""); setTable(e.currentTarget.value); }}
            class="mb-3 w-full rounded-xl border border-white/40 bg-white/60 px-3 py-2 text-sm outline-none focus:border-primary/50 transition" />
        <textarea rows={6} placeholder={"Paste CSV (first row = headers) or JSON array:\nName, Status, Date\nAlice, Active, 2024-01-01"}
          value={raw()} onInput={(e) => handlePaste(e.currentTarget.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !busy() && importState().format !== "invalid-json" && raw().trim()) {
              e.preventDefault();
              recordShortcutUse("form_submit");
              void doImport();
              return;
            }
            if (e.key === "Escape" && !busy()) {
              e.preventDefault();
              recordShortcutUse("form_cancel");
              requestClose();
            }
          }}
          class={`w-full rounded-xl bg-white/60 px-3 py-2 text-xs text-on-surface font-mono outline-none transition resize-none ${
            importState().format === "invalid-json"
              ? "border border-error/50 focus:border-error/70"
              : "border border-white/40 focus:border-primary/50"
          }`} />
        <p class={`mt-1 text-[10px] ${
          importState().format === "invalid-json" ? "text-error" : "text-on-surface-variant/60"
        }`}>
          {importState().summary}
          {importState().error ? ` - ${importState().error}` : " - Press Ctrl/Cmd+Enter to import."}
        </p>
        <Show when={preview().length > 1}>
          <div class="mt-2 overflow-x-auto rounded-xl border border-primary/15 bg-primary/4">
            <table class="w-full text-[11px]">
              <thead><tr class="border-b border-primary/10">{preview()[0].map((h) => <th class="px-2 py-1 text-left font-mono text-primary/60 uppercase text-[9px]">{h}</th>)}</tr></thead>
              <tbody>{preview().slice(1).map((row) => <tr class="border-b border-white/20 last:border-0">{row.map((c) => <td class="px-2 py-1 text-on-surface-variant">{c || "—"}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p class="mt-1 text-[10px] text-on-surface-variant/50">Preview — first 3 rows</p>
        </Show>
        <Show when={error()}>
          {(() => {
            const currentError = error();
            return typeof currentError === "string" ? (
              <p class="mt-2 text-xs text-error">{currentError}</p>
            ) : (
              <div class="mt-2 rounded-xl border border-amber-200/60 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
                <p class="font-medium">{currentError.title}</p>
                <p class="mt-0.5">{currentError.summary}</p>
                <p class="mt-0.5 opacity-80">{currentError.nextStep}</p>
              </div>
            );
          })()}
        </Show>
        <div class="mt-4 flex gap-2">
          <button type="button" onClick={() => {
            recordShortcutUse("form_cancel");
            requestClose();
          }}
            class="flex-1 rounded-xl border border-outline/20 py-2 text-xs text-on-surface-variant transition hover:bg-on-surface/5">Cancel</button>
          <button type="button" onClick={doImport} disabled={busy() || !raw().trim() || importState().format === "invalid-json"}
            class="flex-1 rounded-xl bg-primary py-2 text-xs font-medium text-white transition hover:bg-primary/80 disabled:opacity-50">
            {busy() ? "Importing..." : `Import ${importState().rowCount || ""} row${importState().rowCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddRecordModal(props: {
  tables: string[];
  onClose: () => void;
  onCreated: (message: DatabaseMessage) => void;
}) {
  const [table, setTable] = createSignal(props.tables[0] ?? "");
  const [newTable, setNewTable] = createSignal("");
  const [content, setContent] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | DatabaseViewFailureReceipt>("");
  const contentState = createMemo(() => analyzeDatabaseRecordContent(content()));

  async function save() {
    if (busy()) return;
    const targetTable = newTable().trim() || table();
    if (!targetTable) { setError("Table name required."); return; }
    if (contentState().format === "invalid-json") {
      setError(contentState().error ?? "Fix the JSON syntax before saving.");
      return;
    }
    setBusy(true);
    try {
      let data: unknown = content();
      const parsed = parseJsonValue(content());
      if (parsed.ok) data = parsed.value;
      const result = await sendRecord(targetTable, data);
      props.onCreated({
        id: result.message_id,
        type: "database_record",
        timestamp: new Date().toISOString(),
        content: { kind: "database_record", table: targetTable, data },
      });
      props.onClose();
    } catch (err) {
      setError(
        buildDatabaseViewFailureReceipt(
          "Save record",
          err instanceof Error ? err.message : "Failed to save record.",
        ),
      );
    } finally { setBusy(false); }
  }

  function requestClose() {
    if (busy()) return;
    props.onClose();
  }

  return (
    <div class="fixed inset-0 z-[200] flex items-center justify-center bg-on-surface/30 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          recordShortcutUse("form_cancel");
          requestClose();
        }
      }}>
      <div class="w-full max-w-sm rounded-3xl border border-white/45 bg-white/96 p-6 shadow-panel backdrop-blur-xl">
        <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-outline mb-4">New Record</p>
        <div class="space-y-3">
          <Show when={props.tables.length > 0}>
            <select value={table()} onChange={(e) => { setError(""); setTable(e.currentTarget.value); }}
              class="w-full rounded-xl border border-white/40 bg-white/60 px-3 py-2 text-sm text-on-surface outline-none focus:border-primary/50 transition">
              <For each={props.tables}>{(t) => <option value={t}>{t}</option>}</For>
            </select>
          </Show>
          <input type="text" placeholder={props.tables.length > 0 ? "Or create new table…" : "Table / collection name *"}
            value={newTable()} onInput={(e) => { setError(""); setNewTable(e.currentTarget.value); }}
            class="w-full rounded-xl border border-white/40 bg-white/60 px-3 py-2 text-sm text-on-surface outline-none focus:border-primary/50 transition" />
          <textarea rows={4} placeholder={'Record data (JSON or plain text)\n{"name": "Alice", "status": "active"}'}
            value={content()} onInput={(e) => { setError(""); setContent(e.currentTarget.value); }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !busy() && contentState().format !== "invalid-json") {
                e.preventDefault();
                recordShortcutUse("form_submit");
                void save();
                return;
              }
              if (e.key === "Escape" && !busy()) {
                e.preventDefault();
                recordShortcutUse("form_cancel");
                requestClose();
              }
            }}
            class={`w-full rounded-xl bg-white/60 px-3 py-2 text-sm text-on-surface outline-none transition resize-none font-mono ${
              contentState().format === "invalid-json"
                ? "border border-error/50 focus:border-error/70"
                : "border border-white/40 focus:border-primary/50"
            }`} />
          <p class={`text-[10px] ${
            contentState().format === "invalid-json" ? "text-error" : "text-on-surface-variant/60"
          }`}>
            {contentState().summary}
            {contentState().error ? ` - ${contentState().error}` : " - Press Ctrl/Cmd+Enter to save."}
          </p>
          <Show when={error()}>
            {(() => {
              const currentError = error();
              return typeof currentError === "string" ? (
                <p class="text-xs text-error">{currentError}</p>
              ) : (
                <div class="rounded-xl border border-amber-200/60 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
                  <p class="font-medium">{currentError.title}</p>
                  <p class="mt-0.5">{currentError.summary}</p>
                  <p class="mt-0.5 opacity-80">{currentError.nextStep}</p>
                </div>
              );
            })()}
          </Show>
          <div class="flex gap-2">
            <button type="button" onClick={() => {
              recordShortcutUse("form_cancel");
              requestClose();
            }}
              class="flex-1 rounded-xl border border-outline/20 py-2 text-xs text-on-surface-variant transition hover:bg-on-surface/5">Cancel</button>
            <button type="button" onClick={save} disabled={busy() || contentState().format === "invalid-json"}
              class="flex-1 rounded-xl bg-primary py-2 text-xs font-medium text-white transition hover:bg-primary/80 disabled:opacity-50">
              {busy() ? "Saving…" : "Save Record"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

type DensityMode = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";
type DensityBucket = "compact" | "comfortable" | "spacious";
const DENSITY_MODES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;

function densityBucket(mode: DensityMode): DensityBucket {
  const level = Number(mode);
  if (level <= 4) return "compact";
  if (level >= 9) return "spacious";
  return "comfortable";
}

function densityScaleLabel(mode: DensityMode): string {
  if (mode === "1") return "A";
  if (mode === "10") return "A";
  return "";
}

function densityScaleLabelClass(mode: DensityMode): string {
  if (mode === "1") return "text-[9px] leading-none";
  if (mode === "10") return "text-[15px] leading-none";
  return "h-1.5 w-1.5 rounded-full bg-current opacity-70";
}

export function DatabaseView(props: { bootstrap: DashboardBootstrap | null }) {
  const DEFAULT_HEADERS = ["Name", "Status", "Date", "Value", "Notes"];
  const [showAdd, setShowAdd] = createSignal(false);
  const [activeTable, setActiveTable] = createSignal<string | null>(null);
  const [refreshKey, setRefreshKey] = createSignal(0);
  const [fullscreen, setFullscreen] = createSignal(false);
  const [ghostHeaders, setGhostHeaders] = createSignal([...DEFAULT_HEADERS]);
  const [tableName, setTableName] = createSignal("");
  const [dbName, setDbName] = createSignal("Unnamed Database");
  const [showNamePrompt, setShowNamePrompt] = createSignal(false);
  const [editingCell, setEditingCell] = createSignal<{ rowId: string; col: string } | null>(null);
  const [editingValue, setEditingValue] = createSignal("");
  const [savingCell, setSavingCell] = createSignal<{ rowId: string; col: string } | null>(null);
  const [editError, setEditError] = createSignal<DatabaseViewFailureReceipt | null>(null);
  const [densityMode, setDensityMode] = createSignal<DensityMode>("7");
  const [showPlusMenu, setShowPlusMenu] = createSignal(false);
  const [showImport, setShowImport] = createSignal(false);
  const [tableScrollTop, setTableScrollTop] = createSignal(0);
  const [selectedRowIds, setSelectedRowIds] = createSignal<string[]>([]);
  const [localMessages, setLocalMessages] = createSignal<DatabaseMessage[]>([]);
  let tableScrollRef: HTMLDivElement | undefined;

  const headPad = createMemo(() => ({
    compact: "px-2 py-1",
    comfortable: "px-3 py-2.5",
    spacious: "px-4 py-4",
  }[densityBucket(densityMode())]));

  const cellPad = createMemo(() => ({
    compact: "px-2 py-0.5",
    comfortable: "px-3 py-1.5",
    spacious: "px-4 py-3",
  }[densityBucket(densityMode())]))
  const rowHeightPx = createMemo(() => ({
    compact: 28,
    comfortable: 40,
    spacious: 56,
  }[densityBucket(densityMode())]));
  const records = createMemo(() => {
    void refreshKey();
    const messages = [...dashboardBootstrapMessages(props.bootstrap), ...localMessages()]
      .filter((m) =>
        m.type.includes("database") ||
        m.type === "database_record" ||
        m.type === "note:ledger_update" ||
        (isRecord(m.content) &&
          (m.content.kind === "database_record" ||
            m.content.kind === "database_record_update")),
      );

    return databaseRecordsFromMessages(messages);
  });

  const tables = createMemo(() => {
    const seen = new Set<string>();
    return records().map((r) => r.table).filter((t) => { if (seen.has(t)) return false; seen.add(t); return true; });
  });

  const visibleRecords = createMemo(() => {
    const t = activeTable();
    return t ? records().filter((r) => r.table === t) : records();
  });
  const allVisibleSelected = createMemo(() =>
    visibleRecords().length > 0 && visibleRecords().every((row) => selectedRowIds().includes(row.id)),
  );

  const columns = createMemo((): ColDef[] => {
    return databaseColumnDefs(
      visibleRecords(),
      ghostHeaders(),
      databaseSchemaColumnsFromMessages(
        [...dashboardBootstrapMessages(props.bootstrap), ...localMessages()],
        activeTable(),
      ),
    );
  });

  // These computations read visibleRecords()/columns(), whose createMemos run
  // immediately. Keep their declarations below those sources so a saved
  // Database view can be restored directly without a temporal-dead-zone crash.
  const shouldVirtualizeRows = createMemo(() => visibleRecords().length > 200);
  const virtualWindow = createMemo(() => {
    const total = visibleRecords().length;
    if (!shouldVirtualizeRows()) {
      return {
        start: 0,
        end: total,
        topSpacer: 0,
        bottomSpacer: 0,
      };
    }
    const rowHeight = rowHeightPx();
    const viewportHeight = tableScrollRef?.clientHeight ?? 640;
    const overscan = 8;
    const visibleCount = Math.max(1, Math.ceil(viewportHeight / rowHeight));
    const start = Math.max(0, Math.floor(tableScrollTop() / rowHeight) - overscan);
    const end = Math.min(total, start + visibleCount + overscan * 2);
    return {
      start,
      end,
      topSpacer: start * rowHeight,
      bottomSpacer: Math.max(0, (total - end) * rowHeight),
    };
  });
  const renderedRecords = createMemo(() => {
    const rows = visibleRecords();
    const window = virtualWindow();
    return shouldVirtualizeRows() ? rows.slice(window.start, window.end) : rows;
  });
  const totalColumnCount = createMemo(() => columns().length + 3);
  const selectedCount = createMemo(() => selectedRowIds().length);

  function recordLocalMessage(message: DatabaseMessage) {
    setLocalMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    setRefreshKey((value) => value + 1);
  }

  createEffect(() => {
    const visibleIds = new Set(visibleRecords().map((row) => row.id));
    setSelectedRowIds((current) => current.filter((id) => visibleIds.has(id)));
  });

  function formatEditableValue(value: unknown): string {
    return formatDatabaseEditableValue(value);
  }

  function parseEditedValue(raw: string, previous: unknown): unknown {
    return parseDatabaseEditedValue(raw, previous);
  }

  function beginEditingCell(row: DbRecord, col: string) {
    setEditError(null);
    setEditingCell({ rowId: row.id, col });
    setEditingValue(formatEditableValue(row.data[col]));
  }

  async function commitEditingCell(row: DbRecord, col: string) {
    const active = editingCell();
    if (!active || active.rowId !== row.id || active.col !== col) return;
    if (savingCell()?.rowId === row.id && savingCell()?.col === col) return;
    const nextValue = parseEditedValue(editingValue(), row.data[col]);
    const previousValue = row.data[col];
    if (JSON.stringify(nextValue) === JSON.stringify(previousValue)) {
      setEditingCell(null);
      setEditingValue("");
      return;
    }
    setSavingCell({ rowId: row.id, col });
    setEditError(null);
    try {
      const result = await sendRecordUpdate(row.table, row.id, { [col]: nextValue });
      recordLocalMessage({
        id: result.message_id,
        type: "note:ledger_update",
        timestamp: new Date().toISOString(),
        content: {
          kind: "database_record_update",
          table: row.table,
          target_record_id: row.id,
          patch: { [col]: nextValue },
        },
      });
      setEditingCell(null);
      setEditingValue("");
    } catch (error) {
      setEditError(
        buildDatabaseViewFailureReceipt(
          "Save cell",
          error instanceof Error ? error.message : "Could not save this cell.",
        ),
      );
    } finally {
      setSavingCell(null);
    }
  }

  function cancelEditingCell() {
    setEditingCell(null);
    setEditingValue("");
    setEditError(null);
  }

  function toggleRowSelection(rowId: string) {
    setSelectedRowIds((current) =>
      current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId],
    );
  }

  function toggleSelectAllVisible(checked: boolean) {
    if (checked) {
      setSelectedRowIds(visibleRecords().map((row) => row.id));
      return;
    }
    setSelectedRowIds([]);
  }

  function exportSelectedRows() {
    const selected = visibleRecords().filter((row) => selectedRowIds().includes(row.id));
    if (selected.length === 0) return;
    const payload = selected.map((row) => ({
      id: row.id,
      table: row.table,
      timestamp: row.timestamp,
      data: row.data,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeTable() ?? "database"}-selected-${selected.length}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // Prompt for table name if user tries to navigate away without naming the database
  onMount(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      if (records().length === 0 && tableName().trim() === "") {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    onCleanup(() => window.removeEventListener("beforeunload", beforeUnload));
  });

  const containerClass = () => fullscreen()
    ? "fixed inset-0 z-[150] bg-white/98 backdrop-blur-xl overflow-auto p-8 animate-fade-in"
    : "animate-fade-in space-y-5";

  return (
    <div class={containerClass()}>
      {/* Header */}
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="font-mono text-[10px] uppercase tracking-[0.28em] text-outline">Database</p>
          <input
            value={dbName()}
            onInput={(e) => setDbName(e.currentTarget.value)}
            class="mt-1 block w-full bg-transparent text-xl font-bold text-on-surface outline-none border-b border-transparent focus:border-primary/30 transition placeholder:text-on-surface/30"
            placeholder="Unnamed Database"
          />
          <p class="mt-0.5 text-sm text-on-surface-variant">Add rows and fields, then save your changes to this private table.</p>
        </div>
        <div class="flex items-center gap-2 mt-2 flex-shrink-0">
          {/* Density mode */}
          <div class="inline-flex items-center gap-1 rounded-full border border-outline/15 bg-white/30 p-1 text-[10px] text-on-surface-variant">
            <span class="px-1.5 font-mono uppercase tracking-[0.16em] text-outline/70">Density</span>
            {DENSITY_MODES.map((mode) => (
              <button type="button" onClick={() => setDensityMode(mode)}
                class={`inline-flex min-h-8 min-w-7 items-center justify-center rounded-full border font-semibold transition ${densityMode() === mode ? "border-primary/25 bg-primary/15 text-primary shadow-sm" : "border-transparent text-on-surface-variant/60 hover:bg-white/55"}`}
                aria-pressed={densityMode() === mode}
                aria-label={`Text density ${mode} of 10`}
                title={`Text density ${mode} of 10`}>
                <span class={densityScaleLabelClass(mode)}>{densityScaleLabel(mode)}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setFullscreen((v) => !v)}
            class="rounded-full border border-outline/20 bg-white/40 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white/60"
            title={fullscreen() ? "Exit fullscreen" : "Fullscreen mode"}>
            {fullscreen() ? "⊠ Exit" : "⊞ Fullscreen"}
          </button>
          {/* Plus menu */}
          <div class="relative">
            <button type="button" onClick={() => setShowPlusMenu((v) => !v)}
              class="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/80 flex items-center gap-1">
              + New
              <span class={`text-[8px] opacity-70 transition-transform ${showPlusMenu() ? "rotate-180" : ""}`}>▼</span>
            </button>
            <Show when={showPlusMenu()}>
              <div class="absolute right-0 top-full z-50 mt-1 min-w-[168px] rounded-2xl border border-white/45 bg-white/96 p-1.5 shadow-panel backdrop-blur-xl animate-fade-in"
                onPointerDown={(e) => e.stopPropagation()}>
                {([
                  { icon: "◈", label: "New Record", action: () => { setShowAdd(true); setShowPlusMenu(false); } },
                  { icon: "⊞", label: "New Field", action: () => {
                    const label = prompt("Field name:")?.trim();
                    const table = activeTable() ?? tableName().trim() ?? tables()[0];
                    if (!label) { setShowPlusMenu(false); return; }
                    if (!table) {
                      setGhostHeaders((headers) => [...headers, label]);
                      setShowPlusMenu(false);
                      return;
                    }
                    const key = label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `field_${Date.now()}`;
                    void (async () => {
                      try {
                        const result = await sendSchemaUpdate(table, { key, label });
                        recordLocalMessage({
                          id: result.message_id,
                          type: "database_schema_update",
                          timestamp: new Date().toISOString(),
                          content: { kind: "database_schema_update", table, column: { key, label } },
                        });
                      } catch (error) {
                        setEditError(buildDatabaseViewFailureReceipt("Add field", error instanceof Error ? error.message : "Could not add this field."));
                      }
                    })();
                    setShowPlusMenu(false);
                  }},
                  { icon: "↑", label: "Import CSV / JSON", action: () => { setShowImport(true); setShowPlusMenu(false); } },
                ] as const).map((item) => (
                  <button type="button" onClick={item.action}
                    class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-on-surface hover:bg-primary/6 transition">
                    <span class="text-base text-primary/50">{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            </Show>
          </div>
        </div>
      </div>

      {/* Table filter pills */}
      <Show when={tables().length > 0}>
        <div class="flex flex-wrap gap-2">
          <button type="button" onClick={() => setActiveTable(null)}
            class={`rounded-full px-3 py-1 text-xs font-medium transition border ${!activeTable() ? "bg-primary text-white border-primary" : "border-outline/20 bg-white/40 text-on-surface-variant hover:bg-white/60"}`}>
            All
          </button>
          <For each={tables()}>
            {(t) => (
              <button type="button" onClick={() => setActiveTable(activeTable() === t ? null : t)}
                class={`rounded-full px-3 py-1 text-xs font-medium transition border ${activeTable() === t ? "bg-primary text-white border-primary" : "border-outline/20 bg-white/40 text-on-surface-variant hover:bg-white/60"}`}>
                {t}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* Grid */}
      <Show
        when={visibleRecords().length > 0}
        fallback={
          <GhostGrid
            headers={ghostHeaders()}
            tableName={tableName()}
            onHeaderEdit={(i, val) => setGhostHeaders((prev) => prev.map((h, idx) => idx === i ? (val || h) : h))}
            onTableNameEdit={(val) => setTableName(val)}
          />
        }
      >
        <Show when={editError()}>
          <div
            class={`rounded-xl px-4 py-2 text-xs ${
              editError()?.tone === "danger"
                ? "border border-red-200/60 bg-red-50/80 text-red-700"
                : "border border-amber-200/60 bg-amber-50/80 text-amber-900"
            }`}
          >
            <p class="font-medium">{editError()?.title}</p>
            <p class="mt-0.5">{editError()?.summary}</p>
            <p class="mt-0.5 opacity-80">{editError()?.nextStep}</p>
          </div>
        </Show>
        <Show when={selectedCount() > 0}>
          <div class="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-primary/15 bg-primary/6 px-4 py-3">
            <div>
              <p class="text-sm font-medium text-on-surface">
                {selectedCount()} row{selectedCount() === 1 ? "" : "s"} selected
              </p>
              <p class="text-xs text-on-surface-variant">
                Export the current selection or clear it.
              </p>
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={exportSelectedRows}
                class="rounded-full border border-primary/20 bg-white/70 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-white"
              >
                Export selected
              </button>
              <button
                type="button"
                onClick={() => setSelectedRowIds([])}
                class="rounded-full border border-outline/20 bg-white/50 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white/70"
              >
                Clear
              </button>
            </div>
          </div>
        </Show>
        <div
          ref={tableScrollRef}
          class={`overflow-auto rounded-2xl border border-white/50 bg-white/40 shadow-card ${
            shouldVirtualizeRows() ? "max-h-[70vh]" : ""
          }`}
          onScroll={(event) => setTableScrollTop(event.currentTarget.scrollTop)}
        >
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-white/40 bg-white/60">
                <th class={`${headPad()} w-10 text-center`}>
                  <Show when={selectedCount() > 0}>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected()}
                      onChange={(event) => toggleSelectAllVisible(event.currentTarget.checked)}
                      class="h-3.5 w-3.5 cursor-pointer rounded border-white/30 bg-white/70 text-primary focus:ring-primary/30"
                      aria-label="Select all visible rows"
                    />
                  </Show>
                </th>
                <th class={`${headPad()} text-left font-mono text-[9px] uppercase tracking-wider text-outline/60`}>Table</th>
                <th class={`${headPad()} text-left font-mono text-[9px] uppercase tracking-wider text-outline/60`}>Date</th>
                <For each={columns()}>
                  {(col) => (
                    <th class={`${headPad()} text-left`}>
                      <input
                        value={col.label}
                        onBlur={(e) => { void e; }}
                        class="w-full bg-transparent font-mono text-[9px] uppercase tracking-wider text-outline/60 outline-none focus:text-primary focus:border-b focus:border-primary/40 transition capitalize cursor-pointer"
                        title="Click to rename column"
                      />
                    </th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody>
              <Show when={shouldVirtualizeRows() && virtualWindow().topSpacer > 0}>
                <tr aria-hidden="true">
                  <td colSpan={totalColumnCount()} style={{ height: `${virtualWindow().topSpacer}px`, padding: "0", border: "0" }} />
                </tr>
              </Show>
              <For each={renderedRecords()}>
                {(row, idx) => (
                  <tr class={`group border-b border-white/25 last:border-0 transition hover:bg-white/30 ${(virtualWindow().start + idx()) % 2 === 1 ? "bg-white/15" : ""} ${selectedRowIds().includes(row.id) ? "bg-primary/8" : ""}`}>
                    <td class={`${cellPad()} w-10 text-center`}>
                      <input
                        type="checkbox"
                        checked={selectedRowIds().includes(row.id)}
                        onChange={() => toggleRowSelection(row.id)}
                        class={`h-3.5 w-3.5 cursor-pointer rounded border-white/30 bg-white/70 text-primary focus:ring-primary/30 transition ${
                          selectedRowIds().includes(row.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
                        }`}
                        aria-label={`Select row from ${row.table}`}
                      />
                    </td>
                    <td class={`${cellPad()}`}>
                      <span class="rounded-full border border-primary/20 bg-primary/8 px-2 py-0.5 font-mono text-[9px] text-primary">{row.table}</span>
                    </td>
                    <td class={`${cellPad()} text-on-surface-variant/60 whitespace-nowrap`}>
                      {row.timestamp ? surfaceShortDateLabel(row.timestamp) || "—" : "—"}
                    </td>
                    <For each={columns()}>
                      {(col) => {
                        const val = row.data[col.key];
                        const fullValue = formatEditableValue(val);
                        const str = fullValue ? fullValue.slice(0, 80) : "";
                        const isEditing = () => editingCell()?.rowId === row.id && editingCell()?.col === col.key;
                        const isSaving = () => savingCell()?.rowId === row.id && savingCell()?.col === col.key;
                        const useTextarea = fullValue.includes("\n") || fullValue.length > 48;
                        return (
                          <td class={`${cellPad()} text-on-surface max-w-[12rem]`} title={str}>
                            <Show when={isEditing()}
                              fallback={
                                <span class="block truncate cursor-pointer hover:text-primary transition"
                                  onDblClick={() => beginEditingCell(row, col.key)}>
                                  {str || <span class="text-outline/30 italic text-[10px]">—</span>}
                                </span>
                              }
                            >
                              <Show
                                when={useTextarea}
                                fallback={
                                  <input
                                    autofocus
                                    value={editingValue()}
                                    disabled={isSaving()}
                                    class="w-full rounded bg-primary/5 border border-primary/30 px-1 py-0.5 text-xs outline-none focus:border-primary/60 disabled:opacity-70"
                                    onInput={(e) => setEditingValue(e.currentTarget.value)}
                                    onBlur={() => void commitEditingCell(row, col.key)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        recordShortcutUse("form_submit");
                                        void commitEditingCell(row, col.key);
                                      } else if (e.key === "Escape") {
                                        e.preventDefault();
                                        recordShortcutUse("form_cancel");
                                        cancelEditingCell();
                                      }
                                    }}
                                  />
                                }
                              >
                                <TiptapEditor
                                  mode="compact"
                                  appearance="minimal"
                                  showToolbar={false}
                                  showFooter={false}
                                  enableSlashCommands={false}
                                  submitShortcut="none"
                                  disabled={isSaving()}
                                  initialContent={editingValue()}
                                  placeholder="Edit cell value..."
                                  class="w-full"
                                  contentClass="min-h-[4.5rem] rounded border border-primary/30 bg-primary/5 px-1 py-0.5 text-xs text-on-surface"
                                  onReady={(handle) => queueMicrotask(() => handle.focus())}
                                  onChange={(text) => setEditingValue(text)}
                                  onBlur={() => void commitEditingCell(row, col.key)}
                                  onKeyDown={(event) => {
                                    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                                      event.preventDefault();
                                      recordShortcutUse("form_submit");
                                      void commitEditingCell(row, col.key);
                                      return true;
                                    }
                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      recordShortcutUse("form_cancel");
                                      cancelEditingCell();
                                      return true;
                                    }
                                    return false;
                                  }}
                                  onSend={async () => {}}
                                  clearOnSend={false}
                                />
                              </Show>
                            </Show>
                          </td>
                        );
                      }}
                    </For>
                  </tr>
                )}
              </For>
              <Show when={shouldVirtualizeRows() && virtualWindow().bottomSpacer > 0}>
                <tr aria-hidden="true">
                  <td colSpan={totalColumnCount()} style={{ height: `${virtualWindow().bottomSpacer}px`, padding: "0", border: "0" }} />
                </tr>
              </Show>
            </tbody>
          </table>
          <Show when={shouldVirtualizeRows()}>
            <p class="px-4 py-2 text-[11px] text-on-surface-variant/50">
              Virtualized {visibleRecords().length} records for smoother scrolling
            </p>
          </Show>
        </div>
      </Show>

      {/* Table name prompt — shown inline when records exist but no named table */}
      <Show when={showNamePrompt()}>
        <div class="fixed inset-0 z-[200] flex items-center justify-center bg-on-surface/20 backdrop-blur-sm animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setShowNamePrompt(false); }}>
          <div class="w-full max-w-xs rounded-3xl border border-white/45 bg-white/96 p-5 shadow-panel backdrop-blur-xl">
            <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-outline mb-3">Name your database</p>
            <input type="text" placeholder="e.g. Contacts, Projects…" value={tableName()}
              onInput={(e) => setTableName(e.currentTarget.value)}
              class="w-full rounded-xl border border-white/40 bg-white/60 px-3 py-2 text-sm outline-none focus:border-primary/50 transition mb-3" />
            <button type="button" onClick={() => setShowNamePrompt(false)}
              class="w-full rounded-xl bg-primary py-2 text-xs font-medium text-white transition hover:bg-primary/80">
              Done
            </button>
          </div>
        </div>
      </Show>

      <Show when={showAdd()}>
        <AddRecordModal
          tables={tables()}
          onClose={() => setShowAdd(false)}
          onCreated={recordLocalMessage}
        />
      </Show>

      <Show when={showImport()}>
        <ImportModal
          defaultTable={activeTable() ?? tableName() ?? "imported"}
          onClose={() => setShowImport(false)}
          onCreated={(messages) => messages.forEach(recordLocalMessage)}
        />
      </Show>

      {/* Click-outside to close plus menu */}
      <Show when={showPlusMenu()}>
        <div class="fixed inset-0 z-40" onClick={() => setShowPlusMenu(false)} />
      </Show>
    </div>
  );
}
