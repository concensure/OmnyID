import type { WeddingRunSheetPresentedRow } from "@/lib/weddingRunSheetEditingState";
import { weddingRunSheetFingerprint } from "@/lib/weddingRunSheetProjectorState";

export type WeddingRunSheetConflictKind =
  | "owner_overlap" | "vendor_overlap" | "travel" | "access" | "curfew"
  | "meal" | "speech" | "photos" | "transport"
  | "missing_owner" | "missing_place" | "missing_time";

export type WeddingRunSheetFinding = {
  id: string;
  kind: WeddingRunSheetConflictKind;
  evidenceState: "conflict" | "unknown";
  recordIds: string[];
  title: string;
  detail: string;
  sourceRefs: string[];
};

export type WeddingRunSheetBufferSuggestion = {
  id: string;
  state: "suggested";
  targetRecordId: string;
  affectedRecordIds: string[];
  field: "buffer_before_minutes" | "buffer_after_minutes";
  minutes: 15 | 20;
  title: string;
  explanation: string;
  sourceRefs: string[];
  inputFingerprint: string;
  promptVersion: "deterministic-rules-v1";
  modelInputTokens: 0;
  modelOutputTokens: 0;
  modelCostMicrousd: 0;
  approvalStatus: "unreviewed";
  revisionHistory: Array<{ revision: 1; state: "suggested"; inputFingerprint: string }>;
};

export type WeddingRunSheetIntent =
  | { kind: "focus_records"; recordIds: string[] }
  | { kind: "review_buffer"; suggestionId: string }
  | { kind: "show_attention" }
  | { kind: "show_all" }
  | { kind: "add_item"; preset: "item" | "milestone" };

export type WeddingRunSheetContextCard = {
  id: "next_conflict" | "fixed_milestones" | "buffer_review" | "missing_information" | "distribution_readiness" | "day_of_now_next";
  title: string;
  summary: string;
  tone: "ready" | "attention" | "risk" | "neutral";
  items: string[];
  actionLabel: string | null;
  intent: WeddingRunSheetIntent | null;
  a2ui: Record<string, unknown>;
};

export type WeddingRunSheetIntelligence = {
  findings: WeddingRunSheetFinding[];
  bufferSuggestions: WeddingRunSheetBufferSuggestion[];
  cards: WeddingRunSheetContextCard[];
  modelCalls: 0;
  modelBudget: {
    accountRemainingMicrousd: number | null;
    weddingRemainingMicrousd: number | null;
    exhausted: boolean;
    deterministicFallback: true;
  };
};

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : text(value) ? [text(value)] : [];
}

function timestamp(value: unknown): number | null {
  const parsed = new Date(text(value)).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function number(value: unknown): number | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = typeof value === "number" ? value : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function rowEnd(row: WeddingRunSheetPresentedRow): number | null {
  const explicit = timestamp(row.effectiveEndAt);
  if (explicit !== null) return explicit;
  const start = timestamp(row.effectiveStartAt);
  const duration = number(row.record.data.duration_minutes);
  return start !== null && duration !== null ? start + duration * 60_000 : start;
}

function refs(row: WeddingRunSheetPresentedRow, field: string): string[] {
  return strings(row.record.data[field]).map((value) => value.toLocaleLowerCase());
}

function sourceRefs(row: WeddingRunSheetPresentedRow): string[] {
  const values = Array.isArray(row.record.data.source_refs) ? row.record.data.source_refs : [];
  return values.flatMap((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
    const messageId = text((value as Record<string, unknown>).message_id);
    return messageId ? [messageId] : [];
  });
}

function title(row: WeddingRunSheetPresentedRow): string {
  return text(row.record.data.title) || "Run-sheet item";
}

function category(row: WeddingRunSheetPresentedRow): string {
  return `${text(row.record.data.category)} ${title(row)}`.toLocaleLowerCase();
}

function categoryIs(row: WeddingRunSheetPresentedRow, pattern: RegExp): boolean {
  return pattern.test(category(row));
}

function intersects(left: string[], right: string[]): boolean {
  const values = new Set(left);
  return right.some((value) => values.has(value));
}

function finding(input: Omit<WeddingRunSheetFinding, "id">): WeddingRunSheetFinding {
  return { ...input, id: weddingRunSheetFingerprint(input) };
}

function overlapFindings(rows: WeddingRunSheetPresentedRow[]): WeddingRunSheetFinding[] {
  const output: WeddingRunSheetFinding[] = [];
  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    const left = rows[leftIndex];
    const leftStart = timestamp(left.effectiveStartAt);
    const leftEnd = rowEnd(left);
    if (leftStart === null || leftEnd === null) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
      const right = rows[rightIndex];
      const rightStart = timestamp(right.effectiveStartAt);
      const rightEnd = rowEnd(right);
      if (rightStart === null || rightEnd === null || rightStart >= leftEnd || leftStart >= rightEnd) continue;
      const sharedOwners = intersects(refs(left, "owner_refs"), refs(right, "owner_refs"));
      const sharedVendors = intersects(refs(left, "vendor_refs"), refs(right, "vendor_refs"));
      const sharedPeople = sharedOwners || sharedVendors || intersects(refs(left, "participant_refs"), refs(right, "participant_refs"));
      const common = { evidenceState: "conflict" as const, recordIds: [left.record.id, right.record.id], sourceRefs: [...sourceRefs(left), ...sourceRefs(right)] };
      if (sharedOwners) output.push(finding({ ...common, kind: "owner_overlap", title: "One owner is needed in two places", detail: `${title(left)} overlaps ${title(right)}.` }));
      if (sharedVendors) output.push(finding({ ...common, kind: "vendor_overlap", title: "One vendor has overlapping commitments", detail: `${title(left)} overlaps ${title(right)}.` }));
      if (!sharedPeople) continue;
      const pair = [left, right];
      if (pair.some((row) => categoryIs(row, /meal|dinner|lunch|breakfast|cater/))) output.push(finding({ ...common, kind: "meal", title: "Meal timing overlaps another shared commitment", detail: `${title(left)} and ${title(right)} need the same people.` }));
      if (pair.some((row) => categoryIs(row, /speech|toast|mc\b/))) output.push(finding({ ...common, kind: "speech", title: "Speech timing overlaps another shared commitment", detail: `${title(left)} and ${title(right)} need the same people.` }));
      if (pair.some((row) => categoryIs(row, /photo|portrait|video/))) output.push(finding({ ...common, kind: "photos", title: "Photo timing overlaps another shared commitment", detail: `${title(left)} and ${title(right)} need the same people.` }));
      if (pair.some((row) => categoryIs(row, /transport|pickup|departure|arrival|bus/))) output.push(finding({ ...common, kind: "transport", title: "Transport timing overlaps another shared commitment", detail: `${title(left)} and ${title(right)} need the same people.` }));
    }
  }
  return output;
}

function boundaryFindings(rows: WeddingRunSheetPresentedRow[]): WeddingRunSheetFinding[] {
  return rows.flatMap((row) => {
    const output: WeddingRunSheetFinding[] = [];
    const start = timestamp(row.effectiveStartAt);
    const end = rowEnd(row);
    const common = { recordIds: [row.record.id], sourceRefs: sourceRefs(row) };
    if (start === null) output.push(finding({ ...common, kind: "missing_time", evidenceState: "unknown", title: "Time still needed", detail: `${title(row)} has no usable start time.` }));
    if (refs(row, "owner_refs").length === 0) output.push(finding({ ...common, kind: "missing_owner", evidenceState: "unknown", title: "Owner still needed", detail: `${title(row)} has no assigned owner.` }));
    if (!text(row.record.data.location)) output.push(finding({ ...common, kind: "missing_place", evidenceState: "unknown", title: "Place still needed", detail: `${title(row)} has no recorded place.` }));
    const accessAt = timestamp(row.record.data.access_from_at ?? row.record.data.access_at);
    if (start !== null && accessAt !== null && start < accessAt) output.push(finding({ ...common, kind: "access", evidenceState: "conflict", title: "This starts before access is available", detail: `${title(row)} begins before the recorded access time.` }));
    const curfewAt = timestamp(row.record.data.curfew_at);
    if (end !== null && curfewAt !== null && end > curfewAt) output.push(finding({ ...common, kind: "curfew", evidenceState: "conflict", title: "This runs beyond the recorded curfew", detail: `${title(row)} finishes after the recorded curfew.` }));
    return output;
  });
}

function transitions(rows: WeddingRunSheetPresentedRow[]): { findings: WeddingRunSheetFinding[]; buffers: WeddingRunSheetBufferSuggestion[] } {
  const findings: WeddingRunSheetFinding[] = [];
  const buffers: WeddingRunSheetBufferSuggestion[] = [];
  const timed = rows.filter((row) => timestamp(row.effectiveStartAt) !== null);
  for (let index = 1; index < timed.length; index += 1) {
    const previous = timed[index - 1];
    const next = timed[index];
    const previousEnd = rowEnd(previous);
    const nextStart = timestamp(next.effectiveStartAt);
    if (previousEnd === null || nextStart === null) continue;
    const gapMinutes = Math.floor((nextStart - previousEnd) / 60_000);
    const previousPlace = text(previous.record.data.location).toLocaleLowerCase();
    const nextPlace = text(next.record.data.location).toLocaleLowerCase();
    const placesDiffer = !!previousPlace && !!nextPlace && previousPlace !== nextPlace;
    const travelMinutes = number(next.record.data.travel_minutes_from_previous ?? previous.record.data.travel_minutes_to_next);
    const sharedRefs = [...sourceRefs(previous), ...sourceRefs(next)];
    if (placesDiffer && travelMinutes === null) findings.push(finding({ kind: "travel", evidenceState: "unknown", recordIds: [previous.record.id, next.record.id], title: "Travel time still needs checking", detail: `${title(previous)} and ${title(next)} are at different places, but no travel time is recorded.`, sourceRefs: sharedRefs }));
    if (placesDiffer && travelMinutes !== null && gapMinutes < travelMinutes) findings.push(finding({ kind: "travel", evidenceState: "conflict", recordIds: [previous.record.id, next.record.id], title: "Not enough recorded travel time", detail: `${gapMinutes} minutes are available; ${travelMinutes} minutes are recorded as needed.`, sourceRefs: sharedRefs }));
    const riskyCategory = [previous, next].some((row) => categoryIs(row, /transport|photo|speech|meal|cater|access|setup/));
    if (gapMinutes < 0 || gapMinutes >= 20 || (!placesDiffer && !riskyCategory)) continue;
    const minutes: 15 | 20 = placesDiffer ? 20 : 15;
    if (gapMinutes >= minutes) continue;
    const basis = { previous: previous.record.id, next: next.record.id, gapMinutes, minutes, sourceRefs: sharedRefs };
    const inputFingerprint = weddingRunSheetFingerprint(basis);
    buffers.push({
      id: `buffer:${inputFingerprint}`,
      state: "suggested",
      targetRecordId: next.record.id,
      affectedRecordIds: [previous.record.id, next.record.id],
      field: "buffer_before_minutes",
      minutes,
      title: `${minutes}-minute buffer before ${title(next)}`,
      explanation: `${title(previous)} leaves ${Math.max(0, gapMinutes)} minutes before ${title(next)}${placesDiffer ? " at a different place" : ""}. Review the affected items before adding this buffer.`,
      sourceRefs: sharedRefs,
      inputFingerprint,
      promptVersion: "deterministic-rules-v1",
      modelInputTokens: 0,
      modelOutputTokens: 0,
      modelCostMicrousd: 0,
      approvalStatus: "unreviewed",
      revisionHistory: [{ revision: 1, state: "suggested", inputFingerprint }],
    });
  }
  return { findings, buffers };
}

function card(input: Omit<WeddingRunSheetContextCard, "a2ui">): WeddingRunSheetContextCard {
  return {
    ...input,
    a2ui: {
      schema_version: "a2ui.v1",
      layout: "card",
      nodes: [{ type: "section", props: { title: input.title, summary: input.summary, items: input.items, action: input.intent ? { label: input.actionLabel, intent: input.intent } : null } }],
    },
  };
}

export function buildWeddingRunSheetIntelligence(input: { rows: WeddingRunSheetPresentedRow[]; now?: string; accountModelBudgetMicrousd?: number | null; weddingModelBudgetMicrousd?: number | null }): WeddingRunSheetIntelligence {
  const rows = input.rows.slice().sort((left, right) => (left.effectiveStartAt ?? "9999").localeCompare(right.effectiveStartAt ?? "9999") || left.record.id.localeCompare(right.record.id));
  const transition = transitions(rows);
  const findings = [...boundaryFindings(rows), ...overlapFindings(rows), ...transition.findings];
  const conflicts = findings.filter((item) => item.evidenceState === "conflict");
  const unknowns = findings.filter((item) => item.evidenceState === "unknown");
  const confirmed = rows.filter((row) => row.status === "confirmed");
  const unknownRecordIds = Array.from(new Set(unknowns.flatMap((item) => item.recordIds)));
  const attentionRecordIds = Array.from(new Set([
    ...conflicts.flatMap((item) => item.recordIds),
    ...unknownRecordIds,
    ...rows.filter((row) => row.status !== "confirmed").map((row) => row.record.id),
  ]));
  const milestones = rows.filter((row) => row.record.data.fixed_milestone === true || row.record.data.category === "milestone");
  const now = timestamp(input.now ?? new Date().toISOString()) ?? Date.now();
  const current = rows.find((row) => (timestamp(row.effectiveStartAt) ?? Infinity) <= now && (rowEnd(row) ?? -Infinity) >= now);
  const next = rows.find((row) => (timestamp(row.effectiveStartAt) ?? -Infinity) > now);
  const distributionReady = rows.length > 0 && conflicts.length === 0 && unknowns.length === 0 && rows.every((row) => row.status === "confirmed");
  const firstConflict = conflicts[0] ?? null;
  const firstBuffer = transition.buffers[0] ?? null;
  const cards = [
    card({ id: "next_conflict", title: "Next conflict", summary: firstConflict ? firstConflict.title : "No evidence-backed timing conflict found.", tone: firstConflict ? "risk" : "ready", items: firstConflict ? [firstConflict.detail] : [], actionLabel: firstConflict ? "Show affected items" : null, intent: firstConflict ? { kind: "focus_records", recordIds: firstConflict.recordIds } : null }),
    card({ id: "fixed_milestones", title: "Fixed milestones", summary: `${milestones.length} confirmed milestone${milestones.length === 1 ? "" : "s"}.`, tone: milestones.length ? "neutral" : "attention", items: milestones.slice(0, 3).map(title), actionLabel: milestones.length ? "Show milestones" : "Add milestone", intent: milestones.length ? { kind: "focus_records", recordIds: milestones.map((row) => row.record.id) } : { kind: "add_item", preset: "milestone" } }),
    card({ id: "buffer_review", title: "Buffer review", summary: firstBuffer ? firstBuffer.title : "No short risky transition needs a buffer review.", tone: firstBuffer ? "attention" : "ready", items: firstBuffer ? [firstBuffer.explanation] : [], actionLabel: firstBuffer ? "Review buffer" : null, intent: firstBuffer ? { kind: "review_buffer", suggestionId: firstBuffer.id } : null }),
    card({ id: "missing_information", title: "Missing information", summary: unknowns.length ? `${unknowns.length} detail${unknowns.length === 1 ? "" : "s"} still need confirmation.` : "Owner, place and time evidence is complete.", tone: unknowns.length ? "attention" : "ready", items: unknowns.slice(0, 3).map((item) => item.detail), actionLabel: unknowns.length ? "Show items to complete" : null, intent: unknowns.length ? { kind: "focus_records", recordIds: unknownRecordIds } : null }),
    card({ id: "distribution_readiness", title: "Distribution readiness", summary: distributionReady ? "This run sheet is ready to preview for distribution." : "Resolve conflicts, missing details and proposed times before distribution.", tone: distributionReady ? "ready" : "attention", items: [`${conflicts.length} conflicts`, `${unknowns.length} unknown details`, `${rows.length - confirmed.length} not confirmed`], actionLabel: distributionReady ? "Show all items" : "Show what needs attention", intent: distributionReady ? { kind: "show_all" } : { kind: "focus_records", recordIds: attentionRecordIds } }),
    card({ id: "day_of_now_next", title: "Day-of now and next", summary: current ? `Now: ${title(current)}` : next ? `Next: ${title(next)}` : "No upcoming timed item.", tone: current || next ? "neutral" : "attention", items: [current?.effectiveEndAt ? `Ends ${current.effectiveEndAt}` : "", next?.effectiveStartAt ? `Next starts ${next.effectiveStartAt}` : ""].filter(Boolean), actionLabel: current || next ? "Show item" : "Add first item", intent: current || next ? { kind: "focus_records", recordIds: [(current ?? next)!.record.id] } : { kind: "add_item", preset: "item" } }),
  ];
  const accountRemainingMicrousd = input.accountModelBudgetMicrousd ?? null;
  const weddingRemainingMicrousd = input.weddingModelBudgetMicrousd ?? null;
  return { findings, bufferSuggestions: transition.buffers, cards, modelCalls: 0, modelBudget: { accountRemainingMicrousd, weddingRemainingMicrousd, exhausted: accountRemainingMicrousd === 0 || weddingRemainingMicrousd === 0, deterministicFallback: true } };
}

export function weddingRunSheetApprovedBufferPatch(suggestion: WeddingRunSheetBufferSuggestion, approvedAt: string): Record<string, unknown> {
  return {
    [suggestion.field]: suggestion.minutes,
    buffer_suggestion_state: "approved",
    buffer_suggestion_id: suggestion.id,
    buffer_input_fingerprint: suggestion.inputFingerprint,
    buffer_source_refs: suggestion.sourceRefs,
    buffer_prompt_version: suggestion.promptVersion,
    buffer_model_input_tokens: suggestion.modelInputTokens,
    buffer_model_output_tokens: suggestion.modelOutputTokens,
    buffer_model_cost_microusd: suggestion.modelCostMicrousd,
    buffer_approval_status: "approved",
    buffer_revision_history: [...suggestion.revisionHistory, { revision: 2, state: "approved", approved_at: approvedAt }],
    buffer_approved_at: approvedAt,
  };
}
