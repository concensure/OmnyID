import { Show, createSignal, onMount, onCleanup } from "solid-js";

const THRESHOLD = 0.85;

function label(score: number, active: boolean): string {
  if (active) return "LoRA genome active — soul.md archived";
  if (score >= 0.7) return "Almost ready for autonomous control";
  if (score >= 0.3) return "LoRA genome building…";
  return "Your agent is learning your style";
}

export function LoraStatusWidget(props: { score: number; active: boolean; activeCount?: number; idleCount?: number; onFleetOpen?: () => void; threshold?: number }) {
  const [showFleet, setShowFleet] = createSignal(false);
  const threshold = () => props.threshold ?? THRESHOLD;
  const pct = () => Math.min(1, props.score / threshold()) * 100;
  let widgetRef: HTMLDivElement | undefined;

  onMount(() => {
    function onDocClick(e: MouseEvent) {
      if (widgetRef && !widgetRef.contains(e.target as Node)) setShowFleet(false);
    }
    document.addEventListener("mousedown", onDocClick);
    onCleanup(() => document.removeEventListener("mousedown", onDocClick));
  });

  return (
    <div ref={widgetRef} class="rounded-lg border border-white/10 bg-white/5 p-4">
      <p class="mb-2 text-xs font-medium text-on-surface-variant">LoRA Fine-tuning</p>

      <div class="mb-2 flex items-center gap-2">
        <div class="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            class={`h-full rounded-full transition-all duration-500 ${
              props.active ? "bg-green-500" : "bg-primary"
            }`}
            style={{ width: `${pct()}%` }}
          />
        </div>
        <span class="w-8 flex-shrink-0 text-right font-mono text-[10px] tabular-nums text-on-surface-variant/60">
          {Math.round(pct())}%
        </span>
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
      <div class="relative">
        <button
          type="button"
          onClick={() => setShowFleet((v) => !v)}
          class="mt-1 w-full text-left text-xs text-on-surface-variant cursor-pointer hover:text-on-surface transition"
          title="Click to see fleet status"
        >
          {Math.round(props.score * 100)}% toward {Math.round(threshold() * 100)}% threshold ⓘ
        </button>
        <Show when={showFleet()}>
          <div class="absolute left-0 top-full z-50 mt-1.5 min-w-[180px] animate-fade-in rounded-xl border border-white/45 bg-white/95 p-3 shadow-panel backdrop-blur-xl">
            <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline mb-2">Fleet Status</p>
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="flex items-center gap-1.5">
                  <span class="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Active
                </span>
                <span class="font-semibold text-on-surface">{props.activeCount ?? 0}</span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="flex items-center gap-1.5">
                  <span class="h-1.5 w-1.5 rounded-full bg-green-400" />
                  Idle
                </span>
                <span class="font-semibold text-on-surface">{props.idleCount ?? 0}</span>
              </div>
            </div>
            <p class="mt-2 text-[0.625em] text-on-surface-variant/70">
              LoRA: {Math.round(props.score * 100)}% toward {Math.round(threshold() * 100)}%
            </p>
            <Show when={props.onFleetOpen}>
              <button
                type="button"
                onClick={() => { setShowFleet(false); props.onFleetOpen!(); }}
                class="mt-2 w-full rounded-lg border border-primary/20 bg-primary/8 px-2 py-1.5 text-left text-[10px] font-medium text-primary transition hover:bg-primary/15"
              >
                Open fleet view →
              </button>
            </Show>
          </div>
        </Show>
      </div>
      <Show when={!props.active && props.score < 0.3}>
        <p class="mt-1.5 text-[10px] leading-4 text-on-surface-variant/70">
          → Chat more and use the app to help your agent learn your style.{" "}
          <span class="text-primary">Adjust weights in Settings → Profile Ledger.</span>
        </p>
      </Show>
    </div>
  );
}
