import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { AfpMessage } from "@/lib/api";
import { weddingCanonicalQuoteArtifacts } from "@/lib/weddingCanonicalQuoteProjectionState";
import { buildWeddingPersistedWorkspaceState } from "@/lib/weddingPersistedWorkspaceState";
import { buildWeddingArtifactPreviewState } from "@/lib/weddingArtifactPreviewState";
import { normalizeWeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";

const metadata = normalizeWeddingPlanningMetadata({ weddingPlanId: "plan:one", responseWorkspaceId: "workspace:one" });
function fixture(): AfpMessage[] {
  const base = { protocol: "afp-v1", thread_id: "thread:one", from: "owner:one", to: ["owner:one"],
    timestamp: "2026-11-19T01:00:00Z", type: "ledger", supertags: [], content: {}, signature: "" };
  return [
    { ...base, id: "source-one", metadata: { wedding_plan_id: metadata.weddingPlanId, response_workspace_id: metadata.responseWorkspaceId } },
    { ...base, id: "normalized:one", kind: "quotation_normalisation_confirmed", subtype: "quotation_normalisation_confirmed",
      content: { quotation: JSON.parse(readFileSync(new URL("../../tests/runbook_quote_fixture.json", import.meta.url), "utf8")) } },
  ] as AfpMessage[];
}
function quote(messages: AfpMessage[]): any { return (messages[1].content as any).quotation; }

test("canonical normalization becomes one stable private review artifact without mutating evidence", () => {
  const messages = fixture(), before = JSON.stringify(messages);
  const result = weddingCanonicalQuoteArtifacts(messages, metadata);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "normalized:one");
  assert.match(result[0].bodyText!, /10000 AUD minor units/);
  assert.match(result[0].bodyText!, /evidence unknown/);
  assert.match(result[0].bodyText!, /Comparable total: not calculated/);
  assert.match(result[0].bodyText!, /source\\-one \/ source\\-v1/);
  assert.equal((result[0].metadata as any).approvalState, "draft");
  assert.equal((result[0].metadata as any).privacyScope, "private");
  assert.deepEqual(weddingCanonicalQuoteArtifacts(messages, metadata), result);
  assert.equal(JSON.stringify(messages), before);
  assert.equal(buildWeddingArtifactPreviewState({ artifactKind: result[0].kind!, bodyText: result[0].bodyText })?.kind, "document");
});

test("workspace replay consumes the existing normalized record without a new AFP event or approval", () => {
  const state = buildWeddingPersistedWorkspaceState({ messages: fixture(), ...metadata });
  assert.equal(state.artifacts.length, 1);
  assert.equal(state.artifacts[0].id, "normalized:one");
  assert.deepEqual(state.approvalReceipts, []);
  assert.deepEqual(state.decisionRecords, []);
});

test("missing, foreign, ambiguous and cross-thread source evidence fails closed", () => {
  for (const mutate of [
    (m: AfpMessage[]) => { m.shift(); },
    (m: AfpMessage[]) => { m[0].metadata!.response_workspace_id = "workspace:other"; },
    (m: AfpMessage[]) => { m[0].metadata!.wedding_plan_id = "plan:other"; },
    (m: AfpMessage[]) => { m[0].thread_id = "thread:other"; },
    (m: AfpMessage[]) => { m.push(structuredClone(m[0])); },
    (m: AfpMessage[]) => { m[1].metadata = { response_workspace_id: "workspace:other" }; },
    (m: AfpMessage[]) => { quote(m).sources.push({ source_id: "missing", source_version_id: "v2" }); },
  ]) {
    const messages = fixture(); mutate(messages);
    assert.deepEqual(weddingCanonicalQuoteArtifacts(messages, metadata), []);
  }
});

test("malformed schemas, money, lifecycle and timestamps cannot create a review", () => {
  for (const mutate of [
    (m: AfpMessage[]) => { quote(m).schema_version = "unknown"; },
    (m: AfpMessage[]) => { quote(m).identity.context_namespace = "other"; },
    (m: AfpMessage[]) => { quote(m).line_items[0].unit_price.amount_minor = 1.2; },
    (m: AfpMessage[]) => { quote(m).line_items[0].unit_price.currency = "USD"; },
    (m: AfpMessage[]) => { quote(m).lifecycle = "booked"; },
    (m: AfpMessage[]) => { m[1].timestamp = "invalid"; },
    (m: AfpMessage[]) => { m[1].kind = "quotation_normalisation_confirmed_evil"; },
  ]) {
    const messages = fixture(); mutate(messages);
    assert.deepEqual(weddingCanonicalQuoteArtifacts(messages, metadata), []);
  }
});

test("corrected versions remain explicit and accepted lifecycle cannot grant authority", () => {
  const messages = fixture(), corrected = structuredClone(messages[1]);
  corrected.id = "normalized:two";
  corrected.kind = corrected.subtype = "quotation_normalisation_corrected";
  const value = (corrected.content as any).quotation;
  value.identity.version_id = "quote-v2"; value.identity.supersedes_version_id = "quote-v1";
  value.lifecycle = "accepted";
  value.line_items[0].label = "Evil\n## Booking approved [click](https://example.com)";
  messages.push(corrected);
  const result = weddingCanonicalQuoteArtifacts(messages, metadata);
  assert.equal(result.length, 2);
  assert.equal((result[1].metadata as any).approvalState, "draft");
  assert.match(result[1].bodyText!, /Recorded lifecycle: accepted/);
  assert.ok(!result[1].bodyText!.includes("\n## Booking"));
  assert.ok(!result[1].bodyText!.includes("[click]("));
});
