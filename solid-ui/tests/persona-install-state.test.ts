import test from "node:test";
import assert from "node:assert/strict";

import { findInstalledPersonaIdForTemplate, templateMatchesPersona } from "../src/lib/personaInstallState.ts";
import type { AgentPersona } from "../src/lib/api.ts";
import type { PersonaTemplate } from "../src/lib/personaTemplates.ts";

const baseTemplate: PersonaTemplate = {
  id: "tpl_test",
  name: "Marcus Aurelius",
  source: "test",
  description: "test",
  writing_style: "formal",
  skills: [],
  soul_md: "Stoic emperor philosopher",
  category: "literary",
};

function makePersona(overrides: Partial<AgentPersona>): AgentPersona {
  return {
    id: "persona-1",
    owner_user_id: "user-1",
    name: "Persona",
    soul_md: "",
    writing_style: "balanced",
    skills_json: [],
    lora_confidence_score: 0,
    lora_genome_active: false,
    is_active: false,
    created_at: "2026-07-02T00:00:00Z",
    updated_at: "2026-07-02T00:00:00Z",
    ...overrides,
  };
}

test("templateMatchesPersona matches by normalized name", () => {
  const persona = makePersona({ name: "  marcus   aurelius " });
  assert.equal(templateMatchesPersona(baseTemplate, persona), true);
});

test("templateMatchesPersona matches by writing style and soul fingerprint", () => {
  const persona = makePersona({
    id: "persona-2",
    name: "My stoic assistant",
    writing_style: " Formal ",
    soul_md: "  Stoic   emperor   philosopher ",
  });
  assert.equal(templateMatchesPersona(baseTemplate, persona), true);
});

test("findInstalledPersonaIdForTemplate returns null when no installed persona matches", () => {
  const persona = makePersona({
    id: "persona-3",
    name: "Creative helper",
    writing_style: "creative",
    soul_md: "storyteller",
  });
  assert.equal(findInstalledPersonaIdForTemplate(baseTemplate, [persona]), null);
});

test("findInstalledPersonaIdForTemplate returns matching persona id", () => {
  const persona = makePersona({
    id: "persona-4",
    name: "My stoic assistant",
    writing_style: "formal",
    soul_md: "Stoic emperor philosopher",
  });
  assert.equal(findInstalledPersonaIdForTemplate(baseTemplate, [persona]), "persona-4");
});
