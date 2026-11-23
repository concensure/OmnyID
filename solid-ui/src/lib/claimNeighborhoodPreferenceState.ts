// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export type ClaimNeighborhoodStance = "all" | "supports" | "refutes" | "mentions";

export type ClaimNeighborhoodSelection = {
  depth: 1 | 2 | 3;
  preferenceScope: string;
  stance: ClaimNeighborhoodStance;
};

export const CLAIM_NEIGHBORHOOD_STANCES: ClaimNeighborhoodStance[] = [
  "all",
  "supports",
  "refutes",
  "mentions",
];

export const CLAIM_NEIGHBORHOOD_PREF_KEY = "omnyid.claim-neighborhood.preferences";

function isClaimNeighborhoodStance(value: unknown): value is ClaimNeighborhoodStance {
  return typeof value === "string" && CLAIM_NEIGHBORHOOD_STANCES.includes(value as ClaimNeighborhoodStance);
}

function normalizeClaimNeighborhoodDepth(value: unknown): 1 | 2 | 3 | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

function normalizeClaimNeighborhoodSelection(
  preferenceScope: string,
  value: unknown,
): ClaimNeighborhoodSelection | null {
  if (!isRecord(value)) return null;
  const scope = preferenceScope.trim();
  const stance = isClaimNeighborhoodStance(value.stance) ? value.stance : null;
  const depth = normalizeClaimNeighborhoodDepth(value.depth);
  if (!scope || !stance || depth === null) return null;
  return {
    preferenceScope: scope,
    stance,
    depth,
  };
}

function normalizeClaimNeighborhoodPreferences(value: unknown): Record<string, ClaimNeighborhoodSelection> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([scope, entry]) => normalizeClaimNeighborhoodSelection(scope, entry))
      .filter((selection): selection is ClaimNeighborhoodSelection => selection !== null)
      .map((selection) => [selection.preferenceScope, selection]),
  );
}

function writeClaimNeighborhoodPreferenceValue(value: Record<string, ClaimNeighborhoodSelection>): void {
  try {
    localStorage.setItem(CLAIM_NEIGHBORHOOD_PREF_KEY, JSON.stringify(value));
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}

function removeClaimNeighborhoodPreferenceValue(): void {
  try {
    localStorage.removeItem(CLAIM_NEIGHBORHOOD_PREF_KEY);
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}

export function readClaimNeighborhoodPreferences(): Record<string, ClaimNeighborhoodSelection> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(CLAIM_NEIGHBORHOOD_PREF_KEY);
    if (!raw) return {};
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeClaimNeighborhoodPreferenceValue();
      return {};
    }
    const normalized = normalizeClaimNeighborhoodPreferences(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) writeClaimNeighborhoodPreferenceValue(normalized);
    return normalized;
  } catch {
    removeClaimNeighborhoodPreferenceValue();
    return {};
  }
}

export function readClaimNeighborhoodSelection(preferenceScope: string): ClaimNeighborhoodSelection {
  const scope = preferenceScope.trim() || "global";
  return readClaimNeighborhoodPreferences()[scope] ?? {
    preferenceScope: scope,
    stance: "all",
    depth: 1,
  };
}

export function saveClaimNeighborhoodSelection(selection: ClaimNeighborhoodSelection) {
  if (typeof localStorage === "undefined") return;
  const normalized = normalizeClaimNeighborhoodSelection(selection.preferenceScope, selection);
  if (!normalized) return;
  try {
    const next = readClaimNeighborhoodPreferences();
    next[normalized.preferenceScope] = normalized;
    writeClaimNeighborhoodPreferenceValue(next);
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}

export function claimNeighborhoodDebugContext(preferenceScope: string): Record<string, unknown> {
  return {
    claim_neighborhood: readClaimNeighborhoodSelection(preferenceScope),
  };
}
