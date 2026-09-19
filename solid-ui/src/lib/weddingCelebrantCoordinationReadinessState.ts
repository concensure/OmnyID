// @locs-version: 2.0
export type WeddingCelebrantCoordinationReadinessInput = {
  australianLegalSetupReady?: boolean | null;
  officialRegisterSourceReady?: boolean | null;
  locationScopeReady?: boolean | null;
  vendorSearchProviderReady?: boolean | null;
  noimGuardrailsReady?: boolean | null;
  noBookingNoLodgementCaveatReady?: boolean | null;
  approvalUiReady?: boolean | null;
  contactExecutorReady?: boolean | null;
  testedCelebrantScenarioCount?: number | null;
  failedCelebrantScenarioCount?: number | null;
};

export type WeddingCelebrantCoordinationReadinessState = {
  status: "verified" | "handoff_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
};

function count(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

export function buildWeddingCelebrantCoordinationReadinessState(
  input: WeddingCelebrantCoordinationReadinessInput = {},
): WeddingCelebrantCoordinationReadinessState {
  const tested = count(input.testedCelebrantScenarioCount);
  const failed = count(input.failedCelebrantScenarioCount);
  const evidenceLabels = [
    input.australianLegalSetupReady ? "Australian legal setup proven" : null,
    input.officialRegisterSourceReady ? "official celebrant register source proven" : null,
    input.locationScopeReady ? "celebrant location scope proven" : null,
    input.vendorSearchProviderReady ? "celebrant search provider proven" : null,
    input.noimGuardrailsReady ? "NOIM guardrails proven" : null,
    input.noBookingNoLodgementCaveatReady ? "no-booking/no-lodgement caveat proven" : null,
    input.approvalUiReady ? "celebrant approval UI proven" : null,
    input.contactExecutorReady ? "celebrant contact executor proven" : null,
    tested > 0 ? `${tested} celebrant coordination scenarios tested` : "No celebrant coordination scenarios tested",
  ].filter((value): value is string => Boolean(value));
  const blockerLabels: string[] = [];

  if (!input.australianLegalSetupReady) blockerLabels.push("Australian legal setup is not proven.");
  if (!input.officialRegisterSourceReady) blockerLabels.push("Official celebrant register source is not proven.");
  if (!input.locationScopeReady) blockerLabels.push("Celebrant location scope is not proven.");
  if (!input.vendorSearchProviderReady) blockerLabels.push("Celebrant search provider evidence is not proven.");
  if (!input.noimGuardrailsReady) blockerLabels.push("NOIM guardrails are not proven.");
  if (!input.noBookingNoLodgementCaveatReady) blockerLabels.push("No-booking/no-lodgement caveat is not proven.");
  if (!input.approvalUiReady) blockerLabels.push("Celebrant contact approval UI is not proven.");
  if (!input.contactExecutorReady) blockerLabels.push("Celebrant contact executor is not proven.");
  if (tested < 2) blockerLabels.push("At least two celebrant coordination scenarios must be tested.");
  if (failed > 0) blockerLabels.push(`${failed} celebrant coordination scenario${failed === 1 ? "" : "s"} failed.`);

  if (blockerLabels.length === 0) {
    return {
      status: "verified",
      productionEvidenceReady: true,
      summary: "Celebrant coordination is verified from official register evidence, location scope, search provider proof, NOIM guardrails, no-booking/no-lodgement caveats, approval UI, contact executor, and scenario tests.",
      evidenceLabels,
      blockerLabels,
    };
  }

  const handoffOnly = Boolean(input.australianLegalSetupReady)
    && Boolean(input.officialRegisterSourceReady)
    && Boolean(input.locationScopeReady)
    && Boolean(input.noimGuardrailsReady)
    && Boolean(input.noBookingNoLodgementCaveatReady)
    && failed === 0;
  return {
    status: handoffOnly ? "handoff_only" : "blocked",
    productionEvidenceReady: false,
    summary: handoffOnly
      ? "Celebrant coordination is safe as an official-source planning handoff, but not verified for live search/contact execution."
      : "Celebrant coordination is not production-ready yet.",
    evidenceLabels,
    blockerLabels,
  };
}
