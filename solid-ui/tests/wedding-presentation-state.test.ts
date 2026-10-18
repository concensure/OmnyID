import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingPresentationState,
} from "../src/lib/weddingPresentationState.ts";
import { buildWeddingRichResponseRendererState } from "../src/lib/weddingRichResponseRendererState.ts";
import { normalizeWeddingArtifactSummary } from "../src/lib/weddingArtifactState.ts";
import { buildWeddingKnowledgeGraphState } from "../src/lib/weddingKnowledgeGraphState.ts";
import type { WeddingArtifactInput } from "../src/lib/weddingArtifactState.ts";

function artifact(input: Partial<WeddingArtifactInput> & Pick<WeddingArtifactInput, "title" | "kind" | "createdAt">): WeddingArtifactInput {
  return {
    id: `artifact:${String(input.title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    metadata: {
      wedding_plan_id: "wedding_plan:harbour",
      response_workspace_id: "response_workspace:planning-pass",
      source_response_id: "afp:response-1",
    },
    sourceLabels: ["Agent research"],
    ...input,
  };
}

test("buildWeddingPresentationState creates sparse response with one need-to-know question", () => {
  const state = buildWeddingPresentationState({
    metadata: {
      wedding_plan_id: "wedding_plan:harbour",
      response_workspace_id: "response_workspace:planning-pass",
    },
  });
  const overview = state.sections.find((section) => section.id === "overview");

  assert.equal(state.title, "Wedding planning response");
  assert.equal(state.heroLabel, "Wedding plan starter");
  assert.match(state.subtitle, /Needs one more detail/i);
  assert.equal(state.primaryAction.kind, "open_planning_files");
  assert.equal(state.primaryAction.responseWorkspaceId, "response_workspace:planning-pass");
  assert.equal(state.probing.nextQuestion?.slot, "date_or_season");
  assert.equal(overview?.cards.length, 1);
  assert.equal(overview?.cards[0]?.primaryAction?.kind, "answer_probe");
  assert.equal(overview?.cards[0]?.secondaryAction?.kind, "continue_chat");
});

test("buildWeddingPresentationState creates travel-style sections from planning artifacts", () => {
  const state = buildWeddingPresentationState({
    title: "Harbour wedding venue pass",
    metadata: {
      wedding_plan_id: "wedding_plan:harbour",
      response_workspace_id: "response_workspace:planning-pass",
      source_response_id: "afp:response-1",
    },
    planningContext: {
      dateOrSeason: "Spring 2027",
      location: "Sydney",
      guestCount: 90,
      budgetComfort: "mid-range",
      topPriorities: ["views", "food", "low stress"],
    },
    artifacts: [
      artifact({ title: "Venue research", kind: "research", createdAt: 8 }),
      artifact({ title: "Venue map", kind: "map_collection", createdAt: 7, locationLabels: ["Sydney Harbour"] }),
      artifact({ title: "Run sheet", kind: "timeline", createdAt: 6, linkedCalendarEventIds: ["calendar:ceremony"] }),
      artifact({ title: "Budget sheet", kind: "budget_sheet", createdAt: 5 }),
      artifact({ title: "Venue shortlist", kind: "vendor_table", createdAt: 4, vendorLabels: ["Harbour View Room"] }),
      artifact({ title: "Decision log", kind: "decision_log", createdAt: 3 }),
      artifact({
        title: "Australian legal setup",
        kind: "legal",
        createdAt: 2.5,
        linkedCalendarEventIds: ["calendar:noim-reminder"],
        linkedTaskIds: ["task:download-noim"],
        sourceLabels: ["Attorney-General's Department"],
      }),
      artifact({ title: "Venue email", kind: "email_draft", createdAt: 2, metadata: {
        wedding_plan_id: "wedding_plan:harbour",
        response_workspace_id: "response_workspace:planning-pass",
        source_response_id: "afp:response-1",
        approval_state: "pending_user_approval",
      } }),
    ],
  });

  assert.equal(state.title, "Harbour wedding venue pass");
  assert.equal(state.heroLabel, "Private wedding operations room");
  assert.match(state.subtitle, /8 planning files/i);
  assert.equal(state.probing.nextQuestion, null);
  assert.deepEqual(
    state.sections.map((section) => section.id),
    ["overview", "map", "timeline", "legal", "budget", "vendors", "decisions", "tasks", "drafts", "artifacts", "continue"],
  );
  assert.equal(state.sections.find((section) => section.id === "map")?.cards[0]?.primaryAction?.kind, "open_map");
  assert.equal(state.sections.find((section) => section.id === "timeline")?.cards[0]?.primaryAction?.kind, "open_calendar");
  assert.equal(state.sections.find((section) => section.id === "legal")?.cards[0]?.primaryAction?.kind, "open_task_list");
  assert.equal(state.sections.find((section) => section.id === "legal")?.cards[0]?.secondaryAction?.kind, "open_calendar");
  assert.equal(state.sections.find((section) => section.id === "vendors")?.cards[0]?.title, "Venue shortlist");
  assert.equal(state.sections.find((section) => section.id === "drafts")?.cards[0]?.primaryAction?.kind, "approve_draft");
  assert.equal(state.sections.find((section) => section.id === "continue")?.cards[0]?.primaryAction?.kind, "continue_chat");
});

test("buildWeddingPresentationState keeps legal artifacts in the legal section", () => {
  const state = buildWeddingPresentationState({
    metadata: {
      wedding_plan_id: "wedding_plan:harbour",
      response_workspace_id: "response_workspace:planning-pass",
      source_response_id: "afp:response-1",
    },
    planningContext: {
      dateOrSeason: "Spring 2027",
      countryCode: "AU",
      location: "Sydney",
      guestCount: 90,
      budgetComfort: "mid-range",
      topPriorities: ["low stress"],
      noimDownloaded: "no",
      celebrantPath: "need_options",
    },
    artifacts: [
      artifact({ title: "Run sheet", kind: "timeline", createdAt: 6, linkedCalendarEventIds: ["calendar:ceremony"] }),
      artifact({
        title: "Australian legal setup",
        kind: "legal",
        createdAt: 5,
        linkedCalendarEventIds: ["calendar:noim-reminder"],
        linkedTaskIds: ["task:download-noim"],
      }),
    ],
  });
  const timeline = state.sections.find((section) => section.id === "timeline");
  const legal = state.sections.find((section) => section.id === "legal");

  assert.equal(timeline?.cards.some((card) => /legal/i.test(card.title)), false);
  assert.equal(legal?.cards[0]?.title, "Australian legal setup");
  assert.match(legal?.cards[0]?.body ?? "", /official-source labels/i);
  assert.equal(legal?.cards[0]?.primaryAction?.label, "Open legal tasks");
  assert.equal(legal?.cards[0]?.secondaryAction?.label, "Open NOIM reminder");
});

test("buildWeddingPresentationState redacts imported filenames in presentation and rich-response cards", () => {
  const state = buildWeddingPresentationState({
    metadata: {
      wedding_plan_id: "wedding_plan:harbour",
      response_workspace_id: "response_workspace:planning-pass",
      source_response_id: "afp:response-1",
    },
    planningContext: {
      dateOrSeason: "Spring 2027",
      location: "Sydney",
      guestCount: 90,
      budgetComfort: "mid-range",
      topPriorities: ["low stress"],
    },
    artifacts: [artifact({
      id: "wedding_import:guest_list:workspace:rsvp-csv",
      title: "Imported CSV: rsvp.csv",
      kind: "guest_list",
      createdAt: 5,
      metadata: {
        wedding_plan_id: "wedding_plan:harbour",
        response_workspace_id: "response_workspace:planning-pass",
        source_response_id: "afp:response-1",
        supertags: ["wedding_import", "wedding_import:csv", "wedding_import_status:synthesized"],
      },
      sourceLabels: ["CSV import: rsvp.csv", "original upload saved"],
      bodyText: [
        "# Imported private planning file",
        "",
        "| Name | RSVP |",
        "| --- | --- |",
        "| Alex | Yes |",
      ].join("\n"),
    })],
  });
  const artifactCard = state.sections.find((section) => section.id === "artifacts")?.cards[0];
  const rich = buildWeddingRichResponseRendererState(state);
  const richBlock = rich.sections.find((section) => section.id === "artifacts")?.blocks[0];
  const serializedPresentationDisplay = JSON.stringify({
    title: artifactCard?.title,
    body: artifactCard?.body,
    badges: artifactCard?.badges,
    evidenceLabel: artifactCard?.evidenceLabel,
  });
  const serializedRichDisplay = JSON.stringify({
    title: richBlock?.title,
    body: richBlock?.body,
    badges: richBlock?.badges,
    evidenceLabel: richBlock?.evidenceLabel,
  });

  assert.equal(artifactCard?.title, "Imported private planning file");
  assert.equal(artifactCard?.evidenceLabel, "Imported private planning file");
  assert.equal(richBlock?.title, "Imported private planning file");
  assert.equal(richBlock?.evidenceLabel, "Imported private planning file");
  assert.equal(serializedPresentationDisplay.includes("rsvp.csv"), false);
  assert.equal(serializedPresentationDisplay.includes("original upload saved"), false);
  assert.equal(serializedRichDisplay.includes("rsvp.csv"), false);
  assert.equal(serializedRichDisplay.includes("original upload saved"), false);
});

test("buildWeddingPresentationState carries workspace context in card actions", () => {
  const state = buildWeddingPresentationState({
    metadata: {
      wedding_plan_id: "wedding_plan:harbour",
      response_workspace_id: "response_workspace:planning-pass",
      source_response_id: "afp:response-1",
    },
    planningContext: {
      dateOrSeason: "Spring 2027",
      location: "Sydney",
      guestCount: 90,
      budgetComfort: "mid-range",
      topPriorities: ["views"],
    },
    artifacts: [
      artifact({ title: "Budget sheet", kind: "budget_sheet", createdAt: 5 }),
    ],
  });
  const budgetCard = state.sections.find((section) => section.id === "budget")?.cards[0];

  assert.equal(budgetCard?.primaryAction?.kind, "open_planning_files");
  assert.equal(budgetCard?.primaryAction?.weddingPlanId, "wedding_plan:harbour");
  assert.equal(budgetCard?.primaryAction?.responseWorkspaceId, "response_workspace:planning-pass");
  assert.equal(budgetCard?.primaryAction?.sourceResponseId, "afp:response-1");
  assert.equal(budgetCard?.primaryAction?.artifactId, "artifact:budget-sheet");
  assert.equal(budgetCard?.secondaryAction?.kind, "export_artifact");
  assert.ok(budgetCard?.badges.includes("Budget"));
  assert.ok(budgetCard?.badges.includes("csv"));
});

test("buildWeddingPresentationState surfaces task actions only when task-linked artifacts exist", () => {
  const withoutTasks = buildWeddingPresentationState({
    metadata: { response_workspace_id: "response_workspace:planning-pass" },
    planningContext: {
      dateOrSeason: "Spring 2027",
      location: "Sydney",
      guestCount: 90,
      budgetComfort: "mid-range",
      topPriorities: ["views"],
    },
    artifacts: [artifact({ title: "Budget sheet", kind: "budget_sheet", createdAt: 5 })],
  });
  const withTasks = buildWeddingPresentationState({
    metadata: { response_workspace_id: "response_workspace:planning-pass" },
    planningContext: {
      dateOrSeason: "Spring 2027",
      location: "Sydney",
      guestCount: 90,
      budgetComfort: "mid-range",
      topPriorities: ["views"],
    },
    artifacts: [artifact({
      title: "Venue task pack",
      kind: "timeline",
      createdAt: 5,
      linkedTaskIds: ["task:book-tour"],
    })],
  });

  assert.equal(withoutTasks.sections.some((section) => section.id === "tasks"), false);
  assert.equal(withTasks.sections.find((section) => section.id === "tasks")?.cards[0]?.primaryAction?.kind, "open_task_list");
});

test("buildWeddingPresentationState adds graph-backed recommendation cards when topology is supplied", () => {
  const metadata = {
    wedding_plan_id: "wedding_plan:harbour",
    response_workspace_id: "response_workspace:planning-pass",
    source_response_id: "afp:response-1",
  };
  const vendorArtifact = normalizeWeddingArtifactSummary(artifact({
    title: "Venue shortlist",
    kind: "vendor_table",
    createdAt: 4,
    vendorLabels: ["Harbour View Room"],
  }));
  assert.ok(vendorArtifact);
  const graph = buildWeddingKnowledgeGraphState({
    metadata,
    artifacts: [vendorArtifact],
    risks: [{
      title: "No wet-weather backup confirmed",
      severity: "high",
      evidence: "Outdoor ceremony is still preferred.",
    }],
  });

  const state = buildWeddingPresentationState({
    metadata,
    planningContext: {
      dateOrSeason: "Spring 2027",
      location: "Sydney",
      guestCount: 90,
      budgetComfort: "mid-range",
      topPriorities: ["views"],
    },
    artifacts: [artifact({ title: "Venue shortlist", kind: "vendor_table", createdAt: 4 })],
    knowledgeGraph: graph,
  });
  const recommendations = state.sections.find((section) => section.id === "recommendations");

  assert.ok(state.recommendations);
  assert.equal(recommendations?.cards[0]?.primaryAction?.kind, "continue_chat");
  assert.equal(recommendations?.cards[0]?.secondaryAction?.kind, "open_graph");
  assert.match(recommendations?.cards[0]?.evidenceLabel ?? "", /graph relationship|missing artifact/i);
});

test("buildWeddingPresentationState places constraint conflicts in the existing recommendation cards", () => {
  const metadata = {
    wedding_plan_id: "wedding_plan:harbour",
    response_workspace_id: "response_workspace:planning-pass",
    source_response_id: "afp:response-1",
  };
  const state = buildWeddingPresentationState({
    metadata,
    knowledgeGraph: buildWeddingKnowledgeGraphState({ metadata }),
    constraintEvaluations: [{
      evaluationId: "evaluation:ceremony:v2",
      constraintRef: "constraint:ceremony",
      candidateRevisionRef: "directory:venue-one:revision:v2",
      result: "conflict",
      severity: "blocking",
      title: "Service requirement conflicts with this option",
      evidenceLabel: "Checked service requirement evidence",
    }],
  });
  const card = state.sections.find((section) => section.id === "recommendations")?.cards[0];

  assert.equal(state.recommendations?.primaryRecommendation?.kind, "constraint_conflict");
  assert.equal(card?.title, "Service requirement conflicts with this option");
  assert.equal(card?.evidenceLabel, "Checked service requirement evidence");
  assert.equal(JSON.stringify(card).includes("degree"), false);
});
