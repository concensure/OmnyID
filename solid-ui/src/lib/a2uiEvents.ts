// @locs-version: 1.0
import {
  customEventRecordDetail,
  optionalNullableStringProperty,
  optionalStringProperty,
} from "@/lib/eventDetail";

export const A2UI_COPY_FALLBACK_EVENT = "omnyid:a2ui-copy-fallback";
export const A2UI_CARD_REQUEST_EVENT = "omnyid:a2ui-card-request";
export const A2UI_CARD_STATS_REQUEST_EVENT = "omnyid:a2ui-card-stats-request";
export const A2UI_SHARE_EVENT = "omnyid:a2ui-share";
export const SOCIAL_COMPOSE_ACTION_EVENT = "omnyid:social-compose-action";
export const SPACE_FEED_COMPOSE_EVENT = "omnyid:space-feed-compose";

export type A2uiCopyFallbackEventDetail = {
  text: string;
};

export type A2uiCardRequestEventDetail = {
  type: string | null;
  prompt: string;
  attachedFileName?: string;
};

export type A2uiCardStatsContext = {
  invitationCount: number;
  rsvpReceivedCount: number;
};

export type A2uiCardStatsRequestEventDetail = {
  respond: (context: A2uiCardStatsContext) => void;
};

export type A2uiShareEventDetail = Record<string, unknown>;

export type SocialComposeActionEventDetail = {
  action: string;
  platform: string;
  draft_text: string;
  title: string;
};

export type SpaceFeedComposeEventDetail = {
  space_id: string;
  space_name: string;
};

export function dispatchA2uiCopyFallbackEvent(
  detail: A2uiCopyFallbackEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(A2UI_COPY_FALLBACK_EVENT, { detail }));
}

export function readA2uiCopyFallbackEventDetail(
  event: Event,
): A2uiCopyFallbackEventDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail) return null;
  return typeof detail.text === "string"
    ? { text: detail.text }
    : null;
}

export function dispatchA2uiCardRequestEvent(
  detail: A2uiCardRequestEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(A2UI_CARD_REQUEST_EVENT, { detail }));
}

/** Requests aggregate-only wedding stats from an open Wedding workspace. */
export function requestA2uiCardStatsContext(target: Window = window): A2uiCardStatsContext | null {
  let context: A2uiCardStatsContext | null = null;
  target.dispatchEvent(new CustomEvent(A2UI_CARD_STATS_REQUEST_EVENT, {
    detail: { respond: (value: A2uiCardStatsContext) => { context = value; } },
  }));
  return context;
}

export function readA2uiCardRequestEventDetail(
  event: Event,
): A2uiCardRequestEventDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail) return null;
  const type = optionalNullableStringProperty(detail, "type");
  const attachedFileName = optionalStringProperty(detail, "attachedFileName");
  return (
    type !== false
    && typeof detail.prompt === "string"
    && attachedFileName !== null
  )
    ? {
        type: type ?? null,
        prompt: detail.prompt,
        ...(typeof attachedFileName !== "undefined"
          ? { attachedFileName }
          : {}),
      }
    : null;
}

export function dispatchA2uiShareEvent(
  detail: A2uiShareEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(A2UI_SHARE_EVENT, { detail }));
}

export function readA2uiShareEventDetail(
  event: Event,
): A2uiShareEventDetail | null {
  return customEventRecordDetail(event);
}

export function dispatchSocialComposeActionEvent(
  detail: SocialComposeActionEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(SOCIAL_COMPOSE_ACTION_EVENT, { detail }));
}

export function readSocialComposeActionEventDetail(
  event: Event,
): SocialComposeActionEventDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail) return null;
  return (
    typeof detail.action === "string"
    && typeof detail.platform === "string"
    && typeof detail.draft_text === "string"
    && typeof detail.title === "string"
  )
    ? {
        action: detail.action,
        platform: detail.platform,
        draft_text: detail.draft_text,
        title: detail.title,
      }
    : null;
}

export function dispatchSpaceFeedComposeEvent(
  detail: SpaceFeedComposeEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(SPACE_FEED_COMPOSE_EVENT, { detail }));
}

export function readSpaceFeedComposeEventDetail(
  event: Event,
): SpaceFeedComposeEventDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail) return null;
  return typeof detail.space_id === "string" && typeof detail.space_name === "string"
    ? {
        space_id: detail.space_id,
        space_name: detail.space_name,
      }
    : null;
}
