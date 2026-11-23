import { apiFetch } from "@/lib/api";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

export type WeddingAssistantAction = {
  kind: "open_view" | "stage_update";
  target: WeddingWorkspaceMenuId;
  label: string;
  draftFields: {
    budgetTargetAud?: number;
    inviteProposal?: { dateOrSeason?: string; guestCount?: number; requestText?: string; category?: string };
  } | null;
};

export type WeddingAssistantResponse = {
  answer: string;
  suggestedAction: WeddingAssistantAction | null;
  links: Array<{ title: string; url: string }>;
  model: string;
};

const TARGETS = new Set<WeddingWorkspaceMenuId>([
  "home", "people", "plan", "tasks", "vision", "documents", "budget", "guests",
  "inspiration", "seating", "helpers", "response_queue", "timeline", "advanced",
]);

export function normalizeWeddingAssistantResponse(value: unknown): WeddingAssistantResponse {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawAction = record.suggested_action && typeof record.suggested_action === "object" && !Array.isArray(record.suggested_action)
    ? record.suggested_action as Record<string, unknown>
    : null;
  const target = rawAction?.target;
  const kind = rawAction?.kind;
  const action: WeddingAssistantAction | null = typeof target === "string" && TARGETS.has(target as WeddingWorkspaceMenuId)
    && (kind === "open_view" || kind === "stage_update")
    ? {
      kind: kind as WeddingAssistantAction["kind"],
      target: target as WeddingWorkspaceMenuId,
      label: typeof rawAction?.label === "string" && rawAction.label.trim() ? rawAction.label.trim() : "Open Wedding",
      draftFields: (() => {
        const fields = rawAction?.draft_fields && typeof rawAction.draft_fields === "object" && !Array.isArray(rawAction.draft_fields)
          ? rawAction.draft_fields as Record<string, unknown>
          : null;
        const amount = fields?.budget_target_aud;
        return typeof amount === "number" && Number.isFinite(amount) && amount >= 1_000
          ? { budgetTargetAud: Math.round(amount) }
          : null;
      })(),
    }
    : null;
  return {
    answer: typeof record.answer === "string" ? record.answer.trim() : "",
    suggestedAction: action,
    links: Array.isArray(record.links) ? record.links.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const link = entry as Record<string, unknown>;
      const url = typeof link.url === "string" ? link.url.trim() : "";
      if (!url.startsWith("/wedding/blog/") || !url.endsWith(".html")) return [];
      return [{ title: typeof link.title === "string" && link.title.trim() ? link.title.trim() : "Wedding guide", url }];
    }).slice(0, 2) : [],
    model: typeof record.model === "string" ? record.model.trim() : "",
  };
}

export async function askWeddingAssistant(input: {
  question: string;
  weddingPlanId?: string | null;
  currentView?: string | null;
}): Promise<WeddingAssistantResponse> {
  const response = await apiFetch<unknown>("/wedding/assistant", {
    method: "POST",
    bodyJson: {
      question: input.question,
      wedding_plan_id: input.weddingPlanId ?? null,
      current_view: input.currentView ?? null,
    },
  });
  const normalized = normalizeWeddingAssistantResponse(response);
  const direct = weddingAssistantDirectWorkspaceAction(input.question);
  return direct ? { ...normalized, answer: direct.answer, suggestedAction: direct.action } : normalized;
}

/** Bounded account-local commands that should prepare work instead of returning instructions. */
export function weddingAssistantDirectWorkspaceAction(question: string, now = new Date()): { answer: string; action: WeddingAssistantAction } | null {
  const text = question.trim();
  if (!/\b(open|prepare|fill|draft|help me)\b/i.test(text) || !/\b(invite|proposal)\b/i.test(text)) return null;
  const guestMatch = text.match(/\b(\d{1,4})\s+guests?\b/i);
  const guestCount = guestMatch ? Number.parseInt(guestMatch[1], 10) : undefined;
  const monthMatch = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number.parseInt(yearMatch[1], 10) : /next year/i.test(text) ? now.getFullYear() + 1 : undefined;
  const dateOrSeason = monthMatch ? `${monthMatch[1][0].toUpperCase()}${monthMatch[1].slice(1).toLowerCase()}${year ? ` ${year}` : ""}` : undefined;
  const requestText = [
    "Please provide an itemised proposal for our wedding",
    dateOrSeason ? `in ${dateOrSeason}` : null,
    guestCount ? `for approximately ${guestCount} guests` : null,
    "including availability, inclusions, exclusions, fees, GST, deposit and payment dates.",
  ].filter(Boolean).join(" ");
  return {
    answer: "I prepared an editable invitation proposal from the details in your request. Review the brief and sharing choices; nothing is published or sent until you approve it.",
    action: { kind: "stage_update", target: "home", label: "Open invite proposals", draftFields: { inviteProposal: { dateOrSeason, guestCount, requestText } } },
  };
}
