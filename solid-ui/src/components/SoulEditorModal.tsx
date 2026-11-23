// @locs-version: 1.0
import { Show } from "solid-js";
import { DialogShell } from "./DialogShell";
import type { AgentSettingsSoulFailureReceipt } from "@/lib/agentSettingsSoulFailureState";

type Props = {
  open: boolean;
  value: string;
  error: AgentSettingsSoulFailureReceipt | null;
  saving: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export function SoulEditorModal(props: Props) {
  let editor: HTMLTextAreaElement | undefined;
  return (
    <DialogShell
      open={props.open}
      dialogId="soul-editor-dialog"
      labelledBy="soul-editor-title"
      describedBy="soul-editor-description"
      busy={props.saving}
      focusableSelector='button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      overlayClass="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-on-surface/30 p-4 backdrop-blur-sm animate-fade-in"
      dialogClass="glass-surface mx-4 w-full max-w-2xl rounded-2xl border border-white/45 p-6 shadow-panel"
      dialogStyle={{ "max-height": "min(720px, calc(100vh - 32px))", overflow: "auto" }}
      onClose={props.onClose}
    >
      <>
          <div class="mb-3 flex items-center justify-between">
            <div>
              <p id="soul-editor-title" class="text-sm font-semibold text-on-surface">Edit Personality &amp; Rules</p>
              <p id="soul-editor-description" class="mt-0.5 text-[0.7em] text-on-surface-variant">Edits take effect on the next agent run.</p>
            </div>
            <button
              type="button"
              onClick={props.onClose}
              disabled={props.saving}
              aria-disabled={props.saving}
              aria-label="Close editor"
              class="text-on-surface-variant/50 transition hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              x
            </button>
          </div>
          <textarea
            ref={(element) => {
              editor = element;
              if (props.open) queueMicrotask(() => editor?.focus());
            }}
            value={props.value}
            disabled={props.saving}
            placeholder="Describe the agent's standing personality, tone, boundaries, and rules."
            class="min-h-[12em] w-full resize-y rounded-xl border border-white/20 bg-white/10 p-3 font-mono text-xs leading-5 text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            onInput={(event) => props.onChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                props.onSave();
              }
            }}
          />
          <div class="mt-3 flex flex-wrap items-center gap-3">
            <Show when={props.error}>
              {(receipt) => (
                <div
                  role="alert"
                  aria-live="assertive"
                  aria-atomic="true"
                  class={`rounded-lg border px-3 py-2 text-xs ${
                    receipt().tone === "danger"
                      ? "border-red-300/60 bg-red-50/70 text-red-900"
                      : "border-amber-300/60 bg-amber-50/70 text-amber-900"
                  }`}
                >
                  <p class="font-semibold">{receipt().title}</p>
                  <p class="mt-1">{receipt().summary}</p>
                  <p class="mt-1">{receipt().nextStep}</p>
                </div>
              )}
            </Show>
            <div class="flex-1" />
            <button
              type="button"
              onClick={props.onClose}
              disabled={props.saving}
              aria-disabled={props.saving}
              class="rounded-lg border border-white/40 bg-white/30 px-4 py-2 text-xs font-medium text-on-surface transition hover:bg-white/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={props.onSave}
              disabled={props.saving}
              aria-busy={props.saving}
              aria-disabled={props.saving}
              class="rounded-lg bg-primary px-5 py-2 text-xs font-medium text-white disabled:opacity-40 transition hover:bg-primary/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {props.saving ? "Saving..." : "Save"}
            </button>
          </div>
      </>
    </DialogShell>
  );
}
