// @locs-version: 1.0
// Lightweight loading primitives: Spinner + SkeletonLine.
// Used wherever async operations need inline visual feedback.

type SpinnerSize = "xs" | "sm" | "md" | "lg";

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  xs: "h-3 w-3 border",
  sm: "h-4 w-4 border-2",
  md: "h-5 w-5 border-2",
  lg: "h-6 w-6 border-2",
};

/**
 * CSS border-spin spinner. Transparent border with one white sector.
 * Inherits `text-*` colour as the spin accent if you pass `class`.
 */
export function Spinner(props: { size?: SpinnerSize; class?: string }) {
  const sz = () => SIZE_CLASSES[props.size ?? "sm"];
  return (
    <span
      aria-label="Loading"
      role="status"
      class={`inline-block animate-spin rounded-full border-current/20 border-t-current ${sz()} ${props.class ?? ""}`}
    />
  );
}

/**
 * Shimmer skeleton line — used as a placeholder while data is loading.
 * Accepts Tailwind width classes via `class` prop (e.g. "w-32").
 */
export function SkeletonLine(props: { class?: string }) {
  return (
    <span
      aria-hidden="true"
      class={`skeleton-crossfade inline-block h-3.5 rounded-full bg-on-surface/8 animate-pulse ${props.class ?? "w-24"}`}
    />
  );
}

/**
 * Full-width block skeleton row — used for list items or cards.
 */
export function SkeletonBlock(props: { lines?: number; class?: string }) {
  const count = () => props.lines ?? 3;
  const widths = ["w-full", "w-4/5", "w-2/3", "w-3/4", "w-1/2"];
  return (
    <div class={`skeleton-crossfade flex flex-col gap-2 ${props.class ?? ""}`} aria-hidden="true">
      {Array.from({ length: count() }).map((_, i) => (
        <SkeletonLine class={widths[i % widths.length]} />
      ))}
    </div>
  );
}
