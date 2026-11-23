// @locs-version: 1.0
export function WorkflowPaneFallback(props: { label: string }) {
  return (
    <div class="rounded-2xl border border-white/35 bg-white/45 px-4 py-5 text-sm text-on-surface-variant shadow-soft">
      Loading {props.label}...
    </div>
  );
}
