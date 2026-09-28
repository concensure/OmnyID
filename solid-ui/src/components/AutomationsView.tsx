// @locs-version: 1.0
import { createSignal } from "solid-js";
import { DaemonPanel } from "@/components/DaemonPanel";
import { AgentTriggersView } from "@/components/AgentTriggersView";
import { loadAutomationsDryRun, saveAutomationsDryRun } from "@/lib/automationsLocalState";

export function AutomationsView(props: { signedIn?: boolean }) {
  // 12 — persist dry-run to localStorage so it survives navigation
  const storedDryRun = loadAutomationsDryRun();
  const [dryRun, setDryRun] = createSignal(storedDryRun);
  const toggleDryRun = () => {
    const next = !dryRun();
    setDryRun(next);
    saveAutomationsDryRun(next);
  };

  return (
    <div class="space-y-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Automations</p>
          <h2 class="mt-1 text-xl font-semibold text-on-surface">Background Daemons &amp; Triggers</h2>
          <p class="mt-1 text-sm text-on-surface-variant">
            Manage long-running background daemons and configure scheduled or event-driven triggers for your agents.
          </p>
        </div>
        {/* 9l — Dry-run toggle */}
        <button
          type="button"
          onClick={toggleDryRun}
          class={`flex flex-shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
            dryRun()
              ? "border-sky-300/60 bg-sky-50/80 text-sky-700"
              : "border-white/40 bg-white/35 text-on-surface-variant hover:bg-white/55"
          }`}
          title="Dry-run mode: log automation actions without executing them"
        >
          <span class={`h-2 w-2 rounded-full flex-shrink-0 ${dryRun() ? "bg-sky-500" : "bg-white/30"}`} />
          {dryRun() ? "Dry run ON" : "Dry run OFF"}
        </button>
      </div>
      {/* 11 — concrete description of dry-run; 12 — persistent amber banner */}
      {dryRun() && (
        <div class="rounded-xl border border-sky-300/50 bg-sky-50/60 px-4 py-2.5 text-xs text-sky-800">
          Dry-run mode is on — your automations will describe what they would do, but won't send emails, create calendar events, or make any real changes.
        </div>
      )}

      <div class="rounded-3xl border border-white/50 bg-white/35 p-5 backdrop-blur shadow-card">
        <p class="mb-4 text-sm font-semibold text-on-surface">Background Daemons</p>
        <DaemonPanel signedIn={props.signedIn} />
      </div>

      <div class="rounded-3xl border border-white/50 bg-white/35 p-5 backdrop-blur shadow-card">
        <p class="mb-4 text-sm font-semibold text-on-surface">Agent Triggers</p>
        <AgentTriggersView />
      </div>
    </div>
  );
}
