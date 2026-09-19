// @locs-version: 2.0
import { normalizeWeddingVendorSelections } from "@/lib/weddingVendorChecklistState";

export const WEDDING_TEMPLATE_FOLLOW_UP_KEY_PREFIX = "omnyid.wedding-template-follow-up";

export type WeddingTemplateFollowUpDraft = {
  responseWorkspaceId: string;
  dateOrSeason: string;
  location: string;
  guestCount: string;
  budgetComfort: string;
  prioritiesCsv: string;
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

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function storageOrNull(storage?: Storage | null): Storage | null {
  return storage ?? globalThis.localStorage ?? globalThis.window?.localStorage ?? null;
}

function keyFor(responseWorkspaceId: unknown): string | null {
  const id = clean(responseWorkspaceId);
  return id ? `${WEDDING_TEMPLATE_FOLLOW_UP_KEY_PREFIX}:${id}` : null;
}

function normalizedNoim(value: unknown): WeddingTemplateFollowUpDraft["noimDownloaded"] {
  return value === "yes" || value === "no" || value === "unknown" ? value : "";
}

function normalizedVowPreference(value: unknown): WeddingTemplateFollowUpDraft["vowPreference"] {
  return value === "standard" || value === "create" || value === "undecided" ? value : "";
}

function normalizeDraft(value: unknown): WeddingTemplateFollowUpDraft | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const responseWorkspaceId = clean(record.responseWorkspaceId);
  const savedAt = clean(record.savedAt);
  if (!responseWorkspaceId || !savedAt) return null;
  return {
    responseWorkspaceId,
    dateOrSeason: clean(record.dateOrSeason),
    location: clean(record.location),
    guestCount: clean(record.guestCount),
    budgetComfort: clean(record.budgetComfort),
    prioritiesCsv: clean(record.prioritiesCsv),
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
): WeddingTemplateFollowUpDraft | null {
  const target = storageOrNull(storage);
  const key = keyFor(input.responseWorkspaceId);
  if (!target || !key) return null;
  const draft: WeddingTemplateFollowUpDraft = {
    responseWorkspaceId: clean(input.responseWorkspaceId),
    dateOrSeason: clean(input.dateOrSeason),
    location: clean(input.location),
    guestCount: clean(input.guestCount),
    budgetComfort: clean(input.budgetComfort),
    prioritiesCsv: clean(input.prioritiesCsv),
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
): WeddingTemplateFollowUpDraft | null {
  const target = storageOrNull(storage);
  const key = keyFor(responseWorkspaceId);
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
): void {
  const target = storageOrNull(storage);
  const key = keyFor(responseWorkspaceId);
  if (!target || !key) return;
  try {
    target.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
}
