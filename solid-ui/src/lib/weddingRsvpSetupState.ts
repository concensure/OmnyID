// @locs-version: 1.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingRsvpQuestionId =
  | "attendance"
  | "meal_choice"
  | "dietary_requirements"
  | "accessibility_requirements"
  | "travel_plan"
  | "accommodation"
  | "custom_text";

export type WeddingRsvpQuestion = {
  id: WeddingRsvpQuestionId;
  label: string;
  enabled: boolean;
  required: boolean;
  sensitive: boolean;
  prompt: string | null;
  options: string[];
};

export type WeddingRsvpSetupState = {
  setupId: string;
  contractVersion: 1;
  revision: number;
  status: "draft";
  eventId: string;
  eventLabel: string;
  hostLabel: string;
  responseDeadline: string;
  encryptionKeyId: string | null;
  encryptionPublicKeyHex: string | null;
  questions: WeddingRsvpQuestion[];
  updatedAt: string;
};

export type WeddingRsvpSetupDraftInput = {
  eventId: string;
  eventLabel: string;
  hostLabel?: string | null;
  responseDeadline: string;
  enabledQuestionIds: readonly WeddingRsvpQuestionId[];
  requiredQuestionIds: readonly WeddingRsvpQuestionId[];
  customPrompt?: string | null;
  mealOptions?: readonly string[] | null;
};

export type WeddingRsvpSetupEventOption = {
  id: string;
  label: string;
  invitationCount: number;
};

export type WeddingRsvpInvitationPreview = {
  householdId: string | null;
  householdLabel: string;
  recipients: Array<{
    displayName: string;
    invitationId: string;
    responseStatus: string;
    plusOneAllowed: boolean;
    childrenInvited: boolean;
  }>;
  questionLabels: string[];
  privacyLabel: string;
};

const QUESTION_LIBRARY: ReadonlyArray<Omit<WeddingRsvpQuestion, "enabled" | "required" | "prompt" | "options">> = [
  { id: "attendance", label: "Attendance", sensitive: false },
  { id: "meal_choice", label: "Meal choice", sensitive: false },
  { id: "dietary_requirements", label: "Dietary or allergy requirements", sensitive: true },
  { id: "accessibility_requirements", label: "Accessibility requirements", sensitive: true },
  { id: "travel_plan", label: "Travel or transport plan", sensitive: true },
  { id: "accommodation", label: "Accommodation needs", sensitive: true },
  { id: "custom_text", label: "One custom question", sensitive: true },
];

export const weddingRsvpQuestionLibrary = QUESTION_LIBRARY;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function positiveInteger(value: unknown, fallback = 1): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function exactDate(value: unknown): string {
  const date = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function questionId(value: unknown): WeddingRsvpQuestionId | null {
  const id = clean(value) as WeddingRsvpQuestionId;
  return QUESTION_LIBRARY.some((question) => question.id === id) ? id : null;
}

function normalizedQuestions(input: WeddingRsvpSetupDraftInput): WeddingRsvpQuestion[] {
  const enabled = new Set(input.enabledQuestionIds);
  const required = new Set(input.requiredQuestionIds);
  enabled.add("attendance");
  required.add("attendance");
  const customPrompt = clean(input.customPrompt).slice(0, 160);
  const mealOptions = Array.from(new Set((input.mealOptions ?? [])
    .map((option) => clean(option).slice(0, 80))
    .filter(Boolean))).slice(0, 8);
  return QUESTION_LIBRARY.map((question) => ({
    ...question,
    enabled: enabled.has(question.id),
    required: enabled.has(question.id) && required.has(question.id),
    prompt: question.id === "custom_text" && enabled.has(question.id) ? customPrompt || null : null,
    options: question.id === "meal_choice" && enabled.has(question.id) ? mealOptions : [],
  }));
}

export function buildWeddingRsvpSetupDraft(
  input: WeddingRsvpSetupDraftInput,
  metadataInput?: unknown,
  currentRevision = 0,
  nowIso = new Date().toISOString(),
): { setup: WeddingRsvpSetupState | null; errorLabels: string[] } {
  const metadata = normalizeWeddingPlanningMetadata(metadataInput);
  const eventId = clean(input.eventId);
  const eventLabel = clean(input.eventLabel).slice(0, 120);
  const hostLabel = clean(input.hostLabel).slice(0, 120) || "The couple";
  const responseDeadline = exactDate(input.responseDeadline);
  const questions = normalizedQuestions(input);
  const errorLabels = [
    !eventId ? "Choose the wedding event this RSVP applies to." : null,
    !eventLabel ? "Add a clear event name." : null,
    !responseDeadline ? "Choose an RSVP deadline." : null,
    responseDeadline && responseDeadline < nowIso.slice(0, 10) ? "Choose today or a future RSVP deadline." : null,
    questions.some((question) => question.id === "custom_text" && question.enabled && !question.prompt)
      ? "Write the custom question or turn it off."
      : null,
    questions.some((question) => question.id === "meal_choice" && question.enabled && question.options.length < 2)
      ? "Add at least two meal choices or turn meal choice off."
      : null,
  ].filter((label): label is string => Boolean(label));
  if (errorLabels.length > 0) return { setup: null, errorLabels };
  return {
    setup: {
      setupId: `wedding_rsvp_setup:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(eventId)}`,
      contractVersion: 1,
      revision: Math.max(1, currentRevision + 1),
      status: "draft",
      eventId,
      eventLabel,
      hostLabel,
      responseDeadline,
      encryptionKeyId: null,
      encryptionPublicKeyHex: null,
      questions,
      updatedAt: nowIso,
    },
    errorLabels,
  };
}

function setupFromMessage(message: AfpMessage): WeddingRsvpSetupState | null {
  const content = record(message.content);
  const kind = clean(message.kind) || clean(content.kind);
  if (kind !== "wedding_rsvp_setup") return null;
  const eventId = clean(content.event_id);
  const eventLabel = clean(content.event_label);
  const hostLabel = clean(content.host_label).slice(0, 120) || "The couple";
  const responseDeadline = exactDate(content.response_deadline);
  const setupId = clean(content.setup_id);
  if (!eventId || !eventLabel || !responseDeadline || !setupId) return null;
  const questionValues = Array.isArray(content.questions) ? content.questions : [];
  const byId = new Map<WeddingRsvpQuestionId, Record<string, unknown>>();
  for (const value of questionValues) {
    const item = record(value);
    const id = questionId(item.id);
    if (id) byId.set(id, item);
  }
  const questions = QUESTION_LIBRARY.map((question) => {
    const stored = byId.get(question.id);
    const enabled = question.id === "attendance" || stored?.enabled === true;
    return {
      ...question,
      enabled,
      required: question.id === "attendance" || (enabled && stored?.required === true),
      prompt: question.id === "custom_text" ? clean(stored?.prompt).slice(0, 160) || null : null,
      options: question.id === "meal_choice" ? strings(stored?.options).slice(0, 8) : [],
    };
  });
  return {
    setupId,
    contractVersion: 1,
    revision: positiveInteger(content.revision),
    status: "draft",
    eventId,
    eventLabel,
    hostLabel,
    responseDeadline,
    encryptionKeyId: clean(content.encryption_key_id) || null,
    encryptionPublicKeyHex: /^[0-9a-f]{64}$/i.test(clean(content.encryption_public_key_hex))
      ? clean(content.encryption_public_key_hex).toLowerCase()
      : null,
    questions,
    updatedAt: clean(content.updated_at) || message.timestamp,
  };
}

export function weddingRsvpSetupFromAfpMessages(
  messages: readonly AfpMessage[] | null | undefined,
  responseWorkspaceId: string,
): WeddingRsvpSetupState | null {
  const scoped = (messages ?? [])
    .filter((message) => {
      const metadata = record(message.metadata);
      const content = record(message.content);
      return clean(metadata.responseWorkspaceId ?? metadata.response_workspace_id)
        === responseWorkspaceId
        || clean(content.response_workspace_id) === responseWorkspaceId;
    })
    .map((message) => ({ message, setup: setupFromMessage(message) }))
    .filter((entry): entry is { message: AfpMessage; setup: WeddingRsvpSetupState } => entry.setup !== null)
    .sort((left, right) => (
      right.setup.revision - left.setup.revision
      || Date.parse(right.setup.updatedAt) - Date.parse(left.setup.updatedAt)
    ));
  return scoped[0]?.setup ?? null;
}

export function weddingRsvpSetupToAfpSendInput(
  setup: WeddingRsvpSetupState,
  metadataInput?: unknown,
): SendAfpMessageInput {
  const metadata = normalizeWeddingPlanningMetadata(metadataInput);
  const enabledQuestions = setup.questions.filter((question) => question.enabled);
  return {
    id: `${setup.setupId}:revision:${setup.revision}`,
    thread_id: `wedding_rsvp:${metadata.responseWorkspaceId}`,
    from: "user://wedding-couple",
    to: ["agent://wedding-planning", "agent://knowledge-graph"],
    type: "ledger",
    kind: "wedding_rsvp_setup",
    subtype: "wedding_rsvp_setup",
    content: {
      kind: "wedding_rsvp_setup",
      contract_version: 1,
      setup_id: setup.setupId,
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      revision: setup.revision,
      status: setup.status,
      event_id: setup.eventId,
      event_label: setup.eventLabel,
      host_label: setup.hostLabel,
      response_deadline: setup.responseDeadline,
      encryption_key_id: setup.encryptionKeyId,
      encryption_public_key_hex: setup.encryptionPublicKeyHex,
      questions: enabledQuestions.map((question) => ({
        id: question.id,
        label: question.label,
        enabled: true,
        required: question.required,
        sensitive: question.sensitive,
        prompt: question.prompt,
        options: question.options,
      })),
      updated_at: setup.updatedAt,
    },
    metadata: {
      template: "wedding_planning",
      weddingPlanId: metadata.weddingPlanId,
      responseWorkspaceId: metadata.responseWorkspaceId,
      origin: "wedding_guest_rsvp_setup",
      approval_status: "draft",
      sends_invitation: false,
      creates_capability: false,
      model_calls: 0,
    },
    references: [
      { type: "wedding_plan", target: metadata.weddingPlanId, label: "Wedding plan" },
      { type: "response_workspace", target: metadata.responseWorkspaceId, label: "Wedding workspace" },
      { type: "rsvp_setup_for_event", target: setup.eventId, label: setup.eventLabel },
    ],
    supertags: [
      "template:wedding_planning",
      "event:wedding",
      "wedding_rsvp:setup",
      "privacy:couple_only",
    ],
    store_in_relational: true,
  };
}

export function weddingRsvpSetupEventOptions(
  guestTracking: WeddingGuestTrackingState,
): WeddingRsvpSetupEventOption[] {
  const counts = new Map<string, number>();
  for (const row of guestTracking.guestRows ?? []) {
    for (const response of row.eventResponses) {
      counts.set(response.eventId, (counts.get(response.eventId) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([id, invitationCount]) => ({
      id,
      label: /main[_-]?wedding/i.test(id) ? "Wedding day" : id.split(":").at(-1)?.replace(/[_-]+/g, " ") || "Wedding event",
      invitationCount,
    }))
    .sort((left, right) => right.invitationCount - left.invitationCount || left.label.localeCompare(right.label));
}

export function buildWeddingRsvpInvitationPreviews(
  setup: WeddingRsvpSetupState,
  guestTracking: WeddingGuestTrackingState,
): WeddingRsvpInvitationPreview[] {
  const households = new Map<string, { householdId: string | null; recipients: WeddingRsvpInvitationPreview["recipients"] }>();
  for (const row of guestTracking.guestRows ?? []) {
    const response = row.eventResponses.find((item) => item.eventId === setup.eventId);
    if (!response) continue;
    const household = households.get(row.householdLabel) ?? { householdId: row.householdId ?? null, recipients: [] };
    household.recipients.push({
      displayName: row.displayName,
      invitationId: response.invitationId,
      responseStatus: response.attendance,
      plusOneAllowed: response.plusOneAllowed === true,
      childrenInvited: response.childrenInvited === true,
    });
    households.set(row.householdLabel, household);
  }
  const questionLabels = setup.questions
    .filter((question) => question.enabled)
    .map((question) => question.prompt || question.label);
  return Array.from(households.entries())
    .map(([householdLabel, household]) => ({
      householdId: household.householdId,
      householdLabel,
      recipients: household.recipients.sort((left, right) => left.displayName.localeCompare(right.displayName)),
      questionLabels,
      privacyLabel: "Private answers stay with the couple unless they explicitly approve a minimum-necessary vendor brief.",
    }))
    .sort((left, right) => left.householdLabel.localeCompare(right.householdLabel));
}
