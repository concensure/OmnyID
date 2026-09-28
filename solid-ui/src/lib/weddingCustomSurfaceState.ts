// @locs-version: 1.0
import type { AfpMessage, AfpReference, SendAfpMessageInput } from "@/lib/api";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";
import {
  isWeddingWorkspaceMenuId,
  type WeddingWorkspaceMenuId,
} from "@/lib/weddingWorkspaceMenuState";

export type WeddingCustomSurfaceItemKind = "image" | "text";
export type WeddingCustomSurfaceAction = "upsert" | "remove" | "reorder";

export type WeddingCustomSurfaceItem = {
  id: string;
  menu: WeddingWorkspaceMenuId;
  kind: WeddingCustomSurfaceItemKind;
  title: string;
  body: string;
  imageUrl: string | null;
  storageRef?: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export function weddingCustomSurfaceItemsForMenu(
  items: readonly WeddingCustomSurfaceItem[],
  menu: WeddingWorkspaceMenuId,
): WeddingCustomSurfaceItem[] {
  return items
    .filter((item) => item.menu === menu)
    .slice()
    .sort((left, right) => left.order - right.order || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

export function reorderWeddingCustomSurfaceItems(input: {
  items: readonly WeddingCustomSurfaceItem[];
  menu: WeddingWorkspaceMenuId;
  itemId: string;
  targetIndex: number;
  nowIso?: string | null;
}): WeddingCustomSurfaceItem[] {
  const pageItems = weddingCustomSurfaceItemsForMenu(input.items, input.menu);
  const pageIndex = pageItems.findIndex((item) => item.id === input.itemId);
  if (pageIndex < 0 || input.targetIndex < 0 || input.targetIndex >= pageItems.length || pageIndex === input.targetIndex) {
    return [...input.items];
  }
  const reordered = [...pageItems];
  const [moving] = reordered.splice(pageIndex, 1);
  reordered.splice(input.targetIndex, 0, moving!);
  const nowIso = input.nowIso?.trim() || new Date().toISOString();
  const reorderedById = new Map(reordered.map((item, order) => [item.id, {
    ...item,
    order,
    updatedAt: nowIso,
  }]));
  return input.items.map((item) => reorderedById.get(item.id) ?? item);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
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

function durableImageUrl(value: unknown): string | null {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

function isDataImage(value: unknown): boolean {
  return clean(value).startsWith("data:image/");
}

export function normalizeWeddingCustomSurfaceItem(value: unknown, fallbackOrder = 0): WeddingCustomSurfaceItem | null {
  const source = record(value);
  if (!source) return null;
  const id = clean(source.id);
  const menu = clean(source.menu);
  const title = clean(source.title);
  const kind = clean(source.kind);
  if (!id || !isWeddingWorkspaceMenuId(menu) || !title) return null;
  if (kind !== "image" && kind !== "text") return null;
  const createdAt = clean(source.createdAt ?? source.created_at) || new Date().toISOString();
  const updatedAt = clean(source.updatedAt ?? source.updated_at) || createdAt;
  return {
    id,
    menu,
    kind,
    title,
    body: clean(source.body),
    imageUrl: typeof source.imageUrl === "string" ? source.imageUrl : clean(source.image_url) || null,
    storageRef: clean(source.storageRef ?? source.storage_ref) || null,
    order: Number.isFinite(source.order) ? Number(source.order) : fallbackOrder,
    createdAt,
    updatedAt,
  };
}

function messageToSendInput(message: AfpMessage): SendAfpMessageInput {
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

function ref(type: string, target: unknown, label: string, metadata?: Record<string, unknown>): AfpReference | null {
  const cleanTarget = clean(target);
  if (!cleanTarget) return null;
  return { type, target: cleanTarget, label, ...(metadata ? { metadata } : {}) };
}

function itemContent(item: WeddingCustomSurfaceItem): Record<string, unknown> {
  const durableUrl = durableImageUrl(item.imageUrl);
  return {
    id: item.id,
    menu: item.menu,
    kind: item.kind,
    title: item.title,
    body: item.body,
    image_url: durableUrl,
    storage_ref: item.storageRef ?? null,
    image_upload_needed: item.kind === "image" && !durableUrl && !item.storageRef,
    has_browser_preview: isDataImage(item.imageUrl),
    order: item.order,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

export function weddingCustomSurfaceItemToAfpMessage(input: {
  item: WeddingCustomSurfaceItem;
  metadata?: unknown;
  action?: WeddingCustomSurfaceAction;
  createdAt?: string;
}): AfpMessage {
  const metadata: WeddingPlanningMetadata = normalizeWeddingPlanningMetadata(input.metadata);
  const timestamp = input.createdAt ?? new Date().toISOString();
  const action = input.action ?? "upsert";
  const item = input.item;
  const label = item.kind === "image" ? "Image" : "Note";
  const references = [
    ref("wedding_plan", metadata.weddingPlanId, "Wedding plan"),
    ref("response_workspace", metadata.responseWorkspaceId, "Wedding workspace"),
    ref("wedding_workspace_menu", item.menu, "Wedding page", { custom_surface_item_id: item.id }),
    ref("wedding_custom_surface_item", item.id, item.title, { action }),
  ].filter((entry): entry is AfpReference => entry !== null);

  return {
    id: `afp-wedding-custom-surface-${safeWeddingLabel(item.id)}-${Date.parse(timestamp) || 0}`,
    thread_id: `wedding_custom_surface:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    from: "system://wedding-planning",
    to: ["agent://wedding-planning", "agent://knowledge-graph", "agent://topology"],
    timestamp,
    type: "ledger",
    kind: "wedding_custom_surface_item",
    subtype: "wedding_custom_surface_item",
    supertags: uniqueStrings([
      ...metadata.supertags,
      "wedding_custom_surface",
      `wedding_custom_surface:${item.kind}`,
      `wedding_workspace_menu:${safeWeddingLabel(item.menu)}`,
      "topology:wedding_workspace_surface",
      `wedding_plan:${safeWeddingLabel(metadata.weddingPlanId)}`,
      `response_workspace:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    ]),
    content: {
      ledger_kind: "wedding_custom_surface_item",
      action,
      item: itemContent(item),
      markdown: [
        `# ${item.title}`,
        "",
        item.body || `${label} added to ${item.menu}.`,
      ].join("\n"),
    },
    metadata: {
      ...metadata,
      wedding_custom_surface: true,
      wedding_workspace_menu: item.menu,
      custom_surface_item_id: item.id,
      custom_surface_item_kind: item.kind,
      custom_surface_action: action,
      privacy_scope: "private",
      e2ee_required: true,
      searchable_terms: uniqueStrings([
        "wedding custom surface",
        "wedding page addition",
        item.menu,
        item.title,
        item.body,
        metadata.weddingPlanId,
        metadata.responseWorkspaceId,
      ]),
    },
    views: [{
      format: "a2ui",
      content: {
        kind: "wedding_custom_surface_item",
        title: item.title,
        summary: item.body || `${label} added to this wedding page.`,
        page: item.menu,
        action,
        primary_action: "Open wedding page",
        badges: [label, item.menu],
      },
    }],
    attachments: [],
    references,
  };
}

export function weddingCustomSurfaceItemToAfpSendInput(input: {
  item: WeddingCustomSurfaceItem;
  metadata?: unknown;
  action?: WeddingCustomSurfaceAction;
  createdAt?: string;
}): SendAfpMessageInput {
  return messageToSendInput(weddingCustomSurfaceItemToAfpMessage(input));
}
