import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingVisionState } from "../src/lib/weddingVisionState.ts";
import type { WeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";

function state(overrides: Partial<WeddingResponseWorkspaceViewState> = {}): WeddingResponseWorkspaceViewState {
  return {
    workspace: {
      metadata: {
        weddingPlanId: "wedding_plan:vision",
        responseWorkspaceId: "response_workspace:vision",
        sourceResponseId: null,
        supertags: ["template:wedding_planning", "event:wedding"],
      },
    },
    afpMessages: [],
    contextCards: [{
      title: "Wedding basics",
      statusLabel: "Saved context",
      metadataLabels: ["response_workspace:vision"],
      answeredLabels: ["Location: Sydney NSW", "Priorities: food, people, relaxed music", "Anti-priority: overly formal"],
      nextQuestionLabel: "Ready to generate the first recommendation set.",
    }],
    inspiration: {
      items: [{
        id: "img-1",
        title: "Warm candle dinner",
        supertags: ["warm", "long-table", "candles"],
        preferenceSignals: ["warm intimate reception"],
      }],
    },
    guestTracking: {
      guestRowCount: 80,
      attendingCount: 42,
      declinedCount: 3,
      pendingCount: 35,
    },
    budgetTracking: {
      budgetTargetAmount: 60_000,
    },
    delegation: {
      items: [{ title: "Sophie - maid of honour" }],
    },
    boundaryState: {
      familyVisibleObjects: [{ title: "Grandma - accessibility" }],
    },
    ...overrides,
  } as unknown as WeddingResponseWorkspaceViewState;
}

test("buildWeddingVisionState creates a traceable wedding compass from current planning evidence", () => {
  const vision = buildWeddingVisionState(state());

  assert.equal(vision.title, "Our Wedding Compass");
  assert.ok(vision.feelTags.includes("Warm"));
  assert.ok(vision.feelTags.includes("Relaxed"));
  assert.equal(vision.priorityRows[0]?.label, "People");
  assert.ok(vision.avoidLabels.includes("Overly formal"));
  assert.ok(vision.importantPeopleLabels.some((label) => /Grandma/i.test(label)));
  assert.ok(vision.decisionRules.some((label) => /couple review/i.test(label)));
  assert.ok(vision.evidenceLabels.some((label) => /Location: Sydney NSW/i.test(label)));
  assert.ok(vision.evidenceLabels.some((label) => /1 inspiration item/i.test(label)));
  assert.match(vision.confidenceLabel, /strong/i);
  assert.ok(vision.sourceMixLabels.some((label) => /planning answer/i.test(label)));
  assert.ok(vision.sourceMixLabels.some((label) => /Budget ceiling/i.test(label)));
  assert.ok(vision.learningLabels.some((label) => /Keep adding choices/i.test(label)));
  assert.equal(vision.actionLabels[0]?.targetMenu, "plan");
  assert.equal(vision.a2ui.kind, "wedding_vision");
  assert.ok(vision.a2ui.sections.some((section) => {
    const record = section as { title?: string };
    return record.title === "Still learning";
  }));
});

test("buildWeddingVisionState projects confirmed feel tags from AFP preference messages", () => {
  const vision = buildWeddingVisionState(state({
    afpMessages: [{
      id: "afp-vision-calm",
      thread_id: "wedding_vision:response_workspace:vision",
      from: "system://wedding-planning",
      to: ["agent://wedding-planning"],
      timestamp: "2026-09-29T01:00:00.000Z",
      type: "ledger",
      kind: "wedding_vision_preference",
      subtype: "wedding_vision_preference",
      content: {
        action: "affirm_feel_tag",
        label: "Calm",
        response_workspace_id: "response_workspace:vision",
      },
      metadata: {
        responseWorkspaceId: "response_workspace:vision",
        wedding_vision_action: "affirm_feel_tag",
        wedding_vision_label: "Calm",
      },
      supertags: ["wedding_vision_preference"],
    }],
  } as Partial<WeddingResponseWorkspaceViewState>));

  assert.equal(vision.confirmedFeelTags[0], "Calm");
  assert.equal(vision.feelTags[0], "Calm");
  assert.ok(vision.evidenceLabels.some((label) => /confirmed "Calm"/i.test(label)));
  assert.ok(vision.sourceMixLabels.some((label) => /confirmed vision preference/i.test(label)));
});

test("buildWeddingVisionState stays useful before the couple has added much detail", () => {
  const vision = buildWeddingVisionState(state({
    contextCards: [],
    inspiration: { items: [] } as WeddingResponseWorkspaceViewState["inspiration"],
    guestTracking: { guestRowCount: 0 } as WeddingResponseWorkspaceViewState["guestTracking"],
    budgetTracking: { budgetTargetAmount: null } as WeddingResponseWorkspaceViewState["budgetTracking"],
    delegation: { items: [] } as WeddingResponseWorkspaceViewState["delegation"],
    boundaryState: { familyVisibleObjects: [] } as WeddingResponseWorkspaceViewState["boundaryState"],
  }));

  assert.deepEqual(vision.feelTags, ["Warm", "Relaxed", "Personal"]);
  assert.ok(vision.importantPeopleLabels[0]?.includes("Add important people"));
  assert.ok(vision.evidenceLabels[0]?.includes("Add a date"));
  assert.match(vision.confidenceLabel, /early/i);
  assert.ok(vision.learningLabels.some((label) => /Add inspiration/i.test(label)));
  assert.deepEqual(vision.actionLabels.map((action) => action.targetMenu), ["inspiration", "people", "budget"]);
  assert.ok(vision.a2ui.sections.some((section) => {
    const record = section as { title?: string };
    return record.title === "Improve this summary";
  }));
});

test("buildWeddingVisionState reads inspiration supertags as preference evidence", () => {
  const vision = buildWeddingVisionState(state({
    contextCards: [],
    inspiration: {
      items: [{
        id: "img-quiet",
        title: "Quiet reception idea",
        supertags: ["warm", "candlelit", "long-table"],
        preferenceSignals: [],
      }],
    } as WeddingResponseWorkspaceViewState["inspiration"],
  }));

  assert.ok(vision.feelTags.includes("Warm"));
  assert.ok(vision.priorityRows.some((row) => row.label === "Decor" && row.reason.includes("inspiration")));
});

test("buildWeddingVisionState uses structured intake atmosphere and inspiration links", () => {
  const vision = buildWeddingVisionState(state({
    contextCards: [{
      title: "Wedding basics",
      statusLabel: "Saved context",
      planningContext: {
        atmosphereDescription: "Relaxed candlelit garden dinner with personal vows",
        inspirationImageUrls: ["https://example.com/garden-dinner.jpg", "https://example.com/table.jpg"],
        topPriorities: ["budget", "food", "family"],
        budgetComfort: "Keep total spend low",
      },
      answeredLabels: ["Budget comfort: Keep total spend low"],
      nextQuestionLabel: "Ready for vendor recommendations.",
      metadataLabels: ["response_workspace:vision"],
    }],
    inspiration: { items: [] } as WeddingResponseWorkspaceViewState["inspiration"],
  }));

  assert.ok(vision.feelTags.includes("Warm"));
  assert.ok(vision.feelTags.includes("Relaxed"));
  assert.ok(vision.feelTags.includes("Personal"));
  assert.ok(vision.evidenceLabels.some((label) => /Atmosphere: Relaxed candlelit garden dinner/i.test(label)));
  assert.ok(vision.evidenceLabels.some((label) => /2 inspiration links/i.test(label)));
  assert.ok(vision.sourceMixLabels.some((label) => /2 inspiration links/i.test(label)));
  assert.ok(!vision.actionLabels.some((action) => action.label === "Add inspiration"));
});
