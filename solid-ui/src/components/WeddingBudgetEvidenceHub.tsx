import { For, Match, Show, Switch, createMemo, createSignal } from "solid-js";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import {
  buildWeddingBudgetEvidenceHubState,
  type WeddingBudgetEvidenceDocument,
  type WeddingBudgetEvidenceMoneyRow,
  type WeddingBudgetEvidenceTabId,
} from "@/lib/weddingBudgetEvidenceHubState";

function EmptyTab(props: { label: string; detail: string }) {
  return (
    <div class="rounded-[10px] border border-dashed border-wedding-border bg-wedding-page px-4 py-6 text-center">
      <p class="text-sm font-semibold text-wedding-ink">{props.label}</p>
      <p class="mt-1 text-sm leading-6 text-wedding-ink/65">{props.detail}</p>
    </div>
  );
}

function MoneyRows(props: { rows: WeddingBudgetEvidenceMoneyRow[]; emptyLabel: string; onOpenArtifact?: (artifactId: string) => void }) {
  return (
    <Show when={props.rows.length > 0} fallback={<EmptyTab label={props.emptyLabel} detail="Add the source file in Documents or confirm the amount and date when you have them." />}>
      <div class="space-y-2">
        <For each={props.rows}>{(row) => (
          <article class="flex min-w-0 flex-col gap-3 rounded-[10px] border border-wedding-border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <h3 class="break-words text-sm font-semibold text-wedding-ink">{row.title}</h3>
                <span class="rounded-md border border-wedding-muted bg-wedding-slate px-2 py-1 text-xs font-semibold text-wedding-ink/75">{row.statusLabel}</span>
              </div>
              <p class="mt-1 break-words text-xs leading-5 text-wedding-ink/65">{row.detailLabel}</p>
            </div>
            <div class="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <span class="text-sm font-semibold text-wedding-primary">{row.amountLabel}</span>
              <Show when={row.artifactId && props.onOpenArtifact}>
                <button type="button" class="min-h-11 rounded-lg border border-wedding-primary px-3 text-sm font-semibold text-wedding-primary hover:bg-wedding-primary/5" onClick={() => props.onOpenArtifact?.(row.artifactId!)}>View document</button>
              </Show>
            </div>
          </article>
        )}</For>
      </div>
    </Show>
  );
}

function ContractRows(props: { rows: WeddingBudgetEvidenceDocument[]; onOpenArtifact?: (artifactId: string) => void }) {
  return (
    <Show when={props.rows.length > 0} fallback={<EmptyTab label="No contracts in Documents yet" detail="Upload or save a contract in Documents and it will appear here automatically." />}>
      <div class="space-y-2">
        <For each={props.rows}>{(row) => (
          <article class="flex min-w-0 flex-col gap-3 rounded-[10px] border border-wedding-border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <h3 class="break-words text-sm font-semibold text-wedding-ink">{row.title}</h3>
                <span class="rounded-md border border-wedding-muted bg-wedding-slate px-2 py-1 text-xs font-semibold text-wedding-ink/75">{row.statusLabel}</span>
              </div>
              <p class="mt-1 break-words text-xs leading-5 text-wedding-ink/65">{row.kindLabel} · {row.detailLabel}</p>
            </div>
            <button type="button" class="min-h-11 shrink-0 rounded-lg border border-wedding-primary px-3 text-sm font-semibold text-wedding-primary hover:bg-wedding-primary/5" onClick={() => props.onOpenArtifact?.(row.artifactId)}>Open in Documents</button>
          </article>
        )}</For>
      </div>
    </Show>
  );
}

export function WeddingBudgetEvidenceHub(props: {
  state: WeddingResponseWorkspaceViewState;
  onOpenArtifact?: (artifactId: string) => void;
}) {
  const [activeTab, setActiveTab] = createSignal<WeddingBudgetEvidenceTabId>("overview");
  const state = createMemo(() => buildWeddingBudgetEvidenceHubState(props.state));
  return (
    <section class="mb-4 min-w-0 rounded-[12px] border border-wedding-border bg-wedding-card p-3 shadow-sm sm:p-4" aria-labelledby="wedding-budget-hub-title">
      <div class="min-w-0">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-wedding-primary">Money and paperwork</p>
        <h2 id="wedding-budget-hub-title" class="mt-1 font-display text-xl font-semibold text-wedding-ink">Budget at a glance</h2>
        <p class="mt-1 text-sm leading-6 text-wedding-ink/65">Quotes, contracts and payment dates stay connected to their source files in Documents.</p>
      </div>
      <div class="mt-4 flex max-w-full gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Budget details">
        <For each={state().tabs}>{(tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab() === tab.id}
            aria-controls={`wedding-budget-panel-${tab.id}`}
            class={`min-h-11 shrink-0 rounded-lg border px-3 text-sm font-semibold transition ${activeTab() === tab.id ? "border-wedding-primary bg-wedding-primary text-white" : "border-wedding-border bg-white text-wedding-ink hover:bg-wedding-slate"}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}<Show when={tab.id !== "overview"}> ({tab.count})</Show>
          </button>
        )}</For>
      </div>
      <div id={`wedding-budget-panel-${activeTab()}`} role="tabpanel" class="mt-4 min-w-0">
        <Switch>
          <Match when={activeTab() === "overview"}>
            <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <For each={state().overview}>{(item) => (
                <article class="rounded-[10px] border border-wedding-border bg-wedding-page p-3">
                  <p class="text-xs font-semibold text-wedding-ink/60">{item.label}</p>
                  <p class="mt-1 break-words text-xl font-semibold text-wedding-primary">{item.value}</p>
                  <p class="mt-1 text-xs leading-5 text-wedding-ink/65">{item.detail}</p>
                </article>
              )}</For>
            </div>
          </Match>
          <Match when={activeTab() === "quotes"}><MoneyRows rows={state().quotes} emptyLabel="No quotes recorded yet" onOpenArtifact={props.onOpenArtifact} /></Match>
          <Match when={activeTab() === "contracts"}><ContractRows rows={state().contracts} onOpenArtifact={props.onOpenArtifact} /></Match>
          <Match when={activeTab() === "deposits"}><MoneyRows rows={state().deposits} emptyLabel="No deposits recorded yet" onOpenArtifact={props.onOpenArtifact} /></Match>
          <Match when={activeTab() === "payments"}><MoneyRows rows={state().payments} emptyLabel="No payment dates recorded yet" onOpenArtifact={props.onOpenArtifact} /></Match>
          <Match when={activeTab() === "forecast"}><MoneyRows rows={state().forecast} emptyLabel="No forecast categories yet" onOpenArtifact={props.onOpenArtifact} /></Match>
        </Switch>
      </div>
    </section>
  );
}
