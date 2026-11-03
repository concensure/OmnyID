import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import {
  WEDDING_CATALOGUE_STAGES,
  WEDDING_CATALOGUE_WORKSPACE_TASKS,
  WEDDING_TASK_CATALOGUE_VERSION,
  type WeddingCatalogueStageId,
} from "@/lib/weddingTaskCatalogueState";

export const WEDDING_JOURNEY_STAGES = WEDDING_CATALOGUE_STAGES;

export type WeddingJourneyStageId = WeddingCatalogueStageId;

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

export function addWeddingResearchTasks(
  tasks: readonly WeddingPlanningTaskItem[],
  weddingDate?: string | null,
): WeddingPlanningTaskItem[] {
  const result = tasks.map((task) => withWeddingJourneyStage(correctedPrebuiltDeadline(task, weddingDate)));
  const searchable = result.map((task) => `${task.id} ${task.title}`.toLowerCase());
  for (const template of WEDDING_CATALOGUE_WORKSPACE_TASKS) {
    if (searchable.some((value) => value.includes(template.id) || value.includes(template.title.toLowerCase()))) continue;
    result.push(withWeddingJourneyStage({
      id: `wedding-research:${template.id}`,
      title: template.title,
      kind: "other",
      dueAt: dueDate(weddingDate, template.targetOffsetDays),
      dueLabel: dueDate(weddingDate, template.targetOffsetDays)?.slice(0, 10) ?? null,
      priority: "normal",
      source: "agent",
      reviewStatus: "needs_review",
      metadata: {
        wedding_journey_stage: template.stageId,
        research_backed_template: true,
        wedding_catalogue_version: WEDDING_TASK_CATALOGUE_VERSION,
        wedding_catalogue_task_id: template.id,
        wedding_catalogue_source_id: template.sourceId,
      },
      notes: template.notes ?? "Suggested from the wedding planning timeline research; edit the date to suit your plans.",
    }));
  }
  return result;
}
