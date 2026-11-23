// @locs-version: 1.0
// Lets a couple set an overall wedding budget and allocate it across broad
// categories. Deliberately reuses the EXISTING "wedding decision" AFP shape
// (subtype: wedding_decision_selection, artifactKind: budget_sheet) rather than
// inventing a parallel mechanism, so a saved allocation automatically flows
// through the same infrastructure a vendor decision already does: it becomes a
// WeddingPersistedDecisionRecord, feeds the knowledge graph
// (weddingPersistedDecisionRecordsToGraphDecisions) and the wedding
// second-order-loop/"Saved decision scope" surfaces, and is routed AFP-side to
// agent://decision-queue and agent://knowledge-graph exactly like any other
// wedding decision (see weddingDecisionProjectionToAfpMessage's `to` field).
import type { WeddingDecisionProjectionInput } from "@/lib/weddingDecisionAfpProjectionState";
import type { WeddingPersistedDecisionRecord } from "@/lib/weddingPersistedWorkspaceState";
import { normalizeWeddingPlanningMetadata, type WeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";
import { weddingAccountScopedStorageKey } from "@/lib/weddingLocalAccountScope";

export const WEDDING_BUDGET_ALLOCATION_ARTIFACT_KIND = "budget_sheet";
export const WEDDING_BUDGET_ALLOCATION_ARTIFACT_ID = "wedding-budget-allocation";
export const WEDDING_BUDGET_ALLOCATION_SELECTED_OPTION_ID = "total-budget";
export const WEDDING_BUDGET_ALLOCATION_LOCAL_SAVE_EVENT = "omnyid:wedding-budget-allocation-local-save";
const WEDDING_BUDGET_ALLOCATION_DRAFT_KEY_PREFIX = "omnyid.wedding.budget-allocation-draft.";
const WEDDING_BUDGET_ALLOCATION_PENDING_DECISION_KEY_PREFIX = "omnyid.wedding.budget-allocation-pending-decision.";

export type WeddingBudgetCategoryId =
  | "venue_ceremony"
  | "catering_drinks"
  | "photo_video"
  | "attire_beauty"
  | "flowers_decor"
  | "entertainment_music"
  | "other_misc";

export type WeddingBudgetCategoryDefinition = {
  id: WeddingBudgetCategoryId;
  label: string;
};

/** Seven broad categories intended to cover all major wedding cost centers. */
export const WEDDING_BUDGET_CATEGORIES: readonly WeddingBudgetCategoryDefinition[] = [
  { id: "venue_ceremony", label: "Venue & Ceremony" },
  { id: "catering_drinks", label: "Catering & Drinks" },
  { id: "photo_video", label: "Photography & Video" },
  { id: "attire_beauty", label: "Attire & Beauty" },
  { id: "flowers_decor", label: "Flowers & Decor" },
  { id: "entertainment_music", label: "Entertainment & Music" },
  { id: "other_misc", label: "Stationery, Transport & Other" },
];

export type WeddingBudgetAllocationDraft = {
  totalAmount: number;
  currency: string;
  categoryAmounts: Record<WeddingBudgetCategoryId, number>;
};

export type WeddingBudgetAllocationCategoryAmount = {
  categoryId: WeddingBudgetCategoryId;
  categoryLabel: string;
  amount: number;
};

export type WeddingBudgetAllocationSummary = {
  totalAmount: number;
  currency: string;
  categories: WeddingBudgetAllocationCategoryAmount[];
  createdAt: string;
  source: string | null;
};

export type WeddingBudgetAllocationSaveState = {
  canSave: boolean;
  disabledReason: string | null;
};

function categoryLabel(id: WeddingBudgetCategoryId): string {
  return WEDDING_BUDGET_CATEGORIES.find((category) => category.id === id)?.label ?? id;
}

export function emptyWeddingBudgetAllocationDraft(currency = "AUD"): WeddingBudgetAllocationDraft {
  const categoryAmounts = {} as Record<WeddingBudgetCategoryId, number>;
  for (const category of WEDDING_BUDGET_CATEGORIES) categoryAmounts[category.id] = 0;
  return { totalAmount: 0, currency, categoryAmounts };
}

export function weddingBudgetAllocationAllocatedAmount(draft: WeddingBudgetAllocationDraft): number {
  return WEDDING_BUDGET_CATEGORIES.reduce((sum, category) => sum + (draft.categoryAmounts[category.id] || 0), 0);
}

export function weddingBudgetAllocationRemaining(draft: WeddingBudgetAllocationDraft): number {
  return draft.totalAmount - weddingBudgetAllocationAllocatedAmount(draft);
}

/** True only once every dollar of the total has been assigned to a category — the save gate. */
export function weddingBudgetAllocationIsBalanced(draft: WeddingBudgetAllocationDraft): boolean {
  return draft.totalAmount > 0 && weddingBudgetAllocationRemaining(draft) === 0;
}

/** The category that silently absorbs whatever the others leave over, so the total
 * always stays balanced without requiring the user to hit an exact split by hand
 * across 7 sliders. */
export const WEDDING_BUDGET_AUTO_BALANCE_CATEGORY_ID: WeddingBudgetCategoryId = "other_misc";

export function withWeddingBudgetAutoBalance(draft: WeddingBudgetAllocationDraft): WeddingBudgetAllocationDraft {
  const othersSum = WEDDING_BUDGET_CATEGORIES
    .filter((category) => category.id !== WEDDING_BUDGET_AUTO_BALANCE_CATEGORY_ID)
    .reduce((sum, category) => sum + (draft.categoryAmounts[category.id] || 0), 0);
  const remainder = Math.max(0, draft.totalAmount - othersSum);
  return {
    ...draft,
    categoryAmounts: { ...draft.categoryAmounts, [WEDDING_BUDGET_AUTO_BALANCE_CATEGORY_ID]: remainder },
  };
}

export function buildWeddingBudgetAllocationSaveState(input: {
  draft: WeddingBudgetAllocationDraft;
  saving?: boolean;
  saveAvailable?: boolean;
}): WeddingBudgetAllocationSaveState {
  if (input.saving) return { canSave: false, disabledReason: "Saving your budget now." };
  if (input.saveAvailable === false) return { canSave: false, disabledReason: "Saving is not connected for this wedding yet." };
  if (input.draft.totalAmount <= 0) return { canSave: false, disabledReason: "Enter a total budget before saving." };
  const remaining = weddingBudgetAllocationRemaining(input.draft);
  if (remaining > 0) return { canSave: false, disabledReason: "Allocate the remaining budget before saving." };
  if (remaining < 0) return { canSave: false, disabledReason: "Reduce category amounts so they match the total." };
  return { canSave: true, disabledReason: null };
}

export function isWeddingBudgetAllocationDecisionRecord(record: Pick<
  WeddingPersistedDecisionRecord,
  "artifactId" | "artifactKind" | "selectedOptionId"
>): boolean {
  return record.artifactKind === WEDDING_BUDGET_ALLOCATION_ARTIFACT_KIND
    && record.artifactId === WEDDING_BUDGET_ALLOCATION_ARTIFACT_ID
    && record.selectedOptionId === WEDDING_BUDGET_ALLOCATION_SELECTED_OPTION_ID;
}

function moneyLabel(amount: number, currency: string): string {
  return amount.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: 0 });
}

function draftStorageKey(weddingPlanId: string): string {
  return weddingAccountScopedStorageKey(`${WEDDING_BUDGET_ALLOCATION_DRAFT_KEY_PREFIX}${weddingPlanId}`);
}

function pendingDecisionStorageKey(weddingPlanId: string): string {
  return weddingAccountScopedStorageKey(`${WEDDING_BUDGET_ALLOCATION_PENDING_DECISION_KEY_PREFIX}${weddingPlanId}`);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function normalizePendingDecision(value: unknown): WeddingDecisionProjectionInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const selectedOption = record.selectedOption;
  if (!selectedOption || typeof selectedOption !== "object" || Array.isArray(selectedOption)) return null;
  const optionRecord = selectedOption as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const artifactId = typeof record.artifactId === "string" ? record.artifactId.trim() : "";
  const artifactTitle = typeof record.artifactTitle === "string" ? record.artifactTitle.trim() : "";
  const artifactKind = typeof record.artifactKind === "string" ? record.artifactKind.trim() : "";
  const optionId = typeof optionRecord.id === "string" ? optionRecord.id.trim() : "";
  const optionLabel = typeof optionRecord.label === "string" ? optionRecord.label.trim() : "";
  if (!id || artifactId !== WEDDING_BUDGET_ALLOCATION_ARTIFACT_ID || artifactKind !== WEDDING_BUDGET_ALLOCATION_ARTIFACT_KIND || optionId !== WEDDING_BUDGET_ALLOCATION_SELECTED_OPTION_ID || !optionLabel) {
    return null;
  }
  return {
    id,
    metadata: record.metadata,
    artifactId,
    artifactTitle: artifactTitle || "Wedding Budget",
    artifactKind,
    sourceLabels: stringArray(record.sourceLabels),
    sourceUrls: stringArray(record.sourceUrls),
    sourceProviderLabels: stringArray(record.sourceProviderLabels),
    selectedOption: {
      id: optionId,
      rowIndex: typeof optionRecord.rowIndex === "number" && Number.isFinite(optionRecord.rowIndex) ? optionRecord.rowIndex : 0,
      label: optionLabel,
      detail: typeof optionRecord.detail === "string" ? optionRecord.detail : "",
      cells: stringArray(optionRecord.cells),
      selected: optionRecord.selected === true,
      preferenceFitLabels: stringArray(optionRecord.preferenceFitLabels),
      missingPreferenceLabels: stringArray(optionRecord.missingPreferenceLabels),
      tradeoffLabels: stringArray(optionRecord.tradeoffLabels),
      preferenceSummaryLabel: typeof optionRecord.preferenceSummaryLabel === "string" ? optionRecord.preferenceSummaryLabel : "",
    },
    source: record.source === "user" || record.source === "agent" || record.source === "manual" || record.source === "local_selection"
      ? record.source
      : "local_selection",
    createdAt: typeof record.createdAt === "string" ? record.createdAt : null,
  };
}

export function loadWeddingBudgetAllocationDraft(
  weddingPlanId: string,
  storage: Storage = localStorage,
): WeddingBudgetAllocationDraft | null {
  try {
    const raw = storage.getItem(draftStorageKey(weddingPlanId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WeddingBudgetAllocationDraft>;
    if (typeof parsed.totalAmount !== "number" || typeof parsed.categoryAmounts !== "object" || !parsed.categoryAmounts) return null;
    const draft = emptyWeddingBudgetAllocationDraft(typeof parsed.currency === "string" ? parsed.currency : "AUD");
    draft.totalAmount = Math.max(0, Math.round(parsed.totalAmount));
    for (const category of WEDDING_BUDGET_CATEGORIES) {
      const value = (parsed.categoryAmounts as Record<string, unknown>)[category.id];
      draft.categoryAmounts[category.id] = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    }
    return draft;
  } catch {
    return null;
  }
}

export function loadWeddingBudgetAllocationPendingDecision(
  weddingPlanId: string,
  storage: Storage = localStorage,
): WeddingDecisionProjectionInput | null {
  try {
    const raw = storage.getItem(pendingDecisionStorageKey(weddingPlanId));
    if (!raw) return null;
    return normalizePendingDecision(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveWeddingBudgetAllocationDraft(
  weddingPlanId: string,
  draft: WeddingBudgetAllocationDraft,
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(draftStorageKey(weddingPlanId), JSON.stringify(draft));
  } catch {
    // Draft persistence is convenience state only; ignore storage failures.
  }
}

export function saveWeddingBudgetAllocationPendingDecision(
  weddingPlanId: string,
  decision: WeddingDecisionProjectionInput,
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(pendingDecisionStorageKey(weddingPlanId), JSON.stringify(decision));
  } catch {
    // Pending decision persistence is local fallback state only.
  }
}

export function clearWeddingBudgetAllocationPendingDecision(
  weddingPlanId: string,
  storage: Storage = localStorage,
): void {
  try {
    storage.removeItem(pendingDecisionStorageKey(weddingPlanId));
  } catch {
    // Local fallback cleanup is best-effort.
  }
}

export function dispatchWeddingBudgetAllocationLocalSave(
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(WEDDING_BUDGET_ALLOCATION_LOCAL_SAVE_EVENT));
}

/** Builds the AFP-ready decision projection for a balanced draft — the same shape a vendor-table pick produces. */
export function buildWeddingBudgetAllocationProjectionInput(
  draft: WeddingBudgetAllocationDraft,
  metadata: unknown,
  createdAt = new Date().toISOString(),
): WeddingDecisionProjectionInput {
  if (!weddingBudgetAllocationIsBalanced(draft)) {
    throw new Error("Wedding budget allocation must be balanced before it can be saved.");
  }
  const normalizedMetadata: WeddingPlanningMetadata = normalizeWeddingPlanningMetadata(metadata);
  const cells = WEDDING_BUDGET_CATEGORIES.map((category) => (
    `${category.label}: ${moneyLabel(draft.categoryAmounts[category.id] || 0, draft.currency)}`
  ));
  // Deterministic on the exact figures: saving the same allocation twice produces the same
  // decision id (a harmless resend), while any change in total or any category produces a new
  // one — a new decision worth recording, exactly like picking a different vendor row would.
  const figureFingerprint = [draft.totalAmount, ...WEDDING_BUDGET_CATEGORIES.map((category) => draft.categoryAmounts[category.id] || 0)].join("-");
  return {
    id: `wedding_decision:${normalizedMetadata.responseWorkspaceId}:${WEDDING_BUDGET_ALLOCATION_ARTIFACT_ID}:${figureFingerprint}`,
    metadata: normalizedMetadata,
    artifactId: WEDDING_BUDGET_ALLOCATION_ARTIFACT_ID,
    artifactTitle: "Wedding Budget",
    artifactKind: WEDDING_BUDGET_ALLOCATION_ARTIFACT_KIND,
    selectedOption: {
      id: WEDDING_BUDGET_ALLOCATION_SELECTED_OPTION_ID,
      rowIndex: 0,
      label: `${moneyLabel(draft.totalAmount, draft.currency)} total`,
      detail: `Allocated across ${WEDDING_BUDGET_CATEGORIES.length} categories: ${cells.join(", ")}.`,
      cells,
      selected: true,
      preferenceFitLabels: [],
      missingPreferenceLabels: [],
      tradeoffLabels: [],
      preferenceSummaryLabel: "Overall budget and category allocation set by the couple.",
    },
    source: "user",
    createdAt,
  };
}

function parseCellAmount(cell: string, label: string): number | null {
  if (!cell.toLowerCase().startsWith(label.toLowerCase())) return null;
  const match = cell.match(/[\d][\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const amount = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

function currencyFromCell(cell: string): string | null {
  const match = cell.match(/\b([A-Z]{3})\b/);
  return match ? match[1] : null;
}

/** The inverse of buildWeddingBudgetAllocationProjectionInput — reads a persisted (or locally
 * pending) budget decision record back into structured figures for the tracker UI to render. */
export function weddingBudgetAllocationFromDecisionRecords(
  records: readonly WeddingPersistedDecisionRecord[],
): WeddingBudgetAllocationSummary | null {
  const budgetRecords = records
    .filter(isWeddingBudgetAllocationDecisionRecord)
    .slice()
    .sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""));
  const latest = budgetRecords[0];
  if (!latest) return null;

  const categories: WeddingBudgetAllocationCategoryAmount[] = [];
  let currency = "AUD";
  for (const category of WEDDING_BUDGET_CATEGORIES) {
    const cell = latest.selectedOptionCells.find((entry) => entry.toLowerCase().startsWith(category.label.toLowerCase()));
    if (!cell) continue;
    const amount = parseCellAmount(cell, category.label);
    if (amount === null) continue;
    currency = currencyFromCell(cell) ?? currency;
    categories.push({ categoryId: category.id, categoryLabel: categoryLabel(category.id), amount });
  }
  if (categories.length === 0) return null;

  return {
    totalAmount: categories.reduce((sum, category) => sum + category.amount, 0),
    currency,
    categories,
    createdAt: latest.createdAt,
    source: latest.source,
  };
}

export function weddingBudgetAllocationHistoryFromDecisionRecords(
  records: readonly WeddingPersistedDecisionRecord[],
): WeddingBudgetAllocationSummary[] {
  const history: WeddingBudgetAllocationSummary[] = [];
  const seen = new Set<string>();
  for (const record of records
    .filter(isWeddingBudgetAllocationDecisionRecord)
    .slice()
    .sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""))) {
    const summary = weddingBudgetAllocationFromDecisionRecords([record]);
    if (!summary) continue;
    const fingerprint = `${summary.totalAmount}:${summary.categories.map((item) => `${item.categoryId}:${item.amount}`).join("|")}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    history.push(summary);
  }
  return history;
}
