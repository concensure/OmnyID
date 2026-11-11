// @locs-version: 2.0
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
import type { WeddingBoundaryLedgerObject } from "@/lib/weddingBoundaryLedgerState";
import type { WeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import { normalizeWeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";
import {
  buildWeddingSeatingOptimizationResult,
  type WeddingSeatingOptimizationNeed,
  type WeddingSeatingOptimizationResult,
  type WeddingSeatingPersonNode,
  type WeddingSeatingTableNode,
} from "@/lib/weddingSeatingOptimizationState";
import {
  applyWeddingSeatingConstraintAction,
  type WeddingSeatingConstraintAction,
} from "@/lib/weddingSeatingConstraintActionState";

export type WeddingSeatingPlanState = {
  guestRowsConsidered: number;
  assignedSeatCount: number;
  unassignedAttendingCount: number;
  tableCount: number;
  householdGroupCount: number;
  vipOrWeddingPartyCount: number;
  sensitiveConstraintCount: number;
  accessibilityConstraintCount: number;
  suggestedTableCount: number;
  statusLabel: string;
  summaryLabel: string;
  warningLabels: string[];
  tableLabels: string[];
  tableBriefs: WeddingSeatingTableBrief[];
  vendorBriefLines: string[];
  actionItems: WeddingSeatingActionItem[];
  dietaryAccessibilityBrief: WeddingDietaryAccessibilityBrief;
  optimizationPreview: WeddingSeatingOptimizationResult | null;
  optimizationPeople: WeddingSeatingPersonNode[];
  optimizationTables: WeddingSeatingTableNode[];
};

export type WeddingSeatingTableBrief = {
  tableLabel: string;
  guestCount: number;
  householdLabels: string[];
  vipOrWeddingPartyCount: number;
  dietaryOrAccessibilityCount: number;
  sensitiveConstraintCount: number;
  summaryLabel: string;
};

export type WeddingSeatingActionItem = {
  id: string;
  title: string;
  priorityLabel: string;
  reasonLabel: string;
};

export type WeddingDietaryAccessibilityBrief = {
  dietarySummaryLabels: string[];
  accessibilitySummaryLabels: string[];
  severeAllergyCount: number;
  approvalRequiredLabels: string[];
  correctionLoopLabel: string;
};

export type WeddingSeatingActionTaskInput = {
  seatingPlan?: WeddingSeatingPlanState | null;
  metadata?: unknown;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function splitMarkdownTableRow(line: string): string[] {
  return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
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

function isAttending(value: string): boolean {
  return /\b(yes|attending|accepted|confirmed|coming)\b/i.test(value);
}

function hasUsefulValue(value: string): boolean {
  const normalized = clean(value).toLowerCase();
  return Boolean(normalized) && !/^(n\/a|none|no|unknown|tbc|tbd|pending)$/.test(normalized);
}

function hasSensitiveSeating(value: string): boolean {
  return /\b(divorc|separate|avoid|conflict|estranged|sensitive|do not seat|not together|keep apart)\b/i.test(value);
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function dietaryCategories(value: string): string[] {
  const text = value.toLowerCase();
  const categories: string[] = [];
  if (/\bvegan\b/.test(text)) categories.push("vegan");
  if (/\bvegetarian\b/.test(text)) categories.push("vegetarian");
  if (/\bgluten[-\s]?free|coeliac|celiac\b/.test(text)) categories.push("gluten-free/coeliac");
  if (/\bnut|peanut|tree nut\b/.test(text)) categories.push("nut allergy");
  if (/\bdairy|lactose\b/.test(text)) categories.push("dairy/lactose");
  if (/\bseafood|shellfish|fish\b/.test(text)) categories.push("seafood/shellfish");
  if (/\bhalal\b/.test(text)) categories.push("halal");
  if (/\bkosher\b/.test(text)) categories.push("kosher");
  if (categories.length === 0 && hasUsefulValue(value)) categories.push("other dietary note");
  return categories;
}

function accessibilityCategories(value: string): string[] {
  const text = value.toLowerCase();
  const categories: string[] = [];
  if (/\bwheelchair\b/.test(text)) categories.push("wheelchair access");
  if (/\bmobility|walker|crutch|cane|step[-\s]?free|stairs?\b/.test(text)) categories.push("mobility/step-free access");
  if (/\bhearing|auslan|caption\b/.test(text)) categories.push("hearing support");
  if (/\bvision|visual|low[-\s]?vision\b/.test(text)) categories.push("vision support");
  if (/\bsensory|quiet|neurodivergent\b/.test(text)) categories.push("sensory support");
  if (categories.length === 0 && hasUsefulValue(value)) categories.push("other accessibility note");
  return categories;
}

function seatingId(value: string, fallback: string): string {
  const normalized = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized || fallback;
}

function accessibilityNeeds(value: string): WeddingSeatingOptimizationNeed[] {
  const text = value.toLowerCase();
  const needs: WeddingSeatingOptimizationNeed[] = [];
  if (/\bwheelchair\b/.test(text)) needs.push("wheelchair");
  if (/\bmobility|walker|crutch|cane|step[-\s]?free|stairs?\b/.test(text)) needs.push("mobility");
  if (/\bhearing|auslan|caption\b/.test(text)) needs.push("hearing");
  if (/\bvision|visual|low[-\s]?vision\b/.test(text)) needs.push("vision");
  if (/\bsensory|quiet|neurodivergent\b/.test(text)) needs.push("sensory");
  return Array.from(new Set(needs));
}

function splitList(value: string): string[] {
  return value.split(/[,;/]|\band\b/i).map((item) => item.trim()).filter(Boolean);
}

function conflictLabels(value: string): string[] {
  const match = value.match(/\b(?:do not seat with|not together with|keep apart from|avoid|conflict with)\s+([^.;]+)/i);
  return match ? splitList(match[1] ?? "") : [];
}

function tableNodes(labels: readonly string[], suggestedCount: number, seatsPerTable: number, needsAccessible: boolean): WeddingSeatingTableNode[] {
  const sourceLabels = labels.slice();
  for (let index = sourceLabels.length; index < Math.max(1, suggestedCount); index += 1) {
    sourceLabels.push(`Table ${index + 1}`);
  }
  return sourceLabels.map((label, index) => ({
    id: seatingId(label, `table-${index + 1}`),
    label,
    capacity: seatsPerTable,
    accessible: needsAccessible ? index === 0 : true,
    distanceToExitMeters: index === 0 ? 8 : 18,
    distanceToSpeakerMeters: index === 0 ? 19 : 9,
  }));
}

function applyConflictLabels(people: WeddingSeatingPersonNode[], pending: Map<string, string[]>): WeddingSeatingPersonNode[] {
  const idByLabel = new Map(people.map((person) => [person.label.toLowerCase(), person.id]));
  return people.map((person) => {
    const conflicts = (pending.get(person.id) ?? [])
      .map((label) => idByLabel.get(label.toLowerCase()) ?? "")
      .filter(Boolean);
    return conflicts.length > 0
      ? { ...person, conflictPersonIds: Array.from(new Set([...(person.conflictPersonIds ?? []), ...conflicts])) }
      : person;
  });
}

function countLabels(map: Map<string, number>): string[] {
  return Array.from(map.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([label, count]) => `${count} ${label}`);
}

function tableBriefSummary(brief: Omit<WeddingSeatingTableBrief, "summaryLabel">): string {
  const signals = [
    `${brief.guestCount} guest${brief.guestCount === 1 ? "" : "s"}`,
    brief.householdLabels.length > 0 ? `${brief.householdLabels.length} household group${brief.householdLabels.length === 1 ? "" : "s"}` : null,
    brief.vipOrWeddingPartyCount > 0 ? `${brief.vipOrWeddingPartyCount} VIP/party guest${brief.vipOrWeddingPartyCount === 1 ? "" : "s"}` : null,
    brief.dietaryOrAccessibilityCount > 0 ? `${brief.dietaryOrAccessibilityCount} meal/accessibility note${brief.dietaryOrAccessibilityCount === 1 ? "" : "s"}` : null,
    brief.sensitiveConstraintCount > 0 ? `${brief.sensitiveConstraintCount} sensitive constraint${brief.sensitiveConstraintCount === 1 ? "" : "s"}` : null,
  ].filter((label): label is string => Boolean(label));
  return signals.join("; ");
}

function seatingActionItems(input: {
  unassignedAttendingCount: number;
  sensitiveConstraintCount: number;
  accessibilityConstraintCount: number;
  householdGroupCount: number;
  attendingCount: number;
}): WeddingSeatingActionItem[] {
  return [
    input.unassignedAttendingCount > 0 ? {
      id: "wedding_seating_action:assign_tables",
      title: `Assign ${input.unassignedAttendingCount} attending guest${input.unassignedAttendingCount === 1 ? "" : "s"} to tables`,
      priorityLabel: "High before seating export",
      reasonLabel: "Unassigned attending guests block venue/caterer table plans and place cards.",
    } : null,
    input.sensitiveConstraintCount > 0 ? {
      id: "wedding_seating_action:confirm_sensitive_constraints",
      title: `Confirm ${input.sensitiveConstraintCount} sensitive seating constraint${input.sensitiveConstraintCount === 1 ? "" : "s"}`,
      priorityLabel: "High privacy-sensitive",
      reasonLabel: "Sensitive relationship constraints should be confirmed by the couple before sharing with vendors.",
    } : null,
    input.accessibilityConstraintCount > 0 ? {
      id: "wedding_seating_action:brief_accessibility",
      title: `Brief venue on ${input.accessibilityConstraintCount} accessibility seating need${input.accessibilityConstraintCount === 1 ? "" : "s"}`,
      priorityLabel: "High before floor plan",
      reasonLabel: "Accessibility needs affect table placement, pathways, lift access, and staff awareness.",
    } : null,
    input.householdGroupCount === 0 && input.attendingCount > 0 ? {
      id: "wedding_seating_action:add_households",
      title: "Add household/family grouping before seating optimization",
      priorityLabel: "Medium",
      reasonLabel: "Household grouping reduces accidental splits and improves first seating drafts.",
    } : null,
  ].filter((item): item is WeddingSeatingActionItem => item !== null);
}

function taskRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function existingSeatingActionKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const candidateId = clean(taskRecord(item.metadata).seating_action_candidate_id);
    if (candidateId) keys.add(candidateId);
  }
  return keys;
}

function seatingTaskKind(action: WeddingSeatingActionItem): WeddingPlanningTaskItem["kind"] {
  if (action.id.includes("accessibility")) return "vendor_coordination";
  return "seating";
}

export function buildWeddingSeatingActionTaskItems(input: WeddingSeatingActionTaskInput): WeddingPlanningTaskItem[] {
  const seating = input.seatingPlan;
  if (!seating) return [];
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const existingKeys = existingSeatingActionKeys(input.existingTaskItems ?? []);
  return seating.actionItems
    .filter((action) => !existingKeys.has(action.id))
    .map((action): WeddingPlanningTaskItem => ({
      id: action.id,
      title: action.title,
      kind: seatingTaskKind(action),
      dueLabel: action.id.includes("assign_tables") ? "Before seating export" : "Before vendor floor-plan brief",
      priority: action.priorityLabel.toLowerCase().startsWith("high") ? "high" : "normal",
      source: "agent",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        ...metadata,
        seating_action: true,
        seating_action_candidate_id: action.id,
        seating_action_reason: action.reasonLabel,
        preparation_checklist: true,
        preparation_checklist_item: "seating_action",
        user_selectable: true,
        can_deselect_before_commit: true,
        alert_offset_days: [21, 7],
        schedule_basis: "guest_list_seating_gap",
        searchable_terms: [
          action.title,
          action.reasonLabel,
          action.priorityLabel,
          "wedding seating",
          "seating chart",
          "guest operations",
          metadata.weddingPlanId,
          metadata.responseWorkspaceId,
        ].filter(Boolean),
      },
      notes: action.reasonLabel,
    }));
}

export function buildWeddingSeatingPlanState(input: {
  artifacts?: readonly WeddingArtifactInput[] | null;
  boundaryObjects?: readonly WeddingBoundaryLedgerObject[] | null;
  seatingConstraints?: readonly WeddingSeatingConstraintAction[] | null;
  seatingOptimizations?: readonly WeddingSeatingOptimizationResult[] | null;
  guestTracking?: WeddingGuestTrackingState | null;
  seatsPerTable?: number | null;
}): WeddingSeatingPlanState {
  const seatsPerTable = Math.max(1, Math.trunc(input.seatsPerTable ?? 10));
  let guestRowsConsidered = 0;
  let assignedSeatCount = 0;
  let unassignedAttendingCount = 0;
  let householdGroupCount = 0;
  let vipOrWeddingPartyCount = 0;
  let sensitiveConstraintCount = 0;
  let accessibilityConstraintCount = 0;
  let severeAllergyCount = 0;
  const tableLabels = new Set<string>();
  const householdLabels = new Set<string>();
  const tableBriefMap = new Map<string, Omit<WeddingSeatingTableBrief, "summaryLabel">>();
  const dietaryMap = new Map<string, number>();
  const accessibilityMap = new Map<string, number>();
  const optimizerPeople: WeddingSeatingPersonNode[] = [];
  const pendingConflictLabels = new Map<string, string[]>();

  for (const artifact of input.artifacts ?? []) {
    if (artifact.kind !== "guest_list") continue;
    const table = parseMarkdownTable(clean(artifact.bodyText));
    if (!table) continue;
    const rsvpIndex = headerIndex(table.headers, /\b(rsvp|attendance|attending|status)\b/i);
    const tableIndex = headerIndex(table.headers, /^(table|table no\.?|table number|seat assignment|assigned table)$/i);
    const householdIndex = headerIndex(table.headers, /\b(household|family|group|party)\b/i);
    const roleIndex = headerIndex(table.headers, /\b(role|vip|wedding party|bridal party|family side)\b/i);
    const noteIndex = headerIndex(table.headers, /\b(note|seating note|sensitive|constraint|relationship)\b/i);
    const nameIndex = headerIndex(table.headers, /\b(name|guest|person)\b/i);
    const languageIndex = headerIndex(table.headers, /\b(language|languages)\b/i);
    const socialIndex = headerIndex(table.headers, /\b(social|friend group|group)\b/i);
    const mealIndex = headerIndex(table.headers, /\b(meal|menu|food)\b/i);
    const dietaryIndex = headerIndex(table.headers, /\b(dietary|allerg|vegan|vegetarian|gluten|nut)\b/i);
    const accessibilityIndex = headerIndex(table.headers, /\b(accessibility|access|mobility|wheelchair|sensory)\b/i);

    for (const [rowNumber, row] of table.rows.entries()) {
      const attending = rsvpIndex < 0 || isAttending(cell(row, rsvpIndex));
      if (!attending) continue;
      guestRowsConsidered += 1;
      const nameLabel = cell(row, nameIndex) || `Guest ${guestRowsConsidered}`;
      const tableLabel = cell(row, tableIndex);
      const householdLabel = cell(row, householdIndex);
      const roleLabel = cell(row, roleIndex);
      const noteLabel = cell(row, noteIndex);
      const dietaryLabel = [cell(row, mealIndex), cell(row, dietaryIndex)].filter(Boolean).join(" ");
      const accessibilityLabel = cell(row, accessibilityIndex);
      const personId = seatingId(nameLabel, `guest-row-${rowNumber + 1}`);
      optimizerPeople.push({
        id: personId,
        label: nameLabel,
        householdId: hasUsefulValue(householdLabel) ? seatingId(householdLabel, "household") : null,
        familyId: hasUsefulValue(householdLabel) ? seatingId(householdLabel, "family") : null,
        relationshipLabel: roleLabel || null,
        languages: splitList(cell(row, languageIndex)),
        accessibilityNeeds: accessibilityNeeds(accessibilityLabel),
        dietaryRequirements: splitList(dietaryLabel),
        weddingPartyRole: roleLabel || null,
        socialGroups: splitList(cell(row, socialIndex)),
        preferences: hasUsefulValue(noteLabel) ? [noteLabel] : [],
      });
      const conflicts = conflictLabels(noteLabel);
      if (conflicts.length > 0) pendingConflictLabels.set(personId, conflicts);
      const isVip = /\b(vip|bride|groom|parent|family|bridal|wedding party|maid|best man|groomsman|bridesmaid)\b/i.test(roleLabel);
      const isSensitive = hasSensitiveSeating(`${noteLabel} ${roleLabel}`);
      const hasDietaryOrAccessibility = hasUsefulValue(dietaryLabel) || hasUsefulValue(accessibilityLabel);
      for (const category of dietaryCategories(dietaryLabel)) increment(dietaryMap, category);
      for (const category of accessibilityCategories(accessibilityLabel)) increment(accessibilityMap, category);
      if (/\b(severe|anaphylaxis|anaphylactic|epi[-\s]?pen|epipen|life[-\s]?threatening)\b/i.test(dietaryLabel)) {
        severeAllergyCount += 1;
      }
      if (hasUsefulValue(tableLabel)) {
        assignedSeatCount += 1;
        tableLabels.add(tableLabel);
        const current = tableBriefMap.get(tableLabel) ?? {
          tableLabel,
          guestCount: 0,
          householdLabels: [],
          vipOrWeddingPartyCount: 0,
          dietaryOrAccessibilityCount: 0,
          sensitiveConstraintCount: 0,
        };
        current.guestCount += 1;
        if (hasUsefulValue(householdLabel) && !current.householdLabels.includes(householdLabel)) current.householdLabels.push(householdLabel);
        current.vipOrWeddingPartyCount += isVip ? 1 : 0;
        current.dietaryOrAccessibilityCount += hasDietaryOrAccessibility ? 1 : 0;
        current.sensitiveConstraintCount += isSensitive ? 1 : 0;
        tableBriefMap.set(tableLabel, current);
      } else {
        unassignedAttendingCount += 1;
      }
      if (hasUsefulValue(householdLabel)) householdLabels.add(householdLabel.toLowerCase());
      if (isVip) vipOrWeddingPartyCount += 1;
      if (isSensitive) sensitiveConstraintCount += 1;
      if (hasUsefulValue(accessibilityLabel)) accessibilityConstraintCount += 1;
    }
  }

  const boundaryProfiles = new Map<string, Extract<WeddingBoundaryLedgerObject, { kind: "wedding_boundary_guest_profile" }>>();
  const boundaryInvitations = new Map<string, Extract<WeddingBoundaryLedgerObject, { kind: "wedding_boundary_event_invitation" }>>();
  for (const object of input.boundaryObjects ?? []) {
    if (object.kind === "wedding_boundary_guest_profile") boundaryProfiles.set(object.personId, object);
    if (object.kind === "wedding_boundary_event_invitation") boundaryInvitations.set(object.personId, object);
  }
  for (const profile of boundaryProfiles.values()) {
    const invitation = boundaryInvitations.get(profile.personId);
    if (invitation?.invitationStatus !== "rsvp_yes") continue;
    guestRowsConsidered += 1;
    unassignedAttendingCount += 1;
    const householdLabel = clean(profile.householdId);
    const roleLabel = clean(profile.relationshipLabel);
    const dietaryLabel = [profile.mealPreference, profile.dietaryNote].map(clean).filter(Boolean).join(" ");
    const accessibilityLabel = clean(profile.accessibilityNote);
    optimizerPeople.push({
      id: profile.personId,
      label: profile.displayName,
      householdId: profile.householdId ?? null,
      familyId: profile.householdId ?? null,
      relationshipLabel: roleLabel || null,
      ageBand: profile.ageBand === "child_under_12" ? "child" : profile.ageBand === "teen" ? "teen" : "adult",
      accessibilityNeeds: accessibilityNeeds(accessibilityLabel),
      dietaryRequirements: splitList(dietaryLabel),
      weddingPartyRole: roleLabel || null,
      socialGroups: profile.familySide ? [profile.familySide] : [],
      preferences: [],
    });
    const isVip = /\b(vip|bride|groom|parent|family|bridal|wedding party|maid|best man|groomsman|bridesmaid)\b/i.test(roleLabel);
    if (hasUsefulValue(householdLabel)) householdLabels.add(householdLabel.toLowerCase());
    if (isVip) vipOrWeddingPartyCount += 1;
    for (const category of dietaryCategories(dietaryLabel)) increment(dietaryMap, category);
    for (const category of accessibilityCategories(accessibilityLabel)) increment(accessibilityMap, category);
    if (/\b(severe|anaphylaxis|anaphylactic|epi[-\s]?pen|epipen|life[-\s]?threatening)\b/i.test(dietaryLabel)) {
      severeAllergyCount += 1;
    }
    if (hasUsefulValue(accessibilityLabel)) accessibilityConstraintCount += 1;
  }

  // A saved visual-canvas result is the current seating authority. Earlier
  // versions only used it as a preview, so an attending guest could remain in
  // the "assign to tables" count after the couple had saved their table.
  const savedOptimizationPreview = (input.seatingOptimizations ?? []).at(-1) ?? null;
  if (savedOptimizationPreview) {
    const knownPeople = new Set(optimizerPeople.map((person) => person.id));
    const savedAssignments = new Map(
      savedOptimizationPreview.assignments
        .filter((assignment) => knownPeople.has(assignment.personId))
        .map((assignment) => [assignment.personId, assignment]),
    );
    if (savedAssignments.size > 0) {
      assignedSeatCount = Math.max(assignedSeatCount, savedAssignments.size);
      unassignedAttendingCount = Math.max(0, guestRowsConsidered - assignedSeatCount);
      for (const assignment of savedAssignments.values()) {
        if (hasUsefulValue(assignment.tableLabel)) tableLabels.add(assignment.tableLabel);
      }
    }
  }

  householdGroupCount = householdLabels.size;
  const attendingCount = Math.max(guestRowsConsidered, input.guestTracking?.attendingCount ?? 0);
  const suggestedTableCount = Math.max(0, Math.ceil(attendingCount / seatsPerTable));
  const warningLabels = [
    unassignedAttendingCount > 0 ? `${unassignedAttendingCount} attending guest${unassignedAttendingCount === 1 ? "" : "s"} not assigned to a table` : null,
    householdGroupCount === 0 && attendingCount > 0 ? "No household or family grouping column detected" : null,
    sensitiveConstraintCount > 0 ? `${sensitiveConstraintCount} sensitive seating constraint${sensitiveConstraintCount === 1 ? "" : "s"} need user confirmation` : null,
    accessibilityConstraintCount > 0 ? `${accessibilityConstraintCount} accessibility seating need${accessibilityConstraintCount === 1 ? "" : "s"} should be vendor-briefed` : null,
  ].filter((label): label is string => Boolean(label));
  const tableBriefs = Array.from(tableBriefMap.values())
    .sort((left, right) => left.tableLabel.localeCompare(right.tableLabel, undefined, { numeric: true }))
    .map((brief) => ({ ...brief, summaryLabel: tableBriefSummary(brief) }));
  const vendorBriefLines = [
    guestRowsConsidered > 0 ? `${guestRowsConsidered} attending guests considered for seating.` : null,
    tableBriefs.length > 0 ? `${tableBriefs.length} named table${tableBriefs.length === 1 ? "" : "s"} detected.` : null,
    unassignedAttendingCount > 0 ? `${unassignedAttendingCount} attending guest${unassignedAttendingCount === 1 ? "" : "s"} still need table assignment before vendor export.` : null,
    accessibilityConstraintCount > 0 ? `${accessibilityConstraintCount} accessibility seating need${accessibilityConstraintCount === 1 ? "" : "s"} should be shared with venue/caterer after approval.` : null,
    sensitiveConstraintCount > 0 ? "Sensitive relationship notes should be minimized or redacted before vendor-facing sharing." : null,
    dietaryMap.size > 0 ? `${Array.from(dietaryMap.values()).reduce((total, value) => total + value, 0)} dietary note${Array.from(dietaryMap.values()).reduce((total, value) => total + value, 0) === 1 ? "" : "s"} should be confirmed before caterer export.` : null,
    severeAllergyCount > 0 ? `${severeAllergyCount} severe allergy note${severeAllergyCount === 1 ? "" : "s"} require explicit approval and vendor acknowledgement.` : null,
  ].filter((label): label is string => Boolean(label));
  const actionItems = seatingActionItems({
    unassignedAttendingCount,
    sensitiveConstraintCount,
    accessibilityConstraintCount,
    householdGroupCount,
    attendingCount,
  });
  const minimumOptimizerTables = (input.seatingConstraints ?? []).some((constraint) => constraint.kind === "keep_apart") && attendingCount > 1
    ? 2
    : 1;
  const optimizerTables = tableNodes(
    Array.from(tableLabels).sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
    Math.max(suggestedTableCount, minimumOptimizerTables),
    seatsPerTable,
    accessibilityConstraintCount > 0,
  );
  const optimizationPeople = (input.seatingConstraints ?? []).reduce(
    (people, action) => applyWeddingSeatingConstraintAction(people, action),
    applyConflictLabels(optimizerPeople, pendingConflictLabels),
  );
  const computedOptimizationPreview = optimizationPeople.length > 0
    ? buildWeddingSeatingOptimizationResult({
      people: optimizationPeople,
      tables: optimizerTables,
    })
    : null;
  const optimizationPreview = savedOptimizationPreview ?? computedOptimizationPreview;

  const statusLabel = guestRowsConsidered === 0
    ? "Needs guest data"
    : unassignedAttendingCount === 0 && (householdGroupCount > 0 || tableLabels.size > 0)
      ? "Draft seating-ready"
      : "Needs seating follow-up";

  return {
    guestRowsConsidered,
    assignedSeatCount,
    unassignedAttendingCount,
    tableCount: tableLabels.size,
    householdGroupCount,
    vipOrWeddingPartyCount,
    sensitiveConstraintCount,
    accessibilityConstraintCount,
    suggestedTableCount,
    statusLabel,
    summaryLabel: guestRowsConsidered === 0
      ? "No attending guest rows are structured enough for a seating draft yet."
      : `${assignedSeatCount}/${guestRowsConsidered} attending guest${guestRowsConsidered === 1 ? "" : "s"} assigned; suggested baseline ${suggestedTableCount} table${suggestedTableCount === 1 ? "" : "s"} at ${seatsPerTable} seats each.`,
    warningLabels,
    tableLabels: Array.from(tableLabels).slice(0, 12),
    tableBriefs,
    vendorBriefLines,
    actionItems,
    dietaryAccessibilityBrief: {
      dietarySummaryLabels: countLabels(dietaryMap),
      accessibilitySummaryLabels: countLabels(accessibilityMap),
      severeAllergyCount,
      approvalRequiredLabels: [
        severeAllergyCount > 0 ? "Severe allergy details require explicit approval before vendor sharing." : null,
        accessibilityConstraintCount > 0 ? "Accessibility needs should be scoped to minimum necessary venue/caterer details." : null,
        sensitiveConstraintCount > 0 ? "Sensitive relationship notes should be redacted from dietary/accessibility briefs." : null,
      ].filter((label): label is string => Boolean(label)),
      correctionLoopLabel: "After vendor acknowledgement, record corrections back into the guest list before final count and seating export.",
    },
    optimizationPreview,
    optimizationPeople,
    optimizationTables: optimizerTables,
  };
}
