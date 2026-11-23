import test from "node:test";
import assert from "node:assert/strict";
import { decisionTriageToAfpSendInput } from "../src/lib/decisionTriageAfpState.ts";
const item = { id: "item-1", kind: "decision" as const, sourceSurface: "tasks", title: "Private title", recommendedActionLabel: "Open", whyNowLabel: "Now", dueAt: null, evidenceLabels: [], deferCount: 0, returnedFromLater: false, external: false, draftBody: "secret", recipient: "hidden@example.com" };
test("decision triage emits a minimised append-only AFP input", () => {
  const packet = decisionTriageToAfpSendInput({ action: "defer", item, deckPosition: 1, deckSize: 3, inputMethod: "swipe", userId: "user-1" }, "2026-10-05T00:00:00Z");
  assert.equal(packet.kind, "decision_triage"); assert.equal(packet.metadata?.origin, "mobile_focus_home");
  assert.match(packet.thread_id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.equal(packet.metadata?.logical_thread_id, "decision_triage:user-1");
  assert.equal(packet.from, "user://user-1");
  assert.equal(JSON.stringify(packet).includes("secret"), false); assert.equal(JSON.stringify(packet).includes("hidden@example.com"), false);
});
test("decision triage attaches a parent only for undo", () => {
  const packet = decisionTriageToAfpSendInput({ action: "undo", item, deckPosition: 0, deckSize: 1, inputMethod: "button", parentId: "afp-parent" });
  assert.equal(packet.parent_id, "afp-parent");
});
