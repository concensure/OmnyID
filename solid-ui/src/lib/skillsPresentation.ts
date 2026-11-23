// @locs-version: 1.0
import type { SkillCapsuleCatalogEntry } from "@/lib/api";
import { surfaceDateTimeLabel, surfaceDateTitleLabel } from "@/lib/surfaceTimestampPresentation";

export const SESSION_TTL_MS = 60 * 60 * 1000;

type SkillCapsulePresentationEntry = Pick<
  SkillCapsuleCatalogEntry,
  "capsule_kind" | "integration_mode"
>;

export function contextOverheadPct(entry: SkillCapsulePresentationEntry): number {
  const kind = entry.capsule_kind?.toLowerCase() ?? "";
  const mode = entry.integration_mode?.toLowerCase() ?? "";
  if (kind === "coding" || kind === "code") return 60;
  if (kind === "analysis" || kind === "data") return 40;
  if (mode === "passive_monitor") return 10;
  if (mode === "agent_assist") return 35;
  if (mode === "editor_compose") return 15;
  return 20;
}

export function totalOverheadPct(activeEntries: SkillCapsulePresentationEntry[]): number {
  if (activeEntries.length === 0) return 0;
  return Math.min(99, activeEntries.reduce((sum, entry) => sum + contextOverheadPct(entry), 0));
}

export function formatCountdown(activatedAt: number, nowMs = Date.now()): string | null {
  const elapsed = nowMs - activatedAt;
  const remaining = SESSION_TTL_MS - elapsed;
  if (remaining <= 0) return "Expired";
  const mins = Math.floor(remaining / 60000);
  if (mins > 20) return null;
  if (mins < 1) return "< 1 min";
  return `${mins}m left`;
}

export function categoryColour(category: string): string {
  switch (category.toLowerCase()) {
    case "coding":
      return "bg-violet-100/80 text-violet-700 border-violet-200/60";
    case "content":
      return "bg-sky-100/80 text-sky-700 border-sky-200/60";
    case "analysis":
      return "bg-amber-100/80 text-amber-700 border-amber-200/60";
    case "workflow":
      return "bg-emerald-100/80 text-emerald-700 border-emerald-200/60";
    case "research":
      return "bg-rose-100/80 text-rose-700 border-rose-200/60";
    case "custom":
      return "bg-fuchsia-100/80 text-fuchsia-700 border-fuchsia-200/60";
    default:
      return "bg-white/60 text-on-surface-variant border-white/40";
  }
}

export function skillActivationHistoryTimestampLabel(timestamp: string): string {
  return surfaceDateTimeLabel(timestamp) || timestamp;
}

export function skillProfileSavedDateLabel(timestamp: string): string {
  return surfaceDateTitleLabel(timestamp) || timestamp;
}
