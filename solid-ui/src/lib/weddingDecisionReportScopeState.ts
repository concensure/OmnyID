// @locs-version: 2.0
import type { WeddingDecisionSelectionOption } from "@/lib/weddingDecisionSelectionState";
import type { WeddingVendorFreshnessRow } from "@/lib/weddingVendorFreshnessState";

export type WeddingDecisionReportScopeStatus =
  | "no_selection"
  | "scoped_ready"
  | "scoped_needs_recheck";

export type WeddingDecisionReportScopeState = {
  status: WeddingDecisionReportScopeStatus;
  selectedOptionId: string | null;
  selectedOptionLabel: string | null;
  collapseAlternatives: boolean;
  includeAlternativesAsAudit: boolean;
  reportInstructionLabel: string;
  blockerLabels: string[];
  auditContextLabels: string[];
  nextActionLabels: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function key(value: unknown): string {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function importedPrivateLabel(value: string): boolean {
  return /^wedding_import(?:$|:)/i.test(value)
    || /original upload/i.test(value)
    || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(value)
    || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value)
    || /\b[^,\s]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value);
}

function artifactTitleForReportScope(value: unknown): string {
  const title = clean(value);
  if (!title) return "the source artifact";
  return importedPrivateLabel(title) ? "Imported private planning file" : title;
}

function matchesSelectedOption(row: WeddingVendorFreshnessRow, option: WeddingDecisionSelectionOption): boolean {
  const rowName = key(row.vendorName);
  const optionLabel = key(option.label);
  const optionCells = option.cells.map(key);
  return Boolean(rowName && (rowName === optionLabel || optionCells.includes(rowName)));
}

export function buildWeddingDecisionReportScopeState(input: {
  selectedOption?: WeddingDecisionSelectionOption | null;
  artifactTitle?: string | null;
  freshnessRows?: readonly WeddingVendorFreshnessRow[] | null;
} = {}): WeddingDecisionReportScopeState {
  const selected = input.selectedOption ?? null;
  if (!selected) {
    return {
      status: "no_selection",
      selectedOptionId: null,
      selectedOptionLabel: null,
      collapseAlternatives: false,
      includeAlternativesAsAudit: true,
      reportInstructionLabel: "No option is selected; follow-up reports should compare the shortlist instead of narrowing scope.",
      blockerLabels: ["Select an option before asking for a narrowed report."],
      auditContextLabels: [],
      nextActionLabels: ["Ask the user to tick one option or explicitly request another comparison."],
    };
  }

  const freshnessRow = (input.freshnessRows ?? []).find((row) => matchesSelectedOption(row, selected)) ?? null;
  const freshnessBlockers = freshnessRow
    ? [
      freshnessRow.sourceFreshness === "current" ? null : "Selected option source needs a live refresh.",
      freshnessRow.priceFreshness === "verified" ? null : "Selected option price/package evidence needs recheck.",
      freshnessRow.availabilityFreshness === "verified" ? null : "Selected option date-specific availability needs recheck.",
    ].filter((label): label is string => Boolean(label))
    : [];
  const preferenceBlockers = [
    ...selected.tradeoffLabels.map((label) => `Preference tradeoff: ${label}`),
    ...selected.missingPreferenceLabels.map((label) => `Preference not evidenced: ${label}`),
  ];
  const blockerLabels = [...freshnessBlockers, ...preferenceBlockers];
  const status: WeddingDecisionReportScopeStatus = blockerLabels.length > 0 ? "scoped_needs_recheck" : "scoped_ready";
  const artifactTitle = artifactTitleForReportScope(input.artifactTitle);

  return {
    status,
    selectedOptionId: selected.id,
    selectedOptionLabel: selected.label,
    collapseAlternatives: true,
    includeAlternativesAsAudit: true,
    reportInstructionLabel: status === "scoped_ready"
      ? `Use ${selected.label} as the primary scope for follow-up reports from ${artifactTitle}; keep unticked options only as audit context.`
      : `Use ${selected.label} as the tentative scope, but resolve freshness or preference blockers before recommendation-quality reports collapse alternatives.`,
    blockerLabels,
    auditContextLabels: [
      `Source artifact: ${artifactTitle}`,
      `Selected row: ${selected.rowIndex + 1}`,
      selected.preferenceSummaryLabel,
      freshnessRow ? `Freshness: source ${freshnessRow.sourceFreshness}, price ${freshnessRow.priceFreshness}, availability ${freshnessRow.availabilityFreshness}` : "Freshness: not linked to vendor freshness evidence",
    ],
    nextActionLabels: status === "scoped_ready"
      ? ["Generate follow-up reports from the selected option first.", "Keep alternatives available for audit or compare-again requests."]
      : [
        ...freshnessBlockers.length ? ["Refresh source, price, and availability evidence before confident recommendations."] : [],
        ...preferenceBlockers.length ? ["Ask the user whether preference tradeoffs or missing fit evidence are acceptable."] : [],
      ],
  };
}
