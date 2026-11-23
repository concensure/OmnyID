// @locs-version: 1.0
import { For, Show } from "solid-js";

import type {
  WeddingWorkspaceAggregateState,
  WeddingWorkspaceSummaryItem,
} from "@/lib/weddingWorkspaceAggregateState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

function statusClasses(tone: WeddingWorkspaceSummaryItem["tone"]): string {
  if (tone === "attention") {
    return "border-wedding-status-progress-ink/20 bg-wedding-status-progress-bg text-wedding-status-progress-ink";
  }
  if (tone === "positive") {
    return "border-wedding-status-track-ink/20 bg-wedding-status-track-bg text-wedding-status-track-ink";
  }
  return "border-wedding-border bg-wedding-slate text-wedding-ink/75";
}

function StatusIcon(props: { tone: WeddingWorkspaceSummaryItem["tone"] }) {
  return (
    <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/70" aria-hidden="true">
      <Show when={props.tone === "attention"} fallback={props.tone === "positive" ? "✓" : "i"}>!</Show>
    </span>
  );
}

export function WeddingPeopleHub(props: {
  state: WeddingWorkspaceAggregateState;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
}) {
  function openMenu(target: WeddingWorkspaceMenuId | "share_plan" | undefined) {
    if (!target || target === "share_plan") return;
    props.onSelectMenu?.(target);
  }

  return (
    <section
      class="rounded-xl border border-wedding-border bg-wedding-page p-5 text-wedding-ink shadow-wedding-card phone:rounded-none phone:border-0 phone:bg-transparent phone:p-0 phone:shadow-none sm:p-5"
      aria-labelledby="wedding-people-title"
    >
      <div class="min-w-0">
        <h2 id="wedding-people-title" class="font-display text-2xl font-semibold tracking-tight text-wedding-ink">
          {props.state.title}
        </h2>
        <p class="mt-1 max-w-2xl text-sm leading-6 text-wedding-ink/70">{props.state.detail}</p>
        <div class="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap" aria-label="People status shortcuts">
          <For each={props.state.summaryItems ?? []}>
            {(item) => (
              <button
                type="button"
                data-people-status={item.id}
                class={`flex min-h-11 min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold leading-5 transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-primary focus-visible:ring-offset-2 motion-reduce:transform-none ${statusClasses(item.tone)}`}
                aria-label={`${item.label}. Open ${item.targetMenu === "seating" ? "Seating Plan" : "Guests and family boundaries"}.`}
                onClick={() => openMenu(item.targetMenu)}
              >
                <StatusIcon tone={item.tone} />
                <span class="min-w-0 break-words">{item.label}</span>
                <span class="ml-auto text-base leading-none" aria-hidden="true">›</span>
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="mt-5 grid items-stretch gap-4 sm:grid-cols-2">
        <For each={props.state.actions}>
          {(action) => (
            <button
              type="button"
              data-people-action={action.id}
              disabled={!action.enabled}
              class="group flex h-full min-h-[18rem] min-w-0 flex-col rounded-xl border border-wedding-border bg-wedding-card p-5 text-left shadow-wedding-card transition duration-200 hover:-translate-y-0.5 hover:border-wedding-primary/40 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transform-none"
              onClick={() => openMenu(action.targetMenu)}
            >
              <h3 class="break-words text-lg font-semibold text-wedding-ink">{action.title}</h3>
              <p class="mt-2 break-words text-sm leading-6 text-wedding-ink/70">{action.detail}</p>
              <ul class="mt-4 space-y-2 text-xs font-semibold leading-5 text-wedding-ink/70" aria-label={`${action.title} status`}>
                <For each={action.metaItems ?? [action.metaLabel]}>
                  {(item) => (
                    <li class="flex min-w-0 items-start gap-2">
                      <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-wedding-primary" aria-hidden="true" />
                      <span class="min-w-0 break-words">{item}</span>
                    </li>
                  )}
                </For>
              </ul>
              <span data-people-cta class="mt-auto flex min-h-12 w-full items-center justify-between gap-3 rounded-lg bg-wedding-primary px-4 py-3 text-sm font-semibold text-wedding-page transition group-hover:bg-wedding-primary/90">
                <span>{action.ctaLabel ?? `Open ${action.title}`}</span>
                <span class="text-lg leading-none" aria-hidden="true">›</span>
              </span>
            </button>
          )}
        </For>
      </div>
    </section>
  );
}
