import { createSignal, Show, type JSX } from "solid-js";
import type { WeddingImportDeclaredKind } from "@/lib/weddingImportSynthesisState";

export function WeddingUploadFilesButton(props: {
  running: boolean;
  onChange: JSX.EventHandler<HTMLInputElement, Event>;
  listKind: WeddingImportDeclaredKind | "";
  onListKindChange: (kind: WeddingImportDeclaredKind | "") => void;
}) {
  const [open, setOpen] = createSignal(false);
  return (
    <div class="relative flex min-w-0 items-center gap-2">
    <button
      type="button"
      aria-label="Upload files"
      aria-expanded={open()}
      aria-controls="wedding-upload-list-dialog"
      disabled={props.running}
      onClick={() => setOpen((value) => !value)}
      class={`group relative z-[1000] inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border text-xs font-semibold shadow-sm transition-colors ${
        props.running
          ? "cursor-not-allowed border-teal-100 bg-white/50 text-teal-900/50"
          : "border-teal-200 bg-white/85 text-teal-950 hover:border-teal-300 hover:bg-white"
      }`}
    >
      <span aria-hidden="true" class="text-xl leading-none">{props.running ? "…" : "+"}</span>
      <span class="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-[5000] whitespace-nowrap rounded-full border border-teal-100 bg-white px-3 py-1.5 text-xs font-semibold text-teal-950 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:hidden">
        {props.running ? "Uploading…" : "Upload files"}
      </span>
      <span role="tooltip" class="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-[5000] hidden w-72 rounded-2xl border border-teal-100 bg-white px-3 py-2 text-left text-xs font-normal leading-5 text-teal-950 opacity-0 shadow-2xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:block">
        <span class="block font-semibold">Bring in your existing lists</span>
        <span class="mt-1 block">Upload a budget, guest, seating, vendor or timeline list. You will identify its type in the review dialog.</span>
      </span>
    </button>
    <Show when={open()}>
      <section id="wedding-upload-list-dialog" class="absolute right-0 top-[calc(100%+0.5rem)] z-[5100] w-[min(22rem,calc(100vw-1rem))] rounded-2xl border border-teal-100 bg-white p-3 text-teal-950 shadow-2xl" role="dialog" aria-label="Upload an existing wedding list">
        <div class="flex items-start justify-between gap-3">
          <div><p class="text-sm font-semibold">Bring in an existing list</p><p class="mt-1 text-xs leading-5 text-teal-950/70">Choose what it contains so OmnyID can map reviewed rows to the right part of your plan.</p></div>
          <button type="button" class="min-h-9 rounded-full px-2 text-sm font-semibold" onClick={() => setOpen(false)} aria-label="Close upload dialog">×</button>
        </div>
        <label class="mt-3 block text-xs font-semibold" for="wedding-existing-list-kind">What is this list about?</label>
        <select id="wedding-existing-list-kind" aria-label="What is this uploaded list about?" value={props.listKind} onChange={(event) => props.onListKindChange(event.currentTarget.value as WeddingImportDeclaredKind | "")} class="mt-1 h-11 w-full rounded-lg border border-teal-200 bg-white px-3 text-sm font-semibold text-teal-950 outline-none focus:border-teal-500">
          <option value="">Choose list type…</option>
          <option value="budget">Budget items</option>
          <option value="guest_list">Guest list</option>
          <option value="seating_chart">Seating chart</option>
          <option value="vendor_list">Vendor list or quotes</option>
          <option value="timeline">Timeline or run sheet</option>
          <option value="general_planning">Other planning list</option>
        </select>
        <label class={`mt-3 inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${props.listKind ? "cursor-pointer bg-teal-800 text-white" : "cursor-not-allowed bg-teal-100 text-teal-900/50"}`}>
          Choose files
          <input type="file" class="sr-only" multiple accept=".csv,.tsv,.txt,.xls,.xlsx,.pdf,.doc,.docx,text/csv,text/tab-separated-values,text/plain,application/pdf,application/msword,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={props.running || !props.listKind} onChange={(event) => { props.onChange(event); if (event.currentTarget.files?.length) setOpen(false); }} />
        </label>
      </section>
    </Show>
    </div>
  );
}
