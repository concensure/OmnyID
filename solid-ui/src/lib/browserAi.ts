import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

/**
 * Browser-native AI detection and intent classification.
 *
 * Chrome 127+: window.ai.languageModel (Gemini Nano via Prompt API)
 * Edge 122+:   same window.ai surface but backed by Phi-3 / Phi-4
 */

type LmCapabilities = { available: "readily" | "after-download" | "no" };
type LmSession = { prompt: (q: string) => Promise<string>; destroy: () => void };
type LmApi = {
  capabilities: () => Promise<LmCapabilities>;
  create: (opts: { systemPrompt: string }) => Promise<LmSession>;
};
type ModernLmApi = {
  availability: () => Promise<"available" | "downloadable" | "downloading" | "unavailable">;
  create: (opts: { initialPrompts: Array<{ role: "system"; content: string }> }) => Promise<LmSession>;
};
type WindowWithAi = Window & {
  ai?: { languageModel?: LmApi };
  LanguageModel?: ModernLmApi;
};

function lm(): LmApi | undefined {
  return (window as WindowWithAi).ai?.languageModel;
}

function modernLm(): ModernLmApi | undefined {
  return (window as WindowWithAi).LanguageModel;
}

async function createBrowserLmSession(systemPrompt: string): Promise<LmSession | null> {
  const modern = modernLm();
  if (modern) {
    const available = await modern.availability();
    if (available === "available" || available === "downloadable" || available === "downloading") {
      return modern.create({ initialPrompts: [{ role: "system", content: systemPrompt }] });
    }
  }
  const legacy = lm();
  if (!legacy) return null;
  const caps = await legacy.capabilities();
  if (caps.available !== "readily" && caps.available !== "after-download") return null;
  return legacy.create({ systemPrompt });
}

function cleanBrowserAiJson(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\n?/, "")
    .replace(/^```\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
}

export function parseBrowserAiClassification(raw: string): { intent: string; parsed: Record<string, unknown> } | null {
  const parsed = parseJsonValue(cleanBrowserAiJson(raw));
  if (!parsed.ok) return null;

  if (!isRecord(parsed.value)) return null;

  const intent = typeof parsed.value.intent === "string" && parsed.value.intent.trim()
    ? parsed.value.intent.trim()
    : "web_research";
  return { intent, parsed: parsed.value };
}

/** Returns a human-readable label for the detected browser AI, or null if unavailable. */
export function getBrowserAiLabel(): string | null {
  const ua = navigator.userAgent;
  if (ua.includes("Edg/")) return "Phi (Edge built-in)";
  if (ua.includes("Chrome/")) return "Gemini Nano (Chrome built-in)";
  return null;
}

/** Async check — confirms the API exists AND the model is available. */
export async function checkBrowserAiAvailable(): Promise<boolean> {
  try {
    const modern = modernLm();
    if (modern) {
      const availability = await modern.availability();
      return availability === "available" || availability === "downloadable" || availability === "downloading";
    }
    const api = lm();
    if (!api) return false;
    const caps = await api.capabilities();
    return caps.available === "readily" || caps.available === "after-download";
  } catch {
    return false;
  }
}

const INTENT_SYSTEM = `You are an intent classifier for an AI assistant. Given a user message, return ONLY a valid JSON object — no markdown, no explanation.

Intents:
- "task": adding to-dos, shopping lists, reminders, buying things, creating items
- "note": saving information, memos, journaling, quick capture
- "orchestrate": complex multi-step goals requiring planning and background work
- "web_research": looking something up, factual questions, research

Return the matching schema:
task: {"intent":"task","title":"...","description":"...","priority":"normal","task_type":"general","summary":"..."}
note: {"intent":"note","title":"...","content":"...","summary":"..."}
orchestrate: {"intent":"orchestrate","objective":"...","summary":"..."}
web_research: {"intent":"web_research","query":"...","summary":"...","bullets":[],"sources":[]}`;

export async function classifyWithBrowserAi(
  query: string
): Promise<{ intent: string; parsed: Record<string, unknown> } | null> {
  try {
    const session = await createBrowserLmSession(INTENT_SYSTEM);
    if (!session) return null;
    const raw = await session.prompt(query);
    session.destroy();
    return parseBrowserAiClassification(raw);
  } catch {
    return null;
  }
}

const MASTER_AGENT_SYSTEM = `You are the browser-local OmnyID assistant. Answer the user's question clearly and concisely. You cannot read their private workspace, use tools, send messages, create tasks, or save memory. Never claim that you performed an action. If the request needs workspace data or an external action, explain that a connected model is required.`;

/**
 * Runs a private, read-only answer through Chrome or Edge's built-in model.
 * The result is intentionally not persisted as an AFP event because the
 * browser model cannot provide the model/cost provenance required for a
 * durable agent-generated record.
 */
export async function answerWithBrowserAi(query: string): Promise<string | null> {
  let session: LmSession | null = null;
  try {
    session = await createBrowserLmSession(MASTER_AGENT_SYSTEM);
    if (!session) return null;
    const answer = (await session.prompt(query)).trim();
    return answer || null;
  } catch {
    return null;
  } finally {
    session?.destroy();
  }
}
