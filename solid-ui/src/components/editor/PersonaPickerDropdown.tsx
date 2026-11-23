// @locs-version: 1.0
/**
 * PersonaPickerDropdown
 *
 * A floating panel that appears when the user types `/persona` in any TiptapEditor.
 * Shows all agent personas (templates + user-created) with name, source/description,
 * writing style chip, and soul preview.
 *
 * Selecting a persona activates it via the API and fires onSelect(persona).
 * The parent is responsible for removing the `/persona` trigger text from the editor.
 */

import { createSignal, For, onMount, Show } from "solid-js";
import { EmptyState } from "@/components/EmptyState";
import { listPersonas, type AgentPersona } from "@/lib/api";
import {
  buildPersonaSwitcherFailureReceipt,
  type PersonaSwitcherFailureReceipt,
} from "@/lib/personaSwitcherFailureState";
import { PERSONA_TEMPLATES } from "@/lib/personaTemplates";
import {
  activatePersonaAndList,
  filterPersonas,
  filterPersonaTemplates,
  installPersonaTemplateAndList,
  personaSwitcherPreferredTab,
} from "@/lib/personaSwitcherState";
import { recordShortcutUse } from "@/lib/shortcutRecency";

export interface PersonaPickerProps {
  /** Pixel coordinates of the cursor in the viewport */
  anchorX: number;
  anchorY: number;
  /** Current filter query (text typed after /persona ) */
  query?: string;
  onSelect: (persona: AgentPersona) => void;
  onClose: () => void;
}

const STYLE_LABELS: Record<string, string> = {
  balanced: "Balanced",
  concise: "Concise",
  warm: "Warm",
  formal: "Formal",
  creative: "Creative",
  analytical: "Analytical",
};

const STYLE_COLORS: Record<string, string> = {
  balanced: "bg-slate-400/20 text-slate-300",
  concise: "bg-sky-400/20 text-sky-300",
  warm: "bg-amber-400/20 text-amber-300",
  formal: "bg-indigo-400/20 text-indigo-300",
  creative: "bg-purple-400/20 text-purple-300",
  analytical: "bg-emerald-400/20 text-emerald-300",
};

const CATEGORY_LABELS: Record<string, string> = {
  literary: "Literary",
  folklore: "Folklore",
  modern: "Modern",
};

export function PersonaPickerDropdown(props: PersonaPickerProps) {
  const [personas, setPersonas] = createSignal<AgentPersona[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [activating, setActivating] = createSignal<string | null>(null);
  const [tab, setTab] = createSignal<"mine" | "templates">("mine");
  const [search, setSearch] = createSignal(props.query ?? "");
  const [loadError, setLoadError] = createSignal<PersonaSwitcherFailureReceipt | null>(null);
  const [actionError, setActionError] = createSignal<PersonaSwitcherFailureReceipt | null>(null);

  onMount(async () => {
    setLoadError(null);
    try {
      const data = await listPersonas();
      setPersonas(data.personas);
      setTab(personaSwitcherPreferredTab(data.personas));
    } catch (error: unknown) {
      setPersonas([]);
      setLoadError(
        buildPersonaSwitcherFailureReceipt(
          "Load personas",
          error instanceof Error ? error.message : "Could not load personas.",
        ),
      );
    }
    setLoading(false);
  });

  const filteredPersonas = () => filterPersonas(personas(), search());
  const filteredTemplates = () => filterPersonaTemplates(PERSONA_TEMPLATES, search());

  async function handleSelectPersona(persona: AgentPersona) {
    if (persona.is_active) {
      props.onSelect(persona);
      return;
    }
    setActivating(persona.id);
    setActionError(null);
    try {
      const result = await activatePersonaAndList(persona.id);
      setPersonas(result.personas);
      if (result.activePersona) props.onSelect(result.activePersona);
    } catch (error: unknown) {
      setActionError(
        buildPersonaSwitcherFailureReceipt(
          "Activate persona",
          error instanceof Error ? error.message : "Could not activate persona.",
        ),
      );
    }
    setActivating(null);
  }

  const left = () => Math.min(props.anchorX, window.innerWidth - 380);
  const top = () => {
    const below = props.anchorY + 8;
    return below + 400 > window.innerHeight ? props.anchorY - 416 : below;
  };

  const tabClass = (tabValue: "mine" | "templates") =>
    `px-3 py-1.5 text-xs font-medium rounded-md transition ${
      tab() === tabValue
        ? "bg-primary/15 text-primary"
        : "text-on-surface-variant hover:bg-white/5"
    }`;

  return (
    <>
      <div
        class="fixed inset-0 z-[99]"
        onClick={props.onClose}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            recordShortcutUse("form_cancel");
            props.onClose();
          }
        }}
      />

      <div
        class="fixed z-[100] w-[360px] overflow-hidden rounded-xl border border-white/10 bg-[#13161d] shadow-2xl"
        style={{ left: `${left()}px`, top: `${top()}px` }}
      >
        <div class="border-b border-white/10 px-3 py-2.5">
          <div class="mb-2 flex items-center justify-between">
            <p class="text-xs font-semibold text-on-surface">Switch Response Persona</p>
            <button
              type="button"
              class="text-sm text-on-surface-variant/50 hover:text-on-surface-variant"
              onClick={props.onClose}
            >
              ×
            </button>
          </div>
          <input
            type="text"
            class="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-on-surface outline-none placeholder:text-on-surface-variant/40 focus:border-primary/40"
            placeholder="Search personas..."
            value={search()}
            onInput={(event) => setSearch(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                recordShortcutUse("form_cancel");
                props.onClose();
              }
            }}
            autofocus
          />
          <div class="mt-2 flex gap-1">
            <button type="button" class={tabClass("mine")} onClick={() => setTab("mine")}>
              My Personas {personas().length > 0 && `(${personas().length})`}
            </button>
            <button
              type="button"
              class={tabClass("templates")}
              onClick={() => setTab("templates")}
            >
              Templates ({PERSONA_TEMPLATES.length})
            </button>
          </div>
        </div>

        <div class="max-h-[340px] space-y-1 overflow-y-auto p-2">
          <Show when={actionError()}>
            {(receipt) => (
              <div
                class={`rounded-lg border px-3 py-2 text-[11px] leading-4 ${
                  receipt().tone === "danger"
                    ? "border-red-200/40 bg-red-500/10 text-red-100"
                    : "border-amber-200/30 bg-amber-500/10 text-amber-100"
                }`}
              >
                <p class="font-semibold">{receipt().title}</p>
                <p class="mt-1 opacity-90">{receipt().summary}</p>
                <p class="mt-1 opacity-75">Next step: {receipt().nextStep}</p>
              </div>
            )}
          </Show>

          <Show when={tab() === "mine"}>
            <Show when={loading()}>
              <p class="animate-pulse py-4 text-center text-xs text-on-surface-variant/60">
                Loading...
              </p>
            </Show>
            <Show when={!loading() && loadError()}>
              {(receipt) => (
                <EmptyState
                  icon="AI"
                  title={receipt().title}
                  body={`${receipt().summary} Next step: ${receipt().nextStep}`}
                />
              )}
            </Show>
            <Show when={!loading() && !loadError() && filteredPersonas().length === 0}>
              <p class="py-4 text-center text-xs text-on-surface-variant/50">
                No personas yet. Switch to Templates to install one.
              </p>
            </Show>
            <For each={filteredPersonas()}>
              {(persona) => (
                <PersonaCard
                  name={persona.name}
                  subtitle={STYLE_LABELS[persona.writing_style] ?? persona.writing_style}
                  preview={persona.soul_md.slice(0, 120)}
                  style={persona.writing_style}
                  isActive={persona.is_active}
                  isLoading={activating() === persona.id}
                  onClick={() => void handleSelectPersona(persona)}
                />
              )}
            </For>
          </Show>

          <Show when={tab() === "templates"}>
            {(["literary", "folklore", "modern"] as const).map((category) => {
              const items = filteredTemplates().filter((template) => template.category === category);
              if (items.length === 0) return null;
              return (
                <div>
                  <p class="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">
                    {CATEGORY_LABELS[category]}
                  </p>
                  <For each={items}>
                    {(template) => (
                      <TemplateCard
                        template={template}
                        onActionError={setActionError}
                        onPersonaCreated={(persona) => {
                          setPersonas((prev) => [...prev, persona]);
                          setTab("mine");
                          props.onSelect(persona);
                        }}
                      />
                    )}
                  </For>
                </div>
              );
            })}
          </Show>
        </div>

        <div class="border-t border-white/10 px-3 py-2">
          <p class="text-[10px] text-on-surface-variant/40">
            Type <span class="font-mono text-primary/70">/persona</span> in any editor to open this
            picker · <span class="font-mono text-primary/70">Esc</span> to close
          </p>
          <p class="mt-1 text-[10px] text-on-surface-variant/35">
            Personas restyle user-facing replies and drafts only.
          </p>
        </div>
      </div>
    </>
  );
}

function PersonaCard(props: {
  name: string;
  subtitle: string;
  preview: string;
  style: string;
  isActive: boolean;
  isLoading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      class={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
        props.isActive
          ? "border-primary/30 bg-primary/10"
          : "border-transparent hover:bg-white/5"
      }`}
      onClick={props.onClick}
      disabled={props.isLoading}
    >
      <div class="flex items-start gap-2.5">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm font-medium text-on-surface">{props.name}</p>
            <Show when={props.isActive}>
              <span class="rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                Active
              </span>
            </Show>
            <span
              class={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                STYLE_COLORS[props.style] ?? "bg-white/10 text-on-surface-variant"
              }`}
            >
              {STYLE_LABELS[props.style] ?? props.style}
            </span>
          </div>
          <Show when={props.preview}>
            <p class="mt-1 line-clamp-2 font-mono text-[11px] leading-4 text-on-surface-variant/60">
              {props.preview}
              {props.preview.length >= 120 ? "..." : ""}
            </p>
          </Show>
        </div>
        <Show when={props.isLoading}>
          <span class="mt-0.5 shrink-0 text-xs text-primary/60">...</span>
        </Show>
        <Show when={!props.isActive && !props.isLoading}>
          <span class="mt-0.5 shrink-0 text-[10px] text-on-surface-variant/40">Activate →</span>
        </Show>
      </div>
    </button>
  );
}

function TemplateCard(props: {
  template: import("@/lib/personaTemplates").PersonaTemplate;
  onActionError: (receipt: PersonaSwitcherFailureReceipt | null) => void;
  onPersonaCreated: (persona: AgentPersona) => void;
}) {
  const [installing, setInstalling] = createSignal(false);

  async function install() {
    setInstalling(true);
    props.onActionError(null);
    try {
      const result = await installPersonaTemplateAndList(props.template);
      if (result.installedPersona) props.onPersonaCreated(result.installedPersona);
    } catch (error: unknown) {
      props.onActionError(
        buildPersonaSwitcherFailureReceipt(
          "Install template",
          error instanceof Error ? error.message : "Could not install persona template.",
        ),
      );
    }
    setInstalling(false);
  }

  const template = props.template;

  return (
    <div class="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5 transition hover:bg-white/[0.06]">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm font-medium text-on-surface">{template.name}</p>
            <span
              class={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                STYLE_COLORS[template.writing_style] ?? "bg-white/10 text-on-surface-variant"
              }`}
            >
              {STYLE_LABELS[template.writing_style] ?? template.writing_style}
            </span>
          </div>
          <p class="mt-0.5 text-[10px] text-on-surface-variant/50">{template.source}</p>
          <p class="mt-1 text-[11px] text-on-surface-variant/70">{template.description}</p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-lg bg-primary/15 px-2.5 py-1 text-[10px] font-semibold text-primary transition hover:bg-primary/25 disabled:opacity-50"
          disabled={installing()}
          onClick={() => void install()}
        >
          {installing() ? "..." : "Install"}
        </button>
      </div>
    </div>
  );
}
