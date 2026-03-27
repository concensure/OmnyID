import { createSignal, Show } from "solid-js";
import { apiFetch } from "../lib/api";

type Step = { key: string; label: string; options: Array<{ value: string; label: string; desc: string }> };

const STEPS: Step[] = [
  {
    key: "personality",
    label: "Agent Personality",
    options: [
      { value: "professional", label: "Professional & Focused", desc: "Precise, efficient, task-driven." },
      { value: "creative", label: "Creative & Curious", desc: "Exploratory, innovative, open-ended." },
      { value: "analytical", label: "Calm & Analytical", desc: "Methodical, data-driven, thorough." },
    ],
  },
  {
    key: "tone",
    label: "Tone",
    options: [
      { value: "concise", label: "Concise & Direct", desc: "Short, to the point." },
      { value: "friendly", label: "Friendly & Warm", desc: "Conversational, encouraging." },
      { value: "formal", label: "Formal & Precise", desc: "Structured, professional language." },
    ],
  },
  {
    key: "goals",
    label: "Goals",
    options: [
      { value: "productivity", label: "Productivity & Organization", desc: "Tasks, calendar, focus." },
      { value: "learning", label: "Learning & Research", desc: "Summarise, explore, discover." },
      { value: "communication", label: "Communication & Networking", desc: "Emails, messages, relationships." },
    ],
  },
  {
    key: "rules",
    label: "Rules",
    options: [
      { value: "privacy_first", label: "Privacy-first", desc: "Never share data externally without asking." },
      { value: "approval_gates", label: "Approval gates for all external actions", desc: "Confirm before any outbound action." },
      { value: "speed_focused", label: "Speed-focused", desc: "Act fast, ask for forgiveness later." },
    ],
  },
];

export function OnboardingWizard(props: { onComplete: () => void }) {
  const [step, setStep] = createSignal(0);
  const [answers, setAnswers] = createSignal<Record<string, string>>({});
  const [saving, setSaving] = createSignal(false);

  function choose(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function canAdvance() {
    return !!answers()[STEPS[step()].key];
  }

  function markDone() {
    try { window.localStorage.setItem("omnyid.onboarding.done", "true"); } catch { /* ignore */ }
  }

  async function finish() {
    setSaving(true);
    try {
      await apiFetch("/agent/onboarding", { method: "POST", bodyJson: answers() });
    } catch { /* best-effort — server may not have this endpoint yet */ }
    markDone();
    setSaving(false);
    props.onComplete();
  }

  function dismiss() {
    markDone();
    props.onComplete();
  }

  const current = () => STEPS[step()];
  const isLast = () => step() === STEPS.length - 1;

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div class="w-full max-w-lg rounded-2xl border border-white/20 bg-surface p-8 shadow-2xl">
        {/* Progress */}
        <div class="mb-6 flex gap-1.5">
          {STEPS.map((_, i) => (
            <div class={`h-1 flex-1 rounded-full transition-all ${i <= step() ? "bg-primary" : "bg-white/15"}`} />
          ))}
        </div>

        <p class="mb-1 text-xs font-medium uppercase tracking-widest text-on-surface-variant">
          Step {step() + 1} of {STEPS.length}
        </p>
        <h2 class="mb-1 text-xl font-semibold text-on-surface">{current().label}</h2>
        <p class="mb-5 text-xs text-on-surface-variant">You can change any of these later in <strong>Advanced → Agent Settings</strong>.</p>

        <div class="space-y-3">
          {current().options.map((opt) => (
            <button
              type="button"
              class={`w-full rounded-xl border px-4 py-3 text-left transition ${
                answers()[current().key] === opt.value
                  ? "border-primary bg-primary/10 text-on-surface"
                  : "border-white/15 bg-white/5 text-on-surface hover:border-white/30 hover:bg-white/10"
              }`}
              onClick={() => choose(current().key, opt.value)}
            >
              <p class="font-medium">{opt.label}</p>
              <p class="text-xs text-on-surface-variant">{opt.desc}</p>
            </button>
          ))}
        </div>

        <div class="mt-6 flex items-center justify-between">
          <Show when={step() > 0}>
            <button
              type="button"
              class="text-sm text-on-surface-variant hover:text-on-surface"
              onClick={() => setStep((s) => s - 1)}
            >
              ← Back
            </button>
          </Show>
          <div class="flex-1" />
          <div class="flex items-center gap-2">
            <Show when={!isLast()}>
              <button
                type="button"
                class="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white disabled:opacity-40 transition hover:bg-primary/80"
                disabled={!canAdvance()}
                onClick={() => setStep((s) => s + 1)}
              >
                Next →
              </button>
            </Show>
            <Show when={isLast()}>
              <button
                type="button"
                class="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white disabled:opacity-40 transition hover:bg-primary/80"
                disabled={!canAdvance() || saving()}
                onClick={finish}
              >
                {saving() ? "Saving…" : "Set up my agent ✓"}
              </button>
            </Show>
            <button
              type="button"
              class="rounded-lg border border-white/20 bg-white/10 px-5 py-2 text-sm font-medium text-on-surface-variant transition hover:bg-white/20"
              onClick={dismiss}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
