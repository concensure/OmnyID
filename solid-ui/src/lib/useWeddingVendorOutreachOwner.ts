// @locs-version: 1.0
import { createEffect, createSignal } from "solid-js";

import {
  fetchGmailOAuthConfig,
  fetchGmailOAuthUrl,
  fetchThread,
  recordWeddingVendorContact,
  requestWeddingVendorOutreachDraft,
  sendGmailApprovedDraft,
  type WeddingVendor,
} from "@/lib/api";
import type { WeddingVendorChoiceCardData } from "@/components/WeddingVendorChoiceCard";
import type { WeddingVendorChoiceIntent } from "@/lib/weddingVendorChoiceActionState";
import type { GmailConnectionStatus } from "@/lib/gmailConnectionState";
import { gmailOAuthConfigFailureMessage } from "@/lib/gmailConnectionState";
import { renderMarkdown } from "@/lib/markdownRenderer";
import { weddingProjectionMetadataId } from "@/lib/weddingBrowserExportActions";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingProjectionSaveFn } from "@/components/WeddingResponseWorkspaceViewTypes";
import {
  weddingVendorOutreachDraftAfpSendInput,
  weddingVendorOutreachSentAfpSendInput,
} from "@/lib/weddingVendorOutreachAfpState";
import { persistWeddingVendorOutreachDraftBeforeDisplay } from "@/lib/weddingVendorOutreachDraftPersistenceState";
import { projectWeddingVendorOutreachFlows } from "@/lib/weddingVendorOutreachProjectionState";
import {
  weddingVendorOutreachBodyChanged,
  weddingVendorOutreachDraftFailed,
  weddingVendorOutreachDraftSucceeded,
  weddingVendorOutreachGroundedOnLabels,
  weddingVendorOutreachIdleFlow,
  weddingVendorOutreachRecipient,
  weddingVendorOutreachSendFailed,
  weddingVendorOutreachSendGate,
  weddingVendorOutreachSendSucceeded,
  weddingVendorOutreachStartDrafting,
  weddingVendorOutreachStartSending,
  type WeddingVendorOutreachFlowState,
} from "@/lib/weddingVendorOutreachFlowState";
import { friendlyErrorText } from "@/lib/visibleErrorText";

type WeddingVendorOutreachCouple = {
  date_or_season: string | null;
  location: string | null;
  guest_count: string | null;
  budget_comfort: string | null;
  top_priorities: string[];
  atmosphere_description: string | null;
  vendor_preferences: string | null;
  couple_names: string | null;
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const resolved = nonEmptyString(value);
    if (resolved) return resolved;
  }
  return null;
}

function applyWeddingOutreachContext(couple: WeddingVendorOutreachCouple, value: Record<string, unknown> | null | undefined) {
  if (!value) return;
  couple.date_or_season ??= firstString(value.date_or_season, value.dateOrSeason);
  couple.location ??= firstString(value.location);
  const guestCount = value.guest_count ?? value.guestCount;
  couple.guest_count ??= typeof guestCount === "number" ? String(guestCount) : nonEmptyString(guestCount);
  couple.budget_comfort ??= firstString(value.budget_comfort, value.budgetComfort);
  if (couple.top_priorities.length === 0) {
    const priorities = value.top_priorities ?? value.topPriorities;
    couple.top_priorities = Array.isArray(priorities)
      ? priorities.map(nonEmptyString).filter((item): item is string => Boolean(item))
      : [];
  }
  couple.atmosphere_description ??= firstString(value.atmosphere_description, value.atmosphereDescription);
  couple.vendor_preferences ??= firstString(value.vendor_preferences, value.vendorPreferences);
  couple.couple_names ??= firstString(value.couple_names, value.coupleNames, value.family_or_stakeholder_roles, value.familyOrStakeholderRoles);
}

export function weddingVendorOutreachCoupleFromWorkspace(input: {
  contextCards: readonly { planningContext: Record<string, unknown> }[];
  persistedIntake?: Record<string, unknown> | null;
  weddingDateOrSeason?: string | null;
  budgetTargetAmount?: number | null;
}): WeddingVendorOutreachCouple {
  const couple: WeddingVendorOutreachCouple = {
    date_or_season: null,
    location: null,
    guest_count: null,
    budget_comfort: null,
    top_priorities: [],
    atmosphere_description: null,
    vendor_preferences: null,
    couple_names: null,
  };
  for (const card of input.contextCards) applyWeddingOutreachContext(couple, card.planningContext);
  applyWeddingOutreachContext(couple, input.persistedIntake);
  couple.date_or_season ??= nonEmptyString(input.weddingDateOrSeason);
  if (couple.budget_comfort === null && typeof input.budgetTargetAmount === "number" && Number.isFinite(input.budgetTargetAmount)) {
    couple.budget_comfort = `AUD ${Math.round(input.budgetTargetAmount).toLocaleString()} total budget`;
  }
  return couple;
}

export function useWeddingVendorOutreachOwner(input: {
  state: () => WeddingResponseWorkspaceViewState;
  weddingVendorDirectory: () => WeddingVendor[] | undefined;
  gmailStatus: () => GmailConnectionStatus | null | undefined;
  saveProjection: () => WeddingProjectionSaveFn | null | undefined;
  onRefreshWorkspace: () => (() => void) | undefined;
  setNotice: (message: string | null) => void;
}) {
  const [vendorOutreachFlows, setVendorOutreachFlows] = createSignal<Record<string, WeddingVendorOutreachFlowState>>({});
  const [vendorOutreachArtifactIds, setVendorOutreachArtifactIds] = createSignal<Record<string, string>>({});
  const [vendorOutreachIntents, setVendorOutreachIntents] = createSignal<Record<string, WeddingVendorChoiceIntent>>({});

  createEffect(() => {
    const persisted = projectWeddingVendorOutreachFlows(input.state().afpMessages);
    if (persisted.length === 0) return;
    setVendorOutreachFlows((current) => {
      const next = { ...current };
      for (const flow of persisted) {
        const live = next[flow.choiceId];
        if (!live || flow.stage === "sent" || live.stage === "idle") next[flow.choiceId] = flow;
      }
      return next;
    });
  });

  function outreachDirectoryVendorMatch(vendorName: string) {
    const key = vendorName.trim().toLowerCase();
    return (input.weddingVendorDirectory() ?? []).find(
      (vendor) => vendor.vendorName.trim().toLowerCase() === key,
    ) ?? null;
  }

  async function onContactVendor(card: WeddingVendorChoiceCardData, artifactId: string, intent: WeddingVendorChoiceIntent = "CHECK_AVAILABILITY_AND_REQUEST_QUOTE") {
    setVendorOutreachArtifactIds((current) => ({ ...current, [card.choiceId]: artifactId }));
    setVendorOutreachIntents((current) => ({ ...current, [card.choiceId]: intent }));
    const metadata = input.state().workspace.metadata;
    const recipientEmail = weddingVendorOutreachRecipient(card, input.weddingVendorDirectory() ?? []);
    const existing = vendorOutreachFlows()[card.choiceId]
      ?? weddingVendorOutreachIdleFlow({ choiceId: card.choiceId, vendorName: card.title, recipientEmail });
    setVendorOutreachFlows((current) => ({
      ...current,
      [card.choiceId]: weddingVendorOutreachStartDrafting({ ...existing, recipientEmail }),
    }));

    const couple = weddingVendorOutreachCoupleFromWorkspace({
      contextCards: input.state().contextCards,
      budgetTargetAmount: input.state().budgetTracking.budgetTargetAmount,
    });
    try {
      const contextThreadId = `wedding_context:${metadata.responseWorkspaceId}`;
      // A context thread is helpful grounding, not a prerequisite for a user-selected
      // vendor. New and migrated wedding workspaces may not have one yet.
      const contextMessages = await fetchThread(contextThreadId).catch(() => []);
      const intakeMessage = contextMessages.find((message) => message.subtype === "wedding_intake_profile");
      const intake = (intakeMessage?.content ?? {}) as Record<string, unknown>;
      applyWeddingOutreachContext(couple, intake);

      const result = await requestWeddingVendorOutreachDraft({
        vendor: {
          name: card.title,
          category: null,
          website_url: card.websiteUrl,
          address: card.address,
          source_url: card.sourceUrl,
          snippet: null,
        },
        couple,
        wedding_plan_id: metadata.weddingPlanId,
      });
      const groundedOnLabels = weddingVendorOutreachGroundedOnLabels(result.groundedOn, couple);
      const flow = vendorOutreachFlows()[card.choiceId];
      const saveProjection = input.saveProjection();
      if (!flow || flow.stage !== "drafting") return;
      if (!saveProjection) throw new Error("Could not save the draft yet. Reconnect the wedding workspace and try again.");
      const persistedFlow = weddingVendorOutreachDraftSucceeded(flow, {
        subject: result.subject,
        bodyMarkdown: result.bodyMarkdown,
        groundedOnLabels,
      });
      const directoryVendor = outreachDirectoryVendorMatch(card.title);
      const draftProjection = weddingVendorOutreachDraftAfpSendInput({
        flow: persistedFlow,
        metadata,
        sourceArtifactId: vendorOutreachArtifactIds()[card.choiceId] ?? null,
        vendorId: directoryVendor?.vendorId ?? null,
        editorHtml: renderMarkdown(persistedFlow.bodyMarkdown),
        actionIntent: intent,
      });
      await persistWeddingVendorOutreachDraftBeforeDisplay({
        draft: persistedFlow,
        persist: () => saveProjection(draftProjection),
        display: (savedFlow) => setVendorOutreachFlows((current) => {
          const currentFlow = current[card.choiceId];
          if (!currentFlow || currentFlow.stage !== "drafting") return current;
          return {
            ...current,
            [card.choiceId]: savedFlow,
          };
        }),
      });
    } catch (error) {
      const reason = friendlyErrorText(error, "couldn't write an outreach draft right now — please try again in a moment");
      setVendorOutreachFlows((current) => {
        const flow = current[card.choiceId];
        if (!flow) return current;
        return { ...current, [card.choiceId]: weddingVendorOutreachDraftFailed(flow, reason) };
      });
    }
  }

  function onOutreachBodyChange(choiceId: string, bodyMarkdown: string) {
    setVendorOutreachFlows((current) => {
      const flow = current[choiceId];
      if (!flow) return current;
      return { ...current, [choiceId]: weddingVendorOutreachBodyChanged(flow, bodyMarkdown) };
    });
  }

  function onCancelOutreach(choiceId: string) {
    setVendorOutreachFlows((current) => {
      const next = { ...current };
      delete next[choiceId];
      return next;
    });
  }

  async function onConnectGmailForOutreach() {
    try {
      const url = await fetchGmailOAuthUrl();
      window.location.href = url;
    } catch {
      try {
        const config = await fetchGmailOAuthConfig();
        input.setNotice(gmailOAuthConfigFailureMessage(config));
      } catch {
        input.setNotice(gmailOAuthConfigFailureMessage(null));
      }
    }
  }

  async function onSendOutreach(choiceId: string) {
    const flow = vendorOutreachFlows()[choiceId];
    if (!flow) return;
    const gate = weddingVendorOutreachSendGate(flow, { gmailConnected: Boolean(input.gmailStatus()?.connected) });
    if (!gate.canSend) {
      input.setNotice(gate.reason);
      return;
    }
    const saveProjection = input.saveProjection();
    if (!saveProjection) {
      input.setNotice("Sending is not connected yet. The draft stayed here.");
      return;
    }
    setVendorOutreachFlows((current) => ({ ...current, [choiceId]: weddingVendorOutreachStartSending(flow) }));
    try {
      const metadata = input.state().workspace.metadata;
      const directoryVendor = outreachDirectoryVendorMatch(flow.vendorName);
      const html = renderMarkdown(flow.bodyMarkdown);
      const draftProjection = weddingVendorOutreachDraftAfpSendInput({
        flow,
        metadata,
        sourceArtifactId: vendorOutreachArtifactIds()[choiceId] ?? null,
        vendorId: directoryVendor?.vendorId ?? null,
        editorHtml: html,
        actionIntent: vendorOutreachIntents()[choiceId],
      });
      await saveProjection(draftProjection);
      const draftMessageId = weddingProjectionMetadataId(draftProjection);
      const sendResult = await sendGmailApprovedDraft({
        to: flow.recipientEmail ?? "",
        subject: flow.subject,
        html,
        text: flow.bodyMarkdown,
        thread_id: draftProjection.thread_id,
      });
      const sentProjection = weddingVendorOutreachSentAfpSendInput({
        flow,
        metadata,
        draftMessageId: draftMessageId ?? draftProjection.thread_id,
        providerReceipt: { providerMessageId: sendResult.messageId, clientMessageId: sendResult.clientMessageId },
        vendorId: directoryVendor?.vendorId ?? null,
        actionIntent: vendorOutreachIntents()[choiceId],
      });
      await saveProjection(sentProjection);
      if (directoryVendor) {
        try {
          await recordWeddingVendorContact(directoryVendor.vendorId, {
            contact_method: "agent_email_draft",
            thread_id: draftProjection.thread_id,
            receipt_ref: sendResult.clientMessageId,
            follow_up_due_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          });
        } catch (error) {
          console.warn("wedding vendor outreach: recordWeddingVendorContact failed after a successful send", error);
        }
      }
      setVendorOutreachFlows((current) => ({
        ...current,
        [choiceId]: weddingVendorOutreachSendSucceeded(current[choiceId] ?? flow, {
          sentAtIso: new Date().toISOString(),
          receiptRef: sendResult.clientMessageId,
          threadId: draftProjection.thread_id,
        }),
      }));
      input.onRefreshWorkspace()?.();
    } catch (error) {
      const reason = friendlyErrorText(error, "couldn't send this enquiry right now — please try again in a moment");
      setVendorOutreachFlows((current) => {
        const currentFlow = current[choiceId] ?? flow;
        return { ...current, [choiceId]: weddingVendorOutreachSendFailed(currentFlow, reason) };
      });
    }
  }

  return {
    flows: vendorOutreachFlows,
    onContactVendor,
    onOutreachBodyChange,
    onCancelOutreach,
    onConnectGmailForOutreach,
    onSendOutreach,
  };
}
