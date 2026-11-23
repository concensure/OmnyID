// @locs-version: 1.0
import type { AfpMessage, ObjectMessagesResponse } from "./api";
import { afpOptionalRecord } from "./afpMessageRecord";
import { decryptedDisplayContent } from "./decryptedDisplayState";
import { collectKindCounts } from "./objectKinds";

type CountEntry = {
  value: string;
  count: number;
};

function objectSearchScalarString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function collectMetadataScalarTerms(
  value: unknown,
  path: string[],
  counts: Map<string, number>,
) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) collectMetadataScalarTerms(item, path, counts);
    return;
  }
  if (typeof value === "object") {
    const record = afpOptionalRecord(value);
    if (!record) return;
    for (const [key, nested] of Object.entries(record)) {
      collectMetadataScalarTerms(nested, [...path, key], counts);
    }
    return;
  }
  const rendered = String(value).trim();
  if (!rendered) return;
  const key = path[path.length - 1]?.toLowerCase();
  if (!key) return;
  const term = `${key}:${rendered}`;
  counts.set(term, (counts.get(term) ?? 0) + 1);
}

function normalizeCountMap(map: Map<string, number>): CountEntry[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
}

export function buildObjectMessagesSearchRequest(args: {
  query: string;
  focusThreadId?: string | null;
  focusObjectId?: string | null;
  limit: number;
}) {
  return {
    query: args.query,
    focusThreadId: args.focusThreadId ?? undefined,
    focusObjectId: args.focusObjectId ?? undefined,
    limit: args.limit,
  };
}

export function objectMessagesList(result?: ObjectMessagesResponse | null): AfpMessage[] {
  return result?.messages ?? [];
}

export function objectMessagesRetrievalState(
  result?: ObjectMessagesResponse | null,
): ObjectMessagesResponse["retrieval_state"] | null {
  return result?.retrieval_state ?? null;
}

export function objectMessagesFocusThreadId(result?: ObjectMessagesResponse | null): string | null {
  return result?.focus_thread_id ?? null;
}

export function objectMessagesFocusObjectId(
  result?: ObjectMessagesResponse | null,
  fallback?: string | null,
): string | null {
  return fallback ?? result?.focus_object_id ?? null;
}

export function objectMessagesActiveFacets(result: ObjectMessagesResponse): string[] {
  const chips: string[] = [];
  if (result.kind) chips.push(`kind:${result.kind}`);
  for (const tag of result.tags) chips.push(`#${tag}`);
  for (const target of result.reference_targets) chips.push(`target:${target}`);
  if (result.reference_type) chips.push(`reftype:${result.reference_type}`);
  if (result.link_type) chips.push(`relation:${result.link_type}`);
  for (const key of result.metadata_keys) chips.push(`key:${key}`);
  for (const value of result.metadata_values) chips.push(`value:${value}`);
  return chips;
}

export function objectMessagesKindCounts(result: ObjectMessagesResponse) {
  return result.facet_suggestions?.kinds.map((entry) => ({ kind: entry.value, count: entry.count }))
    ?? collectKindCounts(objectMessagesList(result).map((message) => message.kind));
}

export function objectMessagesTagCounts(result: ObjectMessagesResponse) {
  if (result.facet_suggestions?.tags) {
    return result.facet_suggestions.tags.map((entry) => ({ tag: entry.value, count: entry.count }));
  }
  const counts = new Map<string, number>();
  for (const message of objectMessagesList(result)) {
    for (const tag of message.supertags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return normalizeCountMap(counts)
    .slice(0, 10)
    .map(({ value, count }) => ({ tag: value, count }));
}

export function objectMessagesReferenceFacetCounts(result: ObjectMessagesResponse): {
  targets: CountEntry[];
  referenceTypes: CountEntry[];
  linkTypes: CountEntry[];
} {
  if (result.facet_suggestions) {
    return {
      targets: result.facet_suggestions.reference_targets,
      referenceTypes: result.facet_suggestions.reference_types,
      linkTypes: result.facet_suggestions.link_types,
    };
  }

  const targetCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  const linkTypeCounts = new Map<string, number>();

  for (const message of objectMessagesList(result)) {
    for (const reference of message.references ?? []) {
      const target = reference.target?.trim();
      if (target) targetCounts.set(target, (targetCounts.get(target) ?? 0) + 1);

      const referenceType = reference.type?.trim().toLowerCase();
      if (referenceType) typeCounts.set(referenceType, (typeCounts.get(referenceType) ?? 0) + 1);

      const linkType = objectSearchScalarString(reference.metadata?.link_type).trim().toLowerCase();
      if (linkType) linkTypeCounts.set(linkType, (linkTypeCounts.get(linkType) ?? 0) + 1);
    }
  }

  return {
    targets: normalizeCountMap(targetCounts),
    referenceTypes: normalizeCountMap(typeCounts),
    linkTypes: normalizeCountMap(linkTypeCounts),
  };
}

export function objectMessagesMetadataTermCounts(result: ObjectMessagesResponse) {
  if (result.facet_suggestions?.metadata_terms) {
    return result.facet_suggestions.metadata_terms;
  }
  const counts = new Map<string, number>();
  for (const message of objectMessagesList(result)) {
    collectMetadataScalarTerms(message.metadata, ["metadata"], counts);
    collectMetadataScalarTerms(
      afpOptionalRecord(decryptedDisplayContent(message))?.metadata,
      ["content", "metadata"],
      counts,
    );
  }
  return normalizeCountMap(counts).slice(0, 12);
}

export function objectMessagesFacetNextMoves(result?: ObjectMessagesResponse | null) {
  return result?.facet_next_moves ?? null;
}
