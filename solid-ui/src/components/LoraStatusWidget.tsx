import { Show } from "solid-js";

const THRESHOLD = 0.85;

function label(score: number, active: boolean): string {
  if (active) return "LoRA genome active — soul.md archived";
  if (score >= 0.7) return "Almost ready for autonomous control";
  if (score >= 0.3) return "LoRA genome building…";
  return "Your agent is learning your style";
}

export function LoraStatusWidget(props: { score: number; active: boolean }) {
  const pct = () => Math.min(1, props.score / THRESHOLD) * 100;

  return (
    <div class="rounded-lg border border-white/10 bg-white/5 p-4">
      <p class="mb-2 text-xs font-medium text-on-surface-variant">LoRA Fine-tuning</p>

      <div class="mb-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          class={`h-full rounded-full transition-all duration-500 ${
            props.active ? "bg-green-500" : "bg-primary"
          }`}
          style={{ width: `${pct()}%` }}
        />
      </div>

      <p class={`text-xs ${props.active ? "text-green-600" : "text-on-surface-variant"}`}>
        {label(props.score, props.active)}
      </p>

      <Show when={props.active}>
        <p class="mt-1 text-xs text-green-500">✓ Active</p>
      </Show>

      {/* Progress bar toward 85% threshold */}
      <div class="mt-2 mb-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          class={`h-full rounded-full transition-all duration-700 ${props.active ? "bg-green-500" : "bg-primary/70"}`}
          style={{ width: `${pct()}%` }}
        />
      </div>
      <p
        class="mt-1 text-xs text-on-surface-variant cursor-help"
        title="LoRA (Low-Rank Adaptation) fine-tunes your agent on your personal interaction style. Once confidence reaches 85%, the agent no longer needs soul.md or memory.md — its personality is baked in."
      >
        {Math.round(props.score * 100)}% toward {Math.round(THRESHOLD * 100)}% threshold ⓘ
      </p>
    </div>
  );
}
