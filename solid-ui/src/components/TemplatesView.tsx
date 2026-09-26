// @locs-version: 1.0
import { createSignal, For, Show } from "solid-js";

import {
  buildTemplateCatalogState,
  type TemplateCatalogCategory,
  type TemplateCatalogAction,
  type TemplateCatalogItem,
} from "@/lib/templateCatalogState";
import { dispatchWeddingNavigationIntent } from "@/lib/weddingNavigationState";
import type { ViewName } from "@/lib/viewNames";

type TabId = "all" | TemplateCatalogCategory;

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "all", label: "All" },
  { id: "entrepreneur", label: "Entrepreneur" },
  { id: "productivity", label: "Productivity" },
  { id: "research", label: "Research" },
  { id: "content", label: "Content" },
  { id: "life_event", label: "Life Event" },
];

const CARD_STYLE: Record<TemplateCatalogCategory, string> = {
  entrepreneur: "border-indigo-200/60 from-indigo-50/80 via-violet-50/70 to-sky-50/80 hover:border-indigo-300/70",
  productivity: "border-emerald-200/60 from-emerald-50/80 via-teal-50/70 to-cyan-50/80 hover:border-emerald-300/70",
  research: "border-amber-200/60 from-amber-50/80 via-yellow-50/60 to-white/60 hover:border-amber-300/60",
  content: "border-rose-200/60 from-rose-50/80 via-pink-50/60 to-white/60 hover:border-rose-300/60",
  life_event: "border-rose-200/60 from-rose-50/80 via-orange-50/60 to-amber-50/70 hover:border-rose-300/70",
};

export function TemplatesView(props: { onLaunch: (view: ViewName) => void }) {
  const [activeTab, setActiveTab] = createSignal<TabId>("all");
  const templates = buildTemplateCatalogState();

  const visible = () => {
    const tab = activeTab();
    return tab === "all" ? templates : templates.filter((template) => template.category === tab);
  };

  function tabCount(id: TabId) {
    return id === "all" ? templates.length : templates.filter((template) => template.category === id).length;
  }

  function launchTemplate(template: TemplateCatalogItem) {
    if (template.launchIntent) dispatchWeddingNavigationIntent(template.launchIntent);
    props.onLaunch(template.viewTarget);
  }

  function launchTemplateAction(action: TemplateCatalogAction) {
    if (action.launchIntent) dispatchWeddingNavigationIntent(action.launchIntent);
    props.onLaunch(action.viewTarget);
  }

  return (
    <div class="animate-fade-in min-w-0 space-y-6">
      <div class="min-w-0">
        <p class="font-mono text-[10px] uppercase tracking-[0.28em] text-outline">Templates</p>
        <h2 class="mt-1 break-words text-xl font-bold text-on-surface">Start from a template</h2>
        <p class="mt-0.5 break-words text-sm text-on-surface-variant">
          Pre-built agent workflows for common goals. Launch one to begin immediately.
        </p>
      </div>

      <div class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
        <For each={TABS}>
          {(tab) => {
            const count = () => tabCount(tab.id);
            if (count() === 0 && tab.id !== "all") return null;
            return (
              <button
                type="button"
                onClick={() => setActiveTab(tab.id)}
                class={`shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition sm:py-1 ${
                  activeTab() === tab.id
                    ? "bg-primary text-white shadow-sm"
                    : "border border-outline/20 bg-white/40 text-on-surface-variant hover:bg-white/70 hover:text-on-surface"
                }`}
              >
                {tab.label}
                <Show when={tab.id !== "all"}>
                  <span class={`ml-1 ${activeTab() === tab.id ? "opacity-70" : "opacity-40"}`}>
                    ({count()})
                  </span>
                </Show>
              </button>
            );
          }}
        </For>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <For each={visible()}>
          {(template) => (
            <div
              class={`group flex min-w-0 flex-col rounded-[22px] border bg-gradient-to-br p-4 shadow-card transition hover:shadow-panel sm:p-5 ${CARD_STYLE[template.category]}`}
            >
              <div class="flex items-start gap-3">
                <span class="select-none rounded-2xl border border-white/60 bg-white/65 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                  {template.icon}
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="break-words text-sm font-bold text-on-surface">{template.title}</p>
                    <Show when={template.featured}>
                      <span class="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
                        Featured
                      </span>
                    </Show>
                  </div>
                  <p class="mt-0.5 break-words text-xs text-on-surface-variant">{template.subtitle}</p>
                </div>
              </div>

              <p class="mt-3 break-words text-xs leading-relaxed text-on-surface-variant">{template.description}</p>

              <div class="mt-3 flex flex-wrap gap-1">
                <For each={template.tags}>
                  {(tag) => (
                    <span class="rounded-full border border-outline/20 bg-white/50 px-2 py-0.5 text-[10px] font-medium text-on-surface-variant">
                      {tag}
                    </span>
                  )}
                </For>
              </div>

              <Show when={template.starterLabels.length > 0}>
                <p class="mt-3 break-words text-[10px] leading-5 text-on-surface-variant/70">
                  Starters: {template.starterLabels.slice(0, 4).join(", ")}
                </p>
              </Show>

              <div class="mt-4 grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
                <Show when={template.estimatedTime}>
                  <span class="text-[10px] text-on-surface-variant/50">{template.estimatedTime}</span>
                </Show>
                <div class="grid gap-2 sm:ml-auto sm:flex sm:flex-wrap sm:items-center sm:justify-end">
                  <For each={template.secondaryActions}>
                    {(action) => (
                      <button
                        type="button"
                        title={action.description}
                        onClick={() => launchTemplateAction(action)}
                        class="rounded-full border border-white/70 bg-white/70 px-3 py-2 text-xs font-semibold text-on-surface-variant shadow-sm transition hover:bg-white hover:text-on-surface sm:py-1.5"
                      >
                        {action.label}
                      </button>
                    )}
                  </For>
                  <button
                    type="button"
                    onClick={() => launchTemplate(template)}
                    class="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/80 group-hover:shadow sm:py-1.5"
                  >
                    Launch
                  </button>
                </div>
              </div>
            </div>
          )}
        </For>
      </div>

      <Show when={visible().length === 0}>
        <div class="rounded-2xl border border-white/40 bg-white/30 p-8 text-center">
          <p class="text-sm text-on-surface-variant">No templates in this category yet.</p>
        </div>
      </Show>
    </div>
  );
}
