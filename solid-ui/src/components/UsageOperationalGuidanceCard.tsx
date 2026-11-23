// @locs-version: 1.0
import { Show } from "solid-js";

export type UsageOperationalGuidanceCardProps = {
  tone: "warning" | "neutral";
  title: string;
  detail: string;
  artifactSummary: string | null;
  command: string | null;
  copyButtonLabel: string;
  onCopyCommand: () => void;
};

export default function UsageOperationalGuidanceCard(props: UsageOperationalGuidanceCardProps) {
  return (
    <div
      class={`mt-4 rounded-2xl border p-4 text-sm ${
        props.tone === "warning"
          ? "border-amber-300/50 bg-amber-50/75 text-amber-950"
          : "border-slate-300/45 bg-slate-50/75 text-slate-900"
      }`}
    >
      <p class="font-semibold">{props.title}</p>
      <p class="mt-1 leading-6">{props.detail}</p>
      <Show when={props.artifactSummary}>
        <p class="mt-2 text-[11px] leading-5 opacity-80">{props.artifactSummary}</p>
      </Show>
      <Show when={props.command}>
        <pre class="mt-3 overflow-x-auto rounded-xl bg-black/85 px-3 py-2 font-mono text-[11px] text-white">
          {props.command}
        </pre>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={props.onCopyCommand}
            class="rounded-xl border border-amber-400/50 bg-white/60 px-3 py-1.5 text-xs font-medium text-amber-950 transition hover:bg-white"
          >
            {props.copyButtonLabel}
          </button>
        </div>
      </Show>
    </div>
  );
}
