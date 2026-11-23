// @locs-version: 2.0
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import type { WeddingExpectedBehaviorAuditItem } from "@/lib/weddingExpectedBehaviorAuditState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

type TaskTemplate = {
  kind: WeddingPlanningTaskItem["kind"];
  title: string;
  dueLabel: string;
  priority: WeddingPlanningTaskItem["priority"];
  secondOrderLoop?: string | null;
};

type PreparationTaskTemplate = {
  id: string;
  kind: WeddingPlanningTaskItem["kind"];
  title: string;
  dueLabel: string;
  monthsBeforeWedding?: number;
  daysBeforeWedding?: number;
  priority: WeddingPlanningTaskItem["priority"];
  alertOffsetDays: number[];
  secondOrderLoop: string;
  notes: string;
};

const TASK_TEMPLATES: Record<string, TaskTemplate> = {
  decision_surfaces: {
    kind: "decision",
    title: "Confirm wedding decisions are projected into DecisionOS",
    dueLabel: "Before relying on daily wedding priorities",
    priority: "high",
  },
  need_to_know_probing: {
    kind: "research",
    title: "Complete missing wedding Need-To-Know context",
    dueLabel: "Before deep recommendations",
    priority: "high",
  },
  vendor_matching: {
    kind: "research",
    title: "Connect source-verified vendor search before presenting shortlist claims",
    dueLabel: "Before vendor shortlist decisions",
    priority: "high",
  },
  controlled_outreach: {
    kind: "vendor_follow_up",
    title: "Connect approval-gated vendor outreach execution",
    dueLabel: "Before contacting vendors",
    priority: "high",
    secondOrderLoop: "contact_follow_up",
  },
  follow_up_automation: {
    kind: "vendor_follow_up",
    title: "Connect vendor follow-up automation and escalation receipts",
    dueLabel: "Before automated follow-ups",
    priority: "normal",
    secondOrderLoop: "contact_follow_up",
  },
  legal_deadline_tracking: {
    kind: "legal",
    title: "Complete jurisdiction-specific legal deadline tracking",
    dueLabel: "Before legal/admin plan is trusted",
    priority: "high",
    secondOrderLoop: "commitment_timing",
  },
  celebrant_coordination: {
    kind: "legal",
    title: "Verify celebrant coordination through authorised sources",
    dueLabel: "Before celebrant selection",
    priority: "high",
    secondOrderLoop: "commitment_timing",
  },
  document_checklist: {
    kind: "document_checklist",
    title: "Confirm legal document checklist",
    dueLabel: "Before NOIM or legal appointment",
    priority: "high",
    secondOrderLoop: "commitment_timing",
  },
  run_sheet_generation: {
    kind: "run_sheet",
    title: "Create structured final-phase run sheet",
    dueLabel: "6-1 months out",
    priority: "high",
  },
  run_sheet_adjustments: {
    kind: "run_sheet",
    title: "Add approval-based run-sheet adjustment UI",
    dueLabel: "Before final coordination",
    priority: "normal",
  },
  vendor_scoped_sharing: {
    kind: "vendor_coordination",
    title: "Prove vendor-scoped sharing access controls",
    dueLabel: "Before sharing run sheets externally",
    priority: "high",
    secondOrderLoop: "guest_logistics",
  },
  weather_contingency: {
    kind: "weather_contingency",
    title: "Connect verified weather contingency evidence",
    dueLabel: "Before outdoor plan is final",
    priority: "high",
    secondOrderLoop: "weather_backup",
  },
  final_confirmations_payments: {
    kind: "vendor_coordination",
    title: "Connect final vendor confirmation and payment reminders",
    dueLabel: "Before final vendor deadlines",
    priority: "high",
    secondOrderLoop: "commitment_timing",
  },
  guest_final_count: {
    kind: "guest_list",
    title: "Add final guest-count DecisionOS choice",
    dueLabel: "Before caterer final-number deadline",
    priority: "high",
    secondOrderLoop: "guest_logistics",
  },
  emergency_kit_day_of_prep: {
    kind: "run_sheet",
    title: "Add emergency-kit checklist to day-of prep",
    dueLabel: "Before final run sheet is shared",
    priority: "normal",
    secondOrderLoop: "guest_logistics",
  },
  rsvp_collection: {
    kind: "rsvp",
    title: "Connect secure RSVP collection",
    dueLabel: "Before guest numbers are final",
    priority: "normal",
    secondOrderLoop: "guest_logistics",
  },
  seating_chart: {
    kind: "seating",
    title: "Add seating chart review surface",
    dueLabel: "Before final numbers are due",
    priority: "normal",
    secondOrderLoop: "guest_logistics",
  },
  dietary_accessibility_coordination: {
    kind: "vendor_coordination",
    title: "Connect approved dietary and accessibility vendor briefs",
    dueLabel: "Before catering final numbers",
    priority: "high",
    secondOrderLoop: "guest_logistics",
  },
  day_of_realtime_run_sheet_updates: {
    kind: "run_sheet",
    title: "Connect day-of run-sheet delay execution",
    dueLabel: "Wedding day / live run sheet",
    priority: "high",
    secondOrderLoop: "guest_logistics",
  },
  day_of_emergency_handling: {
    kind: "vendor_coordination",
    title: "Confirm day-of emergency fallback playbooks",
    dueLabel: "Final week / wedding day",
    priority: "high",
    secondOrderLoop: "contact_follow_up",
  },
  day_of_guest_coordination: {
    kind: "guest_list",
    title: "Connect day-of guest update and lost-item channel",
    dueLabel: "Final week / wedding day",
    priority: "high",
    secondOrderLoop: "guest_logistics",
  },
  day_of_payment_verification: {
    kind: "budget_review",
    title: "Connect final payment receipt verification",
    dueLabel: "Before final payment / wedding day",
    priority: "high",
    secondOrderLoop: "commitment_timing",
  },
  post_wedding_thank_you_notes: {
    kind: "email_draft",
    title: "Add post-wedding thank-you note drafts",
    dueLabel: "Post-wedding wrap-up",
    priority: "normal",
    secondOrderLoop: "contact_follow_up",
  },
  post_wedding_feedback_collection: {
    kind: "vendor_follow_up",
    title: "Add private post-wedding vendor feedback collection",
    dueLabel: "Post-wedding wrap-up",
    priority: "normal",
    secondOrderLoop: "contact_follow_up",
  },
  post_wedding_keepsake_export: {
    kind: "decision",
    title: "Add secure wedding log and digital scrapbook export",
    dueLabel: "Post-wedding wrap-up",
    priority: "normal",
  },
};

const PREPARATION_TASK_TEMPLATES: PreparationTaskTemplate[] = [
  {
    id: "rings",
    kind: "rings",
    title: "Choose, size, order, and insure wedding rings",
    dueLabel: "6-9 months out, earlier for custom rings",
    monthsBeforeWedding: 7,
    priority: "high",
    alertOffsetDays: [60, 30, 14],
    secondOrderLoop: "commitment_timing",
    notes: "Confirm ring size, engraving, delivery date, insurance, and who brings the rings on the day.",
  },
  {
    id: "first-dance",
    kind: "first_dance",
    title: "Confirm first dance song, cut timing, and practice plan",
    dueLabel: "3-5 months out",
    monthsBeforeWedding: 4,
    priority: "normal",
    alertOffsetDays: [45, 21, 7],
    secondOrderLoop: "guest_logistics",
    notes: "Decide whether to take lessons, choose the song version, and brief DJ/band and MC.",
  },
  {
    id: "cake",
    kind: "cake",
    title: "Book cake baker, tasting, design, delivery, and cutting plan",
    dueLabel: "6-9 months out; final details 4-6 weeks out",
    monthsBeforeWedding: 6,
    priority: "high",
    alertOffsetDays: [60, 30, 14],
    secondOrderLoop: "vendor_confirmation",
    notes: "Confirm flavors, allergens, stand/knife, delivery access, setup time, and final payment date.",
  },
  {
    id: "limousine-transport",
    kind: "transport",
    title: "Book limousine or wedding transport and pickup schedule",
    dueLabel: "4-6 months out; reconfirm final week",
    monthsBeforeWedding: 5,
    priority: "high",
    alertOffsetDays: [45, 14, 3],
    secondOrderLoop: "guest_logistics",
    notes: "Capture addresses, pickup times, photo stops, wet-weather route, driver contact, and overtime fees.",
  },
  {
    id: "bridesmaid-dresses",
    kind: "attire",
    title: "Select bridesmaid dresses, measurements, orders, and alterations",
    dueLabel: "6-8 months out; alterations 6-8 weeks out",
    monthsBeforeWedding: 7,
    priority: "high",
    alertOffsetDays: [60, 30, 14],
    secondOrderLoop: "commitment_timing",
    notes: "Track sizes, order deadlines, delivery risk, alterations appointments, shoes, accessories, and who pays.",
  },
  {
    id: "hen-night",
    kind: "hen_party",
    title: "Plan hen's night activities, budget, guest list, and transport",
    dueLabel: "2-4 months out",
    monthsBeforeWedding: 3,
    priority: "normal",
    alertOffsetDays: [45, 21, 7],
    secondOrderLoop: "guest_logistics",
    notes: "Confirm organizer, attendees, dietary needs, payment collection, activity bookings, transport, safety plan, and recovery buffer.",
  },
  {
    id: "hair-makeup-trial",
    kind: "beauty",
    title: "Schedule hair and makeup trial and final beauty timeline",
    dueLabel: "3-6 months out; final timeline 4 weeks out",
    monthsBeforeWedding: 4,
    priority: "normal",
    alertOffsetDays: [45, 21, 7],
    secondOrderLoop: "vendor_confirmation",
    notes: "Confirm trial photos, skin/hair prep, bridesmaid coverage, start time, travel fees, and delay buffer.",
  },
  {
    id: "ceremony-music",
    kind: "music",
    title: "Confirm ceremony music, entrance order, and cue sheet",
    dueLabel: "2-3 months out",
    monthsBeforeWedding: 2,
    priority: "normal",
    alertOffsetDays: [30, 14, 3],
    secondOrderLoop: "guest_logistics",
    notes: "Brief celebrant, DJ/band/ensemble, and coordinator on processional, signing, recessional, and backup audio.",
  },
  {
    id: "photo-shot-list",
    kind: "vendor_coordination",
    title: "Prepare photographer shot list and family photo schedule",
    dueLabel: "4-6 weeks out",
    daysBeforeWedding: 35,
    priority: "high",
    alertOffsetDays: [21, 7, 2],
    secondOrderLoop: "guest_logistics",
    notes: "List must-have portraits, sensitive family dynamics, locations, timing, and backup rain locations.",
  },
  {
    id: "vendor-final-confirmation",
    kind: "vendor_coordination",
    title: "Final confirmation sweep for cake, transport, attire, music, and beauty vendors",
    dueLabel: "2-3 weeks out",
    daysBeforeWedding: 21,
    priority: "urgent",
    alertOffsetDays: [14, 7, 2],
    secondOrderLoop: "contact_follow_up",
    notes: "Close loops on arrival times, balances, contacts, cancellation terms, backup plans, and receipt evidence.",
  },
];

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function weddingDateFromMetadata(value: unknown): Date | null {
  const raw = clean(
    recordValue(value, "weddingDate")
    ?? recordValue(value, "wedding_date")
    ?? recordValue(value, "eventDate")
    ?? recordValue(value, "event_date"),
  );
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateBeforeWedding(weddingDate: Date | null, template: PreparationTaskTemplate): string | null {
  if (!weddingDate) return null;
  const due = new Date(weddingDate);
  if (typeof template.monthsBeforeWedding === "number") {
    due.setMonth(due.getMonth() - template.monthsBeforeWedding);
  } else if (typeof template.daysBeforeWedding === "number") {
    due.setDate(due.getDate() - template.daysBeforeWedding);
  } else {
    return null;
  }
  return due.toISOString();
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function taskCoversCapability(task: WeddingPlanningTaskItem, capability: string, template: TaskTemplate): boolean {
  const metadata = record(task.metadata);
  return clean(metadata.expected_behavior_capability) === capability
    || clean(metadata.expected_behaviour_capability) === capability
    || task.kind === template.kind;
}

export function buildWeddingExpectedBehaviorTaskItems(input: {
  metadata?: unknown;
  blockedItems?: readonly WeddingExpectedBehaviorAuditItem[] | null;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
  limit?: number | null;
}): WeddingPlanningTaskItem[] {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const existing = input.existingTaskItems ?? [];
  const limit = Math.max(0, input.limit ?? 15);
  const tasks: WeddingPlanningTaskItem[] = [];

  for (const item of input.blockedItems ?? []) {
    const template = TASK_TEMPLATES[item.capability];
    if (!template) continue;
    if (existing.some((task) => taskCoversCapability(task, item.capability, template))) continue;
    const id = `wedding_task:expected-behavior:${safeWeddingLabel(item.capability)}:${safeWeddingLabel(metadata.responseWorkspaceId)}`;
    tasks.push({
      id,
      title: template.title,
      kind: template.kind,
      dueLabel: template.dueLabel,
      priority: template.priority,
      source: "agent",
      reviewStatus: "needs_review",
      approvalState: "draft",
      metadata: {
        ...metadata,
        expected_behavior_gap: true,
        expected_behavior_capability: item.capability,
        expected_behavior_status: item.status,
        expected_behavior_title: item.title,
        expected_behavior_blocker_labels: item.blockerLabels,
        second_order_loop: template.secondOrderLoop ?? null,
      },
      notes: [
        item.userFacingLabel,
        ...item.blockerLabels,
      ].join(" "),
    });
    if (tasks.length >= limit) break;
  }

  return tasks;
}

function preparationTaskAlreadyExists(
  task: WeddingPlanningTaskItem,
  template: PreparationTaskTemplate,
): boolean {
  const metadata = record(task.metadata);
  const checklistId = clean(metadata.preparation_checklist_item);
  return checklistId === template.id
    || task.kind === template.kind
    || clean(task.title).toLowerCase().includes(template.title.toLowerCase().slice(0, 18));
}

export function buildWeddingPreparationChecklistTaskItems(input: {
  metadata?: unknown;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
  includeTaskIds?: readonly string[] | null;
  excludeTaskIds?: readonly string[] | null;
  limit?: number | null;
}): WeddingPlanningTaskItem[] {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const existing = input.existingTaskItems ?? [];
  const include = input.includeTaskIds?.length ? new Set(input.includeTaskIds) : null;
  const exclude = new Set(input.excludeTaskIds ?? []);
  const weddingDate = weddingDateFromMetadata(input.metadata);
  const limit = Math.max(0, input.limit ?? PREPARATION_TASK_TEMPLATES.length);
  const tasks: WeddingPlanningTaskItem[] = [];

  for (const template of PREPARATION_TASK_TEMPLATES) {
    if (include && !include.has(template.id)) continue;
    if (exclude.has(template.id)) continue;
    if (existing.some((task) => preparationTaskAlreadyExists(task, template))) continue;
    tasks.push({
      id: `wedding_task:preparation:${safeWeddingLabel(template.id)}:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
      title: template.title,
      kind: template.kind,
      dueAt: dateBeforeWedding(weddingDate, template),
      dueLabel: template.dueLabel,
      priority: template.priority,
      source: "agent",
      reviewStatus: "needs_review",
      approvalState: "draft",
      metadata: {
        ...metadata,
        preparation_checklist_item: template.id,
        preparation_checklist: true,
        alert_offset_days: template.alertOffsetDays,
        schedule_basis: weddingDate ? "wedding_date" : "relative_due_label",
        second_order_loop: template.secondOrderLoop,
        user_selectable: true,
        can_deselect_before_commit: true,
      },
      notes: template.notes,
    });
    if (tasks.length >= limit) break;
  }

  return tasks;
}
