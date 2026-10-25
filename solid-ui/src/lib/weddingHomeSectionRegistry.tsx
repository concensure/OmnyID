// @locs-version: 1.0
import type { ComponentProps, JSX } from "solid-js";
import { For } from "solid-js";

import { WeddingDecisionFocusCard } from "@/components/WeddingDecisionFocusCard";
import { WeddingHomeOverviewGrid } from "@/components/WeddingHomeOverviewGrid";
import { WeddingHomeStatusStrip } from "@/components/WeddingHomeStatusStrip";
import { WeddingNextStepCard } from "@/components/WeddingNextStepCard";
import { WeddingPlanningBasicsSection, WeddingVendorSearchHomeSection } from "@/components/WeddingVendorSearchHomeSections";
import { WeddingPlanningThreadsCard } from "@/components/WeddingPlanningThreadsCard";
import { WeddingProjectionApprovalCard } from "@/components/WeddingProjectionApprovalCard";
import { WeddingResilienceCardList } from "@/components/WeddingResilienceCardList";
import { WeddingVendorFollowUpPanel } from "@/components/WeddingVendorFollowUpPanel";
import { WeddingVendorQuoteReplyCard } from "@/components/WeddingVendorQuoteReplyCard";
import type { WeddingResponseWorkspaceViewProps } from "@/components/WeddingResponseWorkspaceViewTypes";
import type { useWeddingVendorOutreachOwner } from "@/lib/useWeddingVendorOutreachOwner";
import type { useWeddingPreferenceFeedbackOwner } from "@/lib/useWeddingPreferenceFeedbackOwner";
import type { useWeddingPreferenceProfileOwner } from "@/lib/useWeddingPreferenceProfileOwner";
import type { WeddingHomeSectionId } from "@/lib/weddingHomeSectionPolicyState";
import { planningConstraintCaptureUiEnabled } from "@/lib/planningConstraintCapture";
import type { WeddingVendorQuoteReplyFlowState } from "@/lib/weddingVendorQuoteReplyFlowState";
import type { WeddingResponseWorkspaceViewState, WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";

export type WeddingHomeSection = {
  id: WeddingHomeSectionId;
  title: string;
  visible: boolean;
  render: () => JSX.Element;
};

type WorkspaceProps = WeddingResponseWorkspaceViewProps;
type SearchAction = NonNullable<WorkspaceProps["vendorSearchResultAction"]>;

export type WeddingHomeSectionRegistryInput = {
  state: () => WeddingResponseWorkspaceViewState;
  workspace: WorkspaceProps;
  exportNotice: () => string | null;
  handleSidebarAction: NonNullable<ComponentProps<typeof WeddingHomeOverviewGrid>["onSidebarAction"]>;
  searchResult: {
    action: SearchAction;
    preview: WeddingWorkspaceArtifactPreview | null;
    sourcePreview: WeddingWorkspaceArtifactPreview | null;
  } | null;
  onDismissSearchResult: (artifactId: string) => void;
  vendorOutreach: ReturnType<typeof useWeddingVendorOutreachOwner>;
  preferenceProfileOwner: Pick<ReturnType<typeof useWeddingPreferenceProfileOwner>, "preferenceProfile" | "preferenceSaving" | "updatePreferenceProfile" | "confirmPreferenceProfile">;
  preferenceFeedback: ReturnType<typeof useWeddingPreferenceFeedbackOwner>;
  quoteCardProps: (flow: WeddingVendorQuoteReplyFlowState) => ComponentProps<typeof WeddingVendorQuoteReplyCard>;
  followUpProps: ComponentProps<typeof WeddingVendorFollowUpPanel>;
};

export function buildWeddingHomeSections(input: WeddingHomeSectionRegistryInput): WeddingHomeSection[] {
  const state = input.state;
  const workspace = input.workspace;
  return [
    {
      id: "next_step",
      title: "Next step",
      visible: true,
      render: () => <WeddingNextStepCard state={state()} onSelectMenu={workspace.onSelectMenu} onSaveWeddingDate={workspace.onSaveWeddingDate} />,
    },
    {
      id: "planning_basics",
      title: "Planning basics needed",
      visible: workspace.vendorSearchReadiness?.status === "blocked" || planningConstraintCaptureUiEnabled(),
      render: () => <WeddingPlanningBasicsSection workspace={workspace} />,
    },
    {
      id: "vendor_search",
      title: "Live vendor search",
      visible: true,
      render: () => <WeddingVendorSearchHomeSection
        stayOnHome
        workspace={workspace} result={input.searchResult} outreach={input.vendorOutreach} onDismiss={input.onDismissSearchResult}
        preferenceProfile={input.preferenceProfileOwner.preferenceProfile()?.profile ?? null}
        preferenceSaving={input.preferenceProfileOwner.preferenceSaving()}
        onPreferenceChange={input.preferenceProfileOwner.updatePreferenceProfile}
        onPreferenceConfirm={input.preferenceProfileOwner.confirmPreferenceProfile}
        hiddenVendorIds={input.preferenceFeedback.hiddenVendorIds()}
        onNotForUs={input.preferenceFeedback.recordVendorFeedback}
        onRestoreVendor={input.preferenceFeedback.restoreVendor}
        feedbackConfirmationPrompt={input.preferenceFeedback.feedbackConfirmation()?.prompt ?? null}
        feedbackConfirmationActionLabel={input.preferenceFeedback.feedbackConfirmation()?.kind === "intimate" ? "Make it a must-have" : "Review preferences"}
        feedbackNotice={input.preferenceFeedback.feedbackNotice()}
        onConfirmFeedbackSuggestion={input.preferenceFeedback.confirmFeedbackSuggestion}
        onDismissFeedbackSuggestion={input.preferenceFeedback.dismissFeedbackSuggestion}
      />,
    },
    {
      id: "notice",
      title: "Planner notice",
      visible: Boolean(input.exportNotice()),
      render: () => <p class="rounded-2xl border border-sky-100 bg-sky-50/80 px-3 py-2 text-sm leading-6 text-sky-950/75">{input.exportNotice()}</p>,
    },
    {
      id: "overview",
      title: "Wedding overview",
      visible: true,
      render: () => <WeddingHomeOverviewGrid state={state()} onSelectMenu={workspace.onSelectMenu} onSidebarAction={input.handleSidebarAction} onSaveWeddingDate={workspace.onSaveWeddingDate} saveProjection={workspace.saveProjection} onRefreshWorkspace={workspace.onRefreshWorkspace} />,
    },
    {
      id: "status",
      title: "Wedding status",
      visible: true,
      render: () => <WeddingHomeStatusStrip state={state()} onSelectMenu={workspace.onSelectMenu} />,
    },
    {
      id: "threads",
      title: "Planning threads",
      visible: true,
      render: () => <WeddingPlanningThreadsCard state={state()} onSelectMenu={workspace.onSelectMenu} onSelectArtifact={workspace.onSelectArtifact} />,
    },
    {
      id: "quote_replies",
      title: "Vendor quote replies",
      visible: state().activeVendorQuoteReplyFlows.length > 0,
      render: () => <div class="space-y-3"><For each={state().activeVendorQuoteReplyFlows}>{(flow) => <WeddingVendorQuoteReplyCard {...input.quoteCardProps(flow)} />}</For></div>,
    },
    {
      id: "vendor_follow_up",
      title: "Vendor follow-ups",
      visible: state().vendorContactCards.length > 0 || state().vendorPursuitLogCards.length > 0 || state().vendorQuoteReplyLogFlows.length > 0,
      render: () => <WeddingVendorFollowUpPanel {...input.followUpProps} />,
    },
    {
      id: "decision_focus",
      title: "Decision focus",
      visible: true,
      render: () => <WeddingDecisionFocusCard state={state()} onSidebarAction={input.handleSidebarAction} />,
    },
    {
      id: "resilience",
      title: "Plan resilience",
      visible: true,
      render: () => <WeddingResilienceCardList state={state().resilience} onSidebarAction={input.handleSidebarAction} />,
    },
    {
      id: "approval",
      title: "Approval queue",
      visible: Boolean(state().projectionQueue),
      render: () => <WeddingProjectionApprovalCard state={state().projectionQueue} save={workspace.saveProjection} storage={workspace.projectionStorage} onDispatched={workspace.onProjectionDispatched} onReviewBlocked={workspace.onReviewBlockedOutputs} />,
    },
  ];
}

export function WeddingHomeSectionRegistry(props: {
  sections: WeddingHomeSection[];
  controlsVisible: (id: WeddingHomeSectionId) => boolean;
  onDrop: (id: WeddingHomeSectionId) => void;
  onPointerMove: (id: WeddingHomeSectionId, event: MouseEvent & { currentTarget: HTMLDivElement }) => void;
  onPointerLeave: (id: WeddingHomeSectionId) => void;
  onShowControls: (id: WeddingHomeSectionId) => void;
  onDragStart: (id: WeddingHomeSectionId) => void;
  onDragEnd: () => void;
  onMove: (id: WeddingHomeSectionId, index: number) => void;
}) {
  return (
    <For each={props.sections}>
      {(section, index) => (
        <div
          class="rounded-none border-0 bg-transparent p-0 shadow-none backdrop-blur-none sm:rounded-[24px] sm:border sm:border-white/55 sm:bg-white/45 sm:p-2 sm:shadow-sm sm:backdrop-blur"
          data-wedding-home-section={section.id}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => props.onDrop(section.id)}
          onMouseMove={(event) => props.onPointerMove(section.id, event)}
          onMouseLeave={() => props.onPointerLeave(section.id)}
        >
          <div
            class={`mb-2 flex flex-wrap items-center justify-between gap-2 transition duration-200 ${props.controlsVisible(section.id) ? "opacity-100" : "pointer-events-none h-0 overflow-hidden opacity-0"}`}
            onMouseEnter={() => props.onShowControls(section.id)}
            onMouseLeave={() => props.onPointerLeave(section.id)}
          >
            <button
              type="button"
              class="inline-flex cursor-grab items-center gap-2 rounded-full border border-stone-200 bg-white/85 px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm active:cursor-grabbing"
              title={`Drag to move ${section.title}`}
              aria-label={`Move ${section.title}`}
              draggable={props.sections.length > 1}
              onDragStart={(event) => {
                props.onDragStart(section.id);
                event.dataTransfer?.setData("text/plain", section.id);
              }}
              onDragEnd={props.onDragEnd}
            >
              :: <span>{section.title}</span>
            </button>
            <div class="flex flex-wrap gap-1">
              <button type="button" class="rounded-full border border-stone-200 bg-white/85 px-2.5 py-1 text-xs font-semibold text-stone-700 disabled:opacity-40" disabled={index() === 0} title="Move this card up" onClick={() => props.onMove(section.id, index() - 1)}>Up</button>
              <button type="button" class="rounded-full border border-stone-200 bg-white/85 px-2.5 py-1 text-xs font-semibold text-stone-700 disabled:opacity-40" disabled={index() === props.sections.length - 1} title="Move this card down" onClick={() => props.onMove(section.id, index() + 1)}>Down</button>
            </div>
          </div>
          {section.render()}
        </div>
      )}
    </For>
  );
}
