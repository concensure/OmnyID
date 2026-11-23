// @locs-version: 1.0
import { createSignal, For, Show } from "solid-js";
import { recordShortcutUse } from "@/lib/shortcutRecency";

export function DatabaseGhostGrid(props: {
  readonly?: boolean;
  headers: string[];
  tableName: string;
  onHeaderEdit: (index: number, value: string) => void;
  onTableNameEdit: (value: string) => void;
  onCreate: (table: string, data: Record<string, string>) => Promise<void>;
}) {
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
    setSaving(true); setError("");
    try { await props.onCreate(table, data); setDraft({}); }
    catch { setError("This row could not be saved. Please try again."); }
    finally { setSaving(false); }
  };
  return <div class="animate-fade-in">
    <div class="mb-3 flex items-center gap-2">
      <input value={props.tableName || ""} disabled={props.readonly} onInput={(event) => props.onTableNameEdit(event.currentTarget.value)} placeholder="Unnamed Table" class="rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-on-surface/60 outline-none placeholder:text-on-surface-variant/35 focus:border-primary/25 focus:bg-white/30 focus:text-on-surface transition" title="Click to name this table" />
      <span class="text-[10px] text-on-surface-variant/35 italic">Click any header or cell to begin</span>
    </div>
    <div class="overflow-x-auto rounded-2xl border border-white/40 bg-white/30">
      <table class="w-full text-xs">
        <thead><tr class="border-b border-white/30 bg-white/50"><For each={props.headers}>{(header, index) => <th class="px-3 py-2 text-left"><input value={header} disabled={props.readonly} onBlur={(event) => props.onHeaderEdit(index(), event.currentTarget.value)} onKeyDown={(event) => {
          if (event.key === "Enter") { recordShortcutUse("form_submit"); event.currentTarget.blur(); }
          if (event.key === "Escape") { recordShortcutUse("form_cancel"); event.currentTarget.blur(); }
        }} class="w-full bg-transparent font-semibold text-on-surface/60 outline-none focus:text-on-surface focus:border-b focus:border-primary/40 transition" /></th>}</For></tr></thead>
        <tbody>
          <tr class="border-b border-primary/15 bg-primary/[0.025]"><For each={props.headers}>{(_, index) => <td class="px-3 py-2"><input value={draft()[`${index()}`] ?? ""} disabled={props.readonly} onInput={(event) => setDraft((current) => ({ ...current, [`${index()}`]: event.currentTarget.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createRow(); } }} placeholder="Enter value" class="w-full min-w-24 rounded-md border border-transparent bg-white/60 px-2 py-1.5 text-on-surface outline-none placeholder:text-on-surface-variant/40 focus:border-primary/35" /></td>}</For></tr>
          <tr class="border-b border-white/20"><td colSpan={props.headers.length} class="px-3 py-2"><div class="flex items-center gap-3"><button type="button" disabled={saving() || props.readonly} onClick={() => void createRow()} class="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary/80 disabled:opacity-60">{saving() ? "Saving…" : "Save row"}</button><Show when={error()}><span class="text-xs text-red-600">{error()}</span></Show></div></td></tr>
          {Array.from({ length: 3 }, (_, row) => <tr class="border-b border-white/20 last:border-0"><For each={props.headers}>{(_, column) => <td class="px-3 py-2"><div class={`h-3 rounded-full bg-on-surface/6 ${column() === 0 ? "w-24" : column() === 3 ? "w-12" : "w-16"}`} /></td>}</For></tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}
