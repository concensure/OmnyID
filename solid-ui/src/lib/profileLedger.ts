// @locs-version: 1.0
// Profile Ledger V2 — local-first user personality model
// Encrypted with a key derived from AFP identity (HKDF-SHA256), never sessionStorage.

import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

const LEDGER_KEY       = "omnyid.profile.ledger.e2"; // .e2 = identity-derived key
const SALT_KEY         = "omnyid.ledger.salt";
const CONSENT_KEY      = "omnyid.profiling.consent";
const SESSION_KEY_FB   = "omnyid.ck"; // fallback: session key when identity unavailable

const MAX_ENTRIES      = 500;
const MAX_FIELD_LEN    = 1_000;
const MIN_CORROBORATIONS = 3;

export type StorageStatus = "ok" | "quota_exceeded" | "crypto_unavailable";

// ─── Trait categories ─────────────────────────────────────────────────────────

export type TraitCategory =
  | "communication_style"
  | "workflow_style"
  | "work_ethics"
  | "context_boundary"
  | "personal_values"       // what the user holds as important and non-negotiable
  | "emotional_landscape"   // recurring emotional patterns and coping styles
  | "aspirations"           // what the user wants to become or achieve
  | "life_orientation";     // how they approach risk, change, and growth

// Identity-level categories: observations always go to base genome regardless of persona
const IDENTITY_CATEGORIES = new Set<TraitCategory>(["personal_values", "emotional_landscape", "aspirations", "life_orientation"]);

// Temporal guard per category — deeper traits need longer patterns
const TRAIT_GRAVITY_MS: Record<TraitCategory, number> = {
  communication_style: 24  * 60 * 60 * 1_000,
  workflow_style:      24  * 60 * 60 * 1_000,
  work_ethics:         48  * 60 * 60 * 1_000,
  context_boundary:    48  * 60 * 60 * 1_000,
  personal_values:     72  * 60 * 60 * 1_000,
  emotional_landscape: 72  * 60 * 60 * 1_000,
  aspirations:        168  * 60 * 60 * 1_000,
  life_orientation:   168  * 60 * 60 * 1_000,
};

// Aspirations and life_orientation need 5 corroborations
const MIN_CORROBORATIONS_BY_CATEGORY: Partial<Record<TraitCategory, number>> = {
  aspirations:     5,
  life_orientation: 5,
};

// ─── LoRA weight set ──────────────────────────────────────────────────────────

export type LoraWeightSet = {
  directness_weight:       number; // 0=measured, 1=blunt
  diplomacy_weight:        number; // 0=candid, 1=diplomatic
  brevity_weight:          number; // 0=detailed, 1=brief
  formality_weight:        number; // 0=casual, 1=formal
  technical_depth_weight:  number; // 0=accessible, 1=precise
  abstraction_level:       number; // 0=concrete/literal, 1=abstract/metaphorical
  optimism_bias:           number; // 0=pragmatic/realistic, 1=idealistic/optimistic
  risk_tolerance:          number; // 0=safety-first/conservative, 1=growth-oriented/bold
  proactivity_preference:  number; // 0=reactive/on-demand, 1=anticipatory/autonomous
};

export const WEIGHT_LABELS: Record<keyof LoraWeightSet, { label: string; low: string; high: string }> = {
  directness_weight:      { label: "Directness",       low: "Measured",      high: "Blunt"          },
  diplomacy_weight:       { label: "Diplomacy",         low: "Candid",        high: "Diplomatic"     },
  brevity_weight:         { label: "Brevity",           low: "Detailed",      high: "Brief"          },
  formality_weight:       { label: "Formality",         low: "Casual",        high: "Formal"         },
  technical_depth_weight: { label: "Technical depth",   low: "Accessible",    high: "Precise"        },
  abstraction_level:      { label: "Abstraction",       low: "Concrete",      high: "Conceptual"     },
  optimism_bias:          { label: "Outlook",           low: "Realistic",     high: "Optimistic"     },
  risk_tolerance:         { label: "Risk tolerance",    low: "Cautious",      high: "Bold"           },
  proactivity_preference: { label: "Proactivity",       low: "On-demand",     high: "Anticipatory"   },
};

const DEFAULT_GENOME: LoraWeightSet = {
  directness_weight: 0.5, diplomacy_weight: 0.5, brevity_weight: 0.5,
  formality_weight: 0.5, technical_depth_weight: 0.5,
  abstraction_level: 0.5, optimism_bias: 0.5, risk_tolerance: 0.5, proactivity_preference: 0.5,
};

const WEIGHT_KEYS: (keyof LoraWeightSet)[] = [
  "directness_weight", "diplomacy_weight", "brevity_weight", "formality_weight",
  "technical_depth_weight", "abstraction_level", "optimism_bias", "risk_tolerance", "proactivity_preference",
];

const VALID_TRAIT_CATEGORIES = new Set<string>([
  "communication_style", "workflow_style", "work_ethics", "context_boundary",
  "personal_values", "emotional_landscape", "aspirations", "life_orientation",
]);

// ─── Goal domain ──────────────────────────────────────────────────────────────

export type GoalDomain =
  | "career" | "finance" | "health" | "relationships"
  | "personal_growth" | "creativity" | "community" | "lifestyle" | "other";

const VALID_GOAL_DOMAINS = new Set<string>([
  "career", "finance", "health", "relationships",
  "personal_growth", "creativity", "community", "lifestyle", "other",
]);

export type CoreValueKey = "health" | "family" | "wealth" | "social_life";

export type ValueWeightSet = Record<CoreValueKey, number>;

export const VALUE_WEIGHT_LABELS: Record<CoreValueKey, { label: string; low: string; high: string }> = {
  health: { label: "Health", low: "Background", high: "Primary" },
  family: { label: "Family", low: "Flexible", high: "Protected" },
  wealth: { label: "Wealth", low: "Enough", high: "Aggressive" },
  social_life: { label: "Social life", low: "Minimal", high: "Important" },
};

export const DEFAULT_VALUE_WEIGHTS: ValueWeightSet = {
  health: 0.5,
  family: 0.5,
  wealth: 0.5,
  social_life: 0.5,
};

export type ValueOverride = {
  summary: string;
  updated_at: string;
};

// ─── Behavior vetos ───────────────────────────────────────────────────────────

export type VetoScope = "prompt_style" | "suggestions" | "scheduling" | "content" | "channel";

const VALID_VETO_SCOPES = new Set<string>([
  "prompt_style", "suggestions", "scheduling", "content", "channel",
]);

export type BehaviorVeto = {
  id: string;
  scope: VetoScope;
  description: string;    // user-written plain text
  pattern?: string;       // optional machine-readable matcher
  created_at: string;
};

export type PrimaryUseCaseKind =
  | "general"
  | "study"
  | "daily_life_management"
  | "wedding_planning"
  | "travel_planning"
  | "medical_study"
  | "work_admin"
  | "other";

export type PrimaryUseCaseStatus = "active" | "completed";

export type PrimaryUseCaseSource =
  | "onboarding"
  | "profile"
  | "agent_instruction"
  | "admin_default"
  | "inferred"
  | "manual";

export type PrimaryUseCaseProfile = {
  kind: PrimaryUseCaseKind;
  status: PrimaryUseCaseStatus;
  label?: string;
  started_at?: string;
  completed_at?: string | null;
  updated_at?: string;
  source?: PrimaryUseCaseSource;
};

const VALID_PRIMARY_USE_CASE_KINDS = new Set<string>([
  "general",
  "study",
  "daily_life_management",
  "wedding_planning",
  "travel_planning",
  "medical_study",
  "work_admin",
  "other",
]);

const VALID_PRIMARY_USE_CASE_STATUSES = new Set<string>(["active", "completed"]);

const VALID_PRIMARY_USE_CASE_SOURCES = new Set<string>([
  "onboarding",
  "profile",
  "agent_instruction",
  "admin_default",
  "inferred",
  "manual",
]);

// ─── Self-profile ground truth ────────────────────────────────────────────────

export type UserSelfProfile = {
  display_name?: string;
  location_city?: string;
  location_country?: string;
  age_range?: "under_25" | "25_34" | "35_44" | "45_54" | "55_64" | "65_plus";
  life_stage?: "student" | "early_career" | "established" | "parent" | "caregiver" | "retired";
  primary_use_case?: PrimaryUseCaseProfile | null;
  interests: string[];
  me_document?: string;       // rich-text narrative, max 5000 chars — treated as ground truth
  goals_domains: GoalDomain[];
  value_weights: ValueWeightSet;
  active_value_override?: ValueOverride | null;
  vetos: BehaviorVeto[];
  last_updated?: string;
};

function isGoalDomain(value: unknown): value is GoalDomain {
  return typeof value === "string" && VALID_GOAL_DOMAINS.has(value);
}

function isVetoScope(value: unknown): value is VetoScope {
  return typeof value === "string" && VALID_VETO_SCOPES.has(value);
}

function parsePrimaryUseCase(raw: unknown): PrimaryUseCaseProfile | null {
  if (!isRecord(raw)) return null;
  const o = raw;
  if (!VALID_PRIMARY_USE_CASE_KINDS.has(o.kind as string)) return null;
  const status = VALID_PRIMARY_USE_CASE_STATUSES.has(o.status as string)
    ? o.status as PrimaryUseCaseStatus
    : "active";
  return {
    kind: o.kind as PrimaryUseCaseKind,
    status,
    label: typeof o.label === "string" ? clampStr(o.label, 120) : undefined,
    started_at: typeof o.started_at === "string" ? o.started_at.slice(0, 64) : undefined,
    completed_at:
      typeof o.completed_at === "string"
        ? o.completed_at.slice(0, 64)
        : null,
    updated_at: typeof o.updated_at === "string" ? o.updated_at.slice(0, 64) : undefined,
    source: VALID_PRIMARY_USE_CASE_SOURCES.has(o.source as string)
      ? o.source as PrimaryUseCaseSource
      : undefined,
  };
}

// ─── Persona-scoped genome partition ─────────────────────────────────────────

export type PersonaGenome = {
  persona_id: string;
  overlay: Partial<LoraWeightSet>;  // additive deltas over base genome
  entry_count: number;
  last_active: string;
};

// ─── Ledger entry types ───────────────────────────────────────────────────────

export type LedgerEntry = {
  id: string;
  timestamp: string;
  trait_category: TraitCategory;
  observed_behavior: string;
  synthesis: string;
  lora_shifts: Partial<LoraWeightSet>;
  confidence_score: number;
  corroboration_count: number;
  persona_id?: string;  // set when recorded under a specific persona
};

export type PendingObservation = {
  id: string;
  timestamp: string;
  lora_shifts: Partial<LoraWeightSet>;
  confidence_score: number;
};

export type PendingHypothesis = {
  id: string;
  trait_category: TraitCategory;
  observed_behavior: string;
  synthesis: string;
  observations: PendingObservation[];
  created_at: string;
  persona_id?: string;
};

export type Hypothesis = {
  id: string;
  trait_category: TraitCategory;
  theory: string;
  corroborations: string[];
  created_at: string;
};

export type ProfileLedger = {
  profiling_enabled: boolean;
  consent_given_at: string | null;
  lora_genome: LoraWeightSet;
  entries: LedgerEntry[];
  hypotheses: Hypothesis[];
  pending_hypotheses: PendingHypothesis[];
  self_profile: UserSelfProfile;
  persona_genomes: PersonaGenome[];
};

// ─── UI signal recording hooks ────────────────────────────────────────────────

export type UISignalKind =
  | "compact_view_selected"
  | "detailed_view_selected"
  | "supertag_pinned"
  | "deep_work_mode_activated"
  | "diary_entry_written"
  | "note_created_late_night"
  | "goal_domain_visited";

export type UISignal = { kind: UISignalKind; context?: string };

// ─── Key derivation ───────────────────────────────────────────────────────────
// SEC-01: Derive a stable AES-GCM key from the AFP Ed25519 private key via HKDF-SHA256.
// The key is never stored — reconstructed from identity on each session.

function getLedgerSalt(): Uint8Array {
  const stored = localStorage.getItem(SALT_KEY);
  if (stored) {
    try { return Uint8Array.from(atob(stored), (c) => c.charCodeAt(0)); } catch { /* regenerate */ }
  }
  const salt = crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem(SALT_KEY, btoa(String.fromCharCode(...salt)));
  return salt;
}

async function deriveLedgerKey(privateKeyBytes: Uint8Array): Promise<CryptoKey | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    // Copy into a fresh ArrayBuffer so WebCrypto never sees a SharedArrayBuffer-backed view
    const keyBuf = privateKeyBytes.buffer.slice(
      privateKeyBytes.byteOffset, privateKeyBytes.byteOffset + privateKeyBytes.byteLength
    ) as ArrayBuffer;
    const hkdfKey = await crypto.subtle.importKey("raw", keyBuf, { name: "HKDF" }, false, ["deriveKey"]);
    const saltBuf = getLedgerSalt().buffer.slice(0) as ArrayBuffer;
    const infoBuf = new TextEncoder().encode("omnyid-ledger-v1").buffer.slice(0) as ArrayBuffer;
    return await crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: saltBuf, info: infoBuf },
      hkdfKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  } catch { return null; }
}

async function getSessionFallbackKey(): Promise<CryptoKey | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    const stored = sessionStorage.getItem(SESSION_KEY_FB);
    if (stored) {
      const jwk = parseLedgerSessionFallbackJwk(stored);
      if (!jwk) {
        sessionStorage.removeItem(SESSION_KEY_FB);
        return null;
      }
      return await crypto.subtle.importKey("jwk", jwk, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    }
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const jwk = await crypto.subtle.exportKey("jwk", key);
    sessionStorage.setItem(SESSION_KEY_FB, JSON.stringify(jwk));
    return key;
  } catch { return null; }
}

export function parseLedgerSessionFallbackJwk(stored: string): JsonWebKey | null {
  const parsed = parseJsonValue(stored);
  if (!parsed.ok || !isRecord(parsed.value)) return null;

  const jwk = parsed.value;
  return typeof jwk.kty === "string" && typeof jwk.k === "string"
    ? {
        kty: jwk.kty,
        k: jwk.k,
        alg: typeof jwk.alg === "string" ? jwk.alg : undefined,
        ext: typeof jwk.ext === "boolean" ? jwk.ext : undefined,
        key_ops: Array.isArray(jwk.key_ops)
          ? jwk.key_ops.filter((entry): entry is string => typeof entry === "string")
          : undefined,
      }
    : null;
}

// Resolve: identity-derived key preferred, session fallback when identity not provisioned
let _resolvedKey: CryptoKey | null = null;
let _keyIsIdentityDerived = false;

export async function initLedgerKey(afpPrivateKeyBytes?: Uint8Array): Promise<void> {
  if (afpPrivateKeyBytes && afpPrivateKeyBytes.length > 0) {
    const k = await deriveLedgerKey(afpPrivateKeyBytes);
    if (k) { _resolvedKey = k; _keyIsIdentityDerived = true; return; }
  }
  // Fallback to session key — ledger survives only for current session
  _resolvedKey = await getSessionFallbackKey();
  _keyIsIdentityDerived = false;
}

export function ledgerKeyIsIdentityDerived(): boolean { return _keyIsIdentityDerived; }

async function getCryptoKey(): Promise<CryptoKey | null> {
  if (_resolvedKey) return _resolvedKey;
  // Lazily init with session fallback if initLedgerKey was never called
  await initLedgerKey();
  return _resolvedKey;
}

// ─── Encryption helpers ───────────────────────────────────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function encryptJson(key: CryptoKey, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(12 + cipher.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipher), 12);
  return uint8ToBase64(combined);
}

async function decryptJson(key: CryptoKey, packed: string): Promise<string | null> {
  try {
    const combined = Uint8Array.from(atob(packed), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const cipher = combined.slice(12);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    return new TextDecoder().decode(plain);
  } catch { return null; }
}

// ─── Runtime validation ───────────────────────────────────────────────────────

function clampNum(v: unknown, fallback = 0.5): number {
  const n = typeof v === "number" ? v : fallback;
  return isFinite(n) ? Math.min(1.0, Math.max(0.0, n)) : fallback;
}

function clampStr(v: unknown, max = MAX_FIELD_LEN): string {
  if (typeof v !== "string") return "";
  return v.slice(0, max);
}

function parseGenome(raw: unknown): LoraWeightSet {
  if (!isRecord(raw)) return { ...DEFAULT_GENOME };
  const o = raw;
  return {
    directness_weight:      clampNum(o.directness_weight),
    diplomacy_weight:       clampNum(o.diplomacy_weight),
    brevity_weight:         clampNum(o.brevity_weight),
    formality_weight:       clampNum(o.formality_weight),
    technical_depth_weight: clampNum(o.technical_depth_weight),
    abstraction_level:      clampNum(o.abstraction_level),
    optimism_bias:          clampNum(o.optimism_bias),
    risk_tolerance:         clampNum(o.risk_tolerance),
    proactivity_preference: clampNum(o.proactivity_preference),
  };
}

function parseLoraShifts(raw: unknown): Partial<LoraWeightSet> {
  if (!isRecord(raw)) return {};
  const o = raw;
  const out: Partial<LoraWeightSet> = {};
  for (const key of WEIGHT_KEYS) {
    if (key in o) out[key] = clampNum(o[key], 0);
  }
  return out;
}

function parseValueWeights(raw: unknown): ValueWeightSet {
  if (!isRecord(raw)) return { ...DEFAULT_VALUE_WEIGHTS };
  const o = raw;
  return {
    health: clampNum(o.health),
    family: clampNum(o.family),
    wealth: clampNum(o.wealth),
    social_life: clampNum(o.social_life),
  };
}

function parseSelfProfile(raw: unknown): UserSelfProfile {
  const defaults: UserSelfProfile = {
    interests: [],
    goals_domains: [],
    value_weights: { ...DEFAULT_VALUE_WEIGHTS },
    active_value_override: null,
    vetos: [],
  };
  if (!isRecord(raw)) return defaults;
  const o = raw;
  const vetos = Array.isArray(o.vetos)
    ? (o.vetos as unknown[]).map((v) => {
        if (!isRecord(v)) return null;
        const vv = v;
        if (!vv.id || !vv.scope || !vv.description) return null;
        if (!isVetoScope(vv.scope)) return null;
        return {
          id: clampStr(vv.id, 64),
          scope: vv.scope,
          description: clampStr(vv.description),
          pattern: typeof vv.pattern === "string" ? clampStr(vv.pattern) : undefined,
          created_at: typeof vv.created_at === "string" ? vv.created_at : new Date().toISOString(),
        } as BehaviorVeto;
      }).filter((v): v is BehaviorVeto => v !== null)
    : [];
  return {
    display_name: typeof o.display_name === "string" ? clampStr(o.display_name, 128) : undefined,
    location_city: typeof o.location_city === "string" ? clampStr(o.location_city, 128) : undefined,
    location_country: typeof o.location_country === "string" ? clampStr(o.location_country, 128) : undefined,
    age_range: typeof o.age_range === "string" ? o.age_range as UserSelfProfile["age_range"] : undefined,
    life_stage: typeof o.life_stage === "string" ? o.life_stage as UserSelfProfile["life_stage"] : undefined,
    primary_use_case: parsePrimaryUseCase(o.primary_use_case),
    interests: Array.isArray(o.interests) ? (o.interests as unknown[]).map((i) => clampStr(i, 64)).filter(Boolean) : [],
    me_document: typeof o.me_document === "string" ? o.me_document.slice(0, 5000) : undefined,
    goals_domains: Array.isArray(o.goals_domains) ? o.goals_domains.filter(isGoalDomain) : [],
    value_weights: parseValueWeights(o.value_weights),
    active_value_override: isRecord(o.active_value_override)
      ? {
          summary: clampStr(o.active_value_override.summary, 240),
          updated_at:
            typeof o.active_value_override.updated_at === "string"
              ? o.active_value_override.updated_at
              : new Date().toISOString(),
        }
      : null,
    vetos,
    last_updated: typeof o.last_updated === "string" ? o.last_updated : undefined,
  };
}

function parsePersonaGenome(raw: unknown): PersonaGenome | null {
  if (!isRecord(raw)) return null;
  const o = raw;
  if (typeof o.persona_id !== "string") return null;
  return {
    persona_id: clampStr(o.persona_id, 64),
    overlay: parseLoraShifts(o.overlay),
    entry_count: typeof o.entry_count === "number" ? Math.max(0, o.entry_count) : 0,
    last_active: typeof o.last_active === "string" ? o.last_active : new Date().toISOString(),
  };
}

function parseEntry(raw: unknown): LedgerEntry | null {
  if (!isRecord(raw)) return null;
  const o = raw;
  if (!VALID_TRAIT_CATEGORIES.has(o.trait_category as string)) return null;
  const corroborationCount = typeof o.corroboration_count === "number"
    ? Math.max(0, Math.floor(o.corroboration_count)) : 0;
  return {
    id: clampStr(o.id, 64) || `entry_${Date.now()}`,
    timestamp: typeof o.timestamp === "string" ? o.timestamp : new Date().toISOString(),
    trait_category: o.trait_category as TraitCategory,
    observed_behavior: clampStr(o.observed_behavior),
    synthesis: clampStr(o.synthesis),
    lora_shifts: parseLoraShifts(o.lora_shifts),
    confidence_score: clampNum(o.confidence_score, 0.5),
    corroboration_count: corroborationCount,
    persona_id: typeof o.persona_id === "string" ? clampStr(o.persona_id, 64) : undefined,
  };
}

function parsePendingObservation(raw: unknown): PendingObservation | null {
  if (!isRecord(raw)) return null;
  const o = raw;
  return {
    id: clampStr(o.id, 64) || `obs_${Date.now()}`,
    timestamp: typeof o.timestamp === "string" ? o.timestamp : new Date().toISOString(),
    lora_shifts: parseLoraShifts(o.lora_shifts),
    confidence_score: clampNum(o.confidence_score, 0.5),
  };
}

function parsePendingHypothesis(raw: unknown): PendingHypothesis | null {
  if (!isRecord(raw)) return null;
  const o = raw;
  if (!VALID_TRAIT_CATEGORIES.has(o.trait_category as string)) return null;
  const observations = Array.isArray(o.observations)
    ? (o.observations as unknown[]).map(parsePendingObservation).filter((x): x is PendingObservation => x !== null)
    : [];
  return {
    id: clampStr(o.id, 64) || `hyp_${Date.now()}`,
    trait_category: o.trait_category as TraitCategory,
    observed_behavior: clampStr(o.observed_behavior),
    synthesis: clampStr(o.synthesis),
    observations,
    created_at: typeof o.created_at === "string" ? o.created_at : new Date().toISOString(),
    persona_id: typeof o.persona_id === "string" ? clampStr(o.persona_id, 64) : undefined,
  };
}

function parseLedger(raw: string): ProfileLedger {
  const parsed = parseJsonValue(raw);
  if (!parsed.ok || !isRecord(parsed.value)) return defaultLedger();
  const o = parsed.value;
  const entries = Array.isArray(o.entries)
    ? (o.entries as unknown[]).map(parseEntry).filter((e): e is LedgerEntry => e !== null)
    : [];
  const pendingHypotheses = Array.isArray(o.pending_hypotheses)
    ? (o.pending_hypotheses as unknown[]).map(parsePendingHypothesis).filter((h): h is PendingHypothesis => h !== null)
    : [];
  const personaGenomes = Array.isArray(o.persona_genomes)
    ? (o.persona_genomes as unknown[]).map(parsePersonaGenome).filter((p): p is PersonaGenome => p !== null)
    : [];
  return {
    profiling_enabled: o.profiling_enabled === true,
    consent_given_at: typeof o.consent_given_at === "string" ? o.consent_given_at.slice(0, 64) : null,
    lora_genome: parseGenome(o.lora_genome),
    entries,
    hypotheses: [],
    pending_hypotheses: pendingHypotheses,
    self_profile: parseSelfProfile(o.self_profile),
    persona_genomes: personaGenomes,
  };
}

function defaultLedger(): ProfileLedger {
  return {
    profiling_enabled: false,
    consent_given_at: null,
    lora_genome: { ...DEFAULT_GENOME },
    entries: [],
    hypotheses: [],
    pending_hypotheses: [],
    self_profile: {
      interests: [],
      goals_domains: [],
      value_weights: { ...DEFAULT_VALUE_WEIGHTS },
      active_value_override: null,
      vetos: [],
    },
    persona_genomes: [],
  };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export async function loadLedger(): Promise<ProfileLedger> {
  const cryptoKey = await getCryptoKey();
  const raw = localStorage.getItem(LEDGER_KEY);
  if (!raw) {
    // Attempt migration from old .e1 key (session-based) — if it fails, start fresh silently
    const oldRaw = localStorage.getItem("omnyid.profile.ledger.e1");
    if (oldRaw) localStorage.removeItem("omnyid.profile.ledger.e1");
    return defaultLedger();
  }
  if (cryptoKey) {
    const plain = await decryptJson(cryptoKey, raw);
    if (plain === null) {
      localStorage.removeItem(LEDGER_KEY);
      return defaultLedger();
    }
    return parseLedger(plain);
  }
  return parseLedger(raw);
}

export async function saveLedger(ledger: ProfileLedger): Promise<StorageStatus> {
  if (ledger.entries.length > MAX_ENTRIES) {
    const evicted = ledger.entries.slice(0, ledger.entries.length - MAX_ENTRIES);
    for (const e of evicted) {
      const reverseShifts: Partial<LoraWeightSet> = {};
      for (const key of Object.keys(e.lora_shifts) as (keyof LoraWeightSet)[]) {
        reverseShifts[key] = -(e.lora_shifts[key] ?? 0);
      }
      ledger.lora_genome = applyLoraShifts(ledger.lora_genome, reverseShifts);
    }
    ledger.entries = ledger.entries.slice(ledger.entries.length - MAX_ENTRIES);
  }

  const json = JSON.stringify(ledger);
  if (json.length > 4_500_000) return "quota_exceeded";

  const cryptoKey = await getCryptoKey();
  try {
    const payload = cryptoKey ? await encryptJson(cryptoKey, json) : json;
    localStorage.setItem(LEDGER_KEY, payload);
    return "ok";
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") return "quota_exceeded";
    return "quota_exceeded";
  }
}

// ─── Consent ──────────────────────────────────────────────────────────────────

export function hasConsentBeenAsked(): boolean { return localStorage.getItem(CONSENT_KEY) === "done"; }
export function markConsentAsked(): void { localStorage.setItem(CONSENT_KEY, "done"); }

export async function setProfilingEnabled(enabled: boolean): Promise<StorageStatus> {
  const ledger = await loadLedger();
  ledger.profiling_enabled = enabled;
  if (enabled && !ledger.consent_given_at) ledger.consent_given_at = new Date().toISOString();
  return saveLedger(ledger);
}

// ─── LoRA helpers ─────────────────────────────────────────────────────────────

function clampWeight(v: number): number { return Math.min(1.0, Math.max(0.0, v)); }

function applyLoraShifts(genome: LoraWeightSet, shifts: Partial<LoraWeightSet>): LoraWeightSet {
  const result = { ...genome };
  for (const key of Object.keys(shifts) as (keyof LoraWeightSet)[]) {
    const delta = shifts[key] ?? 0;
    const capped = Math.min(0.25, Math.max(-0.25, delta));
    result[key] = clampWeight(result[key] + capped);
  }
  return result;
}

export function mergePersonaOverlay(base: LoraWeightSet, overlay: Partial<LoraWeightSet>): LoraWeightSet {
  const result = { ...base };
  for (const key of Object.keys(overlay) as (keyof LoraWeightSet)[]) {
    result[key] = clampWeight(base[key] + (overlay[key] ?? 0));
  }
  return result;
}

// ─── Temporal clustering guard ────────────────────────────────────────────────

function meetsTemporalGuard(observations: PendingObservation[], category: TraitCategory): boolean {
  const required = MIN_CORROBORATIONS_BY_CATEGORY[category] ?? MIN_CORROBORATIONS;
  if (observations.length < required) return false;
  const timestamps = observations
    .map((o) => new Date(o.timestamp).getTime())
    .filter((t) => isFinite(t))
    .sort((a, b) => a - b);
  if (timestamps.length < required) return false;
  return timestamps[timestamps.length - 1] - timestamps[0] >= TRAIT_GRAVITY_MS[category];
}

function promoteHypothesis(hyp: PendingHypothesis): LedgerEntry {
  const combinedShifts: Partial<LoraWeightSet> = {};
  for (const obs of hyp.observations) {
    for (const key of Object.keys(obs.lora_shifts) as (keyof LoraWeightSet)[]) {
      combinedShifts[key] = ((combinedShifts[key] ?? 0) + (obs.lora_shifts[key] ?? 0)) / hyp.observations.length;
    }
  }
  const avgConfidence = hyp.observations.reduce((s, o) => s + o.confidence_score, 0) / hyp.observations.length;
  return {
    id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    trait_category: hyp.trait_category,
    observed_behavior: hyp.observed_behavior,
    synthesis: hyp.synthesis,
    lora_shifts: combinedShifts,
    confidence_score: avgConfidence,
    corroboration_count: hyp.observations.length,
    persona_id: hyp.persona_id,
  };
}

// ─── Core ledger entry API ────────────────────────────────────────────────────

export async function addLedgerEntry(
  entry: Omit<LedgerEntry, "id" | "corroboration_count">,
  options?: { persona_id?: string },
): Promise<StorageStatus> {
  const ledger = await loadLedger();
  if (!ledger.profiling_enabled) return "ok";

  const now = new Date().toISOString();
  const isIdentityCategory = IDENTITY_CATEGORIES.has(entry.trait_category);
  const personaId = isIdentityCategory ? undefined : (options?.persona_id ?? entry.persona_id);

  const observation: PendingObservation = {
    id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now,
    lora_shifts: entry.lora_shifts,
    confidence_score: entry.confidence_score,
  };

  // Find hypothesis scoped to same category + persona
  let hyp = ledger.pending_hypotheses.find(
    (h) => h.trait_category === entry.trait_category && h.persona_id === personaId
  );
  if (!hyp) {
    hyp = {
      id: `hyp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      trait_category: entry.trait_category,
      observed_behavior: clampStr(entry.observed_behavior),
      synthesis: clampStr(entry.synthesis),
      observations: [],
      created_at: now,
      persona_id: personaId,
    };
    ledger.pending_hypotheses.push(hyp);
  } else {
    hyp.synthesis = clampStr(entry.synthesis);
  }
  hyp.observations.push(observation);

  // Promote hypotheses that satisfy temporal guard
  const toPromote = ledger.pending_hypotheses.filter((h) => meetsTemporalGuard(h.observations, h.trait_category));
  for (const promoted of toPromote) {
    const committed = promoteHypothesis(promoted);
    ledger.entries.push(committed);

    if (promoted.persona_id) {
      // Apply to persona overlay
      const pg = ledger.persona_genomes.find((p) => p.persona_id === promoted.persona_id);
      if (pg) {
        pg.overlay = mergePersonaOverlay(pg.overlay as LoraWeightSet, committed.lora_shifts) as Partial<LoraWeightSet>;
        pg.entry_count++;
        pg.last_active = now;
      }
    } else {
      // Apply to base genome
      ledger.lora_genome = applyLoraShifts(ledger.lora_genome, committed.lora_shifts);
    }
    ledger.pending_hypotheses = ledger.pending_hypotheses.filter((h) => h.id !== promoted.id);
  }

  return saveLedger(ledger);
}

export async function deleteLedgerEntry(id: string): Promise<StorageStatus> {
  const ledger = await loadLedger();
  const idx = ledger.entries.findIndex((e) => e.id === id);
  if (idx === -1) return "ok";
  const entry = ledger.entries[idx];
  const reverseShifts: Partial<LoraWeightSet> = {};
  for (const key of Object.keys(entry.lora_shifts) as (keyof LoraWeightSet)[]) {
    reverseShifts[key] = -(entry.lora_shifts[key] ?? 0);
  }
  ledger.lora_genome = applyLoraShifts(ledger.lora_genome, reverseShifts);
  ledger.entries.splice(idx, 1);
  return saveLedger(ledger);
}

export async function resetLedger(): Promise<StorageStatus> {
  const ledger = await loadLedger();
  ledger.entries = [];
  ledger.hypotheses = [];
  ledger.pending_hypotheses = [];
  ledger.lora_genome = { ...DEFAULT_GENOME };
  ledger.persona_genomes = [];
  return saveLedger(ledger);
}

export async function exportLedger(): Promise<string> {
  return JSON.stringify(await loadLedger(), null, 2);
}

export async function updateLoraGenome(genome: LoraWeightSet): Promise<StorageStatus> {
  const ledger = await loadLedger();
  ledger.lora_genome = genome;
  return saveLedger(ledger);
}

// ─── Self-profile API ─────────────────────────────────────────────────────────

export async function updateSelfProfile(patch: Partial<UserSelfProfile>): Promise<StorageStatus> {
  const ledger = await loadLedger();
  ledger.self_profile = { ...ledger.self_profile, ...patch, last_updated: new Date().toISOString() };
  return saveLedger(ledger);
}

export async function getSelfProfile(): Promise<UserSelfProfile> {
  const ledger = await loadLedger();
  return ledger.self_profile;
}

// ─── Behavior veto API ────────────────────────────────────────────────────────

export async function addVeto(veto: Omit<BehaviorVeto, "id" | "created_at">): Promise<StorageStatus> {
  const ledger = await loadLedger();
  const newVeto: BehaviorVeto = {
    ...veto,
    id: `veto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    created_at: new Date().toISOString(),
  };
  ledger.self_profile.vetos = [...(ledger.self_profile.vetos ?? []), newVeto];
  return saveLedger(ledger);
}

export async function removeVeto(id: string): Promise<StorageStatus> {
  const ledger = await loadLedger();
  ledger.self_profile.vetos = (ledger.self_profile.vetos ?? []).filter((v) => v.id !== id);
  return saveLedger(ledger);
}

export async function getActiveVetos(): Promise<BehaviorVeto[]> {
  const ledger = await loadLedger();
  return ledger.self_profile.vetos ?? [];
}

// ─── Persona genome API ───────────────────────────────────────────────────────

export async function getPersonaGenome(persona_id: string): Promise<PersonaGenome | null> {
  const ledger = await loadLedger();
  return ledger.persona_genomes.find((p) => p.persona_id === persona_id) ?? null;
}

export async function ensurePersonaGenome(persona_id: string): Promise<void> {
  const ledger = await loadLedger();
  if (!ledger.persona_genomes.find((p) => p.persona_id === persona_id)) {
    ledger.persona_genomes.push({ persona_id, overlay: {}, entry_count: 0, last_active: new Date().toISOString() });
    await saveLedger(ledger);
  }
}

// ─── UI signal hooks ──────────────────────────────────────────────────────────

const UI_SIGNAL_MAP: Record<UISignalKind, { category: TraitCategory; shifts: Partial<LoraWeightSet>; confidence: number }> = {
  compact_view_selected:    { category: "communication_style", shifts: { brevity_weight: 0.15 },   confidence: 0.35 },
  detailed_view_selected:   { category: "communication_style", shifts: { brevity_weight: -0.15 },  confidence: 0.35 },
  supertag_pinned:          { category: "work_ethics",         shifts: { proactivity_preference: 0.1 }, confidence: 0.3 },
  deep_work_mode_activated: { category: "workflow_style",      shifts: { proactivity_preference: -0.1, brevity_weight: 0.1 }, confidence: 0.3 },
  diary_entry_written:      { category: "emotional_landscape", shifts: { abstraction_level: 0.1 }, confidence: 0.25 },
  note_created_late_night:  { category: "life_orientation",  shifts: {}, confidence: 0.15 },
  goal_domain_visited:      { category: "aspirations",          shifts: { proactivity_preference: 0.1 }, confidence: 0.2 },
};

// Fire-and-forget from UI; never await on render path
export function recordUISignal(signal: UISignal): void {
  const mapping = UI_SIGNAL_MAP[signal.kind];
  if (!mapping) return;
  void addLedgerEntry({
    timestamp: new Date().toISOString(),
    trait_category: mapping.category,
    observed_behavior: signal.kind,
    synthesis: signal.context ?? signal.kind,
    lora_shifts: mapping.shifts,
    confidence_score: mapping.confidence,
  });
}

// ─── Style prompt synthesis ───────────────────────────────────────────────────
// SEC-03: Only static template strings reach the LLM. No user text interpolated.

const STYLE_TEMPLATES: [keyof LoraWeightSet, number, string, string][] = [
  ["directness_weight",      0.6, "be direct and to the point",               "be thoughtful and measured in tone"         ],
  ["brevity_weight",         0.6, "keep it concise — omit filler sentences",  "provide thorough context and explanation"   ],
  ["formality_weight",       0.6, "use formal, professional language",         "use casual, conversational language"        ],
  ["diplomacy_weight",       0.6, "soften feedback diplomatically",            "be candid — skip corporate softening language"],
  ["technical_depth_weight", 0.6, "include technical specifics and precision", "avoid jargon and keep language accessible"  ],
  ["optimism_bias",          0.65,"frame uncertainties as opportunities",      "be direct about risks and downsides"        ],
  ["proactivity_preference", 0.65,"proactively anticipate next steps",         ""                                           ],
  ["risk_tolerance",         0.65,"include bold or higher-risk options",       "favour cautious, well-tested options"       ],
  ["abstraction_level",      0.65,"use analogies and conceptual framing",      "be concrete, specific, and example-driven"  ],
];

const ALLOWED_STYLE_FRAGMENTS = new Set(
  STYLE_TEMPLATES.flatMap(([, , high, low]) => [high, low].filter(Boolean)),
);

export function buildStylePrompt(
  genome: LoraWeightSet,
  personaOverlay?: Partial<LoraWeightSet>,
  vetos?: BehaviorVeto[],
): string {
  const effective = personaOverlay ? mergePersonaOverlay(genome, personaOverlay) : genome;
  const parts: string[] = [];
  for (const [key, threshold, highLabel, lowLabel] of STYLE_TEMPLATES) {
    const w = effective[key];
    if (w > threshold && highLabel) parts.push(highLabel);
    else if (w < 1 - threshold && lowLabel) parts.push(lowLabel);
  }
  if (parts.length === 0 && (!vetos || vetos.length === 0)) return "";
  for (const p of parts) {
    if (!ALLOWED_STYLE_FRAGMENTS.has(p)) return "";
  }
  let base = parts.length > 0 ? `Write in the user's personal voice: ${parts.join(", ")}.` : "";
  // Append hard negations from prompt_style vetos
  const promptVetos = (vetos ?? []).filter((v) => v.scope === "prompt_style").slice(0, 5);
  if (promptVetos.length > 0) {
    const negations = promptVetos.map((v) => v.description).join(" ");
    base = base ? `${base} Hard constraints: ${negations}` : `Hard constraints: ${negations}`;
  }
  return base;
}
