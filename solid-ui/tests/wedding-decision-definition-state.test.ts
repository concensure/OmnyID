import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingPlanningTaskItem, WeddingPlanningTaskKind } from "../src/lib/weddingCalendarProjectionState.ts";
import {
  auditWeddingDecisionContracts,
  buildWeddingTaskDecisionContract,
} from "../src/lib/weddingDecisionDefinitionState.ts";

const kinds: WeddingPlanningTaskKind[] = [
  "research", "vendor_follow_up", "budget_review", "guest_list", "legal", "vow", "rings", "first_dance", "cake", "transport", "attire", "hen_party", "beauty", "music", "contract_review", "rsvp", "seating", "vendor_coordination", "document_checklist", "run_sheet", "weather_contingency", "email_draft", "registry", "decision", "other",
];

function task(kind: WeddingPlanningTaskKind, overrides: Partial<WeddingPlanningTaskItem> = {}): WeddingPlanningTaskItem {
  return {
    id: `task:${kind}`,
    title: `Review ${kind.replaceAll("_", " ")}`,
    kind,
    reviewStatus: "accepted",
    approvalState: "draft",
    ...overrides,
  };
}

test("every Wedding planning task kind declares prerequisites, answer authority and deadline policy before card copy", () => {
  for (const kind of kinds) {
    const contract = buildWeddingTaskDecisionContract({
      task: task(kind),
      facts: { weddingDate: "2028-09-18", budgetTargetAmount: 25_000, guestCount: 40 },
    });
    assert.ok(contract.decisionType, kind);
    assert.ok(contract.question.endsWith("?"), kind);
    assert.ok(contract.answerRecord, kind);
    assert.ok(contract.deadlinePolicy, kind);
    assert.ok(contract.primaryActionLabel, kind);
    assert.ok(contract.primaryOutcome, kind);
    assert.equal(contract.settled, false, kind);
  }
});

test("a missing prerequisite becomes the choice shown before the dependent transport decision", () => {
  const contract = buildWeddingTaskDecisionContract({
    task: task("transport", { title: "Book limousine or wedding transport and pickup schedule" }),
    facts: { weddingDate: "2028-09-18", budgetTargetAmount: 2_000, guestCount: 40 },
  });

  assert.equal(contract.decisionType, "transport");
  assert.equal(contract.missingPrerequisite?.key, "requirements");
  assert.equal(contract.question, "Which requirement matters most for this choice?");
  assert.equal(contract.primaryActionLabel, "Confirm the requirements");
  assert.equal(contract.answerRecord, "wedding_planning_task");
  assert.equal(contract.approvalRequiredBeforeExternalAction, true);
});

test("a missing global prerequisite points at the canonical record that can resolve it", () => {
  const contract = buildWeddingTaskDecisionContract({
    task: task("legal", { title: "Prepare the notice of intended marriage" }),
    facts: {},
  });

  assert.equal(contract.missingPrerequisite?.key, "wedding_date");
  assert.equal(contract.question, "What date or planning window should this decision use?");
  assert.equal(contract.answerRecord, "wedding_event_setup");
});

test("quote evidence keeps amounts, inclusions, estimates and a checkable source beside the choice", () => {
  const contract = buildWeddingTaskDecisionContract({
    task: task("budget_review", {
      title: "Compare venue quote options",
      linkedArtifactId: "quote:venue-a",
      metadata: {
        requirements_confirmed: true,
        quote_lines: ["Food and beverage minimum A$5,000", "Staffing fee unknown"],
        inclusions: ["Tables and chairs"],
        source_urls: ["https://example.com/venue-a-quote"],
      },
    }),
    facts: { weddingDate: "2028-09-18", budgetTargetAmount: 25_000, guestCount: 40 },
  });

  assert.equal(contract.missingPrerequisite, null);
  assert.equal(contract.recommendationSupported, true);
  assert.ok(contract.evidence.some((item) => item.label.includes("A$5,000") && item.ref === "https://example.com/venue-a-quote"));
  assert.ok(contract.evidence.some((item) => item.label.includes("Staffing fee unknown") && item.status === "estimate"));
  assert.ok(contract.evidence.some((item) => item.label.includes("Tables and chairs")));
});

test("settled tasks are explicit and the bulk audit flags compound and unsupported legacy cards", () => {
  const settled = buildWeddingTaskDecisionContract({
    task: task("decision", { metadata: { decision_settled: true } }),
    facts: {},
  });
  assert.equal(settled.settled, true);

  const open = buildWeddingTaskDecisionContract({
    task: task("transport", { title: "Book transport and confirm pickup schedule" }),
    facts: {},
  });
  const findings = auditWeddingDecisionContracts([{
    id: "task:transport",
    title: "Book transport and confirm pickup schedule",
    recommendedActionLabel: "Premium shuttle is best",
    decisionContract: open,
  }, {
    id: "task:settled",
    title: "Choose venue",
    decisionContract: settled,
  }]);

  assert.ok(findings.some((finding) => finding.kind === "compound_decision"));
  assert.ok(findings.some((finding) => finding.kind === "unsupported_recommendation"));
  assert.ok(findings.some((finding) => finding.kind === "repeats_settled_choice"));
});
