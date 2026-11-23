// @locs-version: 2.0
import type { WeddingPlanningContext } from "@/lib/weddingNeedToKnowProbingState";
import { normalizeWeddingVendorSelections } from "@/lib/weddingVendorChecklistState";
import { normalizeWeddingFormat, normalizeWeddingFormatSource, type WeddingFormat, type WeddingFormatSource } from "@/lib/weddingFormatState";

export const WEDDING_TEMPLATE_FOLLOW_UP_KEY_PREFIX = "omnyid.wedding-template-follow-up";

export type WeddingTemplateFollowUpDraft = {
  responseWorkspaceId: string;
  weddingFormat: WeddingFormat | "";
  weddingFormatSource: WeddingFormatSource | "";
  dateOrSeason: string;
  location: string;
  guestCount: string;
  budgetComfort: string;
  prioritiesCsv: string;
  atmosphereDescription: string;
  inspirationImageUrlsText: string;
  coupleNames: string;
  vendorCategoryIds: string[];
  vowPreference: "" | "standard" | "create" | "undecided";
  vowStyle: string;
  relationshipFactsCsv: string;
  vowChecklistCsv: string;
  noimDownloaded: "" | "yes" | "no" | "unknown";
  celebrantPath: string;
  requested: boolean;
  savedAt: string;
};

export type WeddingTemplateFollowUpDraftInput = Partial<Omit<WeddingTemplateFollowUpDraft, "savedAt">> & {
  responseWorkspaceId: string;
  nowIso?: string | null;
};

export type WeddingTemplateFollowUpDraftMergeInput = {
  current: WeddingTemplateFollowUpDraft;
  approved: WeddingTemplateFollowUpDraft;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return clean(value);
}

function storageOrNull(storage?: Storage | null): Storage | null {
  return storage ?? globalThis.localStorage ?? globalThis.window?.localStorage ?? null;
}

function keyFor(responseWorkspaceId: unknown, userId?: string | null): string | null {
  const id = clean(responseWorkspaceId);
  const scope = clean(userId);
  return id ? `${WEDDING_TEMPLATE_FOLLOW_UP_KEY_PREFIX}:${id}${scope ? `:${scope}` : ""}` : null;
}

function normalizedNoim(value: unknown): WeddingTemplateFollowUpDraft["noimDownloaded"] {
  return value === "yes" || value === "no" || value === "unknown" ? value : "";
}

function normalizedVowPreference(value: unknown): WeddingTemplateFollowUpDraft["vowPreference"] {
  return value === "standard" || value === "create" || value === "undecided" ? value : "";
}

function normalizedNoimFromContext(value: unknown): WeddingTemplateFollowUpDraft["noimDownloaded"] {
  if (value === true) return "yes";
  if (value === false) return "no";
  return normalizedNoim(value);
}

function textLines(values: readonly unknown[] | null | undefined): string {
  return (values ?? []).map(clean).filter(Boolean).join("\n");
}

export function weddingTemplateFollowUpDraftFromPlanningContext(
  responseWorkspaceId: string,
  planningContext: WeddingPlanningContext | null | undefined,
  input?: { nowIso?: string | null; requested?: boolean | null },
): WeddingTemplateFollowUpDraft {
  const context = planningContext ?? {};
  return {
    responseWorkspaceId: clean(responseWorkspaceId),
    weddingFormat: normalizeWeddingFormat(context.weddingFormat) ?? "",
    weddingFormatSource: normalizeWeddingFormatSource(context.weddingFormatSource) ?? "",
    dateOrSeason: clean(context.dateOrSeason),
    location: clean(context.location),
    guestCount: cleanText(context.guestCount),
    budgetComfort: clean(context.budgetComfort),
    prioritiesCsv: textLines(context.topPriorities).replace(/\n/g, ", "),
    atmosphereDescription: clean(context.atmosphereDescription),
    inspirationImageUrlsText: textLines(context.inspirationImageUrls),
    coupleNames: clean(context.familyOrStakeholderRoles),
    vendorCategoryIds: normalizeWeddingVendorSelections(context.vendorCategories ?? []),
    vowPreference: normalizedVowPreference(context.vowPreference),
    vowStyle: clean(context.vowStyle),
    relationshipFactsCsv: textLines(context.relationshipFactLabels),
    vowChecklistCsv: textLines(context.vowChecklistItems),
    noimDownloaded: normalizedNoimFromContext(context.noimDownloaded),
    celebrantPath: clean(context.celebrantPath),
    requested: input?.requested !== false,
    savedAt: clean(input?.nowIso) || new Date().toISOString(),
  };
}

function preferredText(approved: string, current: string): string {
  return clean(approved) || clean(current);
}

function preferredEnum<T extends string>(approved: T, current: T): T {
  return (clean(approved) ? approved : current) as T;
}

export function mergeWeddingTemplateFollowUpDraftWithApprovedContext(
  input: WeddingTemplateFollowUpDraftMergeInput,
): WeddingTemplateFollowUpDraft {
  const current = input.current;
  const approved = input.approved;
  return {
    responseWorkspaceId: clean(approved.responseWorkspaceId) || clean(current.responseWorkspaceId),
    weddingFormat: approved.weddingFormat || current.weddingFormat,
    weddingFormatSource: approved.weddingFormatSource || current.weddingFormatSource,
    dateOrSeason: preferredText(approved.dateOrSeason, current.dateOrSeason),
    location: preferredText(approved.location, current.location),
    guestCount: preferredText(approved.guestCount, current.guestCount),
    budgetComfort: preferredText(approved.budgetComfort, current.budgetComfort),
    prioritiesCsv: preferredText(approved.prioritiesCsv, current.prioritiesCsv),
    atmosphereDescription: preferredText(approved.atmosphereDescription, current.atmosphereDescription),
    inspirationImageUrlsText: preferredText(approved.inspirationImageUrlsText, current.inspirationImageUrlsText),
    coupleNames: preferredText(approved.coupleNames, current.coupleNames),
    vendorCategoryIds: approved.vendorCategoryIds.length > 0
      ? approved.vendorCategoryIds
      : current.vendorCategoryIds,
    vowPreference: preferredEnum(approved.vowPreference, current.vowPreference),
    vowStyle: preferredText(approved.vowStyle, current.vowStyle),
    relationshipFactsCsv: preferredText(approved.relationshipFactsCsv, current.relationshipFactsCsv),
    vowChecklistCsv: preferredText(approved.vowChecklistCsv, current.vowChecklistCsv),
    noimDownloaded: preferredEnum(approved.noimDownloaded, current.noimDownloaded),
    celebrantPath: preferredText(approved.celebrantPath, current.celebrantPath),
    requested: approved.requested || current.requested,
    savedAt: clean(approved.savedAt) || clean(current.savedAt) || new Date().toISOString(),
  };
}

function normalizeDraft(value: unknown): WeddingTemplateFollowUpDraft | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const responseWorkspaceId = clean(record.responseWorkspaceId);
  const savedAt = clean(record.savedAt);
  if (!responseWorkspaceId || !savedAt) return null;
  return {
    responseWorkspaceId,
    weddingFormat: normalizeWeddingFormat(record.weddingFormat) ?? "",
    weddingFormatSource: normalizeWeddingFormatSource(record.weddingFormatSource) ?? "",
    dateOrSeason: clean(record.dateOrSeason),
    location: clean(record.location),
    guestCount: clean(record.guestCount),
    budgetComfort: clean(record.budgetComfort),
    prioritiesCsv: clean(record.prioritiesCsv),
    atmosphereDescription: clean(record.atmosphereDescription),
    inspirationImageUrlsText: clean(record.inspirationImageUrlsText),
    coupleNames: clean(record.coupleNames),
    vendorCategoryIds: normalizeWeddingVendorSelections(Array.isArray(record.vendorCategoryIds) ? record.vendorCategoryIds : []),
    vowPreference: normalizedVowPreference(record.vowPreference),
    vowStyle: clean(record.vowStyle),
    relationshipFactsCsv: clean(record.relationshipFactsCsv),
    vowChecklistCsv: clean(record.vowChecklistCsv),
    noimDownloaded: normalizedNoim(record.noimDownloaded),
    celebrantPath: clean(record.celebrantPath),
    requested: record.requested === true,
    savedAt,
  };
}

export function saveWeddingTemplateFollowUpDraft(
  input: WeddingTemplateFollowUpDraftInput,
  storage?: Storage | null,
  userId?: string | null,
): WeddingTemplateFollowUpDraft | null {
  const target = storageOrNull(storage);
  const key = keyFor(input.responseWorkspaceId, userId);
  if (!target || !key) return null;
  const draft: WeddingTemplateFollowUpDraft = {
    responseWorkspaceId: clean(input.responseWorkspaceId),
    weddingFormat: normalizeWeddingFormat(input.weddingFormat) ?? "",
    weddingFormatSource: normalizeWeddingFormatSource(input.weddingFormatSource) ?? "",
    dateOrSeason: clean(input.dateOrSeason),
    location: clean(input.location),
    guestCount: clean(input.guestCount),
    budgetComfort: clean(input.budgetComfort),
    prioritiesCsv: clean(input.prioritiesCsv),
    atmosphereDescription: clean(input.atmosphereDescription),
    inspirationImageUrlsText: clean(input.inspirationImageUrlsText),
    coupleNames: clean(input.coupleNames),
    vendorCategoryIds: normalizeWeddingVendorSelections(input.vendorCategoryIds ?? []),
    vowPreference: normalizedVowPreference(input.vowPreference),
    vowStyle: clean(input.vowStyle),
    relationshipFactsCsv: clean(input.relationshipFactsCsv),
    vowChecklistCsv: clean(input.vowChecklistCsv),
    noimDownloaded: normalizedNoim(input.noimDownloaded),
    celebrantPath: clean(input.celebrantPath),
    requested: input.requested === true,
    savedAt: clean(input.nowIso) || new Date().toISOString(),
  };
  try {
    target.setItem(key, JSON.stringify(draft));
    return draft;
  } catch {
    return null;
  }
}

export function loadWeddingTemplateFollowUpDraft(
  responseWorkspaceId: string | null | undefined,
  storage?: Storage | null,
  userId?: string | null,
): WeddingTemplateFollowUpDraft | null {
  const target = storageOrNull(storage);
  const key = keyFor(responseWorkspaceId, userId);
  if (!target || !key) return null;
  try {
    const raw = target.getItem(key);
    if (!raw) return null;
    const draft = normalizeDraft(JSON.parse(raw));
    if (!draft) target.removeItem(key);
    return draft;
  } catch {
    try {
      target.removeItem(key);
    } catch {
      // Ignore cleanup failures from unavailable storage.
    }
    return null;
  }
}

export function clearWeddingTemplateFollowUpDraft(
  responseWorkspaceId: string | null | undefined,
  storage?: Storage | null,
  userId?: string | null,
): void {
  const target = storageOrNull(storage);
  const key = keyFor(responseWorkspaceId, userId);
  if (!target || !key) return;
  try {
    target.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
}
