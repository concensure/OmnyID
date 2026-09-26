// @locs-version: 1.0
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import {
  subscribeAfpInspectEvent,
} from "@/lib/afpInspectEvent";
import { afpOptionalRecord } from "@/lib/afpMessageRecord";

export function AfpInspector() {
  const [message, setMessage] = createSignal<unknown>(null);
  const [copied, setCopied] = createSignal(false);

  onMount(() => {
    const unsubscribeAfpInspect = subscribeAfpInspectEvent((detail) => {
      setMessage(detail);
    });
    onCleanup(() => unsubscribeAfpInspect());
  });

  function close() { setMessage(null); }

  function copy() {
    const text = JSON.stringify(message(), null, 2);
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Show when={message() !== null}>
      {/* Backdrop */}
      <div class="fixed inset-0 z-[180] bg-on-surface/10 backdrop-blur-[2px]" onClick={close} />
      {/* Slide-over panel */}
      <div class="fixed right-0 top-0 z-[190] flex h-dvh w-full max-w-[min(100vw,32rem)] animate-slide-down flex-col border-l border-white/30 bg-white/96 shadow-panel backdrop-blur-xl"
        style="animation: slideInRight 0.2s ease-out">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-outline/10 px-4 py-3">
          <div class="min-w-0">
            <p class="break-words font-mono text-[9px] uppercase tracking-[0.2em] text-outline">AFP Message Inspector</p>
            <p class="mt-0.5 break-words text-xs text-on-surface-variant">Raw protocol payload</p>
          </div>
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <button type="button" onClick={copy}
              class="rounded-xl border border-outline/15 px-2.5 py-2 text-[11px] font-medium text-on-surface-variant transition hover:bg-on-surface/6 sm:py-1">
              {copied() ? "Copied âœ“" : "Copy JSON"}
            </button>
            <button type="button" onClick={close}
              class="flex h-9 w-9 items-center justify-center rounded-xl text-on-surface-variant/60 transition hover:bg-on-surface/6 hover:text-on-surface sm:h-7 sm:w-7">
              Ã—
            </button>
          </div>
        </div>
        <div class="flex-1 overflow-auto p-4">
          <pre class="whitespace-pre-wrap break-all rounded-2xl border border-outline/10 bg-on-surface/3 p-4 font-mono text-[11px] leading-5 text-on-surface/80">
            {JSON.stringify(message(), null, 2)}
          </pre>
        </div>
        {/* Signature / type metadata */}
        <Show when={afpOptionalRecord(message())}>
          {(m) => {
            return (
              <div class="flex min-w-0 flex-wrap gap-2 border-t border-outline/10 px-4 py-3">
                <Show when={m().type}>
                  <span class="max-w-full rounded-full bg-primary/10 px-2 py-1 font-mono text-[10px] text-primary break-words">{String(m().type)}</span>
                </Show>
                <Show when={m().thread_id}>
                  <span class="max-w-full rounded-full bg-on-surface/6 px-2 py-1 font-mono text-[10px] text-on-surface-variant break-all">
                    {String(m().thread_id)}
                  </span>
                </Show>
                <Show when={m().signature}>
                  <span class="max-w-full rounded-full bg-green-500/10 px-2 py-1 font-mono text-[10px] text-green-700 break-words">signed</span>
                </Show>
              </div>
            );
          }}
        </Show>
      </div>
    </Show>
  );
}
