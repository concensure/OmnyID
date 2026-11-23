// @locs-version: 1.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingDealBreakerAction = "add" | "remove";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function timestamp(value: unknown): number {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function inWorkspace(message: AfpMessage, metadata: WeddingPlanningMetadata): boolean {
  const content = message.content && typeof message.content === "object"
    ? message.content as Record<string, unknown>
    : {};
  return message.thread_id === `wedding_vision:${safeWeddingLabel(metadata.responseWorkspaceId)}`
    || clean(message.metadata?.responseWorkspaceId) === metadata.responseWorkspaceId
    || clean(message.metadata?.response_workspace_id) === metadata.responseWorkspaceId
    || clean(content.response_workspace_id) === metadata.responseWorkspaceId;
}

export function weddingDealBreakerToAfpSendInput(input: {
  metadata?: unknown;
  label: string;
  action?: WeddingDealBreakerAction;
  sourceSurface?: "vision" | "enquiry" | "quote_review";
}): SendAfpMessageInput {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const label = clean(input.label).replace(/\s+/g, " ").slice(0, 180);
  const action = input.action ?? "add";
  const sourceSurface = input.sourceSurface ?? "vision";
  const createdAt = new Date().toISOString();
  const workspaceSlug = safeWeddingLabel(metadata.responseWorkspaceId);
  const labelSlug = safeWeddingLabel(label, "requirement");
  return {
    thread_id: `wedding_vision:${workspaceSlug}`,
    from: "system://wedding-planning",
    to: ["agent://wedding-planning", "agent://knowledge-graph", "agent://state-synthesizer"],
    timestamp: createdAt,
    type: "ledger",
    kind: "wedding_deal_breaker",
    subtype: "wedding_deal_breaker",
    content: {
      ledger_kind: "wedding_deal_breaker",
      action,
      label,
      source_surface: sourceSurface,
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      markdown: `# Wedding deal-breaker\n\n${action === "remove" ? "Removed" : "Added"}: ${label}`,
    },
    metadata: {
      ...metadata,
      wedding_deal_breaker: true,
      wedding_deal_breaker_action: action,
      wedding_deal_breaker_label: label,
      source_surface: sourceSurface,
      privacy_scope: "private",
      e2ee_required: true,
      searchable_terms: ["wedding deal breaker", "must not compromise", label],
    },
    references: [
      { type: "wedding_plan", target: metadata.weddingPlanId, label: "Wedding plan" },
      { type: "response_workspace", target: metadata.responseWorkspaceId, label: "Wedding workspace" },
      { type: "wedding_deal_breaker", target: `wedding_deal_breaker:${labelSlug}`, label },
    ],
    supertags: [
      ...metadata.supertags,
      "wedding_vision",
      "wedding_deal_breaker",
      `wedding_deal_breaker:${labelSlug}`,
      `wedding_plan:${safeWeddingLabel(metadata.weddingPlanId)}`,
      `response_workspace:${workspaceSlug}`,
    ],
    views: [{
      format: "a2ui",
      content: {
        kind: "wedding_deal_breaker",
        title: "Wedding deal-breaker",
        summary: `${action === "remove" ? "Removed" : "Added"}: ${label}`,
        action,
        label,
        source_surface: sourceSurface,
      },
    }],
    store_in_relational: true,
  };
}

export function weddingDealBreakersFromAfpMessages(input: {
  messages?: readonly AfpMessage[] | null;
  metadata?: unknown;
}): string[] {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const latest = new Map<string, { label: string; action: WeddingDealBreakerAction; at: number }>();
  for (const message of input.messages ?? []) {
    if (message.kind !== "wedding_deal_breaker" && message.subtype !== "wedding_deal_breaker") continue;
    if (!inWorkspace(message, metadata)) continue;
    const content = message.content && typeof message.content === "object"
      ? message.content as Record<string, unknown>
      : {};
    const label = clean(content.label || message.metadata?.wedding_deal_breaker_label);
    const action = clean(content.action || message.metadata?.wedding_deal_breaker_action);
    if (!label || (action !== "add" && action !== "remove")) continue;
    const key = label.toLowerCase();
    const at = timestamp(message.timestamp);
    const current = latest.get(key);
    if (!current || at >= current.at) latest.set(key, { label, action, at });
  }
  return [...latest.values()]
    .filter((item) => item.action === "add")
    .sort((left, right) => left.at - right.at)
    .slice(0, 24)
    .map((item) => item.label);
}
