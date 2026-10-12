// @locs-version: 1.0
import { sendGmailApprovedDraft, type SendAfpMessageInput } from "@/lib/api";
import { buildWeddingTaskAssignmentEmail } from "@/lib/weddingTaskAssignmentEmailState";
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
  responseWorkspaceId: string;
  task: { id: string; title: string; notes?: string | null; dueLabel?: string | null; dueAt?: string | null };
  assignee: string;
  assigneeEmail: string;
  coupleNames: string;
  coupleEmail?: string | null;
}): Promise<{ saved: boolean; notice: string }> {
  try {
    await input.saveProjection(input.projection);
  } catch {
    return { saved: false, notice: `Could not save the assignment for ${input.task.title}.` };
  }
  if (!input.assigneeEmail) {
    return { saved: true, notice: `${input.task.title} assigned to ${input.assignee}. Add an email in Contacts to send the task brief.` };
  }
  const email = buildWeddingTaskAssignmentEmail({
    assigneeName: input.assignee,
    coupleNames: input.coupleNames,
    coupleEmail: input.coupleEmail,
    taskName: input.task.title,
    taskBrief: input.task.notes,
    expiry: input.task.dueLabel ?? input.task.dueAt,
  });
  try {
    const sent = await sendGmailApprovedDraft({
      to: input.assigneeEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
      thread_id: `wedding_helper_assignment:${input.responseWorkspaceId}:${input.task.id}`,
    });
    if (!sent.sent) throw new Error(sent.message ?? "Gmail did not confirm delivery.");
    return { saved: true, notice: `${input.task.title} assigned to ${input.assignee}; the task brief was emailed to ${input.assigneeEmail}.` };
  } catch (error) {
    return {
      saved: true,
      notice: `${input.task.title} is assigned, but the email was not sent. ${friendlyErrorText(error, "Reconnect Gmail and try assigning again.")}`,
    };
  }
}
