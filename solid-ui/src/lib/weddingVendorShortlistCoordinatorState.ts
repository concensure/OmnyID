// @locs-version: 2.0
// Pure lifecycle gate for one active, fingerprinted wedding-vendor shortlist.

import {
  selectWeddingVendorCategory,
  weddingVendorMaterialFingerprint,
  type WeddingVendorCategorySelection,
} from "@/lib/weddingVendorShortlistPolicyState";

export type WeddingVendorShortlistCoordinatorStatus =
  | "not_ready"
  | "ready"
  | "running"
  | "complete"
  | "blocked"
  | "stale_after_material_change";

export type WeddingVendorShortlistCoordinatorState = {
  status: WeddingVendorShortlistCoordinatorStatus;
  category: string | null;
  fingerprint: string | null;
  action: "collect_category_or_location" | "run_directory_first" | "retry_online_shortfall" | null;
  reason: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function selectedCategory(input: {
  explicitCategory?: string | null;
  onboardingPriorities?: readonly string[] | null;
  unbookedCategories?: readonly string[] | null;
}): WeddingVendorCategorySelection {
  return selectWeddingVendorCategory(input);
}

export function buildWeddingVendorShortlistCoordinatorState(input: {
  weddingPlanId?: string | null;
  location?: string | null;
  explicitCategory?: string | null;
  onboardingPriorities?: readonly string[] | null;
  unbookedCategories?: readonly string[] | null;
  guestCount?: string | null;
  budgetComfort?: string | null;
  dateOrSeason?: string | null;
  preferences?: string | null;
  rankingPolicyVersion?: string | null;
  profileMessageId?: string | null;
  vocabularyVersion?: string | null;
  activeFingerprint?: string | null;
  completedFingerprint?: string | null;
  runningFingerprint?: string | null;
  onlineShortfall?: boolean;
}): WeddingVendorShortlistCoordinatorState {
  const planId = clean(input.weddingPlanId);
  const location = clean(input.location);
  const categorySelection = selectedCategory(input);
  if (!planId || !location || categorySelection.status === "missing") {
    return {
      status: "not_ready", category: null, fingerprint: null, action: "collect_category_or_location",
      reason: !planId ? "Finish creating the wedding plan before searching." : !location ? "Add a wedding location before searching." : categorySelection.reason,
    };
  }
  if (categorySelection.status === "ambiguous" || !categorySelection.category) {
    return { status: "blocked", category: null, fingerprint: null, action: "collect_category_or_location", reason: categorySelection.reason };
  }
  const fingerprint = weddingVendorMaterialFingerprint({
    weddingPlanId: planId, category: categorySelection.category, location, guestCount: input.guestCount,
    budgetComfort: input.budgetComfort, dateOrSeason: input.dateOrSeason, preferences: input.preferences,
    priorities: input.onboardingPriorities, rankingPolicyVersion: input.rankingPolicyVersion,
    profileMessageId: input.profileMessageId, vocabularyVersion: input.vocabularyVersion,
  });
  if (clean(input.runningFingerprint) === fingerprint) {
    return { status: "running", category: categorySelection.category, fingerprint, action: null, reason: null };
  }
  if (clean(input.completedFingerprint) === fingerprint) {
    return { status: "complete", category: categorySelection.category, fingerprint, action: null, reason: null };
  }
  if (clean(input.activeFingerprint) && clean(input.activeFingerprint) !== fingerprint) {
    return {
      status: "stale_after_material_change", category: categorySelection.category, fingerprint,
      action: "run_directory_first", reason: "Wedding details changed, so this comparison needs a successor run.",
    };
  }
  return {
    status: "ready", category: categorySelection.category, fingerprint,
    action: input.onlineShortfall ? "retry_online_shortfall" : "run_directory_first", reason: null,
  };
}
