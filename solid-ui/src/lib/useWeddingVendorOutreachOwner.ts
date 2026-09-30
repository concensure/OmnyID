// @locs-version: 1.0
import { createSignal } from "solid-js";

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

  function outreachDirectoryVendorMatch(vendorName: string) {
    const key = vendorName.trim().toLowerCase();
    return (input.weddingVendorDirectory() ?? []).find(
      (vendor) => vendor.vendorName.trim().toLowerCase() === key,
    ) ?? null;
  }

  async function onContactVendor(card: WeddingVendorChoiceCardData, artifactId: string) {
    setVendorOutreachArtifactIds((current) => ({ ...current, [card.choiceId]: artifactId }));
    const metadata = input.state().workspace.metadata;
    const recipientEmail = weddingVendorOutreachRecipient(card, input.weddingVendorDirectory() ?? []);
    const existing = vendorOutreachFlows()[card.choiceId]
      ?? weddingVendorOutreachIdleFlow({ choiceId: card.choiceId, vendorName: card.title, recipientEmail });
    setVendorOutreachFlows((current) => ({
      ...current,
      [card.choiceId]: weddingVendorOutreachStartDrafting({ ...existing, recipientEmail }),
    }));

    const couple = {
      date_or_season: null as string | null,
      location: null as string | null,
      guest_count: null as string | null,
      budget_comfort: null as string | null,
      top_priorities: [] as string[],
      atmosphere_description: null as string | null,
      vendor_preferences: null as string | null,
      couple_names: null as string | null,
    };
    try {
      const contextThreadId = `wedding_context:${metadata.responseWorkspaceId}`;
      const contextMessages = await fetchThread(contextThreadId);
      const intakeMessage = contextMessages.find((message) => message.subtype === "wedding_intake_profile");
      const intake = (intakeMessage?.content ?? {}) as Record<string, unknown>;
      couple.date_or_season = typeof intake.date_or_season === "string" ? intake.date_or_season : null;
      couple.location = typeof intake.location === "string" ? intake.location : null;
      couple.guest_count = typeof intake.guest_count === "string"
        ? intake.guest_count
        : typeof intake.guest_count === "number" ? String(intake.guest_count) : null;
      couple.budget_comfort = typeof intake.budget_comfort === "string" ? intake.budget_comfort : null;
      couple.top_priorities = Array.isArray(intake.top_priorities)
        ? intake.top_priorities.filter((item): item is string => typeof item === "string")
        : [];
      couple.atmosphere_description = typeof intake.atmosphere_description === "string" ? intake.atmosphere_description : null;
      couple.vendor_preferences = typeof intake.vendor_preferences === "string" ? intake.vendor_preferences : null;
      couple.couple_names = typeof intake.couple_names === "string" ? intake.couple_names : null;

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
      setVendorOutreachFlows((current) => {
        const flow = current[card.choiceId];
        if (!flow || flow.stage !== "drafting") return current;
        return {
          ...current,
          [card.choiceId]: weddingVendorOutreachDraftSucceeded(flow, {
            subject: result.subject,
            bodyMarkdown: result.bodyMarkdown,
            groundedOnLabels,
          }),
        };
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "couldn't write an outreach draft right now — please try again in a moment";
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
      const reason = error instanceof Error ? error.message : "couldn't send this enquiry right now — please try again in a moment";
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
