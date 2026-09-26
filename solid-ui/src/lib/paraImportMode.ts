// @locs-version: 1.0
import type {
  AttachmentRetentionMode,
  KnowledgeOrganizationMode,
  ParaSectionKind,
} from "@/lib/api";

export type ParaResourceLens = "all" | "connected_notes" | "zettelkasten" | "review_queue" | "permanent_notes" | "reference";

export function normalizeParaImportLabel(rawLabel: string): string {
  const normalized = rawLabel
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[\s_]+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toLowerCase()
    .trim();
  return normalized.replace(/^_+|_+$/g, "") || "imported_item";
}

export function paraResourceKnowledgeTag(
  knowledgeMode: KnowledgeOrganizationMode,
): string {
  switch (knowledgeMode) {
    case "zettelkasten":
      return "resource:zettelkasten";
    case "connected_notes":
      return "resource:connected_notes";
    default:
      return "resource:reference";
  }
}

export function buildParaImportClassificationTags(
  targetSection: Exclude<ParaSectionKind, "archive">,
  rawLabel: string,
  knowledgeMode: KnowledgeOrganizationMode,
): string[] {
  const tags = new Set<string>([
    `${targetSection}:${normalizeParaImportLabel(rawLabel)}`,
  ]);
  if (targetSection === "resource") {
    tags.add(paraResourceKnowledgeTag(knowledgeMode));
    if (knowledgeMode === "zettelkasten") {
      tags.add("zk:source_note");
      tags.add("zk:review_pending");
    }
  }
  return [...tags];
}

export function formatParaImportKnowledgeModeLabel(
  knowledgeMode: KnowledgeOrganizationMode,
): string {
  switch (knowledgeMode) {
    case "zettelkasten":
      return "Zettelkasten";
    case "standard":
      return "Standard";
    default:
      return "Connected notes";
  }
}

export function formatParaImportRetentionModeLabel(
  retentionMode: AttachmentRetentionMode,
): string {
  switch (retentionMode) {
    case "keep_file":
      return "Keep file";
    case "keep_nothing":
      return "Keep nothing";
    default:
      return "Keep extracted only";
  }
}

export function paraTagsMatchResourceLens(
  tags: readonly string[],
  lens: ParaResourceLens,
): boolean {
  if (lens === "all") return true;
  const tagSet = new Set(tags);
  switch (lens) {
    case "connected_notes":
      return tagSet.has("resource:connected_notes");
    case "zettelkasten":
      return tagSet.has("resource:zettelkasten");
    case "review_queue":
      return tagSet.has("zk:review_pending");
    case "permanent_notes":
      return tagSet.has("zk:permanent_note");
    case "reference":
      return tagSet.has("resource:reference");
  }
}

export function paraTagsIncludeReviewPending(tags: readonly string[]): boolean {
  return new Set(tags).has("zk:review_pending");
}

export function paraTagsIncludeSourceNote(tags: readonly string[]): boolean {
  return new Set(tags).has("zk:source_note");
}

export function paraTagsIncludePermanentNote(tags: readonly string[]): boolean {
  return new Set(tags).has("zk:permanent_note");
}
