import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsObjectRetrievalBadges,
  decisionOsLeadingObjectCue,
  decisionOsObjectSupportState,
  decisionOsTopObjectFreshnessState,
  decisionOsTopObjectFreshnessSummary,
} from "../src/lib/decisionosObjectRetrievalState.ts";

test("decisionos top object freshness summary maps compact retrieval badges", () => {
  assert.equal(
    decisionOsTopObjectFreshnessSummary({
      summary: "Top surfaced object result is still fresh in the current result window.",
      badges: ["fresh-top-object"],
    }),
    "Top object context is fresh.",
  );
  assert.equal(
    decisionOsTopObjectFreshnessSummary({
      summary: "Top surfaced object result remains active within the current result window.",
      badges: ["active-top-object"],
    }),
    "Top object context remains active.",
  );
  assert.equal(
    decisionOsTopObjectFreshnessSummary({
      summary: "Top surfaced object result is older context that still ranks highly.",
      badges: ["stale-top-object"],
    }),
    "Top object context is older but still relevant.",
  );
  assert.deepEqual(
    decisionOsTopObjectFreshnessState({
      summary: "Top surfaced object result is older context that still ranks highly.",
      badges: ["stale-top-object"],
    }),
    {
      badge: "Top object stale",
      summary: "Top object context is older but still relevant.",
      tone: "warning",
    },
  );
});

test("decisionos object retrieval badges filter compact top object freshness badges", () => {
  assert.deepEqual(
    decisionOsObjectRetrievalBadges({
      result: {
        retrieval_state: {
          badges: ["fresh-top-object", "kind-concentrated", "focused object"],
        },
      },
    }),
    ["kind concentrated", "focused object"],
  );
});

test("decisionos object retrieval badges humanize object support cues", () => {
  assert.deepEqual(
    decisionOsObjectRetrievalBadges({
      result: {
        retrieval_state: {
          badges: ["fresh-object supported", "older-object supported", "narrowing-first"],
        },
      },
    }),
    ["narrowing-first"],
  );
  assert.deepEqual(
    decisionOsObjectSupportState({
      summary: "Current ranking is older object support.",
      badges: ["older-object supported"],
    }),
    {
      badge: "Older object support",
      summary: "Older object evidence is still driving this retrieval.",
      tone: "warning",
    },
  );
});

test("decisionos object retrieval extracts leading object cue from summary text", () => {
  assert.equal(
    decisionOsLeadingObjectCue({
      summary:
        "Current ranking is active-state weighted. Top surfaced object result is still fresh in the current result window. Leading object cue: aurora.",
      badges: ["active-state weighted"],
    }),
    "aurora",
  );
  assert.equal(
    decisionOsLeadingObjectCue({
      summary: "Current ranking is active-state weighted.",
      badges: ["active-state weighted"],
    }),
    null,
  );
});
