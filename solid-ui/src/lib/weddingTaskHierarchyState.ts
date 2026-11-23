// @locs-version: 2.0
export type WeddingTaskHierarchyInputTask = {
  task_id: string;
  title: string;
  status: string;
  priority?: string;
  due_date?: string;
  due_label?: string;
  milestone?: string;
  wedding_task_kind?: string;
  second_order_loop?: string;
  second_order_evidence_labels?: readonly string[];
  preparation_checklist?: boolean;
  preparation_checklist_item?: string;
  alert_offset_days?: readonly number[];
  alert_dates?: readonly string[];
  schedule_basis?: string;
};

export type WeddingTaskHierarchyItem<TTask extends WeddingTaskHierarchyInputTask = WeddingTaskHierarchyInputTask> = {
  task: TTask;
  title: string;
  completed: boolean;
  stageId: string;
  stageLabel: string;
  dueText: string;
  dueSortKey: number;
  statusClass: string;
  titleClass: string;
  checkboxLabel: string;
  loopLabel: string | null;
  evidenceLabels: string[];
  preparationLabels: string[];
};

export type WeddingTaskHierarchyStage<TTask extends WeddingTaskHierarchyInputTask = WeddingTaskHierarchyInputTask> = {
  id: string;
  label: string;
  timingLabel: string;
  accentClass: string;
  items: WeddingTaskHierarchyItem<TTask>[];
};

export type WeddingTaskHierarchyState<TTask extends WeddingTaskHierarchyInputTask = WeddingTaskHierarchyInputTask> = {
  stages: WeddingTaskHierarchyStage<TTask>[];
  totalCount: number;
  completedCount: number;
  openCount: number;
  hasWeddingTasks: boolean;
};

const DONE_STATUSES = new Set(["done", "completed", "cancelled"]);

const STAGES = [
  { id: "anytime", label: "Anytime", timingLabel: "No fixed deadline", accentClass: "border-sky-200/60 bg-sky-50/75 text-sky-950" },
  { id: "urgent", label: "This week", timingLabel: "0-7 days", accentClass: "border-rose-200/70 bg-rose-50/80 text-rose-950" },
  { id: "soon", label: "This month", timingLabel: "8-30 days", accentClass: "border-amber-200/70 bg-amber-50/80 text-amber-950" },
  { id: "middle", label: "Next 3 months", timingLabel: "31-90 days", accentClass: "border-orange-200/70 bg-orange-50/70 text-orange-950" },
  { id: "early", label: "Early prep", timingLabel: "91+ days", accentClass: "border-emerald-200/70 bg-emerald-50/70 text-emerald-950" },
  { id: "done", label: "Completed", timingLabel: "Can be unticked", accentClass: "border-slate-200/70 bg-slate-50/75 text-slate-700" },
] as const;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseDate(value: unknown): Date | null {
  const label = clean(value);
  if (!label) return null;
  const parsed = new Date(label);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function daysUntil(dueDate: Date, now: Date): number {
  return Math.round((dayStart(dueDate) - dayStart(now)) / 86_400_000);
}

function dueText(task: WeddingTaskHierarchyInputTask, now: Date): string {
  const explicitLabel = clean(task.due_label);
  const dueDate = parseDate(task.due_date);
  if (!dueDate) return explicitLabel || "Anytime";
  const diff = daysUntil(dueDate, now);
  if (diff < -1) return `${explicitLabel || "Due"} overdue by ${Math.abs(diff)} days`;
  if (diff < 0) return `${explicitLabel || "Due"} yesterday`;
  if (diff === 0) return `${explicitLabel || "Due"} today`;
  if (diff === 1) return `${explicitLabel || "Due"} tomorrow`;
  if (diff <= 30) return `${explicitLabel || "Due"} in ${diff} days`;
  return `${explicitLabel || "Due"} ${dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function stageIdFor(task: WeddingTaskHierarchyInputTask, now: Date): typeof STAGES[number]["id"] {
  if (DONE_STATUSES.has(task.status)) return "done";
  const dueDate = parseDate(task.due_date);
  if (!dueDate) return "anytime";
  const diff = daysUntil(dueDate, now);
  if (diff <= 7) return "urgent";
  if (diff <= 30) return "soon";
  if (diff <= 90) return "middle";
  return "early";
}

function sortKey(task: WeddingTaskHierarchyInputTask): number {
  const dueDate = parseDate(task.due_date);
  if (!dueDate) return -1;
  return dueDate.getTime();
}

function secondOrderLoopLabel(loopKind: string): string | null {
  const normalized = clean(loopKind);
  if (!normalized) return null;
  if (normalized === "weather_backup") return "Weather backup loop";
  if (normalized === "commitment_timing") return "Legal/deposit loop";
  if (normalized === "guest_logistics") return "Guest logistics loop";
  if (normalized === "budget_drift") return "Budget drift loop";
  if (normalized === "contact_follow_up") return "Contact follow-up loop";
  if (normalized === "vendor_confirmation") return "Vendor confirmation loop";
  return `${normalized.replace(/_/g, " ")} loop`;
}

function evidenceLabels(task: WeddingTaskHierarchyInputTask): string[] {
  return (task.second_order_evidence_labels ?? [])
    .filter((label): label is string => typeof label === "string" && label.trim().length > 0)
    .slice(0, 3);
}

function titleCaseLabel(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function scheduleBasisLabel(value: string): string | null {
  const normalized = clean(value);
  if (!normalized) return null;
  if (normalized === "wedding_date") return "Scheduled from wedding date";
  if (normalized === "relative_due_label") return "Relative schedule";
  return `Schedule: ${titleCaseLabel(normalized)}`;
}

function preparationLabels(task: WeddingTaskHierarchyInputTask): string[] {
  const labels: string[] = [];
  const checklistItem = clean(task.preparation_checklist_item);
  if (task.preparation_checklist || checklistItem) {
    labels.push(checklistItem ? `Preparation: ${titleCaseLabel(checklistItem)}` : "Preparation checklist");
  }
  const alertOffsets = (task.alert_offset_days ?? [])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)
    .slice(0, 4);
  if (alertOffsets.length > 0) {
    labels.push(`Alerts: ${alertOffsets.map((value) => `${value}d`).join(", ")}`);
  }
  const alertDates = (task.alert_dates ?? [])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .slice(0, 3);
  if (alertDates.length > 0) {
    labels.push(`Reminder dates: ${alertDates.join(", ")}`);
  }
  const basisLabel = scheduleBasisLabel(task.schedule_basis ?? "");
  if (basisLabel) labels.push(basisLabel);
  return labels;
}

export function isWeddingHierarchyTask(task: WeddingTaskHierarchyInputTask): boolean {
  return task.task_id.startsWith("afp-wedding-task:")
    || clean(task.wedding_task_kind).length > 0
    || clean(task.milestone).toLowerCase().includes("wedding");
}

export function buildWeddingTaskHierarchyState<TTask extends WeddingTaskHierarchyInputTask>(
  tasks: readonly TTask[],
  now = new Date(),
): WeddingTaskHierarchyState<TTask> {
  const weddingTasks = tasks.filter(isWeddingHierarchyTask);
  const items = weddingTasks.map((task): WeddingTaskHierarchyItem<TTask> => {
    const completed = DONE_STATUSES.has(task.status);
    const stageId = stageIdFor(task, now);
    const stage = STAGES.find((entry) => entry.id === stageId) ?? STAGES[0];
    return {
      task,
      title: task.title,
      completed,
      stageId,
      stageLabel: stage.label,
      dueText: dueText(task, now),
      dueSortKey: sortKey(task),
      statusClass: completed ? "bg-emerald-400" : stageId === "anytime" ? "bg-sky-400" : stageId === "urgent" ? "bg-rose-400" : "bg-amber-400",
      titleClass: completed ? "line-through text-on-surface-variant" : "text-on-surface",
      checkboxLabel: completed ? `Mark ${task.title} as not complete` : `Mark ${task.title} complete`,
      loopLabel: secondOrderLoopLabel(clean(task.second_order_loop)),
      evidenceLabels: evidenceLabels(task),
      preparationLabels: preparationLabels(task),
    };
  });
  const grouped = new Map<string, WeddingTaskHierarchyItem<TTask>[]>();
  for (const item of items) {
    const existing = grouped.get(item.stageId) ?? [];
    existing.push(item);
    grouped.set(item.stageId, existing);
  }
  const stages = STAGES
    .map((stage): WeddingTaskHierarchyStage<TTask> => ({
      ...stage,
      items: (grouped.get(stage.id) ?? []).sort((left, right) => {
        if (left.dueSortKey !== right.dueSortKey) return left.dueSortKey - right.dueSortKey;
        return left.title.localeCompare(right.title);
      }),
    }))
    .filter((stage) => stage.items.length > 0);
  return {
    stages,
    totalCount: items.length,
    completedCount: items.filter((item) => item.completed).length,
    openCount: items.filter((item) => !item.completed).length,
    hasWeddingTasks: items.length > 0,
  };
}
