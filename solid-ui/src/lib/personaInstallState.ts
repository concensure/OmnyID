// @locs-version: 1.0
import type { AgentPersona } from "@/lib/api";
import type { PersonaTemplate } from "@/lib/personaTemplates";

export function normalizePersonaFingerprint(value: string | undefined): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function templateMatchesPersona(template: PersonaTemplate, persona: AgentPersona): boolean {
  if (normalizePersonaFingerprint(template.name) === normalizePersonaFingerprint(persona.name)) {
    return true;
  }
  return (
    normalizePersonaFingerprint(template.writing_style) === normalizePersonaFingerprint(persona.writing_style)
    && normalizePersonaFingerprint(template.soul_md) === normalizePersonaFingerprint(persona.soul_md)
  );
}

export function findInstalledPersonaIdForTemplate(
  template: PersonaTemplate,
  personas: readonly AgentPersona[],
): string | null {
  const matched = personas.find((persona) => templateMatchesPersona(template, persona));
  return matched?.id ?? null;
}
