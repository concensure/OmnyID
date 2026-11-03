export const WEDDING_TASK_CATALOGUE_VERSION = "wedding-catalogue.v1" as const;

export const WEDDING_CATALOGUE_STAGES = [
  { id: "plan_budget", label: "Plan & budget", legacyLabels: ["Foundation", "Planning"] },
  { id: "venue_date", label: "Venue & date", legacyLabels: ["Venue", "Date"] },
  { id: "celebrant_suppliers", label: "Celebrant & suppliers", legacyLabels: ["Suppliers", "Booked"] },
  { id: "details_invites", label: "Details & invites", legacyLabels: ["Details", "Guests"] },
  { id: "final_prep", label: "Final prep", legacyLabels: ["Finalise", "Final preparations"] },
  { id: "wedding_after", label: "Wedding & after", legacyLabels: ["Wedding", "Aftercare"] },
] as const;

export type WeddingCatalogueStageId = typeof WEDDING_CATALOGUE_STAGES[number]["id"];

export type WeddingCatalogueWorkspaceTask = {
  id: string;
  title: string;
  stageId: WeddingCatalogueStageId;
  targetOffsetDays: number;
  category: "guests" | "legal" | "logistics" | "outfits" | "suppliers" | "wedding_day";
  ownerRole: "couple" | "couple_and_supplier";
  whyItMatters: string;
  notes?: string;
  sourceId: "wedding_timeline_stage_review" | "wedding_runsheet_research";
};

// This is the first reconciled slice of the catalogue: tasks already emitted by
// the workspace today. It is deliberately not a public Countdown data set yet;
// vendor windows and the reviewed Australian legal block still have to join it.
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
] as const;

export const WEDDING_COUNTDOWN_PUBLICATION_READY = false;
