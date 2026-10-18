import { apiFetch } from "@/lib/api";
import type { DecisionCardModel } from "@/lib/decisionCardState";

const MILESTONE_LABELS: Record<string, string> = {
  guest_count_draft: "Draft the guest count",
  accommodation_blocks: "Confirm accommodation blocks",
  stationery_details: "Confirm invitation details",
  invitations_ready: "Get invitations ready",
  invitations_sent: "Send invitations",
  guest_count_final: "Confirm final guest count",
  vendor_final_counts: "Send final counts to vendors",
  event_ready: "Finish event-ready checks",
};

type MilestoneUrgency = "critical" | "near_critical";
type MilestoneActionKind = "research" | "compare";

export type PlanningMilestoneProjection = {
  projectionId: string;
  planId: string;
  templateVersion: "wedding.milestones.v1";
  selected: {
    milestoneId: string;
    milestoneKey: string;
    label: string;
    urgency: MilestoneUrgency;
    slackDays: number;
    earliestAt: string;
    latestAt: string;
    dateAuthority: "manual" | "computed_template";
    evidenceRef: string;
    action: { kind: MilestoneActionKind; targetRef: string } | null;
  } | null;
  blockerCount: number;
  completeCount: number;
  waivedCount: number;
};

export type PlanningMilestoneA2ui = {
  schema_version: "a2ui.v1";
  kind: "planning_milestone";
  title: string;
  layout: { type: "stack"; gap: "md" };
  nodes: Array<{
    id: string;
    type: "callout" | "insight_line" | "bullet_list" | "action_chips";
    props: Record<string, unknown>;
  }>;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function identifier(value: unknown): string {
  const candidate = text(value);
  return candidate && candidate.length <= 180 && !/\s|@/.test(candidate) ? candidate : "";
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function timestamp(value: unknown): string {
  const candidate = text(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : "";
}

function milestoneKey(id: string, planId: string): string {
  const prefix = `milestone:${planId}:`;
  if (!id.startsWith(prefix)) return "";
  const key = id.slice(prefix.length);
  return MILESTONE_LABELS[key] ? key : "";
}

function action(value: unknown): { kind: MilestoneActionKind; targetRef: string } | null {
  if (value == null) return null;
  const row = record(value);
  const kind = text(row?.["kind"]);
  const targetRef = identifier(row?.["target_ref"]);
  return (kind === "research" || kind === "compare") && targetRef
    ? { kind, targetRef }
    : null;
}

export function planningMilestoneUiEnabled(
  env: Record<string, unknown> = import.meta.env,
): boolean {
  return ["1", "true", "yes", "on"].includes(
    text(env["VITE_PLANNING_CRITICAL_PATH_ENABLED"]).toLowerCase(),
  );
}

export function planningMilestoneProjectRequest(planId: string) {
  return {
    path: "/planning/milestones/project",
    body: { plan_id: planId },
  };
}

export function normalizePlanningMilestoneProjection(
  value: unknown,
): PlanningMilestoneProjection | null {
  const root = record(value);
  const projectionId = identifier(root?.["projection_id"]);
  const planId = identifier(root?.["plan_id"]);
  const templateVersion = text(root?.["template_version"]);
  const rawMilestones = Array.isArray(root?.["milestones"])
    ? root.milestones.slice(0, 100)
    : null;
  const rawBlockers = Array.isArray(root?.["blockers"])
    ? root.blockers.slice(0, 100)
    : null;
  if (!projectionId || !planId || templateVersion !== "wedding.milestones.v1"
    || !rawMilestones || !rawBlockers) return null;

  let completeCount = 0;
  let waivedCount = 0;
  const milestones = new Map<string, {
    key: string;
    state: string;
    earliestAt: string;
    latestAt: string;
    slackDays: number | null;
    dateAuthority: string;
    dateSourceRef: string;
    preparedAction: { kind: MilestoneActionKind; targetRef: string } | null;
  }>();
  for (const value of rawMilestones) {
    const row = record(value);
    const dependency = record(row?.["dependency"]);
    const provenance = record(row?.["date_provenance"]);
    const id = identifier(dependency?.["milestone_id"]);
    const key = milestoneKey(id, planId);
    const state = text(dependency?.["state"]);
    const earliestAt = dependency?.["earliest_at"] == null
      ? ""
      : timestamp(dependency?.["earliest_at"]);
    const latestAt = dependency?.["latest_at"] == null
      ? ""
      : timestamp(dependency?.["latest_at"]);
    const slackDays = dependency?.["slack_days"] == null
      ? null
      : integer(dependency?.["slack_days"]);
    const dateAuthority = provenance == null ? "" : text(provenance["authority"]);
    const dateSourceRef = provenance == null ? "" : identifier(provenance["source_ref"]);
    const preparedAction = action(dependency?.["prepared_next_action"]);
    if (!id || !key || !["not_started", "active", "blocked", "complete", "waived"].includes(state)
      || (dependency?.["earliest_at"] != null && !earliestAt)
      || (dependency?.["latest_at"] != null && !latestAt)
      || (dependency?.["slack_days"] != null && slackDays === null)
      || (provenance != null && (!dateSourceRef
        || !["manual", "computed_template"].includes(dateAuthority)))
      || (dependency?.["prepared_next_action"] != null && !preparedAction)
      || milestones.has(id)) return null;
    if (state === "complete") completeCount += 1;
    if (state === "waived") waivedCount += 1;
    milestones.set(id, {
      key,
      state,
      earliestAt,
      latestAt,
      slackDays,
      dateAuthority,
      dateSourceRef,
      preparedAction,
    });
  }

  for (const value of rawBlockers) {
    const row = record(value);
    if (!identifier(row?.["blocker_ref"]) || !milestones.has(identifier(row?.["milestone_id"]))
      || !["horizon_missing", "cycle", "predecessor_missing", "predecessor_blocked",
        "source_state_unresolved", "evidence_conflict"].includes(text(row?.["kind"]))) return null;
  }

  const selectedRow = root?.["selected_path_item"] == null
    ? null
    : record(root?.["selected_path_item"]);
  let selected: PlanningMilestoneProjection["selected"] = null;
  if (selectedRow) {
    const id = identifier(selectedRow["milestone_id"]);
    const urgency = text(selectedRow["urgency"]);
    const slackDays = integer(selectedRow["slack_days"]);
    const milestone = milestones.get(id);
    const selectedAction = action(selectedRow["prepared_next_action"]);
    if (!milestone || !["critical", "near_critical"].includes(urgency)
      || slackDays === null || !milestone.earliestAt || !milestone.latestAt
      || !milestone.dateSourceRef || milestone.slackDays !== slackDays
      || (urgency === "critical" && slackDays > 0)
      || (urgency === "near_critical" && (slackDays <= 0 || slackDays > 14))
      || JSON.stringify(selectedAction) !== JSON.stringify(milestone.preparedAction)) return null;
    selected = {
      milestoneId: id,
      milestoneKey: milestone.key,
      label: MILESTONE_LABELS[milestone.key]!,
      urgency: urgency as MilestoneUrgency,
      slackDays,
      earliestAt: milestone.earliestAt,
      latestAt: milestone.latestAt,
      dateAuthority: milestone.dateAuthority as "manual" | "computed_template",
      evidenceRef: milestone.dateSourceRef,
      action: selectedAction,
    };
  }
  return {
    projectionId,
    planId,
    templateVersion,
    selected,
    blockerCount: rawBlockers.length,
    completeCount,
    waivedCount,
  };
}

function dateLabel(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(value));
  } catch {
    return "the current target date";
  }
}

function actionCopy(value: NonNullable<PlanningMilestoneProjection["selected"]>) {
  if (value.action?.kind === "research") {
    return {
      id: "open_milestone_research",
      label: "Research options",
      effect: "Opens the existing search flow; nothing is contacted or booked",
      intent: "open_vendor_search",
    };
  }
  if (value.action?.kind === "compare") {
    return {
      id: "open_milestone_comparison",
      label: "Compare options",
      effect: "Opens the existing comparison flow; nothing is contacted or booked",
      intent: "open_vendor_comparison",
    };
  }
  return {
    id: "review_wedding_timeline",
    label: "Review timeline",
    effect: "Opens your saved wedding timeline without changing any dates",
    intent: "review_wedding_timeline",
  };
}

export function planningMilestoneDecisionCard(
  value: PlanningMilestoneProjection,
): DecisionCardModel | null {
  const selected = value.selected;
  if (!selected) return null;
  const primary = actionCopy(selected);
  const critical = selected.urgency === "critical";
  const timing = critical
    ? selected.slackDays < 0
      ? `${Math.abs(selected.slackDays)} day${selected.slackDays === -1 ? "" : "s"} behind the safe window`
      : "No timing buffer remains"
    : `${selected.slackDays} day${selected.slackDays === 1 ? "" : "s"} of timing buffer remains`;
  const sourceLabel = selected.dateAuthority === "manual"
    ? "Your saved date"
    : "Wedding timeline suggestion";
  return {
    schema: "content.decision_card",
    pattern: "review",
    patternVersion: "1.0",
    id: value.projectionId,
    title: critical ? `${selected.label} needs attention` : `${selected.label} is coming up`,
    domain: "wedding",
    pressure: critical ? "high" : "medium",
    whyItMatters: `${timing}. The current latest safe date is ${dateLabel(selected.latestAt)}.`,
    recommendation: {
      summary: primary.label,
      reasons: [`${sourceLabel} and the saved dependency order place this next.`],
    },
    actions: [{ ...primary, role: "primary" }],
    evidence: [{
      label: `${sourceLabel}: ${dateLabel(selected.latestAt)}`,
      ref: selected.evidenceRef,
      sourceKind: selected.dateAuthority === "manual" ? "saved_date" : "wedding_timeline",
      freshness: "current",
    }],
    confidence: {
      label: "Calculated from saved dates and prerequisites",
      reason: "Completed and waived milestones are left in history and removed from the active path.",
    },
    timeSensitivity: { label: timing, at: selected.latestAt },
    visual: { kind: "none" },
    unknowns: value.blockerCount > 0
      ? [`${value.blockerCount} timeline item${value.blockerCount === 1 ? " still needs" : "s still need"} a date or status check.`]
      : [],
    patternSlots: { reviewItems: [selected.label] },
    verification: { status: "partial", label: "Saved wedding timeline checked" },
  };
}

export function planningMilestoneA2ui(
  value: PlanningMilestoneProjection,
): PlanningMilestoneA2ui | null {
  const card = planningMilestoneDecisionCard(value);
  if (!card || !value.selected) return null;
  return {
    schema_version: "a2ui.v1",
    kind: "planning_milestone",
    title: card.title,
    layout: { type: "stack", gap: "md" },
    nodes: [
      {
        id: "milestone-status",
        type: "callout",
        props: {
          tone: value.selected.urgency === "critical" ? "warning" : "info",
          title: card.title,
          body: card.whyItMatters,
        },
      },
      {
        id: "milestone-date",
        type: "insight_line",
        props: { text: card.evidence[0]?.label, evidence_required: true },
      },
      {
        id: "milestone-unknowns",
        type: "bullet_list",
        props: { title: "Still to check", items: card.unknowns },
      },
      {
        id: "milestone-actions",
        type: "action_chips",
        props: {
          actions: Object.fromEntries(card.actions.map((item) => [item.id, {
            id: item.id,
            label: item.label,
            kind: item.intent,
            milestone_ref: value.selected?.milestoneId,
            prepared_only: true,
          }])),
        },
      },
    ],
  };
}

export async function preparePlanningMilestones(
  planId: string,
): Promise<PlanningMilestoneProjection> {
  const request = planningMilestoneProjectRequest(planId);
  const projection = normalizePlanningMilestoneProjection(await apiFetch<unknown>(request.path, {
    method: "POST",
    bodyJson: request.body,
  }));
  if (!projection) throw new Error("invalid milestone projection response");
  return projection;
}

export function planningMilestoneUserMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/401|unauthori|sign in/.test(message)) return "Sign in again to check your wedding timeline.";
  if (/404|not available|not found/.test(message)) return "Timeline guidance is not available yet.";
  if (/409|changed|conflict/.test(message)) return "Your timeline changed. Refresh to check the latest dates.";
  return "We could not check your timeline just now. Try again in a moment.";
}
