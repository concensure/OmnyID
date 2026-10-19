import { apiFetch } from "@/lib/api";
import type { DecisionCardModel } from "@/lib/decisionCardState";
import {
  buildPlanningUnifiedInterventionState,
  normalizePlanningDecisionIntervention,
  type PlanningDecisionIntervention,
  type PlanningUnifiedInterventionA2ui,
} from "@/lib/planningUnifiedInterventionState";
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
  contract: PlanningDecisionIntervention;
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

export type PlanningConstraintInterventionA2ui = PlanningUnifiedInterventionA2ui;

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
  const intervention = normalizePlanningDecisionIntervention(root?.["intervention"]);
  const bindings = record(root?.["bindings"]);
  const draft = record(root?.["clarification_draft"]);
  const questions = Array.isArray(draft?.["questions"]) ? draft.questions : [];
  const firstQuestion = record(questions[0]);
  const interventionId = intervention?.interventionId ?? "";
  const decisionRef = intervention?.decisionRef ?? "";
  const constraintRef = identifier(bindings?.["constraint_ref"]);
  const evaluationRef = identifier(bindings?.["evaluation_ref"]);
  const quotationVersionId = identifier(bindings?.["quotation_version_id"]);
  const comparisonId = identifier(bindings?.["comparison_id"]);
  const comparisonRevision = identifier(bindings?.["comparison_revision"]);
  const clarificationDraftHash = identifier(bindings?.["clarification_draft_hash"]);
  const draftId = identifier(draft?.["draft_id"]);
  const recipient = text(draft?.["recipient"]);
  const options = (intervention?.options ?? []).flatMap((row) => {
    const id = optionId(row.id);
    return id ? [{ id, label: row.label, evidenceRefs: row.evidenceRefs }] : [];
  });
  const uniqueOptions = new Set(options.map((option) => option.id));
  if (!intervention || !interventionId || !decisionRef || !constraintRef || !evaluationRef
    || !quotationVersionId || !comparisonId || !comparisonRevision
    || !clarificationDraftHash || !draftId || !recipient.includes("@")
    || options.length !== OPTION_IDS.length || uniqueOptions.size !== OPTION_IDS.length) return null;
  const recommendedOptionId = optionId(intervention?.recommendedOptionId);
  const grantRevision = bindings?.["grant_revision"] == null
    ? null
    : identifier(bindings["grant_revision"]);
  if (bindings?.["grant_revision"] != null && !grantRevision) return null;
  return {
    contract: intervention,
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
  return planningConstraintInterventionState(value).card;
}

export function planningConstraintInterventionA2ui(
  value: PlanningConstraintIntervention,
): PlanningConstraintInterventionA2ui {
  return planningConstraintInterventionState(value).a2ui;
}

function planningConstraintInterventionState(value: PlanningConstraintIntervention) {
  return buildPlanningUnifiedInterventionState({
    intervention: value.contract,
    presentation: {
      title: "Resolve a planning requirement conflict",
      summary: "This option conflicts with something you confirmed. Your quote and comparison will stay visible whichever path you choose.",
      reasonLabels: [value.conflictEvidenceLabel],
      unknownLabels: value.unknownLabels,
      evidence: [{
        label: `You said: “${value.rememberedStatement}”`,
        ref: value.bindings.constraintRef,
        sourceKind: "confirmed_requirement",
        freshness: "current",
      }, {
        label: value.conflictEvidenceLabel,
        ref: value.bindings.evaluationRef,
        sourceKind: "current_comparison",
        freshness: "current",
      }],
      constraintLabels: [{ label: value.rememberedStatement, status: "conflict" }],
      verificationLabel: "Requirement and current comparison checked",
    },
  });
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
