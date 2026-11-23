import { createMemo, For, Show } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";
import { safeHref } from "@/lib/api";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import { renderMarkdown } from "@/lib/markdownRenderer";
import { deriveAttachmentGroundingEvidenceFromMessage } from "@/lib/attachmentGroundingEvidence";
import {
  buildFileLibraryIntentFromAttachmentGrounding,
  saveFileLibraryNavigationIntent,
} from "@/lib/fileLibraryNavigationState";
import {
  buildKnowledgeGraphIntentFromAttachmentGrounding,
  saveKnowledgeGraphNavigationIntent,
} from "@/lib/knowledgeGraphNavigationState";
import { navigateToView } from "@/lib/decisionosNavigation";
import { summarizeStudySourceMap } from "@/lib/studySourceMapState";
import {
  buildStudyResultContinuationState,
  explicitStudyResultContinuation,
} from "@/lib/studyResultContinuationState";
import { buildStudyMemoryReinforcementState } from "@/lib/studyMemoryReinforcementState";
import { buildStudyResultMomentumState } from "@/lib/studyResultMomentumState";
import { buildStudyResultHandoffState } from "@/lib/studyResultHandoffState";
import { buildStudyResultValuePathState } from "@/lib/studyResultValuePathState";
import { buildStudyResultCommandCenterState } from "@/lib/studyResultCommandCenterState";
import { buildStudyResultRetentionMapState } from "@/lib/studyResultRetentionMapState";
import { buildStudyNextSessionCarryoverState } from "@/lib/studyNextSessionCarryoverState";
import { buildStudyThreadReinforcementPathState } from "@/lib/studyThreadReinforcementPathState";
import { buildStudyRunOutcomeState } from "@/lib/studyRunOutcomeState";
import { buildStudyResultExportState } from "@/lib/studyResultExportState";
import {
  buildStudyReportArtifact,
  emitStudyReportArtifactSaved,
  saveStudyReportArtifact,
} from "@/lib/studyReportArtifactLocalState";
import {
  academicKindFromStudyLaunchMetadata,
  chapterTagFromStudyLaunchMetadata,
  courseTagFromStudyLaunchMetadata,
  deadlineIdFromStudyLaunchMetadata,
  dueLabelFromStudyLaunchMetadata,
  moduleLabelFromStudyLaunchMetadata,
  providerIdFromStudyLaunchMetadata,
  routeSourceFromStudyLaunchMetadata,
  sessionIdFromStudyLaunchMetadata,
  studyLaunchMetadataFromMessageMetadata,
  unitTagFromStudyLaunchMetadata,
} from "@/lib/studyLaunchMetadataState";
import {
  buildStudySearchContinuationSeed,
  saveStudySearchContinuationSeed,
} from "@/lib/studySearchContinuationState";
import {
  buildStudySearchSnapshot,
  buildStudySearchSections,
  explicitStudySearchSections,
  isStudySearchResult,
} from "@/lib/studySearchResultState";

type SearchSource = {
  title?: string;
  url?: string;
  snippet?: string;
};

type LocalRouterStat = {
  label?: string;
  value?: string;
};

type LocalRouterPreview = {
  title?: string;
  tone?: "success" | "info" | "warning";
  detail?: string;
  confidence_label?: string;
  confidence_band?: string;
  terminal_layer?: string;
  capability_badges?: string[];
  execution_badges?: string[];
  skip_badges?: string[];
  density_badges?: string[];
  budget_badges?: string[];
  stats?: LocalRouterStat[];
};

type AttachmentPolicy = {
  retention_label?: string;
  knowledge_label?: string;
  policy_label?: string;
  policy_outcome?: string;
  cleanup_label?: string | null;
};

type UploadedSourceDescriptor = {
  title: string;
  kindLabel?: string;
  academicKind?: string | null;
  academicSummary?: string | null;
  courseTag?: string | null;
  weekTag?: string | null;
  lectureTag?: string | null;
  chapterTag?: string | null;
  unitTag?: string | null;
  zettelkastenStage?: string | null;
  zettelkastenEntryType?: string | null;
  zettelkastenNextAction?: string | null;
  knowledgeGraphGroupKey?: string | null;
  knowledgeGraphLinkTags?: string[];
};

const QUERY_SEPARATOR = "·";
const URL_ELLIPSIS = "...";

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url.length > 40 ? `${url.slice(0, 37)}${URL_ELLIPSIS}` : url;
  }
}

function localRouterToneClass(preview: LocalRouterPreview | null): string {
  switch (preview?.tone) {
    case "success":
      return "border-emerald-300/45 bg-emerald-50/55 text-emerald-950";
    case "warning":
      return "border-amber-300/45 bg-amber-50/55 text-amber-950";
    default:
      return "border-sky-300/45 bg-sky-50/55 text-sky-950";
  }
}

function searchString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function searchStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function searchSources(value: unknown): SearchSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = afpRecord(entry);
    const url = searchString(record.url);
    if (!safeHref(url)) return [];
    return [{
      title: searchString(record.title) || undefined,
      url,
      snippet: searchString(record.snippet) || undefined,
    }];
  });
}

function localRouterStats(value: unknown): LocalRouterStat[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = afpRecord(entry);
    const label = searchString(record.label);
    const statValue = searchString(record.value);
    return label || statValue ? [{ label: label || undefined, value: statValue || undefined }] : [];
  });
}

function parseLocalRouterPreview(value: unknown): LocalRouterPreview | null {
  const record = afpRecord(value);
  if (Object.keys(record).length === 0) return null;
  const tone = searchString(record.tone);
  return {
    title: searchString(record.title) || undefined,
    tone: tone === "success" || tone === "warning" || tone === "info" ? tone : undefined,
    detail: searchString(record.detail) || undefined,
    confidence_label: searchString(record.confidence_label) || undefined,
    confidence_band: searchString(record.confidence_band) || undefined,
    terminal_layer: searchString(record.terminal_layer) || undefined,
    capability_badges: searchStringArray(record.capability_badges),
    execution_badges: searchStringArray(record.execution_badges),
    skip_badges: searchStringArray(record.skip_badges),
    density_badges: searchStringArray(record.density_badges),
    budget_badges: searchStringArray(record.budget_badges),
    stats: localRouterStats(record.stats),
  };
}

function parseAttachmentPolicy(value: unknown): AttachmentPolicy | null {
  const record = afpRecord(value);
  if (Object.keys(record).length === 0) return null;
  const policyLabel = searchString(record.policy_label);
  const policyOutcome = searchString(record.policy_outcome);
  const retentionLabel = searchString(record.retention_label);
  const knowledgeLabel = searchString(record.knowledge_label);
  const cleanupLabelRaw = record.cleanup_label;
  const cleanupLabel =
    typeof cleanupLabelRaw === "string"
      ? cleanupLabelRaw
      : cleanupLabelRaw === null
        ? null
        : undefined;
  if (!policyLabel && !policyOutcome && !retentionLabel && !knowledgeLabel && cleanupLabel == null) {
    return null;
  }
  return {
    retention_label: retentionLabel || undefined,
    knowledge_label: knowledgeLabel || undefined,
    policy_label: policyLabel || undefined,
    policy_outcome: policyOutcome || undefined,
    cleanup_label: cleanupLabel,
  };
}

function parseUploadedSourceDescriptors(value: unknown): UploadedSourceDescriptor[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = afpRecord(entry);
    const title = searchString(record.title);
    if (!title) return [];
    return [{
      title,
      kindLabel: searchString(record.kindLabel) || undefined,
      academicKind: searchString(record.academicKind) || null,
      academicSummary: searchString(record.academicSummary) || null,
      courseTag: searchString(record.courseTag) || null,
      weekTag: searchString(record.weekTag) || null,
      lectureTag: searchString(record.lectureTag) || null,
      chapterTag: searchString(record.chapterTag) || searchString(record.academic_chapter_tag) || null,
      unitTag: searchString(record.unitTag) || searchString(record.academic_unit_tag) || null,
      zettelkastenStage: searchString(record.zettelkastenStage) || null,
      zettelkastenEntryType: searchString(record.zettelkastenEntryType) || null,
      zettelkastenNextAction: searchString(record.zettelkastenNextAction) || null,
      knowledgeGraphGroupKey: searchString(record.knowledgeGraphGroupKey) || null,
      knowledgeGraphLinkTags: searchStringArray(record.knowledgeGraphLinkTags),
    }];
  });
}

function formatDescriptorLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function uniqueDescriptorValue(
  descriptors: readonly UploadedSourceDescriptor[],
  selector: (descriptor: UploadedSourceDescriptor) => string | null | undefined,
): string | null {
  const values = descriptors
    .map((descriptor) => selector(descriptor)?.trim())
    .filter((value): value is string => Boolean(value));
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0]! : null;
}

export function SearchResultRenderer(props: {
  message: AfpMessage;
  view?: AfpView;
}) {
  const rendererState = createMemo(() => {
    const attachmentGrounding = deriveAttachmentGroundingEvidenceFromMessage(props.message, props.view ?? null);
    const fileLibraryIntent = buildFileLibraryIntentFromAttachmentGrounding(attachmentGrounding);
    const knowledgeGraphIntent = buildKnowledgeGraphIntentFromAttachmentGrounding(attachmentGrounding);
    const viewContent = afpRecord(props.message.encryption ? undefined : props.view?.content);
    const messageContent = afpRecord(decryptedDisplayContent(props.message));
    const studyLaunchMetadata = studyLaunchMetadataFromMessageMetadata(props.message.metadata);
    const query = searchString(viewContent.query, searchString(messageContent.query));
    const summary = searchString(viewContent.summary, searchString(messageContent.summary));
    const viewBullets = searchStringArray(viewContent.bullets);
    const messageBullets = searchStringArray(messageContent.bullets);
    const viewSources = searchSources(viewContent.sources);
    const messageSources = searchSources(messageContent.sources);
    const bullets = viewBullets.length > 0 ? viewBullets : messageBullets;
    const sources = viewSources.length > 0 ? viewSources : messageSources;
    const localRouterPreview =
      parseLocalRouterPreview(viewContent.local_router_preview) ??
      parseLocalRouterPreview(messageContent.local_router_preview);
    const attachmentPolicy =
      parseAttachmentPolicy(viewContent.attachment_policy) ??
      parseAttachmentPolicy(messageContent.attachment_policy);
    const uploadedSourceDescriptors = parseUploadedSourceDescriptors(viewContent.uploaded_source_descriptors).length > 0
      ? parseUploadedSourceDescriptors(viewContent.uploaded_source_descriptors)
      : parseUploadedSourceDescriptors(messageContent.uploaded_source_descriptors).length > 0
        ? parseUploadedSourceDescriptors(messageContent.uploaded_source_descriptors)
        : parseUploadedSourceDescriptors(props.message.metadata?.uploaded_source_descriptors);
    const coverageLabel =
      searchString(props.message.metadata?.source_coverage_label) ||
      searchString(viewContent.source_coverage_label);
    const uploadedSourceCount = Number(props.message.metadata?.uploaded_source_count ?? 0);
    const explicitSections = explicitStudySearchSections(props.message);
    const studyMode = isStudySearchResult({
      query,
      summary,
      bullets,
      uploadedSourceCount,
      attachmentPolicyLabel: attachmentPolicy?.policy_label,
    }) || explicitSections.length > 0;
    const studySections = explicitSections.length > 0
      ? explicitSections
      : studyMode
      ? buildStudySearchSections({
          query,
          summary,
          bullets,
          uploadedSourceCount,
          attachmentPolicyLabel: attachmentPolicy?.policy_label,
        })
      : [];
    const studySnapshot = studyMode
      ? buildStudySearchSnapshot({
          sections: studySections,
          uploadedSourceCount,
          summary,
        })
      : null;
    const studySourceMap = summarizeStudySourceMap(attachmentGrounding);
    const studyResultRetentionMap = buildStudyResultRetentionMapState({
      evidence: attachmentGrounding,
      summary: studySourceMap,
    });
    const studyMemoryReinforcement = buildStudyMemoryReinforcementState(attachmentGrounding);
    const studyMomentum = buildStudyResultMomentumState(attachmentGrounding);
    const studyHandoff = buildStudyResultHandoffState(attachmentGrounding);
    const studySearchContinuationSeed = buildStudySearchContinuationSeed({
      evidence: attachmentGrounding,
      query,
      sections: studySections,
    });
    const studyNextSessionCarryover = buildStudyNextSessionCarryoverState({
      evidence: attachmentGrounding,
      continuationSeed: studySearchContinuationSeed,
    });
    const studyThreadReinforcementPath = buildStudyThreadReinforcementPathState({
      evidence: attachmentGrounding,
      continuationSeed: studySearchContinuationSeed,
    });
    const studyResultValuePath = buildStudyResultValuePathState({
      evidence: attachmentGrounding,
      continuationSeed: studySearchContinuationSeed,
    });
    const studyContinuation =
      explicitStudyResultContinuation(props.message)
      ?? buildStudyResultContinuationState({
        attachmentGrounding,
        fileLibraryIntent,
        knowledgeGraphIntent,
      });
    const studyResultCommandCenter = buildStudyResultCommandCenterState({
      valuePath: studyResultValuePath,
      continuation: studyContinuation,
      momentum: studyMomentum,
      handoff: studyHandoff,
    });
    const additionalStudyNotes = studySections.find((section) => section.id === "additional")?.items ?? [];
    const consumedStudyNotes = new Set(studySections.flatMap((section) => section.id === "additional" ? [] : section.items));
    const fallbackBullets = studyMode
      ? bullets.filter((bullet) => !consumedStudyNotes.has(bullet) && !additionalStudyNotes.includes(bullet))
      : bullets;
    const studyRunOutcome = buildStudyRunOutcomeState(attachmentGrounding);
    const exportCourseTag = uniqueDescriptorValue(uploadedSourceDescriptors, (descriptor) => descriptor.courseTag)
      ?? courseTagFromStudyLaunchMetadata(studyLaunchMetadata);
    const exportChapterTag = uniqueDescriptorValue(uploadedSourceDescriptors, (descriptor) => descriptor.chapterTag)
      ?? chapterTagFromStudyLaunchMetadata(studyLaunchMetadata);
    const exportUnitTag = uniqueDescriptorValue(uploadedSourceDescriptors, (descriptor) => descriptor.unitTag)
      ?? unitTagFromStudyLaunchMetadata(studyLaunchMetadata);
    const exportModuleLabel = moduleLabelFromStudyLaunchMetadata(studyLaunchMetadata);
    const exportDueLabel = dueLabelFromStudyLaunchMetadata(studyLaunchMetadata);
    const exportDeadlineId = deadlineIdFromStudyLaunchMetadata(studyLaunchMetadata);
    const exportProviderId = providerIdFromStudyLaunchMetadata(studyLaunchMetadata);
    const exportAcademicKind = uniqueDescriptorValue(uploadedSourceDescriptors, (descriptor) => descriptor.academicKind)
      ?? academicKindFromStudyLaunchMetadata(studyLaunchMetadata);
    const exportSessionId = sessionIdFromStudyLaunchMetadata(studyLaunchMetadata);
    const studyResultExport = studyMode
      ? buildStudyResultExportState({
          query,
          summary,
          sections: studySections,
          sourceLabels: attachmentGrounding?.sourceLabels,
          policyLabel: attachmentPolicy?.policy_label,
          courseTag: exportCourseTag,
          chapterTag: exportChapterTag,
          unitTag: exportUnitTag,
          moduleLabel: exportModuleLabel,
          dueLabel: exportDueLabel,
          deadlineId: exportDeadlineId,
          providerId: exportProviderId,
          academicKind: exportAcademicKind,
          sessionId: exportSessionId,
        })
      : null;

    return {
      attachmentGrounding,
      fileLibraryIntent,
      knowledgeGraphIntent,
      studySourceMap,
      studyResultRetentionMap,
      studyMemoryReinforcement,
      studyMomentum,
      studyHandoff,
      studyRunOutcome,
      studyResultExport,
      studyResultValuePath,
      studyResultCommandCenter,
      studyContinuation,
      studyNextSessionCarryover,
      studyThreadReinforcementPath,
      studySearchContinuationSeed,
      query,
      summary,
      summaryHtml: summary ? renderMarkdown(summary) : "",
      bullets,
      sources,
      localRouterPreview,
      attachmentPolicy,
      uploadedSourceDescriptors,
      studyLaunchMetadata,
      exportCourseTag,
      exportChapterTag,
      exportUnitTag,
      exportModuleLabel,
      exportDueLabel,
      exportDeadlineId,
      exportProviderId,
      exportAcademicKind,
      exportSessionId,
      coverageLabel,
      uploadedSourceCount,
      studyMode,
      studySections,
      studySnapshot,
      additionalStudyNotes,
      localRouterToneClass: localRouterToneClass(localRouterPreview),
      localRouterCapabilityBadges: localRouterPreview?.capability_badges ?? [],
      localRouterExecutionBadges: localRouterPreview?.execution_badges ?? [],
      localRouterSkipBadges: localRouterPreview?.skip_badges ?? [],
      localRouterDensityBadges: localRouterPreview?.density_badges ?? [],
      localRouterBudgetBadges: localRouterPreview?.budget_badges ?? [],
      localRouterStats: localRouterPreview?.stats ?? [],
      showQuery: Boolean(query),
      showSummary: Boolean(summary),
      showLocalRouterPreview: Boolean(localRouterPreview),
      showCapabilityBadges: (localRouterPreview?.capability_badges ?? []).length > 0,
      showExecutionBadges: (localRouterPreview?.execution_badges ?? []).length > 0,
      showSkipBadges: (localRouterPreview?.skip_badges ?? []).length > 0,
      showDensityBadges: (localRouterPreview?.density_badges ?? []).length > 0,
      showBudgetBadges: (localRouterPreview?.budget_badges ?? []).length > 0,
      showLocalRouterStats: (localRouterPreview?.stats ?? []).length > 0,
      showBullets: fallbackBullets.length > 0,
      showSources: sources.length > 0,
      showAttachmentPolicy: Boolean(attachmentPolicy),
      showAttachmentCoverage: Boolean(coverageLabel),
      showUploadedSourceDescriptors: uploadedSourceDescriptors.length > 0,
      fallbackBullets,
    };
  });

  function runStudyResultAction(actionId: "files" | "graph" | "search" | null | undefined) {
    if (!actionId) return;
    const state = rendererState();
    if (actionId === "files" && state.fileLibraryIntent) {
      saveFileLibraryNavigationIntent(state.fileLibraryIntent);
      navigateToView("files");
      return;
    }
    if (actionId === "graph" && state.knowledgeGraphIntent) {
      saveKnowledgeGraphNavigationIntent(state.knowledgeGraphIntent);
      navigateToView("knowledge_graph");
      return;
    }
    saveStudySearchContinuationSeed(state.studySearchContinuationSeed);
    navigateToView("search");
  }

  function copyStudyResult() {
    const markdown = rendererState().studyResultExport?.markdown;
    if (!markdown) return;
    void navigator.clipboard?.writeText(markdown);
  }

  function printStudyResult() {
    window.print();
  }

  function downloadStudyResult() {
    const exportState = rendererState().studyResultExport;
    if (!exportState) return;
    const blob = new Blob([exportState.markdown], { type: exportState.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportState.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function downloadStudyResultHtml() {
    const exportState = rendererState().studyResultExport;
    if (!exportState) return;
    const blob = new Blob([exportState.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportState.htmlFilename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function downloadStudyResultWord() {
    const exportState = rendererState().studyResultExport;
    if (!exportState) return;
    const blob = new Blob([exportState.html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportState.wordFilename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function downloadStudyResultCsv() {
    const exportState = rendererState().studyResultExport;
    if (!exportState?.csv || !exportState.csvFilename) return;
    const blob = new Blob([exportState.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportState.csvFilename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function saveStudyResultArtifact() {
    const state = rendererState();
    if (!state.studyResultExport) return;
    const artifact = buildStudyReportArtifact({
      exportState: state.studyResultExport,
      sourceLabels: state.attachmentGrounding?.sourceLabels,
      policyLabel: state.attachmentPolicy?.policy_label,
      courseTag: state.exportCourseTag,
      chapterTag: state.exportChapterTag,
      unitTag: state.exportUnitTag,
      moduleLabel: state.exportModuleLabel,
      dueLabel: state.exportDueLabel,
      deadlineId: state.exportDeadlineId,
      providerId: state.exportProviderId,
      academicKind: state.exportAcademicKind,
      sessionId: state.exportSessionId,
      routeSource: routeSourceFromStudyLaunchMetadata(state.studyLaunchMetadata) ?? "search_result",
    });
    saveStudyReportArtifact(artifact);
    emitStudyReportArtifactSaved(artifact);
  }

  return (
    <div class="space-y-4">
      <Show when={rendererState().showQuery}>
        <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-outline">
          Search {QUERY_SEPARATOR} {rendererState().query}
        </p>
      </Show>

      <Show when={rendererState().showSummary}>
        <div class="md-prose" innerHTML={rendererState().summaryHtml} />
      </Show>

      <Show when={rendererState().studyResultCommandCenter}>
        {(commandCenter) => (
          <div class={`rounded-2xl border px-4 py-3 ${
            commandCenter().tone === "amber"
              ? "border-amber-200/80 bg-amber-50/80"
              : commandCenter().tone === "violet"
                ? "border-violet-200/80 bg-violet-50/75"
                : commandCenter().tone === "emerald"
                  ? "border-emerald-200/80 bg-emerald-50/75"
                  : "border-sky-200/80 bg-sky-50/75"
          }`}>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-3xl">
                <p class={`text-sm font-semibold ${
                  commandCenter().tone === "amber"
                    ? "text-amber-950"
                    : commandCenter().tone === "violet"
                      ? "text-violet-950"
                      : commandCenter().tone === "emerald"
                        ? "text-emerald-950"
                        : "text-sky-950"
                }`}>
                  {commandCenter().eyebrowLabel}
                </p>
                <p class={`mt-1 text-xs leading-5 ${
                  commandCenter().tone === "amber"
                    ? "text-amber-900/90"
                    : commandCenter().tone === "violet"
                      ? "text-violet-900/90"
                      : commandCenter().tone === "emerald"
                        ? "text-emerald-900/90"
                        : "text-sky-900/90"
                }`}>
                  {commandCenter().headline}
                </p>
                <p class={`mt-1 text-xs leading-5 ${
                  commandCenter().tone === "amber"
                    ? "text-amber-900/80"
                    : commandCenter().tone === "violet"
                      ? "text-violet-900/80"
                      : commandCenter().tone === "emerald"
                        ? "text-emerald-900/80"
                        : "text-sky-900/80"
                }`}>
                  {commandCenter().detail}
                </p>
              </div>
              <span class={`rounded-full border bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${
                commandCenter().tone === "amber"
                  ? "border-amber-200/80 text-amber-900"
                  : commandCenter().tone === "violet"
                    ? "border-violet-200/80 text-violet-900"
                    : commandCenter().tone === "emerald"
                      ? "border-emerald-200/80 text-emerald-900"
                      : "border-sky-200/80 text-sky-900"
              }`}>
                {commandCenter().badge}
              </span>
            </div>
            <div class="mt-3 grid gap-3 lg:grid-cols-3">
              <For each={commandCenter().cards}>
                {(card) => (
                  <div class={`rounded-2xl border px-3 py-3 shadow-sm ${
                    card.tone === "amber"
                      ? "border-amber-200/80 bg-white/90"
                      : card.tone === "violet"
                        ? "border-violet-200/80 bg-white/90"
                        : card.tone === "emerald"
                          ? "border-emerald-200/80 bg-white/90"
                          : "border-sky-200/80 bg-white/90"
                  }`}>
                    <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      card.tone === "amber"
                        ? "text-amber-800/80"
                        : card.tone === "violet"
                          ? "text-violet-800/80"
                          : card.tone === "emerald"
                            ? "text-emerald-800/80"
                            : "text-sky-800/80"
                    }`}>
                      {card.label}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-on-surface">
                      {card.detail}
                    </p>
                  </div>
                )}
              </For>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runStudyResultAction(commandCenter().primaryActionId)}
                class="rounded-full border border-white/90 bg-white/95 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white"
              >
                {commandCenter().primaryActionLabel}
              </button>
              <Show when={commandCenter().secondaryActionLabel}>
                <button
                  type="button"
                  onClick={() => runStudyResultAction(commandCenter().secondaryActionId)}
                  class="rounded-full border border-white/90 bg-white/80 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white"
                >
                  {commandCenter().secondaryActionLabel}
                </button>
              </Show>
            </div>
          </div>
        )}
      </Show>

      <Show when={rendererState().studyMode}>
        <div class="rounded-2xl border border-sky-200/70 bg-sky-50/55 px-4 py-3">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-sky-950">Study synthesis</p>
              <p class="mt-1 text-xs leading-5 text-sky-900/80">
                This result is structured for quick revision from your grounded study material.
              </p>
            </div>
            <Show when={rendererState().uploadedSourceCount > 0}>
              <span class="rounded-full border border-sky-300/70 bg-white/85 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-sky-900">
                {rendererState().uploadedSourceCount} study source{rendererState().uploadedSourceCount === 1 ? "" : "s"}
              </span>
            </Show>
          </div>
          <Show when={rendererState().studyResultExport}>
            {(exportState) => (
              <div class="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-white/75 bg-white/80 px-3 py-2">
                <span class="text-xs leading-5 text-sky-950/80">
                  Reuse this structured result for revision notes, printing, or flashcard cleanup.
                </span>
                <button
                  type="button"
                  onClick={copyStudyResult}
                  class="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-900 transition hover:bg-sky-100"
                >
                  {exportState().copyLabel}
                </button>
                <button
                  type="button"
                  onClick={printStudyResult}
                  class="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-slate-50"
                >
                  {exportState().printLabel}
                </button>
                <button
                  type="button"
                  onClick={downloadStudyResult}
                  class="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900 transition hover:bg-emerald-100"
                >
                  {exportState().downloadLabel}
                </button>
                <button
                  type="button"
                  onClick={downloadStudyResultHtml}
                  class="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900 transition hover:bg-emerald-100"
                >
                  Download HTML
                </button>
                <button
                  type="button"
                  onClick={downloadStudyResultWord}
                  class="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900 transition hover:bg-emerald-100"
                >
                  Download Word
                </button>
                <Show when={exportState().csv}>
                  <button
                    type="button"
                    onClick={downloadStudyResultCsv}
                    class="rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-900 transition hover:bg-teal-100"
                  >
                    Download CSV
                  </button>
                </Show>
                <button
                  type="button"
                  onClick={saveStudyResultArtifact}
                  class="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-900 transition hover:bg-violet-100"
                >
                  Save to Reports
                </button>
                <div class="basis-full text-[11px] leading-5 text-sky-950/75">
                  {exportState().answersIncludedLabel}
                </div>
                <Show when={exportState().metadataLabels.length > 0}>
                  <div class="flex basis-full flex-wrap gap-1.5">
                    <For each={exportState().metadataLabels}>
                      {(label) => (
                        <span class="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-medium text-sky-900">
                          {label}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
                <div class="flex basis-full flex-wrap gap-1.5">
                  <For each={exportState().exportTargets}>
                    {(target) => (
                      <span class={`rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${
                        target.availability === "planned"
                          ? "border-slate-200 bg-slate-50 text-slate-600"
                          : target.availability === "browser_print"
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-emerald-200 bg-emerald-50 text-emerald-800"
                      }`} title={target.detail}>
                        {target.label} {target.availability === "planned" ? "planned" : target.availability === "browser_print" ? "print" : "ready"}
                      </span>
                    )}
                  </For>
                </div>
              </div>
            )}
          </Show>
          <Show when={rendererState().studySnapshot}>
            {(snapshot) => (
              <div class="mt-3 rounded-2xl border border-sky-200/70 bg-white/85 px-3 py-3 shadow-sm">
                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800/75">
                  {snapshot().headline}
                </p>
                <p class="mt-1 text-xs leading-5 text-sky-950/85">
                  {snapshot().subheadline}
                </p>
                <div class="mt-3 grid gap-3 lg:grid-cols-3">
                  <For each={snapshot().highlights}>
                    {(highlight) => (
                      <div class={`rounded-2xl border px-3 py-3 shadow-sm ${
                        highlight.tone === "amber"
                          ? "border-amber-200/80 bg-amber-50/85"
                          : highlight.tone === "emerald"
                            ? "border-emerald-200/80 bg-emerald-50/85"
                            : highlight.tone === "violet"
                              ? "border-violet-200/80 bg-violet-50/85"
                              : "border-sky-200/80 bg-sky-50/85"
                      }`}>
                        <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                          highlight.tone === "amber"
                            ? "text-amber-800/80"
                            : highlight.tone === "emerald"
                              ? "text-emerald-800/80"
                              : highlight.tone === "violet"
                                ? "text-violet-800/80"
                                : "text-sky-800/80"
                        }`}>
                          {highlight.title}
                        </p>
                        <p class="mt-1 text-sm leading-6 text-on-surface">
                          {highlight.body}
                        </p>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )}
          </Show>
          <div class="mt-3 grid gap-3 lg:grid-cols-2">
            <For each={rendererState().studySections.filter((section) => section.id !== "additional")}>
              {(section) => (
                <div class="rounded-2xl border border-white/75 bg-white/80 px-3 py-3 shadow-sm">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800/75">
                    {section.title}
                  </p>
                  <ul class="mt-2 space-y-1.5">
                    <For each={section.items}>
                      {(item) => (
                        <li class="flex items-start gap-2 text-sm leading-6 text-on-surface">
                          <span class="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-sky-500" />
                          <span>{item}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              )}
            </For>
          </div>
          <Show when={rendererState().additionalStudyNotes.length > 0}>
            <div class="mt-3 rounded-2xl border border-white/75 bg-white/80 px-3 py-3 shadow-sm">
              <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700/80">
                Additional notes
              </p>
              <ul class="mt-2 space-y-1.5">
                <For each={rendererState().additionalStudyNotes}>
                  {(item) => (
                    <li class="flex items-start gap-2 text-sm leading-6 text-on-surface">
                      <span class="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-400" />
                      <span>{item}</span>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={rendererState().showAttachmentPolicy}>
        <div class="rounded-2xl border border-emerald-200/70 bg-emerald-50/75 px-3 py-3 text-emerald-950">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-medium">
                Uploaded study material
                <Show when={rendererState().uploadedSourceCount > 0}>
                  <span class="ml-1 text-xs font-normal opacity-75">
                    ({rendererState().uploadedSourceCount} source{rendererState().uploadedSourceCount === 1 ? "" : "s"})
                  </span>
                </Show>
              </p>
              <Show when={rendererState().attachmentPolicy?.policy_outcome}>
                <p class="mt-1 text-xs leading-5 opacity-85">
                  {rendererState().attachmentPolicy?.policy_outcome}
                </p>
              </Show>
            </div>
            <Show when={rendererState().attachmentPolicy?.policy_label}>
              <span class="rounded-full border border-emerald-300/70 bg-white/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]">
                {rendererState().attachmentPolicy?.policy_label}
              </span>
            </Show>
          </div>
          <div class="mt-2 flex flex-wrap gap-2 text-[11px]">
            <Show when={rendererState().attachmentPolicy?.knowledge_label}>
              <span class="rounded-full border border-sky-200/70 bg-sky-50/90 px-2.5 py-1 text-sky-900">
                {rendererState().attachmentPolicy?.knowledge_label}
              </span>
            </Show>
            <Show when={rendererState().attachmentPolicy?.retention_label}>
              <span class="rounded-full border border-emerald-200/70 bg-white/85 px-2.5 py-1">
                {rendererState().attachmentPolicy?.retention_label}
              </span>
            </Show>
            <Show when={rendererState().showAttachmentCoverage}>
              <span class="rounded-full border border-amber-200/70 bg-amber-50/90 px-2.5 py-1 text-amber-900">
                {rendererState().coverageLabel}
              </span>
            </Show>
            <Show when={rendererState().attachmentPolicy?.cleanup_label}>
              <span class="rounded-full border border-rose-200/70 bg-rose-50/90 px-2.5 py-1 text-rose-900">
                {rendererState().attachmentPolicy?.cleanup_label}
              </span>
            </Show>
          </div>
        </div>
      </Show>

      <Show when={rendererState().studyResultRetentionMap}>
        {(retentionMap) => (
          <div class={`rounded-2xl border px-4 py-3 shadow-sm ${
            retentionMap().tone === "amber"
              ? "border-amber-200/80 bg-amber-50/80"
              : retentionMap().tone === "violet"
                ? "border-violet-200/80 bg-violet-50/75"
                : retentionMap().tone === "emerald"
                  ? "border-emerald-200/80 bg-emerald-50/75"
                  : "border-sky-200/80 bg-sky-50/75"
          }`}>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-3xl">
                <p class={`text-sm font-semibold ${
                  retentionMap().tone === "amber"
                    ? "text-amber-950"
                    : retentionMap().tone === "violet"
                      ? "text-violet-950"
                      : retentionMap().tone === "emerald"
                        ? "text-emerald-950"
                        : "text-sky-950"
                }`}>
                  Where this study material now lives
                </p>
                <p class={`mt-1 text-xs leading-5 ${
                  retentionMap().tone === "amber"
                    ? "text-amber-900/90"
                    : retentionMap().tone === "violet"
                      ? "text-violet-900/90"
                      : retentionMap().tone === "emerald"
                        ? "text-emerald-900/90"
                        : "text-sky-900/90"
                }`}>
                  {retentionMap().headline}
                </p>
                <p class={`mt-1 text-xs leading-5 ${
                  retentionMap().tone === "amber"
                    ? "text-amber-900/80"
                    : retentionMap().tone === "violet"
                      ? "text-violet-900/80"
                      : retentionMap().tone === "emerald"
                        ? "text-emerald-900/80"
                        : "text-sky-900/80"
                }`}>
                  {retentionMap().detail}
                </p>
              </div>
              <span class={`rounded-full border bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${
                retentionMap().tone === "amber"
                  ? "border-amber-200/80 text-amber-900"
                  : retentionMap().tone === "violet"
                    ? "border-violet-200/80 text-violet-900"
                    : retentionMap().tone === "emerald"
                      ? "border-emerald-200/80 text-emerald-900"
                      : "border-sky-200/80 text-sky-900"
              }`}>
                {retentionMap().badge}
              </span>
            </div>
            <div class="mt-3 grid gap-3 lg:grid-cols-3">
              <For each={retentionMap().cards}>
                {(card) => (
                  <div class={`rounded-2xl border px-3 py-3 shadow-sm ${
                    card.tone === "emerald"
                      ? "border-emerald-200/80 bg-white/90"
                      : card.tone === "violet"
                        ? "border-violet-200/80 bg-white/90"
                        : card.tone === "amber"
                          ? "border-amber-200/80 bg-white/90"
                          : "border-sky-200/80 bg-white/90"
                  }`}>
                    <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      card.tone === "emerald"
                        ? "text-emerald-800/80"
                        : card.tone === "violet"
                          ? "text-violet-800/80"
                          : card.tone === "amber"
                            ? "text-amber-800/80"
                            : "text-sky-800/80"
                    }`}>
                      {card.label}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-on-surface">
                      {card.detail}
                    </p>
                  </div>
                )}
              </For>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runStudyResultAction(retentionMap().primaryActionId)}
                class="rounded-full border border-white/90 bg-white/95 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white"
              >
                {retentionMap().primaryActionLabel}
              </button>
              <Show when={retentionMap().secondaryActionLabel}>
                <button
                  type="button"
                  onClick={() => runStudyResultAction(retentionMap().secondaryActionId)}
                  class="rounded-full border border-white/90 bg-white/80 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white"
                >
                  {retentionMap().secondaryActionLabel}
                </button>
              </Show>
            </div>
          </div>
        )}
      </Show>

      <Show when={rendererState().studyRunOutcome}>
        {(outcome) => (
          <div class="rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-3 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-3xl">
                <p class="text-sm font-semibold text-slate-950">What this upload changed</p>
                <p class="mt-1 text-xs leading-5 text-slate-900/90">
                  {outcome().headline}
                </p>
                <p class="mt-1 text-xs leading-5 text-slate-700">
                  {outcome().detail}
                </p>
              </div>
              <span class="rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-800">
                {outcome().badge}
              </span>
            </div>
            <div class="mt-3 grid gap-3 lg:grid-cols-3">
              <For each={outcome().cards}>
                {(card) => (
                  <div class={`rounded-2xl border px-3 py-3 shadow-sm ${
                    card.tone === "amber"
                      ? "border-amber-200/80 bg-amber-50/85"
                      : card.tone === "emerald"
                        ? "border-emerald-200/80 bg-emerald-50/85"
                        : card.tone === "violet"
                          ? "border-violet-200/80 bg-violet-50/85"
                          : "border-sky-200/80 bg-sky-50/85"
                  }`}>
                    <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      card.tone === "amber"
                        ? "text-amber-800/80"
                        : card.tone === "emerald"
                          ? "text-emerald-800/80"
                          : card.tone === "violet"
                            ? "text-violet-800/80"
                            : "text-sky-800/80"
                    }`}>
                      {card.label}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-on-surface">
                      {card.detail}
                    </p>
                  </div>
                )}
              </For>
            </div>
            <p class="mt-3 text-xs leading-5 text-slate-700">
              {outcome().nextStepLabel}
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runStudyResultAction(outcome().primaryActionId)}
                class="rounded-full border border-slate-300/80 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
              >
                {outcome().primaryActionLabel}
              </button>
              <Show when={outcome().secondaryActionId && outcome().secondaryActionLabel}>
                <button
                  type="button"
                  onClick={() => runStudyResultAction(outcome().secondaryActionId)}
                  class="rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 transition hover:bg-slate-50"
                >
                  {outcome().secondaryActionLabel}
                </button>
              </Show>
            </div>
          </div>
        )}
      </Show>

      <Show when={rendererState().studyResultValuePath}>
        {(valuePath) => (
          <div class={`rounded-2xl border px-4 py-3 ${
            valuePath().grade === "fix_retention"
              ? "border-amber-200/80 bg-amber-50/80"
              : valuePath().grade === "zettelkasten_ready"
                ? "border-violet-200/80 bg-violet-50/75"
                : valuePath().grade === "connected_pack_ready"
                  ? "border-emerald-200/80 bg-emerald-50/75"
                  : "border-sky-200/80 bg-sky-50/75"
          }`}>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-3xl">
                <p class={`text-sm font-semibold ${
                  valuePath().grade === "fix_retention"
                    ? "text-amber-950"
                    : valuePath().grade === "zettelkasten_ready"
                      ? "text-violet-950"
                      : valuePath().grade === "connected_pack_ready"
                        ? "text-emerald-950"
                        : "text-sky-950"
                }`}>
                  Best next move for this study result
                </p>
                <p class={`mt-1 text-xs leading-5 ${
                  valuePath().grade === "fix_retention"
                    ? "text-amber-900/90"
                    : valuePath().grade === "zettelkasten_ready"
                      ? "text-violet-900/90"
                      : valuePath().grade === "connected_pack_ready"
                        ? "text-emerald-900/90"
                        : "text-sky-900/90"
                }`}>
                  {valuePath().headline}
                </p>
                <p class={`mt-1 text-xs leading-5 ${
                  valuePath().grade === "fix_retention"
                    ? "text-amber-900/80"
                    : valuePath().grade === "zettelkasten_ready"
                      ? "text-violet-900/80"
                      : valuePath().grade === "connected_pack_ready"
                        ? "text-emerald-900/80"
                        : "text-sky-900/80"
                }`}>
                  {valuePath().detail}
                </p>
              </div>
              <span class={`rounded-full border bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${
                valuePath().grade === "fix_retention"
                  ? "border-amber-200/80 text-amber-900"
                  : valuePath().grade === "zettelkasten_ready"
                    ? "border-violet-200/80 text-violet-900"
                    : valuePath().grade === "connected_pack_ready"
                      ? "border-emerald-200/80 text-emerald-900"
                      : "border-sky-200/80 text-sky-900"
              }`}>
                {valuePath().badge}
              </span>
            </div>
            <div class="mt-3 grid gap-3 lg:grid-cols-3">
              <For each={valuePath().cards}>
                {(card) => (
                  <div class={`rounded-2xl border px-3 py-3 shadow-sm ${
                    card.tone === "emerald"
                      ? "border-emerald-200/80 bg-white/90"
                      : card.tone === "violet"
                        ? "border-violet-200/80 bg-white/90"
                        : card.tone === "amber"
                          ? "border-amber-200/80 bg-white/90"
                          : "border-sky-200/80 bg-white/90"
                  }`}>
                    <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      card.tone === "emerald"
                        ? "text-emerald-800/80"
                        : card.tone === "violet"
                          ? "text-violet-800/80"
                          : card.tone === "amber"
                            ? "text-amber-800/80"
                            : "text-sky-800/80"
                    }`}>
                      {card.label}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-on-surface">
                      {card.detail}
                    </p>
                  </div>
                )}
              </For>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runStudyResultAction(valuePath().primaryActionId)}
                class="rounded-full border border-white/90 bg-white/95 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white"
              >
                {valuePath().primaryActionLabel}
              </button>
              <Show when={valuePath().secondaryActionLabel}>
                <button
                  type="button"
                  onClick={() => runStudyResultAction(valuePath().secondaryActionId)}
                  class="rounded-full border border-white/90 bg-white/80 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white"
                >
                  {valuePath().secondaryActionLabel}
                </button>
              </Show>
            </div>
          </div>
        )}
      </Show>

      <Show when={rendererState().showUploadedSourceDescriptors}>
        <div class="rounded-2xl border border-violet-200/70 bg-violet-50/70 px-4 py-3">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-violet-950">Study source map</p>
              <p class="mt-1 text-xs leading-5 text-violet-900/80">
                OmnyID classified each uploaded source so later retrieval, Files search, and linked-idea navigation stay grounded.
              </p>
            </div>
            <Show when={rendererState().uploadedSourceCount > 0}>
              <span class="rounded-full border border-violet-300/70 bg-white/85 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-violet-900">
                {rendererState().uploadedSourceCount} classified source{rendererState().uploadedSourceCount === 1 ? "" : "s"}
              </span>
            </Show>
          </div>
          <Show when={rendererState().studySourceMap}>
            {(summary) => (
              <div class="mt-3 grid gap-2 lg:grid-cols-3">
                <div class="rounded-2xl border border-white/80 bg-white/80 px-3 py-3 shadow-sm">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-800/75">
                    What OmnyID recognized
                  </p>
                  <p class="mt-1 text-xs leading-5 text-violet-950">{summary().headline}</p>
                </div>
                <div class="rounded-2xl border border-white/80 bg-white/80 px-3 py-3 shadow-sm">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-800/75">
                    Why it stays findable
                  </p>
                  <p class="mt-1 text-xs leading-5 text-violet-950">{summary().retrievalSummary}</p>
                </div>
                <div class="rounded-2xl border border-white/80 bg-white/80 px-3 py-3 shadow-sm">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-800/75">
                    Best next step
                  </p>
                  <p class="mt-1 text-xs leading-5 text-violet-950">{summary().nextStepSummary}</p>
                </div>
              </div>
            )}
          </Show>
          <Show when={rendererState().studySourceMap}>
            {(summary) => (
              <div class="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em] text-violet-900/80">
                <For each={summary().academicKinds}>
                  {(value) => (
                    <span class="rounded-full border border-violet-200/70 bg-white px-2 py-1">
                      {formatDescriptorLabel(value)}
                    </span>
                  )}
                </For>
                <For each={summary().courseTags}>
                  {(value) => (
                    <span class="rounded-full border border-violet-200/70 bg-white px-2 py-1">
                      {value}
                    </span>
                  )}
                </For>
                <For each={summary().weekTags}>
                  {(value) => (
                    <span class="rounded-full border border-indigo-200/70 bg-indigo-50 px-2 py-1 text-indigo-900">
                      {value}
                    </span>
                  )}
                </For>
                <For each={summary().lectureTags}>
                  {(value) => (
                    <span class="rounded-full border border-sky-200/70 bg-sky-50 px-2 py-1 text-sky-900">
                      {value}
                    </span>
                  )}
                </For>
                <For each={summary().zettelkastenStages}>
                  {(value) => (
                    <span class="rounded-full border border-emerald-200/70 bg-emerald-50 px-2 py-1 text-emerald-900">
                      {formatDescriptorLabel(value)}
                    </span>
                  )}
                </For>
              </div>
            )}
          </Show>
          <div class="mt-3 grid gap-3 lg:grid-cols-2">
            <For each={rendererState().uploadedSourceDescriptors}>
              {(descriptor) => (
                <div class="rounded-2xl border border-white/80 bg-white/80 px-3 py-3 shadow-sm">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <p class="min-w-0 flex-1 break-words text-sm font-semibold text-on-surface">{descriptor.title}</p>
                    <Show when={descriptor.kindLabel}>
                      <span class="max-w-full break-words rounded-full border border-violet-200/70 bg-violet-50 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-violet-800">
                        {descriptor.kindLabel?.replace("Uploaded study source - ", "")}
                      </span>
                    </Show>
                  </div>
                  <Show when={descriptor.academicSummary}>
                    <p class="mt-2 text-xs leading-5 text-violet-950">{descriptor.academicSummary}</p>
                  </Show>
                  <Show when={descriptor.knowledgeGraphGroupKey || descriptor.zettelkastenNextAction}>
                    <div class="mt-2 rounded-xl border border-cyan-200/70 bg-cyan-50/80 px-2.5 py-2">
                      <Show when={descriptor.knowledgeGraphGroupKey}>
                        <p class="text-xs leading-5 text-cyan-950">Graph anchor: {descriptor.knowledgeGraphGroupKey}</p>
                      </Show>
                      <Show when={descriptor.zettelkastenNextAction}>
                        <p class="text-xs leading-5 text-cyan-950">Next note move: {descriptor.zettelkastenNextAction}</p>
                      </Show>
                    </div>
                  </Show>
                  <div class="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em] text-violet-900/80">
                    <Show when={descriptor.courseTag}>
                      <span class="rounded-full border border-violet-200/70 bg-white px-2 py-1">{descriptor.courseTag}</span>
                    </Show>
                    <Show when={descriptor.weekTag}>
                      <span class="rounded-full border border-violet-200/70 bg-white px-2 py-1">{descriptor.weekTag}</span>
                    </Show>
                    <Show when={descriptor.lectureTag}>
                      <span class="rounded-full border border-violet-200/70 bg-white px-2 py-1">{descriptor.lectureTag}</span>
                    </Show>
                    <Show when={descriptor.chapterTag}>
                      <span class="rounded-full border border-violet-200/70 bg-white px-2 py-1">{descriptor.chapterTag}</span>
                    </Show>
                    <Show when={descriptor.unitTag}>
                      <span class="rounded-full border border-violet-200/70 bg-white px-2 py-1">{descriptor.unitTag}</span>
                    </Show>
                    <Show when={descriptor.zettelkastenStage}>
                      <span class="rounded-full border border-emerald-200/70 bg-emerald-50 px-2 py-1 text-emerald-900">{descriptor.zettelkastenStage}</span>
                    </Show>
                    <Show when={descriptor.zettelkastenEntryType}>
                      <span class="rounded-full border border-emerald-200/70 bg-emerald-50 px-2 py-1 text-emerald-900">{descriptor.zettelkastenEntryType}</span>
                    </Show>
                    <For each={(descriptor.knowledgeGraphLinkTags ?? []).slice(0, 5)}>
                      {(tag) => (
                        <span class="rounded-full border border-cyan-200/70 bg-cyan-50 px-2 py-1 text-cyan-900">
                          {tag}
                        </span>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
          <Show when={rendererState().fileLibraryIntent || rendererState().knowledgeGraphIntent}>
            <div class="mt-3 flex flex-wrap gap-2">
              <Show when={rendererState().fileLibraryIntent}>
                {(intent) => (
                  <button
                    type="button"
                    onClick={() => {
                      saveFileLibraryNavigationIntent(intent());
                      navigateToView("files");
                    }}
                    class="rounded-full border border-violet-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-violet-950 transition hover:bg-white"
                  >
                    Open retained sources
                  </button>
                )}
              </Show>
              <Show when={rendererState().knowledgeGraphIntent}>
                {(intent) => (
                  <button
                    type="button"
                    onClick={() => {
                      saveKnowledgeGraphNavigationIntent(intent());
                      navigateToView("knowledge_graph");
                    }}
                    class="rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1.5 text-xs font-medium text-emerald-950 transition hover:bg-emerald-100"
                  >
                    {intent().activeLens === "zettelkasten" ? "Open Zettelkasten view" : "Open linked study graph"}
                  </button>
                )}
              </Show>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={rendererState().studyHandoff}>
        {(handoff) => (
          <div class="rounded-2xl border border-violet-200/70 bg-violet-50/75 px-4 py-3">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-3xl">
                <p class="text-sm font-semibold text-violet-950">Use this result now</p>
                <p class="mt-1 text-xs leading-5 text-violet-900/90">
                  {handoff().headline}
                </p>
                <p class="mt-1 text-xs leading-5 text-violet-900/75">
                  {handoff().detail}
                </p>
              </div>
              <span class="rounded-full border border-violet-200/80 bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-violet-900">
                {handoff().badge}
              </span>
            </div>
            <div class="mt-3 grid gap-3 lg:grid-cols-3">
              <For each={handoff().steps}>
                {(step, index) => (
                  <button
                    type="button"
                    onClick={() => {
                      const fileIntent = rendererState().fileLibraryIntent;
                      const graphIntent = rendererState().knowledgeGraphIntent;
                      if (step.actionId === "files" && fileIntent) {
                        saveFileLibraryNavigationIntent(fileIntent);
                        navigateToView("files");
                        return;
                      }
                      if (step.actionId === "graph" && graphIntent) {
                        saveKnowledgeGraphNavigationIntent(graphIntent);
                        navigateToView("knowledge_graph");
                        return;
                      }
                      saveStudySearchContinuationSeed(rendererState().studySearchContinuationSeed);
                      navigateToView("search");
                    }}
                    class={`rounded-2xl border px-3 py-3 text-left shadow-sm transition ${
                      step.tone === "amber"
                        ? "border-amber-200/80 bg-amber-50/85 hover:bg-amber-100/85"
                        : step.tone === "emerald"
                          ? "border-emerald-200/80 bg-emerald-50/85 hover:bg-emerald-100/85"
                          : step.tone === "violet"
                            ? "border-violet-200/80 bg-violet-50/85 hover:bg-violet-100/85"
                            : "border-sky-200/80 bg-sky-50/85 hover:bg-sky-100/85"
                    }`}
                  >
                    <div class="flex items-start gap-2">
                      <span class={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                        step.tone === "amber"
                          ? "bg-amber-100 text-amber-800"
                          : step.tone === "emerald"
                            ? "bg-emerald-100 text-emerald-800"
                            : step.tone === "violet"
                              ? "bg-violet-100 text-violet-800"
                              : "bg-sky-100 text-sky-800"
                      }`}>
                        {index() + 1}
                      </span>
                      <div>
                        <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                          step.tone === "amber"
                            ? "text-amber-800/80"
                            : step.tone === "emerald"
                              ? "text-emerald-800/80"
                              : step.tone === "violet"
                                ? "text-violet-800/80"
                                : "text-sky-800/80"
                        }`}>
                          {step.label}
                        </p>
                        <p class="mt-1 text-xs leading-5 text-on-surface">
                          {step.detail}
                        </p>
                        <p class="mt-2 text-[11px] font-medium text-on-surface/75">
                          {step.actionLabel}
                        </p>
                      </div>
                    </div>
                  </button>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>

      <Show when={rendererState().studyMemoryReinforcement}>
        {(reinforcement) => (
          <div class={`rounded-2xl border px-4 py-3 ${
            reinforcement().grade === "reinforced"
              ? "border-emerald-200/80 bg-emerald-50/75"
              : reinforcement().grade === "developing"
                ? "border-sky-200/80 bg-sky-50/75"
                : "border-amber-200/80 bg-amber-50/80"
          }`}>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-3xl">
                <p class={`text-sm font-semibold ${
                  reinforcement().grade === "reinforced"
                    ? "text-emerald-950"
                    : reinforcement().grade === "developing"
                      ? "text-sky-950"
                      : "text-amber-950"
                }`}>
                  Memory strength from this run
                </p>
                <p class={`mt-1 text-xs leading-5 ${
                  reinforcement().grade === "reinforced"
                    ? "text-emerald-900/90"
                    : reinforcement().grade === "developing"
                      ? "text-sky-900/90"
                      : "text-amber-900/90"
                }`}>
                  {reinforcement().headline}
                </p>
                <p class={`mt-1 text-xs leading-5 ${
                  reinforcement().grade === "reinforced"
                    ? "text-emerald-900/75"
                    : reinforcement().grade === "developing"
                      ? "text-sky-900/75"
                      : "text-amber-900/80"
                }`}>
                  {reinforcement().detail}
                </p>
              </div>
              <span class={`rounded-full border bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${
                reinforcement().grade === "reinforced"
                  ? "border-emerald-200/80 text-emerald-900"
                  : reinforcement().grade === "developing"
                    ? "border-sky-200/80 text-sky-900"
                    : "border-amber-200/80 text-amber-900"
              }`}>
                {reinforcement().badge}
              </span>
            </div>
            <div class="mt-3 grid gap-3 lg:grid-cols-3">
              <For each={reinforcement().signals}>
                {(signal) => (
                  <div class={`rounded-2xl border px-3 py-3 shadow-sm ${
                    signal.tone === "emerald"
                      ? "border-emerald-200/80 bg-white/90"
                      : signal.tone === "violet"
                        ? "border-violet-200/80 bg-white/90"
                        : signal.tone === "amber"
                          ? "border-amber-200/80 bg-white/90"
                          : "border-sky-200/80 bg-white/90"
                  }`}>
                    <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      signal.tone === "emerald"
                        ? "text-emerald-800/80"
                        : signal.tone === "violet"
                          ? "text-violet-800/80"
                          : signal.tone === "amber"
                            ? "text-amber-800/80"
                            : "text-sky-800/80"
                    }`}>
                      {signal.label}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-on-surface">
                      {signal.value}
                    </p>
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>

      <Show when={rendererState().studyNextSessionCarryover}>
        {(carryover) => (
          <div class={`rounded-2xl border px-4 py-3 ${
            carryover().badge === "Next session ready"
              ? "border-teal-200/80 bg-teal-50/75"
              : "border-amber-200/80 bg-amber-50/80"
          }`}>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-3xl">
                <p class={`text-sm font-semibold ${
                  carryover().badge === "Next session ready" ? "text-teal-950" : "text-amber-950"
                }`}>
                  What the next study session inherits
                </p>
                <p class={`mt-1 text-xs leading-5 ${
                  carryover().badge === "Next session ready" ? "text-teal-900/90" : "text-amber-900/90"
                }`}>
                  {carryover().headline}
                </p>
                <p class={`mt-1 text-xs leading-5 ${
                  carryover().badge === "Next session ready" ? "text-teal-900/75" : "text-amber-900/80"
                }`}>
                  {carryover().detail}
                </p>
              </div>
              <span class={`rounded-full border bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${
                carryover().badge === "Next session ready"
                  ? "border-teal-200/80 text-teal-900"
                  : "border-amber-200/80 text-amber-900"
              }`}>
                {carryover().badge}
              </span>
            </div>
            <Show when={carryover().focusBadges.length > 0}>
              <div class="mt-3 flex flex-wrap gap-2">
                <For each={carryover().focusBadges}>
                  {(badge) => (
                    <span class="rounded-full border border-violet-200/80 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-900">
                      {badge}
                    </span>
                  )}
                </For>
              </div>
            </Show>
            <div class="mt-3 grid gap-3 lg:grid-cols-3">
              <For each={carryover().cards}>
                {(card) => (
                  <div class={`rounded-2xl border px-3 py-3 shadow-sm ${
                    card.tone === "emerald"
                      ? "border-emerald-200/80 bg-white/90"
                      : card.tone === "violet"
                        ? "border-violet-200/80 bg-white/90"
                        : card.tone === "amber"
                          ? "border-amber-200/80 bg-white/90"
                          : "border-sky-200/80 bg-white/90"
                  }`}>
                    <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      card.tone === "emerald"
                        ? "text-emerald-800/80"
                        : card.tone === "violet"
                          ? "text-violet-800/80"
                          : card.tone === "amber"
                            ? "text-amber-800/80"
                            : "text-sky-800/80"
                    }`}>
                      {card.label}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-on-surface">
                      {card.detail}
                    </p>
                  </div>
                )}
              </For>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  saveStudySearchContinuationSeed(rendererState().studySearchContinuationSeed);
                  navigateToView("search");
                }}
                class="rounded-full border border-white/90 bg-white/95 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white"
              >
                {carryover().primaryActionLabel}
              </button>
              <Show when={carryover().secondaryActionLabel && rendererState().fileLibraryIntent}>
                <button
                  type="button"
                  onClick={() => {
                    const fileIntent = rendererState().fileLibraryIntent;
                    if (!fileIntent) return;
                    saveFileLibraryNavigationIntent(fileIntent);
                    navigateToView("files");
                  }}
                  class="rounded-full border border-white/90 bg-white/80 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white"
                >
                  {carryover().secondaryActionLabel}
                </button>
              </Show>
            </div>
          </div>
        )}
      </Show>

      <Show when={rendererState().studyThreadReinforcementPath}>
        {(path) => (
          <div class={`rounded-2xl border px-4 py-3 ${
            path().badge === "Fix retention first"
              ? "border-amber-200/80 bg-amber-50/80"
              : "border-sky-200/80 bg-sky-50/75"
          }`}>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-3xl">
                <p class={`text-sm font-semibold ${
                  path().badge === "Fix retention first" ? "text-amber-950" : "text-sky-950"
                }`}>
                  How to strengthen this same study thread
                </p>
                <p class={`mt-1 text-xs leading-5 ${
                  path().badge === "Fix retention first" ? "text-amber-900/90" : "text-sky-900/90"
                }`}>
                  {path().headline}
                </p>
                <p class={`mt-1 text-xs leading-5 ${
                  path().badge === "Fix retention first" ? "text-amber-900/80" : "text-sky-900/80"
                }`}>
                  {path().detail}
                </p>
              </div>
              <span class={`rounded-full border bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${
                path().badge === "Fix retention first"
                  ? "border-amber-200/80 text-amber-900"
                  : "border-sky-200/80 text-sky-900"
              }`}>
                {path().badge}
              </span>
            </div>
            <div class="mt-3 grid gap-3 lg:grid-cols-3">
              <For each={path().cards}>
                {(card) => (
                  <div class={`rounded-2xl border px-3 py-3 shadow-sm ${
                    card.tone === "emerald"
                      ? "border-emerald-200/80 bg-white/90"
                      : card.tone === "violet"
                        ? "border-violet-200/80 bg-white/90"
                        : card.tone === "amber"
                          ? "border-amber-200/80 bg-white/90"
                          : "border-sky-200/80 bg-white/90"
                  }`}>
                    <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      card.tone === "emerald"
                        ? "text-emerald-800/80"
                        : card.tone === "violet"
                          ? "text-violet-800/80"
                          : card.tone === "amber"
                            ? "text-amber-800/80"
                            : "text-sky-800/80"
                    }`}>
                      {card.label}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-on-surface">
                      {card.detail}
                    </p>
                  </div>
                )}
              </For>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  saveStudySearchContinuationSeed(rendererState().studySearchContinuationSeed);
                  navigateToView("search");
                }}
                class="rounded-full border border-white/90 bg-white/95 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white"
              >
                {path().primaryActionLabel}
              </button>
              <Show when={path().secondaryActionLabel && rendererState().fileLibraryIntent}>
                <button
                  type="button"
                  onClick={() => {
                    const fileIntent = rendererState().fileLibraryIntent;
                    if (!fileIntent) return;
                    saveFileLibraryNavigationIntent(fileIntent);
                    navigateToView("files");
                  }}
                  class="rounded-full border border-white/90 bg-white/80 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white"
                >
                  {path().secondaryActionLabel}
                </button>
              </Show>
            </div>
          </div>
        )}
      </Show>

      <Show when={rendererState().studyContinuation}>
        {(continuation) => (
          <div class="rounded-2xl border border-teal-200/70 bg-teal-50/75 px-4 py-3">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-3xl">
                <p class="text-sm font-semibold text-teal-950">Continue from this result</p>
                <p class="mt-1 text-xs leading-5 text-teal-900/90">
                  {continuation().headline}
                </p>
                <p class="mt-1 text-xs leading-5 text-teal-900/75">
                  {continuation().detail}
                </p>
              </div>
              <Show when={rendererState().uploadedSourceCount > 0}>
                <span class="rounded-full border border-teal-200/80 bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-teal-900">
                  First run follow-through
                </span>
              </Show>
            </div>
            <div class="mt-3 grid gap-3 lg:grid-cols-3">
              <For each={continuation().actions}>
                {(action) => (
                  <button
                    type="button"
                    onClick={() => runStudyResultAction(action.id)}
                    class={`rounded-2xl border px-3 py-3 text-left shadow-sm transition ${
                      action.tone === "amber"
                        ? "border-amber-200/80 bg-amber-50/85 hover:bg-amber-100/85"
                        : action.tone === "emerald"
                          ? "border-emerald-200/80 bg-emerald-50/85 hover:bg-emerald-100/85"
                          : action.tone === "violet"
                            ? "border-violet-200/80 bg-violet-50/85 hover:bg-violet-100/85"
                            : "border-sky-200/80 bg-sky-50/85 hover:bg-sky-100/85"
                    }`}
                  >
                    <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      action.tone === "amber"
                        ? "text-amber-800/80"
                        : action.tone === "emerald"
                          ? "text-emerald-800/80"
                          : action.tone === "violet"
                            ? "text-violet-800/80"
                            : "text-sky-800/80"
                    }`}>
                      {action.label}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-on-surface">
                      {action.description}
                    </p>
                  </button>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>
      <Show when={rendererState().studyMomentum}>
        {(momentum) => (
          <div class={`rounded-2xl border px-4 py-3 ${
            momentum().tone === "emerald"
              ? "border-emerald-200/80 bg-emerald-50/75"
              : momentum().tone === "sky"
                ? "border-sky-200/80 bg-sky-50/75"
                : "border-amber-200/80 bg-amber-50/80"
          }`}>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-3xl">
                <p class={`text-sm font-semibold ${
                  momentum().tone === "emerald"
                    ? "text-emerald-950"
                    : momentum().tone === "sky"
                      ? "text-sky-950"
                      : "text-amber-950"
                }`}>
                  What this result created
                </p>
                <p class={`mt-1 text-xs leading-5 ${
                  momentum().tone === "emerald"
                    ? "text-emerald-900/90"
                    : momentum().tone === "sky"
                      ? "text-sky-900/90"
                      : "text-amber-900/90"
                }`}>
                  {momentum().headline}
                </p>
                <p class={`mt-1 text-xs leading-5 ${
                  momentum().tone === "emerald"
                    ? "text-emerald-900/75"
                    : momentum().tone === "sky"
                      ? "text-sky-900/75"
                      : "text-amber-900/80"
                }`}>
                  {momentum().detail}
                </p>
              </div>
              <span class={`rounded-full border bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${
                momentum().tone === "emerald"
                  ? "border-emerald-200/80 text-emerald-900"
                  : momentum().tone === "sky"
                    ? "border-sky-200/80 text-sky-900"
                    : "border-amber-200/80 text-amber-900"
              }`}>
                {momentum().grade === "reusable"
                  ? "Reusable memory"
                  : momentum().grade === "developing"
                    ? "Developing memory"
                    : "One-off answer"}
              </span>
            </div>
            <div class="mt-3 grid gap-3 lg:grid-cols-2">
              <button
                type="button"
                onClick={() => runStudyResultAction(momentum().primaryActionId)}
                class="rounded-2xl border border-white/85 bg-white/90 px-3 py-3 text-left shadow-sm transition hover:bg-white"
              >
                <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface/75">
                  {momentum().primaryActionLabel}
                </p>
              </button>
              <Show when={momentum().secondaryActionLabel}>
                <button
                  type="button"
                  onClick={() => runStudyResultAction(momentum().secondaryActionId)}
                  class="rounded-2xl border border-white/85 bg-white/80 px-3 py-3 text-left shadow-sm transition hover:bg-white"
                >
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant/80">
                    {momentum().secondaryActionLabel}
                  </p>
                </button>
              </Show>
            </div>
          </div>
        )}
      </Show>

      <Show when={rendererState().showLocalRouterPreview}>
        <div class={`rounded-2xl border px-3 py-3 ${rendererState().localRouterToneClass}`}>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-medium">
                {rendererState().localRouterPreview?.title ?? "Local retrieval preview"}
              </p>
              <Show when={rendererState().localRouterPreview?.confidence_label}>
                <p class="mt-1 text-[11px] opacity-80">
                  {rendererState().localRouterPreview?.confidence_label}
                </p>
              </Show>
            </div>
            <Show when={rendererState().localRouterPreview?.confidence_band}>
              <span class="rounded-full border border-current/20 bg-white/60 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em]">
                {rendererState().localRouterPreview?.confidence_band}
              </span>
            </Show>
          </div>
          <Show when={rendererState().localRouterPreview?.detail}>
            <p class="mt-2 text-xs leading-5 opacity-85">
              {rendererState().localRouterPreview?.detail}
            </p>
          </Show>
          <Show when={rendererState().showCapabilityBadges}>
            <div class="mt-2 flex flex-wrap gap-2">
              <For each={rendererState().localRouterCapabilityBadges}>
                {(badge) => (
                  <span class="rounded-full border border-current/15 bg-white/65 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] opacity-80">
                    {badge}
                  </span>
                )}
              </For>
            </div>
          </Show>
          <Show when={rendererState().showExecutionBadges}>
            <div class="mt-2 flex flex-wrap gap-2">
              <For each={rendererState().localRouterExecutionBadges}>
                {(badge) => (
                  <span class="rounded-full border border-violet-300/55 bg-violet-50/75 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] opacity-80">
                    {badge}
                  </span>
                )}
              </For>
            </div>
          </Show>
          <Show when={rendererState().showSkipBadges}>
            <div class="mt-2 flex flex-wrap gap-2">
              <For each={rendererState().localRouterSkipBadges}>
                {(badge) => (
                  <span class="rounded-full border border-slate-300/55 bg-slate-50/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] opacity-80">
                    {badge}
                  </span>
                )}
              </For>
            </div>
          </Show>
          <Show when={rendererState().showDensityBadges}>
            <div class="mt-2 flex flex-wrap gap-2">
              <For each={rendererState().localRouterDensityBadges}>
                {(badge) => (
                  <span class="rounded-full border border-current/15 bg-white/65 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] opacity-80">
                    {badge}
                  </span>
                )}
              </For>
            </div>
          </Show>
          <Show when={rendererState().showBudgetBadges}>
            <div class="mt-2 flex flex-wrap gap-2">
              <For each={rendererState().localRouterBudgetBadges}>
                {(badge) => (
                  <span class="rounded-full border border-current/15 bg-white/65 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] opacity-80">
                    {badge}
                  </span>
                )}
              </For>
            </div>
          </Show>
          <Show when={rendererState().showLocalRouterStats}>
            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              <For each={rendererState().localRouterStats}>
                {(stat) => (
                  <div class="rounded-xl border border-white/35 bg-white/45 px-3 py-2">
                    <p class="text-[10px] uppercase tracking-[0.16em] opacity-60">
                      {stat.label ?? "Signal"}
                    </p>
                    <p class="mt-1 text-sm font-medium">{stat.value ?? ""}</p>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={rendererState().showBullets}>
        <ul class="space-y-1.5">
          <For each={rendererState().fallbackBullets}>
            {(bullet) => (
              <li class="flex items-start gap-2 text-sm leading-6 text-on-surface">
                <span class="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                <div class="md-prose" innerHTML={renderMarkdown(bullet)} />
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Show when={rendererState().showSources}>
        <div class="border-t border-white/15 pt-3">
          <p class="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-outline">Sources</p>
          <div class="flex flex-wrap gap-2">
            <For each={rendererState().sources}>
              {(source) => (
                <Show when={source.url}>
                  <a
                    href={safeHref(source.url)}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={source.url}
                    class="group relative flex max-w-full items-center gap-1.5 rounded-full border border-white/30 bg-white/25 px-3 py-1 text-xs text-on-surface transition hover:bg-white/45 hover:text-primary"
                  >
                    <span class="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/60" />
                    <span class="min-w-0 break-all">{shortUrl(source.url!)}</span>
                    <span class="pointer-events-none absolute bottom-full left-0 z-10 mb-1 hidden max-w-xs break-all rounded-lg border border-white/30 bg-surface/95 px-3 py-2 text-[10px] text-on-surface shadow-lg group-hover:block">
                      <Show when={source.title}>
                        <span class="mb-0.5 block font-medium">{source.title}</span>
                      </Show>
                      <span class="text-on-surface-variant">{source.url}</span>
                    </span>
                  </a>
                </Show>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
