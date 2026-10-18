// @locs-version: 1.0
import { createSignal, onCleanup, onMount } from "solid-js";

export function WeddingPlanningProgressRing(props: { percentage: number; size?: number }) {
  const size = () => props.size ?? 96;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const target = () => Math.max(0, Math.min(100, Math.round(props.percentage)));
  const [displayed, setDisplayed] = createSignal(0);

  onMount(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayed(target());
      return;
    }
    const frame = window.requestAnimationFrame(() => setDisplayed(target()));
    onCleanup(() => window.cancelAnimationFrame(frame));
  });

  return (
    <div
      class="relative shrink-0"
      style={{ width: `${size()}px`, height: `${size()}px` }}
      role="img"
      aria-label={`${target()}% of planning tasks complete`}
    >
      <svg viewBox="0 0 96 96" class="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="rgba(255,255,255,.14)" stroke-width="10" />
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke="currentColor"
          stroke-width="10"
          stroke-linecap="round"
          stroke-dasharray={String(circumference)}
          stroke-dashoffset={String(circumference * (1 - displayed() / 100))}
          class="text-wedding-bubblegum transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        />
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center text-white">
        <span class="text-xl font-bold tabular-nums">{target()}%</span>
        <span class="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">planned</span>
      </div>
    </div>
  );
}
