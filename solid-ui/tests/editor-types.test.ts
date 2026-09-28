import assert from "node:assert/strict";
import test from "node:test";

import { TOKEN } from "../src/components/editor/tokens.ts";

test("editor tokens keep the shared token surface stable", () => {
  assert.equal(TOKEN.accent, "#635bff");
  assert.equal(TOKEN.cardH, "4.5em");
  assert.equal(TOKEN.radius.gridCard, "1em");
});
