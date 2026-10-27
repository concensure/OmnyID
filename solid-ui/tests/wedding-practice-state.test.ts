import assert from "node:assert/strict";
import test from "node:test";
import { assertPracticeBootstrap, createPracticeRequestGate, practiceClientsForRoute, practiceContextKey,
  practiceHref, readPracticeRoute, samePracticePlan } from "../src/lib/weddingPracticeState";
import { practiceFixture } from "./fixtures/wedding-practice";

test("practice routes preserve full client identity and reject partial context", () => {
  const route = readPracticeRoute("?practice=harbour&page=clients&owner=owner&plan=p&thread=t&search=Priya&filter=attention");
  assert.deepEqual(readPracticeRoute(practiceHref(route)), route);
  assert.equal(readPracticeRoute("?owner=o&plan=p&thread=t").client, null);
  assert.equal(readPracticeRoute("?practice=harbour&plan=p").client, null);
  assert.equal(readPracticeRoute("?page=evil&offset=-10").page, "home");
  assert.equal(samePracticePlan({ account_id: "a", plan_id: "p", thread_id: "t" }, { account_id: "b", plan_id: "p", thread_id: "t" }), false);
});
test("switching aborts and rejects late responses even when transport ignores cancellation", () => {
  const gate = createPracticeRequestGate(); const first = gate.begin(); const second = gate.begin();
  assert.equal(first.signal.aborted, true); assert.equal(first.isCurrent(), false); assert.equal(second.isCurrent(), true);
  gate.cancel(); assert.equal(second.isCurrent(), false);
});
test("home counters use the exact same filtered source as their destination", () => {
  const data = practiceFixture();
  for (const [filter, expected] of [["holds", 1], ["payments", 1], ["inbox", 1], ["week", 3], ["attention", 3], ["stage:archived", 0]] as const) {
    assert.equal(practiceClientsForRoute(data, readPracticeRoute(`?practice=harbour&page=clients&filter=${filter}`)).length, expected);
  }
  assert.equal(practiceClientsForRoute(data, readPracticeRoute("?practice=garden&page=clients")).length, 0);
  assert.equal(practiceClientsForRoute(data, readPracticeRoute("?practice=harbour&page=clients&search=priya")).length, 1);
});
test("stored navigation keys change with account and grant revisions", () => {
  const data = practiceFixture(), key = practiceContextKey(data);
  data.clients[0].authority.collaboration++;
  assert.notEqual(practiceContextKey(data), key);
  data.account_id = "another-account"; assert.notEqual(practiceContextKey(data), key);
});
test("bootstrap rejects wrong contexts and data attached to a denied response", () => {
  assert.doesNotThrow(() => assertPracticeBootstrap(practiceFixture(), "harbour"));
  assert.throws(() => assertPracticeBootstrap(practiceFixture(), "garden"));
  const revoked = practiceFixture(); revoked.status = "forbidden";
  assert.throws(() => assertPracticeBootstrap(revoked, "harbour"));
  const unavailable = practiceFixture(null); unavailable.professional_planner = false; unavailable.status = "unavailable"; unavailable.practices = [];
  assert.doesNotThrow(() => assertPracticeBootstrap(unavailable, null));
});
test("next-action cards cannot reference a hidden client or unsupported component", () => {
  const data = practiceFixture(); data.next_action!.plan = { account_id: "other", plan_id: "other", thread_id: "other" };
  assert.throws(() => assertPracticeBootstrap(data, "harbour"));
});
