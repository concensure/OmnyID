// @locs-version: 1.0
import { cleanWeddingProductionLabels } from "@/lib/weddingProductionLabelState";

export type WeddingLiveWorkflowKind = "vendor_search" | "live_evidence";

export type WeddingLiveWorkflowReadinessState = {
  status: "blocked" | "ready";
  missing: string[];
  label: string;
  guardrails: string[];
};

export type WeddingLiveWorkflowReadinessInput = {
  workflow: WeddingLiveWorkflowKind;
  dateOrSeason?: string | null;
  location?: string | null;
  guestCount?: string | number | null;
  budgetComfort?: string | null;
  prioritiesCsv?: string | null;
  vendorCategories?: readonly string[] | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasText(value: unknown): boolean {
  return clean(value).length > 0;
}

function hasCategory(values: readonly string[] | null | undefined): boolean {
  return Array.isArray(values) && values.some(hasText);
}

export function buildWeddingLiveWorkflowReadinessState(
  input: WeddingLiveWorkflowReadinessInput,
): WeddingLiveWorkflowReadinessState {
  const vendorSearchMissing = input.workflow === "vendor_search"
    ? [
      hasText(input.dateOrSeason) ? null : "date or season",
      hasText(input.location) ? null : "wedding location or service area",
      hasText(input.guestCount) ? null : "estimated guest count",
      hasText(input.budgetComfort) ? null : "budget comfort",
      hasText(input.prioritiesCsv) ? null : "priorities or vendor fit preferences",
      hasCategory(input.vendorCategories) ? null : "vendor categories needed",
    ]
    : [
      hasText(input.location) ? null : "wedding location or service area",
    ];
  const missing = cleanWeddingProductionLabels(vendorSearchMissing.filter((item): item is string => item !== null));
  return {
    status: missing.length > 0 ? "blocked" : "ready",
    missing,
    label: missing.length > 0
      ? input.workflow === "vendor_search"
        ? "Live vendor search needs intake basics"
        : "Live evidence needs a location"
      : input.workflow === "vendor_search"
        ? "Ready for live vendor search"
        : "Ready for live map and weather evidence",
    guardrails: input.workflow === "vendor_search"
      ? [
        "Do not run live vendor discovery from seeded defaults when the couple has not provided planning basics.",
        "Use budget, guest count, date/season, priorities, and selected categories to shape vendor fit and outreach context.",
      ]
      : [
        "Do not claim wedding-day weather certainty from a short-range forecast.",
        "Use map/weather evidence as planning context until the venue or vendor confirms logistics.",
      ],
  };
}
