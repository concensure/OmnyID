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
type WindowWithAi = Window & { ai?: { languageModel?: LmApi } };

function lm(): LmApi | undefined {
  return (window as WindowWithAi).ai?.languageModel;
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
    const api = lm();
    if (!api) return null;
    const session = await api.create({ systemPrompt: INTENT_SYSTEM });
    const raw = await session.prompt(query);
    session.destroy();
    const cleaned = raw
      .trim()
      .replace(/^```json\n?/, "")
      .replace(/^```\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return { intent: String(parsed.intent ?? "web_research"), parsed };
  } catch {
    return null;
  }
}
