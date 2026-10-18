import assert from "node:assert/strict";
import test from "node:test";

import { validateDecisionCard } from "../src/lib/decisionCardState.ts";
import {
  normalizePlanningMilestoneProjection,
  planningMilestoneA2ui,
  planningMilestoneDecisionCard,
  planningMilestoneProjectRequest,
  planningMilestoneUiEnabled,
  planningMilestoneUserMessage,
} from "../src/lib/planningMilestoneApi.ts";
import { weddingTaskItemToAfpTaskMessage } from "../src/lib/weddingCalendarProjectionState.ts";

function payload(slackDays = 0, urgency: "critical" | "near_critical" = "critical") {
  return {
    projection_id: "milestone_projection:one",
    template_version: "wedding.milestones.v1",
    plan_id: "plan:one",
    milestones: [
      {
        dependency: {
          schema_version: "planning.milestone_dependency.v1",
          milestone_id: "milestone:plan:one:guest_count_draft",
          plan_id: "plan:one",
          depends_on: [],
          duration_or_lead_time: {
            minimum_days: 3,
            maximum_days: 7,
            evidence_ref: "template:wedding.milestones.v1:guest_count_draft",
          },
          earliest_at: "2027-04-01T00:00:00Z",
          latest_at: "2027-04-01T00:00:00Z",
          slack_days: slackDays,
          state: "active",
          blocking_refs: [],
          prepared_next_action: {
            kind: "research",
            target_ref: "vendor_search:accommodation",
          },
        },
        date_provenance: {
          authority: "manual",
          source_ref: "calendar:guest-count:v2",
        },
        evidence_refs: ["task:guest-count:v3"],
      },
      {
        dependency: {
          schema_version: "planning.milestone_dependency.v1",
          milestone_id: "milestone:plan:one:stationery_details",
          plan_id: "plan:one",
          depends_on: [],
          duration_or_lead_time: {
            minimum_days: 3,
            maximum_days: 7,
            evidence_ref: "template:wedding.milestones.v1:stationery_details",
          },
          earliest_at: null,
          latest_at: null,
          slack_days: null,
          state: "blocked",
          blocking_refs: ["milestone_blocker:one"],
          prepared_next_action: null,
        },
        date_provenance: null,
        evidence_refs: [],
      },
    ],
    blockers: [{
      blocker_ref: "milestone_blocker:one",
      milestone_id: "milestone:plan:one:stationery_details",
      kind: "source_state_unresolved",
      source_refs: ["task:stationery:v1"],
    }],
    selected_path_item: {
      milestone_id: "milestone:plan:one:guest_count_draft",
      urgency,
      slack_days: slackDays,
      prepared_next_action: {
        kind: "research",
        target_ref: "vendor_search:accommodation",
      },
    },
  };
}

test("milestone guidance stays behind its independent default-off flag", () => {
  assert.equal(planningMilestoneUiEnabled({}), false);
  assert.equal(planningMilestoneUiEnabled({ VITE_PLANNING_CRITICAL_PATH_ENABLED: "true" }), true);
  assert.equal(planningMilestoneUiEnabled({ VITE_PLANNING_CRITICAL_PATH_ENABLED: "off" }), false);
});

test("projection request contains only the plan identifier", () => {
  assert.deepEqual(planningMilestoneProjectRequest("plan:one"), {
    path: "/planning/milestones/project",
    body: { plan_id: "plan:one" },
  });
});

test("an explicit milestone link survives the existing AFP task projection", () => {
  const message = weddingTaskItemToAfpTaskMessage({
    id: "guest-count-task",
    title: "Confirm draft guest count",
    kind: "guest_list",
    source: "user",
    reviewStatus: "accepted",
    approvalState: "approved",
    metadata: {
      weddingPlanId: "plan:one",
      responseWorkspaceId: "workspace:one",
      wedding_milestone_key: "guest_count_draft",
    },
  });

  assert.equal(message?.content.wedding_milestone_key, "guest_count_draft");
  assert.equal(message?.metadata?.wedding_milestone_key, "guest_count_draft");
});

test("computed critical item maps to existing Decision Card and A2UI surfaces", () => {
  const projection = normalizePlanningMilestoneProjection(payload());
  assert.ok(projection);
  assert.equal(projection.selected?.urgency, "critical");
  const card = planningMilestoneDecisionCard(projection);
  assert.ok(card);
  assert.deepEqual(validateDecisionCard(card), []);
  assert.equal(card.pattern, "review");
  assert.equal(card.pressure, "high");
  assert.match(card.whyItMatters, /No timing buffer remains/);
  assert.equal(card.actions[0]?.intent, "open_vendor_search");
  assert.match(card.actions[0]?.effect ?? "", /nothing is contacted or booked/i);
  assert.match(card.unknowns.join(" "), /1 timeline item still needs/);
  const visibleCopy = JSON.stringify({
    title: card.title,
    whyItMatters: card.whyItMatters,
    recommendation: card.recommendation,
    actions: card.actions,
    evidence: card.evidence.map(({ label }) => label),
    unknowns: card.unknowns,
  });
  assert.doesNotMatch(visibleCopy, /milestone:|vendor_search:|source_state|payload|postgres/i);

  const a2ui = planningMilestoneA2ui(projection);
  assert.ok(a2ui);
  assert.deepEqual(a2ui.nodes.map((node) => node.type), [
    "callout", "insight_line", "bullet_list", "action_chips",
  ]);
});

test("near-critical language requires positive bounded computed slack", () => {
  const projection = normalizePlanningMilestoneProjection(payload(8, "near_critical"));
  assert.ok(projection);
  const card = planningMilestoneDecisionCard(projection);
  assert.match(card?.whyItMatters ?? "", /8 days of timing buffer remains/);
  assert.doesNotMatch(card?.title ?? "", /needs attention/i);

  assert.equal(normalizePlanningMilestoneProjection(payload(1, "critical")), null);
  assert.equal(normalizePlanningMilestoneProjection(payload(0, "near_critical")), null);
  assert.equal(normalizePlanningMilestoneProjection(payload(15, "near_critical")), null);
});

test("stale or mismatched selected records fail closed", () => {
  const mismatched = payload();
  mismatched.selected_path_item.slack_days = -2;
  assert.equal(normalizePlanningMilestoneProjection(mismatched), null);
  const unknownMilestone = payload();
  unknownMilestone.selected_path_item.milestone_id = "milestone:plan:one:invented";
  assert.equal(normalizePlanningMilestoneProjection(unknownMilestone), null);
  const providerAction = payload();
  providerAction.selected_path_item.prepared_next_action.kind = "send" as "research";
  assert.equal(normalizePlanningMilestoneProjection(providerAction), null);
});

test("an all-clear projection remains valid without inventing a priority card", () => {
  const clear = payload();
  clear.selected_path_item = null as unknown as ReturnType<typeof payload>["selected_path_item"];
  clear.milestones[0]!.dependency.prepared_next_action = null as unknown as {
    kind: string;
    target_ref: string;
  };
  const projection = normalizePlanningMilestoneProjection(clear);
  assert.ok(projection);
  assert.equal(planningMilestoneDecisionCard(projection), null);
  assert.equal(planningMilestoneA2ui(projection), null);
});

test("technical failures map to short user-safe guidance", () => {
  assert.equal(
    planningMilestoneUserMessage(new Error("HTTP 409 graph conflict")),
    "Your timeline changed. Refresh to check the latest dates.",
  );
  assert.equal(
    planningMilestoneUserMessage(new Error("postgres payload provider failure")),
    "We could not check your timeline just now. Try again in a moment.",
  );
});
