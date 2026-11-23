// @locs-version: 1.0
import { createSignal, For, onMount, Show } from "solid-js";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import {
  createPersona,
  deletePersona,
  getAgentUiPreferences,
  listPersonas,
  updateAgentUiPreferences,
  updatePersona,
  readSession,
  type AgentPersona,
} from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonBlock } from "@/components/Spinner";
import {
  buildPersonaSwitcherFailureReceipt,
  type PersonaSwitcherFailureReceipt,
} from "@/lib/personaSwitcherFailureState";
import { personaPanelActionBusy, personaReloadBlocked } from "@/lib/personaSwitcherViewState";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import { PERSONA_TEMPLATES, type PersonaTemplate } from "@/lib/personaTemplates";
import {
  activatePersonaAndList,
  installPersonaTemplateAndList,
  installedPersonaIdsByTemplate,
  personaSwitcherPreferredTab,
} from "@/lib/personaSwitcherState";
import { dispatchAgentPersonaFabVisibility } from "@/lib/agentPersonaFabVisibilityState";
import { preparePersonaAvatar } from "@/lib/personaAvatarState";
import {
  isPhonePersonaFabViewport,
  saveMobilePersonaFabOptIn,
  shouldShowPersonaFab,
} from "@/lib/agentPersonaFabMobileState";

const WRITING_STYLES = [
  { value: "balanced", label: "Balanced" },
  { value: "concise", label: "Concise & Direct" },
  { value: "warm", label: "Friendly & Warm" },
  { value: "formal", label: "Formal & Precise" },
  { value: "creative", label: "Creative & Expressive" },
  { value: "analytical", label: "Analytical & Data-driven" },
];

type EditState = {
  id: string | null;
  name: string;
  soul_md: string;
  writing_style: string;
  labels: string;
  image_data_url: string | null;
};

function blankEdit(): EditState {
  return { id: null, name: "", soul_md: "", writing_style: "balanced", labels: "", image_data_url: null };
}

const STYLE_COLORS: Record<string, string> = {
  balanced: "bg-slate-400/10 text-slate-400",
  concise: "bg-sky-400/10 text-sky-400",
  warm: "bg-amber-400/10 text-amber-400",
  formal: "bg-indigo-400/10 text-indigo-400",
  creative: "bg-purple-400/10 text-purple-400",
  analytical: "bg-emerald-400/10 text-emerald-400",
};

const CATEGORY_LABELS: Record<string, string> = {
  literary: "Literary & Historical",
  folklore: "Folklore & Myth",
  modern: "Modern Archetypes",
};

export function AgentPersonasPanel() {
  const [personas, setPersonas] = createSignal<AgentPersona[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [reloading, setReloading] = createSignal(false);
  const [edit, setEdit] = createSignal<EditState | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [activating, setActivating] = createSignal<string | null>(null);
  const [deleting, setDeleting] = createSignal<string | null>(null);
  const [formError, setFormError] = createSignal("");
  const [loadError, setLoadError] = createSignal<PersonaSwitcherFailureReceipt | null>(null);
  const [actionError, setActionError] = createSignal<PersonaSwitcherFailureReceipt | null>(null);
  const [panelTab, setPanelTab] = createSignal<"mine" | "templates">("mine");
  const [installing, setInstalling] = createSignal<string | null>(null);
  const [personaFabVisible, setPersonaFabVisible] = createSignal(true);
  const [savingFabPreference, setSavingFabPreference] = createSignal(false);
  const [preparingImage, setPreparingImage] = createSignal(false);
  const installedPersonaIds = () => installedPersonaIdsByTemplate(PERSONA_TEMPLATES, personas());
  const actionBusy = () => personaPanelActionBusy({
    saving: saving(),
    activatingId: activating(),
    deletingId: deleting(),
    installingId: installing(),
    reloading: reloading(),
  });

  async function reload(options?: { initial?: boolean }) {
    if (!options?.initial && personaReloadBlocked({ loading: loading(), reloading: reloading(), signedIn: true })) return;
    setReloading(true);
    setLoadError(null);
    try {
      const data = await listPersonas();
      setPersonas(data.personas);
      setPanelTab((currentTab) =>
        currentTab === "templates" || data.personas.length === 0
          ? personaSwitcherPreferredTab(data.personas)
          : currentTab,
      );
    } catch (err) {
      setPersonas([]);
      setLoadError(
        buildPersonaSwitcherFailureReceipt(
          "Load personas",
          err instanceof Error ? err.message : "Failed to load personas.",
        ),
      );
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }

  onMount(() => {
    void reload({ initial: true });
    void getAgentUiPreferences()
      .then((preferences) => setPersonaFabVisible(shouldShowPersonaFab({
        serverVisible: preferences.persona_fab_visible,
        userId: readSession()?.user?.id,
      })))
      .catch(() => setPersonaFabVisible(false));
  });

  async function setFabVisibility(visible: boolean): Promise<void> {
    if (savingFabPreference()) return;
    setSavingFabPreference(true);
    setActionError(null);
    try {
      if (isPhonePersonaFabViewport(window)) {
        saveMobilePersonaFabOptIn(visible, readSession()?.user?.id);
      }
      const preferences = await updateAgentUiPreferences(visible);
      const effectiveVisible = shouldShowPersonaFab({
        serverVisible: preferences.persona_fab_visible,
        userId: readSession()?.user?.id,
      });
      setPersonaFabVisible(effectiveVisible);
      dispatchAgentPersonaFabVisibility(effectiveVisible);
    } catch (err) {
      setActionError(buildPersonaSwitcherFailureReceipt(
        "Save Sprout visibility",
        err instanceof Error ? err.message : "Could not save that setting.",
      ));
    } finally {
      setSavingFabPreference(false);
    }
  }

  async function handleSave() {
    const e = edit();
    if (!e || saving() || actionBusy()) return;
    if (!e.name.trim()) {
      setFormError("Name is required");
      return;
    }
    setSaving(true);
    setFormError("");
    setActionError(null);
    try {
      const labels = e.labels.split(",").map((s) => s.trim()).filter(Boolean);
      if (e.id) {
        await updatePersona(e.id, {
          name: e.name.trim(),
          soul_md: e.soul_md,
          writing_style: e.writing_style,
          labels,
          image_data_url: e.image_data_url,
        });
      } else {
        await createPersona({
          name: e.name.trim(),
          soul_md: e.soul_md,
          writing_style: e.writing_style,
          labels,
          image_data_url: e.image_data_url,
        });
      }
      setEdit(null);
      await reload();
    } catch (err) {
      setActionError(
        buildPersonaSwitcherFailureReceipt(
          e.id ? "Save persona" : "Create persona",
          err instanceof Error ? err.message : "Save failed",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate(id: string) {
    if (actionBusy()) return;
    setActivating(id);
    setActionError(null);
    try {
      const result = await activatePersonaAndList(id);
      setPersonas(result.personas);
    } catch (err) {
      setActionError(
        buildPersonaSwitcherFailureReceipt(
          "Activate persona",
          err instanceof Error ? err.message : "Failed to activate persona.",
        ),
      );
    } finally {
      setActivating(null);
    }
  }

  async function handleDelete(id: string) {
    if (actionBusy()) return;
    setDeleting(id);
    setActionError(null);
    try {
      await deletePersona(id);
      await reload();
    } catch (err) {
      setActionError(
        buildPersonaSwitcherFailureReceipt(
          "Delete persona",
          err instanceof Error ? err.message : "Failed to delete persona.",
        ),
      );
    } finally {
      setDeleting(null);
    }
  }

  async function handleInstallTemplate(t: PersonaTemplate) {
    if (actionBusy()) return;
    setInstalling(t.id);
    setFormError("");
    setActionError(null);
    try {
      const result = await installPersonaTemplateAndList(t);
      setPersonas(result.personas);
      setPanelTab("mine");
    } catch (err) {
      setActionError(
        buildPersonaSwitcherFailureReceipt(
          "Install template",
          err instanceof Error ? err.message : "Install failed",
        ),
      );
    } finally {
      setInstalling(null);
    }
  }

  function startEdit(p: AgentPersona) {
    if (actionBusy()) return;
    setEdit({
      id: p.id,
      name: p.name,
      soul_md: p.soul_md,
      writing_style: p.writing_style,
      labels: (p.labels_json ?? p.skills_json ?? []).join(", "),
      image_data_url: p.image_data_url,
    });
    setFormError("");
    setActionError(null);
  }

  async function selectPersonaImage(file: File | undefined): Promise<void> {
    const current = edit();
    if (!file || !current || preparingImage()) return;
    setPreparingImage(true);
    setFormError("");
    try {
      const imageDataUrl = await preparePersonaAvatar(file);
      setEdit({ ...current, image_data_url: imageDataUrl });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "That image could not be prepared.");
    } finally {
      setPreparingImage(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30";
  const btnPrimary =
    "rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white transition hover:bg-primary/80 disabled:opacity-50";
  const btnGhost =
    "rounded-lg border border-white/20 px-3 py-1.5 text-xs text-on-surface-variant transition hover:bg-white/10";

  const tabClass = (t: "mine" | "templates") =>
    `px-3 py-1.5 text-xs font-medium rounded-lg transition ${
      panelTab() === t ? "bg-primary/15 text-primary" : "text-on-surface-variant hover:bg-white/5"
    }`;

  return (
    <div class="space-y-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-on-surface">Agent Personas</p>
          <p class="mt-0.5 text-xs text-on-surface-variant">
            Each persona changes how OmnyID sounds to you, not how AFP data is stored or how core orchestration works. Type{" "}
            <span class="font-mono text-primary/70">/persona</span> in any editor to switch.
          </p>
          <p class="mt-1 text-[11px] text-on-surface-variant/75">
            Only one persona is active at a time. Installing or keeping multiple personas gives you a library of response styles to switch between; activating one deactivates the previous active persona for this user only.
          </p>
        </div>
        <Show when={!edit()}>
          <button
            type="button"
            class={btnPrimary}
            disabled={actionBusy()}
            onClick={() => {
              setEdit(blankEdit());
              setFormError("");
              setActionError(null);
              setPanelTab("mine");
            }}
          >
            + New Persona
          </button>
        </Show>
      </div>

      <div class="flex flex-col gap-3 rounded-xl border border-white/15 bg-white/[0.05] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-on-surface">Sprout shortcut</p>
          <p class="mt-1 text-xs leading-5 text-on-surface-variant">
            Show the floating persona shortcut. Hiding it does not stop agents or change the active persona.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={personaFabVisible()}
          disabled={savingFabPreference()}
          class={`min-h-11 w-full shrink-0 rounded-lg border px-4 text-sm font-semibold transition sm:w-auto ${personaFabVisible() ? "border-primary bg-primary text-white" : "border-white/20 bg-white/5 text-on-surface"}`}
          onClick={() => void setFabVisibility(!personaFabVisible())}
        >
          {savingFabPreference() ? "Saving…" : personaFabVisible() ? "Shown" : "Show Sprout"}
        </button>
      </div>

      <Show when={!edit()}>
        <div class="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          <button type="button" class={`${tabClass("mine")} min-w-0`} disabled={actionBusy()} onClick={() => setPanelTab("mine")}>
            My Personas {personas().length > 0 ? `(${personas().length})` : ""}
          </button>
          <button type="button" class={`${tabClass("templates")} min-w-0`} disabled={actionBusy()} onClick={() => setPanelTab("templates")}>
            Browse Templates ({PERSONA_TEMPLATES.length})
          </button>
        </div>
      </Show>

      <Show when={actionError()}>
        <div
          class={`rounded-xl border px-4 py-3 text-xs ${
            actionError()?.tone === "danger"
              ? "border-red-400/20 bg-red-500/10 text-red-300"
              : "border-amber-300/20 bg-amber-500/10 text-amber-200"
          }`}
        >
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1">
              <p class="font-semibold">{actionError()?.title}</p>
              <p>{actionError()?.summary}</p>
              <p class="opacity-80">Next step: {actionError()?.nextStep}</p>
            </div>
            <button
              type="button"
              class="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-current transition hover:bg-white/10"
              disabled={actionBusy()}
              onClick={() => setActionError(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      </Show>

      <Show when={edit()} keyed>
        {(e) => (
          <div class="min-w-0 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4">
            <p class="text-xs font-semibold text-primary">{e.id ? "Edit Persona" : "New Persona"}</p>

            <div class="space-y-2">
              <div class="flex flex-col gap-3 rounded-lg border border-white/15 bg-white/5 p-3 sm:flex-row sm:items-center">
                <Show
                  when={e.image_data_url}
                  fallback={<span class="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl" aria-hidden="true">🤖</span>}
                >
                  {(source) => <img src={source()} alt="Selected persona" class="h-16 w-16 shrink-0 rounded-2xl object-cover" />}
                </Show>
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-semibold text-on-surface">Persona image</p>
                  <p class="mt-1 text-[11px] leading-4 text-on-surface-variant">Choose a WebP, JPEG, or PNG. OmnyID crops it to a small square avatar.</p>
                  <div class="mt-2 flex flex-col gap-2 min-[360px]:flex-row min-[360px]:flex-wrap">
                    <label class="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-white/20 px-3 text-xs font-semibold text-on-surface">
                      {preparingImage() ? "Preparing…" : "Choose image"}
                      <input type="file" accept="image/webp,image/jpeg,image/png" class="sr-only" disabled={saving() || preparingImage()} onChange={(event) => void selectPersonaImage(event.currentTarget.files?.[0])} />
                    </label>
                    <Show when={e.image_data_url}>
                      <button type="button" class={btnGhost} disabled={saving() || preparingImage()} onClick={() => setEdit({ ...e, image_data_url: null })}>Use default icon</button>
                    </Show>
                  </div>
                </div>
              </div>
              <input
                class={inputClass}
                placeholder="Persona name (e.g. Research Mode, Client-Facing)"
                value={e.name}
                disabled={saving()}
                onInput={(ev) => {
                  setFormError("");
                  setActionError(null);
                  setEdit({ ...e, name: ev.currentTarget.value });
                }}
                onKeyDown={(ev) => {
                  if (ev.key === "Escape" && !saving()) {
                    ev.preventDefault();
                    recordShortcutUse("form_cancel");
                    setEdit(null);
                  } else if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter" && !saving()) {
                    ev.preventDefault();
                    recordShortcutUse("form_submit");
                    void handleSave();
                  }
                }}
              />
              <select
                class={inputClass}
                value={e.writing_style}
                disabled={saving()}
                onChange={(ev) => {
                  setActionError(null);
                  setEdit({ ...e, writing_style: ev.currentTarget.value });
                }}
              >
                <For each={WRITING_STYLES}>{(s) => <option value={s.value}>{s.label}</option>}</For>
              </select>
              <input
                class={inputClass}
                placeholder="Optional labels (comma-separated, for your own organization only)"
                value={e.labels}
                disabled={saving()}
                onInput={(ev) => {
                  setActionError(null);
                  setEdit({ ...e, labels: ev.currentTarget.value });
                }}
                onKeyDown={(ev) => {
                  if (ev.key === "Escape" && !saving()) {
                    ev.preventDefault();
                    recordShortcutUse("form_cancel");
                    setEdit(null);
                  } else if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter" && !saving()) {
                    ev.preventDefault();
                    recordShortcutUse("form_submit");
                    void handleSave();
                  }
                }}
              />
              <p class="text-[11px] leading-4 text-on-surface-variant/75">
                Optional labels help you organize personas. They do not change agent reasoning, tool use, AFP records, or other users.
              </p>
              <div class="space-y-2">
                <p class="text-[11px] font-medium text-on-surface-variant">
                  Persona instructions
                </p>
                <TiptapEditor
                  mode="full"
                  initialContent={e.soul_md}
                  disabled={saving()}
                  placeholder="Describe the tone, empathy, briefness, boundaries, and phrasing style this persona should apply to user-facing responses."
                  showFooter={false}
                  submitShortcut="none"
                  clearOnSend={false}
                  class="border-white/20 bg-white/10"
                  contentClass="min-h-[160px]"
                  onChange={(_text, markdown) => {
                    setActionError(null);
                    setEdit({ ...e, soul_md: markdown });
                  }}
                  onSend={async () => {}}
                />
                <p class="text-[11px] leading-4 text-on-surface-variant/75">
                  This affects user-visible tone only: for example email drafts, explanations, summaries, and replies.
                </p>
              </div>
            </div>

            <Show when={formError()}>
              <p class="text-xs text-red-400">{formError()}</p>
            </Show>

            <div class="flex flex-col gap-2 min-[360px]:flex-row">
              <button type="button" class={`${btnPrimary} min-h-11`} disabled={saving()} onClick={handleSave}>
                {saving() ? "Saving..." : "Save"}
              </button>
              <button type="button" class={`${btnGhost} min-h-11`} disabled={saving()} onClick={() => setEdit(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Show>

      <Show when={panelTab() === "mine"}>
        <Show when={loading()}>
          <div class="skeleton-crossfade space-y-3">
            <div class="rounded-xl border border-white/15 bg-white/10 p-4">
              <SkeletonBlock lines={4} />
            </div>
            <div class="rounded-xl border border-white/15 bg-white/10 p-4">
              <SkeletonBlock lines={4} />
            </div>
            <div class="rounded-xl border border-white/15 bg-white/10 p-4">
              <SkeletonBlock lines={3} />
            </div>
          </div>
        </Show>

        <Show when={!loading() && loadError() && !edit()}>
          <EmptyState
            icon="!"
            title={loadError()?.title ?? "Could not load personas"}
            body={
              loadError()
                ? `${loadError()!.summary} Next step: ${loadError()!.nextStep}`
                : "Retry loading personas."
            }
            action={
              <button
                type="button"
                class={btnPrimary}
                disabled={loading() || reloading()}
                onClick={() => {
                  setLoading(true);
                  void reload();
                }}
              >
                Retry personas
              </button>
            }
          />
        </Show>

        <Show when={!loading() && !loadError() && personas().length === 0 && !edit()}>
          <EmptyState
            icon="◌"
            title="No personas yet"
            body="Create your own persona or install one from Browse Templates so your response style can switch deliberately without changing the underlying agent process."
            action={
              <button type="button" class={btnPrimary} disabled={actionBusy()} onClick={() => setPanelTab("templates")}>
                Browse Templates
              </button>
            }
          />
        </Show>

        <div class="content-crossfade space-y-2">
          <For each={personas()}>
            {(p) => {
              const styleLabel =
                WRITING_STYLES.find((s) => s.value === p.writing_style)?.label ?? p.writing_style;
              const labels = p.labels_json ?? p.skills_json ?? [];
              return (
                <div
                  class={`rounded-xl border p-4 transition ${
                    p.is_active ? "border-primary/50 bg-primary/8" : "border-white/20 bg-white/10"
                  }`}
                >
                  <div class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <Show when={p.image_data_url}>
                      {(source) => <img src={source()} alt="" class="h-12 w-12 shrink-0 rounded-xl object-cover" />}
                    </Show>
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <p class="truncate text-sm font-semibold text-on-surface">{p.name}</p>
                        <Show when={p.is_active}>
                          <span class="shrink-0 rounded-full bg-primary px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white">
                            Active
                          </span>
                        </Show>
                        <span
                          class={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ${
                            STYLE_COLORS[p.writing_style] ?? "bg-white/10 text-on-surface-variant"
                          }`}
                        >
                          {styleLabel}
                        </span>
                      </div>
                      <Show when={labels.length > 0}>
                        <div class="mt-1.5 flex flex-wrap gap-1">
                          <For each={labels}>
                            {(label) => (
                              <span class="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] text-on-surface-variant">
                                {label}
                              </span>
                            )}
                          </For>
                        </div>
                        <p class="mt-1 text-[10px] text-on-surface-variant/55">
                          Optional labels only. They do not change the persona's reasoning flow.
                        </p>
                      </Show>
                      <div class="mt-2">
                        <div class="flex items-center justify-between text-[10px] text-on-surface-variant/60">
                          <span>LoRA Genome</span>
                          <span>{(p.lora_confidence_score * 100).toFixed(0)}%</span>
                        </div>
                        <div class="mt-0.5 h-1 rounded-full bg-white/10">
                          <div
                            class={`h-full rounded-full transition-all ${
                              p.lora_genome_active ? "bg-green-500" : "bg-primary"
                            }`}
                            style={`width: ${Math.min(100, p.lora_confidence_score * 100)}%`}
                          />
                        </div>
                        <Show when={p.lora_genome_active}>
                          <p class="mt-0.5 text-[10px] font-medium text-green-500">Genome active</p>
                        </Show>
                      </div>
                      <Show when={p.soul_md}>
                        <pre class="mt-2 max-h-20 overflow-hidden rounded-lg bg-black/10 px-2 py-1.5 font-mono text-[10px] leading-4 text-on-surface-variant/70 whitespace-pre-wrap">
                          {p.soul_md.slice(0, 200)}
                          {p.soul_md.length > 200 ? "..." : ""}
                        </pre>
                      </Show>
                    </div>
                    <div class="grid shrink-0 grid-cols-2 gap-1.5 sm:flex sm:flex-col">
                      <Show when={!p.is_active}>
                        <button
                          type="button"
                          class={btnPrimary}
                          disabled={actionBusy()}
                          onClick={() => handleActivate(p.id)}
                        >
                          {activating() === p.id ? "..." : "Activate"}
                        </button>
                      </Show>
                      <button type="button" class={btnGhost} disabled={actionBusy()} onClick={() => startEdit(p)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        class="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-400/10 disabled:opacity-50"
                        disabled={actionBusy() || p.is_active}
                        title={p.is_active ? "Cannot delete the active persona" : "Delete"}
                        onClick={() => handleDelete(p.id)}
                      >
                        {deleting() === p.id ? "..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      <Show when={panelTab() === "templates" && !edit()}>
        <Show when={formError()}>
          <p class="text-xs text-red-400">{formError()}</p>
        </Show>
        <p class="text-xs text-on-surface-variant/60">
          Install a template to instantly create a vivid persona. You can edit it after installing.
        </p>
        {(["literary", "folklore", "modern"] as const).map((cat) => (
          <div class="space-y-2">
            <p class="pt-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">
              {CATEGORY_LABELS[cat]}
            </p>
            <For each={PERSONA_TEMPLATES.filter((t) => t.category === cat)}>
              {(t) => {
                const alreadyInstalled = () => installedPersonaIds().has(t.id);
                return (
                  <div
                    class={`rounded-xl border p-4 transition ${
                      alreadyInstalled()
                        ? "border-primary/20 bg-primary/3"
                        : "border-white/15 bg-white/[0.04] hover:bg-white/[0.07]"
                    }`}
                  >
                    <div class="flex items-start gap-3">
                      <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <p class="text-sm font-semibold text-on-surface">{t.name}</p>
                          <span
                            class={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
                              STYLE_COLORS[t.writing_style] ?? "bg-white/10 text-on-surface-variant"
                            }`}
                          >
                            {WRITING_STYLES.find((s) => s.value === t.writing_style)?.label ?? t.writing_style}
                          </span>
                          <Show when={alreadyInstalled()}>
                            <span class="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-semibold text-primary">
                              Installed
                            </span>
                          </Show>
                        </div>
                        <p class="mt-0.5 text-[10px] text-on-surface-variant/50">{t.source}</p>
                        <p class="mt-1 text-xs text-on-surface-variant/80">{t.description}</p>
                        <div class="mt-2 flex flex-wrap gap-1">
                          <For each={t.labels.slice(0, 4)}>
                            {(sk) => (
                              <span class="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-on-surface-variant/60">
                                {sk}
                              </span>
                            )}
                          </For>
                        </div>
                      </div>
                      <button
                        type="button"
                        class={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                          alreadyInstalled()
                            ? "border border-white/15 text-on-surface-variant hover:bg-white/5"
                            : "bg-primary/15 text-primary hover:bg-primary/25"
                        }`}
                        disabled={actionBusy()}
                        onClick={() => handleInstallTemplate(t)}
                      >
                        {installing() === t.id ? "Installing..." : alreadyInstalled() ? "Reinstall" : "Install & Activate"}
                      </button>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        ))}
      </Show>
    </div>
  );
}
