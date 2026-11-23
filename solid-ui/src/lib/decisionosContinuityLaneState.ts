// @locs-version: 1.0
import type { AfpMessage } from "./api";
import {
  approvalDraftPreviewFromUnknown,
  simulatorPreviewCardSummaryStateFromUnknown,
} from "./approvalReviewState";
import { simulatorPreviewQueuedReason } from "./simulatorPreviewCopy";
import {
  artifactSummaryDisplayedLines,
  artifactSummaryScopeCue,
  fieldEngineFamilyLabel,
  latestFieldEnginePrimaryTypeFromMessages,
  latestFieldEngineSummaryFromMessages,
  preparedDraftDestinationForItem,
  responseItemPreparedDraftAnchorSummary,
  responseItemPreparedDraftLeadSummary,
  responseItemPreparedDraftScopeCue,
} from "afp-ts/continuity";

type ProactiveLaneCandidate = {
  artifact_summary_lines?: string[] | null;
  description?: string | null;
  draft_preview?: unknown;
  memory_space?: string | null;
  author_type?: string | null;
  human_only?: boolean | null;
  is_human_authored?: boolean | null;
  title?: string | null;
  kind?: string | null;
  requires_approval?: boolean | null;
  id?: string | null;
  selection_reason?: string | null;
  provenance_cue?: string | null;
} & Record<string, unknown>;

type ProactiveLaneState = {
  detail: string | null;
  reason: string;
  scopeCue: string | null;
  rank: [number, number, number, string];
};

type SimulatorPreviewLaneKind =
  | "simulator_approval_preview"
  | "simulator_reversible_preview"
  | "simulator_conflict_fusion";

type SimulatorPreviewLaneSummary = {
  detail: string | null;
  reason: string;
};

function responseItemPreparedDraftScopeLabel(
  item: {
    prepared_draft_class?: string | null;
    prepared_draft_summary_lines?: string[] | null;
    prepared_draft_object_labels?: string[] | null;
  } & Record<string, unknown>,
): string | null {
  const scopeCue = responseItemPreparedDraftScopeCue(item);
  if (scopeCue) return scopeCue;
  const anchorSummary = responseItemPreparedDraftAnchorSummary({
    prepared_draft_summary_lines: item.prepared_draft_summary_lines,
    prepared_draft_object_labels: item.prepared_draft_object_labels,
    prefix: "Anchors",
    limit: 2,
  });
  if (!anchorSummary) return null;
  const anchorLabel = anchorSummary.replace(/^Anchors:\s*/, "").replace(/\.$/, "").trim();
  return anchorLabel ? `anchored to ${anchorLabel}` : null;
}

function preparedResponseLaneReason(
  item: { prepared_draft_class?: string | null } | null,
  scope: string | null,
  focused: boolean,
): string {
  const destination = item?.prepared_draft_class
    ? preparedDraftDestinationForItem({ draft_class: item.prepared_draft_class })
    : "response_queue";
  const base =
    destination === "decision_queue"
      ? focused
        ? "prepared decision support ready"
        : "prepared decision-support continuity active"
      : destination === "home"
        ? focused
          ? "prepared work ready"
          : "prepared work continuity active"
        : focused
          ? "prepared response ready"
          : "prepared response continuity active";
  return scope ? `${base}, ${scope.toLowerCase()}` : base;
}

function preparedContextLaneDetail(
  item?: { summary?: string | null; title?: string | null } | null,
): string | null {
  const summary = item?.summary?.trim();
  if (summary) return summary;
  const title = item?.title?.trim();
  return title || null;
}

function preparedContextLaneReason(focused: boolean): string {
  return focused
    ? "prepared context ready"
    : "prepared context continuity active";
}

export function decisionOsSimulatorPreviewLaneSummary(
  item: Record<string, unknown> | null | undefined,
): SimulatorPreviewLaneSummary | null {
  if (!item) return null;
  const summary = simulatorPreviewCardSummaryStateFromUnknown(item);
  if (!summary) return null;
  const fallbackReason = simulatorPreviewQueuedReason(summary.kind);
  return {
    detail: summary.leadSummaryLine ?? summary.boundedReason ?? summary.title,
    reason: summary.boundedReason?.trim() || fallbackReason,
  };
}

export function decisionOsSimulatorPreviewLaneSelection<
  T extends ProactiveLaneCandidate,
>(
  suggestions: T[],
  kind: SimulatorPreviewLaneKind,
): { item: T; summary: SimulatorPreviewLaneSummary } | null {
  for (const item of suggestions) {
    if (item.kind !== kind) continue;
    const summary = decisionOsSimulatorPreviewLaneSummary(item);
    if (!summary) continue;
    return { item, summary };
  }
  return null;
}

export function decisionOsSimulatorPreviewLaneSelections<
  T extends ProactiveLaneCandidate,
>(
  suggestions: T[],
): {
  approval: { item: T; summary: SimulatorPreviewLaneSummary } | null;
  reversible: { item: T; summary: SimulatorPreviewLaneSummary } | null;
  fusion: { item: T; summary: SimulatorPreviewLaneSummary } | null;
} {
  let approval: { item: T; summary: SimulatorPreviewLaneSummary } | null = null;
  let reversible: { item: T; summary: SimulatorPreviewLaneSummary } | null = null;
  let fusion: { item: T; summary: SimulatorPreviewLaneSummary } | null = null;

  for (const item of suggestions) {
    if (
      item.kind !== "simulator_approval_preview"
      && item.kind !== "simulator_reversible_preview"
      && item.kind !== "simulator_conflict_fusion"
    ) {
      continue;
    }
    const summary = decisionOsSimulatorPreviewLaneSummary(item);
    if (!summary) continue;
    if (item.kind === "simulator_approval_preview") {
      approval ??= { item, summary };
    } else if (item.kind === "simulator_conflict_fusion") {
      fusion ??= { item, summary };
    } else {
      reversible ??= { item, summary };
    }
    if (approval && reversible && fusion) break;
  }

  return {
    approval,
    reversible,
    fusion,
  };
}

export function decisionOsProactiveLaneState(
  item: ProactiveLaneCandidate | null | undefined,
): ProactiveLaneState | null {
  if (!item) return null;
  const simulatorLaneSummary = decisionOsSimulatorPreviewLaneSummary(item);
  const normalizedDraftPreview = approvalDraftPreviewFromUnknown(item.draft_preview);
  const explicitScopeCue = artifactSummaryScopeCue({
    artifact_summary_lines: item.artifact_summary_lines,
    description: item.description,
    draft_preview: normalizedDraftPreview,
  });
  const memorySpace = item.memory_space?.trim();
  const authorType = item.author_type?.trim().toLowerCase();
  const humanGrounded = item.human_only === true
    || item.is_human_authored === true
    || authorType === "human";
  const scopeCue = simulatorLaneSummary
    ? null
    : explicitScopeCue
      ?? (memorySpace && humanGrounded
        ? `${memorySpace} context, human-grounded`
        : memorySpace
          ? `${memorySpace} context`
          : humanGrounded
            ? "human-grounded"
            : null);
  const kind = item.kind ?? "";
  const kindRank = (() => {
    switch (kind) {
      case "prepared_draft":
      case "context_ready":
      case "context_pack":
      case "continuity_priority":
        return 0;
      case "state_field":
        return 1;
      case "simulator_approval_preview":
      case "simulator_reversible_preview":
      case "simulator_conflict_fusion":
        return 3;
      default:
        return 2;
    }
  })();
  const detail = simulatorLaneSummary
    ? simulatorLaneSummary.detail
    : artifactSummaryDisplayedLines({
      artifact_summary_lines: item.artifact_summary_lines,
      description: item.description,
      draft_preview: normalizedDraftPreview,
    })[0] ?? item.title?.trim() ?? null;
  const explicitSelectionReason = item.selection_reason?.trim() || null;
  const reason = simulatorLaneSummary ? simulatorLaneSummary.reason : (
    explicitSelectionReason
      ? explicitSelectionReason
      : scopeCue
      ? `prepared work queued, ${scopeCue.toLowerCase()}`
      : kind
        ? `${kind.replaceAll("_", " ").trim()} queued`
        : "prepared work queued"
  );
  return {
    detail,
    reason,
    scopeCue,
    rank: [
      kindRank,
      scopeCue ? 0 : 1,
      item.requires_approval ? 0 : 1,
      item.id ?? "",
    ],
  };
}

export function decisionOsPreferredProactiveLaneSuggestion<
  T extends ProactiveLaneCandidate,
>(
  suggestions: T[],
): { item: T; state: ProactiveLaneState } | null {
  let best:
    | {
      item: T;
      state: ProactiveLaneState;
      index: number;
    }
    | null = null;

  for (const [index, item] of suggestions.entries()) {
    const state = decisionOsProactiveLaneState(item);
    if (!state) continue;
    if (!best) {
      best = { item, state, index };
      continue;
    }
    for (let i = 0; i < state.rank.length; i += 1) {
      if (state.rank[i]! < best.state.rank[i]!) {
        best = { item, state, index };
        break;
      }
      if (state.rank[i]! > best.state.rank[i]!) {
        break;
      }
      if (i === state.rank.length - 1 && index < best.index) {
        best = { item, state, index };
      }
    }
  }

  return best ? { item: best.item, state: best.state } : null;
}

export function decisionOsContinuityLaneSummaryFromStateFieldSummary<
  T extends { label: string; reason: string; status: string },
>(
  summary: {
    count: number;
    fields: T[];
    hasVisible: boolean;
    leadingField: T | null;
  },
  responseItems: Array<{
    prepared_draft_class?: string | null;
    prepared_draft_summary_lines?: string[] | null;
    prepared_draft_object_labels?: string[] | null;
  } & Record<string, unknown>> = [],
  contextPackItems: Array<{
    title?: string | null;
    summary?: string | null;
  }> = [],
  messages?: AfpMessage[] | null,
  suggestedMood?: string,
): {
  count: number;
  title: string;
  badge: string;
  reason: string;
  detail: string | null;
} {
  const { count, leadingField, fields } = summary;
  const leadingResponseItem = responseItems
    .find((item) => responseItemPreparedDraftLeadSummary(item)?.trim());
  const leadingResponseSummary = leadingResponseItem
    ? responseItemPreparedDraftLeadSummary(leadingResponseItem)
    : null;
  const leadingResponseScope = leadingResponseItem
    ? responseItemPreparedDraftScopeLabel(leadingResponseItem)
    : null;
  const leadingContextPack = contextPackItems.find((item) => item.summary?.trim().length)
    ?? contextPackItems[0]
    ?? null;
  const normalizedMood = suggestedMood?.trim().toLowerCase() ?? "";
  const monitorOnlyFieldsVisible = count > 0 && fields.every((field) => field.status !== "active");
  const fieldEnginePrimaryType = latestFieldEnginePrimaryTypeFromMessages(messages);
  const fieldEngineFamily = fieldEngineFamilyLabel(fieldEnginePrimaryType);
  const fieldEngineSummary = latestFieldEngineSummaryFromMessages(messages);

  if (count === 0 || (normalizedMood === "focused" && monitorOnlyFieldsVisible)) {
    if (leadingResponseSummary) {
      const leadingResponseDestination = leadingResponseItem?.prepared_draft_class
        ? preparedDraftDestinationForItem({ draft_class: leadingResponseItem.prepared_draft_class })
        : "response_queue";
      return {
        count: 1,
        title:
          leadingResponseDestination === "decision_queue"
            ? normalizedMood === "focused"
              ? "Prepared decision support ready"
              : "Decision continuity active"
            : leadingResponseDestination === "home"
              ? normalizedMood === "focused"
                ? "Prepared work ready"
                : "Prepared work continuity active"
              : normalizedMood === "focused"
                ? "Prepared response ready"
                : "Response continuity active",
        badge: normalizedMood === "focused" ? "focused" : "active",
        detail: leadingResponseSummary,
        reason: preparedResponseLaneReason(
          leadingResponseItem ?? null,
          leadingResponseScope,
          normalizedMood === "focused",
        ),
      };
    }
    if (leadingContextPack) {
      return {
        count: 1,
        title: normalizedMood === "focused" ? "Prepared context ready" : "Context continuity active",
        badge: normalizedMood === "focused" ? "focused" : "active",
        detail: preparedContextLaneDetail(leadingContextPack),
        reason: preparedContextLaneReason(normalizedMood === "focused"),
      };
    }
    if (fieldEngineSummary) {
      return {
        count: 1,
        title: fieldEngineFamily ?? "Field pressure active",
        badge: "active",
        detail: fieldEngineSummary,
        reason: fieldEngineFamily
          ? `${fieldEngineFamily.toLowerCase()} active`
          : "field-engine continuity pressure active",
      };
    }
    return {
      count,
      title: "Continuity is quiet",
      badge: "calm",
      detail: null,
      reason: "no active continuity pressure",
    };
  }

  return {
    count,
    title: `${count} state lane${count === 1 ? "" : "s"} active`,
    badge: "active",
    detail: leadingField ? `${leadingField.label}: ${leadingField.reason}` : null,
    reason: leadingField
      ? `${leadingField.label.toLowerCase()} active`
      : "state-field continuity pressure active",
  };
}
