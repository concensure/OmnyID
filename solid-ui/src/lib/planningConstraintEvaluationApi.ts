import { apiFetch } from "@/lib/api";
import { safeWeddingUiText } from "@/lib/weddingHomeUiCopyState";
import type { WeddingConstraintEvaluationRecommendation } from "@/lib/weddingRecommendationExplanationState";

export type PlanningConstraintEvaluationTarget =
  | {
    kind: "quotation";
    threadId: string;
    planId: string;
    comparisonId: string;
    quotationVersionId: string;
  }
  | {
    kind: "directory";
    threadId: string;
    planId: string;
    vendorId: string;
  };

export type PlanningConstraintEvaluationResult = {
  candidateRevisionRef: string;
  evaluations: WeddingConstraintEvaluationRecommendation[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function boundedIdentifier(value: unknown): string {
  const candidate = text(value);
  return candidate && candidate.length <= 180 && !/\s|@/.test(candidate) ? candidate : "";
}

export function planningConstraintEvaluationUiEnabled(
  env: Record<string, unknown> = import.meta.env,
): boolean {
  return ["1", "true", "yes", "on"].includes(
    text(env["VITE_PLANNING_CONSTRAINT_EVALUATION_ENABLED"]).toLowerCase(),
  );
}

export function planningConstraintEvaluationRequest(target: PlanningConstraintEvaluationTarget): {
  path: string;
  body: Record<string, string>;
} {
  if (target.kind === "quotation") {
    return {
      path: "/planning/constraint-evaluations",
      body: {
        thread_id: target.threadId,
        plan_id: target.planId,
        comparison_id: target.comparisonId,
        quotation_version_id: target.quotationVersionId,
      },
    };
  }
  return {
    path: "/planning/directory-constraint-evaluations",
    body: {
      thread_id: target.threadId,
      plan_id: target.planId,
      vendor_id: target.vendorId,
    },
  };
}

export function normalizePlanningConstraintEvaluationResponse(
  value: unknown,
): PlanningConstraintEvaluationResult {
  const root = record(value);
  const candidateRevisionRef = boundedIdentifier(root?.["candidate_revision_ref"]);
  const rows = Array.isArray(root?.["evaluations"]) ? root.evaluations.slice(0, 50) : [];
  const evaluations = rows.flatMap((value): WeddingConstraintEvaluationRecommendation[] => {
    const row = record(value);
    const evaluation = record(row?.["evaluation"]);
    const presentation = record(row?.["presentation"]);
    const evaluationId = boundedIdentifier(evaluation?.["evaluation_id"]);
    const constraintRef = boundedIdentifier(evaluation?.["constraint_ref"]);
    const candidateRef = boundedIdentifier(evaluation?.["candidate_ref"]);
    const result = text(evaluation?.["result"]);
    const severity = text(evaluation?.["severity"]);
    if (!evaluationId || !constraintRef || !candidateRef || candidateRef !== candidateRevisionRef
      || !["satisfied", "conflict", "unknown", "not_applicable"].includes(result)
      || !["blocking", "decision_relevant", "informational"].includes(severity)) return [];
    return [{
      evaluationId,
      constraintRef,
      candidateRevisionRef: candidateRef,
      result: result as WeddingConstraintEvaluationRecommendation["result"],
      severity: severity as WeddingConstraintEvaluationRecommendation["severity"],
      title: safeWeddingUiText(
        text(presentation?.["title"]).slice(0, 180),
        "Planning requirement needs review",
      ),
      evidenceLabel: safeWeddingUiText(
        text(presentation?.["evidence_label"]).slice(0, 220),
        "Current option evidence needs checking.",
      ),
    }];
  });
  return { candidateRevisionRef, evaluations };
}

export async function fetchPlanningConstraintEvaluations(
  target: PlanningConstraintEvaluationTarget,
): Promise<PlanningConstraintEvaluationResult> {
  const request = planningConstraintEvaluationRequest(target);
  return normalizePlanningConstraintEvaluationResponse(await apiFetch<unknown>(request.path, {
    method: "POST",
    bodyJson: request.body,
  }));
}

export function planningConstraintEvaluationUserMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/401|unauthori|sign in/.test(message)) return "Sign in again to check this option.";
  if (/404|not available|not found/.test(message)) return "This option check is not available yet.";
  if (/409|stale|revision/.test(message)) return "This option changed. Refresh it before comparing.";
  return "We could not check this option just now. Try again in a moment.";
}
