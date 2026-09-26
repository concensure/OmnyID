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
  rowIndex: number;
  label: string;
  detail: string;
  cells: string[];
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

function normalizeRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, selected] of Object.entries(value)) {
    const cleanKey = clean(key);
    const cleanSelected = clean(selected);
    if (cleanKey && cleanSelected) result[cleanKey] = cleanSelected;
  }
  return result;
}

function loadRecord(storage?: Storage | null): Record<string, string> {
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

function saveRecord(record: Record<string, string>, storage?: Storage | null): void {
  const target = storageOrNull(storage);
  if (!target) return;
  try {
    target.setItem(WEDDING_DECISION_SELECTION_KEY, JSON.stringify(normalizeRecord(record)));
  } catch {
    // Selection state is convenience state; ignore storage failures.
  }
}

function stableOptionId(rowIndex: number, row: readonly string[]): string {
  const label = clean(row[0]) || `option-${rowIndex + 1}`;
  return `${rowIndex}:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
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
  return loadRecord(storage)[artifactId] ?? null;
}

export function setWeddingDecisionSelection(artifactId: string, optionId: string | null, storage?: Storage | null): void {
  const record = loadRecord(storage);
  if (optionId) record[artifactId] = optionId;
  else delete record[artifactId];
  saveRecord(record, storage);
}

export function toggleWeddingDecisionSelection(artifactId: string, optionId: string, storage?: Storage | null): string | null {
  const current = loadWeddingDecisionSelection(artifactId, storage);
  const next = current === optionId ? null : optionId;
  setWeddingDecisionSelection(artifactId, next, storage);
  return next;
}

export function buildWeddingDecisionSelectionState(input: {
  artifactId: string;
  artifactKind: WeddingArtifactKind;
  table: WeddingArtifactTablePreview | null;
  selectedOptionId?: string | null;
  preferenceText?: string | null;
  experienceModel?: Pick<WeddingExperienceModelState, "traits"> | null;
}): WeddingDecisionSelectionState {
  const eligible = Boolean(clean(input.artifactId) && input.table?.kind === "table" && isEligibleKind(input.artifactKind));
  const profile = preferenceProfile(input.preferenceText);
  const options = eligible
    ? (input.table?.rows ?? []).map((row, rowIndex) => {
      const label = clean(row[0]) || `Option ${rowIndex + 1}`;
      const detail = row.slice(1).map(clean).filter(Boolean).join(" - ") || "No structured detail captured yet.";
      const id = stableOptionId(rowIndex, row);
      const rowText = row.map(clean).join(" ");
      const preferenceFit = evaluatePreferenceFit(rowText, profile);
      const experienceFit = evaluateWeddingExperienceDecisionFit(input.experienceModel, rowText);
      return {
        id,
        rowIndex,
        label,
        detail,
        cells: row.map(clean),
        selected: id === input.selectedOptionId,
        preferenceFitLabels: uniqueStrings([...preferenceFit.fit, ...experienceFit.fitLabels], 4),
        missingPreferenceLabels: preferenceFit.missing,
        tradeoffLabels: uniqueStrings([...preferenceFit.tradeoffs, ...experienceFit.tradeoffLabels], 4),
        preferenceSummaryLabel: experienceFit.tradeoffLabels.length > 0 || experienceFit.fitLabels.length > 0
          ? `${preferenceFit.summary}; ${experienceFit.summaryLabel}`
          : preferenceFit.summary,
      };
    })
    : [];
  const selectedOption = options.find((option) => option.selected) ?? null;
  return {
    eligible,
    artifactId: clean(input.artifactId),
    selectedOptionId: selectedOption?.id ?? null,
    selectedOption,
    options,
    visibleOptions: selectedOption ? [selectedOption] : options.slice(0, 8),
    collapsedOptionCount: selectedOption ? Math.max(0, options.length - 1) : Math.max(0, options.length - 8),
    scopeLabels: selectedOption
      ? [`Selected: ${selectedOption.label}`, "Future reports should prioritize the selected option"]
      : options.length > 1 ? ["No selected option yet", "Reports should keep comparing the shortlist"] : [],
    instructionLabel: selectedOption
      ? "The selected row is the decision scope for follow-up reports. Untick it to compare all options again."
      : "Tick the row you want the agent to treat as the chosen option for follow-up reports.",
  };
}
