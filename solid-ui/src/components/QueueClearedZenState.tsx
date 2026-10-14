// @locs-version: 1.0
import { Show } from "solid-js";
export function QueueClearedZenState(props: { variant: "home" | "wedding"; laterCount: number; onPrimary: () => void; onDiary: () => void; onBringBack?: () => void }) {
  const heading = () => props.variant === "wedding" ? "Nothing needs a decision right now." : "You're clear for now.";
  const weddingFullScreen = () => props.variant === "wedding";
  return <div class={`w-full rounded-[24px] border border-wedding-muted bg-wedding-surface p-6 text-center text-wedding-text animate-fade-in motion-reduce:animate-none ${weddingFullScreen() ? "flex min-h-0 flex-1 flex-col justify-center rounded-none border-0 px-0" : ""}`}>
    <svg class="mx-auto h-16 w-20 text-wedding-accent" viewBox="0 0 80 64" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 48C24 24 40 20 68 48M28 42c-4-9-2-16 7-21M49 40c4-8 9-11 16-10"/><path d="M29 21c5 2 8 6 6 11M65 30c-5 0-9 3-10 8"/></svg>
    <h2 class="mt-3 text-xl font-semibold">{heading()}</h2><p class="mt-2 text-sm text-wedding-muted">All decisions for today are handled.<Show when={props.laterCount > 0}> · {props.laterCount} coming back later</Show></p>
    <div class="mt-5 grid gap-2"><button type="button" class="min-h-12 rounded-xl border-2 border-wedding-cta bg-white px-4 text-sm font-bold text-wedding-text hover:bg-wedding-surface-blush" onClick={props.onPrimary}>Review the plan</button><button type="button" class="min-h-12 rounded-xl border border-wedding-muted bg-white px-4 text-sm font-semibold text-wedding-text" onClick={props.onDiary}>Open decision diary</button><Show when={props.laterCount > 0 && props.onBringBack}><button type="button" class="min-h-12 text-sm font-semibold text-wedding-accent underline" onClick={props.onBringBack}>Bring back a later item</button></Show></div>
  </div>;
}
