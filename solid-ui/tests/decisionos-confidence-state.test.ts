import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsConfidenceBadgeClass,
  decisionOsConfidenceFallbackTitle,
  decisionOsConfidenceLabel,
  decisionOsConfidencePercent,
  decisionOsConfidenceStripClass,
  decisionOsConfidenceTitle,
  decisionOsConfidenceTone,
} from "../src/lib/decisionOsConfidenceState.ts";

test("decisionos confidence state derives percent and label", () => {
  assert.equal(decisionOsConfidencePercent(0.876), 88);
  assert.equal(decisionOsConfidenceLabel(0.876), "88% confidence");
  assert.equal(decisionOsConfidenceFallbackTitle(), "AI confidence score");
  assert.equal(decisionOsConfidenceTitle(0.876), "Agent is confident");
});

test("decisionos confidence state maps tones, classes, and titles", () => {
  assert.equal(decisionOsConfidenceTone(0.9), "high");
  assert.equal(decisionOsConfidenceBadgeClass(0.9), "bg-emerald-100 text-emerald-700");
  assert.equal(decisionOsConfidenceStripClass(0.9), "bg-emerald-400");
  assert.equal(decisionOsConfidenceTitle(0.9), "Agent is confident");

  assert.equal(decisionOsConfidenceTone(0.75), "medium");
  assert.equal(decisionOsConfidenceBadgeClass(0.75), "bg-amber-100 text-amber-700");
  assert.equal(decisionOsConfidenceStripClass(0.75), "bg-amber-400");
  assert.equal(decisionOsConfidenceTitle(0.75), "Review recommended");

  assert.equal(decisionOsConfidenceTone(0.42), "low");
  assert.equal(decisionOsConfidenceBadgeClass(0.42), "bg-red-100 text-red-700");
  assert.equal(decisionOsConfidenceStripClass(0.42), "bg-red-400");
  assert.equal(decisionOsConfidenceTitle(0.42), "Low confidence — manual review advised");
});
