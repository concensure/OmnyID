// @locs-version: 1.0
export type DecisionOsContinuityScopeLike = {
  memory_space?: string | null;
  author_mask?: string | null;
  author_type?: string | null;
  human_only?: boolean | null;
  is_human_authored?: boolean | null;
};

export function decisionScopeCueSummary(card: DecisionOsContinuityScopeLike): string | null {
  const memorySpace = card.memory_space?.trim();
  const authorMask = card.author_mask?.trim().toLowerCase();
  const authorType = card.author_type?.trim().toLowerCase();
  const humanGrounded = card.human_only === true
    || card.is_human_authored === true
    || authorType === "human";

  const parts: string[] = [];
  if (memorySpace) parts.push(`${memorySpace} context`);
  if (humanGrounded) {
    parts.push("human-grounded");
  } else if (authorMask === "private") {
    parts.push("private authored");
  }

  return parts.length > 0 ? `Scoped to ${parts.join(" and ")}.` : null;
}

export function continuityActionScopeCueSummary(item: DecisionOsContinuityScopeLike): string | null {
  return decisionScopeCueSummary(item);
}

export function calmPreparedPriorityDecision(card: {
  requires_approval?: boolean | null;
  description: string;
  action_label: string;
  prepared_draft_class?: string | null;
}): boolean {
  if (card.requires_approval) return false;
  const description = card.description.trim().toLowerCase();
  const actionLabel = card.action_label.trim().toLowerCase();
  return Boolean(card.prepared_draft_class)
    || description.includes("prepared response is ready for review")
    || description.includes("prepared work is ready for review")
    || description.includes("prepared decision support is ready for review")
    || description.includes("prepared context is ready for review")
    || actionLabel === "open responses"
    || actionLabel === "open workspace"
    || actionLabel === "open decision queue"
    || actionLabel === "open context";
}

export function calmPreparedActionDecision(item: {
  requires_approval?: boolean | null;
  suggested_action: string;
}): boolean {
  if (item.requires_approval) return false;
  const action = item.suggested_action.trim().toLowerCase();
  return action === "review prepared reply"
    || action === "review prepared work"
    || action === "review prepared decision support"
    || action === "review prepared context"
    || action === "open responses"
    || action === "open workspace"
    || action === "open decision queue"
    || action === "open context";
}

export function continuitySynthesisSourceSummary(args: {
  sourceSummary?: string | null;
  preparedDraftClass?: string | null;
  selectionReason?: string | null;
}): string | null {
  if (args.sourceSummary?.trim()) return args.sourceSummary.trim();
  if (args.preparedDraftClass || args.selectionReason?.toLowerCase().includes("prepared")) {
    return "Prepared from continuity state and ready for review";
  }
  return "Synthesized from continuity state";
}

export function continuityConfidenceScore(rawConfidence?: string | null): number | undefined {
  switch ((rawConfidence ?? "").trim().toLowerCase()) {
    case "high":
      return 0.9;
    case "medium":
      return 0.76;
    case "low":
      return 0.62;
    default:
      return undefined;
  }
}

export function continuityConfidenceExplanation(args: {
  confidence?: string | null;
  requiresApproval: boolean;
  preparedDraftClass?: string | null;
  sourceRefs?: string[];
  scopeCue?: string | null;
  selectionReason?: string | null;
}): string | undefined {
  const confidenceLabel = (args.confidence ?? "").trim().toLowerCase();
  if (!confidenceLabel) return undefined;

  const confidencePrefix =
    confidenceLabel === "high" ? "High confidence."
      : confidenceLabel === "medium" ? "Medium confidence."
      : "Lower confidence.";
  const evidenceCount = args.sourceRefs?.length ?? 0;
  const evidenceSummary =
    evidenceCount > 0
      ? `${evidenceCount} source reference${evidenceCount === 1 ? "" : "s"} support this lane`
      : "continuity state evidence supports this lane";
  const scopeSummary = args.scopeCue?.replace(/^Scoped to\s*/i, "").replace(/\.$/, "").trim();

  if (args.requiresApproval) {
    return `${confidencePrefix} Approval is still required, but ${evidenceSummary}${scopeSummary ? ` and it is scoped to ${scopeSummary}` : ""}.`;
  }

  if (args.preparedDraftClass || args.selectionReason?.toLowerCase().includes("prepared")) {
    return `${confidencePrefix} Prepared work is already ready for review, ${evidenceSummary}${scopeSummary ? `, and it is scoped to ${scopeSummary}` : ""}.`;
  }

  return `${confidencePrefix} ${evidenceSummary}${scopeSummary ? ` and it is scoped to ${scopeSummary}` : ""}.`;
}
