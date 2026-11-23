// @locs-version: 2.0
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import type { WeddingDecisionReportScopeState } from "@/lib/weddingDecisionReportScopeState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
} from "@/lib/weddingPlanningTemplateState";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function importedPrivateLabel(value: string): boolean {
  return /^wedding_import(?:$|:)/i.test(value)
    || /original upload/i.test(value)
    || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(value)
    || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value)
    || /\b[^,\s]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value);
}

function artifactTitleForTask(value: unknown): string {
  const title = clean(value) || "Source planning file";
  return importedPrivateLabel(title) ? "Imported private planning file" : title;
}

function existingScopeKey(task: WeddingPlanningTaskItem): string {
  const metadata = record(task.metadata);
  const selectedScope = record(metadata.selected_decision_scope);
  return [
    metadata.decision_report_scope_task === true ? "true" : clean(metadata.decision_report_scope_task),
    clean(selectedScope.selected_option_id),
    clean(selectedScope.status),
  ].join(":");
}

function scopeKey(scope: WeddingDecisionReportScopeState): string {
  return [
    "true",
    clean(scope.selectedOptionId),
    clean(scope.status),
  ].join(":");
}

function priorityFor(scope: WeddingDecisionReportScopeState): WeddingPlanningTaskItem["priority"] {
  if (scope.blockerLabels.some((label) => /source|price|availability/i.test(label))) return "high";
  if (scope.blockerLabels.length > 0) return "normal";
  return "low";
}

function titleFor(scope: WeddingDecisionReportScopeState): string {
  const label = scope.selectedOptionLabel ?? "selected option";
  if (scope.status === "scoped_ready") return `Use selected wedding option in follow-up reports: ${label}`;
  return `Resolve selected wedding option blockers before narrowing reports: ${label}`;
}

export function buildWeddingDecisionReportScopeTaskItems(input: {
  metadata?: unknown;
  scope?: WeddingDecisionReportScopeState | null;
  artifactId?: string | null;
  artifactTitle?: string | null;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
}): WeddingPlanningTaskItem[] {
  const scope = input.scope ?? null;
  if (!scope || scope.status === "no_selection" || !scope.selectedOptionId) return [];
  const existing = input.existingTaskItems ?? [];
  if (existing.some((task) => existingScopeKey(task) === scopeKey(scope))) return [];
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const artifactId = clean(input.artifactId);
  const artifactTitle = artifactTitleForTask(input.artifactTitle);
  const selectedLabel = scope.selectedOptionLabel ?? "Selected option";
  const taskId = [
    "wedding_task",
    "decision-report-scope",
    safeWeddingLabel(scope.selectedOptionId),
    safeWeddingLabel(metadata.responseWorkspaceId),
  ].join(":");
  const blockers = scope.blockerLabels.length > 0 ? scope.blockerLabels : ["No blockers; selected option can scope follow-up reports."];
  return [{
    id: taskId,
    title: titleFor(scope),
    kind: scope.status === "scoped_ready" ? "decision" : "vendor_follow_up",
    dueLabel: scope.status === "scoped_ready"
      ? "Before generating the next narrowed report"
      : "Before recommendation-quality report, outreach, deposit, or booking",
    priority: priorityFor(scope),
    source: "agent",
    reviewStatus: scope.status === "scoped_ready" ? "accepted" : "needs_review",
    approvalState: "draft",
    linkedArtifactId: artifactId || null,
    metadata: {
      ...metadata,
      decision_report_scope_task: true,
      second_order_loop: scope.status === "scoped_ready" ? "commitment_timing" : "budget_drift",
      second_order_evidence_labels: [
        `Selected option: ${selectedLabel}`,
        `Scope status: ${scope.status}`,
        ...blockers,
      ].slice(0, 6),
      selected_decision_scope: {
        selected_option_id: scope.selectedOptionId,
        selected_option_label: selectedLabel,
        status: scope.status,
        collapse_alternatives: scope.collapseAlternatives,
        include_alternatives_as_audit: scope.includeAlternativesAsAudit,
        artifact_id: artifactId || null,
        artifact_title: artifactTitle,
      },
      report_instruction: scope.reportInstructionLabel,
      report_scope_blocker_labels: scope.blockerLabels,
      report_scope_audit_context_labels: scope.auditContextLabels,
      report_scope_next_action_labels: scope.nextActionLabels,
    },
    notes: [
      scope.reportInstructionLabel,
      ...scope.nextActionLabels,
      ...blockers,
    ].join(" "),
  }];
}
