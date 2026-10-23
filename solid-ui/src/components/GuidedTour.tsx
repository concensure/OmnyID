import { createSignal, Show } from "solid-js";
import { DialogShell } from "@/components/DialogShell";
import { loadShouldShowGuidedTour, saveGuidedTourSeen } from "@/lib/guidedTourLocalState";

type InfoStep = { kind: "info"; icon: string; title: string; body: string };
type SetupStep = { kind: "setup" };
type Step = InfoStep | SetupStep;

const STEPS: Step[] = [
  {
    kind: "info",
    icon: "🔒",
    title: "Your private space",
    body: "Everything you do here is end-to-end encrypted. Your agent stores only ciphertext — your messages are decrypted in this browser, in memory, and never saved as plaintext anywhere.",
  },
  {
    kind: "info",
    icon: "💬",
    title: "Talk to your master agent",
    body: "Type anything in the chat bar — ask a question, add a task, take a note, or give a complex goal. Your agent classifies your intent automatically and acts accordingly.",
  },
  {
    kind: "info",
    icon: "⚡",
    title: "Agents work in the background",
    body: "When you set a goal, your master agent spins up sub-agents to handle it. You can check their status in the Fleet panel at any time.",
  },
  { kind: "setup" },
];

const SETUP_ROWS = [
  { label: "AI model",   description: "Powers replies, summaries, research",     minutes: 3 },
  { label: "Gmail",      description: "Email triage and smart replies",           minutes: 2 },
  { label: "Calendar",   description: "Scheduling awareness for your agent",      minutes: 2 },
  { label: "MCP tools",  description: "Custom structured actions",                minutes: 5 },
  { label: "Skills",     description: "Preset workflows for common tasks",        minutes: 1 },
];

export function GuidedTour(props: { onComplete: () => void; userId?: string }) {
  const [step, setStep] = createSignal(0);

  function finish() {
    saveGuidedTourSeen(props.userId);
    props.onComplete();
  }

  const isLast = () => step() === STEPS.length - 1;
  const current = () => STEPS[step()];

  return (
    <DialogShell
      labelledBy="guided-tour-title"
      focusableSelector="button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])"
      overlayClass="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      dialogClass="relative w-full max-w-md rounded-2xl border border-white/20 bg-surface p-8 shadow-2xl animate-fade-in"
      onClose={finish}
    >
        <button
          type="button"
          aria-label="Close tour"
          onClick={finish}
          class="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant/50 transition hover:bg-on-surface/8 hover:text-on-surface"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>

        {/* Step dots */}
        <div class="mb-6 flex justify-center gap-2">
          {STEPS.map((_, i) => (
            <div
              class={`h-1.5 w-6 rounded-full transition-all ${
                i === step() ? "bg-primary" : i < step() ? "bg-primary/40" : "bg-white/15"
              }`}
            />
          ))}
        </div>

        {/* Info step */}
        <Show when={current().kind === "info"}>
          {(() => {
            const s = current() as InfoStep;
            return (
              <div class="text-center">
                <div class="mb-4 text-5xl">{s.icon}</div>
                <h2 id="guided-tour-title" class="mb-3 text-xl font-semibold text-on-surface">{s.title}</h2>
                <p class="text-sm leading-7 text-on-surface-variant">{s.body}</p>
              </div>
            );
          })()}
        </Show>

        {/* Setup checklist step */}
        <Show when={current().kind === "setup"}>
          <div>
            <div class="mb-5 text-center">
              <div class="mb-3 text-4xl">🛠</div>
              <h2 id="guided-tour-title" class="text-xl font-semibold text-on-surface">Set up your workspace</h2>
              <p class="mt-2 text-sm text-on-surface-variant">
                A few quick connections unlock the most value. All optional — you can do them later.
              </p>
            </div>

            {/* Borderless table */}
            <div class="mt-1">
              {/* Header */}
              <div class="mb-1.5 grid grid-cols-[1fr_2fr_4rem] gap-x-3 px-1 text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                <span>Setup</span>
                <span>What it enables</span>
                <span class="text-right">Time</span>
              </div>
              <div class="space-y-0">
                {SETUP_ROWS.map((row) => (
                  <div class="grid grid-cols-[1fr_2fr_4rem] gap-x-3 rounded-lg px-1 py-2">
                    <span class="text-sm font-medium text-on-surface">{row.label}</span>
                    <span class="text-xs text-on-surface-variant">{row.description}</span>
                    <span class="text-right text-xs text-on-surface-variant">~{row.minutes} min</span>
                  </div>
                ))}
              </div>
            </div>

            <p class="mt-3 px-1 text-xs text-on-surface-variant">
              Weather and maps are active by default — no setup needed.
            </p>
          </div>
        </Show>

        {/* Navigation */}
        <div class="mt-8 flex items-center justify-between">
          <Show
            when={step() > 0}
            fallback={
              <button
                type="button"
                class="text-sm text-on-surface-variant hover:text-on-surface"
                onClick={finish}
              >
                Skip
              </button>
            }
          >
            <button
              type="button"
              class="text-sm text-on-surface-variant hover:text-on-surface"
              onClick={() => setStep((s) => s - 1)}
            >
              ← Back
            </button>
          </Show>

          <Show
            when={!isLast()}
            fallback={
              <button
                type="button"
                class="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/80"
                onClick={finish}
              >
                Get started →
              </button>
            }
          >
            <button
              type="button"
              class="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/80"
              onClick={() => setStep((s) => s + 1)}
            >
              Next →
            </button>
          </Show>
        </div>
    </DialogShell>
  );
}
