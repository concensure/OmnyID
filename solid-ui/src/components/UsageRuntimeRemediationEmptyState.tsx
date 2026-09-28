// @locs-version: 1.0
import { Show } from "solid-js";
import type { OperatorRuntimeRemediationFilter } from "@/lib/operatorRuntimeRemediationLocalState";

type RuntimeRemediationRecoveryAction = {
  filter: OperatorRuntimeRemediationFilter;
  label: string;
};

export type UsageRuntimeRemediationEmptyStateProps = {
  message: string;
  totalCount: number;
  issueReceiptBusy: boolean;
  recoveryActions: RuntimeRemediationRecoveryAction[];
  onIssueReceipt: () => void;
  onSelectFilter: (filter: OperatorRuntimeRemediationFilter) => void;
};

export default function UsageRuntimeRemediationEmptyState(props: UsageRuntimeRemediationEmptyStateProps) {
  return (
    <div class="mt-3 rounded-xl border border-slate-200/70 bg-slate-50/80 p-3">
      <p class="text-xs leading-6 text-slate-600">
        {props.message}
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <Show when={props.totalCount === 0}>
          <button
            type="button"
            onClick={props.onIssueReceipt}
            disabled={props.issueReceiptBusy}
            class="rounded-xl border border-slate-300/60 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {props.issueReceiptBusy ? "Issuing receipt..." : "Issue cleanup receipt"}
          </button>
        </Show>
        {props.recoveryActions.map((action) => (
          <button
            type="button"
            onClick={() => props.onSelectFilter(action.filter)}
            class={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
              action.filter === "drafts"
                ? "border border-sky-300/60 bg-sky-50/80 text-sky-950 hover:bg-sky-50"
                : "border border-slate-300/60 bg-white/90 text-slate-900 hover:bg-white"
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
