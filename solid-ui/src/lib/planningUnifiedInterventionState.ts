import type {
  DecisionCardAction,
  DecisionCardEvidence,
  DecisionCardModel,
} from "@/lib/decisionCardState";
import { safeWeddingUiText } from "@/lib/weddingHomeUiCopyState";

const REASON_CODES = [
  "constraint_conflict",
  "budget_tradeoff",
  "critical_dependency",
  "vendor_change",
  "preference_conflict",
] as const;
const PREPARED_ACTION_KINDS = ["research", "compare", "draft"] as const;

export type PlanningInterventionReasonCode = (typeof REASON_CODES)[number];
export type PlanningInterventionPreparedActionKind = (typeof PREPARED_ACTION_KINDS)[number];

export type PlanningDecisionIntervention = {
  schemaVersion: "decision.intervention.v1";
  interventionId: string;
  decisionRef: string;
  options: Array<{
    id: string;
    label: string;
    consequenceCodes: string[];
    evidenceRefs: string[];
  }>;
  recommendedOptionId: string | null;
  reasonCodes: PlanningInterventionReasonCode[];
  unknownCodes: string[];
  consequenceSummaryCodes: string[];
  preparedNextAction: {
    kind: PlanningInterventionPreparedActionKind;
    targetRef: string;
  } | null;
};

export type PlanningUnifiedInterventionPresentation = {
  title?: string | null;
  summary?: string | null;
  reasonLabels?: readonly string[] | null;
  costRangeLabel?: string | null;
  timingLabel?: string | null;
  timingAt?: string | null;
  unknownLabels?: readonly string[] | null;
  evidence?: readonly DecisionCardEvidence[] | null;
  constraintLabels?: readonly {
    label: string;
    status: "satisfied" | "conflict" | "unknown";
  }[] | null;
  verificationLabel?: string | null;
};

export type PlanningUnifiedInterventionA2ui = {
  schema_version: "a2ui.v1";
  kind: "planning_unified_intervention";
  title: string;
  layout: { type: "stack"; gap: "md" };
  nodes: Array<{
    id: string;
    type: "callout" | "comparison_table" | "constraint_badges" | "stat_row"
      | "insight_line" | "bullet_list" | "action_chips";
    props: Record<string, unknown>;
  }>;
};

export type PlanningUnifiedInterventionState = {
  intervention: PlanningDecisionIntervention;
  card: DecisionCardModel;
  a2ui: PlanningUnifiedInterventionA2ui;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function identifier(value: unknown): string {
  const candidate = text(value);
  return candidate && candidate.length <= 180 && !/\s|@/.test(candidate) ? candidate : "";
}

function code(value: unknown): string {
  const candidate = text(value);
  return /^[a-z0-9_.-]{1,100}$/.test(candidate) ? candidate : "";
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const set = new Set(allowed);
  return Object.keys(value).every((key) => set.has(key));
}

function codes(value: unknown, maximum: number): string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const normalized = value.map(code);
  return normalized.every(Boolean) ? normalized : null;
}

function identifiers(value: unknown, maximum: number): string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const normalized = value.map(identifier);
  return normalized.every(Boolean) ? normalized : null;
}

function safeLabel(value: unknown, fallback: string, maximum = 240): string {
  const candidate = text(value).slice(0, maximum);
  const copySafetyProbe = candidate
    .replace(/[$€£¥]\s?\d[\d,.]*/g, "price")
    .replace(/\b[A-Z]{3}\s+\d[\d,.]*/g, "price");
  return safeWeddingUiText(copySafetyProbe, "") ? candidate : fallback;
}

function safeLabels(values: readonly unknown[] | null | undefined, fallback: string, maximum = 12): string[] {
  return (values ?? []).slice(0, maximum).map((value) => safeLabel(value, fallback, 240));
}

export function planningUnifiedInterventionUiEnabled(
  env: Record<string, unknown> = import.meta.env,
): boolean {
  return ["1", "true", "yes", "on"].includes(
    text(env["VITE_PLANNING_UNIFIED_INTERVENTIONS_ENABLED"]).toLowerCase(),
  );
}

export function normalizePlanningDecisionIntervention(
  value: unknown,
): PlanningDecisionIntervention | null {
  const root = record(value);
  if (!root || !exactKeys(root, [
    "schema_version", "intervention_id", "decision_ref", "options",
    "recommended_option_id", "reason_codes", "unknown_codes",
    "consequence_summary_codes", "prepared_next_action",
  ]) || root.schema_version !== "decision.intervention.v1") return null;
  const interventionId = identifier(root.intervention_id);
  const decisionRef = identifier(root.decision_ref);
  const rawOptions = Array.isArray(root.options) && root.options.length >= 1 && root.options.length <= 12
    ? root.options
    : null;
  const reasonCodes = codes(root.reason_codes, 10);
  const unknownCodes = codes(root.unknown_codes, 30);
  const consequenceSummaryCodes = codes(root.consequence_summary_codes, 30);
  if (!interventionId || !decisionRef || !rawOptions || !reasonCodes || !unknownCodes
    || !consequenceSummaryCodes) return null;
  const options: PlanningDecisionIntervention["options"] = [];
  const optionIds = new Set<string>();
  for (const value of rawOptions) {
    const option = record(value);
    if (!option || !exactKeys(option, ["option_id", "label", "consequence_codes", "evidence_refs"])) return null;
    const id = identifier(option.option_id);
    const label = text(option.label);
    const consequenceCodes = codes(option.consequence_codes, 30);
    const evidenceRefs = identifiers(option.evidence_refs, 30);
    if (!id || !label || label.length > 180 || !consequenceCodes || !evidenceRefs || optionIds.has(id)) return null;
    optionIds.add(id);
    options.push({ id, label: safeLabel(label, "Review this option", 180), consequenceCodes, evidenceRefs });
  }
  const recommendedOptionId = root.recommended_option_id == null
    ? null
    : identifier(root.recommended_option_id);
  if ((root.recommended_option_id != null && !recommendedOptionId)
    || (recommendedOptionId && !optionIds.has(recommendedOptionId))
    || (recommendedOptionId && (reasonCodes.length === 0
      || options.every((option) => option.evidenceRefs.length === 0)))) return null;
  const prepared = root.prepared_next_action == null ? null : record(root.prepared_next_action);
  let preparedNextAction: PlanningDecisionIntervention["preparedNextAction"] = null;
  if (prepared) {
    const kind = text(prepared.kind) as PlanningInterventionPreparedActionKind;
    const targetRef = identifier(prepared.target_ref);
    if (!exactKeys(prepared, ["kind", "target_ref"])
      || !PREPARED_ACTION_KINDS.includes(kind) || !targetRef) return null;
    preparedNextAction = { kind, targetRef };
  } else if (root.prepared_next_action != null) return null;
  if (reasonCodes.some((item) => !REASON_CODES.includes(item as PlanningInterventionReasonCode))) return null;
  return {
    schemaVersion: "decision.intervention.v1",
    interventionId,
    decisionRef,
    options,
    recommendedOptionId,
    reasonCodes: reasonCodes as PlanningInterventionReasonCode[],
    unknownCodes,
    consequenceSummaryCodes,
    preparedNextAction,
  };
}

const REASON_LABELS: Record<PlanningInterventionReasonCode, string> = {
  constraint_conflict: "A confirmed requirement conflicts with current evidence.",
  budget_tradeoff: "The current choice changes the budget forecast.",
  critical_dependency: "The saved dependency order makes this time-sensitive.",
  vendor_change: "The vendor changed a term that needs your decision.",
  preference_conflict: "The partners' stated preferences point in different directions.",
};

const CONSEQUENCE_LABELS: Record<string, string> = {
  candidate_rejected: "Removes this candidate from the active choice.",
  approval_required_before_send: "Prepares a draft; sending still requires approval.",
  constraint_review_required: "Opens the saved requirement for review.",
  conflict_explicitly_accepted: "Records that this conflict was explicitly accepted.",
  decision_appends_without_mutating_history: "Adds a decision without rewriting prior evidence.",
  vendor_message_requires_separate_approval: "Any vendor message remains separately approval-gated.",
};

function consequenceLabel(codes: readonly string[]): string {
  return codes.map((item) => CONSEQUENCE_LABELS[item]).find(Boolean)
    ?? "Records this option without sending, booking or paying.";
}

function pressureFor(intervention: PlanningDecisionIntervention): DecisionCardModel["pressure"] {
  if (intervention.reasonCodes.includes("critical_dependency")) return "high";
  if (intervention.reasonCodes.includes("constraint_conflict")) return "high";
  return "medium";
}

function safeEvidence(values: readonly DecisionCardEvidence[] | null | undefined): DecisionCardEvidence[] {
  return (values ?? []).slice(0, 8).flatMap((item) => {
    const ref = identifier(item.ref);
    if (!ref) return [];
    return [{
      label: safeLabel(item.label, "Current evidence checked", 240),
      ref,
      sourceKind: code(item.sourceKind) || "planning_evidence",
      observedAt: item.observedAt && Number.isFinite(Date.parse(item.observedAt)) ? item.observedAt : null,
      freshness: ["current", "aging", "unknown"].includes(item.freshness) ? item.freshness : "unknown",
    } as DecisionCardEvidence];
  });
}

function actionsFor(intervention: PlanningDecisionIntervention): DecisionCardAction[] {
  const primaryId = intervention.recommendedOptionId ?? intervention.options[0]!.id;
  const ordered = [...intervention.options].sort((left, right) =>
    Number(right.id === primaryId) - Number(left.id === primaryId));
  return ordered.slice(0, 4).map((option) => ({
    id: option.id,
    label: option.label,
    role: option.id === primaryId ? "primary" : "secondary",
    effect: `${consequenceLabel(option.consequenceCodes)} Nothing is sent, booked or paid automatically.`,
    intent: "record_planning_intervention_decision",
  }));
}

export function buildPlanningUnifiedA2ui(input: {
  card: DecisionCardModel;
  presentation?: PlanningUnifiedInterventionPresentation | null;
  optionEvidenceCounts?: Readonly<Record<string, number>>;
  preparedOnly?: boolean;
}): PlanningUnifiedInterventionA2ui {
  const presentation = input.presentation ?? {};
  const title = safeLabel(presentation.title ?? input.card.title, "Review this planning decision", 180);
  const summary = safeLabel(
    presentation.summary ?? input.card.whyItMatters,
    "Review the current evidence and choose the next step that fits your plan.",
    500,
  );
  const evidence = safeEvidence(presentation.evidence ?? input.card.evidence);
  const suppliedReasons = safeLabels(presentation.reasonLabels, "Current evidence supports this review", 6);
  const reasons = suppliedReasons.length > 0
    ? suppliedReasons
    : safeLabels(input.card.recommendation?.reasons, "Current evidence supports this review", 6);
  const suppliedUnknowns = safeLabels(presentation.unknownLabels, "A detail still needs checking", 12);
  const unknowns = suppliedUnknowns.length > 0
    ? suppliedUnknowns
    : safeLabels(input.card.unknowns, "A detail still needs checking", 12);
  const costRangeLabel = presentation.costRangeLabel
    ? safeLabel(presentation.costRangeLabel, "Cost is still being confirmed", 180)
    : null;
  const timingLabel = presentation.timingLabel
    ? safeLabel(presentation.timingLabel, "Timing is still being confirmed", 180)
    : input.card.timeSensitivity?.label
      ? safeLabel(input.card.timeSensitivity.label, "Timing is still being confirmed", 180)
      : null;
  const constraintLabels = (presentation.constraintLabels ?? []).slice(0, 12).map((item) => ({
    kind: item.status,
    label: safeLabel(item.label, "Saved requirement", 180),
  }));
  const options = input.card.patternSlots.options ?? [];
  const nodes: PlanningUnifiedInterventionA2ui["nodes"] = [{
    id: "intervention-summary",
    type: "callout",
    props: { tone: input.card.pressure === "high" ? "warning" : "info", title, body: summary },
  }];
  if (options.length > 0) nodes.push({
    id: "intervention-options",
    type: "comparison_table",
    props: {
      title: "Options",
      description: "Every option remains visible before you choose.",
      columns: ["Consequence", "Evidence"],
      rows: options.map((option) => {
        const evidenceCount = input.optionEvidenceCounts?.[option.id] ?? evidence.length;
        return {
          label: safeLabel(option.name, "Review this option", 180),
          values: [
            safeLabel(option.summary, "Review what this option changes", 240),
            evidenceCount > 0
              ? `${evidenceCount} checked source${evidenceCount === 1 ? "" : "s"}`
              : "Evidence still to check",
          ],
        };
      }),
    },
  });
  if (constraintLabels.length > 0) nodes.push({
    id: "intervention-constraints",
    type: "constraint_badges",
    props: { items: constraintLabels },
  });
  if (costRangeLabel || timingLabel) nodes.push({
    id: "intervention-cost-timing",
    type: "stat_row",
    props: {
      title: "Cost and timing",
      stats: [
        ...(costRangeLabel ? [{ label: "Cost", value: costRangeLabel }] : []),
        ...(timingLabel ? [{ label: "Timing", value: timingLabel }] : []),
      ],
    },
  });
  if (input.card.recommendation && reasons.length > 0) nodes.push({
    id: "intervention-recommendation",
    type: "insight_line",
    props: {
      title: safeLabel(input.card.recommendation.summary, "Recommendation", 180),
      secondary: reasons.join(" "),
      badge: "Recommendation",
      badge_tone: "success",
    },
  });
  if (unknowns.length > 0) nodes.push({
    id: "intervention-unknowns",
    type: "bullet_list",
    props: { title: "Still to confirm", items: unknowns },
  });
  if (evidence.length > 0) nodes.push({
    id: "intervention-evidence",
    type: "bullet_list",
    props: { title: "Evidence checked", items: evidence.map((item) => item.label) },
  });
  nodes.push({
    id: "intervention-actions",
    type: "action_chips",
    props: { actions: input.card.actions.slice(0, 4).map((action) => ({
      id: action.id,
      label: safeLabel(action.label, "Review", 180),
      kind: action.intent,
      role: action.role,
      effect: safeLabel(action.effect, "Nothing changes automatically", 240),
      prepared_only: input.preparedOnly === true,
    })) },
  });
  return {
    schema_version: "a2ui.v1",
    kind: "planning_unified_intervention",
    title,
    layout: { type: "stack", gap: "md" },
    nodes,
  };
}

export function buildPlanningUnifiedInterventionState(input: {
  intervention: PlanningDecisionIntervention;
  presentation?: PlanningUnifiedInterventionPresentation | null;
}): PlanningUnifiedInterventionState {
  const { intervention } = input;
  const presentation = input.presentation ?? {};
  const title = safeLabel(presentation.title, "Review this planning decision", 180);
  const summary = safeLabel(
    presentation.summary,
    "Review the current evidence and choose the next step that fits your plan.",
    500,
  );
  const evidence = safeEvidence(presentation.evidence);
  const reasonLabels = safeLabels(presentation.reasonLabels, "Current evidence supports this review", 6);
  const reasons = reasonLabels.length > 0
    ? reasonLabels
    : intervention.reasonCodes.map((reason) => REASON_LABELS[reason]);
  const recommended = intervention.options.find((option) => option.id === intervention.recommendedOptionId);
  const unknownLabels = safeLabels(presentation.unknownLabels, "A detail still needs checking", 12);
  const unknowns = unknownLabels.length > 0
    ? unknownLabels
    : intervention.unknownCodes.length > 0 ? ["One or more details still need checking."] : [];
  const costRangeLabel = presentation.costRangeLabel
    ? safeLabel(presentation.costRangeLabel, "Cost is still being confirmed", 180)
    : null;
  const timingLabel = presentation.timingLabel
    ? safeLabel(presentation.timingLabel, "Timing is still being confirmed", 180)
    : null;
  const timingAt = presentation.timingAt && Number.isFinite(Date.parse(presentation.timingAt))
    ? presentation.timingAt
    : null;
  const actions = actionsFor(intervention);
  const reviewItems = [costRangeLabel ? `Cost: ${costRangeLabel}` : null]
    .filter((item): item is string => Boolean(item));
  const card: DecisionCardModel = {
    schema: "content.decision_card",
    pattern: intervention.options.length > 1 ? "choose" : "review",
    patternVersion: "1.0",
    id: intervention.interventionId,
    title,
    domain: "wedding",
    pressure: pressureFor(intervention),
    whyItMatters: summary,
    recommendation: recommended && evidence.length > 0 && reasons.length > 0
      ? { summary: recommended.label, reasons }
      : null,
    actions,
    evidence,
    confidence: evidence.length > 0 ? {
      label: "Current evidence attached",
      reason: reasons.join(" "),
    } : null,
    timeSensitivity: timingLabel ? { label: timingLabel, at: timingAt } : null,
    visual: { kind: "none" },
    unknowns,
    patternSlots: {
      options: intervention.options.map((option) => ({
        id: option.id,
        name: option.label,
        summary: consequenceLabel(option.consequenceCodes),
        recommended: option.id === intervention.recommendedOptionId,
      })),
      reviewItems,
    },
    verification: {
      status: evidence.length > 0 ? "partial" : "unverified",
      label: safeLabel(
        presentation.verificationLabel,
        evidence.length > 0 ? "Current planning evidence checked" : "Evidence still to check",
        180,
      ),
    },
  };
  const a2ui = buildPlanningUnifiedA2ui({
    card,
    presentation,
    optionEvidenceCounts: Object.fromEntries(
      intervention.options.map((option) => [option.id, option.evidenceRefs.length]),
    ),
    preparedOnly: intervention.preparedNextAction !== null,
  });
  return {
    intervention,
    card,
    a2ui,
  };
}
