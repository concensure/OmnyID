// @locs-version: 1.0
import { fetchActiveGoalsPulse, fetchBriefToday, queueBriefOffer } from "@/lib/api";
import { shouldLoadIntelligenceBrief, type BriefApiResponse, type BriefSection, type GoalPulseItem } from "@/lib/intelligenceBriefState";
import type { BriefSettings } from "@/lib/intelligenceBriefLocalState";

export type IntelligenceBriefLoadResult = {
  shouldLoad: boolean;
  brief: BriefApiResponse | null;
  goalPulse: GoalPulseItem[];
  briefErrorMessage: string | null;
  goalPulseErrorMessage: string | null;
};

type IntelligenceBriefApi = {
  fetchBriefToday(): Promise<BriefApiResponse | null>;
  fetchActiveGoalsPulse(limit?: number): Promise<GoalPulseItem[]>;
  queueBriefOffer(briefId: string, intent: string): Promise<unknown>;
};

const defaultIntelligenceBriefApi: IntelligenceBriefApi = {
  fetchBriefToday,
  fetchActiveGoalsPulse,
  queueBriefOffer,
};

export function intelligenceBriefVisibleSections(
  brief: BriefApiResponse | null,
  settings: Pick<BriefSettings, "show_goal_pulse" | "show_agent_offer" | "show_ambient">,
): BriefSection[] {
  if (!brief) return [];
  return brief.sections.filter((section) => {
    if (section.type === "goal_pulse" && !settings.show_goal_pulse) return false;
    if (section.type === "agent_offer" && !settings.show_agent_offer) return false;
    if ((section.type === "ambient" || section.type === "peripheral") && !settings.show_ambient) return false;
    return true;
  });
}

export function intelligenceBriefCollapsedGoalPulse(
  goalPulse: readonly GoalPulseItem[],
  limit = 4,
): GoalPulseItem[] {
  return goalPulse.slice(0, Math.max(0, limit));
}

export async function loadIntelligenceBriefData(
  options: { settingsEnabled: boolean; signedIn: boolean; goalLimit?: number },
  api: IntelligenceBriefApi = defaultIntelligenceBriefApi,
): Promise<IntelligenceBriefLoadResult> {
  if (!shouldLoadIntelligenceBrief(options.settingsEnabled, options.signedIn)) {
    return {
      shouldLoad: false,
      brief: null,
      goalPulse: [],
      briefErrorMessage: null,
      goalPulseErrorMessage: null,
    };
  }

  const [briefResult, goalPulseResult] = await Promise.allSettled([
    api.fetchBriefToday(),
    api.fetchActiveGoalsPulse(options.goalLimit ?? 6),
  ]);

  return {
    shouldLoad: true,
    brief: briefResult.status === "fulfilled" ? briefResult.value : null,
    goalPulse: goalPulseResult.status === "fulfilled" ? goalPulseResult.value : [],
    briefErrorMessage: briefResult.status === "rejected"
      ? briefResult.reason instanceof Error
        ? briefResult.reason.message
        : "Could not load daily brief."
      : null,
    goalPulseErrorMessage: goalPulseResult.status === "rejected"
      ? goalPulseResult.reason instanceof Error
        ? goalPulseResult.reason.message
        : "Could not load goal pulse."
      : null,
  };
}

export async function runIntelligenceBriefOfferAction(
  briefId: string | undefined,
  intent: string,
  api: IntelligenceBriefApi = defaultIntelligenceBriefApi,
): Promise<{ openView: "workflows"; queued: boolean }> {
  if (!briefId) {
    return { openView: "workflows", queued: false };
  }
  await api.queueBriefOffer(briefId, intent);
  return { openView: "workflows", queued: true };
}
