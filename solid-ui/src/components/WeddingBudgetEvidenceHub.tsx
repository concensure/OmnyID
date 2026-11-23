import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onMount } from "solid-js";
import { WeddingNormalizedQuoteSummary } from "@/components/WeddingNormalizedQuoteSummary";
import { WeddingQuoteScenarioComparison } from "@/components/WeddingQuoteScenarioComparison";
import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import type { WeddingResponseWorkspaceViewState, WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";
import {
  weddingQuoteMessageCandidates,
  weddingQuoteMessageClassificationInput,
} from "@/lib/weddingQuoteIntakeState";
import { weddingQuoteScenarioChoiceToAfpSendInput } from "@/lib/weddingQuoteScenarioChoiceState";
import {
  buildWeddingBudgetEvidenceHubState,
  type WeddingBudgetEvidenceDocument,
  type WeddingBudgetEvidenceMoneyRow,
  type WeddingBudgetEvidenceTabId,
} from "@/lib/weddingBudgetEvidenceHubState";

type QuoteArtifact = WeddingWorkspaceArtifactPreview & { preview: WeddingArtifactQuotePreview };

function EmptyTab(props: { label: string; detail: string }) {
  return (
    <div class="rounded-[10px] border border-dashed border-wedding-border bg-wedding-page px-4 py-6 text-center">
      <p class="text-sm font-semibold text-wedding-ink">{props.label}</p>
      <p class="mt-1 text-sm leading-6 text-wedding-ink/65">{props.detail}</p>
    </div>
  );
}

function MoneyRows(props: { rows: WeddingBudgetEvidenceMoneyRow[]; emptyLabel: string; onOpenArtifact?: (artifactId: string) => void; onReadQuote?: (artifactId: string) => void; selectedQuoteIds?: readonly string[]; onToggleCompare?: (artifactId: string) => void }) {
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
              <Show when={row.artifactId && props.onReadQuote}>
                <button type="button" class="min-h-11 rounded-lg border border-wedding-border px-3 text-sm font-semibold text-wedding-ink hover:bg-wedding-page" onClick={() => props.onReadQuote?.(row.artifactId!)}>Reading mode</button>
              </Show>
              <Show when={row.artifactId && props.onToggleCompare}>
                <button type="button" aria-pressed={props.selectedQuoteIds?.includes(row.artifactId!) ?? false} class={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${props.selectedQuoteIds?.includes(row.artifactId!) ? "border-wedding-primary bg-wedding-primary text-white" : "border-wedding-border bg-white text-wedding-ink"}`} onClick={() => props.onToggleCompare?.(row.artifactId!)}>{props.selectedQuoteIds?.includes(row.artifactId!) ? "Selected" : "Compare"}</button>
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
  onImportFiles?: (files: FileList) => void;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: () => void;
  openIntakeRequest?: number;
}) {
  const [activeTab, setActiveTab] = createSignal<WeddingBudgetEvidenceTabId>("overview");
  const [intakeOpen, setIntakeOpen] = createSignal(false);
  const [mode, setMode] = createSignal<"list" | "reading" | "compare">("list");
  const [activeQuoteId, setActiveQuoteId] = createSignal<string | null>(null);
  const [selectedQuoteIds, setSelectedQuoteIds] = createSignal<string[]>([]);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [savingSourceId, setSavingSourceId] = createSignal<string | null>(null);
  const [canScrollTabsBack, setCanScrollTabsBack] = createSignal(false);
  const [canScrollTabsForward, setCanScrollTabsForward] = createSignal(true);
  let tabScroller: HTMLDivElement | undefined;
  let intakeDialog: HTMLElement | undefined;
  const state = createMemo(() => buildWeddingBudgetEvidenceHubState(props.state));
  const quoteArtifacts = createMemo(() => props.state.artifactPreviews.filter((artifact): artifact is QuoteArtifact => artifact.preview?.kind === "quote"));
  const activeQuote = createMemo(() => quoteArtifacts().find((artifact) => artifact.artifactId === activeQuoteId()) ?? null);
  const comparisonQuotes = createMemo(() => quoteArtifacts().filter((artifact) => selectedQuoteIds().includes(artifact.artifactId)).slice(0, 4));
  const messageCandidates = createMemo(() => weddingQuoteMessageCandidates(props.state.afpMessages));
  createEffect(() => {
    if ((props.openIntakeRequest ?? 0) <= 0) return;
    setActiveTab("quotes");
    setIntakeOpen(true);
    queueMicrotask(() => intakeDialog?.focus());
  });
  function updateTabScrollControls(): void {
    if (!tabScroller) return;
    setCanScrollTabsBack(tabScroller.scrollLeft > 4);
    setCanScrollTabsForward(tabScroller.scrollLeft + tabScroller.clientWidth < tabScroller.scrollWidth - 4);
  }
  function scrollTabs(direction: -1 | 1): void {
    if (!tabScroller) return;
    tabScroller.scrollBy({ left: direction * Math.max(160, tabScroller.clientWidth * 0.72), behavior: "smooth" });
    window.setTimeout(updateTabScrollControls, 220);
  }
  onMount(() => queueMicrotask(updateTabScrollControls));

  function openReading(artifactId: string): void {
    setActiveQuoteId(artifactId);
    setMode("reading");
    setIntakeOpen(true);
  }

  function toggleCompare(artifactId: string): void {
    setSelectedQuoteIds((current) => current.includes(artifactId)
      ? current.filter((id) => id !== artifactId)
      : [...current, artifactId].slice(-4));
  }

  async function classifyMessage(sourceId: string): Promise<void> {
    const candidate = messageCandidates().find((item) => item.sourceMessageId === sourceId);
    if (!candidate || candidate.alreadyClassified || !props.saveProjection) return;
    setSavingSourceId(sourceId);
    setNotice(null);
    try {
      await props.saveProjection(weddingQuoteMessageClassificationInput({ source: candidate, metadata: props.state.workspace.metadata }));
      setNotice("Message marked as a quote source. Its original thread remains the evidence source while quote extraction refreshes.");
      props.onRefreshWorkspace?.();
    } catch {
      setNotice("That message could not be marked as a quote. Please try again.");
    } finally {
      setSavingSourceId(null);
    }
  }
  return (
    <section class="mb-4 min-w-0 rounded-[12px] border border-wedding-border bg-wedding-card p-3 shadow-sm sm:p-4" aria-labelledby="wedding-budget-hub-title">
      <div class="min-w-0">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-wedding-primary">Money and paperwork</p>
        <h2 id="wedding-budget-hub-title" class="mt-1 font-display text-xl font-semibold text-wedding-ink">Budget at a glance</h2>
        <p class="mt-1 text-sm leading-6 text-wedding-ink/65">Quotes, contracts and payment dates stay connected to their source files in Documents.</p>
      </div>
      <div class="mt-4 grid max-w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1">
        <button type="button" aria-label="Show earlier budget tabs" class={`hidden h-10 w-8 items-center justify-center rounded-full border border-wedding-border bg-white text-lg font-semibold text-wedding-primary phone:inline-flex ${canScrollTabsBack() ? "" : "phone:invisible"}`} onClick={() => scrollTabs(-1)}>←</button>
        <div ref={tabScroller} class="flex min-w-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Budget details" onScroll={updateTabScrollControls}>
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
        <button type="button" aria-label="Show later budget tabs" class={`hidden h-10 w-8 items-center justify-center rounded-full border border-wedding-border bg-white text-lg font-semibold text-wedding-primary phone:inline-flex ${canScrollTabsForward() ? "" : "phone:invisible"}`} onClick={() => scrollTabs(1)}>→</button>
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
          <Match when={activeTab() === "quotes"}>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm text-wedding-ink/70">Upload vendor files, recover a quote from a message, read the original, or compare normalized details.</p>
              <button type="button" class="min-h-11 rounded-lg bg-wedding-primary px-4 text-sm font-semibold text-white" onClick={() => { setMode("list"); setIntakeOpen(true); }}>+ Add quotes</button>
            </div>
            <MoneyRows rows={state().quotes} emptyLabel="No quotes recorded yet" onOpenArtifact={props.onOpenArtifact} onReadQuote={openReading} selectedQuoteIds={selectedQuoteIds()} onToggleCompare={toggleCompare} />
            <Show when={selectedQuoteIds().length > 0}>
              <button type="button" class="mt-3 min-h-11 rounded-lg border border-wedding-primary px-4 text-sm font-semibold text-wedding-primary" onClick={() => { setMode("compare"); setIntakeOpen(true); }}>Compare selected quotes ({selectedQuoteIds().length})</button>
            </Show>
          </Match>
          <Match when={activeTab() === "contracts"}><ContractRows rows={state().contracts} onOpenArtifact={props.onOpenArtifact} /></Match>
          <Match when={activeTab() === "deposits"}><MoneyRows rows={state().deposits} emptyLabel="No deposits recorded yet" onOpenArtifact={props.onOpenArtifact} /></Match>
          <Match when={activeTab() === "payments"}><MoneyRows rows={state().payments} emptyLabel="No payment dates recorded yet" onOpenArtifact={props.onOpenArtifact} /></Match>
          <Match when={activeTab() === "forecast"}><MoneyRows rows={state().forecast} emptyLabel="No forecast categories yet" onOpenArtifact={props.onOpenArtifact} /></Match>
        </Switch>
      </div>
      <Show when={intakeOpen()}>
        <div class="fixed inset-0 z-[6500] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setIntakeOpen(false); }}>
          <section ref={intakeDialog} tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="quote-intake-title" class="max-h-[92dvh] w-full max-w-5xl overflow-auto rounded-t-2xl bg-white p-4 shadow-2xl outline-none sm:rounded-2xl sm:p-5">
            <div class="flex items-start justify-between gap-3">
              <div><h3 id="quote-intake-title" class="font-display text-xl font-semibold text-wedding-ink">Quotes</h3><p class="mt-1 text-sm leading-6 text-wedding-ink/65">One source-backed place for uploads, vendor messages, reading and comparison.</p></div>
              <button type="button" aria-label="Close quote dialogue" class="min-h-11 rounded-lg border border-wedding-border px-4 text-sm font-semibold" onClick={() => setIntakeOpen(false)}>Close</button>
            </div>
            <div class="mt-4 flex gap-2 overflow-x-auto" role="tablist" aria-label="Quote workspace mode">
              <For each={[{ id: "list", label: "All quotes" }, { id: "reading", label: "Reading mode" }, { id: "compare", label: "Compare" }] as const}>{(item) => <button type="button" role="tab" aria-selected={mode() === item.id} class={`min-h-11 shrink-0 rounded-lg border px-3 text-sm font-semibold ${mode() === item.id ? "border-wedding-primary bg-wedding-primary text-white" : "border-wedding-border"}`} onClick={() => setMode(item.id)}>{item.label}</button>}</For>
            </div>
            <Show when={notice()}>{(message) => <p class="mt-3 rounded-lg border border-wedding-border bg-wedding-page p-3 text-sm" role="status">{message()}</p>}</Show>
            <Show when={mode() === "list"}>
              <div class="mt-4 grid gap-4 lg:grid-cols-2">
                <section class="rounded-xl border border-wedding-border p-4">
                  <h4 class="font-semibold text-wedding-ink">Upload quote files</h4>
                  <p class="mt-1 text-sm leading-6 text-wedding-ink/65">Choose one or more PDF, DOC, DOCX, TXT or Markdown files. Originals stay in Documents and feed the existing quote-intelligence extraction.</p>
                  <label class="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-wedding-primary px-4 text-sm font-semibold text-white">Upload quotes<input class="sr-only" type="file" multiple accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" onChange={(event) => { if (event.currentTarget.files?.length) { props.onImportFiles?.(event.currentTarget.files); setNotice(`${event.currentTarget.files.length} quote file${event.currentTarget.files.length === 1 ? "" : "s"} sent to Documents for extraction.`); } event.currentTarget.value = ""; }} /></label>
                </section>
                <section class="rounded-xl border border-wedding-border p-4">
                  <h4 class="font-semibold text-wedding-ink">Choose a vendor message</h4>
                  <p class="mt-1 text-sm leading-6 text-wedding-ink/65">If a quote arrived in an email or agent message without being recognized, mark its source here. The message content is referenced, not copied.</p>
                  <Show when={messageCandidates().length > 0} fallback={<p class="mt-3 text-sm text-wedding-ink/60">No likely vendor pricing messages are available in this wedding yet.</p>}>
                    <div class="mt-3 space-y-2"><For each={messageCandidates()}>{(candidate) => <article class="rounded-lg border border-wedding-border p-3"><p class="text-sm font-semibold">{candidate.vendorLabel}</p><p class="mt-1 text-sm text-wedding-ink/70">{candidate.subjectLabel}</p><p class="mt-1 text-xs text-wedding-ink/55">{candidate.receivedLabel} · {candidate.attachmentCount} attachment{candidate.attachmentCount === 1 ? "" : "s"}</p><button type="button" disabled={candidate.alreadyClassified || savingSourceId() === candidate.sourceMessageId || !props.saveProjection} class="mt-2 min-h-10 rounded-lg border border-wedding-primary px-3 text-xs font-semibold text-wedding-primary disabled:opacity-50" onClick={() => void classifyMessage(candidate.sourceMessageId)}>{candidate.alreadyClassified ? "Already a quote" : savingSourceId() === candidate.sourceMessageId ? "Saving…" : "Use as quote"}</button></article>}</For></div>
                  </Show>
                </section>
              </div>
              <div class="mt-4"><MoneyRows rows={state().quotes} emptyLabel="No quotes recorded yet" onOpenArtifact={props.onOpenArtifact} onReadQuote={openReading} selectedQuoteIds={selectedQuoteIds()} onToggleCompare={toggleCompare} /></div>
            </Show>
            <Show when={mode() === "reading"}>
              <div class="mt-4"><Show when={activeQuote()} fallback={<div class="rounded-xl border border-dashed border-wedding-border p-6 text-center text-sm text-wedding-ink/65">Choose Reading mode beside a quote in the list.</div>}>{(artifact) => <div><div class="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 class="font-semibold text-wedding-ink">{artifact().title}</h4><button type="button" class="min-h-10 rounded-lg border border-wedding-primary px-3 text-sm font-semibold text-wedding-primary" onClick={() => props.onOpenArtifact?.(artifact().artifactId)}>Open original in Documents</button></div><WeddingNormalizedQuoteSummary quote={artifact().preview as WeddingArtifactQuotePreview} onOpenSource={() => props.onOpenArtifact?.(artifact().artifactId)} /></div>}</Show></div>
            </Show>
            <Show when={mode() === "compare"}>
              <div class="mt-4"><Show when={comparisonQuotes().length > 0} fallback={<div class="rounded-xl border border-dashed border-wedding-border p-6 text-center text-sm text-wedding-ink/65">Select up to four quote documents from All quotes.</div>}>
                <WeddingQuoteScenarioComparison
                  artifacts={comparisonQuotes()}
                  defaultWeddingBudget={props.state.budgetTracking.budgetTargetAmount}
                  onOpenArtifact={props.onOpenArtifact}
                  onSaveChoice={props.saveProjection ? async (choice) => {
                    await props.saveProjection!(weddingQuoteScenarioChoiceToAfpSendInput({
                      metadata: props.state.workspace.metadata,
                      ...choice,
                    }));
                    props.onRefreshWorkspace?.();
                  } : undefined}
                />
              </Show></div>
            </Show>
          </section>
        </div>
      </Show>
    </section>
  );
}
