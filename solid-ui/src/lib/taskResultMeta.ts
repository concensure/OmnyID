// @locs-version: 1.0
import { approvalRequestTitle, approvalRequiredStatusLabel } from "afp-ts/continuity";
import type { AfpMessage } from "@/lib/api";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";

export type ToolResultMetadata = {
  schema_version?: string;
  tool_slug?: string;
  tool_name?: string;
  capability?: string;
  connector_label?: string;
  artifact_label?: string;
  artifact_kind?: string;
  url?: string;
  title?: string;
  channel?: string;
  filename?: string;
};

export type TaskExecutionExplanation = {
  code?: string;
  status?: string;
  bounded?: boolean;
  text?: string;
  detail?: string | null;
};

export type TaskStatusPresentation = {
  dotClass: string;
  label: string;
  labelClass: string;
};

export type TaskIssuePresentation = {
  panelClass: string;
  headingClass: string;
  textClass: string;
};

export function asRecord(value: unknown): Record<string, unknown> {
  return afpRecord(value);
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function readToolResultMetadata(message: AfpMessage): ToolResultMetadata {
  const contentMeta = asRecord(asRecord(decryptedDisplayContent(message)).result_meta);
  if (Object.keys(contentMeta).length > 0) {
    return {
      schema_version: asString(contentMeta.schema_version),
      tool_slug: asString(contentMeta.tool_slug),
      tool_name: asString(contentMeta.tool_name),
      capability: asString(contentMeta.capability),
      connector_label: asString(contentMeta.connector_label),
      artifact_label: asString(contentMeta.artifact_label),
      artifact_kind: asString(contentMeta.artifact_kind),
      url: asString(contentMeta.url),
      title: asString(contentMeta.title),
      channel: asString(contentMeta.channel),
      filename: asString(contentMeta.filename),
    };
  }

  const toolResult = asRecord(asRecord(message.metadata).tool_result);
  const toolData = asRecord(toolResult.data);
  return {
    schema_version: asString(toolData.schema_version),
    tool_slug: asString(toolData.tool_slug),
    tool_name: asString(toolData.tool_name),
    capability: asString(toolData.capability),
    connector_label: asString(toolData.connector_label),
    artifact_label: asString(toolData.artifact_label),
    artifact_kind: asString(toolData.artifact_kind),
    url: asString(toolData.url),
    title: asString(toolData.title),
    channel: asString(toolData.channel),
    filename: asString(toolData.filename),
  };
}

export function artifactLabel(meta: ToolResultMetadata): string {
  return meta.artifact_label || meta.title || meta.filename || meta.channel || meta.url || "";
}

export function readTaskExecutionExplanation(message: AfpMessage): TaskExecutionExplanation | null {
  const contentExplanation = normalizeTaskExecutionExplanation(asRecord(decryptedDisplayContent(message)).execution_explanation);
  if (contentExplanation) return contentExplanation;
  return normalizeTaskExecutionExplanation(asRecord(message.metadata).execution_explanation);
}

export function normalizeTaskExecutionExplanation(value: unknown): TaskExecutionExplanation | null {
  const record = asRecord(value);
  const code = asString(record.code).trim();
  const status = asString(record.status).trim();
  const text = asString(record.text).trim();
  const detail = asString(record.detail).trim();
  if (!code && !status && !text && !detail) return null;
  return {
    code: code || undefined,
    status: status || undefined,
    bounded: typeof record.bounded === "boolean" ? record.bounded : undefined,
    text: text || undefined,
    detail: detail || undefined,
  };
}

export function normalizeTaskStatus(rawStatus: string): string {
  switch (rawStatus) {
    case "completed":
    case "ok":
      return "done";
    case "failed":
      return "blocked";
    case "timeout":
      return "blocked";
    case "policy_blocked":
    case "budget_blocked":
    case "approval_required":
    case "clarification_required":
      return "blocked";
    default:
      return rawStatus || "pending";
  }
}

export function humanizeTaskStatus(rawStatus: string): string {
  switch (rawStatus) {
    case "ok":
      return "Succeeded";
    case "partial_completion":
      return "Partial completion";
    case "capability_unavailable":
      return "Capability unavailable";
    case "policy_limited":
      return "Policy blocked";
    case "budget_blocked":
      return "Budget bounded";
    case "policy_blocked":
      return "Policy blocked";
    case "approval_required":
      return approvalRequiredStatusLabel();
    case "clarification_required":
      return "Needs clarification";
    case "timeout":
      return "Timed out";
    default:
      return rawStatus.replaceAll("_", " ").trim() || "pending";
  }
}

export function humanizeExecutionExplanationCode(code: string): string {
  switch (code) {
    case "completed":
      return "Completed";
    case "capability_unavailable":
      return "Capability unavailable";
    case "empty_plan":
      return "Empty plan";
    case "failed":
      return "Failed";
    case "fast_path_completed":
      return "Fast path";
    case "partial_completion":
      return "Partial completion";
    case "policy_limited":
      return "Policy blocked";
    case "timeout":
      return "Timed out";
    default:
      if (code.startsWith("step_")) {
        return `Step ${code.slice("step_".length).replaceAll("_", " ")}`.trim();
      }
      if (code.startsWith("reflection_")) {
        return `Reflection ${code.slice("reflection_".length).replaceAll("_", " ")}`.trim();
      }
      if (code.startsWith("escalated_")) {
        return `Escalated ${code.slice("escalated_".length).replaceAll("_", " ")}`.trim();
      }
      return code.replaceAll("_", " ").trim() || "unknown";
  }
}

export function taskStatusPresentation(rawStatus: string): TaskStatusPresentation {
  switch (rawStatus) {
    case "done":
    case "completed":
      return { dotClass: "bg-green-500", label: "Done", labelClass: "text-emerald-400" };
    case "ok":
      return { dotClass: "bg-green-500", label: "Succeeded", labelClass: "text-emerald-400" };
    case "in_progress":
    case "running":
      return {
        dotClass: "bg-blue-500 animate-pulse",
        label: rawStatus === "running" ? "Running" : "In progress",
        labelClass: "text-blue-400",
      };
    case "failed":
      return { dotClass: "bg-red-500", label: "Failed", labelClass: "text-red-400" };
    case "timeout":
    case "timed_out":
      return { dotClass: "bg-orange-500", label: "Timed out", labelClass: "text-orange-400" };
    case "budget_blocked":
      return { dotClass: "bg-amber-500", label: "Budget bounded", labelClass: "text-amber-400" };
    case "capability_unavailable":
      return { dotClass: "bg-slate-500", label: "Capability unavailable", labelClass: "text-slate-400" };
    case "policy_blocked":
    case "policy_limited":
      return { dotClass: "bg-amber-500", label: "Policy blocked", labelClass: "text-amber-400" };
    case "approval_required":
    case "needs_approval":
      return {
        dotClass: "bg-violet-500",
        label: approvalRequiredStatusLabel(),
        labelClass: "text-violet-400",
      };
    case "clarification_required":
    case "needs_clarification":
      return { dotClass: "bg-sky-500", label: "Needs clarification", labelClass: "text-sky-400" };
    case "blocked":
      return { dotClass: "bg-amber-500", label: "Blocked", labelClass: "text-amber-400" };
    case "cancelled":
      return { dotClass: "bg-slate-400", label: "Cancelled", labelClass: "text-slate-400" };
    case "pending":
    default:
      return {
        dotClass: "bg-yellow-400",
        label: rawStatus ? humanizeTaskStatus(rawStatus) : "Pending",
        labelClass: "text-yellow-400",
      };
  }
}

export function taskIssuePresentation(rawStatus: string): TaskIssuePresentation {
  switch (rawStatus) {
    case "budget_blocked":
      return {
        panelClass: "border-amber-300/30 bg-amber-500/10",
        headingClass: "text-amber-700/90",
        textClass: "text-amber-800/90",
      };
    case "policy_blocked":
    case "policy_limited":
      return {
        panelClass: "border-orange-300/30 bg-orange-500/10",
        headingClass: "text-orange-700/90",
        textClass: "text-orange-800/90",
      };
    case "capability_unavailable":
      return {
        panelClass: "border-slate-300/30 bg-slate-500/10",
        headingClass: "text-slate-700/90",
        textClass: "text-slate-800/90",
      };
    case "approval_required":
    case "needs_approval":
      return {
        panelClass: "border-violet-300/30 bg-violet-500/10",
        headingClass: "text-violet-700/90",
        textClass: "text-violet-800/90",
      };
    case "clarification_required":
    case "needs_clarification":
      return {
        panelClass: "border-sky-300/30 bg-sky-500/10",
        headingClass: "text-sky-700/90",
        textClass: "text-sky-800/90",
      };
    case "timeout":
    case "timed_out":
      return {
        panelClass: "border-rose-300/30 bg-rose-500/10",
        headingClass: "text-rose-700/90",
        textClass: "text-rose-800/90",
      };
    default:
      return {
        panelClass: "border-red-300/20 bg-red-500/10",
        headingClass: "text-red-600/80",
        textClass: "text-red-700/90",
      };
  }
}

export function taskExecutionExplanationText(explanation: TaskExecutionExplanation | null): string {
  if (!explanation) return "";
  const text = asString(explanation.text).trim();
  const detail = asString(explanation.detail).trim();
  if (!text) return detail;
  return detail && detail !== text ? `${text} ${detail}` : text;
}

export function taskExecutionExplanationChip(
  rawStatus: string,
  explanation: TaskExecutionExplanation | null,
): { label: string; className: string } | null {
  const code = asString(explanation?.code).trim();
  switch (code || rawStatus) {
    case "capability_unavailable":
      return {
        label: "Capability unavailable",
        className: "border-slate-200/70 bg-slate-50/85 text-slate-700",
      };
    case "empty_plan":
      return {
        label: "Empty plan",
        className: "border-slate-200/70 bg-slate-50/85 text-slate-700",
      };
    case "partial_completion":
      return {
        label: "Partial completion",
        className: "border-violet-200/70 bg-violet-50/85 text-violet-700",
      };
    case "budget_blocked":
      return {
        label: "Budget bounded",
        className: "border-amber-200/70 bg-amber-50/85 text-amber-700",
      };
    case "policy_blocked":
    case "policy_limited":
      return {
        label: "Policy blocked",
        className: "border-orange-200/70 bg-orange-50/85 text-orange-700",
      };
    case "approval_required":
      return {
        label: approvalRequestTitle(),
        className: "border-violet-200/70 bg-violet-50/85 text-violet-700",
      };
    case "clarification_required":
      return {
        label: "Needs clarification",
        className: "border-sky-200/70 bg-sky-50/85 text-sky-700",
      };
    case "timeout":
    case "timed_out":
      return {
        label: "Time bounded",
        className: "border-rose-200/70 bg-rose-50/85 text-rose-700",
      };
    default:
      return null;
  }
}
