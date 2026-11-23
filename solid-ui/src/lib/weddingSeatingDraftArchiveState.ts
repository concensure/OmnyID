// @locs-version: 1.0
import type { AfpMessage, AfpReference, SendAfpMessageInput } from "@/lib/api";
import { normalizeWeddingPlanningMetadata, safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

export type WeddingSeatingDraftArchiveRecord = {
  id: string;
  fingerprint: string;
  statusLabel: string;
  reasonLabel: string | null;
  createdAt: string;
  action?: "hide" | "restore";
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

function afpRef(type: string, target: unknown, label: string, metadata?: Record<string, unknown>): AfpReference | null {
  const cleanTarget = clean(target);
  if (!cleanTarget) return null;
  return { type, target: cleanTarget, label, ...(metadata ? { metadata } : {}) };
}

export function weddingSeatingDraftArchiveToAfpMessage(input: {
  fingerprint: string;
  metadata?: unknown;
  reasonLabel?: string | null;
  createdAt?: string;
  action?: "hide" | "restore";
}): AfpMessage {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const fingerprint = clean(input.fingerprint);
  const timestamp = input.createdAt ?? new Date().toISOString();
  const archiveId = `wedding_seating_draft_archive:${safeWeddingLabel(fingerprint).slice(0, 96)}`;
  const action = input.action ?? "hide";
  const statusLabel = action === "restore" ? "Saved seating draft restored." : "Saved seating draft hidden.";
  const reasonLabel = clean(input.reasonLabel) || null;
  const references = [
    afpRef("wedding_plan", metadata.weddingPlanId, "Wedding plan"),
    afpRef("response_workspace", metadata.responseWorkspaceId, "Wedding workspace"),
    afpRef("seating_draft_fingerprint", fingerprint, "Hidden seating draft"),
  ].filter((item): item is AfpReference => item !== null);

  return {
    id: `afp-${safeWeddingLabel(archiveId)}`,
    thread_id: `wedding_seating:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    from: "system://wedding-planning",
    to: ["agent://wedding-planning", "agent://knowledge-graph", "agent://topology"],
    timestamp,
    type: "ledger",
    kind: "wedding_seating_draft_archive",
    subtype: "wedding_seating_draft_archive",
    supertags: uniqueStrings([
      ...metadata.supertags,
      "wedding_seating",
      "wedding_seating:draft_archive",
      "topology:wedding_guest_graph",
      "decisionos:wedding_seating",
      `wedding_plan:${safeWeddingLabel(metadata.weddingPlanId)}`,
      `response_workspace:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    ]),
    content: {
      ledger_kind: "wedding_seating_draft_archive",
      archive_id: archiveId,
      seating_draft_fingerprint: fingerprint,
      archive_action: action,
      status_label: statusLabel,
      reason_label: reasonLabel,
      created_at: timestamp,
      markdown: ["# Hidden seating draft", "", reasonLabel ?? "This old seating draft is hidden from the couple's saved draft list."].join("\n"),
    },
    metadata: {
      ...metadata,
      seating_draft_archive: true,
      seating_draft_fingerprint: fingerprint,
      seating_draft_archive_action: action,
      e2ee_required: true,
      searchable_terms: uniqueStrings([
        "wedding seating",
        "hidden seating draft",
        "seating draft archive",
        metadata.weddingPlanId,
        metadata.responseWorkspaceId,
      ]),
    },
    views: [{
      format: "a2ui",
      content: {
        kind: "wedding_seating_draft_archive",
        title: action === "restore" ? "Saved seating draft restored" : "Saved seating draft hidden",
        summary: reasonLabel ?? (action === "restore"
          ? "This seating option is visible in the saved draft list again."
          : "This old seating option is hidden from the saved draft list."),
        primary_action: "Show saved drafts",
      },
    }],
    attachments: [],
    references,
  };
}

export function weddingSeatingDraftArchiveToAfpSendInput(input: {
  fingerprint: string;
  metadata?: unknown;
  reasonLabel?: string | null;
  createdAt?: string;
  action?: "hide" | "restore";
}): SendAfpMessageInput {
  const message = weddingSeatingDraftArchiveToAfpMessage(input);
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

export function weddingSeatingDraftArchiveFromAfpMessage(message: AfpMessage): WeddingSeatingDraftArchiveRecord | null {
  if (message.subtype !== "wedding_seating_draft_archive" && message.kind !== "wedding_seating_draft_archive") return null;
  const content = message.content && typeof message.content === "object" ? message.content : {};
  const fingerprint = clean(content.seating_draft_fingerprint)
    || clean(message.references?.find((reference) => reference.type === "seating_draft_fingerprint")?.target);
  if (!fingerprint) return null;
  const action = clean(content.archive_action) === "restore" ? "restore" : "hide";
  return {
    id: clean(content.archive_id) || `wedding_seating_draft_archive:${safeWeddingLabel(fingerprint).slice(0, 96)}`,
    fingerprint,
    statusLabel: clean(content.status_label) || (action === "restore" ? "Saved seating draft restored." : "Saved seating draft hidden."),
    reasonLabel: clean(content.reason_label) || null,
    createdAt: clean(content.created_at) || message.timestamp,
    action,
  };
}
