// @locs-version: 1.0
import { approvalEventLabel } from "afp-ts/continuity";

import type { WorkflowRun } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";

export function runStatusChipClass(status: string): string {
  switch (status) {
    case "failed":
      return "bg-rose-100 text-rose-700";
    case "blocked":
      return "bg-orange-100 text-orange-700";
    case "cancelled":
      return "bg-slate-200 text-slate-700";
    case "waiting_for_approval":
      return "bg-amber-100 text-amber-700";
    case "waiting_for_resume":
      return "bg-sky-100 text-sky-700";
    case "simulated":
      return "bg-cyan-100 text-cyan-700";
    case "queued":
      return "bg-slate-200 text-slate-700";
    case "skipped":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-emerald-100 text-emerald-700";
  }
}

export function waitResumeStatusChipClass(status: string): string {
  switch (status) {
    case "pending":
      return "border-amber-200/70 bg-amber-50/85 text-amber-700";
    case "wake_dispatched":
      return "border-sky-200/70 bg-sky-50/85 text-sky-700";
    case "resumed_pending_execution":
      return "border-cyan-200/70 bg-cyan-50/85 text-cyan-700";
    case "continued_to_new_wait":
      return "border-violet-200/70 bg-violet-50/85 text-violet-700";
    case "completed_after_resume":
      return "border-emerald-200/70 bg-emerald-50/85 text-emerald-700";
    case "blocked_after_resume":
      return "border-orange-200/70 bg-orange-50/85 text-orange-700";
    case "failed_after_resume":
      return "border-rose-200/70 bg-rose-50/85 text-rose-700";
    case "approval_rejected":
      return "border-slate-200/70 bg-slate-100/85 text-slate-700";
    default:
      return "border-slate-200/70 bg-white/85 text-slate-700";
  }
}

export function waitResumeStatusLabel(status: string): string {
  switch (status) {
    case "wake_dispatched":
      return "Wake dispatched";
    case "resumed_pending_execution":
      return "Resume dispatched";
    case "continued_to_new_wait":
      return "Continued to new wait";
    case "completed_after_resume":
      return "Completed after resume";
    case "blocked_after_resume":
      return "Blocked after resume";
    case "failed_after_resume":
      return "Failed after resume";
    case "approval_rejected":
      return approvalEventLabel("rejected");
    default:
      return status.replaceAll("_", " ");
  }
}

export function waitResumeFamilyLabel(record: {
  resume_family: string;
  resume_kind: string;
}): string {
  const family = record.resume_family.replaceAll("_", " ");
  const kind = record.resume_kind.replaceAll("_", " ");
  return family === kind ? family : `${family} · ${kind}`;
}

export function runTimelineWaitChainSummary(
  run: WorkflowRun,
): { pauseCount: number; resumeCount: number } {
  const timeline = Array.isArray(run.timeline) ? run.timeline : [];
  let pauseCount = 0;
  let resumeCount = 0;
  for (const step of timeline) {
    const status = typeof step.status === "string" ? step.status : "";
    if (status === "waiting_for_approval" || status === "waiting_for_resume") {
      pauseCount++;
    }
    const trace = isRecord(step.trace) ? step.trace : null;
    if (trace && trace.kind === "wait_resume_dispatch") {
      resumeCount++;
    }
  }
  return { pauseCount, resumeCount };
}
