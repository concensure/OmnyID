// @locs-version: 1.0
export type DecisionOsToastState = {
  key: number;
  message: string;
  onUndo: (() => void) | null;
  actionLabel?: string | null;
  onTimeout?: (() => void) | null;
};

export type DecisionOsToastOptions = {
  actionLabel?: string | null;
  onTimeout?: (() => void) | null;
  durationMs?: number;
};

type DecisionOsToastTimer = ReturnType<typeof setTimeout>;

export function createDecisionOsToastController(args: {
  getToast: () => DecisionOsToastState | null;
  setToast: (toast: DecisionOsToastState | null) => void;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => DecisionOsToastTimer;
  clearTimer?: (timer: DecisionOsToastTimer) => void;
}) {
  const now = args.now ?? Date.now;
  const setTimer = args.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = args.clearTimer ?? clearTimeout;
  let timer: DecisionOsToastTimer | null = null;

  const clearActiveTimer = () => {
    if (!timer) return;
    clearTimer(timer);
    timer = null;
  };

  const dismiss = () => {
    clearActiveTimer();
    args.setToast(null);
  };

  const show = (
    message: string,
    onUndo: (() => void) | null,
    options?: DecisionOsToastOptions,
  ) => {
    clearActiveTimer();
    args.setToast({
      key: now(),
      message,
      onUndo,
      actionLabel: options?.actionLabel ?? null,
      onTimeout: options?.onTimeout ?? null,
    });
    timer = setTimer(() => {
      const current = args.getToast();
      current?.onTimeout?.();
      args.setToast(null);
      timer = null;
    }, options?.durationMs ?? 4000);
  };

  return {
    show,
    dismiss,
    dispose: clearActiveTimer,
  };
}
