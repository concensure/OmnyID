// @locs-version: 1.0
import { buildWeddingTemplateEntryState, type WeddingTemplateEntryState } from "@/lib/weddingTemplateEntryState";
import {
  buildWeddingNavigationIntentFromPresentationAction,
  type WeddingNavigationIntent,
} from "@/lib/weddingNavigationState";
import type { ViewName } from "@/lib/viewNames";

export type TemplateCatalogCategory = "entrepreneur" | "productivity" | "research" | "content" | "life_event";

export type TemplateCatalogItem = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: TemplateCatalogCategory;
  icon: string;
  tags: string[];
  viewTarget: ViewName;
  estimatedTime?: string;
  featured?: boolean;
  launchIntent: WeddingNavigationIntent | null;
  secondaryActions: TemplateCatalogAction[];
  starterLabels: string[];
};

export type TemplateCatalogAction = {
  id: string;
  label: string;
  description: string;
  viewTarget: ViewName;
  launchIntent: WeddingNavigationIntent | null;
};

function weddingLaunchIntent(entry: WeddingTemplateEntryState): WeddingNavigationIntent {
  return buildWeddingNavigationIntentFromPresentationAction({
    kind: "open_planning_files",
    label: "Open wedding documents",
    weddingPlanId: entry.metadata.weddingPlanId,
    responseWorkspaceId: entry.metadata.responseWorkspaceId,
    sourceResponseId: entry.metadata.sourceResponseId,
    artifactId: null,
    sectionId: "artifacts",
  });
}

function weddingDemoLaunchIntent(): WeddingNavigationIntent {
  const entry = buildWeddingTemplateEntryState({
    seed: "sample harbour wedding",
    sourceResponseId: "demo:wedding-response",
  });
  return weddingLaunchIntent(entry);
}

export function buildTemplateCatalogState(input: {
  weddingSeed?: string | null;
  weddingSourceResponseId?: string | null;
} = {}): TemplateCatalogItem[] {
  const weddingEntry = buildWeddingTemplateEntryState({
    seed: input.weddingSeed ?? "wedding planning",
    sourceResponseId: input.weddingSourceResponseId ?? null,
  });

  return [
    {
      id: "ai_cofounder_launchpad",
      title: "AI Co-Founder Launchpad",
      subtitle: "Validate your business idea end-to-end",
      description: "Turn a raw idea into a validated business concept with market research, founder-market fit scoring, Dream Score valuation, a full asset kit, and scheduled social content.",
      category: "entrepreneur",
      icon: "Launch",
      tags: ["Market research", "Dream Score", "Business plan", "Social content"],
      viewTarget: "cofounder_studio",
      estimatedTime: "30-60 min",
      featured: true,
      launchIntent: null,
      secondaryActions: [],
      starterLabels: [],
    },
    {
      id: "wedding_planning",
      title: weddingEntry.label,
      subtitle: "Plan venues, budget, tasks, drafts, maps, legal setup, and files",
      description: weddingEntry.description,
      category: "life_event",
      icon: "Wedding",
      tags: ["Documents", "Need-To-Know", "Calendar", "Approvals"],
      viewTarget: "response_queue",
      estimatedTime: "Under 60 sec",
      featured: true,
      launchIntent: weddingLaunchIntent(weddingEntry),
      secondaryActions: [
        {
          id: "open_sample_demo",
          label: "Open sample demo",
          description: "Launches sample-only wedding files with no live vendor, booking, or availability claims.",
          viewTarget: "response_queue",
          launchIntent: weddingDemoLaunchIntent(),
        },
      ],
      starterLabels: weddingEntry.starterPrompts.map((prompt) => prompt.label),
    },
    {
      id: "personal_agent_setup",
      title: "Personal Agent Setup",
      subtitle: "Configure your AI surrogate",
      description: "Set up your personal OmnyID agent with priority rules, communication preferences, approval thresholds, and calendar conflict resolution.",
      category: "productivity",
      icon: "Agent",
      tags: ["Inbox triage", "Priority rules", "Approval gates", "Research"],
      viewTarget: "agent_settings",
      estimatedTime: "10-15 min",
      launchIntent: null,
      secondaryActions: [],
      starterLabels: [],
    },
  ];
}
