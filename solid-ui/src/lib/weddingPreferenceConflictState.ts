// @locs-version: 1.0
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingPreferenceConflictStatus = "insufficient" | "aligned" | "conflict";

export type WeddingPreferenceInput = {
  sourceRef?: string | null;
  personId?: string | null;
  personLabel: string;
  decisionArea?: string | null;
  preferenceLabel: string;
  preferenceDetail?: string | null;
  strength?: number | null;
  underlyingValue?: string | null;
  privateRationaleCiphertext?: string | null;
};

export type WeddingPreferenceLedgerObject = {
  id: string;
  kind: "wedding_preference_signal";
  title: string;
  personId: string;
  personLabel: string;
  decisionArea: string;
  preferenceLabel: string;
  preferenceDetail: string | null;
  strength: number;
  underlyingValue: string | null;
  visibility: "couple_only";
  privateRationaleCiphertext?: string | null;
  metadata: Record<string, unknown>;
  references: Array<{ type: string; target: string }>;
  supertags: string[];
};

export type WeddingPreferenceConflictLedgerObject = {
  id: string;
  kind: "wedding_preference_conflict";
  title: string;
  decisionArea: string;
  conflictAxis: string;
  status: "open" | "ready_for_review";
  surfaceTensionLabel: string;
  underlyingValueLabels: string[];
  preferenceIds: string[];
  requiresCoupleApproval: true;
  metadata: Record<string, unknown>;
  references: Array<{ type: string; target: string }>;
  supertags: string[];
};

export type WeddingPreferenceCompromiseOption = {
  id: string;
  title: string;
  plainLanguage: string;
  satisfiesValues: string[];
  tradeoffLabels: string[];
  requiresCoupleApproval: true;
};

export type WeddingPreferenceConflictState = {
  metadata: WeddingPlanningMetadata;
  status: WeddingPreferenceConflictStatus;
  decisionArea: string;
  conflictAxis: string | null;
  summaryLabel: string;
  preferenceSignals: WeddingPreferenceLedgerObject[];
  conflictObject: WeddingPreferenceConflictLedgerObject | null;
  compromiseOptions: WeddingPreferenceCompromiseOption[];
  nextQuestionLabel: string | null;
  approvalGateLabel: string | null;
  a2ui: Record<string, unknown>;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function strength(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0.6;
}

function uniqueStrings(values: readonly unknown[], limit = 12): string[] {
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

function numberIn(text: string): number | null {
  const match = text.replace(/,/g, "").match(/\b(\d{1,4})\b/);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function inferConflictAxis(preferences: readonly WeddingPreferenceInput[], decisionArea: string): string {
  const text = preferences.map((item) => `${item.preferenceLabel} ${item.preferenceDetail ?? ""}`).join(" ");
  if (/\bguest|people|invite|attendance|intimate|large|small\b/i.test(`${decisionArea} ${text}`)) return "guest_count";
  if (/\bbudget|spend|cost|price|afford/i.test(`${decisionArea} ${text}`)) return "budget";
  if (/\bstyle|formal|relaxed|decor|theme|look|feel/i.test(`${decisionArea} ${text}`)) return "style";
  if (/\bmusic|band|dj|dance/i.test(`${decisionArea} ${text}`)) return "music";
  return safeWeddingLabel(decisionArea) || "decision";
}

function preferencesConflict(preferences: readonly WeddingPreferenceInput[], axis: string): boolean {
  if (preferences.length < 2) return false;
  const values = uniqueStrings(preferences.map(underlyingValueFor), 4);
  if (values.length === 1 && preferences.every((item) => underlyingValueFor(item) === values[0])) return false;
  const labels = preferences.map((item) => clean(`${item.preferenceLabel} ${item.preferenceDetail ?? ""}`).toLowerCase());
  if (axis === "guest_count") {
    const counts = labels.map(numberIn).filter((value): value is number => value !== null);
    if (counts.length >= 2 && Math.max(...counts) - Math.min(...counts) >= 30) return true;
    return labels.some((label) => /\bsmall|intimate|tiny|quiet\b/.test(label))
      && labels.some((label) => /\blarge|big|huge|everyone|extended family\b/.test(label));
  }
  if (axis === "budget") {
    return labels.some((label) => /\blean|cheap|low|save|tight\b/.test(label))
      && labels.some((label) => /\bpremium|luxury|stretch|flexible|splurge\b/.test(label));
  }
  return new Set(labels.map((label) => label.replace(/\d+/g, "#"))).size > 1;
}

function underlyingValueFor(input: WeddingPreferenceInput): string | null {
  const explicit = clean(input.underlyingValue);
  if (explicit) return explicit;
  const text = `${input.preferenceLabel} ${input.preferenceDetail ?? ""}`.toLowerCase();
  if (/\bsmall|intimate|quiet|conversation|meaningful\b/.test(text)) return "meaningful interaction";
  if (/\blarge|everyone|family|include|inclusion\b/.test(text)) return "family inclusion";
  if (/\blean|save|afford|stress\b/.test(text)) return "financial calm";
  if (/\bpremium|quality|once|important\b/.test(text)) return "quality where it matters";
  return null;
}

function preferenceObject(
  input: WeddingPreferenceInput,
  index: number,
  decisionArea: string,
  metadata: WeddingPlanningMetadata,
): WeddingPreferenceLedgerObject {
  const personLabel = clean(input.personLabel) || `Partner ${index + 1}`;
  const personId = clean(input.personId) || `wedding_person:${safeWeddingLabel(personLabel)}`;
  const prefLabel = clean(input.preferenceLabel) || "Preference";
  const sourceRef = clean(input.sourceRef);
  const id = sourceRef || `wedding_preference:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(decisionArea)}:${safeWeddingLabel(personLabel)}:${index + 1}`;
  return {
    id,
    kind: "wedding_preference_signal",
    title: `${personLabel}: ${prefLabel}`,
    personId,
    personLabel,
    decisionArea,
    preferenceLabel: prefLabel,
    preferenceDetail: clean(input.preferenceDetail) || null,
    strength: strength(input.strength),
    underlyingValue: underlyingValueFor(input),
    visibility: "couple_only",
    privateRationaleCiphertext: clean(input.privateRationaleCiphertext) || null,
    metadata: {
      ...metadata,
      decision_area: decisionArea,
      afp_object_kind: "wedding_preference_signal",
    },
    references: [
      { type: "held_by", target: personId },
      { type: "belongs_to_wedding_plan", target: metadata.weddingPlanId },
      ...(sourceRef ? [{ type: "planning_constraint", target: sourceRef }] : []),
    ],
    supertags: [
      "wedding",
      "wedding_preference",
      "couple_only",
      `decision_area:${safeWeddingLabel(decisionArea)}`,
    ],
  };
}

function compromiseOptions(
  axis: string,
  values: readonly string[],
): WeddingPreferenceCompromiseOption[] {
  const joined = values.join(" ").toLowerCase();
  if (axis === "guest_count" && /meaningful interaction/i.test(joined) && /family inclusion/i.test(joined)) {
    return [{
      id: "compromise:guest-scale-clusters",
      title: "Larger guest list, smaller-feeling experience",
      plainLanguage: "Invite the wider family, then protect intimacy with a smaller rehearsal/family dinner, quieter table clusters, and fewer whole-room formal moments.",
      satisfiesValues: ["meaningful interaction", "family inclusion"],
      tradeoffLabels: ["Higher catering and venue load", "Needs stricter seating and timeline design"],
      requiresCoupleApproval: true,
    }];
  }
  return [{
    id: `compromise:${safeWeddingLabel(axis)}:values-first`,
    title: "Choose by values, not averages",
    plainLanguage: "Keep each person's values and reason visible, then compare options by how well they protect those reasons.",
    satisfiesValues: values.length ? [...values] : ["both partners' stated reasons"],
    tradeoffLabels: ["Needs couple review before becoming a rule"],
    requiresCoupleApproval: true,
  }];
}

export function buildWeddingPreferenceConflictState(input: {
  metadata?: unknown;
  decisionArea?: string | null;
  preferences?: readonly WeddingPreferenceInput[] | null;
}): WeddingPreferenceConflictState {
  const metadata = normalizeWeddingPlanningMetadata({
    ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
    supertags: [
      ...normalizeWeddingPlanningMetadata(input.metadata).supertags,
      "wedding_preference_conflict",
      "decisionos:wedding",
    ],
  });
  const decisionArea = clean(input.decisionArea) || "wedding scale";
  const preferences = (input.preferences ?? []).filter((item) => clean(item.personLabel) || clean(item.preferenceLabel));
  const signals = preferences.map((pref, index) => preferenceObject(pref, index, decisionArea, metadata));
  const axis = signals.length >= 2 ? inferConflictAxis(preferences, decisionArea) : null;
  const isConflict = axis ? preferencesConflict(preferences, axis) : false;
  const values = uniqueStrings(signals.map((signal) => signal.underlyingValue), 8);
  const status: WeddingPreferenceConflictStatus = signals.length < 2 ? "insufficient" : isConflict ? "conflict" : "aligned";
  const conflictObject: WeddingPreferenceConflictLedgerObject | null = status === "conflict" && axis ? {
    id: `wedding_preference_conflict:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(decisionArea)}:${safeWeddingLabel(axis)}`,
    kind: "wedding_preference_conflict",
    title: `${decisionArea}: values to balance`,
    decisionArea,
    conflictAxis: axis,
    status: values.length >= 2 ? "ready_for_review" : "open",
    surfaceTensionLabel: axis === "guest_count" ? "Guest count preferences pull in different directions." : "Preferences pull in different directions.",
    underlyingValueLabels: values,
    preferenceIds: signals.map((signal) => signal.id),
    requiresCoupleApproval: true,
    metadata: {
      ...metadata,
      decision_area: decisionArea,
      conflict_axis: axis,
      afp_object_kind: "wedding_preference_conflict",
    },
    references: [
      ...signals.map((signal) => ({ type: "balances_preference", target: signal.id })),
      { type: "belongs_to_wedding_plan", target: metadata.weddingPlanId },
    ],
    supertags: [
      "wedding",
      "wedding_conflict",
      "decisionos:wedding",
      "couple_approval_required",
      `conflict_axis:${safeWeddingLabel(axis)}`,
    ],
  } : null;
  const options = conflictObject ? compromiseOptions(conflictObject.conflictAxis, values) : [];
  const nextQuestion = status === "insufficient"
    ? "Ask each partner what they want and why it matters."
    : status === "conflict" && values.length < 2
      ? "Ask each partner why this preference matters before proposing a compromise."
      : null;
  return {
    metadata,
    status,
    decisionArea,
    conflictAxis: axis,
    summaryLabel: status === "conflict"
      ? `Do not average this decision. Balance ${values.length ? values.join(" and ") : "the reasons behind each preference"}.`
      : status === "aligned"
        ? "Partner preferences look compatible enough to proceed."
        : "More than one partner preference is needed before OmnyID can mediate this decision.",
    preferenceSignals: signals,
    conflictObject,
    compromiseOptions: options,
    nextQuestionLabel: nextQuestion,
    approvalGateLabel: conflictObject ? "Both partners should approve the compromise before it becomes a planning rule." : null,
    a2ui: {
      schema_version: "a2ui.v1",
      kind: "wedding_preference_conflict",
      title: conflictObject?.title ?? "Partner preferences",
      status,
      sections: [
        { title: "What each person wants", items: signals.map((signal) => `${signal.personLabel}: ${signal.preferenceLabel}`) },
        { title: "Why it matters", items: values.length ? values : ["Ask why this matters before solving."] },
        { title: "Possible way through", items: options.map((option) => option.plainLanguage) },
      ],
    },
  };
}
