// @locs-version: 1.0
import type { AfpMessage, SearchSubmitPayload } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";
import type { OnboardingQuickStartSeed } from "@/lib/onboardingQuickStart";
import type { StudyAcademicScopeInput } from "@/lib/studyAcademicScopeState";

export type StudyLaunchMetadataInput = {
  originLabel?: string | null;
  entryPoint?: string | null;
  flowKind?: string | null;
  focusBadges?: readonly string[] | null;
};

export type StudyLaunchMetadata = {
  originLabel: string | null;
  entryPoint: string | null;
  flowKind: string | null;
  focusBadges: string[];
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    const item = clean(entry);
    const key = item?.toLowerCase();
    if (!item || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function normalizeStudyLaunchMetadata(input: StudyLaunchMetadataInput | null | undefined): StudyLaunchMetadata {
  return {
    originLabel: clean(input?.originLabel),
    entryPoint: clean(input?.entryPoint),
    flowKind: clean(input?.flowKind),
    focusBadges: cleanList(input?.focusBadges),
  };
}

export function studyLaunchMetadataFromQuickStartSeed(
  seed: OnboardingQuickStartSeed | null | undefined,
): SearchSubmitPayload["studyLaunchMetadata"] {
  if (!seed) return undefined;
  const metadata = normalizeStudyLaunchMetadata({
    originLabel: seed.originLabel ?? null,
    entryPoint: seed.entryPoint ?? null,
    flowKind: seed.flowKind ?? null,
    focusBadges: seed.focusBadges ?? [],
  });
  return metadata.originLabel || metadata.entryPoint || metadata.flowKind || metadata.focusBadges.length > 0
    ? metadata
    : undefined;
}

export function studyLaunchMetadataFromMessageMetadata(value: unknown): StudyLaunchMetadata {
  if (!isRecord(value)) return normalizeStudyLaunchMetadata(null);
  return {
    originLabel: clean(value.study_launch_origin_label),
    entryPoint: clean(value.study_launch_entry_point),
    flowKind: clean(value.study_launch_flow_kind),
    focusBadges: cleanList(value.study_launch_focus_badges),
  };
}

export function decoratePreviewMessageWithStudyLaunchMetadata(
  message: AfpMessage,
  input: StudyLaunchMetadataInput | null | undefined,
): AfpMessage {
  const metadata = normalizeStudyLaunchMetadata(input);
  const nextMetadata: Record<string, unknown> = { ...(message.metadata ?? {}) };
  let changed = false;
  if (metadata.originLabel) {
    nextMetadata.study_launch_origin_label = metadata.originLabel;
    changed = true;
  }
  if (metadata.entryPoint) {
    nextMetadata.study_launch_entry_point = metadata.entryPoint;
    changed = true;
  }
  if (metadata.flowKind) {
    nextMetadata.study_launch_flow_kind = metadata.flowKind;
    changed = true;
  }
  if (metadata.focusBadges.length > 0) {
    nextMetadata.study_launch_focus_badges = metadata.focusBadges;
    changed = true;
  }
  return changed ? { ...message, metadata: nextMetadata } : message;
}

function badgeSuffix(badges: readonly string[], prefix: string): string | null {
  const normalizedPrefix = prefix.toLowerCase();
  const match = badges.find((badge) => badge.toLowerCase().startsWith(normalizedPrefix));
  const suffix = match?.slice(prefix.length).trim();
  return suffix || null;
}

const KNOWN_ROUTE_SOURCES = new Set([
  "files",
  "grounded_result",
  "knowledge_graph",
  "object_search",
  "onboarding",
  "reports",
  "saved_report",
  "search_result",
  "study_lens",
  "workspace",
]);

function knownRouteSource(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  return KNOWN_ROUTE_SOURCES.has(normalized) ? normalized : null;
}

export function courseTagFromStudyLaunchMetadata(metadata: StudyLaunchMetadata): string | null {
  const explicit = badgeSuffix(metadata.focusBadges, "course_tag:");
  if (explicit) return explicit;
  const compact = badgeSuffix(metadata.focusBadges, "course:");
  return compact ? `course:${compact.replace(/^course:/i, "")}` : null;
}

export function chapterTagFromStudyLaunchMetadata(metadata: StudyLaunchMetadata): string | null {
  const explicit = badgeSuffix(metadata.focusBadges, "chapter_tag:");
  if (explicit) return explicit;
  const compact = badgeSuffix(metadata.focusBadges, "chapter:");
  return compact ? `chapter:${compact.replace(/^chapter:/i, "")}` : null;
}

export function unitTagFromStudyLaunchMetadata(metadata: StudyLaunchMetadata): string | null {
  const explicit = badgeSuffix(metadata.focusBadges, "unit_tag:");
  if (explicit) return explicit;
  const compact = badgeSuffix(metadata.focusBadges, "unit:");
  return compact ? `unit:${compact.replace(/^unit:/i, "")}` : null;
}

export function moduleLabelFromStudyLaunchMetadata(metadata: StudyLaunchMetadata): string | null {
  return badgeSuffix(metadata.focusBadges, "module:");
}

export function dueLabelFromStudyLaunchMetadata(metadata: StudyLaunchMetadata): string | null {
  return badgeSuffix(metadata.focusBadges, "due:");
}

export function deadlineIdFromStudyLaunchMetadata(metadata: StudyLaunchMetadata): string | null {
  return badgeSuffix(metadata.focusBadges, "deadline:");
}

export function providerIdFromStudyLaunchMetadata(metadata: StudyLaunchMetadata): string | null {
  return badgeSuffix(metadata.focusBadges, "provider:");
}

export function academicKindFromStudyLaunchMetadata(metadata: StudyLaunchMetadata): string | null {
  return badgeSuffix(metadata.focusBadges, "academic_kind:");
}

export function sessionIdFromStudyLaunchMetadata(metadata: StudyLaunchMetadata): string | null {
  return badgeSuffix(metadata.focusBadges, "session:");
}

export function routeSourceFromStudyLaunchMetadata(metadata: StudyLaunchMetadata): string | null {
  return knownRouteSource(badgeSuffix(metadata.focusBadges, "route_source:"))
    ?? knownRouteSource(badgeSuffix(metadata.focusBadges, "source:"))
    ?? knownRouteSource(metadata.entryPoint)
    ?? (metadata.originLabel?.toLowerCase().includes("reports") ? "reports" : null)
    ?? (metadata.originLabel?.toLowerCase().includes("saved report") ? "saved_report" : null)
    ?? (metadata.originLabel?.toLowerCase().includes("grounded result") ? "grounded_result" : null)
    ?? (metadata.originLabel?.toLowerCase().includes("onboarding") ? "onboarding" : null);
}

export function studyAcademicScopeFromStudyLaunchMetadata(metadata: StudyLaunchMetadata): StudyAcademicScopeInput {
  return {
    courseTag: courseTagFromStudyLaunchMetadata(metadata),
    chapterTag: chapterTagFromStudyLaunchMetadata(metadata),
    unitTag: unitTagFromStudyLaunchMetadata(metadata),
    moduleLabel: moduleLabelFromStudyLaunchMetadata(metadata),
    dueLabel: dueLabelFromStudyLaunchMetadata(metadata),
    deadlineId: deadlineIdFromStudyLaunchMetadata(metadata),
    providerId: providerIdFromStudyLaunchMetadata(metadata),
    academicKind: academicKindFromStudyLaunchMetadata(metadata),
    sessionId: sessionIdFromStudyLaunchMetadata(metadata),
    routeSource: routeSourceFromStudyLaunchMetadata(metadata),
  };
}
