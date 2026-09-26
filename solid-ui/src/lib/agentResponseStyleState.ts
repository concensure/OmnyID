// @locs-version: 1.0
export type AgentResponseStylePayload = {
  style_prompt?: string;
  style_genome?: Record<string, unknown>;
  style_vetos?: string[];
  active_persona_id?: string;
  active_persona_name?: string;
  active_persona_writing_style?: string;
  active_persona_soul_md?: string;
  persona_overlay?: Record<string, unknown>;
};

export function buildAgentResponseStylePayload(input: {
  ledgerGenome: Record<string, unknown>;
  stylePrompt?: string;
  promptVetoDescriptions?: string[];
  activePersona?: {
    id: string;
    name: string;
    writing_style: string;
    soul_md: string;
  } | null;
  personaOverlay?: Record<string, unknown> | null;
}): AgentResponseStylePayload {
  const payload: AgentResponseStylePayload = {
    style_genome: input.ledgerGenome,
  };

  const stylePrompt = input.stylePrompt?.trim();
  if (stylePrompt) payload.style_prompt = stylePrompt;

  const styleVetos = (input.promptVetoDescriptions ?? []).map((value) => value.trim()).filter(Boolean);
  if (styleVetos.length > 0) payload.style_vetos = styleVetos;

  if (input.activePersona) {
    payload.active_persona_id = input.activePersona.id;
    payload.active_persona_name = input.activePersona.name;
    payload.active_persona_writing_style = input.activePersona.writing_style;
    payload.active_persona_soul_md = input.activePersona.soul_md;
  }

  if (input.personaOverlay && Object.keys(input.personaOverlay).length > 0) {
    payload.persona_overlay = input.personaOverlay;
  }

  return payload;
}
