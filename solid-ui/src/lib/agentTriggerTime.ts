// @locs-version: 1.0
type AgentTriggerRunLike = {
  status: string;
  ran_at?: string;
  created_at?: string;
};

const UTC_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const UTC_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function relativeAgentTriggerTime(iso: string, nowMs: number = Date.now()): string {
  const diff = nowMs - new Date(iso).getTime();
  if (Number.isNaN(diff)) return iso;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function lastSuccessfulAgentTriggerRunLabel(
  runs?: AgentTriggerRunLike[],
  nowMs: number = Date.now(),
): string {
  if (!runs?.length) return "";
  const last = [...runs].reverse().find((run) => run.status === "success");
  if (!last) return "Never succeeded";
  const iso = last.ran_at ?? last.created_at ?? "";
  if (!iso) return "";
  const diff = nowMs - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.floor(hrs / 24)} d ago`;
}

export function timeUntilAgentTriggerRun(iso: string, nowMs: number = Date.now()): string {
  const ms = new Date(iso).getTime() - nowMs;
  if (ms <= 0) return "running now";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `in ${mins} m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `in ${hrs} h ${rem} m` : `in ${hrs} h`;
}

export function formatAgentTriggerUtc(date: Date): string {
  const h = String(date.getUTCHours()).padStart(2, "0");
  const m = String(date.getUTCMinutes()).padStart(2, "0");
  return `${UTC_DAYS[date.getUTCDay()]} ${UTC_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()} ${h}:${m} UTC`;
}
