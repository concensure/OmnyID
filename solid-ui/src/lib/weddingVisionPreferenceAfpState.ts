// @locs-version: 1.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingVisionPreferenceAction = "affirm_feel_tag" | "remove_feel_tag";

export type WeddingVisionPreferenceRecord = {
  action: WeddingVisionPreferenceAction;
  label: string;
  sourceSurface: "vision";
  createdAt: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 24): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = clean(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function scopedToWeddingWorkspace(message: AfpMessage, metadata: WeddingPlanningMetadata): boolean {
  const messageMetadata = message.metadata ?? {};
  const content = message.content && typeof message.content === "object"
    ? message.content as Record<string, unknown>
    : {};
  return message.thread_id === `wedding_vision:${safeWeddingLabel(metadata.responseWorkspaceId)}`
    || clean(messageMetadata.responseWorkspaceId) === metadata.responseWorkspaceId
    || clean(messageMetadata.response_workspace_id) === metadata.responseWorkspaceId
    || clean(content.response_workspace_id) === metadata.responseWorkspaceId;
}

function actionLabel(action: WeddingVisionPreferenceAction): string {
  return action === "remove_feel_tag" ? "Removed feeling tag" : "Confirmed feeling tag";
}

function timestampMs(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function weddingVisionPreferenceToAfpSendInput(input: {
  metadata?: unknown;
  label: string;
  action?: WeddingVisionPreferenceAction;
  createdAt?: string;
}): SendAfpMessageInput {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const label = clean(input.label).slice(0, 80);
  const action = input.action ?? "affirm_feel_tag";
  const timestamp = input.createdAt ?? new Date().toISOString();
  const tagSlug = safeWeddingLabel(label, "tag");
  const workspaceSlug = safeWeddingLabel(metadata.responseWorkspaceId);

  return {
    thread_id: `wedding_vision:${workspaceSlug}`,
    from: "system://wedding-planning",
    to: ["agent://wedding-planning", "agent://knowledge-graph", "agent://state-synthesizer"],
    timestamp,
    type: "ledger",
    kind: "wedding_vision_preference",
    subtype: "wedding_vision_preference",
    content: {
      ledger_kind: "wedding_vision_preference",
      action,
      label,
      source_surface: "vision",
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      markdown: `# Wedding vision preference\n\n${actionLabel(action)}: ${label}`,
    },
    metadata: {
      ...metadata,
      wedding_vision_preference: true,
      wedding_vision_action: action,
      wedding_vision_label: label,
      wedding_workspace_menu: "inspiration",
      source_surface: "vision",
      privacy_scope: "private",
      e2ee_required: true,
      searchable_terms: uniqueStrings([
        "wedding vision preference",
        "wedding compass",
        "how it should feel",
        action,
        label,
        metadata.weddingPlanId,
        metadata.responseWorkspaceId,
      ]),
    },
    references: [
      { type: "wedding_plan", target: metadata.weddingPlanId, label: "Wedding plan" },
      { type: "response_workspace", target: metadata.responseWorkspaceId, label: "Wedding workspace" },
      { type: "wedding_workspace_menu", target: "inspiration", label: "Inspiration" },
      { type: "wedding_vision_tag", target: `wedding_vision_tag:${tagSlug}`, label },
    ],
    supertags: uniqueStrings([
      ...metadata.supertags,
      "wedding_vision",
      "wedding_vision_preference",
      "wedding_feel_tag",
      `wedding_feel_tag:${tagSlug}`,
      `wedding_plan:${safeWeddingLabel(metadata.weddingPlanId)}`,
      `response_workspace:${workspaceSlug}`,
    ]),
    views: [{
      format: "a2ui",
      content: {
        kind: "wedding_vision_preference",
        title: "Wedding vision preference",
        summary: `${actionLabel(action)}: ${label}`,
        action,
        label,
      },
    }],
    store_in_relational: true,
  };
}

export function weddingVisionPreferenceRecordsFromAfpMessages(input: {
  messages?: readonly AfpMessage[] | null;
  metadata?: unknown;
}): WeddingVisionPreferenceRecord[] {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const records = (input.messages ?? []).flatMap((message): WeddingVisionPreferenceRecord[] => {
    if (message.kind !== "wedding_vision_preference" && message.subtype !== "wedding_vision_preference") return [];
    if (!scopedToWeddingWorkspace(message, metadata)) return [];
    const content = message.content && typeof message.content === "object"
      ? message.content as Record<string, unknown>
      : {};
    const action = clean(content.action || message.metadata?.wedding_vision_action);
    const label = clean(content.label || message.metadata?.wedding_vision_label);
    if ((action !== "affirm_feel_tag" && action !== "remove_feel_tag") || !label) return [];
    return [{
      action: action as WeddingVisionPreferenceAction,
      label,
      sourceSurface: "vision",
      createdAt: clean(message.timestamp) || null,
    }];
  });
  const latestByLabel = new Map<string, WeddingVisionPreferenceRecord>();
  for (const record of records) {
    const key = record.label.toLowerCase();
    const current = latestByLabel.get(key);
    if (!current || timestampMs(record.createdAt) >= timestampMs(current.createdAt)) {
      latestByLabel.set(key, record);
    }
  }
  return uniqueStrings(records.map((record) => record.label), 12)
    .flatMap((label): WeddingVisionPreferenceRecord[] => {
      const record = latestByLabel.get(label.toLowerCase());
      return record?.action === "affirm_feel_tag" ? [record] : [];
    });
}
