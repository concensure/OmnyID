import { createEffect, createMemo, createSignal, For, onMount, Show } from "solid-js";
import { apiFetch, deleteCapability, fetchLlmConfig, listCapabilities, patchCapability, pingLlmConfig, registerCapability, saveLlmConfig, type CapabilityDescriptor, type LlmConfig } from "@/lib/api";
import { AddCapabilityModal } from "./AddCapabilityModal";
import { OnboardingWizard } from "./OnboardingWizard";
import { AliasSettings } from "./AliasSettings";
import { AgentPreferencesPanel } from "./AgentPreferencesPanel";
import { AgentPersonasPanel } from "./AgentPersonasPanel";
import { ProfileLedgerView } from "./ProfileLedgerView";

type AgentInstance = {
  soul_md?: string;
  lora_confidence_score?: number;
  lora_genome_active?: boolean;
  is_master?: boolean;
};

export function AgentSettingsView(props: {
  browserAiLabel?: string | null;
  focusLlm?: boolean;
  onFocusDone?: () => void;
  onViewWorkflows?: () => void;
}) {
  let llmSectionRef: HTMLDivElement | undefined;

  const [instance, setInstance] = createSignal<AgentInstance | null>(null);
  const [showWizard, setShowWizard] = createSignal(false);
  const [confirmReconfigure, setConfirmReconfigure] = createSignal(false);
  const [loading, setLoading] = createSignal(true);

  // LLM config state
  const [llmConfig, setLlmConfig] = createSignal<LlmConfig | null>(null);
  const [llmBackend, setLlmBackend] = createSignal<"byok" | "ollama" | "runpod">("byok");
  const [llmProvider, setLlmProvider] = createSignal<string>("anthropic");
  const [llmModel, setLlmModel] = createSignal("claude-haiku-4-5-20251001");
  const [llmApiKey, setLlmApiKey] = createSignal("");
  const [llmOllamaUrl, setLlmOllamaUrl] = createSignal("http://localhost:11434");

  const MODEL_TIER: Record<string, string> = {
    "claude-haiku-4-5-20251001": "⚡ fast",
    "claude-sonnet-4-6": "⚖ balanced",
    "claude-opus-4-8": "🐢 deep",
    "gpt-4o-mini": "⚡ fast",
    "gpt-4o": "⚖ balanced",
    "gpt-4-turbo": "⚖ balanced",
    "gpt-3.5-turbo": "⚡ fast",
    "openai/gpt-4o-mini": "⚡ fast",
    "anthropic/claude-sonnet-4-6": "⚖ balanced",
    "meta-llama/llama-3.1-8b-instruct": "⚡ fast",
    "llama3.1-8b": "⚡ fast",
    "llama3.1-70b": "⚖ balanced",
    "llama3.2": "⚡ fast",
    "Qwen/Qwen3.5-35B-A3B": "⚖ balanced",
  };
  const modelTier = () => MODEL_TIER[llmModel()] ?? null;

  const PROVIDER_MODELS: Record<string, string[]> = {
    anthropic:   ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-8"],
    openai:      ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
    openrouter:  ["openai/gpt-4o-mini", "anthropic/claude-sonnet-4-6", "meta-llama/llama-3.1-8b-instruct"],
    cerebras:    ["llama3.1-70b", "llama3.1-8b"],
    together_ai: ["meta-llama/Llama-3-8b-hf", "meta-llama/Llama-3-70b-hf"],
  };

  const providerDefaults: Record<string, { model: string; keyPlaceholder: string }> = {
    anthropic:   { model: "claude-haiku-4-5-20251001", keyPlaceholder: "sk-ant-…" },
    openai:      { model: "gpt-4o-mini",               keyPlaceholder: "sk-…" },
    openrouter:  { model: "openai/gpt-4o-mini",        keyPlaceholder: "sk-or-…" },
    cerebras:    { model: "llama3.1-70b",              keyPlaceholder: "csk-…" },
    together_ai: { model: "meta-llama/Llama-3-8b-hf",  keyPlaceholder: "…together key…" },
  };
  const keyPrefix = () => {
    const placeholder = providerDefaults[llmProvider()]?.keyPlaceholder ?? "";
    return placeholder.split("…")[0];
  };
  const keyFormatValid = () => {
    const key = llmApiKey();
    if (!key) return null;
    const prefix = keyPrefix();
    if (!prefix || prefix.includes(" ")) return null;
    return key.startsWith(prefix);
  };
  const [keyPrefixCopied, setKeyPrefixCopied] = createSignal(false);
  function copyKeyPrefix() {
    const prefix = keyPrefix();
    if (!prefix) return;
    navigator.clipboard.writeText(prefix).then(() => {
      setKeyPrefixCopied(true);
      setTimeout(() => setKeyPrefixCopied(false), 1500);
    });
  }

  // Saved-to-server snapshots — used for per-field dirty highlighting
  const [savedLlmBackend, setSavedLlmBackend] = createSignal<string>("byok");
  const [savedLlmModel, setSavedLlmModel] = createSignal<string>("claude-haiku-4-5-20251001");
  const [savedOllamaUrl, setSavedOllamaUrl] = createSignal<string>("http://localhost:11434");

  const [llmSaving, setLlmSaving] = createSignal(false);
  const [llmSaved, setLlmSaved] = createSignal(false);
  const [llmError, setLlmError] = createSignal("");
  const [llmDirty, setLlmDirty] = createSignal(false);
  const [llmPinging, setLlmPinging] = createSignal(false);
  const [llmPingResult, setLlmPingResult] = createSignal<{ ok: boolean; reason?: string } | null>(null);
  const [modelResetTo, setModelResetTo] = createSignal<string | null>(null);
  let modelResetTimer: ReturnType<typeof setTimeout> | undefined;
  function flashModelReset(model: string) {
    clearTimeout(modelResetTimer);
    setModelResetTo(model);
    modelResetTimer = setTimeout(() => setModelResetTo(null), 3000);
  }
  const LLM_PING_KEY = "omnyid.llm.last_ping";
  const LLM_PING_OK_KEY = "omnyid.llm.last_ping_ok";
  const LLM_LATENCY_KEY = "omnyid.llm.latency_history";
  type LatencySnapshot = { ts: number; ms: number };
  function loadLatencyHistory(): LatencySnapshot[] {
    try { return JSON.parse(localStorage.getItem(LLM_LATENCY_KEY) ?? "[]"); } catch { return []; }
  }
  const [latencyHistory, setLatencyHistory] = createSignal<LatencySnapshot[]>(loadLatencyHistory());
  const [lastPingAt, setLastPingAt] = createSignal<number | null>(
    (() => { const v = localStorage.getItem(LLM_PING_KEY); return v ? parseInt(v) : null; })()
  );

  // LoRA history sparkline
  const LORA_HISTORY_KEY = "omnyid.lora.history";
  type LoraSnapshot = { date: string; score: number };
  function loadLoraHistory(): LoraSnapshot[] {
    try { return JSON.parse(localStorage.getItem(LORA_HISTORY_KEY) ?? "[]"); } catch { return []; }
  }
  const [loraHistory, setLoraHistory] = createSignal<LoraSnapshot[]>(loadLoraHistory());
  function clearLoraHistory() {
    localStorage.removeItem(LORA_HISTORY_KEY);
    setLoraHistory([]);
  }
  createEffect(() => {
    const score = instance()?.lora_confidence_score;
    if (score == null) return;
    const today = new Date().toISOString().slice(0, 10);
    const history = loadLoraHistory();
    const existing = history.find((h) => h.date === today);
    if (!existing) {
      const next = [...history, { date: today, score }].slice(-7);
      localStorage.setItem(LORA_HISTORY_KEY, JSON.stringify(next));
      setLoraHistory(next);
    } else if (existing.score !== score) {
      const next = history.map((h) => h.date === today ? { ...h, score } : h);
      localStorage.setItem(LORA_HISTORY_KEY, JSON.stringify(next));
      setLoraHistory(next);
    }
  });

  // Capability registry state
  const [capabilities, setCapabilities] = createSignal<CapabilityDescriptor[]>([]);
  const [showAddCapability, setShowAddCapability] = createSignal(false);
  const [capDeleting, setCapDeleting] = createSignal<string | null>(null);
  const [capAdding, setCapAdding] = createSignal<string | null>(null);
  const [newCapId, setNewCapId] = createSignal<string | null>(null);
  const SOUL_SAVED_KEY = "omnyid.soul.saved_at";
  const [soulSavedAt, setSoulSavedAt] = createSignal<number | null>(
    (() => { const v = localStorage.getItem("omnyid.soul.saved_at"); return v ? parseInt(v) : null; })()
  );
  const [soulCopied, setSoulCopied] = createSignal(false);
  const [showSoulEditor, setShowSoulEditor] = createSignal(false);
  const [soulEditText, setSoulEditText] = createSignal("");
  const [soulSaving, setSoulSaving] = createSignal(false);
  const [soulSaveError, setSoulSaveError] = createSignal("");

  function copySoulMd() {
    navigator.clipboard.writeText(instance()?.soul_md ?? "").then(() => {
      setSoulCopied(true);
      setTimeout(() => setSoulCopied(false), 1500);
    });
  }

  function openSoulEditor() {
    setSoulEditText(instance()?.soul_md ?? "");
    setSoulSaveError("");
    setShowSoulEditor(true);
  }

  async function saveSoulMd() {
    setSoulSaving(true);
    setSoulSaveError("");
    try {
      await apiFetch("/agent/soul_md", { method: "PUT", bodyJson: { soul_md: soulEditText() } });
      const fleet = await apiFetch<{ master_instance?: AgentInstance }>("/agent/fleet");
      setInstance(fleet.master_instance ?? null);
      const savedNow = Date.now();
      setSoulSavedAt(savedNow);
      localStorage.setItem(SOUL_SAVED_KEY, String(savedNow));
      setShowSoulEditor(false);
    } catch (e: unknown) {
      setSoulSaveError(e instanceof Error ? e.message : "Save failed");
    }
    setSoulSaving(false);
  }

  const CAP_LAST_USED_KEY = "omnyid.cap.last_used";
  const [capLastUsed, setCapLastUsed] = createSignal<Record<string, number>>(
    (() => { try { const v = localStorage.getItem(CAP_LAST_USED_KEY); return v ? JSON.parse(v) as Record<string, number> : {}; } catch { return {}; } })()
  );
  const CAP_USAGE_COUNT_KEY = "omnyid.cap.usage_count";
  const [capUsageCount, setCapUsageCount] = createSignal<Record<string, number>>(
    (() => { try { const v = localStorage.getItem(CAP_USAGE_COUNT_KEY); return v ? JSON.parse(v) as Record<string, number> : {}; } catch { return {}; } })()
  );
  const CAP_DOW_KEY = "omnyid.cap.dow_usage";
  const [capDowUsage, setCapDowUsage] = createSignal<Record<string, number[]>>(
    (() => { try { const v = localStorage.getItem(CAP_DOW_KEY); return v ? JSON.parse(v) as Record<string, number[]> : {}; } catch { return {}; } })()
  );
  function touchCapLastUsed(id: string) {
    const now = Date.now();
    setCapLastUsed((prev) => {
      const next = { ...prev, [id]: now };
      localStorage.setItem(CAP_LAST_USED_KEY, JSON.stringify(next));
      return next;
    });
    setCapUsageCount((prev) => {
      const next = { ...prev, [id]: (prev[id] ?? 0) + 1 };
      localStorage.setItem(CAP_USAGE_COUNT_KEY, JSON.stringify(next));
      return next;
    });
    const dow = new Date().getDay();
    setCapDowUsage((prev) => {
      const existing = prev[id] ?? [0, 0, 0, 0, 0, 0, 0];
      const next = [...existing] as number[];
      next[dow] = (next[dow] ?? 0) + 1;
      const updated = { ...prev, [id]: next };
      localStorage.setItem(CAP_DOW_KEY, JSON.stringify(updated));
      return updated;
    });
  }

  const APPROVAL_CYCLE: CapabilityDescriptor["approval_mode"][] = [
    "suggest_only",
    "human_approval_required",
    "autonomous",
  ];
  const [capModePatching, setCapModePatching] = createSignal<string | null>(null);
  const [capModeSaved, setCapModeSaved] = createSignal<string | null>(null);
  async function cycleApprovalMode(cap: CapabilityDescriptor) {
    const next = APPROVAL_CYCLE[(APPROVAL_CYCLE.indexOf(cap.approval_mode) + 1) % APPROVAL_CYCLE.length];
    setCapModePatching(cap.id);
    try {
      await patchCapability(cap.id, { approval_mode: next });
      await refreshCapabilities();
      touchCapLastUsed(cap.id);
      setCapModeSaved(cap.id);
      setTimeout(() => setCapModeSaved((prev) => (prev === cap.id ? null : prev)), 1500);
    } catch { /* ignore */ }
    setCapModePatching(null);
  }

  const [capFilter, setCapFilter] = createSignal("");
  const [capImporting, setCapImporting] = createSignal(false);
  const [capImportResult, setCapImportResult] = createSignal<string | null>(null);
  let capImportInputRef: HTMLInputElement | undefined;

  function exportCapabilities() {
    const json = JSON.stringify(capabilities(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "omnyid-capabilities.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    setCapImporting(true);
    setCapImportResult(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as CapabilityDescriptor[];
      if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
      const existing = new Set(capabilities().map((c) => c.name));
      const toAdd = parsed.filter((c) => !existing.has(c.name));
      for (const cap of toAdd) {
        await registerCapability({
          name: cap.name,
          description: cap.description,
          input_schema: cap.input_schema,
          output_schema: cap.output_schema ?? null,
          version: cap.version ?? "1.0.0",
          tags: cap.tags ?? [],
          approval_mode: cap.approval_mode ?? "suggest_only",
        });
      }
      await refreshCapabilities();
      setCapImportResult(`Imported ${toAdd.length} capability${toAdd.length === 1 ? "" : "ies"}`);
      setTimeout(() => setCapImportResult(null), 4000);
    } catch (err) {
      setCapImportResult(`Import failed: ${err instanceof Error ? err.message : "unknown error"}`);
      setTimeout(() => setCapImportResult(null), 6000);
    }
    setCapImporting(false);
    (e.currentTarget as HTMLInputElement).value = "";
  }
  const filteredCapabilities = createMemo(() => {
    const q = capFilter().toLowerCase().trim();
    if (!q) return capabilities();
    return capabilities().filter(
      (c) => c.name.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q)
    );
  });

  const CAPABILITY_TEMPLATES: Array<{
    id: string;
    icon: string;
    name: string;
    description: string;
    tags: string[];
    approval_mode: CapabilityDescriptor["approval_mode"];
    input_schema: Record<string, unknown>;
  }> = [
    {
      id: "email_guardian",
      icon: "🛡",
      name: "email_guardian",
      description: "Monitor inbox for phishing, suspicious senders, and unwanted bulk mail. Flag or quarantine on detection, requiring your approval before any action.",
      tags: ["email", "security", "monitor"],
      approval_mode: "human_approval_required",
      input_schema: {
        type: "object",
        properties: {
          email_id: { type: "string", description: "The email message ID to inspect" },
          sender: { type: "string", description: "Sender address" },
          subject: { type: "string", description: "Email subject line" },
        },
        required: ["email_id", "sender"],
      },
    },
    {
      id: "email_auto_label",
      icon: "🏷",
      name: "email_auto_label",
      description: "Automatically label incoming emails using existing Gmail labels. Proposes new labels for approval before creating them.",
      tags: ["email", "organisation"],
      approval_mode: "suggest_only",
      input_schema: {
        type: "object",
        properties: {
          email_id: { type: "string" },
          subject: { type: "string" },
          snippet: { type: "string" },
        },
        required: ["email_id"],
      },
    },
    {
      id: "email_draft_reply",
      icon: "✍️",
      name: "email_draft_reply",
      description: "Draft replies to emails requiring a response. Always presents the draft for manual review before sending.",
      tags: ["email", "compose"],
      approval_mode: "human_approval_required",
      input_schema: {
        type: "object",
        properties: {
          email_id: { type: "string" },
          thread_id: { type: "string" },
          context: { type: "string", description: "Summary of the email thread" },
        },
        required: ["email_id"],
      },
    },
  ];

  async function addFromTemplate(tpl: (typeof CAPABILITY_TEMPLATES)[number]) {
    if (capAdding()) return;
    setCapAdding(tpl.id);
    try {
      await registerCapability({
        name: tpl.name,
        description: tpl.description,
        input_schema: tpl.input_schema,
        output_schema: null,
        version: "1.0.0",
        tags: tpl.tags,
        approval_mode: tpl.approval_mode,
      });
      await refreshCapabilities();
      const added = capabilities().find((c) => c.name === tpl.name);
      if (added) {
        setNewCapId(added.id);
        setTimeout(() => setNewCapId((prev) => (prev === added.id ? null : prev)), 3000);
      }
    } catch { /* ignore */ }
    setCapAdding(null);
  }

  async function refreshCapabilities() {
    try {
      const caps = await listCapabilities();
      setCapabilities(caps);
    } catch { /* ignore */ }
  }

  async function handleDeleteCapability(id: string) {
    setCapDeleting(id);
    try {
      await deleteCapability(id);
      await refreshCapabilities();
    } catch { /* ignore */ }
    setCapDeleting(null);
  }

  onMount(async () => {
    // Scroll to LLM config section if opened via the pill link
    if (props.focusLlm && llmSectionRef) {
      setTimeout(() => llmSectionRef?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
    props.onFocusDone?.();

    try {
      const fleet = await apiFetch<{ master_instance?: AgentInstance }>("/agent/fleet");
      setInstance(fleet.master_instance ?? null);
    } catch { /* ignore */ }
    await refreshCapabilities();
    try {
      const cfg = await fetchLlmConfig();
      setLlmConfig(cfg);
      if (cfg.backend === "ollama" || cfg.backend === "byok" || cfg.backend === "runpod") {
        setLlmBackend(cfg.backend as "byok" | "ollama" | "runpod");
        setSavedLlmBackend(cfg.backend);
      }
      setLlmModel(cfg.model);
      setSavedLlmModel(cfg.model);
      if (cfg.ollama_url) { setLlmOllamaUrl(cfg.ollama_url); setSavedOllamaUrl(cfg.ollama_url); }
    } catch { /* not configured yet */ }
    setLoading(false);
  });

  async function saveLlm() {
    setLlmSaving(true);
    setLlmError("");
    setLlmPingResult(null);
    try {
      await saveLlmConfig({
        backend: llmBackend(),
        model: llmModel() || undefined,
        api_key: llmBackend() === "byok" ? llmApiKey() || undefined : undefined,
        ollama_url: llmBackend() === "ollama" ? llmOllamaUrl() || undefined : undefined,
      });
      setLlmSaved(true);
      setLlmDirty(false);
      setSavedLlmBackend(llmBackend());
      setSavedLlmModel(llmModel());
      setSavedOllamaUrl(llmOllamaUrl());
      setTimeout(() => setLlmSaved(false), 3000);
      const cfg = await fetchLlmConfig();
      setLlmConfig(cfg);
    } catch (e: unknown) {
      setLlmError(e instanceof Error ? e.message : "Save failed");
    }
    setLlmSaving(false);
  }

  async function testLlmConnection() {
    // Auto-save unsaved changes before pinging so the test reflects what the user typed.
    if (llmDirty() && !llmSaving()) await saveLlm();
    setLlmPinging(true);
    setLlmPingResult(null);
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setLlmPingResult({ ok: false, reason: "Request timed out after 10s" });
      localStorage.setItem(LLM_PING_OK_KEY, "0");
      setLlmPinging(false);
    }, 10_000);
    try {
      const t0 = performance.now();
      const result = await pingLlmConfig();
      const latencyMs = Math.round(performance.now() - t0);
      clearTimeout(timeoutId);
      if (!timedOut) {
        setLlmPingResult({ ok: result.ok, reason: result.reason });
        localStorage.setItem(LLM_PING_OK_KEY, result.ok ? "1" : "0");
        if (result.ok) {
          const now = Date.now();
          localStorage.setItem(LLM_PING_KEY, String(now));
          setLastPingAt(now);
          const next = [...loadLatencyHistory(), { ts: now, ms: latencyMs }].slice(-7);
          localStorage.setItem(LLM_LATENCY_KEY, JSON.stringify(next));
          setLatencyHistory(next);
          setTimeout(() => setLlmPingResult(null), 8000);
        }
      }
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      if (!timedOut) setLlmPingResult({ ok: false, reason: e instanceof Error ? e.message : "Connection failed" });
    }
    if (!timedOut) setLlmPinging(false);
  }

  return (
    <div class="space-y-5">
      <div class="glass-surface rounded-xl border border-white/40 p-6 shadow-panel">
        <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Agent Settings</p>
        <h3 class="mt-2 text-lg font-semibold text-on-surface">Your Master Agent</h3>
        <p class="mt-1 text-sm leading-6 text-on-surface-variant">
          Configure your agent's personality, tone, goals, and operating rules.
          These shape how your agent speaks and what it prioritises.
        </p>

        <Show when={!loading()} fallback={<p class="mt-4 text-sm text-on-surface-variant">Loading…</p>}>
          {/* Soul / personality section */}
          <div class="mt-5 space-y-3">
            <div class="rounded-xl border border-white/20 bg-white/10 p-4">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-sm font-semibold text-on-surface">Personality &amp; Rules</p>
                  <p class="mt-0.5 text-xs text-on-surface-variant">
                    Your agent's soul — how it communicates and what it avoids.
                  </p>
                </div>
                <Show
                  when={confirmReconfigure()}
                  fallback={
                    <button
                      type="button"
                      onClick={() => setConfirmReconfigure(true)}
                      class="flex-shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition hover:bg-primary/80"
                    >
                      Reconfigure
                    </button>
                  }
                >
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-on-surface-variant">Overwrite current personality?</span>
                    <button
                      type="button"
                      onClick={() => { setConfirmReconfigure(false); setShowWizard(true); }}
                      class="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary/80"
                    >
                      Yes, continue
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReconfigure(false)}
                      class="rounded-lg border border-white/40 bg-white/30 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white/50"
                    >
                      Cancel
                    </button>
                  </div>
                </Show>
              </div>

              <Show when={instance()?.soul_md}>
                <div class="group relative mt-3">
                  <pre class="max-h-48 overflow-auto rounded-lg bg-black/10 p-3 font-mono text-[11px] leading-5 text-on-surface-variant whitespace-pre-wrap">
                    {instance()!.soul_md}
                  </pre>
                  <div class="absolute right-2 top-2 flex items-center gap-[0.5em] opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={copySoulMd}
                      title="Copy soul.md to clipboard"
                      class="rounded bg-white/70 px-[0.5em] py-[0.2em] font-mono text-[0.65em] text-on-surface-variant backdrop-blur-sm transition hover:bg-white"
                    >
                      {soulCopied() ? "✓ copied" : "⧉ copy"}
                    </button>
                    <button
                      type="button"
                      onClick={openSoulEditor}
                      title="Edit soul.md"
                      class="rounded bg-primary/10 px-[0.5em] py-[0.2em] font-mono text-[0.65em] text-primary backdrop-blur-sm transition hover:bg-primary/20"
                    >
                      Edit
                    </button>
                  </div>
                </div>
                <Show when={soulSavedAt() !== null}>
                  <p class="mt-1 font-mono text-[10px] text-on-surface-variant/40">
                    {(() => {
                      const secs = Math.floor((Date.now() - soulSavedAt()!) / 1000);
                      if (secs < 60) return "last saved just now";
                      if (secs < 3600) return `last saved ${Math.floor(secs / 60)}m ago`;
                      if (secs < 86400) return `last saved ${Math.floor(secs / 3600)}h ago`;
                      return `last saved ${Math.floor(secs / 86400)}d ago`;
                    })()}
                  </p>
                </Show>
              </Show>
            </div>

            {/* LoRA status */}
            <div class="rounded-xl border border-white/20 bg-white/10 p-4">
              <p class="text-sm font-semibold text-on-surface">LoRA Genome</p>
              <p class="mt-0.5 text-xs text-on-surface-variant">
                As your agent learns your style, it progressively internalises your soul.md.
                At 85% confidence the genome takes over and soul.md becomes an archived reference.
              </p>
              <div class="mt-3">
                <div class="flex items-center justify-between text-xs text-on-surface-variant">
                  <span>Confidence</span>
                  <span>{((instance()?.lora_confidence_score ?? 0) * 100).toFixed(0)}%</span>
                </div>
                <div class="mt-1.5 h-1.5 rounded-full bg-white/15">
                  <div
                    class="h-full rounded-full bg-primary transition-all"
                    style={`width: ${Math.min(100, (instance()?.lora_confidence_score ?? 0) * 100)}%`}
                  />
                </div>
                <Show when={instance()?.lora_genome_active}>
                  <p class="mt-2 text-xs font-medium text-green-600">✓ LoRA genome active — soul.md is now archived</p>
                </Show>
                <Show when={loraHistory().length > 1}>
                  <div class="mt-3 flex items-stretch gap-1.5">
                    <div class="flex flex-col justify-between py-[3px]">
                      <span class="font-mono text-[8px] leading-none text-on-surface-variant/30">100%</span>
                      <span class="font-mono text-[8px] leading-none text-on-surface-variant/30">0%</span>
                    </div>
                    <div class="flex flex-1 items-end gap-[3px]" title="7-day LoRA confidence history">
                      <For each={loraHistory()}>
                        {(snap) => (
                          <div
                            class="flex-1 rounded-sm bg-primary/50 transition-all"
                            style={`height: ${Math.max(3, Math.round(snap.score * 24))}px`}
                            title={`${snap.date}: ${(snap.score * 100).toFixed(0)}%`}
                          />
                        )}
                      </For>
                    </div>
                  </div>
                  <div class="mt-0.5 flex items-center justify-between">
                    <p class="font-mono text-[9px] text-on-surface-variant/40">7-day trend</p>
                    <button
                      type="button"
                      onClick={clearLoraHistory}
                      class="font-mono text-[9px] text-on-surface-variant/30 transition hover:text-red-400"
                    >
                      clear history
                    </button>
                  </div>
                  {(() => {
                    const hist = loraHistory();
                    if (hist.length < 2) return null;
                    const last = hist[hist.length - 1].score;
                    let stableDays = 1;
                    for (let i = hist.length - 2; i >= 0; i--) {
                      if (Math.abs(hist[i].score - last) < 0.01) stableDays++;
                      else break;
                    }
                    if (stableDays < 2) return null;
                    return (
                      <p class="mt-0.5 font-mono text-[9px] text-on-surface-variant/50">
                        Stable for {stableDays} day{stableDays === 1 ? "" : "s"} — training may have plateaued
                      </p>
                    );
                  })()}
                </Show>
              </div>
            </div>

            {/* LLM Configuration */}
            <div ref={llmSectionRef} class="rounded-xl border border-white/20 bg-white/10 p-4">
              <p class="text-sm font-semibold text-on-surface">AI Model Configuration</p>
              <p class="mt-0.5 text-xs text-on-surface-variant">
                Choose how your agent calls the AI. Use your own API key (Anthropic/OpenAI compatible)
                or point to a local Ollama instance for full privacy.
              </p>

              <Show when={llmConfig()}>
                <p class="mt-2 text-xs text-on-surface-variant">
                  Current: <span class="font-medium text-on-surface">{llmConfig()!.backend}</span>
                  {" · "}<span class="font-mono">{llmConfig()!.model}</span>
                </p>
              </Show>

              {/* Browser AI status — shown when browser supports it */}
              <Show when={props.browserAiLabel}>
                <div class={`mt-3 rounded-lg border px-3 py-2 flex items-start gap-2 ${llmConfig() ? "border-white/15 bg-white/5" : "border-primary/30 bg-primary/10"}`}>
                  <span class="mt-0.5 text-sm">🧠</span>
                  <div>
                    <p class="text-xs font-medium text-on-surface">
                      {props.browserAiLabel} detected
                      {!llmConfig() && <span class="ml-1.5 text-primary font-semibold">· Active</span>}
                    </p>
                    <p class="mt-0.5 text-[10px] text-on-surface-variant">
                      {llmConfig()
                        ? "Your server API key takes priority. Browser AI is used as fallback only."
                        : "Being used for intent classification. Add an API key below to switch to a more capable cloud model."}
                    </p>
                  </div>
                </div>
              </Show>

              <div class="mt-4 space-y-3">
                {/* Backend selector */}
                <fieldset role="radiogroup">
                  <legend class="block text-xs font-medium text-on-surface-variant mb-1">Backend</legend>
                  <div class="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={llmBackend() === "byok"}
                      onClick={() => { setLlmBackend("byok"); setLlmModel("claude-haiku-4-5-20251001"); setLlmDirty(true); }}
                      class={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        llmBackend() === "byok"
                          ? "border-primary bg-primary/10 text-on-surface"
                          : "border-white/15 bg-white/5 text-on-surface-variant hover:bg-white/10"
                      }`}
                    >
                      Bring Your Own Key
                      <span class="block text-[10px] font-normal opacity-70">Anthropic / OpenAI compatible</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={llmBackend() === "ollama"}
                      onClick={() => { setLlmBackend("ollama"); setLlmModel("llama3.2"); setLlmDirty(true); flashModelReset("llama3.2"); }}
                      class={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        llmBackend() === "ollama"
                          ? "border-primary bg-primary/10 text-on-surface"
                          : "border-white/15 bg-white/5 text-on-surface-variant hover:bg-white/10"
                      }`}
                    >
                      Local Ollama
                      <span class="block text-[10px] font-normal opacity-70">Fully private, no key needed</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={llmBackend() === "runpod"}
                      onClick={() => { setLlmBackend("runpod"); setLlmModel("Qwen/Qwen3.5-35B-A3B"); setLlmDirty(true); flashModelReset("Qwen/Qwen3.5-35B-A3B"); }}
                      class={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        llmBackend() === "runpod"
                          ? "border-primary bg-primary/10 text-on-surface"
                          : "border-white/15 bg-white/5 text-on-surface-variant hover:bg-white/10"
                      }`}
                    >
                      RunPod vLLM
                      <span class="block text-[10px] font-normal opacity-70">Server-hosted QWEN via RunPod</span>
                    </button>
                  </div>
                </fieldset>
                <Show when={modelResetTo() !== null}>
                  <p class="animate-fade-in font-mono text-[10px] text-on-surface-variant/60">
                    ↺ model reset to <span class="text-on-surface-variant/80">{modelResetTo()}</span>
                  </p>
                </Show>

                {/* RunPod: info note */}
                <Show when={llmBackend() === "runpod"}>
                  <div class="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2">
                    <p class="text-[10px] text-on-surface-variant">
                      Uses the <span class="font-medium text-on-surface">OMNYID_RUNPOD_API_KEY</span> and{" "}
                      <span class="font-medium text-on-surface">OMNYID_RUNPOD_ENDPOINT_ID</span> env vars
                      configured on the homeserver. No API key is stored per-user.
                    </p>
                  </div>
                </Show>

                {/* BYOK: Provider selector */}
                <Show when={llmBackend() === "byok"}>
                  <div>
                    <label class="block text-xs font-medium text-on-surface-variant mb-1">Provider</label>
                    <select
                      value={llmProvider()}
                      onChange={(e) => {
                        const p = e.currentTarget.value;
                        setLlmProvider(p);
                        setLlmModel(providerDefaults[p]?.model ?? "");
                        setLlmDirty(true);
                      }}
                      class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-on-surface outline-none focus:border-primary"
                    >
                      <option value="anthropic">Anthropic</option>
                      <option value="openai">OpenAI</option>
                      <option value="openrouter">Open Router</option>
                      <option value="cerebras">Cerebras</option>
                      <option value="together_ai">Together AI</option>
                    </select>
                    <p class="mt-0.5 text-[10px] text-on-surface-variant">
                      Your key must match the selected provider. Changing provider updates the default model.
                    </p>
                  </div>
                </Show>

                {/* Model name */}
                <div>
                  <label class="block text-xs font-medium text-on-surface-variant mb-1">Model</label>
                  <datalist id="llm-model-list">
                    <For each={PROVIDER_MODELS[llmProvider()] ?? []}>
                      {(m) => <option value={m} />}
                    </For>
                  </datalist>
                  <input
                    type="text"
                    list="llm-model-list"
                    value={llmModel()}
                    onInput={(e) => { setLlmModel(e.currentTarget.value); setLlmDirty(true); }}
                    placeholder={llmBackend() === "byok" ? providerDefaults[llmProvider()]?.model ?? "" : "llama3.2"}
                    class={`w-full rounded-lg border bg-white/10 px-3 py-2 font-mono text-xs text-on-surface placeholder-on-surface-variant outline-none focus:border-primary transition-colors ${
                      llmModel() !== savedLlmModel() ? "border-amber-400/60" : "border-white/20"
                    }`}
                  />
                  <div class="flex items-center gap-2">
                    <Show when={modelTier()}>
                      <span class="font-mono text-[10px] text-on-surface-variant/70">{modelTier()}</span>
                    </Show>
                    <p class="text-[10px] text-on-surface-variant">
                      {llmBackend() === "byok"
                        ? "Examples: claude-haiku-4-5-20251001, claude-sonnet-4-6, gpt-4o-mini"
                        : "Must match a model pulled in your Ollama instance (ollama pull llama3.2)"}
                    </p>
                  </div>
                </div>

                {/* BYOK: API key — not shown for RunPod */}
                <Show when={llmBackend() === "byok"}>
                  <div>
                    <label class="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant mb-1">
                      API Key
                      <Show when={keyFormatValid() === true}>
                        <span class="text-[0.75em] font-semibold text-green-600">✓ format ok</span>
                      </Show>
                      <Show when={keyFormatValid() === false}>
                        <button
                          type="button"
                          onClick={copyKeyPrefix}
                          title="Click to copy expected key prefix"
                          class="text-[0.75em] font-semibold text-amber-600 transition hover:text-amber-500"
                        >
                          {keyPrefixCopied() ? "✓ copied" : `⚠ expected ${keyPrefix()}… (click to copy)`}
                        </button>
                      </Show>
                    </label>
                    <input
                      type="password"
                      value={llmApiKey()}
                      onInput={(e) => { setLlmApiKey(e.currentTarget.value); setLlmDirty(true); }}
                      placeholder={providerDefaults[llmProvider()]?.keyPlaceholder ?? "API key…"}
                      class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-mono text-xs text-on-surface placeholder-on-surface-variant outline-none focus:border-primary"
                    />
                    <p class="mt-0.5 text-[10px] text-on-surface-variant">
                      Stored encrypted on your homeserver. Never transmitted in plaintext.
                      Leave blank to keep the existing key.
                    </p>
                  </div>
                </Show>

                {/* Ollama: URL */}
                <Show when={llmBackend() === "ollama"}>
                  <div>
                    <label class="block text-xs font-medium text-on-surface-variant mb-1">Ollama URL</label>
                    <input
                      type="text"
                      value={llmOllamaUrl()}
                      onInput={(e) => { setLlmOllamaUrl(e.currentTarget.value); setLlmDirty(true); }}
                      placeholder="http://localhost:11434"
                      class={`w-full rounded-lg border bg-white/10 px-3 py-2 font-mono text-xs text-on-surface placeholder-on-surface-variant outline-none focus:border-primary transition-colors ${
                        llmOllamaUrl() !== savedOllamaUrl() ? "border-amber-400/60" : "border-white/20"
                      }`}
                    />
                    <p class="mt-0.5 text-[10px] text-on-surface-variant">
                      Your homeserver must be able to reach this address.
                      For Docker: use host.docker.internal instead of localhost.
                    </p>
                  </div>
                </Show>

                {/* Save + Test buttons */}
                <div class="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={saveLlm}
                    disabled={llmSaving()}
                    class="rounded-lg bg-primary px-5 py-2 text-xs font-medium text-white disabled:opacity-40 transition hover:bg-primary/80"
                  >
                    {llmSaving() ? "Saving…" : "Save Model Settings"}
                  </button>
                  <Show when={llmDirty() && !llmSaving()}>
                    <span class="flex items-center gap-1.5 text-xs text-amber-600">
                      <span class="h-2 w-2 flex-shrink-0 rounded-full bg-amber-500" />
                      Unsaved changes
                    </span>
                  </Show>
                  <div class="flex flex-col items-start gap-0.5">
                    <button
                      type="button"
                      onClick={testLlmConnection}
                      disabled={llmPinging() || llmSaving()}
                      title={llmDirty() ? "Will save current values then test connection" : "Ping the saved LLM config"}
                      class="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-xs font-medium text-on-surface-variant disabled:opacity-40 transition hover:bg-white/20"
                    >
                      {llmPinging() ? "Testing…" : llmDirty() ? "Save & Test" : "Test connection"}
                    </button>
                    <Show when={lastPingAt() !== null && !llmPinging()}>
                      <span class="font-mono text-[10px] text-on-surface-variant/40">
                        {(() => {
                          const secs = Math.floor((Date.now() - lastPingAt()!) / 1000);
                          if (secs < 60) return "last tested just now";
                          if (secs < 3600) return `last tested ${Math.floor(secs / 60)}m ago`;
                          if (secs < 86400) return `last tested ${Math.floor(secs / 3600)}h ago`;
                          return `last tested ${Math.floor(secs / 86400)}d ago`;
                        })()}
                      </span>
                    </Show>
                    <Show when={latencyHistory().length >= 2}>
                      {(() => {
                        const hist = latencyHistory();
                        const max = Math.max(1, ...hist.map((s) => s.ms));
                        return (
                          <div class="flex items-end gap-[2px]" title="LLM ping latency history (ms)">
                            <For each={hist}>
                              {(snap) => (
                                <div
                                  class="w-[5px] rounded-sm bg-primary/50 transition-all"
                                  style={`height: ${Math.max(3, Math.round((snap.ms / max) * 18))}px`}
                                  title={`${snap.ms}ms`}
                                />
                              )}
                            </For>
                            <span class="ml-1 font-mono text-[9px] text-on-surface-variant/35">
                              {hist[hist.length - 1].ms}ms
                            </span>
                          </div>
                        );
                      })()}
                    </Show>
                  </div>
                  <Show when={llmSaved()}>
                    <span class="text-xs font-medium text-green-600">✓ Saved</span>
                    <Show when={props.onViewWorkflows}>
                      <button
                        type="button"
                        onClick={props.onViewWorkflows}
                        class="text-xs text-primary underline underline-offset-2 transition hover:text-primary/70"
                      >
                        View active runs →
                      </button>
                    </Show>
                  </Show>
                  <Show when={llmError()}>
                    <span class="text-xs text-red-500">{llmError()}</span>
                  </Show>
                  <Show when={llmPingResult()}>
                    <span class={`text-xs font-medium ${llmPingResult()!.ok ? "text-green-600" : "text-red-500"}`}>
                      {llmPingResult()!.ok
                        ? "✓ Connected"
                        : `✗ ${llmPingResult()!.reason ?? "Auth failed"}`}
                    </span>
                  </Show>
                </div>
              </div>
            </div>

            {/* Capabilities */}
            <div class="rounded-xl border border-white/20 bg-white/10 p-4">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-sm font-semibold text-on-surface">Capabilities</p>
                  <p class="mt-0.5 text-xs text-on-surface-variant">
                    Structured actions your agent can perform. New capabilities default to
                    suggest-only until you promote them.
                  </p>
                </div>
                <div class="flex flex-shrink-0 items-center gap-2">
                  <input
                    ref={capImportInputRef}
                    type="file"
                    accept=".json"
                    class="hidden"
                    onChange={handleImportFile}
                  />
                  <button
                    type="button"
                    onClick={() => capImportInputRef?.click()}
                    disabled={capImporting()}
                    title="Import capabilities from a JSON file"
                    class="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white/20 disabled:opacity-40"
                  >
                    {capImporting() ? "…" : "Import"}
                  </button>
                  <Show when={capabilities().length > 0}>
                    <button
                      type="button"
                      onClick={exportCapabilities}
                      title="Export capabilities as JSON"
                      class="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white/20"
                    >
                      Export
                    </button>
                  </Show>
                  <button
                    type="button"
                    onClick={() => setShowAddCapability(true)}
                    class="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition hover:bg-primary/80"
                  >
                    + Add
                  </button>
                </div>
              </div>
              {/* Capability templates */}
              <div class="mt-4">
                <p class="text-[10px] font-mono uppercase tracking-[0.18em] text-outline mb-2">Templates</p>
                <div class="space-y-1.5">
                  <For each={CAPABILITY_TEMPLATES}>
                    {(tpl) => {
                      const alreadyAdded = () => capabilities().some((c) => c.name === tpl.name);
                      return (
                        <div class="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                          <span class="text-base leading-none mt-0.5 flex-shrink-0">{tpl.icon}</span>
                          <div class="flex-1 min-w-0">
                            <p class="font-mono text-xs font-semibold text-on-surface">{tpl.name}</p>
                            <p class="mt-0.5 text-[11px] text-on-surface-variant">{tpl.description}</p>
                            <p class="mt-0.5 text-[10px] text-on-surface-variant opacity-60">{tpl.approval_mode}</p>
                          </div>
                          <button
                            type="button"
                            disabled={alreadyAdded() || capAdding() === tpl.id}
                            onClick={() => addFromTemplate(tpl)}
                            class="flex-shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium transition disabled:opacity-40
                              border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                          >
                            {alreadyAdded() ? "Added" : capAdding() === tpl.id ? "…" : "Add"}
                          </button>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>

              <Show when={capImportResult()}>
                <p class={`mt-2 text-xs ${capImportResult()?.startsWith("Import failed") ? "text-red-500" : "text-green-600 font-medium"}`}>
                  {capImportResult()}
                </p>
              </Show>
              <p class="mt-4 text-[10px] font-mono uppercase tracking-[0.18em] text-outline mb-2">Registered</p>
              <Show when={capabilities().length > 3}>
                <input
                  type="text"
                  value={capFilter()}
                  onInput={(e) => setCapFilter(e.currentTarget.value)}
                  placeholder="filter capabilities…"
                  class="mb-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-on-surface placeholder-on-surface-variant/40 outline-none focus:border-primary/40"
                />
              </Show>
              <Show
                when={capabilities().length > 0}
                fallback={
                  <p class="text-xs text-on-surface-variant">
                    No capabilities registered yet — add one from the templates above.
                  </p>
                }
              >
                <Show when={capabilities().every((c) => c.approval_mode === "suggest_only")}>
                  <p class="mb-2 rounded-lg border border-sky-200/40 bg-sky-50/50 px-3 py-2 text-[11px] text-sky-900/70">
                    All capabilities are in suggest-only mode — the agent will propose actions but never act
                    autonomously. Click a mode badge to promote a capability.
                  </p>
                </Show>
                <div class="space-y-2">
                  <For each={filteredCapabilities()}>
                    {(cap) => (
                      <div class={`flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 transition-all ${newCapId() === cap.id ? "ring-2 ring-green-400/50 animate-fade-in" : ""}`}>
                        <div class="min-w-0">
                          <p class="font-mono text-xs font-semibold text-on-surface truncate">{cap.name}</p>
                          <p class="mt-0.5 text-[11px] text-on-surface-variant truncate">{cap.description || "No description"}</p>
                          <div class="mt-0.5 flex items-center gap-[0.5em]">
                            <span class="text-[10px] text-on-surface-variant opacity-60">v{cap.version}</span>
                            <button
                              type="button"
                              title="Click to cycle approval mode"
                              disabled={capModePatching() === cap.id}
                              onClick={() => void cycleApprovalMode(cap)}
                              class={`rounded-full border px-[0.5em] py-[0.1em] font-mono text-[0.6em] transition hover:opacity-90 disabled:opacity-40 ${
                                cap.approval_mode === "autonomous"
                                  ? "border-green-500/30 bg-green-500/10 text-green-700"
                                  : cap.approval_mode === "human_approval_required"
                                    ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
                                    : "border-sky-500/30 bg-sky-500/10 text-sky-700"
                              }`}
                            >
                              {capModePatching() === cap.id ? "…" : cap.approval_mode.replace(/_/g, " ")}
                            </button>
                            <Show when={capModeSaved() === cap.id}>
                              <span class="animate-fade-in font-mono text-[0.6em] text-green-600">✓ saved</span>
                            </Show>
                          </div>
                          <Show when={cap.tags && cap.tags.length > 0}>
                            <div class="mt-0.5 flex flex-wrap gap-[0.25em]">
                              <For each={cap.tags}>
                                {(tag) => (
                                  <span class="rounded-full border border-white/15 bg-white/10 px-[0.5em] py-[0.1em] font-mono text-[0.55em] text-on-surface-variant/50">
                                    {tag}
                                  </span>
                                )}
                              </For>
                            </div>
                          </Show>
                          <Show when={capLastUsed()[cap.id] || capUsageCount()[cap.id]}>
                            <p class="mt-0.5 font-mono text-[0.55em] text-on-surface-variant/30">
                              {(() => {
                                const count = capUsageCount()[cap.id] ?? 0;
                                const lastTs = capLastUsed()[cap.id];
                                const countLabel = count > 0 ? `used ${count}×` : null;
                                const lastLabel = (() => {
                                  if (!lastTs) return null;
                                  const secs = Math.floor((Date.now() - lastTs) / 1000);
                                  if (secs < 60) return "just now";
                                  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
                                  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
                                  return `${Math.floor(secs / 86400)}d ago`;
                                })();
                                return [countLabel, lastLabel ? `last ${lastLabel}` : null].filter(Boolean).join(" · ");
                              })()}
                            </p>
                          </Show>
                          {(() => {
                            const dow = capDowUsage()[cap.id];
                            if (!dow || dow.every((n) => n === 0)) return null;
                            const maxCount = Math.max(1, ...dow);
                            const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
                            return (
                              <div class="mt-0.5 flex items-end gap-[2px]" title="Usage by day of week (Sun–Sat)">
                                <For each={dow}>
                                  {(count, i) => (
                                    <div class="flex flex-col items-center gap-[1px]">
                                      <div
                                        class="w-[5px] rounded-sm transition-all"
                                        style={`height: ${count > 0 ? Math.max(3, Math.round((count / maxCount) * 12)) : 2}px; background: ${count > 0 ? "rgba(49,86,142,0.4)" : "rgba(0,0,0,0.06)"}`}
                                        title={`${DOW_LABELS[i()]}: ${count}`}
                                      />
                                      <span class="font-mono text-[0.4em] text-on-surface-variant/20">{DOW_LABELS[i()]}</span>
                                    </div>
                                  )}
                                </For>
                              </div>
                            );
                          })()}
                          {(() => {
                            const lastTs = capLastUsed()[cap.id];
                            if (!lastTs) return null;
                            const staleDays = Math.floor((Date.now() - lastTs) / 86400000);
                            if (staleDays < 14) return null;
                            return (
                              <p class="mt-0.5 font-mono text-[0.52em] text-amber-500/50">
                                not used in {staleDays}d — may be redundant
                              </p>
                            );
                          })()}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteCapability(cap.id)}
                          disabled={capDeleting() === cap.id}
                          class="flex-shrink-0 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-400 transition hover:bg-red-500/20 disabled:opacity-40"
                        >
                          {capDeleting() === cap.id ? "…" : "Remove"}
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            {/* Agent Alias */}
            <AliasSettings />

            {/* Agent Execution Preferences */}
            <AgentPreferencesPanel />

            {/* Agent Personas */}
            <div class="glass-surface rounded-xl border border-white/40 p-6 shadow-panel">
              <AgentPersonasPanel />
            </div>

            {/* Profile Ledger */}
            <ProfileLedgerView />

            {/* Encryption */}
            <div class="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
              <p class="text-sm font-semibold text-on-surface">🔒 End-to-End Encryption</p>
              <p class="mt-1 text-xs leading-5 text-on-surface-variant">
                All AFP messages are encrypted using XChaCha20-Poly1305 before storage.
                Decryption happens only in this browser — plaintext is never re-stored or transmitted.
                Closing this tab discards all decrypted content from memory.
              </p>
            </div>
          </div>
        </Show>
      </div>

      {/* Re-run onboarding wizard */}
      <Show when={showWizard()}>
        <OnboardingWizard onComplete={() => {
          setShowWizard(false);
          // Refresh soul_md display
          apiFetch<{ master_instance?: AgentInstance }>("/agent/fleet")
            .then((f) => setInstance(f.master_instance ?? null))
            .catch(() => {});
        }} />
      </Show>

      {/* Add capability modal */}
      <Show when={showAddCapability()}>
        <AddCapabilityModal
          onClose={() => setShowAddCapability(false)}
          onCreated={refreshCapabilities}
        />
      </Show>

      {/* Soul.md editor modal */}
      <Show when={showSoulEditor()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/30 backdrop-blur-sm animate-fade-in">
          <div class="glass-surface mx-4 w-full max-w-2xl rounded-2xl border border-white/45 p-6 shadow-panel">
            <div class="mb-3 flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold text-on-surface">Edit Personality &amp; Rules</p>
                <p class="mt-0.5 text-[0.7em] text-on-surface-variant">Edits take effect on the next agent run.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowSoulEditor(false)}
                aria-label="Close editor"
                class="text-on-surface-variant/50 transition hover:text-on-surface"
              >×</button>
            </div>
            <textarea
              value={soulEditText()}
              onInput={(e) => setSoulEditText(e.currentTarget.value)}
              rows={16}
              class="w-full resize-y rounded-lg border border-white/20 bg-white/10 p-3 font-mono text-xs leading-5 text-on-surface outline-none focus:border-primary/40"
              style="min-height: 12em"
            />
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <Show when={soulSaveError()}>
                <span class="text-xs text-red-500">{soulSaveError()}</span>
              </Show>
              <div class="flex-1" />
              <button
                type="button"
                onClick={() => setShowSoulEditor(false)}
                class="rounded-lg border border-white/40 bg-white/30 px-4 py-2 text-xs font-medium text-on-surface transition hover:bg-white/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveSoulMd}
                disabled={soulSaving()}
                class="rounded-lg bg-primary px-5 py-2 text-xs font-medium text-white disabled:opacity-40 transition hover:bg-primary/80"
              >
                {soulSaving() ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
