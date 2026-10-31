import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingMealChoiceSource =
  | "venue_package"
  | "vendor_conversation"
  | "run_sheet"
  | "manual";

export type WeddingMealChoiceEvidence = {
  id: string;
  options: string[];
  source: WeddingMealChoiceSource;
  sourceLabel: string;
  sourceMessageId: string;
  confirmedByCouple: boolean;
  revision: number;
};

export type WeddingMealChoiceState = {
  confirmed: WeddingMealChoiceEvidence | null;
  suggestions: WeddingMealChoiceEvidence[];
};

const OPTION_KEYS = new Set(["meal_choices", "meal_options", "menu_options"]);

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function options(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of value) {
    const label = clean(candidate).slice(0, 80);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
    if (result.length >= 12) break;
  }
  return result;
}

function explicitOptions(value: unknown, depth = 0): string[] {
  if (depth > 4 || !value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 40)) {
      const found = explicitOptions(item, depth + 1);
      if (found.length > 0) return found;
    }
    return [];
  }
  for (const [key, item] of Object.entries(record(value))) {
    if (OPTION_KEYS.has(key.toLowerCase())) {
      const found = options(item);
      if (found.length > 0) return found;
    }
  }
  for (const item of Object.values(record(value))) {
    const found = explicitOptions(item, depth + 1);
    if (found.length > 0) return found;
  }
  return [];
}

function sourceForKind(kind: string): { source: WeddingMealChoiceSource; label: string } | null {
  const normalized = kind.toLowerCase();
  if (/quote|quotation|package|document/.test(normalized)) return { source: "venue_package", label: "Venue package or quote" };
  if (/vendor.*(reply|message|conversation)|conversation.*vendor/.test(normalized)) return { source: "vendor_conversation", label: "Vendor conversation" };
  if (/run.?sheet/.test(normalized)) return { source: "run_sheet", label: "Wedding run sheet" };
  return null;
}

function isScoped(message: AfpMessage, responseWorkspaceId: string): boolean {
  const metadata = record(message.metadata);
  const content = record(message.content);
  return clean(metadata.responseWorkspaceId ?? metadata.response_workspace_id) === responseWorkspaceId
    || clean(content.response_workspace_id) === responseWorkspaceId;
}

function catalogueFromMessage(message: AfpMessage): WeddingMealChoiceEvidence | null {
  const content = record(message.content);
  const kind = clean(message.kind) || clean(content.kind);
  if (kind !== "wedding_meal_choice_catalogue") return null;
  const storedOptions = options(content.options);
  if (storedOptions.length === 0) return null;
  const source = clean(content.source) as WeddingMealChoiceSource;
  const allowedSource: WeddingMealChoiceSource = ["venue_package", "vendor_conversation", "run_sheet", "manual"].includes(source)
    ? source
    : "manual";
  return {
    id: clean(content.catalogue_id) || message.id,
    options: storedOptions,
    source: allowedSource,
    sourceLabel: clean(content.source_label) || "Couple-entered choices",
    sourceMessageId: clean(content.source_message_id) || message.id,
    confirmedByCouple: content.confirmed_by_couple === true,
    revision: Number.isSafeInteger(content.revision) && Number(content.revision) > 0 ? Number(content.revision) : 1,
  };
}

export function buildWeddingMealChoiceState(
  messages: readonly AfpMessage[] | null | undefined,
  responseWorkspaceId: string,
): WeddingMealChoiceState {
  const scoped = (messages ?? []).filter((message) => isScoped(message, responseWorkspaceId));
  const catalogues = scoped
    .map(catalogueFromMessage)
    .filter((item): item is WeddingMealChoiceEvidence => item !== null)
    .sort((left, right) => right.revision - left.revision);
  const latest = catalogues[0] ?? null;
  const suggestions = scoped.flatMap((message): WeddingMealChoiceEvidence[] => {
    if (catalogueFromMessage(message)) return [];
    const kind = clean(message.kind) || clean(record(message.content).kind);
    const source = sourceForKind(kind);
    const found = explicitOptions(message.content);
    if (!source || found.length === 0) return [];
    return [{
      id: `meal-evidence:${message.id}`,
      options: found,
      source: source.source,
      sourceLabel: source.label,
      sourceMessageId: message.id,
      confirmedByCouple: false,
      revision: 0,
    }];
  });
  const seen = new Set<string>();
  return {
    confirmed: latest?.confirmedByCouple ? latest : null,
    suggestions: suggestions.filter((item) => {
      const key = item.options.map((option) => option.toLowerCase()).join("|");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8),
  };
}

export function weddingMealChoiceCatalogueToAfpSendInput(input: {
  options: readonly string[];
  source: WeddingMealChoiceSource;
  sourceLabel: string;
  sourceMessageId?: string | null;
  currentRevision?: number;
  metadata?: unknown;
  nowIso?: string;
}): SendAfpMessageInput | null {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const storedOptions = options(input.options);
  if (storedOptions.length < 2) return null;
  const revision = Math.max(1, (input.currentRevision ?? 0) + 1);
  const catalogueId = `wedding_meal_choices:${safeWeddingLabel(metadata.responseWorkspaceId)}`;
  const nowIso = input.nowIso ?? new Date().toISOString();
  return {
    id: `${catalogueId}:revision:${revision}`,
    thread_id: `wedding_meal_choices:${metadata.responseWorkspaceId}`,
    from: "user://wedding-couple",
    to: ["agent://wedding-planning", "agent://knowledge-graph"],
    type: "ledger",
    kind: "wedding_meal_choice_catalogue",
    subtype: "wedding_meal_choice_catalogue",
    content: {
      kind: "wedding_meal_choice_catalogue",
      contract_version: 1,
      catalogue_id: catalogueId,
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      revision,
      options: storedOptions,
      source: input.source,
      source_label: clean(input.sourceLabel).slice(0, 120) || "Couple-entered choices",
      source_message_id: clean(input.sourceMessageId) || null,
      confirmed_by_couple: true,
      updated_at: nowIso,
    },
    metadata: {
      template: "wedding_planning",
      weddingPlanId: metadata.weddingPlanId,
      responseWorkspaceId: metadata.responseWorkspaceId,
      origin: "wedding_meal_choice_confirmation",
      approval_status: "approved",
      model_calls: 0,
    },
    references: [
      { type: "wedding_plan", target: metadata.weddingPlanId, label: "Wedding plan" },
      ...(input.sourceMessageId ? [{ type: "source_message", target: input.sourceMessageId, label: clean(input.sourceLabel) || "Meal choice source" }] : []),
    ],
    supertags: ["template:wedding_planning", "event:wedding", "wedding:meal_choices", "privacy:couple_only"],
    store_in_relational: true,
  };
}
