import test from "node:test";
import assert from "node:assert/strict";

import {
  loadLocalWeddingDate,
  parseWeddingDateInput,
  saveLocalWeddingDate,
  validIsoDate,
  weddingDatePlaceholder,
  weddingDateToAfpSendInputs,
  weddingDateToScheduleItem,
} from "@/lib/weddingDateCaptureState";

function fakeStorage(): Storage {
  const state = new Map<string, string>();
  return {
    getItem: (key: string) => (state.has(key) ? state.get(key)! : null),
    setItem: (key: string, value: string) => {
      state.set(key, value);
    },
    removeItem: (key: string) => {
      state.delete(key);
    },
    clear: () => state.clear(),
    key: () => null,
    get length() {
      return state.size;
    },
  } as Storage;
}

test("wedding date parser accepts ISO and Australian date input", () => {
  assert.equal(parseWeddingDateInput("2027-09-18"), "2027-09-18");
  assert.equal(parseWeddingDateInput("18/09/2027"), "2027-09-18");
  assert.equal(parseWeddingDateInput("18.09.2027"), "2027-09-18");
  assert.equal(parseWeddingDateInput("31/02/2027"), null);
  assert.equal(parseWeddingDateInput("not a date"), null);
});

test("wedding date validity and placeholders stay locale aware", () => {
  assert.equal(validIsoDate("2027-09-18"), true);
  assert.equal(validIsoDate("2027-02-31"), false);
  assert.equal(weddingDatePlaceholder("en-AU"), "dd/MM/yyyy");
  assert.equal(weddingDatePlaceholder("United States"), "MM/dd/yyyy");
  assert.equal(weddingDatePlaceholder("de-DE"), "yyyy-MM-dd");
});

test("local wedding date storage is scoped by workspace", () => {
  const storage = fakeStorage();
  saveLocalWeddingDate("workspace-one", "2027-09-18", storage);
  saveLocalWeddingDate("workspace-two", "not-valid", storage);

  assert.equal(loadLocalWeddingDate("workspace-one", storage), "2027-09-18");
  assert.equal(loadLocalWeddingDate("workspace-two", storage), null);
});

test("wedding date becomes schedule and AFP inputs for calendar plus knowledge graph", () => {
  const metadata = {
    weddingPlanId: "plan-123",
    responseWorkspaceId: "workspace-456",
    sourceResponseId: "response-789",
  };
  const scheduleItem = weddingDateToScheduleItem({ date: "2027-09-18", metadata, planningStartedAt: "2026-10-08" });
  assert.equal(scheduleItem.title, "Wedding date");
  assert.equal(scheduleItem.reviewStatus, "accepted");
  assert.equal(scheduleItem.approvalState, "approved");
  assert.equal(scheduleItem.startAt, "2027-09-18T09:00:00.000Z");
  assert.equal(scheduleItem.metadata.planning_started_at, "2026-10-08");

  const sendInputs = weddingDateToAfpSendInputs({ date: "2027-09-18", metadata, planningStartedAt: "2026-10-08" });
  assert.equal(sendInputs.length, 2);
  assert.ok(sendInputs.some((input) => input.type === "calendar_event" && input.to.includes("agent://calendar")));
  assert.ok(sendInputs.some((input) => input.subtype === "wedding_decision_selection" && input.to.includes("agent://knowledge-graph")));
});
