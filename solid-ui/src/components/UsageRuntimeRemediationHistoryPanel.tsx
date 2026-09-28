// @locs-version: 1.0
import { Show } from "solid-js";
import type { OperatorRuntimeRemediationFilter } from "@/lib/operatorRuntimeRemediationLocalState";

type RuntimeRemediationFilterOption = {
  filter: OperatorRuntimeRemediationFilter;
  label: string;
  count: number;
};

type RuntimeRemediationRecoveryAction = {
  filter: OperatorRuntimeRemediationFilter;
  label: string;
};

type RuntimeRemediationRetentionSummary = {
  windowLabel: string;
  rowCapLabel: string;
  rolloverLabel: string | null;
} | null;

type RuntimeRemediationNotice = {
  title: string;
  body: string;
  receiptLabel: string;
  actionLabel: string;
} | null;

type RuntimeRemediationHistoryPanelModel = {
  historySummary: string;
  filterOptions: RuntimeRemediationFilterOption[];
  recoveryActions: RuntimeRemediationRecoveryAction[];
  retentionSummary: RuntimeRemediationRetentionSummary;
  noticeStrip: {
    latestNotice: RuntimeRemediationNotice;
    featuredNotice: RuntimeRemediationNotice;
  };
};

export type UsageRuntimeRemediationHistoryPanelProps = {
  panelModel: RuntimeRemediationHistoryPanelModel;
  currentFilter: OperatorRuntimeRemediationFilter;
  localDraftCount: number;
  currentOpenCount: number;
  currentCompletedCount: number;
  currentDraftCount: number;
  currentTotalCount: number;
  onSelectFilter: (filter: OperatorRuntimeRemediationFilter) => void;
  onClearAllDrafts: () => void;
  onFocusLatest: () => void;
  onFocusFeatured: () => void;
};

export default function UsageRuntimeRemediationHistoryPanel(props: UsageRuntimeRemediationHistoryPanelProps) {
  return (
    <>
      <div class="mt-4 rounded-2xl border border-white/50 bg-white/80 p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-slate-900">Remediation receipt history</p>
            <p class="mt-1 text-xs leading-6 text-slate-600">
              Recent manual cleanup receipts persist per operator and roll forward instead of growing forever.
            </p>
            <p class="hidden">
              {props.currentOpenCount} open · {props.currentCompletedCount} completed · {props.currentDraftCount} with drafts · {props.currentTotalCount} total
            </p>
            <p class="mt-2 text-[11px] text-slate-500">
              {props.panelModel.historySummary}
            </p>
          </div>
          <div class="flex flex-wrap items-start gap-2">
            <div class="rounded-xl border border-slate-300/40 bg-white/80 p-1">
              <div class="flex flex-wrap gap-1">
                {props.panelModel.filterOptions.map((option) => (
                  <button
                    type="button"
                    onClick={() => props.onSelectFilter(option.filter)}
                    class={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                      props.currentFilter === option.filter
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {option.label} ({option.count})
                  </button>
                ))}
              </div>
            </div>
            <Show when={props.localDraftCount > 0}>
              <div class="rounded-xl border border-sky-300/40 bg-sky-50/70 px-3 py-2 text-right">
                <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-900">Local drafts</p>
                <p class="mt-1 text-[11px] text-sky-950">
                  {props.localDraftCount.toLocaleString()} receipt{props.localDraftCount === 1 ? "" : "s"} with saved completion notes
                </p>
                <div class="mt-2">
                  <button
                    type="button"
                    onClick={props.onClearAllDrafts}
                    class="rounded-lg border border-sky-300/60 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-sky-950 transition hover:bg-white"
                  >
                    Clear all local drafts
                  </button>
                </div>
              </div>
            </Show>
            <Show when={props.panelModel.retentionSummary}>
              {(retentionSummary) => (
                <div class="rounded-xl border border-indigo-300/40 bg-indigo-50/70 px-3 py-2 text-right">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-900">Retention</p>
                  <p class="mt-1 text-[11px] text-indigo-950">
                    {retentionSummary().windowLabel}
                  </p>
                  <p class="mt-1 text-[11px] text-indigo-900/80">
                    {retentionSummary().rowCapLabel}
                  </p>
                  <Show when={retentionSummary().rolloverLabel}>
                    {(rolloverLabel) => (
                      <p class="mt-1 text-[10px] uppercase tracking-[0.12em] text-indigo-900/65">
                        {rolloverLabel()}
                      </p>
                    )}
                  </Show>
                </div>
              )}
            </Show>
          </div>
        </div>

        <Show when={props.panelModel.noticeStrip.latestNotice || props.panelModel.noticeStrip.featuredNotice}>
          <div class="mt-3 flex flex-wrap gap-2">
            <Show when={props.panelModel.noticeStrip.latestNotice}>
              {(notice) => (
                <div class="rounded-xl border border-amber-300/40 bg-amber-50/70 px-3 py-2">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900">{notice().title}</p>
                  <p class="mt-1 text-[11px] text-amber-950">{notice().body}</p>
                  <p class="mt-1 font-mono text-[11px] text-amber-900/80">
                    {notice().receiptLabel}
                  </p>
                  <div class="mt-2">
                    <button
                      type="button"
                      onClick={props.onFocusLatest}
                      class="rounded-lg border border-amber-300/60 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-amber-950 transition hover:bg-white"
                    >
                      {notice().actionLabel}
                    </button>
                  </div>
                </div>
              )}
            </Show>
            <Show when={props.panelModel.noticeStrip.featuredNotice}>
              {(notice) => (
                <div class="rounded-xl border border-indigo-300/40 bg-indigo-50/70 px-3 py-2">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-900">{notice().title}</p>
                  <p class="mt-1 text-[11px] text-indigo-950">{notice().body}</p>
                  <p class="mt-1 font-mono text-[11px] text-indigo-900/80">
                    {notice().receiptLabel}
                  </p>
                  <div class="mt-2">
                    <button
                      type="button"
                      onClick={props.onFocusFeatured}
                      class="rounded-lg border border-indigo-300/60 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-indigo-950 transition hover:bg-white"
                    >
                      {notice().actionLabel}
                    </button>
                  </div>
                </div>
              )}
            </Show>
          </div>
        </Show>
      </div>
    </>
  );
}
