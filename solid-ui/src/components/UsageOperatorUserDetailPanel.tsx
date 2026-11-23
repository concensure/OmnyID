// @locs-version: 1.0
import { Show } from "solid-js";

type OperatorUserDetailCardModel = {
  title: string;
  subtitle: string;
  loadingLabel: string;
  authProviderLabel: string;
  authJoinedSummary: string;
  accountStatusLabel: string;
  accountStatusToneClass: string;
  accountReasonLabel: string;
  supportStatusLabel: string;
  supportScopeSummary: string;
  sessions: Array<{
    tokenPreview: string;
    createdSummary: string;
    expiresSummary: string;
  }>;
  sessionsEmptyState: string;
  supportHistory: Array<{
    heading: string;
    grantedSummary: string;
    expiresSummary: string;
    reason: string | null;
  }>;
  supportHistoryEmptyState: string;
};

export type UsageOperatorUserDetailPanelProps = {
  model: OperatorUserDetailCardModel;
  open: boolean;
  hasDetail: boolean;
  onClose: () => void;
};

export default function UsageOperatorUserDetailPanel(props: UsageOperatorUserDetailPanelProps) {
  return (
    <Show when={props.open}>
      <div class="mt-4 rounded-xl border border-slate-200/70 bg-slate-50/80 p-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-slate-900">{props.model.title}</p>
            <p class="mt-1 text-xs text-slate-600">{props.model.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            class="rounded-lg border border-slate-300/60 bg-white/85 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-white"
          >
            Close detail
          </button>
        </div>

        <Show when={!props.hasDetail}>
          <p class="mt-3 text-xs text-slate-500">{props.model.loadingLabel}</p>
        </Show>

        <Show when={props.hasDetail}>
          <div class="mt-3 grid gap-3 md:grid-cols-3">
            <div class="rounded-lg border border-white/60 bg-white/85 p-3">
              <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Auth</p>
              <p class="mt-1 text-sm text-slate-900">{props.model.authProviderLabel}</p>
              <p class="mt-1 text-xs text-slate-600">{props.model.authJoinedSummary}</p>
            </div>
            <div class="rounded-lg border border-white/60 bg-white/85 p-3">
              <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Account status</p>
              <p class={`mt-1 text-sm font-medium ${props.model.accountStatusToneClass}`}>{props.model.accountStatusLabel}</p>
              <p class="mt-1 text-xs text-slate-600">{props.model.accountReasonLabel}</p>
            </div>
            <div class="rounded-lg border border-white/60 bg-white/85 p-3">
              <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Support access</p>
              <p class="mt-1 text-sm text-slate-900">{props.model.supportStatusLabel}</p>
              <p class="mt-1 text-xs text-slate-600">{props.model.supportScopeSummary}</p>
            </div>
          </div>

          <div class="mt-3 grid gap-3 xl:grid-cols-2">
            <div class="rounded-lg border border-white/60 bg-white/85 p-3">
              <p class="text-sm font-semibold text-slate-900">Sessions</p>
              <div class="mt-2 space-y-2">
                {props.model.sessions.map((session) => (
                  <div class="rounded-lg border border-slate-200/70 bg-slate-50/80 p-2">
                    <div class="font-mono text-[11px] text-slate-900">{session.tokenPreview}</div>
                    <div class="mt-1 text-[11px] text-slate-600">{session.createdSummary}</div>
                    <div class="text-[11px] text-slate-600">{session.expiresSummary}</div>
                  </div>
                ))}
                <Show when={props.model.sessions.length === 0}>
                  <p class="text-xs text-slate-500">{props.model.sessionsEmptyState}</p>
                </Show>
              </div>
            </div>

            <div class="rounded-lg border border-white/60 bg-white/85 p-3">
              <p class="text-sm font-semibold text-slate-900">Support access history</p>
              <div class="mt-2 space-y-2">
                {props.model.supportHistory.map((entry) => (
                  <div class="rounded-lg border border-slate-200/70 bg-slate-50/80 p-2">
                    <div class="text-[11px] font-medium text-slate-900">{entry.heading}</div>
                    <div class="mt-1 text-[11px] text-slate-600">{entry.grantedSummary}</div>
                    <div class="text-[11px] text-slate-600">{entry.expiresSummary}</div>
                    <Show when={entry.reason}>
                      <div class="text-[11px] text-slate-600">Reason: {entry.reason}</div>
                    </Show>
                  </div>
                ))}
                <Show when={props.model.supportHistory.length === 0}>
                  <p class="text-xs text-slate-500">{props.model.supportHistoryEmptyState}</p>
                </Show>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}
