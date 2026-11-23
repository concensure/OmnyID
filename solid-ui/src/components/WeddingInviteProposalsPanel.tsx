// @locs-version: 2.0
import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js";

import type { WeddingResponseWorkspaceViewProps } from "@/components/WeddingResponseWorkspaceViewTypes";
import { australianWeddingLocationSuggestions } from "@/lib/australianWeddingLocationSuggestionState";
import {
  buildWeddingBudgetAllocationProjectionInput,
  emptyWeddingBudgetAllocationDraft,
  WEDDING_BUDGET_AUTO_BALANCE_CATEGORY_ID,
  WEDDING_BUDGET_CATEGORIES,
  withWeddingBudgetAutoBalance,
  type WeddingBudgetCategoryId,
} from "@/lib/weddingBudgetAllocationState";
import { weddingDecisionProjectionToAfpSendInput } from "@/lib/weddingDecisionAfpProjectionState";
import {
  closeWeddingProposalOpportunity,
  createWeddingProposalShareLink,
  loadWeddingProposalOpportunities,
  publishWeddingProposalOpportunity,
  type WeddingProposalOpportunity,
} from "@/lib/weddingInviteProposalOpportunityApi";
import {
  buildWeddingInviteProposalBrief,
  defaultWeddingInviteProposalSharing,
  type WeddingInviteProposalSharing,
} from "@/lib/weddingInviteProposalState";
import { weddingNeedToKnowContextToAfpSendInput } from "@/lib/weddingNeedToKnowAfpProjectionState";
import type { WeddingPlanningContext } from "@/lib/weddingNeedToKnowProbingState";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";

const SHARE_OPTIONS: ReadonlyArray<{ key: keyof WeddingInviteProposalSharing; label: string }> = [
  { key: "dateOrSeason", label: "Wedding date or season" },
  { key: "location", label: "Broad location" },
  { key: "guestCount", label: "Guest count" },
  { key: "stylePriorities", label: "Style and priorities" },
  { key: "approximateCategoryBudget", label: "Approximate category budget" },
  { key: "phoneContact", label: "Allow phone contact" },
];

const CATEGORY_OPTIONS = [
  "Wedding venues", "Wedding photographers", "Wedding videographers", "Wedding celebrants",
  "Wedding catering", "Wedding bands and DJs", "Wedding florists", "Wedding planners", "Wedding cakes",
] as const;

type FactEditor = "date" | "location" | "guests" | "budget" | null;
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const money = (amount: number, currency: string) => amount.toLocaleString("en-AU", {
  style: "currency", currency, maximumFractionDigits: 0,
});

function budgetCategory(category: string | null): WeddingBudgetCategoryId | null {
  const value = clean(category).toLowerCase();
  if (/venue|ceremony/.test(value)) return "venue_ceremony";
  if (/photo|video/.test(value)) return "photo_video";
  if (/music|band|dj|entertain/.test(value)) return "entertainment_music";
  if (/flower|decor|styling/.test(value)) return "flowers_decor";
  if (/cater|food|drink/.test(value)) return "catering_drinks";
  if (/cake/.test(value)) return "other_misc";
  return null;
}

export function WeddingInviteProposalsPanel(props: {
  workspace: WeddingResponseWorkspaceViewProps;
  preview: WeddingWorkspaceArtifactPreview | null;
  selectedCategory?: string | null;
  onSelectedCategoryChange?: (category: string) => void;
  assistantDraft?: { dateOrSeason?: string; guestCount?: number; requestText?: string; category?: string } | null;
}) {
  const [category, setCategory] = createSignal(props.selectedCategory ?? props.preview?.category ?? "");
  const brief = createMemo(() => {
    const built = buildWeddingInviteProposalBrief({
      state: props.workspace.state, preview: props.preview,
      vendorDirectory: props.workspace.weddingVendorDirectory, category: category(),
    });
    const draft = props.assistantDraft;
    return {
      ...built,
      dateOrSeason: draft?.dateOrSeason ?? built.dateOrSeason,
      guestCount: draft?.guestCount ? String(draft.guestCount) : built.guestCount,
      missingFacts: built.missingFacts.filter((fact) => !(fact === "Wedding date or season" && draft?.dateOrSeason) && !(fact === "Guest count" && draft?.guestCount)),
    };
  });
  const [requestText, setRequestText] = createSignal(props.assistantDraft?.requestText ?? props.workspace.vendorSearchQuery?.trim() ?? "");
  const [sharing, setSharing] = createSignal(defaultWeddingInviteProposalSharing(brief()));
  const [factEditor, setFactEditor] = createSignal<FactEditor>(null);
  const [factValue, setFactValue] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [publishedId, setPublishedId] = createSignal<string | null>(null);
  const [shareUrl, setShareUrl] = createSignal<string | null>(null);
  const [opportunities, { refetch }] = createResource(loadWeddingProposalOpportunities);
  let previousBriefId = "";
  const locationSuggestions = createMemo(() => factEditor() === "location"
    ? australianWeddingLocationSuggestions(factValue(), props.workspace.weddingVendorDirectory ?? [])
    : []);

  createEffect(() => {
    if (props.selectedCategory && props.selectedCategory !== category()) setCategory(props.selectedCategory);
  });
  createEffect(() => {
    const draft = props.assistantDraft;
    if (!draft) return;
    if (draft.category) chooseCategory(draft.category);
    if (draft.requestText) setRequestText(draft.requestText);
    setNotice("Sprout prepared this editable sample. Review it before publishing; no vendor has been contacted.");
  });
  createEffect(() => {
    const current = brief();
    if (current.id === previousBriefId) return;
    previousBriefId = current.id;
    setSharing(defaultWeddingInviteProposalSharing(current));
  });

  const sharedContext = () => ({
    date_or_season: sharing().dateOrSeason ? brief().dateOrSeason : null,
    location: sharing().location ? brief().location : null,
    guest_count: sharing().guestCount ? brief().guestCount : null,
    style_priorities: sharing().stylePriorities ? brief().stylePriorities : [],
    approximate_category_budget: sharing().approximateCategoryBudget ? brief().approximateCategoryBudget : null,
    allow_phone_contact: sharing().phoneContact,
  });

  function chooseCategory(value: string) {
    setCategory(value);
    props.onSelectedCategoryChange?.(value);
    setNotice(null);
  }

  function currentPlanningContext(): WeddingPlanningContext {
    const cards = props.workspace.state.contextCards;
    const value = <K extends keyof WeddingPlanningContext>(key: K) =>
      cards.map((card) => card.planningContext?.[key]).find((candidate) => (
        Array.isArray(candidate) ? candidate.length > 0 : typeof candidate === "number" || Boolean(clean(candidate))
      ));
    return {
      dateOrSeason: brief().dateOrSeason,
      location: value("location") as string | null | undefined,
      guestCount: value("guestCount") as number | string | null | undefined,
      budgetComfort: value("budgetComfort") as string | null | undefined,
      topPriorities: value("topPriorities") as readonly string[] | null | undefined,
      atmosphereDescription: value("atmosphereDescription") as string | null | undefined,
      inspirationImageUrls: value("inspirationImageUrls") as readonly string[] | null | undefined,
      familyOrStakeholderRoles: value("familyOrStakeholderRoles") as string | null | undefined,
    };
  }

  async function saveContextFact(kind: "location" | "guests") {
    if (!props.workspace.saveProjection || busy()) return;
    const value = factValue().trim();
    if (!value) { setNotice("Add a value before saving."); return; }
    const planning = currentPlanningContext();
    if (kind === "location") planning.location = value;
    else {
      const numeric = Number.parseInt(value, 10);
      if (!Number.isInteger(numeric) || numeric < 1 || numeric > 10_000) {
        setNotice("Enter a guest count between 1 and 10,000.");
        return;
      }
      planning.guestCount = numeric;
    }
    setBusy(true);
    try {
      await props.workspace.saveProjection(weddingNeedToKnowContextToAfpSendInput({
        metadata: props.workspace.state.workspace.metadata, planningContext: planning,
        answeredLabels: [
          planning.dateOrSeason ? `Date: ${planning.dateOrSeason}` : "",
          planning.location ? `Location: ${planning.location}` : "",
          planning.guestCount ? `Guests: ${planning.guestCount}` : "",
        ].filter(Boolean),
        nextQuestionLabel: "Continue planning from these shared wedding details.",
        readyForFirstRecommendations: Boolean(planning.location && planning.guestCount),
      }));
      setNotice(kind === "location" ? "Wedding location updated." : "Guest count updated.");
      setFactEditor(null);
      props.workspace.onRefreshWorkspace?.();
    } catch { setNotice("That wedding detail could not be saved. Try again."); }
    finally { setBusy(false); }
  }

  async function saveDate() {
    if (!props.workspace.onSaveWeddingDate || busy() || !/^\d{4}-\d{2}-\d{2}$/.test(factValue())) return;
    setBusy(true);
    try {
      await props.workspace.onSaveWeddingDate(factValue());
      setNotice("Wedding date updated.");
      setFactEditor(null);
      props.workspace.onRefreshWorkspace?.();
    } catch { setNotice("That wedding date could not be saved. Try again."); }
    finally { setBusy(false); }
  }

  async function saveBudget() {
    if (!props.workspace.saveProjection || busy()) return;
    const target = budgetCategory(category());
    const amount = Number.parseInt(factValue(), 10);
    const total = props.workspace.state.budgetTracking.budgetTargetAmount ?? 0;
    if (!target || !Number.isInteger(amount) || amount < 0 || total <= 0) {
      setNotice(total <= 0 ? "Set the total wedding budget first." : "Enter a valid category budget.");
      return;
    }
    const draft = emptyWeddingBudgetAllocationDraft("AUD");
    draft.totalAmount = total;
    for (const item of props.workspace.state.budgetTracking.budgetAllocation) draft.categoryAmounts[item.categoryId] = item.amount;
    draft.categoryAmounts[target] = amount;
    const nonBalanceTotal = WEDDING_BUDGET_CATEGORIES
      .filter((item) => item.id !== WEDDING_BUDGET_AUTO_BALANCE_CATEGORY_ID)
      .reduce((sum, item) => sum + draft.categoryAmounts[item.id], 0);
    if (nonBalanceTotal > total) { setNotice("That category would exceed the total budget."); return; }
    const balanced = withWeddingBudgetAutoBalance(draft);
    setBusy(true);
    try {
      const projection = buildWeddingBudgetAllocationProjectionInput(balanced, props.workspace.state.workspace.metadata);
      await props.workspace.saveProjection(weddingDecisionProjectionToAfpSendInput(projection));
      setNotice("Category budget updated; the remaining amount was rebalanced in Other.");
      setFactEditor(null);
      props.workspace.onRefreshWorkspace?.();
    } catch { setNotice("That category budget could not be saved. Try again."); }
    finally { setBusy(false); }
  }

  function openFact(kind: Exclude<FactEditor, null>, current: string | null) {
    setFactEditor(kind); setFactValue(current ?? ""); setNotice(null);
  }

  async function publish() {
    if (busy()) return;
    if (!category().trim()) { setNotice("Choose the vendor category first."); return; }
    if (!requestText().trim()) { setNotice("Add a short proposal brief first."); return; }
    setBusy(true); setNotice(null);
    try {
      const result = await publishWeddingProposalOpportunity({
        wedding_plan_id: props.workspace.state.workspace.metadata.weddingPlanId,
        response_workspace_id: props.workspace.state.workspace.metadata.responseWorkspaceId,
        brief_id: brief().id, category: category(), location: brief().location,
        brief_text: requestText().trim(), shared_context: sharedContext(),
      });
      setPublishedId(result.opportunityId);
      setNotice("Proposal opportunity published. No vendor was contacted.");
      await refetch();
    } catch { setNotice("The proposal opportunity could not be published. Your brief is unchanged."); }
    finally { setBusy(false); }
  }

  async function createLink() {
    const id = publishedId() ?? opportunities()?.[0]?.opportunityId;
    if (!id || busy()) { setNotice("Publish the opportunity before creating a private link."); return; }
    setBusy(true);
    try {
      const result = await createWeddingProposalShareLink(id);
      setShareUrl(result.url);
      setNotice("Secure link created. It expires in 14 days and is excluded from search engines.");
      await refetch();
    } catch { setNotice("The secure vendor link could not be created."); }
    finally { setBusy(false); }
  }

  async function closeOpportunity(item: WeddingProposalOpportunity) {
    if (busy() || item.status !== "open") return;
    if (!window.confirm("Close this proposal opportunity? Existing vendor links will stop working and vendors will no longer be able to reply.")) return;
    setBusy(true);
    try {
      await closeWeddingProposalOpportunity(item.opportunityId);
      if (publishedId() === item.opportunityId) setPublishedId(null);
      setShareUrl(null);
      setNotice("Proposal opportunity closed and its secure vendor links were revoked.");
      await refetch();
    } catch { setNotice("The proposal opportunity could not be closed."); }
    finally { setBusy(false); }
  }

  const factRows = () => [
    { id: "date" as const, label: "Date", value: brief().dateOrSeason, editable: Boolean(props.workspace.onSaveWeddingDate) },
    { id: "location" as const, label: "Location", value: brief().location, editable: Boolean(props.workspace.saveProjection) },
    { id: "guests" as const, label: "Guests", value: brief().guestCount, editable: Boolean(props.workspace.saveProjection) },
    { id: "budget" as const, label: "Category budget", value: brief().approximateCategoryBudget ? money(brief().approximateCategoryBudget!.amount, brief().approximateCategoryBudget!.currency) : null, editable: Boolean(props.workspace.saveProjection) },
  ];

  return (
    <section id="wedding-vendor-panel-invite" role="tabpanel" aria-labelledby="wedding-vendor-tab-invite" class="-mx-3 mt-4 min-w-0 sm:mx-0">
      <div class="rounded-xl border border-wedding-border bg-wedding-page p-3 sm:p-4">
        <p class="font-display text-xl font-semibold text-wedding-ink">Invite vendors to propose</p>
        <p class="mt-1 text-sm leading-6 text-wedding-ink/70">Publish one private category brief. Claimed matching vendors can respond, or you can share a secure expiring link with an unclaimed vendor.</p>
      </div>
      <section class="mt-3 rounded-xl border border-wedding-border bg-white p-3" aria-labelledby="proposal-brief-heading">
        <h3 id="proposal-brief-heading" class="font-semibold text-wedding-ink">Your proposal brief</h3>
        <label class="mt-3 block text-sm font-semibold text-wedding-ink">Vendor category
          <select value={category()} onChange={(event) => chooseCategory(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 text-base font-normal">
            <option value="">Choose a category</option>
            <For each={CATEGORY_OPTIONS}>{(item) => <option value={item}>{item}</option>}</For>
          </select>
        </label>
        <textarea aria-label="Proposal brief" value={requestText()} onInput={(event) => setRequestText(event.currentTarget.value)} rows={4} class="mt-3 w-full rounded-lg border border-wedding-border bg-white p-3 text-base leading-6 outline-none focus:border-wedding-primary focus:ring-4 focus:ring-wedding-primary/15" placeholder="For example: a photography package covering preparation through speeches" />
        <dl class="mt-3 grid gap-2 sm:grid-cols-2">
          <For each={factRows()}>{(item) => <button type="button" disabled={!item.editable} onClick={() => openFact(item.id, item.id === "budget" ? String(brief().approximateCategoryBudget?.amount ?? "") : item.value)} class="min-h-16 rounded-lg bg-wedding-slate p-3 text-left disabled:cursor-default">
            <dt class="text-xs font-semibold uppercase tracking-wide text-wedding-ink/55">{item.label}</dt>
            <dd class="mt-1 break-words text-sm font-semibold text-wedding-ink">{item.value ?? "Not added yet"}</dd>
            <span class="mt-1 block text-xs text-wedding-secondary">{item.value ? "Change here" : "Add here"}</span>
          </button>}</For>
        </dl>
        <Show when={factEditor()}>
          <div class="mt-3 rounded-xl border border-wedding-primary/30 bg-wedding-page p-3">
            <label class="text-sm font-semibold text-wedding-ink">
              {factEditor() === "date" ? "Wedding date" : factEditor() === "location" ? "Wedding location" : factEditor() === "guests" ? "Guest count" : "Category budget"}
              <input type={factEditor() === "date" ? "date" : factEditor() === "location" ? "search" : "number"} min={factEditor() === "guests" ? "1" : "0"} value={factValue()} onInput={(event) => setFactValue(event.currentTarget.value)} autocomplete="off" aria-autocomplete={factEditor() === "location" ? "list" : undefined} aria-controls={factEditor() === "location" ? "wedding-proposal-location-options" : undefined} placeholder={factEditor() === "location" ? "Suburb or city" : undefined} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 text-base" />
            </label>
            <Show when={factEditor() === "location" && locationSuggestions().length > 0}>
              <div id="wedding-proposal-location-options" role="listbox" aria-label="Australian location suggestions" class="mt-2 grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-wedding-border bg-white p-1 shadow-lg">
                <For each={locationSuggestions()}>{(suggestion) => <button type="button" role="option" aria-selected={factValue() === suggestion.label} class="min-h-11 rounded-lg px-3 py-2 text-left text-sm hover:bg-wedding-page focus:bg-wedding-page" onClick={() => setFactValue(suggestion.label)}><span class="font-semibold text-wedding-ink">{suggestion.locality}</span> <span class="font-bold text-wedding-secondary">{suggestion.state}</span></button>}</For>
              </div>
            </Show>
            <div class="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy()} onClick={() => void (factEditor() === "date" ? saveDate() : factEditor() === "location" ? saveContextFact("location") : factEditor() === "guests" ? saveContextFact("guests") : saveBudget())} class="min-h-11 rounded-lg bg-wedding-primary px-4 text-sm font-bold text-white disabled:opacity-50">Save</button>
              <button type="button" onClick={() => setFactEditor(null)} class="min-h-11 rounded-lg border border-wedding-border bg-white px-4 text-sm font-semibold">Cancel</button>
            </div>
          </div>
        </Show>
      </section>
      <section class="mt-3 rounded-xl border border-wedding-border bg-white p-3" aria-labelledby="proposal-sharing-heading">
        <h3 id="proposal-sharing-heading" class="font-semibold text-wedding-ink">Choose what vendors can see</h3>
        <p class="mt-1 text-xs leading-5 text-wedding-ink/65">Budget and phone contact stay off unless you choose them. Publishing does not send an enquiry.</p>
        <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"><For each={SHARE_OPTIONS}>{(option) => <label class="flex min-h-11 items-center gap-2 rounded-lg bg-wedding-slate px-3 py-2 text-sm text-wedding-ink"><input type="checkbox" checked={sharing()[option.key]} onChange={(event) => setSharing((current) => ({ ...current, [option.key]: event.currentTarget.checked }))} class="h-5 w-5 accent-wedding-primary" />{option.label}</label>}</For></div>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy()} onClick={() => void publish()} class="min-h-11 rounded-lg bg-wedding-primary px-4 text-sm font-bold text-white disabled:opacity-50">{busy() ? "Saving…" : "Publish opportunity"}</button>
          <button type="button" disabled={busy() || (!publishedId() && !(opportunities()?.length))} onClick={() => void createLink()} class="min-h-11 rounded-lg border border-wedding-secondary bg-white px-4 text-sm font-bold text-wedding-secondary disabled:opacity-45">Create secure vendor link</button>
        </div>
        <Show when={shareUrl()}>{(url) => <div class="mt-3 rounded-lg bg-wedding-slate p-3"><p class="text-xs font-semibold text-wedding-ink">Private vendor link</p><div class="mt-2 flex flex-col gap-2 sm:flex-row"><input readonly value={url()} class="min-h-11 min-w-0 flex-1 rounded-lg border border-wedding-border bg-white px-3 text-sm" /><button type="button" class="min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 text-sm font-semibold" onClick={() => void navigator.clipboard.writeText(url())}>Copy link</button></div></div>}</Show>
        <Show when={notice()}>{(message) => <p class="mt-3 rounded-lg border border-wedding-border bg-wedding-page p-2 text-sm text-wedding-ink" role="status" aria-live="polite">{message()}</p>}</Show>
      </section>
      <Show when={(opportunities()?.length ?? 0) > 0}>
        <section class="mt-3 rounded-xl border border-wedding-border bg-white p-3" aria-labelledby="proposal-open-heading">
          <h3 id="proposal-open-heading" class="font-semibold text-wedding-ink">Your proposal opportunities</h3>
          <div class="mt-3 grid gap-2"><For each={opportunities()}>{(item) => <article class="rounded-lg bg-wedding-slate p-3"><div class="flex flex-wrap items-start justify-between gap-2"><div><p class="font-semibold text-wedding-ink">{item.category}</p><p class="mt-1 text-xs text-wedding-ink/65">{item.location ?? "Location not shared"} · {item.status === "open" ? `expires ${new Date(item.expiresAt).toLocaleDateString()}` : "closed"}</p></div><span class="rounded-full bg-white px-2 py-1 text-xs font-semibold">{item.responseCount} proposal{item.responseCount === 1 ? "" : "s"}</span></div><p class="mt-2 text-xs text-wedding-ink/65">{item.claimedVendorViewCount} claimed-vendor views · {item.shareCount} secure links created</p><Show when={item.status === "open"}><button type="button" disabled={busy()} onClick={() => void closeOpportunity(item)} class="mt-3 min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 text-sm font-semibold text-wedding-secondary disabled:opacity-50">Close and revoke links</button></Show></article>}</For></div>
        </section>
      </Show>
    </section>
  );
}
