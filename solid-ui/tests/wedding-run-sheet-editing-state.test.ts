import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingRunSheetTimeChangeReview,
  filterWeddingRunSheetRows,
  projectWeddingRunSheetRows,
  weddingRunSheetDefaultFilters,
  weddingRunSheetManualRecord,
  weddingRunSheetOverridePatch,
  weddingRunSheetShiftReview,
  weddingRunSheetDayKey,
  weddingRunSheetInputToIso,
  weddingRunSheetInputValue,
} from "../src/lib/weddingRunSheetEditingState.ts";

function row(id: string, data: Record<string, unknown>) {
  return { id, databaseId: "database:runsheet", table: "run_sheet", revision: 1, timestamp: "", data };
}

test("proposed relative rows move with their anchor while confirmed rows conflict", () => {
  const rows = projectWeddingRunSheetRows([
    row("ceremony", { title: "Ceremony", start_at: "2027-11-20T04:00:00Z", status: "confirmed", owner_refs: ["venue"] }),
    row("photos", { title: "Photos", start_at: "2027-11-20T04:30:00Z", status: "proposed", anchor_record_id: "ceremony", anchor_offset_minutes: 45, duration_minutes: 30, owner_refs: ["photographer"] }),
    row("speech", { title: "Speech", start_at: "2027-11-20T05:00:00Z", status: "confirmed", anchor_record_id: "ceremony", anchor_offset_minutes: 90, owner_refs: ["mc"] }),
  ]);
  assert.equal(rows.find((item) => item.record.id === "photos")?.effectiveStartAt, "2027-11-20T04:45:00.000Z");
  assert.ok(rows.find((item) => item.record.id === "speech")?.conflictCodes.includes("confirmed_anchor_drift"));
});

test("filters retain chronological rows for the selected day status and conflict state", () => {
  const rows = projectWeddingRunSheetRows([
    row("later", { title: "Later", start_at: "2027-11-21T02:00:00Z", status: "proposed", owner_refs: ["one"] }),
    row("earlier", { title: "Earlier", start_at: "2027-11-20T02:00:00Z", status: "confirmed", owner_refs: [] }),
  ]);
  assert.deepEqual(rows.map((item) => item.record.id), ["earlier", "later"]);
  const filtered = filterWeddingRunSheetRows(rows, { ...weddingRunSheetDefaultFilters(), day: "2027-11-20", status: "confirmed", conflictsOnly: true });
  assert.deepEqual(filtered.map((item) => item.record.id), ["earlier"]);
});

test("confirmed source-linked time changes require an explicit run-sheet override", () => {
  const record = row("ceremony", { status: "confirmed", start_at: "2027-11-20T04:00:00Z", source_refs: [{ message_id: "milestone-1", kind: "wedding_milestone" }] });
  const review = buildWeddingRunSheetTimeChangeReview({ record, field: "start_at", nextValue: "2027-11-20T04:15:00Z" });
  assert.equal(review?.requiresConfirmation, true);
  const patch = weddingRunSheetOverridePatch(review!);
  assert.deepEqual({ ...patch, override_recorded_at: "bounded" }, {
    start_at: "2027-11-20T04:15:00.000Z",
    override_state: "runsheet_only",
    authoritative_source_unchanged: true,
    override_recorded_at: "bounded",
  });
  assert.match(String(patch.override_recorded_at), /^\d{4}-\d{2}-\d{2}T/);
});

test("keyboard shift alternatives move unconfirmed rows by exact minutes", () => {
  const review = weddingRunSheetShiftReview(row("photos", { status: "proposed", start_at: "2027-11-20T04:00:00Z" }), -15);
  assert.equal(review?.nextValue, "2027-11-20T03:45:00.000Z");
  assert.equal(review?.requiresConfirmation, false);
});

test("manual run-sheet records retain participants and stay detached from projector authority", () => {
  const data = weddingRunSheetManualRecord({ title: "Pack emergency kit", startAt: "2027-11-20T01:00:00Z", participantRefs: ["Priya", " Priya ", "Daniel"], visibility: ["master", "vip"] });
  assert.equal(data.projection_state, "detached");
  assert.equal(data.override_state, "user_created");
  assert.deepEqual(data.visibility, ["master", "vip"]);
  assert.deepEqual(data.participant_refs, ["Priya", "Daniel"]);
});

test("manual fixed milestones reuse run-sheet records with explicit confirmed semantics", () => {
  const data = weddingRunSheetManualRecord({ title: "Ceremony starts", startAt: "2027-11-20T04:00:00Z", itemKind: "milestone" });
  assert.equal(data.category, "milestone");
  assert.equal(data.fixed_milestone, true);
  assert.equal(data.status, "confirmed");
  assert.equal(data.projection_state, "detached");
});

test("Sydney day filtering and datetime inputs survive UTC boundaries and daylight saving", () => {
  const utc = "2027-11-19T14:30:00.000Z";
  assert.equal(weddingRunSheetDayKey(utc, "Australia/Sydney"), "2027-11-20");
  assert.equal(weddingRunSheetInputValue(utc, "Australia/Sydney"), "2027-11-20T01:30");
  assert.equal(weddingRunSheetInputToIso("2027-11-20T01:30", "Australia/Sydney"), utc);
  assert.equal(weddingRunSheetInputToIso("2027-10-03T02:30", "Australia/Sydney"), null, "nonexistent DST wall time fails closed");
  const validAfterJump = weddingRunSheetInputToIso("2027-10-03T03:30", "Australia/Sydney");
  assert.equal(weddingRunSheetInputValue(validAfterJump, "Australia/Sydney"), "2027-10-03T03:30");
});
