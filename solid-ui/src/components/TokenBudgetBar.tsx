// @locs-version: 1.0
import { createSignal, For, onMount, Show } from "solid-js";
import type { TokenBudgetStatus, UserLlmProvider } from "@/lib/api";
import {
  deleteLlmProvider,
  getTokenBudget,
  listLlmProviders,
  updateTokenBudget,
  upsertLlmProvider,
} from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import {
  buildTokenBudgetFailureReceipt,
  type TokenBudgetFailureReceipt,
} from "@/lib/tokenBudgetFailureState";

function statusColor(s: TokenBudgetStatus["status"]) {
  if (s === "exceeded") return "text-red-600";
  if (s === "warning") return "text-amber-600";
  return "text-emerald-600";
}

function statusDot(s: TokenBudgetStatus["status"]) {
  if (s === "exceeded") return "bg-red-500";
  if (s === "warning") return "bg-amber-400";
  return "bg-emerald-500";
}

function tierIcon(provider: string) {
  const map: Record<string, string> = {
    openai: "OA",
    anthropic: "AN",
    grok: "GX",
    ollama: "OL",
    openai_compat: "OC",
  };
  return map[provider] ?? "LL";
}

export function TokenBudgetBar() {
  const [budget, setBudget] = createSignal<TokenBudgetStatus | null>(null);
  const [providers, setProviders] = createSignal<UserLlmProvider[]>([]);
  const [expanded, setExpanded] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [addOpen, setAddOpen] = createSignal(false);
  const [loadError, setLoadError] = createSignal<TokenBudgetFailureReceipt | null>(null);
  const [actionError, setActionError] = createSignal<TokenBudgetFailureReceipt | null>(null);

  const [newProvider, setNewProvider] = createSignal("anthropic");
  const [newDisplayName, setNewDisplayName] = createSignal("");
  const [newApiKey, setNewApiKey] = createSignal("");
  const [newBaseUrl, setNewBaseUrl] = createSignal("");
  const [newModelId, setNewModelId] = createSignal("");
  const [newConsent, setNewConsent] = createSignal(false);

  async function loadBudgetBar() {
    setLoadError(null);
    const [b, p] = await Promise.allSettled([getTokenBudget(), listLlmProviders()]);
    if (b.status === "fulfilled") {
      setBudget(b.value as TokenBudgetStatus);
    }
    if (p.status === "fulfilled") {
      setProviders((p.value as { providers: UserLlmProvider[] }).providers ?? []);
    }

    const failures: string[] = [];
    if (b.status === "rejected") failures.push("budget status");
    if (p.status === "rejected") failures.push("provider list");
    if (failures.length > 0) {
      setLoadError(
        buildTokenBudgetFailureReceipt(
          "Load token budget",
          `Could not load ${failures.join(" and ")}.`,
        ),
      );
    }
  }

  onMount(() => {
    void loadBudgetBar();
  });

  async function refreshProviders() {
    const fresh = await listLlmProviders();
    setProviders((fresh as { providers: UserLlmProvider[] }).providers ?? []);
  }

  async function toggleEscalation() {
    const cur = budget();
    if (!cur) return;
    setSaving(true);
    setActionError(null);
    try {
      await updateTokenBudget({ escalation_enabled: !cur.escalation_enabled });
      const fresh = await getTokenBudget();
      setBudget(fresh as TokenBudgetStatus);
    } catch (error: unknown) {
      setActionError(
        buildTokenBudgetFailureReceipt(
          "Save escalation setting",
          error instanceof Error ? error.message : "Could not save LLM escalation setting.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeProvider(id: string) {
    setActionError(null);
    try {
      await deleteLlmProvider(id);
      await refreshProviders();
    } catch (error: unknown) {
      setActionError(
        buildTokenBudgetFailureReceipt(
          "Remove provider",
          error instanceof Error ? error.message : "Could not remove LLM provider.",
        ),
      );
    }
  }

  async function submitProvider(e: Event) {
    e.preventDefault();
    if (!newConsent()) return;
    setActionError(null);
    try {
      await upsertLlmProvider({
        provider: newProvider(),
        display_name: newDisplayName(),
        api_key: newApiKey() || undefined,
        base_url: newBaseUrl() || undefined,
        model_id: newModelId(),
        consent: true,
      });
      await refreshProviders();
      setAddOpen(false);
      setNewApiKey("");
      setNewBaseUrl("");
      setNewDisplayName("");
      setNewModelId("");
      setNewConsent(false);
    } catch (error: unknown) {
      setActionError(
        buildTokenBudgetFailureReceipt(
          "Save provider",
          error instanceof Error ? error.message : "Could not save LLM provider.",
        ),
      );
    }
  }

  return (
    <Show
      when={budget()}
      fallback={
        <Show when={loadError()}>
          {(receipt) => (
            <EmptyState
              class="rounded-xl"
              icon="TB"
              title={receipt().title}
              body={`${receipt().summary} Next step: ${receipt().nextStep}`}
              action={
                <button
                  type="button"
                  class="rounded-full border border-white/25 bg-white/70 px-3 py-1 text-xs font-medium text-on-surface transition hover:bg-white"
                  onClick={() => void loadBudgetBar()}
                >
                  Retry budget
                </button>
              }
            />
          )}
        </Show>
      }
    >
      {(b) => (
        <div class="glass-surface overflow-hidden rounded-xl border border-white/35 shadow-panel">
          <button
            type="button"
            class="flex w-full items-center gap-[0.75em] px-[1em] py-[0.625em] text-left transition hover:bg-white/10"
            onClick={() => setExpanded((v) => !v)}
          >
            <span class={`h-[0.5em] w-[0.5em] shrink-0 rounded-full ${statusDot(b().status)}`} />
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-semibold text-on-surface">Token Budget</p>
              <p class="mt-[0.1em] truncate text-[0.65rem] text-on-surface-variant">
                <span class={statusColor(b().status)}>{b().daily_used_tokens.toLocaleString()}</span>
                {" / "}
                {b().daily_limit_tokens.toLocaleString()} tokens today
                {" | "}
                {b().usage_pct.toFixed(1)}%
              </p>
            </div>

            <Show when={providers().length > 0}>
              <span class="shrink-0 rounded-full border border-white/20 px-[0.5em] py-[0.15em] text-[0.65rem] text-on-surface-variant">
                {tierIcon(providers()[0].provider)} {providers()[0].provider}
              </span>
            </Show>
            <Show when={providers().length === 0}>
              <span class="shrink-0 rounded-full border border-amber-400/40 px-[0.5em] py-[0.15em] text-[0.65rem] text-amber-600">
                no key
              </span>
            </Show>

            <span class="shrink-0 text-xs text-on-surface-variant">{expanded() ? "^" : "v"}</span>
          </button>

          <div class="h-[3px] bg-white/10">
            <div
              class={`h-full transition-all duration-500 ${
                b().status === "exceeded"
                  ? "bg-red-500"
                  : b().status === "warning"
                    ? "bg-amber-400"
                    : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(b().usage_pct, 100)}%` }}
            />
          </div>

          <Show when={expanded()}>
            <div class="space-y-[0.875em] border-t border-white/15 px-[1em] py-[0.875em]">
              <Show when={loadError()}>
                {(receipt) => (
                  <div
                    class={`rounded-xl border px-3 py-2 text-[0.65rem] leading-5 ${
                      receipt().tone === "danger"
                        ? "border-red-300/40 bg-red-50/70 text-red-700"
                        : "border-amber-300/40 bg-amber-50/60 text-amber-700"
                    }`}
                  >
                    <p class="font-semibold">{receipt().title}</p>
                    <p>{receipt().summary}</p>
                    <p class="opacity-80">Next step: {receipt().nextStep}</p>
                    <button
                      type="button"
                      class="font-medium underline underline-offset-2"
                      onClick={() => void loadBudgetBar()}
                    >
                      Retry load
                    </button>
                  </div>
                )}
              </Show>

              <Show when={actionError()}>
                {(receipt) => (
                  <div
                    class={`rounded-xl border px-3 py-2 text-[0.65rem] leading-5 ${
                      receipt().tone === "danger"
                        ? "border-red-300/40 bg-red-50/70 text-red-700"
                        : "border-amber-300/40 bg-amber-50/60 text-amber-700"
                    }`}
                  >
                    <p class="font-semibold">{receipt().title}</p>
                    <p>{receipt().summary}</p>
                    <p class="opacity-80">Next step: {receipt().nextStep}</p>
                  </div>
                )}
              </Show>

              <div class="flex items-center justify-between gap-[1em]">
                <div>
                  <p class="text-[0.7rem] font-medium text-on-surface">LLM escalation</p>
                  <p class="text-[0.62rem] leading-snug text-on-surface-variant">
                    Allow proactive agents to call an LLM when heuristics are inconclusive
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving()}
                  onClick={() => void toggleEscalation()}
                  class={`shrink-0 rounded-full border px-[0.75em] py-[0.25em] text-[0.65rem] font-medium transition disabled:opacity-50 ${
                    b().escalation_enabled
                      ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-600"
                      : "border-white/20 bg-white/10 text-on-surface-variant"
                  }`}
                >
                  {saving() ? "..." : b().escalation_enabled ? "On" : "Off"}
                </button>
              </div>

              <div>
                <p class="mb-[0.4em] font-mono text-[0.55rem] uppercase tracking-[0.2em] text-outline">
                  LLM Providers
                </p>
                <Show when={providers().length === 0}>
                  <p class="text-[0.68rem] text-on-surface-variant opacity-70">
                    No providers configured. Add your API key to enable privacy-first LLM escalation.
                  </p>
                </Show>
                <div class="space-y-[0.3em]">
                  <For each={providers()}>
                    {(p) => (
                      <div class="flex items-center gap-[0.5em] rounded-lg border border-white/15 bg-white/5 px-[0.6em] py-[0.35em]">
                        <span class="shrink-0 text-[0.65rem] font-semibold text-on-surface-variant">{tierIcon(p.provider)}</span>
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-[0.7rem] font-medium text-on-surface">{p.display_name}</p>
                          <p class="truncate text-[0.62rem] text-on-surface-variant">
                            {p.model_id} | priority {p.priority}
                            {p.has_api_key ? " | key stored" : " | no key"}
                          </p>
                        </div>
                        <Show when={p.consent_given}>
                          <span class="shrink-0 text-[0.58rem] text-emerald-600 opacity-80">consent</span>
                        </Show>
                        <button
                          type="button"
                          class="shrink-0 text-[0.65rem] text-on-surface-variant transition hover:text-red-500"
                          onClick={() => void removeProvider(p.id)}
                          title="Remove provider"
                        >
                          x
                        </button>
                      </div>
                    )}
                  </For>
                </div>

                <Show when={!addOpen()}>
                  <button
                    type="button"
                    class="mt-[0.5em] rounded-lg border border-white/20 px-[0.6em] py-[0.3em] text-[0.65rem] text-on-surface-variant transition hover:bg-white/10"
                    onClick={() => setAddOpen(true)}
                  >
                    + Add provider
                  </button>
                </Show>

                <Show when={addOpen()}>
                  <form
                    onSubmit={(e) => void submitProvider(e)}
                    class="mt-[0.5em] space-y-[0.4em] rounded-lg border border-white/20 bg-white/5 px-[0.7em] py-[0.6em]"
                  >
                    <p class="mb-[0.2em] text-[0.65rem] font-semibold text-on-surface">Add LLM Provider</p>

                    <select
                      class="w-full rounded-md border border-white/20 bg-surface px-[0.5em] py-[0.3em] text-[0.68rem] text-on-surface"
                      value={newProvider()}
                      onChange={(e) => setNewProvider(e.currentTarget.value)}
                    >
                      <option value="anthropic">Anthropic</option>
                      <option value="openai">OpenAI</option>
                      <option value="grok">Grok (xAI)</option>
                      <option value="ollama">Ollama (self-hosted)</option>
                      <option value="openai_compat">OpenAI-compatible</option>
                    </select>

                    <input
                      type="text"
                      placeholder="Display name"
                      class="w-full rounded-md border border-white/20 bg-surface px-[0.5em] py-[0.3em] text-[0.68rem] text-on-surface"
                      value={newDisplayName()}
                      onInput={(e) => setNewDisplayName(e.currentTarget.value)}
                      required
                    />

                    <input
                      type="text"
                      placeholder="Model ID (e.g. claude-haiku-4-5-20251001)"
                      class="w-full rounded-md border border-white/20 bg-surface px-[0.5em] py-[0.3em] text-[0.68rem] text-on-surface"
                      value={newModelId()}
                      onInput={(e) => setNewModelId(e.currentTarget.value)}
                      required
                    />

                    <Show when={newProvider() !== "ollama"}>
                      <input
                        type="password"
                        placeholder="API key (stored encrypted)"
                        class="w-full rounded-md border border-white/20 bg-surface px-[0.5em] py-[0.3em] text-[0.68rem] text-on-surface"
                        value={newApiKey()}
                        onInput={(e) => setNewApiKey(e.currentTarget.value)}
                      />
                    </Show>

                    <Show when={newProvider() === "ollama" || newProvider() === "openai_compat"}>
                      <input
                        type="url"
                        placeholder="Base URL (e.g. http://localhost:11434)"
                        class="w-full rounded-md border border-white/20 bg-surface px-[0.5em] py-[0.3em] text-[0.68rem] text-on-surface"
                        value={newBaseUrl()}
                        onInput={(e) => setNewBaseUrl(e.currentTarget.value)}
                      />
                    </Show>

                    <label class="flex cursor-pointer items-start gap-[0.4em] text-[0.63rem] text-on-surface-variant">
                      <input
                        type="checkbox"
                        class="mt-[0.15em]"
                        checked={newConsent()}
                        onChange={(e) => setNewConsent(e.currentTarget.checked)}
                      />
                      <span>
                        I consent to summarised, anonymised context being sent to this
                        provider when proactive agents escalate to LLM reasoning. Raw
                        personal data is never transmitted.
                      </span>
                    </label>

                    <div class="flex gap-[0.4em] pt-[0.2em]">
                      <button
                        type="submit"
                        disabled={!newConsent()}
                        class="rounded-lg border border-white/25 bg-white/10 px-[0.7em] py-[0.25em] text-[0.65rem] font-medium text-on-surface transition hover:bg-white/20 disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        class="rounded-lg border border-white/15 px-[0.7em] py-[0.25em] text-[0.65rem] text-on-surface-variant transition hover:bg-white/10"
                        onClick={() => setAddOpen(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </Show>
              </div>

              <p class="text-[0.6rem] leading-relaxed text-on-surface-variant opacity-60">
                Only anonymised summaries are sent to external LLMs. Your API key is
                always preferred, and cloud fallback requires explicit consent above.
              </p>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}
