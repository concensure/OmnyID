// @locs-version: 1.0
import type { EdgeExecutionState } from "@/lib/workflowGraphTypes";
import type { LiveRunStreamEvent } from "@/lib/workflowReviewTypes";

export function formatDurationMs(value: unknown): string | null {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) return null;
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

export function liveRunEventStatus(event: LiveRunStreamEvent): string | null {
  if (typeof event.status === "string" && event.status.trim()) return event.status.trim();
  switch (event.event) {
    case "node_started":
      return "active";
    case "node_failed":
      return "failed";
    case "policy_block":
      return "blocked";
    case "wait_for_approval":
      return "waiting_for_approval";
    case "node_skipped":
      return "skipped";
    case "node_completed":
      return "completed";
    default:
      return null;
  }
}

export function liveEdgeStateForNodeStatus(status: string | null): EdgeExecutionState | null {
  switch (status) {
    case "failed":
      return "failed";
    case "blocked":
      return "blocked";
    case "waiting_for_approval":
      return "waiting_for_approval";
    case "waiting_for_resume":
      return "waiting_for_resume";
    case "queued":
    case "active":
      return "queued";
    case "simulated":
      return "simulated";
    case "skipped":
      return "skipped";
    case "completed":
      return "completed";
    default:
      return null;
  }
}

export function liveRunAccentClass(status: string | undefined, connected: boolean): string {
  if (!connected || !status) return "";
  switch (status) {
    case "active":
      return "ring-2 ring-sky-300/70 ring-offset-2 ring-offset-transparent shadow-[0_0_0_4px_rgba(125,211,252,0.18)] node-live-pulse";
    case "waiting_for_approval":
      return "ring-2 ring-amber-300/70 ring-offset-2 ring-offset-transparent";
    case "waiting_for_resume":
      return "ring-2 ring-cyan-300/70 ring-offset-2 ring-offset-transparent";
    case "failed":
      return "ring-2 ring-rose-300/70 ring-offset-2 ring-offset-transparent";
    case "blocked":
      return "ring-2 ring-orange-300/70 ring-offset-2 ring-offset-transparent";
    case "completed":
      return "ring-2 ring-emerald-300/50 ring-offset-2 ring-offset-transparent";
    default:
      return "";
  }
}
