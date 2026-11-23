import type { QuotationEvidenceView } from "@/lib/quotationEvidenceState";

export type QuotationReviewGroup = "totals" | "inclusions" | "extras" | "requirements" | "dates" | "terms";

export type QuotationReviewField = {
  id: string;
  label: string;
  valueLabel: string;
  group: QuotationReviewGroup;
  materiality: "high" | "medium" | "low";
  confidenceBps: number;
  reviewed: boolean;
  evidence: QuotationEvidenceView;
};

export type QuotationReviewAction =
  | { action: "confirm_line"; line_id: string }
  | { action: "mark_unknown"; line_id: string; reason: string }
  | { action: "mark_not_applicable"; line_id: string; reason: string }
  | { action: "reject_extraction"; reason: string };

export type QuotationReviewCommand = {
  command_id: string;
  expected_version_id: string;
  expected_material_fingerprint: string;
  actor_id: string;
  reviewed_at: string;
  action: QuotationReviewAction;
};

export type QuotationReviewState = {
  versionId: string;
  materialFingerprint: string;
  fields: QuotationReviewField[];
  pendingCommandId: string | null;
  error: string | null;
};

export function groupedReviewFields(fields: QuotationReviewField[]): Record<QuotationReviewGroup, QuotationReviewField[]> {
  const result: Record<QuotationReviewGroup, QuotationReviewField[]> = {
    totals: [], inclusions: [], extras: [], requirements: [], dates: [], terms: [],
  };
  for (const field of fields) result[field.group].push(field);
  return result;
}

export function blockingMaterialFieldIds(fields: QuotationReviewField[]): string[] {
  return fields
    .filter((field) => field.materiality === "high" && (
      !field.reviewed
      || field.confidenceBps < 8_000
      || field.evidence.state === "unknown"
      || field.evidence.state === "conflicting"
    ))
    .map((field) => field.id)
    .sort();
}

export function buildReviewCommand(
  state: QuotationReviewState,
  actorId: string,
  action: QuotationReviewAction,
  now: string,
): QuotationReviewCommand {
  const stable = `${state.versionId}:${state.materialFingerprint}:${actorId}:${action.action}:${"line_id" in action ? action.line_id : "all"}`;
  return {
    command_id: `qreview_${stable}`,
    expected_version_id: state.versionId,
    expected_material_fingerprint: state.materialFingerprint,
    actor_id: actorId,
    reviewed_at: now,
    action,
  };
}

export function beginReview(state: QuotationReviewState, command: QuotationReviewCommand): QuotationReviewState {
  if (command.expected_version_id !== state.versionId || command.expected_material_fingerprint !== state.materialFingerprint) {
    return { ...state, error: "This quotation changed. Reload it before reviewing.", pendingCommandId: null };
  }
  return { ...state, pendingCommandId: command.command_id, error: null };
}

export function reconcileReview(
  state: QuotationReviewState,
  commandId: string,
  successor: { version_id: string; material_fingerprint: string } | null,
): QuotationReviewState {
  if (state.pendingCommandId !== commandId) return state;
  if (!successor) return { ...state, pendingCommandId: null, error: "The review was not saved. Try again." };
  return {
    ...state,
    versionId: successor.version_id,
    materialFingerprint: successor.material_fingerprint,
    pendingCommandId: null,
    error: null,
  };
}
