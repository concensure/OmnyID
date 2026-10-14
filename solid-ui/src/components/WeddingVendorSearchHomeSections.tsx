// @locs-version: 1.0
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";

import { DecisionCard } from "@/components/DecisionCard";
import { renderMarkdown } from "@/lib/markdownRenderer";
import { WeddingVendorChoiceCard } from "@/components/WeddingVendorChoiceCard";
import type { WeddingResponseWorkspaceViewProps } from "@/components/WeddingResponseWorkspaceViewTypes";
import { decisionCardFromWeddingVendorComparison } from "@/lib/decisionCardState";
import type { useWeddingVendorOutreachOwner } from "@/lib/useWeddingVendorOutreachOwner";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";

type VendorSearchAction = NonNullable<WeddingResponseWorkspaceViewProps["vendorSearchResultAction"]>;
type VendorOutreachOwner = ReturnType<typeof useWeddingVendorOutreachOwner>;

const SEARCH_PROGRESS_LABELS = [
  "gathering personal preferences",
  "fetching vendor information...",
  "ranking vendors based on your query",
] as const;

// Keep typing local to the field. Updating the persisted wedding query on each
// keystroke rebuilds the home surface and can move the viewport under the user.
function VendorSearchDraftInput(props: {
  workspace: WeddingResponseWorkspaceViewProps;
  placeholder: string;
  class: string;
  name?: string;
}) {
  const workspace = () => props.workspace;
  const [draft, setDraft] = createSignal(workspace().vendorSearchQuery ?? "");
  let lastExternalValue = workspace().vendorSearchQuery ?? "";

  createEffect(() => {
    const externalValue = workspace().vendorSearchQuery ?? "";
    if (externalValue === lastExternalValue) return;
    lastExternalValue = externalValue;
    setDraft(externalValue);
  });

  function commit() {
    const value = draft();
    if (value === lastExternalValue) return;
    lastExternalValue = value;
    workspace().onVendorSearchQueryChange?.(value);
  }

  function selectQuery(event: { currentTarget: HTMLInputElement }) {
    // A named vendor lookup is commonly an edit of the last search. Selecting
    // it on focus makes that edit reliable on both touch and pointer devices.
    event.currentTarget.select();
  }

  return (
    <input
      type="text"
      name={props.name}
      value={draft()}
      onInput={(event) => setDraft(event.currentTarget.value)}
      onFocus={selectQuery}
      onPointerUp={(event) => {
        // Some mobile browsers place the caret after focus. Re-select on the
        // completing pointer event so a tap consistently selects the query.
        event.preventDefault();
        selectQuery(event);
      }}
      onBlur={commit}
      placeholder={props.placeholder}
      class={props.class}
    />
  );
}

export function WeddingPlanningBasicsSection(props: { workspace: WeddingResponseWorkspaceViewProps }) {
  const workspace = () => props.workspace;
  return (
    <div class="rounded-2xl border border-amber-200 bg-amber-50/90 p-3 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-amber-950">Planning basics needed</p>
          <p class="mt-1 break-words text-xs leading-5 text-amber-900/75">
            Live wedding workflows stay blocked until the required planning context is captured.
          </p>
        </div>
        <span class="rounded-full border border-amber-200 bg-white/75 px-2 py-1 text-xs font-semibold text-amber-950">
          Intake checkpoint
        </span>
      </div>
      <div class="mt-3 grid gap-2 sm:grid-cols-2">
        <Show when={workspace().vendorSearchReadiness?.status === "blocked"}>
          <div class="rounded-xl border border-amber-100 bg-white/75 p-3">
            <p class="text-xs font-semibold uppercase text-amber-800/70">Vendor search</p>
            <p class="mt-1 break-words text-sm leading-6 text-amber-950">
              Needs {workspace().vendorSearchReadiness?.missing.join(", ")}.
            </p>
            <Show when={workspace().vendorSearchReadiness?.missing.some((item) => /priorities|fit preferences/i.test(item))}>
              <label class="mt-3 block text-xs font-semibold text-amber-950">
                Vendor fit preferences
                <VendorSearchDraftInput
                  workspace={workspace()}
                  placeholder="beachfront venue in Sydney with Gothic style for 60 guests"
                  class="mt-1 w-full rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm font-normal text-amber-950 outline-none transition placeholder:text-amber-950/35 focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                />
              </label>
              <p class="mt-2 break-words text-[11px] leading-5 text-amber-900/75">
                A specific request here can unblock vendor fit preferences for live search.
              </p>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}

export function WeddingVendorSearchHomeSection(props: {
  workspace: WeddingResponseWorkspaceViewProps;
  result: {
    action: VendorSearchAction;
    preview: WeddingWorkspaceArtifactPreview | null;
    sourcePreview: WeddingWorkspaceArtifactPreview | null;
  } | null;
  outreach: VendorOutreachOwner;
  onDismiss: (artifactId: string) => void;
}) {
  const workspace = () => props.workspace;
  const [fullResultExpanded, setFullResultExpanded] = createSignal(false);
  const [searchProgressIndex, setSearchProgressIndex] = createSignal(0);
  let previousResultArtifactId: string | null = null;
  createEffect(() => {
    const artifactId = props.result?.action.artifactId ?? null;
    if (artifactId !== previousResultArtifactId) setFullResultExpanded(false);
    previousResultArtifactId = artifactId;
  });
  const searchDisabled = () => workspace().vendorSearchRunning
    || !workspace().onRunLiveVendorSearch;
  const visibleVendorSearchNotice = () => {
    const notice = workspace().vendorSearchNotice?.trim() ?? "";
    return /^Directory-only vendor search returned\b/i.test(notice) ? null : notice || null;
  };
  createEffect(() => {
    if (!workspace().vendorSearchRunning) {
      setSearchProgressIndex(0);
      return;
    }
    setSearchProgressIndex(0);
    const timer = window.setInterval(() => {
      setSearchProgressIndex((index) => (index + 1) % SEARCH_PROGRESS_LABELS.length);
    }, 1600);
    onCleanup(() => window.clearInterval(timer));
  });
  return (
    <div class="rounded-xl border border-wedding-muted bg-white/85 px-4 py-5 shadow-sm phone:rounded-none phone:border-0 phone:bg-transparent phone:px-0 phone:py-2 phone:shadow-none sm:px-5 sm:py-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem("wedding-vendor-search-query");
          if (input instanceof HTMLInputElement) {
            workspace().onVendorSearchQueryChange?.(input.value);
          }
          if (!searchDisabled()) workspace().onRunLiveVendorSearch?.();
        }}
      >
      <div class="min-w-0">
        <div class="min-w-0">
          <p class="text-lg font-bold leading-6 text-wedding-accent">Live vendor search</p>
      </div>
      <label class="mt-5 block">
        <VendorSearchDraftInput
          workspace={workspace()}
          name="wedding-vendor-search-query"
          placeholder="florist in Sydney specialising in wedding"
          class="mt-1 min-h-11 w-full rounded-lg border-2 border-wedding-muted bg-white px-3 py-2 text-sm text-wedding-accent shadow-sm outline-none transition placeholder:text-wedding-muted focus:border-wedding-accent focus:ring-4 focus:ring-wedding-surface-blush"
        />
      </label>
      <button
        type="submit"
        class="mt-3 min-h-11 w-full rounded-lg border border-wedding-accent bg-white px-4 py-2 text-sm font-bold text-wedding-accent transition hover:bg-wedding-surface-blush disabled:cursor-not-allowed disabled:opacity-50"
        title={workspace().vendorSearchBlockedReason
          ? `${workspace().vendorSearchBlockedReason} A named search can still check your wedding directory.`
          : undefined}
        disabled={searchDisabled()}
        data-magic-action="open"
        data-magic-icon="search"
        data-magic-label={workspace().vendorSearchRunning ? "Vendor search running" : "Search wedding vendors"}
        data-magic-id="wedding:vendor-search:run"
      >
        {workspace().vendorSearchRunning ? "Searching..." : "Search vendors"}
      </button>
      </div>
      </form>
      <Show
        when={workspace().vendorSearchRunning}
        fallback={<Show when={visibleVendorSearchNotice()}>{(notice) => <p class="mt-4 break-words text-xs leading-5 text-wedding-muted">{notice()}</p>}</Show>}
      >
        <p class="mt-4 break-words text-xs font-medium leading-5 text-wedding-muted" role="status" aria-live="polite">
          {SEARCH_PROGRESS_LABELS[searchProgressIndex()]}
        </p>
      </Show>
      <Show when={!props.result && workspace().vendorSearchResultAction}>
        <button type="button" class="mt-3 min-h-11 rounded-full border border-wedding-accent bg-white px-3 text-xs font-bold text-wedding-accent" onClick={() => props.onDismiss("")}>
          Show comparison
        </button>
      </Show>
      <Show when={props.result}>
        {(result) => (
          <div class="mt-4 rounded-xl border border-wedding-muted bg-wedding-surface-blush p-3 phone:rounded-none phone:border-0 phone:bg-transparent phone:p-0">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="break-words text-sm font-semibold text-wedding-accent">{result().preview?.title ?? result().action.label}</p>
                <p class="mt-1 break-words text-xs leading-5 text-wedding-muted">{result().action.detail}</p>
              </div>
            </div>
            <Show when={result().preview}>
              {(preview) => (
                <>
                  {(() => {
                    // A search source packet is valid without a comparison
                    // shortlist. Older locally cached packets may omit this
                    // optional display list entirely, so normalise it before
                    // rendering rather than allowing it to take down Planner.
                    const comparisonPreview = () => Array.isArray(preview().vendorComparisonCards)
                      ? preview()
                      : { ...preview(), vendorComparisonCards: [] };
                    return <>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <For each={[comparisonPreview().category, comparisonPreview().evidenceSummary.sourceCountLabel, comparisonPreview().vendorComparisonHandoff?.confidenceLabel ?? comparisonPreview().evidenceSummary.statusLabel].filter(Boolean)}>
                      {(label) => <span class="rounded-lg border border-wedding-muted bg-white px-3 py-1.5 text-xs font-medium text-wedding-muted">{label}</span>}
                    </For>
                  </div>
                  <Show when={comparisonPreview().vendorComparisonCards.length > 0}>
                    <DecisionCard
                      card={decisionCardFromWeddingVendorComparison(comparisonPreview())}
                      mode="standard"
                      showActions={false}
                      class="mt-3 shadow-none"
                      hero={(
                        <div class="grid gap-2 lg:grid-cols-3">
                          <For each={comparisonPreview().vendorComparisonCards.slice(0, 3)}>
                            {(vendor) => (
                              <WeddingVendorChoiceCard
                                card={vendor}
                                outreachFlow={props.outreach.flows()[vendor.choiceId] ?? null}
                                gmailConnected={Boolean(workspace().gmailStatus?.connected)}
                                onContactVendor={(card, intent) => void props.outreach.onContactVendor(card, result().action.artifactId, intent)}
                                onOutreachBodyChange={props.outreach.onOutreachBodyChange}
                                onSendOutreach={(choiceId) => void props.outreach.onSendOutreach(choiceId)}
                                onCancelOutreach={props.outreach.onCancelOutreach}
                                onRetryOutreach={props.outreach.onRetryOutreach}
                                onConnectGmailForOutreach={() => void props.outreach.onConnectGmailForOutreach()}
                              />
                            )}
                          </For>
                        </div>
                      )}
                    />
                  </Show>
                    </>;
                  })()}
                </>
              )}
            </Show>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                class="min-h-11 rounded-lg border border-wedding-accent bg-white px-3 text-sm font-bold text-wedding-accent"
                title={result().action.detail ?? undefined}
                aria-expanded={fullResultExpanded()}
                aria-controls="wedding-vendor-search-full-result"
                onClick={() => setFullResultExpanded((expanded) => !expanded)}
                data-magic-action="open"
                data-magic-icon="file"
                data-magic-label={result().action.label}
                data-magic-id="wedding:vendor-search:open-result"
              >
                {fullResultExpanded() ? "Hide full search result" : "Show full search result"}
              </button>
            </div>
            <Show when={fullResultExpanded()}>
              <section
                id="wedding-vendor-search-full-result"
                class="mt-3 rounded-2xl border border-wedding-muted bg-white p-3"
                aria-label="Full vendor search result"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-sm font-semibold text-wedding-accent">
                    {result().sourcePreview?.title ?? "Vendor search notes"}
                  </p>
                  <button
                    type="button"
                    class="min-h-11 rounded-full border border-wedding-muted bg-white px-3 text-xs font-semibold text-wedding-accent"
                    onClick={() => setFullResultExpanded(false)}
                  >
                    Close
                  </button>
                </div>
                <Show
                  when={result().sourcePreview?.bodyText}
                  fallback={<p class="mt-3 text-xs leading-5 text-wedding-muted">The saved search text is not available yet.</p>}
                >
                  {(body) => (
                    <div
                      class="md-prose mt-3 max-h-[22rem] overflow-auto rounded-xl bg-wedding-surface-blush p-3 text-xs leading-5 text-wedding-accent"
                      innerHTML={renderMarkdown(body())}
                    />
                  )}
                </Show>
              </section>
            </Show>
          </div>
        )}
      </Show>
      <Show when={workspace().vendorSearchBlockedReason}>
        {(reason) => <p class="mt-2 break-words text-xs leading-5 text-wedding-muted">{reason()}</p>}
      </Show>
    </div>
  );
}
