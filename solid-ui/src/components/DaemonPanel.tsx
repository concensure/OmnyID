import { createSignal, For, onMount, Show } from "solid-js";
import {
  fetchDaemonHeartbeat,
  listDaemons,
  revokeDaemon,
  type DaemonHeartbeatDetail,
  type DaemonRecord,
} from "@/lib/api";

export function DaemonPanel(props: { signedIn?: boolean }) {
  const [daemons, setDaemons] = createSignal<DaemonRecord[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [selectedDaemonId, setSelectedDaemonId] = createSignal<string | null>(null);
  const [selectedHeartbeat, setSelectedHeartbeat] = createSignal<DaemonHeartbeatDetail | null>(null);
  const [busyDaemonId, setBusyDaemonId] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string>("");

  async function refresh(selectedId?: string | null) {
    setError("");
    try {
      const next = await listDaemons();
      setDaemons(next);
      const target = selectedId ?? selectedDaemonId();
      if (target) {
        const detail = await fetchDaemonHeartbeat(target);
        setSelectedDaemonId(target);
        setSelectedHeartbeat(detail.heartbeat);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load daemons.");
    }
    setLoading(false);
  }

  async function inspect(daemonId: string) {
    setBusyDaemonId(daemonId);
    setError("");
    try {
      const detail = await fetchDaemonHeartbeat(daemonId);
      setSelectedDaemonId(daemonId);
      setSelectedHeartbeat(detail.heartbeat);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load daemon heartbeat.");
    }
    setBusyDaemonId(null);
  }

  async function revoke(daemonId: string) {
    setBusyDaemonId(daemonId);
    setError("");
    try {
      await revokeDaemon(daemonId);
      if (selectedDaemonId() === daemonId) {
        setSelectedDaemonId(null);
        setSelectedHeartbeat(null);
      }
      await refresh(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke daemon.");
    }
    setBusyDaemonId(null);
  }

  onMount(() => {
    if (props.signedIn === false) {
      setLoading(false);
      return;
    }
    void refresh(null);
  });

  return (
    <div class="rounded-xl border border-white/20 bg-white/10 p-4">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-semibold text-on-surface">Background Daemons</p>
          <p class="mt-1 text-xs leading-5 text-on-surface-variant">
            Inspect daemon registrations, heartbeat freshness, and revoke a background worker if you need to stop it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh(null)}
          disabled={loading()}
          class="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs text-on-surface transition hover:bg-white/20 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <Show when={props.signedIn === false}>
        <p class="mt-3 text-xs text-on-surface-variant">Sign in to inspect daemon state.</p>
      </Show>
      <Show when={error()}>
        <p class="mt-3 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error()}</p>
      </Show>

      <Show when={props.signedIn !== false}>
        <div class="mt-4 grid gap-4 lg:grid-cols-[1.3fr,1fr]">
          <div class="space-y-2">
            <Show when={!loading()} fallback={<p class="text-xs text-on-surface-variant">Loading daemons...</p>}>
              <Show
                when={daemons().length > 0}
                fallback={<p class="text-xs text-on-surface-variant">No active daemon registrations for this account.</p>}
              >
                <For each={daemons()}>
                  {(daemon) => (
                    <div class="rounded-xl border border-white/15 bg-white/5 p-3">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <p class="text-sm font-semibold text-on-surface">{daemon.display_name}</p>
                          <p class="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-outline">
                            {daemon.daemon_kind}
                          </p>
                          <p class="mt-1 text-[11px] text-on-surface-variant">
                            Last heartbeat: {daemon.last_heartbeat_at ?? "never"}
                          </p>
                          <Show when={typeof daemon.stale_minutes === "number"}>
                            <p class="mt-0.5 text-[11px] text-amber-700">
                              Stale for {daemon.stale_minutes} minute{daemon.stale_minutes === 1 ? "" : "s"}
                            </p>
                          </Show>
                        </div>
                        <div class="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => void inspect(daemon.daemon_id)}
                            disabled={busyDaemonId() === daemon.daemon_id}
                            class="rounded-lg border border-sky-300/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-200 transition hover:bg-sky-500/20 disabled:opacity-50"
                          >
                            Inspect
                          </button>
                          <button
                            type="button"
                            onClick={() => void revoke(daemon.daemon_id)}
                            disabled={busyDaemonId() === daemon.daemon_id}
                            class="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                          >
                            Revoke
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </For>
              </Show>
            </Show>
          </div>

          <div class="rounded-xl border border-white/15 bg-white/5 p-4">
            <p class="text-sm font-semibold text-on-surface">Heartbeat Detail</p>
            <Show
              when={selectedDaemonId()}
              fallback={<p class="mt-2 text-xs text-on-surface-variant">Select a daemon to inspect its latest heartbeat.</p>}
            >
              <p class="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-outline">{selectedDaemonId()}</p>
              <Show
                when={selectedHeartbeat()}
                fallback={<p class="mt-2 text-xs text-on-surface-variant">No heartbeat has been recorded yet.</p>}
              >
                <div class="mt-3 space-y-2 text-xs text-on-surface-variant">
                  <p>Recorded at: {selectedHeartbeat()!.created_at}</p>
                  <For each={Object.entries(selectedHeartbeat()!.metrics ?? {})}>
                    {([key, value]) => (
                      <div class="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                        <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-outline">{key}</span>
                        <span class="text-on-surface">{String(value)}</span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
