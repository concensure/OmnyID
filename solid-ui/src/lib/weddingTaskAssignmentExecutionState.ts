// @locs-version: 1.0
import { deliverWeddingTaskAssignment, type SendAfpMessageInput } from "@/lib/api";
import { friendlyErrorText } from "@/lib/visibleErrorText";

export function weddingAssignmentCoupleNames(input: {
  contextLabels: readonly string[];
  helperNames: readonly string[];
}): string {
  const text = [...input.contextLabels, ...input.helperNames].join("\n");
  const pair = text.match(/\b([A-Z][a-z]{1,30})\s+(?:and|&)\s+([A-Z][a-z]{1,30})\b/);
  return pair ? `${pair[1]} and ${pair[2]}` : "The couple";
}

export async function runWeddingTaskAssignment(input: {
  saveProjection: (projection: SendAfpMessageInput) => Promise<unknown>;
  projection: SendAfpMessageInput;
  weddingPlanId: string;
  responseWorkspaceId: string;
  task: { id: string; title: string; notes?: string | null; dueLabel?: string | null; dueAt?: string | null };
  assignee: string;
  assigneeEmail: string;
}): Promise<{ saved: boolean; notice: string }> {
  try {
    await input.saveProjection(input.projection);
  } catch {
    return { saved: false, notice: `Could not save the assignment for ${input.task.title}.` };
  }
  if (!input.assigneeEmail) {
    return { saved: true, notice: `${input.task.title} assigned to ${input.assignee}. Add an email in Contacts to send the task brief.` };
  }
  try {
    const delivery = await deliverWeddingTaskAssignment({
      wedding_plan_id: input.weddingPlanId,
      response_workspace_id: input.responseWorkspaceId,
      task_id: input.task.id,
      task_title: input.task.title,
      task_brief: input.task.notes ?? "",
      due_label: input.task.dueLabel ?? input.task.dueAt ?? "",
      assignee_name: input.assignee,
      assignee_email: input.assigneeEmail,
    });
    if (!delivery.sent) throw new Error(delivery.message ?? "Email delivery was not confirmed.");
    const research = delivery.research_attached ? " with its research document" : "";
    const agent = delivery.agent_delivered ? " It was also delivered to their OmnyID agent." : "";
    return { saved: true, notice: `${input.task.title} assigned to ${input.assignee}; the task brief${research} was emailed to ${input.assigneeEmail}.${agent}` };
  } catch (error) {
    return {
      saved: true,
      notice: `${input.task.title} is assigned, but the email was not sent. ${friendlyErrorText(error, "Check the contact email and try Assign again.")}`,
    };
  }
}
