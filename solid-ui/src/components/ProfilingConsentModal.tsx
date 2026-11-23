// @locs-version: 1.0
import { createEffect, createSignal, Show } from "solid-js";
import { markConsentAsked, setProfilingEnabled } from "@/lib/profileLedger";
import { DialogShell } from "@/components/DialogShell";
import { InfoHint } from "@/components/InfoHint";

export function ProfilingConsentModal(props: { onDismiss: () => void }) {
  const [showMore, setShowMore] = createSignal(false);
  let acceptButtonRef: HTMLButtonElement | undefined;

  async function accept() {
    await setProfilingEnabled(true);
    markConsentAsked();
    props.onDismiss();
  }

  async function decline() {
    await setProfilingEnabled(false);
    markConsentAsked();
    props.onDismiss();
  }

  createEffect(() => {
    queueMicrotask(() => acceptButtonRef?.focus());
  });

  return (
    <DialogShell
      labelledBy="profiling-consent-title"
      describedBy="profiling-consent-description"
      focusableSelector='button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      overlayClass="fixed inset-0 z-50 flex items-end justify-center p-4 animate-fade-in sm:items-center bg-black/30 backdrop-blur-sm"
      dialogClass="relative w-full max-w-md rounded-3xl border border-white/50 bg-white/85 p-6 space-y-4 shadow-2xl backdrop-blur-xl"
      onClose={props.onDismiss}
    >
      <>
        <div class="flex items-start gap-3">
          <span class="mt-0.5 select-none text-2xl leading-none">🧠</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p id="profiling-consent-title" class="text-sm font-semibold text-on-surface">Personalise your AI</p>
              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                class="touch-target inline-flex items-center justify-center rounded-full"
                aria-expanded={showMore()}
                aria-controls="profiling-consent-details"
                aria-label={showMore() ? "Hide profiling details" : "Show profiling details"}
              >
                <InfoHint text="What OmnyID observes, how the profile ledger is stored, and the privacy guardrails around it." />
              </button>
            </div>
            <p id="profiling-consent-description" class="mt-1.5 text-sm leading-6 text-on-surface-variant">
              OmnyID can adapt to how you edit drafts and use features. The profile ledger stays on this device and can be reviewed or cleared in <strong class="text-on-surface">{"Settings -> Profile Ledger"}</strong>.
            </p>
          </div>
        </div>

        <Show when={showMore()}>
          <div id="profiling-consent-details" class="animate-fade-in space-y-2 rounded-2xl border border-white/60 bg-white/60 p-4 text-xs leading-5 text-on-surface-variant">
            <p><strong class="text-on-surface">What's observed:</strong> Edits to AI-drafted text, features used, writing tone choices.</p>
            <p><strong class="text-on-surface">What's never observed:</strong> Content from messages you mark as ephemeral in System Settings.</p>
            <p><strong class="text-on-surface">Storage:</strong> Your Profile Ledger lives exclusively in your browser's local storage. It never leaves your device.</p>
            <p><strong class="text-on-surface">Your controls:</strong> View, delete individual entries, or reset the entire ledger at any time from {"Settings -> Profile Ledger"}.</p>
            <p><strong class="text-on-surface">Privacy guardrails:</strong> A single session never shifts your profile. Patterns require at least 3 temporally dispersed signals to be recorded.</p>
          </div>
        </Show>

        <div class="flex flex-wrap gap-2 pt-1">
          <button
            ref={acceptButtonRef}
            type="button"
            onClick={accept}
            class="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/80"
          >
            Got it
          </button>
          <button
            type="button"
            onClick={decline}
            class="flex-1 rounded-xl border border-outline-variant/50 bg-white/60 px-4 py-2.5 text-sm font-medium text-on-surface-variant transition hover:bg-white/90"
          >
            Turn off
          </button>
        </div>
      </>
    </DialogShell>
  );
}
