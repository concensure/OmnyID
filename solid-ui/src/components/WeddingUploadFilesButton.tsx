import type { JSX } from "solid-js";

export function WeddingUploadFilesButton(props: {
  running: boolean;
  onChange: JSX.EventHandler<HTMLInputElement, Event>;
}) {
  return (
    <label
      tabIndex={0}
      aria-label="Upload files"
      class={`group relative z-[1000] inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border text-xs font-semibold shadow-sm transition-colors ${
        props.running
          ? "cursor-wait border-teal-100 bg-white/50 text-teal-900/50"
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
        disabled={props.running}
        onChange={props.onChange}
      />
      <span role="tooltip" class="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-[5000] hidden w-72 rounded-2xl border border-teal-100 bg-white px-3 py-2 text-left text-xs font-normal leading-5 text-teal-950 opacity-0 shadow-2xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:block">
        <span class="block font-semibold">Bring in your existing lists</span>
        <span class="mt-1 block">Upload guest lists, budgets, spreadsheets, vendor quotes, contracts, Google Sheets exports, or The Knot exports. OmnyID will organize what it can and keep the original files for later.</span>
      </span>
    </label>
  );
}
