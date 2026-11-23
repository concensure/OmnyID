import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import {
  loadOperatorRuntimeRemediationOutcomeNotes,
  loadOperatorRuntimeRemediationProofReferences,
  loadOperatorRuntimeRemediationFeaturedReceiptId,
  loadOperatorRuntimeRemediationFilter,
  normalizeOperatorRuntimeRemediationDraftMap,
  normalizeOperatorRuntimeRemediationReceiptId,
  OPERATOR_RUNTIME_REMEDIATION_FEATURED_RECEIPT_KEY,
  normalizeOperatorRuntimeRemediationFilter,
  OPERATOR_RUNTIME_REMEDIATION_FILTER_KEY,
  OPERATOR_RUNTIME_REMEDIATION_OUTCOME_NOTES_KEY,
  OPERATOR_RUNTIME_REMEDIATION_PROOF_REFERENCES_KEY,
  saveOperatorRuntimeRemediationFeaturedReceiptId,
  saveOperatorRuntimeRemediationFilter,
  saveOperatorRuntimeRemediationOutcomeNotes,
  saveOperatorRuntimeRemediationProofReferences,
} from "@/lib/operatorRuntimeRemediationLocalState";

const localStorageState = new Map<string, string>();

Object.assign(globalThis, {
  localStorage: {
    getItem(key: string) {
      return localStorageState.has(key) ? localStorageState.get(key)! : null;
    },
    setItem(key: string, value: string) {
      localStorageState.set(key, value);
    },
    removeItem(key: string) {
      localStorageState.delete(key);
    },
  },
});

test.beforeEach(() => {
  localStorageState.clear();
});

test("normalizeOperatorRuntimeRemediationFilter defaults invalid values to open", () => {
  assert.equal(normalizeOperatorRuntimeRemediationFilter("all"), "all");
  assert.equal(normalizeOperatorRuntimeRemediationFilter(" drafts "), "drafts");
  assert.equal(normalizeOperatorRuntimeRemediationFilter(" completed "), "completed");
  assert.equal(normalizeOperatorRuntimeRemediationFilter("bad"), "open");
  assert.equal(normalizeOperatorRuntimeRemediationFilter(null), "open");
});

test("normalizeOperatorRuntimeRemediationReceiptId trims valid ids and rejects blank values", () => {
  assert.equal(normalizeOperatorRuntimeRemediationReceiptId(" receipt-1 "), "receipt-1");
  assert.equal(normalizeOperatorRuntimeRemediationReceiptId("   "), null);
  assert.equal(normalizeOperatorRuntimeRemediationReceiptId(null), null);
});

test("normalizeOperatorRuntimeRemediationDraftMap keeps only non-empty string entries keyed by valid receipt ids", () => {
  assert.deepEqual(
    normalizeOperatorRuntimeRemediationDraftMap({
      " receipt-1 ": " verified ",
      "": "ignored",
      "receipt-2": "   ",
      "receipt-3": 7,
    }),
    { "receipt-1": "verified" },
  );
});

test("loadOperatorRuntimeRemediationFilter falls back to open and rewrites malformed stored values", () => {
  const key = accountScopedStorageKey(OPERATOR_RUNTIME_REMEDIATION_FILTER_KEY, "user-1");
  localStorageState.set(key, "weird");

  assert.equal(loadOperatorRuntimeRemediationFilter("user-1"), "open");
  assert.equal(localStorageState.get(key), "open");
});

test("saveOperatorRuntimeRemediationFilter scopes values per user", () => {
  const userOneKey = accountScopedStorageKey(OPERATOR_RUNTIME_REMEDIATION_FILTER_KEY, "user-1");
  const userTwoKey = accountScopedStorageKey(OPERATOR_RUNTIME_REMEDIATION_FILTER_KEY, "user-2");

  saveOperatorRuntimeRemediationFilter("user-1", "completed");
  saveOperatorRuntimeRemediationFilter("user-2", "drafts");

  assert.equal(localStorageState.get(userOneKey), "completed");
  assert.equal(localStorageState.get(userTwoKey), "drafts");
  assert.equal(loadOperatorRuntimeRemediationFilter("user-1"), "completed");
  assert.equal(loadOperatorRuntimeRemediationFilter("user-2"), "drafts");
});

test("featured remediation receipt ids are scoped per user and malformed values are removed", () => {
  const userOneKey = accountScopedStorageKey(OPERATOR_RUNTIME_REMEDIATION_FEATURED_RECEIPT_KEY, "user-1");
  const userTwoKey = accountScopedStorageKey(OPERATOR_RUNTIME_REMEDIATION_FEATURED_RECEIPT_KEY, "user-2");

  localStorageState.set(userOneKey, "   ");
  assert.equal(loadOperatorRuntimeRemediationFeaturedReceiptId("user-1"), null);
  assert.equal(localStorageState.has(userOneKey), false);

  saveOperatorRuntimeRemediationFeaturedReceiptId("user-1", " receipt-1 ");
  saveOperatorRuntimeRemediationFeaturedReceiptId("user-2", "receipt-2");

  assert.equal(localStorageState.get(userOneKey), "receipt-1");
  assert.equal(localStorageState.get(userTwoKey), "receipt-2");
  assert.equal(loadOperatorRuntimeRemediationFeaturedReceiptId("user-1"), "receipt-1");
  assert.equal(loadOperatorRuntimeRemediationFeaturedReceiptId("user-2"), "receipt-2");

  saveOperatorRuntimeRemediationFeaturedReceiptId("user-1", null);
  assert.equal(localStorageState.has(userOneKey), false);
});

test("outcome note drafts are scoped per user and malformed storage is rewritten", () => {
  const key = accountScopedStorageKey(OPERATOR_RUNTIME_REMEDIATION_OUTCOME_NOTES_KEY, "user-1");
  localStorageState.set(key, JSON.stringify({
    " receipt-1 ": " verified ",
    "receipt-2": "   ",
  }));

  assert.deepEqual(loadOperatorRuntimeRemediationOutcomeNotes("user-1"), {
    "receipt-1": "verified",
  });
  assert.equal(localStorageState.get(key), JSON.stringify({ "receipt-1": "verified" }));

  saveOperatorRuntimeRemediationOutcomeNotes("user-2", { "receipt-9": "done" });
  assert.equal(
    localStorageState.get(accountScopedStorageKey(OPERATOR_RUNTIME_REMEDIATION_OUTCOME_NOTES_KEY, "user-2")),
    JSON.stringify({ "receipt-9": "done" }),
  );
});

test("proof reference drafts are scoped per user and bad json is cleared", () => {
  const key = accountScopedStorageKey(OPERATOR_RUNTIME_REMEDIATION_PROOF_REFERENCES_KEY, "user-1");
  localStorageState.set(key, "{bad-json");

  assert.deepEqual(loadOperatorRuntimeRemediationProofReferences("user-1"), {});
  assert.equal(localStorageState.has(key), false);

  saveOperatorRuntimeRemediationProofReferences("user-2", { "receipt-4": "ticket-22" });
  assert.equal(
    localStorageState.get(accountScopedStorageKey(OPERATOR_RUNTIME_REMEDIATION_PROOF_REFERENCES_KEY, "user-2")),
    JSON.stringify({ "receipt-4": "ticket-22" }),
  );
});
