// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";

const CONTEXT_ANNOTATIONS_KEY = "omnyid.decisionos.context-annotations";

export type DecisionOsContextAnnotationItem = {
  title?: string | null;
  sourceRefs?: string[] | null;
  sourceUrl?: string | null;
  snippet?: string | null;
};

export type DecisionOsContextAnnotationEditState = {
  editingKey: string;
  draft: string;
};

export type DecisionOsContextAnnotationKeyDownState = {
  shouldPreventDefault: boolean;
  editingKey: string | null;
  draft: string;
  savedNote?: string | null;
};

function scopedAnnotationStorageKey(userId?: string | null): string {
  return accountScopedStorageKey(CONTEXT_ANNOTATIONS_KEY, userId ?? null);
}

function removeAnnotationsStorage(userId?: string | null): void {
  const scopedKey = scopedAnnotationStorageKey(userId);
  try {
    localStorage.removeItem(scopedKey);
    if (scopedKey !== CONTEXT_ANNOTATIONS_KEY) localStorage.removeItem(CONTEXT_ANNOTATIONS_KEY);
  } catch {
    // Ignore local storage write failures and keep the panel usable.
  }
}

function loadAnnotations(userId?: string | null): Record<string, string> {
  const scopedKey = scopedAnnotationStorageKey(userId);
  try {
    const raw = localStorage.getItem(scopedKey) ?? localStorage.getItem(CONTEXT_ANNOTATIONS_KEY);
    if (!raw) return {};
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeAnnotationsStorage(userId);
      return {};
    }
    const normalized = normalizeAnnotations(
      isRecord(parsed.value)
        ? Object.fromEntries(
            Object.entries(parsed.value).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
          )
        : {},
    );
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw || localStorage.getItem(scopedKey) !== serialized) {
      saveAnnotations(normalized, userId);
    }
    return normalized;
  } catch {
    removeAnnotationsStorage(userId);
    return {};
  }
}

function normalizeAnnotations(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, note]) => [key.trim(), note.trim()] as const)
      .filter(([key, note]) => key.length > 0 && note.length > 0),
  );
}

function saveAnnotations(value: Record<string, string>, userId?: string | null): void {
  const scopedKey = scopedAnnotationStorageKey(userId);
  try {
    localStorage.setItem(scopedKey, JSON.stringify(normalizeAnnotations(value)));
    if (scopedKey !== CONTEXT_ANNOTATIONS_KEY) localStorage.removeItem(CONTEXT_ANNOTATIONS_KEY);
  } catch {
    // Ignore local storage write failures and keep the panel usable.
  }
}

function normalizeSegment(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

export function decisionOsContextAnnotationKey(item: DecisionOsContextAnnotationItem): string | null {
  const refKey = (item.sourceRefs ?? [])
    .map((value) => normalizeSegment(String(value)))
    .filter(Boolean)
    .join("|");
  if (refKey) return `refs:${refKey}`;

  const urlKey = typeof item.sourceUrl === "string" ? normalizeSegment(item.sourceUrl) : "";
  if (urlKey) return `url:${urlKey}`;

  const titleKey = typeof item.title === "string" ? normalizeSegment(item.title) : "";
  const snippetKey = typeof item.snippet === "string" ? normalizeSegment(item.snippet) : "";
  const combined = [titleKey, snippetKey].filter(Boolean).join("|");
  return combined ? `text:${combined}` : null;
}

export function decisionOsContextAnnotation(
  item: DecisionOsContextAnnotationItem,
  userId?: string | null,
): string | null {
  const key = decisionOsContextAnnotationKey(item);
  if (!key) return null;
  const annotations = loadAnnotations(userId);
  const value = annotations[key]?.trim();
  return value ? value : null;
}

export function decisionOsContextAnnotationEditState(
  item: DecisionOsContextAnnotationItem,
  userId?: string | null,
): DecisionOsContextAnnotationEditState | null {
  const key = decisionOsContextAnnotationKey(item);
  if (!key) return null;
  return {
    editingKey: key,
    draft: decisionOsContextAnnotation(item, userId) ?? "",
  };
}

export function saveDecisionOsContextAnnotation(
  item: DecisionOsContextAnnotationItem,
  note: string,
  userId?: string | null,
): string | null {
  const key = decisionOsContextAnnotationKey(item);
  if (!key) return null;
  const trimmed = note.trim();
  const annotations = loadAnnotations(userId);
  if (!trimmed) {
    delete annotations[key];
    saveAnnotations(annotations, userId);
    return null;
  }
  annotations[key] = trimmed;
  saveAnnotations(annotations, userId);
  return trimmed;
}

export function decisionOsContextAnnotationSaveState(
  item: DecisionOsContextAnnotationItem,
  note: string,
  userId?: string | null,
): {
  savedNote: string | null;
  editingKey: null;
  draft: "";
} {
  return {
    savedNote: saveDecisionOsContextAnnotation(item, note, userId),
    editingKey: null,
    draft: "",
  };
}

export function decisionOsContextAnnotationKeyDownState(
  item: DecisionOsContextAnnotationItem,
  note: string,
  key: string,
  userId?: string | null,
): DecisionOsContextAnnotationKeyDownState | null {
  if (key === "Enter") {
    return {
      shouldPreventDefault: true,
      ...decisionOsContextAnnotationSaveState(item, note, userId),
    };
  }
  if (key === "Escape") {
    return {
      shouldPreventDefault: true,
      editingKey: null,
      draft: "",
    };
  }
  return null;
}
