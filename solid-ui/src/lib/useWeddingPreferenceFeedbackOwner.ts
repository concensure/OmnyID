// @locs-version: 1.0
import { createMemo, createSignal, type Accessor } from "solid-js";

import type { WeddingVendorChoiceCardData } from "@/components/WeddingVendorChoiceCard";
import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingPreferenceProfileRecord } from "@/lib/useWeddingPreferenceProfileOwner";
import { weddingPreferenceSignalFromAfpMessage, weddingPreferenceSignalToAfpSendInput } from "@/lib/weddingPreferenceSignalAfpState";
import { weddingPreferenceSignalResult, type WeddingPreferenceSignal, type WeddingPreferenceSignalReason } from "@/lib/weddingPreferenceSignalState";
import type { WeddingPreferenceProfile } from "@/lib/weddingPreferenceProfileState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";

type FeedbackConfirmation = {
  kind: "intimate" | "location" | "budget";
  prompt: string;
  signalIds: string[];
};

type PersistPreferenceProfile = (
  profile: WeddingPreferenceProfile,
  fingerprint: string,
  parentProfileMessageId: string | null,
  revision: string,
  derivedFromSignals?: readonly string[],
) => Promise<void>;

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function vendorKey(card: WeddingVendorChoiceCardData): string {
  return card.vendorId?.trim() || card.choiceId.trim();
}

export function useWeddingPreferenceFeedbackOwner(input: {
  state: Accessor<WeddingResponseWorkspaceViewState>;
  preferenceProfile: Accessor<WeddingPreferenceProfileRecord | null>;
  persistPreferenceProfile: PersistPreferenceProfile;
  saveProjection?: ((message: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: () => void;
  onReviewPreferences?: () => void;
}) {
  const [localSignals, setLocalSignals] = createSignal<WeddingPreferenceSignal[]>([]);
  const [confirmation, setConfirmation] = createSignal<FeedbackConfirmation | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  const signals = createMemo(() => {
    const byId = new Map<string, WeddingPreferenceSignal>();
    for (const message of input.state().afpMessages) {
      const signal = weddingPreferenceSignalFromAfpMessage(message);
      if (signal) byId.set(signal.id, signal);
    }
    for (const signal of localSignals()) byId.set(signal.id, signal);
    return [...byId.values()];
  });
  const hiddenVendorIds = createMemo(() => {
    const planId = input.state().workspace.metadata.weddingPlanId;
    const profile = input.preferenceProfile();
    const activeIds = new Set(weddingPreferenceSignalResult({
      profile: profile?.profile ?? { facets: [], unmapped: [] },
      signals: signals(),
      weddingPlanId: planId,
    }).activeSignalIds);
    const hidden = new Set<string>();
    for (const signal of signals()
      .filter((item) => item.weddingPlanId === planId && activeIds.has(item.id))
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id))) {
      if (signal.profileFingerprint && profile && signal.profileFingerprint !== profile.fingerprint) continue;
      if (signal.reason === "restored") hidden.delete(signal.vendorId);
      else if (signal.reason !== "contacted") hidden.add(signal.vendorId);
    }
    return [...hidden];
  });

  async function recordVendorFeedback(
    card: WeddingVendorChoiceCardData,
    comparisonArtifactId: string,
    reason: WeddingPreferenceSignalReason,
  ): Promise<boolean> {
    const current = input.preferenceProfile();
    const createdAt = new Date().toISOString();
    let prepared = weddingPreferenceSignalToAfpSendInput({
      metadata: input.state().workspace.metadata,
      vendorId: vendorKey(card),
      comparisonArtifactId,
      reason,
      vendorFacetIds: card.vendorFacetIds ?? [],
      profileFingerprint: current?.fingerprint ?? null,
      createdAt,
    });
    if (!prepared || !input.saveProjection) return false;
    const profileMayChange = current && (reason === "not_our_style" || reason === "contacted");
    const successorFingerprint = profileMayChange ? `${current.fingerprint}:feedback:${prepared.signal.id}` : current?.fingerprint ?? null;
    if (successorFingerprint !== prepared.signal.profileFingerprint) {
      prepared = weddingPreferenceSignalToAfpSendInput({
        metadata: input.state().workspace.metadata,
        vendorId: vendorKey(card),
        comparisonArtifactId,
        reason,
        vendorFacetIds: card.vendorFacetIds ?? [],
        profileFingerprint: successorFingerprint,
        createdAt,
      });
    }
    if (!prepared) return false;
    try {
      await input.saveProjection(prepared.input);
    } catch {
      return false;
    }
    const nextSignals = [...signals().filter((signal) => signal.id !== prepared.signal.id), prepared.signal];
    setLocalSignals((existing) => [...existing.filter((signal) => signal.id !== prepared.signal.id), prepared.signal]);
    let preferenceUpdateFailed = false;
    if (current) {
      const result = weddingPreferenceSignalResult({
        profile: current.profile,
        signals: nextSignals,
        weddingPlanId: prepared.signal.weddingPlanId,
      });
      if (result.confirmationPrompt) setConfirmation({ kind: "intimate", prompt: result.confirmationPrompt, signalIds: result.activeSignalIds });
      else if (reason === "too_far") setConfirmation({ kind: "location", prompt: "You've passed on a vendor that is too far. Review a tighter location preference?", signalIds: result.activeSignalIds });
      else if (reason === "too_expensive") setConfirmation({ kind: "budget", prompt: "You've passed on a vendor that is too expensive. Review a tighter budget preference?", signalIds: result.activeSignalIds });
      const profileChanged = JSON.stringify(result.profile) !== JSON.stringify(current.profile);
      if (profileChanged && successorFingerprint) {
        try {
          await input.persistPreferenceProfile(
            result.profile,
            successorFingerprint,
            current.messageId,
            `feedback-${Date.now()}`,
            unique([...result.derivedFromSignalIds, prepared.signal.id]),
          );
        } catch {
          preferenceUpdateFailed = true;
          setNotice("Your feedback is saved. Its preference update will retry when the workspace reconnects.");
        }
      }
    }
    if (!preferenceUpdateFailed) {
      setNotice(reason === "restored"
        ? `${card.title} is back in your comparison.`
        : `${card.title} is hidden. You can restore it below the comparison.`);
    }
    input.onRefreshWorkspace?.();
    return true;
  }

  function confirmSuggestion(): void {
    const current = input.preferenceProfile();
    const prompt = confirmation();
    setConfirmation(null);
    if (!prompt) return;
    if (prompt.kind !== "intimate") {
      setNotice("Your feedback is saved. Review your planning preferences before changing this constraint.");
      input.onReviewPreferences?.();
      return;
    }
    if (!current) return;
    const profile: WeddingPreferenceProfile = {
      ...current.profile,
      facets: [
        ...current.profile.facets.filter((facet) => facet.facetId !== "scale.intimate"),
        { facetId: "scale.intimate", weight: "must", polarity: 1, anchor: "Confirmed after passing on large venues", anchorSource: "feedback", confidence: 1, authority: "user" },
      ],
    };
    void input.persistPreferenceProfile(
      profile,
      `${current.fingerprint}:confirmed-intimate`,
      current.messageId,
      `confirmed-intimate-${Date.now()}`,
      prompt.signalIds,
    );
  }

  return {
    feedbackConfirmation: confirmation,
    feedbackNotice: notice,
    setFeedbackNotice: setNotice,
    hiddenVendorIds,
    recordVendorFeedback,
    restoreVendor: (card: WeddingVendorChoiceCardData, artifactId: string) => recordVendorFeedback(card, artifactId, "restored"),
    confirmFeedbackSuggestion: confirmSuggestion,
    dismissFeedbackSuggestion: () => setConfirmation(null),
  };
}
