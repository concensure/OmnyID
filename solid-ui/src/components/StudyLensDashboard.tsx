// @locs-version: 1.0
import { createSignal, For, Show } from "solid-js";
import type { ViewName } from "@/lib/viewNames";
import type { FileLibraryNavigationIntent } from "@/lib/fileLibraryNavigationState";
import type { KnowledgeGraphNavigationIntent } from "@/lib/knowledgeGraphNavigationState";
import type { ReportKind } from "@/lib/reportGeneratorState";
import type { ReportNavigationIntent } from "@/lib/reportNavigationState";
import type { StudyAttemptMode } from "@/lib/studyAttemptLocalState";
import type { StudyDeadlineKind, StudyDeadlineReviewStatus } from "@/lib/studyDeadlineLocalState";
import type { StudyLensDashboardAction, StudyLensDashboardState } from "@/lib/studyLensState";
import type { MedicalMissedQuestionTopic } from "@/lib/medicalMissedQuestionLocalState";
import { shouldShowMedicalMissedTopicCapture } from "@/lib/medicalMissedTopicCaptureState";

export function StudyLensDashboard(props: {
  state: StudyLensDashboardState;
  onOpenReport: (kind: ReportKind) => void;
  onOpenReportIntent?: (intent: ReportNavigationIntent) => void;
  onOpenFileLibraryIntent?: (intent: FileLibraryNavigationIntent) => void;
  onOpenKnowledgeGraphIntent?: (intent: KnowledgeGraphNavigationIntent) => void;
  onNavigate: (view: ViewName) => void;
  onAddCourse?: (input: {
    name: string;
    courseTag?: string | null;
    termLabel?: string | null;
    institutionLabel?: string | null;
  }) => void;
  onAddDeadline?: (input: { title: string; dueLabel: string; kind: StudyDeadlineKind; courseTag?: string | null }) => void;
  onUpdateDeadlineReview?: (deadlineId: string, reviewStatus: StudyDeadlineReviewStatus) => void;
  onRecordAttempt?: (input: {
    mode: StudyAttemptMode;
    title?: string | null;
    totalItems: number;
    correctItems?: number | null;
    durationSeconds?: number | null;
    courseTag?: string | null;
  }) => void;
  onRecordMedicalMissedTopic?: (input: {
    topic: string;
    qbankProvider?: MedicalMissedQuestionTopic["qbankProvider"] | null;
    userQuestionId?: string | null;
    courseTag?: string | null;
    systemTag?: string | null;
    unitTag?: string | null;
    chapterTag?: string | null;
    conceptTags?: readonly string[] | null;
  }) => void;
}) {
  const [deadlineTitle, setDeadlineTitle] = createSignal("");
  const [courseName, setCourseName] = createSignal("");
  const [courseTag, setCourseTag] = createSignal("");
  const [courseTerm, setCourseTerm] = createSignal("");
  const [courseInstitution, setCourseInstitution] = createSignal("");
  const [deadlineDueLabel, setDeadlineDueLabel] = createSignal("");
  const [deadlineKind, setDeadlineKind] = createSignal<StudyDeadlineKind>("exam");
  const [deadlineCourseTag, setDeadlineCourseTag] = createSignal("");
  const [attemptMode, setAttemptMode] = createSignal<StudyAttemptMode>("quiz");
  const [attemptTitle, setAttemptTitle] = createSignal("");
  const [attemptTotal, setAttemptTotal] = createSignal("");
  const [attemptCorrect, setAttemptCorrect] = createSignal("");
  const [attemptMinutes, setAttemptMinutes] = createSignal("");
  const [attemptCourseTag, setAttemptCourseTag] = createSignal("");
  const [missedTopic, setMissedTopic] = createSignal("");
  const [missedQbankProvider, setMissedQbankProvider] = createSignal<MedicalMissedQuestionTopic["qbankProvider"]>(null);
  const [missedQuestionId, setMissedQuestionId] = createSignal("");
  const [missedCourseTag, setMissedCourseTag] = createSignal("");
  const [missedSystemTag, setMissedSystemTag] = createSignal("");
  const [missedUnitTag, setMissedUnitTag] = createSignal("");
  const [missedChapterTag, setMissedChapterTag] = createSignal("");
  const [missedConceptTags, setMissedConceptTags] = createSignal("");

  const showMedicalMissedTopicCapture = () =>
    shouldShowMedicalMissedTopicCapture({
      sidebar: props.state.sidebar,
      canRecord: Boolean(props.onRecordMedicalMissedTopic),
    });

  function runAction(action: StudyLensDashboardAction) {
    if (action.reportIntent) {
      props.onOpenReportIntent?.(action.reportIntent);
      return;
    }
    if (action.fileLibraryIntent) {
      props.onOpenFileLibraryIntent?.(action.fileLibraryIntent);
      return;
    }
    if (action.knowledgeGraphIntent) {
      props.onOpenKnowledgeGraphIntent?.(action.knowledgeGraphIntent);
      return;
    }
    if (action.reportKind) {
      props.onOpenReport(action.reportKind);
      return;
    }
    if (action.view) props.onNavigate(action.view);
  }

  function submitDeadline(event: SubmitEvent) {
    event.preventDefault();
    const title = deadlineTitle().trim();
    const dueLabel = deadlineDueLabel().trim();
    if (!title || !dueLabel) return;
    props.onAddDeadline?.({
      title,
      dueLabel,
      kind: deadlineKind(),
      courseTag: deadlineCourseTag().trim() || null,
    });
    setDeadlineTitle("");
    setDeadlineDueLabel("");
    setDeadlineCourseTag("");
  }

  function submitCourse(event: SubmitEvent) {
    event.preventDefault();
    const name = courseName().trim();
    if (!name) return;
    props.onAddCourse?.({
      name,
      courseTag: courseTag().trim() || null,
      termLabel: courseTerm().trim() || null,
      institutionLabel: courseInstitution().trim() || null,
    });
    setCourseName("");
    setCourseTag("");
    setCourseTerm("");
    setCourseInstitution("");
  }

  function submitAttempt(event: SubmitEvent) {
    event.preventDefault();
    const totalItems = Number.parseInt(attemptTotal(), 10);
    if (!Number.isFinite(totalItems) || totalItems <= 0) return;
    const correctItems = Number.parseInt(attemptCorrect(), 10);
    const durationMinutes = Number.parseInt(attemptMinutes(), 10);
    props.onRecordAttempt?.({
      mode: attemptMode(),
      title: attemptTitle().trim() || null,
      totalItems,
      correctItems: Number.isFinite(correctItems) ? correctItems : 0,
      durationSeconds: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes * 60 : null,
      courseTag: attemptCourseTag().trim() || null,
    });
    setAttemptTitle("");
    setAttemptTotal("");
    setAttemptCorrect("");
    setAttemptMinutes("");
    setAttemptCourseTag("");
  }

  function submitMedicalMissedTopic(event: SubmitEvent) {
    event.preventDefault();
    const topic = missedTopic().trim();
    if (!topic) return;
    props.onRecordMedicalMissedTopic?.({
      topic,
      qbankProvider: missedQbankProvider(),
      userQuestionId: missedQuestionId().trim() || null,
      courseTag: missedCourseTag().trim() || null,
      systemTag: missedSystemTag().trim() || null,
      unitTag: missedUnitTag().trim() || null,
      chapterTag: missedChapterTag().trim() || null,
      conceptTags: missedConceptTags()
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
    setMissedTopic("");
    setMissedQbankProvider(null);
    setMissedQuestionId("");
    setMissedCourseTag("");
    setMissedSystemTag("");
    setMissedUnitTag("");
    setMissedChapterTag("");
    setMissedConceptTags("");
  }

  function applyDeadlineReview(deadlineId: string, action: "accept" | "ignore" | "restore") {
    props.onUpdateDeadlineReview?.(deadlineId, action === "ignore" ? "ignored" : "accepted");
  }

  return (
    <section class="view-enter rounded-[28px] border border-sky-200/70 bg-gradient-to-br from-sky-50/95 via-white/90 to-emerald-50/85 p-5 shadow-card">
      <datalist id="study-lens-course-options">
        <For each={props.state.courseOptions}>
          {(option) => <option value={option.value}>{option.label}</option>}
        </For>
      </datalist>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-sky-700/75">Personal agent mode</p>
          <h2 class="mt-1 text-2xl font-semibold text-on-surface">{props.state.headline}</h2>
          <p class="mt-1 max-w-2xl text-sm text-on-surface-variant">{props.state.summary}</p>
        </div>
        <div class="rounded-2xl border border-white/70 bg-white/70 p-3 text-xs text-on-surface-variant shadow-sm sm:max-w-sm">
          <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline/60">Next best action</p>
          <p class="mt-1 text-sm font-semibold text-on-surface">{props.state.nextAction.title}</p>
          <p class="mt-1 leading-snug">{props.state.nextAction.detail}</p>
          <button
            type="button"
            onClick={() => runAction(props.state.nextAction.action)}
            class="mt-2 rounded-full bg-on-surface px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-on-surface/85"
          >
            {props.state.nextAction.action.label}
          </button>
        </div>
      </div>

      <div class="mt-4 grid gap-3 md:grid-cols-4">
        <For each={props.state.progress}>
          {(metric) => (
            <div class={`rounded-3xl border p-4 shadow-sm ${
              metric.status === "ready"
                ? "border-emerald-200 bg-emerald-50/85"
                : metric.status === "partial"
                  ? "border-sky-200 bg-sky-50/85"
                  : "border-amber-200 bg-amber-50/80"
            }`}>
              <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-outline/60">{metric.label}</p>
              <p class="mt-1 text-xl font-semibold text-on-surface">{metric.value}</p>
              <p class="mt-1 text-xs leading-snug text-on-surface-variant">{metric.detail}</p>
            </div>
          )}
        </For>
      </div>

      <div class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div class="space-y-4">
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <For each={props.state.cards}>
              {(card) => (
                <article class="flex min-h-[210px] flex-col rounded-3xl border border-white/75 bg-white/78 p-4 shadow-sm backdrop-blur">
                  <div>
                    <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-outline/60">{card.top}</p>
                    <p class="mt-2 text-sm font-semibold leading-snug text-on-surface">{card.middle}</p>
                  </div>
                  <div class="mt-auto pt-4">
                    <div class="mb-3 flex flex-wrap gap-1.5">
                      <For each={card.metadata}>
                        {(meta) => (
                          <span class="rounded-full border border-outline/10 bg-on-surface/5 px-2 py-0.5 text-[10px] text-on-surface-variant">
                            {meta}
                          </span>
                        )}
                      </For>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => runAction(card.primaryAction)}
                        class="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                      >
                        {card.primaryAction.label}
                      </button>
                      <Show when={card.secondaryAction}>
                        {(action) => (
                          <button
                            type="button"
                            onClick={() => runAction(action())}
                            class="rounded-full border border-outline/15 bg-white/70 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white"
                          >
                            {action().label}
                          </button>
                        )}
                      </Show>
                    </div>
                  </div>
                </article>
              )}
            </For>
          </div>

          <Show when={props.state.sessionPlan}>
            {(plan) => (
              <section class={`rounded-3xl border p-4 shadow-sm ${
                plan().readiness === "ready"
                  ? "border-emerald-200 bg-emerald-50/80"
                  : plan().readiness === "partial"
                    ? "border-sky-200 bg-sky-50/80"
                    : "border-amber-200 bg-amber-50/80"
              }`}>
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-outline/60">Guided session queue</p>
                    <h3 class="mt-1 text-lg font-semibold text-on-surface">{plan().title}</h3>
                    <p class="mt-1 max-w-2xl text-sm text-on-surface-variant">{plan().detail}</p>
                  </div>
                  <div class="flex flex-wrap gap-2 sm:justify-end">
                    <For each={plan().durationOptions}>
                      {(duration) => (
                        <span class="rounded-full border border-white/80 bg-white/70 px-3 py-1 text-[11px] font-medium text-on-surface-variant">
                          {duration}
                        </span>
                      )}
                    </For>
                    <button
                      type="button"
                      onClick={() => runAction(plan().action)}
                      class="rounded-full bg-on-surface px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-on-surface/85"
                    >
                      {plan().action.label}
                    </button>
                  </div>
                </div>
                <div class="mt-3 grid gap-2 md:grid-cols-5">
                  <For each={plan().items}>
                    {(item) => (
                      <article class={`rounded-2xl border bg-white/65 p-3 ${
                        item.status === "ready"
                          ? "border-emerald-200/70"
                          : item.status === "blocked"
                            ? "border-amber-300/70"
                            : "border-white/80"
                      }`}>
                        <p class="font-mono text-[9px] uppercase tracking-[0.16em] text-outline/60">{item.phase}</p>
                        <p class="mt-1 text-xs font-semibold text-on-surface">{item.label}</p>
                        <p class="mt-1 text-[11px] leading-snug text-on-surface-variant">{item.detail}</p>
                      </article>
                    )}
                  </For>
                </div>
              </section>
            )}
          </Show>

          <div class="rounded-3xl border border-white/75 bg-white/72 p-4 shadow-sm">
            <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-outline/60">Modular study modes</p>
                <h3 class="text-lg font-semibold text-on-surface">Focused screens stay optional</h3>
              </div>
              <p class="text-xs text-on-surface-variant">Launches route through Reports or Files.</p>
            </div>
            <div class="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              <For each={props.state.modes}>
                {(mode) => (
                  <button
                    type="button"
                    onClick={() => runAction(mode.action)}
                    class="rounded-2xl border border-outline/10 bg-on-surface/4 p-3 text-left transition hover:border-sky-200 hover:bg-sky-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <p class="text-sm font-semibold text-on-surface">{mode.label}</p>
                      <span class="rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-on-surface-variant">{mode.readiness}</span>
                    </div>
                    <p class="mt-1 text-xs leading-snug text-on-surface-variant">{mode.description}</p>
                    <div class="mt-3 rounded-2xl border border-white/70 bg-white/55 p-2">
                      <p class="font-mono text-[9px] uppercase tracking-[0.16em] text-outline/60">
                        {mode.screen.layout.replace(/_/g, " ")}
                      </p>
                      <p class="mt-1 text-xs font-semibold text-on-surface">{mode.screen.primaryAction}</p>
                      <p class="mt-1 text-[11px] leading-snug text-on-surface-variant">{mode.screen.progressLabel}</p>
                      <div class="mt-2 flex flex-wrap gap-1">
                        <For each={mode.screen.bottomControls}>
                          {(control) => (
                            <span class="rounded-full bg-on-surface/6 px-2 py-0.5 text-[10px] text-on-surface-variant">
                              {control}
                            </span>
                          )}
                        </For>
                      </div>
                    </div>
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>

        <aside class="rounded-3xl border border-white/75 bg-white/72 p-4 shadow-sm">
          <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-outline/60">Contextual sidebar</p>
          <div class="mt-3 space-y-4">
            <Show when={props.state.academicDeadlineReviewQueue.totalCount > 0}>
              <section class="rounded-3xl border border-amber-100 bg-amber-50/70 p-3">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-on-surface">Imported date review</p>
                    <p class="mt-1 text-xs text-on-surface-variant">{props.state.academicDeadlineReviewQueue.summaryLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => props.onNavigate("connected_apps")}
                    class="rounded-full border border-amber-200 bg-white/75 px-2.5 py-1 text-[10px] font-medium text-amber-900 transition hover:bg-white"
                  >
                    {props.state.academicDeadlineReviewQueue.nextActionLabel}
                  </button>
                </div>
                <div class="mt-3 space-y-2">
                  <For each={props.state.academicDeadlineReviewQueue.items.slice(0, 4)}>
                    {(item) => (
                      <article class="rounded-2xl border border-white/80 bg-white/72 p-2">
                        <div class="flex items-start justify-between gap-2">
                          <div class="min-w-0">
                            <p class="truncate text-xs font-semibold text-on-surface" title={item.title}>{item.title}</p>
                            <p class="mt-1 text-[11px] leading-snug text-on-surface-variant">
                              {item.dueLabel} - {item.providerLabel} - {item.scopeLabel}
                            </p>
                            <p class="mt-1 text-[10px] uppercase tracking-[0.12em] text-outline/70">
                              {item.statusLabel}{item.canDrivePlanning ? " - planning evidence" : " - not planning evidence"}
                            </p>
                          </div>
                        </div>
                        <div class="mt-2 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => applyDeadlineReview(item.id, item.primaryAction)}
                            class="rounded-full bg-on-surface px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-on-surface/85"
                          >
                            {item.primaryAction}
                          </button>
                          <Show when={item.secondaryAction}>
                            {(action) => (
                              <button
                                type="button"
                                onClick={() => applyDeadlineReview(item.id, action())}
                                class="rounded-full border border-outline/15 bg-white px-2.5 py-1 text-[10px] font-medium text-on-surface-variant transition hover:bg-white/80"
                              >
                                {action()}
                              </button>
                            )}
                          </Show>
                        </div>
                      </article>
                    )}
                  </For>
                </div>
              </section>
            </Show>
            <For each={props.state.sidebar}>
              {(section) => (
                <section>
                  <div class="mb-2 flex items-center justify-between gap-3">
                    <h3 class="text-sm font-semibold text-on-surface">{section.title}</h3>
                    <button
                      type="button"
                      onClick={() => runAction(section.action)}
                      class="rounded-full border border-outline/15 bg-white/70 px-2.5 py-1 text-[10px] font-medium text-on-surface-variant transition hover:bg-white"
                    >
                      {section.action.label}
                    </button>
                  </div>
                  <Show
                    when={section.items.length > 0}
                    fallback={<p class="rounded-2xl border border-dashed border-outline/15 bg-on-surface/3 px-3 py-2 text-xs text-on-surface-variant">{section.emptyLabel}</p>}
                  >
                    <div class="space-y-1.5">
                      <For each={section.items}>
                        {(item) => (
                          <p class="truncate rounded-2xl bg-on-surface/5 px-3 py-2 text-xs text-on-surface-variant" title={item}>
                            {item}
                          </p>
                        )}
                      </For>
                    </div>
                  </Show>
                </section>
              )}
            </For>
            <form onSubmit={submitCourse} class="rounded-3xl border border-cyan-100 bg-cyan-50/70 p-3">
              <p class="text-sm font-semibold text-on-surface">Manual course context</p>
              <p class="mt-1 text-xs text-on-surface-variant">Keeps Study Lens course-aware; LMS and calendar imports should write the same shape.</p>
              <div class="mt-3 space-y-2">
                <input
                  value={courseName()}
                  onInput={(event) => setCourseName(event.currentTarget.value)}
                  class="w-full rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  placeholder="Course name"
                />
                <div class="grid grid-cols-2 gap-2">
                  <input
                    value={courseTag()}
                    onInput={(event) => setCourseTag(event.currentTarget.value)}
                    list="study-lens-course-options"
                    class="rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    placeholder="course tag"
                  />
                  <input
                    value={courseTerm()}
                    onInput={(event) => setCourseTerm(event.currentTarget.value)}
                    class="rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                    placeholder="term"
                  />
                </div>
                <input
                  value={courseInstitution()}
                  onInput={(event) => setCourseInstitution(event.currentTarget.value)}
                  class="w-full rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  placeholder="institution (optional)"
                />
                <button
                  type="submit"
                  disabled={!courseName().trim()}
                  class="w-full rounded-full bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Add course
                </button>
              </div>
            </form>
            <form onSubmit={submitDeadline} class="rounded-3xl border border-sky-100 bg-sky-50/70 p-3">
              <p class="text-sm font-semibold text-on-surface">Manual deadline</p>
              <p class="mt-1 text-xs text-on-surface-variant">Works alongside Canvas, Blackboard, Google Classroom, and Google Calendar imports.</p>
              <div class="mt-3 space-y-2">
                <input
                  value={deadlineTitle()}
                  onInput={(event) => setDeadlineTitle(event.currentTarget.value)}
                  class="w-full rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  placeholder="Exam or assignment"
                />
                <input
                  value={deadlineDueLabel()}
                  onInput={(event) => setDeadlineDueLabel(event.currentTarget.value)}
                  class="w-full rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  placeholder="Due date or timing"
                />
                <div class="grid grid-cols-2 gap-2">
                  <select
                    value={deadlineKind()}
                    onChange={(event) => setDeadlineKind(event.currentTarget.value as StudyDeadlineKind)}
                    class="rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="exam">Exam</option>
                    <option value="assignment">Assignment</option>
                    <option value="quiz">Quiz</option>
                    <option value="class">Class</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    value={deadlineCourseTag()}
                    onInput={(event) => setDeadlineCourseTag(event.currentTarget.value)}
                    list="study-lens-course-options"
                    class="rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                    placeholder="course tag"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!deadlineTitle().trim() || !deadlineDueLabel().trim()}
                  class="w-full rounded-full bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Add deadline
                </button>
              </div>
            </form>
            <form onSubmit={submitAttempt} class="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-3">
              <p class="text-sm font-semibold text-on-surface">Record study attempt</p>
              <p class="mt-1 text-xs text-on-surface-variant">Manual bridge until flashcard, quiz, and exam screens write attempts directly.</p>
              <div class="mt-3 space-y-2">
                <div class="grid grid-cols-2 gap-2">
                  <select
                    value={attemptMode()}
                    onChange={(event) => setAttemptMode(event.currentTarget.value as StudyAttemptMode)}
                    class="rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                  >
                    <option value="flashcards">Flashcards</option>
                    <option value="quiz">Quiz</option>
                    <option value="exam">Exam</option>
                  </select>
                  <input
                    value={attemptCourseTag()}
                    onInput={(event) => setAttemptCourseTag(event.currentTarget.value)}
                    list="study-lens-course-options"
                    class="rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    placeholder="course tag"
                  />
                </div>
                <input
                  value={attemptTitle()}
                  onInput={(event) => setAttemptTitle(event.currentTarget.value)}
                  class="w-full rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                  placeholder="Attempt title"
                />
                <div class="grid grid-cols-3 gap-2">
                  <input
                    inputmode="numeric"
                    value={attemptTotal()}
                    onInput={(event) => setAttemptTotal(event.currentTarget.value)}
                    class="rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    placeholder="items"
                  />
                  <input
                    inputmode="numeric"
                    value={attemptCorrect()}
                    onInput={(event) => setAttemptCorrect(event.currentTarget.value)}
                    class="rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    placeholder="correct"
                  />
                  <input
                    inputmode="numeric"
                    value={attemptMinutes()}
                    onInput={(event) => setAttemptMinutes(event.currentTarget.value)}
                    class="rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    placeholder="mins"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!attemptTotal().trim()}
                  class="w-full rounded-full bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Record attempt
                </button>
              </div>
            </form>
            <Show when={showMedicalMissedTopicCapture()}>
              <form onSubmit={submitMedicalMissedTopic} class="rounded-3xl border border-rose-100 bg-rose-50/70 p-3">
                <p class="text-sm font-semibold text-on-surface">Medical missed topic</p>
                <p class="mt-1 text-xs text-on-surface-variant">
                  Store only safe topic labels from UWorld, AMBOSS, NBME, or other practice. Do not paste proprietary question text or explanations.
                </p>
                <div class="mt-3 space-y-2">
                  <input
                    value={missedTopic()}
                    onInput={(event) => setMissedTopic(event.currentTarget.value)}
                    class="w-full rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                    placeholder="Missed topic, not raw question text"
                  />
                  <div class="grid grid-cols-2 gap-2">
                    <select
                      value={missedQbankProvider() ?? ""}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setMissedQbankProvider(value === "uworld" || value === "amboss" || value === "nbme" || value === "other" ? value : null);
                      }}
                      class="rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                    >
                      <option value="">Provider</option>
                      <option value="uworld">UWorld</option>
                      <option value="amboss">AMBOSS</option>
                      <option value="nbme">NBME</option>
                      <option value="other">Other</option>
                    </select>
                    <input
                      value={missedQuestionId()}
                      onInput={(event) => setMissedQuestionId(event.currentTarget.value)}
                      class="rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                      placeholder="optional ID"
                    />
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <input
                      value={missedCourseTag()}
                      onInput={(event) => setMissedCourseTag(event.currentTarget.value)}
                      list="study-lens-course-options"
                      class="rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                      placeholder="course tag"
                    />
                    <input
                      value={missedSystemTag()}
                      onInput={(event) => setMissedSystemTag(event.currentTarget.value)}
                      class="rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                      placeholder="system tag"
                    />
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <input
                      value={missedUnitTag()}
                      onInput={(event) => setMissedUnitTag(event.currentTarget.value)}
                      class="rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                      placeholder="unit tag"
                    />
                    <input
                      value={missedChapterTag()}
                      onInput={(event) => setMissedChapterTag(event.currentTarget.value)}
                      class="rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                      placeholder="chapter tag"
                    />
                  </div>
                  <input
                    value={missedConceptTags()}
                    onInput={(event) => setMissedConceptTags(event.currentTarget.value)}
                    class="w-full rounded-2xl border border-white/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                    placeholder="concept tags, comma separated"
                  />
                  <button
                    type="submit"
                    disabled={!missedTopic().trim()}
                    class="w-full rounded-full bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Save missed topic
                  </button>
                </div>
              </form>
            </Show>
          </div>
        </aside>
      </div>
    </section>
  );
}
