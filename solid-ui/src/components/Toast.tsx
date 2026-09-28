// @locs-version: 1.0
import { createSignal, For, Show, onCleanup } from "solid-js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "info" | "warning";

export type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
  action?: { label: string; onClick: () => void };
};

// ── Store (module-level singleton) ────────────────────────────────────────────

const [toasts, setToasts] = createSignal<ToastItem[]>([]);
let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function dismiss(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  setToasts((prev) => prev.filter((t) => t.id !== id));
}

/**
 * Show a toast notification. Returns the toast id so callers can dismiss early.
 * Duration defaults: error = 6s, warning = 5s, info/success = 3.5s.
 */
export function showToast(
  message: string,
  variant: ToastVariant = "info",
  options?: { duration?: number; action?: ToastItem["action"] },
): number {
  const id = nextId++;
  const duration = options?.duration ?? (variant === "error" ? 6000 : variant === "warning" ? 5000 : 3500);
  const item: ToastItem = { id, message, variant, action: options?.action };
  setToasts((prev) => [...prev.slice(-4), item]); // cap stack at 5
  timers.set(id, setTimeout(() => dismiss(id), duration));
  return id;
}

/** Convenience wrappers */
export const toast = {
  success: (msg: string, opts?: Parameters<typeof showToast>[2]) => showToast(msg, "success", opts),
  error:   (msg: string, opts?: Parameters<typeof showToast>[2]) => showToast(msg, "error",   opts),
  info:    (msg: string, opts?: Parameters<typeof showToast>[2]) => showToast(msg, "info",    opts),
  warning: (msg: string, opts?: Parameters<typeof showToast>[2]) => showToast(msg, "warning", opts),
};

// ── Visual config ─────────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<ToastVariant, { border: string; icon: string; iconColor: string }> = {
  success: { border: "border-emerald-200/60", icon: "✓", iconColor: "text-emerald-500" },
  error:   { border: "border-red-200/60",     icon: "✕", iconColor: "text-red-500"     },
  info:    { border: "border-primary/20",      icon: "ℹ", iconColor: "text-primary"    },
  warning: { border: "border-amber-200/60",   icon: "⚠", iconColor: "text-amber-500"  },
};

// ── ToastItem component ───────────────────────────────────────────────────────

function ToastEntry(props: { item: ToastItem }) {
  const styles = () => VARIANT_STYLES[props.item.variant];
  let el: HTMLDivElement | undefined;

  onCleanup(() => {
    if (el) el.style.opacity = "0";
  });

  return (
    <div
      ref={el}
      role="alert"
      aria-live="assertive"
      class={`flex items-center gap-3 rounded-2xl border ${styles().border} bg-white/92 px-4 py-3 shadow-lg backdrop-blur-md transition-all duration-300 animate-fade-in`}
      style="min-width: 260px; max-width: 380px;"
    >
      <span class={`text-base leading-none select-none ${styles().iconColor}`}>
        {styles().icon}
      </span>
      <span class="flex-1 text-sm text-on-surface leading-snug">{props.item.message}</span>
      <Show when={props.item.action}>
        {(action) => (
          <button
            type="button"
            class="rounded-full border border-primary/20 px-2.5 py-0.5 text-[11px] font-semibold text-primary transition hover:bg-primary/10 shrink-0"
            onClick={() => { action().onClick(); dismiss(props.item.id); }}
          >
            {action().label}
          </button>
        )}
      </Show>
      <button
        type="button"
        aria-label="Dismiss"
        class="ml-1 text-on-surface-variant/40 hover:text-on-surface-variant transition text-base leading-none shrink-0"
        onClick={() => dismiss(props.item.id)}
      >
        ×
      </button>
    </div>
  );
}

// ── ToastContainer — mount once in App.tsx ────────────────────────────────────

export function ToastContainer() {
  return (
    <div
      class="fixed bottom-6 right-5 z-[9998] flex flex-col-reverse gap-2 pointer-events-none"
      aria-label="Notifications"
    >
      <For each={toasts()}>
        {(item) => (
          <div class="pointer-events-auto">
            <ToastEntry item={item} />
          </div>
        )}
      </For>
    </div>
  );
}
