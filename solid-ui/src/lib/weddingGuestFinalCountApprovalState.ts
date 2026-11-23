import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";

export type WeddingGuestFinalCountChoice = {
  id: string;
  label: string;
  headcount: number;
  riskLabel: string;
};

export type WeddingGuestFinalCountApproval = {
  taskId: string;
  optionId: string;
  optionLabel: string;
  headcount: number;
  approvedAt: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [];
}

export function weddingGuestFinalCountChoices(task: WeddingPlanningTaskItem | null): WeddingGuestFinalCountChoice[] {
  if (!task) return [];
  const metadata = record(task.metadata);
  if (metadata.guest_final_count_decision !== true) return [];
  const ids = strings(metadata.guest_final_count_option_ids);
  const labels = strings(metadata.guest_final_count_option_labels);
  const headcounts = numbers(metadata.guest_final_count_headcounts);
  const risks = strings(metadata.guest_final_count_risk_labels);
  return ids.map((id, index) => ({
    id,
    label: labels[index] ?? `Guest count ${headcounts[index] ?? ""}`.trim(),
    headcount: Math.max(0, Math.round(headcounts[index] ?? 0)),
    riskLabel: risks[index] ?? "Check the venue or caterer's final-count deadline before approval.",
  })).filter((choice) => choice.id.trim().length > 0);
}

export function weddingGuestFinalCountRecommendation(task: WeddingPlanningTaskItem | null): string | null {
  const metadata = record(task?.metadata);
  if (metadata.guest_final_count_decision !== true) return null;
  const confirmed = typeof metadata.guest_final_count_attending === "number" ? metadata.guest_final_count_attending : 0;
  const pending = typeof metadata.guest_final_count_pending === "number" ? metadata.guest_final_count_pending : 0;
  if (pending > 0) {
    return `You have ${confirmed} confirmed and ${pending} still waiting. Choose the number you are comfortable guaranteeing after checking the venue or caterer's final-count deadline.`;
  }
  return `All current replies are in. Approve ${confirmed} as the final guest count after one last check for late changes.`;
}

export function weddingGuestFinalCountApprovalToAfpSendInput(input: {
  task: WeddingPlanningTaskItem;
  choice: WeddingGuestFinalCountChoice;
  weddingPlanId: string;
  responseWorkspaceId: string;
  nowIso?: string;
}): SendAfpMessageInput {
  const approvedAt = input.nowIso ?? new Date().toISOString();
  return {
    thread_id: `wedding_guest_final_count:${input.responseWorkspaceId}`,
    from: "user://wedding-couple",
    to: ["agent://wedding-planning", "agent://guests", "agent://budget", "agent://tasks"],
    type: "decision",
    kind: "decision",
    subtype: "wedding_guest_final_count_approved",
    content: {
      kind: "wedding_guest_final_count_approval",
      task_id: input.task.id,
      option_id: input.choice.id,
      option_label: input.choice.label,
      final_guest_count: input.choice.headcount,
      approved_at: approvedAt,
      wedding_plan_id: input.weddingPlanId,
      response_workspace_id: input.responseWorkspaceId,
    },
    metadata: {
      origin: "wedding_decision_card",
      wedding_plan_id: input.weddingPlanId,
      response_workspace_id: input.responseWorkspaceId,
      wedding_task_id: input.task.id,
      decision_effect: "set_final_guest_count",
      approval_required: true,
      approval_status: "approved",
    },
    supertags: [
      "template:wedding_planning",
      "wedding_guest_final_count_approved",
      "decisionos:approved",
      "topology:wedding_guest_graph",
    ],
    references: [
      { type: "wedding_plan", target: input.weddingPlanId, label: "Wedding plan" },
      { type: "response_workspace", target: input.responseWorkspaceId, label: "Wedding workspace" },
      { type: "task", target: input.task.id, label: "Final guest count decision" },
    ],
    views: [{ format: "decision_card", content: { title: "Final guest count approved", final_guest_count: input.choice.headcount, option_label: input.choice.label } }],
    store_in_relational: true,
  };
}

export function weddingGuestFinalCountApprovalFromAfpMessages(
  messages: readonly AfpMessage[] | null | undefined,
  responseWorkspaceId: string,
): WeddingGuestFinalCountApproval | null {
  return (messages ?? []).flatMap((message) => {
    if (message.subtype !== "wedding_guest_final_count_approved") return [];
    const content = record(message.content);
    if (String(content.response_workspace_id ?? "") !== responseWorkspaceId) return [];
    const headcount = Number(content.final_guest_count);
    if (!Number.isFinite(headcount) || headcount < 0) return [];
    return [{
      taskId: String(content.task_id ?? ""),
      optionId: String(content.option_id ?? ""),
      optionLabel: String(content.option_label ?? ""),
      headcount: Math.round(headcount),
      approvedAt: String(content.approved_at ?? message.timestamp ?? ""),
    }];
  }).sort((left, right) => right.approvedAt.localeCompare(left.approvedAt))[0] ?? null;
}
