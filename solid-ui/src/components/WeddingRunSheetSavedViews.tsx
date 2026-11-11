// @locs-version: 1.0
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import type { WeddingRunSheetPresentedRow } from "@/lib/weddingRunSheetEditingState";
import { sendDatabaseSavedView, sendDatabaseViewExportIntent } from "@/lib/databaseMessageCommands";
import {
  buildWeddingRunSheetSavedViewContent,
  projectWeddingRunSheetSavedView,
  weddingRunSheetSavedViewPreset,
  weddingRunSheetSavedViewPresets,
  weddingRunSheetSavedViewValue,
} from "@/lib/weddingRunSheetSavedViewState";
import "@/components/weddingRunSheetPrint.css";
import { WeddingRunSheetShareControls } from "@/components/WeddingRunSheetShareControls";

type SavedViewMessage = {
  id: string;
  type: string;
  timestamp: string;
  content: Record<string, unknown>;
};

const labels: Record<string, string> = {
  start_at: "Start", end_at: "End", title: "Item", location: "Place", owner_refs: "Owner",
  participant_refs: "Participants", status: "Status", visibility: "Shared with", notes: "Notes",
  private_notes: "Private notes", dependency_refs: "Depends on", buffer_before_minutes: "Buffer before",
  buffer_after_minutes: "Buffer after",
};

export function WeddingRunSheetSavedViews(props: {
  databaseId: string;
  weddingPlanId: string;
  rows: WeddingRunSheetPresentedRow[];
  archived: boolean;
  onMessage: (message: SavedViewMessage) => void;
  onFocusRecord?: (recordId: string) => void;
}) {
  const [selectedId, setSelectedId] = createSignal("master");
  const [previewOpen, setPreviewOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  let closeButton: HTMLButtonElement | undefined;
  const preset = createMemo(() => weddingRunSheetSavedViewPreset(selectedId()));
  const projected = createMemo(() => projectWeddingRunSheetSavedView(props.rows, preset()));
  const contacts = createMemo(() => Array.from(new Set(projected().flatMap((row) => {
    const value = row.values.owner_refs;
    return Array.isArray(value) ? value.map(String) : [];
  }))));
  const masterSequence = createMemo(() => projectWeddingRunSheetSavedView(props.rows, weddingRunSheetSavedViewPreset("master")).slice(0, 8));
  const sequenceDay = createMemo(() => {
    const start = masterSequence()[0]?.values.start_at;
    if (typeof start !== "string" || !start) return "Master run sheet";
    const parsed = new Date(start);
    return Number.isNaN(parsed.getTime()) ? "Master run sheet" : `${new Intl.DateTimeFormat("en-AU", { weekday: "long" }).format(parsed)} · Master run sheet`;
  });
  const timeLabel = (value: unknown): string => {
    if (typeof value !== "string" || !value) return "Time needed";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit" }).format(parsed);
  };
  const rowText = (value: unknown): string => Array.isArray(value) ? value.map(String).join(" · ") : typeof value === "string" || typeof value === "number" ? String(value) : "";

  createEffect(() => {
    if (previewOpen()) queueMicrotask(() => closeButton?.focus());
  });

  function closePreview() {
    setPreviewOpen(false);
    queueMicrotask(() => document.getElementById("wedding-runsheet-preview-view")?.focus());
  }

  async function saveView() {
    if (busy() || props.archived) return;
    setBusy(true); setNotice("");
    try {
      const content = buildWeddingRunSheetSavedViewContent({ databaseId: props.databaseId, preset: preset() });
      const result = await sendDatabaseSavedView({
        databaseId: content.database_id, viewId: content.view_id, name: content.name,
        revision: content.revision, profileRevision: content.profile_revision, columns: content.columns,
        sort: content.sort, filters: content.filters, fieldPolicy: content.field_policy,
      });
      props.onMessage({ id: result.message_id, type: "database_saved_view", timestamp: new Date().toISOString(), content: result.content as unknown as Record<string, unknown> });
      setNotice(`${preset().name} view saved.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "This view could not be saved.");
    } finally { setBusy(false); }
  }

  async function printPreview() {
    if (busy()) return;
    setBusy(true); setNotice("");
    try {
      await sendDatabaseViewExportIntent({
        databaseId: props.databaseId,
        viewId: `wedding-runsheet-${preset().id}`,
        recordIds: projected().map((row) => row.sourceRecordId),
        columns: preset().columns,
      });
      document.body.classList.add("omnyid-runsheet-printing");
      const cleanup = () => document.body.classList.remove("omnyid-runsheet-printing");
      window.addEventListener("afterprint", cleanup, { once: true });
      window.print();
      window.setTimeout(cleanup, 2_000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The print record could not be saved. Nothing was printed.");
    } finally { setBusy(false); }
  }

  return <section class="rounded-xl border border-wedding-border bg-wedding-card p-4" aria-label="Run-sheet saved views">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <label class="text-xs font-medium text-wedding-muted">
        Role view
        <select value={selectedId()} onChange={(event) => { setSelectedId(event.currentTarget.value); setNotice(""); }} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 text-sm text-wedding-text lg:w-52">
          <For each={weddingRunSheetSavedViewPresets}>{(item) => <option value={item.id}>{item.name}</option>}</For>
        </select>
      </label>
      <div class="grid grid-cols-2 gap-2">
        <button id="wedding-runsheet-preview-view" type="button" onClick={() => setPreviewOpen(true)} class="min-h-11 rounded-lg border border-wedding-action px-4 text-sm font-semibold text-wedding-action">Preview</button>
        <button type="button" disabled={busy() || props.archived} onClick={() => void saveView()} class="min-h-11 rounded-lg bg-wedding-action px-4 text-sm font-semibold text-white disabled:opacity-50">{busy() ? "Saving…" : "Save view"}</button>
      </div>
    </div>
    <p class="mt-2 text-xs leading-5 text-wedding-muted">{preset().description} Previewing or saving a view does not send it to anyone.</p>
    <p class="mt-1 text-xs text-wedding-muted">Hosted links remain off unless the reviewed server flag is enabled. You can always preview or print safely.</p>
    <Show when={notice()}><p role="status" class="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-wedding-text">{notice()}</p></Show>

    <section class="mt-4 overflow-hidden rounded-2xl border border-wedding-border bg-white shadow-sm" aria-label="Living master run sheet">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-wedding-border px-4 py-4 sm:px-5">
        <div><p class="text-xs font-bold uppercase tracking-[0.14em] text-wedding-action">Run-sheet preview</p><h3 class="mt-1 font-display text-xl font-bold text-wedding-text">{sequenceDay()}</h3></div>
        <span class="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-sky-900">Source-linked</span>
      </div>
      <Show when={masterSequence().length > 0} fallback={<div class="p-5"><p class="text-sm font-semibold text-wedding-text">Your living sequence will appear here.</p><p class="mt-1 text-sm leading-6 text-wedding-muted">Add a day-of item or confirm a task, booking or vendor arrival. The existing projector will bring the same underlying fact into this run sheet.</p></div>}>
        <ol class="divide-y divide-dashed divide-wedding-border px-4 sm:px-5">
          <For each={masterSequence()}>{(row) => {
            const title = () => rowText(row.values.title) || "Wedding-day item";
            const detail = () => rowText(row.values.notes) || rowText(row.values.location) || "Details to confirm";
            const owner = () => rowText(row.values.owner_refs) || "Owner needed";
            return <li class="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-3 py-4 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-start">
              <time class="font-bold text-wedding-action">{timeLabel(row.values.start_at)}</time>
              <div class="min-w-0"><p class="break-words text-sm font-bold text-wedding-text">{title()}</p><p class="mt-1 break-words text-sm leading-5 text-wedding-muted">{detail()}</p><button type="button" class="mt-2 text-left text-xs font-semibold text-sky-800 underline decoration-sky-300 underline-offset-2" onClick={() => props.onFocusRecord?.(row.sourceRecordId)}>View source-linked row and revisions</button></div>
              <span class="col-start-2 w-fit rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-700 sm:col-start-auto">{owner()}</span>
            </li>;
          }}</For>
        </ol>
        <Show when={projectWeddingRunSheetSavedView(props.rows, weddingRunSheetSavedViewPreset("master")).length > masterSequence().length}><p class="border-t border-wedding-border px-5 py-3 text-xs text-wedding-muted">Showing the next {masterSequence().length} items. The editable run-sheet table below contains the full sequence.</p></Show>
      </Show>
    </section>

    <Show when={previewOpen()}><div data-runsheet-print-shell class="fixed inset-0 z-[230] flex items-end bg-on-surface/30 sm:items-center sm:justify-center sm:p-4">
      <div data-runsheet-print role="dialog" aria-modal="true" aria-labelledby="runsheet-preview-title" onKeyDown={(event) => { if (event.key === "Escape" && !busy()) closePreview(); }} class="max-h-[94vh] w-full overflow-auto rounded-t-2xl bg-white p-5 shadow-panel sm:max-w-5xl sm:rounded-2xl sm:p-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 id="runsheet-preview-title" class="text-xl font-bold text-wedding-text">{preset().name} run sheet</h2>
            <p class="mt-1 text-sm text-wedding-muted">Exact preview · {projected().length} item{projected().length === 1 ? "" : "s"}</p>
          </div>
          <button ref={closeButton} data-runsheet-no-print type="button" onClick={closePreview} class="min-h-11 rounded-lg border border-wedding-action px-4 font-semibold text-wedding-action">Close</button>
        </div>
        <div class="mt-4 rounded-lg border border-wedding-border p-3">
          <p class="text-xs font-bold uppercase tracking-wide text-wedding-muted">Key contacts</p>
          <p class="mt-1 text-sm text-wedding-text">{contacts().length ? contacts().join(" · ") : "No owners assigned"}</p>
        </div>
        <div class="mt-4 overflow-x-auto" role="region" tabIndex={0} aria-label="Exact run-sheet view preview; scroll horizontally for more fields">
          <table class="w-full min-w-[44rem] border-collapse text-left text-xs">
            <thead><tr class="border-b-2 border-wedding-text"><For each={preset().columns.filter((field) => !preset().fieldPolicy.exclude_fields.includes(field))}>{(field) => <th class="p-2 font-bold text-wedding-text">{labels[field] ?? field}</th>}</For></tr></thead>
            <tbody><For each={projected()}>{(row) => <tr class="border-b border-wedding-border"><For each={Object.keys(row.values)}>{(field) => <td class="p-2 align-top text-wedding-text">{weddingRunSheetSavedViewValue(row.values[field])}</td>}</For></tr>}</For></tbody>
          </table>
        </div>
        <p class="mt-4 text-xs leading-5 text-wedding-muted">Private notes and couple contact details are excluded from non-master views. Printed or downloaded copies cannot be recalled.</p>
        <div data-runsheet-no-print><WeddingRunSheetShareControls databaseId={props.databaseId} weddingPlanId={props.weddingPlanId} preset={preset()} recordIds={projected().map((row) => row.sourceRecordId)} archived={props.archived} /></div>
        <div data-runsheet-no-print class="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={closePreview} class="min-h-12 rounded-lg border-2 border-wedding-action font-bold text-wedding-action">Cancel</button>
          <button type="button" disabled={busy()} onClick={() => void printPreview()} class="min-h-12 rounded-lg bg-wedding-action font-bold text-white disabled:opacity-50">Print this preview</button>
        </div>
      </div>
    </div></Show>
  </section>;
}
