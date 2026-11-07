// @locs-version: 1.0
import { createEffect, onCleanup, Show, type JSX } from "solid-js";
import { computeCurrentStreak } from "@/lib/decisionOsHomeState";
import { setMobileFocusMenuAttentionCount } from "@/lib/mobileFocusHomeState";
export function MobileFocusHome(props: { title: string; positionLabel?: string; attentionCount: number; userId?: string | null; children: JSX.Element; onHome?: () => void; immersive?: boolean }) {
  const streak = () => computeCurrentStreak(new Date(), props.userId);
  createEffect(() => setMobileFocusMenuAttentionCount(props.attentionCount));
  onCleanup(() => setMobileFocusMenuAttentionCount(0));
  return <section class={`flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-wedding-surface pb-[calc(3rem+env(safe-area-inset-bottom))] sm:hidden ${props.immersive ? "pt-[env(safe-area-inset-top)]" : "pt-[max(0.5rem,env(safe-area-inset-top))]"}`}>
    <Show when={!props.immersive}><header class="flex min-h-14 items-center justify-between gap-2 px-3"><span class="w-12" aria-hidden="true"/><p class="min-w-0 flex-1 text-center text-sm font-semibold text-wedding-text" aria-live="polite">{props.title}{props.positionLabel ? ` · ${props.positionLabel}` : ""}</p><Show when={streak() >= 2} fallback={<span class="w-12"/>}><span class="rounded-full border border-wedding-accent bg-wedding-warm-note px-2 py-1 text-xs font-semibold text-wedding-text" aria-label={`${streak()}-day triage streak`}><span aria-hidden="true">🔥 </span>{streak()}</span></Show></header></Show>
    <main class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{props.children}</main>
  </section>;
}
