// @locs-version: 1.0
import { createSignal, For, Show } from "solid-js";
import type { DatabaseViewRecord } from "@/lib/databaseViewState";
import {
  weddingRunSheetDays,
  weddingRunSheetTimeLabel,
  type WeddingRunSheetFilters,
  type WeddingRunSheetPresentedRow,
  type WeddingRunSheetTimeChangeReview,
} from "@/lib/weddingRunSheetEditingState";

export function WeddingRunSheetProfileToolbar(props: {
  rows: WeddingRunSheetPresentedRow[];
  visibleRows: WeddingRunSheetPresentedRow[];
  filters: WeddingRunSheetFilters;
  archived: boolean;
  onFilters: (filters: WeddingRunSheetFilters) => void;
  onAddItem: () => void;
}) {
  return (
    <section class="space-y-3 rounded-xl border border-wedding-border bg-wedding-card p-4" aria-label="Run-sheet controls">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-sm font-semibold text-wedding-text">Wedding-day schedule</p>
          <p class="mt-0.5 text-xs leading-5 text-wedding-muted">
            {props.visibleRows.length} of {props.rows.length} items, ordered by effective time.
          </p>
        </div>
        <button type="button" disabled={props.archived} onClick={props.onAddItem} class="min-h-11 rounded-lg bg-wedding-action px-4 text-sm font-semibold text-white disabled:opacity-50">
          Add run-sheet item
        </button>
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        <label class="text-xs font-medium text-wedding-muted">
          Day
          <select value={props.filters.day} onChange={(event) => props.onFilters({ ...props.filters, day: event.currentTarget.value })} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 text-sm text-wedding-text">
            <option value="all">All days</option>
            <For each={weddingRunSheetDays(props.rows)}>{(day) => <option value={day}>{day === "unscheduled" ? "Time needed" : day}</option>}</For>
          </select>
        </label>
        <label class="text-xs font-medium text-wedding-muted">
          Status
          <select value={props.filters.status} onChange={(event) => props.onFilters({ ...props.filters, status: event.currentTarget.value as WeddingRunSheetFilters["status"] })} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 text-sm text-wedding-text">
            <option value="all">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="proposed">Proposed</option>
            <option value="needs-confirmation">Needs confirmation</option>
          </select>
        </label>
        <label class="flex min-h-11 items-center gap-3 self-end rounded-lg border border-wedding-border bg-white px-3 text-sm text-wedding-text">
          <input type="checkbox" checked={props.filters.conflictsOnly} onChange={(event) => props.onFilters({ ...props.filters, conflictsOnly: event.currentTarget.checked })} class="h-4 w-4 rounded border-wedding-border text-wedding-action" />
          Needs attention only
        </label>
      </div>
      <Show when={props.visibleRows.length > 0}>
        <div class="overflow-x-auto pb-1" aria-label="Run-sheet time rail">
          <ol class="flex min-w-max items-start gap-2">
            <For each={props.visibleRows.slice(0, 12)}>{(item) => (
              <li class={`w-36 rounded-lg border px-3 py-2 ${item.conflictCodes.length ? "border-amber-300 bg-amber-50" : "border-wedding-border bg-white"}`}>
                <p class="text-[10px] font-semibold uppercase tracking-wide text-wedding-muted">{weddingRunSheetTimeLabel(item.effectiveStartAt)}</p>
                <p class="mt-1 line-clamp-2 text-xs font-semibold text-wedding-text">{String(item.record.data.title || "Run-sheet item")}</p>
              </li>
            )}</For>
          </ol>
        </div>
      </Show>
    </section>
  );
}

function localDateTimeValue(value: unknown): string {
  const parsed = new Date(String(value ?? ""));
  if (Number.isNaN(parsed.getTime())) return "";
  const offset = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

export function WeddingRunSheetMobileCards(props: {
  rows: WeddingRunSheetPresentedRow[];
  archived: boolean;
  onTimeChange: (record: DatabaseViewRecord, nextValue: string) => void;
  onShift: (record: DatabaseViewRecord, minutes: number) => void;
}) {
  return (
    <div class="space-y-3 md:hidden" aria-label="Run-sheet items">
      <For each={props.rows}>{(item) => (
        <article class={`rounded-xl border bg-white p-4 ${item.conflictCodes.length ? "border-amber-300" : "border-wedding-border"}`}>
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-semibold text-wedding-text">{String(item.record.data.title || "Run-sheet item")}</p>
              <p class="mt-1 text-xs text-wedding-muted">{weddingRunSheetTimeLabel(item.effectiveStartAt)}</p>
            </div>
            <span class="rounded-full border border-wedding-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-wedding-muted">{item.status}</span>
          </div>
          <div class="mt-3 grid grid-cols-2 gap-2 text-xs text-wedding-muted">
            <p><span class="font-semibold text-wedding-text">Place:</span> {String(item.record.data.location || "Not set")}</p>
            <p><span class="font-semibold text-wedding-text">Owner:</span> {Array.isArray(item.record.data.owner_refs) && item.record.data.owner_refs.length ? item.record.data.owner_refs.join(", ") : "Not assigned"}</p>
            <p><span class="font-semibold text-wedding-text">Shared:</span> {Array.isArray(item.record.data.visibility) ? item.record.data.visibility.join(", ") : "Master only"}</p>
            <p><span class="font-semibold text-wedding-text">Source:</span> {item.overrideState === "runsheet_only" ? "Run-sheet override" : item.sourceLinked ? "Wedding plan" : "Manual item"}</p>
          </div>
          <Show when={item.conflictCodes.length > 0}>
            <p class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">Needs attention: {item.conflictCodes.join(", ").replaceAll("_", " ")}</p>
          </Show>
          <label class="mt-3 block text-xs font-medium text-wedding-muted">
            Start time
            <input type="datetime-local" disabled={props.archived} value={localDateTimeValue(item.effectiveStartAt)} onChange={(event) => { if (event.currentTarget.value) props.onTimeChange(item.record, new Date(event.currentTarget.value).toISOString()); }} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border px-3 text-sm text-wedding-text disabled:opacity-60" />
          </label>
          <div class="mt-3 grid grid-cols-2 gap-3">
            <button type="button" disabled={props.archived || !item.effectiveStartAt} onClick={() => props.onShift(item.record, -15)} class="min-h-11 rounded-lg border border-wedding-action px-3 text-sm font-semibold text-wedding-action disabled:opacity-45">15 min earlier</button>
            <button type="button" disabled={props.archived || !item.effectiveStartAt} onClick={() => props.onShift(item.record, 15)} class="min-h-11 rounded-lg border border-wedding-action px-3 text-sm font-semibold text-wedding-action disabled:opacity-45">15 min later</button>
          </div>
        </article>
      )}</For>
    </div>
  );
}

export function WeddingRunSheetItemDialog(props: {
  open: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (input: { title: string; startAt: string | null; location: string; ownerRef: string; visibility: string[] }) => void;
}) {
  const [title, setTitle] = createSignal("");
  const [startAt, setStartAt] = createSignal("");
  const [location, setLocation] = createSignal("");
  const [ownerRef, setOwnerRef] = createSignal("");
  const [vendorVisible, setVendorVisible] = createSignal(false);
  return <Show when={props.open}><div class="fixed inset-0 z-[210] flex items-end bg-on-surface/30 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-3" onClick={(event) => { if (event.target === event.currentTarget && !props.busy) props.onClose(); }}>
    <div class="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-panel sm:max-w-md sm:rounded-2xl sm:p-6">
      <h2 class="text-lg font-bold text-wedding-text">Add run-sheet item</h2>
      <p class="mt-1 text-sm text-wedding-muted">Manual items stay yours and are not overwritten by automatic updates.</p>
      <div class="mt-4 space-y-3">
        <label class="block text-sm font-medium text-wedding-text">Item name<input value={title()} onInput={(event) => setTitle(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border px-3" /></label>
        <label class="block text-sm font-medium text-wedding-text">Start time<input type="datetime-local" value={startAt()} onInput={(event) => setStartAt(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border px-3" /></label>
        <label class="block text-sm font-medium text-wedding-text">Place<input value={location()} onInput={(event) => setLocation(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border px-3" /></label>
        <label class="block text-sm font-medium text-wedding-text">Owner or contact<input value={ownerRef()} onInput={(event) => setOwnerRef(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border px-3" /></label>
        <label class="flex min-h-11 items-center gap-3 rounded-lg border border-wedding-border px-3 text-sm text-wedding-text"><input type="checkbox" checked={vendorVisible()} onChange={(event) => setVendorVisible(event.currentTarget.checked)} /> Include in vendor view</label>
      </div>
      <Show when={props.error}><p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{props.error}</p></Show>
      <div class="mt-5 grid grid-cols-2 gap-3">
        <button type="button" disabled={props.busy} onClick={props.onClose} class="min-h-12 rounded-lg border-2 border-wedding-action text-base font-bold text-wedding-action">Cancel</button>
        <button type="button" disabled={props.busy || !title().trim()} onClick={() => props.onSave({ title: title(), startAt: startAt() ? new Date(startAt()).toISOString() : null, location: location(), ownerRef: ownerRef(), visibility: vendorVisible() ? ["master", "vendor"] : ["master"] })} class="min-h-12 rounded-lg bg-wedding-action text-base font-bold text-white disabled:opacity-50">{props.busy ? "Saving…" : "Add item"}</button>
      </div>
    </div>
  </div></Show>;
}

export function WeddingRunSheetTimeChangeDialog(props: {
  review: WeddingRunSheetTimeChangeReview | null;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onOverride: () => void;
  onAuthoritativeUpdate: () => void;
}) {
  return <Show when={props.review}>{(review) => <div class="fixed inset-0 z-[220] flex items-end bg-on-surface/30 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-3">
    <div role="dialog" aria-modal="true" aria-labelledby="runsheet-time-review-title" class="w-full rounded-t-2xl bg-white p-5 shadow-panel sm:max-w-lg sm:rounded-2xl sm:p-6">
      <h2 id="runsheet-time-review-title" class="text-lg font-bold text-wedding-text">Change this confirmed time?</h2>
      <p class="mt-2 text-sm leading-6 text-wedding-muted">{review().summary}</p>
      <div class="mt-3 rounded-lg border border-wedding-border bg-wedding-card p-3 text-sm text-wedding-text">
        <p>Current: {weddingRunSheetTimeLabel(review().previousValue)}</p>
        <p class="mt-1 font-semibold">New: {weddingRunSheetTimeLabel(review().nextValue)}</p>
      </div>
      <Show when={props.error}><p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{props.error}</p></Show>
      <div class="mt-5 grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={props.busy} onClick={props.onCancel} class="min-h-12 rounded-lg border-2 border-wedding-action text-base font-bold text-wedding-action">Cancel</button>
        <button type="button" disabled={props.busy} onClick={props.onOverride} class="min-h-12 rounded-lg bg-wedding-action text-base font-bold text-white">Change run sheet only</button>
        <Show when={review().authoritativeUpdateAvailable}><button type="button" disabled={props.busy} onClick={props.onAuthoritativeUpdate} class="min-h-12 rounded-lg border border-wedding-action bg-wedding-card px-3 text-sm font-bold text-wedding-action sm:col-span-2">Update the linked task instead</button></Show>
      </div>
      <p class="mt-3 text-xs leading-5 text-wedding-muted">A run-sheet-only change is labelled as an override so the original wedding-plan fact remains visible.</p>
    </div>
  </div>}</Show>;
}
