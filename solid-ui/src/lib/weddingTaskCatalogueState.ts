export const WEDDING_TASK_CATALOGUE_VERSION = "wedding-catalogue.v1" as const;
export const WEDDING_CATALOGUE_REVIEWED_AT = "2026-11-04" as const;

export const WEDDING_CATALOGUE_STAGES = [
  { id: "plan_budget", label: "Plan & budget", gateLabel: "Working budget, guest estimate and planning priorities recorded", legacyLabels: ["Foundation", "Planning", "Budget"] },
  { id: "venue_date", label: "Venue & date", gateLabel: "Date and venue direction chosen with legal timing visible", legacyLabels: ["Venue", "Date"] },
  { id: "celebrant_suppliers", label: "Celebrant & suppliers", gateLabel: "Essential suppliers researched, compared and deliberately selected or skipped", legacyLabels: ["Suppliers", "Key vendors", "Booked"] },
  { id: "details_invites", label: "Details & invites", gateLabel: "Guest communication, RSVP and day details are underway", legacyLabels: ["Details", "Guests", "Seating"] },
  { id: "final_prep", label: "Final prep", gateLabel: "Final numbers, run sheet, balances and backup plans confirmed", legacyLabels: ["Finalise", "Final preparations"] },
  { id: "wedding_after", label: "Wedding & after", gateLabel: "Day-of delivery and post-wedding close-out completed", legacyLabels: ["Wedding", "Aftercare"] },
] as const;

export type WeddingCatalogueStageId = typeof WEDDING_CATALOGUE_STAGES[number]["id"];
export type WeddingCatalogueOwnerRole = "couple" | "couple_and_supplier";
export type WeddingCatalogueCategory = "planning" | "money" | "guests" | "legal" | "logistics" | "outfits" | "suppliers" | "wedding_day";

export type WeddingVendorLeadTimeRule = {
  categoryId: string; label: string; idealLeadMonths: readonly [number, number]; hardDeadlineMonths: number;
  mustDecideFirst?: boolean; rationale: string;
};

// Planning heuristics, not guarantees of availability. These are the existing
// planner rules made public through one authority; couples still confirm timing
// and availability with each supplier before relying on it.
export const WEDDING_VENDOR_LEAD_TIME_RULES: readonly WeddingVendorLeadTimeRule[] = [
  { categoryId: "venue", label: "Venue", idealLeadMonths: [12, 18], hardDeadlineMonths: 12, mustDecideFirst: true, rationale: "The date and location constrain most later supplier and guest decisions." },
  { categoryId: "planner", label: "Planner", idealLeadMonths: [10, 18], hardDeadlineMonths: 9, rationale: "Full-service planners need runway before major supplier choices are locked." },
  { categoryId: "photographer", label: "Photographer", idealLeadMonths: [9, 12], hardDeadlineMonths: 6, rationale: "Preferred photographers can have limited date availability." },
  { categoryId: "floral_designer", label: "Floral designer", idealLeadMonths: [4, 6], hardDeadlineMonths: 3, rationale: "Design, seasonality and venue access need coordination." },
  { categoryId: "dj", label: "DJ", idealLeadMonths: [6, 9], hardDeadlineMonths: 3, rationale: "Music, equipment and MC responsibilities need a confirmed provider." },
  { categoryId: "band", label: "Band", idealLeadMonths: [8, 12], hardDeadlineMonths: 4, rationale: "A full ensemble has more people, equipment and date constraints." },
  { categoryId: "caterer", label: "Caterer", idealLeadMonths: [6, 9], hardDeadlineMonths: 4, rationale: "Menus, staffing, dietary needs and venue logistics take coordination." },
  { categoryId: "decor", label: "Decor", idealLeadMonths: [4, 6], hardDeadlineMonths: 2, rationale: "Design choices depend on the venue, palette and hire inventory." },
  { categoryId: "rental_company", label: "Rental company", idealLeadMonths: [4, 6], hardDeadlineMonths: 2, rationale: "Furniture and equipment inventory may be shared across events." },
  { categoryId: "videographer", label: "Videographer", idealLeadMonths: [9, 12], hardDeadlineMonths: 6, rationale: "Preferred styles and teams can have limited date availability." },
  { categoryId: "hair_stylist", label: "Hair stylist", idealLeadMonths: [4, 6], hardDeadlineMonths: 2, rationale: "Trials, travel and wedding-party coverage need a workable schedule." },
  { categoryId: "makeup_artist", label: "Makeup artist", idealLeadMonths: [4, 6], hardDeadlineMonths: 2, rationale: "Trials, travel and wedding-party coverage need a workable schedule." },
  { categoryId: "entertainment", label: "Entertainment", idealLeadMonths: [6, 9], hardDeadlineMonths: 3, rationale: "Specialist performers may have limited suitable dates." },
  { categoryId: "lighting_company", label: "Lighting company", idealLeadMonths: [4, 6], hardDeadlineMonths: 2, rationale: "Power, rigging, access and venue approval can affect the design." },
  { categoryId: "cake_baker", label: "Cake baker", idealLeadMonths: [3, 4], hardDeadlineMonths: 2, rationale: "Design, tasting, allergens, delivery and setup need confirmation." },
  { categoryId: "transportation_provider", label: "Transport provider", idealLeadMonths: [2, 3], hardDeadlineMonths: 1, rationale: "Vehicle capacity, routes, pickup times and overtime terms need confirmation." },
  { categoryId: "stationer", label: "Stationer", idealLeadMonths: [4, 6], hardDeadlineMonths: 2, rationale: "Design, proofing, printing and postage need lead time." },
  { categoryId: "calligrapher", label: "Calligrapher", idealLeadMonths: [3, 5], hardDeadlineMonths: 2, rationale: "Hand-finished pieces require guest details and production time." },
  { categoryId: "bartending", label: "Bartending service", idealLeadMonths: [4, 6], hardDeadlineMonths: 2, rationale: "Licensing, staffing, stock and venue rules need coordination." },
  { categoryId: "ceremony_ensemble", label: "Ceremony ensemble", idealLeadMonths: [6, 9], hardDeadlineMonths: 3, rationale: "Musicians, repertoire, equipment and ceremony cues need coordination." },
  { categoryId: "accommodations", label: "Guest accommodation", idealLeadMonths: [8, 12], hardDeadlineMonths: 4, rationale: "Room blocks and peak-date supply can affect travelling guests." },
  { categoryId: "attire_designer", label: "Attire designer", idealLeadMonths: [8, 12], hardDeadlineMonths: 5, rationale: "Custom design, fittings and production require multiple stages." },
  { categoryId: "dress_salon", label: "Dress salon", idealLeadMonths: [8, 12], hardDeadlineMonths: 5, rationale: "Ordering, delivery and alterations require multiple stages." },
  { categoryId: "alterations_specialist", label: "Alterations specialist", idealLeadMonths: [2, 3], hardDeadlineMonths: 1, rationale: "Several fittings and a correction buffer may be needed." },
  { categoryId: "emcee", label: "MC", idealLeadMonths: [4, 6], hardDeadlineMonths: 2, rationale: "The MC needs time to understand the run sheet, people and tone." },
  { categoryId: "jeweler", label: "Jeweller", idealLeadMonths: [3, 6], hardDeadlineMonths: 2, rationale: "Sizing, engraving, custom work and delivery need a buffer." },
  { categoryId: "photo_booth", label: "Photo booth", idealLeadMonths: [3, 6], hardDeadlineMonths: 2, rationale: "Equipment, attendants, access and custom artwork need confirmation." },
  { categoryId: "travel_honeymoon_advisor", label: "Travel or honeymoon adviser", idealLeadMonths: [6, 9], hardDeadlineMonths: 3, rationale: "Passports, leave, availability and seasonal planning may affect options." },
  { categoryId: "welcome_amenity_supplier", label: "Welcome amenity supplier", idealLeadMonths: [2, 3], hardDeadlineMonths: 1, rationale: "Quantities, delivery locations and assembly need final guest information." },
  { categoryId: "trendy_emerging", label: "Specialist or emerging supplier", idealLeadMonths: [3, 6], hardDeadlineMonths: 2, rationale: "Niche providers may have limited local supply and bespoke requirements." },
];

export type WeddingCatalogueWorkspaceTask = {
  id: string; title: string; stageId: WeddingCatalogueStageId; targetOffsetDays: number;
  category: Exclude<WeddingCatalogueCategory, "planning" | "money">; ownerRole: WeddingCatalogueOwnerRole;
  whyItMatters: string; notes?: string; sourceId: "wedding_timeline_stage_review" | "wedding_runsheet_research";
};

export const WEDDING_CATALOGUE_WORKSPACE_TASKS: readonly WeddingCatalogueWorkspaceTask[] = [
  { id: "save-the-dates", title: "Send save-the-dates", stageId: "details_invites", targetOffsetDays: -240, category: "guests", ownerRole: "couple", whyItMatters: "Gives guests time to protect the date before detailed invitations are ready.", sourceId: "wedding_timeline_stage_review" },
  { id: "wedding-website", title: "Publish wedding website and guest information", stageId: "details_invites", targetOffsetDays: -210, category: "guests", ownerRole: "couple", whyItMatters: "Keeps travel, timing and RSVP information in one updateable place.", sourceId: "wedding_timeline_stage_review" },
  { id: "invitations", title: "Send wedding invitations", stageId: "details_invites", targetOffsetDays: -120, category: "guests", ownerRole: "couple", whyItMatters: "Starts the confirmed attendance and guest-detail workflow.", sourceId: "wedding_timeline_stage_review" },
  { id: "rsvp-deadline", title: "Close RSVPs and confirm final guest count", stageId: "final_prep", targetOffsetDays: -42, category: "guests", ownerRole: "couple", whyItMatters: "Creates enough time to resolve missing replies before supplier final-number deadlines.", sourceId: "wedding_timeline_stage_review" },
  { id: "guest-travel", title: "Confirm guest accommodation and transport information", stageId: "details_invites", targetOffsetDays: -90, category: "logistics", ownerRole: "couple", whyItMatters: "Lets guests plan reliable travel before the final weeks.", sourceId: "wedding_timeline_stage_review" },
  { id: "permits-insurance", title: "Confirm venue permits and event insurance", stageId: "venue_date", targetOffsetDays: -150, category: "legal", ownerRole: "couple_and_supplier", whyItMatters: "Surfaces venue-specific approvals and cover before commitments become difficult to change.", sourceId: "wedding_timeline_stage_review" },
  { id: "final-fitting", title: "Complete final outfit fitting", stageId: "final_prep", targetOffsetDays: -14, category: "outfits", ownerRole: "couple_and_supplier", whyItMatters: "Leaves a short correction window while keeping the final fit current.", sourceId: "wedding_timeline_stage_review" },
  { id: "rehearsal", title: "Hold ceremony rehearsal", stageId: "final_prep", targetOffsetDays: -7, category: "wedding_day", ownerRole: "couple_and_supplier", whyItMatters: "Confirms entrances, cues and responsibilities with the people involved.", sourceId: "wedding_timeline_stage_review" },
  { id: "shot-list", title: "Confirm photographer shot list", stageId: "final_prep", targetOffsetDays: -28, category: "suppliers", ownerRole: "couple_and_supplier", whyItMatters: "Gives the photographer time to validate timing, locations and essential groupings.", sourceId: "wedding_timeline_stage_review" },
  { id: "supplier-confirmations", title: "Complete final supplier confirmation sweep", stageId: "final_prep", targetOffsetDays: -21, category: "suppliers", ownerRole: "couple_and_supplier", whyItMatters: "Finds timing, access and responsibility gaps while they can still be fixed.", sourceId: "wedding_timeline_stage_review" },
  { id: "weather-recheck", title: "Recheck weather and wet-weather plan", stageId: "final_prep", targetOffsetDays: -28, category: "logistics", ownerRole: "couple_and_supplier", whyItMatters: "Makes the backup plan explicit before the short-range forecast is available.", sourceId: "wedding_timeline_stage_review" },
  { id: "marriage-certificate", title: "Apply for the official marriage certificate", stageId: "wedding_after", targetOffsetDays: 7, category: "legal", ownerRole: "couple", whyItMatters: "Keeps the post-wedding legal administration visible.", sourceId: "wedding_timeline_stage_review" },
  { id: "thank-yous", title: "Send thank-you messages", stageId: "wedding_after", targetOffsetDays: 14, category: "guests", ownerRole: "couple", whyItMatters: "Closes the loop with guests and helpers while details are fresh.", sourceId: "wedding_timeline_stage_review" },
  { id: "supplier-reviews", title: "Review wedding suppliers", stageId: "wedding_after", targetOffsetDays: 21, category: "suppliers", ownerRole: "couple", whyItMatters: "Records useful feedback after delivery can be assessed fairly.", sourceId: "wedding_timeline_stage_review" },
  { id: "return-hire", title: "Return hired items", stageId: "wedding_after", targetOffsetDays: 2, category: "logistics", ownerRole: "couple", whyItMatters: "Avoids late charges and missing-item disputes.", sourceId: "wedding_timeline_stage_review" },
  { id: "run-sheet-initial-vendor-draft", title: "Send the initial run-sheet draft to key vendors", stageId: "final_prep", targetOffsetDays: -42, category: "wedding_day", ownerRole: "couple_and_supplier", whyItMatters: "Tests feasibility before the master schedule is locked.", notes: "Send the working run sheet to the photographer, caterer, venue manager and hair and makeup lead to confirm feasibility and timing.", sourceId: "wedding_runsheet_research" },
  { id: "run-sheet-finalise-logistics", title: "Finalise run-sheet catering, speeches and transport times", stageId: "final_prep", targetOffsetDays: -21, category: "wedding_day", ownerRole: "couple_and_supplier", whyItMatters: "Connects supplier timing and guest movement in the same schedule.", notes: "Confirm catering drop times, speech durations and transport pickup schedules.", sourceId: "wedding_runsheet_research" },
  { id: "run-sheet-master-signoff", title: "Send the Final Master Run Sheet for vendor sign-off", stageId: "final_prep", targetOffsetDays: -10, category: "wedding_day", ownerRole: "couple_and_supplier", whyItMatters: "Creates one acknowledged version for third-party delivery.", notes: "Send the final master version to every third-party vendor and ask them to confirm it.", sourceId: "wedding_runsheet_research" },
  { id: "run-sheet-vip-version", title: "Send the tailored VIP and wedding-party run sheet", stageId: "final_prep", targetOffsetDays: -5, category: "wedding_day", ownerRole: "couple", whyItMatters: "Gives each person only the timing and responsibilities they need.", notes: "Share only getting-ready times, photo locations, transport and responsibilities with the wedding party and parents.", sourceId: "wedding_runsheet_research" },
  { id: "run-sheet-day-of-copies", title: "Prepare printed run-sheet copies for day-of leads", stageId: "wedding_after", targetOffsetDays: 0, category: "wedding_day", ownerRole: "couple", whyItMatters: "Keeps the schedule usable if a device or connection fails.", notes: "Provide printed copies to the venue manager, coordinator, photographer, DJ or MC and catering manager on the wedding day.", sourceId: "wedding_runsheet_research" },
];

export type WeddingCatalogueTask = {
  id: string; title: string; stageId: WeddingCatalogueStageId; windowStartOffsetDays: number; targetOffsetDays: number;
  windowEndOffsetDays: number; dependencies: readonly string[];
  taskKind: "planning" | "decision" | "research" | "legal" | "guest_list" | "budget_review" | "vendor_coordination" | "run_sheet" | "document_checklist";
  category: WeddingCatalogueCategory; vendorCategoryId: string | null; ownerRole: WeddingCatalogueOwnerRole;
  whyItMatters: string; guidePath: string; source: { id: string; label: string; url: string | null; checkedAt: string };
};

const FOUNDATION_ROWS = [
  ["set-budget", "Set a working wedding budget", "plan_budget", -540, -450, -365, [], "budget_review", "money", "A working total makes supplier and guest trade-offs visible."],
  ["estimate-guests", "Estimate the guest count", "plan_budget", -540, -450, -365, [], "guest_list", "guests", "A working guest range affects venue capacity, catering and transport."],
  ["choose-date", "Confirm the wedding date", "venue_date", -540, -450, -365, ["set-budget", "estimate-guests"], "decision", "planning", "An exact date turns planning windows into calendar dates."],
  ["allocate-budget", "Allocate the working budget by category", "plan_budget", -450, -365, -300, ["set-budget"], "budget_review", "money", "Category targets prevent one commitment from silently consuming the whole budget."],
  ["create-guest-list", "Create the working guest list", "details_invites", -365, -300, -240, ["estimate-guests"], "guest_list", "guests", "Named guests unlock invitations, RSVP tracking, meals and seating."],
  ["confirm-ceremony-format", "Confirm the ceremony format and location", "venue_date", -365, -300, -240, ["choose-date"], "decision", "planning", "The ceremony format affects the celebrant, venue permissions and run sheet."],
  ["select-celebrant", "Select an authorised marriage celebrant", "celebrant_suppliers", -365, -300, -180, ["choose-date"], "research", "legal", "The authorised celebrant receives the NOIM and confirms legal ceremony steps."],
  ["submit-noim", "Give the NOIM to the authorised celebrant", "celebrant_suppliers", -548, -90, -31, ["choose-date", "select-celebrant"], "legal", "legal", "Federal law requires the authorised celebrant to receive it within the legal window."],
  ["review-contracts", "Review supplier contracts and cancellation terms", "celebrant_suppliers", -365, -270, -180, ["choose-date"], "document_checklist", "money", "Written inclusions, deadlines and cancellation terms are the commitment evidence."],
  ["track-deposits", "Record deposits and payment dates", "celebrant_suppliers", -300, -240, -120, ["review-contracts"], "budget_review", "money", "One payment projection keeps commitments and remaining cash visible."],
  ["confirm-vows", "Confirm vows and ceremony wording", "details_invites", -90, -60, -30, ["select-celebrant"], "decision", "legal", "The celebrant needs time to review the ceremony structure and required wording."],
  ["draft-seating", "Draft the seating plan", "final_prep", -56, -42, -21, ["create-guest-list", "rsvp-deadline"], "guest_list", "guests", "A draft exposes household, access and relationship constraints before final numbers."],
  ["final-payments", "Review final supplier balances and receipts", "final_prep", -30, -14, -3, ["track-deposits"], "budget_review", "money", "Payment evidence prevents missed balances and duplicate payment."],
  ["archive-records", "Archive final contracts, receipts and shared run sheets", "wedding_after", 1, 14, 30, ["final-payments"], "document_checklist", "planning", "A complete record supports follow-up, disputes and post-wedding administration."],
] as const;

const FOUNDATION_TASKS: readonly WeddingCatalogueTask[] = FOUNDATION_ROWS.map((row) => ({
  id: row[0], title: row[1], stageId: row[2], windowStartOffsetDays: row[3], targetOffsetDays: row[4], windowEndOffsetDays: row[5],
  dependencies: row[6], taskKind: row[7], category: row[8], vendorCategoryId: null, ownerRole: "couple", whyItMatters: row[9],
  guidePath: "/wedding/user-guide.html", source: { id: "wedding_timeline_stage_review", label: "OmnyID Wedding timeline research", url: null, checkedAt: WEDDING_CATALOGUE_REVIEWED_AT },
}));

const WORKSPACE_TASKS: readonly WeddingCatalogueTask[] = WEDDING_CATALOGUE_WORKSPACE_TASKS.map((task) => ({
  ...task, windowStartOffsetDays: task.targetOffsetDays - 14, windowEndOffsetDays: task.targetOffsetDays + 14,
  dependencies: [], taskKind: task.category === "wedding_day" ? "run_sheet" : task.category === "legal" ? "legal" : "planning",
  vendorCategoryId: null, guidePath: task.category === "legal" ? "/wedding/blog/australian-legal-checklist.html" : "/wedding/user-guide.html",
  source: { id: task.sourceId, label: task.sourceId === "wedding_runsheet_research" ? "OmnyID run-sheet research" : "OmnyID Wedding timeline research", url: null, checkedAt: WEDDING_CATALOGUE_REVIEWED_AT },
}));

const VENDOR_TASKS: readonly WeddingCatalogueTask[] = WEDDING_VENDOR_LEAD_TIME_RULES.map((rule) => {
  const [minMonths, maxMonths] = rule.idealLeadMonths;
  const start = -Math.round(maxMonths * 30.4375);
  return {
    id: `research-vendor-${rule.categoryId}`, title: `Research and shortlist ${rule.label.toLowerCase()}`,
    stageId: rule.categoryId === "venue" ? "venue_date" : "celebrant_suppliers", windowStartOffsetDays: start,
    targetOffsetDays: start, windowEndOffsetDays: -Math.round(minMonths * 30.4375),
    dependencies: rule.categoryId === "venue" ? ["set-budget", "estimate-guests"] : ["choose-date"], taskKind: "research",
    category: "suppliers", vendorCategoryId: rule.categoryId, ownerRole: "couple",
    whyItMatters: `${rule.rationale} This is a planning estimate, so confirm availability and the supplier's own deadline directly.`,
    guidePath: "/wedding/vendors.html", source: { id: "omnyid_vendor_lead_time_v1", label: "OmnyID Wedding vendor lead-time rules", url: null, checkedAt: WEDDING_CATALOGUE_REVIEWED_AT },
  };
});

export const WEDDING_CATALOGUE_LEGAL_SOURCES = [
  { id: "agd_get_married", label: "Attorney-General's Department — Get married", url: "https://www.ag.gov.au/families-and-marriage/marriage/get-married", checkedAt: WEDDING_CATALOGUE_REVIEWED_AT },
  { id: "marriage_act_1961_s42", label: "Marriage Act 1961, section 42", url: "https://www.legislation.gov.au/C1961A00012/latest/text", checkedAt: WEDDING_CATALOGUE_REVIEWED_AT },
  { id: "agd_noim", label: "Attorney-General's Department — Notice of Intended Marriage", url: "https://www.ag.gov.au/families-and-marriage/publications/notice-intended-marriage", checkedAt: WEDDING_CATALOGUE_REVIEWED_AT },
] as const;

export const WEDDING_CATALOGUE_TASKS: readonly WeddingCatalogueTask[] = [...FOUNDATION_TASKS, ...VENDOR_TASKS, ...WORKSPACE_TASKS].map((task) => task.id === "submit-noim"
  ? { ...task, source: WEDDING_CATALOGUE_LEGAL_SOURCES[0], guidePath: "/wedding/blog/australian-legal-checklist.html" }
  : task);

export function weddingCatalogueCoverageState() {
  const ids = new Set(WEDDING_CATALOGUE_TASKS.map((task) => task.id));
  const vendorIds = new Set(WEDDING_CATALOGUE_TASKS.map((task) => task.vendorCategoryId).filter(Boolean));
  return {
    taskCount: WEDDING_CATALOGUE_TASKS.length, uniqueTaskCount: ids.size,
    vendorRuleCount: WEDDING_VENDOR_LEAD_TIME_RULES.length, vendorTaskCount: vendorIds.size,
    stageCount: new Set(WEDDING_CATALOGUE_TASKS.map((task) => task.stageId)).size,
    legalSourceCount: WEDDING_CATALOGUE_LEGAL_SOURCES.length,
  };
}

const coverage = weddingCatalogueCoverageState();
export const WEDDING_COUNTDOWN_PUBLICATION_READY = coverage.taskCount >= 64
  && coverage.taskCount === coverage.uniqueTaskCount
  && coverage.vendorRuleCount === coverage.vendorTaskCount
  && coverage.stageCount === WEDDING_CATALOGUE_STAGES.length
  && coverage.legalSourceCount >= 3;
