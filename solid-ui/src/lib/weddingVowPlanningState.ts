// @locs-version: 2.0
import type { WeddingGeneratedArtifact } from "@/lib/weddingArtifactGenerationState";
import {
  normalizeWeddingArtifactSummary,
  type WeddingArtifactInput,
} from "@/lib/weddingArtifactState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingVowPreference = "undecided" | "standard" | "create";

export type WeddingVowStyleId =
  | "warm_personal"
  | "light_funny"
  | "classic_formal"
  | "short_modern"
  | "story_based"
  | "faith_or_cultural";

export type WeddingVowStyleOption = {
  id: WeddingVowStyleId;
  label: string;
  tone: string;
  sample: string;
};

export type WeddingVowPlanningInput = {
  metadata?: unknown;
  preference?: string | null;
  styleId?: string | null;
  relationshipFactLabels?: readonly unknown[] | null;
  customChecklistItems?: readonly unknown[] | null;
};

export type WeddingVowPlanningState = {
  preference: WeddingVowPreference;
  selectedStyle: WeddingVowStyleOption | null;
  styleOptions: WeddingVowStyleOption[];
  relationshipFactLabels: string[];
  checklistItems: string[];
  taskItems: WeddingPlanningTaskItem[];
  artifact: WeddingGeneratedArtifact;
};

export type WeddingVowPlanningTaskItemsInput = {
  artifacts?: readonly WeddingArtifactInput[] | null;
  metadata?: unknown;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
};

export const WEDDING_VOW_STYLE_OPTIONS: WeddingVowStyleOption[] = [
  {
    id: "warm_personal",
    label: "Warm and personal",
    tone: "Sincere, grounded, intimate, not overly formal.",
    sample: "I choose you in the ordinary mornings, the difficult decisions, and the quiet moments between them. I promise to listen before reacting, to protect the life we are building, and to keep choosing us with patience, humour, and care.",
  },
  {
    id: "light_funny",
    label: "Light and funny",
    tone: "Playful without turning the ceremony into a roast.",
    sample: "I promise to be your teammate, your emergency snack supplier, and the person who still laughs at our private jokes when nobody else understands them. I promise to take the serious parts seriously and the silly parts joyfully.",
  },
  {
    id: "classic_formal",
    label: "Classic and formal",
    tone: "Ceremonial, timeless, restrained.",
    sample: "Today I take you as my partner in life. I promise fidelity, respect, patience, and devotion. In joy and in difficulty, in change and in certainty, I will stand beside you and honour the commitment we make today.",
  },
  {
    id: "short_modern",
    label: "Short and modern",
    tone: "Concise, direct, emotionally clear.",
    sample: "You are my home and my favourite future. I promise to show up, to tell the truth kindly, to grow with you, and to love you deliberately every day.",
  },
  {
    id: "story_based",
    label: "Story-based",
    tone: "Builds from a remembered moment into promises.",
    sample: "From the first small moment that felt easy with you, I knew life could become wider, kinder, and more honest. I promise to keep noticing those small moments, to protect our friendship, and to turn our story into a life we are proud of.",
  },
  {
    id: "faith_or_cultural",
    label: "Faith or cultural respect",
    tone: "Leaves space for traditions, blessings, language, and family requirements.",
    sample: "With respect for the people, traditions, and values that brought us here, I promise to build a marriage marked by care, loyalty, humility, and love. I will honour you, our families, and the life we create together.",
  },
];

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 12): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

export function normalizeWeddingVowPreference(value: unknown): WeddingVowPreference {
  const normalized = clean(value).toLowerCase();
  if (normalized === "standard" || normalized === "create") return normalized;
  return "undecided";
}

export function weddingVowStyleOption(value: unknown): WeddingVowStyleOption | null {
  const normalized = clean(value).toLowerCase();
  return WEDDING_VOW_STYLE_OPTIONS.find((style) => style.id === normalized || style.label.toLowerCase() === normalized) ?? null;
}

function checklistItems(input: WeddingVowPlanningInput): string[] {
  return uniqueStrings([
    "Choose personal vows or a standard vow.",
    "If creating vows, choose a tone and length before drafting.",
    "Collect 3-5 true memories, traits, or promises from known relationship context.",
    "Decide whether vows are private, ceremony-facing, or exchanged before the ceremony.",
    "Write a first draft without sharing it externally.",
    "Review the vow for length, sensitivity, family/cultural fit, and ceremony timing.",
    ...(input.customChecklistItems ?? []),
  ], 16);
}

function markdownFor(
  metadata: WeddingPlanningMetadata,
  preference: WeddingVowPreference,
  style: WeddingVowStyleOption | null,
  facts: readonly string[],
  checklist: readonly string[],
): string {
  const selectedStyle = style ?? WEDDING_VOW_STYLE_OPTIONS[0];
  const standardVow = "I take you as my partner in marriage. I promise to love, respect, support, and stand beside you, through joy and difficulty, for all the days of our life together.";
  return [
    "# Vow preparation",
    "",
    "This is a private planning aid. It should inspire the couple's own words and should be reviewed against ceremony, celebrant, cultural, or faith requirements before use.",
    "",
    "## Current choice",
    "",
    preference === "create"
      ? `- Create personal vows in the "${selectedStyle.label}" style.`
      : preference === "standard"
        ? "- Use a standard vow unless the couple later decides to personalize it."
        : "- Decide whether to use a standard vow or create personal vows.",
    "",
    "## Style options",
    "",
    ...WEDDING_VOW_STYLE_OPTIONS.map((option) => `- ${option.label}: ${option.tone}`),
    "",
    "## Inspiration vow",
    "",
    preference === "standard" ? standardVow : selectedStyle.sample,
    "",
    "## Known relationship facts available for vow drafting",
    "",
    ...(facts.length > 0
      ? facts.map((fact) => `- ${fact}`)
      : ["- No relationship facts from saved OmnyID memory, Knowledge Graph, or topography are available in this workspace yet. Do not invent private history."]),
    "",
    "## Vow checklist",
    "",
    ...checklist.map((item) => `- [ ] ${item}`),
    "",
    "## Search and retrieval context",
    "",
    `- Wedding plan: ${metadata.weddingPlanId}`,
    `- Wedding workspace: ${metadata.responseWorkspaceId}`,
  ].join("\n");
}

function taskItems(
  metadata: WeddingPlanningMetadata,
  preference: WeddingVowPreference,
  checklist: readonly string[],
): WeddingPlanningTaskItem[] {
  const tasks = [
    {
      id: `vow-choice:${metadata.responseWorkspaceId}`,
      title: "Choose personal vows or a standard vow",
      notes: "Early preparation item. This can be done anytime, but should be settled before ceremony scripting.",
      priority: preference === "undecided" ? "high" : "normal",
    },
    {
      id: `vow-style:${metadata.responseWorkspaceId}`,
      title: "Pick vow style and length",
      notes: "Choose tone before drafting so the agent does not produce generic ceremony copy.",
      priority: preference === "create" ? "high" : "normal",
    },
    {
      id: `vow-context:${metadata.responseWorkspaceId}`,
      title: "Collect vow memories and practical facts",
      notes: "Use only facts the couple provides or facts already available from saved OmnyID memory/topology.",
      priority: "normal",
    },
  ] as const;
  return tasks.map((task) => ({
    id: `wedding_task:${safeWeddingLabel(task.id)}`,
    title: task.title,
    kind: "vow",
    dueLabel: "Early prep / anytime",
    priority: task.priority,
    source: "agent",
    reviewStatus: "accepted",
    approvalState: "draft",
    metadata: {
      ...metadata,
      wedding_task_kind: "vow",
      vow_planning_task: true,
      vow_preference: preference,
      vow_checklist_preview: checklist.slice(0, 5),
      preparation_checklist: true,
      preparation_checklist_item: "vow_preparation",
      user_selectable: true,
      can_deselect_before_commit: true,
      searchable_terms: [
        task.title,
        task.notes,
        "vow preparation",
        "personal vows",
        "standard vow",
        preference,
        metadata.weddingPlanId,
        metadata.responseWorkspaceId,
      ],
    },
    notes: task.notes,
  }));
}

function taskRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function existingVowTaskKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const metadata = taskRecord(item.metadata);
    if (metadata.vow_planning_task === true) keys.add(clean(metadata.wedding_task_kind) || "vow");
  }
  return keys;
}

function isVowArtifact(artifact: WeddingArtifactInput): boolean {
  return /vow preparation|personal vows|standard vow|vow checklist/i.test(`${clean(artifact.title)}\n${clean(artifact.bodyText)}`);
}

function preferenceFromArtifact(artifact: WeddingArtifactInput): WeddingVowPreference {
  const body = clean(artifact.bodyText);
  if (/create personal vows/i.test(body)) return "create";
  if (/use a standard vow/i.test(body)) return "standard";
  return "undecided";
}

export function buildWeddingVowPlanningTaskItems(input: WeddingVowPlanningTaskItemsInput): WeddingPlanningTaskItem[] {
  const artifact = (input.artifacts ?? []).find(isVowArtifact);
  if (!artifact) return [];
  const metadata = normalizeWeddingPlanningMetadata(input.metadata ?? artifact.metadata);
  const existingKeys = existingVowTaskKeys(input.existingTaskItems ?? []);
  if (existingKeys.has("vow")) return [];
  const tasks = taskItems(metadata, preferenceFromArtifact(artifact), checklistItems({}));
  return tasks
    .filter((task) => !existingKeys.has(task.id))
    .map((task) => ({ ...task, linkedArtifactId: clean(artifact.id) || null }));
}

export function buildWeddingVowPlanningState(input: WeddingVowPlanningInput): WeddingVowPlanningState {
  const metadata = normalizeWeddingPlanningMetadata({
    ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
    artifactKind: "research",
    supertags: [
      ...normalizeWeddingPlanningMetadata(input.metadata).supertags,
      "wedding_vows",
      "wedding_task:vow",
    ],
  });
  const preference = normalizeWeddingVowPreference(input.preference);
  const selectedStyle = weddingVowStyleOption(input.styleId);
  const relationshipFactLabels = uniqueStrings(input.relationshipFactLabels ?? [], 12);
  const checklist = checklistItems(input);
  const markdown = markdownFor(metadata, preference, selectedStyle, relationshipFactLabels, checklist);
  const artifactInput = {
    id: `wedding_artifact:vows:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    title: "Vow preparation",
    kind: "research" as const,
    metadata,
    sourceLabels: relationshipFactLabels.length > 0
      ? ["OmnyID memory or Knowledge Graph relationship context"]
      : ["No relationship facts available yet"],
    linkedTaskIds: taskItems(metadata, preference, checklist).map((task) => task.id),
    bodyText: markdown,
    exportTargets: ["markdown", "html", "word_doc", "browser_pdf"],
  };
  const summary = normalizeWeddingArtifactSummary(artifactInput)!;
  return {
    preference,
    selectedStyle,
    styleOptions: WEDDING_VOW_STYLE_OPTIONS,
    relationshipFactLabels,
    checklistItems: checklist,
    taskItems: taskItems(metadata, preference, checklist),
    artifact: {
      input: artifactInput,
      summary,
      markdown,
      csv: null,
    },
  };
}
