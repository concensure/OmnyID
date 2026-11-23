import type {
  ContextGrantAction, SecureLinkSubmission, VendorContextProjection,
} from "./quotationResponseSessionApi";

export type AnswerDraft = { state: "confirmed" | "proposed" | "unknown"; answer: string };
export type CommercialKind = "money" | "boolean" | "date" | "text" | "inclusion" | "integer";

export type QuotationResponseFormState = {
  answers: Record<string, AnswerDraft>;
  availability: "available" | "unavailable" | "conditional" | "unknown";
  availabilityDate: string;
  availabilityNotes: string;
  commercialEnabled: boolean;
  commercialFactId: string;
  commercialKey: string;
  commercialKind: CommercialKind;
  commercialValue: string;
  currency: string;
  explanation: string;
  affirmed: boolean;
};

export type FormIssue = { field: string; message: string };

export function humanizeIdentifier(value: string): string {
  return value.replaceAll(/[._-]+/g, " ").replaceAll(/\b\w/g, (letter) => letter.toUpperCase());
}

export function safeProjectionFieldEntries(fields: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(fields).filter(([key]) =>
    !/(^|[._-])(competitor|other_vendor|private_note|hidden_preference|full_plan|internal_score|comparison_score)([._-]|$)/i.test(key));
}

export function initialQuotationResponseForm(projection: VendorContextProjection): QuotationResponseFormState {
  return {
    answers: Object.fromEntries(projection.question_ids.map((id) => [id, { state: "unknown", answer: "" }])),
    availability: "unknown", availabilityDate: "", availabilityNotes: "",
    commercialEnabled: false, commercialFactId: projection.fact_ids[0] ?? "",
    commercialKey: safeProjectionFieldEntries(projection.fields)[0]?.[0] ?? "", commercialKind: "money",
    commercialValue: "", currency: "AUD", explanation: "", affirmed: false,
  };
}

function currencyExponent(currency: string): number | null {
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  if (["JPY", "KRW", "VND"].includes(code)) return 0;
  if (["BHD", "JOD", "KWD", "OMR", "TND"].includes(code)) return 3;
  return 2;
}

function dateIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function validateQuotationResponseForm(
  state: QuotationResponseFormState,
  projection: VendorContextProjection,
): FormIssue[] {
  const issues: FormIssue[] = [];
  for (const id of projection.question_ids) {
    const answer = state.answers[id];
    if (answer?.state !== "unknown" && !answer.answer.trim()) {
      issues.push({ field: `question-${id}`, message: `${humanizeIdentifier(id)} needs an answer.` });
    }
    if ((answer?.answer.length ?? 0) > 4_000) issues.push({ field: `question-${id}`, message: `${humanizeIdentifier(id)} is too long.` });
  }
  if (state.commercialEnabled) {
    if (!projection.allowed_actions.includes("submit_revision")) issues.push({ field: "commercial-enabled", message: "This link does not allow quotation changes." });
    if (!projection.fact_ids.includes(state.commercialFactId)) issues.push({ field: "commercial-fact", message: "Choose an approved fact." });
    if (!safeProjectionFieldEntries(projection.fields).some(([key]) => key === state.commercialKey)) issues.push({ field: "commercial-key", message: "Choose an approved field." });
    if (!state.commercialValue.trim()) issues.push({ field: "commercial-value", message: "Enter the proposed value." });
    if (state.commercialKind === "money") {
      const exponent = currencyExponent(state.currency);
      const amount = Number(state.commercialValue);
      if (exponent === null || !Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * (10 ** (exponent ?? 0))))) {
        issues.push({ field: "commercial-value", message: "Enter a valid non-negative amount and three-letter currency." });
      }
    }
    if (state.commercialKind === "integer" && !Number.isSafeInteger(Number(state.commercialValue))) issues.push({ field: "commercial-value", message: "Enter a whole number." });
    if (state.commercialKind === "date" && !dateIso(state.commercialValue)) issues.push({ field: "commercial-value", message: "Enter a valid date." });
    if (state.commercialKind === "boolean" && !["true", "false"].includes(state.commercialValue)) issues.push({ field: "commercial-value", message: "Choose yes or no." });
  }
  if (state.availabilityDate && !dateIso(state.availabilityDate)) issues.push({ field: "availability-date", message: "Enter a valid availability date." });
  if (state.availabilityNotes.length > 2_000) issues.push({ field: "availability-notes", message: "Availability notes are too long." });
  if (state.explanation.length > 4_000) issues.push({ field: "explanation", message: "The explanation is too long." });
  if (!state.affirmed) issues.push({ field: "affirmed", message: "Confirm that the response is accurate before submitting." });
  return issues;
}

function selectedAction(state: QuotationResponseFormState, projection: VendorContextProjection): ContextGrantAction {
  if (state.commercialEnabled && projection.allowed_actions.includes("submit_revision")) return "submit_revision";
  if (projection.allowed_actions.includes("answer_questions")) return "answer_questions";
  if (projection.allowed_actions.includes("confirm_booking_details")) return "confirm_booking_details";
  return projection.allowed_actions[0] ?? "answer_questions";
}

function commercialValue(state: QuotationResponseFormState): SecureLinkSubmission["commercial_facts"][number]["value"] {
  if (state.commercialKind === "money") {
    const exponent = currencyExponent(state.currency) ?? 2;
    return { kind: "money", value: { amount_minor: Math.round(Number(state.commercialValue) * 10 ** exponent), currency: state.currency.trim().toUpperCase() } };
  }
  if (state.commercialKind === "integer") return { kind: "integer", value: Number(state.commercialValue) };
  if (state.commercialKind === "boolean") return { kind: "boolean", value: state.commercialValue === "true" };
  if (state.commercialKind === "date") return { kind: "date", value: dateIso(state.commercialValue)! };
  if (state.commercialKind === "inclusion") return { kind: "inclusion", value: state.commercialValue as "included" | "excluded" | "optional" | "unknown" };
  return { kind: "text", value: state.commercialValue.trim() };
}

export function buildQuotationResponseSubmission(
  state: QuotationResponseFormState,
  projection: VendorContextProjection,
): SecureLinkSubmission {
  const questionAnswers = projection.question_ids.map((questionId) => {
    const answer = state.answers[questionId] ?? { state: "unknown" as const, answer: "" };
    return {
      question_id: questionId, state: answer.state,
      ...(answer.state === "unknown" ? {} : { answer: answer.answer.trim() }), anchors: [] as [],
    };
  });
  const commercialFacts: SecureLinkSubmission["commercial_facts"] = state.commercialEnabled ? [{
    fact_id: state.commercialFactId, key: state.commercialKey, state: "proposed",
    value: commercialValue(state), anchors: [],
  }] : [];
  const availabilityDate = dateIso(state.availabilityDate);
  return {
    action: selectedAction(state, projection), question_answers: questionAnswers,
    commercial_facts: commercialFacts,
    availability: {
      state: state.availability,
      ...(availabilityDate ? { starts_at: availabilityDate } : {}),
      ...(state.availabilityNotes.trim() ? { notes: state.availabilityNotes.trim() } : {}),
      anchors: [],
    },
    ...(state.explanation.trim() ? { explanation: state.explanation.trim() } : {}),
    affirmed: state.affirmed,
  };
}

export function responsePreviewLines(submission: SecureLinkSubmission): string[] {
  const answers = submission.question_answers.map((answer) =>
    `${humanizeIdentifier(answer.question_id)}: ${answer.answer ?? "Unknown"}`);
  const facts = submission.commercial_facts.map((fact) =>
    `${humanizeIdentifier(fact.key)}: ${JSON.stringify(fact.value?.value)}`);
  return [...answers, ...facts, `Availability: ${humanizeIdentifier(submission.availability?.state ?? "unknown")}`,
    ...(submission.explanation ? [`Explanation: ${submission.explanation}`] : [])];
}
