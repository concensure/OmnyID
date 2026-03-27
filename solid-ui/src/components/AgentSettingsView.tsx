import { createSignal, For, onMount, Show } from "solid-js";
import { apiFetch, deleteCapability, fetchLlmConfig, listCapabilities, registerCapability, saveLlmConfig, type CapabilityDescriptor, type LlmConfig } from "@/lib/api";
import { AddCapabilityModal } from "./AddCapabilityModal";
import { OnboardingWizard } from "./OnboardingWizard";
import { AliasSettings } from "./AliasSettings";
import { AgentPreferencesPanel } from "./AgentPreferencesPanel";

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
}) {
  let llmSectionRef: HTMLDivElement | undefined;

  const [instance, setInstance] = createSignal<AgentInstance | null>(null);
  const [showWizard, setShowWizard] = createSignal(false);
  const [loading, setLoading] = createSignal(true);

  // LLM config state
  const [llmConfig, setLlmConfig] = createSignal<LlmConfig | null>(null);
  const [llmBackend, setLlmBackend] = createSignal<"byok" | "ollama" | "runpod">("byok");
  const [llmProvider, setLlmProvider] = createSignal<string>("anthropic");
  const [llmModel, setLlmModel] = createSignal("claude-haiku-4-5-20251001");
  const [llmApiKey, setLlmApiKey] = createSignal("");
  const [llmOllamaUrl, setLlmOllamaUrl] = createSignal("http://localhost:11434");

  const providerDefaults: Record<string, { model: string; keyPlaceholder: string }> = {
    anthropic:   { model: "claude-haiku-4-5-20251001", keyPlaceholder: "sk-ant-…" },
    openai:      { model: "gpt-4o-mini",               keyPlaceholder: "sk-…" },
    openrouter:  { model: "openai/gpt-4o-mini",        keyPlaceholder: "sk-or-…" },
    cerebras:    { model: "llama3.1-70b",              keyPlaceholder: "csk-…" },
    together_ai: { model: "meta-llama/Llama-3-8b-hf",  keyPlaceholder: "…together key…" },
  };
  const [llmSaving, setLlmSaving] = createSignal(false);
  const [llmSaved, setLlmSaved] = createSignal(false);
  const [llmError, setLlmError] = createSignal("");

  // Capability registry state
  const [capabilities, setCapabilities] = createSignal<CapabilityDescriptor[]>([]);
  const [showAddCapability, setShowAddCapability] = createSignal(false);
  const [capDeleting, setCapDeleting] = createSignal<string | null>(null);
  const [capAdding, setCapAdding] = createSignal<string | null>(null);

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
      }
      setLlmModel(cfg.model);
      if (cfg.ollama_url) setLlmOllamaUrl(cfg.ollama_url);
    } catch { /* not configured yet */ }
    setLoading(false);
  });

  async function saveLlm() {
    setLlmSaving(true);
    setLlmError("");
    try {
      await saveLlmConfig({
        backend: llmBackend(),
        model: llmModel() || undefined,
        api_key: llmBackend() === "byok" ? llmApiKey() || undefined : undefined,
        ollama_url: llmBackend() === "ollama" ? llmOllamaUrl() || undefined : undefined,
      });
      setLlmSaved(true);
      setTimeout(() => setLlmSaved(false), 3000);
      // Refresh config display
      const cfg = await fetchLlmConfig();
      setLlmConfig(cfg);
    } catch (e: unknown) {
      setLlmError(e instanceof Error ? e.message : "Save failed");
    }
    setLlmSaving(false);
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
                <button
                  type="button"
                  onClick={() => setShowWizard(true)}
                  class="flex-shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition hover:bg-primary/80"
                >
                  Reconfigure
                </button>
              </div>

              <Show when={instance()?.soul_md}>
                <pre class="mt-3 max-h-48 overflow-auto rounded-lg bg-black/10 p-3 font-mono text-[11px] leading-5 text-on-surface-variant whitespace-pre-wrap">
                  {instance()!.soul_md}
                </pre>
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
                <div>
                  <label class="block text-xs font-medium text-on-surface-variant mb-1">Backend</label>
                  <div class="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => { setLlmBackend("byok"); setLlmModel("claude-haiku-4-5-20251001"); }}
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
                      onClick={() => { setLlmBackend("ollama"); setLlmModel("llama3.2"); }}
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
                      onClick={() => { setLlmBackend("runpod"); setLlmModel("Qwen/Qwen3.5-35B-A3B"); }}
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
                </div>

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
                  <input
                    type="text"
                    value={llmModel()}
                    onInput={(e) => setLlmModel(e.currentTarget.value)}
                    placeholder={llmBackend() === "byok" ? providerDefaults[llmProvider()]?.model ?? "" : "llama3.2"}
                    class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-mono text-xs text-on-surface placeholder-on-surface-variant outline-none focus:border-primary"
                  />
                  <p class="mt-0.5 text-[10px] text-on-surface-variant">
                    {llmBackend() === "byok"
                      ? "Examples: claude-haiku-4-5-20251001, claude-sonnet-4-6, gpt-4o-mini"
                      : "Must match a model pulled in your Ollama instance (ollama pull llama3.2)"}
                  </p>
                </div>

                {/* BYOK: API key — not shown for RunPod */}
                <Show when={llmBackend() === "byok"}>
                  <div>
                    <label class="block text-xs font-medium text-on-surface-variant mb-1">API Key</label>
                    <input
                      type="password"
                      value={llmApiKey()}
                      onInput={(e) => setLlmApiKey(e.currentTarget.value)}
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
                      onInput={(e) => setLlmOllamaUrl(e.currentTarget.value)}
                      placeholder="http://localhost:11434"
                      class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-mono text-xs text-on-surface placeholder-on-surface-variant outline-none focus:border-primary"
                    />
                    <p class="mt-0.5 text-[10px] text-on-surface-variant">
                      Your homeserver must be able to reach this address.
                      For Docker: use host.docker.internal instead of localhost.
                    </p>
                  </div>
                </Show>

                {/* Save button */}
                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={saveLlm}
                    disabled={llmSaving()}
                    class="rounded-lg bg-primary px-5 py-2 text-xs font-medium text-white disabled:opacity-40 transition hover:bg-primary/80"
                  >
                    {llmSaving() ? "Saving…" : "Save Model Settings"}
                  </button>
                  <Show when={llmSaved()}>
                    <span class="text-xs font-medium text-green-600">✓ Saved</span>
                  </Show>
                  <Show when={llmError()}>
                    <span class="text-xs text-red-500">{llmError()}</span>
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
                <button
                  type="button"
                  onClick={() => setShowAddCapability(true)}
                  class="flex-shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition hover:bg-primary/80"
                >
                  + Add Capability
                </button>
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

              <p class="mt-4 text-[10px] font-mono uppercase tracking-[0.18em] text-outline mb-2">Registered</p>
              <Show
                when={capabilities().length > 0}
                fallback={<p class="text-xs text-on-surface-variant">No capabilities registered yet.</p>}
              >
                <div class="space-y-2">
                  <For each={capabilities()}>
                    {(cap) => (
                      <div class="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                        <div class="min-w-0">
                          <p class="font-mono text-xs font-semibold text-on-surface truncate">{cap.name}</p>
                          <p class="mt-0.5 text-[11px] text-on-surface-variant truncate">{cap.description || "No description"}</p>
                          <p class="mt-0.5 text-[10px] text-on-surface-variant opacity-60">
                            v{cap.version} · {cap.approval_mode}
                          </p>
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
    </div>
  );
}
