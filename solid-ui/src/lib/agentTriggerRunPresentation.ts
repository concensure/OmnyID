// @locs-version: 1.0
type AgentTriggerRunStatusLike = {
  status: string;
};

const SUCCESS_COLOR = "#22c55e";
const FAILURE_COLOR = "#ef4444";
const NEUTRAL_COLOR = "#d1d5db";

export function agentTriggerRunSparklineColor(
  run: AgentTriggerRunStatusLike | undefined,
): string {
  if (!run) return NEUTRAL_COLOR;
  if (run.status === "success") return SUCCESS_COLOR;
  if (run.status === "failed" || run.status === "error") return FAILURE_COLOR;
  return NEUTRAL_COLOR;
}

export function agentTriggerRunSparklineWindow<T>(
  runs: T[],
  size: number = 14,
): Array<T | undefined> {
  const display = runs.slice(-size);
  return Array.from({ length: size }, (_, index) => display[index]);
}
