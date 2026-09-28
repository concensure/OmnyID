import { createSignal, For, onMount, Show } from "solid-js";
import { getAgentPreferences, readSession, setAgentPreferences, type AgentPreferences } from "@/lib/api";
import { toast } from "@/components/Toast";
import { InfoHint } from "@/components/InfoHint";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import {
  loadVimNavigationEnabled,
  saveVimNavigationEnabled,
} from "@/lib/vimNavigationPreference";
import {
  loadEditorDatetimePreference,
  saveEditorDatetimePreference,
  type EditorDatetimeFormat,
} from "@/lib/editorDatetimePreference";
import {
  defaultResponseQueuePolicy,
  loadResponseQueuePolicy,
  saveResponseQueuePolicy,
} from "@/lib/responseQueuePolicy";
import {
  getSelfProfile,
  updateSelfProfile,
  addVeto,
  removeVeto,
  getActiveVetos,
  type BehaviorVeto,
  type VetoScope,
} from "@/lib/profileLedger";
import {
  buildAgentPreferencesFailureReceipt,
  type AgentPreferencesFailureReceipt,
} from "@/lib/agentPreferencesFailureState";
import { recordShortcutUse } from "@/lib/shortcutRecency";

/**
 * AgentPreferencesPanel — settings for agent execution optimization.
 * Embedded in AgentSettingsView.
 */
export function AgentPreferencesPanel() {
  const sessionUserId = readSession()?.user?.id ?? null;
  const [prefs, setPrefs] = createSignal<AgentPreferences>({
    optimization_mode: "balanced",
    auto_confirm_threshold_cents: 5.0,
    show_cost_estimates: true,
    default_store_in_history: true,
    response_queue_policy: defaultResponseQueuePolicy(),
  });
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [prefsLoadError, setPrefsLoadError] = createSignal<AgentPreferencesFailureReceipt | null>(null);
  const [vimNavigationEnabled, setVimNavigationEnabled] = createSignal(loadVimNavigationEnabled());
  const [editorDatetimePreference, setEditorDatetimePreference] = createSignal(loadEditorDatetimePreference());

  onMount(async () => {
    try {
      const p = await getAgentPreferences();
      setPrefsLoadError(null);
      setPrefs({
        ...p,
        default_store_in_history: p.default_store_in_history ?? true,
        response_queue_policy: p.response_queue_policy ?? loadResponseQueuePolicy(sessionUserId),
      });
    } catch (err) {
      setPrefsLoadError(
        buildAgentPreferencesFailureReceipt(
          "Preference load",
          err instanceof Error ? err.message : "Could not load saved execution preferences.",
        ),
      );
      setPrefs((current) => ({
        ...current,
        response_queue_policy: loadResponseQueuePolicy(sessionUserId),
      }));
    }
    setLoading(false);
  });

  async function handleSave() {
    setSaving(true);
    try {
      if (prefs().response_queue_policy) {
        saveResponseQueuePolicy(prefs().response_queue_policy!, sessionUserId);
      }
      await setAgentPreferences(prefs());
      toast.success("Preferences saved");
    } catch (err) {
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  }

  function resetExecutionPreferences() {
    setPrefs((current) => ({
      ...current,
      optimization_mode: "balanced",
      auto_confirm_threshold_cents: 5.0,
      show_cost_estimates: true,
      default_store_in_history: true,
    }));
  }

  function resetResponseQueuePreferences() {
    setPrefs((current) => ({
      ...current,
      response_queue_policy: defaultResponseQueuePolicy(),
    }));
  }

  // ─── About Me state ──────────────────────────────────────────────────────────
  const [showAboutMe, setShowAboutMe] = createSignal(false);
  const [meDoc, setMeDoc] = createSignal("");
  const [interests, setInterests] = createSignal("");
  const [vetos, setVetos] = createSignal<BehaviorVeto[]>([]);
  const [vetoDesc, setVetoDesc] = createSignal("");
  const [vetoScope, setVetoScope] = createSignal<VetoScope>("suggestions");
  const [profileSaving, setProfileSaving] = createSignal(false);
  const [profileLoadError, setProfileLoadError] = createSignal<AgentPreferencesFailureReceipt | null>(null);
  const [profileActionError, setProfileActionError] = createSignal<AgentPreferencesFailureReceipt | null>(null);

  async function loadAboutMe() {
    setProfileLoadError(null);
    setProfileActionError(null);
    try {
      const profile = await getSelfProfile();
      setMeDoc(profile.me_document ?? "");
      setInterests((profile.interests ?? []).join(", "));
      setVetos(await getActiveVetos());
    } catch (err) {
      setProfileLoadError(
        buildAgentPreferencesFailureReceipt(
          "Profile load",
          err instanceof Error ? err.message : "Could not load profile.",
        ),
      );
      toast.error("Could not load profile");
    }
  }

  async function saveAboutMe() {
    if (profileSaving()) return;
    setProfileSaving(true);
    setProfileActionError(null);
    try {
      const interestList = interests().split(",").map((s) => s.trim()).filter(Boolean);
      await updateSelfProfile({ me_document: meDoc(), interests: interestList });
      toast.success("Profile saved");
    } catch (err) {
      setProfileActionError(
        buildAgentPreferencesFailureReceipt(
          "Profile save",
          err instanceof Error ? err.message : "Failed to save profile.",
        ),
      );
      toast.error("Failed to save profile");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleAddVeto() {
    if (profileSaving()) return;
    const desc = vetoDesc().trim();
    if (!desc) return;
    setProfileActionError(null);
    try {
      await addVeto({ scope: vetoScope(), description: desc });
      setVetos(await getActiveVetos());
      setVetoDesc("");
    } catch (err) {
      setProfileActionError(
        buildAgentPreferencesFailureReceipt(
          "Profile rule add",
          err instanceof Error ? err.message : "Failed to add prohibition.",
        ),
      );
      toast.error("Failed to add veto");
      console.error("handleAddVeto failed:", err);
    }
  }

  async function handleRemoveVeto(id: string) {
    if (profileSaving()) return;
    setProfileActionError(null);
    try {
      await removeVeto(id);
      setVetos(await getActiveVetos());
    } catch (err) {
      setProfileActionError(
        buildAgentPreferencesFailureReceipt(
          "Profile rule remove",
          err instanceof Error ? err.message : "Failed to remove prohibition.",
        ),
      );
      toast.error("Failed to remove veto");
      console.error("handleRemoveVeto failed:", err);
    }
  }

  return (
    <div class="rounded-xl border border-white/20 bg-white/10 p-4 space-y-4">
      <div>
        <p class="text-sm font-semibold text-on-surface">Agent Execution Preferences</p>
        <p class="mt-0.5 text-xs text-on-surface-variant">
          Control how the agent balances speed, cost, and autonomy.
        </p>
      </div>

      <Show when={prefsLoadError()}>
        <div
          classList={{
            "rounded-xl border px-3 py-2 text-xs": true,
            "border-red-400/20 bg-red-500/10 text-red-200": prefsLoadError()?.tone === "danger",
            "border-amber-400/20 bg-amber-500/10 text-amber-200": prefsLoadError()?.tone !== "danger",
          }}
        >
          <p class="font-semibold">{prefsLoadError()?.title}</p>
          <p class="mt-1">
            {prefsLoadError()?.summary} Using fallback execution preferences for now.
          </p>
          <p class="mt-1 opacity-80">{prefsLoadError()?.nextStep}</p>
        </div>
      </Show>

      <div class="space-y-3 text-sm">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium text-on-surface-variant">Execution defaults</p>
          <button
            type="button"
            onClick={resetExecutionPreferences}
            disabled={loading()}
            class="rounded-lg border border-white/20 px-2.5 py-1 text-[11px] text-on-surface-variant transition hover:bg-white/10 disabled:opacity-40"
          >
            Reset section
          </button>
        </div>

        {/* Optimization mode */}
        <div class="space-y-1">
          <label class="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
            Optimization Mode
            <InfoHint text="Controls the default tradeoff your agent makes between speed, quality, and token spend when it has multiple viable execution paths." />
          </label>
          <div class="flex gap-2">
            {(["speed", "balanced", "cost"] as const).map((mode) => (
              <button
                type="button"
                onClick={() => setPrefs(p => ({ ...p, optimization_mode: mode }))}
                disabled={loading()}
                class={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  prefs().optimization_mode === mode
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-white/20 bg-white/5 text-on-surface-variant hover:bg-white/10"
                }`}
              >
                {mode === "speed" ? "Fast" : mode === "cost" ? "Cheap" : "Balanced"}
              </button>
            ))}
          </div>
          <p class="text-[11px] text-on-surface-variant/60">
            {prefs().optimization_mode === "speed" && "Prioritise execution speed. May use more tokens."}
            {prefs().optimization_mode === "cost" && "Minimise token/API cost. May take longer."}
            {prefs().optimization_mode === "balanced" && "Weigh cost and speed together. Recommended."}
          </p>
        </div>

        {/* Auto-confirm threshold */}
        <div class="space-y-1">
          <label class="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
            Auto-confirm below ${(prefs().auto_confirm_threshold_cents / 100).toFixed(2)}
            <InfoHint text="Tasks estimated below this cost can be auto-approved without interrupting you for a separate confirmation step." />
          </label>
          <div class="rounded-2xl border border-white/25 bg-[linear-gradient(135deg,rgba(255,255,255,0.2),rgba(255,255,255,0.08))] px-3 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={prefs().auto_confirm_threshold_cents}
              onInput={(e) => setPrefs(p => ({
                ...p,
                auto_confirm_threshold_cents: Number(e.currentTarget.value),
              }))}
              disabled={loading()}
              class="w-full accent-primary"
            />
          </div>
          <div class="flex justify-between text-[10px] text-on-surface-variant/50 font-mono">
            <span>$0.00 (always confirm)</span>
            <span>$0.50 (auto-approve most)</span>
          </div>
        </div>

        {/* Show cost estimates */}
        <div class="flex items-center justify-between">
          <div>
            <p class="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
              Show cost estimates
              <InfoHint text="Shows approximate token cost and execution effort before the agent runs a task, so you can catch expensive steps early." />
            </p>
            <p class="text-[11px] text-on-surface-variant/60">
              Display token cost and time before each task execution.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs().show_cost_estimates}
            onClick={() => setPrefs(p => ({ ...p, show_cost_estimates: !p.show_cost_estimates }))}
            disabled={loading()}
            class={`relative inline-flex h-5 w-9 cursor-pointer rounded-full transition-colors ${
              prefs().show_cost_estimates ? "bg-primary" : "bg-white/20"
            }`}
          >
            <span class={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform m-0.5 ${
              prefs().show_cost_estimates ? "translate-x-4" : "translate-x-0"
            }`} />
          </button>
        </div>

        <div class="flex items-center justify-between">
          <div>
            <p class="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
              Vim-style j/k navigation
              <InfoHint text="When enabled, j and k move focus through Threads and Decision Queue cards while those list surfaces are focused. This preference is stored locally on this device." />
            </p>
            <p class="text-[11px] text-on-surface-variant/60">
              Local keyboard-first list navigation for focused queue and thread surfaces.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={vimNavigationEnabled()}
            onClick={() => {
              const next = !vimNavigationEnabled();
              setVimNavigationEnabled(next);
              saveVimNavigationEnabled(next);
            }}
            class={`relative inline-flex h-5 w-9 cursor-pointer rounded-full transition-colors ${
              vimNavigationEnabled() ? "bg-primary" : "bg-white/20"
            }`}
          >
            <span class={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform m-0.5 ${
              vimNavigationEnabled() ? "translate-x-4" : "translate-x-0"
            }`} />
          </button>
        </div>

        <div class="rounded-xl border border-white/15 bg-white/5 p-3 space-y-2">
          <div>
            <p class="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
              Editor datetime insert format
              <InfoHint text="Controls what Ctrl+Shift+K inserts into the shared rich-text editor when you want to timestamp a note, journal entry, or decision log. This preference is stored locally on this device." />
            </p>
            <p class="text-[11px] text-on-surface-variant/60">
              Used by the shared Tiptap editor when inserting the current datetime at the cursor.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <select
              value={editorDatetimePreference().format}
              onChange={(e) => {
                const next = {
                  ...editorDatetimePreference(),
                  format: e.currentTarget.value as EditorDatetimeFormat,
                };
                setEditorDatetimePreference(next);
                saveEditorDatetimePreference(next);
              }}
              class="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs text-on-surface"
            >
              <option value="locale">Locale</option>
              <option value="iso">ISO</option>
              <option value="custom">Custom</option>
            </select>
            <Show when={editorDatetimePreference().format === "custom"}>
              <input
                type="text"
                value={editorDatetimePreference().customPattern}
                onInput={(e) => {
                  const next = {
                    ...editorDatetimePreference(),
                    customPattern: e.currentTarget.value,
                  };
                  setEditorDatetimePreference(next);
                  saveEditorDatetimePreference(next);
                }}
                placeholder="YYYY-MM-DD HH:mm"
                class="min-w-[12rem] flex-1 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/50"
              />
            </Show>
          </div>
          <p class="font-mono text-[10px] text-on-surface-variant/55">
            Tokens: YYYY MM DD HH mm ss
          </p>
        </div>

        <div class="rounded-xl border border-white/15 bg-white/5 p-3 space-y-3">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-medium text-on-surface-variant">Response Queue Policy</p>
              <p class="text-[11px] text-on-surface-variant/60">
                Controls how conversational replies are ranked on the homepage. Stored locally for now.
              </p>
            </div>
            <button
              type="button"
              onClick={resetResponseQueuePreferences}
              disabled={loading()}
              class="shrink-0 rounded-lg border border-white/20 px-2.5 py-1 text-[11px] text-on-surface-variant transition hover:bg-white/10 disabled:opacity-40"
            >
              Reset section
            </button>
          </div>

          <div class="grid gap-3 sm:grid-cols-3">
            <label class="space-y-1">
              <span class="flex items-center gap-1.5 text-[11px] text-on-surface-variant/70">
                Supplier due hours
                <InfoHint text="How long supplier or vendor conversations can wait before they are treated as due in the Response Queue." />
              </span>
              <input
                type="number"
                min={1}
                max={336}
                value={prefs().response_queue_policy?.supplier_due_hours ?? 24}
                onInput={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    response_queue_policy: {
                      ...(p.response_queue_policy ?? defaultResponseQueuePolicy()),
                      supplier_due_hours: Number(e.currentTarget.value) || 24,
                    },
                  }))
                }
                class="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-on-surface outline-none transition focus:border-primary/50"
              />
            </label>
            <label class="space-y-1">
              <span class="flex items-center gap-1.5 text-[11px] text-on-surface-variant/70">
                Friend due hours
                <InfoHint text="How long personal conversations with friends can sit before they rise in priority." />
              </span>
              <input
                type="number"
                min={1}
                max={336}
                value={prefs().response_queue_policy?.friend_due_hours ?? 48}
                onInput={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    response_queue_policy: {
                      ...(p.response_queue_policy ?? defaultResponseQueuePolicy()),
                      friend_due_hours: Number(e.currentTarget.value) || 48,
                    },
                  }))
                }
                class="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-on-surface outline-none transition focus:border-primary/50"
              />
            </label>
            <label class="space-y-1">
              <span class="flex items-center gap-1.5 text-[11px] text-on-surface-variant/70">
                General due hours
                <InfoHint text="Fallback due window for replies that are not recognized as supplier or friend conversations." />
              </span>
              <input
                type="number"
                min={1}
                max={336}
                value={prefs().response_queue_policy?.general_due_hours ?? 36}
                onInput={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    response_queue_policy: {
                      ...(p.response_queue_policy ?? defaultResponseQueuePolicy()),
                      general_due_hours: Number(e.currentTarget.value) || 36,
                    },
                  }))
                }
                class="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-on-surface outline-none transition focus:border-primary/50"
              />
            </label>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div class="flex items-center justify-between">
              <div>
                <p class="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                  Local LLM first
                  <InfoHint text="Use the local model first for response ranking so lightweight prioritization can stay on-device when available." />
                </p>
                <p class="text-[11px] text-on-surface-variant/60">
                  Prefer on-device inference for reply importance when available.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs().response_queue_policy?.prioritize_with_local_llm ?? true}
                onClick={() =>
                  setPrefs((p) => ({
                    ...p,
                    response_queue_policy: {
                      ...(p.response_queue_policy ?? defaultResponseQueuePolicy()),
                      prioritize_with_local_llm: !(p.response_queue_policy?.prioritize_with_local_llm ?? true),
                    },
                  }))
                }
                class={`relative inline-flex h-5 w-9 cursor-pointer rounded-full transition-colors ${
                  (prefs().response_queue_policy?.prioritize_with_local_llm ?? true) ? "bg-primary" : "bg-white/20"
                }`}
              >
                <span class={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform m-0.5 ${
                  (prefs().response_queue_policy?.prioritize_with_local_llm ?? true) ? "translate-x-4" : "translate-x-0"
                }`} />
              </button>
            </div>

            <div class="flex items-center justify-between">
              <div>
                <p class="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                  Allow remote fallback
                  <InfoHint text="If the local ranking path is unavailable, allow the homeserver to fall back to a remote provider for the same scoring step." />
                </p>
                <p class="text-[11px] text-on-surface-variant/60">
                  Permit hosted or RunPod fallback when local ranking is unavailable.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs().response_queue_policy?.allow_remote_fallback ?? true}
                onClick={() =>
                  setPrefs((p) => ({
                    ...p,
                    response_queue_policy: {
                      ...(p.response_queue_policy ?? defaultResponseQueuePolicy()),
                      allow_remote_fallback: !(p.response_queue_policy?.allow_remote_fallback ?? true),
                    },
                  }))
                }
                class={`relative inline-flex h-5 w-9 cursor-pointer rounded-full transition-colors ${
                  (prefs().response_queue_policy?.allow_remote_fallback ?? true) ? "bg-primary" : "bg-white/20"
                }`}
              >
                <span class={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform m-0.5 ${
                  (prefs().response_queue_policy?.allow_remote_fallback ?? true) ? "translate-x-4" : "translate-x-0"
                }`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving() || loading()}
          class="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white transition hover:bg-primary/80 disabled:opacity-40"
        >
          {saving() ? "Saving…" : "Save Preferences"}
        </button>
      </div>

      {/* About Me — collapsible section for self-profile and behavior vetos */}
      <div class="border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={() => {
            const next = !showAboutMe();
            setShowAboutMe(next);
            if (next) void loadAboutMe();
          }}
          class="flex w-full items-center justify-between text-sm font-semibold text-on-surface"
        >
          <span>About Me</span>
          <span class="text-on-surface-variant/60 text-xs">{showAboutMe() ? "Hide" : "Show"}</span>
        </button>
        <Show when={showAboutMe()}>
          <div class="mt-3 space-y-4">
            <Show when={profileLoadError()}>
              <div
                classList={{
                  "rounded-xl border px-3 py-2 text-xs": true,
                  "border-red-400/20 bg-red-500/10 text-red-300": profileLoadError()?.tone === "danger",
                  "border-amber-400/20 bg-amber-500/10 text-amber-200": profileLoadError()?.tone !== "danger",
                }}
              >
                <p class="font-semibold">{profileLoadError()?.title}</p>
                <p class="mt-1">{profileLoadError()?.summary}</p>
                <p class="mt-1 opacity-80">{profileLoadError()?.nextStep}</p>
                <button
                  type="button"
                  onClick={() => void loadAboutMe()}
                  class="mt-2 rounded-lg border border-current bg-transparent px-3 py-1 text-[11px] font-medium text-inherit transition hover:bg-white/10"
                >
                  Retry profile
                </button>
              </div>
            </Show>

            <Show when={profileActionError()}>
              <div
                classList={{
                  "rounded-xl border px-3 py-2 text-xs": true,
                  "border-red-400/20 bg-red-500/10 text-red-300": profileActionError()?.tone === "danger",
                  "border-amber-400/20 bg-amber-500/10 text-amber-200": profileActionError()?.tone !== "danger",
                }}
              >
                <p class="font-semibold">{profileActionError()?.title}</p>
                <p class="mt-1">{profileActionError()?.summary}</p>
                <p class="mt-1 opacity-80">{profileActionError()?.nextStep}</p>
              </div>
            </Show>

            <p class="text-xs text-on-surface-variant">
              This information is stored locally (encrypted). Agents use it to personalize suggestions, tone, and priorities.
            </p>

            {/* Me document */}
            <div>
              <label class="mb-1 flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                About me (free text)
                <InfoHint text="Freeform background context the agent can use to personalize tone, framing, and tradeoffs across suggestions and drafts." />
              </label>
              <TiptapEditor
                mode="compact"
                initialContent={meDoc()}
                disabled={profileSaving()}
                placeholder="I'm a product designer focused on B2B SaaS. I value deep work and prefer async communication..."
                submitLabel={profileSaving() ? "Saving..." : "Save profile"}
                clearOnSend={false}
                onChange={(_text, markdown) => {
                  setProfileActionError(null);
                  setMeDoc(markdown.slice(0, 5000));
                }}
                onSend={async (payload) => {
                  setMeDoc((payload.markdown || payload.text).slice(0, 5000));
                  await saveAboutMe();
                }}
              />
              <p class="mt-0.5 text-right text-[9px] text-on-surface-variant/50">{meDoc().length}/5000</p>
            </div>

            {/* Interests */}
            <div>
              <label class="mb-1 flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                Interests (comma-separated)
                <InfoHint text="Lightweight topical interests that help the agent recognize what you care about when it prioritizes articles, notes, and suggestions." />
              </label>
              <input
                type="text"
                value={interests()}
                onInput={(e) => {
                  setProfileActionError(null);
                  setInterests(e.currentTarget.value);
                }}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !profileSaving()) {
                    e.preventDefault();
                    recordShortcutUse("form_submit");
                    void saveAboutMe();
                  }
                }}
                disabled={profileSaving()}
                placeholder="deep work, AI research, design systems, cycling"
                class="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs text-on-surface placeholder-on-surface-variant/40 outline-none focus:border-primary/40"
              />
            </div>

            {/* Behavior vetos */}
            <div>
              <label class="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                Behavior prohibitions
                <InfoHint text="Hard boundaries the agent should treat as non-negotiable when it suggests actions, drafts content, or schedules work." />
              </label>
              <p class="mb-2 text-[10px] text-on-surface-variant/60">
                Hard rules that agents must never violate — e.g. "never suggest I check social media", "never schedule meetings before 10am".
              </p>
              <For each={vetos()}>
                {(veto) => (
                  <div class="mb-1.5 flex items-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 py-2">
                    <span class="flex-shrink-0 rounded-full border border-outline/20 bg-white/10 px-1.5 py-0.5 text-[9px] text-on-surface-variant/70 capitalize">
                      {veto.scope}
                    </span>
                    <p class="flex-1 text-xs text-on-surface truncate">{veto.description}</p>
                    <button
                      type="button"
                      onClick={() => void handleRemoveVeto(veto.id)}
                      class="text-[10px] text-red-400/60 hover:text-red-400"
                    >×</button>
                  </div>
                )}
              </For>
              <div class="mt-2 flex gap-2">
                <div class="space-y-1">
                  <label class="flex items-center gap-1.5 text-[10px] font-medium text-on-surface-variant/70">
                    Rule scope
                    <InfoHint text="Choose which part of agent behavior this prohibition applies to, such as scheduling, content generation, or suggestion framing." />
                  </label>
                  <select
                    value={vetoScope()}
                    onChange={(e) => {
                      setProfileActionError(null);
                      setVetoScope(e.currentTarget.value as VetoScope);
                    }}
                    disabled={profileSaving()}
                    class="rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-[10px] text-on-surface outline-none"
                    aria-label="Behavior prohibition scope"
                  >
                    {(["suggestions","scheduling","content","prompt_style","channel"] as VetoScope[]).map((s) => (
                      <option value={s}>{s.replace("_", " ")}</option>
                    ))}
                  </select>
                </div>
                <div class="flex-1 space-y-1">
                  <label class="flex items-center gap-1.5 text-[10px] font-medium text-on-surface-variant/70">
                    Rule text
                    <InfoHint text="Describe the exact behavior the agent must avoid. Keep it concrete so the boundary can be enforced consistently." />
                  </label>
                  <input
                    type="text"
                    value={vetoDesc()}
                    onInput={(e) => {
                      setProfileActionError(null);
                      setVetoDesc(e.currentTarget.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && vetoDesc().trim() && !profileSaving()) {
                        e.preventDefault();
                        recordShortcutUse("form_submit");
                        void handleAddVeto();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        recordShortcutUse("form_cancel");
                        setProfileActionError(null);
                        setVetoDesc("");
                      }
                    }}
                    disabled={profileSaving()}
                    placeholder="Describe what the agent must never do…"
                    class="w-full rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-[10px] text-on-surface placeholder-on-surface-variant/40 outline-none"
                    aria-label="Behavior prohibition text"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleAddVeto()}
                  disabled={!vetoDesc().trim() || profileSaving()}
                  class="rounded-lg bg-primary/80 px-3 py-1.5 text-[10px] font-medium text-white transition hover:bg-primary disabled:opacity-40"
                >Add</button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void saveAboutMe()}
              disabled={profileSaving()}
              class="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white transition hover:bg-primary/80 disabled:opacity-40"
            >
              {profileSaving() ? "Saving…" : "Save Profile"}
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}
