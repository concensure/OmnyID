import assert from "node:assert/strict";
import test from "node:test";

import { inlineEntityChipClass, INLINE_ENTITY_ICONS } from "../src/lib/inlineEntityPresentation.ts";

test("inline entity presentation exposes stable icons", () => {
  assert.equal(INLINE_ENTITY_ICONS.person, "👤");
  assert.equal(INLINE_ENTITY_ICONS.invoice, "🧾");
  assert.equal(INLINE_ENTITY_ICONS.hashtag, "#");
});

test("inline entity presentation classifies chip tones by kind family", () => {
  assert.match(inlineEntityChipClass("date"), /sky-/);
  assert.match(inlineEntityChipClass("currency"), /emerald-/);
  assert.match(inlineEntityChipClass("meeting"), /violet-/);
  assert.match(inlineEntityChipClass("invoice"), /amber-/);
  assert.match(inlineEntityChipClass("file"), /slate-/);
});
