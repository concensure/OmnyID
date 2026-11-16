import assert from "node:assert/strict";
import test from "node:test";

import {
  weddingRsvpCommonEventNames,
  weddingRsvpCulturalEventNames,
  weddingRsvpEventNameOptions,
} from "../src/lib/weddingRsvpSetupState.ts";

test("RSVP event suggestions stay editable and only add cultural choices after opt-in", () => {
  const ordinary = weddingRsvpEventNameOptions(false);
  const expanded = weddingRsvpEventNameOptions(true);

  assert.ok(ordinary.includes("Engagement Party"));
  assert.ok(ordinary.includes("Reception"));
  assert.ok(!ordinary.includes("Sangeet"));
  assert.deepEqual(ordinary, [...weddingRsvpCommonEventNames]);
  assert.equal(expanded.length, weddingRsvpCommonEventNames.length + weddingRsvpCulturalEventNames.length);
  for (const label of ["Tea Ceremony", "Nikah", "Kabbalat Panim, Bedeken & Tish", "Welcome to Country & Smoking Ceremony"]) {
    assert.ok(expanded.includes(label));
  }
});
