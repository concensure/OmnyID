// @locs-version: 1.0
import { parseJsonValue } from "@/lib/jsonParseState";

export const MEDICAL_FACT_VERIFICATION_RECORDS_KEY = "omnyid.medical-fact-verifications";
const MAX_MEDICAL_FACT_VERIFICATION_RECORDS = 200;

export type MedicalFactVerificationTargetKind = "passage" | "image";
export type MedicalFactVerificationStatus =
  | "not_requested"
  | "queued"
  | "needs_review"
  | "partially_verified"
  | "verified";
export type MedicalFactVerificationDepth = "quick" | "standard" | "deep";
export type MedicalVerificationSourceTier =
  | "student_source"
  | "trusted_reference"
  | "ontology"
  | "peer_reviewed_review"
  | "peer_reviewed_primary"
  | "unknown";

export type MedicalVerificationSourceEvidence = {
  label: string;
  tier: MedicalVerificationSourceTier;
  locator: string | null;
  year: number | null;
  supportsClaim: boolean;
};

export type MedicalFactVerificationButtonState = {
  visible: boolean;
  label: string;
  targetId: string | null;
  disabledReason: string | null;
  scopeLabels: string[];
};

export type MedicalFactVerificationRequest = {
  targetId: string;
  targetKind: MedicalFactVerificationTargetKind;
  targetText: string;
  depth: MedicalFactVerificationDepth;
  promptLines: string[];
  sourceBudget: number;
  tokenBudgetLabel: string;
  scopeLabels: string[];
};

export type MedicalFactVerificationRecord = {
  id: string;
  targetKind: MedicalFactVerificationTargetKind;
  targetText: string;
  targetHash: string;
  status: MedicalFactVerificationStatus;
  confidenceScore: number;
  confidenceLabel: "not checked" | "low" | "medium" | "high";
  summary: string;
  sourceEvidence: MedicalVerificationSourceEvidence[];
  flags: string[];
  scopeLabels: string[];
  verificationDepth: MedicalFactVerificationDepth;
  verifiedAt: number;
  manualReviewer: string | null;
};

export type MedicalFactVerificationSearchEntry = {
  id: string;
  title: string;
  subtitle: string;
  labels: string[];
  searchText: string;
  record: MedicalFactVerificationRecord;
};

export type MedicalFactVerificationInput = {
  selectedText?: string | null;
  imageOcrText?: string | null;
  targetKind?: MedicalFactVerificationTargetKind | null;
  userIsMedicalStudent?: boolean | null;
  sourceLabels?: readonly string[] | null;
  sourceLocators?: readonly string[] | null;
  courseTag?: string | null;
  unitTag?: string | null;
  chapterTag?: string | null;
  systemTag?: string | null;
  existingRecord?: MedicalFactVerificationRecord | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNullable(value: unknown): string | null {
  const normalized = clean(value);
  return normalized ? normalized : null;
}

function uniqueStrings(values: readonly (string | null | undefined)[], limit = 12): string[] {
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

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function targetText(input: MedicalFactVerificationInput): string {
  return clean(input.targetKind === "image" ? input.imageOcrText ?? input.selectedText : input.selectedText ?? input.imageOcrText);
}

function isPersonalMedicalHistory(text: string): boolean {
  return /\b(my|i have|i had|i am having|i'm having|my doctor|my medication|my symptoms|diagnosed me|should i take|what should i do)\b/i.test(text)
    && /\b(pain|rash|fever|dose|symptom|diagnosis|treatment|medication|pregnant|bleeding|injury)\b/i.test(text);
}

function isMedicalStudyText(text: string, scopeLabels: readonly string[]): boolean {
  if (scopeLabels.some((label) => /\b(course:med|medical_cloze_vignette|system:|chapter:|unit:)/i.test(label))) return true;
  return /\b(pathophys|pathophysiology|pharm|pharmacology|contraindication|presentation|diagnosis|differential|management|anatomy|physiology|cardiology|renal|respiratory|metformin|lactic acidosis|snomed|umls|qbank|cloze|vignette|lecture|chapter|exam)\b/i.test(text);
}

function scopeLabelsFromInput(input: MedicalFactVerificationInput): string[] {
  return uniqueStrings([
    input.courseTag,
    input.unitTag,
    input.chapterTag,
    input.systemTag,
    ...(input.sourceLabels ?? []),
    ...(input.sourceLocators ?? []),
  ], 16);
}

function targetIdForInput(input: MedicalFactVerificationInput): string | null {
  const text = targetText(input).replace(/\s+/g, " ").trim();
  if (!text) return null;
  const scope = scopeLabelsFromInput(input).join("|").toLowerCase();
  return `medical_fact:${stableHash(`${input.targetKind ?? "passage"}|${scope}|${text.toLowerCase()}`)}`;
}

export function buildMedicalFactVerificationButtonState(
  input: MedicalFactVerificationInput,
): MedicalFactVerificationButtonState {
  const text = targetText(input);
  const scopeLabels = scopeLabelsFromInput(input);
  const targetId = targetIdForInput(input);
  if (!input.userIsMedicalStudent) {
    return { visible: false, label: "Verify medical facts", targetId: null, disabledReason: "medical student mode is not active", scopeLabels };
  }
  if (!targetId || text.length < 12) {
    return { visible: false, label: "Verify medical facts", targetId: null, disabledReason: "select a medical study passage or image text first", scopeLabels };
  }
  if (isPersonalMedicalHistory(text)) {
    return { visible: false, label: "Verify medical facts", targetId: null, disabledReason: "personal medical history is excluded from study verification", scopeLabels };
  }
  if (!isMedicalStudyText(text, scopeLabels)) {
    return { visible: false, label: "Verify medical facts", targetId: null, disabledReason: "selection does not look like medical study material", scopeLabels };
  }
  const status = input.existingRecord?.status;
  return {
    visible: true,
    label: status === "verified" || status === "partially_verified" ? "Verified facts" : "Verify facts",
    targetId,
    disabledReason: null,
    scopeLabels,
  };
}

export function buildMedicalFactVerificationRequest(input: MedicalFactVerificationInput & {
  depth?: MedicalFactVerificationDepth | null;
}): MedicalFactVerificationRequest | null {
  const button = buildMedicalFactVerificationButtonState(input);
  const text = targetText(input);
  if (!button.visible || !button.targetId) return null;
  const depth = input.depth ?? "quick";
  const sourceBudget = depth === "deep" ? 5 : depth === "standard" ? 3 : 2;
  const tokenBudgetLabel = depth === "deep" ? "expanded verification" : depth === "standard" ? "bounded cross-check" : "quick low-token check";
  return {
    targetId: button.targetId,
    targetKind: input.targetKind ?? "passage",
    targetText: text,
    depth,
    sourceBudget,
    tokenBudgetLabel,
    scopeLabels: button.scopeLabels,
    promptLines: [
      "Verify this medical study claim without giving patient-specific advice.",
      `Use at most ${sourceBudget} sources; prefer retained student sources and source locators first, then trusted retrieved references if already available.`,
      "Do not perform open-ended browsing by default; if evidence is insufficient, mark needs_review instead of expanding research.",
      "Check for: source agreement, recency, source authority, standardized terminology, and absolute wording such as always/never.",
      "Return: status, confidence score, sources used with locators, flags, and one concise correction or caveat if needed.",
      `Selected target: ${text}`,
      button.scopeLabels.length > 0 ? `Scope: ${button.scopeLabels.join("; ")}` : "Scope: not supplied",
    ],
  };
}

function sourceTierWeight(tier: MedicalVerificationSourceTier): number {
  if (tier === "peer_reviewed_review") return 24;
  if (tier === "student_source") return 22;
  if (tier === "trusted_reference") return 20;
  if (tier === "ontology") return 12;
  if (tier === "peer_reviewed_primary") return 16;
  return 4;
}

function recencyWeight(year: number | null, nowYear: number): number {
  if (!year) return 0;
  const age = Math.max(0, nowYear - year);
  if (age <= 3) return 10;
  if (age <= 7) return 6;
  if (age <= 12) return 3;
  return 0;
}

export function scoreMedicalFactVerification(input: {
  sourceEvidence: readonly MedicalVerificationSourceEvidence[];
  flags?: readonly string[] | null;
  nowYear?: number | null;
}): Pick<MedicalFactVerificationRecord, "confidenceScore" | "confidenceLabel" | "status"> {
  const nowYear = input.nowYear ?? new Date().getFullYear();
  const supporting = input.sourceEvidence.filter((source) => source.supportsClaim);
  const contradicting = input.sourceEvidence.filter((source) => !source.supportsClaim);
  const uniqueSupportingSources = uniqueStrings(supporting.map((source) => `${source.tier}:${source.label}`), 4).length;
  const supportScore = supporting
    .slice(0, 4)
    .reduce((total, source) => total + sourceTierWeight(source.tier) + recencyWeight(source.year, nowYear), 0);
  const conflictPenalty = contradicting.length * 18;
  const flagPenalty = (input.flags ?? []).length * 7;
  const multiSourceBonus = uniqueSupportingSources >= 3 ? 12 : uniqueSupportingSources === 2 ? 6 : 0;
  const confidenceScore = Math.max(0, Math.min(100, supportScore + multiSourceBonus - conflictPenalty - flagPenalty));
  const hasAnyEvidence = input.sourceEvidence.length > 0;
  const confidenceLabel = confidenceScore >= 75 ? "high" : confidenceScore >= 45 ? "medium" : confidenceScore > 0 || hasAnyEvidence ? "low" : "not checked";
  const status: MedicalFactVerificationStatus = confidenceScore >= 75 && contradicting.length === 0
    ? "verified"
    : confidenceScore >= 45 ? "partially_verified" : "needs_review";
  return { confidenceScore, confidenceLabel, status };
}

export function buildMedicalFactVerificationRecord(input: {
  targetKind: MedicalFactVerificationTargetKind;
  targetText: string;
  scopeLabels?: readonly string[] | null;
  sourceEvidence?: readonly MedicalVerificationSourceEvidence[] | null;
  flags?: readonly string[] | null;
  verificationDepth?: MedicalFactVerificationDepth | null;
  summary?: string | null;
  manualReviewer?: string | null;
  now?: number | null;
}): MedicalFactVerificationRecord | null {
  const text = clean(input.targetText);
  if (!text) return null;
  const scopeLabels = uniqueStrings(input.scopeLabels ?? [], 16);
  const targetHash = stableHash(`${input.targetKind}|${scopeLabels.join("|").toLowerCase()}|${text.toLowerCase()}`);
  const sourceEvidence = (input.sourceEvidence ?? []).map((source) => ({
    label: clean(source.label),
    tier: source.tier,
    locator: cleanNullable(source.locator),
    year: typeof source.year === "number" && Number.isFinite(source.year) ? source.year : null,
    supportsClaim: Boolean(source.supportsClaim),
  })).filter((source) => source.label);
  const flags = uniqueStrings(input.flags ?? [], 12);
  const score = scoreMedicalFactVerification({ sourceEvidence, flags });
  return {
    id: `medical_fact:${targetHash}`,
    targetKind: input.targetKind,
    targetText: text,
    targetHash,
    status: score.status,
    confidenceScore: score.confidenceScore,
    confidenceLabel: score.confidenceLabel,
    summary: clean(input.summary) || (sourceEvidence.length > 0 ? "Verification evidence recorded." : "Needs verification evidence."),
    sourceEvidence,
    flags,
    scopeLabels,
    verificationDepth: input.verificationDepth ?? "quick",
    verifiedAt: input.now ?? Date.now(),
    manualReviewer: cleanNullable(input.manualReviewer),
  };
}

export function normalizeMedicalFactVerificationRecord(value: unknown): MedicalFactVerificationRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return buildMedicalFactVerificationRecord({
    targetKind: record.targetKind === "image" ? "image" : "passage",
    targetText: clean(record.targetText),
    scopeLabels: Array.isArray(record.scopeLabels) ? record.scopeLabels.map(clean) : [],
    sourceEvidence: Array.isArray(record.sourceEvidence)
      ? record.sourceEvidence.map((source) => {
        const item = source && typeof source === "object" ? source as Record<string, unknown> : {};
        return {
          label: clean(item.label),
          tier: normalizeSourceTier(item.tier),
          locator: cleanNullable(item.locator),
          year: typeof item.year === "number" ? item.year : null,
          supportsClaim: item.supportsClaim !== false,
        };
      })
      : [],
    flags: Array.isArray(record.flags) ? record.flags.map(clean) : [],
    verificationDepth: normalizeDepth(record.verificationDepth),
    summary: clean(record.summary),
    manualReviewer: cleanNullable(record.manualReviewer),
    now: typeof record.verifiedAt === "number" ? record.verifiedAt : Date.now(),
  });
}

function normalizeSourceTier(value: unknown): MedicalVerificationSourceTier {
  return value === "student_source"
    || value === "trusted_reference"
    || value === "ontology"
    || value === "peer_reviewed_review"
    || value === "peer_reviewed_primary"
    || value === "unknown"
    ? value
    : "unknown";
}

function normalizeDepth(value: unknown): MedicalFactVerificationDepth {
  return value === "standard" || value === "deep" ? value : "quick";
}

export function normalizeMedicalFactVerificationRecords(value: unknown): MedicalFactVerificationRecord[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const records: MedicalFactVerificationRecord[] = [];
  for (const entry of value) {
    const record = normalizeMedicalFactVerificationRecord(entry);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    records.push(record);
  }
  return records
    .sort((left, right) => right.verifiedAt - left.verifiedAt)
    .slice(0, MAX_MEDICAL_FACT_VERIFICATION_RECORDS);
}

export function loadMedicalFactVerificationRecords(storage: Storage = localStorage): MedicalFactVerificationRecord[] {
  const raw = storage.getItem(MEDICAL_FACT_VERIFICATION_RECORDS_KEY);
  if (!raw) return [];
  const parsed = parseJsonValue(raw);
  if (!parsed.ok) {
    storage.removeItem(MEDICAL_FACT_VERIFICATION_RECORDS_KEY);
    return [];
  }
  const records = normalizeMedicalFactVerificationRecords(parsed.value);
  if (records.length === 0) storage.removeItem(MEDICAL_FACT_VERIFICATION_RECORDS_KEY);
  else storage.setItem(MEDICAL_FACT_VERIFICATION_RECORDS_KEY, JSON.stringify(records));
  return records;
}

export function saveMedicalFactVerificationRecord(
  record: MedicalFactVerificationRecord,
  storage: Storage = localStorage,
): MedicalFactVerificationRecord {
  const normalized = normalizeMedicalFactVerificationRecord(record) ?? record;
  const existing = loadMedicalFactVerificationRecords(storage).filter((item) => item.id !== normalized.id);
  const next = normalizeMedicalFactVerificationRecords([normalized, ...existing]);
  storage.setItem(MEDICAL_FACT_VERIFICATION_RECORDS_KEY, JSON.stringify(next));
  return next.find((item) => item.id === normalized.id) ?? normalized;
}

export function findMedicalFactVerificationRecord(
  input: MedicalFactVerificationInput,
  records: readonly MedicalFactVerificationRecord[],
): MedicalFactVerificationRecord | null {
  const targetId = targetIdForInput(input);
  if (!targetId) return null;
  return records.find((record) => record.id === targetId) ?? null;
}

export function buildMedicalFactVerificationSearchEntries(
  records: readonly MedicalFactVerificationRecord[],
): MedicalFactVerificationSearchEntry[] {
  return normalizeMedicalFactVerificationRecords(records).map((record) => {
    const sourceLabels = record.sourceEvidence.map((source) => source.label);
    const labels = uniqueStrings([
      record.status.replace(/_/g, " "),
      record.confidenceLabel,
      record.verificationDepth,
      ...record.scopeLabels,
      ...record.flags,
      ...record.sourceEvidence.map((source) => source.tier),
      ...sourceLabels.slice(0, 3),
    ], 18);
    const title = record.targetText.length > 72
      ? `${record.targetText.slice(0, 69).trimEnd()}...`
      : record.targetText;
    return {
      id: record.id,
      title,
      subtitle: `${record.status.replace(/_/g, " ")} - ${record.confidenceLabel} confidence - ${record.sourceEvidence.length} source${record.sourceEvidence.length === 1 ? "" : "s"}`,
      labels,
      searchText: uniqueStrings([
        record.id,
        record.targetText,
        record.summary,
        record.status,
        record.confidenceLabel,
        record.verificationDepth,
        ...record.scopeLabels,
        ...record.flags,
        ...record.sourceEvidence.flatMap((source) => [
          source.label,
          source.tier,
          source.locator,
          source.year ? String(source.year) : null,
          source.supportsClaim ? "supports claim" : "conflicts with claim",
        ]),
      ], 60).join(" ").toLowerCase(),
      record,
    };
  });
}

export function searchMedicalFactVerificationRecords(
  records: readonly MedicalFactVerificationRecord[],
  query?: string | null,
): MedicalFactVerificationSearchEntry[] {
  const normalizedQuery = clean(query).toLowerCase();
  const entries = buildMedicalFactVerificationSearchEntries(records);
  if (!normalizedQuery) return entries;
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return entries.filter((entry) => terms.every((term) => entry.searchText.includes(term)));
}
