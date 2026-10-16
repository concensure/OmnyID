// @locs-version: 1.0
import type {
  DecisionCardEvidence,
  DecisionCardModel,
  DecisionCardOption,
} from "@/lib/decisionCardState";

export type QuotationTotalView = {
  currency: string;
  status: "complete" | "incomplete" | "ambiguous";
  total_minor?: number | null;
  evidence_coverage_bps: number;
  gaps: Array<{ code: string; line_id?: string | null; message: string }>;
};

export type QuotationCandidateView = {
  quotation_id: string;
  version_id: string;
  vendor_id: string;
  vendor_label?: string | null;
  disposition: "eligible" | "conditional" | "excluded";
  total: QuotationTotalView;
  requirement_coverage_bps: number;
  evidence_strength_bps: number;
  hard_conflict_ids: string[];
  unknown_hard_requirement_ids: string[];
};

export type QuotationSourceView = {
  version_id: string;
  label: string;
  ref: string;
  source_kind: string;
  observed_at?: string | null;
};

export type QuotationComparisonView = {
  comparison_id: string;
  scenario_id: string;
  revision: string;
  context_namespace: string;
  candidates: QuotationCandidateView[];
  recommended_quotation_id?: string | null;
  recommendation_reason?: string | null;
  sources: QuotationSourceView[];
};

function boundedPercent(basisPoints: number): string {
  const value = Math.max(0, Math.min(10_000, Math.trunc(basisPoints)));
  return `${Math.round(value / 100)}%`;
}

function moneyLabel(total: QuotationTotalView): string {
  if (typeof total.total_minor !== "number" || !Number.isSafeInteger(total.total_minor)) {
    return total.status === "ambiguous" ? "Tax or total ambiguous" : "Partial — price details missing";
  }
  const sign = total.total_minor < 0 ? "-" : "";
  const absolute = Math.abs(total.total_minor);
  const whole = Math.floor(absolute / 100).toLocaleString("en-AU");
  const cents = String(absolute % 100).padStart(2, "0");
  return `${sign}${total.currency} ${whole}.${cents}`;
}

function candidateName(candidate: QuotationCandidateView): string {
  return candidate.vendor_label?.trim() || candidate.vendor_id;
}

function candidateSummary(candidate: QuotationCandidateView): string {
  const disposition = candidate.disposition === "eligible"
    ? "Eligible"
    : candidate.disposition === "excluded" ? "Excluded" : "Needs confirmation";
  return `${disposition} · ${moneyLabel(candidate.total)} · ${boundedPercent(candidate.requirement_coverage_bps)} requirements confirmed`;
}

function evidenceForComparison(comparison: QuotationComparisonView): DecisionCardEvidence[] {
  const activeVersions = new Set(comparison.candidates.map((candidate) => candidate.version_id));
  return comparison.sources
    .filter((source) => activeVersions.has(source.version_id) && source.ref.trim())
    .slice(0, 4)
    .map((source) => ({
      label: source.label,
      ref: source.ref,
      sourceKind: source.source_kind,
      observedAt: source.observed_at ?? null,
      freshness: "current" as const,
    }));
}

function unknownLabels(comparison: QuotationComparisonView): string[] {
  const labels = comparison.candidates.flatMap((candidate) => [
    ...candidate.unknown_hard_requirement_ids.map((id) => `${candidateName(candidate)}: confirm ${id}`),
    ...candidate.total.gaps.map((gap) => `${candidateName(candidate)}: ${gap.message}`),
  ]);
  return [...new Set(labels)].slice(0, 6);
}

function optionsForComparison(comparison: QuotationComparisonView): DecisionCardOption[] {
  return comparison.candidates.slice(0, 3).map((candidate) => ({
    id: candidate.quotation_id,
    name: candidateName(candidate),
    summary: candidateSummary(candidate),
    recommended:
      comparison.candidates.length > 1
      && candidate.disposition === "eligible"
      && candidate.quotation_id === comparison.recommended_quotation_id,
  }));
}

export function decisionCardFromQuotationComparison(
  comparison: QuotationComparisonView,
): DecisionCardModel {
  const evidence = evidenceForComparison(comparison);
  const unknowns = unknownLabels(comparison);
  const recommended = comparison.candidates.length > 1
    ? comparison.candidates.find((candidate) =>
      candidate.quotation_id === comparison.recommended_quotation_id
      && candidate.disposition === "eligible"
      && comparison.sources.some((source) => source.version_id === candidate.version_id && source.ref.trim())) ?? null
    : null;
  const fullyVerified = comparison.candidates.length > 0 && comparison.candidates.every((candidate) =>
    candidate.disposition === "eligible"
    && candidate.total.status === "complete"
    && candidate.total.evidence_coverage_bps === 10_000
  );
  const title = comparison.candidates.length > 1
    ? `Compare ${comparison.candidates.length} quotations`
    : "Review quotation";
  return {
    schema: "content.decision_card",
    pattern: comparison.candidates.length > 1 ? "compare" : unknowns.length > 0 ? "clarify" : "review",
    patternVersion: "1.0",
    id: `quotation-comparison:${comparison.comparison_id}:${comparison.revision}`,
    title,
    domain: comparison.context_namespace === "wedding_planner" ? "wedding" : "general",
    pressure: unknowns.length > 0 ? "medium" : "low",
    whyItMatters: unknowns.length > 0
      ? `${unknowns.length} source-backed gap${unknowns.length === 1 ? "" : "s"} may change the decision.`
      : "Review comparable cost, requirements, and source evidence before choosing.",
    recommendation: recommended && evidence.length > 0 && comparison.recommendation_reason?.trim()
      ? {
        summary: candidateName(recommended),
        reasons: [
          comparison.recommendation_reason.trim(),
          `${boundedPercent(recommended.requirement_coverage_bps)} confirmed requirement coverage`,
        ],
      }
      : null,
    actions: [
      {
        id: `review:${comparison.revision}`,
        label: comparison.candidates.length > 1 ? "Open comparison" : "Review quotation",
        role: "primary",
        effect: `Opens comparison revision ${comparison.revision}; no external action is taken`,
        intent: "quotation.review",
      },
      ...(unknowns.length > 0 ? [{
        id: `clarify:${comparison.revision}`,
        label: "Prepare clarification",
        role: "secondary" as const,
        effect: `Creates an editable draft bound to revision ${comparison.revision}; sending still requires approval`,
        intent: "quotation.clarification.prepare",
      }] : []),
      {
        id: `defer:${comparison.revision}`,
        label: "Decide later",
        role: "dismiss",
        effect: `Defers revision ${comparison.revision} without changing a quotation`,
        intent: "quotation.defer",
      },
    ],
    evidence,
    confidence: {
      label: fullyVerified ? "Verified inputs" : "Some verification remains",
      reason: fullyVerified
        ? "All displayed candidates have complete supported totals."
        : "Unknowns, exclusions, or incomplete totals remain visible.",
    },
    timeSensitivity: null,
    visual: { kind: "none" },
    unknowns,
    patternSlots: {
      options: optionsForComparison(comparison),
      payloadPreview: comparison.candidates.map(candidateSummary).join("\n"),
      question: unknowns[0] ?? null,
    },
    verification: fullyVerified
      ? { status: "verified", label: "Source-linked totals verified" }
      : evidence.length > 0
        ? { status: "partial", label: `${evidence.length} active source${evidence.length === 1 ? "" : "s"}` }
        : { status: "unverified", label: "Source evidence unavailable" },
  };
}

export function a2uiForQuotationComparison(
  comparison: QuotationComparisonView,
): Record<string, unknown> {
  const columns = comparison.candidates.map(candidateName);
  const rows = [
    { label: "Comparable total", values: comparison.candidates.map((candidate) => moneyLabel(candidate.total)) },
    { label: "Status", values: comparison.candidates.map((candidate) => candidate.disposition) },
    { label: "Requirements confirmed", values: comparison.candidates.map((candidate) => boundedPercent(candidate.requirement_coverage_bps)) },
    { label: "Evidence strength", values: comparison.candidates.map((candidate) => boundedPercent(candidate.evidence_strength_bps)) },
    { label: "Unknown must-haves", values: comparison.candidates.map((candidate) => candidate.unknown_hard_requirement_ids.join(", ") || "None") },
  ];
  const actions = {
    review: {
      kind: "quotation_review",
      comparison_id: comparison.comparison_id,
      revision: comparison.revision,
      requires_user_confirmation: false,
    },
    clarify: {
      kind: "quotation_clarification_draft",
      comparison_id: comparison.comparison_id,
      revision: comparison.revision,
      requires_user_confirmation: true,
      external_send: false,
    },
    select: {
      kind: "quotation_select",
      comparison_id: comparison.comparison_id,
      revision: comparison.revision,
      requires_user_confirmation: true,
    },
  };
  return {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: comparison.candidates.length > 1 ? "Quotation comparison" : "Quotation review",
    state_id: `quotation:${comparison.comparison_id}:${comparison.revision}`,
    components: [
      {
        id: "quotation-totals",
        type: "stat_row",
        props: {
          label: "Comparable quotations",
          value: `${comparison.candidates.length}`,
          helper: `Scenario ${comparison.scenario_id}`,
        },
      },
      {
        id: "quotation-comparison-table",
        type: "comparison_table",
        props: {
          title: comparison.candidates.length > 1 ? "Source-backed comparison" : "Source-backed quotation",
          columns,
          rows,
          selection: comparison.candidates.length > 1 ? {
            mode: "single",
            id_field: "quotation_id",
            confirm_action: actions.select,
          } : null,
        },
      },
      {
        id: "quotation-constraints",
        type: "constraint_badges",
        props: {
          items: comparison.candidates.flatMap((candidate) => [
            ...candidate.hard_conflict_ids.map((label) => ({ label, status: "not_met", candidate_id: candidate.quotation_id })),
            ...candidate.unknown_hard_requirement_ids.map((label) => ({ label, status: "unknown", candidate_id: candidate.quotation_id })),
          ]),
        },
      },
      {
        id: "quotation-assessment",
        type: "insight_line",
        props: {
          text: comparison.recommendation_reason || "No single winner is supported by the current evidence.",
          evidence_required: true,
        },
      },
      {
        id: "quotation-warning",
        type: "callout",
        props: {
          tone: unknownLabels(comparison).length > 0 ? "warning" : "info",
          title: unknownLabels(comparison).length > 0 ? "Confirm before deciding" : "Review source evidence",
          body: unknownLabels(comparison).slice(0, 3).join(" ") || "Open the cited quotation before selecting.",
        },
      },
      {
        id: "quotation-actions",
        type: "action_chips",
        props: { actions },
      },
    ],
  };
}
