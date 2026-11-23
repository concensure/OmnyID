// @locs-version: 1.0
import type { DashboardBootstrap } from "@/lib/api";
import type { DecisionOsSettingsTab } from "@/lib/decisionosNavigation";
import { normalizeViewName } from "@/lib/viewNames";
import type { ViewName } from "@/lib/viewNames";

export type ConversationAttentionItem = NonNullable<
  DashboardBootstrap["conversation_attention_items"]
>[number];
export type ConversationAttentionSummary = DashboardBootstrap["conversation_attention_summary"];
export type ConversationAttentionNavigationPlan = {
  view: ViewName;
  eventId?: string;
  date?: string;
  threadId?: string;
  messageId?: string;
  settingsTab?: DecisionOsSettingsTab | null;
};

export type ConversationAttentionNavigateFn = (
  view: ViewName,
  extra?: Record<string, unknown>,
) => void;

export function attentionTone(kind: string): string {
  switch (kind) {
    case "approval_request":
      return "border-amber-200/70 bg-amber-50/80 text-amber-700";
    case "prepared_draft":
      return "border-emerald-200/70 bg-emerald-50/80 text-emerald-700";
    default:
      return "border-sky-200/70 bg-sky-50/80 text-sky-700";
  }
}

export function familyFallbackLabel(family: string | null | undefined): string {
  switch ((family ?? "").trim()) {
    case "forms":
      return "form review";
    case "bills":
      return "bill review";
    case "renewals":
      return "renewal review";
    case "communications":
      return "communication";
    default:
      return (family ?? "").trim();
  }
}

export function familyLabel(item: ConversationAttentionItem): string {
  return item.conversation_family_label?.trim() || familyFallbackLabel(item.conversation_family);
}

export function reviewLabel(item: ConversationAttentionItem): string {
  return item.review_action_label?.trim() || "Open work item";
}

export function hasReviewTarget(item: ConversationAttentionItem): boolean {
  return Boolean(
    item.thread_id
    || item.latest_artifact_id
    || item.latest_message_ref
    || item.latest_artifact_destination_view?.trim()
    || item.latest_attention_kind === "approval_request",
  );
}

export function artifactSummary(item: ConversationAttentionItem): string | null {
  const summary = item.latest_artifact_summary?.trim();
  if (!summary) return null;
  if (summary.toLowerCase() === item.summary.trim().toLowerCase()) return null;
  return summary;
}

export function valueHint(item: ConversationAttentionItem): string | null {
  const hint = item.latest_value_hint?.trim();
  return hint ? hint : null;
}

export function formOwnerHint(item: ConversationAttentionItem): string | null {
  const owner = item.latest_form_owner?.trim();
  return owner ? `For ${owner}` : null;
}

export function submissionModeHint(item: ConversationAttentionItem): string | null {
  const mode = item.latest_submission_mode?.trim();
  return mode ? `Submit via ${mode}` : null;
}

export function singleItemHeaderDetail(item: ConversationAttentionItem | undefined): string | null {
  if (!item) return null;

  const hint = valueHint(item);
  if (item.conversation_family === "forms") {
    const owner = formOwnerHint(item);
    const mode = submissionModeHint(item);
    const sensitive =
      item.latest_sensitive_form === true ? "Sensitive form." : null;
    const details = [
      hint,
      owner ? `${owner}.` : null,
      mode ? `${mode}.` : null,
      sensitive,
    ].filter(
      (detail, index, all): detail is string =>
        typeof detail === "string" && all.indexOf(detail) === index,
    );
    if (details.length > 0) return details.join(" ");
  }

  return hint || artifactSummary(item) || item.summary?.trim() || null;
}

export function attentionRank(item: ConversationAttentionItem): number {
  return item.attention_rank ?? 0;
}

export function conversationAttentionStatusBadge(args: {
  items: ConversationAttentionItem[];
  summary?: ConversationAttentionSummary;
}): string {
  if (args.items.length === 1) {
    const attention = args.items[0]?.latest_attention_label?.trim();
    if (attention) return attention;
  }
  const summary = args.summary;
  if (!summary || summary.count <= 0) return "queued";
  if (summary.approval_request_count > 0) return "gated";
  if (summary.prepared_draft_count > 0) return "review ready";
  return "queued";
}

export function conversationAttentionCountLabel(args: {
  items: ConversationAttentionItem[];
  summary?: ConversationAttentionSummary;
}): string {
  if (args.items.length === 1) {
    const item = args.items[0];
    const family = item?.conversation_family_label?.trim()
      || familyFallbackLabel(item?.conversation_family);
    const attention = item?.latest_attention_label?.trim();
    if (family && attention) {
      return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${attention}`;
    }
  }
  const summary = args.summary;
  if (!summary || summary.count <= 0) {
    return `${args.items.length} background work item${args.items.length === 1 ? "" : "s"}`;
  }
  if (summary.approval_request_count > 0) {
    return `${summary.approval_request_count} approval request${summary.approval_request_count === 1 ? "" : "s"}`;
  }
  if ((summary.form_count ?? 0) > 0
    && (summary.form_count ?? 0) >= (summary.bill_count ?? 0)
    && (summary.form_count ?? 0) >= (summary.renewal_count ?? 0)
    && (summary.form_count ?? 0) >= (summary.communication_count ?? 0)) {
    return `${summary.form_count} form review${summary.form_count === 1 ? "" : "s"}`;
  }
  if ((summary.bill_count ?? 0) > 0
    && (summary.bill_count ?? 0) >= (summary.renewal_count ?? 0)
    && (summary.bill_count ?? 0) >= (summary.communication_count ?? 0)) {
    return `${summary.bill_count} bill review${summary.bill_count === 1 ? "" : "s"}`;
  }
  if ((summary.renewal_count ?? 0) > 0
    && (summary.renewal_count ?? 0) >= (summary.communication_count ?? 0)) {
    return `${summary.renewal_count} renewal review${summary.renewal_count === 1 ? "" : "s"}`;
  }
  if ((summary.communication_count ?? 0) > 0) {
    if (summary.prepared_draft_count > 0) {
      return `${summary.prepared_draft_count} communication draft${summary.prepared_draft_count === 1 ? "" : "s"}`;
    }
    return `${summary.communication_count} communication follow-up${summary.communication_count === 1 ? "" : "s"}`;
  }
  if (summary.prepared_draft_count > 0) {
    return `${summary.prepared_draft_count} prepared background work item${summary.prepared_draft_count === 1 ? "" : "s"}`;
  }
  return `${args.items.length} background work item${args.items.length === 1 ? "" : "s"}`;
}

export function conversationAttentionSubtitleLabel(args: {
  items: ConversationAttentionItem[];
  summary?: ConversationAttentionSummary;
}): string {
  if (args.items.length === 1) {
    return singleItemHeaderDetail(args.items[0])
      || "Background personalOS work is ready for review.";
  }
  const summary = args.summary;
  if (!summary || summary.count <= 0) {
    return "Background personalOS work will appear here when prepared reviews or approval-ready items are surfaced.";
  }
  if (summary.approval_request_count > 0) {
    return `${summary.approval_request_count} approval request${summary.approval_request_count === 1 ? "" : "s"} need a human decision.`;
  }
  if ((summary.form_count ?? 0) > 0
    && (summary.form_count ?? 0) >= (summary.bill_count ?? 0)
    && (summary.form_count ?? 0) >= (summary.renewal_count ?? 0)
    && (summary.form_count ?? 0) >= (summary.communication_count ?? 0)) {
    if (summary.prepared_draft_count > 0) {
      return `${summary.prepared_draft_count} form review${summary.prepared_draft_count === 1 ? " is" : "s are"} ready for review.`;
    }
    return `${summary.form_count} form review${summary.form_count === 1 ? "" : "s"} surfaced from background automation.`;
  }
  if ((summary.bill_count ?? 0) > 0
    && (summary.bill_count ?? 0) >= (summary.renewal_count ?? 0)
    && (summary.bill_count ?? 0) >= (summary.communication_count ?? 0)) {
    if (summary.prepared_draft_count > 0) {
      return `${summary.prepared_draft_count} bill review${summary.prepared_draft_count === 1 ? " is" : "s are"} ready for review.`;
    }
    return `${summary.bill_count} bill review${summary.bill_count === 1 ? "" : "s"} surfaced from background automation.`;
  }
  if ((summary.renewal_count ?? 0) > 0
    && (summary.renewal_count ?? 0) >= (summary.communication_count ?? 0)) {
    if (summary.prepared_draft_count > 0) {
      return `${summary.prepared_draft_count} renewal review${summary.prepared_draft_count === 1 ? " is" : "s are"} ready for review.`;
    }
    return `${summary.renewal_count} renewal review${summary.renewal_count === 1 ? "" : "s"} surfaced from background automation.`;
  }
  if (summary.prepared_draft_count > 0) {
    if ((summary.communication_count ?? 0) > 0) {
      return `${summary.prepared_draft_count} communication draft${summary.prepared_draft_count === 1 ? " is" : "s are"} ready for review.`;
    }
    return `${summary.prepared_draft_count} prepared background work item${summary.prepared_draft_count === 1 ? " is" : "s are"} ready for review.`;
  }
  if ((summary.communication_count ?? 0) > 0) {
    return `${summary.communication_count} communication follow-up${summary.communication_count === 1 ? " is" : "s are"} surfaced from connected accounts and automations.`;
  }
  return `${summary.background_follow_up_count} background work item${summary.background_follow_up_count === 1 ? "" : "s"} surfaced from connected accounts and automations.`;
}

function conversationAttentionDestinationView(
  item: ConversationAttentionItem,
): ViewName | null {
  return normalizeViewName(item.latest_artifact_destination_view);
}

export function conversationAttentionItemNavigationPlan(
  item: ConversationAttentionItem,
): ConversationAttentionNavigationPlan {
  const destinationView = conversationAttentionDestinationView(item);
  if (destinationView) {
    return { view: destinationView };
  }
  if (item.latest_attention_kind === "approval_request") {
    return { view: "decision_queue" };
  }
  if (item.thread_id || item.latest_artifact_id || item.latest_message_ref) {
    return {
      view: "threads",
      threadId: item.thread_id ?? undefined,
      messageId: item.latest_artifact_id ?? item.latest_message_ref ?? undefined,
    };
  }
  return { view: "home" };
}

export function conversationAttentionArtifactNavigationPlan(
  item: ConversationAttentionItem,
): ConversationAttentionNavigationPlan {
  const destinationView = conversationAttentionDestinationView(item);
  if (destinationView) {
    return { view: destinationView };
  }
  if (item.latest_attention_kind === "approval_request") {
    return { view: "decision_queue" };
  }
  if (item.thread_id || item.latest_artifact_id || item.latest_message_ref) {
    return {
      view: "threads",
      threadId: item.thread_id ?? undefined,
      messageId: item.latest_artifact_id ?? item.latest_message_ref ?? undefined,
    };
  }
  return conversationAttentionItemNavigationPlan(item);
}

export function conversationAttentionSourceEventNavigationPlan(
  item: ConversationAttentionItem,
): ConversationAttentionNavigationPlan {
  if (item.thread_id || item.source_event_id) {
    return {
      view: "threads",
      threadId: item.thread_id ?? undefined,
      messageId: item.source_event_id ?? undefined,
    };
  }
  return conversationAttentionItemNavigationPlan(item);
}

export function executeConversationAttentionNavigationPlan(
  plan: ConversationAttentionNavigationPlan,
  navigate: ConversationAttentionNavigateFn,
): void {
  switch (plan.view) {
    case "threads":
      navigate("threads", {
        threadId: plan.threadId,
        messageId: plan.messageId,
      });
      return;
    case "calendar":
      navigate("calendar", {
        eventId: plan.eventId,
        date: plan.date,
      });
      return;
    case "agent_settings":
      navigate("agent_settings", {
        settingsTab: plan.settingsTab,
      });
      return;
    default:
      navigate(plan.view);
      return;
  }
}

export function navigateConversationAttentionItem(
  item: ConversationAttentionItem,
  navigate: ConversationAttentionNavigateFn,
): void {
  executeConversationAttentionNavigationPlan(
    conversationAttentionItemNavigationPlan(item),
    navigate,
  );
}

export function navigateConversationAttentionArtifact(
  item: ConversationAttentionItem,
  navigate: ConversationAttentionNavigateFn,
): void {
  executeConversationAttentionNavigationPlan(
    conversationAttentionArtifactNavigationPlan(item),
    navigate,
  );
}

export function navigateConversationAttentionSourceEvent(
  item: ConversationAttentionItem,
  navigate: ConversationAttentionNavigateFn,
): void {
  executeConversationAttentionNavigationPlan(
    conversationAttentionSourceEventNavigationPlan(item),
    navigate,
  );
}
