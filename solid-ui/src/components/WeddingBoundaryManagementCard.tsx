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
import type { WeddingBoundaryHouseholdRow } from "@/lib/weddingBoundaryHouseholdState";
import { previewWeddingBoundaryRequestDecision } from "@/lib/weddingBoundaryGovernanceState";
import type {
  WeddingBoundaryRuleAuthority,
  WeddingBoundaryRuleEffect,
  WeddingBoundaryRuleScopeKind,
} from "@/lib/weddingBoundaryGovernanceTypes";

export function WeddingBoundaryManagementCard(props: {
  state: WeddingBoundaryState;
  topology: WeddingBoundaryTopologyState;
  onDecideRequest?: (requestId: string, decision: WeddingBoundaryRequestDecision) => Promise<string>;
  onSaveFamilyRequest?: (input: { requesterLabel: string; requestLabel: string; changeType: WeddingBoundaryChangeType; targetHouseholdId: string; proposedGuestName: string }) => Promise<string>;
  onSaveFamilyRule?: (input: { title: string; plainLanguage: string; ruleType: WeddingBoundaryPolicyRuleType; scopeKind: WeddingBoundaryRuleScopeKind; scopeId: string; effect: WeddingBoundaryRuleEffect; authority: WeddingBoundaryRuleAuthority; effectiveUntil: string }) => Promise<string>;
  onSaveHousehold?: (input: { householdId: string; familyGroupLabel: string; invitationAllocation: number | null; requestDeadline: string | null }) => Promise<string>;
}) {
  let disclosureButton: HTMLButtonElement | undefined;
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
  const [requestHouseholdId, setRequestHouseholdId] = createSignal("");
  const [proposedGuestName, setProposedGuestName] = createSignal("");
  const [ruleTitle, setRuleTitle] = createSignal("");
  const [ruleText, setRuleText] = createSignal("");
  const [ruleType, setRuleType] = createSignal<WeddingBoundaryPolicyRuleType>("invitation_scope");
  const [ruleScopeKind, setRuleScopeKind] = createSignal<WeddingBoundaryRuleScopeKind>("wedding");
  const [ruleScopeId, setRuleScopeId] = createSignal("");
  const [ruleEffect, setRuleEffect] = createSignal<WeddingBoundaryRuleEffect>("require_approval");
  const [ruleAuthority, setRuleAuthority] = createSignal<WeddingBoundaryRuleAuthority>("couple");
  const [ruleEffectiveUntil, setRuleEffectiveUntil] = createSignal("");
  const [reviewingRequestId, setReviewingRequestId] = createSignal<string | null>(null);
  const [reviewingDecision, setReviewingDecision] = createSignal<WeddingBoundaryRequestDecision>("approve");
  const [savingDraft, setSavingDraft] = createSignal(false);
  const [editingHouseholdId, setEditingHouseholdId] = createSignal<string | null>(null);
  const [householdGroupLabel, setHouseholdGroupLabel] = createSignal("");
  const [householdAllocation, setHouseholdAllocation] = createSignal("");
  const [householdDeadline, setHouseholdDeadline] = createSignal("");
  const viewState = createMemo(() => buildWeddingBoundaryManagementViewState(props));
  const visibleApprovalItems = createMemo(() => visibleWeddingBoundaryApprovalItems(
    viewState().approvalItems,
    completedRequestIds(),
  ));
  const pendingReviewCount = createMemo(() => visibleWeddingBoundaryApprovalCount(
    props.state.approvalQueue.map((request) => request.requestId),
    completedRequestIds(),
  ));
  const reviewingRequest = createMemo(() => props.state.approvalQueue.find((request) => request.requestId === reviewingRequestId()) ?? null);
  const decisionPreview = createMemo(() => {
    const request = reviewingRequest();
    return request ? previewWeddingBoundaryRequestDecision({ request, objects: props.state.allObjects }) : null;
  });

  function focusSection(id: string): void {
    queueMicrotask(() => document.getElementById(id)?.focus());
  }

  function toggleExpanded(): void {
    if (expanded()) {
      setExpanded(false);
      queueMicrotask(() => disclosureButton?.focus());
      return;
    }
    setExpanded(true);
    focusSection("wedding-family-boundary-details");
  }

  function openRequests(): void {
    setExpanded(true);
    setShowRequests(true);
    focusSection("wedding-boundary-requests");
  }

  function openHouseholds(): void {
    setExpanded(true);
    setShowPeople(true);
    focusSection("wedding-boundary-people");
  }

  function beginHouseholdEdit(household: WeddingBoundaryHouseholdRow): void {
    setEditingHouseholdId(household.householdId);
    setHouseholdGroupLabel(household.familyGroupLabel === "Not grouped" ? "" : household.familyGroupLabel);
    setHouseholdAllocation(household.invitationAllocation === null ? "" : String(household.invitationAllocation));
    setHouseholdDeadline(household.requestDeadline ?? "");
  }

  async function saveHousehold(): Promise<void> {
    const householdId = editingHouseholdId();
    if (!householdId || !props.onSaveHousehold || savingDraft()) return;
    const allocationText = householdAllocation().trim();
    const allocation = allocationText ? Number(allocationText) : null;
    if (allocation !== null && (!Number.isInteger(allocation) || allocation < 0)) {
      setDecisionNotice("Enter a whole-number invitation allocation, or leave it blank.");
      return;
    }
    setSavingDraft(true);
    setDecisionNotice(null);
    try {
      const notice = await props.onSaveHousehold({
        householdId,
        familyGroupLabel: householdGroupLabel(),
        invitationAllocation: allocation,
        requestDeadline: householdDeadline().trim() || null,
      });
      setDecisionNotice(notice);
      setEditingHouseholdId(null);
    } catch (error) {
      setDecisionNotice(weddingBoundaryDecisionNoticeFromError(error));
    } finally {
      setSavingDraft(false);
    }
  }

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
        targetHouseholdId: requestHouseholdId(),
        proposedGuestName: proposedGuestName(),
      });
      setDecisionNotice(notice);
      setRequesterLabel("");
      setRequestLabel("");
      setRequestHouseholdId("");
      setProposedGuestName("");
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
        scopeKind: ruleScopeKind(),
        scopeId: ruleScopeId(),
        effect: ruleEffect(),
        authority: ruleAuthority(),
        effectiveUntil: ruleEffectiveUntil(),
      });
      setDecisionNotice(notice);
      setRuleTitle("");
      setRuleText("");
      setRuleScopeId("");
      setRuleEffectiveUntil("");
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
          ref={disclosureButton}
          type="button"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl text-cyan-950 transition hover:bg-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
          aria-expanded={expanded()}
          aria-controls="wedding-family-boundary-details"
          aria-label={expanded() ? "Close family boundaries" : "Open family boundaries"}
          onClick={toggleExpanded}
        >
          <span aria-hidden="true" class={`transition-transform ${expanded() ? "rotate-90" : ""}`}>›</span>
        </button>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-3" aria-label="Family boundary summary">
        <button type="button" class="min-h-[7.5rem] rounded-2xl border border-cyan-100 bg-white/80 p-4 text-left transition hover:border-cyan-300" onClick={openRequests}>
          <span class="block text-sm font-semibold text-cyan-950/70">Requests</span>
          <span class="mt-2 block text-3xl font-semibold text-cyan-950">{pendingReviewCount()}</span>
          <span class="mt-1 block text-xs font-semibold text-cyan-900/70">{pendingReviewCount() === 0 ? "Nothing needs review" : "Need review"}</span>
        </button>
        <button type="button" class="min-h-[7.5rem] rounded-2xl border border-cyan-100 bg-white/80 p-4 text-left transition hover:border-cyan-300" onClick={openHouseholds}>
          <span class="block text-sm font-semibold text-cyan-950/70">Households</span>
          <span class="mt-2 block text-3xl font-semibold text-cyan-950">{props.state.householdCount}</span>
          <span class="mt-1 block text-xs font-semibold text-cyan-900/70">Invitation groups</span>
        </button>
      </div>

      <Show when={expanded()}>
      <div id="wedding-family-boundary-details" tabindex="-1" class="focus:outline-none">
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
          <div class="mt-2 grid gap-2 md:grid-cols-2">
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
            <label class="min-w-0">
              <span class="text-xs font-semibold text-cyan-950/70">Household affected</span>
              <select class="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-950 outline-none focus:border-cyan-400" value={requestHouseholdId()} onChange={(event) => setRequestHouseholdId(event.currentTarget.value)}>
                <option value="">Choose a household</option>
                <For each={props.state.householdRows ?? []}>{(household) => <option value={household.householdId}>{household.displayName}</option>}</For>
              </select>
            </label>
            <Show when={requestChangeType() === "add_guest"}>
              <label class="min-w-0">
                <span class="text-xs font-semibold text-cyan-950/70">Guest name</span>
                <input class="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-950 outline-none focus:border-cyan-400" value={proposedGuestName()} placeholder="Full name" onInput={(event) => setProposedGuestName(event.currentTarget.value)} />
              </label>
            </Show>
          </div>
          <button type="button" class="mt-3 rounded-full bg-cyan-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50" disabled={!requestLabel().trim() || !requestHouseholdId() || (requestChangeType() === "add_guest" && !proposedGuestName().trim()) || savingDraft()} onClick={() => void saveFamilyRequest()}>
            {savingDraft() ? "Saving..." : "Save for review"}
          </button>
        </div>
      </Show>

      <Show when={showAddRule()}>
        <div id="wedding-boundary-add-rule" class="mt-3 rounded-2xl border border-cyan-100 bg-white/80 p-3">
          <p class="text-sm font-semibold text-cyan-950">Add a boundary rule</p>
          <div class="mt-2 grid gap-2 md:grid-cols-2">
            <label class="min-w-0">
              <span class="text-xs font-semibold text-cyan-950/70">Rule name</span>
              <input class="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-950 outline-none focus:border-cyan-400" value={ruleTitle()} placeholder="Guest limit" onInput={(event) => setRuleTitle(event.currentTarget.value)} />
            </label>
            <label class="min-w-0">
              <span class="text-xs font-semibold text-cyan-950/70">Rule type</span>
              <select class="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-950 outline-none focus:border-cyan-400" value={ruleType()} onChange={(event) => setRuleType(event.currentTarget.value as WeddingBoundaryPolicyRuleType)}>
                <option value="invitation_scope">Guest list</option>
                <option value="allocation">Allocation</option>
                <option value="deadline">Deadline</option>
                <option value="visibility">Visibility</option>
                <option value="plus_one">Plus-ones</option>
                <option value="children">Children</option>
                <option value="seating">Seating</option>
                <option value="communication">Messages</option>
              </select>
            </label>
            <label class="min-w-0">
              <span class="text-xs font-semibold text-cyan-950/70">Applies to</span>
              <select class="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-950" value={ruleScopeKind()} onChange={(event) => setRuleScopeKind(event.currentTarget.value as WeddingBoundaryRuleScopeKind)}>
                <option value="wedding">Whole wedding</option>
                <option value="family_group">Family group</option>
                <option value="household">Household</option>
                <option value="guest">One guest</option>
              </select>
            </label>
            <Show when={ruleScopeKind() !== "wedding"}>
              <label class="min-w-0">
                <span class="text-xs font-semibold text-cyan-950/70">Group, household, or guest reference</span>
                <input class="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-950" value={ruleScopeId()} onInput={(event) => setRuleScopeId(event.currentTarget.value)} />
              </label>
            </Show>
            <label class="min-w-0">
              <span class="text-xs font-semibold text-cyan-950/70">What happens</span>
              <select class="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-950" value={ruleEffect()} onChange={(event) => setRuleEffect(event.currentTarget.value as WeddingBoundaryRuleEffect)}>
                <option value="require_approval">Ask us to approve</option>
                <option value="deny">Do not allow</option>
                <option value="allow">Allow within this scope</option>
                <option value="limit">Apply a limit</option>
                <option value="notify">Notify us</option>
              </select>
            </label>
            <label class="min-w-0">
              <span class="text-xs font-semibold text-cyan-950/70">Approval authority</span>
              <select class="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-950" value={ruleAuthority()} onChange={(event) => setRuleAuthority(event.currentTarget.value as WeddingBoundaryRuleAuthority)}>
                <option value="couple">Either partner</option>
                <option value="partner_pair">Both partners</option>
                <option value="planner">Delegated planner</option>
              </select>
            </label>
            <label class="min-w-0">
              <span class="text-xs font-semibold text-cyan-950/70">Ends on (optional)</span>
              <input type="date" class="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-950" value={ruleEffectiveUntil()} onInput={(event) => setRuleEffectiveUntil(event.currentTarget.value)} />
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
        <div id="wedding-boundary-requests" tabindex="-1" class="mt-3 space-y-2 focus:outline-none">
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
                        onClick={() => { setReviewingRequestId(item.id); setReviewingDecision("approve"); }}
                      >
                        {decidingRequestId() === item.id ? "Saving..." : "Review impact"}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(decidingRequestId())}
                        class="rounded-full border border-cyan-200 bg-white/85 px-3 py-2 text-xs font-semibold text-cyan-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:py-1.5"
                        onClick={() => { setReviewingRequestId(item.id); setReviewingDecision("decline"); }}
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
        <div id="wedding-boundary-people" tabindex="-1" class="mt-3 rounded-2xl border border-cyan-100 bg-white/75 p-3 focus:outline-none">
          <p class="text-sm font-semibold text-cyan-950">Households</p>
          <p class="mt-1 text-xs leading-5 text-cyan-950/65">Invitation groups are shown separately from residential addresses. Requests needing attention appear first.</p>
          <div class="mt-3 grid gap-2">
            <Show when={(props.state.householdRows ?? []).length > 0} fallback={<p class="rounded-xl bg-cyan-50 px-3 py-2 text-xs leading-5 text-cyan-950/70">No households yet. Add guests to create invitation groups.</p>}>
              <For each={props.state.householdRows ?? []}>
                {(household) => (
                  <article class="rounded-xl border border-cyan-100 bg-white p-3">
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div class="min-w-0">
                        <p class="break-words text-sm font-semibold text-cyan-950">{household.displayName}</p>
                        <p class="mt-0.5 text-xs leading-5 text-cyan-950/65">{household.familyGroupLabel} · Representative: {household.representativeLabel}</p>
                      </div>
                      <Show when={household.attentionLabels.length > 0} fallback={<span class="self-start rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800">No immediate review</span>}>
                        <span class="self-start rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900">{household.attentionLabels[0]}</span>
                      </Show>
                    </div>
                    <div class="mt-2 grid gap-1 text-xs leading-5 text-cyan-950/70 sm:grid-cols-2">
                      <p>{household.memberCount} named member{household.memberCount === 1 ? "" : "s"} · {household.namedInvitationCount} invited</p>
                      <p>{household.invitationAllocation === null ? "Allocation not set" : `${household.remainingAllocation ?? 0} of ${household.invitationAllocation} places remaining`}</p>
                      <p class="sm:col-span-2">{household.rsvpLabel}</p>
                    </div>
                    <Show when={props.onSaveHousehold}>
                      <button type="button" class="mt-2 rounded-full border border-cyan-200 bg-white px-3 py-2 text-xs font-semibold text-cyan-950 transition hover:bg-cyan-50" onClick={() => editingHouseholdId() === household.householdId ? setEditingHouseholdId(null) : beginHouseholdEdit(household)}>
                        {editingHouseholdId() === household.householdId ? "Close household details" : "Edit group and allocation"}
                      </button>
                    </Show>
                    <Show when={editingHouseholdId() === household.householdId}>
                      <div class="mt-3 grid gap-3 rounded-xl bg-cyan-50/75 p-3 sm:grid-cols-3">
                        <label class="min-w-0">
                          <span class="text-xs font-semibold text-cyan-950/70">Family group</span>
                          <input class="mt-1 min-h-11 w-full rounded-lg border border-cyan-200 bg-white px-3 text-sm" value={householdGroupLabel()} placeholder="Shared friends" onInput={(event) => setHouseholdGroupLabel(event.currentTarget.value)} />
                        </label>
                        <label class="min-w-0">
                          <span class="text-xs font-semibold text-cyan-950/70">Invitation allocation</span>
                          <input type="number" min="0" step="1" inputmode="numeric" class="mt-1 min-h-11 w-full rounded-lg border border-cyan-200 bg-white px-3 text-sm" value={householdAllocation()} placeholder="No limit set" onInput={(event) => setHouseholdAllocation(event.currentTarget.value)} />
                        </label>
                        <label class="min-w-0">
                          <span class="text-xs font-semibold text-cyan-950/70">Request deadline</span>
                          <input type="date" class="mt-1 min-h-11 w-full rounded-lg border border-cyan-200 bg-white px-3 text-sm" value={householdDeadline()} onInput={(event) => setHouseholdDeadline(event.currentTarget.value)} />
                        </label>
                        <div class="flex flex-wrap gap-2 sm:col-span-3">
                          <button type="button" disabled={savingDraft()} class="min-h-11 rounded-full bg-cyan-700 px-4 text-xs font-semibold text-white disabled:opacity-50" onClick={() => void saveHousehold()}>{savingDraft() ? "Saving..." : "Save household"}</button>
                          <button type="button" class="min-h-11 rounded-full border border-cyan-200 bg-white px-4 text-xs font-semibold text-cyan-950" onClick={() => setEditingHouseholdId(null)}>Cancel</button>
                        </div>
                      </div>
                    </Show>
                  </article>
                )}
              </For>
            </Show>
          </div>
          <p class="mt-4 text-sm font-semibold text-cyan-950">Visibility map</p>
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

      <Show when={reviewingRequest()}>
        {(request) => (
          <div class="fixed inset-0 z-[80] flex items-end justify-center bg-cyan-950/45 p-3 sm:items-center" role="presentation">
            <section role="dialog" aria-modal="true" aria-labelledby="wedding-boundary-confirm-title" class="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
              <h3 id="wedding-boundary-confirm-title" class="text-xl font-bold text-cyan-950">
                {reviewingDecision() === "approve" ? "Approve this family request?" : "Keep the guest list unchanged?"}
              </h3>
              <p class="mt-2 text-sm leading-6 text-cyan-950/75">{request().title}</p>
              <Show when={reviewingDecision() === "approve" && decisionPreview()}>
                {(impact) => (
                  <div class="mt-3 rounded-2xl bg-cyan-50 p-3">
                    <p class="text-sm font-semibold text-cyan-950">What OmnyID will recheck</p>
                    <p class="mt-1 text-sm leading-6 text-cyan-950/75">{impact().impactAreas.map((area) => area.replaceAll("_", " ")).join(", ")}</p>
                    <ul class="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-cyan-950/75">
                      <For each={impact().warnings}>{(warning) => <li>{warning}</li>}</For>
                    </ul>
                  </div>
                )}
              </Show>
              <div class="mt-5 grid grid-cols-2 gap-3">
                <button type="button" class="min-h-12 rounded-2xl border border-cyan-200 bg-white px-4 font-semibold text-cyan-950" onClick={() => setReviewingRequestId(null)}>Cancel</button>
                <button type="button" disabled={Boolean(decidingRequestId()) || (reviewingDecision() === "approve" && decisionPreview()?.canApply === false)} class="min-h-12 rounded-2xl bg-cyan-700 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={() => { const id = request().requestId; const decision = reviewingDecision(); setReviewingRequestId(null); void decideRequest(id, decision); }}>
                  {reviewingDecision() === "approve" ? "Confirm approval" : "Confirm unchanged"}
                </button>
              </div>
            </section>
          </div>
        )}
      </Show>
    </div>
  );
}
