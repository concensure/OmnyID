// @locs-version: 1.0
type DecisionOsApproveTimer = ReturnType<typeof setTimeout>;

export function createDecisionOsApproveFlowController(args: {
  getNote: () => string;
  setNote: (value: string) => void;
  setPending: (value: boolean) => void;
  onApprove: (note?: string) => void;
  onGoalBreakdown: () => void;
  needsGoalBreakdown: () => boolean;
  setTimer?: (callback: () => void, ms: number) => DecisionOsApproveTimer;
  clearTimer?: (timer: DecisionOsApproveTimer) => void;
}) {
  const setTimer = args.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = args.clearTimer ?? clearTimeout;
  let timer: DecisionOsApproveTimer | null = null;

  const clearActiveTimer = () => {
    if (!timer) return;
    clearTimer(timer);
    timer = null;
  };

  const confirm = () => {
    clearActiveTimer();
    args.setPending(false);
    const note = args.getNote().trim();
    args.setNote("");
    if (args.needsGoalBreakdown()) {
      args.onGoalBreakdown();
      return;
    }
    args.onApprove(note || undefined);
  };

  const restart = () => {
    clearActiveTimer();
    timer = setTimer(() => confirm(), 2000);
  };

  const start = () => {
    if (args.needsGoalBreakdown()) {
      args.onGoalBreakdown();
      return;
    }
    args.setPending(true);
    restart();
  };

  const cancel = () => {
    clearActiveTimer();
    args.setPending(false);
    args.setNote("");
  };

  const updateNote = (value: string) => {
    args.setNote(value);
    restart();
  };

  return {
    start,
    cancel,
    confirm,
    restart,
    updateNote,
    dispose: clearActiveTimer,
  };
}
