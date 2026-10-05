// @locs-version: 1.0
import { Show, type JSX } from "solid-js";
import { computeCurrentStreak } from "@/lib/decisionOsHomeState";
import { mobileFocusMenuOpen, setMobileFocusMenuOpen } from "@/lib/mobileFocusHomeState";
export function MobileFocusHome(props: { title: string; positionLabel?: string; attentionCount: number; userId?: string | null; children: JSX.Element; onHome?: () => void }) {
  const streak = () => computeCurrentStreak(new Date(), props.userId);
  return <section class="flex h-[100dvh] min-h-0 flex-col bg-wedding-surface px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:hidden">
    <header class="flex min-h-14 items-center justify-between gap-2"><button type="button" class="relative min-h-12 rounded-xl border border-wedding-muted bg-white px-3 text-sm font-semibold text-wedding-text" aria-haspopup="dialog" aria-expanded={mobileFocusMenuOpen()} onClick={() => setMobileFocusMenuOpen(true)}>Menu<Show when={props.attentionCount > 0}><span class="ml-1 rounded-full bg-wedding-accent px-1.5 py-0.5 text-xs text-white">{props.attentionCount}</span></Show></button><p class="min-w-0 flex-1 text-center text-sm font-semibold text-wedding-text" aria-live="polite">{props.title}{props.positionLabel ? ` · ${props.positionLabel}` : ""}</p><Show when={streak() >= 2} fallback={<span class="w-12"/>}><span class="rounded-full border border-wedding-accent bg-wedding-warm-note px-2 py-1 text-xs font-semibold text-wedding-text" aria-label={`${streak()}-day triage streak`}><span aria-hidden="true">🔥 </span>{streak()}</span></Show></header>
    <main class="flex min-h-0 flex-1 flex-col">{props.children}</main>
  </section>;
}
