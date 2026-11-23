import test from "node:test";
import assert from "node:assert/strict";

import {
  buildNotePreviewMessageState,
  buildOrchestrationPreviewMessageState,
  buildPanelPreviewMessageState,
  buildPresentationPreviewMessageState,
  buildSchedulePreviewMessageState,
  buildSearchPreviewMessageState,
  buildTaskPreviewMessageState,
  createCommandPreviewMessageBase,
  normalizeCommandPreviewSourceLinks,
} from "../src/lib/commandPreviewMessageState.js";

test("createCommandPreviewMessageBase assembles the shared AFP preview shell", () => {
  const message = createCommandPreviewMessageBase({
    intent: "web_research",
    timestamp: "2026-06-26T00:00:00.000Z",
  });

  assert.deepEqual(message, {
    id: "preview.web_research.2026-06-26T00:00:00.000Z",
    thread_id: "preview.thread.web_research",
    from: "omnyid://workspace/command-bar",
    to: ["omnyid://workspace/user"],
    timestamp: "2026-06-26T00:00:00.000Z",
    type: "agent",
    subtype: "preview",
    content: {},
    metadata: { origin: "workspace_command_preview" },
    views: [],
    attachments: [],
    references: [],
    encryption: null,
  });
});

test("normalizeCommandPreviewSourceLinks maps command links into preview source links", () => {
  const links = normalizeCommandPreviewSourceLinks([
    { title: "Alpha", url: "https://example.com/a", kind: "source", origin: "external" },
    { title: "Workspace note", url: "omnyid://note/1", kind: "workspace_note", origin: null },
  ]);

  assert.deepEqual(links, [
    {
      title: "Alpha",
      url: "https://example.com/a",
      snippet: "Source link",
      origin: "external",
    },
    {
      title: "Workspace note",
      url: "omnyid://note/1",
      snippet: "workspace_note",
      origin: null,
    },
  ]);
});

test("buildSearchPreviewMessageState assembles research preview message with local router payload", () => {
  const message = buildSearchPreviewMessageState({
    base: {
      id: "preview.web_research.1",
      thread_id: "preview.thread.web_research",
      from: "omnyid://workspace/command-bar",
      to: ["omnyid://workspace/user"],
      timestamp: "2026-06-26T00:00:00.000Z",
      type: "agent",
      subtype: "preview",
      content: {},
      metadata: { origin: "workspace_command_preview" },
      views: [],
      attachments: [],
      references: [],
      encryption: null,
    },
    intent: "web_research",
    query: "market update",
    summary: "Summarized recent market signals.",
    bullets: ["Point one", "", "Point two"],
    sourceLinks: [
      { title: "Alpha", url: "https://example.com/a", snippet: "Source link", origin: "external" },
    ],
    localRouterPreview: {
      title: "Local retrieval preview",
      tone: "info",
    },
    a2uiCompanion: {
      schema_version: "a2ui.v1",
      kind: "panel",
      title: "Search result for \"market update\"",
    },
  });

  assert.equal(message.type, "research");
  assert.equal(message.subtype, "content");
  assert.deepEqual(message.metadata, {
    origin: "workspace_command_preview",
    intent: "web_research",
    source_count: 1,
  });
  assert.deepEqual(message.content, {
    query: "market update",
    summary: "Summarized recent market signals.",
    bullets: ["Point one", "Point two"],
    sources: [
      { title: "Alpha", url: "https://example.com/a", snippet: "Source link", origin: "external" },
    ],
    local_router_preview: {
      title: "Local retrieval preview",
      tone: "info",
    },
    kind: "web_research",
  });
  assert.equal(message.views.length, 2);
  assert.equal(message.views[0].format, "search_result");
  assert.equal(message.views[1].format, "a2ui.v1");
});

test("buildSearchPreviewMessageState omits local router preview when unavailable", () => {
  const message = buildSearchPreviewMessageState({
    base: {
      id: "preview.search.1",
      thread_id: "preview.thread.search",
      from: "omnyid://workspace/command-bar",
      timestamp: "2026-06-26T00:00:00.000Z",
      type: "agent",
      content: {},
      views: [],
      attachments: [],
    },
    intent: "search",
    query: "",
    summary: "No local router data.",
    bullets: [],
    sourceLinks: [],
    localRouterPreview: null,
    a2uiCompanion: {
      schema_version: "a2ui.v1",
      kind: "panel",
      title: "Search result",
    },
  });

  assert.equal("local_router_preview" in message.content, false);
  assert.equal("local_router_preview" in message.views[0].content, false);
  assert.equal(message.metadata.source_count, 0);
});

test("buildTaskPreviewMessageState assembles task card content", () => {
  const message = buildTaskPreviewMessageState({
    base: {
      id: "preview.task.1",
      thread_id: "preview.thread.task",
      from: "omnyid://workspace/command-bar",
      timestamp: "2026-06-26T00:00:00.000Z",
      type: "agent",
      content: {},
      views: [],
      attachments: [],
    },
    intent: "task",
    query: "Review patch",
    summary: "Prepare the patch review.",
    bullets: ["Open the diff"],
  });

  assert.equal(message.type, "task");
  assert.equal(message.views[0].format, "task_card");
  assert.deepEqual(message.content, {
    kind: "task_preview",
    title: "Review patch",
    description: "Prepare the patch review.\nOpen the diff",
    priority: "normal",
    task_type: "general",
    status: "pending",
  });
});

test("buildNotePreviewMessageState assembles canvas note preview", () => {
  const message = buildNotePreviewMessageState({
    base: {
      id: "preview.note.1",
      thread_id: "preview.thread.note",
      from: "omnyid://workspace/command-bar",
      timestamp: "2026-06-26T00:00:00.000Z",
      type: "agent",
      content: {},
      views: [],
      attachments: [],
    },
    intent: "note",
    query: "",
    summary: "Capture this note.",
  });

  assert.equal(message.type, "note");
  assert.equal(message.views[0].format, "canvas");
  assert.deepEqual(message.content, {
    kind: "workspace_note",
    title: "Note",
    blocks: [{ type: "paragraph", text: "Capture this note." }],
  });
});

test("buildSchedulePreviewMessageState assembles calendar preview events", () => {
  const message = buildSchedulePreviewMessageState({
    base: {
      id: "preview.schedule.1",
      thread_id: "preview.thread.schedule",
      from: "omnyid://workspace/command-bar",
      timestamp: "2026-06-26T00:00:00.000Z",
      type: "agent",
      content: {},
      views: [],
      attachments: [],
    },
    intent: "schedule",
    query: "Week plan",
    summary: "Plan the week.",
    bullets: ["Monday review", "Tuesday sync"],
    timestamp: "2026-06-26T00:00:00.000Z",
  });

  assert.equal(message.type, "calendar");
  assert.equal(message.views[0].format, "calendar");
  assert.deepEqual(message.content, {
    kind: "schedule_plan",
    title: "Week plan",
    description: "Plan the week.",
    events: [
      {
        id: "preview-event-0",
        title: "Monday review",
        start: "2026-06-26T00:00:00.000Z",
        description: "Plan the week.",
        status: "tentative",
        note_kind: "high_stakes_prep",
        prep_lead_minutes: 45,
        profile: {
          schedule_anchor_type: "meeting",
          schedule_note_kind: "high_stakes_prep",
          schedule_focus_kind: "meeting_prep",
          prep_lead_minutes: 45,
          has_agenda_signal: false,
          has_high_importance_signal: true,
          location_present: false,
          description_present: true,
          all_day: false,
        },
      },
      {
        id: "preview-event-1",
        title: "Tuesday sync",
        start: "2026-06-26T00:00:00.000Z",
        description: "Plan the week.",
        status: "tentative",
        note_kind: "high_stakes_prep",
        prep_lead_minutes: 45,
        profile: {
          schedule_anchor_type: "meeting",
          schedule_note_kind: "high_stakes_prep",
          schedule_focus_kind: "meeting_prep",
          prep_lead_minutes: 45,
          has_agenda_signal: false,
          has_high_importance_signal: true,
          location_present: false,
          description_present: true,
          all_day: false,
        },
      },
    ],
  });
});

test("buildPresentationPreviewMessageState assembles ui presentation preview", () => {
  const message = buildPresentationPreviewMessageState({
    base: {
      id: "preview.presentation.1",
      thread_id: "preview.thread.presentation",
      from: "omnyid://workspace/command-bar",
      timestamp: "2026-06-26T00:00:00.000Z",
      type: "agent",
      content: {},
      views: [],
      attachments: [],
    },
    intent: "trip_planner",
    query: "tokyo itinerary",
    summary: "Prepared an itinerary shell.",
    bullets: ["Day 1", "Day 2"],
    links: [{ title: "Guide", url: "https://example.com/guide" }],
  });

  assert.equal(message.subtype, "ui_presentation");
  assert.equal(message.views[0].format, "ui_presentation");
  assert.deepEqual(message.content, {
    query: "tokyo itinerary",
    summary: "Prepared an itinerary shell.",
    bullets: ["Day 1", "Day 2"],
    sources: [{ title: "Guide", url: "https://example.com/guide" }],
  });
});

test("buildOrchestrationPreviewMessageState assembles generative card and companion view", () => {
  const message = buildOrchestrationPreviewMessageState({
    base: {
      id: "preview.orchestrate.1",
      thread_id: "preview.thread.orchestrate",
      from: "omnyid://workspace/command-bar",
      timestamp: "2026-06-26T00:00:00.000Z",
      type: "agent",
      content: {},
      views: [],
      attachments: [],
    },
    intent: "orchestrate",
    query: "launch outreach plan",
    summary: "Planning the orchestration path.",
    bullets: ["Research leads", "Draft outreach"],
    cardId: "card.preview.test",
    a2uiCompanion: {
      schema_version: "a2ui.v1",
      kind: "panel",
      title: "Orchestration preview for \"launch outreach plan\"",
    },
  });

  assert.equal(message.subtype, "orchestration_card");
  assert.deepEqual(message.content, {
    kind: "orchestration",
    card: {
      card_id: "card.preview.test",
      query: "launch outreach plan",
      status: "streaming",
      optimization_mode: "balanced",
      provider: "omnyid",
      model: "",
      sections: [
        {
          id: "summary",
          type: "summary",
          order: 1,
          status: "complete",
          content: { text: "Planning the orchestration path." },
        },
        {
          id: "progress",
          type: "progress",
          order: 2,
          status: "running",
          content: { label: "Planning the orchestration path", value: 0.2 },
        },
        {
          id: "plan",
          type: "plan",
          order: 3,
          status: "pending",
          content: { steps: ["Research leads", "Draft outreach"] },
        },
      ],
    },
  });
  assert.equal(message.views[0].format, "generative_card");
  assert.equal(message.views[1].format, "a2ui.v1");
});

test("buildPanelPreviewMessageState assembles a shared a2ui panel wrapper", () => {
  const panel = {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: "Workspace focus",
  };
  const message = buildPanelPreviewMessageState({
    base: {
      id: "preview.dashboard.1",
      thread_id: "preview.thread.dashboard",
      from: "omnyid://workspace/command-bar",
      timestamp: "2026-06-26T00:00:00.000Z",
      type: "agent",
      content: {},
      views: [],
      attachments: [],
    },
    intent: "dashboard_focus",
    subtype: "dashboard_panel",
    panel,
  });

  assert.equal(message.type, "agent");
  assert.equal(message.subtype, "dashboard_panel");
  assert.equal(message.content, panel);
  assert.deepEqual(message.metadata, {
    origin: "workspace_command_preview",
    intent: "dashboard_focus",
  });
  assert.deepEqual(message.views, [
    {
      format: "a2ui.v1",
      priority: 100,
      content: panel,
    },
  ]);
});
