// @locs-version: 1.0
import type {
  AfpMessage,
  PlanAssumption,
  PlanningQueryResponse,
} from "@/lib/api";

export type PlanningSessionState = {
  assumptions: PlanAssumption[];
  constraints: Record<string, string>;
  correlation_id: string | undefined;
  evidence: Record<string, never>;
  goal: string | undefined;
  thread_id: string | undefined;
  unresolved: string[] | undefined;
};

function planningConstraintMap(assumptions: PlanAssumption[]): Record<string, string> {
  return Object.fromEntries(
    assumptions.map((assumption) => [assumption.key, assumption.value]),
  );
}

export function planningThreadId(response: PlanningQueryResponse): string | null {
  return typeof response.thread_id === "string" && response.thread_id.trim().length > 0
    ? response.thread_id
    : null;
}

export function planningSessionState(
  response: PlanningQueryResponse,
): PlanningSessionState {
  return {
    goal: response.goal,
    thread_id: response.thread_id,
    correlation_id: response.correlation_id,
    assumptions: response.assumptions,
    constraints: planningConstraintMap(response.assumptions),
    evidence: {},
    unresolved: response.unresolved,
  };
}

export function planningResultMessage(
  response: PlanningQueryResponse,
  timestamp = new Date().toISOString(),
): AfpMessage {
  const correlationId = response.correlation_id?.trim() || "planning";
  return {
    id: `plan-${correlationId}`,
    thread_id: planningThreadId(response) ?? "",
    from: "planning-assistant",
    to: [],
    timestamp,
    type: "planning",
    subtype: "result",
    kind: "planning_result",
    supertags: [],
    content: {
      summary: response.summary,
      goal: response.goal,
      options: response.options,
      assumptions: response.assumptions,
      comparison_headers: response.comparison_headers ?? [],
      comparison_rows: response.comparison_rows,
      unresolved: response.unresolved,
    },
    metadata: null,
    views: [],
    attachments: [],
    references: [],
    encryption: null,
    signature: "",
  };
}
