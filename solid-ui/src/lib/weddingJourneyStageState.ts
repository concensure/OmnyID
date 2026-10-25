import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";

export const WEDDING_JOURNEY_STAGES = [
  { id: "plan_budget", label: "Plan & budget" },
  { id: "venue_date", label: "Venue & date" },
  { id: "celebrant_suppliers", label: "Celebrant & suppliers" },
  { id: "details_invites", label: "Details & invites" },
  { id: "final_prep", label: "Final prep" },
  { id: "wedding_after", label: "Wedding & after" },
] as const;

export type WeddingJourneyStageId = typeof WEDDING_JOURNEY_STAGES[number]["id"];

export type WeddingJourneyTaskGroup = {
  category: string;
  tasks: WeddingPlanningTaskItem[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(task: WeddingPlanningTaskItem): string {
  return `${task.kind} ${task.title} ${task.notes ?? ""}`.toLowerCase();
}

export function weddingJourneyStageId(task: WeddingPlanningTaskItem): WeddingJourneyStageId {
  const metadata = record(task.metadata);
  const explicit = String(metadata.wedding_journey_stage ?? metadata.journey_stage ?? "");
  if (WEDDING_JOURNEY_STAGES.some((stage) => stage.id === explicit)) return explicit as WeddingJourneyStageId;
  const value = text(task);
  if (/after wedding|thank|review supplier|return hire|certificate application|photo|video deliver/.test(value)) return "wedding_after";
  if (/final count|seating|run sheet|rehearsal|final fitting|weather|final confirm|pack|speech/.test(value)) return "final_prep";
  if (/invite|rsvp|save.the.date|website|guest|transport|accommodation|menu|styling|bomboniere|hens|bucks|mc\b/.test(value)) return "details_invites";
  if (/celebrant|photograph|videograph|florist|music|dj\b|band\b|cater|supplier|vendor|quote|contract/.test(value)) return "celebrant_suppliers";
  if (/venue|wedding date|date hold|location|permit|insurance/.test(value)) return "venue_date";
  return "plan_budget";
}

export function weddingJourneyCategory(task: WeddingPlanningTaskItem): string {
  const value = text(task);
  if (/budget|payment|deposit|cost|quote/.test(value)) return "Money";
  if (/guest|rsvp|invite|transport|accommodation/.test(value)) return "Guests";
  if (/venue|date|permit|insurance/.test(value)) return "Venue & legal";
  if (/supplier|vendor|celebrant|photograph|florist|music|cater/.test(value)) return "Suppliers";
  if (/seating|run sheet|rehearsal|weather|fitting/.test(value)) return "Final coordination";
  return "Planning";
}

export function withWeddingJourneyStage(task: WeddingPlanningTaskItem): WeddingPlanningTaskItem {
  const stage = weddingJourneyStageId(task);
  const metadata = { ...record(task.metadata), wedding_journey_stage: stage };
  const tag = `wedding_journey_stage:${stage}`;
  return { ...task, metadata, semanticTags: [...new Set([...(task.semanticTags ?? []), tag])] };
}

function dateValue(task: WeddingPlanningTaskItem): number {
  const parsed = Date.parse(task.dueAt ?? task.dueLabel ?? "");
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function weddingJourneyGroups(tasks: readonly WeddingPlanningTaskItem[], stage: WeddingJourneyStageId): WeddingJourneyTaskGroup[] {
  const grouped = new Map<string, WeddingPlanningTaskItem[]>();
  tasks.filter((task) => weddingJourneyStageId(task) === stage)
    .sort((a, b) => dateValue(a) - dateValue(b) || a.title.localeCompare(b.title))
    .forEach((task) => {
      const category = weddingJourneyCategory(task);
      grouped.set(category, [...(grouped.get(category) ?? []), task]);
    });
  return [...grouped].map(([category, items]) => ({ category, tasks: items }));
}

function dueDate(weddingDate: string | null | undefined, offsetDays: number): string | null {
  if (!weddingDate) return null;
  const parsed = new Date(`${weddingDate.slice(0, 10)}T09:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + offsetDays);
  return parsed.toISOString();
}

function correctedPrebuiltDeadline(task: WeddingPlanningTaskItem, weddingDate?: string | null): WeddingPlanningTaskItem {
  if (!weddingDate || task.id.startsWith("wedding-custom:") || task.source === "user" || task.source === "manual") return task;
  const value = text(task);
  const offset = /final guest count|close rsvp/.test(value) ? -42
    : /seating plan/.test(value) ? -28
      : /run sheet|final supplier confirmation/.test(value) ? -21
        : /weather|wet.weather/.test(value) ? -28
          : /final fitting/.test(value) ? -14
            : /rehearsal/.test(value) ? -7
              : null;
  if (offset === null) return task;
  const corrected = dueDate(weddingDate, offset);
  return corrected ? { ...task, dueAt: corrected, dueLabel: corrected.slice(0, 10) } : task;
}

const RESEARCH_TASKS: Array<{ id: string; title: string; stage: WeddingJourneyStageId; days: number }> = [
  { id: "save-the-dates", title: "Send save-the-dates", stage: "details_invites", days: -240 },
  { id: "wedding-website", title: "Publish wedding website and guest information", stage: "details_invites", days: -210 },
  { id: "invitations", title: "Send wedding invitations", stage: "details_invites", days: -120 },
  { id: "rsvp-deadline", title: "Close RSVPs and confirm final guest count", stage: "final_prep", days: -42 },
  { id: "guest-travel", title: "Confirm guest accommodation and transport information", stage: "details_invites", days: -90 },
  { id: "permits-insurance", title: "Confirm venue permits and event insurance", stage: "venue_date", days: -150 },
  { id: "final-fitting", title: "Complete final outfit fitting", stage: "final_prep", days: -14 },
  { id: "rehearsal", title: "Hold ceremony rehearsal", stage: "final_prep", days: -7 },
  { id: "shot-list", title: "Confirm photographer shot list", stage: "final_prep", days: -28 },
  { id: "supplier-confirmations", title: "Complete final supplier confirmation sweep", stage: "final_prep", days: -21 },
  { id: "weather-recheck", title: "Recheck weather and wet-weather plan", stage: "final_prep", days: -28 },
  { id: "marriage-certificate", title: "Apply for the official marriage certificate", stage: "wedding_after", days: 7 },
  { id: "thank-yous", title: "Send thank-you messages", stage: "wedding_after", days: 14 },
  { id: "supplier-reviews", title: "Review wedding suppliers", stage: "wedding_after", days: 21 },
  { id: "return-hire", title: "Return hired items", stage: "wedding_after", days: 2 },
];

export function addWeddingResearchTasks(
  tasks: readonly WeddingPlanningTaskItem[],
  weddingDate?: string | null,
): WeddingPlanningTaskItem[] {
  const result = tasks.map((task) => withWeddingJourneyStage(correctedPrebuiltDeadline(task, weddingDate)));
  const searchable = result.map((task) => `${task.id} ${task.title}`.toLowerCase());
  for (const template of RESEARCH_TASKS) {
    if (searchable.some((value) => value.includes(template.id) || value.includes(template.title.toLowerCase()))) continue;
    result.push(withWeddingJourneyStage({
      id: `wedding-research:${template.id}`,
      title: template.title,
      kind: "other",
      dueAt: dueDate(weddingDate, template.days),
      dueLabel: dueDate(weddingDate, template.days)?.slice(0, 10) ?? null,
      priority: "normal",
      source: "agent",
      reviewStatus: "needs_review",
      metadata: { wedding_journey_stage: template.stage, research_backed_template: true },
      notes: "Suggested from the wedding planning timeline research; edit the date to suit your plans.",
    }));
  }
  return result;
}
