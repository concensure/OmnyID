// @locs-version: 1.0
import type { AfpMessage, AfpReference, SendAfpMessageInput } from "@/lib/api";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import type {
  WeddingSemanticUiKind,
  WeddingSemanticUiObject,
} from "@/lib/weddingSemanticUiState";
import { weddingSemanticUiObjectFromUnknown } from "@/lib/weddingSemanticUiState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";
import { buildWeddingExperienceModelState } from "@/lib/weddingExperienceModelState";

export type WeddingInspirationSourceKind =
  | "image"
  | "screenshot"
  | "url"
  | "pdf"
  | "email"
  | "thought"
  | "voice_note";

export type WeddingInspirationItem = {
  id: string;
  title: string;
  kind: WeddingInspirationSourceKind;
  createdAt: string;
  uploadedBy: string | null;
  previewUrl: string | null;
  sourceUrl: string | null;
  note: string | null;
  tags: string[];
  preferenceSignals: string[];
  ontologyLinks: Array<{ type: string; target: string; label: string }>;
  storageRef: string | null;
  semanticKind?: WeddingSemanticUiKind | null;
  semanticTags?: string[];
  semanticObject?: WeddingSemanticUiObject | null;
};

export type WeddingInspirationInsight = {
  title: string;
  detail: string;
  evidenceLabels: string[];
};

export type WeddingInspirationState = {
  items: WeddingInspirationItem[];
  tagCounts: Array<{ tag: string; count: number }>;
  insight: WeddingInspirationInsight | null;
  originalFileCount: number;
  savedOriginalFileCount: number;
  unsavedOriginalFileCount: number;
  originalFileStatusLabel: string;
  emptyLabel: string;
};

export type WeddingInspirationDraftInput = {
  title?: string | null;
  kind?: WeddingInspirationSourceKind | null;
  fileName?: string | null;
  mimeType?: string | null;
  previewUrl?: string | null;
  sourceUrl?: string | null;
  note?: string | null;
  uploadedBy?: string | null;
  storageRef?: string | null;
  createdAt?: string | null;
};

export type WeddingInspirationTaskItemsInput = {
  inspiration?: WeddingInspirationState | null;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
  metadata?: unknown;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 80): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? uniqueStrings(value) : [];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function taskRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeUrl(value: unknown): string | null {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "data:" ? raw : null;
  } catch {
    return null;
  }
}

function durablePreviewUrl(value: unknown): string | null {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

function webUrl(value: unknown): string | null {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

function inferKind(input: WeddingInspirationDraftInput): WeddingInspirationSourceKind {
  if (input.kind) return input.kind;
  const text = `${input.fileName ?? ""} ${input.mimeType ?? ""} ${input.sourceUrl ?? ""}`.toLowerCase();
  if (text.includes("screenshot")) return "screenshot";
  if (text.includes("pdf")) return "pdf";
  if (text.includes("email")) return "email";
  if (text.includes("audio") || text.includes("voice")) return "voice_note";
  if (text.includes("image") || /\.(png|jpe?g|webp|gif|heic)\b/i.test(text)) return "image";
  if (input.sourceUrl) return "url";
  return "thought";
}

const TAG_RULES: Array<{ tag: string; signal: string; targets: string[]; patterns: RegExp[] }> = [
  { tag: "reception", signal: "reception mood", targets: ["Reception"], patterns: [/\breception\b/i, /\bdinner\b/i] },
  { tag: "long table", signal: "communal table style", targets: ["Reception"], patterns: [/\blong[- ]?table\b/i, /\bcommunal\b/i, /\bbanquet\b/i] },
  { tag: "warm lighting", signal: "warm intimate lighting", targets: ["WeddingExperience"], patterns: [/\bwarm\b/i, /\blighting\b/i, /\bcandle/i, /\blantern/i, /\bfairy light/i] },
  { tag: "candles", signal: "candlelit atmosphere", targets: ["Reception"], patterns: [/\bcandle/i] },
  { tag: "low florals", signal: "restrained floral style", targets: ["FlowersDecor"], patterns: [/\blow floral/i, /\blow arrangement/i, /\brestrained floral/i, /\bminimal flower/i] },
  { tag: "informal", signal: "relaxed atmosphere", targets: ["WeddingExperience"], patterns: [/\binformal\b/i, /\brelaxed\b/i, /\bcasual\b/i] },
  { tag: "venue", signal: "venue look", targets: ["Venue"], patterns: [/\bvenue\b/i, /\bhall\b/i, /\bgarden\b/i, /\bbarn\b/i] },
  { tag: "dress", signal: "attire preference", targets: ["AttireBeauty"], patterns: [/\bdress\b/i, /\bgown\b/i, /\bveil\b/i] },
  { tag: "vendor portfolio", signal: "vendor style evidence", targets: ["VendorShortlist"], patterns: [/\bportfolio\b/i, /\bvendor\b/i, /\bphotographer\b/i, /\bflorist\b/i] },
  { tag: "pinterest", signal: "saved inspiration", targets: ["WeddingExperience"], patterns: [/\bpinterest\b/i, /\bpin\b/i] },
];

function inferTags(input: WeddingInspirationDraftInput): string[] {
  const text = [input.title, input.fileName, input.sourceUrl, input.note].map(clean).join(" ");
  const tags = TAG_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(text)))
    .map((rule) => rule.tag);
  if ((input.mimeType ?? "").toLowerCase().startsWith("image/")) tags.push("image");
  if (input.sourceUrl) tags.push("link");
  return uniqueStrings(tags.length > 0 ? tags : ["inspiration"]);
}

function ontologyLinks(tags: readonly string[]): WeddingInspirationItem["ontologyLinks"] {
  const links: WeddingInspirationItem["ontologyLinks"] = [];
  for (const tag of tags) {
    const rule = TAG_RULES.find((item) => item.tag === tag);
    for (const target of rule?.targets ?? ["WeddingExperience"]) {
      links.push({ type: "inspires", target, label: `${tag} inspires ${target}` });
    }
  }
  return links.slice(0, 12);
}

function isOriginalFileBacked(item: WeddingInspirationItem): boolean {
  return item.kind === "image" || item.kind === "screenshot" || item.kind === "pdf" || item.kind === "voice_note";
}

function semanticObjectForInspirationItem(input: {
  id: string;
  title: string;
  tags: readonly string[];
  preferenceSignals: readonly string[];
}): WeddingSemanticUiObject {
  return {
    id: `semantic:${input.id}`,
    kind: "wedding_active_loop",
    title: input.title,
    stateLabel: "Preference evidence saved",
    tone: "status",
    summary: input.preferenceSignals.length > 0
      ? input.preferenceSignals.slice(0, 3).join(", ")
      : input.tags.slice(0, 3).join(", ") || "Inspiration saved for the wedding.",
    actions: [{
      label: "Open Inspiration",
      kind: "open_wedding_menu",
      enabled: true,
      targetMenu: "inspiration",
    }],
    semanticTags: uniqueStrings([
      "wedding_active_loop",
      "wedding_inspiration",
      "wedding_preference_evidence",
      ...input.tags.map((tag) => `inspiration:${safeWeddingLabel(tag)}`),
    ], 20),
  };
}

export function buildWeddingInspirationItem(input: WeddingInspirationDraftInput): WeddingInspirationItem {
  const kind = inferKind(input);
  const createdAt = clean(input.createdAt) || new Date().toISOString();
  const title = clean(input.title) || clean(input.fileName) || (kind === "thought" ? "Wedding thought" : "Wedding inspiration");
  const tags = inferTags({ ...input, kind, title });
  const signals = uniqueStrings(tags.map((tag) => TAG_RULES.find((rule) => rule.tag === tag)?.signal ?? tag));
  const id = `wedding_inspiration:${safeWeddingLabel([title, createdAt].join(":")).slice(0, 120)}`;
  const semanticObject = semanticObjectForInspirationItem({
    id,
    title,
    tags,
    preferenceSignals: signals,
  });
  return {
    id,
    title,
    kind,
    createdAt,
    uploadedBy: clean(input.uploadedBy) || null,
    previewUrl: safeUrl(input.previewUrl),
    sourceUrl: webUrl(input.sourceUrl),
    note: clean(input.note) || null,
    tags,
    preferenceSignals: signals,
    ontologyLinks: ontologyLinks(tags),
    storageRef: clean(input.storageRef) || null,
    semanticKind: semanticObject.kind,
    semanticTags: semanticObject.semanticTags,
    semanticObject,
  };
}

function itemFromValue(value: unknown): WeddingInspirationItem | null {
  const source = record(value);
  if (!source) return null;
  const title = clean(source.title);
  if (!title) return null;
  const item = buildWeddingInspirationItem({
    title,
    kind: clean(source.kind) as WeddingInspirationSourceKind,
    previewUrl: clean(source.preview_url),
    sourceUrl: clean(source.source_url),
    note: clean(source.note),
    uploadedBy: clean(source.uploaded_by),
    storageRef: clean(source.storage_ref),
    createdAt: clean(source.created_at),
  });
  return {
    ...item,
    id: clean(source.id) || item.id,
    tags: stringArray(source.tags).length > 0 ? stringArray(source.tags) : item.tags,
    preferenceSignals: stringArray(source.preference_signals).length > 0 ? stringArray(source.preference_signals) : item.preferenceSignals,
    ontologyLinks: Array.isArray(source.ontology_links)
      ? source.ontology_links.map((link) => {
        const row = record(link);
        if (!row) return null;
        const type = clean(row.type);
        const target = clean(row.target);
        if (!type || !target) return null;
        return { type, target, label: clean(row.label) || `${type} ${target}` };
      }).filter((link): link is WeddingInspirationItem["ontologyLinks"][number] => link !== null)
      : item.ontologyLinks,
    semanticKind: weddingSemanticUiObjectFromUnknown(source.semantic_object)?.kind ?? item.semanticKind,
    semanticTags: weddingSemanticUiObjectFromUnknown(source.semantic_object)?.semanticTags ?? item.semanticTags,
    semanticObject: weddingSemanticUiObjectFromUnknown(source.semantic_object) ?? item.semanticObject,
  };
}

export function buildWeddingInspirationState(items: readonly WeddingInspirationItem[] | null | undefined): WeddingInspirationState {
  const deduped = new Map<string, WeddingInspirationItem>();
  for (const item of items ?? []) deduped.set(item.id, item);
  const sorted = [...deduped.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const counts = new Map<string, number>();
  for (const tag of sorted.flatMap((item) => item.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const tagCounts = [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
  const strongest = tagCounts.filter((entry) => entry.count >= Math.max(2, Math.ceil(sorted.length * 0.25))).slice(0, 4);
  const originalFileCount = sorted.filter(isOriginalFileBacked).length;
  const savedOriginalFileCount = sorted.filter((item) => isOriginalFileBacked(item) && Boolean(item.storageRef)).length;
  const unsavedOriginalFileCount = Math.max(0, originalFileCount - savedOriginalFileCount);
  const insight = strongest.length > 0 ? {
    title: "Something OmnyID noticed",
    detail: `${strongest.map((entry) => entry.tag).join(", ")} show up often in what you saved. This can guide venue, decor, photography, and budget choices.`,
    evidenceLabels: strongest.map((entry) => `${entry.count} item${entry.count === 1 ? "" : "s"} mention ${entry.tag}`),
  } : null;
  return {
    items: sorted,
    tagCounts,
    insight,
    originalFileCount,
    savedOriginalFileCount,
    unsavedOriginalFileCount,
    originalFileStatusLabel: originalFileCount === 0
      ? "No original files added yet."
      : unsavedOriginalFileCount === 0
        ? `${savedOriginalFileCount} original file${savedOriginalFileCount === 1 ? "" : "s"} saved for later.`
        : `${unsavedOriginalFileCount} original file${unsavedOriginalFileCount === 1 ? "" : "s"} still need${unsavedOriginalFileCount === 1 ? "s" : ""} to be saved so you can reopen them later.`,
    emptyLabel: "Add photos, screenshots, links, notes, PDFs, emails, or voice notes. OmnyID will organize what it can.",
  };
}

function existingInspirationTaskKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const metadata = taskRecord(item.metadata);
    if (metadata.wedding_inspiration_task === true) keys.add(clean(metadata.inspiration_task_key) || "inspiration");
  }
  return keys;
}

export function buildWeddingInspirationTaskItems(input: WeddingInspirationTaskItemsInput): WeddingPlanningTaskItem[] {
  const inspiration = input.inspiration;
  if (!inspiration) return [];
  const metadata: WeddingPlanningMetadata = normalizeWeddingPlanningMetadata(input.metadata);
  const existingKeys = existingInspirationTaskKeys(input.existingTaskItems ?? []);
  const tasks: WeddingPlanningTaskItem[] = [];
  const storageTaskKey = `wedding_inspiration_originals:${safeWeddingLabel(metadata.responseWorkspaceId)}`;
  if (inspiration.unsavedOriginalFileCount > 0 && !existingKeys.has(storageTaskKey) && !existingKeys.has("inspiration_originals")) {
    tasks.push({
      id: `wedding_task:${safeWeddingLabel(storageTaskKey)}`,
      title: "Save inspiration originals for later",
      kind: "document_checklist",
      dueLabel: "Before using these images with vendors",
      priority: "normal",
      source: "agent",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        ...metadata,
        wedding_task_kind: "document_checklist",
        wedding_inspiration_task: true,
        inspiration_task_key: storageTaskKey,
        inspiration_original_file_task: true,
        unsaved_original_file_count: inspiration.unsavedOriginalFileCount,
        preferred_action_label: "Open Inspiration",
        wedding_workspace_menu: "inspiration",
        a2ui_primary_action: "open_wedding_inspiration",
        topology_scope: "wedding_preference_graph",
        searchable_terms: uniqueStrings([
          "wedding inspiration",
          "save inspiration originals",
          "photo upload",
          "wedding memories",
          metadata.weddingPlanId,
          metadata.responseWorkspaceId,
        ]),
      },
      notes: `${inspiration.unsavedOriginalFileCount} inspiration original file${inspiration.unsavedOriginalFileCount === 1 ? "" : "s"} need durable storage so the couple can reopen the source image or document later.`,
    });
  }
  if (!inspiration.insight || inspiration.items.length < 2) return tasks;
  const topTags = inspiration.tagCounts.slice(0, 4).map((entry) => entry.tag);
  const taskKey = `wedding_inspiration_review:${safeWeddingLabel(topTags.join("-") || "style")}:${safeWeddingLabel(metadata.responseWorkspaceId)}`;
  if (existingKeys.has(taskKey) || existingKeys.has("inspiration_style_review")) return tasks;
  tasks.push({
    id: `wedding_task:${safeWeddingLabel(taskKey)}`,
    title: "Turn saved inspiration into wedding style decisions",
    kind: "decision",
    dueLabel: "Before booking decor, venue styling, or photographer",
    priority: "normal",
    source: "agent",
    reviewStatus: "accepted",
    approvalState: "draft",
    metadata: {
      ...metadata,
      wedding_task_kind: "decision",
      wedding_inspiration_task: true,
      inspiration_task_key: taskKey,
      inspiration_tags: topTags,
      inspiration_item_count: inspiration.items.length,
      preferred_action_label: "Open Inspiration",
      wedding_workspace_menu: "inspiration",
      a2ui_primary_action: "open_wedding_inspiration",
      decisionos_scope: "wedding_style",
      topology_scope: "wedding_preference_graph",
      searchable_terms: uniqueStrings([
        "wedding inspiration",
        "open inspiration",
        "style decisions",
        "venue styling",
        "decor",
        "photography",
        ...topTags,
        metadata.weddingPlanId,
        metadata.responseWorkspaceId,
      ]),
    },
    notes: `Use the saved inspiration pattern (${topTags.join(", ")}) to decide what this should affect: venue look, decor, lighting, photography, attire, or budget.`,
  });
  return tasks;
}

function afpRef(type: string, target: unknown, label: string, metadata?: Record<string, unknown>): AfpReference | null {
  const cleanTarget = clean(target);
  if (!cleanTarget) return null;
  return { type, target: cleanTarget, label, ...(metadata ? { metadata } : {}) };
}

export function weddingInspirationItemsToAfpMessage(input: {
  items: readonly WeddingInspirationItem[];
  metadata?: unknown;
  createdAt?: string;
}): AfpMessage {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const timestamp = input.createdAt ?? new Date().toISOString();
  const state = buildWeddingInspirationState(input.items);
  const experienceModel = buildWeddingExperienceModelState(state);
  const references = [
    afpRef("wedding_plan", metadata.weddingPlanId, "Wedding plan"),
    afpRef("response_workspace", metadata.responseWorkspaceId, "Wedding workspace"),
    ...state.items.flatMap((item) => item.ontologyLinks.map((link) => afpRef(link.type, link.target, link.label, {
      inspiration_item_id: item.id,
      tags: item.tags,
    }))),
  ].filter((item): item is AfpReference => item !== null);

  return {
    id: `afp-wedding-inspiration-${safeWeddingLabel(metadata.responseWorkspaceId)}-${Date.parse(timestamp) || 0}`,
    thread_id: `wedding_inspiration:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    from: "system://wedding-planning",
    to: ["agent://wedding-planning", "agent://knowledge-graph", "agent://topology", "agent://decision-queue"],
    timestamp,
    type: "ledger",
    kind: "wedding_inspiration",
    subtype: "wedding_inspiration",
    supertags: uniqueStrings([
      ...metadata.supertags,
      "wedding_inspiration",
      "wedding_inspiration:preference_model",
      "topology:wedding_preference_graph",
      "decisionos:wedding_style",
      `wedding_plan:${safeWeddingLabel(metadata.weddingPlanId)}`,
      `response_workspace:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    ]),
    content: {
      ledger_kind: "wedding_inspiration",
      created_at: timestamp,
      item_count: state.items.length,
      items: state.items.map((item) => ({
        id: item.id,
        title: item.title,
        kind: item.kind,
        created_at: item.createdAt,
        uploaded_by: item.uploadedBy,
        preview_url: durablePreviewUrl(item.previewUrl),
        source_url: item.sourceUrl,
        note: item.note,
        tags: item.tags,
        preference_signals: item.preferenceSignals,
        ontology_links: item.ontologyLinks,
        storage_ref: item.storageRef,
        semantic_object: item.semanticObject,
      })),
      semantic_objects: state.items.flatMap((item) => item.semanticObject ? [item.semanticObject] : []),
      preference_tags: state.tagCounts,
      insight: state.insight,
      original_file_status: {
        original_file_count: state.originalFileCount,
        saved_original_file_count: state.savedOriginalFileCount,
        unsaved_original_file_count: state.unsavedOriginalFileCount,
        label: state.originalFileStatusLabel,
      },
      experience_model: {
        title: experienceModel.title,
        summary: experienceModel.summaryLabel,
        confidence: experienceModel.confidenceLabel,
        traits: experienceModel.traits.map((trait) => ({
          id: trait.id,
          kind: trait.kind,
          label: trait.label,
          plain_meaning: trait.plainMeaning,
          confidence: trait.confidence,
          evidence_labels: trait.evidenceLabels,
          source_item_ids: trait.sourceItemIds,
        })),
        recommendation_constraints: experienceModel.recommendationConstraints,
      },
      markdown: [
        "# Wedding inspiration",
        "",
        state.insight?.detail ?? "Inspiration saved for this wedding.",
        "",
        experienceModel.traits.length > 0 ? `Experience model: ${experienceModel.traits.slice(0, 4).map((trait) => trait.label).join(", ")}.` : "Experience model: waiting for more evidence.",
      ].join("\n"),
    },
    metadata: {
      ...metadata,
      wedding_inspiration: true,
      wedding_experience_model: true,
      inspiration_item_count: state.items.length,
      inspiration_original_file_count: state.originalFileCount,
      inspiration_unsaved_original_file_count: state.unsavedOriginalFileCount,
      inspiration_original_storage_ready: state.unsavedOriginalFileCount === 0,
      semantic_objects: state.items.flatMap((item) => item.semanticObject ? [item.semanticObject] : []),
      e2ee_required: true,
      searchable_terms: uniqueStrings([
        "wedding inspiration",
        "wedding memories",
        "wedding experience model",
        ...experienceModel.traits.map((trait) => trait.label),
        ...state.tagCounts.map((entry) => entry.tag),
        metadata.weddingPlanId,
        metadata.responseWorkspaceId,
      ]),
    },
    views: [{
      format: "a2ui",
      content: {
        kind: "wedding_inspiration",
        title: "Wedding inspiration saved",
        summary: experienceModel.traits.length > 0 ? experienceModel.summaryLabel : state.insight?.detail ?? `${state.items.length} inspiration item${state.items.length === 1 ? "" : "s"} saved.`,
        primary_action: "Open Inspiration",
        semantic_objects: state.items.flatMap((item) => item.semanticObject ? [item.semanticObject] : []),
        experience_model: {
          confidence: experienceModel.confidenceLabel,
          traits: experienceModel.traits.slice(0, 4).map((trait) => trait.label),
        },
        badges: state.tagCounts.slice(0, 4).map((entry) => `${entry.tag}: ${entry.count}`),
      },
    }],
    attachments: [],
    references,
  };
}

export function weddingInspirationItemsToAfpSendInput(input: {
  items: readonly WeddingInspirationItem[];
  metadata?: unknown;
  createdAt?: string;
}): SendAfpMessageInput {
  const message = weddingInspirationItemsToAfpMessage(input);
  return {
    thread_id: message.thread_id,
    from: message.from,
    to: message.to ?? [],
    timestamp: message.timestamp,
    type: message.type,
    kind: message.kind,
    subtype: message.subtype ?? undefined,
    content: message.content,
    views: message.views,
    attachments: message.attachments,
    references: message.references,
    supertags: message.supertags ?? [],
    metadata: message.metadata,
    store_in_relational: true,
  };
}

export function weddingInspirationItemsFromAfpMessage(message: AfpMessage): WeddingInspirationItem[] {
  if (message.subtype !== "wedding_inspiration" && message.kind !== "wedding_inspiration") return [];
  const content = record(message.content) ?? {};
  return Array.isArray(content.items)
    ? content.items.map(itemFromValue).filter((item): item is WeddingInspirationItem => item !== null)
    : [];
}
