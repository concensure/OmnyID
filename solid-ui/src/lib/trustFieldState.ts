// @locs-version: 1.0
import {
  boundedReasonSummary,
  hasDistinctReasonSummary,
  sourceCountSummary,
} from "afp-ts/continuity";

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export type TrustSummaryState = {
  boundedReason: string | null;
  selectionReason: string;
  showSelectionReason: boolean;
  consequencePreview: string;
  provenanceCue: string;
  sourceSummary: string | null;
};

type ExplicitTrustSummaryInput = {
  boundedReason?: string | null;
  selectionReason?: string | null;
  consequencePreview?: string | null;
  provenanceCue?: string | null;
  sourceSummary?: string | null;
};

export function trustFieldFromRecord(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = nonEmptyString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function trustFieldFromContents(
  viewContent: Record<string, unknown>,
  messageContent: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  return trustFieldFromRecord(viewContent, keys) ?? trustFieldFromRecord(messageContent, keys);
}

type TrustSummaryRecordInput = {
  kind?: unknown;
  pack_kind?: unknown;
  draft_class?: unknown;
  urgency?: unknown;
  response_due_hint?: unknown;
};

function trustSummaryFromSelectionAndRecord(
  selectionReason: string,
  record: TrustSummaryRecordInput,
  trustFieldReader: (keys: readonly string[]) => string | undefined,
  sourceRefs: string[],
): TrustSummaryState {
  const boundedReason = boundedReasonSummary({
    kind: nonEmptyString(record.kind) ?? "",
    pack_kind: nonEmptyString(record.pack_kind) ?? "",
    draft_class: nonEmptyString(record.draft_class) ?? "",
    urgency: nonEmptyString(record.urgency) ?? "",
    response_due_hint: nonEmptyString(record.response_due_hint) ?? "",
    selection_reason: selectionReason,
  });

  return {
    boundedReason,
    selectionReason,
    showSelectionReason: hasDistinctReasonSummary(selectionReason, boundedReason),
    consequencePreview:
      trustFieldReader(["approval_or_reversibility_hint", "consequence_preview"]) ?? "",
    provenanceCue: trustFieldReader(["provenance_cue"]) ?? "",
    sourceSummary:
      trustFieldReader(["source_summary"]) ?? sourceCountSummary(sourceRefs),
  };
}

export function trustSummaryStateFromExplicitFields(
  input: ExplicitTrustSummaryInput,
): TrustSummaryState {
  const selectionReason = nonEmptyString(input.selectionReason) ?? "";
  const explicitBoundedReason = nonEmptyString(input.boundedReason);
  const boundedReason = explicitBoundedReason ?? (selectionReason || null);

  return {
    boundedReason,
    selectionReason,
    showSelectionReason: hasDistinctReasonSummary(selectionReason, boundedReason),
    consequencePreview: nonEmptyString(input.consequencePreview) ?? "",
    provenanceCue: nonEmptyString(input.provenanceCue) ?? "",
    sourceSummary: nonEmptyString(input.sourceSummary) ?? null,
  };
}

export function trustSummaryStateFromRecord(
  record: Record<string, unknown>,
): TrustSummaryState {
  const selectionReason = nonEmptyString(record.selection_reason) ?? "";
  return trustSummaryFromSelectionAndRecord(
    selectionReason,
    record,
    (keys) => trustFieldFromRecord(record, keys),
    Array.isArray(record.source_refs)
      ? record.source_refs.flatMap((value) => (nonEmptyString(value) ? [value] : []))
      : [],
  );
}

export function trustSummaryStateFromContents(
  viewContent: Record<string, unknown>,
  messageContent: Record<string, unknown>,
): TrustSummaryState {
  const selectionReason = trustFieldFromContents(
    viewContent,
    messageContent,
    ["selection_reason"],
  ) ?? "";

  return trustSummaryFromSelectionAndRecord(
    selectionReason,
    {
      kind: viewContent.kind ?? messageContent.kind,
      pack_kind: viewContent.pack_kind ?? messageContent.pack_kind,
      draft_class: viewContent.draft_class ?? messageContent.draft_class,
      urgency: viewContent.urgency ?? messageContent.urgency,
      response_due_hint: viewContent.response_due_hint ?? messageContent.response_due_hint,
    },
    (keys) => trustFieldFromContents(viewContent, messageContent, keys),
    (() => {
      const raw = Array.isArray(viewContent.source_refs)
        ? viewContent.source_refs
        : Array.isArray(messageContent.source_refs)
          ? messageContent.source_refs
          : [];
      return raw.flatMap((value) => (nonEmptyString(value) ? [value] : []));
    })(),
  );
}
