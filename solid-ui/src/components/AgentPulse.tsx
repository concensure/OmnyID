import { createSignal, onMount, onCleanup } from "solid-js";
import { apiFetch } from "../lib/api";

type FleetSummary = {
  active_count?: number;
  idle_count?: number;
  healthy?: boolean;
  recent_tasks?: Array<{ status: string }>;
};

export function AgentPulse() {
  const [summary, setSummary] = createSignal<FleetSummary>({});

  async function poll() {
    try {
      const data = await apiFetch<FleetSummary>("/agent/fleet");
      setSummary(data);
    } catch { /* ignore */ }
  }

  onMount(() => {
    poll();
    const timer = setInterval(poll, 10_000);
    onCleanup(() => clearInterval(timer));
  });

  const active = () => summary().active_count
    ?? (summary().recent_tasks ?? []).filter(t => t.status === "in_progress").length;
  const idle = () => summary().idle_count
    ?? (summary().recent_tasks ?? []).filter(t => t.status === "pending").length;
  const healthy = () => summary().healthy !== false;

  return (
    <div
      class={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        healthy() ? "bg-green-500/20 text-green-700" : "bg-orange-500/20 text-orange-700"
      }`}
    >
      <span class={`h-2 w-2 rounded-full ${healthy() ? "bg-green-500" : "bg-orange-400"}`} />
      {active()} active / {idle()} idle
    </div>
  );
}
