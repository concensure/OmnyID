// @locs-version: 1.0
export type FileLibraryQuickFilterActionId =
  | "focus_this_week_ready"
  | "show_connected_notes_ready"
  | "show_zettelkasten_sources"
  | "show_assignments"
  | "show_review_queue"
  | "show_lecture_material"
  | "clear_filters";

export type FileLibraryQuickFilterShortcut = {
  id: FileLibraryQuickFilterActionId;
  label: string;
  detail: string;
  countLabel: string;
  tone: "emerald" | "sky" | "violet" | "amber";
};

export type FileLibraryQuickFilterState = {
  headline: string;
  detail: string;
  badge: string;
  shortcuts: FileLibraryQuickFilterShortcut[];
};

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function buildFileLibraryQuickFilterState(input: {
  matchingCount: number;
  readyCount: number;
  connectedNotesCount: number;
  zettelkastenCount: number;
  assignmentCount: number;
  lectureCount: number;
  reviewQueueCount: number;
  topWeekTag: string | null;
  activeWeekTag: string | null;
  hasActiveFilters: boolean;
}): FileLibraryQuickFilterState | null {
  if (input.matchingCount === 0) return null;

  const weekTarget = input.activeWeekTag ?? input.topWeekTag;
  const shortcuts: FileLibraryQuickFilterShortcut[] = [];

  if (weekTarget && input.readyCount > 0) {
    shortcuts.push({
      id: "focus_this_week_ready",
      label: input.activeWeekTag ? "Stay in this week" : "Open this week's ready set",
      detail: input.activeWeekTag
        ? "Keep the current week focus and surface the material OmnyID thinks is reusable right now."
        : `Jump straight into ${weekTarget} with study-ready material first so revision starts from the most reusable slice.`,
      countLabel: countLabel(input.readyCount, "ready source"),
      tone: "emerald",
    });
  }

  if (input.connectedNotesCount > 0) {
    shortcuts.push({
      id: "show_connected_notes_ready",
      label: "Show connected notes",
      detail: "Surface retained material that is already linked well enough to support same-topic follow-up questions.",
      countLabel: countLabel(input.connectedNotesCount, "connected note source"),
      tone: "sky",
    });
  }

  if (input.zettelkastenCount > 0) {
    shortcuts.push({
      id: "show_zettelkasten_sources",
      label: "Continue note chains",
      detail: "Narrow to Zettelkasten-organized source material so the next action is developing a branch, not searching for a folder.",
      countLabel: countLabel(input.zettelkastenCount, "Zettelkasten source"),
      tone: "violet",
    });
  }

  if (input.assignmentCount > 0) {
    shortcuts.push({
      id: "show_assignments",
      label: "Find assignment support",
      detail: "Narrow to briefs, task context, and assignment-specific material instead of scanning general study files.",
      countLabel: countLabel(input.assignmentCount, "assignment source"),
      tone: "violet",
    });
  }

  if (input.lectureCount > 0) {
    shortcuts.push({
      id: "show_lecture_material",
      label: "Open lecture material",
      detail: "Filter straight to lecture slides, lecture notes, and transcripts when the student needs class material fast.",
      countLabel: countLabel(input.lectureCount, "lecture source"),
      tone: "sky",
    });
  }

  if (input.reviewQueueCount > 0) {
    shortcuts.push({
      id: "show_review_queue",
      label: "Focus review queue",
      detail: "Surface review-pending Zettelkasten material when the goal is to keep one branch moving instead of widening.",
      countLabel: countLabel(input.reviewQueueCount, "review item"),
      tone: "amber",
    });
  }

  if (shortcuts.length === 0) {
    if (!input.hasActiveFilters) return null;
    return {
      headline: "Reset the library, then narrow from the cleanest study slice.",
      detail: "The current filter combination is too specific to recommend a better shortcut. Clear the view and let OmnyID surface the most reusable material first.",
      badge: "No shortcut fit",
      shortcuts: [{
        id: "clear_filters",
        label: "Reset library view",
        detail: "Clear the current filters and start again from the strongest retained study material.",
        countLabel: countLabel(input.matchingCount, "visible file"),
        tone: "amber",
      }],
    };
  }

  return {
    headline: "Open the most likely useful study slice in one click.",
    detail: "These shortcuts sit on top of the existing tag and keyword filters so a stressed student can move straight to the right retained material instead of manually assembling the filter stack.",
    badge: "Quick retrieval",
    shortcuts: shortcuts.slice(0, 4),
  };
}
