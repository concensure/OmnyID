// @locs-version: 1.0
import {
  A2UI_CARD_REQUEST_EVENT,
  A2UI_COPY_FALLBACK_EVENT,
  A2UI_SHARE_EVENT,
  SOCIAL_COMPOSE_ACTION_EVENT,
  SPACE_FEED_COMPOSE_EVENT,
} from "@/lib/a2uiEvents";
import type {
  A2uiCardRequestEventDetail,
  A2uiCopyFallbackEventDetail,
  A2uiShareEventDetail,
  SocialComposeActionEventDetail,
  SpaceFeedComposeEventDetail,
} from "@/lib/a2uiEvents";
import { ACTION_CHIP_EVENT, type ActionChipEventDetail } from "@/lib/actionChipEvent";
import { AFP_INSPECT_EVENT, type AfpInspectEventDetail } from "@/lib/afpInspectEvent";
import { COMPOSE_QUERY_FRAGMENT_EVENT, type ComposeQueryFragmentEventDetail } from "@/lib/composeQueryFragmentEvent";
import { DASHBOARD_REFRESH_EVENT, type DashboardRefreshEventDetail } from "@/lib/dashboardRefreshEvent";
import { DEV_VIEWPORT_EVENT, type DevViewportEventDetail } from "@/lib/devViewportEvent";
import { DIARY_ENTRY_EVENT, type DiaryEntryEventDetail } from "@/lib/diaryEvent";
import {
  DECISION_OS_UPDATE_EVENT,
  type DecisionOsNormalizedUpdateDetail,
} from "@/lib/decisionosContinuity";
import {
  DECISION_OS_FOCUS_EVENT,
  DECISION_OS_NAVIGATE_EVENT,
} from "@/lib/decisionosNavigation";
import type {
  DecisionOsFocusEventDetail,
  DecisionOsNavigateEventDetail,
} from "@/lib/decisionosNavigation";
import { GOAL_BREAKDOWN_EVENT, type GoalBreakdownEventDetail } from "@/lib/goalBreakdownEvent";
import { GOTO_NODE_EVENT, type GotoNodeEventDetail } from "@/lib/gotoNodeEvent";
import {
  INLINE_ENTITY_PREFERENCE_CHANGED_EVENT,
  type InlineEntityPreferenceChangedEventDetail,
} from "@/lib/inlineEntityPreferenceEvent";
import { OPEN_INLINE_ENTITY_EVENT, type OpenInlineEntityEventDetail } from "@/lib/inlineEntityEvent";
import { MAGIC_ACTION_EVENT, type MagicActionEventDetail } from "@/lib/magicActionEvent";
import {
  NOTE_RESTORE_VERSION_EVENT,
  NOTE_TITLE_UPDATE_EVENT,
} from "@/lib/noteEditorEvents";
import type {
  NoteRestoreVersionEventDetail,
  NoteTitleUpdateEventDetail,
} from "@/lib/noteEditorEvents";
import {
  OUTCOME_CHECK_SCHEDULED_EVENT,
  type OutcomeCheckScheduledEventDetail,
} from "@/lib/outcomeCheckEvent";
import { SESSION_CHANGED_EVENT, type SessionChangedEventDetail } from "@/lib/api";
import {
  EDITOR_DATETIME_PREFERENCE_EVENT,
  type EditorDatetimePreference,
} from "@/lib/editorDatetimePreference";
import {
  EDITOR_SUBMIT_EVENT,
  type EditorSubmitEventDetail,
} from "@/lib/editorSubmitEvent";
import { OPEN_OBJECT_SEARCH_EVENT, type ObjectSearchLaunchDetail } from "@/lib/objectSearchNavigation";
import { OPEN_THREAD_EVENT, type OpenThreadEventDetail } from "@/lib/openThreadEvent";
import {
  PARA_VIEW_PREFERENCE_CHANGED_EVENT,
  type ParaViewPreferenceChangedEventDetail,
} from "@/lib/paraViewPreference";
import { SKILL_DEACTIVATION_EVENT, type SkillDeactivationEventDetail } from "@/lib/skillDeactivationEvent";
import { SW_UPDATE_READY_EVENT, type SwUpdateReadyEventDetail } from "@/lib/swUpdateEvent";
import { OPEN_THREAD_SEARCH_EVENT, type ThreadSearchLaunchDetail } from "@/lib/threadSearchNavigation";
import {
  VIM_NAVIGATION_PREFERENCE_EVENT,
  type VimNavigationPreferenceEventDetail,
} from "@/lib/vimNavigationPreference";

declare global {
  interface DocumentEventMap {
    [GOTO_NODE_EVENT]: CustomEvent<GotoNodeEventDetail>;
    [MAGIC_ACTION_EVENT]: CustomEvent<MagicActionEventDetail>;
  }

  interface WindowEventMap {
    [A2UI_CARD_REQUEST_EVENT]: CustomEvent<A2uiCardRequestEventDetail>;
    [A2UI_COPY_FALLBACK_EVENT]: CustomEvent<A2uiCopyFallbackEventDetail>;
    [A2UI_SHARE_EVENT]: CustomEvent<A2uiShareEventDetail>;
    [ACTION_CHIP_EVENT]: CustomEvent<ActionChipEventDetail>;
    [AFP_INSPECT_EVENT]: CustomEvent<AfpInspectEventDetail>;
    [COMPOSE_QUERY_FRAGMENT_EVENT]: CustomEvent<ComposeQueryFragmentEventDetail>;
    [SKILL_DEACTIVATION_EVENT]: CustomEvent<SkillDeactivationEventDetail>;
    [DASHBOARD_REFRESH_EVENT]: CustomEvent<DashboardRefreshEventDetail>;
    [DEV_VIEWPORT_EVENT]: CustomEvent<DevViewportEventDetail>;
    [DIARY_ENTRY_EVENT]: CustomEvent<DiaryEntryEventDetail>;
    [DECISION_OS_FOCUS_EVENT]: CustomEvent<DecisionOsFocusEventDetail>;
    [DECISION_OS_UPDATE_EVENT]: CustomEvent<DecisionOsNormalizedUpdateDetail>;
    [EDITOR_DATETIME_PREFERENCE_EVENT]: CustomEvent<EditorDatetimePreference>;
    [EDITOR_SUBMIT_EVENT]: CustomEvent<EditorSubmitEventDetail>;
    [GOAL_BREAKDOWN_EVENT]: CustomEvent<GoalBreakdownEventDetail>;
    [INLINE_ENTITY_PREFERENCE_CHANGED_EVENT]: CustomEvent<InlineEntityPreferenceChangedEventDetail>;
    [DECISION_OS_NAVIGATE_EVENT]: CustomEvent<DecisionOsNavigateEventDetail>;
    [NOTE_RESTORE_VERSION_EVENT]: CustomEvent<NoteRestoreVersionEventDetail>;
    [NOTE_TITLE_UPDATE_EVENT]: CustomEvent<NoteTitleUpdateEventDetail>;
    [OPEN_INLINE_ENTITY_EVENT]: CustomEvent<OpenInlineEntityEventDetail>;
    [OPEN_THREAD_EVENT]: CustomEvent<OpenThreadEventDetail>;
    [OPEN_OBJECT_SEARCH_EVENT]: CustomEvent<ObjectSearchLaunchDetail>;
    [OPEN_THREAD_SEARCH_EVENT]: CustomEvent<ThreadSearchLaunchDetail>;
    [OUTCOME_CHECK_SCHEDULED_EVENT]: CustomEvent<OutcomeCheckScheduledEventDetail>;
    [PARA_VIEW_PREFERENCE_CHANGED_EVENT]: CustomEvent<ParaViewPreferenceChangedEventDetail>;
    [SESSION_CHANGED_EVENT]: CustomEvent<SessionChangedEventDetail>;
    [SOCIAL_COMPOSE_ACTION_EVENT]: CustomEvent<SocialComposeActionEventDetail>;
    [SPACE_FEED_COMPOSE_EVENT]: CustomEvent<SpaceFeedComposeEventDetail>;
    [SW_UPDATE_READY_EVENT]: CustomEvent<SwUpdateReadyEventDetail>;
    [VIM_NAVIGATION_PREFERENCE_EVENT]: CustomEvent<VimNavigationPreferenceEventDetail>;
  }
}

export {};
