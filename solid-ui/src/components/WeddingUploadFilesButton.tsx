import type { JSX } from "solid-js";

export function WeddingUploadFilesButton(props: {
  running: boolean;
  onChange: JSX.EventHandler<HTMLInputElement, Event>;
}) {
  return (
    <label
      tabIndex={0}
      aria-label="Upload files"
      class={`group relative z-[1000] inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border text-xs font-semibold shadow-sm transition focus-within:w-auto focus-within:px-3 hover:w-auto hover:px-3 ${
        props.running
          ? "cursor-wait border-teal-100 bg-white/50 text-teal-900/50"
          : "border-teal-200 bg-white/85 text-teal-950 hover:border-teal-300 hover:bg-white"
      }`}
    >
      <span aria-hidden="true" class="text-xl leading-none">{props.running ? "…" : "+"}</span>
      <span class="ml-0 max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all group-hover:ml-2 group-hover:max-w-28 group-hover:opacity-100 group-focus-within:ml-2 group-focus-within:max-w-28 group-focus-within:opacity-100">
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
      <span role="tooltip" class="pointer-events-none absolute bottom-[calc(100%+0.5rem)] right-0 z-[5000] w-72 rounded-2xl border border-teal-100 bg-white px-3 py-2 text-left text-xs font-normal leading-5 text-teal-950 opacity-0 shadow-2xl transition group-hover:opacity-100 group-focus-within:opacity-100">
        <span class="block font-semibold">Bring in your existing lists</span>
        <span class="mt-1 block">Upload guest lists, budgets, spreadsheets, vendor quotes, contracts, Google Sheets exports, or The Knot exports. OmnyID will organize what it can and keep the original files for later.</span>
      </span>
    </label>
  );
}
