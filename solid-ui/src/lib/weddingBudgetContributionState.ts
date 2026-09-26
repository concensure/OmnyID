// @locs-version: 1.0
import type { WeddingDecisionProjectionInput } from "@/lib/weddingDecisionAfpProjectionState";
import type { WeddingPersistedDecisionRecord } from "@/lib/weddingPersistedWorkspaceState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";
import type { WeddingBudgetContribution } from "@/lib/weddingBudgetInsightsState";

export const WEDDING_BUDGET_CONTRIBUTION_ARTIFACT_KIND = "budget_sheet";
export const WEDDING_BUDGET_CONTRIBUTION_ARTIFACT_ID_PREFIX = "wedding-budget-contribution";
export const WEDDING_BUDGET_CONTRIBUTION_SELECTED_OPTION_ID = "budget-contribution";

export type WeddingBudgetContributionDraft = {
  personLabel: string;
  amount: number;
  conditionLabel: string;
  currency: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function moneyLabel(amount: number, currency: string): string {
  return amount.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: 0 });
}

function amountFromCell(cell: string): number | null {
  const match = cell.replace(/,/g, "").match(/\b(\d{1,8})\b/);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
}

function cellValue(cells: readonly string[], label: string): string {
  const prefix = `${label}:`;
  const cell = cells.find((entry) => entry.toLowerCase().startsWith(prefix.toLowerCase()));
  return clean(cell?.slice(prefix.length));
}

function contributionArtifactId(metadata: WeddingPlanningMetadata, personLabel: string): string {
  return `${WEDDING_BUDGET_CONTRIBUTION_ARTIFACT_ID_PREFIX}:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(personLabel) || "contributor"}`;
}

export function isWeddingBudgetContributionDecisionRecord(record: Pick<
  WeddingPersistedDecisionRecord,
  "artifactId" | "artifactKind" | "selectedOptionId"
>): boolean {
  return record.artifactKind === WEDDING_BUDGET_CONTRIBUTION_ARTIFACT_KIND
    && record.artifactId.startsWith(`${WEDDING_BUDGET_CONTRIBUTION_ARTIFACT_ID_PREFIX}:`)
    && record.selectedOptionId === WEDDING_BUDGET_CONTRIBUTION_SELECTED_OPTION_ID;
}

export function buildWeddingBudgetContributionProjectionInput(
  draft: WeddingBudgetContributionDraft,
  metadataInput?: unknown,
  createdAt = new Date().toISOString(),
): WeddingDecisionProjectionInput | null {
  const personLabel = clean(draft.personLabel);
  const conditionLabel = clean(draft.conditionLabel) || "No condition added.";
  const amount = Math.max(0, Math.round(draft.amount) || 0);
  if (!personLabel || amount <= 0) return null;
  const metadata = normalizeWeddingPlanningMetadata(metadataInput);
  const currency = clean(draft.currency) || "AUD";
  const artifactId = contributionArtifactId(metadata, personLabel);
  return {
    id: `wedding_decision:${metadata.responseWorkspaceId}:${artifactId}:${amount}:${safeWeddingLabel(conditionLabel)}`,
    metadata,
    artifactId,
    artifactTitle: "Wedding Budget Contribution",
    artifactKind: WEDDING_BUDGET_CONTRIBUTION_ARTIFACT_KIND,
    selectedOption: {
      id: WEDDING_BUDGET_CONTRIBUTION_SELECTED_OPTION_ID,
      rowIndex: 0,
      label: personLabel,
      detail: `${personLabel} may contribute ${moneyLabel(amount, currency)}. Condition: ${conditionLabel}`,
      cells: [
        `Contributor: ${personLabel}`,
        `Amount: ${moneyLabel(amount, currency)}`,
        `Condition: ${conditionLabel}`,
      ],
      selected: true,
      preferenceFitLabels: ["Contribution conditions explicit"],
      missingPreferenceLabels: [],
      tradeoffLabels: [],
      preferenceSummaryLabel: "Budget contribution recorded by the couple.",
    },
    source: "user",
    createdAt,
  };
}

export function weddingBudgetContributionsFromDecisionRecords(
  records: readonly WeddingPersistedDecisionRecord[],
): WeddingBudgetContribution[] {
  return records
    .filter(isWeddingBudgetContributionDecisionRecord)
    .map((record): WeddingBudgetContribution | null => {
      const personLabel = cellValue(record.selectedOptionCells, "Contributor") || clean(record.selectedOptionLabel);
      const amountCell = cellValue(record.selectedOptionCells, "Amount");
      const amount = amountFromCell(amountCell);
      if (!personLabel || amount === null) return null;
      return {
        personLabel,
        amountLabel: amountCell || moneyLabel(amount, "AUD"),
        conditionLabel: cellValue(record.selectedOptionCells, "Condition") || "Confirm conditions before spending.",
      };
    })
    .filter((row): row is WeddingBudgetContribution => Boolean(row));
}
