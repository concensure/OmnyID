// @locs-version: 1.0
import { Show } from "solid-js";

export type UsageOperatorUserFilterFormProps = {
  queryDraft: string;
  queryApplied: string;
  loading: boolean;
  onQueryDraftChange: (value: string) => void;
  onSubmit: (event: SubmitEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onClear: () => void;
};

export default function UsageOperatorUserFilterForm(props: UsageOperatorUserFilterFormProps) {
  return (
    <form class="mt-4 flex flex-wrap items-center gap-3" onSubmit={props.onSubmit} onKeyDown={props.onKeyDown}>
      <label class="flex min-w-[240px] flex-1 flex-col gap-1 text-xs text-slate-600">
        Search users
        <input
          value={props.queryDraft}
          onInput={(event) => props.onQueryDraftChange(event.currentTarget.value)}
          placeholder="email, plan, or support status"
          class="rounded-xl border border-slate-300/60 bg-white/85 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
        />
      </label>
      <button
        type="submit"
        disabled={props.loading}
        class="rounded-xl border border-slate-300/60 bg-white/85 px-3 py-2 text-sm font-medium text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {props.loading ? "Applying..." : "Apply filter"}
      </button>
      <Show when={props.queryApplied}>
        <button
          type="button"
          onClick={props.onClear}
          class="rounded-xl border border-slate-300/60 bg-white/70 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white"
        >
          Clear filter
        </button>
      </Show>
    </form>
  );
}
