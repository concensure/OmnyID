// @locs-version: 1.0
export function PARAOverviewStrip(props: { onOpen: () => void; token: string }) {
  return (
    <button
      type="button"
      onClick={props.onOpen}
      class="group flex w-full items-center justify-between rounded-2xl border border-outline/10 bg-white/50 px-4 py-3 text-left shadow-sm transition hover:bg-white/70 hover:shadow-md animate-fade-in"
    >
      <div class="flex items-center gap-3">
        <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="w-4 h-4">
            <rect x="2" y="2" width="7" height="7" rx="1.5" />
            <rect x="11" y="2" width="7" height="7" rx="1.5" />
            <rect x="2" y="11" width="7" height="7" rx="1.5" />
            <rect x="11" y="11" width="7" height="7" rx="1.5" />
          </svg>
        </span>
        <div>
          <p class="text-sm font-semibold text-on-surface">PARA Navigator</p>
          <p class="text-xs text-on-surface-variant/50">Projects · Areas · Resources · Archive</p>
        </div>
      </div>
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        class="w-4 h-4 text-outline/40 group-hover:text-primary transition"
      >
        <path d="M7 4l6 6-6 6" />
      </svg>
    </button>
  );
}
