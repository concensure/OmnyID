// @locs-version: 2.0
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
import type { WeddingBoundaryLedgerObject } from "@/lib/weddingBoundaryLedgerState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import { normalizeWeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";
import {
  buildWeddingRsvpResponseSummary,
  type WeddingRsvpEventSnapshot,
  type WeddingRsvpResponseSummaryState,
} from "@/lib/weddingRsvpResponseState";

export type WeddingGuestTrackingState = {
  guestFileCount: number;
  guestRowCount: number;
  guestRows?: WeddingGuestTrackingRow[];
  attendingCount: number;
  declinedCount: number;
  pendingCount: number;
  householdCount: number;
  dietaryCount: number;
  accessibilityCount: number;
  missingContactCount: number;
  missingMealCount: number;
  finalCountOptions: WeddingGuestFinalCountOption[];
  followUpTaskCandidates: WeddingGuestFollowUpTaskCandidate[];
  boundaryRuleLabels: string[];
  invitationScopeLabels: string[];
  summaryLabel: string;
  warningLabels: string[];
  sourceLabels: string[];
  rsvpResponseSummary: WeddingRsvpResponseSummaryState;
};

export type WeddingGuestTrackingRow = {
  id: string;
  personId: string | null;
  displayName: string;
  ageBand?: "adult" | "child_under_12" | "teen" | "unknown" | null;
  householdId?: string | null;
  householdLabel: string;
  rsvpStatus: "Attending" | "Not attending" | "Pending";
  contactLabel: string | null;
  mealPreference: string | null;
  dietaryNote: string | null;
  accessibilityNote: string | null;
  mealRequired: boolean;
  eventResponses: WeddingRsvpEventSnapshot[];
  sourceLabel: string;
};

export type WeddingGuestFollowUpTaskInput = {
  guestTracking?: WeddingGuestTrackingState | null;
  metadata?: unknown;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
};

export type WeddingGuestFinalCountDecisionTaskInput = WeddingGuestFollowUpTaskInput;

export type WeddingGuestFinalCountOption = {
  id: string;
  label: string;
  headcount: number;
  budgetImpactAmount: number | null;
  riskLabel: string;
  recommendationLabel: string;
};

export type WeddingGuestFollowUpTaskCandidate = {
  id: string;
  title: string;
  priorityLabel: string;
  reasonLabel: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function splitMarkdownTableRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isDividerRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseMarkdownTable(body: string): { headers: string[]; rows: string[][] } | null {
  const lines = body.split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerLine = lines[index]?.trim() ?? "";
    const dividerLine = lines[index + 1]?.trim() ?? "";
    if (!headerLine.startsWith("|") || !dividerLine.startsWith("|")) continue;
    const headers = splitMarkdownTableRow(headerLine);
    if (!isDividerRow(splitMarkdownTableRow(dividerLine))) continue;
    const rows: string[][] = [];
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const rowLine = lines[rowIndex]?.trim() ?? "";
      if (!rowLine.startsWith("|")) break;
      rows.push(splitMarkdownTableRow(rowLine));
    }
    return { headers, rows };
  }
  return null;
}

function headerIndex(headers: readonly string[], pattern: RegExp): number {
  return headers.findIndex((header) => pattern.test(header));
}

function cell(row: readonly string[], index: number): string {
  return index >= 0 ? clean(row[index]) : "";
}

function hasUsefulValue(value: string): boolean {
  const normalized = clean(value).toLowerCase();
  return Boolean(normalized) && !/^(n\/a|none|no|unknown|tbc|tbd|pending)$/.test(normalized);
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function metadataSupertags(artifact: WeddingArtifactInput): string[] {
  const metadata = metadataRecord(artifact.metadata);
  const tags = metadata.supertags ?? metadata.super_tags;
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0) : [];
}

function importedPrivateArtifact(artifact: WeddingArtifactInput): boolean {
  return metadataSupertags(artifact).some((tag) => /^wedding_import(?:$|:)/i.test(tag))
    || clean(artifact.id).startsWith("wedding_import:")
    || [
      artifact.title,
      ...(artifact.sourceLabels ?? []),
    ].map(clean).some((label) => (
      /^wedding_import(?:$|:)/i.test(label)
      || /original upload/i.test(label)
      || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(label)
      || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(label)
      || /\b[^,\s]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(label)
    ));
}

function guestSourceLabel(artifact: WeddingArtifactInput): string {
  if (importedPrivateArtifact(artifact)) return "Imported private planning file";
  return clean(artifact.title) || "Guest list";
}

function rsvpStatus(value: string): "attending" | "declined" | "pending" {
  if (/\b(yes|attending|accepted|confirmed|coming)\b/i.test(value)) return "attending";
  if (/\b(no|declined|not attending|unable)\b/i.test(value)) return "declined";
  return "pending";
}

function rsvpStatusLabel(value: string): WeddingGuestTrackingRow["rsvpStatus"] {
  const status = rsvpStatus(value);
  if (status === "attending") return "Attending";
  if (status === "declined") return "Not attending";
  return "Pending";
}

function invitationAttendance(
  value: Extract<WeddingBoundaryLedgerObject, { kind: "wedding_boundary_event_invitation" }>["invitationStatus"],
): WeddingGuestTrackingRow["rsvpStatus"] {
  if (value === "rsvp_yes") return "Attending";
  if (value === "rsvp_no" || value === "declined_by_couple") return "Not attending";
  return "Pending";
}

function uniqueHouseholdKey(name: string, household: string): string {
  const key = clean(household).toLowerCase();
  if (key) return key;
  const familyGuess = clean(name).split(/\s+/).slice(-1)[0]?.toLowerCase() ?? "";
  return familyGuess || clean(name).toLowerCase();
}

function finalCountOptions(input: {
  attendingCount: number;
  pendingCount: number;
  estimatedCostPerGuest: number | null;
}): WeddingGuestFinalCountOption[] {
  const current = input.attendingCount;
  const withPending = input.attendingCount + input.pendingCount;
  const conservative = Math.max(0, input.attendingCount - Math.min(5, Math.max(0, Math.ceil(input.attendingCount * 0.03))));
  const cost = input.estimatedCostPerGuest;
  return [
    {
      id: "submit_current_count",
      label: `Submit current count (${current})`,
      headcount: current,
      budgetImpactAmount: cost === null ? null : current * cost,
      riskLabel: input.pendingCount > 0 ? `${input.pendingCount} pending RSVP${input.pendingCount === 1 ? "" : "s"} may still change the count.` : "Lowest coordination risk if RSVP source is current.",
      recommendationLabel: input.pendingCount === 0 ? "Recommended when caterer deadline is near." : "Use when deadline is hard and late additions are acceptable.",
    },
    {
      id: "wait_for_pending_rsvps",
      label: `Count every pending RSVP as attending (${withPending})`,
      headcount: withPending,
      budgetImpactAmount: cost === null ? null : withPending * cost,
      riskLabel: input.pendingCount > 0 ? "Risk: caterer deadline or late-count fees may apply." : "No pending RSVPs to wait for.",
      recommendationLabel: input.pendingCount > 0 ? "Use only if caterer deadline allows another follow-up cycle." : "Not needed unless new guests are being added.",
    },
    {
      id: "hold_conservative_buffer",
      label: `Hold conservative guarantee (${conservative})`,
      headcount: conservative,
      budgetImpactAmount: cost === null ? null : conservative * cost,
      riskLabel: "Risk: undercounting can create day-of meal or seating shortages.",
      recommendationLabel: "Use only when venue/caterer allows flexible top-up and the couple accepts the service risk.",
    },
  ];
}

function followUpTaskCandidates(input: {
  pendingCount: number;
  missingContactCount: number;
  missingMealCount: number;
}): WeddingGuestFollowUpTaskCandidate[] {
  return [
    input.pendingCount > 0 ? {
      id: "wedding_guest_follow_up:pending_rsvps",
      title: `Follow up ${input.pendingCount} pending RSVP${input.pendingCount === 1 ? "" : "s"}`,
      priorityLabel: "High before final count",
      reasonLabel: "Pending guests affect caterer headcount, seating, transport, and budget.",
    } : null,
    input.missingContactCount > 0 ? {
      id: "wedding_guest_follow_up:missing_contacts",
      title: `Add contact details for ${input.missingContactCount} guest${input.missingContactCount === 1 ? "" : "s"}`,
      priorityLabel: "Medium",
      reasonLabel: "Missing contact details block RSVP reminders and day-of updates.",
    } : null,
    input.missingMealCount > 0 ? {
      id: "wedding_guest_follow_up:missing_meals",
      title: `Collect meal choices for ${input.missingMealCount} attending guest${input.missingMealCount === 1 ? "" : "s"}`,
      priorityLabel: "High before caterer brief",
      reasonLabel: "Meal gaps affect catering, dietary coordination, and final-count submission.",
    } : null,
  ].filter((task): task is WeddingGuestFollowUpTaskCandidate => task !== null);
}

function taskRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function existingGuestFollowUpKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const metadata = taskRecord(item.metadata);
    const sourceCandidateId = clean(metadata.guest_follow_up_candidate_id);
    if (sourceCandidateId) keys.add(sourceCandidateId);
  }
  return keys;
}

function existingGuestFinalCountKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const metadata = taskRecord(item.metadata);
    if (metadata.guest_final_count_decision === true) keys.add("wedding_guest_final_count_decision");
  }
  return keys;
}

function priorityForGuestTask(candidate: WeddingGuestFollowUpTaskCandidate): WeddingPlanningTaskItem["priority"] {
  if (candidate.priorityLabel.toLowerCase().startsWith("high")) return "high";
  return "normal";
}

function activeBoundaryRuleLabels(objects: readonly WeddingBoundaryLedgerObject[] | null | undefined): string[] {
  return (objects ?? [])
    .filter((object): object is Extract<WeddingBoundaryLedgerObject, { kind: "wedding_boundary_policy" }> => (
      object.kind === "wedding_boundary_policy"
      && (object.status ?? "active") === "active"
      && ["plus_one", "children", "invitation_scope"].includes(object.ruleType)
    ))
    .map((policy) => clean(policy.plainLanguage) || clean(policy.title))
    .filter(Boolean)
    .slice(0, 4);
}

function invitationScopeLabels(objects: readonly WeddingBoundaryLedgerObject[] | null | undefined): string[] {
  const invitations = (objects ?? [])
    .filter((object): object is Extract<WeddingBoundaryLedgerObject, { kind: "wedding_boundary_event_invitation" }> => (
      object.kind === "wedding_boundary_event_invitation"
      && object.invitationStatus !== "not_invited"
      && object.invitationStatus !== "declined_by_couple"
    ));
  const plusOneAllowed = invitations.filter((invitation) => invitation.plusOneAllowed === true).length;
  const plusOneBlocked = invitations.filter((invitation) => invitation.plusOneAllowed === false).length;
  const childrenInvited = invitations.filter((invitation) => invitation.childrenInvited === true).length;
  const childrenBlocked = invitations.filter((invitation) => invitation.childrenInvited === false).length;
  return [
    plusOneAllowed + plusOneBlocked > 0
      ? `Plus-ones: ${plusOneAllowed} included, ${plusOneBlocked} not included`
      : null,
    childrenInvited + childrenBlocked > 0
      ? `Children: ${childrenInvited} included, ${childrenBlocked} not included`
      : null,
  ].filter((label): label is string => Boolean(label));
}

export function buildWeddingGuestFollowUpTaskItems(input: WeddingGuestFollowUpTaskInput): WeddingPlanningTaskItem[] {
  const guests = input.guestTracking;
  if (!guests) return [];
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const existingKeys = existingGuestFollowUpKeys(input.existingTaskItems ?? []);
  return guests.followUpTaskCandidates
    .filter((candidate) => !existingKeys.has(candidate.id))
    .map((candidate): WeddingPlanningTaskItem => ({
      id: candidate.id,
      title: candidate.title,
      kind: candidate.id.includes("meal") ? "rsvp" : "guest_list",
      dueLabel: candidate.id.includes("pending_rsvps") ? "Before final guest count" : "Before vendor guest brief",
      priority: priorityForGuestTask(candidate),
      source: "agent",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        ...metadata,
        guest_follow_up: true,
        guest_follow_up_candidate_id: candidate.id,
        guest_follow_up_reason: candidate.reasonLabel,
        preparation_checklist: true,
        preparation_checklist_item: "guest_follow_up",
        user_selectable: true,
        can_deselect_before_commit: true,
        alert_offset_days: [14, 3],
        schedule_basis: "guest_list_operational_gap",
        searchable_terms: [
          candidate.title,
          candidate.reasonLabel,
          candidate.priorityLabel,
          "wedding guest list",
          "RSVP follow-up",
          "guest operations",
          metadata.weddingPlanId,
          metadata.responseWorkspaceId,
        ].filter(Boolean),
      },
      notes: candidate.reasonLabel,
    }));
}

export function buildWeddingGuestFinalCountDecisionTaskItems(input: WeddingGuestFinalCountDecisionTaskInput): WeddingPlanningTaskItem[] {
  const guests = input.guestTracking;
  if (!guests || guests.finalCountOptions.length === 0) return [];
  const existingKeys = existingGuestFinalCountKeys(input.existingTaskItems ?? []);
  if (existingKeys.has("wedding_guest_final_count_decision")) return [];
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const optionLabels = guests.finalCountOptions.map((option) => option.label);
  const riskLabels = guests.finalCountOptions.map((option) => option.riskLabel);
  return [{
    id: "wedding_guest_final_count_decision",
    title: `Choose final guest count option (${guests.attendingCount} confirmed, ${guests.pendingCount} pending)`,
    kind: "decision",
    dueLabel: "Before caterer final-number deadline",
    priority: guests.pendingCount > 0 || guests.missingMealCount > 0 ? "high" : "normal",
    source: "agent",
    reviewStatus: "accepted",
    approvalState: "draft",
    metadata: {
      ...metadata,
      guest_final_count_decision: true,
      guest_final_count_attending: guests.attendingCount,
      guest_final_count_pending: guests.pendingCount,
      guest_final_count_declined: guests.declinedCount,
      guest_final_count_option_ids: guests.finalCountOptions.map((option) => option.id),
      guest_final_count_option_labels: optionLabels,
      guest_final_count_headcounts: guests.finalCountOptions.map((option) => option.headcount),
      guest_final_count_budget_impacts: guests.finalCountOptions.map((option) => option.budgetImpactAmount),
      guest_final_count_risk_labels: riskLabels,
      preparation_checklist: true,
      preparation_checklist_item: "guest_final_count_decision",
      user_selectable: true,
      can_deselect_before_commit: true,
      alert_offset_days: [21, 7, 3],
      schedule_basis: "caterer_final_count_decision",
      searchable_terms: [
        "final guest count",
        "caterer final numbers",
        "RSVP decision",
        "wedding guest list",
        ...optionLabels,
        ...riskLabels,
        metadata.weddingPlanId,
        metadata.responseWorkspaceId,
      ].filter(Boolean),
    },
    notes: `DecisionOS should present options: ${optionLabels.join("; ")}.`,
  }];
}

export function buildWeddingGuestTrackingState(input: {
  artifacts?: readonly WeddingArtifactInput[] | null;
  boundaryObjects?: readonly WeddingBoundaryLedgerObject[] | null;
  estimatedCostPerGuest?: number | null;
}): WeddingGuestTrackingState {
  const guestArtifacts = (input.artifacts ?? []).filter((artifact) => artifact.kind === "guest_list");
  let guestRowCount = 0;
  let attendingCount = 0;
  let declinedCount = 0;
  let pendingCount = 0;
  let dietaryCount = 0;
  let accessibilityCount = 0;
  let missingContactCount = 0;
  let missingMealCount = 0;
  const householdKeys = new Set<string>();
  const sourceLabels: string[] = [];
  const guestRows: WeddingGuestTrackingRow[] = [];

  for (const artifact of guestArtifacts) {
    const body = clean(artifact.bodyText);
    const table = body ? parseMarkdownTable(body) : null;
    if (!table) continue;
    sourceLabels.push(guestSourceLabel(artifact));
    const rsvpIndex = headerIndex(table.headers, /\b(rsvp|attendance|attending|status)\b/i);
    const contactIndex = headerIndex(table.headers, /\b(email|phone|contact)\b/i);
    const nameIndex = headerIndex(table.headers, /\b(name|guest)\b/i);
    const householdIndex = headerIndex(table.headers, /\b(household|family|group|party)\b/i);
    const mealIndex = headerIndex(table.headers, /\b(meal|menu|food)\b/i);
    const dietaryIndex = headerIndex(table.headers, /\b(dietary|allerg|vegan|vegetarian|gluten|nut)\b/i);
    const accessibilityIndex = headerIndex(table.headers, /\b(accessibility|access|mobility|wheelchair|sensory)\b/i);
    const sourceLabel = guestSourceLabel(artifact);

    for (const [rowIndex, row] of table.rows.entries()) {
      const displayName = cell(row, nameIndex) || `Guest ${guestRowCount + 1}`;
      const rawHouseholdLabel = cell(row, householdIndex);
      const householdLabel = rawHouseholdLabel || "Ungrouped";
      const contactLabel = cell(row, contactIndex);
      const mealPreference = cell(row, mealIndex);
      const dietaryNote = cell(row, dietaryIndex);
      const accessibilityNote = cell(row, accessibilityIndex);
      guestRowCount += 1;
      householdKeys.add(uniqueHouseholdKey(displayName, rawHouseholdLabel));
      const status = rsvpStatus(cell(row, rsvpIndex));
      if (status === "attending") attendingCount += 1;
      else if (status === "declined") declinedCount += 1;
      else pendingCount += 1;
      if (hasUsefulValue(dietaryNote)) dietaryCount += 1;
      if (hasUsefulValue(accessibilityNote)) accessibilityCount += 1;
      if (contactIndex >= 0 && !hasUsefulValue(contactLabel)) missingContactCount += 1;
      if (status === "attending" && mealIndex >= 0 && !hasUsefulValue(mealPreference)) missingMealCount += 1;
      guestRows.push({
        id: `${clean(artifact.id) || clean(artifact.title) || "guest_list"}:guest:${rowIndex}`,
        personId: null,
        displayName,
        householdId: null,
        householdLabel,
        rsvpStatus: rsvpStatusLabel(cell(row, rsvpIndex)),
        contactLabel: hasUsefulValue(contactLabel) ? contactLabel : null,
        mealPreference: hasUsefulValue(mealPreference) ? mealPreference : null,
        dietaryNote: hasUsefulValue(dietaryNote) ? dietaryNote : null,
        accessibilityNote: hasUsefulValue(accessibilityNote) ? accessibilityNote : null,
        mealRequired: mealIndex >= 0,
        eventResponses: [],
        sourceLabel,
      });
    }
  }

  const boundaryProfiles = new Map<string, Extract<WeddingBoundaryLedgerObject, { kind: "wedding_boundary_guest_profile" }>>();
  const boundaryInvitations = new Map<string, Array<Extract<WeddingBoundaryLedgerObject, { kind: "wedding_boundary_event_invitation" }>>>();
  const boundaryHouseholds = new Map<string, Extract<WeddingBoundaryLedgerObject, { kind: "wedding_boundary_household" }>>();
  for (const object of input.boundaryObjects ?? []) {
    if (object.kind === "wedding_boundary_guest_profile") boundaryProfiles.set(object.personId, object);
    if (object.kind === "wedding_boundary_event_invitation") {
      const invitations = boundaryInvitations.get(object.personId) ?? [];
      invitations.push(object);
      boundaryInvitations.set(object.personId, invitations);
    }
    if (object.kind === "wedding_boundary_household") boundaryHouseholds.set(object.householdId, object);
  }
  if (boundaryProfiles.size > 0) sourceLabels.push("Saved guest records");
  for (const profile of boundaryProfiles.values()) {
    const invitations = (boundaryInvitations.get(profile.personId) ?? [])
      .filter((invitation) => invitation.invitationStatus !== "not_invited");
    guestRowCount += 1;
    const householdLabel = (boundaryHouseholds.get(profile.householdId ?? "")?.displayName
      ?? clean(profile.householdId)
      ?? "Ungrouped");
    householdKeys.add(uniqueHouseholdKey(profile.displayName, householdLabel));
    const attendance = invitations.some((invitation) => invitation.invitationStatus === "rsvp_yes")
      ? "Attending"
      : invitations.length > 0 && invitations.every((invitation) => ["rsvp_no", "declined_by_couple"].includes(invitation.invitationStatus))
        ? "Not attending"
        : "Pending";
    if (attendance === "Attending") attendingCount += 1;
    else if (attendance === "Not attending") declinedCount += 1;
    else pendingCount += 1;
    if (hasUsefulValue(profile.dietaryNote ?? "")) dietaryCount += 1;
    if (hasUsefulValue(profile.accessibilityNote ?? "")) accessibilityCount += 1;
    if (!hasUsefulValue(profile.contactLabel ?? "")) missingContactCount += 1;
    if (attendance === "Attending" && !hasUsefulValue(profile.mealPreference ?? "")) missingMealCount += 1;
    guestRows.push({
      id: `boundary:${profile.personId}`,
      personId: profile.personId,
      displayName: profile.displayName,
      ageBand: profile.ageBand ?? "unknown",
      householdId: profile.householdId ?? null,
      householdLabel,
      rsvpStatus: attendance,
      contactLabel: hasUsefulValue(profile.contactLabel ?? "") ? profile.contactLabel ?? null : null,
      mealPreference: hasUsefulValue(profile.mealPreference ?? "") ? profile.mealPreference ?? null : null,
      dietaryNote: hasUsefulValue(profile.dietaryNote ?? "") ? profile.dietaryNote ?? null : null,
      accessibilityNote: hasUsefulValue(profile.accessibilityNote ?? "") ? profile.accessibilityNote ?? null : null,
      mealRequired: !invitations.some((invitation) => invitation.mealRequirement === "none"),
      eventResponses: invitations.map((invitation) => ({
        invitationId: invitation.invitationId,
        eventId: invitation.eventId,
        attendance: invitationAttendance(invitation.invitationStatus),
        responseSource: invitation.responseSource ?? null,
        viewedAt: invitation.viewedAt ?? null,
        respondedAt: invitation.respondedAt ?? null,
        lockedAt: invitation.lockedAt ?? null,
        changed: Boolean(invitation.previousInvitationStatus && invitation.previousInvitationStatus !== invitation.invitationStatus),
        revision: invitation.responseRevision ?? null,
        plusOneAllowed: invitation.plusOneAllowed === true,
        childrenInvited: invitation.childrenInvited === true,
        guestRole: invitation.guestRole ?? "primary",
        companionToPersonId: invitation.companionToPersonId ?? null,
        namePending: invitation.namePending === true,
        seatRequirement: invitation.seatRequirement ?? "unknown",
        mealRequirement: invitation.mealRequirement ?? "unknown",
      })),
      sourceLabel: "Saved in your guest list",
    });
  }

  const rsvpResponseSummary = buildWeddingRsvpResponseSummary(guestRows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    attendance: row.rsvpStatus,
    mealPreference: row.mealPreference,
    mealRequired: row.mealRequired,
    dietaryNote: row.dietaryNote,
    accessibilityNote: row.accessibilityNote,
    sourceLabel: row.sourceLabel,
    eventResponses: row.eventResponses,
  })));

  const warningLabels = [
    pendingCount > 0 ? `${pendingCount} RSVP${pendingCount === 1 ? "" : "s"} still pending` : null,
    missingContactCount > 0 ? `${missingContactCount} guest contact${missingContactCount === 1 ? "" : "s"} missing` : null,
    missingMealCount > 0 ? `${missingMealCount} attending guest${missingMealCount === 1 ? "" : "s"} missing meal choice` : null,
  ].filter((label): label is string => Boolean(label));
  const cost = typeof input.estimatedCostPerGuest === "number" && Number.isFinite(input.estimatedCostPerGuest) && input.estimatedCostPerGuest > 0
    ? Math.round(input.estimatedCostPerGuest)
    : null;
  const options = guestRowCount > 0 ? finalCountOptions({ attendingCount, pendingCount, estimatedCostPerGuest: cost }) : [];
  const tasks = followUpTaskCandidates({ pendingCount, missingContactCount, missingMealCount });
  const ruleLabels = activeBoundaryRuleLabels(input.boundaryObjects);
  const scopeLabels = invitationScopeLabels(input.boundaryObjects);

  return {
    guestFileCount: guestArtifacts.length,
    guestRowCount,
    guestRows: guestRows.slice(0, 80),
    attendingCount,
    declinedCount,
    pendingCount,
    householdCount: householdKeys.size,
    dietaryCount,
    accessibilityCount,
    missingContactCount,
    missingMealCount,
    finalCountOptions: options,
    followUpTaskCandidates: tasks,
    boundaryRuleLabels: ruleLabels,
    invitationScopeLabels: scopeLabels,
    summaryLabel: guestRowCount === 0
      ? "No structured guest-list rows detected yet."
      : `${guestRowCount} guest row${guestRowCount === 1 ? "" : "s"} tracked across ${householdKeys.size} household${householdKeys.size === 1 ? "" : "s"}; ${attendingCount} attending, ${pendingCount} pending.`,
    warningLabels,
    sourceLabels,
    rsvpResponseSummary,
  };
}
