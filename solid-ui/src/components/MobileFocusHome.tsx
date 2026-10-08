// @locs-version: 1.0
import { createEffect, onCleanup, Show, type JSX } from "solid-js";
import { computeCurrentStreak } from "@/lib/decisionOsHomeState";
import { setMobileFocusMenuAttentionCount } from "@/lib/mobileFocusHomeState";
export function MobileFocusHome(props: { title: string; positionLabel?: string; attentionCount: number; userId?: string | null; children: JSX.Element; onHome?: () => void }) {
  const streak = () => computeCurrentStreak(new Date(), props.userId);
  createEffect(() => setMobileFocusMenuAttentionCount(props.attentionCount));
  onCleanup(() => setMobileFocusMenuAttentionCount(0));
  return <section class="flex h-[100dvh] min-h-0 flex-col bg-wedding-surface px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:hidden">
    <header class="flex min-h-14 items-center justify-between gap-2"><span class="w-12" aria-hidden="true"/><p class="min-w-0 flex-1 text-center text-sm font-semibold text-wedding-text" aria-live="polite">{props.title}{props.positionLabel ? ` · ${props.positionLabel}` : ""}</p><Show when={streak() >= 2} fallback={<span class="w-12"/>}><span class="rounded-full border border-wedding-accent bg-wedding-warm-note px-2 py-1 text-xs font-semibold text-wedding-text" aria-label={`${streak()}-day triage streak`}><span aria-hidden="true">🔥 </span>{streak()}</span></Show></header>
    <main class="flex min-h-0 flex-1 flex-col">{props.children}</main>
  </section>;
}
