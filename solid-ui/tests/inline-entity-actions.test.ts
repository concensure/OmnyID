import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInlineEntityObjectSearchQuery,
  inlineEntityKindLabel,
} from "../src/lib/inlineEntityActions.ts";

test("inline entity actions humanize kind labels", () => {
  assert.equal(inlineEntityKindLabel("person"), "person");
  assert.equal(inlineEntityKindLabel("hashtag"), "hashtag");
});

test("inline entity actions build object-search queries by kind", () => {
  assert.equal(buildInlineEntityObjectSearchQuery("hashtag", " Launch "), "#launch");
  assert.equal(buildInlineEntityObjectSearchQuery("invoice", " INV-42 "), "kind:task INV-42");
  assert.equal(buildInlineEntityObjectSearchQuery("ticket", " Ticket 7 "), "kind:task Ticket 7");
  assert.equal(buildInlineEntityObjectSearchQuery("date", " Tomorrow "), "kind:task Tomorrow");
  assert.equal(buildInlineEntityObjectSearchQuery("person", " Jordan "), "kind:note Jordan");
  assert.equal(buildInlineEntityObjectSearchQuery("file", " spec.pdf "), "kind:note spec.pdf");
});
