import { createEffect, createMemo, createSignal, For, onMount, Show } from "solid-js";
import { fetchGmailStatus, fetchLlmConfig, onboard, type LlmConfig } from "../lib/api";
import type { GmailConnectionStatus } from "../lib/gmailConnectionState";
import {
  buildOnboardingWizardFailureReceipt,
  type OnboardingWizardFailureReceipt,
} from "../lib/onboardingWizardFailureState";
import {
  buildOnboardingActivationItems,
  onboardingActivationSummary,
} from "../lib/onboardingActivationState";
import { buildStudentActivationLaunchState } from "../lib/studentActivationLaunchState";
import {
  DEFAULT_STUDENT_ONBOARDING_QUICK_START,
  STUDENT_ONBOARDING_QUICK_STARTS,
  type OnboardingQuickStartSeed,
} from "../lib/onboardingQuickStart";
import { saveOnboardingDone } from "../lib/onboardingLocalState";
import { buildOnboardingStudentFastPathState } from "../lib/onboardingStudentFastPathState";
import {
  buildReportIntentFromFocus,
  saveReportNavigationIntent,
} from "../lib/reportNavigationState";
import {
  loadStudyReportArtifacts,
  type StudyReportArtifact,
} from "../lib/studyReportArtifactLocalState";
import { DialogShell } from "./DialogShell";
import { GenesisLogoAnimation } from "./GenesisLogoAnimation";

function quickStartTimeToValue(seed: OnboardingQuickStartSeed): string {
  return seed.timeToValueLabel ?? "Useful study output in the first run";
}

function quickStartOutputs(seed: OnboardingQuickStartSeed): string[] {
  if ((seed.firstOutputs?.length ?? 0) > 0) return seed.firstOutputs!;
  return [
    "A grounded answer based on the attached study material",
    "Clearer next steps so the student knows what to do next",
    "Retained study memory that stays searchable after the run",
  ];
}

function quickStartModeLabel(seed: OnboardingQuickStartSeed): string {
  return seed.knowledgeMode === "zettelkasten" ? "Zettelkasten" : "Connected notes";
}

function quickStartRetentionLabel(seed: OnboardingQuickStartSeed): string {
  if (seed.retentionMode === "keep_file") return "Keep files";
  if (seed.retentionMode === "keep_nothing") return "Session only";
  return "Keep extracted";
}

type Step = {
  key: string;
  label: string;
  options: Array<{ value: string; label: string; desc: string }>;
};

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

type ActivationTargetView = "agent_settings" | "email" | "reports" | "search";

export type OnboardingNavigationOptions = {
  focusLlm?: boolean;
  quickStart?: OnboardingQuickStartSeed;
};

export function OnboardingWizard(props: {
  onComplete: () => void;
  onNavigate?: (view: ActivationTargetView, options?: OnboardingNavigationOptions) => void;
}) {
  const [step, setStep] = createSignal(0);
  const [answers, setAnswers] = createSignal<Record<string, string>>({});
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<OnboardingWizardFailureReceipt | null>(null);
  const [phase, setPhase] = createSignal<"questions" | "activation">("questions");
  const [activationLoading, setActivationLoading] = createSignal(false);
  const [llmConfig, setLlmConfig] = createSignal<LlmConfig | null>(null);
  const [gmailStatus, setGmailStatus] = createSignal<GmailConnectionStatus | null>(null);
  const [savedReportArtifacts, setSavedReportArtifacts] = createSignal<StudyReportArtifact[]>([]);
  let wizardDialogRef: HTMLDivElement | undefined;

  const current = () => STEPS[step()];
  const isLast = () => step() === STEPS.length - 1;
  const activationItems = createMemo(() => buildOnboardingActivationItems(llmConfig(), gmailStatus()));
  const activationSummary = createMemo(() => onboardingActivationSummary(llmConfig(), gmailStatus()));
  const llmReady = createMemo(() =>
    activationItems().find((item) => item.id === "llm")?.ready ?? false,
  );
  const gmailReady = createMemo(() =>
    activationItems().find((item) => item.id === "gmail")?.ready ?? false,
  );
  const studentLaunchState = createMemo(() =>
    buildStudentActivationLaunchState({
      llmReady: llmReady(),
      gmailReady: gmailReady(),
      recommendedSeed: DEFAULT_STUDENT_ONBOARDING_QUICK_START,
      savedReportArtifacts: savedReportArtifacts(),
    }),
  );
  const studentFastPathState = createMemo(() =>
    buildOnboardingStudentFastPathState({
      currentStep: step() + 1,
      totalSteps: STEPS.length,
    }),
  );

  function canAdvance() {
    return !!answers()[STEPS[step()].key];
  }

  function choose(key: string, value: string) {
    if (saving()) return;
    if (key !== current().key) return;
    if (!current().options.some((option) => option.value === value)) return;
    if (error()) setError(null);
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function moveStep(delta: number) {
    if (saving()) return;
    if (delta > 0 && !canAdvance()) return;
    if (error()) setError(null);
    setStep((currentStep) => Math.min(STEPS.length - 1, Math.max(0, currentStep + delta)));
  }

  function markDone() {
    saveOnboardingDone();
  }

  function isMissingOnboardingEndpoint(cause: unknown) {
    return cause instanceof Error && cause.message.includes("Request failed with 404");
  }

  async function finish() {
    if (saving() || !isLast() || !canAdvance()) return;
    setSaving(true);
    setError(null);
    try {
      await onboard(answers());
      await loadActivationState();
      setPhase("activation");
    } catch (cause: unknown) {
      if (isMissingOnboardingEndpoint(cause)) {
        await loadActivationState();
        setPhase("activation");
        return;
      }
      setError(
        buildOnboardingWizardFailureReceipt(
          "Save onboarding",
          cause instanceof Error ? cause.message : "Failed to save onboarding.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  function dismiss() {
    markDone();
    props.onComplete();
  }

  async function loadActivationState() {
    setActivationLoading(true);
    try {
      const [config, gmailStatus] = await Promise.all([
        fetchLlmConfig().catch(() => null),
        fetchGmailStatus()
          .catch(() => ({ connected: false, gmail_email: "", configured: true })),
      ]);
      setLlmConfig(config);
      setGmailStatus(gmailStatus);
    } finally {
      setActivationLoading(false);
    }
  }

  function openActivationTarget(view: ActivationTargetView) {
    markDone();
    props.onComplete();
    props.onNavigate?.(view, view === "agent_settings" ? { focusLlm: true } : undefined);
  }

  async function skipToStudyActivation() {
    if (saving() || activationLoading()) return;
    setError(null);
    await loadActivationState();
    setPhase("activation");
  }

  function openStudyQuickStart(seed: OnboardingQuickStartSeed) {
    if (!llmReady()) return;
    markDone();
    props.onComplete();
    props.onNavigate?.("search", {
      quickStart: {
        ...seed,
        entryPoint: "onboarding",
        originLabel: seed.originLabel ?? "From onboarding",
        focusBadges: seed.focusBadges ?? ["first session"],
      },
    });
  }

  function requestDismiss() {
    if (saving()) return;
    dismiss();
  }

  function focusOnboardingOption(value: string) {
    const element = wizardDialogRef?.querySelector<HTMLButtonElement>(`[data-onboarding-option="${value}"]`);
    element?.focus();
  }

  function handleOptionKeyDown(optionValue: string, event: KeyboardEvent) {
    if (saving()) return;
    const options = current().options;
    const currentIndex = options.findIndex((opt) => opt.value === optionValue);
    if (currentIndex < 0) return;

    if (event.key === "ArrowDown" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (currentIndex + direction + options.length) % options.length;
      const nextOption = options[nextIndex];
      choose(current().key, nextOption.value);
      focusOnboardingOption(nextOption.value);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      const nextOption = options[0];
      choose(current().key, nextOption.value);
      focusOnboardingOption(nextOption.value);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      const nextOption = options[options.length - 1];
      choose(current().key, nextOption.value);
      focusOnboardingOption(nextOption.value);
    }
  }

  onMount(() => {
    setSavedReportArtifacts(loadStudyReportArtifacts());
  });

  createEffect(() => {
    phase();
    step();
    queueMicrotask(() => {
      const selected = phase() === "activation"
        ? wizardDialogRef?.querySelector<HTMLButtonElement>("[data-activation-primary]")
        : wizardDialogRef?.querySelector<HTMLButtonElement>('[data-onboarding-option][data-selected="true"]') ??
          wizardDialogRef?.querySelector<HTMLButtonElement>('[data-onboarding-option]');
      selected?.focus();
    });
  });

  return (
    <DialogShell
      labelledBy="onboarding-wizard-title"
      describedBy="onboarding-wizard-description"
      busy={saving()}
      focusableSelector='button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      overlayClass="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/60 p-4 backdrop-blur-sm"
      dialogClass="w-full max-w-lg rounded-2xl border border-white/20 bg-surface p-8 shadow-2xl"
      dialogStyle={{ "max-height": "min(720px, calc(100vh - 32px))", overflow: "auto" }}
      onClose={requestDismiss}
      dialogRef={(element) => {
        wizardDialogRef = element;
      }}
    >
      <>
        <Show
          when={phase() === "questions"}
          fallback={
            <>
              <div class="mb-6 flex gap-1.5">
                <div class="h-1 flex-1 rounded-full bg-primary" />
              </div>
              <div class="mb-4 flex items-center justify-center">
                <GenesisLogoAnimation size={120} class="rounded-full" />
              </div>
              <p class="mb-1 text-xs font-medium uppercase tracking-widest text-on-surface-variant">
                Activation check
              </p>
              <h2 id="onboarding-wizard-title" class="mb-1 text-xl font-semibold text-on-surface">
                Finish workspace setup
              </h2>
              <p id="onboarding-wizard-description" class="mb-5 text-sm text-on-surface-variant">
                {activationSummary()}
              </p>
              <Show when={activationLoading()}>
                <p class="mb-5 text-sm text-on-surface-variant" aria-live="polite">
                  Checking AI model and inbox connection...
                </p>
              </Show>
              <div class="space-y-3">
                <For each={activationItems()}>
                  {(item, index) => (
                    <div class="rounded-2xl border border-white/15 bg-white/5 p-4">
                      <div class="flex items-start justify-between gap-3">
                        <div>
                          <p class="text-sm font-semibold text-on-surface">{item.title}</p>
                          <p class={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            item.ready
                              ? "bg-emerald-500/15 text-emerald-200"
                              : "bg-amber-500/15 text-amber-200"
                          }`}>
                            {item.statusLabel}
                          </p>
                          <p class="mt-2 text-xs leading-5 text-on-surface-variant">{item.detail}</p>
                        </div>
                        <button
                          data-activation-primary={index() === 0 ? "true" : undefined}
                          type="button"
                          class="shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                          onClick={() => openActivationTarget(item.targetView)}
                        >
                          {item.actionLabel}
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
              <div class="mt-6 rounded-2xl border border-sky-400/15 bg-sky-500/8 p-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="max-w-lg">
                    <p class="text-xs font-medium uppercase tracking-[0.18em] text-sky-200/90">
                      Uni Quick Start
                    </p>
                    <h3 class="mt-1 text-base font-semibold text-on-surface">
                      Experience study value immediately
                    </h3>
                    <p class="mt-2 text-xs leading-5 text-on-surface-variant">
                      {llmReady()
                        ? "Open the workspace with a study-ready prompt already loaded. Then drag in lecture slides, notes, a PDF reading, or a voice memo to see connected notes in the first session."
                        : "Connect an AI model first so OmnyID can turn your study materials into connected notes, summaries, and comparisons."}
                    </p>
                  </div>
                  <Show when={!llmReady()}>
                    <button
                      type="button"
                      class="shrink-0 rounded-lg border border-amber-300/30 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      onClick={() => openActivationTarget("agent_settings")}
                    >
                      Connect AI first
                    </button>
                  </Show>
                </div>
                <div class={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                  studentLaunchState().tone === "emerald"
                    ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-50"
                    : studentLaunchState().tone === "sky"
                      ? "border-sky-300/25 bg-sky-500/10 text-sky-50"
                      : "border-amber-300/25 bg-amber-500/10 text-amber-50"
                }`}>
                  <p class="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">
                    Fastest student path
                  </p>
                  <p class="mt-1 font-medium">{studentLaunchState().headline}</p>
                  <p class="mt-1 text-xs leading-5 opacity-85">{studentLaunchState().detail}</p>
                </div>
                <Show when={studentLaunchState().savedReportMemory}>
                  {(memory) => (
                    <div class="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-4">
                      <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="max-w-lg">
                          <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/85">
                            Saved report memory
                          </p>
                          <p class="mt-1 text-sm font-semibold text-on-surface">{memory().headline}</p>
                          <p class="mt-2 text-xs leading-5 text-on-surface-variant">{memory().detail}</p>
                          <div class="mt-3 flex flex-wrap gap-1.5">
                            <For each={memory().chips}>
                              {(chip) => (
                                <span class="rounded-full border border-cyan-300/20 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50">
                                  {chip}
                                </span>
                              )}
                            </For>
                          </div>
                        </div>
                        <button
                          type="button"
                          class="shrink-0 rounded-lg border border-cyan-300/30 bg-cyan-500/15 px-4 py-2 text-xs font-semibold text-cyan-50 transition hover:bg-cyan-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                          onClick={() => {
                            if (llmReady()) {
                              openStudyQuickStart(memory().primaryQuickStartSeed);
                              return;
                            }
                            openActivationTarget("agent_settings");
                          }}
                        >
                          {llmReady() ? memory().primaryActionLabel : "Connect AI first"}
                        </button>
                      </div>
                      <div class="mt-3 space-y-2">
                        <For each={memory().recoveryItems}>
                          {(item) => (
                            <button
                              type="button"
                              disabled={!llmReady()}
                              class="w-full rounded-xl border border-white/10 bg-white/6 p-3 text-left transition hover:border-cyan-300/30 hover:bg-cyan-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => openStudyQuickStart(item.quickStartSeed)}
                            >
                              <div class="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p class="text-xs font-semibold text-on-surface">{item.title}</p>
                                  <p class="mt-1 text-[11px] leading-4 text-cyan-50/85">{item.subtitle}</p>
                                </div>
                                <span class="rounded-full border border-cyan-300/20 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50">
                                  Continue
                                </span>
                              </div>
                              <div class="mt-2 flex flex-wrap gap-1.5">
                                <For each={item.chips.slice(0, 8)}>
                                  {(chip) => (
                                    <span class="rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-on-surface-variant">
                                      {chip}
                                    </span>
                                  )}
                                </For>
                              </div>
                            </button>
                          )}
                        </For>
                      </div>
                    </div>
                  )}
                </Show>
                <div class="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                  <div class="rounded-2xl border border-violet-300/20 bg-violet-500/10 p-4">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-100/85">
                      {studentLaunchState().firstUploadTitle}
                    </p>
                    <p class="mt-2 text-xs leading-5 text-on-surface-variant">
                      {studentLaunchState().firstUploadDetail}
                    </p>
                  </div>
                  <div class="rounded-2xl border border-sky-300/20 bg-sky-500/10 p-4">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-100/85">
                      First run checklist
                    </p>
                    <div class="mt-2 space-y-2">
                      <For each={studentLaunchState().firstValueChecklist}>
                        {(item) => (
                          <div class="flex gap-2 text-xs leading-5 text-on-surface-variant">
                            <span class="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-[10px] font-semibold text-sky-100">
                              +
                            </span>
                            <span>{item}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </div>
                <div class="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="max-w-lg">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/85">
                        {studentLaunchState().firstMinuteTitle}
                      </p>
                      <p class="mt-2 text-xs leading-5 text-on-surface-variant">
                        {studentLaunchState().firstMinuteDetail}
                      </p>
                    </div>
                    <Show when={llmReady()}>
                      <button
                        type="button"
                        class="shrink-0 rounded-lg border border-emerald-300/30 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-50 transition hover:bg-emerald-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        onClick={() => openStudyQuickStart(studentLaunchState().featuredStarters[0]!.starter)}
                      >
                        Start best first run
                      </button>
                    </Show>
                  </div>
                  <div class="mt-3 space-y-2">
                    <For each={studentLaunchState().firstMinuteChecklist}>
                      {(item, index) => (
                        <div class="flex gap-2 text-xs leading-5 text-on-surface-variant">
                          <span class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] font-semibold text-emerald-100">
                            {index() + 1}
                          </span>
                          <span>{item}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
                <div class="mt-4">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant/80">
                        Featured study starts
                      </p>
                      <p class="mt-1 text-xs leading-5 text-on-surface-variant">
                        Show the fastest path first, keep one lower-effort fallback, and leave a deeper knowledge-building path available.
                      </p>
                    </div>
                  </div>
                  <div class="mt-3 grid gap-3 md:grid-cols-3">
                    <For each={studentLaunchState().featuredStarters}>
                      {(featured) => (
                        <button
                          type="button"
                          disabled={!llmReady()}
                          onClick={() => openStudyQuickStart(featured.starter)}
                          class={`rounded-2xl border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                            llmReady()
                              ? featured.slot === "primary"
                                ? "border-emerald-300/35 bg-emerald-500/10 text-on-surface hover:border-emerald-300/55 hover:bg-emerald-500/15"
                                : "border-white/15 bg-white/8 text-on-surface hover:border-sky-300/40 hover:bg-white/12"
                              : "cursor-not-allowed border-white/10 bg-white/5 text-on-surface-variant/55 opacity-70"
                          }`}
                        >
                          <div class="flex flex-wrap items-start justify-between gap-2">
                            <span class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                              featured.slot === "primary"
                                ? "border-emerald-300/30 bg-emerald-500/15 text-emerald-50"
                                : featured.slot === "secondary"
                                  ? "border-sky-300/30 bg-sky-500/12 text-sky-50"
                                  : "border-violet-300/30 bg-violet-500/12 text-violet-50"
                            }`}>
                              {featured.badge}
                            </span>
                            <span class="rounded-full border border-white/15 bg-white/8 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-on-surface-variant/85">
                              {quickStartModeLabel(featured.starter)}
                            </span>
                          </div>
                          <p class="mt-3 text-sm font-semibold">{featured.starter.label}</p>
                          <p class="mt-1 text-xs leading-5 text-on-surface-variant">
                            {featured.starter.description}
                          </p>
                          <p class="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-200/90">
                            {quickStartTimeToValue(featured.starter)}
                          </p>
                          <p class="mt-2 text-xs leading-5 text-sky-100/90">
                            {featured.emphasis}
                          </p>
                          <p class="mt-2 text-xs leading-5 text-on-surface-variant/90">
                            {featured.starter.valuePromise}
                          </p>
                          <div class="mt-3 space-y-1.5">
                            <For each={quickStartOutputs(featured.starter).slice(0, 2)}>
                              {(output) => (
                                <div class="flex gap-2 text-[11px] leading-5 text-on-surface-variant/90">
                                  <span class="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[10px] font-semibold text-violet-100">
                                    +
                                  </span>
                                  <span>{output}</span>
                                </div>
                              )}
                            </For>
                          </div>
                          <div class="mt-3 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.12em]">
                            <span class="rounded-full border border-emerald-300/35 bg-emerald-500/10 px-2 py-1 text-emerald-100/90">
                              {quickStartRetentionLabel(featured.starter)}
                            </span>
                          </div>
                          <p class="mt-3 text-[11px] leading-5 text-on-surface-variant/90">
                            {featured.starter.recommendedUpload}
                          </p>
                        </button>
                      )}
                    </For>
                  </div>
                </div>
                <p class="mt-3 text-[11px] leading-5 text-on-surface-variant">
                  Recommended first upload: one lecture PDF plus one reading or rough note. Default retention can stay on extracted notes only, then review the retained sources in Files and the connections in Linked ideas. Gmail can wait until after the student has seen the first study result.
                </p>
                <div class="mt-3 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-4">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="max-w-xl">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/85">
                        Ready-made reports after first upload
                      </p>
                      <p class="mt-1 text-xs leading-5 text-on-surface-variant">
                        Once one source is retained, generate an exam prep report, day schedule, assignment plan, weekly revision report, or Zettelkasten synthesis from the same connected study memory.
                      </p>
                    </div>
                    <button
                      type="button"
                      class="rounded-lg border border-cyan-300/30 bg-cyan-500/15 px-4 py-2 text-xs font-semibold text-cyan-50 transition hover:bg-cyan-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      onClick={() => {
                        saveReportNavigationIntent(buildReportIntentFromFocus({ source: "onboarding" }));
                        openActivationTarget("reports");
                      }}
                    >
                      Open Reports
                    </button>
                  </div>
                </div>
              </div>
              <div class="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  class="rounded-lg border border-white/20 bg-white/10 px-5 py-2 text-sm font-medium text-on-surface-variant transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  onClick={dismiss}
                >
                  Finish later
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white transition hover:bg-primary/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  onClick={() => {
                    if (llmReady()) {
                      openStudyQuickStart(DEFAULT_STUDENT_ONBOARDING_QUICK_START);
                      return;
                    }
                    dismiss();
                  }}
                >
                  {studentLaunchState().primaryActionLabel}
                </button>
              </div>
            </>
          }
        >
          <>
            <div class="mb-6 flex gap-1.5">
              {STEPS.map((_, i) => (
                <div class={`h-1 flex-1 rounded-full transition-all ${i <= step() ? "bg-primary" : "bg-white/15"}`} />
              ))}
            </div>

            <p class="mb-1 text-xs font-medium uppercase tracking-widest text-on-surface-variant">
              Step {step() + 1} of {STEPS.length}
            </p>
            <h2 id="onboarding-wizard-title" class="mb-1 text-xl font-semibold text-on-surface">{current().label}</h2>
            <p id="onboarding-wizard-description" class="mb-5 text-xs text-on-surface-variant">
              You can change any of these later in <strong>Advanced to Agent Settings</strong>.
            </p>
            <div class="mb-5 rounded-2xl border border-sky-300/20 bg-sky-500/10 p-4">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="max-w-sm">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-100/85">
                    {studentFastPathState().eyebrow}
                  </p>
                  <h3 class="mt-1 text-sm font-semibold text-on-surface">
                    {studentFastPathState().headline}
                  </h3>
                  <p class="mt-2 text-xs leading-5 text-on-surface-variant">
                    {studentFastPathState().detail}
                  </p>
                </div>
                <button
                  type="button"
                  class="shrink-0 rounded-lg border border-sky-300/30 bg-sky-500/15 px-4 py-2 text-xs font-semibold text-sky-50 transition hover:bg-sky-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
                  disabled={saving() || activationLoading()}
                  aria-disabled={saving() || activationLoading()}
                  aria-busy={activationLoading()}
                  onClick={() => void skipToStudyActivation()}
                >
                  {activationLoading() ? "Checking..." : studentFastPathState().primaryActionLabel}
                </button>
              </div>
              <div class="mt-3 flex flex-wrap gap-1.5">
                <For each={studentFastPathState().chips}>
                  {(chip) => (
                    <span class="rounded-full border border-white/15 bg-white/8 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
                      {chip}
                    </span>
                  )}
                </For>
              </div>
            </div>
            <Show when={error()}>
              <div
                class={`mb-5 rounded-xl border px-4 py-3 text-sm ${
                  error()?.tone === "danger"
                    ? "border-red-400/20 bg-red-500/10 text-red-300"
                    : "border-amber-300/20 bg-amber-500/10 text-amber-200"
                }`}
                role="alert"
                aria-live="assertive"
              >
                <p class="font-semibold">{error()?.title}</p>
                <p class="mt-1">{error()?.summary}</p>
                <p class="mt-1 opacity-80">Next step: {error()?.nextStep}</p>
              </div>
            </Show>

            <div role="radiogroup" aria-labelledby="onboarding-wizard-title" class="space-y-3">
              {current().options.map((opt, optionIndex) => (
                <button
                  data-onboarding-option={opt.value}
                  data-selected={answers()[current().key] === opt.value ? "true" : "false"}
                  type="button"
                  role="radio"
                  aria-checked={answers()[current().key] === opt.value}
                  aria-disabled={saving()}
                  disabled={saving()}
                  tabIndex={
                    answers()[current().key]
                      ? answers()[current().key] === opt.value
                        ? 0
                        : -1
                      : optionIndex === 0
                        ? 0
                        : -1
                  }
                  class={`w-full rounded-xl border px-4 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    answers()[current().key] === opt.value
                      ? "border-primary bg-primary/10 text-on-surface"
                      : "border-white/15 bg-white/5 text-on-surface hover:border-white/30 hover:bg-white/10"
                  }`}
                  onClick={() => choose(current().key, opt.value)}
                  onKeyDown={(event) => handleOptionKeyDown(opt.value, event)}
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
                  class="text-sm text-on-surface-variant hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  disabled={saving()}
                  aria-disabled={saving()}
                  onClick={() => moveStep(-1)}
                >
                  Back
                </button>
              </Show>
              <div class="flex-1" />
              <div class="flex items-center gap-2">
                <Show when={!isLast()}>
                  <button
                    type="button"
                    class="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white disabled:opacity-40 transition hover:bg-primary/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    disabled={!canAdvance() || saving()}
                    aria-disabled={!canAdvance() || saving()}
                    onClick={() => moveStep(1)}
                  >
                    Next
                  </button>
                </Show>
                <Show when={isLast()}>
                  <button
                    type="button"
                    class="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white disabled:opacity-40 transition hover:bg-primary/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    disabled={!canAdvance() || saving()}
                    aria-disabled={!canAdvance() || saving()}
                    aria-busy={saving()}
                    onClick={finish}
                  >
                    {saving() ? "Saving..." : "Save preferences"}
                  </button>
                </Show>
                <button
                  type="button"
                  class="rounded-lg border border-white/20 bg-white/10 px-5 py-2 text-sm font-medium text-on-surface-variant transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  disabled={saving()}
                  aria-disabled={saving()}
                  onClick={requestDismiss}
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        </Show>
      </>
    </DialogShell>
  );
}
