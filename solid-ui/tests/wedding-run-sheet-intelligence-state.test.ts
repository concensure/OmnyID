import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingRunSheetPresentedRow } from "../src/lib/weddingRunSheetEditingState.ts";
import {
  buildWeddingRunSheetIntelligence,
  weddingRunSheetApprovedBufferPatch,
} from "../src/lib/weddingRunSheetIntelligenceState.ts";

function row(id: string, data: Record<string, unknown>): WeddingRunSheetPresentedRow {
  const start = typeof data.start_at === "string" ? data.start_at : null;
  const end = typeof data.end_at === "string" ? data.end_at : null;
  return {
    record: { id, databaseId: "db", table: "run_sheet", revision: 1, timestamp: start ?? "", data } as never,
    effectiveStartAt: start,
    effectiveEndAt: end,
    timeZone: "Australia/Sydney",
    day: start?.slice(0, 10) ?? "unscheduled",
    status: String(data.status ?? "proposed"),
    conflictCodes: [],
    anchorAdjusted: false,
    sourceLinked: true,
    overrideState: null,
  };
}

test("deterministic rules cover people, vendor, meal, speech, photo and transport overlaps", () => {
  const state = buildWeddingRunSheetIntelligence({ rows: [
    row("meal", { title: "Dinner service", category: "meal", start_at: "2027-11-20T08:00:00Z", end_at: "2027-11-20T09:00:00Z", location: "Hall", owner_refs: ["coordinator"], vendor_refs: ["venue"], participant_refs: ["couple"], status: "confirmed" }),
    row("speech", { title: "Parent speech", category: "speech", start_at: "2027-11-20T08:30:00Z", end_at: "2027-11-20T09:10:00Z", location: "Hall", owner_refs: ["coordinator"], vendor_refs: ["venue"], participant_refs: ["couple"], status: "confirmed" }),
    row("photos", { title: "Sunset photos", category: "photos", start_at: "2027-11-20T08:35:00Z", end_at: "2027-11-20T09:05:00Z", location: "Garden", participant_refs: ["couple"], owner_refs: ["photographer"], status: "proposed" }),
    row("transport", { title: "Couple transport", category: "transport", start_at: "2027-11-20T08:40:00Z", end_at: "2027-11-20T09:00:00Z", location: "Drive", participant_refs: ["couple"], owner_refs: ["driver"], status: "proposed" }),
  ], now: "2027-11-20T08:45:00Z" });
  const kinds = new Set(state.findings.filter((item) => item.evidenceState === "conflict").map((item) => item.kind));
  for (const kind of ["owner_overlap", "vendor_overlap", "meal", "speech", "photos", "transport"]) assert.ok(kinds.has(kind), kind);
  assert.equal(state.modelCalls, 0);
});

test("access, curfew and recorded travel rules use explicit evidence", () => {
  const state = buildWeddingRunSheetIntelligence({ rows: [
    row("setup", { title: "Venue setup", category: "setup", start_at: "2027-11-20T06:00:00Z", end_at: "2027-11-20T07:00:00Z", access_from_at: "2027-11-20T06:30:00Z", location: "Venue", owner_refs: ["venue"] }),
    row("ceremony", { title: "Ceremony", category: "ceremony", start_at: "2027-11-20T07:10:00Z", end_at: "2027-11-20T08:00:00Z", location: "Beach", travel_minutes_from_previous: 25, curfew_at: "2027-11-20T07:50:00Z", owner_refs: ["celebrant"] }),
  ] });
  const conflicts = new Set(state.findings.filter((item) => item.evidenceState === "conflict").map((item) => item.kind));
  assert.ok(conflicts.has("access"));
  assert.ok(conflicts.has("curfew"));
  assert.ok(conflicts.has("travel"));
});

test("unknown travel and missing facts stay unknown rather than becoming conflicts", () => {
  const state = buildWeddingRunSheetIntelligence({ rows: [
    row("one", { title: "Photos", category: "photos", start_at: "2027-11-20T06:00:00Z", end_at: "2027-11-20T07:00:00Z", location: "Beach", owner_refs: ["photographer"] }),
    row("two", { title: "Arrival", category: "transport", start_at: "2027-11-20T07:10:00Z", end_at: "2027-11-20T07:30:00Z", location: "Hall" }),
    row("three", { title: "Pack down", category: "setup" }),
  ] });
  assert.ok(state.findings.some((item) => item.kind === "travel" && item.evidenceState === "unknown"));
  assert.ok(state.findings.some((item) => item.kind === "missing_owner" && item.evidenceState === "unknown"));
  assert.ok(state.findings.some((item) => item.kind === "missing_place" && item.evidenceState === "unknown"));
  assert.ok(!state.findings.some((item) => item.kind === "travel" && item.evidenceState === "conflict"));
  const missing = state.cards.find((item) => item.id === "missing_information");
  assert.equal(missing?.intent?.kind, "focus_records");
  assert.deepEqual(new Set(missing?.intent?.kind === "focus_records" ? missing.intent.recordIds : []), new Set(["one", "two", "three"]));
});

test("unrelated simultaneous items do not fabricate overlap conflicts", () => {
  const state = buildWeddingRunSheetIntelligence({ rows: [
    row("one", { title: "Flowers", start_at: "2027-11-20T06:00:00Z", end_at: "2027-11-20T07:00:00Z", location: "Hall", owner_refs: ["florist"] }),
    row("two", { title: "Hair", start_at: "2027-11-20T06:15:00Z", end_at: "2027-11-20T07:00:00Z", location: "Hotel", owner_refs: ["stylist"] }),
  ] });
  assert.equal(state.findings.filter((item) => item.evidenceState === "conflict").length, 0);
});

test("buffers remain suggested until an explicit approval patch and never confirm a row", () => {
  const state = buildWeddingRunSheetIntelligence({ rows: [
    row("one", { title: "Portraits", category: "photos", start_at: "2027-11-20T06:00:00Z", end_at: "2027-11-20T07:00:00Z", location: "Beach", owner_refs: ["photographer"] }),
    row("two", { title: "Reception", category: "meal", start_at: "2027-11-20T07:10:00Z", end_at: "2027-11-20T08:00:00Z", location: "Hall", owner_refs: ["venue"] }),
  ] });
  const suggestion = state.bufferSuggestions[0];
  assert.equal(suggestion.state, "suggested");
  assert.equal(suggestion.minutes, 20);
  assert.equal(suggestion.modelCostMicrousd, 0);
  assert.equal(suggestion.modelInputTokens, 0);
  assert.equal(suggestion.approvalStatus, "unreviewed");
  const patch = weddingRunSheetApprovedBufferPatch(suggestion, "2027-01-01T00:00:00Z");
  assert.equal(patch.buffer_suggestion_state, "approved");
  assert.equal(patch.buffer_before_minutes, 20);
  assert.equal(patch.buffer_approval_status, "approved");
  assert.equal((patch.buffer_revision_history as unknown[]).length, 2);
  assert.equal("status" in patch, false);
  assert.equal("confirmed" in patch, false);
});

test("exhausted account or wedding model budgets preserve the deterministic result", () => {
  const rows = [row("one", { title: "Ceremony", start_at: "2027-11-20T06:00:00Z", location: "Garden", owner_refs: ["celebrant"] })];
  const state = buildWeddingRunSheetIntelligence({ rows, accountModelBudgetMicrousd: 0, weddingModelBudgetMicrousd: 0 });
  assert.equal(state.modelCalls, 0);
  assert.equal(state.modelBudget.exhausted, true);
  assert.equal(state.modelBudget.deterministicFallback, true);
  assert.equal(state.cards.length, 6);
});

test("six contextual cards expose bounded A2UI intents without mutation authority", () => {
  const state = buildWeddingRunSheetIntelligence({ rows: [row("one", { title: "Ceremony", start_at: "2027-11-20T06:00:00Z", end_at: "2027-11-20T07:00:00Z", location: "Garden", owner_refs: ["celebrant"], status: "confirmed" })], now: "2027-11-20T06:30:00Z" });
  assert.deepEqual(state.cards.map((card) => card.id), ["next_conflict", "fixed_milestones", "buffer_review", "missing_information", "distribution_readiness", "day_of_now_next"]);
  assert.ok(state.cards.every((card) => card.a2ui.schema_version === "a2ui.v1"));
  assert.ok(state.cards.every((card) => !JSON.stringify(card.intent).includes("confirm")));
});

test("empty run sheets offer in-place item and milestone creation", () => {
  const state = buildWeddingRunSheetIntelligence({ rows: [] });
  const milestone = state.cards.find((card) => card.id === "fixed_milestones");
  const dayOf = state.cards.find((card) => card.id === "day_of_now_next");
  assert.deepEqual(milestone?.intent, { kind: "add_item", preset: "milestone" });
  assert.equal(milestone?.actionLabel, "Add milestone");
  assert.deepEqual(dayOf?.intent, { kind: "add_item", preset: "item" });
  assert.equal(dayOf?.actionLabel, "Add first item");
});

test("fixed milestones do not count every confirmed run-sheet item", () => {
  const state = buildWeddingRunSheetIntelligence({ rows: [
    row("ordinary", { title: "Ordinary confirmed item", status: "confirmed", start_at: "2027-11-20T06:00:00Z", location: "Venue", owner_refs: ["coordinator"] }),
    row("milestone", { title: "Ceremony starts", status: "confirmed", category: "milestone", fixed_milestone: true, start_at: "2027-11-20T07:00:00Z", location: "Venue", owner_refs: ["celebrant"] }),
  ] });
  const card = state.cards.find((item) => item.id === "fixed_milestones");
  assert.equal(card?.summary, "1 confirmed milestone.");
  assert.deepEqual(card?.items, ["Ceremony starts"]);
});
