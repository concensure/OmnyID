// @locs-version: 1.0
import { listPersonas, type AgentPersona } from "@/lib/api";
import {
  buildStylePrompt,
  getActiveVetos,
  getPersonaGenome,
  loadLedger,
  type BehaviorVeto,
  type LoraWeightSet,
} from "@/lib/profileLedger";
import {
  buildAgentResponseStylePayload as buildAgentResponseStylePayloadState,
  type AgentResponseStylePayload,
} from "@/lib/agentResponseStyleState";

export function buildAgentResponseStylePayload(input: {
  ledgerGenome: LoraWeightSet;
  promptVetos?: BehaviorVeto[];
  activePersona?: AgentPersona | null;
  personaOverlay?: Partial<LoraWeightSet> | null;
}): AgentResponseStylePayload {
  const promptVetos = (input.promptVetos ?? []).filter((veto) => veto.scope === "prompt_style");
  return buildAgentResponseStylePayloadState({
    ledgerGenome: input.ledgerGenome,
    stylePrompt: buildStylePrompt(
      input.ledgerGenome,
      input.personaOverlay ?? undefined,
      promptVetos,
    ),
    promptVetoDescriptions: promptVetos.map((veto) => veto.description),
    activePersona: input.activePersona
      ? {
          id: input.activePersona.id,
          name: input.activePersona.name,
          writing_style: input.activePersona.writing_style,
          soul_md: input.activePersona.soul_md,
        }
      : null,
    personaOverlay: input.personaOverlay ?? null,
  }) as AgentResponseStylePayload;
}

export async function loadAgentResponseStylePayload(): Promise<AgentResponseStylePayload> {
  const [ledger, vetos, personas] = await Promise.all([
    loadLedger(),
    getActiveVetos(),
    listPersonas(),
  ]);
  const activePersona = personas.personas.find((persona) => persona.is_active) ?? null;
  const personaGenome = activePersona ? await getPersonaGenome(activePersona.id) : null;
  return buildAgentResponseStylePayload({
    ledgerGenome: ledger.lora_genome,
    promptVetos: vetos,
    activePersona,
    personaOverlay: personaGenome?.overlay ?? null,
  });
}
