// @locs-version: 2.0
import { createMemo, createSignal, For, Show } from "solid-js";

import { WeddingDashboardIcon } from "@/components/WeddingDashboardIcons";
import { WeddingInfoTip } from "@/components/WeddingInfoTip";
import WeddingBoundaryRequestLifecyclePanel from "@/components/WeddingBoundaryRequestLifecyclePanel";
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
  WeddingBoundaryGuestProfile,
  WeddingBoundaryPolicy,
  WeddingBoundaryPolicyRuleType,
  WeddingBoundaryRoleAssignment,
  WeddingBoundaryState,
} from "@/lib/weddingBoundaryLedgerState";
import type { WeddingBoundaryTopologyState } from "@/lib/weddingBoundaryTopologyState";
import type { WeddingBoundaryHouseholdRow } from "@/lib/weddingBoundaryHouseholdState";
import { previewWeddingBoundaryHouseholdCommand, previewWeddingBoundaryPolicyChange, previewWeddingBoundaryRequestDecision, validateWeddingBoundaryRuleDraft } from "@/lib/weddingBoundaryGovernanceState";
import type { WeddingBoundaryRuleReplacement } from "@/lib/weddingBoundaryGovernanceApi";
import type { WeddingBoundaryHouseholdCommand } from "@/lib/weddingBoundaryGovernanceApi";
import type {
  WeddingBoundaryRuleAuthority,
  WeddingBoundaryRuleEffect,
  WeddingBoundaryRuleScopeKind,
} from "@/lib/weddingBoundaryGovernanceTypes";

export function WeddingBoundaryManagementCard(props: {
  state: WeddingBoundaryState;
  topology: WeddingBoundaryTopologyState;
  onDecideRequest?: (requestId: string, decision: WeddingBoundaryRequestDecision, approvalActorId?: string, confirmedElevatedImpact?: boolean) => Promise<string>;
  onTransitionRequest?: (requestId: string, operation: "submit" | "withdraw") => Promise<string>;
  onSaveFamilyRequest?: (input: { requesterLabel: string; requestLabel: string; changeType: WeddingBoundaryChangeType; targetHouseholdId: string; proposedGuestName: string; requiredApprovalCount: 1 | 2 }) => Promise<string>;
  onSaveFamilyRule?: (input: { title: string; plainLanguage: string; ruleType: WeddingBoundaryPolicyRuleType; scopeKind: WeddingBoundaryRuleScopeKind; scopeId: string; effect: WeddingBoundaryRuleEffect; authority: WeddingBoundaryRuleAuthority; effectiveUntil: string; condition: Record<string, unknown> }) => Promise<string>;
  onChangeFamilyRule?: (input: { operation: "archive_rule" | "supersede_rule"; rule: WeddingBoundaryPolicy; replacement?: WeddingBoundaryRuleReplacement; confirmedElevatedImpact: boolean }) => Promise<string>;
  onSaveHousehold?: (input: { householdId: string; familyGroupLabel: string; invitationAllocation: number | null; requestDeadline: string | null }) => Promise<string>;
  onApplyHouseholdCommand?: (input: Omit<WeddingBoundaryHouseholdCommand, "weddingPlanId" | "responseWorkspaceId" | "idempotencyKey">) => Promise<string>;
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
  const [requiredApprovalCount, setRequiredApprovalCount] = createSignal<1 | 2>(1);
  const [approvalActorId, setApprovalActorId] = createSignal("");
  const [ruleTitle, setRuleTitle] = createSignal("");
  const [ruleText, setRuleText] = createSignal("");
  const [ruleType, setRuleType] = createSignal<WeddingBoundaryPolicyRuleType>("invitation_scope");
  const [ruleScopeKind, setRuleScopeKind] = createSignal<WeddingBoundaryRuleScopeKind>("wedding");
  const [ruleScopeId, setRuleScopeId] = createSignal("");
  const [ruleEffect, setRuleEffect] = createSignal<WeddingBoundaryRuleEffect>("require_approval");
  const [ruleAuthority, setRuleAuthority] = createSignal<WeddingBoundaryRuleAuthority>("couple");
  const [ruleEffectiveUntil, setRuleEffectiveUntil] = createSignal("");
  const [ruleConditionValue, setRuleConditionValue] = createSignal("");
  const [replacingRuleId, setReplacingRuleId] = createSignal<string | null>(null);
  const [reviewingRuleId, setReviewingRuleId] = createSignal<string | null>(null);
  const [reviewingRuleOperation, setReviewingRuleOperation] = createSignal<"archive_rule" | "supersede_rule">("archive_rule");
  const [reviewingRequestId, setReviewingRequestId] = createSignal<string | null>(null);
  const [reviewingDecision, setReviewingDecision] = createSignal<WeddingBoundaryRequestDecision>("approve");
  const [savingDraft, setSavingDraft] = createSignal(false);
  const [editingHouseholdId, setEditingHouseholdId] = createSignal<string | null>(null);
  const [householdGroupLabel, setHouseholdGroupLabel] = createSignal("");
  const [householdAllocation, setHouseholdAllocation] = createSignal("");
  const [householdDeadline, setHouseholdDeadline] = createSignal("");
  const [organisingHouseholdId, setOrganisingHouseholdId] = createSignal<string | null>(null);
  const [splitHouseholdLabel, setSplitHouseholdLabel] = createSignal("");
  const [splitPersonIds, setSplitPersonIds] = createSignal<string[]>([]);
  const [mergeTargetHouseholdId, setMergeTargetHouseholdId] = createSignal("");
  const [pendingHouseholdCommand, setPendingHouseholdCommand] = createSignal<Omit<WeddingBoundaryHouseholdCommand, "weddingPlanId" | "responseWorkspaceId" | "idempotencyKey" | "confirmedElevatedImpact"> | null>(null);
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
  const coupleApprovers = createMemo(() => props.state.allObjects.filter((object): object is WeddingBoundaryRoleAssignment => object.kind === "wedding_boundary_role_assignment" && object.role === "couple" && object.status !== "archived"));
  const activePolicies = createMemo(() => props.state.allObjects.filter((object): object is WeddingBoundaryPolicy => object.kind === "wedding_boundary_policy" && (object.ruleStatus ?? object.status ?? "active") === "active"));
  const reviewingRule = createMemo(() => activePolicies().find((policy) => policy.id === reviewingRuleId()) ?? null);
  const ruleChangePreview = createMemo(() => {
    const policy = reviewingRule();
    return policy ? previewWeddingBoundaryPolicyChange({ policy, nextStatus: reviewingRuleOperation() === "archive_rule" ? "archived" : "superseded", objects: props.state.allObjects }) : null;
  });
  const householdCommandPreview = createMemo(() => {
    const command = pendingHouseholdCommand();
    if (!command) return null;
    if (command.operation === "split_household") return previewWeddingBoundaryHouseholdCommand({
      command: { kind: "split_household", sourceHouseholdId: command.sourceHouseholdIds[0] ?? "", newHouseholdId: command.newHouseholdId ?? "", movePersonIds: command.movePersonIds ?? [] },
      objects: props.state.allObjects,
    });
    if (command.operation === "merge_households") return previewWeddingBoundaryHouseholdCommand({
      command: { kind: "merge_households", sourceHouseholdIds: command.sourceHouseholdIds, targetHouseholdId: command.targetHouseholdId ?? "" },
      objects: props.state.allObjects,
    });
    return previewWeddingBoundaryHouseholdCommand({ command: { kind: "archive_household", householdId: command.sourceHouseholdIds[0] ?? "" }, objects: props.state.allObjects });
  });
  const guestProfiles = createMemo(() => props.state.allObjects.filter((object): object is WeddingBoundaryGuestProfile => object.kind === "wedding_boundary_guest_profile" && object.status !== "archived"));

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

  async function decideRequest(requestId: string, decision: WeddingBoundaryRequestDecision, actorId?: string, confirmedElevatedImpact = false): Promise<void> {
    if (!props.onDecideRequest || decidingRequestId()) return;
    setDecisionNotice(null);
    setDecidingRequestId(requestId);
    try {
      const notice = await props.onDecideRequest(requestId, decision, actorId, confirmedElevatedImpact);
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
        requiredApprovalCount: requiredApprovalCount(),
      });
      setDecisionNotice(notice);
      setRequesterLabel("");
      setRequestLabel("");
      setRequestHouseholdId("");
      setProposedGuestName("");
      setRequiredApprovalCount(1);
      setShowAddRequest(false);
      setShowRequests(true);
    } catch (error) {
      setDecisionNotice(weddingBoundaryDecisionNoticeFromError(error));
    } finally {
      setSavingDraft(false);
    }
  }
  function resetRuleDraft(): void {
    setRuleTitle("");
    setRuleText("");
    setRuleType("invitation_scope");
    setRuleScopeKind("wedding");
    setRuleScopeId("");
    setRuleEffect("require_approval");
    setRuleAuthority("couple");
    setRuleEffectiveUntil("");
    setRuleConditionValue("");
    setReplacingRuleId(null);
  }
  function beginRuleReplacement(policy: WeddingBoundaryPolicy): void {
    setRuleTitle(policy.title);
    setRuleText(policy.plainLanguage);
    setRuleType(policy.ruleType);
    setRuleScopeKind(policy.scopeKind ?? "wedding");
    setRuleScopeId(policy.scopeId ?? "");
    setRuleEffect(policy.effect ?? (policy.enforcement === "block" ? "deny" : policy.enforcement === "require_approval" ? "require_approval" : "notify"));
    setRuleAuthority(policy.authority ?? "couple");
    setRuleEffectiveUntil(policy.effectiveUntil ?? "");
    setRuleConditionValue(policy.ruleType === "allocation"
      ? String(policy.condition?.maximum_guest_count ?? "")
      : policy.ruleType === "deadline"
        ? String(policy.condition?.request_deadline ?? "")
        : "");
    setReplacingRuleId(policy.id);
    setShowAddRule(true);
    setShowRules(false);
    focusSection("wedding-boundary-add-rule");
  }
  async function saveFamilyRule(confirmed = false): Promise<void> {
    if (savingDraft()) return;
    const replacementId = replacingRuleId();
    if (replacementId && !confirmed) {
      setReviewingRuleId(replacementId);
      setReviewingRuleOperation("supersede_rule");
      return;
    }
    if (!props.onSaveFamilyRule) {
      setDecisionNotice(weddingBoundaryDraftSaveUnavailableNotice("rule"));
      return;
    }
    setDecisionNotice(null);
    setSavingDraft(true);
    try {
      const authority = ruleAuthority();
      const condition = ruleType() === "allocation"
        ? { maximum_guest_count: ruleConditionValue().trim() ? Number(ruleConditionValue()) : Number.NaN }
        : ruleType() === "deadline"
          ? { request_deadline: ruleConditionValue() }
          : {};
      const validationNotice = validateWeddingBoundaryRuleDraft({ ruleType: ruleType(), scopeKind: ruleScopeKind(), scopeId: ruleScopeId(), condition });
      if (validationNotice) {
        setDecisionNotice(validationNotice);
        return;
      }
      const replacement: WeddingBoundaryRuleReplacement = {
        title: ruleTitle().trim() || "Family boundary rule",
        plainLanguage: ruleText(),
        ruleType: ruleType(),
        scopeKind: ruleScopeKind(),
        scopeId: ruleScopeId() || undefined,
        effect: ruleEffect(),
        authority: authority === "system" ? "couple" : authority,
        effectiveUntil: ruleEffectiveUntil() || undefined,
        condition,
      };
      const currentRule = replacementId ? activePolicies().find((policy) => policy.id === replacementId) : null;
      const notice = currentRule && props.onChangeFamilyRule
        ? await props.onChangeFamilyRule({ operation: "supersede_rule", rule: currentRule, replacement, confirmedElevatedImpact: ruleChangePreview()?.requiresElevatedConfirmation === true })
        : await props.onSaveFamilyRule({ ...replacement, scopeId: replacement.scopeId ?? "", effectiveUntil: replacement.effectiveUntil ?? "", condition });
      setDecisionNotice(notice);
      resetRuleDraft();
      setReviewingRuleId(null);
      setShowAddRule(false);
      setShowRules(true);
    } catch (error) {
      setDecisionNotice(weddingBoundaryDecisionNoticeFromError(error));
    } finally {
      setSavingDraft(false);
    }
  }
  async function archiveRule(confirmed = false): Promise<void> {
    const policy = reviewingRule();
    if (!policy || !props.onChangeFamilyRule || savingDraft()) return;
    if (!confirmed) return;
    setSavingDraft(true);
    setDecisionNotice(null);
    try {
      const notice = await props.onChangeFamilyRule({
        operation: "archive_rule",
        rule: policy,
        confirmedElevatedImpact: ruleChangePreview()?.requiresElevatedConfirmation === true,
      });
      setDecisionNotice(notice);
      setReviewingRuleId(null);
    } catch (error) {
      setDecisionNotice(weddingBoundaryDecisionNoticeFromError(error));
    } finally {
      setSavingDraft(false);
    }
  }
  function expectedHouseholdRevisions(ids: string[]): Record<string, number> {
    return Object.fromEntries(ids.map((id) => {
      const household = (props.state.householdObjects ?? []).find((item) => item.householdId === id);
      return [id, household?.revision ?? 1];
    }));
  }
  function reviewHouseholdCommand(operation: "split_household" | "merge_households" | "archive_household", householdId: string): void {
    if (operation === "split_household") {
      const newHouseholdLabel = splitHouseholdLabel().trim();
      if (!newHouseholdLabel || splitPersonIds().length === 0) {
        setDecisionNotice("Name the new household and choose who moves into it.");
        return;
      }
      const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
      setPendingHouseholdCommand({ operation, sourceHouseholdIds: [householdId], expectedRevisions: expectedHouseholdRevisions([householdId]), newHouseholdId: `household:split:${nonce}`, newHouseholdLabel, movePersonIds: splitPersonIds() });
      return;
    }
    if (operation === "merge_households") {
      const target = mergeTargetHouseholdId();
      if (!target || target === householdId) {
        setDecisionNotice("Choose a different household to merge with this one.");
        return;
      }
      const ids = [householdId, target];
      setPendingHouseholdCommand({ operation, sourceHouseholdIds: ids, expectedRevisions: expectedHouseholdRevisions(ids), targetHouseholdId: target });
      return;
    }
    setPendingHouseholdCommand({ operation, sourceHouseholdIds: [householdId], expectedRevisions: expectedHouseholdRevisions([householdId]) });
  }
  async function applyHouseholdCommand(): Promise<void> {
    const command = pendingHouseholdCommand();
    if (!command || !props.onApplyHouseholdCommand || savingDraft() || householdCommandPreview()?.canApply === false) return;
    setSavingDraft(true);
    setDecisionNotice(null);
    try {
      const notice = await props.onApplyHouseholdCommand({ ...command, confirmedElevatedImpact: householdCommandPreview()?.requiresElevatedConfirmation === true });
      setDecisionNotice(notice);
      setPendingHouseholdCommand(null);
      setOrganisingHouseholdId(null);
      setSplitHouseholdLabel("");
      setSplitPersonIds([]);
      setMergeTargetHouseholdId("");
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
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p class="min-w-0 break-words text-lg font-bold tracking-tight text-cyan-950">Family boundaries</p>
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
          onClick={() => {
            const opening = !showAddRule();
            resetRuleDraft();
            setShowAddRule(opening);
          }}
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
            <label class="min-w-0">
              <span class="text-xs font-semibold text-cyan-950/70">Approval needed</span>
              <select class="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-950 outline-none focus:border-cyan-400" value={requiredApprovalCount()} onChange={(event) => setRequiredApprovalCount(event.currentTarget.value === "2" ? 2 : 1)}>
                <option value="1">One partner</option>
                <option value="2">Both partners</option>
              </select>
            </label>
          </div>
          <button type="button" class="mt-3 rounded-full bg-cyan-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50" disabled={!requestLabel().trim() || !requestHouseholdId() || (requestChangeType() === "add_guest" && !proposedGuestName().trim()) || savingDraft()} onClick={() => void saveFamilyRequest()}>
            {savingDraft() ? "Saving..." : "Save draft"}
          </button>
        </div>
      </Show>

      <Show when={showAddRule()}>
        <div id="wedding-boundary-add-rule" class="mt-3 rounded-2xl border border-cyan-100 bg-white/80 p-3">
          <p class="text-sm font-semibold text-cyan-950">{replacingRuleId() ? "Replace this boundary rule" : "Add a boundary rule"}</p>
          <Show when={replacingRuleId()}>
            <p class="mt-1 text-xs leading-5 text-cyan-950/65">Saving creates a new rule and keeps the earlier version in the audit history.</p>
          </Show>
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
            <Show when={ruleType() === "allocation"}>
              <label class="min-w-0">
                <span class="text-xs font-semibold text-cyan-950/70">Maximum guests</span>
                <input type="number" min="0" max="5000" step="1" class="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-950" value={ruleConditionValue()} onInput={(event) => setRuleConditionValue(event.currentTarget.value)} />
              </label>
            </Show>
            <Show when={ruleType() === "deadline"}>
              <label class="min-w-0">
                <span class="text-xs font-semibold text-cyan-950/70">Request deadline</span>
                <input type="date" class="mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-cyan-950" value={ruleConditionValue()} onInput={(event) => setRuleConditionValue(event.currentTarget.value)} />
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
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class="rounded-full bg-cyan-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50" disabled={!ruleText().trim() || savingDraft()} onClick={() => void saveFamilyRule()}>
              {savingDraft() ? "Saving..." : replacingRuleId() ? "Review replacement" : "Save rule"}
            </button>
            <Show when={replacingRuleId()}>
              <button type="button" class="rounded-full border border-cyan-200 bg-white px-3 py-2 text-xs font-semibold text-cyan-950" onClick={() => { resetRuleDraft(); setShowAddRule(false); setShowRules(true); }}>Cancel</button>
            </Show>
          </div>
        </div>
      </Show>

      <Show when={showRequests()}>
        <div id="wedding-boundary-requests" tabindex="-1" class="mt-3 space-y-2 focus:outline-none">
          <WeddingBoundaryRequestLifecyclePanel requests={props.state.requestObjects} onTransition={props.onTransitionRequest} onNotice={setDecisionNotice} />
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
                        onClick={() => { setApprovalActorId(""); setReviewingRequestId(item.id); setReviewingDecision("approve"); }}
                      >
                        {decidingRequestId() === item.id ? "Saving..." : "Review impact"}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(decidingRequestId())}
                        class="rounded-full border border-cyan-200 bg-white/85 px-3 py-2 text-xs font-semibold text-cyan-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:py-1.5"
                        onClick={() => { setApprovalActorId(""); setReviewingRequestId(item.id); setReviewingDecision("decline"); }}
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
          <Show when={activePolicies().length > 0} fallback={
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
            <For each={activePolicies().slice(0, 8)}>
              {(policy) => (
              <article class="rounded-2xl border border-cyan-100 bg-white/75 p-3">
                <div class="flex items-start justify-between gap-2">
                  <p class="break-words text-sm font-semibold text-cyan-950">{policy.title}</p>
                  <span class="rounded-full bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-900">
                    Version {policy.version ?? 1}
                  </span>
                </div>
                <p class="mt-1 text-xs leading-5 text-cyan-950/70">{policy.plainLanguage}</p>
                <Show when={props.onChangeFamilyRule}>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button type="button" class="min-h-11 rounded-full border border-cyan-200 bg-white px-3 text-xs font-semibold text-cyan-950" onClick={() => beginRuleReplacement(policy)}>Replace rule</button>
                    <button type="button" class="min-h-11 rounded-full border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-900" onClick={() => { setReviewingRuleId(policy.id); setReviewingRuleOperation("archive_rule"); }}>Archive rule</button>
                  </div>
                </Show>
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
                    <Show when={props.onApplyHouseholdCommand}>
                      <button type="button" class="ml-2 mt-2 rounded-full border border-cyan-200 bg-white px-3 py-2 text-xs font-semibold text-cyan-950 transition hover:bg-cyan-50" onClick={() => { setOrganisingHouseholdId(organisingHouseholdId() === household.householdId ? null : household.householdId); setEditingHouseholdId(null); setSplitHouseholdLabel(""); setSplitPersonIds([]); setMergeTargetHouseholdId(""); }}>
                        {organisingHouseholdId() === household.householdId ? "Close changes" : "Split, merge or archive"}
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
                    <Show when={organisingHouseholdId() === household.householdId}>
                      <div class="mt-3 grid gap-3 rounded-xl bg-cyan-50/75 p-3">
                        <div>
                          <p class="text-xs font-semibold text-cyan-950">Split into a new household</p>
                          <input class="mt-2 min-h-11 w-full rounded-lg border border-cyan-200 bg-white px-3 text-sm" value={splitHouseholdLabel()} placeholder="New household name" onInput={(event) => setSplitHouseholdLabel(event.currentTarget.value)} />
                          <div class="mt-2 grid gap-2 sm:grid-cols-2">
                            <For each={guestProfiles().filter((guest) => guest.householdId === household.householdId)}>{(guest) => (
                              <label class="flex min-h-11 items-center gap-2 rounded-lg border border-cyan-100 bg-white px-3 text-xs text-cyan-950">
                                <input type="checkbox" checked={splitPersonIds().includes(guest.personId)} onChange={(event) => setSplitPersonIds((current) => event.currentTarget.checked ? [...current, guest.personId] : current.filter((id) => id !== guest.personId))} />
                                <span>{guest.displayName}</span>
                              </label>
                            )}</For>
                          </div>
                          <button type="button" class="mt-2 min-h-11 rounded-full border border-cyan-200 bg-white px-4 text-xs font-semibold text-cyan-950" onClick={() => reviewHouseholdCommand("split_household", household.householdId)}>Review split</button>
                        </div>
                        <div class="border-t border-cyan-100 pt-3">
                          <label class="text-xs font-semibold text-cyan-950">Merge into another household</label>
                          <select class="mt-2 min-h-11 w-full rounded-lg border border-cyan-200 bg-white px-3 text-sm" value={mergeTargetHouseholdId()} onChange={(event) => setMergeTargetHouseholdId(event.currentTarget.value)}>
                            <option value="">Choose destination</option>
                            <For each={(props.state.householdRows ?? []).filter((item) => item.householdId !== household.householdId)}>{(item) => <option value={item.householdId}>{item.displayName}</option>}</For>
                          </select>
                          <button type="button" class="mt-2 min-h-11 rounded-full border border-cyan-200 bg-white px-4 text-xs font-semibold text-cyan-950" onClick={() => reviewHouseholdCommand("merge_households", household.householdId)}>Review merge</button>
                        </div>
                        <Show when={household.memberCount === 0}>
                          <div class="border-t border-cyan-100 pt-3">
                            <button type="button" class="min-h-11 rounded-full border border-rose-200 bg-white px-4 text-xs font-semibold text-rose-900" onClick={() => reviewHouseholdCommand("archive_household", household.householdId)}>Review archive</button>
                          </div>
                        </Show>
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
              <Show when={reviewingDecision() === "approve" && request().requiredApprovalCount === 2}>
                <label class="mt-3 block">
                  <span class="text-sm font-semibold text-cyan-950">Approving partner</span>
                  <select class="mt-1 min-h-12 w-full rounded-2xl border border-cyan-200 bg-white px-3 text-sm text-cyan-950" value={approvalActorId()} onChange={(event) => setApprovalActorId(event.currentTarget.value)}>
                    <option value="">Choose your partner identity</option>
                    <For each={coupleApprovers()}>{(role) => <option value={role.personId}>{role.title}</option>}</For>
                  </select>
                  <span class="mt-1 block text-xs leading-5 text-cyan-950/65">The first approval records progress only. Connected wedding data changes after a different partner approves.</span>
                </label>
              </Show>
              <div class="mt-5 grid grid-cols-2 gap-3">
                <button type="button" class="min-h-12 rounded-2xl border border-cyan-200 bg-white px-4 font-semibold text-cyan-950" onClick={() => { setReviewingRequestId(null); setApprovalActorId(""); }}>Cancel</button>
                <button type="button" disabled={Boolean(decidingRequestId()) || (reviewingDecision() === "approve" && decisionPreview()?.canApply === false) || (reviewingDecision() === "approve" && request().requiredApprovalCount === 2 && !approvalActorId())} class="min-h-12 rounded-2xl bg-cyan-700 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={() => { const id = request().requestId; const decision = reviewingDecision(); const actor = approvalActorId() || undefined; const elevated = decision === "approve" && decisionPreview()?.requiresElevatedConfirmation === true; setReviewingRequestId(null); setApprovalActorId(""); void decideRequest(id, decision, actor, elevated); }}>
                  {reviewingDecision() === "approve" ? "Confirm approval" : "Confirm unchanged"}
                </button>
              </div>
            </section>
          </div>
        )}
      </Show>

      <Show when={reviewingRule()}>
        {(policy) => (
          <div class="fixed inset-0 z-[80] flex items-end justify-center bg-cyan-950/45 p-3 sm:items-center" role="presentation">
            <section role="dialog" aria-modal="true" aria-labelledby="wedding-boundary-rule-confirm-title" class="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
              <h3 id="wedding-boundary-rule-confirm-title" class="text-xl font-bold text-cyan-950">
                {reviewingRuleOperation() === "archive_rule" ? "Archive this family rule?" : "Replace this family rule?"}
              </h3>
              <p class="mt-2 text-sm font-semibold text-cyan-950">{policy().title}</p>
              <p class="mt-1 text-sm leading-6 text-cyan-950/75">{policy().plainLanguage}</p>
              <Show when={ruleChangePreview()}>
                {(impact) => (
                  <div class="mt-3 rounded-2xl bg-cyan-50 p-3">
                    <p class="text-sm font-semibold text-cyan-950">What changes together</p>
                    <ul class="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-cyan-950/75">
                      <For each={impact().warnings}>{(warning) => <li>{warning}</li>}</For>
                    </ul>
                    <p class="mt-2 text-xs leading-5 text-cyan-950/65">{impact().affectedInvitationIds.length} invitation record{impact().affectedInvitationIds.length === 1 ? "" : "s"} will be rechecked. No invitation is sent and no attendance or spend is inferred.</p>
                  </div>
                )}
              </Show>
              <div class="mt-5 grid grid-cols-2 gap-3">
                <button type="button" class="min-h-12 rounded-2xl border border-cyan-200 bg-white px-4 font-semibold text-cyan-950" onClick={() => setReviewingRuleId(null)}>Cancel</button>
                <button type="button" disabled={savingDraft() || ruleChangePreview()?.canApply === false} class="min-h-12 rounded-2xl bg-cyan-700 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={() => reviewingRuleOperation() === "archive_rule" ? void archiveRule(true) : void saveFamilyRule(true)}>
                  {savingDraft() ? "Saving..." : reviewingRuleOperation() === "archive_rule" ? "Archive rule" : "Confirm replacement"}
                </button>
              </div>
            </section>
          </div>
        )}
      </Show>

      <Show when={pendingHouseholdCommand()}>
        <div class="fixed inset-0 z-[80] flex items-end justify-center bg-cyan-950/45 p-3 sm:items-center" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="wedding-household-command-title" class="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
            <h3 id="wedding-household-command-title" class="text-xl font-bold text-cyan-950">Confirm this household change?</h3>
            <Show when={householdCommandPreview()}>{(impact) => (
              <div class="mt-3 rounded-2xl bg-cyan-50 p-3">
                <p class="text-sm font-semibold text-cyan-950">What changes together</p>
                <ul class="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-cyan-950/75"><For each={impact().warnings}>{(warning) => <li>{warning}</li>}</For></ul>
                <p class="mt-2 text-xs leading-5 text-cyan-950/65">{impact().affectedPersonIds.length} guest record{impact().affectedPersonIds.length === 1 ? "" : "s"} and {impact().affectedInvitationIds.length} invitation record{impact().affectedInvitationIds.length === 1 ? "" : "s"} will be rechecked without deleting response history.</p>
              </div>
            )}</Show>
            <div class="mt-5 grid grid-cols-2 gap-3">
              <button type="button" class="min-h-12 rounded-2xl border border-cyan-200 bg-white px-4 font-semibold text-cyan-950" onClick={() => setPendingHouseholdCommand(null)}>Cancel</button>
              <button type="button" disabled={savingDraft() || householdCommandPreview()?.canApply === false} class="min-h-12 rounded-2xl bg-cyan-700 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void applyHouseholdCommand()}>{savingDraft() ? "Saving..." : "Confirm change"}</button>
            </div>
          </section>
        </div>
      </Show>
    </div>
  );
}
