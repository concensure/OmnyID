import test from "node:test";
import assert from "node:assert/strict";

import {
  activatePersonaAndList,
  filterPersonas,
  filterPersonaTemplates,
  installedPersonaIdsByTemplate,
  installPersonaTemplateAndList,
  personaSwitcherPreferredTab,
} from "../src/lib/personaSwitcherState.ts";
import type { AgentPersona } from "../src/lib/api.ts";
import type { PersonaTemplate } from "../src/lib/personaTemplates.ts";

function makePersona(overrides: Partial<AgentPersona> = {}): AgentPersona {
  return {
    id: "persona-1",
    owner_user_id: "user-1",
    name: "Balanced Helper",
    soul_md: "Keeps responses measured and practical.",
    writing_style: "balanced",
    skills_json: [],
    labels_json: [],
    lora_confidence_score: 0,
    lora_genome_active: false,
    is_active: false,
    created_at: "2026-08-31T00:00:00Z",
    updated_at: "2026-08-31T00:00:00Z",
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<PersonaTemplate> = {}): PersonaTemplate {
  return {
    id: "tpl-1",
    name: "Marcus Aurelius",
    source: "Meditations",
    description: "Stoic and formal.",
    writing_style: "formal",
    labels: ["reflection"],
    soul_md: "Stoic emperor philosopher",
    category: "literary",
    ...overrides,
  };
}

test("filterPersonas matches persona names and writing styles", () => {
  const personas = [
    makePersona({ id: "persona-1", name: "Support Voice", writing_style: "warm" }),
    makePersona({ id: "persona-2", name: "Review Mode", writing_style: "analytical" }),
  ];

  assert.deepEqual(
    filterPersonas(personas, "analytical").map((persona) => persona.id),
    ["persona-2"],
  );
  assert.deepEqual(
    filterPersonas(personas, "support").map((persona) => persona.id),
    ["persona-1"],
  );
});

test("filterPersonaTemplates matches source and trims the query", () => {
  const templates = [
    makeTemplate(),
    makeTemplate({
      id: "tpl-2",
      name: "Sherlock Holmes",
      source: "Arthur Conan Doyle",
      description: "Analytical detective.",
      writing_style: "analytical",
    }),
  ];

  assert.deepEqual(
    filterPersonaTemplates(templates, "  conan ").map((template) => template.id),
    ["tpl-2"],
  );
});

test("personaSwitcherPreferredTab falls back to templates when no personas exist", () => {
  assert.equal(personaSwitcherPreferredTab([]), "templates");
  assert.equal(personaSwitcherPreferredTab([makePersona()]), "mine");
});

test("installedPersonaIdsByTemplate returns a template to persona map", () => {
  const template = makeTemplate();
  const matchingPersona = makePersona({
    id: "persona-4",
    name: "My stoic assistant",
    writing_style: "formal",
    soul_md: "Stoic emperor philosopher",
  });

  const result = installedPersonaIdsByTemplate([template], [matchingPersona]);
  assert.equal(result.get(template.id), "persona-4");
});

test("activatePersonaAndList returns the refreshed persona list and active persona", async () => {
  const calls: string[] = [];
  const activePersona = makePersona({ id: "persona-2", is_active: true });
  const inactivePersona = makePersona({ id: "persona-1", is_active: false });

  const result = await activatePersonaAndList("persona-2", {
    async activatePersona(personaId: string) {
      calls.push(`activate:${personaId}`);
    },
    async createPersona() {
      throw new Error("not used");
    },
    async listPersonas() {
      calls.push("list");
      return { personas: [inactivePersona, activePersona] };
    },
  });

  assert.deepEqual(calls, ["activate:persona-2", "list"]);
  assert.equal(result.activePersona?.id, "persona-2");
  assert.equal(result.personas.length, 2);
});

test("installPersonaTemplateAndList creates, activates, and returns the installed persona", async () => {
  const calls: string[] = [];
  const template = makeTemplate({
    id: "tpl-9",
    name: "Planner",
    labels: ["planning", "ops"],
    writing_style: "concise",
  });
  const installedPersona = makePersona({
    id: "persona-9",
    name: "Planner",
    writing_style: "concise",
    is_active: true,
  });

  const result = await installPersonaTemplateAndList(template, {
    async activatePersona(personaId: string) {
      calls.push(`activate:${personaId}`);
    },
    async createPersona(input) {
      calls.push(`create:${input.name}:${input.labels.join("|")}`);
      return { persona: makePersona({ id: "persona-9", name: input.name, writing_style: input.writing_style }) };
    },
    async listPersonas() {
      calls.push("list");
      return { personas: [installedPersona] };
    },
  });

  assert.deepEqual(calls, ["create:Planner:planning|ops", "activate:persona-9", "list"]);
  assert.equal(result.installedPersona?.id, "persona-9");
  assert.equal(result.personas[0]?.is_active, true);
});

test("install keeps the active template visible when a fresh list briefly lags activation", async () => {
  const template = makeTemplate({ name: "Reliable planner" });
  const created = makePersona({ id: "persona-new", name: "Reliable planner" });
  const result = await installPersonaTemplateAndList(template, {
    async activatePersona() {},
    async createPersona() { return { persona: created }; },
    async listPersonas() { return { personas: [] }; },
  });

  assert.equal(result.installedPersona?.id, "persona-new");
  assert.equal(result.installedPersona?.is_active, true);
  assert.equal(result.personas[0]?.id, "persona-new");
});
