// @locs-version: 1.0
import { autonomyDecisionSummary } from "afp-ts/continuity";

export type AutonomyDecisionSummaryLike = {
  autonomy_level?: string | null;
  action_autonomy?: string | null;
  reversibility?: string | null;
  consequence_level?: string | null;
  confidence?: string | null;
  approval_required?: boolean | null;
  interruption_budget?: string | null;
  reason?: string | null;
};

type AutonomySummaryWithFallbackInput = {
  autonomyDecision?: AutonomyDecisionSummaryLike | null;
  autonomyTier?: string | null;
  requiresApproval?: boolean | null;
  confidence?: string | null;
  reason?: string | null;
  reversibility?: string | null;
  consequenceLevel?: string | null;
  interruptionBudget?: string | null;
  actionAutonomy?: string | null;
  defaultAutonomyLevel?: string | null;
};

function trimmed(value: string | null | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

function fallbackAutonomyLevel(input: AutonomySummaryWithFallbackInput): string | undefined {
  const actionAutonomy = trimmed(input.autonomyDecision?.action_autonomy) ?? trimmed(input.actionAutonomy);
  if (actionAutonomy === "silent") return "prepare_silently";
  if (actionAutonomy === "soft_confirm") return "execute_reversible";
  if (actionAutonomy === "hard_confirm") return "request_approval";

  return trimmed(input.autonomyTier)
    ?? trimmed(input.defaultAutonomyLevel)
    ?? (input.requiresApproval === true
      ? "request_approval"
      : input.requiresApproval === false
        ? "suggest_with_artifact"
        : undefined);
}

export function autonomySummaryWithFallback(
  input: AutonomySummaryWithFallbackInput,
): string | null {
  const explicitSummary = autonomyDecisionSummary(input.autonomyDecision ?? null);
  if (explicitSummary) return explicitSummary;

  const autonomyLevel = fallbackAutonomyLevel(input);
  if (!autonomyLevel) return null;

  return autonomyDecisionSummary({
    autonomy_level: autonomyLevel,
    approval_required: input.autonomyDecision?.approval_required ?? input.requiresApproval ?? undefined,
    confidence: trimmed(input.autonomyDecision?.confidence) ?? trimmed(input.confidence),
    reason: trimmed(input.autonomyDecision?.reason) ?? trimmed(input.reason),
    reversibility: trimmed(input.autonomyDecision?.reversibility) ?? trimmed(input.reversibility),
    consequence_level:
      trimmed(input.autonomyDecision?.consequence_level) ?? trimmed(input.consequenceLevel),
    interruption_budget:
      trimmed(input.autonomyDecision?.interruption_budget) ?? trimmed(input.interruptionBudget),
  });
}
