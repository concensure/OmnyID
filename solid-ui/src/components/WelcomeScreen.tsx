// @locs-version: 1.0
import { createSignal, Show } from "solid-js";
import { onboard, readSession } from "@/lib/api";
import { completeWelcomeOnboarding } from "@/lib/onboardingLocalState";
import {
  buildWelcomeScreenFailureReceipt,
  type WelcomeScreenFailureReceipt,
} from "@/lib/welcomeScreenFailureState";

type Step = "welcome" | "goals" | "tone";

const GOALS = [
  { value: "productivity", label: "Stay organised", desc: "Tasks, calendar, smart reminders." },
  { value: "learning", label: "Research & learn", desc: "Summarise, explore, discover topics." },
  { value: "communication", label: "Manage communications", desc: "Emails, messages, follow-ups." },
];

const TONES = [
  { value: "concise", label: "Concise & direct", desc: "Short, to the point - no fluff." },
  { value: "friendly", label: "Friendly & warm", desc: "Conversational, encouraging, approachable." },
  { value: "formal", label: "Formal & precise", desc: "Structured, professional language." },
];

export function WelcomeScreen(props: { onComplete: () => void; userId?: string | null }) {
  const [step, setStep] = createSignal<Step>("welcome");
  const [goal, setGoal] = createSignal("");
  const [tone, setTone] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal<WelcomeScreenFailureReceipt | null>(null);

  const displayName = () => readSession()?.user?.display_name ?? "there";
  const markDone = () => completeWelcomeOnboarding(props.userId);

  function isMissingOnboardingEndpoint(cause: unknown) {
    return cause instanceof Error && cause.message.includes("Request failed with 404");
  }

  async function finish() {
    setSaving(true);
    setSaveError(null);
    try {
      await onboard({ goals: goal(), tone: tone() });
    } catch (cause: unknown) {
      if (isMissingOnboardingEndpoint(cause)) {
        markDone();
        setSaving(false);
        props.onComplete();
        return;
      }
      setSaveError(
        buildWelcomeScreenFailureReceipt(
          "Save onboarding",
          cause instanceof Error ? cause.message : "Could not save onboarding preferences.",
        ),
      );
      setSaving(false);
      return;
    }
    markDone();
    setSaving(false);
    props.onComplete();
  }

  function skip() {
    markDone();
    props.onComplete();
  }

  const progressBar = (filled: number) => (
    <div class="mb-5 flex gap-1.5">
      {[1, 2].map((i) => (
        <div
          class={`h-1 flex-1 rounded-full transition-all duration-300 ${
            i <= filled ? "bg-primary" : "bg-white/15"
          }`}
        />
      ))}
    </div>
  );

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div class="w-full max-w-md rounded-2xl border border-white/20 bg-surface p-8 shadow-2xl">
        <Show when={step() === "welcome"}>
          <div class="text-center space-y-4">
            <div class="text-5xl mb-2 select-none">*</div>
            <h2 class="text-2xl font-semibold text-on-surface">
              Welcome, {displayName()}!
            </h2>
            <p class="text-sm leading-6 text-on-surface-variant">
              Your agent is set up and waiting. A quick question or two will help it
              work the way you think from the first message onward.
            </p>
            <div class="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-left">
              <p class="text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">
                How to start
              </p>
              <p class="mt-2 text-xs leading-5 text-on-surface-variant">
                Ask the lightweight agent bar when you want guidance or search.
              </p>
              <p class="text-xs leading-5 text-on-surface-variant">
                Press Ctrl+N or use Compose when you need to type into a note, email, task, event, or message.
              </p>
            </div>
            <div class="flex flex-col gap-2 pt-2">
              <button
                type="button"
                class="w-full rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary/80"
                onClick={() => {
                  if (saveError()) setSaveError(null);
                  setStep("goals");
                }}
              >
                Personalise in 20 seconds {"->"}
              </button>
              <button
                type="button"
                class="w-full rounded-lg px-4 py-2 text-xs text-on-surface-variant hover:text-on-surface transition"
                onClick={skip}
              >
                Skip - take me to my workspace
              </button>
            </div>
            <p class="text-[10px] text-on-surface-variant opacity-50">
              You can always change these in Agent Settings later.
            </p>
          </div>
        </Show>

        <Show when={step() === "goals"}>
          <div class="space-y-4">
            {progressBar(1)}
            <div>
              <p class="text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">
                Step 1 of 2
              </p>
              <h2 class="mt-1 text-xl font-semibold text-on-surface">
                What do you mainly use it for?
              </h2>
            </div>
            <div class="space-y-2">
              {GOALS.map((g) => (
                <button
                  type="button"
                  class={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    goal() === g.value
                      ? "border-primary bg-primary/10"
                      : "border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/10"
                  }`}
                  onClick={() => {
                    if (saveError()) setSaveError(null);
                    setGoal(g.value);
                  }}
                >
                  <p class="text-sm font-medium text-on-surface">{g.label}</p>
                  <p class="text-xs text-on-surface-variant">{g.desc}</p>
                </button>
              ))}
            </div>
            <div class="flex items-center justify-between pt-1">
              <button
                type="button"
                class="text-xs text-on-surface-variant hover:text-on-surface transition"
                onClick={skip}
              >
                Skip - take me to my workspace
              </button>
              <button
                type="button"
                disabled={!goal()}
                class="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white disabled:opacity-40 transition hover:bg-primary/80"
                onClick={() => {
                  if (saveError()) setSaveError(null);
                  setStep("tone");
                }}
              >
                Next {"->"}
              </button>
            </div>
          </div>
        </Show>

        <Show when={step() === "tone"}>
          <div class="space-y-4">
            {progressBar(2)}
            <div>
              <p class="text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">
                Step 2 of 2
              </p>
              <h2 class="mt-1 text-xl font-semibold text-on-surface">
                How should your agent talk to you?
              </h2>
            </div>
            <div class="space-y-2">
              {TONES.map((t) => (
                <button
                  type="button"
                  class={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    tone() === t.value
                      ? "border-primary bg-primary/10"
                      : "border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/10"
                  }`}
                  onClick={() => {
                    if (saveError()) setSaveError(null);
                    setTone(t.value);
                  }}
                >
                  <p class="text-sm font-medium text-on-surface">{t.label}</p>
                  <p class="text-xs text-on-surface-variant">{t.desc}</p>
                </button>
              ))}
            </div>
            <div class="flex items-center justify-between pt-1">
              <button
                type="button"
                class="text-xs text-on-surface-variant hover:text-on-surface transition"
                onClick={() => setStep("goals")}
              >
                {"<- Back"}
              </button>
              <button
                type="button"
                disabled={!tone() || saving()}
                class="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white disabled:opacity-40 transition hover:bg-primary/80"
                onClick={finish}
              >
                {saving() ? "Saving..." : "Done ->"}
              </button>
            </div>
            <Show when={saveError()}>
              <div
                class={`rounded-xl border px-4 py-3 text-xs ${
                  saveError()?.tone === "danger"
                    ? "border-red-400/20 bg-red-500/10 text-red-300"
                    : "border-amber-300/20 bg-amber-500/10 text-amber-200"
                }`}
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="space-y-1">
                    <p class="font-semibold">{saveError()?.title}</p>
                    <p>{saveError()?.summary}</p>
                    <p class="opacity-80">Next step: {saveError()?.nextStep}</p>
                  </div>
                  <button
                    type="button"
                    class="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-current transition hover:bg-white/10"
                    onClick={() => setSaveError(null)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}
