// @locs-version: 2.0
import type { WeddingArtifactTablePreview } from "@/lib/weddingArtifactPreviewState";
import {
  evaluateWeddingExperienceDecisionFit,
  type WeddingExperienceModelState,
} from "@/lib/weddingExperienceModelState";
import type { WeddingArtifactKind } from "@/lib/weddingPlanningTemplateState";

export const WEDDING_DECISION_SELECTION_KEY = "omnyid.wedding-decision-selections";

export type WeddingDecisionSelectionOption = {
  id: string;
  alternateIds?: string[];
  rowIndex: number;
  label: string;
  detail: string;
  cells: string[];
  columnCells?: Array<{
    header: string;
    label: string;
    kind: string;
    value: string;
  }>;
  selected: boolean;
  preferenceFitLabels: string[];
  missingPreferenceLabels: string[];
  tradeoffLabels: string[];
  preferenceSummaryLabel: string;
};

export type WeddingDecisionSelectionState = {
  eligible: boolean;
  artifactId: string;
  selectedOptionId: string | null;
  selectedOption: WeddingDecisionSelectionOption | null;
  selectedOptionIds: string[];
  selectedOptions: WeddingDecisionSelectionOption[];
  options: WeddingDecisionSelectionOption[];
  visibleOptions: WeddingDecisionSelectionOption[];
  collapsedOptionCount: number;
  scopeLabels: string[];
  instructionLabel: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 80): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function storageOrNull(storage?: Storage | null): Storage | null {
  return storage ?? globalThis.localStorage ?? globalThis.window?.localStorage ?? null;
}

type WeddingDecisionSelectionRecord = Record<string, string[]>;

function normalizeSelectionValues(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueStrings(value, 12);
  const item = clean(value);
  return item ? [item] : [];
}

function normalizeRecord(value: unknown): WeddingDecisionSelectionRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: WeddingDecisionSelectionRecord = {};
  for (const [key, selected] of Object.entries(value)) {
    const cleanKey = clean(key);
    const cleanSelected = normalizeSelectionValues(selected);
    if (cleanKey && cleanSelected.length > 0) result[cleanKey] = cleanSelected;
  }
  return result;
}

function loadRecord(storage?: Storage | null): WeddingDecisionSelectionRecord {
  const target = storageOrNull(storage);
  if (!target) return {};
  try {
    const raw = target.getItem(WEDDING_DECISION_SELECTION_KEY);
    return normalizeRecord(raw ? JSON.parse(raw) : {});
  } catch {
    target.removeItem(WEDDING_DECISION_SELECTION_KEY);
    return {};
  }
}

function saveRecord(record: WeddingDecisionSelectionRecord, storage?: Storage | null): void {
  const target = storageOrNull(storage);
  if (!target) return;
  try {
    target.setItem(WEDDING_DECISION_SELECTION_KEY, JSON.stringify(normalizeRecord(record)));
  } catch {
    // Selection state is convenience state; ignore storage failures.
  }
}

function optionColumnIndex(table: WeddingArtifactTablePreview | null): number {
  const typedIndex = table?.columns?.findIndex((column) => column.kind === "option") ?? -1;
  if (typedIndex >= 0) return typedIndex;
  const headerIndex = table?.headers.findIndex((header) => /\b(name|vendor|venue|supplier|option|choice)\b/i.test(header)) ?? -1;
  return headerIndex >= 0 ? headerIndex : 0;
}

function stableOptionId(rowIndex: number, labelValue: string): string {
  const label = clean(labelValue) || `option-${rowIndex + 1}`;
  return `${rowIndex}:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function vendorChoiceOptionId(rowIndex: number, labelValue: string): string {
  const label = clean(labelValue) || `option-${rowIndex + 1}`;
  return `vendor_choice:${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}:${rowIndex + 1}`;
}

function isEligibleKind(kind: WeddingArtifactKind): boolean {
  return kind === "vendor_table" || kind === "legal" || kind === "research";
}

type PreferenceSignal = {
  label: string;
  positive: RegExp;
  negative?: RegExp;
};

const PREFERENCE_SIGNALS: PreferenceSignal[] = [
  { label: "wet-weather backup", positive: /\b(indoor|backup|rain|wet[-\s]?weather|weather[-\s]?proof|covered)\b/i, negative: /\b(weather exposed|no indoor|outdoor only|uncovered)\b/i },
  { label: "outdoor/garden feel", positive: /\b(outdoor|garden|greenery|courtyard|terrace|alfresco)\b/i },
  { label: "waterfront/harbour feel", positive: /\b(waterfront|harbou?r|beach|ocean|river|water view|foreshore)\b/i },
  { label: "budget control", positive: /\b(budget|affordable|low cost|lower cost|value|minimum spend|package|included|inclusions)\b/i, negative: /\b(unknown cost|unclear fee|premium|expensive|surcharge|minimum spend)\b/i },
  { label: "accessibility", positive: /\b(accessibility|accessible|wheelchair|step[-\s]?free|lift|mobility|stairs|parking)\b/i, negative: /\b(stairs|no lift|not accessible|limited access)\b/i },
  { label: "public/registry path", positive: /\b(public|registry|courthouse|authorised celebrant|celebrant|noim)\b/i },
  { label: "catering/dietary fit", positive: /\b(catering|menu|dietary|vegetarian|vegan|halal|kosher|allerg)\b/i },
  { label: "guest logistics", positive: /\b(transport|parking|hotel|accommodation|shuttle|rideshare|nearby)\b/i },
];

function preferenceProfile(preferenceText?: string | null): PreferenceSignal[] {
  const text = clean(preferenceText);
  if (!text) return [];
  return PREFERENCE_SIGNALS.filter((signal) => signal.positive.test(text) || signal.negative?.test(text));
}

function evaluatePreferenceFit(rowText: string, profile: readonly PreferenceSignal[]): {
  fit: string[];
  missing: string[];
  tradeoffs: string[];
  summary: string;
} {
  if (profile.length === 0) {
    return {
      fit: [],
      missing: [],
      tradeoffs: [],
      summary: "Preference fit not measured; no explicit preference basis was detected.",
    };
  }
  const fit: string[] = [];
  const missing: string[] = [];
  const tradeoffs: string[] = [];
  for (const signal of profile) {
    if (signal.negative?.test(rowText)) tradeoffs.push(signal.label);
    else if (signal.positive.test(rowText)) fit.push(signal.label);
    else missing.push(signal.label);
  }
  const summary = tradeoffs.length > 0
    ? `${fit.length} fit signal${fit.length === 1 ? "" : "s"}; ${tradeoffs.length} tradeoff${tradeoffs.length === 1 ? "" : "s"}`
    : fit.length > 0
      ? `${fit.length} preference fit signal${fit.length === 1 ? "" : "s"}`
      : "No detected preference fit in this row";
  return {
    fit: fit.slice(0, 4),
    missing: missing.slice(0, 3),
    tradeoffs: tradeoffs.slice(0, 3),
    summary,
  };
}

export function loadWeddingDecisionSelection(artifactId: string, storage?: Storage | null): string | null {
  return loadRecord(storage)[artifactId]?.[0] ?? null;
}

export function loadWeddingDecisionSelections(artifactId: string, storage?: Storage | null): string[] {
  return loadRecord(storage)[artifactId] ?? [];
}

export function setWeddingDecisionSelection(artifactId: string, optionId: string | null, storage?: Storage | null): void {
  setWeddingDecisionSelections(artifactId, optionId ? [optionId] : [], storage);
}

export function setWeddingDecisionSelections(artifactId: string, optionIds: readonly string[], storage?: Storage | null): void {
  const record = loadRecord(storage);
  const selected = uniqueStrings(optionIds, 12);
  if (selected.length > 0) record[artifactId] = selected;
  else delete record[artifactId];
  saveRecord(record, storage);
}

export function toggleWeddingDecisionSelection(artifactId: string, optionId: string, storage?: Storage | null): string | null {
  const current = loadWeddingDecisionSelection(artifactId, storage);
  const next = current === optionId ? null : optionId;
  setWeddingDecisionSelection(artifactId, next, storage);
  return next;
}

export function toggleWeddingDecisionSelectionValue(artifactId: string, optionId: string, storage?: Storage | null): string[] {
  const current = loadWeddingDecisionSelections(artifactId, storage);
  const selected = new Set(current);
  if (selected.has(optionId)) selected.delete(optionId);
  else selected.add(optionId);
  const next = Array.from(selected);
  setWeddingDecisionSelections(artifactId, next, storage);
  return next;
}

export function buildWeddingDecisionSelectionState(input: {
  artifactId: string;
  artifactKind: WeddingArtifactKind;
  table: WeddingArtifactTablePreview | null;
  selectedOptionId?: string | null;
  selectedOptionIds?: readonly string[] | null;
  preferenceText?: string | null;
  experienceModel?: Pick<WeddingExperienceModelState, "traits"> | null;
}): WeddingDecisionSelectionState {
  const eligible = Boolean(clean(input.artifactId) && input.table?.kind === "table" && isEligibleKind(input.artifactKind));
  const selectedIds = new Set(uniqueStrings([
    ...(input.selectedOptionIds ?? []),
    input.selectedOptionId,
  ], 24));
  const profile = preferenceProfile(input.preferenceText);
  const labelIndex = optionColumnIndex(input.table);
  const options = eligible
    ? (input.table?.rows ?? []).map((row, rowIndex) => {
      const label = clean(row[labelIndex]) || clean(row[0]) || `Option ${rowIndex + 1}`;
      const detail = row
        .filter((_, cellIndex) => cellIndex !== labelIndex)
        .map(clean)
        .filter(Boolean)
        .join(" - ") || "No structured detail captured yet.";
      const id = stableOptionId(rowIndex, label);
      const alternateIds = uniqueStrings([vendorChoiceOptionId(rowIndex, label)], 4);
      const rowText = row.map(clean).join(" ");
      const preferenceFit = evaluatePreferenceFit(rowText, profile);
      const experienceFit = evaluateWeddingExperienceDecisionFit(input.experienceModel, rowText);
      const cells = row.map(clean);
      return {
        id,
        alternateIds,
        rowIndex,
        label,
        detail,
        cells,
        columnCells: (input.table?.columns ?? []).map((column, cellIndex) => ({
          header: column.header,
          label: column.label,
          kind: column.kind,
          value: cells[cellIndex] ?? "",
        })),
        selected: selectedIds.has(id) || alternateIds.some((alternateId) => selectedIds.has(alternateId)),
        preferenceFitLabels: uniqueStrings([...preferenceFit.fit, ...experienceFit.fitLabels], 4),
        missingPreferenceLabels: preferenceFit.missing,
        tradeoffLabels: uniqueStrings([...preferenceFit.tradeoffs, ...experienceFit.tradeoffLabels], 4),
        preferenceSummaryLabel: experienceFit.tradeoffLabels.length > 0 || experienceFit.fitLabels.length > 0
          ? `${preferenceFit.summary}; ${experienceFit.summaryLabel}`
          : preferenceFit.summary,
      };
    })
    : [];
  const selectedOptions = options.filter((option) => option.selected);
  const selectedOption = selectedOptions[0] ?? null;
  return {
    eligible,
    artifactId: clean(input.artifactId),
    selectedOptionId: selectedOption?.id ?? null,
    selectedOption,
    selectedOptionIds: selectedOptions.map((option) => option.id),
    selectedOptions,
    options,
    visibleOptions: selectedOptions.length > 0 ? selectedOptions : options.slice(0, 8),
    collapsedOptionCount: selectedOptions.length > 0 ? Math.max(0, options.length - selectedOptions.length) : Math.max(0, options.length - 8),
    scopeLabels: selectedOption
      ? [
        `Selected: ${selectedOptions.map((option) => option.label).join(", ")}`,
        selectedOptions.length > 1 ? "Future reports should prioritize the selected options" : "Future reports should prioritize the selected option",
      ]
      : options.length > 1 ? ["No selected option yet", "Reports should keep comparing the shortlist"] : [],
    instructionLabel: selectedOption
      ? "The selected row is the decision scope for follow-up reports. Untick selected rows to compare all options again."
      : "Tick one or more rows you want the agent to treat as chosen options for follow-up reports.",
  };
}
