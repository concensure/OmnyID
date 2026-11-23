// @locs-version: 1.0
import { Show } from "solid-js";

type UsageOperatorOverviewGuidanceModel = {
  title: string;
  detail: string;
  tone: "warning" | "neutral";
  artifactSummary: string | null;
  command: string | null;
  copyCommandLabel: string;
  issueReceiptLabel: string;
};

export type UsageOperatorOverviewSectionProps = {
  shortcutsHint: string;
  intro: string;
  refreshLabel: string;
  refreshDisabled: boolean;
  loadFailure: {
    title: string;
    detail: string;
  } | null;
  actionFailure: {
    title: string;
    detail: string;
  } | null;
  actionNotice: string | null;
  guidance: UsageOperatorOverviewGuidanceModel | null;
  issueReceiptBusy: boolean;
  onRefresh: () => void;
  onCopyCommand: (command: string) => void;
  onIssueReceipt: () => void;
};

export default function UsageOperatorOverviewSection(props: UsageOperatorOverviewSectionProps) {
  return (
    <>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-slate-900">Operator overview</p>
          <p class="mt-1 text-xs leading-6 text-slate-700/90">
            {props.intro}
          </p>
          <p class="mt-2 text-[11px] text-slate-500">
            Operator shortcuts: {props.shortcutsHint}.
          </p>
        </div>
        <button
          type="button"
          onClick={props.onRefresh}
          disabled={props.refreshDisabled}
          class="rounded-xl border border-slate-300/60 bg-white/80 px-3 py-1.5 text-sm font-medium text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {props.refreshLabel}
        </button>
      </div>

      <Show when={props.loadFailure}>
        {(failure) => (
          <div class="mt-4 rounded-2xl border border-amber-300/40 bg-amber-50/70 p-4 text-sm text-slate-800">
            <p class="font-semibold">{failure().title}</p>
            <p class="mt-1">{failure().detail}</p>
          </div>
        )}
      </Show>

      <Show when={props.actionFailure}>
        {(failure) => (
          <div class="mt-4 rounded-2xl border border-red-200/60 bg-red-50/80 p-4 text-sm text-red-700">
            <p class="font-semibold">{failure().title}</p>
            <p class="mt-1">{failure().detail}</p>
          </div>
        )}
      </Show>

      <Show when={props.actionNotice}>
        {(notice) => (
          <div class="mt-4 rounded-2xl border border-sky-300/40 bg-sky-50/70 p-4 text-sm text-slate-800">
            {notice()}
          </div>
        )}
      </Show>

      <Show when={props.guidance}>
        {(guidance) => (
          <div
            class={`mt-4 rounded-2xl border p-4 text-sm ${
              guidance().tone === "warning"
                ? "border-amber-300/50 bg-amber-50/75 text-amber-950"
                : "border-slate-300/45 bg-slate-50/75 text-slate-900"
            }`}
          >
            <p class="font-semibold">{guidance().title}</p>
            <p class="mt-1 leading-6">{guidance().detail}</p>
            <Show when={guidance().artifactSummary}>
              {(artifactSummary) => (
                <p class="mt-2 text-[11px] leading-5 opacity-80">
                  {artifactSummary()}
                </p>
              )}
            </Show>
            <Show when={guidance().command}>
              {(command) => (
                <>
                  <pre class="mt-3 overflow-x-auto rounded-xl bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-50">
                    {command()}
                  </pre>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => props.onCopyCommand(command())}
                      class="rounded-xl border border-amber-400/50 bg-white/80 px-3 py-1.5 text-xs font-medium text-amber-950 transition hover:bg-white"
                    >
                      {guidance().copyCommandLabel}
                    </button>
                    <button
                      type="button"
                      onClick={props.onIssueReceipt}
                      disabled={props.issueReceiptBusy}
                      class="rounded-xl border border-slate-300/60 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {guidance().issueReceiptLabel}
                    </button>
                  </div>
                </>
              )}
            </Show>
          </div>
        )}
      </Show>
    </>
  );
}
