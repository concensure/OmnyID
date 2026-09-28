// @locs-version: 1.0
import {
  getSelfProfile,
  updateSelfProfile,
  type PrimaryUseCaseKind,
  type PrimaryUseCaseProfile,
  type PrimaryUseCaseSource,
  type StorageStatus,
  type UserSelfProfile,
} from "@/lib/profileLedger";
import type { WeddingEntrySource } from "@/lib/weddingEntrySourceState";

export type PrimaryUseCaseOption = {
  kind: PrimaryUseCaseKind;
  label: string;
  description: string;
};

export const PRIMARY_USE_CASE_OPTIONS: readonly PrimaryUseCaseOption[] = [
  {
    kind: "study",
    label: "Study",
    description: "Student Lens, course files, deadlines, quizzes, and exam prep.",
  },
  {
    kind: "daily_life_management",
    label: "Daily life",
    description: "Tasks, calendar, decisions, inbox, and personal operating loops.",
  },
  {
    kind: "wedding_planning",
    label: "Wedding planning",
    description: "Wedding tasks, vendors, legal setup, budgets, and planning artifacts.",
  },
  {
    kind: "travel_planning",
    label: "Travel planning",
    description: "Itineraries, maps, bookings, constraints, and trip documents.",
  },
  {
    kind: "medical_study",
    label: "Medical study",
    description: "Medical Student Lens, concept graph review, and verified study facts.",
  },
  {
    kind: "work_admin",
    label: "Work admin",
    description: "Email, documents, projects, meetings, and follow-up execution.",
  },
  {
    kind: "general",
    label: "General OmnyID",
    description: "Keep the neutral PersonalOS theme and broad-purpose assistant behavior.",
  },
];

export const PRIMARY_USE_CASE_PROFILE_UPDATED_EVENT = "omnyid:primary-use-case-profile-updated";

const THEME_CLASS_BY_USE_CASE: Partial<Record<PrimaryUseCaseKind, string>> = {
  wedding_planning: "omnyid-usecase-wedding-planning",
  study: "omnyid-usecase-study",
  medical_study: "omnyid-usecase-study",
  travel_planning: "omnyid-usecase-travel",
};

const ALL_THEME_CLASSES = Object.values(THEME_CLASS_BY_USE_CASE).filter(Boolean);

const USE_CASE_TEXT_PATTERNS: readonly {
  kind: PrimaryUseCaseKind;
  patterns: readonly RegExp[];
}[] = [
  {
    kind: "wedding_planning",
    patterns: [
      /\bwedding planning\b/i,
      /\bplan(?:ning)? (?:my|our|a) wedding\b/i,
      /\bbride\b|\bgroom\b|\bcelebrant\b|\bnoim\b/i,
    ],
  },
  {
    kind: "medical_study",
    patterns: [
      /\bmedical student\b/i,
      /\bmed student\b/i,
      /\bmedicine exam\b/i,
      /\banki\b.*\b(?:medicine|medical|pathophys|pharm|clinical)\b/i,
    ],
  },
  {
    kind: "study",
    patterns: [
      /\bstudent\b/i,
      /\bstudy\b/i,
      /\bexam prep\b/i,
      /\bcourse(?:work)?\b/i,
      /\bassignment\b/i,
    ],
  },
  {
    kind: "travel_planning",
    patterns: [
      /\btravel planning\b/i,
      /\btrip planning\b/i,
      /\bitinerary\b/i,
      /\bflights?\b|\bhotels?\b|\bvisa\b/i,
    ],
  },
  {
    kind: "work_admin",
    patterns: [
      /\bwork admin\b/i,
      /\bemail triage\b/i,
      /\bmeeting notes\b/i,
      /\bproject admin\b/i,
    ],
  },
  {
    kind: "daily_life_management",
    patterns: [
      /\bdaily life\b/i,
      /\blife admin\b/i,
      /\bmanage my day\b/i,
      /\btasks? and calendar\b/i,
    ],
  },
];

export function primaryUseCaseLabel(kind: PrimaryUseCaseKind | null | undefined): string {
  return PRIMARY_USE_CASE_OPTIONS.find((option) => option.kind === kind)?.label ?? "General OmnyID";
}

export function inferPrimaryUseCaseKindFromText(text: string | null | undefined): PrimaryUseCaseKind | null {
  const normalized = text?.trim();
  if (!normalized) return null;
  for (const candidate of USE_CASE_TEXT_PATTERNS) {
    if (candidate.patterns.some((pattern) => pattern.test(normalized))) return candidate.kind;
  }
  return null;
}

export function shouldApplyAgentInferredPrimaryUseCase(
  profile: UserSelfProfile | null | undefined,
  inferred: PrimaryUseCaseKind | null,
): boolean {
  if (!inferred) return false;
  const primary = profile?.primary_use_case ?? null;
  if (!primary || primary.status === "completed") return true;
  return primary.kind === "general" && inferred !== "general";
}

export function profileNeedsPrimaryUseCasePrompt(
  profile: UserSelfProfile | null | undefined,
  entrySource?: WeddingEntrySource | null,
): boolean {
  // Wedding-site visitors already declared their intent by arriving via the
  // wedding funnel — asking again is redundant and breaks the dedicated flow.
  if (entrySource === "wedding_site") return false;
  const primary = profile?.primary_use_case ?? null;
  return !primary || primary.status === "completed";
}

export function activePrimaryUseCase(profile: UserSelfProfile | null | undefined): PrimaryUseCaseProfile | null {
  const primary = profile?.primary_use_case ?? null;
  if (!primary || primary.status !== "active") return null;
  return primary;
}

export function primaryUseCaseThemeClass(profile: UserSelfProfile | null | undefined): string | null {
  const primary = activePrimaryUseCase(profile);
  if (!primary) return null;
  return THEME_CLASS_BY_USE_CASE[primary.kind] ?? null;
}

export function applyPrimaryUseCaseTheme(profile: UserSelfProfile | null | undefined, body?: HTMLElement | null): string | null {
  const nextClass = primaryUseCaseThemeClass(profile);
  const targetBody = body ?? (typeof document !== "undefined" ? document.body : null);
  for (const className of ALL_THEME_CLASSES) {
    targetBody?.classList.remove(className);
  }
  if (nextClass) targetBody?.classList.add(nextClass);
  return nextClass;
}

export function buildPrimaryUseCaseProfile(
  kind: PrimaryUseCaseKind,
  source: PrimaryUseCaseSource,
  now = new Date().toISOString(),
  label?: string,
): PrimaryUseCaseProfile {
  return {
    kind,
    status: "active",
    label: label?.trim() || primaryUseCaseLabel(kind),
    started_at: now,
    completed_at: null,
    updated_at: now,
    source,
  };
}

export function completePrimaryUseCaseProfile(
  primary: PrimaryUseCaseProfile | null | undefined,
  now = new Date().toISOString(),
): PrimaryUseCaseProfile | null {
  if (!primary) return null;
  return {
    ...primary,
    status: "completed",
    completed_at: now,
    updated_at: now,
  };
}

export function accountLooksLikeAdmin(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase() ?? "";
  if (!normalized) return false;
  return normalized === "admin@omnyid.com" || normalized.startsWith("admin@") || normalized.includes("+admin@");
}

export function withAdminPrimaryUseCaseDefault(
  profile: UserSelfProfile,
  email: string | null | undefined,
  now = new Date().toISOString(),
): UserSelfProfile {
  if (!accountLooksLikeAdmin(email)) return profile;
  const primary = profile.primary_use_case;
  if (primary?.status === "completed") return profile;
  if (primary?.kind === "wedding_planning" && primary.status === "active") return profile;
  return {
    ...profile,
    primary_use_case: buildPrimaryUseCaseProfile("wedding_planning", "admin_default", now),
    last_updated: now,
  };
}

function dispatchUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PRIMARY_USE_CASE_PROFILE_UPDATED_EVENT));
}

export async function savePrimaryUseCase(
  kind: PrimaryUseCaseKind,
  source: PrimaryUseCaseSource = "profile",
): Promise<StorageStatus> {
  const status = await updateSelfProfile({
    primary_use_case: buildPrimaryUseCaseProfile(kind, source),
  });
  if (status === "ok") dispatchUpdated();
  return status;
}

export async function completeCurrentPrimaryUseCase(): Promise<StorageStatus> {
  const profile = await getSelfProfile();
  const completed = completePrimaryUseCaseProfile(profile.primary_use_case);
  const status = await updateSelfProfile({ primary_use_case: completed });
  if (status === "ok") dispatchUpdated();
  return status;
}
