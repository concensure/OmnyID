import { apiFetch } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";

export type WeddingVendorOutreachDraftVendorInput = {
  name: string;
  category?: string | null;
  website_url?: string | null;
  address?: string | null;
  source_url?: string | null;
  snippet?: string | null;
};

export type WeddingVendorOutreachDraftCoupleInput = {
  date_or_season?: string | null;
  location?: string | null;
  guest_count?: string | null;
  budget_comfort?: string | null;
  budget_category_label?: string | null;
  budget_category_amount?: number | null;
  budget_currency?: string | null;
  top_priorities?: string[];
  atmosphere_description?: string | null;
  vendor_preferences?: string | null;
  couple_names?: string | null;
  deal_breakers?: string[];
};

export type WeddingVendorOutreachDraftResult = {
  subject: string;
  bodyMarkdown: string;
  groundedOn: string[];
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  inputFingerprint: string;
  promptPrefixId: string;
  servedFrom: "model" | "deterministic_template" | "afp_reuse";
};

function normalizeWeddingVendorOutreachDraftResponse(value: unknown): WeddingVendorOutreachDraftResult {
  const record = isRecord(value) ? value : {};
  return {
    subject: typeof record.subject === "string" ? record.subject : "",
    bodyMarkdown: typeof record.body_markdown === "string" ? record.body_markdown : "",
    groundedOn: Array.isArray(record.grounded_on)
      ? record.grounded_on.filter((entry): entry is string => typeof entry === "string")
      : [],
    model: typeof record.model === "string" ? record.model : "",
    inputTokens: typeof record.input_tokens === "number" ? record.input_tokens : 0,
    outputTokens: typeof record.output_tokens === "number" ? record.output_tokens : 0,
    estimatedCostUsd: typeof record.estimated_cost_usd === "number" ? record.estimated_cost_usd : 0,
    inputFingerprint: typeof record.input_fingerprint === "string" ? record.input_fingerprint : "",
    promptPrefixId: typeof record.prompt_prefix_id === "string" ? record.prompt_prefix_id : "",
    servedFrom: record.served_from === "model" || record.served_from === "afp_reuse"
      ? record.served_from
      : "deterministic_template",
  };
}

export const requestWeddingVendorOutreachDraft = (body: {
  vendor: WeddingVendorOutreachDraftVendorInput;
  couple: WeddingVendorOutreachDraftCoupleInput;
  wedding_plan_id: string;
  verify_questions?: string[];
}) => apiFetch<unknown>("/wedding/vendor-outreach-draft", { method: "POST", bodyJson: body })
  .then(normalizeWeddingVendorOutreachDraftResponse);
