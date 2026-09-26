// @locs-version: 1.0
import { createEffect, createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { WeddingNavigationArrivalBanner } from "@/components/WeddingNavigationArrivalBanner";
import { fetchFileLibrary, safeHref, type FileLibraryItem } from "@/lib/api";
import {
  fileLibraryAcademicCourseTag,
  fileLibraryAcademicChapterTag,
  fileLibraryAcademicKind,
  fileLibraryAcademicLectureTag,
  fileLibraryAcademicUnitTag,
  fileLibraryKnowledgeGraphGroupKey,
  fileLibraryKnowledgeGraphLinkTags,
  fileLibraryRetentionMode,
  fileLibraryStudyReadiness,
  fileLibraryAcademicWeekTag,
  fileLibraryCardState,
  fileLibraryAvailabilityState,
  fileLibraryNotesTarget,
  fileLibrarySourceTarget,
  fileLibraryZettelkastenEntryType,
  fileLibraryZettelkastenNextAction,
  fileLibraryZettelkastenStage,
} from "@/lib/fileLibraryState";
import { consumeFileLibraryNavigationIntent, type FileLibraryNavigationIntent } from "@/lib/fileLibraryNavigationState";
import {
  buildKnowledgeGraphIntentFromFileLibraryFocus,
  deriveKnowledgeGraphNavigationIntentFromFile,
  saveKnowledgeGraphNavigationIntent,
} from "@/lib/knowledgeGraphNavigationState";
import { summarizeFileStudyPack } from "@/lib/studyPackFocusState";
import { buildFileStudyPackActionState } from "@/lib/studyPackActionState";
import { buildFileStudyFocusSignals } from "@/lib/studyFocusSignalState";
import { buildStudyPromptPathState, type StudyPromptPath } from "@/lib/studyPromptPathState";
import { buildFileLibraryNextActionState } from "@/lib/fileLibraryNextActionState";
import { buildFileLibraryValuePathState } from "@/lib/fileLibraryValuePathState";
import { buildFileLibraryItemValueStoryState } from "@/lib/fileLibraryItemValueStoryState";
import { buildFileLibraryStudentFocusState } from "@/lib/fileLibraryStudentFocusState";
import { buildFileLibraryQuickFilterState, type FileLibraryQuickFilterActionId } from "@/lib/fileLibraryQuickFilterState";
import { buildFileExplorerFocusState } from "@/lib/fileExplorerFocusState";
import { buildStudyZeroStateStarterState } from "@/lib/studyZeroStateStarterState";
import {
  DEFAULT_STUDENT_ONBOARDING_QUICK_START,
  studentQuickStartForIntent,
  type OnboardingQuickStartSeed,
} from "@/lib/onboardingQuickStart";
import {
  buildReportIntentFromFocus,
  saveReportNavigationIntent,
} from "@/lib/reportNavigationState";
import {
  buildFilesAdjacentSourceSeed,
  buildFilesStudyContinuationSeed,
} from "@/lib/studyWorkspaceContinuationSeed";
import { buildFilesWorkspaceArrivalState } from "@/lib/studyWorkspaceArrivalState";
import { consumeWeddingNavigationIntent } from "@/lib/weddingNavigationLocalState";
import {
  buildWeddingNavigationArrivalBannerState,
  weddingArrivalActionDestinationView,
  type WeddingArrivalAction,
} from "@/lib/weddingNavigationArrivalViewState";
import type { ViewName } from "@/lib/viewNames";

type FileCategory = "all" | "study" | "audio" | "image" | "data" | "other";
type SourceKindFilter = "all" | "parsed_document" | "transcript" | "attachment" | "unclassified";
type AvailabilityFilter = "all" | "downloadable" | "extracted_only" | "session_only" | "unavailable";
type KnowledgeFilter = "all" | "connected_notes" | "zettelkasten" | "standard" | "unclassified";
type RetentionFilter = "all" | "keep_file" | "keep_extracted_only" | "keep_nothing" | "unknown";
type AcademicKindFilter = "all" | "lecture_slides" | "lecture_notes" | "reading" | "assignment" | "study_notes" | "transcript" | "unclassified";
type ZettelkastenStageFilter = "all" | "source_note" | "literature_note" | "permanent_note" | "review_pending" | "unclassified";
type StudyReadinessFilter = "all" | "ready_now" | "developing" | "archival";
type FileSort = "recent" | "oldest" | "largest" | "smallest" | "name";
type FacetCountMap = Record<string, number>;

function asAcademicKindFilter(value: string | null | undefined): AcademicKindFilter | null {
  if (
    value === "lecture_slides"
    || value === "lecture_notes"
    || value === "reading"
    || value === "assignment"
    || value === "study_notes"
    || value === "transcript"
    || value === "unclassified"
  ) {
    return value;
  }
  return null;
}

function asZettelkastenStageFilter(value: string | null | undefined): ZettelkastenStageFilter | null {
  if (
    value === "source_note"
    || value === "literature_note"
    || value === "permanent_note"
    || value === "review_pending"
    || value === "unclassified"
  ) {
    return value;
  }
  return null;
}

function formatBytes(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = sizeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";
  return parsed.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function displaySourceType(item: FileLibraryItem): string {
  return item.source_kind?.trim() || item.source_type.trim() || "attachment";
}

function sourceMetadataString(item: FileLibraryItem, key: string): string | null {
  const value = item.source_metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function knowledgeModeValue(item: FileLibraryItem): KnowledgeFilter {
  const value = sourceMetadataString(item, "knowledge_mode");
  if (value === "connected_notes" || value === "zettelkasten" || value === "standard") return value;
  return "unclassified";
}

function knowledgeModeLabel(item: FileLibraryItem): string | null {
  const value = knowledgeModeValue(item);
  if (!value) return null;
  if (value === "connected_notes") return "Connected notes";
  if (value === "zettelkasten") return "Zettelkasten";
  if (value === "standard") return "Standard";
  if (value === "unclassified") return null;
  return value.replace(/_/g, " ");
}

function availabilityBadgeClass(item: FileLibraryItem): string {
  const tone = fileLibraryAvailabilityState(item).tone;
  if (tone === "sky") return "bg-sky-100 text-sky-800";
  if (tone === "emerald") return "bg-emerald-100 text-emerald-800";
  if (tone === "amber") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function sourceKindLabel(kind: string): string {
  if (kind === "parsed_document") return "Parsed docs";
  if (kind === "transcript") return "Transcripts";
  if (kind === "attachment") return "Attachments";
  if (kind === "unclassified") return "Unclassified";
  return kind.replace(/_/g, " ");
}

function availabilityLabel(value: AvailabilityFilter): string {
  if (value === "downloadable") return "Downloadable";
  if (value === "extracted_only") return "Extracted notes";
  if (value === "session_only") return "Session only";
  if (value === "unavailable") return "Unavailable";
  return "All availability";
}

function academicKindLabel(value: string): string {
  if (value === "lecture_slides") return "Lecture slides";
  if (value === "lecture_notes") return "Lecture notes";
  if (value === "study_notes") return "Study notes";
  if (value === "review_pending") return "Review pending";
  if (value === "permanent_note") return "Permanent note";
  if (value === "source_note") return "Source note";
  if (value === "literature_note") return "Literature note";
  if (value === "unclassified") return "Unclassified";
  return value.replace(/_/g, " ");
}

function formatKnowledgeFilterLabel(value: KnowledgeFilter): string {
  if (value === "connected_notes") return "Connected notes";
  if (value === "zettelkasten") return "Zettelkasten";
  if (value === "standard") return "Standard";
  if (value === "unclassified") return "Unclassified";
  return "All knowledge modes";
}

function compactKnowledgeFilterLabel(value: KnowledgeFilter): string {
  if (value === "connected_notes") return "Connected notes";
  if (value === "zettelkasten") return "Zettelkasten";
  if (value === "standard") return "Standard";
  if (value === "unclassified") return "Unclassified";
  return "All";
}

function formatRetentionFilterLabel(value: RetentionFilter): string {
  if (value === "keep_file") return "Keep file";
  if (value === "keep_extracted_only") return "Keep extracted only";
  if (value === "keep_nothing") return "Session only";
  if (value === "unknown") return "Unknown retention";
  return "All retention";
}

function formatStudyReadinessFilterLabel(value: StudyReadinessFilter): string {
  if (value === "ready_now") return "Study ready";
  if (value === "developing") return "Linking up";
  if (value === "archival") return "Archive";
  return "All readiness";
}

function studyReadinessBadgeClass(value: StudyReadinessFilter): string {
  if (value === "ready_now") return "bg-teal-100 text-teal-800";
  if (value === "developing") return "bg-cyan-100 text-cyan-800";
  return "bg-slate-100 text-slate-700";
}

function knowledgeModeForGraphFocus(
  value: KnowledgeFilter,
): "all" | "connected_notes" | "zettelkasten" | "standard" {
  if (value === "connected_notes" || value === "zettelkasten" || value === "standard") return value;
  return "all";
}

function knowledgeModeForReportFocus(
  value: KnowledgeFilter,
): "connected_notes" | "zettelkasten" | "standard" | null {
  return value === "connected_notes" || value === "zettelkasten" || value === "standard" ? value : null;
}

export default function FilesView(props: {
  onNavigate?: (view: ViewName) => void;
  onOpenStudyQuickStart?: (seed: OnboardingQuickStartSeed) => void;
  onOpenThread?: (threadId: string, messageId?: string | null) => void;
}) {
  const baseLimit = 250;
  const [query, setQuery] = createSignal("");
  const [tagQuery, setTagQuery] = createSignal("");
  const [debouncedQuery, setDebouncedQuery] = createSignal("");
  const [activeTag, setActiveTag] = createSignal<string | null>(null);
  const [activeCategory, setActiveCategory] = createSignal<FileCategory>("all");
  const [activeSourceKind, setActiveSourceKind] = createSignal<SourceKindFilter>("all");
  const [activeAvailability, setActiveAvailability] = createSignal<AvailabilityFilter>("all");
  const [activeKnowledge, setActiveKnowledge] = createSignal<KnowledgeFilter>("all");
  const [activeRetention, setActiveRetention] = createSignal<RetentionFilter>("all");
  const [activeAcademicKind, setActiveAcademicKind] = createSignal<AcademicKindFilter>("all");
  const [activeCourseTag, setActiveCourseTag] = createSignal<string | null>(null);
  const [activeUnitTag, setActiveUnitTag] = createSignal<string | null>(null);
  const [activeChapterTag, setActiveChapterTag] = createSignal<string | null>(null);
  const [activeWeekTag, setActiveWeekTag] = createSignal<string | null>(null);
  const [activeLectureTag, setActiveLectureTag] = createSignal<string | null>(null);
  const [activeZettelkastenStage, setActiveZettelkastenStage] = createSignal<ZettelkastenStageFilter>("all");
  const [activeStudyReadiness, setActiveStudyReadiness] = createSignal<StudyReadinessFilter>("all");
  const [activeSort, setActiveSort] = createSignal<FileSort>("recent");
  const [pageLimit, setPageLimit] = createSignal(baseLimit);
  const [navigationIntent, setNavigationIntent] = createSignal<FileLibraryNavigationIntent | null>(null);
  const [weddingNavigationIntent, setWeddingNavigationIntent] = createSignal<ReturnType<typeof consumeWeddingNavigationIntent>>(null);
  const [navigationNotice, setNavigationNotice] = createSignal<string | null>(null);
  const [files, { refetch: refetchFiles }] = createResource(
    () => ({
      query: debouncedQuery(),
      tag: activeTag(),
      category: activeCategory(),
      sourceKind: activeSourceKind(),
      availability: activeAvailability(),
      knowledge: activeKnowledge(),
      retention: activeRetention(),
      academicKind: activeAcademicKind(),
      courseTag: activeCourseTag(),
      unitTag: activeUnitTag(),
      chapterTag: activeChapterTag(),
      weekTag: activeWeekTag(),
      lectureTag: activeLectureTag(),
      zettelkastenStage: activeZettelkastenStage(),
      sort: activeSort(),
      limit: pageLimit(),
    }),
    (filters) => fetchFileLibrary({
      query: filters.query || undefined,
      tag: filters.tag || undefined,
      category: filters.category === "all" ? undefined : filters.category,
      sourceKind: filters.sourceKind === "all" ? undefined : filters.sourceKind,
      availability: filters.availability === "all" ? undefined : filters.availability,
      knowledgeMode: filters.knowledge === "all" ? undefined : filters.knowledge,
      retentionMode: filters.retention === "all" ? undefined : filters.retention,
      academicKind: filters.academicKind === "all" ? undefined : filters.academicKind,
      courseTag: filters.courseTag || undefined,
      unitTag: filters.unitTag || undefined,
      chapterTag: filters.chapterTag || undefined,
      weekTag: filters.weekTag || undefined,
      lectureTag: filters.lectureTag || undefined,
      zettelkastenStage: filters.zettelkastenStage === "all" ? undefined : filters.zettelkastenStage,
      sort: filters.sort,
      limit: filters.limit,
    }),
  );

  createEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(query().trim());
    }, 180);
    onCleanup(() => window.clearTimeout(handle));
  });

  createEffect(() => {
    debouncedQuery();
    activeTag();
    activeCategory();
    activeSourceKind();
    activeAvailability();
    activeKnowledge();
    activeRetention();
    activeAcademicKind();
    activeCourseTag();
    activeUnitTag();
    activeChapterTag();
    activeWeekTag();
    activeLectureTag();
    activeZettelkastenStage();
    activeStudyReadiness();
    activeSort();
    setPageLimit(baseLimit);
  });

  onMount(() => {
    const weddingIntent = consumeWeddingNavigationIntent();
    if (weddingIntent?.view === "files") setWeddingNavigationIntent(weddingIntent);
    const intent = consumeFileLibraryNavigationIntent();
    if (!intent) return;
    setNavigationIntent(intent);
    if (intent.query) {
      setQuery(intent.query);
      setDebouncedQuery(intent.query);
    }
    if (intent.tag?.trim()) setActiveTag(intent.tag.trim());
    if (intent.knowledgeMode) setActiveKnowledge(intent.knowledgeMode);
    if (intent.retentionMode) setActiveRetention(intent.retentionMode);
    if (intent.studyReadiness === "ready_now" || intent.studyReadiness === "developing" || intent.studyReadiness === "archival") {
      setActiveStudyReadiness(intent.studyReadiness);
    }
    if (intent.sourceKind && intent.sourceKind !== "all") setActiveSourceKind(intent.sourceKind);
    const academicKind = asAcademicKindFilter(intent.academicKind?.trim());
    if (academicKind) setActiveAcademicKind(academicKind);
    if (intent.courseTag?.trim()) setActiveCourseTag(intent.courseTag.trim());
    if (intent.unitTag?.trim()) setActiveUnitTag(intent.unitTag.trim());
    if (intent.chapterTag?.trim()) setActiveChapterTag(intent.chapterTag.trim());
    if (intent.weekTag?.trim()) setActiveWeekTag(intent.weekTag.trim());
    if (intent.lectureTag?.trim()) setActiveLectureTag(intent.lectureTag.trim());
    const zettelkastenStage = asZettelkastenStageFilter(intent.zettelkastenStage?.trim());
    if (zettelkastenStage) setActiveZettelkastenStage(zettelkastenStage);
    if (intent.notice?.trim()) setNavigationNotice(intent.notice.trim());
  });
  const arrivalState = createMemo(() => buildFilesWorkspaceArrivalState(navigationIntent()));
  const weddingArrivalBanner = createMemo(() =>
    buildWeddingNavigationArrivalBannerState(weddingNavigationIntent()),
  );

  const filteredItems = createMemo(() => files.latest?.items ?? []);
  const fileSummary = createMemo(() => files.latest?.summary);
  const libraryFacets = createMemo(() => files.latest?.facets);
  const libraryPage = createMemo(() => files.latest?.page);
  const topTags = createMemo(() => libraryFacets()?.top_tags ?? []);
  const facetCount = (map: FacetCountMap | undefined, key: string) => map?.[key] ?? 0;
  const availabilityCounts = createMemo(() => ({
    all: fileSummary()?.matching_count ?? filteredItems().length,
    downloadable: facetCount(libraryFacets()?.availability_counts, "downloadable"),
    extracted_only: facetCount(libraryFacets()?.availability_counts, "extracted_only"),
    session_only: facetCount(libraryFacets()?.availability_counts, "session_only"),
    unavailable: facetCount(libraryFacets()?.availability_counts, "unavailable"),
  }));
  const visibleItems = createMemo(() =>
    filteredItems().filter((item) =>
      activeStudyReadiness() === "all" || fileLibraryStudyReadiness(item) === activeStudyReadiness(),
    )
  );
  const visibleTopTags = createMemo(() => {
    const queryValue = tagQuery().trim().toLowerCase();
    if (!queryValue) return topTags();
    return topTags().filter((facet) => facet.tag.toLowerCase().includes(queryValue));
  });
  const visibleTagCount = createMemo(() => {
    const tags = new Set<string>();
    for (const item of visibleItems()) {
      for (const tag of item.source_supertags) tags.add(tag);
    }
    return tags.size;
  });
  const extractedOnlyVisibleCount = createMemo(() =>
    visibleItems().filter((item) => fileLibraryRetentionMode(item) === "keep_extracted_only").length,
  );
  const keptFileVisibleCount = createMemo(() =>
    visibleItems().filter((item) => fileLibraryRetentionMode(item) === "keep_file").length,
  );
  const connectedNotesVisibleCount = createMemo(() =>
    visibleItems().filter((item) => knowledgeModeValue(item) === "connected_notes").length,
  );
  const zettelkastenVisibleCount = createMemo(() =>
    visibleItems().filter((item) => knowledgeModeValue(item) === "zettelkasten").length,
  );
  const reviewPendingVisibleCount = createMemo(() =>
    visibleItems().filter((item) => fileLibraryZettelkastenStage(item) === "review_pending").length,
  );
  const categoryCounts = createMemo(() => {
    const counts: Record<FileCategory, number> = {
      all: fileSummary()?.matching_count ?? filteredItems().length,
      study: facetCount(libraryFacets()?.category_counts, "study"),
      audio: facetCount(libraryFacets()?.category_counts, "audio"),
      image: facetCount(libraryFacets()?.category_counts, "image"),
      data: facetCount(libraryFacets()?.category_counts, "data"),
      other: facetCount(libraryFacets()?.category_counts, "other"),
    };
    return counts;
  });
  const sourceKindCounts = createMemo(() => {
    const counts: Record<SourceKindFilter, number> = {
      all: fileSummary()?.matching_count ?? filteredItems().length,
      parsed_document: facetCount(libraryFacets()?.source_kind_counts, "parsed_document"),
      transcript: facetCount(libraryFacets()?.source_kind_counts, "transcript"),
      attachment: facetCount(libraryFacets()?.source_kind_counts, "attachment"),
      unclassified: facetCount(libraryFacets()?.source_kind_counts, "unclassified"),
    };
    return counts;
  });
  const knowledgeCounts = createMemo(() => {
    const counts: Record<KnowledgeFilter, number> = {
      all: fileSummary()?.matching_count ?? filteredItems().length,
      connected_notes: facetCount(libraryFacets()?.knowledge_counts, "connected_notes"),
      zettelkasten: facetCount(libraryFacets()?.knowledge_counts, "zettelkasten"),
      standard: facetCount(libraryFacets()?.knowledge_counts, "standard"),
      unclassified: facetCount(libraryFacets()?.knowledge_counts, "unclassified"),
    };
    return counts;
  });
  const retentionCounts = createMemo(() => {
    const counts: Record<RetentionFilter, number> = {
      all: fileSummary()?.matching_count ?? filteredItems().length,
      keep_file: facetCount(libraryFacets()?.retention_counts, "keep_file"),
      keep_extracted_only: facetCount(libraryFacets()?.retention_counts, "keep_extracted_only"),
      keep_nothing: facetCount(libraryFacets()?.retention_counts, "keep_nothing"),
      unknown: facetCount(libraryFacets()?.retention_counts, "unknown"),
    };
    return counts;
  });
  const academicKindCounts = createMemo(() => {
    const counts: Record<AcademicKindFilter, number> = {
      all: fileSummary()?.matching_count ?? filteredItems().length,
      lecture_slides: facetCount(libraryFacets()?.academic_kind_counts, "lecture_slides"),
      lecture_notes: facetCount(libraryFacets()?.academic_kind_counts, "lecture_notes"),
      reading: facetCount(libraryFacets()?.academic_kind_counts, "reading"),
      assignment: facetCount(libraryFacets()?.academic_kind_counts, "assignment"),
      study_notes: facetCount(libraryFacets()?.academic_kind_counts, "study_notes"),
      transcript: facetCount(libraryFacets()?.academic_kind_counts, "transcript"),
      unclassified: facetCount(libraryFacets()?.academic_kind_counts, "unclassified"),
    };
    return counts;
  });
  const courseTags = createMemo(() =>
    Object.entries(libraryFacets()?.course_tag_counts ?? {})
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 12),
  );
  const unitTags = createMemo(() =>
    Object.entries(libraryFacets()?.unit_tag_counts ?? {})
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 12),
  );
  const chapterTags = createMemo(() =>
    Object.entries(libraryFacets()?.chapter_tag_counts ?? {})
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 12),
  );
  const weekTags = createMemo(() =>
    Object.entries(libraryFacets()?.week_tag_counts ?? {})
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 12),
  );
  const lectureTags = createMemo(() =>
    Object.entries(libraryFacets()?.lecture_tag_counts ?? {})
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 12),
  );
  const zettelkastenStageCounts = createMemo(() => ({
    all: fileSummary()?.matching_count ?? filteredItems().length,
    source_note: facetCount(libraryFacets()?.zettelkasten_stage_counts, "source_note"),
    literature_note: facetCount(libraryFacets()?.zettelkasten_stage_counts, "literature_note"),
    permanent_note: facetCount(libraryFacets()?.zettelkasten_stage_counts, "permanent_note"),
    review_pending: facetCount(libraryFacets()?.zettelkasten_stage_counts, "review_pending"),
    unclassified: facetCount(libraryFacets()?.zettelkasten_stage_counts, "unclassified"),
  }));
  const studyReadinessCounts = createMemo(() => ({
    all: filteredItems().length,
    ready_now: filteredItems().filter((item) => fileLibraryStudyReadiness(item) === "ready_now").length,
    developing: filteredItems().filter((item) => fileLibraryStudyReadiness(item) === "developing").length,
    archival: filteredItems().filter((item) => fileLibraryStudyReadiness(item) === "archival").length,
  }));
  const primaryThreadTarget = (item: FileLibraryItem) => fileLibraryNotesTarget(item) ?? fileLibrarySourceTarget(item);
  const secondaryThreadTarget = (item: FileLibraryItem) => {
    const cardState = fileLibraryCardState(item);
    if (cardState.secondaryThreadLabel === "Open notes") return fileLibraryNotesTarget(item);
    if (cardState.secondaryThreadLabel === "Open source" || cardState.secondaryThreadLabel === "Open thread") {
      return fileLibrarySourceTarget(item);
    }
    return null;
  };
  const hasActiveFilters = createMemo(() =>
    Boolean(
      query().trim()
      || activeTag()
      || activeCategory() !== "all"
      || activeSourceKind() !== "all"
      || activeAvailability() !== "all"
      || activeKnowledge() !== "all"
      || activeRetention() !== "all"
      || activeAcademicKind() !== "all"
      || activeCourseTag()
      || activeUnitTag()
      || activeChapterTag()
      || activeWeekTag()
      || activeLectureTag()
      || activeZettelkastenStage() !== "all"
      || activeStudyReadiness() !== "all",
    )
  );
  const isLibraryCompletelyEmpty = createMemo(() =>
    !hasActiveFilters()
    && (fileSummary()?.matching_count ?? 0) === 0
    && visibleItems().length === 0,
  );
  const resetAllFilters = () => {
    setQuery("");
    setTagQuery("");
    setActiveTag(null);
    setActiveCategory("all");
    setActiveSourceKind("all");
    setActiveAvailability("all");
    setActiveKnowledge("all");
    setActiveRetention("all");
    setActiveAcademicKind("all");
    setActiveCourseTag(null);
    setActiveUnitTag(null);
    setActiveChapterTag(null);
    setActiveWeekTag(null);
    setActiveLectureTag(null);
    setActiveZettelkastenStage("all");
    setActiveStudyReadiness("all");
    setActiveSort("recent");
    setPageLimit(baseLimit);
  };
  const studyFocusSummary = createMemo(() => {
    const parts: string[] = [];
    if (activeAcademicKind() !== "all") parts.push(academicKindLabel(activeAcademicKind()));
    if (activeCourseTag()) parts.push(activeCourseTag()!);
    if (activeUnitTag()) parts.push(activeUnitTag()!);
    if (activeChapterTag()) parts.push(activeChapterTag()!);
    if (activeWeekTag()) parts.push(activeWeekTag()!);
    if (activeLectureTag()) parts.push(activeLectureTag()!);
    if (activeZettelkastenStage() !== "all") parts.push(academicKindLabel(activeZettelkastenStage()));
    if (activeStudyReadiness() !== "all") parts.push(formatStudyReadinessFilterLabel(activeStudyReadiness()));
    if (activeKnowledge() !== "all") parts.push(formatKnowledgeFilterLabel(activeKnowledge()));
    if (activeRetention() !== "all") parts.push(formatRetentionFilterLabel(activeRetention()));
    if (activeTag()) parts.push(`#${activeTag()}`);
    if (query().trim()) parts.push(`query "${query().trim()}"`);
    return parts;
  });
  const firstVisibleStudyItem = createMemo(() =>
    visibleItems().find((item) =>
      item.source_kind === "parsed_document"
      || item.source_kind === "transcript"
      || Boolean(fileLibraryAcademicKind(item))
      || Boolean(fileLibraryAcademicCourseTag(item))
      || Boolean(fileLibraryAcademicWeekTag(item))
      || Boolean(fileLibraryAcademicLectureTag(item))
      || Boolean(fileLibraryAcademicChapterTag(item))
      || Boolean(fileLibraryAcademicUnitTag(item))
      || Boolean(fileLibraryKnowledgeGraphGroupKey(item))
      || fileLibraryKnowledgeGraphLinkTags(item).length > 0
      || Boolean(fileLibraryZettelkastenStage(item)),
    ) ?? null,
  );
  const openKnowledgeGraphForCurrentFocus = () => {
    const firstStudyItem = firstVisibleStudyItem();
    const intent = buildKnowledgeGraphIntentFromFileLibraryFocus({
      searchQuery: query().trim(),
      activeTag: activeTag(),
      knowledgeMode: knowledgeModeForGraphFocus(activeKnowledge()),
      academicKind: activeAcademicKind() === "all" ? null : activeAcademicKind(),
      courseTag: activeCourseTag(),
      unitTag: activeUnitTag() || (firstStudyItem ? fileLibraryAcademicUnitTag(firstStudyItem) : null),
      chapterTag: activeChapterTag() || (firstStudyItem ? fileLibraryAcademicChapterTag(firstStudyItem) : null),
      weekTag: activeWeekTag(),
      lectureTag: activeLectureTag() || (firstStudyItem ? fileLibraryAcademicLectureTag(firstStudyItem) : null),
      zettelkastenStage: activeZettelkastenStage() === "all" ? null : activeZettelkastenStage(),
      fallbackItem: firstStudyItem ?? null,
    });
    if (intent) saveKnowledgeGraphNavigationIntent(intent);
    props.onNavigate?.("knowledge_graph");
  };
  const openStudyWorkspaceForCurrentFocus = () => {
    const firstStudyItem = firstVisibleStudyItem();
    props.onOpenStudyQuickStart?.(buildFilesStudyContinuationSeed({
      searchQuery: query().trim(),
      activeTag: activeTag(),
      knowledgeMode: knowledgeModeForGraphFocus(activeKnowledge()),
      academicKind: activeAcademicKind() === "all" ? null : activeAcademicKind(),
      courseTag: activeCourseTag(),
      unitTag: activeUnitTag() || (firstStudyItem ? fileLibraryAcademicUnitTag(firstStudyItem) : null),
      chapterTag: activeChapterTag() || (firstStudyItem ? fileLibraryAcademicChapterTag(firstStudyItem) : null),
      weekTag: activeWeekTag(),
      lectureTag: activeLectureTag(),
      zettelkastenStage: activeZettelkastenStage() === "all" ? null : activeZettelkastenStage(),
      zettelkastenNextAction: firstStudyItem ? fileLibraryZettelkastenNextAction(firstStudyItem) : null,
      knowledgeGraphGroupKey: firstStudyItem ? fileLibraryKnowledgeGraphGroupKey(firstStudyItem) : null,
      knowledgeGraphLinkTags: firstStudyItem ? fileLibraryKnowledgeGraphLinkTags(firstStudyItem) : [],
    }));
  };
  const openAdjacentSourcePlannerForCurrentFocus = () => {
    const firstStudyItem = firstVisibleStudyItem();
    props.onOpenStudyQuickStart?.(buildFilesAdjacentSourceSeed({
      searchQuery: query().trim(),
      activeTag: activeTag(),
      knowledgeMode: knowledgeModeForGraphFocus(activeKnowledge()),
      academicKind: activeAcademicKind() === "all" ? null : activeAcademicKind(),
      courseTag: activeCourseTag(),
      unitTag: activeUnitTag() || (firstStudyItem ? fileLibraryAcademicUnitTag(firstStudyItem) : null),
      chapterTag: activeChapterTag() || (firstStudyItem ? fileLibraryAcademicChapterTag(firstStudyItem) : null),
      weekTag: activeWeekTag(),
      lectureTag: activeLectureTag(),
      zettelkastenStage: activeZettelkastenStage() === "all" ? null : activeZettelkastenStage(),
      zettelkastenNextAction: firstStudyItem ? fileLibraryZettelkastenNextAction(firstStudyItem) : null,
      knowledgeGraphGroupKey: firstStudyItem ? fileLibraryKnowledgeGraphGroupKey(firstStudyItem) : null,
      knowledgeGraphLinkTags: firstStudyItem ? fileLibraryKnowledgeGraphLinkTags(firstStudyItem) : [],
    }));
  };
  const currentStudyContinuationSeed = createMemo(() => {
    const firstStudyItem = firstVisibleStudyItem();
    return buildFilesStudyContinuationSeed({
      searchQuery: query().trim(),
      activeTag: activeTag(),
      knowledgeMode: knowledgeModeForGraphFocus(activeKnowledge()),
      academicKind: activeAcademicKind() === "all" ? null : activeAcademicKind(),
      courseTag: activeCourseTag(),
      unitTag: activeUnitTag() || (firstStudyItem ? fileLibraryAcademicUnitTag(firstStudyItem) : null),
      chapterTag: activeChapterTag() || (firstStudyItem ? fileLibraryAcademicChapterTag(firstStudyItem) : null),
      weekTag: activeWeekTag(),
      lectureTag: activeLectureTag(),
      zettelkastenStage: activeZettelkastenStage() === "all" ? null : activeZettelkastenStage(),
      zettelkastenNextAction: firstStudyItem ? fileLibraryZettelkastenNextAction(firstStudyItem) : null,
      knowledgeGraphGroupKey: firstStudyItem ? fileLibraryKnowledgeGraphGroupKey(firstStudyItem) : null,
      knowledgeGraphLinkTags: firstStudyItem ? fileLibraryKnowledgeGraphLinkTags(firstStudyItem) : [],
    });
  });
  const currentStudyPromptPaths = createMemo(() =>
    buildStudyPromptPathState({
      quickStartSeed: currentStudyContinuationSeed(),
      knowledgeMode: currentStudyContinuationSeed().knowledgeMode,
      supportedCount: Math.max(visibleItems().length, 1),
    }),
  );
  const recommendedStudyPromptPath = createMemo(() =>
    currentStudyPromptPaths().options.find((option) => option.recommended) ?? currentStudyPromptPaths().options[0] ?? null,
  );
  const alternateStudyPromptPath = createMemo(() => {
    const recommended = recommendedStudyPromptPath();
    return currentStudyPromptPaths().options.find((option) => option.id !== recommended?.id) ?? null;
  });
  const openStudyPromptPath = (option: StudyPromptPath | null) => {
    if (!option) return;
    props.onOpenStudyQuickStart?.({
      ...currentStudyContinuationSeed(),
      query: option.prompt,
      label: option.label,
      description: option.detail,
      notice: `${option.label} prompt loaded from your current Files focus.`,
      helper: "Review the retained study pack, then run this question directly or add one more related source first.",
    });
  };
  const focusedStudyPack = createMemo(() => summarizeFileStudyPack(visibleItems()));
  const focusedStudyPackAction = createMemo(() => buildFileStudyPackActionState(visibleItems()));
  const focusedStudySignals = createMemo(() => buildFileStudyFocusSignals(visibleItems()));
  const explorerFocus = createMemo(() =>
    buildFileExplorerFocusState({
      matchingCount: fileSummary()?.matching_count ?? filteredItems().length,
      visibleCount: visibleItems().length,
      readyCount: studyReadinessCounts().ready_now,
      linkedCount: libraryFacets()?.linked_count ?? 0,
      visibleTagCount: visibleTagCount(),
      query: query().trim(),
      activeTag: activeTag(),
      courseTag: activeCourseTag(),
      unitTag: activeUnitTag(),
      chapterTag: activeChapterTag(),
      weekTag: activeWeekTag(),
      lectureTag: activeLectureTag(),
      knowledgeMode: activeKnowledge(),
      studyReadiness: activeStudyReadiness(),
      topTags: topTags(),
    }),
  );
  const fileLibraryNextAction = createMemo(() =>
    buildFileLibraryNextActionState({
      visibleCount: visibleItems().length,
      studyCount: categoryCounts().study,
      readyCount: studyReadinessCounts().ready_now,
      developingCount: studyReadinessCounts().developing,
      archivalCount: studyReadinessCounts().archival,
      knowledgeMode: activeKnowledge(),
      hasActiveFilters: hasActiveFilters(),
      showingReadyOnly: activeStudyReadiness() === "ready_now",
    }),
  );
  const fileLibraryValuePath = createMemo(() =>
    buildFileLibraryValuePathState({
      visibleCount: visibleItems().length,
      studyCount: categoryCounts().study,
      readyCount: studyReadinessCounts().ready_now,
      developingCount: studyReadinessCounts().developing,
      archivalCount: studyReadinessCounts().archival,
      linkedCount: libraryFacets()?.linked_count ?? 0,
      visibleTagCount: visibleTagCount(),
      knowledgeMode: activeKnowledge(),
      hasActiveFilters: hasActiveFilters(),
      showingReadyOnly: activeStudyReadiness() === "ready_now",
    }),
  );
  const fileLibraryStudentFocus = createMemo(() =>
    buildFileLibraryStudentFocusState({
      visibleCount: visibleItems().length,
      matchingCount: fileSummary()?.matching_count ?? visibleItems().length,
      readyCount: studyReadinessCounts().ready_now,
      developingCount: studyReadinessCounts().developing,
      archivalCount: studyReadinessCounts().archival,
      extractedOnlyCount: extractedOnlyVisibleCount(),
      keptFileCount: keptFileVisibleCount(),
      connectedNotesCount: connectedNotesVisibleCount(),
      zettelkastenCount: zettelkastenVisibleCount(),
      reviewQueueCount: reviewPendingVisibleCount(),
      linkedCount: libraryFacets()?.linked_count ?? 0,
      visibleTagCount: visibleTagCount(),
      hasActiveFilters: hasActiveFilters(),
      activeKnowledgeMode: activeKnowledge(),
      activeStudyReadiness: activeStudyReadiness(),
      activeRetention: activeRetention(),
      activeZettelkastenStage: activeZettelkastenStage(),
    }),
  );
  const fileLibraryQuickFilters = createMemo(() =>
    buildFileLibraryQuickFilterState({
      matchingCount: fileSummary()?.matching_count ?? visibleItems().length,
      readyCount: studyReadinessCounts().ready_now,
      connectedNotesCount: connectedNotesVisibleCount(),
      zettelkastenCount: zettelkastenVisibleCount(),
      assignmentCount: academicKindCounts().assignment,
      lectureCount:
        academicKindCounts().lecture_slides
        + academicKindCounts().lecture_notes
        + academicKindCounts().transcript,
      reviewQueueCount: reviewPendingVisibleCount(),
      topWeekTag: weekTags()[0]?.[0] ?? null,
      activeWeekTag: activeWeekTag(),
      hasActiveFilters: hasActiveFilters(),
    }),
  );
  const studyZeroState = createMemo(() => buildStudyZeroStateStarterState({ surface: "files" }));

  function runQuickFilterAction(actionId: FileLibraryQuickFilterActionId) {
    if (actionId === "focus_this_week_ready") {
      if (!activeWeekTag() && weekTags()[0]?.[0]) setActiveWeekTag(weekTags()[0][0]);
      setActiveStudyReadiness("ready_now");
      setActiveCategory("study");
      return;
    }
    if (actionId === "show_connected_notes_ready") {
      setActiveKnowledge("connected_notes");
      if (studyReadinessCounts().ready_now > 0) setActiveStudyReadiness("ready_now");
      setActiveCategory("study");
      return;
    }
    if (actionId === "show_zettelkasten_sources") {
      setActiveKnowledge("zettelkasten");
      setActiveCategory("study");
      if (zettelkastenStageCounts().source_note > 0) {
        setActiveZettelkastenStage("source_note");
      }
      return;
    }
    if (actionId === "show_assignments") {
      setActiveAcademicKind("assignment");
      setActiveCategory("study");
      return;
    }
    if (actionId === "show_review_queue") {
      setActiveKnowledge("zettelkasten");
      setActiveZettelkastenStage("review_pending");
      setActiveCategory("study");
      return;
    }
    if (actionId === "show_lecture_material") {
      setActiveCategory("study");
      if (academicKindCounts().lecture_slides > 0) {
        setActiveAcademicKind("lecture_slides");
        return;
      }
      if (academicKindCounts().lecture_notes > 0) {
        setActiveAcademicKind("lecture_notes");
        return;
      }
      if (academicKindCounts().transcript > 0) {
        setActiveAcademicKind("transcript");
      }
      return;
    }
    resetAllFilters();
  }

  function zeroStateActionClass(tone: "violet" | "sky" | "emerald" | "amber"): string {
    if (tone === "sky") return "border-sky-200/80 bg-sky-50/90 text-sky-950 hover:bg-sky-100";
    if (tone === "emerald") return "border-emerald-200/80 bg-emerald-50/90 text-emerald-950 hover:bg-emerald-100";
    if (tone === "amber") return "border-amber-200/80 bg-amber-50/90 text-amber-950 hover:bg-amber-100";
    return "border-violet-200/80 bg-violet-50/90 text-violet-950 hover:bg-violet-100";
  }

  function runWeddingArrivalAction(action: WeddingArrivalAction) {
    const destination = weddingArrivalActionDestinationView(action);
    if (destination) props.onNavigate?.(destination);
  }

  return (
    <div class="flex h-full min-w-0 flex-col gap-5">
      <WeddingNavigationArrivalBanner
        state={weddingArrivalBanner()}
        onAction={runWeddingArrivalAction}
        onDismiss={() => setWeddingNavigationIntent(null)}
      />
      <section class="min-w-0 rounded-[24px] border border-white/55 bg-white/70 p-3 shadow-card backdrop-blur-xl sm:rounded-[28px] sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0 max-w-3xl">
            <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-on-surface-variant/70">Workspace Files</p>
            <h1 class="mt-1 break-words text-xl font-semibold tracking-tight text-on-surface sm:text-2xl">Browse retained files and extracted study materials</h1>
            <p class="mt-2 max-w-2xl break-words text-sm leading-6 text-on-surface-variant">
              This surface shows files already attached to your account, with the same supertags that power knowledge linking, PARA resource classification, and connected-note retrieval.
            </p>
          </div>
          <div class="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto lg:min-w-[280px] lg:gap-3">
            <div class="rounded-2xl border border-sky-200/70 bg-sky-50/80 px-4 py-3 text-left shadow-sm sm:text-right">
              <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-sky-700/80">Visible</p>
              <p class="mt-1 text-2xl font-semibold text-sky-900">{visibleItems().length}</p>
              <p class="text-xs text-sky-800/80">files</p>
            </div>
            <div class="rounded-2xl border border-emerald-200/70 bg-emerald-50/80 px-4 py-3 text-left shadow-sm sm:text-right">
              <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-700/80">Linked</p>
              <p class="mt-1 text-2xl font-semibold text-emerald-900">{libraryFacets()?.linked_count ?? 0}</p>
              <p class="text-xs text-emerald-800/80">tagged</p>
            </div>
            <div class="rounded-2xl border border-violet-200/70 bg-violet-50/80 px-4 py-3 text-left shadow-sm sm:text-right">
              <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-violet-700/80">Study</p>
              <p class="mt-1 text-2xl font-semibold text-violet-900">{categoryCounts().study}</p>
              <p class="text-xs text-violet-800/80">docs</p>
            </div>
          </div>
        </div>

        <div class="mt-5 flex flex-col gap-3">
          <Show when={navigationNotice()}>
            <div class="rounded-2xl border border-emerald-200/70 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950 shadow-sm">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0 max-w-3xl">
                  <p class="text-sm font-semibold text-emerald-950">
                    {arrivalState()?.headline ?? navigationNotice()}
                  </p>
                  <p class="mt-1 break-words text-xs leading-5 text-emerald-900/85">
                    {arrivalState()?.detail ?? navigationNotice()}
                  </p>
                </div>
                <div class="grid w-full gap-2 sm:flex sm:w-auto sm:items-center">
                  <Show when={arrivalState()?.badge}>
                    <span class="rounded-full border border-emerald-200/80 bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-900">
                      {arrivalState()!.badge}
                    </span>
                  </Show>
                  <button
                    type="button"
                    onClick={() => { setNavigationNotice(null); setNavigationIntent(null); }}
                    class="rounded-full border border-emerald-200/80 bg-white/90 px-3 py-2 text-xs font-medium text-emerald-900 transition hover:bg-white sm:py-1"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <Show when={arrivalState()}>
                {(arrival) => (
                  <>
                    <div class="mt-3 grid gap-2 lg:grid-cols-3">
                      <For each={arrival().cards}>
                        {(card) => (
                          <div class={`rounded-2xl border px-3 py-3 shadow-sm ${
                            card.tone === "amber"
                              ? "border-amber-200/80 bg-amber-50/85"
                              : card.tone === "emerald"
                                ? "border-emerald-200/80 bg-white/90"
                                : card.tone === "violet"
                                  ? "border-violet-200/80 bg-violet-50/85"
                                  : "border-sky-200/80 bg-sky-50/85"
                          }`}>
                            <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-800/80">
                              {card.label}
                            </p>
                            <p class="mt-1 text-xs leading-5 text-on-surface">
                              {card.detail}
                            </p>
                          </div>
                        )}
                      </For>
                    </div>
                    <p class="mt-3 text-xs leading-5 text-emerald-900/80">{arrival().nextStep}</p>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <Show when={recommendedStudyPromptPath()}>
                        {(option) => (
                          <button
                            type="button"
                            onClick={() => openStudyPromptPath(option())}
                            class="rounded-full border border-emerald-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-emerald-950 transition hover:bg-white"
                          >
                            Run {option().label.toLowerCase()}
                          </button>
                        )}
                      </Show>
                      <button
                        type="button"
                        onClick={openKnowledgeGraphForCurrentFocus}
                        class="rounded-full border border-sky-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-sky-950 transition hover:bg-white"
                      >
                        Open matching graph view
                      </button>
                      <button
                        type="button"
                        onClick={openAdjacentSourcePlannerForCurrentFocus}
                        class="rounded-full border border-violet-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-violet-950 transition hover:bg-white"
                      >
                        Plan next source
                      </button>
                    </div>
                  </>
                )}
              </Show>
            </div>
          </Show>
          <Show when={focusedStudyPack()}>
            {(pack) => (
              <div class="rounded-2xl border border-sky-200/70 bg-sky-50/85 px-4 py-3 text-sm text-sky-950 shadow-sm">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="max-w-3xl">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800/75">
                      Latest study pack
                    </p>
                    <p class="mt-1 font-medium">{pack().headline}</p>
                    <p class="mt-1 text-xs leading-5 text-sky-900/80">{pack().detail}</p>
                    <Show when={pack().contextLabel}>
                      {(context) => (
                        <p class="mt-1 text-xs leading-5 text-sky-900/70">
                          Context: {context()}
                        </p>
                      )}
                    </Show>
                  </div>
                  <div class="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-[260px]">
                    <For each={pack().stats}>
                      {(stat) => (
                        <div class="rounded-2xl border border-white/70 bg-white/90 px-3 py-2 text-left shadow-sm sm:text-right">
                          <p class="text-[10px] uppercase tracking-[0.14em] text-sky-700/75">{stat.label}</p>
                          <p class="mt-1 text-base font-semibold text-sky-950">{stat.value}</p>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
            <p class="mt-3 text-xs leading-5 text-sky-900/80">{pack().nextStep}</p>
            <Show when={focusedStudySignals()}>
              {(signals) => (
                <div class="mt-3 grid gap-2 lg:grid-cols-3">
                  <div class="rounded-2xl border border-sky-200/80 bg-white/90 px-3 py-3 shadow-sm">
                    <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700/80">
                      {signals().focus.label}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-sky-950">{signals().focus.value}</p>
                  </div>
                  <div class="rounded-2xl border border-amber-200/80 bg-white/90 px-3 py-3 shadow-sm">
                    <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700/80">
                      {signals().weakSpot.label}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-amber-950">{signals().weakSpot.value}</p>
                  </div>
                  <div class="rounded-2xl border border-emerald-200/80 bg-white/90 px-3 py-3 shadow-sm">
                    <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700/80">
                      {signals().nextStep.label}
                    </p>
                    <p class="mt-1 text-xs leading-5 text-emerald-950">{signals().nextStep.value}</p>
                  </div>
                </div>
              )}
            </Show>
            <Show when={focusedStudyPackAction()}>
              {(action) => (
                <div class="mt-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/80">
                    {action().headline}
                  </p>
                  <p class="mt-1 text-[11px] leading-5 text-emerald-900/80">
                    {action().detail}
                  </p>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <Show when={recommendedStudyPromptPath()}>
                      {(option) => (
                        <button
                          type="button"
                          onClick={() => openStudyPromptPath(option())}
                          class="rounded-full border border-emerald-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-emerald-950 transition hover:bg-white"
                        >
                          Run {option().label.toLowerCase()}
                        </button>
                      )}
                    </Show>
                    <Show when={alternateStudyPromptPath()}>
                      {(option) => (
                        <button
                          type="button"
                          onClick={() => openStudyPromptPath(option())}
                          class="rounded-full border border-sky-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-sky-950 transition hover:bg-white"
                        >
                          Or {option().label.toLowerCase()}
                        </button>
                      )}
                    </Show>
                  </div>
                </div>
              )}
            </Show>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openStudyWorkspaceForCurrentFocus}
                class="rounded-full border border-emerald-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-emerald-950 transition hover:bg-white"
              >
                {focusedStudyPackAction()?.primaryActionLabel ?? "Ask from this study focus"}
              </button>
              <Show when={activeStudyReadiness() !== "ready_now" && studyReadinessCounts().ready_now > 0}>
                    <button
                      type="button"
                      onClick={() => setActiveStudyReadiness("ready_now")}
                      class="rounded-full border border-sky-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-sky-950 transition hover:bg-white"
                    >
                      {focusedStudyPackAction()?.secondaryActionLabel === "Show study-ready first"
                        ? focusedStudyPackAction()!.secondaryActionLabel
                        : "Show study-ready first"}
                    </button>
                  </Show>
                  <button
                    type="button"
                    onClick={openKnowledgeGraphForCurrentFocus}
                    class="rounded-full border border-violet-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-violet-950 transition hover:bg-white"
                  >
                    {focusedStudyPackAction()?.secondaryActionLabel === "Open matching graph view"
                      ? focusedStudyPackAction()!.secondaryActionLabel
                      : "Open matching graph view"}
                  </button>
                </div>
              </div>
            )}
          </Show>
          <div class="flex flex-wrap items-center gap-3">
            <label class="w-full flex-1 sm:min-w-[280px]">
              <span class="sr-only">Search files</span>
              <input
                value={query()}
                onInput={(event) => setQuery(event.currentTarget.value)}
                type="search"
                placeholder="Search by file name, tag, type, summary, or checksum"
                class="w-full rounded-2xl border border-white/60 bg-white/90 px-4 py-3 text-sm text-on-surface shadow-sm outline-none transition placeholder:text-on-surface-variant/50 focus:border-sky-300 focus:ring-2 focus:ring-sky-200/60"
              />
            </label>
            <button
              type="button"
              onClick={resetAllFilters}
              class="w-full rounded-2xl border border-white/60 bg-white/85 px-4 py-3 text-sm font-medium text-on-surface shadow-sm transition hover:bg-white sm:w-auto"
            >
              Clear filters
            </button>
            <button
              type="button"
              onClick={() => {
                void refetchFiles();
              }}
              class="rounded-2xl border border-sky-200/70 bg-sky-50/80 px-4 py-3 text-sm font-medium text-sky-900 shadow-sm transition hover:bg-sky-100/90"
            >
              Refresh library
            </button>
            <button
              type="button"
              onClick={() => props.onNavigate?.("para")}
              class="rounded-2xl border border-emerald-200/70 bg-emerald-50/80 px-4 py-3 text-sm font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-100/90"
            >
              Open PARA resources
            </button>
            <button
              type="button"
              onClick={() => props.onNavigate?.("search")}
              class="rounded-2xl border border-violet-200/70 bg-violet-50/80 px-4 py-3 text-sm font-medium text-violet-900 shadow-sm transition hover:bg-violet-100/90"
            >
              Ask over files
            </button>
            <button
              type="button"
              onClick={() => {
                const firstStudyItem = firstVisibleStudyItem();
                saveReportNavigationIntent(buildReportIntentFromFocus({
                  source: "files",
                  searchQuery: query().trim(),
                  activeTag: activeTag(),
                  knowledgeMode: knowledgeModeForReportFocus(activeKnowledge()),
                  academicKind: activeAcademicKind() === "all" ? null : activeAcademicKind(),
                  courseTag: activeCourseTag(),
                  weekTag: activeWeekTag(),
                  lectureTag: activeLectureTag() || (firstStudyItem ? fileLibraryAcademicLectureTag(firstStudyItem) : null),
                  chapterTag: activeChapterTag() || (firstStudyItem ? fileLibraryAcademicChapterTag(firstStudyItem) : null),
                  unitTag: activeUnitTag() || (firstStudyItem ? fileLibraryAcademicUnitTag(firstStudyItem) : null),
                  zettelkastenStage: activeZettelkastenStage() === "all" ? null : activeZettelkastenStage(),
                  zettelkastenNextAction: firstStudyItem ? fileLibraryZettelkastenNextAction(firstStudyItem) : null,
                  knowledgeGraphGroupKey: firstStudyItem ? fileLibraryKnowledgeGraphGroupKey(firstStudyItem) : null,
                  knowledgeGraphLinkTags: firstStudyItem ? fileLibraryKnowledgeGraphLinkTags(firstStudyItem) : [],
                }));
                props.onNavigate?.("reports");
              }}
              class="rounded-2xl border border-cyan-200/70 bg-cyan-50/80 px-4 py-3 text-sm font-medium text-cyan-900 shadow-sm transition hover:bg-cyan-100/90"
            >
              Generate report
            </button>
            <label class="flex items-center gap-2 rounded-2xl border border-white/60 bg-white/88 px-3 py-3 text-sm text-on-surface shadow-sm">
              <span class="whitespace-nowrap text-on-surface-variant">Sort</span>
              <select
                value={activeSort()}
                onChange={(event) => setActiveSort(event.currentTarget.value as FileSort)}
                class="bg-transparent font-medium text-on-surface outline-none"
              >
                <option value="recent">Most recent</option>
                <option value="oldest">Oldest</option>
                <option value="largest">Largest</option>
                <option value="smallest">Smallest</option>
                <option value="name">Name A-Z</option>
              </select>
            </label>
          </div>

          <div class="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-950 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-3xl">
                <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700/75">
                  Search this library fast
                </p>
                <p class="mt-1 font-medium">
                  Use keyword search for titles, summaries, extracted notes, types, chapters, units, and stored metadata.
                </p>
                <p class="mt-1 text-xs leading-5 text-slate-700/85">
                  Then narrow with supertags, course, week, lecture, knowledge mode, and Zettelkasten stage so the first useful study source appears quickly instead of forcing folder hunting.
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveStudyReadiness("ready_now")}
                  class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    activeStudyReadiness() === "ready_now"
                      ? "border-teal-300 bg-teal-100 text-teal-900"
                      : "border-white/80 bg-white/90 text-slate-900 hover:bg-white"
                  }`}
                >
                  Study ready
                </button>
                <button
                  type="button"
                  onClick={() => setActiveKnowledge("connected_notes")}
                  class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    activeKnowledge() === "connected_notes"
                      ? "border-sky-300 bg-sky-100 text-sky-900"
                      : "border-white/80 bg-white/90 text-slate-900 hover:bg-white"
                  }`}
                >
                  Connected notes
                </button>
                <button
                  type="button"
                  onClick={() => setActiveKnowledge("zettelkasten")}
                  class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    activeKnowledge() === "zettelkasten"
                      ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                      : "border-white/80 bg-white/90 text-slate-900 hover:bg-white"
                  }`}
                >
                  Zettelkasten
                </button>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  class="rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-900 transition hover:bg-white"
                >
                  Reset view
                </button>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <label class="w-full flex-1 sm:min-w-[240px]">
              <span class="sr-only">Search visible tags</span>
              <input
                value={tagQuery()}
                onInput={(event) => setTagQuery(event.currentTarget.value)}
                type="search"
                placeholder="Filter visible supertags"
                class="w-full rounded-2xl border border-white/60 bg-white/90 px-4 py-2.5 text-sm text-on-surface shadow-sm outline-none transition placeholder:text-on-surface-variant/50 focus:border-sky-300 focus:ring-2 focus:ring-sky-200/60"
              />
            </label>
            <Show when={activeTag() || activeCategory() !== "all" || activeSourceKind() !== "all" || activeAvailability() !== "all" || activeKnowledge() !== "all" || activeRetention() !== "all" || activeAcademicKind() !== "all" || activeCourseTag() || activeWeekTag() || activeLectureTag() || activeZettelkastenStage() !== "all" || activeStudyReadiness() !== "all" || query().trim()}>
              <div class="flex flex-wrap gap-2">
                <Show when={query().trim()}>
                  <span class="rounded-full border border-slate-200/80 bg-slate-100 px-3 py-1 text-xs text-slate-700">Query: {query().trim()}</span>
                </Show>
                <Show when={activeTag()}>
                  <span class="rounded-full border border-sky-200/80 bg-sky-100 px-3 py-1 text-xs text-sky-800">Tag: {activeTag()}</span>
                </Show>
                <Show when={activeCategory() !== "all"}>
                  <span class="rounded-full border border-violet-200/80 bg-violet-100 px-3 py-1 text-xs text-violet-800">Category: {activeCategory()}</span>
                </Show>
                <Show when={activeSourceKind() !== "all"}>
                  <span class="rounded-full border border-sky-200/80 bg-sky-100 px-3 py-1 text-xs text-sky-800">Source: {sourceKindLabel(activeSourceKind())}</span>
                </Show>
                <Show when={activeAvailability() !== "all"}>
                  <span class="rounded-full border border-cyan-200/80 bg-cyan-100 px-3 py-1 text-xs text-cyan-800">Availability: {availabilityLabel(activeAvailability())}</span>
                </Show>
                <Show when={activeKnowledge() !== "all"}>
                  <span class="rounded-full border border-emerald-200/80 bg-emerald-100 px-3 py-1 text-xs text-emerald-800">Knowledge: {compactKnowledgeFilterLabel(activeKnowledge())}</span>
                </Show>
                <Show when={activeRetention() !== "all"}>
                  <span class="rounded-full border border-amber-200/80 bg-amber-100 px-3 py-1 text-xs text-amber-800">Retention: {formatRetentionFilterLabel(activeRetention())}</span>
                </Show>
                <Show when={activeAcademicKind() !== "all"}>
                  <span class="rounded-full border border-fuchsia-200/80 bg-fuchsia-100 px-3 py-1 text-xs text-fuchsia-800">Study type: {academicKindLabel(activeAcademicKind())}</span>
                </Show>
                <Show when={activeCourseTag()}>
                  <span class="rounded-full border border-violet-200/80 bg-violet-100 px-3 py-1 text-xs text-violet-800">Course: {activeCourseTag()}</span>
                </Show>
                <Show when={activeWeekTag()}>
                  <span class="rounded-full border border-indigo-200/80 bg-indigo-100 px-3 py-1 text-xs text-indigo-800">Week: {activeWeekTag()}</span>
                </Show>
                <Show when={activeLectureTag()}>
                  <span class="rounded-full border border-sky-200/80 bg-sky-100 px-3 py-1 text-xs text-sky-800">Lecture: {activeLectureTag()}</span>
                </Show>
                <Show when={activeZettelkastenStage() !== "all"}>
                  <span class="rounded-full border border-emerald-200/80 bg-emerald-100 px-3 py-1 text-xs text-emerald-800">ZK stage: {academicKindLabel(activeZettelkastenStage())}</span>
                </Show>
                <Show when={activeStudyReadiness() !== "all"}>
                  <span class="rounded-full border border-teal-200/80 bg-teal-100 px-3 py-1 text-xs text-teal-800">Readiness: {formatStudyReadinessFilterLabel(activeStudyReadiness())}</span>
                </Show>
              </div>
            </Show>
          </div>
          <Show when={explorerFocus()}>
            {(focus) => (
              <div class="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-950 shadow-sm">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="max-w-3xl">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700/75">
                      Find retained material fast
                    </p>
                    <p class="mt-1 font-medium">{focus().headline}</p>
                    <p class="mt-1 text-xs leading-5 text-slate-700/85">{focus().detail}</p>
                    <p class="mt-2 text-xs leading-5 text-slate-700/75">{focus().nextRefinement}</p>
                  </div>
                  <span class="rounded-full border border-slate-200/80 bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-700">
                    {focus().badge}
                  </span>
                </div>
                <Show when={focus().appliedFocus.length > 0}>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <For each={focus().appliedFocus}>
                      {(entry) => (
                        <span class="rounded-full border border-slate-200/80 bg-white/90 px-3 py-1 text-xs text-slate-700">
                          {entry}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={focus().suggestedTags.length > 0}>
                  <div class="mt-3">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700/75">
                      Suggested supertags
                    </p>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <For each={focus().suggestedTags}>
                        {(facet) => (
                          <button
                            type="button"
                            onClick={() => setActiveTag(facet.tag)}
                            class="rounded-full border border-slate-200/80 bg-white/90 px-3 py-1 text-xs text-slate-800 transition hover:bg-white"
                          >
                            {facet.tag} ({facet.count})
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
                <Show when={focus().searchExamples.length > 0}>
                  <div class="mt-3">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700/75">
                      Keyword examples
                    </p>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <For each={focus().searchExamples}>
                        {(example) => (
                          <button
                            type="button"
                            onClick={() => setQuery(example)}
                            class="rounded-full border border-slate-200/80 bg-white/90 px-3 py-1 text-xs text-slate-800 transition hover:bg-white"
                          >
                            {example}
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            )}
          </Show>
          <Show when={fileLibraryQuickFilters()}>
            {(state) => (
              <div class="rounded-2xl border border-indigo-200/80 bg-indigo-50/80 px-4 py-3 text-sm text-indigo-950 shadow-sm">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="max-w-3xl">
                    <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-800/75">
                      Jump to the right study slice
                    </p>
                    <p class="mt-1 font-medium">{state().headline}</p>
                    <p class="mt-1 text-xs leading-5 text-indigo-900/80">{state().detail}</p>
                  </div>
                  <span class="rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-indigo-900">
                    {state().badge}
                  </span>
                </div>
                <div class="mt-3 grid gap-3 lg:grid-cols-4">
                  <For each={state().shortcuts}>
                    {(shortcut) => (
                      <button
                        type="button"
                        onClick={() => runQuickFilterAction(shortcut.id)}
                        class={`rounded-2xl border px-3 py-3 text-left shadow-sm transition ${
                          shortcut.tone === "emerald"
                            ? "border-emerald-200/80 bg-white/90 hover:bg-emerald-50/70"
                            : shortcut.tone === "violet"
                              ? "border-violet-200/80 bg-white/90 hover:bg-violet-50/70"
                              : shortcut.tone === "amber"
                                ? "border-amber-200/80 bg-white/90 hover:bg-amber-50/70"
                                : "border-sky-200/80 bg-white/90 hover:bg-sky-50/70"
                        }`}
                      >
                        <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                          shortcut.tone === "emerald"
                            ? "text-emerald-800/80"
                            : shortcut.tone === "violet"
                              ? "text-violet-800/80"
                              : shortcut.tone === "amber"
                                ? "text-amber-800/80"
                                : "text-sky-800/80"
                        }`}>
                          {shortcut.label}
                        </p>
                        <p class="mt-1 text-sm font-semibold text-on-surface">{shortcut.countLabel}</p>
                        <p class="mt-1 text-xs leading-5 text-on-surface/80">{shortcut.detail}</p>
                      </button>
                    )}
                  </For>
                </div>
              </div>
            )}
          </Show>
          <Show when={categoryCounts().study > 0 || activeAcademicKind() !== "all" || activeCourseTag() || activeWeekTag() || activeLectureTag() || activeZettelkastenStage() !== "all" || activeKnowledge() !== "all"}>
            <div class="rounded-2xl border border-violet-200/70 bg-violet-50/85 px-4 py-3 text-sm text-violet-950 shadow-sm">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="max-w-3xl">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-800/75">
                    Study focus
                  </p>
                  <p class="mt-1">
                    {categoryCounts().study} study file{categoryCounts().study === 1 ? "" : "s"} are visible in the current library view.
                    <Show when={studyFocusSummary().length > 0}>
                      <span> Focused by {studyFocusSummary().join(" Â· ")}.</span>
                    </Show>
                  </p>
                  <p class="mt-1 text-xs leading-5 text-violet-900/80">
                    Files and extracted notes stay grounded with the same supertags and academic metadata used by connected notes, study retrieval, and Zettelkasten review.
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openKnowledgeGraphForCurrentFocus}
                    class="rounded-full border border-violet-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-violet-950 transition hover:bg-white"
                  >
                    Open matching graph view
                  </button>
                  <Show when={hasActiveFilters()}>
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      class="rounded-full border border-violet-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-violet-950 transition hover:bg-white"
                    >
                      Reset study focus
                    </button>
                  </Show>
                </div>
              </div>
            </div>
          </Show>

          <Show when={filteredItems().length > 0}>
            <Show when={fileLibraryStudentFocus()}>
              {(state) => (
                <div class="rounded-2xl border border-sky-200/70 bg-sky-50/85 px-4 py-3 text-sm text-sky-950 shadow-sm">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="max-w-3xl">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800/75">
                        Find my study material fast
                      </p>
                      <p class="mt-1 font-medium">{state().headline}</p>
                      <p class="mt-1 text-xs leading-5 text-sky-900/80">{state().detail}</p>
                    </div>
                    <span class="rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-sky-900">
                      {state().badge}
                    </span>
                  </div>
                  <div class="mt-3 grid gap-3 lg:grid-cols-3">
                    <For each={state().cards}>
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
                          <p class="mt-1 text-sm font-semibold text-on-surface">{card.value}</p>
                          <p class="mt-1 text-xs leading-5 text-on-surface/80">{card.detail}</p>
                        </div>
                      )}
                    </For>
                  </div>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (state().primaryActionId === "show_ready_only") {
                          setActiveStudyReadiness("ready_now");
                          return;
                        }
                        if (state().primaryActionId === "show_extracted_only") {
                          setActiveRetention("keep_extracted_only");
                          return;
                        }
                        if (state().primaryActionId === "show_connected_notes") {
                          setActiveKnowledge("connected_notes");
                          return;
                        }
                        if (state().primaryActionId === "show_review_queue") {
                          setActiveKnowledge("zettelkasten");
                          setActiveZettelkastenStage("review_pending");
                          return;
                        }
                        resetAllFilters();
                      }}
                      class="rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-white"
                    >
                      {state().primaryActionLabel}
                    </button>
                    <Show when={state().secondaryActionId}>
                      <button
                        type="button"
                        onClick={() => {
                          if (state().secondaryActionId === "show_ready_only") {
                            setActiveStudyReadiness("ready_now");
                            return;
                          }
                          if (state().secondaryActionId === "show_extracted_only") {
                            setActiveRetention("keep_extracted_only");
                            return;
                          }
                          if (state().secondaryActionId === "show_connected_notes") {
                            setActiveKnowledge("connected_notes");
                            return;
                          }
                          if (state().secondaryActionId === "show_review_queue") {
                            setActiveKnowledge("zettelkasten");
                            setActiveZettelkastenStage("review_pending");
                            return;
                          }
                          resetAllFilters();
                        }}
                        class="rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-white"
                      >
                        {state().secondaryActionLabel}
                      </button>
                    </Show>
                  </div>
                </div>
              )}
            </Show>
            <div class="rounded-2xl border border-teal-200/70 bg-teal-50/85 px-4 py-3 text-sm text-teal-950 shadow-sm">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="max-w-3xl">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-800/75">
                    Study readiness
                  </p>
                  <p class="mt-1">
                    {studyReadinessCounts().ready_now} source{studyReadinessCounts().ready_now === 1 ? "" : "s"} are ready for immediate retrieval,
                    {" "}{studyReadinessCounts().developing} are still linking up,
                    and {studyReadinessCounts().archival} behave more like archive storage.
                  </p>
                  <p class="mt-1 text-xs leading-5 text-teal-900/80">
                    Readiness is inferred from retained content, academic metadata, knowledge mode, and supertags so stressed students can start with the most usable material first.
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  {(["all", "ready_now", "developing", "archival"] as const).map((value) => (
                    <button
                      type="button"
                      onClick={() => setActiveStudyReadiness(value)}
                      class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        activeStudyReadiness() === value
                          ? "border-teal-300 bg-teal-100 text-teal-900"
                          : "border-white/60 bg-white/90 text-teal-950 hover:bg-white"
                      }`}
                    >
                      {formatStudyReadinessFilterLabel(value)}{" "}
                      <span class="text-[10px] opacity-70">{studyReadinessCounts()[value]}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Show>
          <Show when={fileLibraryNextAction()}>
            {(state) => (
              <div class={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
                state().tone === "emerald"
                  ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-950"
                  : state().tone === "sky"
                    ? "border-sky-200/80 bg-sky-50/80 text-sky-950"
                    : "border-amber-200/80 bg-amber-50/80 text-amber-950"
              }`}>
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="max-w-3xl">
                    <p class={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                      state().tone === "emerald"
                        ? "text-emerald-800/80"
                        : state().tone === "sky"
                          ? "text-sky-800/80"
                          : "text-amber-800/80"
                    }`}>
                      Best next library action
                    </p>
                    <p class="mt-1 font-medium">{state().headline}</p>
                    <p class="mt-1 text-xs leading-5 opacity-85">{state().detail}</p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (state().primaryActionId === "open_matching_graph") {
                          openKnowledgeGraphForCurrentFocus();
                          return;
                        }
                        if (state().primaryActionId === "show_ready_first") {
                          setActiveStudyReadiness("ready_now");
                          return;
                        }
                        if (state().primaryActionId === "clear_filters") {
                          resetAllFilters();
                          return;
                        }
                        openStudyWorkspaceForCurrentFocus();
                      }}
                      class="rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-white"
                    >
                      {state().primaryActionLabel}
                    </button>
                    <Show when={state().secondaryActionId}>
                      <button
                        type="button"
                        onClick={() => {
                          if (state().secondaryActionId === "open_matching_graph") {
                            openKnowledgeGraphForCurrentFocus();
                            return;
                          }
                          if (state().secondaryActionId === "show_ready_first") {
                            setActiveStudyReadiness("ready_now");
                            return;
                          }
                          if (state().secondaryActionId === "clear_filters") {
                            resetAllFilters();
                            return;
                          }
                          openStudyWorkspaceForCurrentFocus();
                        }}
                        class="rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-white"
                      >
                        {state().secondaryActionLabel}
                      </button>
                    </Show>
                  </div>
                </div>
              </div>
            )}
          </Show>
          <Show when={fileLibraryValuePath()}>
            {(state) => (
              <div class={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
                state().grade === "warmup"
                  ? "border-amber-200/80 bg-amber-50/80 text-amber-950"
                  : state().grade === "zettelkasten"
                    ? "border-violet-200/80 bg-violet-50/80 text-violet-950"
                    : state().grade === "ready"
                      ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-950"
                      : "border-sky-200/80 bg-sky-50/80 text-sky-950"
              }`}>
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="max-w-3xl">
                    <p class={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                      state().grade === "warmup"
                        ? "text-amber-800/80"
                        : state().grade === "zettelkasten"
                          ? "text-violet-800/80"
                          : state().grade === "ready"
                            ? "text-emerald-800/80"
                            : "text-sky-800/80"
                    }`}>
                      Best student path from Files
                    </p>
                    <p class="mt-1 font-medium">{state().headline}</p>
                    <p class="mt-1 text-xs leading-5 opacity-85">{state().detail}</p>
                  </div>
                  <span class="rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]">
                    {state().badge}
                  </span>
                </div>
                <div class="mt-3 grid gap-3 lg:grid-cols-3">
                  <For each={state().cards}>
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
                        <p class="mt-1 text-xs leading-5 text-on-surface">{card.detail}</p>
                      </div>
                    )}
                  </For>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (state().primaryActionId === "open_matching_graph") {
                        openKnowledgeGraphForCurrentFocus();
                        return;
                      }
                      if (state().primaryActionId === "show_ready_first") {
                        setActiveStudyReadiness("ready_now");
                        return;
                      }
                      if (state().primaryActionId === "clear_filters") {
                        resetAllFilters();
                        return;
                      }
                      if (state().primaryActionId === "plan_next_source") {
                        openAdjacentSourcePlannerForCurrentFocus();
                        return;
                      }
                      openStudyWorkspaceForCurrentFocus();
                    }}
                    class="rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-white"
                  >
                    {state().primaryActionLabel}
                  </button>
                  <Show when={state().secondaryActionId}>
                    <button
                      type="button"
                      onClick={() => {
                        if (state().secondaryActionId === "open_matching_graph") {
                          openKnowledgeGraphForCurrentFocus();
                          return;
                        }
                        if (state().secondaryActionId === "show_ready_first") {
                          setActiveStudyReadiness("ready_now");
                          return;
                        }
                        if (state().secondaryActionId === "clear_filters") {
                          resetAllFilters();
                          return;
                        }
                        if (state().secondaryActionId === "plan_next_source") {
                          openAdjacentSourcePlannerForCurrentFocus();
                          return;
                        }
                        openStudyWorkspaceForCurrentFocus();
                      }}
                      class="rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-white"
                    >
                      {state().secondaryActionLabel}
                    </button>
                  </Show>
                </div>
              </div>
            )}
          </Show>

          <div class="flex flex-wrap gap-2">
            {(["all", "study", "audio", "image", "data", "other"] as const).map((category) => (
              <button
                type="button"
                onClick={() => setActiveCategory(category)}
                class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeCategory() === category
                    ? "border-violet-300 bg-violet-100 text-violet-900"
                    : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
                }`}
              >
                {category === "all"
                  ? "All files"
                  : category === "study"
                    ? "Study docs"
                    : category === "audio"
                      ? "Audio"
                      : category === "image"
                        ? "Images"
                        : category === "data"
                          ? "Data"
                          : "Other"}{" "}
                <span class="text-[10px] opacity-70">{categoryCounts()[category]}</span>
              </button>
            ))}
          </div>

          <div class="flex flex-wrap gap-2">
            {(["all", "parsed_document", "transcript", "attachment", "unclassified"] as const).map((kind) => (
              <button
                type="button"
                onClick={() => setActiveSourceKind(kind)}
                class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeSourceKind() === kind
                    ? "border-sky-300 bg-sky-100 text-sky-900"
                    : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
                }`}
              >
                {kind === "all" ? "All source types" : sourceKindLabel(kind)}{" "}
                <span class="text-[10px] opacity-70">{sourceKindCounts()[kind]}</span>
              </button>
            ))}
          </div>

          <div class="flex flex-wrap gap-2">
            {(["all", "connected_notes", "zettelkasten", "standard", "unclassified"] as const).map((knowledge) => (
              <button
                type="button"
                onClick={() => setActiveKnowledge(knowledge)}
                class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeKnowledge() === knowledge
                    ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                    : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
                }`}
              >
                {knowledge === "all"
                  ? "All knowledge modes"
                  : knowledge === "connected_notes"
                    ? "Connected notes"
                    : knowledge === "zettelkasten"
                      ? "Zettelkasten"
                      : knowledge === "standard"
                        ? "Standard"
                        : "Unclassified"}{" "}
                <span class="text-[10px] opacity-70">{knowledgeCounts()[knowledge]}</span>
              </button>
            ))}
          </div>

          <div class="flex flex-wrap gap-2">
            {(["all", "keep_file", "keep_extracted_only", "keep_nothing", "unknown"] as const).map((retention) => (
              <button
                type="button"
                onClick={() => setActiveRetention(retention)}
                class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeRetention() === retention
                    ? "border-amber-300 bg-amber-100 text-amber-900"
                    : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
                }`}
              >
                {retention === "all"
                  ? "All retention"
                  : retention === "keep_file"
                    ? "Keep file"
                    : retention === "keep_extracted_only"
                      ? "Keep extracted only"
                      : retention === "keep_nothing"
                        ? "Session-only"
                        : "Unknown"}{" "}
                <span class="text-[10px] opacity-70">{retentionCounts()[retention]}</span>
              </button>
            ))}
          </div>

          <div class="flex flex-wrap gap-2">
            {(["all", "lecture_slides", "lecture_notes", "reading", "assignment", "study_notes", "transcript", "unclassified"] as const).map((academicKind) => (
              <button
                type="button"
                onClick={() => setActiveAcademicKind(academicKind)}
                class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeAcademicKind() === academicKind
                    ? "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-900"
                    : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
                }`}
              >
                {academicKind === "all" ? "All study types" : academicKindLabel(academicKind)}{" "}
                <span class="text-[10px] opacity-70">{academicKindCounts()[academicKind]}</span>
              </button>
            ))}
          </div>

          <Show when={courseTags().length > 0}>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveCourseTag(null)}
                class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeCourseTag() === null
                    ? "border-violet-300 bg-violet-100 text-violet-900"
                    : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
                }`}
              >
                All courses
              </button>
              <For each={courseTags()}>
                {([tag, count]) => (
                  <button
                    type="button"
                    onClick={() => setActiveCourseTag(activeCourseTag() === tag ? null : tag)}
                    class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      activeCourseTag() === tag
                        ? "border-violet-300 bg-violet-100 text-violet-900"
                        : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
                    }`}
                  >
                    {tag} <span class="text-[10px] opacity-70">{count}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>

          <Show when={unitTags().length > 0}>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveUnitTag(null)}
                class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeUnitTag() === null
                    ? "border-teal-300 bg-teal-100 text-teal-900"
                    : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
                }`}
              >
                All units
              </button>
              <For each={unitTags()}>
                {([tag, count]) => (
                  <button
                    type="button"
                    onClick={() => setActiveUnitTag(activeUnitTag() === tag ? null : tag)}
                    class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      activeUnitTag() === tag
                        ? "border-teal-300 bg-teal-100 text-teal-900"
                        : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
                    }`}
                  >
                    {tag} <span class="text-[10px] opacity-70">{count}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>

          <Show when={chapterTags().length > 0}>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveChapterTag(null)}
                class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeChapterTag() === null
                    ? "border-lime-300 bg-lime-100 text-lime-900"
                    : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
                }`}
              >
                All chapters
              </button>
              <For each={chapterTags()}>
                {([tag, count]) => (
                  <button
                    type="button"
                    onClick={() => setActiveChapterTag(activeChapterTag() === tag ? null : tag)}
                    class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      activeChapterTag() === tag
                        ? "border-lime-300 bg-lime-100 text-lime-900"
                        : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
                    }`}
                  >
                    {tag} <span class="text-[10px] opacity-70">{count}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>

          <Show when={weekTags().length > 0}>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveWeekTag(null)}
                class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeWeekTag() === null
                    ? "border-indigo-300 bg-indigo-100 text-indigo-900"
                    : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
                }`}
              >
                All weeks
              </button>
              <For each={weekTags()}>
                {([tag, count]) => (
                  <button
                    type="button"
                    onClick={() => setActiveWeekTag(activeWeekTag() === tag ? null : tag)}
                    class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      activeWeekTag() === tag
                        ? "border-indigo-300 bg-indigo-100 text-indigo-900"
                        : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
                    }`}
                  >
                    {tag} <span class="text-[10px] opacity-70">{count}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>

          <Show when={lectureTags().length > 0}>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveLectureTag(null)}
                class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeLectureTag() === null
                    ? "border-sky-300 bg-sky-100 text-sky-900"
                    : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
                }`}
              >
                All lectures
              </button>
              <For each={lectureTags()}>
                {([tag, count]) => (
                  <button
                    type="button"
                    onClick={() => setActiveLectureTag(activeLectureTag() === tag ? null : tag)}
                    class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      activeLectureTag() === tag
                        ? "border-sky-300 bg-sky-100 text-sky-900"
                        : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
                    }`}
                  >
                    {tag} <span class="text-[10px] opacity-70">{count}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>

          <div class="flex flex-wrap gap-2">
            {(["all", "source_note", "literature_note", "permanent_note", "review_pending", "unclassified"] as const).map((stage) => (
              <button
                type="button"
                onClick={() => setActiveZettelkastenStage(stage)}
                class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeZettelkastenStage() === stage
                    ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                    : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
                }`}
              >
                {stage === "all" ? "All ZK stages" : academicKindLabel(stage)}{" "}
                <span class="text-[10px] opacity-70">{zettelkastenStageCounts()[stage]}</span>
              </button>
            ))}
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                activeTag() === null
                  ? "border-sky-300 bg-sky-100 text-sky-900"
                  : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
              }`}
            >
              All tags
            </button>
            <For each={visibleTopTags()}>
              {(facet) => (
                <button
                  type="button"
                  onClick={() => setActiveTag(facet.tag)}
                  class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    activeTag() === facet.tag
                      ? "border-sky-300 bg-sky-100 text-sky-900"
                      : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
                  }`}
                >
                  {facet.tag} <span class="text-[10px] opacity-70">{facet.count}</span>
                </button>
              )}
            </For>
          </div>
          <Show when={topTags().length === 0}>
            <p class="text-xs text-on-surface-variant">
              No supertags are available for the current result set yet. Files can still be opened from the source thread and will appear here once tagging or extraction completes.
            </p>
          </Show>
          <Show when={topTags().length > 0 && visibleTopTags().length === 0}>
            <p class="text-xs text-on-surface-variant">
              No visible supertags match the current tag filter query.
            </p>
          </Show>
          <p class="text-xs text-on-surface-variant">
            {fileSummary()?.matching_count ?? 0} retained files match the current library filters across {topTags().length} top tags and {visibleTagCount()} tags in the current view. The current result uses {formatBytes(fileSummary()?.visible_bytes ?? 0)} of visible storage.
          </p>
          <div class="flex flex-wrap gap-2">
            {(["all", "downloadable", "extracted_only", "session_only", "unavailable"] as const).map((availability) => (
              <button
                type="button"
                onClick={() => setActiveAvailability(availability)}
                class={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  activeAvailability() === availability
                    ? "border-cyan-300 bg-cyan-100 text-cyan-900"
                    : "border-white/60 bg-white/85 text-on-surface-variant hover:bg-white"
                }`}
              >
                {availabilityLabel(availability)}{" "}
                <span class="text-[10px] opacity-70">{availabilityCounts()[availability]}</span>
              </button>
            ))}
          </div>
          <Show when={libraryPage()?.has_more}>
            <div class="rounded-2xl border border-amber-200/70 bg-amber-50/85 px-4 py-3 text-sm text-amber-950 shadow-sm">
              Showing {libraryPage()?.returned_count ?? filteredItems().length} of {libraryPage()?.matching_count ?? 0} matching files. Load more to inspect the rest of the library without changing the current filters.
            </div>
          </Show>
          <p class="text-xs text-on-surface-variant">
            Account storage in use: {formatBytes(fileSummary()?.storage_used_bytes ?? 0)}
            <Show when={(fileSummary()?.storage_quota_bytes ?? 0) > 0}>
              {" "}of {formatBytes(fileSummary()?.storage_quota_bytes ?? 0)} quota
            </Show>.
          </p>
        </div>
      </section>

      <section class="flex-1 rounded-[28px] border border-white/55 bg-white/60 p-5 shadow-card backdrop-blur-xl">
        <Show
          when={!files.error}
          fallback={
            <div class="rounded-[24px] border border-rose-200/70 bg-rose-50/85 p-6 text-sm text-rose-900">
              <p class="font-semibold">The file library could not be loaded.</p>
              <p class="mt-2 text-rose-800/90">
                Refresh the view or try again after signing in again. Stored files are not deleted; this is a read failure.
              </p>
              <button
                type="button"
                onClick={() => {
                  void refetchFiles();
                }}
                class="mt-4 rounded-2xl border border-rose-200/80 bg-white/90 px-4 py-2 text-sm font-medium text-rose-900 transition hover:bg-white"
              >
                Retry library load
              </button>
            </div>
          }
        >
          <Show when={!files.loading} fallback={<div class="p-6 text-sm text-on-surface-variant">Loading file library...</div>}>
          <Show
            when={visibleItems().length > 0}
            fallback={
              <div class="flex min-h-[280px] flex-col items-center justify-center rounded-[24px] border border-dashed border-white/70 bg-white/55 px-6 text-center">
                <Show
                  when={isLibraryCompletelyEmpty()}
                  fallback={
                    <>
                      <p class="text-base font-semibold text-on-surface">No files match the current filters.</p>
                      <p class="mt-2 max-w-lg text-sm leading-6 text-on-surface-variant">
                        Try a broader keyword, clear the active tag, or upload and retain a file from chat so it becomes available for knowledge synthesis here.
                      </p>
                    </>
                  }
                >
                  <p class="text-base font-semibold text-on-surface">No retained study sources yet.</p>
                  <p class="mt-2 max-w-xl text-sm leading-6 text-on-surface-variant">
                    This library fills up after a study chat run keeps either the original file or extracted notes. For most students, the best first run is one lecture source plus one reading or rough note with retention set to extracted notes only.
                  </p>
                  <div class="mt-4 max-w-3xl rounded-2xl border border-violet-200/70 bg-violet-50/85 p-4 text-left shadow-sm">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="max-w-2xl">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-800/75">
                          {studyZeroState().eyebrow}
                        </p>
                        <p class="mt-1 text-sm font-semibold text-violet-950">{studyZeroState().headline}</p>
                        <p class="mt-1 text-xs leading-5 text-violet-900/80">{studyZeroState().detail}</p>
                      </div>
                      <div class="rounded-2xl border border-white/70 bg-white/90 px-3 py-2 text-right shadow-sm">
                        <p class="text-[10px] uppercase tracking-[0.14em] text-violet-700/75">Time to value</p>
                        <p class="mt-1 text-sm font-semibold text-violet-950">{studyZeroState().timeToValueLabel}</p>
                      </div>
                    </div>
                    <div class="mt-3 grid gap-3 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                      <div class="rounded-2xl border border-white/70 bg-white/90 p-3 shadow-sm">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-800/75">
                          What the first run should give back
                        </p>
                        <div class="mt-2 flex flex-wrap gap-2">
                          <For each={studyZeroState().firstOutputs}>
                            {(item) => (
                              <span class="rounded-full border border-violet-200/80 bg-violet-50/85 px-3 py-1 text-xs text-violet-900">
                                {item}
                              </span>
                            )}
                          </For>
                        </div>
                      </div>
                      <div class="rounded-2xl border border-emerald-200/80 bg-emerald-50/75 p-3 shadow-sm">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/80">
                          {studyZeroState().recommendedRetentionLabel}
                        </p>
                        <p class="mt-1 text-xs leading-5 text-emerald-900/85">
                          {studyZeroState().recommendedRetentionDetail}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div class="mt-4 grid max-w-3xl gap-3 text-left md:grid-cols-3">
                    <div class="rounded-2xl border border-sky-100 bg-sky-50/80 p-3">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800/75">1. Upload</p>
                      <p class="mt-1 text-xs leading-5 text-sky-950/90">
                        Add lecture slides, a PDF reading, rough notes, or a voice memo in study chat.
                      </p>
                    </div>
                    <div class="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/75">2. Keep extracted notes</p>
                      <p class="mt-1 text-xs leading-5 text-emerald-950/90">
                        Preserve searchable study content without forcing full-file storage by default.
                      </p>
                    </div>
                    <div class="rounded-2xl border border-violet-100 bg-violet-50/80 p-3">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-800/75">3. Review here</p>
                      <p class="mt-1 text-xs leading-5 text-violet-950/90">
                        Search by keyword, supertag, course, unit, chapter, week, lecture, or Zettelkasten stage once the first run completes.
                      </p>
                    </div>
                  </div>
                </Show>
                <Show when={hasActiveFilters()}>
                  <div class="mt-4 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      class="rounded-full border border-slate-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-900 transition hover:bg-white"
                    >
                      Clear current filters
                    </button>
                    <button
                      type="button"
                      onClick={openStudyWorkspaceForCurrentFocus}
                      class="rounded-full border border-violet-200/80 bg-violet-50/90 px-3 py-1.5 text-xs font-medium text-violet-900 transition hover:bg-violet-100"
                    >
                      Return to study chat
                    </button>
                  </div>
                </Show>
                <Show when={!hasActiveFilters()}>
                  <div class="mt-4 grid max-w-4xl gap-3 text-left md:grid-cols-2 xl:grid-cols-4">
                    <For each={studyZeroState().starterActions}>
                      {(action) => (
                        <button
                          type="button"
                          onClick={() => props.onOpenStudyQuickStart?.(studentQuickStartForIntent(action.intent))}
                          class={`rounded-2xl border p-3 text-left transition ${zeroStateActionClass(action.tone)}`}
                        >
                          <div class="flex items-start justify-between gap-2">
                            <p class="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">{action.label}</p>
                            <Show when={action.recommended}>
                              <span class="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
                                Recommended
                              </span>
                            </Show>
                          </div>
                          <p class="mt-1 text-sm font-semibold">{action.title}</p>
                          <p class="mt-1 text-xs leading-5 opacity-85">{action.detail}</p>
                        </button>
                      )}
                    </For>
                  </div>
                  <div class="mt-4 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => props.onOpenStudyQuickStart?.(DEFAULT_STUDENT_ONBOARDING_QUICK_START)}
                      class="rounded-full border border-violet-200/80 bg-violet-50/90 px-3 py-1.5 text-xs font-medium text-violet-900 transition hover:bg-violet-100"
                    >
                      Start first study upload
                    </button>
                  </div>
                </Show>
                <Show when={activeRetention() === "keep_nothing"}>
                  <p class="mt-3 max-w-lg text-sm leading-6 text-amber-900/90">
            Session-only uploads are expected to disappear from this workspace because neither the original file nor extracted notes are retained.
                  </p>
                </Show>
              </div>
            }
          >
            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <For each={visibleItems()}>
                {(item) => (
                  <article class="flex min-w-0 h-full flex-col rounded-[24px] border border-white/70 bg-white/88 p-4 shadow-sm">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="break-words text-base font-semibold text-on-surface">{item.name}</p>
                        <p class="mt-1 break-words text-xs uppercase tracking-[0.14em] text-on-surface-variant/70">{displaySourceType(item)}</p>
                      </div>
                      <span class="shrink-0 rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                        {formatBytes(item.size_bytes)}
                      </span>
                    </div>

                    <div class="mt-3 flex flex-wrap gap-2">
                      <span class="max-w-full break-words rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-700">{item.mime_type}</span>
                      <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-700">{formatDate(item.created_at)}</span>
                      <span class={`rounded-full px-2.5 py-1 text-[11px] ${availabilityBadgeClass(item)}`}>
                        {fileLibraryCardState(item).availability.label}
                      </span>
                      <Show when={knowledgeModeLabel(item)}>
                        <span class="max-w-full break-words rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] text-emerald-800">
                          {knowledgeModeLabel(item)}
                        </span>
                      </Show>
                      <Show when={fileLibraryCardState(item).retentionLabel}>
                        <span class="max-w-full break-words rounded-full bg-amber-100 px-2.5 py-1 text-[11px] text-amber-800">
                          {fileLibraryCardState(item).retentionLabel}
                        </span>
                      </Show>
                      <span class={`rounded-full px-2.5 py-1 text-[11px] ${studyReadinessBadgeClass(fileLibraryCardState(item).studyReadiness)}`}>
                        {fileLibraryCardState(item).studyReadinessLabel}
                      </span>
                    </div>

                    <Show when={item.source_summary}>
                      <p class="mt-3 break-words text-sm leading-6 text-on-surface-variant">{item.source_summary}</p>
                    </Show>

                      <Show when={fileLibraryCardState(item).academicSummary}>
                      <div class="mt-3 rounded-2xl border border-violet-200/70 bg-violet-50/80 px-3 py-2">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">Study classification</p>
                        <p class="mt-1 break-words text-xs leading-5 text-violet-900">{fileLibraryCardState(item).academicSummary}</p>
                        <div class="mt-2 flex flex-wrap gap-1.5">
                          <Show when={fileLibraryAcademicKind(item)}>
                            {(value) => <span class="max-w-full break-words rounded-full bg-violet-100 px-2 py-1 text-[11px] text-violet-800">{academicKindLabel(value())}</span>}
                          </Show>
                          <Show when={fileLibraryAcademicCourseTag(item)}>
                            {(value) => <span class="max-w-full break-words rounded-full bg-violet-100 px-2 py-1 text-[11px] text-violet-800">{value()}</span>}
                          </Show>
                          <Show when={fileLibraryAcademicWeekTag(item)}>
                            {(value) => <span class="max-w-full break-words rounded-full bg-violet-100 px-2 py-1 text-[11px] text-violet-800">{value()}</span>}
                          </Show>
                          <Show when={fileLibraryAcademicLectureTag(item)}>
                            {(value) => <span class="max-w-full break-words rounded-full bg-violet-100 px-2 py-1 text-[11px] text-violet-800">{value()}</span>}
                          </Show>
                          <Show when={fileLibraryAcademicChapterTag(item)}>
                            {(value) => <span class="max-w-full break-words rounded-full bg-violet-100 px-2 py-1 text-[11px] text-violet-800">{value()}</span>}
                          </Show>
                          <Show when={fileLibraryAcademicUnitTag(item)}>
                            {(value) => <span class="max-w-full break-words rounded-full bg-violet-100 px-2 py-1 text-[11px] text-violet-800">{value()}</span>}
                          </Show>
                          <Show when={fileLibraryZettelkastenStage(item)}>
                            {(value) => <span class="max-w-full break-words rounded-full bg-emerald-100 px-2 py-1 text-[11px] text-emerald-800">{academicKindLabel(value())}</span>}
                          </Show>
                          <Show when={fileLibraryZettelkastenEntryType(item)}>
                            {(value) => <span class="max-w-full break-words rounded-full bg-emerald-100 px-2 py-1 text-[11px] text-emerald-800">{academicKindLabel(value())}</span>}
                          </Show>
                        </div>
                      </div>
                    </Show>

                    <Show when={fileLibraryKnowledgeGraphGroupKey(item) || fileLibraryKnowledgeGraphLinkTags(item).length > 0 || fileLibraryZettelkastenNextAction(item)}>
                      <div class="mt-3 rounded-2xl border border-cyan-200/70 bg-cyan-50/80 px-3 py-2">
                        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-800">Connected-note graph</p>
                        <Show when={fileLibraryKnowledgeGraphGroupKey(item)}>
                          {(value) => <p class="mt-1 break-words text-xs leading-5 text-cyan-950">Graph anchor: {value()}</p>}
                        </Show>
                        <Show when={fileLibraryZettelkastenNextAction(item)}>
                          {(value) => <p class="mt-1 break-words text-xs leading-5 text-cyan-950">Next note move: {value()}</p>}
                        </Show>
                        <Show when={fileLibraryKnowledgeGraphLinkTags(item).length > 0}>
                          <div class="mt-2 flex flex-wrap gap-1.5">
                            <For each={fileLibraryKnowledgeGraphLinkTags(item).slice(0, 8)}>
                              {(tag) => <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-[11px] text-cyan-900">{tag}</span>}
                            </For>
                          </div>
                        </Show>
                      </div>
                    </Show>

                    <div class="mt-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-3 py-2">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Retention and provenance</p>
                      <p class="mt-1 break-words text-xs leading-5 text-slate-700">{fileLibraryCardState(item).storageSummary}</p>
                      <p class="mt-1 break-words text-xs leading-5 text-slate-600">{fileLibraryCardState(item).provenanceSummary}</p>
                    </div>

                    <div class="mt-3 rounded-2xl border border-teal-200/70 bg-teal-50/80 px-3 py-2">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-700">Study readiness</p>
                      <p class="mt-1 break-words text-xs leading-5 text-teal-900">{fileLibraryCardState(item).studyReadinessSummary}</p>
                    </div>
                    <Show when={buildFileLibraryItemValueStoryState(item)}>
                      {(story) => (
                        <div class={`mt-3 rounded-2xl border px-3 py-3 ${
                          story().grade === "strong"
                            ? "border-emerald-200/80 bg-emerald-50/70"
                            : story().grade === "developing"
                              ? "border-sky-200/80 bg-sky-50/70"
                              : "border-amber-200/80 bg-amber-50/70"
                        }`}>
                          <p class={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                            story().grade === "strong"
                              ? "text-emerald-800/80"
                              : story().grade === "developing"
                                ? "text-sky-800/80"
                                : "text-amber-800/80"
                          }`}>
                            Why this file matters now
                          </p>
                          <p class="mt-1 break-words text-xs font-medium leading-5 text-on-surface">{story().headline}</p>
                          <p class="mt-1 break-words text-xs leading-5 text-on-surface/80">{story().detail}</p>
                          <div class="mt-3 grid gap-2">
                            <For each={story().signals}>
                              {(signal) => (
                                <div class={`rounded-2xl border px-3 py-2 ${
                                  signal.tone === "emerald"
                                    ? "border-emerald-200/80 bg-white/90"
                                    : signal.tone === "violet"
                                      ? "border-violet-200/80 bg-white/90"
                                      : signal.tone === "amber"
                                        ? "border-amber-200/80 bg-white/90"
                                        : "border-sky-200/80 bg-white/90"
                                }`}>
                                  <p class={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
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
                                  <p class="mt-1 break-words text-xs leading-5 text-on-surface">{signal.value}</p>
                                </div>
                              )}
                            </For>
                          </div>
                          <p class="mt-3 break-words text-xs leading-5 text-on-surface/75">{story().nextStep}</p>
                        </div>
                      )}
                    </Show>

                    <div class="mt-4 flex flex-wrap gap-2">
                      <For each={item.source_supertags.slice(0, 8)}>
                        {(tag) => (
                          <button
                            type="button"
                            onClick={() => setActiveTag(tag)}
                            class="max-w-full break-words rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-[11px] text-sky-800 transition hover:bg-sky-100"
                          >
                            {tag}
                          </button>
                        )}
                      </For>
                    </div>
                    <p class="mt-3 break-words text-xs leading-5 text-on-surface-variant">
                      {fileLibraryCardState(item).retentionHint}
                    </p>

                    <div class="mt-auto pt-4">
                      <div class={`grid gap-2 ${secondaryThreadTarget(item) ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
                        <Show
                          when={fileLibraryCardState(item).primaryAction.kind === "download"}
                          fallback={
                            <Show
                              when={fileLibraryCardState(item).primaryAction.kind === "thread"}
                              fallback={
                                <button
                                  type="button"
                                  disabled
                                  class="cursor-not-allowed rounded-2xl border border-slate-200/70 bg-slate-100 px-3 py-2 text-center text-sm font-medium text-slate-500"
                                  title={fileLibraryCardState(item).retentionHint}
                                >
                                  {fileLibraryCardState(item).primaryAction.label}
                                </button>
                              }
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  const target = primaryThreadTarget(item);
                                  if (!target) return;
                                  props.onOpenThread?.(target.threadId, target.messageId);
                                }}
                                class="rounded-2xl border border-sky-200/70 bg-sky-50 px-3 py-2 text-center text-sm font-medium text-sky-900 transition hover:bg-sky-100"
                              >
                                {fileLibraryCardState(item).primaryAction.label}
                              </button>
                            </Show>
                          }
                        >
                          <a
                            href={safeHref(item.download_url)}
                            target="_blank"
                            rel="noreferrer"
                            class="rounded-2xl border border-sky-200/70 bg-sky-50 px-3 py-2 text-center text-sm font-medium text-sky-900 transition hover:bg-sky-100"
                          >
                            {fileLibraryCardState(item).primaryAction.label}
                          </a>
                        </Show>
                        <Show when={secondaryThreadTarget(item) && fileLibraryCardState(item).secondaryThreadLabel}>
                          <button
                            type="button"
                            onClick={() => {
                              const target = secondaryThreadTarget(item);
                              if (!target) return;
                              props.onOpenThread?.(target.threadId, target.messageId);
                            }}
                            class="rounded-2xl border border-amber-200/70 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
                          >
                            {fileLibraryCardState(item).secondaryThreadLabel}
                          </button>
                        </Show>
                        <button
                          type="button"
                          onClick={() => {
                            saveKnowledgeGraphNavigationIntent(
                              deriveKnowledgeGraphNavigationIntentFromFile(item),
                            );
                            props.onNavigate?.("knowledge_graph");
                          }}
                          class="rounded-2xl border border-emerald-200/70 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100"
                        >
                          View links
                        </button>
                      </div>
                      <p class="mt-3 break-all font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/60">
                        thread {item.thread_id}
                      </p>
                    </div>
                  </article>
                )}
              </For>
            </div>
            <Show when={libraryPage()?.has_more}>
              <div class="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/70 bg-white/80 px-4 py-4">
                <p class="text-sm text-on-surface-variant">
                  {libraryPage()?.matching_count ?? 0} files matched, but only the first {libraryPage()?.returned_count ?? filteredItems().length} are loaded.
                </p>
                <div class="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPageLimit((current) => current + baseLimit)}
                    class="rounded-2xl border border-sky-200/80 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-900 transition hover:bg-sky-100"
                  >
                    Load {baseLimit} more
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageLimit(libraryPage()?.matching_count ?? baseLimit)}
                    class="rounded-2xl border border-emerald-200/80 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100"
                  >
                    Load all matches
                  </button>
                </div>
              </div>
            </Show>
          </Show>
        </Show>
        </Show>
      </section>
    </div>
  );
}
