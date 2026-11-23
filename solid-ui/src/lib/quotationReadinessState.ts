export type QuotationReadinessStatus = "untested" | "blocked" | "failed" | "verified";

export type QuotationReadinessReport = {
  status: QuotationReadinessStatus;
  anchor_coverage_bps?: number | null;
  money_currency_exact_bps?: number | null;
  inclusion_accuracy_bps?: number | null;
  deterministic_bps?: number | null;
  approval_enforcement_bps?: number | null;
  unsupported_confirmed_material_fields: number;
  blocking_reasons: string[];
};

export type QuotationFeatureFlags = {
  extraction: boolean;
  recommendation: boolean;
  clarificationDraft: boolean;
  clarificationSend: boolean;
  closure: boolean;
  vendorContextGrants: boolean;
};

export const disabledQuotationFeatures: QuotationFeatureFlags = {
  extraction: false,
  recommendation: false,
  clarificationDraft: false,
  clarificationSend: false,
  closure: false,
  vendorContextGrants: false,
};

export function effectiveQuotationFeatures(
  requested: QuotationFeatureFlags,
  report: QuotationReadinessReport,
): QuotationFeatureFlags {
  return report.status === "verified" ? { ...requested } : { ...disabledQuotationFeatures };
}

export function readinessPresentation(report: QuotationReadinessReport): {
  label: string;
  tone: "neutral" | "warning" | "danger" | "success";
  canExpandCohort: boolean;
} {
  switch (report.status) {
    case "verified":
      return { label: "Verified against the current release evidence", tone: "success", canExpandCohort: true };
    case "failed":
      return { label: "Release evidence failed one or more thresholds", tone: "danger", canExpandCohort: false };
    case "blocked":
      return { label: "Verification is blocked by an external dependency", tone: "warning", canExpandCohort: false };
    default:
      return { label: "Release evidence has not been completed", tone: "neutral", canExpandCohort: false };
  }
}
