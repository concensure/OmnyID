// @locs-version: 2.0
import {
  buildWeddingArtifactGenerationState,
  type WeddingArtifactGenerationState,
  type WeddingGeneratedArtifact,
  type WeddingBudgetRow,
} from "@/lib/weddingArtifactGenerationState";
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
import {
  type WeddingPlanningContext,
  buildWeddingNeedToKnowProbingState,
} from "@/lib/weddingNeedToKnowProbingState";
import type { WeddingNeedToKnowProjectionContext } from "@/lib/weddingNeedToKnowAfpProjectionState";
import {
  buildWeddingAustralianLegalSetupState,
  type WeddingAustralianLegalSetupState,
} from "@/lib/weddingAustralianLegalSetupState";
import {
  buildWeddingPresentationState,
  type WeddingPresentationState,
} from "@/lib/weddingPresentationState";
import {
  buildWeddingResponseWorkspaceViewState,
  type WeddingResponseWorkspaceViewState,
} from "@/lib/weddingResponseWorkspaceViewState";
import { weddingVendorSearchTerms, weddingVendorSelectionLabels } from "@/lib/weddingVendorChecklistState";
import {
  buildWeddingVendorSearchReadinessState,
  type WeddingVendorSearchReadinessState,
} from "@/lib/weddingVendorSearchReadinessState";
import { buildWeddingVendorSearchProviderPlanState } from "@/lib/weddingVendorSearchProviderPlanState";
import {
  buildWeddingRichResponseRendererState,
  type WeddingRichResponseRendererState,
} from "@/lib/weddingRichResponseRendererState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";
import { buildWeddingVowPlanningState } from "@/lib/weddingVowPlanningState";
import { buildWeddingLifecycleManagementState } from "@/lib/weddingLifecycleManagementState";
import { buildWeddingLegalAdministrationState } from "@/lib/weddingLegalAdministrationState";
import { buildWeddingFinalPhaseCoordinationState } from "@/lib/weddingFinalPhaseCoordinationState";
import type { WeddingPlanningScheduleItem, WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";

export type WeddingTemplateFollowUpState = {
  metadata: WeddingPlanningMetadata;
  planningContext: WeddingPlanningContext;
  answeredLabels: string[];
  contextProjection: WeddingNeedToKnowProjectionContext;
  artifactGeneration: WeddingArtifactGenerationState;
  artifacts: WeddingArtifactInput[];
  generatedArtifacts: WeddingGeneratedArtifact[];
  scheduleItems: WeddingPlanningScheduleItem[];
  taskItems: WeddingPlanningTaskItem[];
  vendorSearchReadiness: WeddingVendorSearchReadinessState;
  legalSetup: WeddingAustralianLegalSetupState | null;
  presentation: WeddingPresentationState;
  richResponse: WeddingRichResponseRendererState;
  workspaceView: WeddingResponseWorkspaceViewState;
  nextQuestionLabel: string;
  readyForFirstRecommendations: boolean;
};

export type WeddingTemplateFollowUpInput = WeddingPlanningContext & {
  weddingPlanId?: string | null;
  responseWorkspaceId?: string | null;
  sourceResponseId?: string | null;
  weddingDateIso?: string | null;
  projectionStorage?: Storage | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 16): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function hasAnswer(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(hasAnswer);
  return clean(value).length > 0;
}

function boolLabel(value: WeddingPlanningContext["noimDownloaded"]): string | null {
  if (value === true || clean(value).toLowerCase() === "yes") return "NOIM downloaded";
  if (value === false || clean(value).toLowerCase() === "no") return "NOIM not downloaded";
  if (clean(value).toLowerCase() === "unknown") return "NOIM status unknown";
  return null;
}

function answeredLabels(context: WeddingPlanningContext): string[] {
  return uniqueStrings([
    hasAnswer(context.dateOrSeason) ? `Date/season: ${context.dateOrSeason}` : null,
    hasAnswer(context.location) ? `Location: ${context.location}` : null,
    hasAnswer(context.guestCount) ? `Guest count: ${context.guestCount}` : null,
    hasAnswer(context.budgetComfort) ? `Budget comfort: ${context.budgetComfort}` : null,
    hasAnswer(context.familyOrStakeholderRoles) ? `Couple: ${context.familyOrStakeholderRoles}` : null,
    hasAnswer(context.atmosphereDescription) ? `Atmosphere: ${context.atmosphereDescription}` : null,
    context.inspirationImageUrls?.length ? `Inspiration links: ${context.inspirationImageUrls.length}` : null,
    ...(context.topPriorities ?? []).map((priority) => `Priority: ${priority}`),
    ...weddingVendorSelectionLabels(context.vendorCategories).map((vendor) => `Vendor needed: ${vendor}`),
    hasAnswer(context.vowPreference) && clean(context.vowPreference).toLowerCase() !== "undecided"
      ? `Vow choice: ${context.vowPreference}`
      : null,
    hasAnswer(context.vowStyle) ? `Vow style: ${context.vowStyle}` : null,
    boolLabel(context.noimDownloaded),
    hasAnswer(context.celebrantPath) ? `Celebrant path: ${context.celebrantPath}` : null,
  ]);
}

function normalizeContext(input: WeddingTemplateFollowUpInput): WeddingPlanningContext {
  return {
    dateOrSeason: clean(input.dateOrSeason) || null,
    location: clean(input.location) || null,
    guestCount: typeof input.guestCount === "number" ? input.guestCount : clean(input.guestCount) || null,
    budgetComfort: clean(input.budgetComfort) || null,
    topPriorities: uniqueStrings(input.topPriorities ?? [], 6),
    atmosphereDescription: clean(input.atmosphereDescription) || null,
    inspirationImageUrls: uniqueStrings(input.inspirationImageUrls ?? [], 10),
    vendorCategories: weddingVendorSelectionLabels(input.vendorCategories),
    vendorPreferences: clean(input.vendorPreferences) || null,
    photographyScope: clean(input.photographyScope) || null,
    vowPreference: clean(input.vowPreference) || "undecided",
    vowStyle: clean(input.vowStyle) || null,
    relationshipFactLabels: uniqueStrings(input.relationshipFactLabels ?? [], 12),
    vowChecklistItems: uniqueStrings(input.vowChecklistItems ?? [], 12),
    countryCode: clean(input.countryCode) || null,
    legalJurisdiction: clean(input.legalJurisdiction) || null,
    noimDownloaded: input.noimDownloaded ?? null,
    celebrantPath: clean(input.celebrantPath) || null,
    culturalOrReligiousRequirements: clean(input.culturalOrReligiousRequirements) || null,
    accessibilityRequirements: clean(input.accessibilityRequirements) || null,
    dietaryRequirements: clean(input.dietaryRequirements) || null,
    familyOrStakeholderRoles: clean(input.familyOrStakeholderRoles) || null,
    decisionContext: input.decisionContext ?? "first_plan",
  };
}

function isAustralianContext(context: WeddingPlanningContext): boolean {
  const country = clean(context.countryCode).toUpperCase();
  const jurisdiction = clean(context.legalJurisdiction).toLowerCase();
  const location = clean(context.location).toLowerCase();
  return country === "AU"
    || jurisdiction.includes("australia")
    || location.includes("australia")
    || /\b(nsw|vic|qld|wa|sa|tas|act|nt)\b/i.test(location);
}

function vendorSearchReadinessFor(context: WeddingPlanningContext): WeddingVendorSearchReadinessState {
  return buildWeddingVendorSearchReadinessState({
    location: context.location,
    vendorCategories: context.vendorCategories,
    vendorPreferences: context.vendorPreferences,
    photographyScope: context.photographyScope,
    musicOrBandNeeded: (context.vendorCategories ?? []).some((vendor) => /band|dj|music|entertain/i.test(vendor)) ? "yes" : "unknown",
    liveSearchProviderReady: false,
  });
}

function researchNotes(context: WeddingPlanningContext, labels: readonly string[]): string[] {
  const vendorSearch = vendorSearchReadinessFor(context);
  const providerPlan = buildWeddingVendorSearchProviderPlanState({
    readiness: vendorSearch,
    maxCategories: 4,
  });
  return [
    "This follow-up brief was generated from answered Need-To-Know prompts.",
    isAustralianContext(context)
      ? "Australian legal planning should ask about NOIM and authorised celebrant path before creating legal reminders."
      : null,
    ...labels,
    vendorSearch.searchBrief.length > 0 ? `Vendor search brief: ${vendorSearch.searchBrief.join("; ")}.` : null,
    weddingVendorSearchTerms(context.vendorCategories).length > 0
      ? `Suggested vendor search terms: ${weddingVendorSearchTerms(context.vendorCategories).join(", ")}.`
      : null,
    vendorSearch.searchQueries.length > 0 ? `Focused vendor search queries: ${vendorSearch.searchQueries.slice(0, 8).join(" | ")}.` : null,
    providerPlan.status === "ready"
      ? `Provider-specific vendor search plan: ${providerPlan.providerPlans.map((plan) => `${plan.label} (${plan.queries.length} queries)`).join("; ")}.`
      : null,
    vendorSearch.missing.length > 0 ? `Vendor search still needs: ${vendorSearch.missing.join(", ")}.` : null,
    context.dateOrSeason ? "Use the date or target season to drive timeline and legal reminder planning." : null,
    context.location ? "Use the location to scope maps, guest logistics, and later verified vendor research." : null,
    context.guestCount ? "Use guest count as a hard capacity and catering constraint before ranking venues." : null,
    context.topPriorities?.length ? "Use top priorities to explain tradeoffs instead of optimizing for a generic wedding." : null,
    context.atmosphereDescription ? "Use the described atmosphere to tune vendor ranking, decor assumptions, tone, and tradeoff warnings." : null,
    context.inspirationImageUrls?.length
      ? `User-provided inspiration links for style inference: ${context.inspirationImageUrls.join(" | ")}. Treat as unverified references until fetched by an approved agent.`
      : null,
    context.vowPreference
      ? "Raise vow preparation early: the couple should choose between a standard vow and personal vows before ceremony scripting."
      : null,
    context.relationshipFactLabels?.length
      ? `Known relationship facts available for vow inspiration: ${context.relationshipFactLabels.join("; ")}.`
      : "Do not invent bride/groom relationship history for vows; use only saved memory, Knowledge Graph/topography facts, or explicit user-provided facts.",
    "Lifecycle management should cover 18+ months out through post-wedding follow-up using DecisionOS, Tasks, Calendar, approval receipts, and source-verified artifacts rather than isolated checklist prose.",
    "Controlled outreach rule: vendor contact and contact-info sharing require explicit user approval; draft at most one 3-5 day follow-up and escalate after 7 days without response.",
    "Guest operations rule: RSVP links, seating charts, dietary/accessibility counts, and caterer briefs must use verified guest context and remain approval-gated before external sharing.",
    "Final-phase rule: run-sheet changes, vendor delay updates, guest notifications, and weather backup execution require provider evidence plus explicit approval before action.",
  ].filter((value): value is string => Boolean(clean(value)));
}

function verificationActions(context: WeddingPlanningContext): string[] {
  const vendorSearch = vendorSearchReadinessFor(context);
  return [
    "Verify live venue/vendor availability, inclusions, and pricing before recommending or contacting anyone.",
    ...vendorSearch.guardrails,
    context.dateOrSeason ? "Convert the date or season into dated reminders only after the user confirms an exact date." : null,
    context.location ? "Use source-backed location research before adding map pins or travel advice." : null,
    context.budgetComfort ? "Ask for explicit budget numbers before creating amount-based totals." : null,
    "Vow inspiration is not final ceremony wording; the couple and celebrant/officiant should review tone, length, legal/cultural requirements, and privacy.",
    isAustralianContext(context)
      ? "Use official Australian Government marriage sources for NOIM timing, celebrant registration, and ceremony requirements."
      : null,
  ].filter((value): value is string => Boolean(clean(value)));
}

function vendorSearchTaskItems(
  metadata: WeddingPlanningMetadata,
  vendorSearch: WeddingVendorSearchReadinessState,
): WeddingPlanningTaskItem[] {
  if (vendorSearch.status === "ready") return [];
  if (vendorSearch.missing.length === 0 && vendorSearch.searchBrief.length === 0) return [];
  return [{
    id: `wedding_task:vendor-search-readiness:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    title: vendorSearch.status === "blocked"
      ? "Complete vendor-search intake before researching vendors"
      : "Connect live vendor-search provider before presenting vendor matches",
    kind: "research",
    dueLabel: "Before vendor shortlist decisions",
    priority: "high",
    source: "agent",
    reviewStatus: "needs_review",
    approvalState: "draft",
    metadata: {
      ...metadata,
      vendor_search_readiness_status: vendorSearch.status,
      vendor_search_missing: vendorSearch.missing,
      vendor_search_queries: vendorSearch.searchQueries.slice(0, 12),
      second_order_loop: "contact_follow_up",
    },
    notes: [
      vendorSearch.label,
      vendorSearch.missing.length > 0 ? `Needs: ${vendorSearch.missing.join(", ")}.` : null,
      vendorSearch.searchBrief.length > 0 ? `Brief: ${vendorSearch.searchBrief.join("; ")}.` : null,
      "Do not claim live pricing, reviews, availability, or booking status until provider/source evidence is saved.",
    ].filter((value): value is string => Boolean(value)).join(" "),
  }];
}

function budgetRows(context: WeddingPlanningContext): WeddingBudgetRow[] {
  if (!context.budgetComfort) return [];
  const estimate = `User comfort: ${context.budgetComfort}`;
  return [
    { category: "Venue", estimate, warning: "Confirm minimum spend, deposits, overtime, wet-weather backup, and cancellation terms." },
    { category: "Catering and drinks", estimate, warning: "Confirm per-head inclusions, dietary needs, staffing, bar limits, and service fees." },
    { category: "Photography and video", estimate, warning: "Confirm hours, second shooter, travel, edits, delivery timing, and usage rights." },
    { category: "Contingency", estimate, warning: "Keep buffer separate from confirmed vendor costs." },
  ];
}

function exactIsoDate(value: unknown): string | null {
  const label = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(label) ? label : null;
}

export function buildWeddingTemplateFollowUpState(input: WeddingTemplateFollowUpInput): WeddingTemplateFollowUpState {
  const planningContext = normalizeContext(input);
  const labels = answeredLabels(planningContext);
  const metadata = normalizeWeddingPlanningMetadata({
    weddingPlanId: input.weddingPlanId,
    responseWorkspaceId: input.responseWorkspaceId,
    sourceResponseId: input.sourceResponseId,
    supertags: [
      "template_follow_up:wedding_planning",
      ...labels.map((label) => `answered:${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`),
    ],
  });
  const vendorSearchReadiness = vendorSearchReadinessFor(planningContext);
  const artifactGeneration = buildWeddingArtifactGenerationState({
    metadata,
    title: "Wedding planning follow-up brief",
    researchNotes: labels.length > 0
      ? researchNotes(planningContext, labels)
      : ["No answered Need-To-Know prompts have been captured yet."],
    assumptions: [
      "This is a private planning file generated from user-provided context, not a vendor quote or booking.",
      "External sharing, email sending, registry publishing, and legal lodgement remain approval-gated.",
    ],
    verificationActions: verificationActions(planningContext),
    budgetRows: budgetRows(planningContext),
    sourceLabels: ["Wedding Planning Need-To-Know answers"],
    locationLabels: planningContext.location ? [planningContext.location] : [],
    vendorLabels: weddingVendorSelectionLabels(planningContext.vendorCategories),
  });
  const legalSetup = isAustralianContext(planningContext)
    ? buildWeddingAustralianLegalSetupState({
      metadata,
      weddingDateIso: clean(input.weddingDateIso) || exactIsoDate(planningContext.dateOrSeason),
      dateLabel: planningContext.dateOrSeason,
      location: planningContext.location,
      noimDownloaded: planningContext.noimDownloaded,
      celebrantPath: planningContext.celebrantPath,
      sourceLabels: ["Wedding Planning Need-To-Know answers"],
    })
    : null;
  const vowPlanning = buildWeddingVowPlanningState({
    metadata,
    preference: planningContext.vowPreference,
    styleId: planningContext.vowStyle,
    relationshipFactLabels: planningContext.relationshipFactLabels,
    customChecklistItems: planningContext.vowChecklistItems,
  });
  const lifecycleManagement = buildWeddingLifecycleManagementState({
    metadata,
    planningContext,
  });
  const legalAdministration = buildWeddingLegalAdministrationState({
    metadata,
    planningContext,
  });
  const finalPhase = buildWeddingFinalPhaseCoordinationState({
    metadata,
    planningContext,
    weatherProviderReady: false,
  });
  const artifacts = [
    ...artifactGeneration.artifactInputs,
    lifecycleManagement.onePageBriefArtifact.input,
    legalAdministration.artifact.input,
    finalPhase.artifact.input,
    vowPlanning.artifact.input,
    ...(legalSetup ? [legalSetup.artifactInput] : []),
  ];
  const generatedArtifacts = [
    ...artifactGeneration.artifacts,
    lifecycleManagement.onePageBriefArtifact,
    legalAdministration.artifact,
    finalPhase.artifact,
    vowPlanning.artifact,
    ...(legalSetup ? [legalSetup.artifact] : []),
  ];
  const probing = buildWeddingNeedToKnowProbingState(planningContext);
  const contextProjection: WeddingNeedToKnowProjectionContext = {
    metadata,
    planningContext,
    answeredLabels: labels,
    nextQuestionLabel: probing.nextQuestion?.question ?? "Ready to generate the first recommendation set.",
    readyForFirstRecommendations: probing.isReadyForFirstRecommendations,
  };
  const presentation = buildWeddingPresentationState({
    title: "Wedding planning follow-up",
    metadata,
    planningContext,
    artifacts,
  });
  const scheduleItems = [
    ...legalAdministration.scheduleItems,
    ...finalPhase.scheduleItems,
    ...(legalSetup?.scheduleItems ?? []),
  ];
  const taskItems = [
    ...vendorSearchTaskItems(metadata, vendorSearchReadiness),
    ...lifecycleManagement.taskItems,
    ...legalAdministration.taskItems,
    ...finalPhase.taskItems,
    ...vowPlanning.taskItems,
    ...(legalSetup?.taskItems ?? []),
  ];
  const workspaceView = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts,
    contextItems: [contextProjection],
    generatedArtifacts,
    scheduleItems,
    taskItems,
    projectionStorage: input.projectionStorage ?? null,
  });
  const richResponse = buildWeddingRichResponseRendererState(presentation);

  return {
    metadata,
    planningContext,
    answeredLabels: labels,
    contextProjection,
    artifactGeneration,
    artifacts,
    generatedArtifacts,
    scheduleItems,
    taskItems,
    vendorSearchReadiness,
    legalSetup,
    presentation,
    richResponse,
    workspaceView,
    nextQuestionLabel: probing.nextQuestion?.question ?? "Ready to generate the first recommendation set.",
    readyForFirstRecommendations: probing.isReadyForFirstRecommendations,
  };
}
