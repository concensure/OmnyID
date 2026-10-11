// @locs-version: 2.0
import { normalizeWeddingArtifactSummary } from "@/lib/weddingArtifactState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import type { WeddingPlanningContext } from "@/lib/weddingNeedToKnowProbingState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";
import type { WeddingGeneratedArtifact } from "@/lib/weddingArtifactGenerationState";
import { WEDDING_VENDOR_LEAD_TIME_CATEGORIES } from "@/lib/weddingVendorLeadTimeState";

export type WeddingLifecycleCoverageStatus = "in_place" | "partial" | "missing";

export type WeddingLifecycleCoverageItem = {
  id: string;
  label: string;
  status: WeddingLifecycleCoverageStatus;
  detail: string;
};

export type WeddingLifecycleConstraint = {
  id: string;
  label: string;
  detail: string;
  evidenceLabel: string;
  severity: "info" | "warning" | "urgent";
};

export type WeddingLifecycleManagementState = {
  constraints: WeddingLifecycleConstraint[];
  coverage: WeddingLifecycleCoverageItem[];
  onePageBriefArtifact: WeddingGeneratedArtifact;
  taskItems: WeddingPlanningTaskItem[];
  decisionSurfaceLabels: string[];
  outreachPolicyLabels: string[];
  guestOpsLabels: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 12): string[] {
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

function isAustralianContext(context: WeddingPlanningContext): boolean {
  const country = clean(context.countryCode).toUpperCase();
  const jurisdiction = clean(context.legalJurisdiction).toLowerCase();
  const location = clean(context.location).toLowerCase();
  return country === "AU"
    || jurisdiction.includes("australia")
    || location.includes("australia")
    || /\b(nsw|vic|qld|wa|sa|tas|act|nt)\b/i.test(location);
}

function exactDate(value: unknown): Date | null {
  const label = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return null;
  const parsed = new Date(`${label}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function titleFromContext(context: WeddingPlanningContext): string {
  return clean(context.location)
    ? `Wedding lifecycle brief - ${clean(context.location)}`
    : "Wedding lifecycle brief";
}

function leadTimeRangeLabel(categoryId: string, fallback: string): string {
  const category = WEDDING_VENDOR_LEAD_TIME_CATEGORIES.find((item) => item.categoryId === categoryId);
  return category ? `${category.idealLeadMonths[0]}-${category.idealLeadMonths[1]} months` : fallback;
}

function constraintsFor(context: WeddingPlanningContext): WeddingLifecycleConstraint[] {
  const constraints: WeddingLifecycleConstraint[] = [];
  const location = clean(context.location);
  const date = exactDate(context.dateOrSeason);
  const dateLabel = clean(context.dateOrSeason);
  const priorities = uniqueStrings(context.topPriorities ?? [], 6);

  constraints.push({
    id: "venue_lead_time",
    label: "Venue lead-time pressure",
    detail: /sydney|nsw/i.test(location)
      ? `Planning heuristic: Sydney venues can require ${leadTimeRangeLabel("venue", "12-18 months")} of lead time for preferred dates. Start venue outreach within 2 weeks unless the couple has already selected or booked a venue.`
      : "Planning heuristic: popular venues often need early outreach. Treat venue research as time-sensitive until a selected venue, quote, or booking artifact exists.",
    evidenceLabel: location ? `Location context: ${location}` : "Location not captured yet",
    severity: "warning",
  });

  if (isAustralianContext(context)) {
    constraints.push({
      id: "au_noim_window",
      label: "Australian NOIM timing",
      detail: date
        ? `Official rule to verify before acting: give the NOIM to an authorised celebrant at least 1 month and no more than 18 months before the ceremony. For ${isoDate(date)}, the practical lodgement window is ${isoDate(addMonths(date, -18))} to ${isoDate(addMonths(date, -1))}.`
        : `Official rule to verify before acting: give the NOIM to an authorised celebrant at least 1 month and no more than 18 months before the ceremony. Capture an exact date to calculate the window from ${dateLabel || "the target season"}.`,
      evidenceLabel: "Attorney-General's Department: get married",
      severity: date ? "warning" : "info",
    });
  }

  constraints.push({
    id: "contract_hidden_fees",
    label: "Contract and hidden-fee review",
    detail: "Before booking, parse venue/vendor contracts for cancellation policy, non-refundable deposit, service fee, overtime, minimum spend, travel fee, corkage, GST/tax, and exclusion clauses.",
    evidenceLabel: "Needs uploaded contract or vendor terms before clause extraction",
    severity: "warning",
  });

  constraints.push({
    id: "guest_ops",
    label: "Guest logistics dependency",
    detail: "RSVPs, meal choices, dietary restrictions, accessibility needs, and sensitive seating constraints should become structured AFP context before vendor briefs or seating charts are treated as final.",
    evidenceLabel: priorities.length ? `Priority context: ${priorities.join(", ")}` : "Priorities not captured yet",
    severity: "info",
  });

  return constraints;
}

function coverageFor(context: WeddingPlanningContext): WeddingLifecycleCoverageItem[] {
  const hasCore = Boolean(clean(context.dateOrSeason) && clean(context.location) && clean(context.guestCount));
  const hasPriorities = (context.topPriorities ?? []).some((priority) => clean(priority));
  const hasVendors = (context.vendorCategories ?? []).some((vendor) => clean(vendor));
  return [
    {
      id: "decisionos_surfaces",
      label: "Clear DecisionOS surfaces",
      status: "in_place",
      detail: "Wedding decisions, selected shortlist scope, and action items already route through existing DecisionOS/PersonalOS projection helpers.",
    },
    {
      id: "automated_follow_up",
      label: "Automated reach-outs and follow-ups",
      status: "partial",
      detail: "Approval gates, provider readiness, and follow-up task loops exist. Real email/vendor execution remains blocked until connected executors and explicit approval are present.",
    },
    {
      id: "real_world_constraints",
      label: "Real-world constraint injection",
      status: hasCore ? "partial" : "missing",
      detail: hasCore
        ? "Date, location, and guest count can drive lead-time, legal, contract, RSVP, and seating tasks, but live venue/vendor facts still require provider/source verification."
        : "Capture date/season, location, and guest count before constraint timing can be specific.",
    },
    {
      id: "one_page_brief",
      label: "One-page wedding brief",
      status: hasCore || hasPriorities ? "partial" : "missing",
      detail: "A one-page artifact is generated now; drag-and-drop priority editing remains a future canvas interaction on top of the same artifact/context model.",
    },
    {
      id: "vendor_matching",
      label: "Vendor matching",
      status: hasVendors ? "partial" : "missing",
      detail: hasVendors
        ? "Selected vendor categories can produce bounded search briefs and future Brave/provider queries, but verified 3-5 live options require a connected search/source-verification provider."
        : "Ask the user which vendor categories to research before producing a shortlist.",
    },
    {
      id: "guest_rsvp_seating",
      label: "RSVP, meals, accessibility, and seating",
      status: "partial",
      detail: "Projection-ready tasks are generated. Secure RSVP links and drag seating-chart UI are not yet live provider features.",
    },
  ];
}

function markdownFor(
  title: string,
  context: WeddingPlanningContext,
  constraints: readonly WeddingLifecycleConstraint[],
  coverage: readonly WeddingLifecycleCoverageItem[],
): string {
  const priorities = uniqueStrings(context.topPriorities ?? [], 6);
  const vendors = uniqueStrings(context.vendorCategories ?? [], 12);
  return [
    `# ${title}`,
    "",
    "One-page wedding lifecycle brief. This is a private planning surface; external sends, vendor contact, calendar writes, bookings, and guest links remain approval-gated.",
    "",
    "## Priority canvas",
    "",
    ...(priorities.length
      ? priorities.map((priority, index) => `- Priority ${index + 1}: ${priority}`)
      : ["- No priorities captured yet. Use the launch panel to add draggable priority cards later."]),
    "",
    "## Known planning facts",
    "",
    `- Date or season: ${clean(context.dateOrSeason) || "Unknown"}`,
    `- Location: ${clean(context.location) || "Unknown"}`,
    `- Guest count: ${clean(context.guestCount) || "Unknown"}`,
    `- Vendor categories: ${vendors.length ? vendors.join(", ") : "Not selected"}`,
    "",
    "## Real-world constraints",
    "",
    ...constraints.map((constraint) => `- ${constraint.label}: ${constraint.detail}`),
    "",
    "## Lifecycle coverage",
    "",
    ...coverage.map((item) => `- ${item.label}: ${item.status.replace(/_/g, " ")} - ${item.detail}`),
    "",
    "## No-spam outreach policy",
    "",
    "- Do not contact vendors or share user contact details without explicit user approval.",
    "- One follow-up after 5 days may be drafted only after an approved initial outreach exists.",
    "- Escalate to the user after 7 days without a response with options to send a final attempt, move on, or call.",
    "- Mark the vendor unresponsive after 10 days without a reply and suggest alternatives instead of continuing to chase.",
    "- If vendor NDA/data-sharing terms are required, mark outreach blocked until accepted or user overrides.",
    "",
    "## Guest operations",
    "",
    "- RSVP collection should use secure OmnyID-controlled links when implemented, not third-party tracking by default.",
    "- Seating suggestions must respect household, VIP, accessibility, and sensitive relationship constraints only when known.",
    "- Caterer/vendor briefs should summarize counts and deadlines, not expose unrelated private context.",
  ].join("\n");
}

function taskItems(
  metadata: WeddingPlanningMetadata,
  context: WeddingPlanningContext,
  constraints: readonly WeddingLifecycleConstraint[],
): WeddingPlanningTaskItem[] {
  const selectedVenueLabel = clean(context.location) || "selected venue";
  const baseMetadata = {
    ...metadata,
    lifecycle_management: true,
    lifecycle_constraints: constraints.map((constraint) => constraint.id),
  };
  return [
    {
      id: `wedding_task:lifecycle:venue-outreach:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
      title: "Start venue outreach or confirm selected venue status",
      kind: "vendor_follow_up",
      dueLabel: "Within 2 weeks if venue is not selected",
      priority: "high",
      source: "agent",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: { ...baseMetadata, decision_surface: "venue_selection", second_order_loop: "contact_follow_up" },
      notes: "Use DecisionOS to compare venue options side-by-side.",
    },
    {
      id: `wedding_task:lifecycle:contract-review:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
      title: `Review contract, deposit, cancellation, and hidden fees for ${selectedVenueLabel}`,
      kind: "contract_review",
      dueLabel: "Before signing or paying",
      priority: "high",
      source: "agent",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: { ...baseMetadata, decision_surface: "contract_review", second_order_loop: "commitment_timing" },
      notes: "Parse contract or terms for cancellation policy, non-refundable deposit, service fee, overtime, minimum spend, travel fee, corkage, GST/tax, and exclusions. Not legal advice.",
    },
    {
      id: `wedding_task:lifecycle:rsvp:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
      title: "Prepare secure RSVP, meal, dietary, and accessibility collection",
      kind: "rsvp",
      dueLabel: "Before invitation send",
      priority: "normal",
      source: "agent",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: { ...baseMetadata, decision_surface: "guest_operations", second_order_loop: "guest_logistics" },
      notes: "Future secure RSVP link should collect attendance, meals, dietary restrictions, and accessibility needs without third-party tracking by default.",
    },
    {
      id: `wedding_task:lifecycle:seating:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
      title: "Draft seating chart from household, VIP, and sensitive seating constraints",
      kind: "seating",
      dueLabel: "After RSVP responses stabilize",
      priority: "normal",
      source: "agent",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: { ...baseMetadata, decision_surface: "guest_operations", second_order_loop: "guest_logistics" },
      notes: "Generate seating suggestions only from known guest relationships and constraints. Sensitive seating must be user-confirmed.",
    },
    {
      id: `wedding_task:lifecycle:caterer-brief:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
      title: "Brief caterer on dietary and accessibility counts",
      kind: "vendor_coordination",
      dueLabel: "After RSVP meal and access data is verified",
      priority: "normal",
      source: "agent",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: { ...baseMetadata, decision_surface: "vendor_coordination", second_order_loop: "guest_logistics" },
      notes: "Auto-briefs must include only verified counts and deadlines, e.g. vegan, gluten-free, allergy, and accessibility counts, and must remain approval-gated before sending.",
    },
  ];
}

export function buildWeddingLifecycleManagementState(input: {
  metadata?: unknown;
  planningContext?: WeddingPlanningContext | null;
}): WeddingLifecycleManagementState {
  const metadata = normalizeWeddingPlanningMetadata({
    ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
    artifactKind: "research",
    supertags: [
      ...normalizeWeddingPlanningMetadata(input.metadata).supertags,
      "wedding_lifecycle",
      "wedding_brief",
      "decisionos:wedding",
    ],
  });
  const context = input.planningContext ?? {};
  const constraints = constraintsFor(context);
  const coverage = coverageFor(context);
  const title = titleFromContext(context);
  const markdown = markdownFor(title, context, constraints, coverage);
  const tasks = taskItems(metadata, context, constraints);
  const artifactInput = {
    id: `wedding_artifact:lifecycle_brief:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    title,
    kind: "research" as const,
    metadata,
    sourceLabels: [
      "Wedding Planning Need-To-Know answers",
      ...(isAustralianContext(context) ? ["Attorney-General's Department: get married"] : []),
    ],
    locationLabels: clean(context.location) ? [clean(context.location)] : [],
    vendorLabels: uniqueStrings(context.vendorCategories ?? [], 12),
    linkedTaskIds: tasks.map((task) => task.id),
    bodyText: markdown,
    exportTargets: ["markdown", "html", "word_doc", "browser_pdf"],
  };
  const summary = normalizeWeddingArtifactSummary(artifactInput)!;
  return {
    constraints,
    coverage,
    onePageBriefArtifact: {
      input: artifactInput,
      summary,
      markdown,
      csv: null,
    },
    taskItems: tasks,
    decisionSurfaceLabels: [
      "DecisionOS: venue selection",
      "DecisionOS: vendor shortlist",
      "DecisionOS: contract/deposit risk",
      "DecisionOS: seating and guest operations",
    ],
    outreachPolicyLabels: [
      "Opt-in only contact sharing",
      "One follow-up after 3-5 days",
      "Escalate to user after 7 days",
      "No vendor contact without approval/provider receipt",
    ],
    guestOpsLabels: [
      "Secure RSVP link planned",
      "Meal and dietary counts",
      "Accessibility needs",
      "Sensitive seating constraints",
      "Caterer/vendor brief after verified counts",
    ],
  };
}
