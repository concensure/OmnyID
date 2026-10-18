import { apiFetch } from "@/lib/api";
import type { DecisionCardModel } from "@/lib/decisionCardState";
import { safeWeddingUiText } from "@/lib/weddingHomeUiCopyState";

const OPTION_IDS = [
  "reject_candidate",
  "ask_vendor",
  "amend_constraint",
  "accept_conflict",
] as const;

export type PlanningConstraintInterventionOptionId = (typeof OPTION_IDS)[number];

export type PlanningConstraintInterventionPreparation = {
  threadId: string;
  planId: string;
  constraintId: string;
  comparisonId: string;
  quotationVersionId: string;
  recipient: string;
  grantMessageId?: string | null;
};

export type PlanningConstraintIntervention = {
  interventionId: string;
  decisionRef: string;
  rememberedStatement: string;
  conflictEvidenceLabel: string;
  unknownLabels: string[];
  recommendedOptionId: PlanningConstraintInterventionOptionId | null;
  options: Array<{
    id: PlanningConstraintInterventionOptionId;
    label: string;
    evidenceRefs: string[];
  }>;
  bindings: {
    constraintRef: string;
    evaluationRef: string;
    quotationVersionId: string;
    comparisonId: string;
    comparisonRevision: string;
    grantRevision: string | null;
    clarificationDraftHash: string;
  };
  clarificationDraft: {
    draftId: string;
    recipient: string;
    question: string;
  };
};

export type PlanningConstraintInterventionSelection = {
  inserted: boolean;
  messageId: string;
  selectedOptionId: PlanningConstraintInterventionOptionId;
  clarificationDraftMessageId: string | null;
  intervention: PlanningConstraintIntervention;
};

export type PlanningConstraintInterventionA2ui = {
  schema_version: "a2ui.v1";
  kind: "planning_constraint_intervention";
  title: string;
  layout: { type: "stack"; gap: "md" };
  nodes: Array<{
    id: string;
    type: "callout" | "insight_line" | "bullet_list" | "action_chips";
    props: Record<string, unknown>;
  }>;
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

function safeText(value: unknown, fallback: string, maximum = 500): string {
  return safeWeddingUiText(text(value).slice(0, maximum), fallback);
}

function optionId(value: unknown): PlanningConstraintInterventionOptionId | null {
  const candidate = text(value);
  return OPTION_IDS.includes(candidate as PlanningConstraintInterventionOptionId)
    ? candidate as PlanningConstraintInterventionOptionId
    : null;
}

function preparationBody(
  input: PlanningConstraintInterventionPreparation,
): Record<string, string> {
  const body: Record<string, string> = {
    thread_id: input.threadId,
    plan_id: input.planId,
    constraint_id: input.constraintId,
    comparison_id: input.comparisonId,
    quotation_version_id: input.quotationVersionId,
    recipient: input.recipient,
  };
  if (input.grantMessageId) body.grant_message_id = input.grantMessageId;
  return body;
}

export function planningConstraintInterventionUiEnabled(
  env: Record<string, unknown> = import.meta.env,
): boolean {
  return ["1", "true", "yes", "on"].includes(
    text(env["VITE_PLANNING_CONSTRAINT_INTERVENTION_ENABLED"]).toLowerCase(),
  );
}

export function planningConstraintInterventionPrepareRequest(
  input: PlanningConstraintInterventionPreparation,
) {
  return {
    path: "/planning/constraint-interventions/prepare",
    body: preparationBody(input),
  };
}

export function planningConstraintInterventionSelectRequest(input: {
  preparation: PlanningConstraintInterventionPreparation;
  selectedOptionId: PlanningConstraintInterventionOptionId;
  idempotencyKey: string;
}) {
  return {
    path: "/planning/constraint-interventions/select",
    body: {
      preparation: preparationBody(input.preparation),
      selected_option_id: input.selectedOptionId,
      idempotency_key: input.idempotencyKey,
    },
  };
}

export function normalizePlanningConstraintIntervention(
  value: unknown,
): PlanningConstraintIntervention | null {
  const root = record(value);
  const intervention = record(root?.["intervention"]);
  const bindings = record(root?.["bindings"]);
  const draft = record(root?.["clarification_draft"]);
  const questions = Array.isArray(draft?.["questions"]) ? draft.questions : [];
  const firstQuestion = record(questions[0]);
  const interventionId = identifier(intervention?.["intervention_id"]);
  const decisionRef = identifier(intervention?.["decision_ref"]);
  const constraintRef = identifier(bindings?.["constraint_ref"]);
  const evaluationRef = identifier(bindings?.["evaluation_ref"]);
  const quotationVersionId = identifier(bindings?.["quotation_version_id"]);
  const comparisonId = identifier(bindings?.["comparison_id"]);
  const comparisonRevision = identifier(bindings?.["comparison_revision"]);
  const clarificationDraftHash = identifier(bindings?.["clarification_draft_hash"]);
  const draftId = identifier(draft?.["draft_id"]);
  const recipient = text(draft?.["recipient"]);
  const rawOptions = Array.isArray(intervention?.["options"])
    ? intervention.options.slice(0, OPTION_IDS.length)
    : [];
  const options = rawOptions.flatMap((value) => {
    const row = record(value);
    const id = optionId(row?.["option_id"]);
    const label = safeText(row?.["label"], "Review this option", 180);
    const evidenceRefs = Array.isArray(row?.["evidence_refs"])
      ? row.evidence_refs.map(identifier).filter(Boolean).slice(0, 12)
      : [];
    return id ? [{ id, label, evidenceRefs }] : [];
  });
  const uniqueOptions = new Set(options.map((option) => option.id));
  if (!interventionId || !decisionRef || !constraintRef || !evaluationRef
    || !quotationVersionId || !comparisonId || !comparisonRevision
    || !clarificationDraftHash || !draftId || !recipient.includes("@")
    || options.length !== OPTION_IDS.length || uniqueOptions.size !== OPTION_IDS.length) return null;
  const recommendedOptionId = optionId(intervention?.["recommended_option_id"]);
  const grantRevision = bindings?.["grant_revision"] == null
    ? null
    : identifier(bindings["grant_revision"]);
  if (bindings?.["grant_revision"] != null && !grantRevision) return null;
  return {
    interventionId,
    decisionRef,
    rememberedStatement: safeText(
      root?.["remembered_statement"],
      "A confirmed planning requirement",
      500,
    ),
    conflictEvidenceLabel: safeText(
      root?.["conflict_evidence_label"],
      "Current checked evidence conflicts with this requirement.",
      500,
    ),
    unknownLabels: Array.isArray(root?.["unknown_labels"])
      ? root.unknown_labels.map((item) => safeText(item, "A detail still needs checking", 180)).slice(0, 8)
      : [],
    recommendedOptionId,
    options,
    bindings: {
      constraintRef,
      evaluationRef,
      quotationVersionId,
      comparisonId,
      comparisonRevision,
      grantRevision,
      clarificationDraftHash,
    },
    clarificationDraft: {
      draftId,
      recipient,
      question: safeText(
        firstQuestion?.["question"],
        "Can you confirm whether this option meets the requirement?",
        500,
      ),
    },
  };
}

export function planningConstraintInterventionDecisionCard(
  value: PlanningConstraintIntervention,
): DecisionCardModel {
  const recommended = value.options.find((option) => option.id === value.recommendedOptionId);
  const evidence = [
    {
      label: `You said: “${value.rememberedStatement}”`,
      ref: value.bindings.constraintRef,
      sourceKind: "confirmed_requirement",
      freshness: "current" as const,
    },
    {
      label: value.conflictEvidenceLabel,
      ref: value.bindings.evaluationRef,
      sourceKind: "current_comparison",
      freshness: "current" as const,
    },
  ];
  const actions = value.options.map((option) => ({
    id: option.id,
    label: option.label,
    role: option.id === value.recommendedOptionId ? "primary" as const : "secondary" as const,
    effect: option.id === "ask_vendor"
      ? "Records this choice and opens the approval-bound vendor question draft"
      : "Records this choice without changing the remembered requirement or quote history",
    intent: option.id,
  }));
  if (!actions.some((action) => action.role === "primary")) {
    actions[0] = { ...actions[0]!, role: "primary", effect: "Records this explicit choice" };
  }
  return {
    schema: "content.decision_card",
    pattern: "choose",
    patternVersion: "1.0",
    id: value.interventionId,
    title: "Resolve a planning requirement conflict",
    domain: "wedding",
    pressure: value.recommendedOptionId === "reject_candidate" ? "high" : "medium",
    whyItMatters: "This option conflicts with something you confirmed. Your quote and comparison will stay visible whichever path you choose.",
    recommendation: recommended
      ? { summary: recommended.label, reasons: [value.conflictEvidenceLabel] }
      : null,
    actions,
    evidence,
    confidence: {
      label: "Current checked conflict",
      reason: value.conflictEvidenceLabel,
    },
    timeSensitivity: null,
    visual: { kind: "none" },
    unknowns: value.unknownLabels,
    patternSlots: {
      options: value.options.map((option) => ({
        id: option.id,
        name: option.label,
        recommended: option.id === value.recommendedOptionId,
      })),
      payloadPreview: value.clarificationDraft.question,
    },
    verification: { status: "partial", label: "Requirement and current comparison checked" },
  };
}

export function planningConstraintInterventionA2ui(
  value: PlanningConstraintIntervention,
): PlanningConstraintInterventionA2ui {
  return {
    schema_version: "a2ui.v1",
    kind: "planning_constraint_intervention",
    title: "Resolve a planning requirement conflict",
    layout: { type: "stack", gap: "md" },
    nodes: [
      {
        id: "constraint-memory",
        type: "callout",
        props: {
          tone: "warning",
          title: "What you asked us to remember",
          body: value.rememberedStatement,
        },
      },
      {
        id: "constraint-conflict-evidence",
        type: "insight_line",
        props: {
          text: value.conflictEvidenceLabel,
          evidence_required: true,
          evidence_ref: value.bindings.evaluationRef,
        },
      },
      {
        id: "constraint-conflict-unknowns",
        type: "bullet_list",
        props: { title: "Still to confirm", items: value.unknownLabels },
      },
      {
        id: "constraint-conflict-actions",
        type: "action_chips",
        props: {
          actions: Object.fromEntries(value.options.map((option) => [option.id, {
            id: option.id,
            label: option.label,
            kind: "record_planning_intervention_decision",
            recommended: option.id === value.recommendedOptionId,
            intervention_ref: value.interventionId,
            comparison_revision: value.bindings.comparisonRevision,
          }])),
        },
      },
    ],
  };
}

export async function preparePlanningConstraintIntervention(
  input: PlanningConstraintInterventionPreparation,
): Promise<PlanningConstraintIntervention> {
  const request = planningConstraintInterventionPrepareRequest(input);
  const normalized = normalizePlanningConstraintIntervention(await apiFetch<unknown>(request.path, {
    method: "POST",
    bodyJson: request.body,
  }));
  if (!normalized) throw new Error("invalid planning intervention response");
  return normalized;
}

export async function selectPlanningConstraintIntervention(input: {
  preparation: PlanningConstraintInterventionPreparation;
  selectedOptionId: PlanningConstraintInterventionOptionId;
  idempotencyKey: string;
}): Promise<PlanningConstraintInterventionSelection> {
  const request = planningConstraintInterventionSelectRequest(input);
  const response = record(await apiFetch<unknown>(request.path, {
    method: "POST",
    bodyJson: request.body,
  }));
  const intervention = normalizePlanningConstraintIntervention(response?.["intervention"]);
  const decision = record(response?.["decision"]);
  const messageId = identifier(response?.["message_id"]);
  const selectedOptionId = optionId(decision?.["selected_option_id"]);
  const clarificationDraftMessageId = response?.["clarification_draft_message_id"] == null
    ? null
    : identifier(response["clarification_draft_message_id"]);
  if (!intervention || !messageId || !selectedOptionId) {
    throw new Error("invalid planning intervention selection response");
  }
  return {
    inserted: response?.["inserted"] === true,
    messageId,
    selectedOptionId,
    clarificationDraftMessageId,
    intervention,
  };
}

export function planningConstraintInterventionUserMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/401|unauthori|sign in/.test(message)) return "Sign in again to review this decision.";
  if (/404|not available|not found/.test(message)) return "This decision is not available yet.";
  if (/409|stale|revision|already in use/.test(message)) {
    return "This option changed. Refresh the comparison before deciding.";
  }
  return "We could not save this decision just now. Try again in a moment.";
}
