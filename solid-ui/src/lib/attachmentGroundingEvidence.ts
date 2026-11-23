// @locs-version: 1.0
import type {
  AfpMessage,
  AttachmentBatchIngestItem,
  AttachmentRetentionMode,
  KnowledgeOrganizationMode,
  AfpView,
  UiCommandResponse,
} from "./api";
import {
  attachmentRetentionOption,
  attachmentRetentionOutcome,
  combinedKnowledgePolicySummary,
  knowledgeModeOption,
} from "./knowledgeIngestPolicy";
import { normalizeCommandPreviewSourceLinks } from "./commandPreviewMessageState.js";
import { decryptedDisplayContent } from "./decryptedDisplayState";

export type AttachmentGroundingEvidence = {
  sourceCount: number;
  selectedFileCount: number;
  skippedFileCount: number;
  unreadableFileCount: number;
  sourceLabels: string[];
  footerLabel: string;
  coverageStatus: "complete" | "partial";
  coverageLabel: string;
  retentionMode: AttachmentRetentionMode;
  retentionLabel: string;
  knowledgeMode: KnowledgeOrganizationMode;
  knowledgeLabel: string;
  policyLabel: string;
  policyOutcome: string;
  cleanupStatus: "not_needed" | "pending" | "complete";
  cleanupLabel: string | null;
  sourceLinks: UiCommandResponse["links"];
  sourceDescriptors: {
    title: string;
    kindLabel: string;
    academicKind: string | null;
    academicSummary: string | null;
    courseTag: string | null;
    weekTag: string | null;
    lectureTag: string | null;
    chapterTag?: string | null;
    unitTag?: string | null;
    zettelkastenStage: string | null;
    zettelkastenEntryType?: string | null;
    zettelkastenNextAction?: string | null;
    knowledgeGraphGroupKey?: string | null;
    knowledgeGraphLinkTags?: string[];
  }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function labelForOutputType(outputType?: string | null): string {
  switch ((outputType ?? "").trim()) {
    case "parsed_document":
      return "Uploaded study source - parsed document";
    case "transcript":
      return "Uploaded study source - transcript";
    case "knowledge_card":
      return "Uploaded study source - knowledge card";
    default:
      return "Uploaded study source";
  }
}

function mergeUiCommandLinks(
  base: UiCommandResponse["links"],
  extra: UiCommandResponse["links"],
): UiCommandResponse["links"] {
  const merged: UiCommandResponse["links"] = [];
  const seen = new Set<string>();
  for (const link of [...base, ...extra]) {
    const key = `${link.url}::${link.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(link);
  }
  return merged;
}

function mergePreviewSourceLinks(
  existing: unknown,
  extra: Array<{ title: string; url: string; snippet: string; origin: string | null }>,
) {
  const base = Array.isArray(existing)
    ? existing.flatMap((item) => (
        isRecord(item) && typeof item.title === "string" && typeof item.url === "string"
          ? [{
              title: item.title,
              url: item.url,
              snippet: typeof item.snippet === "string" ? item.snippet : "",
              origin: typeof item.origin === "string" || item.origin === null ? item.origin : null,
            }]
          : []
      ))
    : [];
  const merged: typeof base = [];
  const seen = new Set<string>();
  for (const item of [...base, ...extra]) {
    const key = `${item.url}::${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function linksLengthFromContent(content: unknown): number {
  if (!isRecord(content) || !Array.isArray(content.sources)) return 0;
  return content.sources.length;
}

function retentionModeLabel(mode: AttachmentRetentionMode): string {
  return attachmentRetentionOption(mode).label;
}

function knowledgeModeLabel(mode: KnowledgeOrganizationMode): string {
  return knowledgeModeOption(mode).label;
}

function cleanupStatusLabel(
  retentionMode: AttachmentRetentionMode,
  cleanupStatus: AttachmentGroundingEvidence["cleanupStatus"],
): string | null {
  if (retentionMode !== "keep_nothing") return null;
  switch (cleanupStatus) {
    case "complete":
      return "Temporary copies deleted";
    case "pending":
      return "Temporary cleanup pending";
    default:
      return null;
  }
}

function retentionModePolicyLabel(
  retentionMode: AttachmentRetentionMode,
  knowledgeMode: KnowledgeOrganizationMode,
): string {
  return combinedKnowledgePolicySummary(knowledgeMode, retentionMode);
}

function itemString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function sourceDescriptorTitle(item: AttachmentBatchIngestItem): string {
  return itemString(item.file_name)
    ?? itemString(item.mime_type)
    ?? itemString(item.output_type)
    ?? "Uploaded source";
}

function buildSourceDescriptors(items: readonly AttachmentBatchIngestItem[]) {
  return items.map((item) => {
    const zettelkastenEntryType = itemString(item.zettelkasten_entry_type);
    const zettelkastenNextAction = itemString(item.zettelkasten_next_action);
    const knowledgeGraphGroupKey = itemString(item.knowledge_graph_group_key);
    const knowledgeGraphLinkTags = stringArray(item.knowledge_graph_link_tags);
    return {
      title: sourceDescriptorTitle(item),
      kindLabel: labelForOutputType(item.output_type),
      academicKind: itemString(item.academic_kind),
      academicSummary: itemString(item.academic_summary),
      courseTag: itemString(item.academic_course_tag),
      weekTag: itemString(item.academic_week_tag),
      lectureTag: itemString(item.academic_lecture_tag),
      chapterTag: itemString(item.academic_chapter_tag),
      unitTag: itemString(item.academic_unit_tag),
      zettelkastenStage: itemString(item.zettelkasten_stage),
      ...(zettelkastenEntryType ? { zettelkastenEntryType } : {}),
      ...(zettelkastenNextAction ? { zettelkastenNextAction } : {}),
      ...(knowledgeGraphGroupKey ? { knowledgeGraphGroupKey } : {}),
      ...(knowledgeGraphLinkTags.length > 0 ? { knowledgeGraphLinkTags } : {}),
    };
  });
}

function messageContentRecord(
  message: AfpMessage,
  view?: AfpView | null,
): Record<string, unknown> {
  if (view?.content && isRecord(view.content)) return view.content;
  return decryptedDisplayContent(message);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function parseAttachmentRetentionMode(value: unknown): AttachmentRetentionMode | null {
  return value === "keep_file" || value === "keep_extracted_only" || value === "keep_nothing"
    ? value
    : null;
}

function parseKnowledgeMode(value: unknown): KnowledgeOrganizationMode | null {
  return value === "standard" || value === "connected_notes" || value === "zettelkasten"
    ? value
    : null;
}

function descriptorArrayFromUnknown(
  value: unknown,
): AttachmentGroundingEvidence["sourceDescriptors"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const title = itemString(entry.title);
    if (!title) return [];
    const zettelkastenEntryType = itemString(entry.zettelkastenEntryType);
    const zettelkastenNextAction = itemString(entry.zettelkastenNextAction);
    const knowledgeGraphGroupKey = itemString(entry.knowledgeGraphGroupKey);
    const knowledgeGraphLinkTags = stringArray(entry.knowledgeGraphLinkTags);
    return [{
      title,
      kindLabel: itemString(entry.kindLabel) ?? "Uploaded study source",
      academicKind: itemString(entry.academicKind),
      academicSummary: itemString(entry.academicSummary),
      courseTag: itemString(entry.courseTag),
      weekTag: itemString(entry.weekTag),
      lectureTag: itemString(entry.lectureTag),
      chapterTag: itemString(entry.chapterTag) ?? itemString(entry.academic_chapter_tag),
      unitTag: itemString(entry.unitTag) ?? itemString(entry.academic_unit_tag),
      zettelkastenStage: itemString(entry.zettelkastenStage),
      ...(zettelkastenEntryType ? { zettelkastenEntryType } : {}),
      ...(zettelkastenNextAction ? { zettelkastenNextAction } : {}),
      ...(knowledgeGraphGroupKey ? { knowledgeGraphGroupKey } : {}),
      ...(knowledgeGraphLinkTags.length > 0 ? { knowledgeGraphLinkTags } : {}),
    }];
  });
}

export function buildAttachmentGroundingEvidence(
  items: readonly AttachmentBatchIngestItem[],
  options?: {
    selectedFileCount?: number;
    skippedFileCount?: number;
    unreadableFileCount?: number;
    retentionMode?: AttachmentRetentionMode;
    knowledgeMode?: KnowledgeOrganizationMode;
  },
): AttachmentGroundingEvidence | null {
  const ingested = items.filter((item) => item.ingested !== false);
  if (ingested.length === 0) return null;
  const selectedFileCount = Math.max(options?.selectedFileCount ?? ingested.length, ingested.length);
  const skippedFileCount = Math.max(options?.skippedFileCount ?? 0, 0);
  const unreadableFileCount = Math.max(options?.unreadableFileCount ?? 0, 0);
  const retentionMode = options?.retentionMode ?? "keep_extracted_only";
  const knowledgeMode = options?.knowledgeMode ?? "connected_notes";
  const cleanupStatus: AttachmentGroundingEvidence["cleanupStatus"] =
    retentionMode === "keep_nothing" ? "pending" : "not_needed";
  const unresolvedCount = skippedFileCount + unreadableFileCount;
  const coverageStatus = unresolvedCount > 0 ? "partial" : "complete";
  const sourceLinks = ingested.map((item) => ({
    title: item.file_name?.trim() || item.mime_type?.trim() || "Uploaded source",
    url: `afp://message/${item.output_message_id || item.source_message_id}`,
    kind: labelForOutputType(item.output_type),
    origin: "uploaded_source",
  }));
  const sourceLabels = ingested
    .map((item) => item.file_name?.trim() || item.mime_type?.trim() || "Uploaded source")
    .filter((label, index, all) => label.length > 0 && all.indexOf(label) === index);
  return {
    sourceCount: ingested.length,
    selectedFileCount,
    skippedFileCount,
    unreadableFileCount,
    sourceLabels,
    footerLabel: `Based on ${ingested.length} uploaded source${ingested.length === 1 ? "" : "s"}`,
    coverageStatus,
    coverageLabel:
      coverageStatus === "partial"
        ? `Coverage incomplete: used ${ingested.length} of ${selectedFileCount} file${selectedFileCount === 1 ? "" : "s"}`
        : `Coverage complete for ${selectedFileCount} uploaded file${selectedFileCount === 1 ? "" : "s"}`,
    retentionMode,
    retentionLabel: retentionModeLabel(retentionMode),
    knowledgeMode,
    knowledgeLabel: knowledgeModeLabel(knowledgeMode),
    policyLabel: retentionModePolicyLabel(retentionMode, knowledgeMode),
    policyOutcome: attachmentRetentionOutcome(retentionMode),
    cleanupStatus,
    cleanupLabel: cleanupStatusLabel(retentionMode, cleanupStatus),
    sourceLinks,
    sourceDescriptors: buildSourceDescriptors(ingested),
  };
}

export function deriveAttachmentGroundingEvidenceFromMessage(
  message: AfpMessage,
  view?: AfpView | null,
): AttachmentGroundingEvidence | null {
  const content = messageContentRecord(message, view);
  const metadata = isRecord(message.metadata) ? message.metadata : {};
  const sourceCount =
    typeof metadata.uploaded_source_count === "number" && Number.isFinite(metadata.uploaded_source_count)
      ? metadata.uploaded_source_count
      : 0;
  if (sourceCount <= 0) return null;

  const retentionMode =
    parseAttachmentRetentionMode(metadata.attachment_retention_mode)
    ?? parseAttachmentRetentionMode(content.attachment_retention_mode)
    ?? parseAttachmentRetentionMode(isRecord(content.attachment_policy) ? content.attachment_policy.retention_mode : undefined)
    ?? "keep_extracted_only";
  const knowledgeMode =
    parseKnowledgeMode(metadata.knowledge_organization_mode)
    ?? parseKnowledgeMode(content.knowledge_organization_mode)
    ?? parseKnowledgeMode(isRecord(content.attachment_policy) ? content.attachment_policy.knowledge_mode : undefined)
    ?? "connected_notes";
  const coverageStatus =
    metadata.source_coverage_status === "partial" ? "partial" : "complete";
  const cleanupStatus =
    metadata.attachment_cleanup_status === "pending"
      ? "pending"
      : metadata.attachment_cleanup_status === "complete"
        ? "complete"
        : "not_needed";
  const sourceDescriptors =
    descriptorArrayFromUnknown(content.uploaded_source_descriptors).length > 0
      ? descriptorArrayFromUnknown(content.uploaded_source_descriptors)
      : descriptorArrayFromUnknown(metadata.uploaded_source_descriptors);
  const sourceLabels = sourceDescriptors.length > 0
    ? sourceDescriptors.map((item) => item.title)
    : stringArray(metadata.source_labels);
  const sourceLinks = sourceLabels.map((title) => ({
    title,
    url: `afp://message/${message.id}`,
    kind: "Uploaded study source",
    origin: "uploaded_source" as const,
  }));

  return {
    sourceCount,
    selectedFileCount:
      typeof metadata.uploaded_source_selected_count === "number" && Number.isFinite(metadata.uploaded_source_selected_count)
        ? metadata.uploaded_source_selected_count
        : sourceCount,
    skippedFileCount:
      typeof metadata.uploaded_source_skipped_count === "number" && Number.isFinite(metadata.uploaded_source_skipped_count)
        ? metadata.uploaded_source_skipped_count
        : 0,
    unreadableFileCount:
      typeof metadata.uploaded_source_unreadable_count === "number" && Number.isFinite(metadata.uploaded_source_unreadable_count)
        ? metadata.uploaded_source_unreadable_count
        : 0,
    sourceLabels,
    footerLabel: itemString(metadata.grounding_label)
      ?? `Based on ${sourceCount} uploaded source${sourceCount === 1 ? "" : "s"}`,
    coverageStatus,
    coverageLabel:
      itemString(metadata.source_coverage_label)
      ?? `Coverage ${coverageStatus === "partial" ? "incomplete" : "complete"} for ${sourceCount} uploaded file${sourceCount === 1 ? "" : "s"}`,
    retentionMode,
    retentionLabel: itemString(metadata.attachment_retention_label) ?? retentionModeLabel(retentionMode),
    knowledgeMode,
    knowledgeLabel: itemString(metadata.knowledge_organization_label) ?? knowledgeModeLabel(knowledgeMode),
    policyLabel: itemString(metadata.attachment_policy_label) ?? retentionModePolicyLabel(retentionMode, knowledgeMode),
    policyOutcome: itemString(metadata.attachment_policy_outcome) ?? attachmentRetentionOutcome(retentionMode),
    cleanupStatus,
    cleanupLabel:
      itemString(metadata.attachment_cleanup_label)
      ?? cleanupStatusLabel(retentionMode, cleanupStatus),
    sourceLinks,
    sourceDescriptors,
  };
}

export function withAttachmentGroundingCleanupStatus(
  evidence: AttachmentGroundingEvidence | null,
  cleanupStatus: AttachmentGroundingEvidence["cleanupStatus"],
): AttachmentGroundingEvidence | null {
  if (!evidence) return null;
  return {
    ...evidence,
    cleanupStatus,
    cleanupLabel: cleanupStatusLabel(evidence.retentionMode, cleanupStatus),
  };
}

export function withAttachmentGroundingRetentionMode(
  evidence: AttachmentGroundingEvidence | null,
  retentionMode: AttachmentRetentionMode,
  cleanupStatus?: AttachmentGroundingEvidence["cleanupStatus"],
): AttachmentGroundingEvidence | null {
  if (!evidence) return null;
  const nextCleanupStatus = cleanupStatus ?? (retentionMode === "keep_nothing" ? "pending" : "not_needed");
  return {
    ...evidence,
    retentionMode,
    retentionLabel: retentionModeLabel(retentionMode),
    policyLabel: retentionModePolicyLabel(retentionMode, evidence.knowledgeMode),
    policyOutcome: attachmentRetentionOutcome(retentionMode),
    cleanupStatus: nextCleanupStatus,
    cleanupLabel: cleanupStatusLabel(retentionMode, nextCleanupStatus),
  };
}

export function enrichUiCommandResponseWithAttachmentGrounding(
  response: UiCommandResponse,
  evidence: AttachmentGroundingEvidence | null,
): UiCommandResponse {
  if (!evidence || evidence.sourceCount === 0) return response;
  return {
    ...response,
    links: mergeUiCommandLinks(response.links, evidence.sourceLinks),
    preview_message: response.preview_message
      ? decoratePreviewMessageWithAttachmentGrounding(response.preview_message, evidence)
      : response.preview_message,
  };
}

export function decoratePreviewMessageWithAttachmentGrounding(
  message: AfpMessage,
  evidence: AttachmentGroundingEvidence | null,
): AfpMessage {
  if (!evidence || evidence.sourceCount === 0) return message;
  if (message.encryption) return message;
  const previewSourceLinks = normalizeCommandPreviewSourceLinks(evidence.sourceLinks).map((link) => ({
    ...link,
    origin: link.origin ?? null,
  }));
  const content = isRecord(message.content)
    ? {
        ...message.content,
        sources: mergePreviewSourceLinks(message.content.sources, previewSourceLinks),
        attachment_policy: {
          retention_mode: evidence.retentionMode,
          retention_label: evidence.retentionLabel,
          knowledge_mode: evidence.knowledgeMode,
          knowledge_label: evidence.knowledgeLabel,
          policy_label: evidence.policyLabel,
          policy_outcome: evidence.policyOutcome,
          cleanup_status: evidence.cleanupStatus,
          cleanup_label: evidence.cleanupLabel,
        },
        uploaded_source_descriptors: evidence.sourceDescriptors,
      }
    : message.content;
  const views = message.views.map((view) => {
    if (view.format === "search_result" && isRecord(view.content)) {
      return {
        ...view,
        content: {
          ...view.content,
          sources: mergePreviewSourceLinks(view.content.sources, previewSourceLinks),
        },
      };
    }
    if (
      view.format === "a2ui.v1"
      && isRecord(view.content)
      && view.content.kind === "panel"
      && Array.isArray(view.content.nodes)
    ) {
      const nodes = view.content.nodes.filter((node) => !isRecord(node) || node.id !== "uploaded-study-sources");
      nodes.push({
        id: "uploaded-study-sources",
        type: "link_list",
        props: {
          title: `Uploaded sources (${evidence.sourceCount})`,
          items: previewSourceLinks.map((link) => ({
            title: link.title,
            url: link.url,
            subtitle: link.snippet,
          })),
        },
      });
      nodes.push({
        id: "uploaded-study-source-map",
        type: "table",
        props: {
          columns: ["Source", "Type", "Classification"],
          rows: evidence.sourceDescriptors.map((descriptor) => [
            descriptor.title,
            descriptor.kindLabel.replace("Uploaded study source - ", ""),
              descriptor.zettelkastenNextAction
                ?? descriptor.academicSummary
                ?? descriptor.knowledgeGraphGroupKey
                ?? descriptor.courseTag
                ?? descriptor.chapterTag
                ?? descriptor.unitTag
                ?? descriptor.weekTag
                ?? descriptor.lectureTag
                ?? "Classified after extraction",
          ]),
          caption: "Uploaded study sources",
        },
      });
      return {
        ...view,
        content: {
          ...view.content,
          uploaded_source_descriptors: evidence.sourceDescriptors,
          nodes,
        },
      };
    }
    return view;
  });
  return {
    ...message,
    content,
    metadata: {
      ...(isRecord(message.metadata) ? message.metadata : {}),
      source_count: linksLengthFromContent(content),
      uploaded_source_count: evidence.sourceCount,
      uploaded_source_selected_count: evidence.selectedFileCount,
      uploaded_source_skipped_count: evidence.skippedFileCount,
      uploaded_source_unreadable_count: evidence.unreadableFileCount,
      grounding_label: evidence.footerLabel,
      source_coverage_status: evidence.coverageStatus,
      source_coverage_label: evidence.coverageLabel,
      attachment_retention_mode: evidence.retentionMode,
      attachment_retention_label: evidence.retentionLabel,
      knowledge_organization_mode: evidence.knowledgeMode,
      knowledge_organization_label: evidence.knowledgeLabel,
      attachment_policy_label: evidence.policyLabel,
      attachment_policy_outcome: evidence.policyOutcome,
      attachment_cleanup_status: evidence.cleanupStatus,
      attachment_cleanup_label: evidence.cleanupLabel,
      uploaded_source_descriptors: evidence.sourceDescriptors,
    },
    views,
  };
}
