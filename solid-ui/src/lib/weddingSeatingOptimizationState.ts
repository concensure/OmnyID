// @locs-version: 1.0
import type { AfpMessage, AfpReference, SendAfpMessageInput } from "@/lib/api";
import { normalizeWeddingPlanningMetadata, safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";
import type { WeddingSemanticUiKind, WeddingSemanticUiObject } from "@/lib/weddingSemanticUiState";
import {
  weddingSemanticUiObjectFromUnknown,
  weddingSemanticUiObjectsFromAfpLikeMessage,
} from "@/lib/weddingSemanticUiState";

export type WeddingSeatingOptimizationNeed =
  | "wheelchair"
  | "mobility"
  | "hearing"
  | "vision"
  | "sensory";

export type WeddingSeatingPersonNode = {
  id: string;
  label: string;
  householdId?: string | null;
  familyId?: string | null;
  relationshipLabel?: string | null;
  relationshipStrength?: number | null;
  ageBand?: "adult" | "child" | "teen" | "unknown" | null;
  languages?: readonly string[] | null;
  accessibilityNeeds?: readonly WeddingSeatingOptimizationNeed[] | null;
  dietaryRequirements?: readonly string[] | null;
  childGuardianIds?: readonly string[] | null;
  weddingPartyRole?: string | null;
  socialGroups?: readonly string[] | null;
  conflictPersonIds?: readonly string[] | null;
  preferTogetherWithIds?: readonly string[] | null;
  preferAwayFromIds?: readonly string[] | null;
  preferences?: readonly string[] | null;
  historyLabels?: readonly string[] | null;
};

export type WeddingSeatingTableNode = {
  id: string;
  label: string;
  capacity: number;
  accessible?: boolean | null;
  distanceToExitMeters?: number | null;
  distanceToSpeakerMeters?: number | null;
  tags?: readonly string[] | null;
};

export type WeddingSeatingTableLayout = {
  tableId: string;
  label: string;
  shape: "round" | "rectangle" | "head";
  capacity: number;
  x: number;
  y: number;
  rotation: number;
};

export type WeddingSeatingOptimizationHardViolation = {
  type: "table_capacity" | "conflict_same_table" | "accessibility_table_required" | "child_without_guardian";
  personId?: string | null;
  tableId?: string | null;
  relatedPersonId?: string | null;
  label: string;
};

export type WeddingSeatingOptimizationSoftSignal = {
  personId: string;
  tableId: string;
  scoreDelta: number;
  reasonLabel: string;
};

export type WeddingSeatingOptimizationAssignment = {
  personId: string;
  personLabel: string;
  tableId: string;
  tableLabel: string;
  score: number;
  reasonLabels: string[];
};

export type WeddingSeatingOptimizationResult = {
  assignments: WeddingSeatingOptimizationAssignment[];
  tableLayout?: WeddingSeatingTableLayout[];
  totalScore: number;
  hardViolations: WeddingSeatingOptimizationHardViolation[];
  softSignals: WeddingSeatingOptimizationSoftSignal[];
  explanationLabels: string[];
  proactiveIssueLabels: string[];
  applyLabel: string;
  alternativeLabel: string;
  savedAt?: string | null;
  fingerprint?: string | null;
  semanticKind?: WeddingSemanticUiKind | null;
  semanticTags?: string[];
  semanticObject?: WeddingSemanticUiObject | null;
};

type TableOccupancy = {
  table: WeddingSeatingTableNode;
  people: WeddingSeatingPersonNode[];
};

type CandidateScore = {
  table: WeddingSeatingTableNode;
  orderRank: number;
  score: number;
  violations: WeddingSeatingOptimizationHardViolation[];
  signals: WeddingSeatingOptimizationSoftSignal[];
  reasonLabels: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 80): string[] {
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

function normalizedSet(values: readonly string[] | null | undefined): Set<string> {
  return new Set((values ?? []).map((value) => clean(value).toLowerCase()).filter(Boolean));
}

function intersects(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) if (right.has(value)) return true;
  return false;
}

function isAccessibilityNeed(person: WeddingSeatingPersonNode): boolean {
  return (person.accessibilityNeeds ?? []).some((need) => need === "wheelchair" || need === "mobility");
}

function wantsQuiet(person: WeddingSeatingPersonNode): boolean {
  const text = (person.preferences ?? []).join(" ").toLowerCase();
  return text.includes("quiet") || (person.accessibilityNeeds ?? []).includes("hearing") || (person.accessibilityNeeds ?? []).includes("sensory");
}

function isFarFromSpeaker(table: WeddingSeatingTableNode): boolean {
  return typeof table.distanceToSpeakerMeters === "number" && table.distanceToSpeakerMeters >= 15;
}

function isNearExit(table: WeddingSeatingTableNode): boolean {
  return typeof table.distanceToExitMeters === "number" && table.distanceToExitMeters <= 10;
}

function scoreSignal(
  person: WeddingSeatingPersonNode,
  table: WeddingSeatingTableNode,
  scoreDelta: number,
  reasonLabel: string,
): WeddingSeatingOptimizationSoftSignal {
  return { personId: person.id, tableId: table.id, scoreDelta, reasonLabel };
}

function hardViolation(
  type: WeddingSeatingOptimizationHardViolation["type"],
  label: string,
  person?: WeddingSeatingPersonNode,
  table?: WeddingSeatingTableNode,
  relatedPerson?: WeddingSeatingPersonNode,
): WeddingSeatingOptimizationHardViolation {
  return {
    type,
    label,
    personId: person?.id ?? null,
    tableId: table?.id ?? null,
    relatedPersonId: relatedPerson?.id ?? null,
  };
}

function evaluateCandidate(
  person: WeddingSeatingPersonNode,
  table: WeddingSeatingTableNode,
  seatedPeople: readonly WeddingSeatingPersonNode[],
  orderRank = 0,
): CandidateScore {
  const violations: WeddingSeatingOptimizationHardViolation[] = [];
  const signals: WeddingSeatingOptimizationSoftSignal[] = [];
  if (seatedPeople.length >= Math.max(0, table.capacity)) {
    violations.push(hardViolation("table_capacity", `${table.label} is already full.`, person, table));
  }

  const conflicts = normalizedSet(person.conflictPersonIds);
  const awayFrom = normalizedSet(person.preferAwayFromIds);
  const together = normalizedSet(person.preferTogetherWithIds);
  const personLanguages = normalizedSet(person.languages);
  const personGroups = normalizedSet(person.socialGroups);
  const reasonLabels: string[] = [];

  for (const other of seatedPeople) {
    const otherConflictIds = normalizedSet(other.conflictPersonIds);
    if (conflicts.has(other.id.toLowerCase()) || otherConflictIds.has(person.id.toLowerCase())) {
      violations.push(hardViolation("conflict_same_table", `${person.label} should not sit with ${other.label}.`, person, table, other));
    }
    if (awayFrom.has(other.id.toLowerCase())) {
      signals.push(scoreSignal(person, table, -30, `${person.label} asked not to sit close to ${other.label}.`));
    }
    if (together.has(other.id.toLowerCase())) {
      signals.push(scoreSignal(person, table, 24, `${person.label} asked to sit with ${other.label}.`));
    }
    if (person.householdId && other.householdId === person.householdId) {
      signals.push(scoreSignal(person, table, 18, `${person.label} stays with their household.`));
    }
    if (person.familyId && other.familyId === person.familyId) {
      signals.push(scoreSignal(person, table, 12, `${person.label} has family at this table.`));
    }
    if (intersects(personLanguages, normalizedSet(other.languages))) {
      signals.push(scoreSignal(person, table, 10, `${person.label} shares a language with ${other.label}.`));
    }
    if (intersects(personGroups, normalizedSet(other.socialGroups))) {
      signals.push(scoreSignal(person, table, 9, `${person.label} has a social connection at this table.`));
    }
  }

  if (isAccessibilityNeed(person)) {
    if (table.accessible !== true) {
      violations.push(hardViolation("accessibility_table_required", `${person.label} needs an accessible table.`, person, table));
    } else {
      signals.push(scoreSignal(person, table, 18, `${table.label} supports ${person.label}'s mobility needs.`));
      if (isNearExit(table)) signals.push(scoreSignal(person, table, 6, `${table.label} is close to an exit.`));
    }
  }
  if (wantsQuiet(person) && isFarFromSpeaker(table)) {
    signals.push(scoreSignal(person, table, 10, `${table.label} is farther from speakers, which suits ${person.label}.`));
  }
  if (person.ageBand === "child" && (person.childGuardianIds ?? []).length > 0) {
    const guardianIds = normalizedSet(person.childGuardianIds);
    const hasGuardian = seatedPeople.some((other) => guardianIds.has(other.id.toLowerCase()));
    if (!hasGuardian) {
      violations.push(hardViolation("child_without_guardian", `${person.label} should sit with a guardian.`, person, table));
    } else {
      signals.push(scoreSignal(person, table, 20, `${person.label} is seated with a guardian.`));
    }
  }

  const score = signals.reduce((sum, signal) => sum + signal.scoreDelta, 0);
  reasonLabels.push(...signals.filter((signal) => signal.scoreDelta > 0).map((signal) => signal.reasonLabel));
  return { table, orderRank, score, violations, signals, reasonLabels: uniqueStrings(reasonLabels, 6) };
}

function personSortRank(person: WeddingSeatingPersonNode): number {
  if (person.ageBand === "child") return 3;
  if (isAccessibilityNeed(person)) return 0;
  if ((person.conflictPersonIds ?? []).length > 0) return 1;
  return 2;
}

function bestCandidate(candidates: readonly CandidateScore[]): CandidateScore {
  return candidates.slice().sort((left, right) => {
    const leftFeasible = left.violations.length === 0 ? 1 : 0;
    const rightFeasible = right.violations.length === 0 ? 1 : 0;
    return rightFeasible - leftFeasible
      || right.score - left.score
      || left.violations.length - right.violations.length
      || left.orderRank - right.orderRank
      || left.table.label.localeCompare(right.table.label)
      || left.table.id.localeCompare(right.table.id);
  })[0] ?? candidates[0]!;
}

export function buildWeddingSeatingOptimizationResult(input: {
  people?: readonly WeddingSeatingPersonNode[] | null;
  tables?: readonly WeddingSeatingTableNode[] | null;
  tableOrderPreferenceIds?: readonly string[] | null;
}): WeddingSeatingOptimizationResult {
  const tableOrder = new Map((input.tableOrderPreferenceIds ?? []).map((id, index) => [clean(id), index]));
  const tables = (input.tables ?? [])
    .filter((table) => clean(table.id) && clean(table.label) && table.capacity > 0)
    .slice()
    .sort((left, right) => {
      const leftRank = tableOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = tableOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.label.localeCompare(right.label) || left.id.localeCompare(right.id);
    });
  const people = (input.people ?? [])
    .filter((person) => clean(person.id) && clean(person.label))
    .slice()
    .sort((left, right) => personSortRank(left) - personSortRank(right) || left.label.localeCompare(right.label) || left.id.localeCompare(right.id));
  const occupancy = new Map<string, TableOccupancy>();
  for (const table of tables) occupancy.set(table.id, { table, people: [] });

  const assignments: WeddingSeatingOptimizationAssignment[] = [];
  const hardViolations: WeddingSeatingOptimizationHardViolation[] = [];
  const softSignals: WeddingSeatingOptimizationSoftSignal[] = [];

  for (const person of people) {
    const candidates = tables.map((table, index) => evaluateCandidate(person, table, occupancy.get(table.id)?.people ?? [], index));
    const chosen = bestCandidate(candidates);
    occupancy.get(chosen.table.id)?.people.push(person);
    hardViolations.push(...chosen.violations);
    softSignals.push(...chosen.signals);
    assignments.push({
      personId: person.id,
      personLabel: person.label,
      tableId: chosen.table.id,
      tableLabel: chosen.table.label,
      score: chosen.score,
      reasonLabels: chosen.reasonLabels.length > 0 ? chosen.reasonLabels : [`${chosen.table.label} is the best available fit for ${person.label}.`],
    });
  }

  const proactiveIssueLabels = isolationIssueLabels(assignments, people, occupancy);
  const explanationLabels = buildExplanationLabels(assignments, hardViolations, proactiveIssueLabels);
  const fingerprint = weddingSeatingOptimizationFingerprint({ assignments });
  return {
    assignments,
    totalScore: assignments.reduce((sum, assignment) => sum + assignment.score, 0),
    hardViolations,
    softSignals,
    explanationLabels,
    proactiveIssueLabels,
    applyLabel: hardViolations.length > 0 ? "Review before applying" : "Apply seating plan",
    alternativeLabel: "Show alternatives",
    fingerprint,
  };
}

export function weddingSeatingOptimizationFingerprint(input: Pick<WeddingSeatingOptimizationResult, "assignments"> & Partial<Pick<WeddingSeatingOptimizationResult, "tableLayout">>): string {
  const assignmentPart = input.assignments
    .map((assignment) => `${assignment.personId}:${assignment.tableId}`)
    .join("|");
  const layoutPart = (input.tableLayout ?? [])
    .map((table) => `${table.tableId}:${table.shape}:${table.capacity}:${table.x}:${table.y}:${table.rotation}`)
    .join("|");
  return layoutPart ? `${assignmentPart}#${layoutPart}` : assignmentPart;
}

export function compactWeddingSeatingOptimizationResults(
  results: readonly WeddingSeatingOptimizationResult[] | null | undefined,
): WeddingSeatingOptimizationResult[] {
  const byFingerprint = new Map<string, WeddingSeatingOptimizationResult>();
  for (const result of results ?? []) {
    const fingerprint = result.fingerprint || weddingSeatingOptimizationFingerprint(result);
    if (!fingerprint) continue;
    byFingerprint.delete(fingerprint);
    byFingerprint.set(fingerprint, { ...result, fingerprint });
  }
  return Array.from(byFingerprint.values());
}

export function buildWeddingSeatingAlternativeResults(input: {
  people?: readonly WeddingSeatingPersonNode[] | null;
  tables?: readonly WeddingSeatingTableNode[] | null;
  count?: number | null;
}): WeddingSeatingOptimizationResult[] {
  const limit = Math.max(1, Math.min(4, Math.trunc(input.count ?? 2)));
  const tables = (input.tables ?? []).filter((table) => clean(table.id) && clean(table.label) && table.capacity > 0);
  if (tables.length <= 1) return [];
  const seen = new Set<string>();
  const results: WeddingSeatingOptimizationResult[] = [];
  for (let offset = 1; offset < tables.length && results.length < limit; offset += 1) {
    const rotatedTables = [...tables.slice(offset), ...tables.slice(0, offset)];
    const result = buildWeddingSeatingOptimizationResult({
      people: input.people,
      tables,
      tableOrderPreferenceIds: rotatedTables.map((table) => table.id),
    });
    const fingerprint = result.assignments.map((assignment) => `${assignment.personId}:${assignment.tableId}`).join("|");
    if (!fingerprint || seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    results.push({
      ...result,
      explanationLabels: uniqueStrings([
        `Alternative ${results.length + 1}: ${result.hardViolations.length === 0 ? "no hard seating rule is broken" : `${result.hardViolations.length} rule check${result.hardViolations.length === 1 ? "" : "s"} need review`}.`,
        ...result.explanationLabels,
      ], 10),
    });
  }
  return results;
}

function isolationIssueLabels(
  assignments: readonly WeddingSeatingOptimizationAssignment[],
  people: readonly WeddingSeatingPersonNode[],
  occupancy: Map<string, TableOccupancy>,
): string[] {
  const byId = new Map(people.map((person) => [person.id, person]));
  const labels: string[] = [];
  for (const assignment of assignments) {
    const person = byId.get(assignment.personId);
    const seated = occupancy.get(assignment.tableId)?.people.filter((other) => other.id !== assignment.personId) ?? [];
    if (!person || seated.length === 0) continue;
    const personLanguages = normalizedSet(person.languages);
    const personGroups = normalizedSet(person.socialGroups);
    const hasConnection = seated.some((other) => (
      (person.householdId && other.householdId === person.householdId)
      || (person.familyId && other.familyId === person.familyId)
      || intersects(personLanguages, normalizedSet(other.languages))
      || intersects(personGroups, normalizedSet(other.socialGroups))
      || normalizedSet(person.preferTogetherWithIds).has(other.id.toLowerCase())
    ));
    if (!hasConnection) {
      labels.push(`${person.label} currently has no clear connection at ${assignment.tableLabel}.`);
    }
  }
  return uniqueStrings(labels, 8);
}

function buildExplanationLabels(
  assignments: readonly WeddingSeatingOptimizationAssignment[],
  hardViolations: readonly WeddingSeatingOptimizationHardViolation[],
  proactiveIssueLabels: readonly string[],
): string[] {
  const positive = assignments
    .filter((assignment) => assignment.reasonLabels.length > 0)
    .slice(0, 4)
    .map((assignment) => `${assignment.personLabel}: ${assignment.reasonLabels[0]}`);
  return uniqueStrings([
    hardViolations.length === 0 ? "No hard seating rule is broken in this draft." : `${hardViolations.length} seating rule needs review before applying.`,
    ...positive,
    ...proactiveIssueLabels,
  ], 10);
}

function afpRef(type: string, target: unknown, label: string, metadata?: Record<string, unknown>): AfpReference | null {
  const cleanTarget = clean(target);
  if (!cleanTarget) return null;
  return { type, target: cleanTarget, label, ...(metadata ? { metadata } : {}) };
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function assignmentFromValue(value: unknown): WeddingSeatingOptimizationAssignment | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const personId = clean(record.personId);
  const tableId = clean(record.tableId);
  if (!personId || !tableId) return null;
  return {
    personId,
    personLabel: clean(record.personLabel) || personId,
    tableId,
    tableLabel: clean(record.tableLabel) || tableId,
    score: numeric(record.score),
    reasonLabels: stringArray(record.reasonLabels),
  };
}

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function tableLayoutFromValue(value: unknown): WeddingSeatingTableLayout | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const tableId = clean(record.tableId);
  if (!tableId) return null;
  const shape = clean(record.shape);
  const normalizedShape: WeddingSeatingTableLayout["shape"] = shape === "head"
    ? "head"
    : shape === "rectangle" || shape === "long"
      ? "rectangle"
      : "round";
  const rawRotation = boundedNumber(record.rotation, -360, 360, 0);
  const rotation = normalizedShape === "round" ? 0 : ((Math.round(rawRotation / 45) * 45) % 360 + 360) % 360;
  return {
    tableId,
    label: clean(record.label).slice(0, 80) || tableId,
    shape: normalizedShape,
    capacity: Math.round(boundedNumber(record.capacity, 1, 40, normalizedShape === "head" ? 8 : 10)),
    x: boundedNumber(record.x, 0, 82, 8),
    y: boundedNumber(record.y, 0, 76, 9),
    rotation,
  };
}

function violationFromValue(value: unknown): WeddingSeatingOptimizationHardViolation | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = clean(record.type);
  if (
    type !== "table_capacity"
    && type !== "conflict_same_table"
    && type !== "accessibility_table_required"
    && type !== "child_without_guardian"
  ) {
    return null;
  }
  return {
    type,
    personId: clean(record.personId) || null,
    tableId: clean(record.tableId) || null,
    relatedPersonId: clean(record.relatedPersonId) || null,
    label: clean(record.label) || "Seating rule needs review.",
  };
}

function signalFromValue(value: unknown): WeddingSeatingOptimizationSoftSignal | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const personId = clean(record.personId);
  const tableId = clean(record.tableId);
  if (!personId || !tableId) return null;
  return {
    personId,
    tableId,
    scoreDelta: numeric(record.scoreDelta),
    reasonLabel: clean(record.reasonLabel) || "Seating fit signal.",
  };
}

function assignmentsFromReferences(message: AfpMessage): WeddingSeatingOptimizationAssignment[] {
  return (message.references ?? [])
    .filter((reference) => reference.type === "seats_person_at_table")
    .map((reference): WeddingSeatingOptimizationAssignment | null => {
      const personId = clean(reference.target);
      const tableId = clean(reference.metadata?.table_id);
      if (!personId || !tableId) return null;
      return {
        personId,
        personLabel: clean(reference.metadata?.person_label) || personId,
        tableId,
        tableLabel: clean(reference.metadata?.table_label) || tableId,
        score: 0,
        reasonLabels: [],
      } satisfies WeddingSeatingOptimizationAssignment;
    })
    .filter((item): item is WeddingSeatingOptimizationAssignment => item !== null);
}

function buildSeatingSemanticComparison(result: WeddingSeatingOptimizationResult): WeddingSemanticUiObject["comparison"] {
  const byTable = new Map<string, WeddingSeatingOptimizationAssignment[]>();
  for (const assignment of result.assignments) {
    const key = `${assignment.tableId}:${assignment.tableLabel}`;
    byTable.set(key, [...(byTable.get(key) ?? []), assignment]);
  }
  const rows = Array.from(byTable.values()).slice(0, 8).map((assignments) => {
    const first = assignments[0];
    return {
      id: first?.tableId ?? `table:${assignments.length}`,
      cells: [
        first?.tableLabel ?? "Table",
        assignments.map((assignment) => assignment.personLabel).join(", "),
        uniqueStrings(assignments.flatMap((assignment) => assignment.reasonLabels), 3).join("; ") || "Balanced fit",
      ],
    };
  });
  return rows.length > 0
    ? {
      title: "Seating draft",
      columns: [
        { label: "Table", kind: "entity" },
        { label: "Guests", kind: "people" },
        { label: "Why", kind: "rationale" },
      ],
      rows,
    }
    : null;
}

function buildSeatingSemanticObject(result: WeddingSeatingOptimizationResult, idFingerprint: string): WeddingSemanticUiObject {
  const hasViolations = result.hardViolations.length > 0;
  const hasReviewIssues = result.proactiveIssueLabels.length > 0;
  const kind: WeddingSemanticUiKind = hasViolations
    ? "wedding_conflict"
    : hasReviewIssues
      ? "wedding_approval_required"
      : "wedding_comparison";
  const summary = result.hardViolations[0]?.label
    || result.proactiveIssueLabels[0]
    || result.explanationLabels[0]
    || "Seating draft ready for review.";
  return {
    id: `wedding-seating:${idFingerprint}`,
    kind,
    title: "Seating draft",
    stateLabel: hasViolations ? "Needs rule review" : hasReviewIssues ? "Review before applying" : "Ready to review",
    tone: hasViolations ? "risk" : hasReviewIssues ? "action" : "options",
    summary,
    comparison: buildSeatingSemanticComparison(result),
    actions: [
      {
        label: result.applyLabel,
        kind: "apply_wedding_seating_plan",
        enabled: !hasViolations && result.assignments.length > 0,
        targetMenu: "seating",
      },
      {
        label: result.alternativeLabel,
        kind: "show_wedding_seating_alternatives",
        enabled: result.assignments.length > 0,
        targetMenu: "seating",
      },
    ],
    semanticTags: uniqueStrings([
      kind,
      "wedding_seating",
      "wedding_seating_optimization",
      hasViolations ? "wedding_seating_review_required" : "wedding_seating_ready_to_apply",
    ]),
  };
}

export function weddingSeatingOptimizationResultToAfpMessage(input: {
  result: WeddingSeatingOptimizationResult;
  metadata?: unknown;
  createdAt?: string;
}): AfpMessage {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const timestamp = input.createdAt ?? new Date().toISOString();
  const assignmentFingerprint = input.result.assignments
    ? weddingSeatingOptimizationFingerprint(input.result)
    : "";
  const idFingerprint = safeWeddingLabel(assignmentFingerprint).slice(0, 96) || "empty";
  const id = `afp-wedding-seating-optimization-${safeWeddingLabel(metadata.responseWorkspaceId)}-${idFingerprint}`;
  const semanticObject = input.result.semanticObject ?? buildSeatingSemanticObject(input.result, idFingerprint);
  const semanticTags = uniqueStrings([
    ...semanticObject.semanticTags,
    ...(input.result.semanticTags ?? []),
  ]);
  const references = [
    afpRef("wedding_plan", metadata.weddingPlanId, "Wedding plan"),
    afpRef("response_workspace", metadata.responseWorkspaceId, "Wedding workspace"),
    ...input.result.assignments.map((assignment) => afpRef("seats_person_at_table", assignment.personId, "Person seated at table", {
      table_id: assignment.tableId,
      table_label: assignment.tableLabel,
      person_label: assignment.personLabel,
    })),
  ].filter((item): item is AfpReference => item !== null);

  return {
    id,
    thread_id: `wedding_seating:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    from: "system://wedding-planning",
    to: ["agent://wedding-planning", "agent://knowledge-graph", "agent://topology", "agent://decision-queue"],
    timestamp,
    type: "ledger",
    kind: "wedding_seating_optimization",
    subtype: "wedding_seating_optimization",
    supertags: uniqueStrings([
      ...metadata.supertags,
      "wedding_seating",
      "wedding_seating:optimization",
      "topology:wedding_guest_graph",
      "decisionos:wedding_seating",
      input.result.hardViolations.length > 0 ? "wedding_seating:review_required" : "wedding_seating:ready_to_apply",
      `wedding_plan:${safeWeddingLabel(metadata.weddingPlanId)}`,
      `response_workspace:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    ]),
    content: {
      ledger_kind: "wedding_seating_optimization",
      assignment_count: input.result.assignments.length,
      assignments: input.result.assignments,
      table_layout: input.result.tableLayout ?? [],
      total_score: input.result.totalScore,
      hard_violations: input.result.hardViolations,
      soft_signals: input.result.softSignals,
      proactive_issues: input.result.proactiveIssueLabels,
      explanation_labels: input.result.explanationLabels,
      apply_label: input.result.applyLabel,
      alternative_label: input.result.alternativeLabel,
      semantic_kind: semanticObject.kind,
      semantic_tags: semanticTags,
      semantic_object: semanticObject,
      semantic_objects: [semanticObject],
      created_at: timestamp,
      assignment_fingerprint: assignmentFingerprint,
      markdown: [
        "# Seating draft",
        "",
        ...input.result.explanationLabels.map((label) => `- ${label}`),
      ].join("\n"),
    },
    metadata: {
      ...metadata,
      seating_optimization: true,
      semantic_kind: semanticObject.kind,
      semantic_tags: semanticTags,
      semantic_object: semanticObject,
      hard_violation_count: input.result.hardViolations.length,
      assignment_count: input.result.assignments.length,
      table_layout_count: input.result.tableLayout?.length ?? 0,
      e2ee_required: true,
      searchable_terms: uniqueStrings([
        "wedding seating",
        "seating chart",
        "guest graph",
        "constraint optimization",
        metadata.weddingPlanId,
        metadata.responseWorkspaceId,
      ]),
    },
    views: [{
      format: "a2ui",
      content: {
        kind: "wedding_seating_optimization",
        title: "Seating draft",
        summary: input.result.explanationLabels[0] ?? "Seating draft ready for review.",
        primary_action: input.result.applyLabel,
        secondary_action: input.result.alternativeLabel,
        semantic_kind: semanticObject.kind,
        semantic_tags: semanticTags,
        semantic_object: semanticObject,
        semantic_objects: [semanticObject],
        badges: [
          `${input.result.assignments.length} guests placed`,
          input.result.hardViolations.length === 0 ? "Rules clear" : `${input.result.hardViolations.length} rule checks`,
        ],
      },
    }],
    attachments: [],
    references,
  };
}

export function weddingSeatingOptimizationResultToAfpSendInput(input: {
  result: WeddingSeatingOptimizationResult;
  metadata?: unknown;
  createdAt?: string;
}): SendAfpMessageInput {
  const message = weddingSeatingOptimizationResultToAfpMessage(input);
  return {
    thread_id: message.thread_id,
    from: message.from,
    to: message.to ?? [],
    timestamp: message.timestamp,
    type: message.type,
    kind: message.kind,
    subtype: message.subtype ?? undefined,
    content: message.content,
    views: message.views,
    attachments: message.attachments,
    references: message.references,
    supertags: message.supertags ?? [],
    metadata: message.metadata,
    store_in_relational: true,
  };
}

export function weddingSeatingOptimizationResultFromAfpMessage(message: AfpMessage): WeddingSeatingOptimizationResult | null {
  if (message.subtype !== "wedding_seating_optimization" && message.kind !== "wedding_seating_optimization") return null;
  const content = message.content && typeof message.content === "object" ? message.content as Record<string, unknown> : {};
  const assignments = Array.isArray(content.assignments)
    ? content.assignments.map(assignmentFromValue).filter((item): item is WeddingSeatingOptimizationAssignment => item !== null)
    : assignmentsFromReferences(message);
  if (assignments.length === 0) return null;
  const tableLayout = Array.isArray(content.table_layout)
    ? content.table_layout.map(tableLayoutFromValue).filter((item): item is WeddingSeatingTableLayout => item !== null).slice(0, 80)
    : [];
  const hardViolations = Array.isArray(content.hard_violations)
    ? content.hard_violations.map(violationFromValue).filter((item): item is WeddingSeatingOptimizationHardViolation => item !== null)
    : [];
  const softSignals = Array.isArray(content.soft_signals)
    ? content.soft_signals.map(signalFromValue).filter((item): item is WeddingSeatingOptimizationSoftSignal => item !== null)
    : [];
  const proactiveIssueLabels = stringArray(content.proactive_issues);
  const explanationLabels = stringArray(content.explanation_labels);
  const semanticObject = weddingSemanticUiObjectsFromAfpLikeMessage(message)[0]
    ?? weddingSemanticUiObjectFromUnknown(content.semantic_object);
  const semanticTags = semanticObject?.semanticTags ?? stringArray(content.semantic_tags);
  return {
    assignments,
    tableLayout,
    totalScore: numeric(content.total_score) || assignments.reduce((total, assignment) => total + assignment.score, 0),
    hardViolations,
    softSignals,
    explanationLabels: explanationLabels.length > 0 ? explanationLabels : buildExplanationLabels(assignments, hardViolations, proactiveIssueLabels),
    proactiveIssueLabels,
    applyLabel: clean(content.apply_label) || "Apply seating plan",
    alternativeLabel: clean(content.alternative_label) || "Show alternatives",
    savedAt: clean(content.created_at) || message.timestamp || null,
    fingerprint: clean(content.assignment_fingerprint) || weddingSeatingOptimizationFingerprint({ assignments }),
    semanticKind: semanticObject?.kind ?? null,
    semanticTags,
    semanticObject,
  };
}
