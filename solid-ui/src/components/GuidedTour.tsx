import { createSignal, Show } from "solid-js";

const TOUR_KEY = "omnyid.tour.done";

const STEPS = [
  {
    icon: "🔒",
    title: "Your private space",
    body: "Everything you do here is end-to-end encrypted. Your agent stores only ciphertext — your messages are decrypted in this browser, in memory, and never saved as plaintext anywhere.",
  },
  {
    icon: "💬",
    title: "Talk to your master agent",
    body: "Type anything in the chat bar — ask a question, add a task, take a note, or give a complex goal. Your agent classifies your intent automatically and acts accordingly.",
  },
  {
    icon: "⚡",
    title: "Agents work in the background",
    body: "When you set a goal, your master agent spins up sub-agents to handle it. You can check their status in the Fleet panel (left sidebar) at any time.",
  },
  {
    icon: "🗂",
    title: "Switch views anytime",
    body: "Use the top nav to switch between Chat, Threads, and Email. Advanced tools like the Python runner are under the Advanced toggle — they're there when you need them.",
  },
];

export function GuidedTour(props: { onComplete: () => void }) {
  const [step, setStep] = createSignal(0);

  function finish() {
    localStorage.setItem(TOUR_KEY, "true");
    props.onComplete();
  }

  const isLast = () => step() === STEPS.length - 1;
  const current = () => STEPS[step()];

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="w-full max-w-md rounded-2xl border border-white/20 bg-surface p-8 shadow-2xl">
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

        {/* Content */}
        <div class="text-center">
          <div class="mb-4 text-5xl">{current().icon}</div>
          <h2 class="mb-3 text-xl font-semibold text-on-surface">{current().title}</h2>
          <p class="text-sm leading-7 text-on-surface-variant">{current().body}</p>
        </div>

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
                Let's go →
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
      </div>
    </div>
  );
}

export function shouldShowTour(): boolean {
  return localStorage.getItem(TOUR_KEY) !== "true";
}
