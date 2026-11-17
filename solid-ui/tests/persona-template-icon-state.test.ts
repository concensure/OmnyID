import assert from "node:assert/strict";
import test from "node:test";

import { PERSONA_TEMPLATES, personaTemplateIconUrl } from "../src/lib/personaTemplates.ts";

test("every built-in persona resolves to its local SVG artwork", () => {
  assert.equal(PERSONA_TEMPLATES.length, 12);
  for (const template of PERSONA_TEMPLATES) {
    assert.equal(personaTemplateIconUrl(template.id), `/icons/personas/${template.id}.svg`);
  }
});
