// @locs-version: 1.0
export function createCommandPreviewMessageBase(copy) {
  const timestamp = copy.timestamp ?? new Date().toISOString();
  return {
    id: `preview.${copy.intent}.${timestamp}`,
    thread_id: `preview.thread.${copy.intent}`,
    from: "omnyid://workspace/command-bar",
    to: ["omnyid://workspace/user"],
    timestamp,
    type: "agent",
    subtype: "preview",
    content: {},
    metadata: { origin: "workspace_command_preview" },
    views: [],
    attachments: [],
    references: [],
    encryption: null,
  };
}

export function normalizeCommandPreviewSourceLinks(links) {
  return (links ?? []).map((link) => ({
    title: link.title,
    url: link.url,
    snippet: link.kind === "source" ? "Source link" : link.kind,
    origin: link.origin ?? null,
  }));
}

export function buildSearchPreviewMessageState(copy) {
  const bullets = (copy.bullets ?? []).filter(Boolean);
  const searchContent = {
    query: copy.query,
    summary: copy.summary,
    bullets,
    sources: copy.sourceLinks,
    ...(copy.localRouterPreview ? { local_router_preview: copy.localRouterPreview } : {}),
  };

  return {
    ...copy.base,
    type: "research",
    subtype: "content",
    content: {
      ...searchContent,
      kind: "web_research",
    },
    metadata: {
      origin: "workspace_command_preview",
      intent: copy.intent,
      source_count: copy.sourceLinks.length,
    },
    views: [
      {
        format: "search_result",
        priority: 100,
        content: searchContent,
      },
      {
        format: "a2ui.v1",
        priority: 80,
        content: copy.a2uiCompanion,
      },
    ],
  };
}

export function buildTaskPreviewMessageState(copy) {
  const firstBullet = copy.bullets?.[0] ?? "";
  const description = copy.summary === firstBullet || !firstBullet
    ? copy.summary
    : `${copy.summary}\n${firstBullet}`;
  const taskContent = {
    kind: "task_preview",
    title: copy.query || "Task",
    description,
    priority: "normal",
    task_type: "general",
    status: "pending",
  };

  return {
    ...copy.base,
    type: "task",
    subtype: "card",
    content: taskContent,
    metadata: {
      origin: "workspace_command_preview",
      intent: copy.intent,
    },
    views: [
      {
        format: "task_card",
        priority: 100,
        content: taskContent,
      },
    ],
  };
}

export function buildNotePreviewMessageState(copy) {
  const noteContent = {
    kind: "workspace_note",
    title: copy.query || "Note",
    blocks: [{ type: "paragraph", text: copy.summary }],
  };

  return {
    ...copy.base,
    type: "note",
    subtype: "content",
    content: noteContent,
    metadata: {
      origin: "workspace_command_preview",
      intent: copy.intent,
    },
    views: [
      {
        format: "canvas",
        priority: 100,
        content: noteContent,
      },
    ],
  };
}

export function buildSchedulePreviewMessageState(copy) {
  const events = (copy.bullets ?? []).map((bullet, index) => ({
    id: `preview-event-${index}`,
    title: bullet,
    start: copy.timestamp,
    description: copy.summary,
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
  }));
  const calendarContent = {
    kind: "schedule_plan",
    title: copy.query || "Schedule preview",
    description: copy.summary,
    events,
  };

  return {
    ...copy.base,
    type: "calendar",
    subtype: "plan",
    content: calendarContent,
    metadata: {
      origin: "workspace_command_preview",
      intent: copy.intent,
    },
    views: [
      {
        format: "calendar",
        priority: 100,
        content: calendarContent,
      },
    ],
  };
}

export function buildPresentationPreviewMessageState(copy) {
  const presentationContent = {
    query: copy.query,
    summary: copy.summary,
    bullets: copy.bullets ?? [],
    sources: (copy.links ?? []).map((link) => ({ title: link.title, url: link.url })),
  };

  return {
    ...copy.base,
    type: "agent",
    subtype: "ui_presentation",
    content: presentationContent,
    metadata: {
      origin: "workspace_command_preview",
      intent: copy.intent,
    },
    views: [
      {
        format: "ui_presentation",
        priority: 100,
        content: presentationContent,
      },
    ],
  };
}

export function buildOrchestrationPreviewMessageState(copy) {
  const generativeContent = {
    card_id: copy.cardId ?? "card.preview.local",
    query: copy.query,
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
        content: {
          text: copy.summary,
        },
      },
      {
        id: "progress",
        type: "progress",
        order: 2,
        status: "running",
        content: {
          label: "Planning the orchestration path",
          value: 0.2,
        },
      },
      {
        id: "plan",
        type: "plan",
        order: 3,
        status: "pending",
        content: {
          steps: (copy.bullets ?? []).length > 0 ? copy.bullets : ["Break the goal into structured tasks"],
        },
      },
    ],
  };

  return {
    ...copy.base,
    type: "agent",
    subtype: "orchestration_card",
    content: {
      kind: "orchestration",
      card: generativeContent,
    },
    metadata: {
      origin: "workspace_command_preview",
      intent: copy.intent,
    },
    views: [
      {
        format: "generative_card",
        priority: 100,
        content: generativeContent,
      },
      {
        format: "a2ui.v1",
        priority: 80,
        content: copy.a2uiCompanion,
      },
    ],
  };
}

export function buildPanelPreviewMessageState(copy) {
  return {
    ...copy.base,
    type: "agent",
    subtype: copy.subtype,
    content: copy.panel,
    metadata: {
      origin: "workspace_command_preview",
      intent: copy.intent,
    },
    views: [
      {
        format: "a2ui.v1",
        priority: 100,
        content: copy.panel,
      },
    ],
  };
}
