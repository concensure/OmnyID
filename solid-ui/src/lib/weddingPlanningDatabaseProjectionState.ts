// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import type { DatabaseViewRecord } from "@/lib/databaseViewState";
import type { DatabaseViewColumnDef } from "@/lib/databaseViewState";
import { buildWeddingBudgetTrackingState } from "@/lib/weddingBudgetTrackingState";
import { weddingJourneyStageId, WEDDING_JOURNEY_STAGES } from "@/lib/weddingJourneyStageState";
import { buildWeddingPersistedWorkspaceState } from "@/lib/weddingPersistedWorkspaceState";
import { buildWeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";
import { planIdFrom, workspaceIdFrom } from "@/lib/weddingPersistedWorkspaceMessageState";
import { projectWeddingRunSheetPreviewRecords } from "@/lib/weddingRunSheetProjectorState";

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const timestamp = (messages: readonly AfpMessage[]) => messages.at(-1)?.timestamp ?? new Date(0).toISOString();

const WEDDING_PLANNING_TABLES: Record<string, { label: string; columns: DatabaseViewColumnDef[] }> = {
  budget: { label: "Budget", columns: [
    { key: "item", label: "Item" }, { key: "category", label: "Category" },
    { key: "amount", label: "Amount" }, { key: "committed_or_projected", label: "Known cost" },
    { key: "remaining", label: "Remaining" }, { key: "status", label: "Status" },
    { key: "source", label: "Source" },
  ] },
  timeline: { label: "Timeline", columns: [
    { key: "task", label: "Task or event" }, { key: "stage", label: "Stage" },
    { key: "due_date", label: "Due" }, { key: "owner", label: "Owner" },
    { key: "status", label: "Status" }, { key: "priority", label: "Priority" },
    { key: "source", label: "Source" },
  ] },
  guest_list: { label: "Guest list", columns: [
    { key: "guest", label: "Guest" }, { key: "household", label: "Household" },
    { key: "rsvp", label: "RSVP" }, { key: "contact", label: "Contact" },
    { key: "meal", label: "Meal" }, { key: "dietary", label: "Dietary" },
    { key: "access", label: "Accessibility" }, { key: "source", label: "Source" },
  ] },
  rsvp: { label: "RSVP", columns: [
    { key: "guest", label: "Guest" }, { key: "household", label: "Household" },
    { key: "event", label: "Event" }, { key: "status", label: "Status" },
    { key: "meal", label: "Meal" }, { key: "dietary", label: "Dietary" },
    { key: "access", label: "Accessibility" }, { key: "last_changed", label: "Last changed" },
    { key: "source", label: "Source" },
  ] },
  seating: { label: "Seating", columns: [
    { key: "guest", label: "Guest" }, { key: "table", label: "Table" },
    { key: "status", label: "Status" }, { key: "reason", label: "Reason" },
    { key: "source", label: "Source" },
  ] },
  run_sheet: { label: "Run sheet", columns: [
    { key: "title", label: "Item" }, { key: "start_at", label: "Start" },
    { key: "end_at", label: "End" }, { key: "status", label: "Status" },
    { key: "location", label: "Place" }, { key: "owner_refs", label: "Owner" },
    { key: "participant_refs", label: "Participants" }, { key: "source", label: "Source" },
  ] },
  selected_vendors: { label: "Selected vendors", columns: [
    { key: "category", label: "Category" }, { key: "vendor", label: "Selected vendor" },
    { key: "status", label: "Status" }, { key: "quote", label: "Quote" },
    { key: "deposit", label: "Deposit" }, { key: "contact", label: "Contact" },
    { key: "detail", label: "Why selected / checks" }, { key: "decision_date", label: "Decision date" },
    { key: "source", label: "Source" },
  ] },
};

export function weddingPlanningDatabaseTableLabel(table: string): string {
  return WEDDING_PLANNING_TABLES[table]?.label ?? table.replace(/_/g, " ");
}

export function weddingPlanningDatabaseTableColumns(table: string | null): DatabaseViewColumnDef[] | null {
  return table ? WEDDING_PLANNING_TABLES[table]?.columns ?? null : null;
}

function latestResponseAt(eventResponses: ReadonlyArray<{
  respondedAt?: string | null;
  viewedAt?: string | null;
  invitedAt?: string | null;
}>): string | null {
  return eventResponses.flatMap((response) => [response.respondedAt, response.viewedAt, response.invitedAt])
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

function decisionCell(
  cells: ReadonlyArray<{ label: string; value: string }>,
  pattern: RegExp,
): string | null {
  return cells.find((cell) => pattern.test(cell.label))?.value || null;
}

function vendorCategory(title: string): string {
  return title
    .replace(/\b(vendor|supplier)?\s*(shortlist|comparison|options?|quotes?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || title;
}

export function weddingPlanningDatabaseId(weddingPlanId: string): string {
  return `database:wedding-plan:${weddingPlanId}`;
}

export function discoverWeddingPlanningScope(messages: readonly AfpMessage[]): { weddingPlanId: string; responseWorkspaceId: string } | null {
  for (const message of messages.slice().reverse()) {
    const weddingPlanId = planIdFrom(message);
    const responseWorkspaceId = workspaceIdFrom(message);
    if (weddingPlanId && responseWorkspaceId) return { weddingPlanId, responseWorkspaceId };
  }
  return null;
}

export function projectWeddingPlanningDatabaseRecords(messages: readonly AfpMessage[]): DatabaseViewRecord[] {
  const scope = discoverWeddingPlanningScope(messages);
  if (!scope) return [];
  const databaseId = weddingPlanningDatabaseId(scope.weddingPlanId);
  const state = buildWeddingPersistedWorkspaceState({ messages, ...scope });
  const budget = buildWeddingBudgetTrackingState({ decisionRecords: state.decisionRecords, artifacts: state.artifacts });
  const projectedAt = timestamp(messages);
  const rows: DatabaseViewRecord[] = [];
  const push = (id: string, table: string, data: Record<string, unknown>) => rows.push({ id, databaseId, table, data, revision: 1, timestamp: projectedAt });

  push(`${databaseId}:budget:summary`, "budget", {
    item: "Wedding budget summary", category: "Overall", amount: budget.budgetTargetAmount,
    committed_or_projected: budget.totalKnownAmount, remaining: budget.remainingAmount,
    status: budget.budgetStatusLabel, source: "Wedding budget ledger projection",
  });
  for (const allocation of budget.budgetAllocation) push(`${databaseId}:budget:allocation:${allocation.categoryId}`, "budget", {
    item: allocation.categoryLabel, category: allocation.categoryLabel, amount: allocation.amount,
    committed_or_projected: null, remaining: null, status: "Allocated", source: "Couple-approved budget allocation",
  });
  for (const item of budget.lineItems) push(`${databaseId}:budget:item:${item.id}`, "budget", {
    item: item.vendorName, category: item.categoryLabel, amount: item.amount,
    committed_or_projected: item.amount, remaining: null, status: item.priceStatus,
    source: item.sourceLabel,
  });

  push(`${databaseId}:timeline:summary`, "timeline", {
    task: "Wedding timeline summary", stage: "All stages", due_date: null,
    owner: "Couple", status: `${state.taskItems.length} tasks · ${state.scheduleItems.length} dated events`, source: "Wedding task and calendar ledger projection",
  });
  for (const item of state.taskItems) {
    const stageId = weddingJourneyStageId(item);
    const stage = WEDDING_JOURNEY_STAGES.find((candidate) => candidate.id === stageId)?.label ?? stageId;
    const metadata = record(item.metadata);
    const done = item.semanticTags?.some((tag) => tag.toLowerCase() === "wedding_task_status:done") === true
      || clean(metadata.status).toLowerCase() === "done";
    push(`${databaseId}:timeline:task:${item.id}`, "timeline", {
      task: item.title, stage, due_date: item.dueAt ?? item.dueLabel ?? null,
      owner: item.assignee ?? "Couple", status: done ? "Done" : "To do",
      priority: item.priority ?? "normal", source: item.source ?? "Wedding ledger",
    });
  }
  for (const item of state.scheduleItems) push(`${databaseId}:timeline:event:${item.id}`, "timeline", {
    task: item.title, stage: "Dated event", due_date: item.startAt ?? item.dateLabel ?? null,
    owner: item.participants?.join(", ") || "Couple", status: item.approvalState ?? item.reviewStatus ?? "Scheduled",
    priority: "event", source: item.source ?? "Wedding calendar ledger",
  });

  const guests = buildWeddingGuestTrackingState({
    artifacts: state.artifacts,
    boundaryObjects: state.boundaryObjects,
    afpMessages: [...messages],
    responseWorkspaceId: scope.responseWorkspaceId,
  });
  push(`${databaseId}:guest-list:summary`, "guest_list", {
    guest: "Guest list summary", household: `${guests.householdCount} household${guests.householdCount === 1 ? "" : "s"}`,
    rsvp: `${guests.attendingCount} attending · ${guests.pendingCount} pending · ${guests.declinedCount} not attending`,
    contact: guests.missingContactCount ? `${guests.missingContactCount} contact detail${guests.missingContactCount === 1 ? "" : "s"} needed` : "Contact details complete",
    meal: guests.missingMealCount ? `${guests.missingMealCount} meal choice${guests.missingMealCount === 1 ? "" : "s"} needed` : "Meal choices up to date",
    access: `${guests.accessibilityCount} access note${guests.accessibilityCount === 1 ? "" : "s"}`,
    source: "Wedding guest ledger projection",
  });
  const guestRows = [...(guests.guestRows ?? [])].sort((left, right) =>
    left.householdLabel.localeCompare(right.householdLabel) || left.displayName.localeCompare(right.displayName),
  );
  for (const guest of guestRows) push(`${databaseId}:guest-list:${guest.id}`, "guest_list", {
    guest: guest.displayName, household: guest.householdLabel, rsvp: guest.rsvpStatus,
    contact: guest.contactLabel ?? "Not added", meal: guest.mealPreference ?? "Not added",
    dietary: guest.dietaryNote ?? "None recorded", access: guest.accessibilityNote ?? "None recorded",
    source: guest.sourceLabel,
  });

  push(`${databaseId}:rsvp:summary`, "rsvp", {
    guest: "RSVP summary", household: `${guests.householdCount} household${guests.householdCount === 1 ? "" : "s"}`,
    event: "All invited events", status: `${guests.attendingCount} attending · ${guests.pendingCount} pending · ${guests.declinedCount} not attending`,
    meal: guests.missingMealCount ? `${guests.missingMealCount} meal choice${guests.missingMealCount === 1 ? "" : "s"} needed` : "Meal choices up to date",
    dietary: `${guests.dietaryCount} dietary note${guests.dietaryCount === 1 ? "" : "s"}`,
    access: `${guests.accessibilityCount} access note${guests.accessibilityCount === 1 ? "" : "s"}`,
    last_changed: latestResponseAt(guestRows.flatMap((guest) => guest.eventResponses)),
    source: "Wedding guest and RSVP ledger projection",
  });
  for (const guest of guestRows) {
    const responses = guest.eventResponses.length > 0 ? guest.eventResponses : [null];
    for (const response of responses) push(`${databaseId}:rsvp:${guest.id}:${response?.eventId ?? "overall"}`, "rsvp", {
      guest: guest.displayName,
      household: guest.householdLabel,
      event: response?.eventId ?? "Overall invitation",
      status: response?.attendance ?? guest.rsvpStatus,
      meal: guest.mealPreference ?? "Not added",
      dietary: guest.dietaryNote ?? "None recorded",
      access: guest.accessibilityNote ?? "None recorded",
      last_changed: response?.respondedAt ?? response?.viewedAt ?? response?.invitedAt ?? null,
      source: response?.responseSource ? `${guest.sourceLabel} · ${response.responseSource}` : guest.sourceLabel,
    });
  }

  const latestSeating = state.seatingOptimizations.at(-1);
  push(`${databaseId}:seating:summary`, "seating", {
    guest: "Seating summary", table: latestSeating ? `${new Set(latestSeating.assignments.map((item) => item.tableId)).size} tables` : "No applied seating draft",
    status: latestSeating ? `${latestSeating.assignments.length} guests assigned` : `${state.seatingConstraints.length} constraints recorded`,
    reason: latestSeating?.explanationLabels.join(" · ") || "Projected from the current seating ledger",
    source: "Wedding seating ledger projection",
  });
  for (const assignment of latestSeating?.assignments ?? []) push(`${databaseId}:seating:assignment:${assignment.personId}`, "seating", {
    guest: assignment.personLabel, table: assignment.tableLabel, status: "Assigned",
    reason: assignment.reasonLabels.join(" · "), source: "Current seating draft",
  });
  if (!latestSeating) for (const constraint of state.seatingConstraints) push(`${databaseId}:seating:constraint:${constraint.id}`, "seating", {
    guest: constraint.primaryPersonId ?? "Seating rule", table: constraint.relatedPersonId ?? constraint.socialGroup ?? "Not assigned",
    status: constraint.statusLabel, reason: constraint.instruction, source: `Seating constraint · ${constraint.confidence} confidence`,
  });

  const runSheetRows = projectWeddingRunSheetPreviewRecords({
    messages: [...messages],
    weddingPlanId: scope.weddingPlanId,
    databaseId,
  });
  push(`${databaseId}:run-sheet:summary`, "run_sheet", {
    title: "Wedding day run sheet",
    start_at: null,
    time_status: runSheetRows.some((row) => row.data.time_status === "confirmed") ? "confirmed timings available" : "timings need confirmation",
    location: null,
    owner_refs: ["Couple"],
    participant_refs: [],
    status: `${runSheetRows.length} known day-of item${runSheetRows.length === 1 ? "" : "s"}`,
    source: "Wedding schedule, task and vendor-message ledger projection",
  });
  rows.push(...runSheetRows);

  const latestVendorDecisions = new Map<string, typeof state.decisionRecords[number]>();
  for (const decision of state.decisionRecords) {
    if (decision.artifactKind !== "vendor_table" && decision.source !== "vendor_search_comparison") continue;
    const current = latestVendorDecisions.get(decision.artifactId);
    if (!current || current.createdAt.localeCompare(decision.createdAt) <= 0) {
      latestVendorDecisions.set(decision.artifactId, decision);
    }
  }
  const vendorDecisions = [...latestVendorDecisions.values()].sort((left, right) =>
    vendorCategory(left.artifactTitle).localeCompare(vendorCategory(right.artifactTitle)),
  );
  push(`${databaseId}:selected-vendors:summary`, "selected_vendors", {
    category: "Selection summary",
    vendor: vendorDecisions.length
      ? `${vendorDecisions.length} selected categor${vendorDecisions.length === 1 ? "y" : "ies"}`
      : "No selected vendors yet",
    status: vendorDecisions.length ? "Selections saved" : "Choose from a vendor comparison",
    quote: null, deposit: null, contact: null,
    detail: "Selections remain source-linked to their Wedding decision records.",
    decision_date: vendorDecisions.map((decision) => decision.createdAt).sort().at(-1) ?? null,
    source: "Wedding decision ledger projection",
  });
  for (const decision of vendorDecisions) push(`${databaseId}:selected-vendors:${decision.id}`, "selected_vendors", {
    category: vendorCategory(decision.artifactTitle),
    vendor: decision.selectedOptionLabel,
    status: "Selected",
    quote: decisionCell(decision.selectedOptionColumnCells, /\b(price|quote|cost|total|package)\b/i),
    deposit: decisionCell(decision.selectedOptionColumnCells, /\bdeposit\b/i),
    contact: decisionCell(decision.selectedOptionColumnCells, /\b(contact|email|phone|website)\b/i),
    detail: decision.selectedOptionDetail,
    decision_date: decision.createdAt,
    source: decision.sourceProviderLabels?.join(", ") || decision.sourceLabels?.join(", ") || "Wedding decision ledger",
  });
  return rows;
}
