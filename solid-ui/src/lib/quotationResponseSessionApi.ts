export type ContextGrantAction = "answer_questions" | "submit_revision" | "confirm_booking_details";

export type VendorContextProjection = {
  projection_version: string;
  projection_fingerprint: string;
  grant_id: string;
  recipient_vendor_id: string;
  quotation_id: string;
  quotation_version_id: string;
  thread_id: string;
  response_recipient_id: string;
  purpose: "resolve_quote_gaps" | "refine_vendor_package" | "confirm_booking_details";
  allowed_actions: ContextGrantAction[];
  question_ids: string[];
  fields: Record<string, unknown>;
  fact_ids: string[];
  provenance_refs: string[];
};

export type QuotationResponseSession = {
  sessionId: string;
  expiresAt: string;
  capabilityExpiresAt: string;
  csrfToken: string;
  submissionNonce: string;
  projection: VendorContextProjection;
};

export type SecureLinkSubmission = {
  action: ContextGrantAction;
  question_answers: Array<{
    question_id: string;
    state: "confirmed" | "proposed" | "unknown";
    answer?: string;
    anchors: [];
  }>;
  commercial_facts: Array<{
    fact_id: string;
    key: string;
    state: "proposed" | "unknown";
    value?:
      | { kind: "money"; value: { amount_minor: number; currency: string } }
      | { kind: "boolean"; value: boolean }
      | { kind: "date"; value: string }
      | { kind: "text"; value: string }
      | { kind: "inclusion"; value: "included" | "excluded" | "optional" | "unknown" }
      | { kind: "integer"; value: number };
    anchors: [];
  }>;
  availability?: {
    state: "available" | "unavailable" | "conditional" | "unknown";
    starts_at?: string;
    ends_at?: string;
    notes?: string;
    anchors: [];
  };
  explanation?: string;
  affirmed: boolean;
};

export type SubmissionReceipt = {
  status: "received";
  receiptId: string;
  requiresUserReview: true;
  accepted: false;
  booking: false;
  paymentExecution: false;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function projection(value: unknown): VendorContextProjection | null {
  const candidate = record(value);
  const fields = record(candidate?.fields);
  const actions = candidate?.allowed_actions;
  const questions = candidate?.question_ids;
  const facts = candidate?.fact_ids;
  if (!candidate || !fields || !Array.isArray(actions) || !Array.isArray(questions) || !Array.isArray(facts)) return null;
  const required = [
    "projection_version", "projection_fingerprint", "grant_id", "recipient_vendor_id",
    "quotation_id", "quotation_version_id", "thread_id", "response_recipient_id", "purpose",
  ].map((key) => text(candidate[key]));
  if (required.some((value) => value === null)) return null;
  return {
    projection_version: required[0]!, projection_fingerprint: required[1]!, grant_id: required[2]!,
    recipient_vendor_id: required[3]!, quotation_id: required[4]!, quotation_version_id: required[5]!,
    thread_id: required[6]!, response_recipient_id: required[7]!,
    purpose: required[8]! as VendorContextProjection["purpose"],
    allowed_actions: actions.filter((value): value is ContextGrantAction =>
      value === "answer_questions" || value === "submit_revision" || value === "confirm_booking_details"),
    question_ids: questions.filter((value): value is string => typeof value === "string"),
    fields, fact_ids: facts.filter((value): value is string => typeof value === "string"),
    provenance_refs: Array.isArray(candidate.provenance_refs)
      ? candidate.provenance_refs.filter((value): value is string => typeof value === "string") : [],
  };
}

export function takeQuotationResponseToken(
  location: Pick<Location, "hash" | "pathname" | "search"> = window.location,
  history: Pick<History, "replaceState"> = window.history,
): string | null {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  const params = new URLSearchParams(hash);
  const token = params.get("token") ?? params.get("response_token");
  const search = new URLSearchParams(location.search);
  search.delete("token");
  search.delete("response_token");
  const safeUrl = `${location.pathname}${search.size ? `?${search.toString()}` : ""}`;
  history.replaceState(null, "", safeUrl);
  return token?.trim() || null;
}

export async function exchangeQuotationResponseToken(
  responseToken: string,
  fetcher: typeof fetch = fetch,
): Promise<QuotationResponseSession> {
  const response = await fetcher("/quotation/vendor-response/exchange", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ response_token: responseToken }),
  });
  const body = record(await response.json().catch(() => null));
  const projected = projection(body?.projection);
  const sessionId = text(body?.session_id);
  const expiresAt = text(body?.expires_at);
  const capabilityExpiresAt = text(body?.capability_expires_at);
  const csrfToken = text(body?.csrf_token);
  const submissionNonce = text(body?.submission_nonce);
  if (!response.ok || !projected || !sessionId || !expiresAt || !capabilityExpiresAt || !csrfToken || !submissionNonce || body?.account_access !== false) {
    throw new Error("response_unavailable");
  }
  return { sessionId, expiresAt, capabilityExpiresAt, csrfToken, submissionNonce, projection: projected };
}

export async function submitQuotationResponse(
  session: QuotationResponseSession,
  submission: SecureLinkSubmission,
  fetcher: typeof fetch = fetch,
): Promise<SubmissionReceipt> {
  const response = await fetcher("/quotation/vendor-response/consume", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken },
    body: JSON.stringify({ submission_nonce: session.submissionNonce, ...submission }),
  });
  const body = record(await response.json().catch(() => null));
  const receiptId = text(body?.receipt_id);
  if (!response.ok || body?.status !== "received" || !receiptId
    || body.requires_user_review !== true || body.accepted !== false
    || body.booking !== false || body.payment_execution !== false) {
    throw new Error("response_unavailable");
  }
  return {
    status: "received", receiptId, requiresUserReview: true,
    accepted: false, booking: false, paymentExecution: false,
  };
}
