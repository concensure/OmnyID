// @locs-version: 1.0
import type {
  AfpMessage,
  AreaRulesPayload,
  FolderRulePayload,
} from "@/lib/api";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent, decryptedDisplayLabel } from "@/lib/decryptedDisplayState";
import type { Area, Folder, Note } from "@/lib/noteDomain";

export type NoteTagUpdate = {
  updateId: string;
  sourceId: string;
  timestamp: string;
  removeTags: string[];
  addTags: string[];
  removeSupertags: string[];
  addSupertags: string[];
};

export function noteStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

export function notePreviewFromBody(body: string): string {
  const compact = body.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
}

export function noteFromAfpMessage(message: AfpMessage): Partial<Note> {
  const content = afpRecord(decryptedDisplayContent(message));
  const body =
    typeof content.body === "string"
      ? content.body
      : typeof content.summary === "string"
        ? content.summary
        : "";
  const preview = notePreviewFromBody(body);
  return {
    threadId: message.thread_id,
    messageId: message.id,
    title: typeof content.title === "string" ? content.title : decryptedDisplayLabel(message) ?? message.id.slice(0, 16),
    preview,
    summary: typeof content.summary === "string" ? content.summary : preview,
    blocks: body ? [{ type: "paragraph", text: body }] : [],
    tags: noteStringArray(content.tags),
    supertags: noteStringArray(content.supertags),
    folderId: typeof content.folder_id === "string" ? content.folder_id : undefined,
    areaId: typeof content.area_id === "string" ? content.area_id : undefined,
    updatedAt: message.timestamp,
    createdAt: message.timestamp,
  };
}

export function folderFromRuleMessage(message: AfpMessage): Folder | null {
  const content = afpRecord(decryptedDisplayContent(message));
  const folderId = typeof content.folder_id === "string" ? content.folder_id : "";
  if (!folderId) return null;
  return {
    id: folderId,
    name: folderId.charAt(0).toUpperCase() + folderId.slice(1),
    areaId: typeof content.area_id === "string" ? content.area_id : undefined,
    rule: {
      folder_id: folderId,
      summary_style: typeof content.summary_style === "string" ? content.summary_style : undefined,
      backlink_rules: typeof content.backlink_rules === "string" ? content.backlink_rules : undefined,
      tag_suggestions: noteStringArray(content.tag_suggestions),
    } satisfies FolderRulePayload,
  };
}

export function areaFromRuleMessage(message: AfpMessage): Area | null {
  const content = afpRecord(decryptedDisplayContent(message));
  const areaName = typeof content.area === "string" ? content.area : "";
  if (!areaName) return null;
  return {
    id: areaName,
    rules: {
      area: areaName,
      summary_style: typeof content.summary_style === "string" ? content.summary_style : undefined,
      backlink_rules: typeof content.backlink_rules === "string" ? content.backlink_rules : undefined,
      tag_suggestions: noteStringArray(content.tag_suggestions),
    } satisfies AreaRulesPayload,
  };
}

export function noteTagUpdateFromMessage(message: AfpMessage): NoteTagUpdate {
  const content = afpRecord(decryptedDisplayContent(message));
  const reference = afpRecord((message.references ?? [])[0]);
  return {
    updateId: message.id,
    sourceId: typeof reference.id === "string" ? reference.id : "",
    timestamp: message.timestamp,
    removeTags: noteStringArray(content.remove_tags),
    addTags: noteStringArray(content.add_tags),
    removeSupertags: noteStringArray(content.remove_supertags),
    addSupertags: noteStringArray(content.add_supertags),
  };
}

export function resolveNoteTags(note: Note, allUpdates: NoteTagUpdate[]): { tags: string[]; supertags: string[] } {
  const deltas = allUpdates
    .filter((update) => update.sourceId === note.id)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  let tags = [...note.tags];
  let supertags = [...note.supertags];
  for (const delta of deltas) {
    tags = tags.filter((tag) => !delta.removeTags.includes(tag));
    for (const tag of delta.addTags) {
      if (!tags.includes(tag)) tags.push(tag);
    }
    supertags = supertags.filter((tag) => !delta.removeSupertags.includes(tag));
    for (const tag of delta.addSupertags) {
      if (!supertags.includes(tag)) supertags.push(tag);
    }
  }
  return { tags, supertags };
}

export function afpNoteFromMessage(message: AfpMessage): Note {
  const content = afpRecord(decryptedDisplayContent(message));
  const placeholder = decryptedDisplayLabel(message);
  return {
    id: message.id,
    threadId: message.thread_id,
    messageId: message.id,
    title: typeof content.title === "string" ? content.title : placeholder ?? message.id.slice(0, 16),
    preview: typeof content.summary === "string" ? content.summary : "",
    blocks: [],
    summary: typeof content.summary === "string" ? content.summary : "",
    tags: noteStringArray(content.tags),
    supertags: noteStringArray(content.supertags),
    backlinks: [],
    updatedAt: message.timestamp,
    createdAt: message.timestamp,
    folderId: typeof content.folder_id === "string" ? content.folder_id : undefined,
    areaId: typeof content.area_id === "string" ? content.area_id : undefined,
    metadata: {},
  };
}
