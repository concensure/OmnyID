import { createSignal, For, Show } from "solid-js";

export function AgentStatusMenu(props: {
  statuses: Array<{ label: string; count: number; tone: string }>;
}) {
  const [open, setOpen] = createSignal(true);

  return (
    <div class="glass-surface rounded-[24px] border border-white/40 p-5 shadow-panel">
      <div class="flex items-center justify-between">
        <div>
          <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Agent status</p>
          <h3 class="mt-2 text-lg font-semibold text-on-surface">Live health overview</h3>
        </div>
        <button
          type="button"
          class="rounded-full bg-white/55 px-4 py-2 text-sm font-medium text-on-surface"
          onClick={() => setOpen((value) => !value)}
        >
          {open() ? "Collapse" : "Expand"}
        </button>
      </div>
      <Show when={open()}>
        <div class="mt-4 space-y-3">
          <For each={props.statuses}>
            {(item) => (
              <div class="flex items-center justify-between rounded-2xl bg-white/55 px-4 py-3">
                <div class="flex items-center gap-3">
                  <span class={`h-2.5 w-2.5 rounded-full ${item.tone}`} />
                  <span class="text-sm text-on-surface">{item.label}</span>
                </div>
                <span class="font-mono text-xs text-on-surface-variant">{item.count}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
