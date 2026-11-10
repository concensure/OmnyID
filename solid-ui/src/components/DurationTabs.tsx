// @locs-version: 1.0
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";

type DurationView = "day" | "week" | "month" | "year";

const DURATION_VIEWS: Array<{ id: DurationView; label: string; hint: string; key: string }> = [
  { id: "day",   label: "Today", hint: "Decisions due or relevant today",      key: "d" },
  { id: "week",  label: "Week",  hint: "This week's tasks and milestones",      key: "w" },
  { id: "month", label: "Month", hint: "Monthly goals and recurring items",     key: "m" },
  { id: "year",  label: "Year",  hint: "Annual goals and long-range planning",  key: "y" },
];

export function DurationTabs(props: {
  active: DurationView;
  onChange: (v: DurationView) => void;
  counts: Record<DurationView, number>;
  previews?: Partial<Record<DurationView, string[]>>;
}) {
  const [flashedTab, setFlashedTab] = createSignal<DurationView | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let isFirst = true;
  createEffect(() => {
    const a = props.active;
    if (isFirst) { isFirst = false; return; }
    setFlashedTab(a);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => setFlashedTab(null), 380);
  });
  onCleanup(() => clearTimeout(flashTimer));

  return (
    <div class="flex items-center gap-1 rounded-2xl border border-white/50 bg-white/50 p-1 shadow-sm backdrop-blur-sm">
      <For each={DURATION_VIEWS}>
        {(v) => (
          <button
            type="button"
            title={v.hint}
            class={`group relative flex-1 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition ${props.active === v.id ? `bg-white text-on-surface shadow-sm${flashedTab() === v.id ? " ring-2 ring-primary/40" : ""}` : "text-on-surface-variant/60 hover:bg-white/50 hover:text-on-surface"}`}
            onClick={() => props.onChange(v.id)}
          >
            {v.label}
            <span class="ml-1 font-mono text-[8px] opacity-30" aria-hidden="true">[{v.key}]</span>
            <Show when={props.counts[v.id] > 0}>
              <span class={`ml-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold ${props.active === v.id ? "bg-primary/10 text-primary" : "bg-black/[0.06] text-on-surface-variant/60"}`}>
                {props.counts[v.id]}
              </span>
            </Show>
            {/* Preview tooltip — shows top 2 decision titles on hover */}
            <Show when={(props.previews?.[v.id]?.length ?? 0) > 0}>
              <div
                class="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 hidden min-w-[160px] max-w-[220px] -translate-x-1/2 rounded-xl border border-white/70 bg-white/96 p-2 shadow-xl backdrop-blur-sm group-hover:block"
                role="tooltip"
              >
                <p class="mb-1 font-mono text-[8px] uppercase tracking-[0.18em] text-on-surface-variant/50">In this view</p>
                <For each={props.previews![v.id]!.slice(0, 2)}>
                  {(title) => <p class="truncate py-0.5 text-[10px] text-on-surface">{title}</p>}
                </For>
              </div>
            </Show>
          </button>
        )}
      </For>
    </div>
  );
}
