// @locs-version: 1.0
import type { StudyLensSidebarSection } from "@/lib/studyLensSidebarState";

export function shouldShowMedicalMissedTopicCapture(input: {
  sidebar: readonly StudyLensSidebarSection[];
  canRecord: boolean;
}): boolean {
  return input.canRecord && input.sidebar.some((section) => section.title === "Medical readiness");
}
