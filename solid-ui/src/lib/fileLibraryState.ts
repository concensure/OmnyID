// @locs-version: 1.0
import type { FileLibraryItem } from "./api";

export type FileLibraryPrimaryAction =
  | {
      kind: "download";
      label: "Open file";
      disabled: false;
    }
  | {
      kind: "thread";
      label: "Open notes" | "Open thread";
      disabled: false;
    }
  | {
      kind: "unavailable";
      label: "Not retained" | "Unavailable";
      disabled: true;
    };

export type FileLibraryAvailabilityState =
  | {
      kind: "downloadable";
      label: "File retained";
      tone: "sky";
    }
  | {
      kind: "extracted_only";
      label: "Extracted notes";
      tone: "emerald";
    }
  | {
      kind: "session_only";
      label: "Session only";
      tone: "amber";
    }
  | {
      kind: "unavailable";
      label: "Unavailable";
      tone: "slate";
    };

export type FileLibraryCardState = {
  availability: FileLibraryAvailabilityState;
  retentionLabel: string | null;
  retentionHint: string;
  academicSummary: string | null;
  storageSummary: string;
  provenanceSummary: string;
  studyReadiness: FileLibraryStudyReadiness;
  studyReadinessLabel: string;
  studyReadinessSummary: string;
  primaryAction: FileLibraryPrimaryAction;
  secondaryThreadLabel: "Open thread" | "Open source" | "Open notes" | null;
};

export type FileLibraryOpenTarget = {
  threadId: string;
  messageId: string;
};

export type FileLibraryStudyReadiness = "ready_now" | "developing" | "archival";

function sourceMetadataString(item: FileLibraryItem, key: string): string | null {
  const value = item.source_metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function fileLibraryRetentionLabel(item: FileLibraryItem): string | null {
  return sourceMetadataString(item, "attachment_retention_label");
}

export function fileLibraryHasRetainedFile(item: FileLibraryItem): boolean {
  return typeof item.download_url === "string" && item.download_url.trim().length > 0;
}

export function fileLibraryRetentionMode(item: FileLibraryItem): string | null {
  return sourceMetadataString(item, "attachment_retention_mode");
}

export function fileLibraryPolicyOutcome(item: FileLibraryItem): string | null {
  return sourceMetadataString(item, "attachment_policy_outcome");
}

export function fileLibraryAcademicSummary(item: FileLibraryItem): string | null {
  return sourceMetadataString(item, "academic_summary");
}

export function fileLibraryAcademicKind(item: FileLibraryItem): string | null {
  return sourceMetadataString(item, "academic_kind");
}

export function fileLibraryAcademicCourseTag(item: FileLibraryItem): string | null {
  return sourceMetadataString(item, "academic_course_tag");
}

export function fileLibraryAcademicWeekTag(item: FileLibraryItem): string | null {
  return sourceMetadataString(item, "academic_week_tag");
}

export function fileLibraryAcademicLectureTag(item: FileLibraryItem): string | null {
  return sourceMetadataString(item, "academic_lecture_tag");
}

export function fileLibraryAcademicChapterTag(item: FileLibraryItem): string | null {
  return sourceMetadataString(item, "academic_chapter_tag");
}

export function fileLibraryAcademicUnitTag(item: FileLibraryItem): string | null {
  return sourceMetadataString(item, "academic_unit_tag");
}

export function fileLibraryZettelkastenStage(item: FileLibraryItem): string | null {
  return sourceMetadataString(item, "zettelkasten_stage");
}

export function fileLibraryZettelkastenEntryType(item: FileLibraryItem): string | null {
  return sourceMetadataString(item, "zettelkasten_entry_type");
}

export function fileLibraryZettelkastenNextAction(item: FileLibraryItem): string | null {
  return sourceMetadataString(item, "zettelkasten_next_action");
}

export function fileLibraryKnowledgeGraphGroupKey(item: FileLibraryItem): string | null {
  return sourceMetadataString(item, "knowledge_graph_group_key");
}

export function fileLibraryKnowledgeGraphLinkTags(item: FileLibraryItem): string[] {
  const value = item.source_metadata.knowledge_graph_link_tags;
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

export function fileLibraryStudyReadiness(item: FileLibraryItem): FileLibraryStudyReadiness {
  const retentionMode = fileLibraryRetentionMode(item);
  const knowledgeMode = sourceMetadataString(item, "knowledge_mode");
  const hasAcademicContext =
    Boolean(fileLibraryAcademicKind(item))
    || Boolean(fileLibraryAcademicCourseTag(item))
    || Boolean(fileLibraryAcademicWeekTag(item))
    || Boolean(fileLibraryAcademicLectureTag(item))
    || Boolean(fileLibraryZettelkastenStage(item))
    || Boolean(fileLibraryKnowledgeGraphGroupKey(item))
    || fileLibraryKnowledgeGraphLinkTags(item).length > 0;
  const visibleTags = item.source_supertags.filter((tag) => tag.trim().length > 0);
  const hasStudySourceKind = item.source_kind === "parsed_document" || item.source_kind === "transcript";
  const hasGroundedKnowledgeMode = knowledgeMode === "connected_notes" || knowledgeMode === "zettelkasten";

  if (
    retentionMode !== "keep_nothing"
    && hasGroundedKnowledgeMode
    && hasAcademicContext
    && (hasStudySourceKind || visibleTags.length >= 2)
  ) {
    return "ready_now";
  }

  if (
    retentionMode !== "keep_nothing"
    && (hasAcademicContext || hasGroundedKnowledgeMode || visibleTags.length > 0 || hasStudySourceKind)
  ) {
    return "developing";
  }

  return "archival";
}

export function fileLibraryStudyReadinessLabel(value: FileLibraryStudyReadiness): string {
  if (value === "ready_now") return "Study ready";
  if (value === "developing") return "Linking up";
  return "Archive";
}

export function fileLibraryStudyReadinessSummary(item: FileLibraryItem): string {
  const readiness = fileLibraryStudyReadiness(item);
  if (readiness === "ready_now") {
    return "This source is already classified, tagged, and retained in a way that should make later study retrieval immediate.";
  }
  if (readiness === "developing") {
    return "This source has some useful metadata or supertags, but it likely needs another related note, lecture, or reading before retrieval becomes stronger.";
  }
  return "This source is retained more like storage than an active study asset and may need extraction, tagging, or connected-note context.";
}

export function fileLibraryDerivedMessageId(item: FileLibraryItem): string | null {
  return typeof item.derived_message_id === "string" && item.derived_message_id.trim()
    ? item.derived_message_id.trim()
    : null;
}

export function fileLibraryDerivedThreadId(item: FileLibraryItem): string | null {
  return typeof item.derived_thread_id === "string" && item.derived_thread_id.trim()
    ? item.derived_thread_id.trim()
    : null;
}

export function fileLibrarySourceThreadId(item: FileLibraryItem): string | null {
  return typeof item.source_thread_id === "string" && item.source_thread_id.trim()
    ? item.source_thread_id.trim()
    : (typeof item.thread_id === "string" && item.thread_id.trim() ? item.thread_id.trim() : null);
}

export function fileLibrarySourceMessageId(item: FileLibraryItem): string | null {
  return typeof item.message_id === "string" && item.message_id.trim() ? item.message_id.trim() : null;
}

export function fileLibraryNotesTarget(item: FileLibraryItem): FileLibraryOpenTarget | null {
  const threadId = fileLibraryDerivedThreadId(item);
  const messageId = fileLibraryDerivedMessageId(item);
  if (!threadId || !messageId) return null;
  return { threadId, messageId };
}

export function fileLibrarySourceTarget(item: FileLibraryItem): FileLibraryOpenTarget | null {
  const threadId = fileLibrarySourceThreadId(item);
  const messageId = fileLibrarySourceMessageId(item);
  if (!threadId || !messageId) return null;
  return { threadId, messageId };
}

export function fileLibraryRetentionHint(item: FileLibraryItem): string {
  const label = fileLibraryRetentionLabel(item);
  if (fileLibraryHasRetainedFile(item)) return label ?? "Original file retained";
  const retentionMode = fileLibraryRetentionMode(item);
  if (retentionMode === "keep_extracted_only") return "Original removed after extraction";
  if (retentionMode === "keep_nothing") return "File was used for a session-only synthesis";
  return "Original file is unavailable";
}

export function fileLibraryStorageSummary(item: FileLibraryItem): string {
  if (fileLibraryHasRetainedFile(item)) return "Original file stored in your account library";
  const retentionMode = fileLibraryRetentionMode(item);
  if (retentionMode === "keep_extracted_only") return "Only extracted notes are stored for future retrieval";
  if (retentionMode === "keep_nothing") return "No file or extracted content was retained after this session";
  return "Retention state is unavailable for this file";
}

export function fileLibraryProvenanceSummary(item: FileLibraryItem): string {
  const sourceLabel = item.source_kind?.trim() || item.source_type.trim() || "attachment";
  const mode = sourceMetadataString(item, "knowledge_mode");
  const fileName = sourceMetadataString(item, "source_file_name") ?? item.name.trim();
  const modeSuffix = mode === "zettelkasten"
    ? " and organized into a Zettelkasten flow"
    : mode === "connected_notes"
      ? " and linked into connected notes"
      : "";
  const policyOutcome = fileLibraryPolicyOutcome(item);
  if (policyOutcome) {
    return `${fileName} entered via ${sourceLabel.replace(/_/g, " ")}${modeSuffix}. ${policyOutcome}`;
  }
  return `${fileName} entered via ${sourceLabel.replace(/_/g, " ")}${modeSuffix}.`;
}

export function fileLibraryAvailabilityState(item: FileLibraryItem): FileLibraryAvailabilityState {
  if (fileLibraryHasRetainedFile(item)) {
    return {
      kind: "downloadable",
      label: "File retained",
      tone: "sky",
    };
  }
  if (fileLibraryRetentionMode(item) === "keep_extracted_only") {
    return {
      kind: "extracted_only",
      label: "Extracted notes",
      tone: "emerald",
    };
  }
  if (fileLibraryRetentionMode(item) === "keep_nothing") {
    return {
      kind: "session_only",
      label: "Session only",
      tone: "amber",
    };
  }
  return {
    kind: "unavailable",
    label: "Unavailable",
    tone: "slate",
  };
}

export function fileLibraryPrimaryAction(item: FileLibraryItem): FileLibraryPrimaryAction {
  if (fileLibraryAvailabilityState(item).kind === "downloadable") {
    return {
      kind: "download",
      label: "Open file",
      disabled: false,
    };
  }
  if (fileLibraryAvailabilityState(item).kind === "extracted_only") {
    return {
      kind: "thread",
      label: fileLibraryNotesTarget(item) ? "Open notes" : "Open thread",
      disabled: false,
    };
  }
  if (fileLibraryAvailabilityState(item).kind === "session_only") {
    return {
      kind: "unavailable",
      label: "Not retained",
      disabled: true,
    };
  }
  return {
    kind: "unavailable",
    label: "Unavailable",
    disabled: true,
  };
}

export function fileLibraryCardState(item: FileLibraryItem): FileLibraryCardState {
  const availability = fileLibraryAvailabilityState(item);
  const primaryAction = fileLibraryPrimaryAction(item);
  const studyReadiness = fileLibraryStudyReadiness(item);
  const noteTarget = fileLibraryNotesTarget(item);
  const sourceTarget = fileLibrarySourceTarget(item);
  let secondaryThreadLabel: FileLibraryCardState["secondaryThreadLabel"] = "Open thread";
  if (primaryAction.kind === "download" && noteTarget) {
    secondaryThreadLabel = "Open notes";
  } else if (primaryAction.kind === "thread" && primaryAction.label === "Open notes" && sourceTarget) {
    secondaryThreadLabel = "Open source";
  } else if (primaryAction.kind === "thread" && !sourceTarget) {
    secondaryThreadLabel = null;
  } else if (!sourceTarget) {
    secondaryThreadLabel = null;
  }
  return {
    availability,
    retentionLabel: fileLibraryRetentionLabel(item),
    retentionHint: fileLibraryRetentionHint(item),
    academicSummary: fileLibraryAcademicSummary(item),
    storageSummary: fileLibraryStorageSummary(item),
    provenanceSummary: fileLibraryProvenanceSummary(item),
    studyReadiness,
    studyReadinessLabel: fileLibraryStudyReadinessLabel(studyReadiness),
    studyReadinessSummary: fileLibraryStudyReadinessSummary(item),
    primaryAction,
    secondaryThreadLabel,
  };
}
