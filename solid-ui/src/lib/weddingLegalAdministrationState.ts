// @locs-version: 2.0
import type { WeddingGeneratedArtifact } from "@/lib/weddingArtifactGenerationState";
import {
  normalizeWeddingArtifactSummary,
  type WeddingArtifactInput,
} from "@/lib/weddingArtifactState";
import { WEDDING_AUSTRALIAN_LEGAL_SOURCE_LINKS } from "@/lib/weddingAustralianLegalSetupState";
import type {
  WeddingPlanningScheduleItem,
  WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import type { WeddingPlanningContext } from "@/lib/weddingNeedToKnowProbingState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingLegalAdministrationState = {
  deadlineLabel: string;
  alertOptions: string[];
  documentChecklist: WeddingPlanningTaskItem[];
  celebrantSearchReadiness: "ready_for_search" | "needs_location" | "not_applicable";
  noimPrefillStatus: "ready_for_user_review" | "needs_couple_details" | "not_applicable";
  artifact: WeddingGeneratedArtifact;
  scheduleItems: WeddingPlanningScheduleItem[];
  taskItems: WeddingPlanningTaskItem[];
  caveatLabels: string[];
};

export type WeddingLegalAdministrationTaskItemsInput = {
  artifacts?: readonly WeddingArtifactInput[] | null;
  metadata?: unknown;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isAustralianContext(context: WeddingPlanningContext): boolean {
  const country = clean(context.countryCode).toUpperCase();
  const jurisdiction = clean(context.legalJurisdiction).toLowerCase();
  const location = clean(context.location).toLowerCase();
  return country === "AU"
    || jurisdiction.includes("australia")
    || location.includes("australia")
    || /\b(nsw|vic|qld|wa|sa|tas|act|nt)\b/i.test(location);
}

function exactDate(value: unknown): Date | null {
  const label = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return null;
  const date = new Date(`${label}T09:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function noimDeadline(context: WeddingPlanningContext): { due: Date | null; reminder: Date | null; earliest: Date | null } {
  const weddingDate = exactDate(context.dateOrSeason);
  if (!weddingDate) return { due: null, reminder: null, earliest: null };
  const due = addMonths(weddingDate, -1);
  return {
    due,
    reminder: addDays(due, -17),
    earliest: addMonths(weddingDate, -18),
  };
}

function metadataWithTags(metadata: WeddingPlanningMetadata): WeddingPlanningMetadata {
  return {
    ...metadata,
    artifactKind: "legal",
    supertags: [
      ...metadata.supertags,
      "wedding_legal_admin",
      "decisionos:wedding_legal",
    ],
  };
}

function alertOptions(context: WeddingPlanningContext, due: Date | null, reminder: Date | null): string[] {
  const dueText = due ? isoDate(due) : "once an exact wedding date is confirmed";
  const reminderText = reminder ? isoDate(reminder) : "a reviewed date";
  const location = clean(context.location) || "the wedding area";
  return [
    `Draft NOIM prep now for user review. Do not lodge or sign anything automatically.`,
    `Connect with authorised celebrants near ${location}. Return 3 verified options only after live source/search verification is connected.`,
    `Set a reminder for ${reminderText} before the NOIM latest-date check of ${dueText}.`,
  ];
}

function documentTask(
  metadata: WeddingPlanningMetadata,
  id: string,
  title: string,
  notes: string,
  priority: WeddingPlanningTaskItem["priority"] = "normal",
): WeddingPlanningTaskItem {
  return {
    id: `wedding_task:legal-doc:${safeWeddingLabel(id)}:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    title,
    kind: "document_checklist",
    dueLabel: "Before NOIM appointment or celebrant review",
    priority,
    source: "agent",
    reviewStatus: "accepted",
    approvalState: "draft",
    metadata: {
      ...metadata,
      decision_surface: "legal_administration",
      legal_administration_task: true,
      legal_document_checklist_item: id,
      second_order_loop: "commitment_timing",
      preparation_checklist: true,
      preparation_checklist_item: `legal-${id}`,
      user_selectable: true,
      can_deselect_before_commit: true,
      searchable_terms: [
        title,
        notes,
        id,
        "legal administration",
        "NOIM",
        "document checklist",
        "celebrant",
        metadata.weddingPlanId,
        metadata.responseWorkspaceId,
      ],
    },
    notes,
  };
}

function documentChecklist(metadata: WeddingPlanningMetadata): WeddingPlanningTaskItem[] {
  return [
    documentTask(metadata, "proof-of-birth", "Confirm proof of date/place of birth documents", "Usually passport or birth certificate. Store only document status unless the user explicitly uploads sensitive documents.", "high"),
    documentTask(metadata, "photo-id", "Confirm photo ID documents for both parties", "Ask celebrant what identity documents are accepted before the appointment.", "high"),
    documentTask(metadata, "divorce-or-death-proof", "Check divorce decree or death certificate if previously married", "Only applies if relevant. Treat as sensitive legal context and avoid unnecessary storage.", "normal"),
    documentTask(metadata, "name-change", "Check name-change evidence if names differ across documents", "Only applies if relevant. Ask celebrant what evidence is required.", "normal"),
  ];
}

function taskRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function existingLegalKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const checklistItem = clean(taskRecord(item.metadata).legal_document_checklist_item);
    if (taskRecord(item.metadata).legal_administration_task === true && checklistItem) keys.add(checklistItem);
  }
  return keys;
}

function isLegalAdministrationArtifact(artifact: WeddingArtifactInput): boolean {
  const metadata = taskRecord(artifact.metadata);
  const supertags = Array.isArray(metadata.supertags) ? metadata.supertags.join(" ") : "";
  return artifact.kind === "legal"
    && /legal and administrative wedding plan|NOIM|notice of intended marriage|document checklist|authorised celebrant|wedding_legal_admin/i.test(`${clean(artifact.id)}\n${clean(artifact.title)}\n${clean(artifact.bodyText)}\n${supertags}`);
}

export function buildWeddingLegalAdministrationTaskItems(input: WeddingLegalAdministrationTaskItemsInput): WeddingPlanningTaskItem[] {
  const artifact = (input.artifacts ?? []).find(isLegalAdministrationArtifact);
  if (!artifact) return [];
  const metadata = metadataWithTags(normalizeWeddingPlanningMetadata(input.metadata ?? artifact.metadata));
  const existingKeys = existingLegalKeys(input.existingTaskItems ?? []);
  return documentChecklist(metadata)
    .filter((item) => {
      const checklistItem = clean(taskRecord(item.metadata).legal_document_checklist_item);
      return !existingKeys.has(item.id) && !existingKeys.has(checklistItem);
    })
    .map((item) => ({ ...item, linkedArtifactId: clean(artifact.id) || null }));
}

function markdownFor(
  context: WeddingPlanningContext,
  deadline: ReturnType<typeof noimDeadline>,
  options: readonly string[],
  docs: readonly WeddingPlanningTaskItem[],
): string {
  const australian = isAustralianContext(context);
  return [
    "# Legal and administrative wedding plan",
    "",
    "This artifact is a planning aid, not legal advice. It does not lodge a form, sign a form, book a celebrant, or verify identity documents.",
    "",
    "## DecisionOS alert",
    "",
    australian
      ? `- NOIM latest-date check: ${deadline.due ? isoDate(deadline.due) : "needs exact wedding date"}.`
      : "- Legal deadline checks are jurisdiction-dependent; capture country/state before generating local legal actions.",
    deadline.earliest ? `- Earliest NOIM window date: ${isoDate(deadline.earliest)}.` : "- Earliest legal window date: needs exact wedding date.",
    "",
    "## Options",
    "",
    ...options.map((option, index) => `${index + 1}. ${option}`),
    "",
    "## Document checklist",
    "",
    ...docs.map((task) => `- [ ] ${task.title}: ${task.notes}`),
    "",
    "## Celebrant coordination",
    "",
    "- Use the official Australian authorised celebrant register when searching for Australian celebrants.",
    "- Return 3 options only when search/provider evidence can verify the celebrant and location fit.",
    "- If the user chooses a celebrant, generate a NOIM prep packet for user review; do not auto-lodge.",
    "",
    "## Sources",
    "",
    "- Attorney-General's Department: Get married.",
    "- Attorney-General's Department: Find a marriage celebrant / authorised celebrant register.",
  ].join("\n");
}

export function buildWeddingLegalAdministrationState(input: {
  metadata?: unknown;
  planningContext?: WeddingPlanningContext | null;
}): WeddingLegalAdministrationState {
  const metadata = metadataWithTags(normalizeWeddingPlanningMetadata(input.metadata));
  const context = input.planningContext ?? {};
  const australian = isAustralianContext(context);
  const deadline = australian ? noimDeadline(context) : { due: null, reminder: null, earliest: null };
  const options = alertOptions(context, deadline.due, deadline.reminder);
  const docs = documentChecklist(metadata);
  const markdown = markdownFor(context, deadline, options, docs);
  const artifactInput = {
    id: `wedding_artifact:legal_admin:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    title: "Legal and administrative wedding plan",
    kind: "legal" as const,
    metadata,
    sourceLabels: australian
      ? ["Attorney-General's Department: Get married", "Attorney-General's Department: Find a marriage celebrant"]
      : ["Jurisdiction-specific legal requirements needed"],
    sourceLinks: australian ? WEDDING_AUSTRALIAN_LEGAL_SOURCE_LINKS : [],
    locationLabels: clean(context.location) ? [clean(context.location)] : [],
    linkedTaskIds: docs.map((task) => task.id),
    linkedCalendarEventIds: deadline.reminder ? [`wedding_calendar:noim-reminder:${safeWeddingLabel(metadata.responseWorkspaceId)}`] : [],
    bodyText: markdown,
    exportTargets: ["markdown", "html", "word_doc", "browser_pdf"],
  };
  const summary = normalizeWeddingArtifactSummary(artifactInput)!;
  const scheduleItems: WeddingPlanningScheduleItem[] = deadline.reminder
    ? [{
      id: `wedding_calendar:noim-reminder:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
      title: "NOIM reminder and celebrant check",
      kind: "noim_reminder",
      dateLabel: `Reminder before latest NOIM date ${deadline.due ? isoDate(deadline.due) : ""}`.trim(),
      startAt: `${isoDate(deadline.reminder)}T09:00:00.000Z`,
      allDay: true,
      location: clean(context.location) || null,
      source: "agent",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata,
      linkedArtifactId: artifactInput.id,
      notes: "Confirm NOIM status, celebrant path, and document checklist. Do not lodge forms automatically.",
    }]
    : [];
  return {
    deadlineLabel: deadline.due
      ? `NOIM latest-date check: ${isoDate(deadline.due)}`
      : australian ? "NOIM deadline needs exact wedding date" : "Legal deadline is jurisdiction-dependent",
    alertOptions: options,
    documentChecklist: docs,
    celebrantSearchReadiness: australian
      ? clean(context.location) ? "ready_for_search" : "needs_location"
      : "not_applicable",
    noimPrefillStatus: australian
      ? deadline.due ? "ready_for_user_review" : "needs_couple_details"
      : "not_applicable",
    artifact: { input: artifactInput, summary, markdown, csv: null },
    scheduleItems,
    taskItems: docs,
    caveatLabels: [
      "Do not lodge, sign, or submit legal forms automatically.",
      "Do not store sensitive identity documents unless the user explicitly uploads and retains them.",
      "For Australia, use the official authorised celebrant register before presenting celebrant options as verified.",
    ],
  };
}
