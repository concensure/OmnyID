// @locs-version: 1.0
import { createMemo, createSignal, For, Show } from "solid-js";

import type { OnboardingQuickStartSeed } from "@/lib/onboardingQuickStart";
import {
  buildStudyReportArtifactContinuationSeed,
  type StudyReportArtifact,
} from "@/lib/studyReportArtifactLocalState";
import {
  buildStudyArtifactCsvDownloadState,
  buildStudyArtifactDocumentDownloadState,
  buildStudyArtifactExportLabelState,
  isStudyArtifactPlannedAction,
  studyArtifactActionLabel,
  studyArtifactActionTone,
  type StudyArtifactSearchResultAction,
} from "@/lib/studyArtifactExportActionState";
import { buildSavedStudyArtifactsPanelState } from "@/lib/savedStudyArtifactsPanelState";
import type { MedicalFactVerificationRecord } from "@/lib/medicalFactVerificationState";
import {
  isMedicalFactVerificationPlannedAction,
  medicalFactVerificationActionLabel,
  medicalFactVerificationActionTone,
  type MedicalFactVerificationResultAction,
} from "@/lib/medicalFactVerificationResultState";
import type { FileLibraryNavigationIntent } from "@/lib/fileLibraryNavigationState";
import type { KnowledgeGraphNavigationIntent } from "@/lib/knowledgeGraphNavigationState";
import type { ReportNavigationIntent } from "@/lib/reportNavigationState";
type SavedStudyArtifactsPanelProps = {
  artifacts: StudyReportArtifact[];
  medicalFactVerifications?: MedicalFactVerificationRecord[];
  onOpenStudyQuickStart?: (seed: OnboardingQuickStartSeed) => void;
  onOpenReportIntent?: (intent: ReportNavigationIntent) => void;
  onOpenFileLibraryIntent?: (intent: FileLibraryNavigationIntent) => void;
  onOpenKnowledgeGraphIntent?: (intent: KnowledgeGraphNavigationIntent) => void;
};

function chipClass(kind: string): string {
  switch (kind) {
    case "course":
      return "border-blue-200 bg-blue-50 text-blue-900";
    case "chapter":
      return "border-lime-200 bg-lime-50 text-lime-900";
    case "unit":
      return "border-teal-200 bg-teal-50 text-teal-900";
    case "answer":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "source":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "format":
      return "border-cyan-200 bg-cyan-50 text-cyan-900";
    default:
      return "border-violet-200 bg-violet-50 text-violet-900";
  }
}

function downloadBlob(content: string, type: string, filename: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function actionClass(action: StudyArtifactSearchResultAction): string {
  switch (studyArtifactActionTone(action)) {
    case "primary":
      return "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100";
    case "csv":
      return "border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100";
    case "pdf":
      return "border-cyan-200 bg-cyan-50 text-cyan-900 hover:bg-cyan-100";
    case "html":
      return "border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100";
    case "word":
      return "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100";
    case "markdown":
      return "border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100";
    case "planned":
      return "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-500 opacity-80";
    default:
      return "border-slate-200 bg-white text-on-surface-variant hover:bg-slate-50";
  }
}

function medicalActionClass(action: MedicalFactVerificationResultAction): string {
  switch (medicalFactVerificationActionTone(action)) {
    case "primary":
      return "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100";
    case "source":
      return "border-cyan-200 bg-cyan-50 text-cyan-900 hover:bg-cyan-100";
    case "graph":
      return "border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100";
    case "pdf":
      return "border-cyan-200 bg-cyan-50 text-cyan-900 hover:bg-cyan-100";
    case "html":
      return "border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100";
    case "word":
      return "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100";
    case "markdown":
      return "border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100";
    case "planned":
      return "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-500 opacity-80";
    default:
      return "border-slate-200 bg-white text-on-surface-variant hover:bg-slate-50";
  }
}

export function SavedStudyArtifactsPanel(props: SavedStudyArtifactsPanelProps) {
  const [query, setQuery] = createSignal("");
  const [showAll, setShowAll] = createSignal(false);
  const [copiedId, setCopiedId] = createSignal<string | null>(null);
  const panel = createMemo(() =>
    buildSavedStudyArtifactsPanelState({
      artifacts: props.artifacts,
      medicalFactVerifications: props.medicalFactVerifications,
      query: query(),
      showAll: showAll(),
      previewLimit: 5,
      fullLimit: 20,
    }),
  );

  function continueArtifact(artifact: StudyReportArtifact): void {
    props.onOpenStudyQuickStart?.(buildStudyReportArtifactContinuationSeed(artifact));
  }

  function copyArtifact(artifact: StudyReportArtifact): void {
    const writer = navigator.clipboard?.writeText;
    if (!writer) return;
    void writer.call(navigator.clipboard, artifact.markdown).then(() => {
      setCopiedId(artifact.id);
      window.setTimeout(() => {
        if (copiedId() === artifact.id) setCopiedId(null);
      }, 1800);
    });
  }

  function copyMedicalVerification(markdown: string, id: string): void {
    const writer = navigator.clipboard?.writeText;
    if (!writer) return;
    void writer.call(navigator.clipboard, markdown).then(() => {
      setCopiedId(id);
      window.setTimeout(() => {
        if (copiedId() === id) setCopiedId(null);
      }, 1800);
    });
  }

  function printArtifact(artifact: StudyReportArtifact): void {
    const documentState = buildStudyArtifactDocumentDownloadState(artifact);
    const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=720");
    if (!popup) {
      window.print();
      return;
    }
    popup.document.write(documentState.html.replace("</body>", "<script>window.onload=()=>window.print();<\/script></body>"));
    popup.document.close();
  }

  function downloadCsv(artifact: StudyReportArtifact): void {
    const state = buildStudyArtifactCsvDownloadState(artifact);
    if (!state) return;
    downloadBlob(state.csv, state.mimeType, state.filename);
  }

  function runAction(action: StudyArtifactSearchResultAction, artifact: StudyReportArtifact): void {
    if (isStudyArtifactPlannedAction(action)) return;
    if (action === "continue") continueArtifact(artifact);
    if (action === "copy") copyArtifact(artifact);
    if (action === "print_pdf") printArtifact(artifact);
    if (action === "download_markdown") {
      const documentState = buildStudyArtifactDocumentDownloadState(artifact);
      downloadBlob(documentState.markdown, artifact.mimeType, artifact.filename);
    }
    if (action === "download_html") {
      const documentState = buildStudyArtifactDocumentDownloadState(artifact);
      downloadBlob(documentState.html, documentState.htmlMimeType, documentState.htmlFilename);
    }
    if (action === "download_word") {
      const documentState = buildStudyArtifactDocumentDownloadState(artifact);
      downloadBlob(documentState.html, documentState.wordMimeType, documentState.wordFilename);
    }
    if (action === "download_csv") downloadCsv(artifact);
  }

  function runMedicalAction(action: MedicalFactVerificationResultAction, resultId: string): void {
    const result = panel().medicalFactVerificationResults.find((item) => item.id === resultId);
    if (!result || isMedicalFactVerificationPlannedAction(action)) return;
    if (action === "reuse_in_report" || action === "verify_again" || action === "manual_review") {
      props.onOpenReportIntent?.(result.reportIntent);
    }
    if (action === "show_sources") props.onOpenFileLibraryIntent?.(result.fileLibraryIntent);
    if (action === "open_graph") props.onOpenKnowledgeGraphIntent?.(result.knowledgeGraphIntent);
    if (action === "copy_export") copyMedicalVerification(result.exportState.markdown, result.id);
    if (action === "print_pdf") {
      const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=720");
      if (!popup) {
        window.print();
        return;
      }
      popup.document.write(result.exportState.html.replace("</body>", "<script>window.onload=()=>window.print();<\/script></body>"));
      popup.document.close();
    }
    if (action === "download_markdown") {
      downloadBlob(result.exportState.markdown, result.exportState.mimeType, result.exportState.filename);
    }
    if (action === "download_html") {
      downloadBlob(result.exportState.html, result.exportState.htmlMimeType, result.exportState.htmlFilename);
    }
    if (action === "download_word") {
      downloadBlob(result.exportState.html, result.exportState.wordMimeType, result.exportState.wordFilename);
    }
  }

  return (
    <div class="rounded-3xl border border-violet-200/70 bg-violet-50/75 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-violet-950">Recent saved study outputs</p>
          <p class="mt-1 text-xs leading-5 text-violet-950/75">
            Search reusable quizzes, flashcards, reports, exam prep, and study sessions by course, unit, chapter, source, answer policy, or export target.
          </p>
        </div>
        <span class="rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-violet-900">
          {panel().summaryLabel}
        </span>
      </div>
      <label class="mt-3 block">
        <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-900/75">
          Search saved reports
        </span>
        <input
          value={query()}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            setShowAll(false);
          }}
          class="mt-2 w-full rounded-2xl border border-violet-200/80 bg-white px-3 py-2 text-xs text-on-surface outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          placeholder="chapter:4, unit:contracts, csv, answers included, browser pdf"
        />
      </label>
      <Show when={panel().filterChips.length > 0}>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <For each={panel().filterChips}>
            {(chip) => (
              <button
                type="button"
                onClick={() => {
                  setQuery(chip.query);
                  setShowAll(false);
                }}
                class={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition hover:bg-white ${chipClass(chip.kind)}`}
              >
                {chip.label}{chip.count > 1 ? ` (${chip.count})` : ""}
              </button>
            )}
          </For>
        </div>
      </Show>
      <div class="mt-3 space-y-2">
        <Show when={panel().hasNoMatches}>
          <div class="rounded-2xl border border-dashed border-violet-200/90 bg-white/70 p-4 text-xs leading-5 text-violet-950">
            <p class="font-semibold">{panel().emptyTitle}</p>
            <p class="mt-1 text-violet-950/75">{panel().emptyDetail}</p>
            <button
              type="button"
              onClick={() => setQuery("")}
              class="mt-3 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-900 transition hover:bg-violet-100"
            >
              Clear search
            </button>
          </div>
        </Show>
        <For each={panel().results}>
          {(result) => (
            <div class="rounded-2xl border border-white/80 bg-white/90 p-3">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-xs font-semibold text-on-surface">{result.title}</p>
                  <p class="mt-1 text-[11px] leading-5 text-on-surface-variant">{result.subtitle}</p>
                  <p class="mt-1 text-[11px] leading-5 text-on-surface-variant">{result.description}</p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <For each={result.badges}>
                      {(badge) => (
                        <span class={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${chipClass(badge.split(":")[0] ?? "")}`}>
                          {badge}
                        </span>
                      )}
                    </For>
                  </div>
                  <Show when={result.matchedFields.length > 0}>
                    <p class="mt-2 text-[10px] uppercase tracking-[0.12em] text-violet-900/70">
                      Matched: {result.matchedFields.join(", ")}
                    </p>
                  </Show>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <For each={result.actions}>
                    {(action) => (
                      <button
                        type="button"
                        disabled={isStudyArtifactPlannedAction(action)}
                        onClick={() => runAction(action, result.artifact)}
                        title={isStudyArtifactPlannedAction(action) ? "Planned converter; not available in this build yet" : undefined}
                        class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${actionClass(action)}`}
                      >
                        {studyArtifactActionLabel(action, { copied: copiedId() === result.id })}
                      </button>
                    )}
                  </For>
                </div>
                <div class="flex basis-full flex-wrap gap-1.5">
                  <For each={buildStudyArtifactExportLabelState(result.artifact).readyLabels}>
                    {(label) => (
                      <span class="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                        {label}
                      </span>
                    )}
                  </For>
                  <For each={buildStudyArtifactExportLabelState(result.artifact).plannedLabels}>
                    {(label) => (
                      <span class="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-600">
                        {label}
                      </span>
                    )}
                  </For>
                  <For each={buildStudyArtifactExportLabelState(result.artifact).groundingLabels}>
                    {(label) => (
                      <span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-amber-800">
                        {label}
                      </span>
                    )}
                  </For>
                </div>
              </div>
            </div>
          )}
        </For>
        <For each={panel().medicalFactVerificationResults}>
          {(result) => (
            <div class="rounded-2xl border border-cyan-100 bg-white/90 p-3">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-xs font-semibold text-on-surface">{result.title}</p>
                  <p class="mt-1 text-[11px] leading-5 text-on-surface-variant">{result.subtitle}</p>
                  <p class="mt-1 text-[11px] leading-5 text-on-surface-variant">{result.description}</p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <For each={result.badges}>
                      {(badge) => (
                        <span class={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${chipClass(badge.split(":")[0] ?? "")}`}>
                          {badge}
                        </span>
                      )}
                    </For>
                  </div>
                  <Show when={result.matchedFields.length > 0}>
                    <p class="mt-2 text-[10px] uppercase tracking-[0.12em] text-violet-900/70">
                      Matched: {result.matchedFields.join(", ")}
                    </p>
                  </Show>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <For each={result.actions}>
                    {(action) => (
                      <button
                        type="button"
                        disabled={isMedicalFactVerificationPlannedAction(action)}
                        onClick={() => runMedicalAction(action, result.id)}
                        title={isMedicalFactVerificationPlannedAction(action) ? "Planned converter; not available in this build yet" : undefined}
                        class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${medicalActionClass(action)}`}
                      >
                        {action === "copy_export" && copiedId() === result.id ? "Copied" : medicalFactVerificationActionLabel(action)}
                      </button>
                    )}
                  </For>
                </div>
                <div class="flex basis-full flex-wrap gap-1.5">
                  <For each={result.exportState.readyExportTargets}>
                    {(target) => (
                      <span class="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-800">
                        {target.replace(/_/g, " ")}
                      </span>
                    )}
                  </For>
                  <For each={result.exportState.plannedExportTargets}>
                    {(target) => (
                      <span class="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-600">
                        {target.replace(/_/g, " ")}
                      </span>
                    )}
                  </For>
                </div>
              </div>
            </div>
          )}
        </For>
        <Show when={panel().hiddenCount > 0}>
          <button
            type="button"
            onClick={() => setShowAll(true)}
            class="w-full rounded-2xl border border-violet-200 bg-white/80 px-3 py-2 text-xs font-medium text-violet-900 transition hover:bg-white"
          >
            Show {panel().hiddenCount} more saved output{panel().hiddenCount === 1 ? "" : "s"}
          </button>
        </Show>
        <Show when={showAll() && panel().resultCount > 5}>
          <button
            type="button"
            onClick={() => setShowAll(false)}
            class="w-full rounded-2xl border border-slate-200 bg-white/75 px-3 py-2 text-xs font-medium text-on-surface-variant transition hover:bg-white"
          >
            Show recent 5 only
          </button>
        </Show>
      </div>
    </div>
  );
}
