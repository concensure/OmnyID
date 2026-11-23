export type QuotationEvidenceState = "confirmed" | "inferred" | "unknown" | "conflicting" | "excluded";

export type QuotationEvidenceView = {
  state: QuotationEvidenceState;
  sourceId?: string | null;
  sourceVersionId?: string | null;
  locator?: string | null;
  exactExcerpt?: string | null;
  formulaTrace?: string[];
};

const labels: Record<QuotationEvidenceState, string> = {
  confirmed: "Confirmed from source",
  inferred: "Suggested — review needed",
  unknown: "Not stated",
  conflicting: "Conflicting source details",
  excluded: "Not applicable",
};

const icons: Record<QuotationEvidenceState, string> = {
  confirmed: "✓",
  inferred: "?",
  unknown: "—",
  conflicting: "!",
  excluded: "×",
};

export function evidencePresentation(evidence: QuotationEvidenceView): { label: string; icon: string; canOpenSource: boolean } {
  return {
    label: labels[evidence.state],
    icon: icons[evidence.state],
    canOpenSource: Boolean(evidence.sourceId?.trim() && evidence.sourceVersionId?.trim() && evidence.exactExcerpt?.trim()),
  };
}

export function sourceLocatorLabel(evidence: QuotationEvidenceView): string {
  if (!evidence.locator?.trim()) return "Source excerpt";
  if (evidence.locator.startsWith("page:")) return `Page ${evidence.locator.slice(5)}`;
  if (evidence.locator.startsWith("section:")) return evidence.locator.slice(8);
  return "Source excerpt";
}
