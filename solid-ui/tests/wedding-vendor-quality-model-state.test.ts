import test from "node:test";
import assert from "node:assert/strict";
import { weddingVendorSentimentScore, weddingVenueQualityScore, weddingVendorValueScore } from "../src/lib/weddingVendorQualityModelState.ts";

const factors = (scores: number[]) => Object.fromEntries(["location", "condition", "food", "service", "capacity", "facilities", "exclusivity"].map((key, index) => [key, { score: scores[index], authority: 1, recency: 1 }])) as never;
test("venue quality reproduces the three researched examples without rounding inputs", () => {
  assert.ok(Math.abs(weddingVenueQualityScore({ factors: factors([5, 5, 5, 5, 4, 4, 5]) }).score - 4.82) < 1e-9);
  assert.ok(Math.abs(weddingVenueQualityScore({ factors: factors([5, 4, 5, 5, 5, 5, 5]) }).score - 4.86) < 1e-9);
  const waterview = weddingVenueQualityScore({ factors: factors([3, 4, 4, 4, 5, 5, 4]) });
  assert.ok(Math.abs(waterview.score - 3.96) < 1e-9);
  assert.ok(weddingVenueQualityScore({ factors: factors([3, 4, 4, 4, 5, 5, 4]), priorities: ["accessible", "good food"] }).score > waterview.score);
});
test("sentiment shrinkage respects review volume and value needs five comparables", () => {
  assert.ok(weddingVendorSentimentScore([{ rating: 4.7, reviewCount: 1600 }]).score > weddingVendorSentimentScore([{ rating: 4.8, reviewCount: 20 }]).score);
  assert.equal(weddingVendorValueScore({ quality: 4.5, effectiveCostPerGuest: 200, comparableCostsPerGuest: [100, 120] }).score, null);
  assert.equal(weddingVendorValueScore({ quality: 4.5, effectiveCostPerGuest: 150, comparableCostsPerGuest: [180, 190, 200, 210, 220] }).label, "Strong value");
});
