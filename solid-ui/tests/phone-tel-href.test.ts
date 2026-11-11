import assert from "node:assert/strict";
import test from "node:test";

import { phoneTelHref } from "../src/lib/phoneTelHref";

test("Australian public phone actions use portable E.164 telephone links", () => {
  assert.equal(phoneTelHref("0412 345 678"), "tel:+61412345678");
  assert.equal(phoneTelHref("(02) 9123 4567"), "tel:+61291234567");
  assert.equal(phoneTelHref("61 2 9123 4567"), "tel:+61291234567");
  assert.equal(phoneTelHref("+1 (415) 555-0123"), "tel:+14155550123");
});

test("telephone links do not guess incomplete or malformed numbers", () => {
  assert.equal(phoneTelHref("9123 4567"), null);
  assert.equal(phoneTelHref("+61 +2 9123 4567"), null);
  assert.equal(phoneTelHref(null), null);
});
