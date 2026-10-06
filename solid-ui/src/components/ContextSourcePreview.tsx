// @locs-version: 1.0
import { createSignal, onCleanup, Show, type JSX } from "solid-js";
import { isMobileFocusViewport } from "@/lib/mobileFocusHomeState";
export type ContextSourcePreviewData = { title: string; summary: string; confidence?: string | null; why_surfaced?: string | null; thread_retrieval_state?: { summary?: string | null } | null };
export function ContextSourcePreview(props: { source: ContextSourcePreviewData; onOpenSource?: () => void; children: JSX.Element }) {
  const [open, setOpen] = createSignal(false); let timer: number | undefined;
  const show = () => { if (isMobileFocusViewport()) { setOpen(true); return; } timer = window.setTimeout(() => setOpen(true), 300); };
  const hide = () => { if (timer) window.clearTimeout(timer); timer = window.setTimeout(() => setOpen(false), 150); };
  onCleanup(() => { if (timer) window.clearTimeout(timer); });
  return <span class="relative inline-flex" onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide} onClick={show}>
    {props.children}
    <Show when={open()}><div role={isMobileFocusViewport() ? "dialog" : "tooltip"} class={isMobileFocusViewport() ? "fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-wedding-muted bg-wedding-surface p-4 shadow-panel" : "glass-card absolute bottom-full left-0 z-30 mb-2 w-72 rounded-2xl p-3 text-left shadow-panel"}>
      <p class="text-sm font-semibold text-wedding-text">{props.source.title}</p><p class="mt-1 line-clamp-3 text-xs leading-5 text-wedding-muted">{props.source.summary}</p>
      <p class="mt-2 text-xs font-semibold text-wedding-text">{props.source.confidence || "Context available"}</p><Show when={props.source.why_surfaced}><p class="mt-1 line-clamp-1 text-xs text-wedding-muted">{props.source.why_surfaced}</p></Show><Show when={props.source.thread_retrieval_state?.summary}><p class="mt-1 text-xs text-wedding-muted">{props.source.thread_retrieval_state?.summary}</p></Show>
      <Show when={isMobileFocusViewport()}><div class="mt-3 flex gap-2"><button type="button" class="min-h-12 rounded-xl border-2 border-wedding-cta bg-white px-3 text-xs font-bold text-wedding-text hover:bg-wedding-surface-blush" onClick={() => props.onOpenSource?.()}>Open source</button><button type="button" class="min-h-12 rounded-xl border border-wedding-muted bg-white px-3 text-xs font-semibold text-wedding-text" onClick={() => setOpen(false)}>Close</button></div></Show>
    </div></Show>
  </span>;
}
