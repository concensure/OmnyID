// @locs-version: 1.0
import { createEffect, createSignal, onCleanup, onMount, type Accessor } from "solid-js";

import type { WeddingProjectionSaveFn } from "@/components/WeddingResponseWorkspaceViewTypes";
import { importWeddingAnimalQuizHandoff } from "@/lib/weddingAnimalQuizImportState";
import { importWeddingLeadMagnetRecord } from "@/lib/weddingLeadMagnetImportState";
import {
  completeWeddingLeadMagnetImportRequest,
  weddingLeadMagnetImportRequested,
} from "@/lib/weddingLeadMagnetImportRunnerState";
import {
  applyWeddingPreferenceChipChange,
  confirmWeddingPreferenceProfile,
  interpretWeddingPreferenceOnIntakeSave,
  type WeddingPreferenceChipChange,
} from "@/lib/weddingPreferenceInterpreterState";
import { weddingPreferenceProfileToAfpSendInput } from "@/lib/weddingPreferenceProfileAfpState";
import type { WeddingPreferenceProfile } from "@/lib/weddingPreferenceProfileState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";

export type WeddingPreferenceProfileRecord = {
  profile: WeddingPreferenceProfile;
  messageId: string;
  fingerprint: string;
};

export function useWeddingPreferenceProfileOwner(input: {
  state: Accessor<WeddingResponseWorkspaceViewState>;
  saveProjection?: WeddingProjectionSaveFn | null;
  onRefreshWorkspace?: () => void;
}) {
  const [preferenceProfile, setPreferenceProfile] = createSignal<WeddingPreferenceProfileRecord | null>(null);
  const [preferenceSaving, setPreferenceSaving] = createSignal(false);
  const [leadMagnetImportNotice, setLeadMagnetImportNotice] = createSignal<string | null>(null);
  const [importRequestRevision, setImportRequestRevision] = createSignal(0);
  let interpretedPreferenceFingerprint = "";
  let leadMagnetImportPlanId = "";

  onMount(() => {
    const onImportRequested = () => setImportRequestRevision((current) => current + 1);
    window.addEventListener("omnyid:wedding-lead-magnet-import-requested", onImportRequested);
    onCleanup(() => window.removeEventListener("omnyid:wedding-lead-magnet-import-requested", onImportRequested));
  });

  function requirements() {
    const planning = input.state().contextCards.find((card) => card.planningContext)?.planningContext;
    return {
      guestCount: planning?.guestCount == null ? null : String(planning.guestCount),
      budgetComfort: planning?.budgetComfort ?? null,
      dateOrSeason: planning?.dateOrSeason ?? null,
      location: planning?.location ?? null,
      preferences: planning?.vendorPreferences ?? null,
      topPriorities: planning?.topPriorities ?? [],
      atmosphereDescription: planning?.atmosphereDescription ?? null,
      vendorCategories: planning?.vendorCategories ?? [],
    };
  }

  async function persistPreferenceProfile(
    profile: WeddingPreferenceProfile,
    fingerprint: string,
    parentProfileMessageId: string | null,
    revision: string,
    derivedFromSignals: readonly string[] = [],
  ): Promise<void> {
    const message = weddingPreferenceProfileToAfpSendInput({
      metadata: input.state().workspace.metadata,
      profile,
      parentProfileMessageId,
      revision,
      derivedFromSignals,
    });
    setPreferenceSaving(true);
    try {
      const saved = input.saveProjection ? await input.saveProjection(message) : null;
      const record = saved && typeof saved === "object" ? saved as Record<string, unknown> : {};
      const messageId = typeof record.message_id === "string" && record.message_id.trim()
        ? record.message_id
        : message.id ?? "";
      setPreferenceProfile({ profile, messageId, fingerprint });
      input.onRefreshWorkspace?.();
    } finally {
      setPreferenceSaving(false);
    }
  }

  function updatePreferenceProfile(change: WeddingPreferenceChipChange): void {
    const current = preferenceProfile();
    if (!current || preferenceSaving()) return;
    void persistPreferenceProfile(
      applyWeddingPreferenceChipChange(current.profile, change),
      `${current.fingerprint}:${change.facetId}:${change.choice}`,
      current.messageId,
      `change-${Date.now()}`,
    );
  }

  function confirmPreferenceProfile(): void {
    const current = preferenceProfile();
    if (!current || preferenceSaving()) return;
    void persistPreferenceProfile(
      confirmWeddingPreferenceProfile(current.profile),
      `${current.fingerprint}:confirmed`,
      current.messageId,
      `confirmed-${Date.now()}`,
    );
  }

  createEffect(() => {
    const planId = input.state().workspace.metadata.weddingPlanId;
    const current = requirements();
    if (!planId || (!(current.topPriorities?.length) && !current.preferences && !current.atmosphereDescription)) return;
    void interpretWeddingPreferenceOnIntakeSave({ weddingPlanId: planId, requirements: current }).then(({ fingerprint, profile }) => {
      if (interpretedPreferenceFingerprint === fingerprint || preferenceProfile()?.fingerprint === fingerprint) return;
      interpretedPreferenceFingerprint = fingerprint;
      void persistPreferenceProfile(profile, fingerprint, preferenceProfile()?.messageId ?? null, `intake-${fingerprint}`);
    });
  });

  createEffect(() => {
    importRequestRevision();
    const metadata = input.state().workspace.metadata;
    const saveProjection = input.saveProjection;
    if (
      !metadata.weddingPlanId
      || !saveProjection
      || leadMagnetImportPlanId === metadata.weddingPlanId
      || typeof localStorage === "undefined"
      || !weddingLeadMagnetImportRequested()
    ) return;
    void Promise.all([
      importWeddingLeadMagnetRecord({ storage: localStorage, metadata, saveProjection }),
      importWeddingAnimalQuizHandoff({ storage: localStorage, metadata, existingPlanning: requirements(), saveProjection }),
    ]).then(([result, quizResult]) => {
      leadMagnetImportPlanId = metadata.weddingPlanId;
      completeWeddingLeadMagnetImportRequest();
      const imported = quizResult.status === "imported" ? quizResult : result.status === "imported" ? result : null;
      if (!imported) return;
      setPreferenceProfile({ profile: imported.profile, messageId: imported.messageId, fingerprint: imported.fingerprint });
      setLeadMagnetImportNotice(quizResult.status === "imported"
        ? `We added your Wedding Animal Quiz result: ${quizResult.summary}. Review it before it shapes vendor matches.`
        : `We brought over your Wedding Understanding results: you value ${result.status === "imported" ? result.summary : "your saved preferences"}. They'll shape your vendor matches.`);
      input.onRefreshWorkspace?.();
    }).catch(() => {
      setLeadMagnetImportNotice("We could not add your Wedding Understanding result yet. It is still saved in this browser and will retry after you sign in again.");
    });
  });

  return {
    preferenceProfile,
    preferenceSaving,
    updatePreferenceProfile,
    confirmPreferenceProfile,
    persistPreferenceProfile,
    leadMagnetImportNotice,
    setLeadMagnetImportNotice,
  };
}
