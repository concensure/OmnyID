import assert from "node:assert/strict";
import test from "node:test";

import { effectiveWeddingFormat, inferWeddingFormatFromGuestCount, normalizeWeddingFormat, weddingFormatFromDeepLink, weddingMenuEmphasis } from "@/lib/weddingFormatState";

test("wedding format inference uses the range upper bound and preserves unknowns", () => {
  assert.equal(inferWeddingFormatFromGuestCount("8"), "elopement");
  assert.equal(inferWeddingFormatFromGuestCount("20-35 guests"), "micro");
  assert.equal(inferWeddingFormatFromGuestCount("about 90"), "larger");
  assert.equal(inferWeddingFormatFromGuestCount("not sure"), null);
});

test("explicit format wins and menu emphasis never removes a route", () => {
  assert.deepEqual(effectiveWeddingFormat({ explicit: "larger", deepLink: "micro", extracted: "elopement", guestCount: 8 }), { format: "larger", source: "explicit" });
  assert.deepEqual(weddingMenuEmphasis("elopement"), { collapsed: ["seating", "helpers"], suppressBadges: ["seating"] });
  assert.deepEqual(weddingMenuEmphasis("larger"), { collapsed: [], suppressBadges: [] });
});

test("wedding format normalization and deep links are allowlisted", () => {
  assert.equal(normalizeWeddingFormat("micro"), "micro");
  assert.equal(normalizeWeddingFormat("tiny"), null);
  assert.equal(weddingFormatFromDeepLink("small-wedding"), "micro");
  assert.equal(weddingFormatFromDeepLink("unexpected"), null);
});
