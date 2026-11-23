// @locs-version: 1.0
import { Show } from "solid-js";

import { DialogShell } from "@/components/DialogShell";

export function WeddingConfirmDialog(props: {
  open: boolean;
  title: string;
  detail: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = "wedding-confirm-dialog-title";
  const detailId = "wedding-confirm-dialog-detail";
  return (
    <Show when={props.open}>
      <DialogShell
        open
        labelledBy={titleId}
        describedBy={detailId}
        busy={props.busy}
        focusableSelector="button:not([disabled])"
        overlayClass="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:items-center"
        dialogClass="w-full max-w-md rounded-2xl border border-wedding-border bg-white p-4 shadow-2xl sm:p-5"
        onClose={() => { if (!props.busy) props.onCancel(); }}
      >
        <h2 id={titleId} class="font-display text-xl font-bold text-wedding-ink">{props.title}</h2>
        <p id={detailId} class="mt-2 text-sm leading-6 text-wedding-ink/75">{props.detail}</p>
        <div class="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={props.busy}
            class="min-h-12 rounded-xl border-2 border-wedding-primary bg-white px-4 text-base font-bold text-wedding-primary disabled:opacity-55"
            onClick={props.onCancel}
          >
            {props.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            disabled={props.busy}
            class={`min-h-12 rounded-xl px-4 text-base font-bold text-white disabled:opacity-55 ${props.destructive ? "bg-red-700 hover:bg-red-800" : "bg-wedding-primary hover:brightness-95"}`}
            onClick={props.onConfirm}
          >
            {props.busy ? "Saving…" : props.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </DialogShell>
    </Show>
  );
}
