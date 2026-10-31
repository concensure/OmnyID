// @locs-version: 2.0
import { createMemo, createSignal, For, Show } from "solid-js";

import { WeddingDashboardIcon } from "@/components/WeddingDashboardIcons";
import { WeddingInfoTip } from "@/components/WeddingInfoTip";
import {
  buildWeddingBoundaryManagementViewState,
  weddingBoundaryDraftSaveUnavailableNotice,
  visibleWeddingBoundaryApprovalCount,
  visibleWeddingBoundaryApprovalItems,
  weddingBoundaryDecisionNoticeFromError,
} from "@/lib/weddingBoundaryManagementViewState";
import type { WeddingBoundaryRequestDecision } from "@/lib/weddingBoundaryDecisionState";
import type {
  WeddingBoundaryChangeType,
  WeddingBoundaryPolicyRuleType,
  WeddingBoundaryState,
} from "@/lib/weddingBoundaryLedgerState";
import type { WeddingBoundaryTopologyState } from "@/lib/weddingBoundaryTopologyState";

export function WeddingBoundaryManagementCard(props: {
  state: WeddingBoundaryState;
  topology: WeddingBoundaryTopologyState;
  onDecideRequest?: (requestId: string, decision: WeddingBoundaryRequestDecision) => Promise<string>;
  onSaveFamilyRequest?: (input: { requesterLabel: string; requestLabel: string; changeType: WeddingBoundaryChangeType }) => Promise<string>;
  onSaveFamilyRule?: (input: { title: string; plainLanguage: string; ruleType: WeddingBoundaryPolicyRuleType }) => Promise<string>;
}) {
  const [showRequests, setShowRequests] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  const [showRules, setShowRules] = createSignal(false);
  const [showPeople, setShowPeople] = createSignal(false);
  const [showAddRequest, setShowAddRequest] = createSignal(false);
  const [showAddRule, setShowAddRule] = createSignal(false);
  const [decidingRequestId, setDecidingRequestId] = createSignal<string | null>(null);
  const [decisionNotice, setDecisionNotice] = createSignal<string | null>(null);
  const [completedRequestIds, setCompletedRequestIds] = createSignal<Record<string, boolean>>({});
  const [requesterLabel, setRequesterLabel] = createSignal("");
  const [requestLabel, setRequestLabel] = createSignal("");
  const [requestChangeType, setRequestChangeType] = createSignal<WeddingBoundaryChangeType>("add_guest");
  const [ruleTitle, setRuleTitle] = createSignal("");
  const [ruleText, setRuleText] = createSignal("");
  const [ruleType, setRuleType] = createSignal<WeddingBoundaryPolicyRuleType>("invitation_scope");
  const [savingDraft, setSavingDraft] = createSignal(false);
  const viewState = createMemo(() => buildWeddingBoundaryManagementViewState(props));
  const visibleApprovalItems = createMemo(() => visibleWeddingBoundaryApprovalItems(
    viewState().approvalItems,
    completedRequestIds(),
  ));
  const pendingReviewCount = createMemo(() => visibleWeddingBoundaryApprovalCount(
    props.state.approvalQueue.map((request) => request.requestId),
    completedRequestIds(),
  ));

  async function decideRequest(requestId: string, decision: WeddingBoundaryRequestDecision): Promise<void> {
    if (!props.onDecideRequest || decidingRequestId()) return;
    setDecisionNotice(null);
    setDecidingRequestId(requestId);
    try {
      const notice = await props.onDecideRequest(requestId, decision);
      setDecisionNotice(notice);
      setCompletedRequestIds((current) => ({ ...current, [requestId]: true }));
    } catch (error) {
      setDecisionNotice(weddingBoundaryDecisionNoticeFromError(error));
    } finally {
      setDecidingRequestId(null);
    }
  }
  async function saveFamilyRequest(): Promise<void> {
    if (savingDraft()) return;
    if (!props.onSaveFamilyRequest) {
      setDecisionNotice(weddingBoundaryDraftSaveUnavailableNotice("request"));
      return;
    }
    setDecisionNotice(null);
    setSavingDraft(true);
    try {
      const notice = await props.onSaveFamilyRequest({
        requesterLabel: requesterLabel().trim() || "Family",
        requestLabel: requestLabel(),
        changeType: requestChangeType(),
      });
      setDecisionNotice(notice);
      setRequesterLabel("");
      setRequestLabel("");
      setShowAddRequest(false);
      setShowRequests(true);
    } catch (error) {
      setDecisionNotice(weddingBoundaryDecisionNoticeFromError(error));
    } finally {
      setSavingDraft(false);
    }
  }
  async function saveFamilyRule(): Promise<void> {
    if (savingDraft()) return;
    if (!props.onSaveFamilyRule) {
      setDecisionNotice(weddingBoundaryDraftSaveUnavailableNotice("rule"));
      return;
    }
    setDecisionNotice(null);
    setSavingDraft(true);
    try {
      const notice = await props.onSaveFamilyRule({
        title: ruleTitle().trim() || "Family boundary rule",
        plainLanguage: ruleText(),
        ruleType: ruleType(),
      });
      setDecisionNotice(notice);
      setRuleTitle("");
      setRuleText("");
      setShowAddRule(false);
      setShowRules(true);
    } catch (error) {
      setDecisionNotice(weddingBoundaryDecisionNoticeFromError(error));
    } finally {
      setSavingDraft(false);
    }
  }

  return (
    <div class="min-w-0 rounded-[24px] border border-cyan-100/80 bg-cyan-50/80 p-3 shadow-card phone:rounded-none phone:border-0 phone:bg-transparent phone:p-0 phone:shadow-none sm:rounded-[28px] sm:p-4">
      <div class="flex items-start gap-3">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-900 text-white" aria-hidden="true">
          <WeddingDashboardIcon id="shield-check" class="h-5 w-5" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <p class="text-lg font-bold tracking-tight text-cyan-950">Family boundaries</p>
            <WeddingInfoTip title="Boundary tip" tone="sky">
              Family members can suggest changes, but only authorised people can approve changes to the official guest list. Private dietary, contact, and seating details stay restricted.
            </WeddingInfoTip>
          </div>
          <p class="mt-0.5 text-sm leading-5 text-cyan-900/75">Manage requests and family permissions</p>
        </div>
        <button
          type="button"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl text-cyan-950 transition hover:bg-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
          aria-expanded={expanded()}
          aria-controls="wedding-family-boundary-details"
          aria-label={expanded() ? "Close family boundaries" : "Open family boundaries"}
          onClick={() => setExpanded((value) => !value)}
        >
          <span aria-hidden="true" class={`transition-transform ${expanded() ? "rotate-90" : ""}`}>›</span>
        </button>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-3" aria-label="Family boundary summary">
        <button type="button" class="min-h-[7.5rem] rounded-2xl border border-cyan-100 bg-white/80 p-4 text-left transition hover:border-cyan-300" onClick={() => { setExpanded(true); setShowRequests(true); }}>
          <span class="block text-sm font-semibold text-cyan-950/70">Requests</span>
          <span class="mt-2 block text-3xl font-semibold text-cyan-950">{pendingReviewCount()}</span>
          <span class="mt-1 block text-xs font-semibold text-cyan-900/70">{pendingReviewCount() === 0 ? "Nothing needs review" : "Need review"}</span>
        </button>
        <button type="button" class="min-h-[7.5rem] rounded-2xl border border-cyan-100 bg-white/80 p-4 text-left transition hover:border-cyan-300" onClick={() => { setExpanded(true); setShowPeople(true); }}>
          <span class="block text-sm font-semibold text-cyan-950/70">Households</span>
          <span class="mt-2 block text-3xl font-semibold text-cyan-950">{props.state.householdCount}</span>
          <span class="mt-1 block text-xs font-semibold text-cyan-900/70">Invitation groups</span>
        </button>
      </div>

      <Show when={expanded()}>
      <div id="wedding-family-boundary-details">
        <p class="mt-3 rounded-2xl border border-cyan-100 bg-white/70 px-3 py-2 text-sm leading-6 text-cyan-950/75">
          {props.state.summaryLabel}
        </p>

        <div class="mt-3 grid gap-2 md:grid-cols-2">
          <section class="rounded-2xl border border-cyan-100 bg-white/75 p-3" aria-label="People and details currently included">
            <p class="text-xs font-semibold text-cyan-950">Included for sharing</p>
            <p class="mt-1 text-xs font-normal leading-5 text-cyan-950/75">{viewState().includeText}</p>
          </section>
          <section class="rounded-2xl border border-cyan-100 bg-white/75 p-3" aria-label="People and details currently excluded">
            <p class="text-xs font-semibold text-cyan-950">Kept private or blocked</p>
            <p class="mt-1 text-xs font-normal leading-5 text-cyan-950/75">{viewState().excludeText}</p>
          </section>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          aria-expanded={showRequests()}
          aria-controls="wedding-boundary-requests"
          class="rounded-full border border-cyan-200 bg-white/85 px-3 py-2 text-xs font-semibold text-cyan-950 transition hover:bg-white sm:py-1.5"
          onClick={() => setShowRequests(!showRequests())}
        >
          {showRequests() ? "Hide requests" : "Review requests"}
        </button>
        <button
          type="button"
          aria-expanded={showAddRequest()}
          aria-controls="wedding-boundary-add-request"
          class="rounded-full bg-cyan-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-800 sm:py-1.5"
          onClick={() => setShowAddRequest(!showAddRequest())}
        >
          Add family request
        </button>
        <button
          type="button"
          aria-expanded={showRules()}
          aria-controls="wedding-boundary-rules"
          class="rounded-full border border-cyan-200 bg-white/85 px-3 py-2 text-xs font-semibold text-cyan-950 transition hover:bg-white sm:py-1.5"
          onClick={() => setShowRules(!showRules())}
        >
          {showRules() ? "Hide rules" : "Review rules"}
        </button>
        <button
          type="button"
          aria-expanded={showAddRule()}
          aria-controls="wedding-boundary-add-rule"
          class="rounded-full border border-cyan-200 bg-white/85 px-3 py-2 text-xs font-semibold text-cyan-950 transition hover:bg-white sm:py-1.5"
          onClick={() => setShowAddRule(!showAddRule())}
        >
          Add rule
        </button>
        <button
          type="button"
          aria-expanded={showPeople()}
          aria-controls="wedding-boundary-people"
          class="rounded-full border border-cyan-200 bg-white/85 px-3 py-2 text-xs font-semibold text-cyan-950 transition hover:bg-white sm:py-1.5"
          onClick={() => setShowPeople(!showPeople())}
        >
          {showPeople() ? "Hide people" : "Who can see what"}
        </button>
      </div>
      </div>
      </Show>

      <Show when={decisionNotice()}>
        <p class="mt-3 rounded-2xl border border-cyan-100 bg-white/75 p-3 text-xs leading-5 text-cyan-950/75">{decisionNotice()}</p>
      </Show>

      <Show when={showAddRequest()}>
        <div id="wedding-boundary-add-request" class="mt-3 rounded-2xl border border-cyan-100 bg-white/80 p-3">
          <p class="text-sm font-semibold text-cyan-950">Record a family request</p>
          <div class="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]">
            <label class="min-w-0">
              <span class="text-xs font-semibold text-cyan-950/70">Who asked?</span>
              <input class="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-950 outline-none focus:border-cyan-400" value={requesterLabel()} placeholder="Mum, Dad, cousin" onInput={(event) => setRequesterLabel(event.currentTarget.value)} />
            </label>
            <label class="min-w-0">
              <span class="text-xs font-semibold text-cyan-950/70">What did they ask for?</span>
              <input class="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-950 outline-none focus:border-cyan-400" value={requestLabel()} placeholder="Add two extra guests" onInput={(event) => setRequestLabel(event.currentTarget.value)} />
            </label>
            <label class="min-w-0">
              <span class="text-xs font-semibold text-cyan-950/70">Type</span>
              <select class="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-950 outline-none focus:border-cyan-400" value={requestChangeType()} onChange={(event) => setRequestChangeType(event.currentTarget.value as WeddingBoundaryChangeType)}>
                <option value="add_guest">Add guest</option>
                <option value="plus_one_change">Plus-one change</option>
                <option value="event_invite_change">Event invite change</option>
                <option value="household_change">Household change</option>
              </select>
            </label>
          </div>
          <button type="button" class="mt-3 rounded-full bg-cyan-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50" disabled={!requestLabel().trim() || savingDraft()} onClick={() => void saveFamilyRequest()}>
            {savingDraft() ? "Saving..." : "Save for review"}
          </button>
        </div>
      </Show>

      <Show when={showAddRule()}>
        <div id="wedding-boundary-add-rule" class="mt-3 rounded-2xl border border-cyan-100 bg-white/80 p-3">
          <p class="text-sm font-semibold text-cyan-950">Add a boundary rule</p>
          <div class="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <label class="min-w-0">
              <span class="text-xs font-semibold text-cyan-950/70">Rule name</span>
              <input class="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-950 outline-none focus:border-cyan-400" value={ruleTitle()} placeholder="Guest limit" onInput={(event) => setRuleTitle(event.currentTarget.value)} />
            </label>
            <label class="min-w-0">
              <span class="text-xs font-semibold text-cyan-950/70">Rule type</span>
              <select class="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-950 outline-none focus:border-cyan-400" value={ruleType()} onChange={(event) => setRuleType(event.currentTarget.value as WeddingBoundaryPolicyRuleType)}>
                <option value="invitation_scope">Guest list</option>
                <option value="plus_one">Plus-ones</option>
                <option value="children">Children</option>
                <option value="seating">Seating</option>
                <option value="communication">Messages</option>
              </select>
            </label>
          </div>
          <label class="mt-2 block min-w-0">
            <span class="text-xs font-semibold text-cyan-950/70">Plain-language rule</span>
            <textarea class="mt-1 min-h-20 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-950 outline-none focus:border-cyan-400" value={ruleText()} placeholder="We are keeping the reception to named guests only." onInput={(event) => setRuleText(event.currentTarget.value)} />
          </label>
          <button type="button" class="mt-3 rounded-full bg-cyan-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50" disabled={!ruleText().trim() || savingDraft()} onClick={() => void saveFamilyRule()}>
            {savingDraft() ? "Saving..." : "Save rule"}
          </button>
        </div>
      </Show>

      <Show when={showRequests()}>
        <div id="wedding-boundary-requests" class="mt-3 space-y-2">
          <Show when={visibleApprovalItems().length > 0} fallback={<p class="rounded-2xl border border-cyan-100 bg-white/75 p-3 text-xs leading-5 text-cyan-950/70">No guest-list requests need a decision right now.</p>}>
            <For each={visibleApprovalItems()}>
              {(item) => (
                <article class="rounded-2xl border border-cyan-100 bg-white/75 p-3">
                  <div class="flex items-start justify-between gap-2">
                    <p class="break-words text-sm font-semibold text-cyan-950">{item.label}</p>
                    <span class="rounded-full bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-900">
                      Needs decision
                    </span>
                  </div>
                  <p class="mt-1 text-xs leading-5 text-cyan-950/70">{item.detail}</p>
                  <p class="mt-2 text-xs leading-5 text-cyan-950/60">
                    Approve only if this still fits your guest rules, budget, and event space.
                  </p>
                  <Show
                    when={props.onDecideRequest}
                    fallback={<p class="mt-2 rounded-2xl bg-cyan-50 px-3 py-2 text-xs leading-5 text-cyan-950/65">Sign in or reconnect saving to approve requests here.</p>}
                  >
                    <div class="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={Boolean(decidingRequestId())}
                        class="rounded-full bg-cyan-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50 sm:py-1.5"
                        onClick={() => void decideRequest(item.id, "approve")}
                      >
                        {decidingRequestId() === item.id ? "Saving..." : "Approve"}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(decidingRequestId())}
                        class="rounded-full border border-cyan-200 bg-white/85 px-3 py-2 text-xs font-semibold text-cyan-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:py-1.5"
                        onClick={() => void decideRequest(item.id, "decline")}
                      >
                        Keep unchanged
                      </button>
                    </div>
                  </Show>
                </article>
              )}
            </For>
          </Show>
        </div>
      </Show>

      <Show when={showRules()}>
        <div id="wedding-boundary-rules" class="mt-3 space-y-2">
          <Show when={viewState().hasRules} fallback={
            <div class="rounded-2xl border border-cyan-100 bg-white/75 p-3">
              <p class="text-xs leading-5 text-cyan-950/70">No family rules are set yet.</p>
              <button
                type="button"
                class="mt-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-950 transition hover:bg-white"
                onClick={() => {
                  setShowAddRule(true);
                  setShowRules(false);
                }}
              >
                Add a rule
              </button>
            </div>
          }>
            <For each={viewState().ruleItems}>
              {(item) => (
              <article class="rounded-2xl border border-cyan-100 bg-white/75 p-3">
                <div class="flex items-start justify-between gap-2">
                  <p class="break-words text-sm font-semibold text-cyan-950">{item.label}</p>
                  <span class="rounded-full bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-900">
                    Rule
                  </span>
                </div>
                <p class="mt-1 text-xs leading-5 text-cyan-950/70">{item.detail}</p>
              </article>
              )}
            </For>
          </Show>
        </div>
      </Show>

      <Show when={showPeople()}>
        <div id="wedding-boundary-people" class="mt-3 rounded-2xl border border-cyan-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-cyan-950">Visibility map</p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <Show when={viewState().hasVisibilityItems} fallback={
              <button
                type="button"
                class="rounded-full border border-cyan-100 bg-white px-2 py-1 text-xs font-semibold text-cyan-950/70 transition hover:bg-cyan-50"
                onClick={() => {
                  setShowAddRequest(true);
                  setShowPeople(false);
                }}
              >
                Add a family request or shared person
              </button>
            }>
              <For each={viewState().visibilityItems}>
                {(item) => (
                  <span class="max-w-full break-words rounded-full border border-cyan-100 bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-950/75">
                    {item.label}: {item.detail}
                  </span>
                )}
              </For>
            </Show>
          </div>
          <Show when={viewState().privateItemsLabel}>
            <p class="mt-2 text-xs leading-5 text-cyan-950/60">
              {viewState().privateItemsLabel}
            </p>
          </Show>
        </div>
      </Show>

      <Show when={props.state.warningLabels.length > 0}>
        <ul class="mt-3 space-y-1">
          <For each={props.state.warningLabels}>
            {(label) => <li class="text-xs leading-5 text-cyan-950/70">{label}</li>}
          </For>
        </ul>
      </Show>
    </div>
  );
}
