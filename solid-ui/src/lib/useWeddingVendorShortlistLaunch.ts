// @locs-version: 1.0
import { createEffect, createSignal } from "solid-js";

import {
  buildWeddingVendorShortlistCoordinatorState,
  type WeddingVendorShortlistCoordinatorState,
} from "@/lib/weddingVendorShortlistCoordinatorState";

type CoordinatorInput = Parameters<typeof buildWeddingVendorShortlistCoordinatorState>[0];
type StoredRun = { fingerprint: string; status: "running" | "complete" };

function storageKey(planId: string): string {
  return `omnyid:wedding-vendor-shortlist:${planId}`;
}

function storedRun(storage: Storage | null | undefined, planId: string): StoredRun | null {
  if (!storage || !planId) return null;
  try {
    const value = JSON.parse(storage.getItem(storageKey(planId)) ?? "null") as StoredRun | null;
    return value?.fingerprint && (value.status === "running" || value.status === "complete") ? value : null;
  } catch { return null; }
}

function saveRun(storage: Storage | null | undefined, planId: string, value: StoredRun | null): void {
  if (!storage || !planId) return;
  try {
    if (value) storage.setItem(storageKey(planId), JSON.stringify(value));
    else storage.removeItem(storageKey(planId));
  } catch { /* The current mount's in-memory claim still prevents duplicate calls. */ }
}

/** Runs a single category successor after intake is ready, with reload/tab fingerprint guards. */
export function useWeddingVendorShortlistLaunch(input: {
  coordinatorInput: () => CoordinatorInput;
  enabled?: () => boolean;
  storage?: Storage | null;
  searchRunning: () => boolean;
  run: (category: string, materialFingerprint: string) => Promise<boolean>;
}): void {
  const [attempted, setAttempted] = createSignal<ReadonlySet<string>>(new Set());
  createEffect(() => {
    if (input.enabled?.() === false) return;
    const raw = input.coordinatorInput();
    const planId = typeof raw.weddingPlanId === "string" ? raw.weddingPlanId.trim() : "";
    const stored = storedRun(input.storage, planId);
    const coordinator: WeddingVendorShortlistCoordinatorState = buildWeddingVendorShortlistCoordinatorState({
      ...raw,
      runningFingerprint: stored?.status === "running" ? stored.fingerprint : raw.runningFingerprint,
      completedFingerprint: stored?.status === "complete" ? stored.fingerprint : raw.completedFingerprint,
    });
    if (!planId || !coordinator.fingerprint || !coordinator.category || !coordinator.action || input.searchRunning()
      || attempted().has(coordinator.fingerprint)) return;
    setAttempted((current) => new Set([...current, coordinator.fingerprint!]));
    saveRun(input.storage, planId, { fingerprint: coordinator.fingerprint, status: "running" });
    void input.run(coordinator.category, coordinator.fingerprint).then((complete) => {
      saveRun(input.storage, planId, complete ? { fingerprint: coordinator.fingerprint!, status: "complete" } : null);
    });
  });
}
