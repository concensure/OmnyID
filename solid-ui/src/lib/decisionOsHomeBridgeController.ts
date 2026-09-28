// @locs-version: 1.0
import {
  subscribeDecisionOsUpdateEvent,
  type DecisionOsNormalizedUpdateDetail,
} from "@/lib/decisionosContinuity";
import {
  subscribeMagicActionEvent,
  type MagicActionEventDetail,
} from "@/lib/magicActionEvent";
import {
  subscribeDecisionOsFocusEvent,
  type DecisionOsFocusEventDetail,
} from "@/lib/decisionosNavigation";

export type DecisionOsHomeBridgeController = {
  dispose: () => void;
};

type DecisionOsWindowEventTarget = {
  addEventListener(type: string, listener: (event: Event) => void): void;
  addEventListener(type: "keydown", listener: (event: KeyboardEvent) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: "keydown", listener: (event: KeyboardEvent) => void): void;
};

type DecisionOsDocumentEventTarget = {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
};

export function createDecisionOsHomeBridgeController(args: {
  windowTarget: DecisionOsWindowEventTarget;
  documentTarget: DecisionOsDocumentEventTarget;
  onUpdateDetail: (detail: DecisionOsNormalizedUpdateDetail) => void;
  onFocusDetail: (detail: DecisionOsFocusEventDetail) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onMagicDetail: (detail: MagicActionEventDetail) => void;
  onTick: () => void;
  onDispose?: () => void;
  tickMs?: number;
  setIntervalFn?: (callback: () => void, delayMs: number) => unknown;
  clearIntervalFn?: (id: unknown) => void;
}): DecisionOsHomeBridgeController {
  const setIntervalFn =
    args.setIntervalFn ?? ((callback: () => void, delayMs: number) => setInterval(callback, delayMs));
  const clearIntervalFn = args.clearIntervalFn ?? ((id: unknown) => clearInterval(id as number));
  const tickId = setIntervalFn(args.onTick, args.tickMs ?? 60_000);

  const unsubscribeDecisionOsUpdateEvent = subscribeDecisionOsUpdateEvent(
    (detail) => args.onUpdateDetail(detail),
    args.windowTarget as Window,
  );
  const unsubscribeDecisionOsFocusEvent = subscribeDecisionOsFocusEvent(
    (detail) => args.onFocusDetail(detail),
    args.windowTarget as Window,
  );
  args.windowTarget.addEventListener("keydown", args.onKeyDown);
  const unsubscribeMagicActionEvent = subscribeMagicActionEvent(
    (detail) => args.onMagicDetail(detail),
    args.documentTarget as Document,
  );

  return {
    dispose() {
      unsubscribeDecisionOsUpdateEvent();
      unsubscribeDecisionOsFocusEvent();
      args.windowTarget.removeEventListener("keydown", args.onKeyDown);
      unsubscribeMagicActionEvent();
      clearIntervalFn(tickId);
      args.onDispose?.();
    },
  };
}
