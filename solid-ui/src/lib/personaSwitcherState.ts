// @locs-version: 1.0
import {
  activatePersona,
  createPersona,
  listPersonas,
  type AgentPersona,
} from "@/lib/api";
import { findInstalledPersonaIdForTemplate } from "@/lib/personaInstallState";
import type { PersonaTemplate } from "@/lib/personaTemplates";

export type PersonaSwitcherTab = "mine" | "templates";

export function filterPersonas(
  personas: readonly AgentPersona[],
  query: string,
): AgentPersona[] {
  const normalizedQuery = query.trim().toLowerCase();
  return personas.filter((persona) => {
    if (!normalizedQuery) return true;
    return (
      persona.name.toLowerCase().includes(normalizedQuery)
      || persona.writing_style.toLowerCase().includes(normalizedQuery)
    );
  });
}

export function filterPersonaTemplates(
  templates: readonly PersonaTemplate[],
  query: string,
): PersonaTemplate[] {
  const normalizedQuery = query.trim().toLowerCase();
  return templates.filter((template) => {
    if (!normalizedQuery) return true;
    return (
      template.name.toLowerCase().includes(normalizedQuery)
      || template.description.toLowerCase().includes(normalizedQuery)
      || template.writing_style.toLowerCase().includes(normalizedQuery)
      || template.source.toLowerCase().includes(normalizedQuery)
    );
  });
}

export function personaSwitcherPreferredTab(
  personas: readonly AgentPersona[],
): PersonaSwitcherTab {
  return personas.length === 0 ? "templates" : "mine";
}

export function installedPersonaIdsByTemplate(
  templates: readonly PersonaTemplate[],
  personas: readonly AgentPersona[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const template of templates) {
    const matchedId = findInstalledPersonaIdForTemplate(template, personas);
    if (matchedId) map.set(template.id, matchedId);
  }
  return map;
}

type PersonaSwitcherApi = {
  activatePersona(personaId: string): Promise<unknown>;
  createPersona(input: {
    name: string;
    soul_md: string;
    writing_style: string;
    labels: string[];
  }): Promise<{ persona: AgentPersona }>;
  listPersonas(): Promise<{ personas: AgentPersona[] }>;
};

const defaultPersonaSwitcherApi: PersonaSwitcherApi = {
  activatePersona,
  createPersona,
  listPersonas,
};

export async function activatePersonaAndList(
  personaId: string,
  api: PersonaSwitcherApi = defaultPersonaSwitcherApi,
): Promise<{ personas: AgentPersona[]; activePersona: AgentPersona | null }> {
  await api.activatePersona(personaId);
  const result = await api.listPersonas();
  return {
    personas: result.personas,
    activePersona: result.personas.find((persona) => persona.id === personaId) ?? null,
  };
}

export async function installPersonaTemplateAndList(
  template: PersonaTemplate,
  api: PersonaSwitcherApi = defaultPersonaSwitcherApi,
): Promise<{ personas: AgentPersona[]; installedPersona: AgentPersona | null }> {
  let created: { persona: AgentPersona };
  try {
    created = await api.createPersona({
      name: template.name,
      soul_md: template.soul_md,
      writing_style: template.writing_style,
      labels: template.labels,
    });
  } catch (createError) {
    // A retry can arrive after the server created the persona but before the
    // browser received its response.  Recover that installed template and
    // activate it rather than leaving the Sprout action looking inert.
    const existing = await api.listPersonas().catch(() => null);
    const existingId = existing
      ? findInstalledPersonaIdForTemplate(template, existing.personas)
      : null;
    if (!existingId) throw createError;
    const result = await activatePersonaAndList(existingId, api);
    const installedPersona = result.activePersona
      ?? existing!.personas.find((persona) => persona.id === existingId)
      ?? null;
    return { personas: result.personas, installedPersona };
  }
  const result = await activatePersonaAndList(created.persona.id, api);
  const installedPersona = result.activePersona ?? {
    ...created.persona,
    is_active: true,
  };
  return {
    // Keep the newly created persona visible even if a replica briefly returns
    // an older list immediately after activation.
    personas: result.personas.some((persona) => persona.id === installedPersona.id)
      ? result.personas
      : [...result.personas, installedPersona],
    installedPersona,
  };
}
