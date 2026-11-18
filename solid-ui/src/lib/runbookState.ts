import type { ApprovalReviewLike } from "afp-ts/continuity";
export type RunbookDefinitionSummary = {
  runbook_id: string; name: string; version: number; message_id: string;
  enabled: boolean; status: string; trigger_types: string[];
};
export type RunbookQuestion = {
  escalation_id: string; instance_id: string; step_id: string; status: string;
  question: string; why_needed: string; missing_fields: string[];
  attempted_refs: string[]; answer_schema: "date" | "boolean" | "short_text" | "non_negative_number";
  expires_at: string;
};
export type RunbookActivity = {
  instance: { instance_id: string; runbook_id: string; status: string; revision: number;
    next_follow_up_at?: string | null; current_step_id?: string | null };
  review_actor?: string;
  approval_requests?: { action_ref: string; status?: "pending" | "approved" | "rejected" | "cancelled"; approval_review: ApprovalReviewLike }[];
  reviews?: { id: string; trace_id: string; title: string; summary_lines: string[]; source_refs: string[] }[];
  questions: RunbookQuestion[];
  traces: { trace_id: string; step_id: string; kind: string; status: string;
    started_at: string; source_refs: string[]; output_refs: string[];
    approval_ref?: string | null; provenance_ref?: string | null }[];
};
export const runbookKinds = new Set(["runbook_definition", "runbook_instance",
  "runbook_step_summary", "runbook_approval_link", "runbook_question"]);
export function runbookIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,128}$/.test(value);
}
export function runbookTerminal(status: string): boolean {
  return ["completed", "failed", "cancelled"].includes(status);
}
export function openRunbookQuestions(activity: RunbookActivity, now = Date.now()) {
  return activity.instance.status === "waiting_for_input"
    ? activity.questions.filter(q => q.status === "open" && Date.parse(q.expires_at) > now) : [];
}
export function runbookAnswer(schema: RunbookQuestion["answer_schema"], raw: string): string | number | boolean {
  if (schema === "boolean" && ["true", "false"].includes(raw)) return raw === "true";
  if (schema === "non_negative_number" && raw.trim() !== "" && Number.isFinite(Number(raw)) && Number(raw) >= 0) return Number(raw);
  if (schema === "short_text" && raw.trim() && new TextEncoder().encode(raw).length <= 512 && !/[\u0000-\u001f\u007f-\u009f]/.test(raw)) return raw;
  if (schema === "date" && /^\d{4}-\d{2}-\d{2}$/.test(raw) && Number.isFinite(Date.parse(raw)) && new Date(raw).toISOString().slice(0, 10) === raw) return raw;
  throw new Error("Enter a valid answer in each field.");
}
export function runbookAnswerPayload(activity: RunbookActivity, question: RunbookQuestion, values: Record<string, string>, eventId: string) {
  if (!openRunbookQuestions(activity).some(q => q.escalation_id === question.escalation_id)
      || question.instance_id !== activity.instance.instance_id) throw new Error("This question is no longer open. Refresh activity.");
  return { expected_revision: activity.instance.revision, input: {
    event_id: eventId, instance_id: activity.instance.instance_id, escalation_id: question.escalation_id,
    answers: Object.fromEntries(question.missing_fields.map(field => [field, runbookAnswer(question.answer_schema, values[field] ?? "")])),
  }};
}
export function runbookStatus(status: string) {
  const labels: Record<string, string> = { matched: "Matched — awaiting execution", running: "In progress",
    waiting_for_budget: "Paused: model budget unavailable",
    waiting_for_input: "Needs your answer", awaiting_approval: "Waiting for approval",
    waiting_for_event: "Waiting for follow-up", completed: "Completed", failed: "Stopped with an error", cancelled: "Cancelled" };
  return labels[status] ?? "Status unavailable";
}

export function runbookViewIdentity(content: unknown): { instanceId?: string; definitionId?: string } | null {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const value = content as Record<string, unknown>;
  if (typeof value.kind !== "string" || !runbookKinds.has(value.kind)) return null;
  if (value.kind === "runbook_definition") return runbookIdentifier(value.runbook_id) ? { definitionId: value.runbook_id } : null;
  return runbookIdentifier(value.instance_id) ? { instanceId: value.instance_id } : null;
}
