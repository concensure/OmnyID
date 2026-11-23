import type { SendAfpMessageInput } from "@/lib/api";
import { normalizeWeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";

export type WeddingQuoteScenarioChoice = "prefer" | "confirmed" | "open";

function safe(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9:_-]+/g, "-").slice(0, 160);
}

export function weddingQuoteScenarioChoiceToAfpSendInput(input: {
  metadata: unknown;
  choice: WeddingQuoteScenarioChoice;
  preferredVendorName?: string | null;
  quoteArtifactIds: readonly string[];
  eventDate: string;
  guestCount: number;
  durationHours: number;
  weddingBudget: number | null;
  tradeoff: string;
  recommendation: string;
  missingFact: string | null;
  nowIso?: string;
}): SendAfpMessageInput {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const nowIso = input.nowIso ?? new Date().toISOString();
  const preferred = input.preferredVendorName?.trim() || null;
  const identity = `${input.choice}:${preferred ?? "none"}:${input.quoteArtifactIds.join(":")}`;
  return {
    id: `wedding_quote_scenario_choice:${safe(identity)}:${nowIso}`,
    thread_id: `wedding_quote_scenario:${metadata.weddingPlanId}`,
    from: "user://couple",
    to: ["agent://wedding-planning"],
    type: "wedding_quote_scenario_choice",
    kind: "wedding_quote_scenario_choice",
    subtype: input.choice,
    timestamp: nowIso,
    content: {
      choice: input.choice,
      preferred_vendor_name: preferred,
      quote_artifact_ids: [...input.quoteArtifactIds],
      comparison_basis: {
        event_date: input.eventDate || null,
        guest_count: input.guestCount,
        duration_hours: input.durationHours,
        wedding_budget: input.weddingBudget,
      },
      decision_support: {
        tradeoff: input.tradeoff,
        conditional_recommendation: input.recommendation,
        material_missing_fact: input.missingFact,
      },
      original_quotes_preserved: true,
      scenario_status: "estimate_until_vendor_confirmed",
    },
    references: input.quoteArtifactIds.map((id) => ({ type: "wedding_quote_artifact", id })),
    supertags: ["wedding", "quotation", "scenario-estimate", `choice:${input.choice}`],
    metadata: {
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      preferred_vendor_name: preferred,
    },
    store_in_relational: true,
  };
}
