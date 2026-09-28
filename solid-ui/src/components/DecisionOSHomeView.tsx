// @locs-version: 1.0
/**
 * DecisionOSHomeView ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Decision-First Home Screen (v3)
 *
 * Features:
 *   - Day / Week / Month / Year duration view switcher
 *   - Time-aware greeting above north star
 *   - Mood selector → auto-filters queue + records to diary
 *   - Progressive disclosure for decisions with >3 options
 *   - Why-this-matters rendered as icon bullets
 *   - Clickable confidence score → explanation popover
 *   - Dismiss ->
 *   - Snooze (replaces Defer) → time-picker popover
 *   - Context panel source links back to original threads / emails
 *   - Confetti burst on queue completion
 *   - Goal breakdown modal with conversation / self-write / AI-infer flows
 *   - Calendar navigation on click for calendar-linked decisions
 *   - Keyboard shortcuts (j/k navigate, a approve, x dismiss, z snooze,
 *     d/w/m/y switch view, c open calendar, Esc close, ? help)
 *
 * Agent integration:
 *   window CustomEvent "omnyid:decision-os-update"
 *     normalized continuity detail plus optional event-only `decisions`
 *   Diary writes via "omnyid:diary-entry" CustomEvent + localStorage "omnyid.diary-entries"
 *   Calendar nav: "omnyid:navigate" -> { view: "calendar", eventId?, date? }
 *   Goal breakdown start: "omnyid:goal-breakdown" -> { goalId, action, selectedDays? }
 */

import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import {
  latestWatcherSignalSummaryFromMessages,
  preparedDraftDestinationForItems,
  preparedDraftActionLabel,
} from "afp-ts/continuity";
import { topThreadFreshnessState } from "afp-ts/retrieval";
import { dispatchActionChipEvent } from "@/lib/actionChipEvent";
import { readSession, safeHref, type DashboardBootstrap } from "@/lib/api";
import {
  dashboardBootstrapCalendarRuntimeSummary,
  dashboardBootstrapContinuityStateFields,
  dashboardBootstrapCostSnapshot,
  dashboardBootstrapCostStatus,
  dashboardBootstrapMessages,
  dashboardBootstrapThreadRetrievalState,
} from "@/lib/dashboardBootstrapState";
import { dispatchGoalBreakdownEvent } from "@/lib/goalBreakdownEvent";
import {
  loadVimNavigationEnabled,
  subscribeVimNavigationPreference,
} from "@/lib/vimNavigationPreference";
import {
  navigateToView,
  type DecisionOsFocusEventDetail,
} from "@/lib/decisionosNavigation";
import {
  type DecisionOsBriefing,
  type DecisionOsCostStatus,
  type DecisionOsCostSnapshot,
  type DecisionOsNormalizedUpdateDetail,
  type DecisionOsSuggestedMood,
  decisionOsBriefing,
  latestDecisionOsUpdateDetail,
  summarizeDecisionOsStateFields,
} from "@/lib/decisionosContinuity";
import {
  inferDecisionOsMood,
  type DecisionOsEnergyInference,
} from "@/lib/decisionosEnergy";
import { decisionOsPreparedWorkCue } from "@/lib/decisionosPreparedWorkState";
import { openDecisionQueuePriorityTarget } from "@/lib/decisionQueueNavigation";
import {
  decisionOsCompletedPct,
  decisionOsEffectiveQueueMinutes,
  decisionOsQueueEffortLabel,
  decisionOsQueueLoadLabel,
  decisionOsQueueLoadTone,
  decisionOsQueueOverloadSummary,
  decisionOsQueueTrendGlyph,
  decisionOsShouldShowQueuePriorityAction,
  shouldShowDecisionOsQueueOverload,
} from "@/lib/decisionOsBriefingState";
import { appendDecisionOsConfetti } from "@/lib/decisionOsConfettiEffect.js";
import { createDecisionOsHomeBridgeController } from "@/lib/decisionOsHomeBridgeController";
import { mergeDecisionOsContinuityDecisions } from "@/lib/decisionOsContinuityMergeState";
import {
  decisionOsDismissLowImpactPlan,
  decisionOsFocusQueuePriorityFollowUpPlan,
  decisionOsGoalScheduledPlan,
  decisionOsScheduleReviewPlan,
} from "@/lib/decisionOsHomeFollowUpState.js";
import { decisionOsResolvedUpdateState } from "@/lib/decisionOsResolvedUpdateState";
import {
  decisionOsTopBlockerPlan,
} from "@/lib/decisionOsBriefingInteractionState";
import {
  decisionOsAutoTriageActionChip,
  decisionOsDurationTabPlan,
  decisionOsQueueOverloadMoodPlan,
} from "@/lib/decisionOsQueueInteractionState";
import { CognitiveBentoRow as SharedCognitiveBentoRow } from "@/components/CognitiveBentoRow";
import { WhyMattersSection } from "@/components/DecisionContextSections";
import { DurationTabs as SharedDurationTabs } from "@/components/DurationTabs";
import { OperationalPressureRow as SharedOperationalPressureRow } from "@/components/OperationalPressureRow";
import { OperationalLanesSurface } from "@/components/OperationalLanesSurface";
import { PreparedDraftSurface } from "@/components/PreparedDraftSurface";
import { ContextPackSurface } from "@/components/ContextPackSurface";
import { QueueWorkspaceLayout } from "@/components/QueueWorkspaceLayout";
import { QueueOverloadBanner as SharedQueueOverloadBanner } from "@/components/QueueOverloadBanner";
import { ResponseQueueSurface } from "@/components/ResponseQueueSurface";
import { StateFieldStrip } from "@/components/StateFieldStrip";
import type { MagicActionEventDetail } from "@/lib/magicActionEvent";
import {
  type DecisionOsQueueCompanionState,
  type DecisionOsQueueBootstrapState,
  decisionOsQueueHasVisibleWork,
} from "@/lib/decisionOsQueueBootstrapState";
import {
  computeCurrentStreak,
  loadOptionChoice,
  preferredSnoozeOptionId,
  recordClearStreak,
  saveOptionChoice,
  type PendingOutcomeCheck,
} from "@/lib/decisionOsHomeState";
import {
  decisionOsContextAnnotation,
  decisionOsContextAnnotationEditState,
  decisionOsContextAnnotationKeyDownState,
  decisionOsContextAnnotationKey,
  decisionOsContextAnnotationSaveState,
} from "@/lib/decisionOsContextAnnotations";
import {
  decisionOsContextAnnotationPlaceholder,
  decisionOsContextAddNoteLabel,
  decisionOsContextCalendarActionLabel,
  decisionOsContextCloseAriaLabel,
  decisionOsContextExternalViewLabel,
  decisionOsContextFooterActions,
  decisionOsContextEmptyStateLabel,
  decisionOsContextItemOpenLabel,
  decisionOsContextPinAriaLabel,
  decisionOsContextPinTitle,
  decisionOsContextPanelTitle,
  decisionOsContextSaveNoteLabel,
  decisionOsContextSelectionPromptLabel,
  decisionOsContextShortcutHintLabel,
  decisionOsContextItemTargetLabelFromRefs,
  decisionOsContextWorkspaceActionLabel,
  decisionOsContextWhyMattersTitle,
} from "@/lib/decisionOsContextNavigationState";
import {
  dispatchDecisionOsSearchAction,
  openDecisionOsContextItem,
} from "@/lib/decisionOsHomeEffects.js";
import {
  decisionWhyNow,
  formatSnoozeDateLabel,
  primarySourceProvenance,
  relativeShortDuration,
} from "@/lib/decisionOsDecisionContextState";
import {
  decisionOsDecisionCardCloseLabel,
  decisionOsDeadlineInsight,
  decisionOsDeadlineInsightTitle,
  decisionOsUrgencyInsightButtonTitle,
  decisionOsUrgencyInsightState,
} from "@/lib/decisionOsDecisionCardInsightState";
import {
  decisionOsConfidenceBadgeClass,
  decisionOsConfidenceFallbackTitle,
  decisionOsConfidenceLabel,
  decisionOsConfidenceStripClass,
  decisionOsConfidenceTitle,
} from "@/lib/decisionOsConfidenceState";
import {
  decisionOsConfidenceCloseLabel,
  decisionOsConfidenceExplanationAriaLabel,
  decisionOsConfidenceExplanationTitle,
  decisionOsConfidenceFlagReasoningLabel,
  shouldCloseDecisionOsConfidencePopoverForKey,
  shouldKeepDecisionOsConfidencePopoverOpen,
} from "@/lib/decisionOsConfidencePopoverState";
import {
  decisionOsDurationScopeSearchLabel,
  decisionOsImpactIcon,
  decisionOsImpactLabel,
  decisionOsUrgencyStyle,
} from "@/lib/decisionOsPriorityDisplayState";
import {
  decisionOsDurationScopeExplanation,
  decisionOsImpactExplanation,
  decisionOsShortcutsCloseAriaLabel,
  decisionOsShortcuts,
  decisionOsShortcutsTitle,
  decisionOsShortcutsTypingHint,
} from "@/lib/decisionOsInterfaceCopy";
import {
  decisionOsSwipeActionPlan,
  decisionOsSwipeColor,
  decisionOsSwipeMovePlan,
  decisionOsSwipeOpacity,
} from "@/lib/decisionOsSwipeState";
import {
  decisionEffortMinutes as effortMinutes,
  decisionOsEmptyQueueDayReturnLabel,
  decisionOsEmptyQueueNextStepsLabel,
  decisionOsEmptyQueueOpenResponseQueueLabel,
  decisionOsEmptyQueueReviewWeekLabel,
  decisionOsEmptyQueueSummary,
  decisionOsEmptyQueueTitle,
  decisionOsClearStreakLabel,
  decisionOsOutcomeCheckBadgeLabel,
  decisionOsGreeting as getGreeting,
  inferDecisionOsSnoozeOptions,
  isDecisionOsQuickWin,
  totalDecisionOsEffortMinutes,
} from "@/lib/decisionOsHomePresentationState";
import {
  decisionOsDaysOfWeek,
  decisionOsDurationScopeOrder,
  decisionOsDurationViews,
  decisionOsMoodEffortFilter,
  decisionOsMoodOptions,
} from "@/lib/decisionOsHomeOptionsState";
import {
  decisionOsAutoMoodActionLabel,
  decisionOsAutoMoodLabel,
  decisionOsAutoMoodReasonLabel,
  decisionOsAutoMoodSelection,
  decisionOsAutoQuickWinsActiveLabel,
  decisionOsMoodPromptLabel,
  decisionOsQueueClearMoodResetPlan,
  decisionOsQuickWinsOnlyLabel,
  decisionOsVisibleDecisionCountLabel,
  decisionOsMoodSelectionPlan,
} from "@/lib/decisionOsMoodState";
import {
  decisionOsGoalBreakdownAcceptPlanLabel,
  decisionOsGoalBreakdownAnalyzingLabel,
  decisionOsGoalBreakdownAiInferredTitle,
  decisionOsGoalBreakdownBackLabel,
  decisionOsGoalBreakdownConfirmPlan,
  decisionOsGoalBreakdownConfirmScheduleLabel,
  decisionOsGoalBreakdownConfirmedTitle,
  decisionOsGoalBreakdownConversationPlaceholder,
  decisionOsGoalBreakdownConversationState,
  decisionOsGoalBreakdownDoneLabel,
  decisionOsGoalBreakdownInferenceState,
  decisionOsGoalBreakdownModifyDaysLabel,
  decisionOsGoalBreakdownOverviewPrompt,
  decisionOsGoalBreakdownPickDayHint,
  decisionOsGoalBreakdownPickDayTitle,
  decisionOsGoalBreakdownSavePlanLabel,
  decisionOsGoalBreakdownSendLabel,
  decisionOsGoalBreakdownSelectedDaysFallbackLabel,
  decisionOsGoalBreakdownSkipLabel,
  decisionOsGoalBreakdownSuggestedDays,
  decisionOsGoalBreakdownTitle,
  decisionOsGoalBreakdownViewCalendarLabel,
  decisionOsGoalBreakdownWritingPlaceholder,
  decisionOsGoalBreakdownWritingPrompt,
  toggleDecisionOsGoalDaySelection,
} from "@/lib/decisionOsGoalBreakdownModalState";
import {
  decisionOsFocusedItem,
  decisionOsSelectedOrFocusedItem,
} from "@/lib/decisionOsKeyboardState";
import { decisionOsKeyboardIntent } from "@/lib/decisionOsKeyboardIntentState";
import { decisionOsKeyboardExecutionPlan } from "@/lib/decisionOsKeyboardExecutionState";
import {
  decisionOsContextSelection,
  decisionOsFocusModeSelection,
} from "@/lib/decisionOsSelectionState";
import {
  decisionOsMagicActionPlan,
  decisionOsSelectionAfterContinuityUpdate,
  shouldFocusDecisionOsResponseQueue,
} from "@/lib/decisionOsEventBridgeState";
import {
  decisionOsMagicDispatchPlan,
  decisionOsMagicExecutionPlan,
} from "@/lib/decisionOsMagicExecutionState";
import { decisionOsUpdateApplicationState } from "@/lib/decisionOsUpdateApplicationState";
import type { DecisionOsUpdateApplicationState } from "@/lib/decisionOsUpdateApplicationState";
import {
  decisionOsCompletedProgressLabel,
  decisionOsCompletedTodayTitle,
  decisionOsDismissLowImpactLabel,
  decisionOsScheduleReviewLabel,
  decisionOsTimeSavedLabel,
  decisionOsTimeSavedTitle,
} from "@/lib/decisionOsProgressState";
import {
  buildTrustAwareActionDecision as trustAwareActionDecision,
  buildTrustAwarePriorityDecision as trustAwarePriorityDecision,
} from "@/lib/decisionOsContinuityDecisionAssembly";
import {
  recordDecisionOsDiaryEntry,
  updateDecisionOsDiaryEntryOutcomeCheck,
} from "@/lib/decisionOsDiaryState";
import {
  decisionOsFlagReasoningDiaryEntry,
  decisionOsFlagReasoningFallbackDetail,
  decisionOsOutcomeCheckMenuOptions,
  decisionOsOutcomeCheckRescheduleAt,
  decisionOsOutcomeCheckScheduledTitle,
} from "@/lib/decisionOsDecisionCardPopoverState";
import {
  decisionOsFocusOverlayAiSuggestedLabel,
  decisionOsFocusOverlayCloseAriaLabel,
  decisionOsFocusOverlayConfidenceText,
  decisionOsFocusOverlayHasSourceRefs,
  decisionOsFocusOverlaySectionTitle,
  decisionOsFocusOverlaySourceRefs,
  decisionOsFocusOverlaySummaryChips,
  decisionOsFocusOverlayTitle,
} from "@/lib/decisionOsFocusOverlayState";
import type { DiaryEntry } from "@/lib/diaryEvent";
import { decisionOsActionExecution } from "@/lib/decisionOsDecisionActionExecutionState.js";
import { decisionOsActionEffectPlan } from "@/lib/decisionOsDecisionActionEffectState.js";
import {
  decisionOsActionTarget,
  decisionOsApproveUiState,
  decisionOsDismissUiState,
  decisionOsSnoozeUiState,
} from "@/lib/decisionOsDecisionActionState";
import {
  decisionOsAiRecommendationBadgeLabel,
  decisionOsApproveActionLabel,
  decisionOsApproveConfirmLabel,
  decisionOsAiRecommendationDetail,
  decisionOsAiRecommendationTitle,
  decisionOsApproveMagicLabel,
  decisionOsApproveNotePlaceholder,
  decisionOsUsedLastTimeLabel,
  decisionOsDelegateDecisionLabel,
  decisionOsDismissMagicLabel,
  decisionOsDismissDecisionTitle,
  decisionOsFocusDecisionLabel,
  decisionOsFocusDecisionTitle,
  decisionOsHiddenOptionCount,
  decisionOsMoreOptionsLabel,
  decisionOsQuickWinFilterTitle,
  decisionOsVisibleOptions,
} from "@/lib/decisionOsDecisionCardState";
import {
  decisionOsDecisionCardCalendarActionLabel,
  decisionOsDecisionCardImpactSearchLabel,
  decisionOsDecisionCardImpactTooltipTitle,
  decisionOsDecisionCardOpenThreadLabel,
  decisionOsDecisionCardProvenancePrefix,
  decisionOsDecisionCardSourceCount,
  decisionOsDecisionCardSourcePreviewItems,
  decisionOsDecisionCardSourceSearchLabel,
  decisionOsDecisionCardSourcesTooltipTitle,
  decisionOsDecisionCardThreadContextItem,
} from "@/lib/decisionOsDecisionCardContextPreviewState";
import {
  createDecisionOsToastController,
  type DecisionOsToastState,
} from "@/lib/decisionOsToastController";
import { createDecisionOsApproveFlowController } from "@/lib/decisionOsApproveFlowController";
import {
  loadDecisionPendingOutcomeChecks,
  rescheduleDecisionPendingOutcomeCheck,
  scheduleDecisionPendingOutcomeCheck,
  withoutDecisionPendingOutcomeCheck,
} from "@/lib/decisionOsOutcomeCheckState";
import {
  applyDecisionSnooze,
  decisionSnoozeCountTitle,
  decisionSnoozeQuickAction,
  decisionSnoozeQuickActionTitle,
  decisionSnoozeSavedChoiceLabel,
  decisionSnoozeUsualLabel,
  decisionSnoozeUsualPrefix,
  highlightedDecisionSnoozeOptionId,
  loadDecisionOsSnoozed,
  loadSnoozeCounts,
  saveDecisionOsSnoozed,
  undoDecisionSnooze,
} from "@/lib/decisionOsSnoozeState";
import {
  decisionOsQueueLoadTrend,
  nextQueueMinutesBaseline,
} from "@/lib/decisionOsQueueLoadState";
import {
  decisionOsCostMetricChips,
  decisionOsCostStatusTone,
} from "@/lib/decisionOsCostStatusState";
import {
  decisionOsBentoDecisionsSuffix,
  decisionOsBentoDoneTodayLabel,
  decisionOsBentoOutcomeRateLabel,
  decisionOsBentoPendingLabel,
  decisionOsBentoPositiveOutcomeSuffix,
  decisionOsBentoQueueLoadLabel,
  decisionOsBentoReclaimedSuffix,
  decisionOsBentoTimeSavedLabel,
  decisionOsBentoToReviewSuffix,
} from "@/lib/decisionOsCognitiveBentoState";

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ Types ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬

const DECISION_OS_COST_STATUS_TITLE = "Cost Status";
const DECISION_OS_OPEN_COST_DASHBOARD_LABEL = "Open cost dashboard";
const DECISION_OS_NORTH_STAR_TITLE = "Today's North Star";
const DECISION_OS_OPEN_QUEUE_PRIORITY_LABEL = "Open queue priority";
const DECISION_OS_TOP_BLOCKER_LABEL = "Top blocker";
const DECISION_OS_URGENT_LABEL = "Urgent";
const DECISION_OS_HIGH_IMPACT_LABEL = "High-Impact";
const DECISION_OS_DONE_LABEL = "Done";
const DECISION_OS_WATCHER_PRESSURE_LABEL = "Watcher pressure";
const DECISION_OS_TOP_THREAD_LABEL = "Top thread";
const DECISION_OS_QUEUE_OVERLOAD_DETAIL =
  "Set your mood to filter quick wins, or dismiss low-impact items to reduce load.";
const DECISION_OS_QUEUE_OVERLOAD_FILTER_LABEL = "Filter by mood";
const DECISION_OS_QUEUE_OVERLOAD_DISMISS_LABEL = "Dismiss low-impact";

function decisionOsTopBlockerTitle(title: string): string {
  return `Open top blocker: ${title}`;
}

function decisionOsQueueClearedProgressLabel(percent: number): string {
  return `${percent}% of queue cleared`;
}

type Urgency      = "urgent" | "high" | "medium" | "low";
type Impact       = "high" | "medium" | "low";
type DurationView = "day" | "week" | "month" | "year";

type GoalBreakdownStatus =
  | "needs_breakdown"
  | "conversation"
  | "writing"
  | "inferring"
  | "awaiting_day"
  | "scheduled";

type GoalBreakdown = {
  goalId: string;
  description: string;
  targetDate?: string;
  suggestedWeeklyHours?: number;
  status: GoalBreakdownStatus;
  scheduledSummary?: string;
};

type WhyBullet      = { icon: string; text: string };
type DecisionOption = { id: string; label: string; detail?: string; aiRecommended?: boolean };
type SnoozeOption = { id: string; label: string; wakeAt: number };

type ContextItem = {
  type: "email" | "calendar" | "note" | "person";
  icon: string;
  title: string;
  snippet?: string;
  time?: string;
  sourceUrl?: string;
  sourceType?: "thread" | "email" | "note";
  sourceRefs?: string[];
  relationPath?: string[];
};

type Decision = {
  id: string;
  urgency: Urgency;
  title: string;
  context: string;
  deadline?: string;
  options: DecisionOption[];
  impact: Impact;
  effort: string;
  confidence?: number;
  confidenceReason?: string;
  whyBullets?: WhyBullet[];
  whyMatters?: string;
  contextItems?: ContextItem[];
  /** Which duration lens this decision surfaces in (rolls up to higher scopes). */
  durationScope?: DurationView;
  /** Calendar event ID ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â if set, clicking "View in Calendar" navigates there. */
  calendarEventId?: string;
  goalBreakdown?: GoalBreakdown;
};

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ Constants ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ Utilities ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ Seed data ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬

const SEED_BRIEFING: DecisionOsBriefing = {
  northStar: "Close the engineering hire and unblock Project Aurora",
  urgentCount: 2,
  highImpactCount: 5,
  completedCount: 3,
  estimatedMinutes: 47,
  totalDecisions: 8,
};

const SEED_DECISIONS: Decision[] = [
  {
    id: "d1",
    urgency: "urgent",
    title: "Hire Lead Engineer",
    context: "3 candidates left; offer deadline tomorrow at 3PM.",
    deadline: "Tomorrow 3PM",
    impact: "high",
    effort: "15 min",
    durationScope: "day",
    confidence: 0.88,
    confidenceReason: "Candidate Y scored 9/10 on system design and is $20k cheaper than X. 88 similar hires in our database show Y-profile engineers retain at 2ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the rate.",
    whyBullets: [
      { icon: "ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢Ãƒâ€šÃ‚¥", text: "Fills the critical backend gap blocking Project Aurora" },
      { icon: "ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚°", text: "Offer must land before tomorrow 3PM or candidates walk" },
      { icon: "ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢Ãƒâ€šÃ‚°", text: "Candidate Y is $20k cheaper with equal/better fit score" },
    ],
    options: [
      { id: "a", label: "Candidate X", detail: "$180k ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚· 8/10 fit" },
      { id: "b", label: "Candidate Y", detail: "$160k ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚· 9/10 fit", aiRecommended: true },
      { id: "c", label: "Reject all", detail: "Reopen search next quarter" },
    ],
    contextItems: [
      { type: "email", icon: "ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒâ€šÃ‚§", title: "Y's final interview feedback", snippet: "Strong system design, culture fit confirmed", time: "2h ago", sourceType: "email" },
      { type: "calendar", icon: "ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÂ¢Ã¢â€šÂ¬Ã‚¦", title: "Interview with Candidate Y ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â 2PM today", time: "Today", sourceType: "thread" },
    ],
  },
  {
    id: "d2",
    urgency: "high",
    title: "Approve Q3 marketing budget",
    context: "Finance needs sign-off before EOD Friday. $45k is within forecast.",
    deadline: "Friday EOD",
    impact: "medium",
    effort: "5 min",
    durationScope: "week",
    confidence: 0.94,
    confidenceReason: "The $45k is 4% under Q3 budget ceiling. Historical approval rate for within-budget requests is 97%.",
    whyBullets: [
      { icon: "📈", text: "Unlocks the July product launch campaign" },
      { icon: "ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚³", text: "Delays past Friday block the paid media calendar" },
      { icon: "ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢Ãƒâ€šÃ‚°", text: "$45k is within Q3 forecast ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â no re-allocation needed" },
    ],
    options: [
      { id: "a", label: "Approve $45k", detail: "Within forecast", aiRecommended: true },
      { id: "b", label: "Reduce to $35k", detail: "Trim social spend" },
      { id: "c", label: "Request more detail", detail: "Defer to Monday" },
    ],
    contextItems: [
      { type: "email", icon: "ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒâ€šÃ‚§", title: "Budget breakdown from Finance", snippet: "$45k split: 60% paid / 40% content", time: "Yesterday", sourceType: "email" },
    ],
  },
  {
    id: "d3",
    urgency: "medium",
    title: "Choose cloud region for EU expansion",
    context: "DevOps needs a decision to start infrastructure provisioning.",
    impact: "high",
    effort: "30 min",
    durationScope: "week",
    confidence: 0.72,
    confidenceReason: "72% confidence ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â two engineers disagreed in the cost analysis. Recommend reviewing the attached comparison.",
    whyBullets: [
      { icon: "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â", text: "GDPR compliance requires EU data residency before launch" },
      { icon: "ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚³", text: "Provisioning takes 3 weeks ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â every day of delay risks the launch date" },
      { icon: "ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢Ãƒâ€šÃ‚°", text: "Frankfurt is 12% cheaper but has lower team familiarity" },
    ],
    options: [
      { id: "a", label: "AWS eu-west-1 (Ireland)", detail: "Existing team familiarity", aiRecommended: true },
      { id: "b", label: "AWS eu-central-1 (Frankfurt)", detail: "Lower latency for DACH, 12% cheaper" },
      { id: "c", label: "GCP europe-west3", detail: "Evaluate multi-cloud cost first" },
      { id: "d", label: "Hold ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â request final cost report", detail: "2-day delay" },
    ],
    contextItems: [
      { type: "note", icon: "ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒâ€šÃ‚Â", title: "EU infra cost comparison", snippet: "Frankfurt 12% cheaper than Ireland", time: "3 days ago", sourceType: "note" },
    ],
  },
  {
    id: "d4",
    urgency: "high",
    title: "IELTS prep ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â break down study plan",
    context: "Goal detected: Pass IELTS with 8.0+ by May 2027. Needs a structured weekly plan tailored to your schedule.",
    impact: "high",
    effort: "10 min",
    durationScope: "year",
    goalBreakdown: {
      goalId: "goal-ielts-2027",
      description: "Pass IELTS with 8.0 or above ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â target date May 2027",
      targetDate: "2027-05-01",
      suggestedWeeklyHours: 2,
      status: "needs_breakdown",
    },
    options: [
      { id: "a", label: "Plan with AI", detail: "Start a guided conversation", aiRecommended: true },
      { id: "b", label: "Write my own", detail: "Enter your own study schedule" },
      { id: "c", label: "Let AI infer", detail: "Based on profile & calendar" },
    ],
    whyBullets: [
      { icon: "ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€¦Ã‚Â½Ãƒâ€šÃ‚¯", text: "12-month goal ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â starting the breakdown now gives maximum runway" },
      { icon: "ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÂ¢Ã¢â€šÂ¬Ã‚¦", text: "2 hours/week over 52 weeks = 104 hours of targeted practice" },
      { icon: "ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€šÃ‚Â§Ãƒâ€šÃ‚ ", text: "Spaced repetition works ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â consistency beats cramming every time" },
    ],
  },
  {
    id: "d5",
    urgency: "medium",
    title: "Review Q3 OKRs",
    context: "Monthly goal check-in is overdue. 3 of 5 OKRs are behind schedule.",
    impact: "high",
    effort: "45 min",
    durationScope: "month",
    options: [
      { id: "a", label: "Review now", detail: "Open OKR dashboard", aiRecommended: true },
      { id: "b", label: "Schedule for Friday", detail: "Block 45 min" },
      { id: "c", label: "Delegate to team lead", detail: "With summary report" },
    ],
    whyBullets: [
      { icon: "ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒâ€¦Ã‚ ", text: "3 of 5 OKRs are behind ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â early intervention can still rescue them" },
      { icon: "ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚³", text: "Q3 ends in 6 weeks ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â now is the last safe window for course correction" },
    ],
  },
];

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ Toast ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬

function Toast(props: {
  message: string;
  onUndo: (() => void) | null;
  onDismiss: () => void;
  actionLabel?: string | null;
}) {
  return (
    <div class="fixed bottom-6 left-1/2 z-[300] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/60 bg-on-surface/90 px-4 py-3 shadow-2xl backdrop-blur-md">
      <span class="text-sm text-white/90">{props.message}</span>
      <Show when={props.onUndo}>
        <button
          type="button"
          class="rounded-full border border-white/30 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-white/20"
          onClick={() => { props.onUndo?.(); props.onDismiss(); }}
        >
          {props.actionLabel ?? "Undo"}
        </button>
      </Show>
    </div>
  );
}

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ DurationTabs ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬

function DurationTabs(props: { active: DurationView; onChange: (v: DurationView) => void; counts: Record<DurationView, number> }) {
  return (
    <div class="flex items-center gap-1 rounded-2xl border border-white/50 bg-white/50 p-1 shadow-sm backdrop-blur-sm">
          <For each={decisionOsDurationViews()}>
        {(v) => (
          <button
            type="button"
            title={v.hint}
            class={`flex-1 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition ${props.active === v.id ? "bg-white shadow-sm text-on-surface" : "text-on-surface-variant/60 hover:text-on-surface hover:bg-white/50"}`}
            onClick={() => props.onChange(v.id)}
          >
            {v.label}
            <Show when={props.counts[v.id] > 0}>
              <span class={`ml-1.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold ${props.active === v.id ? "bg-primary/10 text-primary" : "bg-black/[0.06] text-on-surface-variant/60"}`}>
                {props.counts[v.id]}
              </span>
            </Show>
          </button>
        )}
      </For>
    </div>
  );
}

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ ShortcutsHelp ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬

function ShortcutsHelp(props: { onClose: () => void }) {
  return (
    <div
      class="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        class="w-80 rounded-2xl border border-white/60 bg-white/95 p-5 shadow-2xl backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="mb-3 flex items-center justify-between">
          <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-on-surface-variant/50">{decisionOsShortcutsTitle()}</p>
          <button
            type="button"
            class="flex h-5 w-5 items-center justify-center rounded-full bg-black/5 text-[10px] text-on-surface-variant hover:bg-black/10"
            onClick={props.onClose}
            aria-label={decisionOsShortcutsCloseAriaLabel()}
          >ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚¢</button>
        </div>
        <div class="space-y-1.5">
          <For each={decisionOsShortcuts()}>
            {(s) => (
              <div class="flex items-center justify-between gap-3">
                <kbd class="rounded-md border border-black/10 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-on-surface">{s.key}</kbd>
                <span class="text-right text-[11px] text-on-surface-variant">{s.desc}</span>
              </div>
            )}
          </For>
        </div>
        <p class="mt-3 text-center text-[9px] text-on-surface-variant/40">{decisionOsShortcutsTypingHint()}</p>
      </div>
    </div>
  );
}

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ GoalBreakdownModal ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬

type GoalModalStep = "overview" | "conversation" | "writing" | "inferring" | "pick-day" | "confirmed";
type ChatMsg = { role: "user" | "ai"; text: string };

function GoalBreakdownModal(props: {
  decision: Decision;
  onClose: () => void;
  onScheduled: (summary: string, days: string[]) => void;
}) {
  const goal = () => props.decision.goalBreakdown!;
  const [step, setStep] = createSignal<GoalModalStep>("overview");
  const [userInput, setUserInput] = createSignal("");
  const [chat, setChat] = createSignal<ChatMsg[]>([
    { role: "ai", text: `Let's break down your goal: "${goal().description}". How many days a week can you realistically commit to this?` },
  ]);
  const [selectedDays, setSelectedDays] = createSignal<Set<string>>(new Set());
  const [inferredPlan, setInferredPlan] = createSignal<string | null>(null);
  const [scheduledDays, setScheduledDays] = createSignal<string[]>([]);
  const [chatPending, setChatPending] = createSignal(false);
  const [inferPending, setInferPending] = createSignal(false);

  function sendChatMessage(inputOverride?: string) {
    if (chatPending()) return;
    const input = (inputOverride ?? userInput()).trim();
    const plan = decisionOsGoalBreakdownConversationState({
      goal: goal(),
      input,
      chat: chat(),
    });
    if (!plan.accepted || !plan.event || !plan.completionMessage || !plan.nextStep || plan.completionDelayMs == null) return;
    setChat(plan.immediateChat);
    setUserInput(plan.clearedInput);
    setChatPending(true);
    // Stub AI reply ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â in production this dispatches to the agent runtime.
    setTimeout(() => {
      setChat(prev => [...prev, plan.completionMessage]);
      setStep(plan.nextStep);
      setChatPending(false);
    }, plan.completionDelayMs);
    dispatchGoalBreakdownEvent(plan.event);
  }

  function startInfer() {
    if (inferPending()) return;
    const plan = decisionOsGoalBreakdownInferenceState({
      goal: goal(),
    });
    setInferPending(true);
    setInferredPlan(null);
    setStep(plan.nextStep);
    // Stub: in production calls LLM with user profile + calendar context.
    setTimeout(() => {
      setInferredPlan(plan.completionInferredPlan);
      dispatchGoalBreakdownEvent(plan.event);
      setInferPending(false);
    }, plan.completionDelayMs);
  }

  function confirmSchedule() {
    const plan = decisionOsGoalBreakdownConfirmPlan({
      goal: goal(),
      step: step(),
      selectedDays: [...selectedDays()],
      scheduledDays: scheduledDays(),
    });
    dispatchGoalBreakdownEvent(plan.event);
    setScheduledDays(plan.schedule.days);
    setStep(plan.nextStep);
    props.onScheduled(plan.schedule.summary, plan.schedule.days);
  }

  return (
    <div
      class="fixed inset-0 z-[150] flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center"
      onClick={props.onClose}
    >
      <div
        class="w-full max-w-md rounded-t-2xl border border-white/60 bg-white/97 shadow-2xl backdrop-blur-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ "max-height": "85vh", display: "flex", "flex-direction": "column" }}
      >
        {/* Header */}
        <div class="flex items-start justify-between gap-2 border-b border-black/[0.06] p-4 pb-3">
          <div>
            <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-on-surface-variant/50">{decisionOsGoalBreakdownTitle()}</p>
            <h3 class="mt-0.5 text-sm font-semibold text-on-surface leading-snug">{props.decision.title}</h3>
          </div>
          <button
            type="button"
            class="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-black/5 text-[10px] text-on-surface-variant hover:bg-black/10"
            onClick={props.onClose}
          >ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚¢</button>
        </div>

        {/* Step: overview */}
        <Show when={step() === "overview"}>
          <div class="flex flex-col gap-3 overflow-y-auto p-4">
            <div class="rounded-xl border border-primary/20 bg-primary/[0.05] p-3.5">
              <p class="text-[11px] font-semibold text-on-surface">{goal().description}</p>
              <Show when={goal().targetDate}>
                <p class="mt-1 text-[10px] text-on-surface-variant/60">
                  Target: {new Date(goal().targetDate!).toLocaleDateString("en-AU", { year: "numeric", month: "long" })}
                </p>
              </Show>
              <Show when={goal().suggestedWeeklyHours}>
                <p class="mt-0.5 text-[10px] text-on-surface-variant/60">
                  Suggested: {goal().suggestedWeeklyHours}h/week
                </p>
              </Show>
            </div>
            <p class="text-[11px] text-on-surface-variant leading-relaxed">
              {decisionOsGoalBreakdownOverviewPrompt()}
            </p>
            <button
              type="button"
              class="rounded-xl border border-primary/30 bg-primary/[0.07] px-4 py-3 text-left text-[12px] font-medium text-primary transition hover:bg-primary/10"
              onClick={() => setStep("conversation")}
              disabled={inferPending()}
            >
              ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢Ãƒâ€šÃ‚¬ Plan with AI ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â start a guided conversation
            </button>
            <button
              type="button"
              class="rounded-xl border border-black/10 bg-white/60 px-4 py-3 text-left text-[12px] font-medium text-on-surface-variant transition hover:bg-white/90"
              onClick={() => setStep("writing")}
              disabled={inferPending()}
            >
              ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Write my own ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â enter my own study schedule
            </button>
            <button
              type="button"
              class="rounded-xl border border-black/10 bg-white/60 px-4 py-3 text-left text-[12px] font-medium text-on-surface-variant transition hover:bg-white/90"
              onClick={startInfer}
              disabled={inferPending()}
            >
              ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€šÃ‚Â§Ãƒâ€šÃ‚  Let AI infer ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â based on my profile and calendar
            </button>
            <button
              type="button"
              class="mt-1 text-center text-[10px] text-on-surface-variant/40 underline underline-offset-2 hover:text-on-surface-variant/70 transition"
              onClick={props.onClose}
            >
              {decisionOsGoalBreakdownSkipLabel()}
            </button>
          </div>
        </Show>

        {/* Step: conversation */}
        <Show when={step() === "conversation"}>
          <div class="flex flex-1 flex-col overflow-hidden">
            <div class="flex-1 overflow-y-auto space-y-2 p-4">
              <For each={chat()}>
                {(msg) => (
                  <div class={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div class={`max-w-[80%] rounded-xl px-3 py-2 text-[11px] leading-relaxed ${msg.role === "user" ? "bg-primary text-white" : "bg-black/[0.05] text-on-surface"}`}>
                      {msg.text}
                    </div>
                  </div>
                )}
              </For>
            </div>
            <div class="border-t border-black/[0.06] p-3">
              <TiptapEditor
                mode="compact"
                placeholder={decisionOsGoalBreakdownConversationPlaceholder()}
                initialContent={userInput()}
                disabled={chatPending()}
                submitLabel={chatPending() ? "Waiting..." : decisionOsGoalBreakdownSendLabel()}
                clearOnSend={false}
                onChange={(text) => setUserInput(text)}
                onSend={async (payload) => {
                  sendChatMessage(payload.text);
                }}
              />
            </div>
          </div>
        </Show>

        {/* Step: writing */}
        <Show when={step() === "writing"}>
          <div class="flex flex-col gap-3 overflow-y-auto p-4">
            <p class="text-[11px] text-on-surface-variant">{decisionOsGoalBreakdownWritingPrompt()}</p>
            <TiptapEditor
              mode="compact"
              placeholder={decisionOsGoalBreakdownWritingPlaceholder()}
              initialContent={userInput()}
              submitLabel={decisionOsGoalBreakdownSavePlanLabel()}
              clearOnSend={false}
              onChange={(_text, markdown) => setUserInput(markdown)}
              onCancel={() => setStep("overview")}
              onSend={async (payload) => {
                setUserInput(payload.markdown || payload.text);
                setStep("pick-day");
              }}
            />
          </div>
        </Show>

        {/* Step: inferring */}
        <Show when={step() === "inferring"}>
          <div class="flex flex-col items-center gap-3 overflow-y-auto p-6">
            <Show when={!inferredPlan()} fallback={
              <div class="w-full flex flex-col gap-3">
                <div class="rounded-xl border border-primary/20 bg-primary/[0.05] p-3.5">
                  <p class="font-mono text-[8px] uppercase tracking-[0.15em] text-primary/60 mb-1.5">{decisionOsGoalBreakdownAiInferredTitle()}</p>
                  <p class="text-[11px] text-on-surface leading-relaxed">{inferredPlan()}</p>
                </div>
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="flex-1 rounded-xl border border-black/10 bg-white/60 py-2.5 text-[11px] font-medium text-on-surface-variant transition hover:bg-white/90"
                    onClick={() => setStep("pick-day")}
                  >
                    {decisionOsGoalBreakdownModifyDaysLabel()}
                  </button>
                  <button
                    type="button"
                    class="flex-1 rounded-xl bg-primary py-2.5 text-[11px] font-semibold text-white transition hover:opacity-90"
                    onClick={confirmSchedule}
                  >
                    {decisionOsGoalBreakdownAcceptPlanLabel()}
                  </button>
                </div>
              </div>
            }>
              <div class="flex flex-col items-center gap-2 py-4">
                <span class="text-3xl animate-spin">ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â</span>
                <p class="text-[11px] text-on-surface-variant">{decisionOsGoalBreakdownAnalyzingLabel()}</p>
              </div>
            </Show>
          </div>
        </Show>

        {/* Step: pick-day */}
        <Show when={step() === "pick-day"}>
          <div class="flex flex-col gap-3 overflow-y-auto p-4">
            <p class="text-[11px] font-semibold text-on-surface">{decisionOsGoalBreakdownPickDayTitle()}</p>
            <p class="text-[10px] text-on-surface-variant/60">{decisionOsGoalBreakdownPickDayHint()}</p>
            <div class="grid grid-cols-4 gap-1.5">
              <For each={decisionOsDaysOfWeek()}>
                {(day) => (
                  <button
                    type="button"
                    class={`rounded-xl border py-2 text-[10px] font-medium transition ${selectedDays().has(day) ? "border-primary/40 bg-primary/[0.07] text-primary" : "border-black/10 bg-white/60 text-on-surface-variant hover:bg-white/90"}`}
                    onClick={() =>
                      setSelectedDays((prev) =>
                        toggleDecisionOsGoalDaySelection(prev, day),
                      )
                    }
                  >
                    {day.slice(0, 3)}
                  </button>
                )}
              </For>
              <button
                type="button"
                class="col-span-4 rounded-xl border border-dashed border-black/10 py-2 text-[10px] text-on-surface-variant/60 transition hover:border-primary/30 hover:text-primary"
                onClick={() => {
                  setSelectedDays(new Set(decisionOsGoalBreakdownSuggestedDays()));
                }}
              >
                ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€šÃ‚Â§Ãƒâ€šÃ‚  Let AI pick from my calendar
              </button>
            </div>
            <button
              type="button"
              class="rounded-xl bg-primary py-2.5 text-[11px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
              disabled={selectedDays().size === 0}
              onClick={confirmSchedule}
            >
              {decisionOsGoalBreakdownConfirmScheduleLabel()}
            </button>
          </div>
        </Show>

        {/* Step: confirmed */}
        <Show when={step() === "confirmed"}>
          <div class="flex flex-col items-center gap-3 p-6 text-center">
            <span class="text-4xl">ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÂ¢Ã¢â€šÂ¬Ã‚¦</span>
            <p class="text-sm font-semibold text-on-surface">{decisionOsGoalBreakdownConfirmedTitle()}</p>
            <div class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[11px] text-emerald-800 leading-relaxed">
              {goal().suggestedWeeklyHours ?? 2}h/week on{" "}
              {scheduledDays().length > 0
                ? scheduledDays().join(" & ")
                : decisionOsGoalBreakdownSelectedDaysFallbackLabel()}{" "}
              ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â recurring until{" "}
              {goal().targetDate
                ? new Date(goal().targetDate!).toLocaleDateString("en-AU", { year: "numeric", month: "long" })
                : "your target date"}
            </div>
            <button
              type="button"
              class="rounded-full bg-primary px-5 py-2 text-[11px] font-semibold text-white transition hover:opacity-90"
              onClick={() => navigateToView("calendar", { date: goal().targetDate })}
            >
              {decisionOsGoalBreakdownViewCalendarLabel()}
            </button>
            <button
              type="button"
              class="text-[10px] text-on-surface-variant/40 hover:text-on-surface-variant/70 transition"
              onClick={props.onClose}
            >
              {decisionOsGoalBreakdownDoneLabel()}
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ DailyBriefingBar ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬

function DailyBriefingBar(props: {
  data: DecisionOsBriefing;
  suggestedMood?: DecisionOsSuggestedMood;
  watcherPressureSummary?: string | null;
  topThreadFreshnessSummary?: string | null;
  topBlocker?: Decision | null;
  queueCompanionState: DecisionOsQueueCompanionState;
  containerRef: (el: HTMLDivElement) => void;
  queueHasVisibleWork?: boolean;
  completedPct?: number;
  onOpenQueuePriority?: () => void;
  onOpenTopBlocker?: () => void;
  liveMinutes?: number;
  queueLoadTrend?: "up" | "down" | "steady";
}) {
  const pct = () => decisionOsCompletedPct(props.data.completedCount, props.data.totalDecisions);
  const preparedWorkCue = createMemo(() =>
    decisionOsPreparedWorkCue({
      suggestedMood: props.suggestedMood,
      queueCompanionState: props.queueCompanionState,
    }),
  );
  const effectiveMinutes = () => decisionOsEffectiveQueueMinutes(props.liveMinutes, props.data.estimatedMinutes);
  const queueEffortLabel = createMemo(() =>
    decisionOsQueueEffortLabel({
      preparedWorkCue: preparedWorkCue(),
      effectiveMinutes: effectiveMinutes(),
    }),
  );
  const queueTrend = createMemo(() => decisionOsQueueTrendGlyph(props.queueLoadTrend));

  return (
    <div ref={props.containerRef} class="relative overflow-hidden rounded-2xl border border-white/50 bg-white/60 p-4 shadow-card backdrop-blur-sm">
      <p class="mb-2 text-[11px] italic text-on-surface-variant/60">{getGreeting(props.data)}</p>
      <Show when={preparedWorkCue()}>
        {(cue) => (
          <div class="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200/70 bg-emerald-50/75 px-3 py-2">
            <span class="rounded-full border border-emerald-200/80 bg-white/75 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-800">
              {cue().label}
            </span>
            <Show when={cue().detail}>
              <span class="min-w-0 flex-1 truncate text-[11px] text-emerald-900/80">
                {cue().detail}
              </span>
            </Show>
          </div>
        )}
      </Show>
      <Show when={props.watcherPressureSummary}>
        <div class="mb-3 flex items-start gap-2 rounded-2xl border border-sky-200/70 bg-sky-50/75 px-3 py-2">
          <span class="rounded-full border border-sky-200/80 bg-white/75 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-800">
            {DECISION_OS_WATCHER_PRESSURE_LABEL}
          </span>
          <p class="min-w-0 flex-1 text-[11px] leading-5 text-sky-950/80">
            {props.watcherPressureSummary}
          </p>
        </div>
      </Show>
      <Show when={props.topThreadFreshnessSummary}>
        <div class="mb-3 flex items-start gap-2 rounded-2xl border border-amber-200/70 bg-amber-50/75 px-3 py-2">
          <span class="rounded-full border border-amber-200/80 bg-white/75 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-800">
            {DECISION_OS_TOP_THREAD_LABEL}
          </span>
          <p class="min-w-0 flex-1 text-[11px] leading-5 text-amber-950/80">
            {props.topThreadFreshnessSummary}
          </p>
        </div>
      </Show>
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0 flex-1">
          <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-on-surface-variant/50">{DECISION_OS_NORTH_STAR_TITLE}</p>
          <p class="mt-0.5 text-sm font-semibold text-on-surface leading-snug">{props.data.northStar}</p>
          <Show
            when={
              props.onOpenQueuePriority
              && decisionOsShouldShowQueuePriorityAction({
                hasVisibleQueueWork: props.queueHasVisibleWork ?? false,
                completedPct: props.completedPct,
              })
            }
          >
            <button
              type="button"
              class="mt-2 inline-flex items-center gap-1 rounded-full border border-indigo-200/70 bg-indigo-50/70 px-3 py-1 text-[11px] font-medium text-indigo-700 transition hover:bg-indigo-100/80"
              onClick={props.onOpenQueuePriority}
            >
              {DECISION_OS_OPEN_QUEUE_PRIORITY_LABEL}
            </button>
          </Show>
        </div>
        <div class="flex flex-shrink-0 items-center gap-3">
          <div class="flex flex-col items-center">
            <span class="text-lg font-bold text-red-600">{props.data.urgentCount}</span>
            <span class="font-mono text-[8px] text-on-surface-variant/60">{DECISION_OS_URGENT_LABEL}</span>
          </div>
          <Show when={props.topBlocker && props.onOpenTopBlocker}>
            <button
              type="button"
              class="rounded-full border border-rose-200/80 bg-rose-50/85 px-3 py-1 text-[10px] font-semibold text-rose-700 transition hover:bg-rose-100"
              onClick={props.onOpenTopBlocker}
              title={decisionOsTopBlockerTitle(props.topBlocker!.title)}
            >
              {DECISION_OS_TOP_BLOCKER_LABEL}
            </button>
          </Show>
          <div class="h-8 w-px bg-black/10" />
          <div class="flex flex-col items-center">
            <span class="text-lg font-bold text-amber-600">{props.data.highImpactCount}</span>
            <span class="font-mono text-[8px] text-on-surface-variant/60">{DECISION_OS_HIGH_IMPACT_LABEL}</span>
          </div>
          <div class="h-8 w-px bg-black/10" />
          <div class="flex flex-col items-center">
            <span class="text-lg font-bold text-emerald-600">{props.data.completedCount}</span>
            <span class="font-mono text-[8px] text-on-surface-variant/60">{DECISION_OS_DONE_LABEL}</span>
          </div>
        </div>
      </div>
      <div class="mt-3 flex items-center gap-3">
        <span class="flex-shrink-0 text-[11px] text-on-surface-variant/70">
          ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚± {queueEffortLabel()} <span class="ml-1 font-semibold">{queueTrend()}</span>
        </span>
        <div class="flex-1 h-1.5 rounded-full bg-black/10 overflow-hidden">
          <div
            class="h-full rounded-full bg-emerald-500 transition-all duration-700"
            style={{ width: `${pct()}%` }}
          />
        </div>
        {/* SVG progress ring ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â turns green and glows when queue is cleared */}
        <div
          class="relative flex-shrink-0"
          title={decisionOsQueueClearedProgressLabel(pct())}
          aria-label={decisionOsQueueClearedProgressLabel(pct())}
        >
          <svg width="28" height="28" viewBox="0 0 28 28" class="-rotate-90">
            <circle cx="14" cy="14" r="11" stroke="rgba(0,0,0,0.07)" stroke-width="2.5" fill="none"/>
            <circle
              cx="14" cy="14" r="11"
              stroke={pct() >= 100 ? "rgb(34,197,94)" : "rgba(99,102,241,0.75)"}
              stroke-width="2.5"
              fill="none"
              stroke-linecap="round"
              stroke-dasharray={`${(69.1 * Math.min(pct(), 100)) / 100} 69.1`}
              class="transition-all duration-700"
              style={pct() >= 100 ? { filter: "drop-shadow(0 0 3px rgba(34,197,94,0.7))" } : {}}
            />
          </svg>
          <span class="absolute inset-0 flex items-center justify-center font-mono text-[7px] text-on-surface-variant/60">
            {pct()}
          </span>
        </div>
        <span class="flex-shrink-0 font-mono text-[10px] text-on-surface-variant/50">{pct()}%</span>
      </div>
    </div>
  );
}

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ CognitiveBentoRow ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬
// Mini bento snapshot: 4 key metrics in a single scannable row.
// Mirrors the bento_grid a2ui component layout at smaller scale.

type CognitiveBentoRowProps = {
  completedToday: number;
  timeSavedMinutes: number;
  visibleCount: number;
  totalMinutes: number;
  positiveOutcomeRate: number | null;
};

function CognitiveBentoRow(props: CognitiveBentoRowProps) {
  const metricCell = (label: string, value: string, sub: string, color: string) => (
    <div class="flex flex-col justify-center gap-0.5 rounded-xl border border-white/60 bg-white/50 px-3 py-2.5 min-w-0">
      <span class="font-mono text-[9px] uppercase tracking-[0.15em] text-on-surface-variant/50 truncate">{label}</span>
      <span class={`text-lg font-bold leading-tight ${color}`}>{value}</span>
      <span class="text-[9px] text-on-surface-variant/50 truncate">{sub}</span>
    </div>
  );

  return (
    <div class="grid grid-cols-4 gap-2">
      {metricCell(decisionOsBentoDoneTodayLabel(), String(props.completedToday), decisionOsBentoDecisionsSuffix(), "text-emerald-600")}
      {metricCell(decisionOsBentoTimeSavedLabel(), `${props.timeSavedMinutes}m`, decisionOsBentoReclaimedSuffix(), "text-primary")}
      {metricCell(decisionOsBentoQueueLoadLabel(), decisionOsQueueLoadLabel(props.totalMinutes), `~${props.totalMinutes} min`, decisionOsQueueLoadTone(props.totalMinutes))}
      {props.positiveOutcomeRate !== null
        ? metricCell(decisionOsBentoOutcomeRateLabel(), `${Math.round(props.positiveOutcomeRate * 100)}%`, decisionOsBentoPositiveOutcomeSuffix(), props.positiveOutcomeRate >= 0.65 ? "text-emerald-600" : "text-amber-600")
        : metricCell(decisionOsBentoPendingLabel(), String(props.visibleCount), decisionOsBentoToReviewSuffix(), "text-on-surface-variant")}
    </div>
  );
}

function CostStatusBar(props: {
  status: DecisionOsCostStatus | null;
  snapshot: DecisionOsCostSnapshot | null;
}) {
  if (!props.status) return null;
  const tone = () => decisionOsCostStatusTone(props.status) ?? "";
  const metricChips = () => decisionOsCostMetricChips(props.snapshot);

  return (
    <div class={`rounded-2xl border px-4 py-3 shadow-card backdrop-blur-sm ${tone()}`}>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="font-mono text-[9px] uppercase tracking-[0.16em] opacity-70">{DECISION_OS_COST_STATUS_TITLE}</p>
          <p class="mt-1 text-sm font-semibold">{props.status.title}</p>
          <p class="mt-1 text-xs leading-5 opacity-80">{props.status.detail}</p>
        </div>
        <span class="rounded-full border border-current/15 bg-white/60 px-3 py-1 text-[10px] font-medium">
          {DECISION_OS_OPEN_COST_DASHBOARD_LABEL}
        </span>
      </div>
      <Show when={metricChips().length > 0}>
        <div class="mt-3 flex flex-wrap gap-2">
          <For each={metricChips()}>
            {(chip) => (
              <span class="rounded-full border border-current/10 bg-white/55 px-2.5 py-1 text-[10px] font-medium opacity-90">
                {chip}
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ QueueOverloadBanner ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬
// Appears when the queue exceeds 5 items or 60 min total effort.
// Suggests the two fastest escape routes so the user isn't paralysed.


function QueueOverloadBanner(props: {
  totalMinutes: number;
  count: number;
  onFilterMood: () => void;
  onDismissLow: () => void;
}) {
  const show = () => shouldShowDecisionOsQueueOverload(props.count, props.totalMinutes);
  return (
    <Show when={show()}>
      <div class="flex items-start gap-3 rounded-2xl border border-amber-200/60 bg-amber-50/70 px-4 py-3 backdrop-blur-sm">
        <span class="text-lg leading-none flex-shrink-0 mt-0.5">ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚¡</span>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold text-amber-800">
            Heavy queue ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â {props.count} decisions ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚· ~{props.totalMinutes} min total
          </p>
          <p class="mt-0.5 text-[11px] text-amber-700/80">
            {DECISION_OS_QUEUE_OVERLOAD_DETAIL}
          </p>
          <div class="mt-2 flex gap-2">
            <button
              type="button"
              class="rounded-full border border-amber-300/60 bg-amber-100/80 px-3 py-1 text-[10px] font-medium text-amber-800 hover:bg-amber-100 transition"
              onClick={props.onFilterMood}
            >
              {DECISION_OS_QUEUE_OVERLOAD_FILTER_LABEL}
            </button>
            <button
              type="button"
              class="rounded-full border border-amber-300/60 bg-amber-100/80 px-3 py-1 text-[10px] font-medium text-amber-800 hover:bg-amber-100 transition"
              onClick={props.onDismissLow}
            >
              {DECISION_OS_QUEUE_OVERLOAD_DISMISS_LABEL}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ DecisionCard ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬

function DecisionCard(props: {
  decision: Decision;
  isSelected: boolean;
  isFocused: boolean;
  snoozeOptions: SnoozeOption[];
  preferredSnoozeId?: string | null;
  snoozeCount?: number;
  onSelect: () => void;
  pendingOutcomeCheck?: PendingOutcomeCheck | null;
  onAction: (
    action: "approve" | "snooze" | "delegate" | "dismiss",
    snoozeId?: string,
    optionId?: string,
    extras?: { note?: string },
  ) => void;
  onUpdateOutcomeCheck?: (decisionId: string, checkAt: string) => void;
  onGoalBreakdown: () => void;
  onFilterEffort?: () => void;
  onEnterFocusMode?: () => void;
}) {
  const d = props.decision;
  const sessionUserId = readSession()?.user?.id ?? null;
  const sty = () => decisionOsUrgencyStyle(d.urgency);

  // Restore last chosen option from localStorage, fall back to AI recommendation
  const aiDefault = d.options.find(o => o.aiRecommended)?.id ?? null;
  const storedChoice = loadOptionChoice(d.id, sessionUserId);
  const [chosen, setChosen] = createSignal<string | null>(
    storedChoice && d.options.some(o => o.id === storedChoice) ? storedChoice : aiDefault,
  );
  const [showAllOpts, setShowAllOpts] = createSignal(false);
  const [showConfidence, setShowConfidence] = createSignal(false);
  const [showSnooze, setShowSnooze] = createSignal(false);
  const [showOutcomeMenu, setShowOutcomeMenu] = createSignal(false);
  const [showDeadlineInfo, setShowDeadlineInfo] = createSignal(false);
  const [showUrgencyInfo, setShowUrgencyInfo] = createSignal(false);
  const [swipeDx, setSwipeDx] = createSignal(0);
  const [pendingApprove, setPendingApprove] = createSignal(false);
  const [approveNote, setApproveNote] = createSignal("");
  let cardRef: HTMLDivElement | undefined;
  const approveFlow = createDecisionOsApproveFlowController({
    getNote: approveNote,
    setNote: setApproveNote,
    setPending: setPendingApprove,
    onApprove: (note) => {
      props.onAction("approve", undefined, chosen() ?? undefined, note ? { note } : undefined);
    },
    onGoalBreakdown: props.onGoalBreakdown,
    needsGoalBreakdown: () => d.goalBreakdown?.status === "needs_breakdown",
  });

  // Scroll focused card into view when navigated via keyboard
  createEffect(() => {
    if (props.isFocused && cardRef) {
      cardRef.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
  let confidenceBadgeRef: HTMLDivElement | undefined;
  const confidencePopoverId = `decision-confidence-${d.id}`;
  const hasConfidenceReason = () => Boolean(d.confidenceReason?.trim());

  const visibleOptions = createMemo(() => decisionOsVisibleOptions(d.options, showAllOpts()));
  const hiddenCount = () => decisionOsHiddenOptionCount(d.options.length);
  const threadContextItem = createMemo(() => decisionOsDecisionCardThreadContextItem(d.contextItems));
  const sourceCount = createMemo(() => decisionOsDecisionCardSourceCount(d.contextItems));
  const sourcePreviewItems = createMemo(() => decisionOsDecisionCardSourcePreviewItems(d.contextItems));
  const whyNow = createMemo(() => decisionWhyNow(d));
  const urgencyInsight = createMemo(() =>
    decisionOsUrgencyInsightState({
      urgency: d.urgency,
      urgencyLabel: sty().label,
    }),
  );
  const provenanceLabel = createMemo(() =>
    primarySourceProvenance(d, (sourceRefs) => decisionOsContextItemTargetLabelFromRefs(sourceRefs)),
  );
  const highlightedSnoozeId = createMemo(() =>
    highlightedDecisionSnoozeOptionId(props.snoozeOptions, props.preferredSnoozeId),
  );
  const quickSnoozeAction = createMemo(() =>
    decisionSnoozeQuickAction(props.snoozeOptions, props.preferredSnoozeId),
  );

  createEffect(() => {
    if (!showConfidence() || !hasConfidenceReason()) return;

    const handleDocPointerDown = (event: MouseEvent) => {
      if (shouldKeepDecisionOsConfidencePopoverOpen({
        target: event.target,
        container: confidenceBadgeRef,
      })) return;
      setShowConfidence(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (shouldCloseDecisionOsConfidencePopoverForKey(event.key)) setShowConfidence(false);
    };

    document.addEventListener("mousedown", handleDocPointerDown);
    document.addEventListener("keydown", handleEscape);
    onCleanup(() => {
      document.removeEventListener("mousedown", handleDocPointerDown);
      document.removeEventListener("keydown", handleEscape);
    });
  });

  onMount(() => {
    const el = cardRef;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    let startAt = 0;

    function onTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startAt = performance.now();
      setSwipeDx(0);
    }
    function onTouchMove(e: TouchEvent) {
      const move = decisionOsSwipeMovePlan({
        startX,
        startY,
        currentX: e.touches[0].clientX,
        currentY: e.touches[0].clientY,
      });
      if (!move.shouldPreventDefault || move.swipeDx === null) return;
      e.preventDefault();
      setSwipeDx(move.swipeDx);
    }
    function onTouchEnd() {
      const plan = decisionOsSwipeActionPlan({
        dx: swipeDx(),
        elapsedMs: Math.max(1, performance.now() - startAt),
        rootFontSizePx: parseFloat(getComputedStyle(document.documentElement).fontSize),
        optionId: chosen(),
      });
      if (plan.action === "approve") {
        props.onAction("approve", undefined, plan.optionId);
      } else if (plan.action === "dismiss") {
        props.onAction("dismiss");
      }
      setSwipeDx(0);
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    onCleanup(() => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    });
  });

  onCleanup(() => {
    approveFlow.dispose();
  });

  const swipeOpacity = () => decisionOsSwipeOpacity(swipeDx());
  const swipeColor = () => decisionOsSwipeColor(swipeDx());

  return (
    <div
      ref={cardRef}
      class={`relative rounded-2xl border bg-white/70 shadow-card backdrop-blur-sm transition-all duration-200 ${sty().border} ${props.isSelected ? "ring-2 ring-primary/30" : ""} ${props.isFocused ? "ring-2 ring-primary/50" : ""} overflow-hidden`}
      style={swipeDx() !== 0 ? { transform: `translateX(${swipeDx() * 0.12}px)`, "background-color": swipeColor() } : {}}
      data-magic-action="approve"
      data-magic-icon={d.goalBreakdown?.status === "needs_breakdown" ? "ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€¦Ã‚Â½Ãƒâ€šÃ‚¯" : "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚¦"}
      data-magic-label={decisionOsApproveMagicLabel(d.goalBreakdown?.status === "needs_breakdown")}
      data-magic-alt-action="dismiss"
      data-magic-alt-icon="ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚¢"
      data-magic-alt-label={decisionOsDismissMagicLabel()}
      data-magic-id={d.id}
    >
      {/* Swipe gesture micro-labels ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â confirm gesture intent before release */}
      <Show when={swipeDx() > 20}>
        <div class="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 flex items-center gap-1 rounded-full border border-emerald-300/50 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 backdrop-blur-sm">
          ✓ Approve
        </div>
      </Show>
      <Show when={swipeDx() < -20}>
        <div class="pointer-events-none absolute right-3 top-1/2 z-10 -translate-y-1/2 flex items-center gap-1 rounded-full border border-rose-300/50 bg-rose-500/15 px-2.5 py-1 text-[10px] font-semibold text-rose-700 backdrop-blur-sm">
          {"Dismiss ->"}
        </div>
      </Show>
      {/* Confidence traffic-light strip ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â left edge */}
      <Show when={d.confidence !== undefined}>
        <div
          class={`absolute left-0 top-0 h-full w-1 rounded-l-2xl flex-shrink-0 ${decisionOsConfidenceStripClass(d.confidence!)}`}
          title={decisionOsConfidenceTitle(d.confidence!)}
          style={{ position: "absolute" }}
        />
      </Show>
      {/* Header */}
      <div class="flex cursor-pointer items-start justify-between gap-3 p-4 pb-2" onClick={props.onSelect}>
        <div class="flex items-center gap-2 min-w-0">
          {/* Urgency badge ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â clickable to reveal why this level was set + magic pointer for search */}
          <div class="relative flex-shrink-0">
            <button
              type="button"
              class={`rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide transition hover:ring-2 hover:ring-current/30 ${sty().badge}`}
              onClick={(e) => { e.stopPropagation(); setShowUrgencyInfo(v => !v); }}
              aria-expanded={showUrgencyInfo()}
              title={decisionOsUrgencyInsightButtonTitle()}
              data-magic-action="search"
              data-magic-icon="search"
              data-magic-label={urgencyInsight().searchLabel}
              data-magic-id={`urgency-${d.id}`}
            >
              {sty().label}
            </button>
            <Show when={showUrgencyInfo()}>
              <div
                class="absolute left-0 top-full z-[60] mt-1 w-64 rounded-2xl border border-black/[0.07] bg-white/97 p-3 shadow-xl backdrop-blur-md"
                onClick={(e) => e.stopPropagation()}
              >
                <p class={`mb-1.5 font-mono text-[8px] uppercase tracking-[0.18em] ${sty().badge.split(" ")[1] ?? "text-on-surface-variant/50"}`}>{urgencyInsight().heading}</p>
                <p class="text-[11px] text-on-surface leading-relaxed">{urgencyInsight().detail}</p>
                <div class="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    class="text-[10px] text-primary/70 hover:text-primary transition"
                    onClick={() => { dispatchDecisionOsSearchAction(urgencyInsight().searchTerm); setShowUrgencyInfo(false); }}
                  >
                    {urgencyInsight().searchLabel}
                  </button>
                  <button type="button" class="text-[10px] text-on-surface-variant/40 hover:text-on-surface-variant transition" onClick={() => setShowUrgencyInfo(false)}>{decisionOsDecisionCardCloseLabel()}</button>
                </div>
              </div>
            </Show>
          </div>
          <Show when={d.urgency === "urgent"}>
            <span class="text-base leading-none" aria-hidden>!</span>
          </Show>
          <Show when={d.goalBreakdown}>
            <Show
              when={d.goalBreakdown?.status === "scheduled" && d.goalBreakdown?.scheduledSummary}
              fallback={<span class="text-base leading-none" aria-hidden>G</span>}
            >
              <span
                class="flex-shrink-0 rounded-full border border-emerald-200/60 bg-emerald-50/70 px-2 py-0.5 text-[9px] font-medium text-emerald-700"
                title={d.goalBreakdown!.scheduledSummary}
              >
                CAL {d.goalBreakdown!.scheduledSummary}
              </span>
            </Show>
          </Show>
          <Show when={props.pendingOutcomeCheck}>
            <div class="relative flex-shrink-0">
              <button
                type="button"
                class="rounded-full border border-sky-200/70 bg-sky-50/80 px-2 py-0.5 text-[9px] font-medium text-sky-700 transition hover:bg-sky-100"
                onClick={(e) => { e.stopPropagation(); setShowOutcomeMenu((value) => !value); }}
                title={decisionOsOutcomeCheckScheduledTitle(props.pendingOutcomeCheck!.checkAt)}
              >
                {decisionOsOutcomeCheckBadgeLabel(props.pendingOutcomeCheck!.checkAt)}
              </button>
              <Show when={showOutcomeMenu() && props.onUpdateOutcomeCheck}>
                <div
                  class="absolute left-0 top-full z-[70] mt-1 w-44 rounded-2xl border border-white/70 bg-white/95 p-1.5 shadow-xl backdrop-blur-md"
                  onClick={(event) => event.stopPropagation()}
                >
                  <For each={decisionOsOutcomeCheckMenuOptions()}>
                    {(option) => (
                      <button
                        type="button"
                        class="w-full rounded-xl px-3 py-2 text-left text-[11px] text-on-surface-variant transition hover:bg-primary/5 hover:text-primary"
                        onClick={() => {
                          const checkAt = decisionOsOutcomeCheckRescheduleAt(option.days);
                          props.onUpdateOutcomeCheck?.(d.id, checkAt);
                          setShowOutcomeMenu(false);
                        }}
                      >
                        {option.label}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </Show>
          <h3 class="truncate text-sm font-semibold text-on-surface">{d.title}</h3>
          {/* Snooze count ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â visible when snoozed more than once, signals avoidance pattern */}
          <Show when={(props.snoozeCount ?? 0) > 0}>
            <span
              class="flex-shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[8px] text-slate-500"
              title={decisionSnoozeCountTitle(props.snoozeCount ?? 0)}
            >
              ZZ {props.snoozeCount}
            </span>
          </Show>
        </div>

        {/* Duration scope badge ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â clickable to explain why this scope, magic pointer to view all in that scope */}
        <Show when={d.durationScope && d.durationScope !== "day"}>
          <button
            type="button"
            class="flex-shrink-0 rounded-full border border-black/10 px-1.5 py-0.5 font-mono text-[8px] text-on-surface-variant/50 capitalize transition hover:border-primary/30 hover:bg-primary/[0.04] hover:text-primary"
            onClick={(e) => { e.stopPropagation(); dispatchDecisionOsSearchAction(`scope:${d.durationScope}`); }}
            title={decisionOsDurationScopeExplanation(d.durationScope!)}
            data-magic-action="search"
            data-magic-icon="scope"
            data-magic-label={decisionOsDurationScopeSearchLabel(d.durationScope)}
            data-magic-id={`scope-${d.id}`}
          >
            {d.durationScope}
          </button>
        </Show>

        {/* Confidence ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â clickable */}
        <Show when={d.confidence !== undefined}>
          <div class="relative flex-shrink-0" ref={confidenceBadgeRef}>
            <Show
              when={hasConfidenceReason()}
              fallback={
                <span
                  title={decisionOsConfidenceFallbackTitle()}
                  class={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium ${decisionOsConfidenceBadgeClass(d.confidence!)}`}
                >
                  {decisionOsConfidenceLabel(d.confidence!)}
                </span>
              }
            >
              <button
                type="button"
                title={d.confidenceReason ?? decisionOsConfidenceFallbackTitle()}
                aria-expanded={showConfidence()}
                aria-controls={showConfidence() ? confidencePopoverId : undefined}
                class={`rounded-full px-1.5 py-0.5 text-[9px] font-medium transition hover:ring-2 hover:ring-current/30 ${decisionOsConfidenceBadgeClass(d.confidence!)}`}
                onClick={(e) => { e.stopPropagation(); setShowConfidence(v => !v); }}
              >
                {decisionOsConfidenceLabel(d.confidence!)}
              </button>
            </Show>
            <Show when={showConfidence() && hasConfidenceReason()}>
              <div
                id={confidencePopoverId}
                role="dialog"
                aria-modal="false"
                aria-label={decisionOsConfidenceExplanationAriaLabel()}
                class="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-2xl border border-white/60 bg-white/95 p-3.5 shadow-2xl backdrop-blur-md"
                onClick={(e) => e.stopPropagation()}
              >
                <p class="font-mono text-[8px] uppercase tracking-[0.18em] text-on-surface-variant/50 mb-1.5">{decisionOsConfidenceExplanationTitle()}</p>
                <p class="text-[11px] text-on-surface leading-relaxed">{d.confidenceReason}</p>
                <div class="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    class="text-[10px] text-rose-400/70 hover:text-rose-500 transition"
                    onClick={() => {
                      recordDecisionOsDiaryEntry({
                        ts: new Date().toISOString(),
                        type: "note",
                        icon: "ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚©",
                        title: `Flagged reasoning: ${d.title}`,
                        detail: d.confidenceReason ?? decisionOsFlagReasoningFallbackDetail(),
                        meta: decisionOsConfidenceLabel(d.confidence!),
                      }, sessionUserId);
                      setShowConfidence(false);
                    }}
                  >{decisionOsConfidenceFlagReasoningLabel()}</button>
                  <button
                    type="button"
                    class="text-[10px] text-on-surface-variant/50 hover:text-on-surface-variant transition"
                    onClick={() => setShowConfidence(false)}
                  >{decisionOsConfidenceCloseLabel()}</button>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* Context + deadline */}
      <div class="cursor-pointer px-4 pb-2" onClick={props.onSelect}>
        <p class="text-xs text-on-surface-variant leading-relaxed">{d.context}</p>
        {/* Deadline ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â clickable to reveal why-now context */}
        <Show when={d.deadline}>
          <div class="relative inline-block">
            <button
              type="button"
              class="mt-1 text-left text-[11px] font-medium text-rose-600 transition hover:text-rose-700"
              onClick={(e) => { e.stopPropagation(); setShowDeadlineInfo(v => !v); }}
              aria-expanded={showDeadlineInfo()}
            >
              ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚° Deadline: {d.deadline}
              <span class="ml-1 font-mono text-[9px] opacity-50">ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â</span>
            </button>
            <Show when={showDeadlineInfo()}>
              <div
                class="absolute left-0 top-full z-50 mt-1 w-72 rounded-2xl border border-rose-100/80 bg-white/97 p-3 shadow-xl backdrop-blur-md"
                onClick={(e) => e.stopPropagation()}
              >
                <p class="font-mono text-[8px] uppercase tracking-[0.18em] text-rose-400/70 mb-1.5">{decisionOsDeadlineInsightTitle()}</p>
                <p class="text-[11px] text-on-surface leading-relaxed">
                  {decisionOsDeadlineInsight({
                    deadline: d.deadline!,
                    impact: d.impact,
                    confidenceReason: d.confidenceReason,
                  })}
                </p>
                <button
                  type="button"
                  class="mt-2 text-[10px] text-rose-400/60 hover:text-rose-500 transition"
                  onClick={() => setShowDeadlineInfo(false)}
                >{decisionOsDecisionCardCloseLabel()}</button>
              </div>
            </Show>
          </div>
        </Show>
        <Show when={whyNow()}>
          {(temporal) => (
            <span
              class="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-200/70 bg-amber-50/70 px-2.5 py-1 text-[10px] font-medium text-amber-700"
              title={temporal().detail}
            >
              ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚° {temporal().badge}
            </span>
          )}
        </Show>
        {/* Calendar link */}
        <Show when={d.calendarEventId}>
          <button
            type="button"
            class="mt-1 text-[10px] font-medium text-primary hover:underline"
            onClick={(e) => { e.stopPropagation(); navigateToView("calendar", { eventId: d.calendarEventId }); }}
            title={decisionOsDecisionCardCalendarActionLabel()}
          >
            ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÂ¢Ã¢â€šÂ¬Ã‚¦ View in Calendar →
          </button>
        </Show>
        {/* Related thread chip ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â direct cross-surface shortcut to the source thread */}
        <Show when={threadContextItem()}>
          {(ti) => (
            <button
              type="button"
              class="mt-1.5 inline-flex items-center gap-1 rounded-full border border-indigo-200/60 bg-indigo-50/70 px-2.5 py-1 text-[10px] font-medium text-indigo-700 transition hover:bg-indigo-100"
              onClick={(e) => {
                e.stopPropagation();
                openDecisionOsContextItem(ti(), {
                  navigateToView,
                  openExternal: (href) => window.open(href, "_blank", "noopener,noreferrer"),
                  sanitizeHref: safeHref,
                });
              }}
              title={decisionOsDecisionCardOpenThreadLabel(ti().title)}
              data-magic-action="open-thread"
              data-magic-icon="ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€šÃ‚Â§Ãƒâ€šÃ‚µ"
              data-magic-label={decisionOsDecisionCardOpenThreadLabel(ti().title)}
              data-magic-id={`thread-${d.id}`}
            >
              → Thread: {ti().title}
            </button>
          )}
        </Show>
      </div>

      <div class="mx-4 h-px bg-black/[0.05]" />

      {/* Options */}
      <div class="px-4 py-2.5 space-y-1.5">
        <For each={visibleOptions()}>
          {(opt) => (
            <button
              type="button"
              class={`w-full rounded-xl border px-3 py-2 text-left text-xs transition ${chosen() === opt.id ? "border-primary/40 bg-primary/[0.07] font-medium text-primary" : "border-black/[0.06] bg-white/60 text-on-surface-variant hover:bg-white/90"}`}
              onClick={() => { setChosen(opt.id); saveOptionChoice(d.id, opt.id, sessionUserId); }}
            >
              <div class="flex items-start justify-between gap-2">
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-1.5">
                    <span class={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${chosen() === opt.id ? "bg-primary" : "bg-black/25"}`} />
                    <span>{opt.label}</span>
                    <Show when={opt.detail}>
                      <span class="text-on-surface-variant/60"> ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚· {opt.detail}</span>
                    </Show>
                  </span>
                  <Show when={storedChoice === opt.id}>
                    <span class="mt-1 inline-flex rounded-full border border-slate-200/80 bg-slate-50/80 px-2 py-0.5 text-[9px] font-medium text-slate-600">
                      {decisionOsUsedLastTimeLabel()}
                    </span>
                  </Show>
                </span>
                <Show when={opt.aiRecommended}>
                  <div
                    class="group relative flex-shrink-0"
                    data-magic-action="search"
                    data-magic-icon="ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“Ãƒâ€šÃ‚¦"
                    data-magic-label={decisionOsAiRecommendationTitle()}
                    data-magic-id={`ai-opt-${d.id}-${opt.id}`}
                  >
                    <span class="cursor-help rounded-full bg-primary/10 px-1.5 py-0.5 text-[8px] font-medium text-primary">{decisionOsAiRecommendationBadgeLabel()}</span>
                    <div
                      class="pointer-events-none absolute right-0 top-full z-[60] mt-1 hidden min-w-[190px] max-w-[240px] rounded-xl border border-primary/20 bg-white/97 p-2.5 shadow-xl backdrop-blur-sm group-hover:block"
                      role="tooltip"
                    >
                      <p class="mb-1 font-mono text-[7px] uppercase tracking-[0.16em] text-primary/50">{decisionOsAiRecommendationTitle()}</p>
                      <p class="text-[10px] text-on-surface leading-relaxed">
                        {decisionOsAiRecommendationDetail(opt.detail)}
                      </p>
                    </div>
                  </div>
                </Show>
              </div>
            </button>
          )}
        </For>
        <Show when={hiddenCount() > 0 && !showAllOpts()}>
          <button
            type="button"
            class="w-full rounded-xl border border-dashed border-black/10 py-1.5 text-center text-[11px] text-on-surface-variant/60 transition hover:border-primary/30 hover:text-primary"
            onClick={() => setShowAllOpts(true)}
          >
            View {hiddenCount()} more option{hiddenCount() > 1 ? "s" : ""} ↓
          </button>
        </Show>
      </div>

      <div class="mx-4 h-px bg-black/[0.05]" />

      {/* Footer action chips */}
      <div class="flex flex-wrap items-center justify-between gap-2 p-3">
        <div class="flex items-center gap-3 text-[11px] text-on-surface-variant">
          <div
            class="group relative cursor-pointer"
            data-magic-action="search"
            data-magic-icon="ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒâ€šÃ‚Â"
            data-magic-label={decisionOsDecisionCardImpactSearchLabel(d.impact)}
            data-magic-id={`impact-${d.id}`}
            onClick={(e) => { e.stopPropagation(); dispatchDecisionOsSearchAction(`impact:${d.impact}`); }}
            title={decisionOsImpactExplanation(d.impact)}
          >
            <span>{decisionOsImpactIcon(d.impact)} {decisionOsImpactLabel(d.impact)}</span>
            <div
              class="pointer-events-none absolute bottom-full left-0 z-[60] mb-1 hidden min-w-[190px] max-w-[230px] rounded-xl border border-white/70 bg-white/97 p-2 shadow-xl backdrop-blur-sm group-hover:block"
              role="tooltip"
            >
              <p class="mb-1 font-mono text-[7px] uppercase tracking-[0.16em] text-on-surface-variant/40">{decisionOsDecisionCardImpactTooltipTitle()}</p>
              <p class="text-[10px] text-on-surface leading-relaxed">{decisionOsImpactExplanation(d.impact)}</p>
            </div>
          </div>
          <Show
            when={effortMinutes(d.effort) <= 15 && props.onFilterEffort}
            fallback={<span>ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚Â±ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â {d.effort}</span>}
          >
            <button
              type="button"
              class="rounded-full border border-amber-200/60 bg-amber-50/60 px-2 py-0.5 text-[11px] text-amber-700 transition hover:bg-amber-100"
              title={decisionOsQuickWinFilterTitle()}
              onClick={() => props.onFilterEffort!()}
            >
              ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚Â±ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â {d.effort}
            </button>
          </Show>
          {/* Source count chip ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â shows context item count with hover preview + magic pointer */}
          <Show when={sourceCount() > 0}>
            <div
              class="group relative cursor-pointer"
              data-magic-action="search"
              data-magic-icon="ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â"
              data-magic-label={decisionOsDecisionCardSourceSearchLabel(d.title)}
              data-magic-id={`sources-${d.id}`}
              onClick={(e) => { e.stopPropagation(); dispatchDecisionOsSearchAction(`sources:${d.title}`); }}
            >
              <span class="rounded-full border border-black/10 px-2 py-0.5 text-[9px] text-on-surface-variant/60 transition hover:bg-white/70">
                ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â {(d.contextItems ?? []).length}
              </span>
              <div
                class="pointer-events-none absolute bottom-full left-0 z-[60] mb-1 hidden min-w-[160px] max-w-[200px] rounded-xl border border-white/70 bg-white/97 p-2 shadow-xl backdrop-blur-sm group-hover:block"
                role="tooltip"
              >
                <p class="mb-1 font-mono text-[7px] uppercase tracking-[0.14em] text-on-surface-variant/40">{decisionOsDecisionCardSourcesTooltipTitle()}</p>
                <For each={sourcePreviewItems()}>
                  {(item) => <p class="truncate py-0.5 text-[10px] text-on-surface">{item.icon} {item.title}</p>}
                </For>
                <Show when={provenanceLabel()}>
                  <p class="mt-1 border-t border-black/[0.05] pt-1 text-[10px] text-primary/80">
                    {decisionOsDecisionCardProvenancePrefix()} {provenanceLabel()}
                  </p>
                </Show>
              </div>
            </div>
          </Show>
        </div>
        <div class="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            class="rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:opacity-90"
            onClick={() => approveFlow.start()}
          >
            {decisionOsApproveActionLabel(d, chosen())}
          </button>
          <Show when={pendingApprove()}>
            <div class="flex min-w-[220px] flex-1 items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-2 py-1.5">
              <input
                type="text"
                value={approveNote()}
                onInput={(event) => {
                  approveFlow.updateNote(event.currentTarget.value);
                }}
                placeholder={decisionOsApproveNotePlaceholder()}
                class="min-w-0 flex-1 bg-transparent text-[11px] text-emerald-900 placeholder:text-emerald-700/45 focus:outline-none"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    approveFlow.confirm();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    approveFlow.cancel();
                  }
                }}
              />
              <button
                type="button"
                class="rounded-full border border-emerald-300/70 bg-white/75 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 transition hover:bg-white"
                onClick={() => approveFlow.confirm()}
              >
                {decisionOsApproveConfirmLabel()}
              </button>
            </div>
          </Show>

          {/* Quick snooze ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â one tap, no picker */}
          <Show when={props.snoozeOptions.length > 0}>
            <button
              type="button"
              class="rounded-full border border-black/10 bg-white/60 px-2.5 py-1.5 text-[11px] font-medium text-on-surface-variant transition hover:bg-white/90"
              title={decisionSnoozeQuickActionTitle(quickSnoozeAction()?.label ?? props.snoozeOptions[0].label)}
              aria-label={decisionSnoozeQuickActionTitle(quickSnoozeAction()?.label ?? props.snoozeOptions[0].label)}
              onClick={() => props.onAction("snooze", quickSnoozeAction()?.optionId ?? props.snoozeOptions[0].id)}
            >
              ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚©
            </button>
          </Show>

          {/* Snooze with time picker */}
          <div class="relative">
            <button
              type="button"
              class="rounded-full border border-black/10 bg-white/60 px-2.5 py-1.5 text-[11px] font-medium text-on-surface-variant transition hover:bg-white/90"
              onClick={(e) => { e.stopPropagation(); setShowSnooze(v => !v); }}
            >
              ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢Ãƒâ€šÃ‚¤ Snooze
            </button>
            <Show when={showSnooze()}>
              <div
                class="absolute bottom-full left-0 z-50 mb-1.5 min-w-[160px] rounded-2xl border border-white/60 bg-white/95 py-1.5 shadow-2xl backdrop-blur-md"
                onClick={(e) => e.stopPropagation()}
              >
                <Show when={highlightedSnoozeId()}>
                  <div class="px-3 pb-1.5 text-[10px] text-primary/75">
                    {decisionSnoozeUsualPrefix()} {props.snoozeOptions.find((option) => option.id === highlightedSnoozeId())?.label ?? decisionSnoozeSavedChoiceLabel()}
                  </div>
                </Show>
                <For each={props.snoozeOptions}>
                  {(opt) => (
                    <button
                      type="button"
                      class={`w-full px-4 py-2 text-left text-xs transition hover:bg-primary/5 hover:text-primary ${highlightedSnoozeId() === opt.id ? "bg-primary/[0.06] text-primary font-medium" : "text-on-surface-variant"}`}
                      onClick={() => { props.onAction("snooze", opt.id); setShowSnooze(false); }}
                    >
                      {opt.label}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>

          <button
            type="button"
            class="rounded-full border border-black/10 bg-white/60 px-2.5 py-1.5 text-[11px] font-medium text-on-surface-variant transition hover:bg-white/90"
            onClick={() => props.onAction("delegate")}
          >
            {decisionOsDelegateDecisionLabel()}
          </button>
          <Show when={props.onEnterFocusMode}>
            <button
              type="button"
              class="rounded-full border border-black/10 bg-white/60 px-2.5 py-1.5 text-[11px] font-medium text-on-surface-variant transition hover:bg-white/90"
              onClick={() => props.onEnterFocusMode?.()}
              title={decisionOsFocusDecisionTitle()}
            >
              {decisionOsFocusDecisionLabel()}
            </button>
          </Show>
          <button
            type="button"
            title={decisionOsDismissDecisionTitle()}
            class="flex h-7 w-7 items-center justify-center rounded-full border border-black/10 bg-white/60 text-[11px] text-on-surface-variant/60 transition hover:border-rose-200 hover:text-rose-500"
            onClick={() => props.onAction("dismiss")}
          >
            ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚¢
          </button>
        </div>
      </div>
    </div>
  );
}

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ ContextPanel ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬

function ContextPanel(props: { decision: Decision | null; onClose: () => void; isPinned?: boolean; onTogglePin?: () => void }) {
  const sessionUserId = readSession()?.user?.id ?? null;
  const [editingAnnotationKey, setEditingAnnotationKey] = createSignal<string | null>(null);
  const [annotationDraft, setAnnotationDraft] = createSignal("");
  const footerActions = createMemo(() =>
    props.decision
      ? decisionOsContextFooterActions({
          id: props.decision.id,
          title: props.decision.title,
        })
      : null,
  );

  return (
    <div class="flex min-h-[320px] flex-col rounded-2xl border border-white/50 bg-white/65 shadow-card backdrop-blur-sm">
      <Show
        when={props.decision}
        fallback={
          <div class="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <span class="text-4xl mb-2">i</span>
            <p class="text-xs text-on-surface-variant/60 leading-relaxed">
              {decisionOsContextSelectionPromptLabel()}
            </p>
            <p class="mt-2 text-[9px] text-on-surface-variant/30">{decisionOsContextShortcutHintLabel()}</p>
          </div>
        }
      >
        {(d) => (
          <>
            <div class="flex items-start justify-between gap-2 border-b border-black/[0.06] p-4 pb-3">
              <div class="min-w-0">
                <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface-variant/50">{decisionOsContextPanelTitle()}</p>
                <h4 class="mt-0.5 truncate text-sm font-semibold text-on-surface">{d().title}</h4>
              </div>
              <div class="flex items-center gap-1.5 flex-shrink-0">
                {/* Context anchor ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â keeps this panel frozen to the current decision while navigating other cards */}
                <Show when={props.onTogglePin}>
                  <button
                    type="button"
                    class={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full transition ${props.isPinned ? "bg-indigo-100 text-indigo-600 hover:bg-indigo-200" : "bg-black/5 text-on-surface-variant hover:bg-black/10"}`}
                    onClick={props.onTogglePin}
                    aria-pressed={props.isPinned}
                    aria-label={decisionOsContextPinAriaLabel(Boolean(props.isPinned))}
                    title={decisionOsContextPinTitle(Boolean(props.isPinned))}
                  >
                    <svg width="11" height="13" viewBox="0 0 11 13" fill="none" aria-hidden="true">
                      <circle cx="5.5" cy="4" r="2.8" stroke="currentColor" stroke-width="1.3" fill={props.isPinned ? "currentColor" : "none"} fill-opacity={props.isPinned ? "0.25" : "0"}/>
                      <line x1="5.5" y1="6.8" x2="5.5" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                      <path d="M2.5 10.5 C2.5 11.9 5.5 12.5 5.5 12.5 C5.5 12.5 8.5 11.9 8.5 10.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none"/>
                    </svg>
                  </button>
                </Show>
                <button
                  type="button"
                  class="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-black/5 text-[10px] text-on-surface-variant transition hover:bg-black/10"
                  onClick={props.onClose}
                  aria-label={decisionOsContextCloseAriaLabel()}>x</button>
              </div>
            </div>

            {/* Calendar event link */}
            <Show when={d().calendarEventId}>
              <div class="mx-4 mt-3">
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.04] px-3 py-2 text-left text-[11px] font-medium text-primary transition hover:bg-primary/[0.07]"
                  onClick={() => navigateToView("calendar", { eventId: d().calendarEventId })}
                >
                  <span>CAL</span>
                  <span>{decisionOsContextCalendarActionLabel()}</span>
                  <span class="ml-auto text-[10px] opacity-60">-&gt;</span>
                </button>
              </div>
            </Show>

            {/* Why-this-matters */}
            <div class="mx-4 mt-3">
              <WhyMattersSection
                bullets={d().whyBullets ?? []}
                fallbackText={d().whyMatters}
                title={decisionOsContextWhyMattersTitle()}
              />
            </div>

            {/* Context items */}
            <div class="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              <For each={d().contextItems ?? []}>
                {(item) => (
                  <div class="rounded-xl border border-black/[0.06] bg-white/70 px-3 py-2.5">
                    <div class="flex items-start gap-2">
                      <span class="flex-shrink-0 text-base leading-none">{item.icon}</span>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-start justify-between gap-2">
                          <p class="text-[11px] font-semibold text-on-surface leading-tight">{item.title}</p>
                          <Show when={item.sourceRefs?.length}>
                            <button
                              type="button"
                              class="flex-shrink-0 rounded-full border border-primary/20 px-1.5 py-0.5 font-mono text-[8px] text-primary transition hover:bg-primary/5"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDecisionOsContextItem(item, {
                                  navigateToView,
                                  openExternal: (href) =>
                                    window.open(href, "_blank", "noopener,noreferrer"),
                                  sanitizeHref: safeHref,
                                });
                              }}
                            >{decisionOsContextItemOpenLabel(item)}</button>
                          </Show>
                          <Show when={!item.sourceRefs?.length && item.sourceUrl}>
                            <a
                              href={safeHref(item.sourceUrl)}
                              class="flex-shrink-0 rounded-full border border-primary/20 px-1.5 py-0.5 font-mono text-[8px] text-primary transition hover:bg-primary/5"
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >{decisionOsContextExternalViewLabel()}</a>
                          </Show>
                          <Show when={!item.sourceRefs?.length && !item.sourceUrl && item.sourceType}>
                            <span class="flex-shrink-0 rounded-full border border-black/10 px-1.5 py-0.5 font-mono text-[8px] text-on-surface-variant/50">
                              {item.sourceType}
                            </span>
                          </Show>
                        </div>
                        <Show when={item.snippet}>
                          <p class="mt-0.5 text-[10px] text-on-surface-variant leading-relaxed">{item.snippet}</p>
                        </Show>
                        <Show when={item.time}>
                          <p class="mt-1 text-[9px] text-on-surface-variant/50">{item.time}</p>
                        </Show>
                        <Show when={decisionOsContextAnnotation(item, sessionUserId)}>
                          {(note) => (
                            <blockquote class="mt-2 rounded-xl border border-amber-200/60 bg-amber-50/70 px-2.5 py-2 text-[10px] italic leading-relaxed text-amber-800">"{note()}"</blockquote>
                          )}
                        </Show>
                        <div class="mt-2 flex items-center gap-2">
                          <Show
                            when={editingAnnotationKey() === decisionOsContextAnnotationKey(item)}
                            fallback={
                              <button
                                type="button"
                                class="text-[10px] text-on-surface-variant/55 transition hover:text-primary"
                                onClick={() => {
                                  const next = decisionOsContextAnnotationEditState(item, sessionUserId);
                                  if (!next) return;
                                  setEditingAnnotationKey(next.editingKey);
                                  setAnnotationDraft(next.draft);
                                }}
                              >
                                {decisionOsContextAddNoteLabel()}
                              </button>
                            }
                          >
                            <div class="flex min-w-0 flex-1 items-center gap-2">
                              <input
                                type="text"
                                value={annotationDraft()}
                                onInput={(event) => setAnnotationDraft(event.currentTarget.value)}
                                class="min-w-0 flex-1 rounded-full border border-black/10 bg-white/85 px-3 py-1.5 text-[10px] text-on-surface placeholder:text-on-surface-variant/45 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder={decisionOsContextAnnotationPlaceholder()}
                                onKeyDown={(event) => {
                                  const next = decisionOsContextAnnotationKeyDownState(
                                    item,
                                    annotationDraft(),
                                    event.key,
                                    sessionUserId,
                                  );
                                  if (!next) return;
                                  if (next.shouldPreventDefault) event.preventDefault();
                                  setEditingAnnotationKey(next.editingKey);
                                  setAnnotationDraft(next.draft);
                                }}
                              />
                              <button
                                type="button"
                                class="rounded-full border border-primary/20 bg-primary/[0.04] px-2.5 py-1 text-[10px] font-medium text-primary transition hover:bg-primary/[0.08]"
                                onClick={() => {
                                  const next = decisionOsContextAnnotationSaveState(
                                    item,
                                    annotationDraft(),
                                    sessionUserId,
                                  );
                                  setEditingAnnotationKey(next.editingKey);
                                  setAnnotationDraft(next.draft);
                                }}
                              >
                                {decisionOsContextSaveNoteLabel()}
                              </button>
                            </div>
                          </Show>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </For>
              <Show when={(d().contextItems ?? []).length === 0}>
                <p class="py-4 text-center text-[11px] text-on-surface-variant/40">{decisionOsContextEmptyStateLabel()}</p>
              </Show>
            </div>
            {/* Cross-surface footer ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â quick links to related surfaces */}
            <div class="border-t border-black/[0.05] px-4 py-2.5 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                class="flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50/70 px-2.5 py-1 text-[10px] font-medium text-emerald-700 transition hover:bg-emerald-100"
                onClick={() => dispatchActionChipEvent(footerActions()!.draftsActionChip)}
                title={footerActions()!.draftsButtonTitle}
              >
                {footerActions()!.draftsButtonLabel}
              </button>
              <button
                type="button"
                class="flex items-center gap-1 rounded-full border border-black/10 bg-white/60 px-2.5 py-1 text-[10px] font-medium text-on-surface-variant transition hover:bg-white/80"
                onClick={() => navigateToView(footerActions()!.threadsView)}
                title={footerActions()!.threadsButtonTitle}
              >
                {footerActions()!.threadsButtonLabel}
              </button>
              <button
                type="button"
                class="ml-auto flex items-center gap-1 rounded-full border border-black/10 bg-white/60 px-2.5 py-1 text-[10px] font-medium text-on-surface-variant transition hover:bg-white/80"
                onClick={() => dispatchDecisionOsSearchAction(footerActions()!.searchTerm)}
                title={footerActions()!.searchButtonTitle}
                data-magic-action={footerActions()!.searchMagic.action}
                data-magic-icon="search"
                data-magic-label={footerActions()!.searchMagic.label}
                data-magic-id={footerActions()!.searchMagic.id}
              >
                {footerActions()!.searchButtonLabel}
              </button>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}

function DecisionFocusOverlay(props: {
  decision: Decision;
  pendingOutcomeCheck?: PendingOutcomeCheck | null;
  onClose: () => void;
}) {
  const decision = () => props.decision;
  const sourceRefs = createMemo(() => decisionOsFocusOverlaySourceRefs(decision().contextItems));
  const summaryChips = createMemo(() =>
    decisionOsFocusOverlaySummaryChips({
      impactLabel: `${decisionOsImpactIcon(decision().impact)} ${decisionOsImpactLabel(decision().impact)}`,
      confidenceLabel:
        decision().confidence !== undefined ? decisionOsConfidenceLabel(decision().confidence ?? 0) : undefined,
      durationScope: decision().durationScope,
    }),
  );

  return (
    <div class="fixed inset-0 z-[220] bg-black/45 backdrop-blur-sm" onClick={props.onClose}>
      <div
        class="absolute inset-x-4 bottom-4 top-4 overflow-y-auto rounded-[28px] border border-white/70 bg-white/95 p-5 shadow-2xl lg:inset-x-20"
        onClick={(event) => event.stopPropagation()}
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/50">{decisionOsFocusOverlayTitle()}</p>
            <h2 class="mt-1 text-xl font-semibold text-on-surface">{decision().title}</h2>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-on-surface-variant">{decision().context}</p>
          </div>
          <button
            type="button"
            class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-black/5 text-on-surface-variant transition hover:bg-black/10"
            onClick={props.onClose}
            aria-label={decisionOsFocusOverlayCloseAriaLabel()}
          >
            x
          </button>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <For each={summaryChips()}>
            {(chip) => (
              <span
                class={
                  chip.tone === "info"
                    ? "rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] text-sky-700"
                    : "rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] text-on-surface-variant"
                }
              >
                {chip.label}
              </span>
            )}
          </For>
          <Show when={props.pendingOutcomeCheck}>
            <span class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] text-sky-700">
              {decisionOsOutcomeCheckBadgeLabel(props.pendingOutcomeCheck!.checkAt)}
            </span>
          </Show>
        </div>

        <div class="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div class="space-y-5">
            <section class="rounded-2xl border border-black/[0.06] bg-white/75 p-4">
              <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface-variant/50">
                {decisionOsFocusOverlaySectionTitle("why")}
              </p>
              <div class="mt-3">
                <WhyMattersSection
                  bullets={decision().whyBullets ?? []}
                  fallbackText={decision().whyMatters}
                  title={decisionOsFocusOverlaySectionTitle("why")}
                />
              </div>
            </section>

            <section class="rounded-2xl border border-black/[0.06] bg-white/75 p-4">
              <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface-variant/50">
                {decisionOsFocusOverlaySectionTitle("options")}
              </p>
              <div class="mt-3 space-y-2">
                <For each={decision().options}>
                  {(option) => (
                    <div class="rounded-2xl border border-black/[0.06] bg-white p-3">
                      <div class="flex items-center gap-2">
                        <p class="text-sm font-medium text-on-surface">{option.label}</p>
                        <Show when={option.aiRecommended}>
                          <span class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            {decisionOsFocusOverlayAiSuggestedLabel()}
                          </span>
                        </Show>
                      </div>
                      <Show when={option.detail}>
                        <p class="mt-1 text-[12px] leading-5 text-on-surface-variant">{option.detail}</p>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </section>
          </div>

          <div class="space-y-5">
            <section class="rounded-2xl border border-black/[0.06] bg-white/75 p-4">
              <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface-variant/50">
                {decisionOsFocusOverlaySectionTitle("confidence")}
              </p>
              <p class="mt-3 text-[12px] leading-6 text-on-surface-variant">
                {decisionOsFocusOverlayConfidenceText(decision().confidenceReason)}
              </p>
            </section>

            <section class="rounded-2xl border border-black/[0.06] bg-white/75 p-4">
              <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface-variant/50">
                {decisionOsFocusOverlaySectionTitle("context")}
              </p>
              <div class="mt-3 space-y-2">
                <For each={decision().contextItems ?? []}>
                  {(item) => (
                    <div class="rounded-2xl border border-black/[0.06] bg-white p-3">
                      <div class="flex items-start gap-2">
                        <span class="text-base leading-none">{item.icon}</span>
                        <div class="min-w-0 flex-1">
                          <p class="text-[12px] font-medium text-on-surface">{item.title}</p>
                          <Show when={item.snippet}>
                            <p class="mt-1 text-[11px] leading-5 text-on-surface-variant">{item.snippet}</p>
                          </Show>
                          <Show when={item.time}>
                            <p class="mt-1 text-[10px] text-on-surface-variant/60">{item.time}</p>
                          </Show>
                        </div>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </section>

            <Show when={decisionOsFocusOverlayHasSourceRefs(sourceRefs())}>
              <section class="rounded-2xl border border-black/[0.06] bg-white/75 p-4">
                <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface-variant/50">
                  {decisionOsFocusOverlaySectionTitle("sources")}
                </p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <For each={sourceRefs()}>
                    {(ref) => (
                      <span class="rounded-full border border-black/10 bg-white px-3 py-1 text-[10px] text-on-surface-variant">
                        {ref}
                      </span>
                    )}
                  </For>
                </div>
              </section>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ ProgressFooter ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬

function ProgressFooter(props: {
  total: number;
  completedToday: number;
  timeSavedMinutes: number;
  onDismissLowImpact: () => void;
  onScheduleReview: () => void;
}) {
  return (
    <div class="rounded-2xl border border-white/50 bg-white/60 p-4 shadow-card backdrop-blur-sm">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-[11px] font-medium text-on-surface-variant transition hover:bg-white/90"
            onClick={props.onDismissLowImpact}
          >
            {decisionOsDismissLowImpactLabel()}
          </button>
          <button
            type="button"
            class="rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-[11px] font-medium text-on-surface-variant transition hover:bg-white/90"
            onClick={props.onScheduleReview}
          >
            {decisionOsScheduleReviewLabel()}
          </button>
        </div>
        <div class="flex items-center gap-4">
          <div class="flex flex-col items-end">
            <span class="text-sm font-bold text-on-surface">
              {decisionOsCompletedProgressLabel(props.completedToday, props.total)}
            </span>
            <span class="font-mono text-[8px] text-on-surface-variant/60">{decisionOsCompletedTodayTitle()}</span>
          </div>
          <div class="h-8 w-px bg-black/10" />
          <div class="flex flex-col items-end">
            <span class="text-sm font-bold text-emerald-600">
              {decisionOsTimeSavedLabel(props.timeSavedMinutes)}
            </span>
            <span class="font-mono text-[8px] text-on-surface-variant/60">{decisionOsTimeSavedTitle()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ Main View ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬

export function DecisionOSHomeView() {
  const sessionUserId = readSession()?.user?.id ?? null;
  const [decisions, setDecisions] = createSignal<Decision[]>(SEED_DECISIONS);
  const [queueState, setQueueState] = createSignal<DecisionOsQueueBootstrapState>({
    queuePriorityCard: null,
    queueActionItems: [],
    queueContextPanelItems: [],
    queueActionOverflowCount: 0,
    queueActionOverflowSummary: null,
  });
  const [queueCompanionState, setQueueCompanionState] = createSignal<DecisionOsQueueCompanionState>({
    responseItems: [],
    preparedDraftItems: [],
    contextPackItems: [],
    proactiveSuggestions: [],
  });
  const [operationalBootstrap, setOperationalBootstrap] =
    createSignal<DecisionOsUpdateApplicationState["operationalBootstrap"]>(null);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [responseQueueFocusTick, setResponseQueueFocusTick] = createSignal(0);
  const [mood, setMood] = createSignal<DecisionOsSuggestedMood>("neutral");
  const [moodPinnedByUser, setMoodPinnedByUser] = createSignal(false);
  const [durationView, setDurationView] = createSignal<DurationView>("day");
  const [dismissed, setDismissed] = createSignal<Set<string>>(new Set());
  const [snoozed, setSnoozed] = createSignal<Map<string, number>>(loadDecisionOsSnoozed(sessionUserId));
  const [snoozeCounts, setSnoozeCounts] = createSignal<Map<string, number>>(loadSnoozeCounts(sessionUserId));
  const [preferredSnoozeId, setPreferredSnoozeId] = createSignal<string | null>(preferredSnoozeOptionId(sessionUserId));
  const [pinnedContextId, setPinnedContextId] = createSignal<string | null>(null);
  const [streakCount, setStreakCount] = createSignal(computeCurrentStreak(new Date(), sessionUserId));
  const [pendingOutcomeChecks, setPendingOutcomeChecks] = createSignal<PendingOutcomeCheck[]>([]);
  const [tick, setTick] = createSignal(0);
  const [completedToday, setCompletedToday] = createSignal(SEED_BRIEFING.completedCount);
  const [timeSavedMinutes, setTimeSavedMinutes] = createSignal(132);
  const [focusedIndex, setFocusedIndex] = createSignal<number>(-1);
  const [goalModalDecision, setGoalModalDecision] = createSignal<Decision | null>(null);
  const [showShortcuts, setShowShortcuts] = createSignal(false);
  const [focusModeDecisionId, setFocusModeDecisionId] = createSignal<string | null>(null);
  const [vimNavigationEnabled, setVimNavigationEnabled] = createSignal(loadVimNavigationEnabled());
  const continuityStateFieldSummary = createMemo(() =>
    summarizeDecisionOsStateFields(
      dashboardBootstrapContinuityStateFields(operationalBootstrap()),
    ),
  );
  const watcherPressureSummary = createMemo(() =>
    latestWatcherSignalSummaryFromMessages(dashboardBootstrapMessages(operationalBootstrap())),
  );
  const topThreadFreshnessSummary = createMemo(() =>
    topThreadFreshnessState(dashboardBootstrapThreadRetrievalState(operationalBootstrap()))?.summary ?? null,
  );
  const costStatus = createMemo(
    () => dashboardBootstrapCostStatus(operationalBootstrap()) ?? null,
  );
  const costSnapshot = createMemo(
    () => dashboardBootstrapCostSnapshot(operationalBootstrap()) ?? null,
  );
  const briefing = createMemo(() =>
    decisionOsBriefing(operationalBootstrap()) ?? SEED_BRIEFING,
  );

  const [toast, setToast] = createSignal<DecisionOsToastState | null>(null);
  const toastController = createDecisionOsToastController({
    getToast: toast,
    setToast,
  });
  const [queueMinutesBaseline, setQueueMinutesBaseline] = createSignal(-1);

  let briefingRef: HTMLDivElement | undefined;
  let decisionOsRootRef: HTMLDivElement | undefined;
  let confettiFired = false;

  const selectedDecision = createMemo(() => decisions().find(d => d.id === selectedId()) ?? null);

  const moodFilter = createMemo(() => decisionOsMoodEffortFilter(mood()));

  // Duration-aware filtering: decisions roll up ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â "week" shows week+day, "month" shows month+week+day, "year" shows all.
  const durationScopeFilter = createMemo((): DurationView[] => {
    const order = decisionOsDurationScopeOrder();
    const idx = order.indexOf(durationView());
    return order.slice(0, idx + 1);
  });

  const visibleDecisions = createMemo(() => {
    void tick();
    const filter = moodFilter();
    const dis = dismissed();
    const snz = snoozed();
    const now = Date.now();
    const scopes = durationScopeFilter();
    return decisions().filter(d => {
      if (dis.has(d.id)) return false;
      const wakeAt = snz.get(d.id);
      if (wakeAt !== undefined && wakeAt > now) return false;
      // Duration filter: decisions without a scope always appear in day view.
      const scope = d.durationScope ?? "day";
      if (!scopes.includes(scope)) return false;
      // Mood filter
      if (filter === "quick") return isDecisionOsQuickWin(d.effort);
      return true;
    });
  });

  // Count per duration view for the tab badges.
  const durationCounts = createMemo((): Record<DurationView, number> => {
    void tick();
    const dis = dismissed();
    const snz = snoozed();
    const now = Date.now();
    const counts: Record<DurationView, number> = { day: 0, week: 0, month: 0, year: 0 };
    for (const d of decisions()) {
      if (dis.has(d.id)) continue;
      const wakeAt = snz.get(d.id);
      if (wakeAt !== undefined && wakeAt > now) continue;
      const scope = d.durationScope ?? "day";
      // Count items at their own scope (not rolled-up) for badge accuracy.
      counts[scope] = (counts[scope] ?? 0) + 1;
    }
    return counts;
  });

  const completedPct = createMemo(() => {
    const total = visibleDecisions().length + dismissed().size;
    return total === 0 ? 0 : Math.round((dismissed().size / total) * 100);
  });

  // Total estimated effort across visible queue (for load indicator).
  const totalQueueMinutes = createMemo(() =>
    totalDecisionOsEffortMinutes(visibleDecisions())
  );
  const queueLoadTrend = createMemo<"up" | "down" | "steady">(() => {
    return decisionOsQueueLoadTrend(queueMinutesBaseline(), totalQueueMinutes());
  });
  const topBlocker = createMemo(() =>
    visibleDecisions().find((decision) => decision.urgency === "urgent" && decision.impact === "high") ?? null,
  );
  const urgentResponseCount = createMemo(
    () => queueCompanionState().responseItems.filter((item) => item.urgency === "urgent" || item.urgency === "today").length,
  );
  const calendarRuntimeSummary = createMemo(() =>
    dashboardBootstrapCalendarRuntimeSummary(operationalBootstrap()),
  );
  const latestTentativeAnchorType = createMemo<string | null>(() => {
    const profile = calendarRuntimeSummary()?.latest_tentative_profile;
    const anchorType = profile?.schedule_anchor_type;
    return typeof anchorType === "string" ? anchorType : null;
  });
  const inferredMood = createMemo<DecisionOsEnergyInference>(() =>
    inferDecisionOsMood({
      totalQueueMinutes: totalQueueMinutes(),
      visibleDecisionCount: visibleDecisions().length,
      urgentResponseCount: urgentResponseCount(),
      tentativeHoldCount: calendarRuntimeSummary()?.tentative_hold_count ?? 0,
      confirmedEventCount: calendarRuntimeSummary()?.confirmed_event_count ?? 0,
      nextTentativeStartAt: calendarRuntimeSummary()?.next_tentative_start_at ?? null,
      latestTentativeNoteKind: calendarRuntimeSummary()?.latest_tentative_note_kind ?? null,
      latestTentativePrepLeadMinutes:
        calendarRuntimeSummary()?.latest_tentative_prep_lead_minutes ?? null,
      latestTentativeAnchorType: latestTentativeAnchorType(),
    }),
  );
  const autoQuickWinsActive = createMemo(() =>
    !moodPinnedByUser()
    && (mood() === "tired" || mood() === "stressed")
    && inferredMood()?.mood === mood()
  );
  const snoozeOptions = createMemo<SnoozeOption[]>(() =>
    inferDecisionOsSnoozeOptions({
      nextTentativeStartAt: calendarRuntimeSummary()?.next_tentative_start_at ?? null,
      latestTentativeTitle: calendarRuntimeSummary()?.latest_tentative_title ?? null,
      latestTentativeNoteKind: calendarRuntimeSummary()?.latest_tentative_note_kind ?? null,
      latestTentativePrepLeadMinutes: calendarRuntimeSummary()?.latest_tentative_prep_lead_minutes ?? null,
      confirmedEventCount: calendarRuntimeSummary()?.confirmed_event_count ?? 0,
    }),
  );

  const durationPreviews = createMemo((): Partial<Record<DurationView, string[]>> => {
    const result: Partial<Record<DurationView, string[]>> = {};
    for (const d of decisions()) {
      const scope = d.durationScope ?? "day";
      if (!result[scope]) result[scope] = [];
      if (result[scope]!.length < 2) result[scope]!.push(d.title);
    }
    return result;
  });

  const contextDecision = createMemo(() =>
    decisionOsContextSelection({
      decisions: decisions(),
      pinnedContextId: pinnedContextId(),
      selectedDecision: selectedDecision(),
    }),
  );
  const focusModeDecision = createMemo(() =>
    decisionOsFocusModeSelection(decisions(), focusModeDecisionId()),
  );

  createEffect(() => {
    if (completedPct() >= 100 && !confettiFired && briefingRef && dismissed().size > 0) {
      confettiFired = true;
      appendDecisionOsConfetti<HTMLDivElement>(briefingRef);
      recordClearStreak(new Date(), sessionUserId);
      setStreakCount(computeCurrentStreak(new Date(), sessionUserId));
    }
  });

  createEffect(() => {
    const current = totalQueueMinutes();
    const next = nextQueueMinutesBaseline(queueMinutesBaseline(), current);
    if (next !== queueMinutesBaseline()) {
      setQueueMinutesBaseline(next);
    }
  });

  // Auto-reset tired/stressed mood when queue clears ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â filter no longer needed
  createEffect(() => {
    const plan = decisionOsQueueClearMoodResetPlan({
      completedPct: completedPct(),
      mood: mood(),
    });
    if (!plan.shouldReset) return;
    selectMood(plan.mood, plan.source);
    if (plan.toastMessage) toastController.show(plan.toastMessage, null);
  });

  createEffect(() => {
    void tick();
    const now = Date.now();
    const current = snoozed();
    let changed = false;
    const next = new Map<string, number>();
    for (const [id, wakeAt] of current.entries()) {
      if (wakeAt > now) {
        next.set(id, wakeAt);
      } else {
        changed = true;
      }
    }
    if (changed) {
      setSnoozed(next);
      saveDecisionOsSnoozed(next, sessionUserId);
    }
  });

  createEffect(() => {
    const inferred = inferredMood();
    if (!inferred || moodPinnedByUser()) return;
    if (mood() !== inferred.mood) setMood(inferred.mood);
  });

  function selectMood(m: DecisionOsSuggestedMood, source: "user" | "agent" | "system" = "user") {
    const selection = decisionOsMoodSelectionPlan({
      mood: m,
      source,
      currentPinnedByUser: moodPinnedByUser(),
      option: decisionOsMoodOptions().find((option) => option.id === m),
    });
    setMoodPinnedByUser(selection.pinnedByUser);
    setMood(selection.mood);
    if (selection.diaryEntry) {
      recordDecisionOsDiaryEntry(selection.diaryEntry, sessionUserId);
    }
  }

  function handleAction(
    id: string,
    action: "approve" | "snooze" | "delegate" | "dismiss",
    snoozeId?: string,
    _optionId?: string,
    extras?: { note?: string },
  ) {
    const execution = decisionOsActionExecution({
      decisions: decisions(),
      decisionId: id,
      action,
      snoozeId,
      approvalNote: extras?.note,
      snoozeOptions: snoozeOptions(),
    });
    const effectPlan = decisionOsActionEffectPlan(execution);
    const d = execution.decision;

    if (execution.kind === "approve") {
      const approveState = decisionOsApproveUiState({
        decisionId: id,
        selectedId: selectedId(),
        dismissed: dismissed(),
        completedToday: completedToday(),
        timeSavedMinutes: timeSavedMinutes(),
        effortMinutes: d?.effort ? effortMinutes(d.effort) : 0,
      });
      setDismissed(approveState.next.dismissed);
      setCompletedToday(approveState.next.completedToday);
      setTimeSavedMinutes(approveState.next.timeSavedMinutes);
      setSelectedId(approveState.next.selectedId);
      confettiFired = false;
      toastController.show(
        effectPlan.toastMessage,
        () => {
          setDismissed(approveState.snapshot.dismissed);
          setCompletedToday(approveState.snapshot.completedToday);
          setTimeSavedMinutes(approveState.snapshot.timeSavedMinutes);
          setPendingOutcomeChecks((current) => withoutDecisionPendingOutcomeCheck(current, id));
        },
        {
          actionLabel: effectPlan.kind === "approve" ? effectPlan.toastOptions.actionLabel : undefined,
          durationMs: effectPlan.kind === "approve" ? effectPlan.toastOptions.durationMs : undefined,
          onTimeout: () => {
            if (effectPlan.kind !== "approve") return;
            recordDecisionOsDiaryEntry(effectPlan.timeoutDiaryEntry, sessionUserId);
            if (effectPlan.timeoutOutcomeCheck) {
              setPendingOutcomeChecks(scheduleDecisionPendingOutcomeCheck(effectPlan.timeoutOutcomeCheck, sessionUserId));
            }
          },
        },
      );
    }

    if (execution.kind === "dismiss") {
      const dismissState = decisionOsDismissUiState({
        decisionId: id,
        selectedId: selectedId(),
        dismissed: dismissed(),
        completedToday: completedToday(),
      });
      setDismissed(dismissState.next.dismissed);
      setSelectedId(dismissState.next.selectedId);
      toastController.show(effectPlan.toastMessage, () => {
        setDismissed(dismissState.snapshot.dismissed);
        setCompletedToday(dismissState.snapshot.completedToday);
      });
    }

    if (execution.kind === "snooze") {
      if (execution.option) {
        const applied = applyDecisionSnooze({
          decisionId: id,
          optionId: execution.option.id,
          wakeAt: execution.option.wakeAt,
          snoozed: snoozed(),
          snoozeCounts: snoozeCounts(),
          userId: sessionUserId,
        });
        setPreferredSnoozeId(applied.preferredSnoozeId);
        setSnoozed(applied.snoozed);
        setSnoozeCounts(applied.snoozeCounts);
      }
      const snoozeState = decisionOsSnoozeUiState({
        decisionId: id,
        selectedId: selectedId(),
      });
      setSelectedId(snoozeState.selectedId);
      setFocusedIndex(snoozeState.focusedIndex);
      toastController.show(effectPlan.toastMessage, () => {
        setSnoozed((prev) => undoDecisionSnooze(id, prev, sessionUserId));
      });
      if (effectPlan.kind === "snooze") {
        recordDecisionOsDiaryEntry(effectPlan.immediateDiaryEntry, sessionUserId);
      }
    }

    if (execution.kind === "delegate") {
      if (effectPlan.kind === "delegate") {
        dispatchActionChipEvent(effectPlan.actionChip);
      }
      toastController.show(effectPlan.toastMessage, null);
    }
  }

  function dismissLowImpact() {
    const plan = decisionOsDismissLowImpactPlan({
      decisions: decisions(),
      dismissed: dismissed(),
    });
    if (!plan) return;
    const snap = new Set(dismissed());
    setDismissed(prev => new Set([...prev, ...plan.ids]));
    toastController.show(plan.toastMessage, () => setDismissed(snap));
  }

  function scheduleReview() {
    dispatchActionChipEvent(decisionOsScheduleReviewPlan().actionChip);
  }

  function focusQueuePriority() {
    const plan = decisionOsFocusQueuePriorityFollowUpPlan({ queueState: queueState() });
    if (plan.kind === "open-queue-priority") {
      openDecisionQueuePriorityTarget({
        queueState: {
          ...plan.queueState,
          queueActionItems: [...plan.queueState.queueActionItems],
          queueContextPanelItems: [...plan.queueState.queueContextPanelItems],
        },
      });
    }
  }

  function handleGoalScheduled(summary: string, _days: string[]) {
    const plan = decisionOsGoalScheduledPlan({
      decisions: decisions(),
      decisionId: goalModalDecision()?.id,
      summary,
    });
    setDecisions(plan.decisions);
    toastController.show(plan.toastMessage, null);
    recordDecisionOsDiaryEntry(plan.diaryEntry, sessionUserId);
  }

  // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ Keyboard shortcuts ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬

  onMount(() => {
    const unsubscribeVimNavigationPreference = subscribeVimNavigationPreference((enabled) => {
      setVimNavigationEnabled(enabled);
    });
    onCleanup(() => unsubscribeVimNavigationPreference());

    setPendingOutcomeChecks(loadDecisionPendingOutcomeChecks(decisions(), sessionUserId));
    const applyUpdateDetail = (
      detail: Parameters<typeof decisionOsUpdateApplicationState<Decision>>[0]["detail"],
    ) => {
      const resolved = decisionOsResolvedUpdateState({
        currentDecisions: decisions(),
        next: decisionOsUpdateApplicationState<Decision, Decision>({
          detail,
          selectedId: selectedId(),
          buildActionDecision: trustAwareActionDecision,
          buildPriorityDecision: trustAwarePriorityDecision,
          planContinuitySelection: decisionOsSelectionAfterContinuityUpdate,
        }),
        mergeContinuityDecisions: mergeDecisionOsContinuityDecisions,
      });
      if (!resolved) return;
      if (resolved.suggestedMood) selectMood(resolved.suggestedMood, "agent");
      setQueueState(resolved.queueState);
      setQueueCompanionState(resolved.queueCompanionState);
      setOperationalBootstrap(resolved.operationalBootstrap);
      setDecisions(resolved.decisions);
      if (resolved.continuitySelection) {
        setSelectedId(resolved.continuitySelection.selectedId);
        setFocusedIndex(resolved.continuitySelection.focusedIndex);
      }
    };
    const cachedDetail = latestDecisionOsUpdateDetail();
    if (cachedDetail) {
      applyUpdateDetail(cachedDetail);
    }
    const agentHandler = (
      detail: DecisionOsNormalizedUpdateDetail,
    ) => {
      applyUpdateDetail(detail);
    };
    const focusHandler = (
      detail: DecisionOsFocusEventDetail,
    ) => {
      if (shouldFocusDecisionOsResponseQueue(detail.panel)) {
        setResponseQueueFocusTick((tick) => tick + 1);
      }
    };

    const keyHandler = (e: KeyboardEvent) => {
      // Don't fire when user is typing in an input or textarea.
      if (
        e.target instanceof HTMLInputElement
        || e.target instanceof HTMLTextAreaElement
        || (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) return;
      const isVimNavigationKey = e.key === "j" || e.key === "k";
      const activeElement = document.activeElement;
      const decisionQueueFocused = Boolean(
        decisionOsRootRef
        && activeElement
        && (activeElement === decisionOsRootRef || decisionOsRootRef.contains(activeElement))
      );
      if (isVimNavigationKey && (!vimNavigationEnabled() || !decisionQueueFocused)) return;
      // Don't fire with modifier keys (Ctrl/Meta = browser shortcuts).
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const visible = visibleDecisions();
      const selectedOrFocused = decisionOsSelectedOrFocusedItem(
        selectedDecision(),
        visible,
        focusedIndex(),
      );
      const focusedDecision = decisionOsFocusedItem(visible, focusedIndex());
      const intent = decisionOsKeyboardIntent({
        key: e.key,
        vimNavigationEnabled: vimNavigationEnabled(),
        showShortcuts: showShortcuts(),
        hasGoalModal: Boolean(goalModalDecision()),
        hasFocusMode: Boolean(focusModeDecisionId()),
        hasFocusedDecision: Boolean(focusedDecision),
        hasCalendarTarget: Boolean(selectedOrFocused?.calendarEventId),
        hasGoalBreakdownTarget: Boolean(selectedOrFocused?.goalBreakdown),
      });
      const execution = decisionOsKeyboardExecutionPlan({
        intent,
        visibleDecisions: visible,
        focusedIndex: focusedIndex(),
        focusedDecision,
        selectedOrFocused,
        currentFocusModeId: focusModeDecisionId(),
        currentPinnedContextId: pinnedContextId(),
        currentMood: mood(),
      });

      switch (execution.kind) {
        case "toggle-shortcuts":
          e.preventDefault();
          setShowShortcuts((v) => !v);
          break;
        case "close-shortcuts":
          setShowShortcuts(false);
          break;
        case "close-goal-modal":
          setGoalModalDecision(null);
          break;
        case "close-focus-mode":
          setFocusModeDecisionId(null);
          break;
        case "clear-selection":
          setSelectedId(null);
          setFocusedIndex(-1);
          break;
        case "focus":
          e.preventDefault();
          setSelectedId(execution.selectedId);
          setFocusedIndex(execution.focusedIndex);
          break;
        case "approve":
          e.preventDefault();
          if (execution.requiresGoalBreakdown) {
            setGoalModalDecision(execution.decision);
          } else {
            handleAction(execution.decisionId, "approve");
          }
          break;
        case "dismiss":
          e.preventDefault();
          handleAction(execution.decisionId, "dismiss");
          setFocusedIndex(execution.focusedIndex);
          break;
        case "snooze":
          e.preventDefault();
          handleAction(execution.decisionId, "snooze", execution.snoozeId);
          break;
        case "open-calendar":
          e.preventDefault();
          navigateToView("calendar", { eventId: execution.eventId });
          break;
        case "open-goal-breakdown":
          e.preventDefault();
          setGoalModalDecision(execution.decision);
          break;
        case "set-duration":
          e.preventDefault();
          setDurationView(execution.value);
          break;
        case "set-focus-mode":
          e.preventDefault();
          setFocusModeDecisionId(execution.value);
          break;
        case "toggle-mood":
          e.preventDefault();
          selectMood(execution.value);
          break;
        case "set-pinned-context":
          e.preventDefault();
          setPinnedContextId(execution.value);
          break;
        case "none":
          break;
      }
    };

    const magicHandler = (detail: MagicActionEventDetail) => {
      const dispatchPlan = decisionOsMagicDispatchPlan(
        decisionOsMagicExecutionPlan<Decision, ContextItem>({
          action: decisionOsMagicActionPlan(detail),
          decisions: visibleDecisions(),
        }),
      );
      switch (dispatchPlan.kind) {
        case "open-goal-breakdown":
          setGoalModalDecision(dispatchPlan.decision);
          break;
        case "handle-action":
          handleAction(dispatchPlan.decisionId, dispatchPlan.action);
          break;
        case "dispatch-search":
          dispatchDecisionOsSearchAction(dispatchPlan.term);
          break;
        case "open-thread":
          openDecisionOsContextItem(dispatchPlan.item, {
            navigateToView,
            openExternal: (href) => window.open(href, "_blank", "noopener,noreferrer"),
            sanitizeHref: safeHref,
          });
          break;
        case "none":
          break;
      }
    };
    const bridgeController = createDecisionOsHomeBridgeController({
      windowTarget: window,
      documentTarget: document,
      onUpdateDetail: agentHandler,
      onFocusDetail: focusHandler,
      onKeyDown: keyHandler,
      onMagicDetail: magicHandler,
      onTick: () => setTick((value) => value + 1),
      onDispose: () => toastController.dispose(),
    });

    onCleanup(() => {
      bridgeController.dispose();
    });
  });

  return (
    <div ref={decisionOsRootRef} tabIndex={0} class="flex flex-col gap-4 p-1 outline-none">
      {/* Briefing bar */}
      <DailyBriefingBar
        data={briefing()}
        suggestedMood={mood()}
        watcherPressureSummary={watcherPressureSummary()}
        topThreadFreshnessSummary={topThreadFreshnessSummary()}
        topBlocker={topBlocker()}
        queueCompanionState={queueCompanionState()}
        containerRef={(el) => { briefingRef = el; }}
        queueHasVisibleWork={decisionOsQueueHasVisibleWork(queueState())}
        completedPct={completedPct()}
        onOpenQueuePriority={focusQueuePriority}
        onOpenTopBlocker={() => {
          const plan = decisionOsTopBlockerPlan({
            decisions: visibleDecisions(),
            blockerId: topBlocker()?.id,
          });
          if (plan.kind === "focus-decision") {
            setSelectedId(plan.selectedId);
            setFocusedIndex(plan.focusedIndex);
          }
        }}
        liveMinutes={totalQueueMinutes()}
        queueLoadTrend={queueLoadTrend()}
      />

      <SharedOperationalPressureRow
        queueState={queueState()}
        queueCompanionState={queueCompanionState()}
        messages={dashboardBootstrapMessages(operationalBootstrap())}
        costStatus={costStatus()}
        costSnapshot={costSnapshot()}
        onOpenQueuePriority={focusQueuePriority}
      />

      <OperationalLanesSurface
        bootstrap={operationalBootstrap()}
        queueState={queueState()}
        queueCompanionState={queueCompanionState()}
      />

      <StateFieldStrip summary={continuityStateFieldSummary()} compact />

      {/* Cognitive bento snapshot row */}
      <SharedCognitiveBentoRow
        completedToday={completedToday()}
        timeSavedMinutes={timeSavedMinutes()}
        visibleCount={visibleDecisions().length}
        totalMinutes={totalQueueMinutes()}
        positiveOutcomeRate={null}
      />

      {/* Duration view tabs */}
      <SharedDurationTabs
        active={durationView()}
        onChange={(v) => {
          const plan = decisionOsDurationTabPlan(v);
          setDurationView(plan.durationView);
          setFocusedIndex(plan.focusedIndex);
        }}
        counts={durationCounts()}
        previews={durationPreviews()}
      />

      {/* Queue overload warning */}
      <SharedQueueOverloadBanner
        totalMinutes={totalQueueMinutes()}
        count={visibleDecisions().length}
        onFilterMood={() => selectMood(decisionOsQueueOverloadMoodPlan().mood)}
        onDismissLow={dismissLowImpact}
        onAutoTriage={() => dispatchActionChipEvent(decisionOsAutoTriageActionChip())}
      />

      {/* Mood selector */}
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="mr-1 font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface-variant/50">{decisionOsMoodPromptLabel()}</span>
        <For each={decisionOsMoodOptions()}>
          {(m) => (
            <button
              type="button"
              class={`rounded-full border px-3 py-1.5 text-sm transition ${mood() === m.id ? "border-primary/40 bg-primary/[0.07] ring-2 ring-primary/20" : "border-black/10 bg-white/50 hover:bg-white/70"}`}
              title={m.label}
              onClick={() => selectMood(m.id)}
              aria-pressed={mood() === m.id}
            >
              <span class="text-base leading-none">{m.emoji}</span>
              <span class="ml-1.5 text-[11px] font-medium text-on-surface-variant">{m.label}</span>
            </button>
          )}
        </For>
        <Show when={moodPinnedByUser() && inferredMood()}>
          <button
            type="button"
            class="rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1.5 text-[11px] font-medium text-emerald-800 transition hover:bg-emerald-100/80"
            onClick={() => {
              const selection = decisionOsAutoMoodSelection(inferredMood()?.mood);
              if (selection) selectMood(selection.mood, selection.source);
            }}
          >
            {decisionOsAutoMoodActionLabel(inferredMood()?.mood, decisionOsMoodOptions())}
          </button>
        </Show>
        <Show when={autoQuickWinsActive()}>
          <span class="ml-auto rounded-full border border-amber-200/60 bg-amber-50/60 px-2.5 py-1 text-[10px] text-amber-700">
            {decisionOsAutoQuickWinsActiveLabel(visibleDecisions().length)}
          </span>
        </Show>
        <Show when={!autoQuickWinsActive() && (mood() === "tired" || mood() === "stressed")}>
          <span class="ml-auto rounded-full border border-amber-200/60 bg-amber-50/60 px-2.5 py-1 text-[10px] text-amber-700">
            {decisionOsQuickWinsOnlyLabel(visibleDecisions().length)}
          </span>
        </Show>
        <Show when={mood() !== "tired" && mood() !== "stressed"}>
          <span class="ml-auto text-[11px] text-on-surface-variant/50">
            {decisionOsVisibleDecisionCountLabel(visibleDecisions().length)}
          </span>
        </Show>
        <Show when={inferredMood()?.reason}>
          <span class="text-[11px] text-on-surface-variant/70">
            {decisionOsAutoMoodReasonLabel({
              pinnedByUser: moodPinnedByUser(),
              inferred: inferredMood(),
            })}
          </span>
        </Show>
      </div>

      <ResponseQueueSurface
        queueCompanionState={queueCompanionState()}
        focusTick={responseQueueFocusTick()}
      />

      <PreparedDraftSurface
        queueCompanionState={queueCompanionState()}
        compact
        actionLabel={preparedDraftActionLabel(queueCompanionState().preparedDraftItems)}
        onAction={() => {
          const view = preparedDraftDestinationForItems(queueCompanionState().preparedDraftItems);
          if (view) navigateToView(view);
        }}
      />

      <ContextPackSurface
        queueCompanionState={queueCompanionState()}
        compact
        actionLabel={decisionOsContextWorkspaceActionLabel()}
        onAction={() => navigateToView("home")}
      />

      {/* Decision queue + context panel */}
      <QueueWorkspaceLayout
        list={
          <>
            <For each={visibleDecisions()}>
            {(d, i) => (
              <DecisionCard
                decision={d}
                isSelected={selectedId() === d.id}
                isFocused={focusedIndex() === i()}
                snoozeOptions={snoozeOptions()}
                preferredSnoozeId={preferredSnoozeId()}
                snoozeCount={snoozeCounts().get(d.id)}
                pendingOutcomeCheck={pendingOutcomeChecks().find((entry) => entry.id === d.id) ?? null}
                onSelect={() => {
                  setSelectedId(cur => cur === d.id ? null : d.id);
                  setFocusedIndex(i());
                }}
                onAction={(action, snoozeId, optId, extras) => handleAction(d.id, action, snoozeId, optId, extras)}
                onUpdateOutcomeCheck={(decisionId, checkAt) => {
                  setPendingOutcomeChecks(rescheduleDecisionPendingOutcomeCheck(decisionId, checkAt, sessionUserId));
                  updateDecisionOsDiaryEntryOutcomeCheck(decisionId, checkAt, sessionUserId);
                }}
                onGoalBreakdown={() => setGoalModalDecision(d)}
                onFilterEffort={() => selectMood("tired")}
                onEnterFocusMode={() => setFocusModeDecisionId(d.id)}
              />
            )}
          </For>
          <Show when={visibleDecisions().length === 0}>
            <div class="flex flex-col items-center justify-center rounded-2xl border border-white/50 bg-white/40 py-16 text-center backdrop-blur-sm">
              <span class="mb-3 text-4xl">OK</span>
              <p class="text-sm font-semibold text-on-surface">{decisionOsEmptyQueueTitle()}</p>
              <Show when={streakCount() >= 2}>
                <span class="mt-1.5 rounded-full border border-orange-200/60 bg-orange-50/80 px-3 py-1 text-[11px] font-semibold text-orange-700">
                  {decisionOsClearStreakLabel(streakCount())}
                </span>
              </Show>
              <p class="mt-1 text-xs text-on-surface-variant/60">
                {decisionOsEmptyQueueSummary(durationView())}
              </p>
              <Show when={durationView() !== "day"}>
                <button
                  type="button"
                  class="mt-3 rounded-full border border-black/10 bg-white/60 px-4 py-1.5 text-[11px] text-on-surface-variant hover:bg-white/90 transition"
                  onClick={() => setDurationView("day")}
                >
                  {decisionOsEmptyQueueDayReturnLabel()}
                </button>
              </Show>
              {/* What's next ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â forward-momentum actions when day queue is clear */}
              <Show when={durationView() === "day"}>
                <div class="mt-4 flex flex-wrap justify-center gap-2" role="group" aria-label={decisionOsEmptyQueueNextStepsLabel()}>
                  <button
                    type="button"
                    class="rounded-full border border-black/10 bg-white/60 px-3 py-1.5 text-[11px] text-on-surface-variant transition hover:bg-white/90"
                    onClick={() => setDurationView("week")}
                  >
                    {decisionOsEmptyQueueReviewWeekLabel()}
                  </button>
                  <Show when={queueCompanionState().responseItems.length > 0}>
                    <button
                      type="button"
                      class="rounded-full border border-sky-200/60 bg-sky-50/60 px-3 py-1.5 text-[11px] text-sky-700 transition hover:bg-sky-100/80"
                      onClick={() => setResponseQueueFocusTick(t => t + 1)}
                    >
                      {decisionOsEmptyQueueOpenResponseQueueLabel()}
                    </button>
                  </Show>
                </div>
              </Show>
            </div>
          </Show>
          </>
        }
        desktopPanel={
          <ContextPanel
            decision={contextDecision()}
            onClose={() => { setSelectedId(null); setPinnedContextId(null); }}
            isPinned={Boolean(pinnedContextId())}
            onTogglePin={() => setPinnedContextId(p => p ? null : (selectedDecision()?.id ?? null))}
          />
        }
        mobileOpen={Boolean(contextDecision())}
        mobilePanel={
          <ContextPanel
            decision={contextDecision()}
            onClose={() => { setSelectedId(null); setPinnedContextId(null); }}
            isPinned={Boolean(pinnedContextId())}
            onTogglePin={() => setPinnedContextId(p => p ? null : (selectedDecision()?.id ?? null))}
          />
        }
      />

      {/* Progress footer */}
      <ProgressFooter
        total={briefing().totalDecisions}
        completedToday={completedToday()}
        timeSavedMinutes={timeSavedMinutes()}
        onDismissLowImpact={dismissLowImpact}
        onScheduleReview={scheduleReview}
      />

      {/* Goal breakdown modal */}
      <Show when={goalModalDecision()}>
        {(d) => (
          <GoalBreakdownModal
            decision={d()}
            onClose={() => setGoalModalDecision(null)}
            onScheduled={handleGoalScheduled}
          />
        )}
      </Show>

      <Show when={focusModeDecision()}>
        {(decision) => (
          <DecisionFocusOverlay
            decision={decision()}
            pendingOutcomeCheck={pendingOutcomeChecks().find((entry) => entry.id === decision().id) ?? null}
            onClose={() => setFocusModeDecisionId(null)}
          />
        )}
      </Show>

      {/* Keyboard shortcuts overlay */}
      <Show when={showShortcuts()}>
        <ShortcutsHelp onClose={() => setShowShortcuts(false)} />
      </Show>

      {/* Dismiss toast */}
      <Show when={toast()}>
        {(t) => (
          <Toast
            message={t().message}
            onUndo={t().onUndo}
            actionLabel={t().actionLabel}
            onDismiss={() => toastController.dismiss()}
          />
        )}
      </Show>
    </div>
  );
}










