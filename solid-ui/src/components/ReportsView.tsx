// @locs-version: 1.0
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import type { AfpMessage } from "@/lib/api";
import {
  buildReportQuickStartSeed,
  buildReadyReportLauncherState,
  REPORT_ACADEMIC_INTEGRITY_GUARDRAILS,
  REPORT_OUTPUT_FORMAT_OPTIONS,
  REPORT_STRESS_OPTIONS,
  REPORT_URGENCY_OPTIONS,
  recommendedReportOutputFormat,
  type ReportKind,
  type ReportOutputFormat,
  type ReportStressLevel,
  type ReportUrgencyLevel,
} from "@/lib/reportGeneratorState";
import type { OnboardingQuickStartSeed } from "@/lib/onboardingQuickStart";
import {
  consumeReportNavigationIntent,
  saveReportNavigationIntent,
  type ReportNavigationIntent,
} from "@/lib/reportNavigationState";
import { saveFileLibraryNavigationIntent, type FileLibraryNavigationIntent } from "@/lib/fileLibraryNavigationState";
import { saveKnowledgeGraphNavigationIntent, type KnowledgeGraphNavigationIntent } from "@/lib/knowledgeGraphNavigationState";
import { buildReportWorkspaceState, defaultReportGoal, nextReportGoal } from "@/lib/reportWorkspaceState";
import {
  loadStudyReportArtifacts,
  STUDY_REPORT_ARTIFACT_SAVED_EVENT,
  type StudyReportArtifact,
} from "@/lib/studyReportArtifactLocalState";
import {
  loadMedicalFactVerificationRecords,
  type MedicalFactVerificationRecord,
} from "@/lib/medicalFactVerificationState";
import {
  buildStudyDeadlineFromReportInput,
  emitStudyDeadlineSaved,
  saveStudyDeadline,
} from "@/lib/studyDeadlineLocalState";
import {
  buildInferredStudyCourseFromTag,
  emitStudyCourseSaved,
  saveStudyCourse,
} from "@/lib/studyCourseLocalState";
import {
  buildStudySessionFromReportLaunch,
  emitStudySessionSaved,
  saveStudySession,
} from "@/lib/studySessionLocalState";
import { SavedStudyArtifactsPanel } from "@/components/SavedStudyArtifactsPanel";
import type { ViewName } from "@/lib/viewNames";

type ReportsViewProps = {
  messages: AfpMessage[];
  onOpenStudyQuickStart?: (seed: OnboardingQuickStartSeed) => void;
  onNavigate?: (view: ViewName) => void;
};

function metricLabel(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function readinessClass(level: string): string {
  switch (level) {
    case "needs_source":
      return "border-amber-200/70 bg-amber-50/80 text-amber-900";
    case "needs_scope":
      return "border-orange-200/70 bg-orange-50/80 text-orange-900";
    case "grounded_ready":
      return "border-emerald-200/70 bg-emerald-50/80 text-emerald-800";
    default:
      return "border-cyan-200/70 bg-cyan-50/80 text-cyan-900";
  }
}

function sourceCoverageClass(level: string): string {
  switch (level) {
    case "none":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "single_source":
      return "border-orange-200 bg-orange-50 text-orange-950";
    case "connected_multi_source":
      return "border-emerald-200 bg-emerald-50 text-emerald-950";
    default:
      return "border-cyan-200 bg-cyan-50 text-cyan-950";
  }
}

export function ReportsView(props: ReportsViewProps) {
  const [selectedKind, setSelectedKind] = createSignal<ReportKind>("exam_preparation");
  const [goal, setGoal] = createSignal(defaultReportGoal("exam_preparation"));
  const [upcomingExam, setUpcomingExam] = createSignal("");
  const [urgency, setUrgency] = createSignal<ReportUrgencyLevel>("soon");
  const [stress, setStress] = createSignal<ReportStressLevel>("stressed");
  const [outputFormat, setOutputFormat] = createSignal<ReportOutputFormat>(recommendedReportOutputFormat("exam_preparation"));
  const [arrivalIntent, setArrivalIntent] = createSignal<ReportNavigationIntent | null>(null);
  const [savedArtifacts, setSavedArtifacts] = createSignal<StudyReportArtifact[]>([]);
  const [medicalFactVerifications, setMedicalFactVerifications] = createSignal<MedicalFactVerificationRecord[]>([]);
  const workspace = createMemo(() => buildReportWorkspaceState({
    kind: selectedKind(),
    goal: goal(),
    messages: props.messages,
    upcomingExam: upcomingExam(),
    urgency: urgency(),
    stress: stress(),
    focus: arrivalIntent(),
  }));
  const readyReportLauncher = createMemo(() =>
    buildReadyReportLauncherState({
      selectedKind: selectedKind(),
      context: workspace().context,
    }),
  );
  onMount(() => {
    const intent = consumeReportNavigationIntent();
    if (!intent) return;
    setArrivalIntent(intent);
    setSelectedKind(intent.preferredKind);
    setGoal(intent.goalHint);
  });

  onMount(() => {
    const refreshArtifacts = () => setSavedArtifacts(loadStudyReportArtifacts());
    refreshArtifacts();
    window.addEventListener(STUDY_REPORT_ARTIFACT_SAVED_EVENT, refreshArtifacts);
    onCleanup(() => window.removeEventListener(STUDY_REPORT_ARTIFACT_SAVED_EVENT, refreshArtifacts));
  });

  onMount(() => {
    setMedicalFactVerifications(loadMedicalFactVerificationRecords());
  });

  function openSavedReportIntent(intent: ReportNavigationIntent): void {
    saveReportNavigationIntent(intent);
    props.onNavigate?.("reports");
  }

  function openSavedFileLibraryIntent(intent: FileLibraryNavigationIntent): void {
    saveFileLibraryNavigationIntent(intent);
    props.onNavigate?.("files");
  }

  function openSavedKnowledgeGraphIntent(intent: KnowledgeGraphNavigationIntent): void {
    saveKnowledgeGraphNavigationIntent(intent);
    props.onNavigate?.("knowledge_graph");
  }

  function selectReportKind(kind: ReportKind) {
    setGoal(nextReportGoal({
      currentGoal: goal(),
      nextKind: kind,
    }));
    setSelectedKind(kind);
    setOutputFormat(recommendedReportOutputFormat(kind));
  }

  function generateReport() {
    const deadline = buildStudyDeadlineFromReportInput({
      deadlineText: upcomingExam(),
      reportKind: selectedKind(),
      courseTag: arrivalIntent()?.courseTag,
    });
    if (deadline) {
      const savedDeadline = saveStudyDeadline(deadline);
      emitStudyDeadlineSaved(savedDeadline);
      const course = buildInferredStudyCourseFromTag({ courseTag: savedDeadline.courseTag });
      if (course) emitStudyCourseSaved(saveStudyCourse(course));
    }
    const session = buildStudySessionFromReportLaunch({
      reportKind: selectedKind(),
      title: goal(),
      courseTag: arrivalIntent()?.courseTag,
      sourceCount: workspace().context.sourceCount,
      deadlineCount: upcomingExam().trim() ? 1 : 0,
      attemptCount: arrivalIntent()?.academicKind === "study_attempt" ? 1 : 0,
      nextAction: "Review the generated session plan, complete the recall/check phases, then save the follow-up output.",
    });
    if (session) {
      const savedSession = saveStudySession(session);
      emitStudySessionSaved(savedSession);
      const course = buildInferredStudyCourseFromTag({ courseTag: savedSession.courseTag });
      if (course) emitStudyCourseSaved(saveStudyCourse(course));
    }
    props.onOpenStudyQuickStart?.(buildReportQuickStartSeed({
      kind: selectedKind(),
      goal: goal(),
      upcomingExam: upcomingExam(),
      studentState: {
        urgency: urgency(),
        stress: stress(),
      },
      outputFormat: outputFormat(),
      messages: props.messages,
      focus: arrivalIntent(),
    }));
  }

  return (
    <section class="min-h-full rounded-3xl border border-white/50 bg-white/35 p-5 shadow-card backdrop-blur">
      <div class="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
        <div class="space-y-4">
          <div class="rounded-3xl border border-emerald-200/50 bg-gradient-to-br from-emerald-50/90 via-cyan-50/60 to-white/70 p-5">
            <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-700">Ready student reports</p>
            <h1 class="mt-2 text-3xl font-semibold tracking-[-0.04em] text-on-surface">
              Generate exam prep, schedules, and study material from the knowledge graph.
            </h1>
            <p class="mt-3 max-w-2xl text-sm leading-6 text-on-surface-variant">
              Choose a ready report, describe the exam or goal in the chat-style form, and OmnyID will route the request through retained files, supertags, graph topology, and Zettelkasten note-chain signals.
            </p>
            <div class="mt-4 flex flex-wrap gap-2 text-xs">
              <span class={`rounded-full border px-3 py-1 font-medium ${readinessClass(workspace().context.readinessLevel)}`}>
                {workspace().context.readinessLabel}
              </span>
              <span class="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-on-surface-variant">
                {metricLabel(workspace().context.cardCount, "knowledge card", "knowledge cards")}
              </span>
              <Show when={workspace().context.focusedCardCount > 0}>
                <span class="rounded-full border border-cyan-200/70 bg-cyan-50/80 px-3 py-1 text-cyan-900">
                  {metricLabel(workspace().context.focusedCardCount, "focused card", "focused cards")}
                </span>
              </Show>
              <span class="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-on-surface-variant">
                {metricLabel(workspace().context.linkedCardCount, "linked card", "linked cards")}
              </span>
              <span class={`rounded-full border px-3 py-1 ${sourceCoverageClass(workspace().context.sourceCoverageLevel)}`}>
                {workspace().context.sourceCoverageLevel.replace(/_/g, " ")}
              </span>
            </div>
            <Show when={arrivalIntent()}>
              {(intent) => (
                <div class="mt-4 rounded-2xl border border-cyan-200/70 bg-white/75 p-3 text-xs leading-5 text-cyan-950">
                  <p class="font-semibold">{intent().notice ?? "Reports opened from a focused study surface."}</p>
                  <p class="mt-1">
                    Focus carried in: {workspace().carriedFocusLabel}.
                  </p>
                  <Show when={workspace().carriedFocusDetail}>
                    {(detail) => (
                      <p class="mt-1 text-cyan-900/80">
                        Follow-up context: {detail()}
                      </p>
                    )}
                  </Show>
                </div>
              )}
            </Show>
          </div>

          <div class="rounded-3xl border border-white/60 bg-white/55 p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-on-surface">Ready report launcher</p>
                <p class="mt-1 text-xs leading-5 text-on-surface-variant">
                  {readyReportLauncher().summaryLabel}; currently selected: {readyReportLauncher().selectedLabel}.
                </p>
              </div>
              <span class="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-900">
                linked context
              </span>
            </div>
            <div class="mt-4 space-y-4">
              <For each={readyReportLauncher().groups}>
                {(group) => (
                  <section class="rounded-3xl border border-white/70 bg-white/70 p-3">
                    <div class="flex flex-wrap items-baseline justify-between gap-2">
                      <p class="text-xs font-semibold uppercase tracking-[0.14em] text-on-surface">{group.label}</p>
                      <p class="text-[11px] leading-5 text-on-surface-variant">{group.description}</p>
                    </div>
                    <div class="mt-3 grid gap-2 md:grid-cols-2">
                      <For each={group.options}>
                        {(option) => (
                          <button
                            type="button"
                            onClick={() => selectReportKind(option.kind)}
                            class={`rounded-2xl border p-3 text-left transition ${
                              option.selected
                                ? "border-emerald-300 bg-emerald-50/90 shadow-card"
                                : "border-slate-200 bg-white/75 hover:border-emerald-200 hover:bg-white"
                            }`}
                          >
                            <div class="flex items-start justify-between gap-2">
                              <p class="text-sm font-semibold text-on-surface">{option.label}</p>
                              <span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                                {option.recommendedOutputFormat.replace(/_/g, " ")}
                              </span>
                            </div>
                            <p class="mt-2 text-xs leading-5 text-on-surface-variant">{option.description}</p>
                            <p class="mt-2 text-[11px] font-medium text-emerald-800">{option.outputPromise}</p>
                            <p class="mt-2 text-[11px] leading-5 text-slate-500">{option.contextHint}</p>
                          </button>
                        )}
                      </For>
                    </div>
                  </section>
                )}
              </For>
            </div>
          </div>
        </div>

        <div class="space-y-4 rounded-3xl border border-white/60 bg-white/70 p-4">
          <div class="rounded-3xl bg-slate-950 p-4 text-white shadow-card">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-200">Report chat</p>
                <p class="mt-1 text-xs text-white/55">{workspace().intake.completionLabel}</p>
              </div>
              <span class="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white/70">
                {workspace().template.label}
              </span>
            </div>
            <div class="mt-4 space-y-3 text-sm">
              <For each={workspace().intake.turns}>
                {(turn) => (
                  <div
                    class={`max-w-[92%] rounded-2xl px-4 py-3 leading-6 ${
                      turn.speaker === "student"
                        ? "ml-auto rounded-tr-sm bg-emerald-300 text-slate-950"
                        : "rounded-tl-sm bg-white/10 text-white"
                    }`}
                  >
                    {turn.text}
                  </div>
                )}
              </For>
            </div>
            <Show when={workspace().intake.quickReplies.length > 0}>
              <div class="mt-4 flex flex-wrap gap-2">
                <For each={workspace().intake.quickReplies}>
                  {(reply) => (
                    <button
                      type="button"
                      onClick={() => {
                        if (reply.target === "goal") setGoal(reply.value);
                        else setUpcomingExam(reply.value);
                      }}
                      class="rounded-full border border-emerald-200/30 bg-emerald-200/10 px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-200/20"
                    >
                      {reply.label}
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <div class="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-5 text-white/70">
              {workspace().intake.sourcePrompt}
            </div>
          </div>

          <label class="block">
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-outline">Goal</span>
            <textarea
              value={goal()}
              onInput={(event) => setGoal(event.currentTarget.value)}
              rows={4}
              class="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              placeholder="Example: I need to pass ECON101 and feel behind on weeks 3-6."
            />
          </label>

          <label class="block">
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-outline">Upcoming exam or deadline</span>
            <input
              value={upcomingExam()}
              onInput={(event) => setUpcomingExam(event.currentTarget.value)}
              class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              placeholder="Example: Final exam next Friday, chapters 4-8"
            />
          </label>

          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-outline">Urgency</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <For each={REPORT_URGENCY_OPTIONS}>
                  {(option) => (
                    <button
                      type="button"
                      onClick={() => setUrgency(option.value)}
                      class={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                        urgency() === option.value
                          ? "border-slate-900 bg-slate-950 text-white"
                          : "border-slate-200 bg-white text-on-surface-variant hover:bg-slate-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  )}
                </For>
              </div>
            </div>
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.14em] text-outline">Stress level</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <For each={REPORT_STRESS_OPTIONS}>
                  {(option) => (
                    <button
                      type="button"
                      onClick={() => setStress(option.value)}
                      class={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                        stress() === option.value
                          ? "border-emerald-700 bg-emerald-700 text-white"
                          : "border-slate-200 bg-white text-on-surface-variant hover:bg-slate-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </div>

          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.14em] text-outline">Reusable output format</p>
            <div class="mt-2 grid gap-2 sm:grid-cols-2">
              <For each={REPORT_OUTPUT_FORMAT_OPTIONS}>
                {(option) => (
                  <button
                    type="button"
                    onClick={() => setOutputFormat(option.value)}
                    class={`rounded-2xl border px-3 py-2 text-left text-xs transition ${
                      outputFormat() === option.value
                        ? "border-cyan-500 bg-cyan-50 text-cyan-950"
                        : "border-slate-200 bg-white text-on-surface-variant hover:bg-slate-50"
                    }`}
                  >
                    <span class="font-semibold">{option.label}</span>
                    <span class="mt-1 block leading-5">{option.promptHint}</span>
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="rounded-3xl border border-emerald-200/70 bg-emerald-50/70 p-4">
            <p class="text-sm font-semibold text-emerald-950">What this report will include</p>
            <div class="mt-3 space-y-2">
              <For each={workspace().outputSections}>
                {(section) => (
                  <div class="rounded-2xl bg-white/75 p-3">
                    <p class="text-xs font-semibold text-on-surface">{section.title}</p>
                    <p class="mt-1 text-xs leading-5 text-on-surface-variant">{section.detail}</p>
                  </div>
                )}
              </For>
            </div>
          </div>

          <div class="rounded-3xl border border-amber-200/70 bg-amber-50/75 p-4">
            <p class="text-sm font-semibold text-amber-950">Best sources to attach</p>
            <p class="mt-1 text-xs leading-5 text-amber-950/80">
              These are optional if OmnyID already has enough retained context, but they make the report more grounded.
            </p>
            <div class="mt-3 space-y-2">
              <For each={workspace().sourceRequirements}>
                {(source) => (
                  <div class="rounded-2xl bg-white/75 p-3">
                    <p class="text-xs font-semibold text-on-surface">{source.label}</p>
                    <p class="mt-1 text-xs leading-5 text-on-surface-variant">{source.examples}</p>
                  </div>
                )}
              </For>
            </div>
          </div>

          <div class="rounded-3xl border border-cyan-200/70 bg-cyan-50/80 p-4">
            <p class="text-sm font-semibold text-cyan-950">First useful step</p>
            <p class="mt-2 text-sm font-semibold text-on-surface">{workspace().immediateAction.label}</p>
            <p class="mt-1 text-xs leading-5 text-on-surface-variant">{workspace().immediateAction.detail}</p>
          </div>

          <Show when={savedArtifacts().length > 0 || medicalFactVerifications().length > 0}>
            <SavedStudyArtifactsPanel
              artifacts={savedArtifacts()}
              medicalFactVerifications={medicalFactVerifications()}
              onOpenStudyQuickStart={props.onOpenStudyQuickStart}
              onOpenReportIntent={openSavedReportIntent}
              onOpenFileLibraryIntent={openSavedFileLibraryIntent}
              onOpenKnowledgeGraphIntent={openSavedKnowledgeGraphIntent}
            />
          </Show>

          <div class="rounded-3xl border border-slate-200/70 bg-white/75 p-4">
            <p class="text-sm font-semibold text-on-surface">Academic-use guardrails</p>
            <ul class="mt-2 space-y-1 text-xs leading-5 text-on-surface-variant">
              <For each={REPORT_ACADEMIC_INTEGRITY_GUARDRAILS}>
                {(guardrail) => <li>{guardrail}</li>}
              </For>
            </ul>
          </div>

          <div class="rounded-3xl border border-slate-200/70 bg-slate-50/80 p-4">
            <p class="text-sm font-semibold text-on-surface">Context OmnyID will use</p>
            <p class="mt-2 text-xs leading-5 text-on-surface-variant">{workspace().context.topologySummary}</p>
            <p class="mt-2 text-xs leading-5 text-on-surface-variant">{workspace().context.sourceCoverageSummary}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <For each={[...workspace().context.courseTags, ...workspace().context.unitTags, ...workspace().context.chapterTags, ...workspace().context.weekTags, ...workspace().context.graphAnchors, ...workspace().context.topSupertags].slice(0, 10)}>
                {(tag) => <span class="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700">{tag}</span>}
              </For>
            </div>
            <Show when={workspace().noSourceNotice}>
              {(notice) => (
              <div class="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-xs leading-5 text-amber-950">
                {notice()}
              </div>
              )}
            </Show>
            <Show when={workspace().context.missingInputs.length > 0}>
              <div class="mt-4 rounded-2xl border border-orange-200 bg-orange-50/80 p-3">
                <p class="text-xs font-semibold text-orange-950">Improve this report</p>
                <ul class="mt-2 space-y-1 text-xs leading-5 text-orange-950">
                  <For each={workspace().context.missingInputs}>
                    {(gap) => <li>{gap}</li>}
                  </For>
                </ul>
              </div>
            </Show>
            <Show when={workspace().context.zettelkastenNextActions.length > 0}>
              <div class="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-3">
                <p class="text-xs font-semibold text-amber-900">Zettelkasten next-note moves</p>
                <ul class="mt-2 space-y-1 text-xs leading-5 text-amber-950">
                  <For each={workspace().context.zettelkastenNextActions.slice(0, 3)}>
                    {(action) => <li>{action}</li>}
                  </For>
                </ul>
              </div>
            </Show>
            <Show when={workspace().context.evidenceSources.length > 0}>
              <div class="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50/80 p-3">
                <p class="text-xs font-semibold text-cyan-950">Likely source evidence</p>
                <ul class="mt-2 space-y-1 text-xs leading-5 text-cyan-950">
                  <For each={workspace().context.evidenceSources.slice(0, 4)}>
                    {(source) => <li>{source}</li>}
                  </For>
                </ul>
              </div>
            </Show>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!workspace().canGenerate}
              onClick={generateReport}
              class="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {workspace().primaryActionLabel}
            </button>
            <button
              type="button"
              onClick={() => props.onNavigate?.("files")}
              class="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-slate-50"
            >
              View files
            </button>
            <button
              type="button"
              onClick={() => props.onNavigate?.("knowledge_graph")}
              class="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-slate-50"
            >
              Open graph
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ReportsView;
