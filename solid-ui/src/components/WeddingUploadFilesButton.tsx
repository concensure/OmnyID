import type { JSX } from "solid-js";
import type { WeddingImportDeclaredKind } from "@/lib/weddingImportSynthesisState";

export function WeddingUploadFilesButton(props: {
  running: boolean;
  onChange: JSX.EventHandler<HTMLInputElement, Event>;
  listKind: WeddingImportDeclaredKind | "";
  onListKindChange: (kind: WeddingImportDeclaredKind | "") => void;
}) {
  return (
    <div class="flex min-w-0 items-center gap-2">
    <label class="sr-only" for="wedding-existing-list-kind">What is this list about?</label>
    <select id="wedding-existing-list-kind" aria-label="What is this uploaded list about?" value={props.listKind} onChange={(event) => props.onListKindChange(event.currentTarget.value as WeddingImportDeclaredKind | "")} class="h-10 max-w-[13rem] rounded-lg border border-teal-200 bg-white px-2 text-xs font-semibold text-teal-950 outline-none focus:border-teal-500">
      <option value="">Choose list type…</option>
      <option value="budget">Budget items</option>
      <option value="guest_list">Guest list</option>
      <option value="seating_chart">Seating chart</option>
      <option value="vendor_list">Vendor list or quotes</option>
      <option value="timeline">Timeline or run sheet</option>
      <option value="general_planning">Other planning list</option>
    </select>
    <label
      tabIndex={0}
      aria-label="Upload files"
      class={`group relative z-[1000] inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border text-xs font-semibold shadow-sm transition-colors ${
        props.running || !props.listKind
          ? "cursor-not-allowed border-teal-100 bg-white/50 text-teal-900/50"
          : "border-teal-200 bg-white/85 text-teal-950 hover:border-teal-300 hover:bg-white"
      }`}
    >
      <span aria-hidden="true" class="text-xl leading-none">{props.running ? "…" : "+"}</span>
      <span class="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-[5000] whitespace-nowrap rounded-full border border-teal-100 bg-white px-3 py-1.5 text-xs font-semibold text-teal-950 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:hidden">
        {props.running ? "Uploading…" : "Upload files"}
      </span>
      <input
        type="file"
        class="sr-only"
        multiple
        accept=".csv,.tsv,.txt,.xls,.xlsx,.pdf,.doc,.docx,text/csv,text/tab-separated-values,text/plain,application/pdf,application/msword,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        disabled={props.running || !props.listKind}
        onChange={props.onChange}
      />
      <span role="tooltip" class="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-[5000] hidden w-72 rounded-2xl border border-teal-100 bg-white px-3 py-2 text-left text-xs font-normal leading-5 text-teal-950 opacity-0 shadow-2xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:block">
        <span class="block font-semibold">Bring in your existing lists</span>
        <span class="mt-1 block">Choose what the list contains first. OmnyID will map its rows into the matching budget, guest, seating, vendor or timeline projection and keep the original for review.</span>
      </span>
    </label>
    </div>
  );
}
