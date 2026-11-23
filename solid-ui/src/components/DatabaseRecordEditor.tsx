// @locs-version: 1.0
import { createMemo, createSignal, For, Show } from "solid-js";

import { buildDatabaseViewFailureReceipt, type DatabaseViewFailureReceipt } from "@/lib/databaseViewFailureState";
import { databaseImportPreviewRows, databaseImportRows } from "@/lib/databaseViewState";
import { sendDatabaseRecord } from "@/lib/databaseMessageCommands";
import { parseJsonValue } from "@/lib/jsonParseState";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import { analyzeDatabaseImportInput, analyzeDatabaseRecordContent } from "@/lib/structuredTextInputState";

export type DatabaseEditorMessage = {
  id: string;
  type: string;
  content: unknown;
  timestamp: string;
};

function FailureMessage(props: { error: string | DatabaseViewFailureReceipt }) {
  return typeof props.error === "string" ? <p class="mt-2 text-xs text-error">{props.error}</p> : (
    <div class="mt-2 rounded-xl border border-amber-200/60 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
      <p class="font-medium">{props.error.title}</p>
      <p class="mt-0.5">{props.error.summary}</p>
      <p class="mt-0.5 opacity-80">{props.error.nextStep}</p>
    </div>
  );
}

export function DatabaseImportDialog(props: {
  databaseId: string;
  defaultTable: string;
  onClose: () => void;
  onCreated: (messages: DatabaseEditorMessage[]) => void;
}) {
  const [raw, setRaw] = createSignal("");
  const [table, setTable] = createSignal(props.defaultTable || "imported");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | DatabaseViewFailureReceipt>("");
  const [preview, setPreview] = createSignal<string[][]>([]);
  const importState = createMemo(() => analyzeDatabaseImportInput(raw()));
  const handlePaste = (text: string) => {
    setError(""); setRaw(text);
    try {
      const rows = databaseImportRows(text);
      setPreview(rows.length > 0 ? databaseImportPreviewRows(rows) : []);
    } catch { setPreview([]); }
  };
  const requestClose = () => { if (!busy()) props.onClose(); };
  const doImport = async () => {
    if (busy()) return;
    if (importState().format === "invalid-json") { setError(importState().error ?? "Fix the JSON syntax before importing."); return; }
    const rows = databaseImportRows(raw());
    if (rows.length === 0) { setError("No records found — paste CSV or JSON."); return; }
    setBusy(true);
    try {
      const timestamp = new Date().toISOString();
      const messages: DatabaseEditorMessage[] = [];
      for (const row of rows) {
        const result = await sendDatabaseRecord(table(), row, props.databaseId);
        messages.push({ id: result.message_id, type: "database_record", timestamp, content: result.content });
      }
      props.onCreated(messages); props.onClose();
    } catch (cause) {
      setError(buildDatabaseViewFailureReceipt("Import records", cause instanceof Error ? cause.message : "Import failed."));
    } finally { setBusy(false); }
  };
  return (
    <div class="fixed inset-0 z-[200] flex items-center justify-center bg-on-surface/30 p-3 backdrop-blur-sm" onClick={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <div class="w-full max-w-lg rounded-3xl border border-white/45 bg-white/96 p-5 shadow-panel sm:p-6">
        <h2 class="font-mono text-[10px] uppercase tracking-[0.2em] text-outline">Import data</h2>
        <input type="text" aria-label="Table name" value={table()} onInput={(event) => { setError(""); setTable(event.currentTarget.value); }} class="mb-3 mt-4 min-h-11 w-full rounded-xl border border-white/40 bg-white/60 px-3 text-sm outline-none focus:border-primary/50" />
        <textarea rows={6} aria-label="CSV or JSON records" placeholder={"Paste CSV (first row = headers) or a JSON array"} value={raw()} onInput={(event) => handlePaste(event.currentTarget.value)} onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !busy()) { event.preventDefault(); recordShortcutUse("form_submit"); void doImport(); }
          if (event.key === "Escape" && !busy()) { event.preventDefault(); requestClose(); }
        }} class={`w-full resize-none rounded-xl bg-white/60 px-3 py-2 font-mono text-xs text-on-surface outline-none ${importState().format === "invalid-json" ? "border border-error/50" : "border border-white/40 focus:border-primary/50"}`} />
        <p class={`mt-1 text-[10px] ${importState().format === "invalid-json" ? "text-error" : "text-on-surface-variant/60"}`}>{importState().summary}{importState().error ? ` - ${importState().error}` : " - Press Ctrl/Cmd+Enter to import."}</p>
        <Show when={preview().length > 1}>
          <div class="mt-2 overflow-x-auto rounded-xl border border-primary/15 bg-primary/4">
            <table class="w-full text-[11px]"><thead><tr>{preview()[0].map((heading) => <th class="px-2 py-1 text-left">{heading}</th>)}</tr></thead><tbody>{preview().slice(1).map((row) => <tr>{row.map((cell) => <td class="px-2 py-1">{cell || "—"}</td>)}</tr>)}</tbody></table>
          </div>
        </Show>
        <Show when={error()}>{(current) => <FailureMessage error={current()} />}</Show>
        <div class="mt-4 grid grid-cols-2 gap-3">
          <button type="button" disabled={busy()} onClick={requestClose} class="min-h-12 rounded-xl border-2 border-primary text-base font-bold text-primary">Cancel</button>
          <button type="button" disabled={busy() || !raw().trim() || importState().format === "invalid-json"} onClick={() => void doImport()} class="min-h-12 rounded-xl bg-primary text-base font-bold text-white disabled:opacity-50">{busy() ? "Importing…" : "Import rows"}</button>
        </div>
      </div>
    </div>
  );
}

export function DatabaseAddRecordDialog(props: {
  databaseId: string;
  tables: string[];
  onClose: () => void;
  onCreated: (message: DatabaseEditorMessage) => void;
}) {
  const [table, setTable] = createSignal(props.tables[0] ?? "");
  const [newTable, setNewTable] = createSignal("");
  const [content, setContent] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | DatabaseViewFailureReceipt>("");
  const contentState = createMemo(() => analyzeDatabaseRecordContent(content()));
  const requestClose = () => { if (!busy()) props.onClose(); };
  const save = async () => {
    if (busy()) return;
    const targetTable = newTable().trim() || table();
    if (!targetTable) { setError("Table name required."); return; }
    if (contentState().format === "invalid-json") { setError(contentState().error ?? "Fix the JSON syntax before saving."); return; }
    setBusy(true);
    try {
      const parsed = parseJsonValue(content());
      const result = await sendDatabaseRecord(targetTable, parsed.ok ? parsed.value : content(), props.databaseId);
      props.onCreated({ id: result.message_id, type: "database_record", timestamp: new Date().toISOString(), content: result.content });
      props.onClose();
    } catch (cause) {
      setError(buildDatabaseViewFailureReceipt("Save record", cause instanceof Error ? cause.message : "Failed to save record."));
    } finally { setBusy(false); }
  };
  return (
    <div class="fixed inset-0 z-[200] flex items-center justify-center bg-on-surface/30 p-3 backdrop-blur-sm" onClick={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <div class="w-full max-w-sm rounded-3xl border border-white/45 bg-white/96 p-5 shadow-panel sm:p-6">
        <h2 class="font-mono text-[10px] uppercase tracking-[0.2em] text-outline">New record</h2>
        <div class="mt-4 space-y-3">
          <Show when={props.tables.length > 0}><select aria-label="Existing table" value={table()} onChange={(event) => setTable(event.currentTarget.value)} class="min-h-11 w-full rounded-xl border border-white/40 bg-white/60 px-3 text-sm"><For each={props.tables}>{(item) => <option value={item}>{item}</option>}</For></select></Show>
          <input aria-label="New table name" placeholder={props.tables.length > 0 ? "Or create a new table" : "Table name"} value={newTable()} onInput={(event) => setNewTable(event.currentTarget.value)} class="min-h-11 w-full rounded-xl border border-white/40 bg-white/60 px-3 text-sm" />
          <textarea rows={4} aria-label="Record data" placeholder={'Record data (JSON or plain text)'} value={content()} onInput={(event) => setContent(event.currentTarget.value)} onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void save(); }
            if (event.key === "Escape" && !busy()) { event.preventDefault(); requestClose(); }
          }} class={`w-full resize-none rounded-xl bg-white/60 px-3 py-2 font-mono text-sm ${contentState().format === "invalid-json" ? "border border-error/50" : "border border-white/40"}`} />
          <p class={`text-[10px] ${contentState().format === "invalid-json" ? "text-error" : "text-on-surface-variant/60"}`}>{contentState().summary}{contentState().error ? ` - ${contentState().error}` : " - Press Ctrl/Cmd+Enter to save."}</p>
          <Show when={error()}>{(current) => <FailureMessage error={current()} />}</Show>
          <div class="grid grid-cols-2 gap-3">
            <button type="button" disabled={busy()} onClick={requestClose} class="min-h-12 rounded-xl border-2 border-primary text-base font-bold text-primary">Cancel</button>
            <button type="button" disabled={busy() || contentState().format === "invalid-json"} onClick={() => void save()} class="min-h-12 rounded-xl bg-primary text-base font-bold text-white disabled:opacity-50">{busy() ? "Saving…" : "Save record"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
