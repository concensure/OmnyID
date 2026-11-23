import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentResponseStylePayload } from "../src/lib/agentResponseStyleState.ts";

type AgentPersona = {
  id: string;
  owner_user_id: string;
  name: string;
  soul_md: string;
  writing_style: string;
  skills_json: string[];
  labels_json: string[];
  lora_confidence_score: number;
  lora_genome_active: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type BehaviorVeto = {
  id: string;
  scope: string;
  description: string;
  created_at: string;
};

type LoraWeightSet = {
  directness_weight: number;
  diplomacy_weight: number;
  brevity_weight: number;
  formality_weight: number;
  technical_depth_weight: number;
  abstraction_level: number;
  optimism_bias: number;
  risk_tolerance: number;
  proactivity_preference: number;
};

const BASE_GENOME: LoraWeightSet = {
  directness_weight: 0.8,
  diplomacy_weight: 0.3,
  brevity_weight: 0.8,
  formality_weight: 0.2,
  technical_depth_weight: 0.7,
  abstraction_level: 0.2,
  optimism_bias: 0.4,
  risk_tolerance: 0.4,
  proactivity_preference: 0.8,
};

function persona(): AgentPersona {
  return {
    id: "persona-1",
    owner_user_id: "user-1",
    name: "Calm Operator",
    soul_md: "Warm, concise, grounded.",
    writing_style: "warm",
    skills_json: [],
    labels_json: ["default"],
    lora_confidence_score: 0.8,
    lora_genome_active: true,
    is_active: true,
    created_at: "2026-08-26T00:00:00.000Z",
    updated_at: "2026-08-26T00:00:00.000Z",
  };
}

function promptVeto(description: string): BehaviorVeto {
  return {
    id: "veto-1",
    scope: "prompt_style",
    description,
    created_at: "2026-08-26T00:00:00.000Z",
  };
}

test("buildAgentResponseStylePayload includes active persona and style fields", () => {
  const payload = buildAgentResponseStylePayload({
    ledgerGenome: BASE_GENOME,
    stylePrompt: "Write in the user's personal voice: be direct and to the point.",
    activePersona: persona(),
    personaOverlay: { brevity_weight: 0.1, formality_weight: 0.2 },
    promptVetoDescriptions: [promptVeto("Do not sound patronizing.").description],
  });

  assert.equal(payload.active_persona_id, "persona-1");
  assert.equal(payload.active_persona_name, "Calm Operator");
  assert.equal(payload.active_persona_writing_style, "warm");
  assert.equal(payload.active_persona_soul_md, "Warm, concise, grounded.");
  assert.deepEqual(payload.persona_overlay, { brevity_weight: 0.1, formality_weight: 0.2 });
  assert.deepEqual(payload.style_vetos, ["Do not sound patronizing."]);
  assert.ok(payload.style_prompt?.includes("Write in the user's personal voice:"));
  assert.deepEqual(payload.style_genome, BASE_GENOME);
});

test("buildAgentResponseStylePayload omits persona fields when none are active", () => {
  const payload = buildAgentResponseStylePayload({
    ledgerGenome: {
      ...BASE_GENOME,
      directness_weight: 0.5,
      diplomacy_weight: 0.5,
      brevity_weight: 0.5,
      formality_weight: 0.5,
      technical_depth_weight: 0.5,
      abstraction_level: 0.5,
      optimism_bias: 0.5,
      risk_tolerance: 0.5,
      proactivity_preference: 0.5,
    },
    promptVetoDescriptions: [],
    activePersona: null,
    personaOverlay: null,
  });

  assert.deepEqual(payload.style_genome?.brevity_weight, 0.5);
  assert.equal(payload.active_persona_id, undefined);
  assert.equal(payload.active_persona_name, undefined);
  assert.equal(payload.persona_overlay, undefined);
  assert.equal(payload.style_vetos, undefined);
});
