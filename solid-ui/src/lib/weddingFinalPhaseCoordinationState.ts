// @locs-version: 2.0
import type { WeddingGeneratedArtifact } from "@/lib/weddingArtifactGenerationState";
import { normalizeWeddingArtifactSummary } from "@/lib/weddingArtifactState";
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
import type {
  WeddingPlanningScheduleItem,
  WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import type { WeddingPlanningContext } from "@/lib/weddingNeedToKnowProbingState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";
import type { WeddingWeatherProviderReadinessState } from "@/lib/weddingWeatherProviderReadinessState";

export type WeddingFinalPhaseReadiness = "ready_for_draft" | "needs_date_location" | "provider_blocked";

export type WeddingRunSheetItem = {
  time: string;
  title: string;
  owner: string;
  durationLabel: string;
  bufferLabel?: string | null;
  location?: string | null;
};

export type WeddingFinalConfirmationItem = {
  vendor: string;
  confirmation: string;
  dueLabel: string;
  actionLabel: string;
};

export type WeddingGuestFinalCountDecision = {
  countLabel: string;
  dueLabel: string;
  options: string[];
};

export type WeddingDayOfExecutionScenario = {
  scenario: string;
  trigger: string;
  options: string[];
  affectedParties: string[];
  providerRequirement: string;
};

export type WeddingFinalPhaseCoordinationState = {
  runSheetReadiness: WeddingFinalPhaseReadiness;
  weatherReadiness: "handoff_only" | "provider_needed" | "verified";
  runSheetItems: WeddingRunSheetItem[];
  delayOptions: string[];
  vendorShareRules: string[];
  weatherBackupOptions: string[];
  finalConfirmationItems: WeddingFinalConfirmationItem[];
  guestFinalCountDecision: WeddingGuestFinalCountDecision;
  dayOfExecutionScenarios: WeddingDayOfExecutionScenario[];
  emergencyKitItems: string[];
  artifact: WeddingGeneratedArtifact;
  scheduleItems: WeddingPlanningScheduleItem[];
  taskItems: WeddingPlanningTaskItem[];
  caveatLabels: string[];
};

export type WeddingFinalPhaseTaskItemsInput = {
  artifacts?: readonly WeddingArtifactInput[] | null;
  metadata?: unknown;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function exactDate(value: unknown): Date | null {
  const label = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return null;
  const parsed = new Date(`${label}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateTime(date: Date, time: string): string {
  const [hour = "0", minute = "0"] = time.split(":");
  const next = new Date(date);
  next.setUTCHours(Number(hour), Number(minute), 0, 0);
  return next.toISOString();
}

function metadataWithTags(metadata: WeddingPlanningMetadata): WeddingPlanningMetadata {
  return {
    ...metadata,
    artifactKind: "timeline",
    supertags: [
      ...metadata.supertags,
      "wedding_final_phase",
      "wedding_run_sheet",
      "wedding_weather_contingency",
    ],
  };
}

function defaultRunSheetItems(context: WeddingPlanningContext): WeddingRunSheetItem[] {
  const ceremonyLocation = clean(context.location) || "Ceremony location";
  return [
    { time: "08:00", title: "Bride: hair and makeup", owner: "Bride / hair stylist / makeup artist", durationLabel: "2 hours", bufferLabel: "30 minutes", location: "Getting-ready location" },
    { time: "10:00", title: "Groom: get ready", owner: "Groom / wedding party", durationLabel: "1 hour", bufferLabel: "15 minutes", location: "Getting-ready location" },
    { time: "11:00", title: "Photographer arrives for pre-ceremony shots", owner: "Photographer", durationLabel: "1 hour", bufferLabel: "15 minutes", location: ceremonyLocation },
    { time: "12:00", title: "Ceremony", owner: "Couple / celebrant / venue", durationLabel: "30 minutes", bufferLabel: "10 minutes", location: ceremonyLocation },
    { time: "12:30", title: "Cocktail hour", owner: "Venue / caterer / MC", durationLabel: "1 hour", bufferLabel: "Flexible", location: "Cocktail area" },
    { time: "13:30", title: "Reception", owner: "Venue / MC / caterer", durationLabel: "Main reception block", bufferLabel: "Venue-dependent", location: "Reception space" },
  ];
}

function finalConfirmationItems(): WeddingFinalConfirmationItem[] {
  return [
    {
      vendor: "Caterer",
      confirmation: "Menu, final headcount, dietary/accessibility counts, bar package, service times, and final balance.",
      dueLabel: "Final numbers deadline or 4-6 weeks out",
      actionLabel: "Ask whether to draft one approved reminder to the caterer.",
    },
    {
      vendor: "Photographer / videographer",
      confirmation: "Shot list, family combinations, arrival time, locations, delivery terms, permissions, and final balance.",
      dueLabel: "3-4 weeks out",
      actionLabel: "Ask whether to draft one approved reminder with the shot list attached.",
    },
    {
      vendor: "Venue",
      confirmation: "Final layout, wet-weather location, access times, vendor bump-in, security, overtime, and payment schedule.",
      dueLabel: "3-4 weeks out",
      actionLabel: "Ask whether to draft one approved reminder to the venue coordinator.",
    },
    {
      vendor: "Celebrant / officiant",
      confirmation: "Ceremony script, legal/admin status, rehearsal timing, arrival time, and final balance.",
      dueLabel: "2-4 weeks out",
      actionLabel: "Ask whether to draft one approved ceremony confirmation.",
    },
  ];
}

function guestFinalCountDecision(context: WeddingPlanningContext): WeddingGuestFinalCountDecision {
  const count = clean(context.guestCount) || "current RSVP count";
  return {
    countLabel: count,
    dueLabel: "Caterer final-number deadline",
    options: [
      `Submit ${count} as the current final count after user approval.`,
      "Wait for outstanding RSVPs and flag the risk of late-change fees or extra charges.",
      "Reduce or adjust the count only if the user confirms budget, seating, and guest-impact tradeoffs.",
    ],
  };
}

function emergencyKitItems(): string[] {
  return [
    "Sewing kit",
    "Safety pins",
    "Stain remover",
    "Band-aids",
    "Breath mints",
    "Backup shoes",
    "Phone chargers / power bank",
    "Tissues",
    "Pain relief if appropriate for the couple",
    "Printed vendor contacts and run sheet",
  ];
}

function dayOfExecutionScenarios(): WeddingDayOfExecutionScenario[] {
  return [
    {
      scenario: "Vendor delay",
      trigger: "A vendor reports a material delay, such as caterer running 30 minutes late.",
      options: [
        "Extend cocktail hour by the delay amount and update dependent vendor/guest timelines after approval.",
        "Delay ceremony or reception start and show photographer, venue, transport, and guest impact before approval.",
        "Serve approved early appetizers or substitute service only if caterer/venue confirms feasibility.",
      ],
      affectedParties: ["venue", "caterer", "photographer", "MC", "transport", "guests"],
      providerRequirement: "Needs live vendor intake plus approved notification executors before real-time updates are sent.",
    },
    {
      scenario: "Vendor no-show",
      trigger: "A critical vendor has not arrived by the escalation threshold.",
      options: [
        "Contact approved backup vendor or standby option with any extra cost visible.",
        "Use degraded fallback, such as guest candid photos, only after the couple accepts quality tradeoff.",
        "Delay affected run-sheet items and update dependent parties after approval.",
      ],
      affectedParties: ["couple", "venue", "MC", "affected vendor category", "guests if timing changes"],
      providerRequirement: "Needs backup-vendor records, contact executor, and user approval before outreach.",
    },
    {
      scenario: "Weather emergency",
      trigger: "Verified provider reports sudden storm or unsafe outdoor conditions.",
      options: [
        "Activate chosen indoor backup and update run sheet after approval.",
        "Notify guests through approved E2EE channel with only guest-safe details.",
        "Update photographer, venue, caterer, celebrant/officiant, and transport with scoped instructions.",
      ],
      affectedParties: ["guests", "venue", "photographer", "caterer", "celebrant/officiant", "transport"],
      providerRequirement: "Needs verified weather evidence plus notification executors before activation is claimed.",
    },
    {
      scenario: "Guest coordination incident",
      trigger: "Guest-facing issue such as delayed transport or reported lost item.",
      options: [
        "Send guest-safe live update to the affected group through approved E2EE channel.",
        "Notify venue staff or relevant vendor with minimum necessary details.",
        "Open a DecisionOS incident card until the item or transport issue is closed.",
      ],
      affectedParties: ["affected guests", "venue staff", "transport provider", "photographer if relevant"],
      providerRequirement: "Needs guest messaging, access-control, and approval proof before live guest updates.",
    },
    {
      scenario: "Payment verification",
      trigger: "Final payment, balance, refund, or day-of charge needs confirmation.",
      options: [
        "Record receipt link and mark payment as confirmed only from trusted payment or uploaded receipt evidence.",
        "Flag unverified payment as needs review rather than paid.",
        "Escalate disputed or unexpected charges to DecisionOS before payment approval.",
      ],
      affectedParties: ["couple", "vendor", "budget tracker"],
      providerRequirement: "Needs payment/receipt evidence before confirming payment status.",
    },
  ];
}

function task(
  metadata: WeddingPlanningMetadata,
  id: string,
  title: string,
  kind: WeddingPlanningTaskItem["kind"],
  notes: string,
  priority: WeddingPlanningTaskItem["priority"] = "normal",
  options: { dueLabel?: string; secondOrderLoop?: string } = {},
): WeddingPlanningTaskItem {
  const defaultSecondOrderLoop = kind === "weather_contingency"
    ? "weather_backup"
    : kind === "budget_review"
      ? "commitment_timing"
      : "guest_logistics";

  return {
    id: `wedding_task:final-phase:${safeWeddingLabel(id)}:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    title,
    kind,
    dueLabel: options.dueLabel ?? "6-1 months out / final planning phase",
    priority,
    source: "agent",
    reviewStatus: "accepted",
    approvalState: "draft",
    metadata: {
      ...metadata,
      decision_surface: "final_phase_coordination",
      final_phase_task: true,
      final_phase_action_id: id,
      second_order_loop: options.secondOrderLoop ?? defaultSecondOrderLoop,
      preparation_checklist: true,
      preparation_checklist_item: id,
      user_selectable: true,
      can_deselect_before_commit: true,
      searchable_terms: [
        title,
        notes,
        id,
        "final phase",
        "run sheet",
        "final confirmations",
        "day-of execution",
        metadata.weddingPlanId,
        metadata.responseWorkspaceId,
      ],
    },
    notes,
  };
}

function finalPhaseTaskItems(
  metadata: WeddingPlanningMetadata,
  finalCountDecision: WeddingGuestFinalCountDecision,
  kitItems: readonly string[],
): WeddingPlanningTaskItem[] {
  return [
    task(metadata, "run-sheet-confirm", "Confirm draft run sheet and buffers", "run_sheet", "Review timing, owner, buffer, and vendor dependencies. Drag-and-drop UI is future work over this structured artifact.", "high"),
    task(metadata, "vendor-scoped-sharing", "Prepare vendor-scoped run sheet packets", "vendor_coordination", "Share only the vendor's own tasks after explicit approval; do not expose private couple, family, budget, or unrelated vendor details.", "normal"),
    task(metadata, "weather-backup-execution", "Prepare weather contingency execution choices", "weather_contingency", "BOM/weather provider integration is not connected here. Treat forecast and backup execution as provider-blocked until verified weather and approved backup choice exist.", "high"),
    task(metadata, "final-vendor-confirmations", "Confirm final vendors, balances, and payment deadlines", "vendor_coordination", "DecisionOS checklist: caterer menu/headcount, photographer shot list, venue final layout, celebrant/officiant ceremony status, and final balances. Auto-reminders require explicit approval and connected email/contact executors.", "high"),
    task(metadata, "final-guest-count", "Decide final guest count before caterer deadline", "guest_list", `DecisionOS alert should show current count (${finalCountDecision.countLabel}), deadline risk, wait-for-RSVPs option, and budget tradeoff before submitting numbers.`, "high"),
    task(metadata, "emergency-kit", "Add emergency kit and day-of prep to run sheet", "run_sheet", `Checklist: ${kitItems.slice(0, 8).join(", ")}. Ask before adding to the shareable run sheet.`, "normal"),
    task(metadata, "final-payment-review", "Review final payment schedule and hidden last-minute fees", "budget_review", "Check final balances, overtime, service charges, wet-weather costs, delivery fees, and refund/cancellation terms before payment deadlines.", "high"),
    task(metadata, "day-of-vendor-delay", "Prepare day-of vendor delay decision playbook", "run_sheet", "If caterer, photographer, venue, transport, or another vendor reports a delay, present approved options and dependency impacts before notifying anyone.", "high", {
      dueLabel: "Wedding day / live run sheet",
    }),
    task(metadata, "day-of-no-show", "Confirm day-of vendor no-show escalation path", "vendor_coordination", "Identify backup contacts, cost impact, and quality tradeoffs for critical vendor no-shows before the wedding day.", "high", {
      dueLabel: "Final week / wedding day",
      secondOrderLoop: "contact_follow_up",
    }),
    task(metadata, "day-of-guest-live-updates", "Prepare guest-safe live update channel", "guest_list", "Guest-safe live updates, lost-item notices, and transport changes require approved E2EE or scoped messaging before use.", "high", {
      dueLabel: "Final week / wedding day",
    }),
    task(metadata, "day-of-payment-verification", "Prepare final payment receipt verification", "budget_review", "Confirm final payments only from trusted provider evidence or uploaded receipt evidence; otherwise leave as needs review.", "high", {
      dueLabel: "Before final payment / wedding day",
    }),
  ];
}

function taskRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function existingFinalPhaseKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const actionId = clean(taskRecord(item.metadata).final_phase_action_id);
    if (taskRecord(item.metadata).final_phase_task === true && actionId) keys.add(actionId);
  }
  return keys;
}

function isFinalPhaseArtifact(artifact: WeddingArtifactInput): boolean {
  const metadata = taskRecord(artifact.metadata);
  const supertags = Array.isArray(metadata.supertags) ? metadata.supertags.join(" ") : "";
  return artifact.kind === "timeline"
    && /final planning phase|final planning run sheet|final confirmations|day-of execution|emergency kit|wedding_final_phase/i.test(`${clean(artifact.id)}\n${clean(artifact.title)}\n${clean(artifact.bodyText)}\n${supertags}`);
}

export function buildWeddingFinalPhaseTaskItems(input: WeddingFinalPhaseTaskItemsInput): WeddingPlanningTaskItem[] {
  const artifact = (input.artifacts ?? []).find(isFinalPhaseArtifact);
  if (!artifact) return [];
  const metadata = normalizeWeddingPlanningMetadata(input.metadata ?? artifact.metadata);
  const existingKeys = existingFinalPhaseKeys(input.existingTaskItems ?? []);
  const tasks = finalPhaseTaskItems(
    metadata,
    { countLabel: "current RSVP count", dueLabel: "Caterer final-number deadline", options: [] },
    emergencyKitItems(),
  );
  return tasks
    .filter((item) => {
      const actionId = clean(taskRecord(item.metadata).final_phase_action_id);
      return !existingKeys.has(item.id) && !existingKeys.has(actionId);
    })
    .map((item) => ({ ...item, linkedArtifactId: clean(artifact.id) || null }));
}

function markdownFor(
  context: WeddingPlanningContext,
  items: readonly WeddingRunSheetItem[],
  delayOptions: readonly string[],
  vendorRules: readonly string[],
  backupOptions: readonly string[],
  confirmations: readonly WeddingFinalConfirmationItem[],
  guestCountDecision: WeddingGuestFinalCountDecision,
  kitItems: readonly string[],
  dayOfScenarios: readonly WeddingDayOfExecutionScenario[],
): string {
  return [
    "# Final planning phase coordination",
    "",
    "This run-sheet draft is a coordination artifact. Drag-and-drop editing, live vendor delay intake, guest notifications, and weather execution require connected providers and explicit approval.",
    "",
    "## Draft run sheet",
    "",
    "```yaml",
    ...items.map((item) => `${item.time} | ${item.title} (${item.durationLabel}${item.bufferLabel ? `, Buffer: ${item.bufferLabel}` : ""}${item.location ? `, Location: ${item.location}` : ""})`),
    "```",
    "",
    "## Delay decision options",
    "",
    ...delayOptions.map((option, index) => `${index + 1}. ${option}`),
    "",
    "## Vendor-specific sharing rules",
    "",
    ...vendorRules.map((rule) => `- ${rule}`),
    "",
    "## Weather contingency",
    "",
    ...backupOptions.map((option, index) => `${index + 1}. ${option}`),
    "",
    "## Final confirmations and payments",
    "",
    ...confirmations.map((item) => `- ${item.vendor}: ${item.confirmation} Due: ${item.dueLabel}. Action: ${item.actionLabel}`),
    "",
    "## Final guest-count decision",
    "",
    `Current count basis: ${guestCountDecision.countLabel}.`,
    `Deadline basis: ${guestCountDecision.dueLabel}.`,
    ...guestCountDecision.options.map((option, index) => `${index + 1}. ${option}`),
    "",
    "## Day-of execution incident playbooks",
    "",
    ...dayOfScenarios.flatMap((scenario) => [
      `### ${scenario.scenario}`,
      `Trigger: ${scenario.trigger}`,
      `Affected parties: ${scenario.affectedParties.join(", ")}.`,
      ...scenario.options.map((option, index) => `${index + 1}. ${option}`),
      `Provider requirement: ${scenario.providerRequirement}`,
      "",
    ]),
    "## Emergency kit and day-of prep",
    "",
    ...kitItems.map((item) => `- ${item}`),
    "",
    "Action: ask whether to add this emergency-kit checklist to the run sheet before treating day-of prep as closed.",
    "",
    "## Execution guardrails",
    "",
    "- Do not auto-notify vendors or guests without approval.",
    "- Do not claim BOM/weather verification until a provider writes a dated forecast result.",
    "- Do not auto-trigger backup execution without the user choosing an option and approving notifications.",
    "- Do not auto-remind vendors, submit final counts, or confirm payments without explicit approval.",
    "",
    "## Current context",
    "",
    `- Date/season: ${clean(context.dateOrSeason) || "Unknown"}`,
    `- Location: ${clean(context.location) || "Unknown"}`,
  ].join("\n");
}

export function buildWeddingFinalPhaseCoordinationState(input: {
  metadata?: unknown;
  planningContext?: WeddingPlanningContext | null;
  weatherProviderReady?: boolean | null;
  weatherProviderReadiness?: WeddingWeatherProviderReadinessState | null;
}): WeddingFinalPhaseCoordinationState {
  const metadata = metadataWithTags(normalizeWeddingPlanningMetadata(input.metadata));
  const context = input.planningContext ?? {};
  const date = exactDate(context.dateOrSeason);
  const location = clean(context.location);
  const runSheetItems = defaultRunSheetItems(context);
  const delayOptions = [
    "Shorten cocktail hour by the delay amount.",
    "Delay ceremony start and notify affected vendors/guests after approval.",
    "Skip or compress pre-ceremony photos only if the couple approves.",
  ];
  const vendorShareRules = [
    "Photographer sees only photo timing, locations, arrival, family-shot, and delay updates.",
    "Venue sees venue setup, ceremony/reception transitions, catering timing, and approved weather backup changes.",
    "Caterer sees meal counts, dietary/accessibility counts, service times, and approved delay changes.",
    "Guests receive only approved guest-facing updates, not vendor contracts or private notes.",
  ];
  const weatherBackupOptions = [
    "Move ceremony to confirmed indoor backup, with cost and capacity verified.",
    "Rent marquee or weather cover, with live quote and setup timing verified.",
    "Proceed outdoors with umbrellas only if safety, accessibility, and guest comfort are acceptable.",
  ];
  const finalConfirmations = finalConfirmationItems();
  const finalCountDecision = guestFinalCountDecision(context);
  const kitItems = emergencyKitItems();
  const dayOfScenarios = dayOfExecutionScenarios();
  const weatherVerified = input.weatherProviderReadiness
    ? input.weatherProviderReadiness.productionEvidenceReady
    : Boolean(input.weatherProviderReady);
  const markdown = markdownFor(
    context,
    runSheetItems,
    delayOptions,
    vendorShareRules,
    weatherBackupOptions,
    finalConfirmations,
    finalCountDecision,
    kitItems,
    dayOfScenarios,
  );
  const scheduleItems: WeddingPlanningScheduleItem[] = date
    ? runSheetItems.map((item) => ({
      id: `wedding_schedule:run-sheet:${safeWeddingLabel(item.title)}:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
      title: item.title,
      kind: "other",
      dateLabel: "Draft day-of run sheet",
      startAt: dateTime(date, item.time),
      allDay: false,
      location: item.location ?? location,
      participants: [item.owner],
      source: "agent",
      reviewStatus: "needs_review",
      approvalState: "draft",
      metadata,
      notes: `Draft run-sheet item. ${item.durationLabel}${item.bufferLabel ? ` with ${item.bufferLabel} buffer` : ""}.`,
    }))
    : [];
  const tasks = finalPhaseTaskItems(metadata, finalCountDecision, kitItems);
  const artifactInput = {
    id: `wedding_artifact:final_phase:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    title: "Final planning run sheet and contingency plan",
    kind: "timeline" as const,
    metadata,
    sourceLabels: [
      "Wedding Planning Need-To-Know answers",
      weatherVerified ? "Verified weather provider evidence" : "Weather provider not connected",
      ...(input.weatherProviderReadiness?.evidenceLabels ?? []),
    ],
    locationLabels: location ? [location] : [],
    linkedTaskIds: tasks.map((taskItem) => taskItem.id),
    linkedCalendarEventIds: scheduleItems.map((item) => item.id),
    bodyText: markdown,
    exportTargets: ["markdown", "html", "word_doc", "browser_pdf"],
  };
  const summary = normalizeWeddingArtifactSummary(artifactInput)!;
  return {
    runSheetReadiness: date && location ? "ready_for_draft" : "needs_date_location",
    weatherReadiness: weatherVerified ? "verified" : input.weatherProviderReadiness?.status === "handoff_only" ? "handoff_only" : "provider_needed",
    runSheetItems,
    delayOptions,
    vendorShareRules,
    weatherBackupOptions,
    finalConfirmationItems: finalConfirmations,
    guestFinalCountDecision: finalCountDecision,
    dayOfExecutionScenarios: dayOfScenarios,
    emergencyKitItems: kitItems,
    artifact: { input: artifactInput, summary, markdown, csv: null },
    scheduleItems,
    taskItems: tasks,
    caveatLabels: [
      "Do not auto-notify vendors or guests without approval.",
      "Do not claim BOM/weather verification until a provider writes a dated forecast result.",
      "Do not auto-trigger backup execution without the user choosing an option and approving notifications.",
      "Do not auto-remind vendors, submit final counts, or confirm payments without explicit approval.",
    ],
  };
}
