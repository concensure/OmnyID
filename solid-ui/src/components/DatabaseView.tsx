// @locs-version: 1.0
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { DashboardBootstrap } from "@/lib/api";
import {
  buildDatabaseViewFailureReceipt,
  type DatabaseViewFailureReceipt,
} from "@/lib/databaseViewFailureState";
import {
  databaseColumnDefs,
  databaseRecordsForDatabase,
  databaseRecordsFromMessages,
  databaseSchemaColumnsFromMessages,
  formatDatabaseEditableValue,
  parseDatabaseEditedValue,
  type DatabaseViewColumnDef as ColDef,
  type DatabaseViewRecord as DbRecord,
} from "@/lib/databaseViewState";
import {
  sendDatabaseArchive,
  sendDatabaseDefinition,
  sendDatabaseRecord,
  sendDatabaseRecordRevision,
  sendDatabaseSchema,
} from "@/lib/databaseMessageCommands";
import { DatabaseHeader, type DatabaseDensityMode } from "@/components/DatabaseHeader";
import {
  DatabaseCreateDialog,
  DatabaseLifecycleDialog,
  type DatabaseCreateInput,
} from "@/components/DatabaseCreateDialog";
import {
  projectDatabaseDefinitions,
  reconcileSelectedDatabaseId,
  registeredDatabaseProfiles,
} from "@/lib/databaseRegistryState";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import {
  DatabaseAddRecordDialog,
  DatabaseImportDialog,
  type DatabaseEditorMessage as DatabaseMessage,
} from "@/components/DatabaseRecordEditor";
import { dashboardBootstrapMessages } from "@/lib/dashboardBootstrapState";
import { isRecord } from "@/lib/eventDetail";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import { surfaceShortDateLabel } from "@/lib/surfaceTimestampPresentation";

function GhostGrid(props: {
  readonly?: boolean;
  headers: string[];
  tableName: string;
  onHeaderEdit: (idx: number, val: string) => void;
  onTableNameEdit: (val: string) => void;
  onCreate: (table: string, data: Record<string, string>) => Promise<void>;
}) {
  const ROWS = 3;
  const [draft, setDraft] = createSignal<Record<string, string>>({});
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");
  const createRow = async () => {
    if (props.readonly) return;
    const table = props.tableName.trim();
    const data = props.headers.reduce<Record<string, string>>((result, header, index) => {
      const value = draft()[`${index}`]?.trim();
      if (value) result[header.trim() || `Field ${index + 1}`] = value;
      return result;
    }, {});
    if (!table) { setError("Name this table before saving its first row."); return; }
    if (Object.keys(data).length === 0) { setError("Enter at least one cell to save this row."); return; }
    setSaving(true);
    setError("");
    try {
      await props.onCreate(table, data);
      setDraft({});
    } catch {
      setError("This row could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div class="animate-fade-in">
      <div class="mb-3 flex items-center gap-2">
        <input
          value={props.tableName || ""}
          disabled={props.readonly}
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
                      disabled={props.readonly}
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
            <tr class="border-b border-primary/15 bg-primary/[0.025]">
              <For each={props.headers}>
                {(_, index) => (
                  <td class="px-3 py-2">
                    <input
                      value={draft()[`${index()}`] ?? ""}
                      disabled={props.readonly}
                      onInput={(event) => setDraft((current) => ({ ...current, [`${index()}`]: event.currentTarget.value }))}
                      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createRow(); } }}
                      placeholder="Enter value"
                      class="w-full min-w-24 rounded-md border border-transparent bg-white/60 px-2 py-1.5 text-on-surface outline-none placeholder:text-on-surface-variant/40 focus:border-primary/35"
                    />
                  </td>
                )}
              </For>
            </tr>
            <tr class="border-b border-white/20">
              <td colSpan={props.headers.length} class="px-3 py-2">
                <div class="flex items-center gap-3">
                  <button type="button" disabled={saving() || props.readonly} onClick={() => void createRow()} class="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary/80 disabled:opacity-60">
                    {saving() ? "Saving…" : "Save row"}
                  </button>
                  <Show when={error()}><span class="text-xs text-red-600">{error()}</span></Show>
                </div>
              </td>
            </tr>
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

type DensityBucket = "compact" | "comfortable" | "spacious";

function densityBucket(mode: DatabaseDensityMode): DensityBucket {
  const level = Number(mode);
  if (level <= 4) return "compact";
  if (level >= 9) return "spacious";
  return "comfortable";
}

export function DatabaseView(props: { bootstrap: DashboardBootstrap | null }) {
  const DEFAULT_HEADERS = ["Name", "Status", "Date", "Value", "Notes"];
  const [showAdd, setShowAdd] = createSignal(false);
  const [activeTable, setActiveTable] = createSignal<string | null>(null);
  const [refreshKey, setRefreshKey] = createSignal(0);
  const [fullscreen, setFullscreen] = createSignal(false);
  const [ghostHeaders, setGhostHeaders] = createSignal([...DEFAULT_HEADERS]);
  const [tableName, setTableName] = createSignal("");
  const [selectedDatabaseId, setSelectedDatabaseId] = createSignal<string | null>(null);
  const [databaseName, setDatabaseName] = createSignal("");
  const [showDatabaseCreate, setShowDatabaseCreate] = createSignal(false);
  const [databaseCreateBusy, setDatabaseCreateBusy] = createSignal(false);
  const [databaseCreateError, setDatabaseCreateError] = createSignal("");
  const [showLifecycleConfirm, setShowLifecycleConfirm] = createSignal(false);
  const [lifecycleBusy, setLifecycleBusy] = createSignal(false);
  const [editingCell, setEditingCell] = createSignal<{ rowId: string; col: string } | null>(null);
  const [editingValue, setEditingValue] = createSignal("");
  const [savingCell, setSavingCell] = createSignal<{ rowId: string; col: string } | null>(null);
  const [editError, setEditError] = createSignal<DatabaseViewFailureReceipt | null>(null);
  const [densityMode, setDensityMode] = createSignal<DatabaseDensityMode>("7");
  const [showImport, setShowImport] = createSignal(false);
  const [tableScrollTop, setTableScrollTop] = createSignal(0);
  const [selectedRowIds, setSelectedRowIds] = createSignal<string[]>([]);
  const [localMessages, setLocalMessages] = createSignal<DatabaseMessage[]>([]);
  let tableScrollRef: HTMLDivElement | undefined;
  let lastSelectedDatabaseId: string | null = null;

  const allMessages = createMemo(() => [
    ...dashboardBootstrapMessages(props.bootstrap),
    ...localMessages(),
  ]);

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
    const messages = allMessages()
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

  const definitions = createMemo(() => projectDatabaseDefinitions({
    messages: allMessages(),
    accountId: props.bootstrap?.user.id ?? "",
    hasLegacyRecords: records().some((record) => record.databaseId === "database:legacy"),
  }));
  const profiles = createMemo(() => registeredDatabaseProfiles(allMessages()));
  const selectedDefinition = createMemo(() =>
    definitions().find((definition) => definition.databaseId === selectedDatabaseId()) ?? null,
  );

  createEffect(() => {
    const next = reconcileSelectedDatabaseId(definitions(), selectedDatabaseId());
    if (next !== selectedDatabaseId()) setSelectedDatabaseId(next);
  });

  createEffect(() => {
    const definition = selectedDefinition();
    setDatabaseName(definition?.name ?? "");
    if (definition && definition.databaseId !== lastSelectedDatabaseId) {
      lastSelectedDatabaseId = definition.databaseId;
      setTableName(definition.defaultTable);
      setActiveTable(null);
      setSelectedRowIds([]);
    }
  });

  const tables = createMemo(() => {
    const seen = new Set<string>();
    return databaseRecordsForDatabase(records(), selectedDatabaseId())
      .map((record) => record.table)
      .filter((table) => { if (seen.has(table)) return false; seen.add(table); return true; });
  });

  const visibleRecords = createMemo(() => {
    const t = activeTable();
    const selectedRecords = databaseRecordsForDatabase(records(), selectedDatabaseId());
    return t ? selectedRecords.filter((record) => record.table === t) : selectedRecords;
  });
  const allVisibleSelected = createMemo(() =>
    visibleRecords().length > 0 && visibleRecords().every((row) => selectedRowIds().includes(row.id)),
  );

  const columns = createMemo((): ColDef[] => {
    return databaseColumnDefs(
      visibleRecords(),
      ghostHeaders(),
      databaseSchemaColumnsFromMessages(
        allMessages(),
        activeTable(),
        selectedDatabaseId(),
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

  async function createFirstRecord(table: string, data: Record<string, string>) {
    const databaseId = selectedDatabaseId();
    if (!databaseId || selectedDefinition()?.archived) throw new Error("Select an active database first.");
    const result = await sendDatabaseRecord(table, data, databaseId);
    recordLocalMessage({
      id: result.message_id,
      type: "database_record",
      timestamp: new Date().toISOString(),
      content: result.content,
    });
    setActiveTable(table);
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
    if (selectedDefinition()?.archived) return;
    setEditError(null);
    setEditingCell({ rowId: row.id, col });
    setEditingValue(formatEditableValue(row.data[col]));
  }

  function selectDatabase(databaseId: string) {
    const definition = definitions().find((item) => item.databaseId === databaseId);
    setSelectedDatabaseId(databaseId);
    setActiveTable(null);
    setTableName(definition?.defaultTable ?? "");
    setSelectedRowIds([]);
    cancelEditingCell();
  }

  async function createDatabase(input: DatabaseCreateInput) {
    if (databaseCreateBusy()) return;
    const accountId = props.bootstrap?.user.id?.trim();
    if (!accountId) { setDatabaseCreateError("Sign in again before creating a database."); return; }
    setDatabaseCreateBusy(true);
    setDatabaseCreateError("");
    try {
      const result = await sendDatabaseDefinition({
        accountId,
        name: input.name,
        defaultTable: input.defaultTable,
        profileId: input.profileId,
        weddingPlanId: input.weddingPlanId,
      });
      recordLocalMessage({ id: result.message_id, type: "database_definition", timestamp: new Date().toISOString(), content: result.content });
      setSelectedDatabaseId(result.content.database_id);
      setActiveTable(null);
      setTableName(result.content.default_table);
      setShowDatabaseCreate(false);
    } catch (error) {
      setDatabaseCreateError(error instanceof Error ? error.message : "This database could not be created.");
    } finally {
      setDatabaseCreateBusy(false);
    }
  }

  async function commitDatabaseName() {
    const definition = selectedDefinition();
    const nextName = databaseName().trim();
    if (!definition || definition.legacy || definition.archived || !nextName || nextName === definition.name) {
      setDatabaseName(definition?.name ?? "");
      return;
    }
    const accountId = props.bootstrap?.user.id?.trim();
    if (!accountId) return;
    try {
      const result = await sendDatabaseDefinition({
        accountId,
        databaseId: definition.databaseId,
        name: nextName,
        defaultTable: definition.defaultTable,
        profileId: definition.profileId,
        weddingPlanId: definition.weddingPlanId,
        revision: definition.revision + 1,
      });
      recordLocalMessage({ id: result.message_id, type: "database_definition", timestamp: new Date().toISOString(), content: result.content });
    } catch (error) {
      setDatabaseName(definition.name);
      setEditError(buildDatabaseViewFailureReceipt("Rename database", error instanceof Error ? error.message : "Could not rename this database."));
    }
  }

  async function confirmLifecycleChange() {
    const definition = selectedDefinition();
    if (!definition || definition.legacy || lifecycleBusy()) return;
    setLifecycleBusy(true);
    try {
      const result = await sendDatabaseArchive({
        databaseId: definition.databaseId,
        archived: !definition.archived,
        revision: definition.archiveRevision + 1,
      });
      recordLocalMessage({ id: result.message_id, type: "database_archive", timestamp: new Date().toISOString(), content: result.content });
      setShowLifecycleConfirm(false);
    } catch (error) {
      setEditError(buildDatabaseViewFailureReceipt(definition.archived ? "Restore database" : "Archive database", error instanceof Error ? error.message : "Could not change this database."));
    } finally {
      setLifecycleBusy(false);
    }
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
      const result = await sendDatabaseRecordRevision({
        databaseId: row.databaseId,
        table: row.table,
        targetRecordId: row.id,
        baseRevision: row.revision,
        patch: { [col]: nextValue },
      });
      recordLocalMessage({
        id: result.message_id,
        type: "note:ledger_update",
        timestamp: new Date().toISOString(),
        content: result.content,
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
      <DatabaseHeader
        definitions={definitions()}
        selectedDatabaseId={selectedDatabaseId()}
        name={databaseName()}
        densityMode={densityMode()}
        fullscreen={fullscreen()}
        onSelect={selectDatabase}
        onNameInput={setDatabaseName}
        onNameCommit={() => void commitDatabaseName()}
        onDensityChange={setDensityMode}
        onToggleFullscreen={() => setFullscreen((value) => !value)}
        onNewDatabase={() => { setDatabaseCreateError(""); setShowDatabaseCreate(true); }}
        onNewRecord={() => setShowAdd(true)}
        onNewTable={() => { setActiveTable(null); setTableName(""); setGhostHeaders([...DEFAULT_HEADERS]); }}
        onNewField={() => {
          const label = prompt("Field name:")?.trim();
          const table = activeTable() ?? tableName().trim() ?? tables()[0];
          const databaseId = selectedDatabaseId();
          if (!label || !databaseId) return;
          if (!table) { setGhostHeaders((headers) => [...headers, label]); return; }
          const key = label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `field_${Date.now()}`;
          void sendDatabaseSchema(table, { key, label }, databaseId)
            .then((result) => recordLocalMessage({ id: result.message_id, type: "database_schema_update", timestamp: new Date().toISOString(), content: result.content }))
            .catch((error) => setEditError(buildDatabaseViewFailureReceipt("Add field", error instanceof Error ? error.message : "Could not add this field.")));
        }}
        onImport={() => setShowImport(true)}
        onArchiveToggle={() => setShowLifecycleConfirm(true)}
      />

      {/* Table filter pills */}
      <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-medium text-on-surface-variant">Tables</span>
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
          <button type="button" disabled={selectedDefinition()?.archived} onClick={() => { setActiveTable(null); setTableName(""); setGhostHeaders([...DEFAULT_HEADERS]); }} class="rounded-full border border-dashed border-primary/35 bg-primary/5 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/10 disabled:opacity-45">
            + New table
          </button>
      </div>

      {/* Grid */}
      <Show
        when={visibleRecords().length > 0}
        fallback={
          <GhostGrid
            readonly={selectedDefinition()?.archived}
            headers={ghostHeaders()}
            tableName={tableName()}
            onHeaderEdit={(i, val) => setGhostHeaders((prev) => prev.map((h, idx) => idx === i ? (val || h) : h))}
            onTableNameEdit={(val) => setTableName(val)}
            onCreate={createFirstRecord}
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
                        disabled={selectedDefinition()?.archived}
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

      <Show when={showAdd()}>
        <DatabaseAddRecordDialog
          databaseId={selectedDatabaseId() ?? "database:legacy"}
          tables={tables()}
          onClose={() => setShowAdd(false)}
          onCreated={recordLocalMessage}
        />
      </Show>

      <Show when={showImport()}>
        <DatabaseImportDialog
          databaseId={selectedDatabaseId() ?? "database:legacy"}
          defaultTable={(activeTable() ?? tableName()) || selectedDefinition()?.defaultTable || "imported"}
          onClose={() => setShowImport(false)}
          onCreated={(messages) => messages.forEach(recordLocalMessage)}
        />
      </Show>

      <DatabaseCreateDialog
        open={showDatabaseCreate()}
        profiles={profiles()}
        busy={databaseCreateBusy()}
        error={databaseCreateError()}
        onCancel={() => setShowDatabaseCreate(false)}
        onCreate={(input) => void createDatabase(input)}
      />
      <DatabaseLifecycleDialog
        open={showLifecycleConfirm()}
        databaseName={selectedDefinition()?.name ?? "this database"}
        restoring={selectedDefinition()?.archived ?? false}
        busy={lifecycleBusy()}
        onCancel={() => setShowLifecycleConfirm(false)}
        onConfirm={() => void confirmLifecycleChange()}
      />
    </div>
  );
}
