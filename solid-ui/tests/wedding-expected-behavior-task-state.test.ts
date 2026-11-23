import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingExpectedBehaviorTaskItems,
  buildWeddingPreparationChecklistTaskItems,
} from "@/lib/weddingExpectedBehaviorTaskState";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

const weatherGap = {
  capability: "weather_contingency",
  title: "Weather backup planning is connected to real forecast evidence",
  status: "provider_blocked",
  userFacingLabel: "Provider needed: Weather backup planning is connected to real forecast evidence",
  evidenceLabels: ["Weather contingency choices are present and approval-gated."],
  blockerLabels: ["Needs BOM/weather provider evidence before calling forecasts verified."],
} as const;

const vendorGap = {
  capability: "vendor_matching",
  title: "Vendor matching can present relevant shortlists",
  status: "provider_blocked",
  userFacingLabel: "Provider needed: Vendor matching can present relevant shortlists",
  evidenceLabels: ["Vendor checklist selection is available."],
  blockerLabels: ["Live search/source verification must be connected."],
} as const;

const finalConfirmationsGap = {
  capability: "final_confirmations_payments",
  title: "Final vendor confirmations and payments are tracked",
  status: "provider_blocked",
  userFacingLabel: "Provider needed: Final vendor confirmations and payments are tracked",
  evidenceLabels: ["Final vendor confirmation and payment-review tasks are represented."],
  blockerLabels: ["Needs approval UI plus email/contact executor proof."],
} as const;

const dayOfGuestGap = {
  capability: "day_of_guest_coordination",
  title: "Day-of guest updates and lost-item incidents are scoped",
  status: "provider_blocked",
  userFacingLabel: "Provider needed: Day-of guest updates and lost-item incidents are scoped",
  evidenceLabels: ["Guest updates are scoped."],
  blockerLabels: ["Needs E2EE/scoped guest messaging provider proof."],
} as const;

test("buildWeddingExpectedBehaviorTaskItems creates conservative task candidates for audit gaps", () => {
  const tasks = buildWeddingExpectedBehaviorTaskItems({
    metadata,
    blockedItems: [weatherGap, vendorGap],
  });

  assert.equal(tasks.length, 2);
  assert.equal(tasks[0]?.kind, "weather_contingency");
  assert.equal(tasks[0]?.reviewStatus, "needs_review");
  assert.equal(tasks[0]?.approvalState, "draft");
  assert.match(tasks[0]?.notes ?? "", /BOM\/weather provider evidence/i);
  assert.equal((tasks[0]?.metadata as Record<string, unknown>).expected_behavior_capability, "weather_contingency");
  assert.equal((tasks[0]?.metadata as Record<string, unknown>).second_order_loop, "weather_backup");
  assert.equal(tasks[1]?.kind, "research");
});

test("buildWeddingExpectedBehaviorTaskItems creates final-confirmation gap tasks", () => {
  const tasks = buildWeddingExpectedBehaviorTaskItems({
    metadata,
    blockedItems: [finalConfirmationsGap],
  });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.kind, "vendor_coordination");
  assert.match(tasks[0]?.title ?? "", /final vendor confirmation/i);
  assert.equal((tasks[0]?.metadata as Record<string, unknown>).expected_behavior_capability, "final_confirmations_payments");
  assert.equal((tasks[0]?.metadata as Record<string, unknown>).second_order_loop, "commitment_timing");
});

test("buildWeddingExpectedBehaviorTaskItems creates day-of execution gap tasks", () => {
  const tasks = buildWeddingExpectedBehaviorTaskItems({
    metadata,
    blockedItems: [dayOfGuestGap],
  });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.kind, "guest_list");
  assert.match(tasks[0]?.title ?? "", /guest update/i);
  assert.equal(tasks[0]?.dueLabel, "Final week / wedding day");
  assert.equal((tasks[0]?.metadata as Record<string, unknown>).expected_behavior_capability, "day_of_guest_coordination");
  assert.equal((tasks[0]?.metadata as Record<string, unknown>).second_order_loop, "guest_logistics");
});

test("buildWeddingExpectedBehaviorTaskItems keeps day-of execution gap timing specific", () => {
  const tasks = buildWeddingExpectedBehaviorTaskItems({
    metadata,
    blockedItems: [
      {
        capability: "day_of_realtime_run_sheet_updates",
        title: "Day-of run-sheet updates execute from live delay evidence",
        status: "provider_blocked",
        userFacingLabel: "Provider needed: Day-of run-sheet updates execute from live delay evidence",
        evidenceLabels: ["Run-sheet playbook is present."],
        blockerLabels: ["Needs live coordination provider proof."],
      },
      {
        capability: "day_of_emergency_handling",
        title: "Day-of emergency fallback decisions are ready",
        status: "provider_blocked",
        userFacingLabel: "Provider needed: Day-of emergency fallback decisions are ready",
        evidenceLabels: ["Emergency playbook is present."],
        blockerLabels: ["Needs fallback contact proof."],
      },
      {
        capability: "day_of_payment_verification",
        title: "Day-of payment receipts are verified",
        status: "provider_blocked",
        userFacingLabel: "Provider needed: Day-of payment receipts are verified",
        evidenceLabels: ["Payment verification playbook is present."],
        blockerLabels: ["Needs receipt provider proof."],
      },
    ],
  });

  assert.deepEqual(tasks.map((task) => task.dueLabel), [
    "Wedding day / live run sheet",
    "Final week / wedding day",
    "Before final payment / wedding day",
  ]);
  assert.deepEqual(tasks.map((task) => (task.metadata as Record<string, unknown>).second_order_loop), [
    "guest_logistics",
    "contact_follow_up",
    "commitment_timing",
  ]);
});

test("buildWeddingExpectedBehaviorTaskItems suppresses gaps already covered by existing tasks", () => {
  const tasks = buildWeddingExpectedBehaviorTaskItems({
    metadata,
    blockedItems: [weatherGap, vendorGap],
    existingTaskItems: [{
      id: "task:weather",
      title: "Existing weather task",
      kind: "weather_contingency",
      metadata,
    }],
  });

  assert.equal(tasks.length, 1);
  assert.equal((tasks[0]?.metadata as Record<string, unknown>).expected_behavior_capability, "vendor_matching");
});

test("buildWeddingPreparationChecklistTaskItems creates concrete selectable preparation tasks", () => {
  const tasks = buildWeddingPreparationChecklistTaskItems({
    metadata,
  });

  assert.ok(tasks.length >= 10);
  assert.ok(tasks.some((task) => task.kind === "rings" && /rings/i.test(task.title)));
  assert.ok(tasks.some((task) => task.kind === "first_dance" && /first dance/i.test(task.title)));
  assert.ok(tasks.some((task) => task.kind === "cake" && /cake/i.test(task.title)));
  assert.ok(tasks.some((task) => task.kind === "transport" && /limousine|transport/i.test(task.title)));
  assert.ok(tasks.some((task) => task.kind === "attire" && /bridesmaid/i.test(task.title)));
  assert.ok(tasks.some((task) => task.kind === "hen_party" && /hen/i.test(task.title)));
  for (const task of tasks) {
    assert.equal(task.reviewStatus, "needs_review");
    assert.equal(task.approvalState, "draft");
    assert.equal((task.metadata as Record<string, unknown>).preparation_checklist, true);
    assert.equal((task.metadata as Record<string, unknown>).user_selectable, true);
    assert.ok(Array.isArray((task.metadata as Record<string, unknown>).alert_offset_days));
  }
});

test("buildWeddingPreparationChecklistTaskItems computes due dates from wedding date when available", () => {
  const tasks = buildWeddingPreparationChecklistTaskItems({
    metadata: {
      ...metadata,
      wedding_date: "2028-01-20T10:00:00.000Z",
    },
  });

  const rings = tasks.find((task) => (task.metadata as Record<string, unknown>).preparation_checklist_item === "rings");
  const finalSweep = tasks.find((task) => (task.metadata as Record<string, unknown>).preparation_checklist_item === "vendor-final-confirmation");
  assert.ok(rings?.dueAt);
  assert.ok(finalSweep?.dueAt);
  assert.match(rings.dueAt!, /^2027-06-/);
  assert.match(finalSweep.dueAt!, /^2027-12-30/);
  assert.equal((rings.metadata as Record<string, unknown>).schedule_basis, "wedding_date");
});

test("buildWeddingPreparationChecklistTaskItems keeps relative alerts when wedding date is unknown", () => {
  const tasks = buildWeddingPreparationChecklistTaskItems({
    metadata,
    includeTaskIds: ["cake"],
  });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.kind, "cake");
  assert.equal(tasks[0]?.dueAt, null);
  assert.match(tasks[0]?.dueLabel ?? "", /6-9 months/i);
  assert.equal((tasks[0]?.metadata as Record<string, unknown>).schedule_basis, "relative_due_label");
});

test("buildWeddingPreparationChecklistTaskItems suppresses existing preparation tasks", () => {
  const tasks = buildWeddingPreparationChecklistTaskItems({
    metadata,
    includeTaskIds: ["rings", "cake"],
    existingTaskItems: [{
      id: "task:rings",
      title: "Existing wedding ring task",
      kind: "rings",
      metadata: {
        ...metadata,
        preparation_checklist_item: "rings",
      },
    }],
  });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.kind, "cake");
});
