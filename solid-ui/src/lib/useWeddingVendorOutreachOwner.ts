// @locs-version: 1.0
import { createEffect, createSignal } from "solid-js";

import {
  fetchGmailOAuthConfig,
  fetchGmailOAuthUrl,
  fetchThread,
  recordWeddingVendorContact,
  sendGmailApprovedDraft,
  type WeddingVendor,
  type AfpAttachment,
} from "@/lib/api";
import { requestWeddingVendorOutreachDraft } from "@/lib/weddingVendorOutreachApi";
import type { WeddingVendorChoiceCardData } from "@/components/WeddingVendorChoiceCard";
import type { WeddingVendorChoiceIntent } from "@/lib/weddingVendorChoiceActionState";
import type { GmailConnectionStatus } from "@/lib/gmailConnectionState";
import { gmailOAuthConfigFailureMessage } from "@/lib/gmailConnectionState";
import { renderMarkdown } from "@/lib/markdownRenderer";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingProjectionSaveFn } from "@/components/WeddingResponseWorkspaceViewTypes";
import {
  weddingVendorOutreachDraftAfpSendInput,
  weddingVendorOutreachSentAfpSendInput,
} from "@/lib/weddingVendorOutreachAfpState";
import { persistWeddingVendorOutreachDraftBeforeDisplay } from "@/lib/weddingVendorOutreachDraftPersistenceState";
import {
  linkWeddingVendorSpecialEnquiry,
  recordWeddingVendorSpecialDeliveryFailure,
  recheckWeddingVendorSpecialEnquiry,
  weddingVendorSpecialLinkContext,
  type WeddingVendorSpecialEnquiryContext,
} from "@/lib/weddingVendorSpecialDiscoveryApi";
import { projectWeddingVendorOutreachFlows } from "@/lib/weddingVendorOutreachProjectionState";
import {
  weddingVendorOutreachBodyChanged,
  weddingVendorOutreachDraftFailed,
  weddingVendorOutreachDraftSucceeded,
  weddingVendorOutreachGroundedOnLabels,
  weddingVendorOutreachIdleFlow,
  weddingVendorOutreachNeedsGeneration,
  weddingVendorOutreachRecipient,
  weddingVendorOutreachPermissionsChanged,
  weddingVendorOutreachSendFailed,
  weddingVendorOutreachSendGate,
  weddingVendorOutreachSendSucceeded,
  weddingVendorOutreachStartDrafting,
  weddingVendorOutreachStartSending,
  type WeddingVendorOutreachFlowState,
} from "@/lib/weddingVendorOutreachFlowState";
import type { WeddingVendorEnquiryPermissions } from "@/lib/weddingVendorEnquiryPermissionsState";
import { friendlyErrorText } from "@/lib/visibleErrorText";
import { weddingDealBreakersFromAfpMessages } from "@/lib/weddingDealBreakerAfpState";

type WeddingVendorOutreachCouple = {
  date_or_season: string | null;
  location: string | null;
  guest_count: string | null;
  budget_comfort: string | null;
  budget_category_label: string | null;
  budget_category_amount: number | null;
  budget_currency: string | null;
  top_priorities: string[];
  atmosphere_description: string | null;
  vendor_preferences: string | null;
  couple_names: string | null;
  deal_breakers: string[];
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

/** Make a provider's one-line reply read as a human email before it is shown or sent. */
export function formatWeddingVendorOutreachParagraphs(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n")
    .replace(/\btotal budget\s+budget\b/gi, "total budget")
    .replace(/\bwithin an?\s+AUD\s*/gi, "within AUD ")
    .trim();
  if (!normalized) return "";
  if (/\n\s*\n/.test(normalized)) return normalized;
  const prose = normalized.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  const sentences = prose.match(/[^.!?]+[.!?]+(?:[\"')\]]+)?|[^.!?]+$/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [prose];
  // Each sentence is its own short email paragraph. This preserves every
  // provider-written word while making greeting, context, request, and close
  // easy to scan and edit on a phone.
  return sentences.join("\n\n");
}

export function formatWeddingVendorOutreachForDisplay(value: string, coupleNames?: string | null): string {
  let result = formatWeddingVendorOutreachParagraphs(value);
  const names = nonEmptyString(coupleNames)?.replace(/\s+/g, " ") ?? null;
  if (names && !result.toLowerCase().endsWith(names.toLowerCase())) {
    result = `${result}\n\nKind regards,\n\n${names}`;
  }
  return result;
}

export function normalizeWeddingBudgetComfort(value: unknown): string | null {
  const raw = nonEmptyString(value);
  if (!raw) return null;
  const simple = raw.match(/^(?:AUD\s*)?\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:total\s+budget|budget)?$/i);
  if (!simple) return raw;
  const amount = Number(simple[1]?.replaceAll(",", ""));
  return Number.isFinite(amount) ? `AUD $${Math.round(amount).toLocaleString("en-AU")} total budget` : raw;
}

type WeddingOutreachBudgetAllocation = { categoryId: string; categoryLabel: string; amount: number };

export function weddingVendorCategoryBudget(
  category: string | null | undefined,
  allocations: readonly WeddingOutreachBudgetAllocation[],
): WeddingOutreachBudgetAllocation | null {
  const key = (category ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const categoryId = /venue|ceremony|celebrant|officiant/.test(key) ? "venue_ceremony"
    : /cater|food|drink|bar/.test(key) ? "catering_drinks"
      : /photo|video/.test(key) ? "photo_video"
        : /attire|dress|suit|beauty|hair|makeup/.test(key) ? "attire_beauty"
          : /flower|flor|decor|styling/.test(key) ? "flowers_decor"
            : /music|entertain|band|\bdj\b/.test(key) ? "entertainment_music"
              : key ? "other_misc" : null;
  const match = categoryId ? allocations.find((item) => item.categoryId === categoryId) : null;
  return match && Number.isFinite(match.amount) && match.amount > 0 ? match : null;
}

function applyWeddingOutreachContext(couple: WeddingVendorOutreachCouple, value: Record<string, unknown> | null | undefined) {
  if (!value) return;
  couple.date_or_season ??= firstString(value.date_or_season, value.dateOrSeason);
  couple.location ??= firstString(value.location);
  const guestCount = value.guest_count ?? value.guestCount;
  couple.guest_count ??= typeof guestCount === "number" ? String(guestCount) : nonEmptyString(guestCount);
  couple.budget_comfort ??= normalizeWeddingBudgetComfort(firstString(value.budget_comfort, value.budgetComfort));
  if (couple.top_priorities.length === 0) {
    const priorities = value.top_priorities ?? value.topPriorities;
    couple.top_priorities = Array.isArray(priorities)
      ? priorities.map(nonEmptyString).filter((item): item is string => Boolean(item))
      : [];
  }
  couple.atmosphere_description ??= firstString(value.atmosphere_description, value.atmosphereDescription);
  couple.vendor_preferences ??= firstString(value.vendor_preferences, value.vendorPreferences);
  // `familyOrStakeholderRoles` is the legacy planning-contract field behind
  // the onboarding question labelled "Your names".
  couple.couple_names ??= firstString(
    value.couple_names,
    value.coupleNames,
    value.family_or_stakeholder_roles,
    value.familyOrStakeholderRoles,
  );
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
    budget_category_label: null,
    budget_category_amount: null,
    budget_currency: null,
    top_priorities: [],
    atmosphere_description: null,
    vendor_preferences: null,
    couple_names: null,
    deal_breakers: [],
  };
  for (const card of input.contextCards) applyWeddingOutreachContext(couple, card.planningContext);
  applyWeddingOutreachContext(couple, input.persistedIntake);
  couple.date_or_season ??= nonEmptyString(input.weddingDateOrSeason);
  if (couple.budget_comfort === null && typeof input.budgetTargetAmount === "number" && Number.isFinite(input.budgetTargetAmount)) {
    couple.budget_comfort = `AUD $${Math.round(input.budgetTargetAmount).toLocaleString("en-AU")} total budget`;
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
  const [vendorOutreachRetries, setVendorOutreachRetries] = createSignal<Record<string, { card: WeddingVendorChoiceCardData; artifactId: string; intent: WeddingVendorChoiceIntent; specialContext: WeddingVendorSpecialEnquiryContext | null }>>({});
  const [vendorOutreachSpecialContexts, setVendorOutreachSpecialContexts] = createSignal<Record<string, WeddingVendorSpecialEnquiryContext>>({});

  createEffect(() => {
    const persisted = projectWeddingVendorOutreachFlows(input.state().afpMessages);
    if (persisted.length === 0) return;
    const couple = weddingVendorOutreachCoupleFromWorkspace({ contextCards: input.state().contextCards });
    setVendorOutreachFlows((current) => {
      const next = { ...current };
      for (const flow of persisted) {
        const formattedBody = formatWeddingVendorOutreachForDisplay(flow.bodyMarkdown, couple.couple_names);
        const normalizedFlow = formattedBody === flow.bodyMarkdown ? flow : { ...flow, bodyMarkdown: formattedBody, bodyHtml: null };
        const live = next[flow.choiceId];
        if (!live || flow.stage === "sent" || live.stage === "idle") next[flow.choiceId] = normalizedFlow;
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

  function specialDateLabel(value: string): string {
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  }

  function withSpecialEnquiryContext(body: string, specialContext: WeddingVendorSpecialEnquiryContext | null): string {
    if (!specialContext?.specialDate) return body;
    const date = specialDateLabel(specialContext.specialDate);
    if (body.toLowerCase().includes(date.toLowerCase()) || body.includes(specialContext.specialDate)) return body;
    const detail = specialContext.offerTitle ? `, including the “${specialContext.offerTitle}” option` : "";
    return `${body.trim()}\n\nWe are enquiring about your indicated availability for ${date}${detail}. Please confirm that the date and indicative terms are still current.`;
  }

  async function linkSpecialEnquiryWithRetry(input: Parameters<typeof linkWeddingVendorSpecialEnquiry>[0]) {
    let lastError: unknown;
    for (const delayMs of [0, 400, 1_200]) {
      if (delayMs > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
      try {
        return await linkWeddingVendorSpecialEnquiry(input);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async function onContactVendor(
    card: WeddingVendorChoiceCardData,
    artifactId: string,
    intent: WeddingVendorChoiceIntent = "CHECK_AVAILABILITY_AND_REQUEST_QUOTE",
    forceRegeneration = false,
    specialContext: WeddingVendorSpecialEnquiryContext | null = null,
  ) {
    setVendorOutreachArtifactIds((current) => ({ ...current, [card.choiceId]: artifactId }));
    setVendorOutreachIntents((current) => ({ ...current, [card.choiceId]: intent }));
    setVendorOutreachRetries((current) => ({ ...current, [card.choiceId]: { card, artifactId, intent, specialContext } }));
    if (specialContext) setVendorOutreachSpecialContexts((current) => ({ ...current, [card.choiceId]: specialContext }));
    const metadata = input.state().workspace.metadata;
    const recipientEmail = weddingVendorOutreachRecipient(card, input.weddingVendorDirectory() ?? []);
    const existing = vendorOutreachFlows()[card.choiceId]
      ?? weddingVendorOutreachIdleFlow({ choiceId: card.choiceId, vendorName: card.title, recipientEmail });
    if (!weddingVendorOutreachNeedsGeneration(existing, forceRegeneration)) return;
    setVendorOutreachFlows((current) => ({
      ...current,
      [card.choiceId]: weddingVendorOutreachStartDrafting({ ...existing, recipientEmail }),
    }));

    const couple = weddingVendorOutreachCoupleFromWorkspace({
      contextCards: input.state().contextCards,
    });
    couple.deal_breakers = weddingDealBreakersFromAfpMessages({
      messages: input.state().afpMessages,
      metadata,
    });
    try {
      const contextThreadId = `wedding_context:${metadata.responseWorkspaceId}`;
      // A context thread is helpful grounding, not a prerequisite for a user-selected
      // vendor. New and migrated wedding workspaces may not have one yet.
      const contextMessages = await fetchThread(contextThreadId).catch(() => []);
      const intakeMessage = contextMessages.find((message) => message.subtype === "wedding_intake_profile");
      const intake = (intakeMessage?.content ?? {}) as Record<string, unknown>;
      applyWeddingOutreachContext(couple, intake);
      couple.budget_comfort ??= weddingVendorOutreachCoupleFromWorkspace({
        contextCards: [], budgetTargetAmount: input.state().budgetTracking.budgetTargetAmount,
      }).budget_comfort;
      const categoryBudget = weddingVendorCategoryBudget(card.category, input.state().budgetTracking.budgetAllocation);
      if (categoryBudget) {
        couple.budget_comfort = `AUD $${Math.round(categoryBudget.amount).toLocaleString("en-AU")} budget for ${categoryBudget.categoryLabel}`;
        couple.budget_category_label = categoryBudget.categoryLabel;
        couple.budget_category_amount = categoryBudget.amount;
        couple.budget_currency = "AUD";
      }
      if (specialContext?.specialDate) couple.date_or_season = specialDateLabel(specialContext.specialDate);
      if (!existing.permissions.shareDateOrSeason) couple.date_or_season = null;
      if (!existing.permissions.shareLocation) couple.location = null;
      if (!existing.permissions.shareGuestCount) couple.guest_count = null;
      if (!existing.permissions.shareStylePriorities) {
        couple.top_priorities = [];
        couple.atmosphere_description = null;
        couple.vendor_preferences = null;
        couple.deal_breakers = [];
      }
      if (!existing.permissions.shareApproximateBudget) {
        couple.budget_comfort = null;
        couple.budget_category_label = null;
        couple.budget_category_amount = null;
        couple.budget_currency = null;
      }

      const result = await requestWeddingVendorOutreachDraft({
        vendor: {
          name: card.title,
          category: card.category,
          website_url: card.websiteUrl,
          address: card.address,
          source_url: card.sourceUrl,
          snippet: null,
        },
        couple,
        wedding_plan_id: metadata.weddingPlanId,
        verify_questions: card.verifyQuestions,
      });
      const groundedOnLabels = weddingVendorOutreachGroundedOnLabels(result.groundedOn, couple);
      const flow = vendorOutreachFlows()[card.choiceId];
      const saveProjection = input.saveProjection();
      if (!flow || flow.stage !== "drafting") return;
      if (!saveProjection) throw new Error("Could not save the draft yet. Reconnect the wedding workspace and try again.");
      const sharedSpecialContext = existing.permissions.shareDateOrSeason ? specialContext : null;
      const contextualBody = withSpecialEnquiryContext(
        formatWeddingVendorOutreachForDisplay(result.bodyMarkdown, couple.couple_names),
        sharedSpecialContext,
      );
      const persistedFlow = weddingVendorOutreachDraftSucceeded(flow, {
        subject: sharedSpecialContext?.specialDate && !result.subject.includes(sharedSpecialContext.specialDate)
          ? `${result.subject} — ${specialDateLabel(sharedSpecialContext.specialDate)}`
          : result.subject,
        bodyMarkdown: contextualBody,
        bodyHtml: null,
        groundedOnLabels,
        groundedOnFields: result.groundedOn,
        sourceReferences: intakeMessage?.id
          ? [{ type: "wedding_intake_profile", target: intakeMessage.id, label: "Wedding details used for this draft" }]
          : [{ type: "wedding_context_thread", target: contextThreadId, label: "Wedding details used for this draft" }],
        generation: {
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          estimatedCostUsd: result.estimatedCostUsd,
          inputFingerprint: result.inputFingerprint,
          promptPrefixId: result.promptPrefixId,
          servedFrom: result.servedFrom,
        },
      });
      const directoryVendor = outreachDirectoryVendorMatch(card.title);
      const draftProjection = weddingVendorOutreachDraftAfpSendInput({
        flow: persistedFlow,
        metadata,
        sourceArtifactId: vendorOutreachArtifactIds()[card.choiceId] ?? null,
        vendorId: directoryVendor?.vendorId ?? null,
        editorHtml: persistedFlow.bodyHtml ?? renderMarkdown(persistedFlow.bodyMarkdown),
        actionIntent: intent,
        specialContext,
      });
      await persistWeddingVendorOutreachDraftBeforeDisplay({
        draft: persistedFlow,
        persist: () => saveProjection(draftProjection),
        display: (savedFlow) => setVendorOutreachFlows((current) => {
          const currentFlow = current[card.choiceId];
          if (!currentFlow || currentFlow.stage !== "drafting") return current;
          return {
            ...current,
            [card.choiceId]: {
              ...savedFlow,
              draftMessageId: draftProjection.id ?? null,
              hasUnpersistedChanges: false,
            },
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

  function onOutreachBodyChange(choiceId: string, bodyMarkdown: string, bodyHtml?: string) {
    setVendorOutreachFlows((current) => {
      const flow = current[choiceId];
      if (!flow) return current;
      return { ...current, [choiceId]: weddingVendorOutreachBodyChanged(flow, bodyMarkdown, bodyHtml) };
    });
  }

  function onOutreachRecipientChange(choiceId: string, recipientEmail: string) {
    setVendorOutreachFlows((current) => {
      const flow = current[choiceId];
      if (!flow) return current;
      return {
        ...current,
        [choiceId]: {
          ...flow,
          recipientEmail: recipientEmail.trim() || null,
          hasUnpersistedChanges: true,
          permissions: { ...flow.permissions, previewApproved: false },
        },
      };
    });
  }

  function onOutreachAttachmentsChange(choiceId: string, attachments: AfpAttachment[]) {
    setVendorOutreachFlows((current) => {
      const flow = current[choiceId];
      if (!flow) return current;
      return {
        ...current,
        [choiceId]: weddingVendorOutreachPermissionsChanged(
          { ...flow, attachments, hasUnpersistedChanges: true },
          { ...flow.permissions, previewApproved: false },
        ),
      };
    });
  }

  function onOutreachPermissionsChange(choiceId: string, permissions: WeddingVendorEnquiryPermissions) {
    setVendorOutreachFlows((current) => {
      const flow = current[choiceId];
      if (!flow) return current;
      return { ...current, [choiceId]: weddingVendorOutreachPermissionsChanged(flow, permissions) };
    });
  }

  function onCancelOutreach(choiceId: string) {
    setVendorOutreachFlows((current) => {
      const next = { ...current };
      delete next[choiceId];
      return next;
    });
    setVendorOutreachRetries((current) => {
      const next = { ...current };
      delete next[choiceId];
      return next;
    });
  }

  function onRetryOutreach(choiceId: string) {
    const retry = vendorOutreachRetries()[choiceId];
    if (retry) void onContactVendor(retry.card, retry.artifactId, retry.intent, true, retry.specialContext);
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
    const gate = weddingVendorOutreachSendGate(flow, {
      gmailConnected: Boolean(input.gmailStatus()?.connected),
      protectedRepliesAvailable: false,
    });
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
    const specialContext = vendorOutreachSpecialContexts()[choiceId];
    const linkedSpecialContext = weddingVendorSpecialLinkContext(specialContext);
    const metadata = input.state().workspace.metadata;
    let providerAttempted = false;
    try {
      if (linkedSpecialContext) await recheckWeddingVendorSpecialEnquiry(linkedSpecialContext);
      const directoryVendor = outreachDirectoryVendorMatch(flow.vendorName);
      const html = flow.bodyHtml ?? renderMarkdown(flow.bodyMarkdown);
      const draftProjection = weddingVendorOutreachDraftAfpSendInput({
        flow,
        metadata,
        sourceArtifactId: vendorOutreachArtifactIds()[choiceId] ?? null,
        vendorId: directoryVendor?.vendorId ?? null,
        editorHtml: html,
        actionIntent: vendorOutreachIntents()[choiceId],
        specialContext,
      });
      await saveProjection(draftProjection);
      const draftMessageId = draftProjection.id;
      providerAttempted = true;
      const sendResult = await sendGmailApprovedDraft({
        to: flow.recipientEmail ?? "",
        subject: flow.subject,
        html,
        text: flow.bodyMarkdown,
        attachment_ids: flow.attachments.map((attachment) => attachment.id),
      });
      const sentProjection = weddingVendorOutreachSentAfpSendInput({
        flow,
        metadata,
        draftMessageId: draftMessageId ?? draftProjection.thread_id,
        providerReceipt: { providerMessageId: sendResult.messageId, clientMessageId: sendResult.clientMessageId },
        vendorId: directoryVendor?.vendorId ?? null,
        actionIntent: vendorOutreachIntents()[choiceId],
        specialContext,
      });
      await saveProjection(sentProjection);
      if (linkedSpecialContext && sendResult.clientMessageId) {
        try {
          await linkSpecialEnquiryWithRetry({
            ...linkedSpecialContext,
            weddingPlanId: metadata.weddingPlanId,
            enquiryEnvelopeRef: sendResult.clientMessageId,
            idempotencyKey: `special-enquiry:${specialContext.slotId}:${sendResult.clientMessageId}`,
          });
        } catch (error) {
          console.warn("wedding vendor outreach: sent enquiry could not be linked to the Limited Special", error);
          input.setNotice("Your enquiry was sent. Refresh Limited Specials before relying on that date or price.");
        }
      }
      if (directoryVendor && !flow.choiceId.startsWith("response:")) {
        try {
          await recordWeddingVendorContact(directoryVendor.vendorId, {
            contact_method: "agent_email_draft",
            thread_id: draftProjection.thread_id,
            receipt_ref: sendResult.clientMessageId,
            follow_up_due_at: flow.permissions.remindUnanswered
              ? new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
              : null,
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
      if (linkedSpecialContext && providerAttempted) {
        void recordWeddingVendorSpecialDeliveryFailure({
          ...linkedSpecialContext,
          idempotencyKey: `special-delivery-failure:${specialContext.slotId}:${crypto.randomUUID()}`,
          weddingPlanId: metadata.weddingPlanId,
        }).catch(() => undefined);
      }
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
    onOutreachRecipientChange,
    onOutreachAttachmentsChange,
    onOutreachPermissionsChange,
    onCancelOutreach,
    onRetryOutreach,
    onConnectGmailForOutreach,
    onSendOutreach,
  };
}
