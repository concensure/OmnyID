// @locs-version: 1.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingPersonalOsRankedItem } from "@/lib/weddingPersonalOsProjectionState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingDecisionDeferralProjectionInput = {
  item: WeddingPersonalOsRankedItem;
  metadata?: unknown;
  createdAt?: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function uniqueStrings(values: readonly unknown[], limit = 64): string[] {
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

function deferralId(metadata: WeddingPlanningMetadata, item: WeddingPersonalOsRankedItem): string {
  return `wedding_decision_deferral:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(item.id)}`;
}

function isoAfterDays(value: string, days: number): string | null {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed + days * 86_400_000).toISOString();
}

function isoBeforeDays(value: string | null | undefined, days: number): string | null {
  const parsed = Date.parse(clean(value));
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed - days * 86_400_000).toISOString();
}

function dependencyFingerprint(item: WeddingPersonalOsRankedItem): string {
  return uniqueStrings([
    item.id,
    item.kind,
    item.pressureFamily,
    item.sourceSurface,
    item.dueAt,
    item.dueLabel,
    ...item.evidenceLabels,
  ], 24).join("|").toLowerCase();
}

function markdownFor(item: WeddingPersonalOsRankedItem): string {
  return [
    "# Wedding decision deferred",
    "",
    `Decision: ${item.title}`,
    "",
    "The couple chose to decide this later. Keep it out of the immediate attention list until its due date, a dependency changes, or the couple reopens it.",
    "",
    "## Why it was visible",
    "",
    item.explanation,
    "",
    "## Evidence",
    "",
    ...(item.evidenceLabels.length > 0 ? item.evidenceLabels.map((label) => `- ${label}`) : ["- No evidence labels were attached."]),
  ].join("\n");
}

export function weddingDecisionDeferralToAfpMessage(
  input: WeddingDecisionDeferralProjectionInput,
  nowIso = new Date().toISOString(),
): AfpMessage {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const item = input.item;
  const id = deferralId(metadata, item);
  const timestamp = clean(input.createdAt) || nowIso;
  const markdown = markdownFor(item);
  const staleAfterAt = isoAfterDays(timestamp, 7);
  const deferredUntilAt = isoBeforeDays(item.dueAt, 3) ?? staleAfterAt;
  const fingerprint = dependencyFingerprint(item);
  return {
    id: `afp-${id}`,
    thread_id: `wedding_decision:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    from: "system://wedding-planning",
    to: ["agent://wedding-planning", "agent://decision-queue", "agent://knowledge-graph", "agent://topology"],
    timestamp,
    type: "ledger",
    kind: "wedding_decision_deferral",
    subtype: "wedding_decision_deferral",
    supertags: uniqueStrings([
      ...metadata.supertags,
      "wedding",
      "wedding_decision",
      "decision:deferred",
      "decisionos",
      "topology:wedding_decision",
      `source_surface:${safeWeddingLabel(item.sourceSurface)}`,
    ]),
    content: {
      kind: "wedding_decision_deferral",
      deferral_id: id,
      focus_item_id: item.id,
      focus_item_kind: item.kind,
      title: item.title,
      pressure_family: item.pressureFamily,
      source_surface: item.sourceSurface,
      due_label: item.dueLabel,
      due_at: item.dueAt,
      explanation: item.explanation,
      evidence_labels: item.evidenceLabels,
      requested_state: "deferred",
      deferred_until_at: deferredUntilAt,
      stale_after_at: staleAfterAt,
      dependency_fingerprint: fingerprint,
      resurface_policy: {
        due_window_days: 3,
        stale_after_days: 7,
        resurface_on_dependency_change: true,
      },
      markdown,
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      source_response_id: metadata.sourceResponseId,
      privacy_scope: metadata.privacyScope,
    },
    metadata: {
      ...metadata,
      origin: "wedding_planning",
      projection: "wedding_decision_deferral_to_afp",
      deferral_id: id,
      focus_item_id: item.id,
      focus_item_kind: item.kind,
      focus_item_title: item.title,
      requested_state: "deferred",
      deferred_until_at: deferredUntilAt,
      stale_after_at: staleAfterAt,
      dependency_fingerprint: fingerprint,
      resurface_policy: "Due in 3 days, unchanged for 7 days, or when the evidence changes.",
      searchable_terms: uniqueStrings([
        id,
        item.id,
        item.title,
        item.kind,
        item.pressureFamily,
        item.sourceSurface,
        item.dueLabel,
        ...item.evidenceLabels,
        metadata.weddingPlanId,
        metadata.responseWorkspaceId,
      ]),
    },
    views: [{
      format: "a2ui",
      priority: 1,
      content: {
        kind: "wedding_decision_deferral",
        title: item.title,
        summary: "Decide later",
        detail: item.dueLabel ? `Bring this back around ${item.dueLabel}.` : "Keep this out of the top three until something changes.",
        rows: [
          { label: "Bring back", value: deferredUntilAt ? deferredUntilAt.slice(0, 10) : "When something changes" },
          { label: "Reason", value: item.explanation },
          { label: "Evidence watched", value: item.evidenceLabels.join(", ") || "No evidence labels attached" },
        ],
      },
    }],
    attachments: [],
    references: [
      { type: "wedding_plan", target: metadata.weddingPlanId, label: "Wedding plan" },
      { type: "response_workspace", target: metadata.responseWorkspaceId, label: "Wedding workspace" },
      { type: "deferred_focus_item", target: item.id, label: "Deferred attention item" },
    ],
  };
}

export function weddingDecisionDeferralToAfpSendInput(
  input: WeddingDecisionDeferralProjectionInput,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput {
  return messageToSendInput(weddingDecisionDeferralToAfpMessage(input, nowIso));
}

export function weddingDecisionDeferralActionToAfpSendInput(
  action: WeddingWorkspaceSidebarAction,
  metadata?: unknown,
  nowIso = new Date().toISOString(),
): SendAfpMessageInput | null {
  if (action.kind !== "defer_decision") return null;
  const packet = record(action.metadata?.decision_deferral);
  const id = clean(packet?.id);
  const title = clean(packet?.title);
  if (!id || !title) return null;
  return weddingDecisionDeferralToAfpSendInput({
    metadata,
    createdAt: nowIso,
    item: {
      id,
      kind: clean(packet?.kind) as WeddingPersonalOsRankedItem["kind"] || "task",
      title,
      pressureFamily: clean(packet?.pressure_family) as WeddingPersonalOsRankedItem["pressureFamily"] || "attention",
      rankWeight: 0,
      dueLabel: clean(packet?.due_label) || null,
      dueAt: clean(packet?.due_at) || null,
      explanation: clean(packet?.explanation) || "The couple chose to decide this later.",
      evidenceLabels: stringArray(packet?.evidence_labels).slice(0, 8),
      sourceSurface: clean(packet?.source_surface) as WeddingPersonalOsRankedItem["sourceSurface"] || "tasks",
      simulatorSeedKind: "decision",
    },
  }, nowIso);
}
