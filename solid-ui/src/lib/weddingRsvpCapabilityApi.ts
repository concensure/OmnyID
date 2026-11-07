// @locs-version: 1.0
import { apiFetch, apiUrlForPath } from "@/lib/api";

export type WeddingRsvpCapabilityQuestion = {
  id: string;
  label: string;
  required: boolean;
  sensitive: boolean;
  prompt?: string | null;
  options: string[];
};

export type WeddingRsvpCapabilityInvitation = {
  invitation_id: string;
  person_id: string;
  event_id: string;
  display_name: string;
  invitation_status: string;
  response_revision: number;
  plus_one_allowed: boolean;
  children_invited: boolean;
  age_band: string;
  guest_role: "primary" | "plus_one" | "child";
  companion_to_person_id?: string | null;
  name_pending: boolean;
  seat_requirement: "standard" | "high_chair" | "booster" | "none" | "unknown";
  meal_requirement: "adult" | "child" | "none" | "unknown";
};

export type WeddingRsvpCapabilityScope = {
  capability_id: string;
  household_id: string;
  host_label: string;
  event_id: string;
  event_label: string;
  response_deadline: string;
  encryption_key_id: string;
  encryption_public_key_hex: string;
  questions: WeddingRsvpCapabilityQuestion[];
  expires_at: string;
  request_contact_details: boolean;
  invitations: WeddingRsvpCapabilityInvitation[];
};

export type WeddingRsvpCapabilityGrant = {
  grant_id: string;
  wedding_plan_id: string;
  response_workspace_id: string;
  household_id: string;
  invitation_ids: string[];
  expires_at: string;
  revoked_at?: string | null;
  replaced_by_grant_id?: string | null;
  open_count: number;
  last_opened_at?: string | null;
  created_at: string;
  request_contact_details: boolean;
};

export function loadWeddingRsvpCapabilityStatus() {
  return apiFetch<{ enabled: boolean; max_expiry_days: number; token_in_fragment: boolean }>("/wedding/rsvp/capabilities/status");
}

export function listWeddingRsvpCapabilities(responseWorkspaceId: string) {
  return apiFetch<WeddingRsvpCapabilityGrant[]>(`/wedding/rsvp/capabilities?response_workspace_id=${encodeURIComponent(responseWorkspaceId)}`);
}

export function createWeddingRsvpCapability(input: {
  weddingPlanId: string;
  responseWorkspaceId: string;
  householdId: string;
  invitationIds: string[];
  expiresAt: string;
  requestContactDetails?: boolean;
}) {
  return apiFetch<{ grant: WeddingRsvpCapabilityGrant; token: string }>("/wedding/rsvp/capabilities", {
    method: "POST",
    bodyJson: {
      wedding_plan_id: input.weddingPlanId,
      response_workspace_id: input.responseWorkspaceId,
      household_id: input.householdId,
      invitation_ids: input.invitationIds,
      expires_at: input.expiresAt,
      request_contact_details: input.requestContactDetails === true,
    },
  });
}

export function revokeWeddingRsvpCapability(grantId: string) {
  return apiFetch<WeddingRsvpCapabilityGrant>(`/wedding/rsvp/capabilities/${encodeURIComponent(grantId)}/revoke`, { method: "POST" });
}

async function publicRsvpFetch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(apiUrlForPath(path), {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text() || "This RSVP invitation is not available.");
  return response.json() as Promise<T>;
}

export function openWeddingRsvpCapability(token: string) {
  return publicRsvpFetch<WeddingRsvpCapabilityScope>("/wedding/rsvp/capabilities/open", { token });
}

export function weddingRsvpProtectedLink(token: string, origin = window.location.origin): string {
  return `${origin}/workspace/rsvp.html#${token}`;
}

export function submitWeddingRsvpCapabilityResponse(input: {
  token: string;
  invitationId: string;
  personId: string;
  eventId: string;
  attendance: "pending" | "attending" | "not_attending";
  expectedRevision: number;
  idempotencyKey: string;
  answers: Record<string, string>;
  privateAnswerQuestionIds: string[];
  privateAnswersCiphertext?: string | null;
  contactDetails?: {
    displayName: string;
    email: string;
    phone: string;
    relationshipToCouple: string;
  } | null;
}) {
  return publicRsvpFetch<{ replayed: boolean; explanation: string; response: Record<string, unknown>; impact_receipt: Record<string, unknown> }>("/wedding/rsvp/capabilities/respond", {
    token: input.token,
    invitation_id: input.invitationId,
    person_id: input.personId,
    event_id: input.eventId,
    attendance: input.attendance,
    expected_revision: input.expectedRevision,
    idempotency_key: input.idempotencyKey,
    answers: input.answers,
    private_answer_question_ids: input.privateAnswerQuestionIds,
    private_answers_ciphertext: input.privateAnswersCiphertext ?? null,
    contact_details: input.contactDetails ? {
      display_name: input.contactDetails.displayName,
      email: input.contactDetails.email,
      phone: input.contactDetails.phone,
      relationship_to_couple: input.contactDetails.relationshipToCouple,
    } : null,
  });
}
