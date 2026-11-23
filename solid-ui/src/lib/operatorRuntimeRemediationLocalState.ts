// @locs-version: 1.0
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";

export const OPERATOR_RUNTIME_REMEDIATION_FILTER_KEY = "omnyid.operator.runtime_remediation.filter.v1";
export const OPERATOR_RUNTIME_REMEDIATION_FEATURED_RECEIPT_KEY = "omnyid.operator.runtime_remediation.featured_receipt.v1";
export const OPERATOR_RUNTIME_REMEDIATION_OUTCOME_NOTES_KEY = "omnyid.operator.runtime_remediation.outcome_notes.v1";
export const OPERATOR_RUNTIME_REMEDIATION_PROOF_REFERENCES_KEY = "omnyid.operator.runtime_remediation.proof_references.v1";

export type OperatorRuntimeRemediationFilter = "open" | "completed" | "all" | "drafts";

export function normalizeOperatorRuntimeRemediationFilter(value: unknown): OperatorRuntimeRemediationFilter {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "completed" || normalized === "all" || normalized === "drafts" ? normalized : "open";
}

function scopedOperatorRuntimeRemediationFilterKey(userId: string | null | undefined): string {
  return accountScopedStorageKey(OPERATOR_RUNTIME_REMEDIATION_FILTER_KEY, userId ?? null);
}

function scopedOperatorRuntimeRemediationFeaturedReceiptKey(userId: string | null | undefined): string {
  return accountScopedStorageKey(OPERATOR_RUNTIME_REMEDIATION_FEATURED_RECEIPT_KEY, userId ?? null);
}

function scopedOperatorRuntimeRemediationOutcomeNotesKey(userId: string | null | undefined): string {
  return accountScopedStorageKey(OPERATOR_RUNTIME_REMEDIATION_OUTCOME_NOTES_KEY, userId ?? null);
}

function scopedOperatorRuntimeRemediationProofReferencesKey(userId: string | null | undefined): string {
  return accountScopedStorageKey(OPERATOR_RUNTIME_REMEDIATION_PROOF_REFERENCES_KEY, userId ?? null);
}

export function normalizeOperatorRuntimeRemediationReceiptId(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}

export function normalizeOperatorRuntimeRemediationDraftMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([receiptId, entryValue]): Array<[string, string]> => {
      const normalizedReceiptId = normalizeOperatorRuntimeRemediationReceiptId(receiptId);
      const normalizedValue = typeof entryValue === "string" ? entryValue.trim() : "";
      return normalizedReceiptId && normalizedValue ? [[normalizedReceiptId, normalizedValue]] : [];
    }),
  );
}

function loadOperatorRuntimeRemediationDraftMapForKey(
  key: string,
): Record<string, string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeOperatorRuntimeRemediationDraftMap(parsed);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) localStorage.setItem(key, serialized);
    return normalized;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore storage failures for convenience state
    }
    return {};
  }
}

function saveOperatorRuntimeRemediationDraftMapForKey(key: string, value: Record<string, string>): void {
  try {
    localStorage.setItem(key, JSON.stringify(normalizeOperatorRuntimeRemediationDraftMap(value)));
  } catch {
    // ignore storage failures for convenience state
  }
}

export function loadOperatorRuntimeRemediationFilter(userId: string | null | undefined): OperatorRuntimeRemediationFilter {
  const key = scopedOperatorRuntimeRemediationFilterKey(userId);
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return "open";
    const normalized = normalizeOperatorRuntimeRemediationFilter(raw);
    if (normalized !== raw) {
      localStorage.setItem(key, normalized);
    }
    return normalized;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore storage failures for convenience state
    }
    return "open";
  }
}

export function saveOperatorRuntimeRemediationFilter(
  userId: string | null | undefined,
  value: OperatorRuntimeRemediationFilter,
): void {
  const key = scopedOperatorRuntimeRemediationFilterKey(userId);
  try {
    localStorage.setItem(key, normalizeOperatorRuntimeRemediationFilter(value));
  } catch {
    // ignore storage failures for convenience state
  }
}

export function loadOperatorRuntimeRemediationFeaturedReceiptId(userId: string | null | undefined): string | null {
  const key = scopedOperatorRuntimeRemediationFeaturedReceiptKey(userId);
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const normalized = normalizeOperatorRuntimeRemediationReceiptId(raw);
    if (!normalized) {
      localStorage.removeItem(key);
      return null;
    }
    if (normalized !== raw) {
      localStorage.setItem(key, normalized);
    }
    return normalized;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore storage failures for convenience state
    }
    return null;
  }
}

export function saveOperatorRuntimeRemediationFeaturedReceiptId(
  userId: string | null | undefined,
  receiptId: string | null | undefined,
): void {
  const key = scopedOperatorRuntimeRemediationFeaturedReceiptKey(userId);
  const normalized = normalizeOperatorRuntimeRemediationReceiptId(receiptId);
  try {
    if (normalized) {
      localStorage.setItem(key, normalized);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore storage failures for convenience state
  }
}

export function loadOperatorRuntimeRemediationOutcomeNotes(userId: string | null | undefined): Record<string, string> {
  return loadOperatorRuntimeRemediationDraftMapForKey(scopedOperatorRuntimeRemediationOutcomeNotesKey(userId));
}

export function saveOperatorRuntimeRemediationOutcomeNotes(
  userId: string | null | undefined,
  value: Record<string, string>,
): void {
  saveOperatorRuntimeRemediationDraftMapForKey(scopedOperatorRuntimeRemediationOutcomeNotesKey(userId), value);
}

export function loadOperatorRuntimeRemediationProofReferences(userId: string | null | undefined): Record<string, string> {
  return loadOperatorRuntimeRemediationDraftMapForKey(scopedOperatorRuntimeRemediationProofReferencesKey(userId));
}

export function saveOperatorRuntimeRemediationProofReferences(
  userId: string | null | undefined,
  value: Record<string, string>,
): void {
  saveOperatorRuntimeRemediationDraftMapForKey(scopedOperatorRuntimeRemediationProofReferencesKey(userId), value);
}
