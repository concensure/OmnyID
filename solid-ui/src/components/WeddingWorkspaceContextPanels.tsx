// @locs-version: 2.1
import { createMemo, createSignal, For, Show } from "solid-js";

import type { SendAfpMessageInput } from "@/lib/api";
import type {
  WeddingResponseWorkspaceViewState,
} from "@/lib/weddingResponseWorkspaceViewState";
import type {
  WeddingBoundaryChangeType,
  WeddingBoundaryPolicy,
  WeddingBoundaryPolicyRuleType,
} from "@/lib/weddingBoundaryLedgerState";
import type { WeddingBoundaryRuleAuthority, WeddingBoundaryRuleEffect, WeddingBoundaryRuleScopeKind } from "@/lib/weddingBoundaryGovernanceTypes";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";
import { WeddingAdvancedAuditPanels } from "@/components/WeddingAdvancedAuditPanels";
import { WeddingBackgroundAutomationCard } from "@/components/WeddingBackgroundAutomationCard";
import { WeddingBoundaryAccessManagementPanel } from "@/components/WeddingBoundaryAccessManagementPanel";
import { WeddingBoundaryManagementCard } from "@/components/WeddingBoundaryManagementCard";
import { WeddingBudgetTrackerCard } from "@/components/WeddingBudgetTrackerCard";
import { WeddingBudgetEvidenceHub } from "@/components/WeddingBudgetEvidenceHub";
import { WeddingCollaborationAccessCard } from "@/components/WeddingCollaborationAccessCard";
import { WeddingCustomSurfaceTools } from "@/components/WeddingCustomSurfaceTools";
import { WeddingDecisionFocusCard } from "@/components/WeddingDecisionFocusCard";
import { WeddingGuestOperationsCard } from "@/components/WeddingGuestOperationsCard";
import { WeddingRsvpSetupPanel } from "@/components/WeddingRsvpSetupPanel";
import { WeddingRsvpOperationsPanel } from "@/components/WeddingRsvpOperationsPanel";
import { WeddingHelpersPanel } from "@/components/WeddingHelpersPanel";
import { WeddingHomeOverviewGrid } from "@/components/WeddingHomeOverviewGrid";
import { WeddingImportantDetailsPanel } from "@/components/WeddingImportantDetailsPanel";
import { WeddingInspirationPanel } from "@/components/WeddingInspirationPanel";
import { WeddingMealChoiceCataloguePanel } from "@/components/WeddingMealChoiceCataloguePanel";
import { WeddingNextStepCard } from "@/components/WeddingNextStepCard";
import { WeddingPlanningTasksPanel } from "@/components/WeddingPlanningTasksPanel";
import { WeddingPeopleHub } from "@/components/WeddingPeopleHub";
import { WeddingProductionGateCard } from "@/components/WeddingProductionGateCard";
import { WeddingProductionRemainingWorkCard } from "@/components/WeddingProductionRemainingWorkCard";
import { WeddingSeatingPanel } from "@/components/WeddingSeatingPanel";
import { WeddingTimelinePanel } from "@/components/WeddingTimelinePanel";
import { WeddingVisionPanel } from "@/components/WeddingVisionPanel";
import type { WeddingBoundaryRequestDecision } from "@/lib/weddingBoundaryDecisionState";
import { applyWeddingBoundaryHouseholdCommand, applyWeddingBoundaryRuleCommand, decideWeddingBoundaryRequest, transitionWeddingBoundaryRequest, type WeddingBoundaryHouseholdCommand, type WeddingBoundaryRuleReplacement } from "@/lib/weddingBoundaryGovernanceApi";
import { weddingBoundaryLedgerObjectToAfpSendInput } from "@/lib/weddingBoundaryLedgerState";
import {
  applyWeddingFamilyBoundaryRequestEvaluation,
  buildWeddingFamilyBoundaryPolicyObject,
  buildWeddingFamilyBoundaryRequestObject,
  buildWeddingGuestBoundaryDraftObjects,
  buildWeddingGuestBoundaryRuleObjects,
} from "@/lib/weddingGuestBoundaryDraftState";
import {
  calendarActionLabel,
} from "@/lib/weddingWorkspaceSidebarActionState";
import { buildWeddingRecommendationGenerationAction } from "@/lib/weddingRecommendationGenerationActionState";
import {
  buildWeddingPeopleAggregateState,
  buildWeddingPlanAggregateState,
  type WeddingWorkspaceAggregateAction,
} from "@/lib/weddingWorkspaceAggregateState";
import { recordWeddingRsvpResponse } from "@/lib/weddingRsvpResponseState";
import { safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";
import { weddingVisionPreferenceRecordsFromAfpMessages, weddingVisionPreferenceToAfpSendInput } from "@/lib/weddingVisionPreferenceAfpState";
import {
  weddingRsvpSetupFromAfpMessages,
  weddingRsvpSetupToAfpSendInput,
  type WeddingRsvpSetupState,
} from "@/lib/weddingRsvpSetupState";
import {
  buildWeddingMealChoiceReplacementImpact,
  buildWeddingMealChoiceState,
  weddingMealChoiceCatalogueToAfpSendInput,
  type WeddingMealChoiceSource,
} from "@/lib/weddingMealChoiceState";

function weddingLocationAdviceLabel(state: WeddingResponseWorkspaceViewState): string {
  const locationLabel = state.workspace.artifacts
    .flatMap((artifact) => artifact.locationLabels)
    .find((label) => label.trim().length > 0);
  return locationLabel ?? "your wedding location";
}

function WeddingPanelSection(props: {
  label: string;
  detail: string;
  tone: "everyday" | "advanced";
}) {
  const toneClass = () => props.tone === "advanced"
    ? "border-slate-200/80 bg-slate-50/75 text-slate-800"
    : "border-rose-100/80 bg-rose-50/75 text-rose-950";
  return (
    <div class={`rounded-2xl border px-3 py-2 ${toneClass()}`}>
      <p class="text-sm font-semibold">{props.label}</p>
      <p class="mt-0.5 text-sm leading-6 opacity-75">{props.detail}</p>
    </div>
  );
}

export function WeddingWorkspaceContextPanels(props: {
  state: WeddingResponseWorkspaceViewState;
  showTechnicalDetails?: boolean;
  showHomeOverview?: boolean;
  activeMenu?: WeddingWorkspaceMenuId;
  sharePlanOpen?: boolean;
  contactUserId?: string | null;
  onToggleSharePlan?: () => void;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: () => void;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
  onOpenArtifact?: (artifactId: string) => void;
  onImportFiles?: (files: FileList) => void;
  onOpenSavedOutputs?: () => void;
  onSaveWeddingDate?: (date: string) => Promise<void> | void;
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
}) {
  const activeMenu = () => props.activeMenu ?? "home";
  const [quoteIntakeRequest, setQuoteIntakeRequest] = createSignal(0);
  const peopleAggregate = createMemo(() => buildWeddingPeopleAggregateState(props.state));
  const planAggregate = createMemo(() => buildWeddingPlanAggregateState(props.state, {
    sharePlanOpen: props.sharePlanOpen,
    sharePlanAvailable: Boolean(props.onToggleSharePlan),
  }));
  const rsvpSetup = createMemo(() => weddingRsvpSetupFromAfpMessages(
    props.state.afpMessages,
    props.state.workspace.metadata.responseWorkspaceId,
  ));
  const rsvpHostLabel = createMemo(() => props.state.contextCards
    .map((card) => card.planningContext?.familyOrStakeholderRoles?.trim() ?? "")
    .find(Boolean) || "The couple");
  const culturallyDiverseCelebration = createMemo(() => weddingVisionPreferenceRecordsFromAfpMessages({
    messages: props.state.afpMessages,
    metadata: props.state.workspace.metadata,
  }).some((record) => record.label === "Culturally diverse celebration"));
  const rsvpWeddingDate = createMemo(() => props.state.contextCards
    .map((card) => card.planningContext?.dateOrSeason?.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0] ?? "")
    .find(Boolean) || null);
  const mealChoiceState = createMemo(() => buildWeddingMealChoiceState(
    props.state.afpMessages,
    props.state.workspace.metadata.responseWorkspaceId,
  ));
  const budgetPreferenceSignals = createMemo(() => props.state.contextCards.flatMap((card) => [
    ...(card.planningContext?.topPriorities ?? []),
    card.planningContext?.atmosphereDescription ?? "",
    card.planningContext?.vendorPreferences ?? "",
    card.planningContext?.photographyScope ?? "",
    ...(card.planningContext?.inspirationImageUrls ?? []),
  ]).map((value) => value.trim()).filter(Boolean));
  function openAggregateAction(action: WeddingWorkspaceAggregateAction) {
    if (!action.enabled) return;
    if (action.targetMenu === "share_plan") {
      props.onToggleSharePlan?.();
      return;
    }
    props.onSelectMenu?.(action.targetMenu);
  }
  async function saveBudgetAllocation(input: SendAfpMessageInput) {
    if (!props.saveProjection) throw new Error("Saving is not connected yet.");
    await props.saveProjection(input);
    props.onRefreshWorkspace?.();
  }
  async function saveCulturallyDiverseCelebration(enabled: boolean): Promise<string> {
    if (!props.saveProjection) throw new Error("Saving is not connected yet.");
    await props.saveProjection(weddingVisionPreferenceToAfpSendInput({
      metadata: props.state.workspace.metadata,
      label: "Culturally diverse celebration",
      action: enabled ? "affirm_feel_tag" : "remove_feel_tag",
    }));
    props.onRefreshWorkspace?.();
    return enabled
      ? "Saved privately to RSVP, Inspiration and Vision. Choose only the traditions that fit you."
      : "Removed the cultural celebration preference from RSVP, Inspiration and Vision.";
  }
  async function saveBudgetContributorContact(input: SendAfpMessageInput) {
    if (!props.saveProjection) throw new Error("Saving is not connected yet.");
    // Creating a contact should not remount the budget card while the couple is
    // still entering the associated contribution.
    await props.saveProjection(input);
  }
  async function decideBoundaryRequest(requestId: string, decision: WeddingBoundaryRequestDecision, approvalActorId?: string, confirmedElevatedImpact?: boolean): Promise<string> {
    const request = props.state.boundaryState.approvalQueue.find((item) => item.requestId === requestId);
    if (!request) throw new Error("This guest-list request is no longer waiting for review.");
    const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
    const result = await decideWeddingBoundaryRequest({
      weddingPlanId: props.state.workspace.metadata.weddingPlanId,
      responseWorkspaceId: props.state.workspace.metadata.responseWorkspaceId,
      requestId,
      decision: decision === "approve" ? "approve" : "decline",
      expectedRevision: request.revision ?? 1,
      approvalActorId,
      confirmedElevatedImpact,
      idempotencyKey: `boundary:${requestId}:${request.revision ?? 1}:${decision}:${nonce}`,
    });
    props.onRefreshWorkspace?.();
    return result.connected_updates?.length
      ? `${result.explanation} ${result.connected_updates.join("; ")}.`
      : result.explanation;
  }
  async function transitionBoundaryRequest(requestId: string, operation: "submit" | "withdraw"): Promise<string> {
    const request = props.state.boundaryState.requestObjects.find((item) => item.requestId === requestId);
    if (!request) throw new Error("This family request is no longer available.");
    const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
    const result = await transitionWeddingBoundaryRequest({
      weddingPlanId: props.state.workspace.metadata.weddingPlanId,
      responseWorkspaceId: props.state.workspace.metadata.responseWorkspaceId,
      requestId,
      operation,
      expectedRevision: request.revision ?? 1,
      idempotencyKey: `boundary-transition:${requestId}:${request.revision ?? 1}:${operation}:${nonce}`,
    });
    props.onRefreshWorkspace?.();
    return result.explanation;
  }
  async function saveGuestDraft(input: {
    displayName: string;
    householdLabel: string;
    rsvpStatus: string;
    previousRsvpStatus?: string;
    plusOneAllowed: boolean;
    plusOneMode?: "none" | "named" | "unnamed";
    plusOneName?: string;
    childrenInvited: boolean;
    childName?: string;
    childAgeBand?: "adult" | "child_under_12" | "teen" | "unknown";
    childSeatRequirement?: "standard" | "high_chair" | "booster" | "none" | "unknown";
    childMealRequirement?: "adult" | "child" | "none" | "unknown";
    contactLabel: string;
    rsvpReminderPermission?: boolean;
    mealPreference: string;
    dietaryNote: string;
    accessibilityNote: string;
    personId?: string;
    invitationId?: string;
    eventId?: string;
    responseRevision?: number;
  }): Promise<string> {
    if (!props.saveProjection) throw new Error("Saving is not connected yet.");
    if (input.personId && input.invitationId && input.eventId && input.previousRsvpStatus) {
      const attendance = input.rsvpStatus === "Attending"
        ? "attending"
        : input.rsvpStatus === "Not attending"
          ? "not_attending"
          : "pending";
      const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
      const result = await recordWeddingRsvpResponse({
        weddingPlanId: props.state.workspace.metadata.weddingPlanId,
        responseWorkspaceId: props.state.workspace.metadata.responseWorkspaceId,
        invitationId: input.invitationId,
        personId: input.personId,
        eventId: input.eventId,
        attendance,
        expectedRevision: input.responseRevision ?? 0,
        idempotencyKey: `rsvp:${input.invitationId}:${input.responseRevision ?? 0}:${nonce}`,
      });
      props.onRefreshWorkspace?.();
      return result.explanation;
    }
    const objects = buildWeddingGuestBoundaryDraftObjects({
      displayName: input.displayName,
      householdLabel: input.householdLabel,
      rsvpStatus: input.rsvpStatus === "Attending" || input.rsvpStatus === "Not attending" ? input.rsvpStatus : "Pending",
      previousRsvpStatus: input.previousRsvpStatus === "Attending" || input.previousRsvpStatus === "Not attending" ? input.previousRsvpStatus : input.previousRsvpStatus === "Pending" ? "Pending" : null,
      plusOneAllowed: input.plusOneAllowed,
      plusOneMode: input.plusOneMode,
      plusOneName: input.plusOneName,
      childrenInvited: input.childrenInvited,
      childName: input.childName,
      childAgeBand: input.childAgeBand,
      childSeatRequirement: input.childSeatRequirement,
      childMealRequirement: input.childMealRequirement,
      contactLabel: input.contactLabel,
      rsvpReminderPermission: input.rsvpReminderPermission,
      mealPreference: input.mealPreference,
      dietaryNote: input.dietaryNote,
      accessibilityNote: input.accessibilityNote,
    }, props.state.workspace.metadata);
    if (objects.length === 0) throw new Error("Add a guest name before saving.");
    for (const object of objects) {
      await props.saveProjection(weddingBoundaryLedgerObjectToAfpSendInput(object, props.state.workspace.metadata));
    }
    props.onRefreshWorkspace?.();
    return "Guest saved to the wedding guest list.";
  }
  async function saveGuestRules(input: { plusOneRule: string; childrenRule: string }): Promise<string> {
    if (!props.saveProjection) throw new Error("Saving is not connected yet.");
    const objects = buildWeddingGuestBoundaryRuleObjects(input, props.state.workspace.metadata);
    if (objects.length === 0) throw new Error("Add at least one guest rule before saving.");
    for (const object of objects) {
      await props.saveProjection(weddingBoundaryLedgerObjectToAfpSendInput(object, props.state.workspace.metadata));
    }
    props.onRefreshWorkspace?.();
    return "Guest rules saved to family boundaries.";
  }
  async function saveRsvpSetup(setup: WeddingRsvpSetupState): Promise<string> {
    if (!props.saveProjection) throw new Error("Saving is not connected yet.");
    await props.saveProjection(weddingRsvpSetupToAfpSendInput(setup, props.state.workspace.metadata));
    props.onRefreshWorkspace?.();
    return "RSVP setup saved. No invitation or link was sent.";
  }
  async function saveMealChoices(input: { options: string[]; source: WeddingMealChoiceSource; sourceLabel: string; sourceMessageId?: string | null; confirmedAffectedResponses: boolean }): Promise<string> {
    if (!props.saveProjection) throw new Error("Saving is not connected yet.");
    const replacementImpact = buildWeddingMealChoiceReplacementImpact({
      current: mealChoiceState().confirmed,
      nextOptions: input.options,
      guests: props.state.guestTracking.guestRows ?? [],
    });
    const sendInput = weddingMealChoiceCatalogueToAfpSendInput({
      ...input,
      replacementImpact,
      currentRevision: mealChoiceState().confirmed?.revision ?? 0,
      metadata: props.state.workspace.metadata,
    });
    if (!sendInput) throw new Error(replacementImpact.requiresConfirmation
      ? "Review and confirm the affected guest responses before replacing these choices."
      : "Add at least two current meal choices before confirming them.");
    await props.saveProjection(sendInput);
    props.onRefreshWorkspace?.();
    return "Meal choices confirmed for this wedding.";
  }
  async function saveFamilyRequest(input: { requesterLabel: string; requestLabel: string; changeType: WeddingBoundaryChangeType; targetHouseholdId: string; proposedGuestName: string; requiredApprovalCount: 1 | 2 }): Promise<string> {
    if (!props.saveProjection) throw new Error("Saving is not connected yet.");
    const household = (props.state.boundaryState.householdObjects ?? []).find((item) => item.householdId === input.targetHouseholdId);
    const request = buildWeddingFamilyBoundaryRequestObject({ ...input, expiresAt: household?.requestDeadline }, props.state.workspace.metadata);
    if (!request) throw new Error("Add a request before saving.");
    const object = applyWeddingFamilyBoundaryRequestEvaluation({
      request: { ...request, expectedHouseholdRevision: household?.revision ?? 1 },
      policies: props.state.boundaryState.familyVisibleObjects.filter((item) => item.kind === "wedding_boundary_policy"),
      roleAssignments: props.state.boundaryState.familyVisibleObjects.filter((item) => item.kind === "wedding_boundary_role_assignment"),
    });
    await props.saveProjection(weddingBoundaryLedgerObjectToAfpSendInput(object, props.state.workspace.metadata));
    props.onRefreshWorkspace?.();
    return "Family request saved as a draft. Submit it when you are ready for it to enter the decision queue.";
  }
  async function saveFamilyRule(input: { title: string; plainLanguage: string; ruleType: WeddingBoundaryPolicyRuleType; scopeKind: WeddingBoundaryRuleScopeKind; scopeId: string; effect: WeddingBoundaryRuleEffect; authority: WeddingBoundaryRuleAuthority; effectiveUntil: string; condition: Record<string, unknown> }): Promise<string> {
    if (!props.saveProjection) throw new Error("Saving is not connected yet.");
    const object = buildWeddingFamilyBoundaryPolicyObject(input, props.state.workspace.metadata);
    if (!object) throw new Error("Add a rule before saving.");
    await props.saveProjection(weddingBoundaryLedgerObjectToAfpSendInput(object, props.state.workspace.metadata));
    props.onRefreshWorkspace?.();
    return "Family boundary rule saved.";
  }
  async function changeFamilyRule(input: { operation: "archive_rule" | "supersede_rule"; rule: WeddingBoundaryPolicy; replacement?: WeddingBoundaryRuleReplacement; confirmedElevatedImpact: boolean }): Promise<string> {
    const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
    const result = await applyWeddingBoundaryRuleCommand({
      weddingPlanId: props.state.workspace.metadata.weddingPlanId,
      responseWorkspaceId: props.state.workspace.metadata.responseWorkspaceId,
      operation: input.operation,
      ruleId: input.rule.id,
      expectedVersion: input.rule.version ?? 1,
      replacement: input.replacement,
      confirmedElevatedImpact: input.confirmedElevatedImpact,
      idempotencyKey: `wedding-rule:${nonce}`,
    });
    props.onRefreshWorkspace?.();
    return [result.explanation, ...(result.connected_updates ?? [])].join(" ");
  }
  async function changeFamilyHouseholds(input: Omit<WeddingBoundaryHouseholdCommand, "weddingPlanId" | "responseWorkspaceId" | "idempotencyKey">): Promise<string> {
    const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
    const result = await applyWeddingBoundaryHouseholdCommand({
      ...input,
      weddingPlanId: props.state.workspace.metadata.weddingPlanId,
      responseWorkspaceId: props.state.workspace.metadata.responseWorkspaceId,
      idempotencyKey: `wedding-household:${nonce}`,
    });
    props.onRefreshWorkspace?.();
    return [result.explanation, ...(result.connected_updates ?? [])].join(" ");
  }
  async function saveFamilyHousehold(input: { householdId: string; familyGroupLabel: string; invitationAllocation: number | null; requestDeadline: string | null }): Promise<string> {
    if (!props.saveProjection) throw new Error("Saving is not connected yet.");
    const household = (props.state.boundaryState.householdObjects ?? []).find((item) => item.householdId === input.householdId);
    if (!household) throw new Error("This household is no longer available. Refresh and try again.");
    const nowIso = new Date().toISOString();
    const currentRevision = household.revision ?? (typeof household.metadata?.household_revision === "number" ? household.metadata.household_revision : 0);
    await props.saveProjection(weddingBoundaryLedgerObjectToAfpSendInput({
      ...household,
      familyGroupId: input.familyGroupLabel.trim() ? `family_group:${safeWeddingLabel(input.familyGroupLabel)}` : null,
      familyGroupLabel: input.familyGroupLabel.trim() || null,
      invitationAllocation: input.invitationAllocation,
      requestDeadline: input.requestDeadline,
      revision: currentRevision + 1,
      createdAt: nowIso,
      metadata: { ...(household.metadata ?? {}), household_revision: currentRevision + 1, updated_at: nowIso },
    }, props.state.workspace.metadata, nowIso));
    props.onRefreshWorkspace?.();
    return "Household group and allocation saved.";
  }
  function generateRecommendationSet(cardTitle: string, nextQuestionLabel: string) {
    props.onSidebarAction(buildWeddingRecommendationGenerationAction({
      cardTitle,
      nextQuestionLabel,
      state: props.state,
    }));
  }
  return (
    <>
      <Show when={props.showTechnicalDetails}>
        <WeddingPanelSection
          label="Setup details"
          detail="Connection, approval, and launch checks. Most couples can leave this closed."
          tone="advanced"
        />
        <WeddingProductionGateCard packet={props.state.productionGoNoGoPacket} />
        <div class="mt-3">
          <WeddingProductionRemainingWorkCard state={props.state.productionRemainingWork} />
        </div>

        <WeddingBackgroundAutomationCard state={props.state.backgroundAutomationCoverage} />
      </Show>

      <Show when={(props.showHomeOverview ?? true) && activeMenu() === "home"}>
        <WeddingPanelSection
          label="Planning snapshot"
          detail="The main wedding details to check today."
          tone="everyday"
        />
        <div class="mt-3">
          <WeddingHomeOverviewGrid
            state={props.state}
            onSelectMenu={props.onSelectMenu}
            onSidebarAction={props.onSidebarAction}
            onSaveWeddingDate={props.onSaveWeddingDate}
            saveProjection={props.saveProjection}
            onRefreshWorkspace={props.onRefreshWorkspace}
          />
        </div>
        <div class="mt-3">
          <WeddingNextStepCard
            state={props.state}
            onSelectMenu={props.onSelectMenu}
            onSaveWeddingDate={props.onSaveWeddingDate}
          />
        </div>
      </Show>

      <Show when={props.sharePlanOpen}>
        <WeddingCollaborationAccessCard state={props.state.collaboration} metadata={props.state.workspace.metadata} contactUserId={props.contactUserId} />
      </Show>

      <Show when={props.showTechnicalDetails}>
        <WeddingAdvancedAuditPanels
          state={props.state}
          onSelectMenu={props.onSelectMenu}
          onSidebarAction={props.onSidebarAction}
        />
      </Show>

      <div hidden={activeMenu() !== "budget"}>
        <WeddingBudgetEvidenceHub
          state={props.state}
          onOpenArtifact={props.onOpenArtifact}
          onImportFiles={props.onImportFiles}
          saveProjection={props.saveProjection}
          onRefreshWorkspace={props.onRefreshWorkspace}
          openIntakeRequest={quoteIntakeRequest()}
        />
        <WeddingBudgetTrackerCard
          state={props.state.budgetTracking}
          weddingPlanId={props.state.workspace.metadata.weddingPlanId}
          locationLabel={weddingLocationAdviceLabel(props.state)}
          preferenceSignals={budgetPreferenceSignals()}
          metadata={props.state.workspace.metadata}
          onSaveAllocation={saveBudgetAllocation}
          onSaveContribution={saveBudgetAllocation}
          onSaveContributorContact={saveBudgetContributorContact}
          contributorPeople={props.state.helperContactNames}
          contactUserId={props.contactUserId}
          onOpenArtifact={props.onOpenArtifact}
          onAddQuotes={() => setQuoteIntakeRequest((value) => value + 1)}
        />
      </div>

      <Show when={activeMenu() === "people"}>
      <div class="grid gap-3">
        <WeddingPeopleHub state={peopleAggregate()} onSelectMenu={props.onSelectMenu} />
      </div>
      </Show>

      <Show when={activeMenu() === "helpers"}>
        <WeddingHelpersPanel
          state={props.state}
          onSidebarAction={props.onSidebarAction}
          saveProjection={props.saveProjection}
          onRefreshWorkspace={props.onRefreshWorkspace}
          metadata={props.state.workspace.metadata}
          contactUserId={props.contactUserId}
        />
      </Show>

      <div hidden={activeMenu() !== "plan"}>
        <section class="rounded-[24px] border border-indigo-100/80 bg-indigo-50/75 p-4 shadow-card phone:rounded-none phone:border-0 phone:bg-transparent phone:p-0 phone:shadow-none sm:rounded-[28px]">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="text-base font-semibold text-indigo-950">{planAggregate().title}</p>
              <p class="mt-1 text-sm leading-6 text-indigo-950/70">
                {planAggregate().detail}
              </p>
            </div>
            <div class="flex flex-wrap gap-1.5 text-[11px] font-semibold text-indigo-950/75 sm:justify-end">
              <For each={planAggregate().summaryPills}>
                {(label) => (
                  <span class="rounded-full border border-indigo-100 bg-white/75 px-2.5 py-1">
                    {label}
                  </span>
                )}
              </For>
            </div>
          </div>
          <div class="mt-4 grid gap-4 lg:grid-cols-3">
            <For each={planAggregate().actions}>
              {(action) => (
                <button
                  type="button"
                  disabled={!action.enabled}
                  class="flex min-h-[10rem] min-w-0 flex-col items-start gap-3 rounded-2xl border border-indigo-200 bg-white/80 p-5 text-left transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-[9rem]"
                  onClick={() => openAggregateAction(action)}
                >
                  <span class="block w-full text-sm font-semibold leading-5 text-indigo-950">{action.title}</span>
                  <span class="block w-full text-xs leading-5 text-indigo-950/70">{action.detail}</span>
                  <span class="mt-auto block w-full text-[11px] font-semibold leading-4 text-indigo-950/65">{action.metaLabel}</span>
                </button>
              )}
            </For>
          </div>
          <WeddingMealChoiceCataloguePanel
            state={mealChoiceState()}
            guestRows={props.state.guestTracking.guestRows}
            onSave={saveMealChoices}
          />
        </section>
        <section class="mt-4 rounded-[24px] border border-rose-100 bg-rose-50/55 p-4 shadow-card phone:rounded-none phone:border-x-0 phone:bg-transparent phone:px-0 phone:shadow-none" aria-labelledby="wedding-plan-inspiration-title">
          <div class="mb-3">
            <p class="text-xs font-semibold uppercase tracking-[0.12em] text-rose-900/65">Your style</p>
            <h3 id="wedding-plan-inspiration-title" class="mt-1 text-base font-semibold text-rose-950">Inspiration</h3>
            <p class="mt-1 text-sm leading-6 text-rose-950/70">Keep photos, links and the details that should guide planning in the same Plan view.</p>
          </div>
          <WeddingInspirationPanel state={props.state} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace} />
          <Show when={props.state.contextCards.length > 0}>
            <div class="mt-3">
              <WeddingImportantDetailsPanel cards={props.state.contextCards} metadata={props.state.workspace.metadata} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace} onGenerateRecommendations={generateRecommendationSet} />
            </div>
          </Show>
          <div class="mt-3">
            <WeddingVisionPanel state={props.state} onSelectMenu={props.onSelectMenu} saveProjection={props.saveProjection} onRefreshWorkspace={props.onRefreshWorkspace} />
          </div>
        </section>
      </div>

      <div hidden={activeMenu() !== "guests" && activeMenu() !== "people"} class={activeMenu() === "people" ? "mt-3" : ""}>
        <WeddingGuestOperationsCard
          state={props.state.guestTracking}
          metadata={props.state.workspace.metadata}
          availableMealChoices={mealChoiceState().confirmed?.options ?? rsvpSetup()?.questions.find((question) => question.id === "meal_choice")?.options ?? []}
          onSaveGuestDraft={saveGuestDraft}
          onSaveGuestRules={saveGuestRules}
        />
        <WeddingRsvpSetupPanel
          current={rsvpSetup()}
          defaultHostLabel={rsvpHostLabel()}
          culturallyDiverseCelebration={culturallyDiverseCelebration()}
          weddingDate={rsvpWeddingDate()}
          guestTracking={props.state.guestTracking}
          metadata={props.state.workspace.metadata}
          mealChoiceState={mealChoiceState()}
          onSaveMealChoices={saveMealChoices}
          onSave={saveRsvpSetup}
          onCulturallyDiverseCelebrationChange={saveCulturallyDiverseCelebration}
        />
        <Show when={rsvpSetup()}>{(setup) => (
          <WeddingRsvpOperationsPanel
            setup={setup()}
            guestTracking={props.state.guestTracking}
            metadata={props.state.workspace.metadata}
            afpMessages={props.state.afpMessages}
            onSaveProjection={props.saveProjection}
            onRefreshWorkspace={props.onRefreshWorkspace}
          />
        )}</Show>
        <div class="mt-3">
          <WeddingBoundaryManagementCard
            state={props.state.boundaryState}
            topology={props.state.boundaryTopology}
            onDecideRequest={decideBoundaryRequest}
            onTransitionRequest={transitionBoundaryRequest}
            onSaveFamilyRequest={saveFamilyRequest}
            onSaveFamilyRule={saveFamilyRule}
            onChangeFamilyRule={changeFamilyRule}
            onSaveHousehold={saveFamilyHousehold}
            onApplyHouseholdCommand={changeFamilyHouseholds}
          />
          <WeddingBoundaryAccessManagementPanel
            state={props.state.boundaryState}
            weddingPlanId={props.state.workspace.metadata.weddingPlanId}
            responseWorkspaceId={props.state.workspace.metadata.responseWorkspaceId}
          />
        </div>
        <Show when={activeMenu() === "people"}>
          <div class="mt-3">
            <WeddingCustomSurfaceTools
              activeMenu={activeMenu()}
              storageKey={props.state.workspace.metadata.responseWorkspaceId}
              metadata={props.state.workspace.metadata}
              saveProjection={props.saveProjection}
              onRefreshWorkspace={props.onRefreshWorkspace}
            />
          </div>
        </Show>
      </div>

      <div hidden={activeMenu() !== "seating"}>
        <WeddingSeatingPanel
          state={props.state}
          saveProjection={props.saveProjection}
          onRefreshWorkspace={props.onRefreshWorkspace}
          onSelectMenu={props.onSelectMenu}
          onSidebarAction={props.onSidebarAction}
        />
      </div>

      <div hidden={activeMenu() !== "timeline"}>
        <WeddingTimelinePanel
          state={props.state}
          onSidebarAction={props.onSidebarAction}
          onOpenArtifact={props.onOpenArtifact}
          onOpenSavedOutputs={props.onOpenSavedOutputs}
          saveProjection={props.saveProjection}
          onRefreshWorkspace={props.onRefreshWorkspace}
        />
      </div>

      <div hidden={activeMenu() !== "tasks"}>
        <WeddingPlanningTasksPanel
          state={props.state}
          saveProjection={props.saveProjection}
          onRefreshWorkspace={props.onRefreshWorkspace}
          contactUserId={props.contactUserId}
        />
      </div>

    </>
  );
}
