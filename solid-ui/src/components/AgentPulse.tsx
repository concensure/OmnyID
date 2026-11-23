import { createSignal, onMount, onCleanup } from "solid-js";
import {
  type AgentPulseFailureReceipt,
} from "@/lib/agentPulseFailureState";
import {
  createDefaultAgentPulseSummary,
  loadAgentPulseState,
} from "@/lib/agentPulseState";

export function AgentPulse() {
  const [summary, setSummary] = createSignal(createDefaultAgentPulseSummary());
  const [loadError, setLoadError] = createSignal<AgentPulseFailureReceipt | null>(null);
  const [hasLoaded, setHasLoaded] = createSignal(false);
  const [retrying, setRetrying] = createSignal(false);

  async function poll() {
    const result = await loadAgentPulseState(summary(), hasLoaded());
    setSummary(result.summary);
    setLoadError(result.error);
    setHasLoaded(result.hasLoaded);
  }

  async function retryPulse() {
    setRetrying(true);
    try {
      await poll();
    } finally {
      setRetrying(false);
    }
  }

  onMount(() => {
    poll();
    const timer = setInterval(poll, 10_000);
    onCleanup(() => clearInterval(timer));
  });

  const active = () => summary().active_count;
  const idle = () => summary().idle_count;
  const healthy = () => summary().healthy;
  const unavailable = () => !hasLoaded() && !!loadError();
  const stale = () => hasLoaded() && !!loadError();

  return (
    <div
      class={`flex min-w-0 flex-wrap items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium sm:py-1 ${
        unavailable()
          ? "bg-white/15 text-on-surface-variant"
          : healthy()
            ? "bg-green-500/20 text-green-700"
            : "bg-orange-500/20 text-orange-700"
      }`}
      title={loadError() ? `${loadError()!.title}. ${loadError()!.summary} ${loadError()!.nextStep}`.trim() : undefined}
    >
      <span
        class={`h-2 w-2 flex-shrink-0 rounded-full ${
          unavailable()
            ? "bg-white/45"
            : healthy()
              ? "bg-green-500"
              : "bg-orange-400"
        }`}
      />
      <span class="min-w-0 break-words">
        {unavailable() ? (loadError()?.title ?? "Pulse unavailable") : `${active()} active / ${idle()} idle`}
      </span>
      {stale() ? (
        <span class="max-w-full break-words text-[10px] opacity-70">
          {loadError()?.tone === "danger" ? "reauth" : "stale"}
        </span>
      ) : null}
      {(unavailable() || stale()) ? (
        <button
          type="button"
          class="rounded-full border border-white/30 bg-white/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white/25 sm:ml-1"
          onClick={() => void retryPulse()}
          disabled={retrying()}
          aria-label="Retry agent pulse"
        >
          {retrying() ? "Retrying..." : "Retry"}
        </button>
      ) : null}
    </div>
  );
}
