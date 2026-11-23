import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";

export type WeddingTaskVisualStatus = {
  id: "pending" | "in_progress" | "blocked" | "completed";
  label: string;
  railClass: string;
  badgeClass: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function weddingTaskVisualStatus(task: WeddingPlanningTaskItem, completed = false): WeddingTaskVisualStatus {
  if (completed) return {
    id: "completed",
    label: "Completed",
    railClass: "bg-teal-600",
    badgeClass: "bg-teal-100 text-teal-900",
  };
  const metadata = record(task.metadata);
  const value = `${metadata.status ?? ""} ${task.reviewStatus ?? ""} ${task.approvalState ?? ""}`.toLowerCase();
  if (/block|failed|overdue/.test(value)) return {
    id: "blocked",
    label: "Needs attention",
    railClass: "bg-red-700",
    badgeClass: "bg-red-100 text-red-900",
  };
  if (/progress|started|working|review/.test(value)) return {
    id: "in_progress",
    label: "In progress",
    railClass: "bg-amber-500",
    badgeClass: "bg-amber-100 text-amber-900",
  };
  return {
    id: "pending",
    label: "Pending",
    railClass: "bg-wedding-ink/45",
    badgeClass: "bg-wedding-slate text-wedding-ink",
  };
}
