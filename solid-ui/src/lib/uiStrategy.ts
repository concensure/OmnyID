// @locs-version: 1.0
export type UiRenderZone = "solid_shell" | "a2ui" | "hybrid";

export type UiRenderStrategy = {
  zone: UiRenderZone;
  zoneLabel: string;
  shortLabel: string;
  description: string;
};

const SOLID_SHELL_STRATEGY: UiRenderStrategy = {
  zone: "solid_shell",
  zoneLabel: "Solid Shell",
  shortLabel: "Solid",
  description: "Native SolidJS surface for high-frequency or complex interaction.",
};

const A2UI_STRATEGY: UiRenderStrategy = {
  zone: "a2ui",
  zoneLabel: "Pure A2UI",
  shortLabel: "A2UI",
  description: "Agent-declared contract rendered without custom interaction logic.",
};

const HYBRID_STRATEGY: UiRenderStrategy = {
  zone: "hybrid",
  zoneLabel: "Hybrid",
  shortLabel: "Hybrid",
  description: "Agent data rendered through A2UI or structured content, enhanced by SolidJS behavior.",
};

const STRATEGY_BY_FORMAT: Record<string, UiRenderStrategy> = {
  email: SOLID_SHELL_STRATEGY,
  canvas: SOLID_SHELL_STRATEGY,
  table: HYBRID_STRATEGY,
  chart_view: HYBRID_STRATEGY,
  media_card: HYBRID_STRATEGY,
  calendar: SOLID_SHELL_STRATEGY,
  attachments: HYBRID_STRATEGY,
  approvals: HYBRID_STRATEGY,
  search_result: HYBRID_STRATEGY,
  task_card: HYBRID_STRATEGY,
  generative_card: HYBRID_STRATEGY,
  "a2ui.v1": A2UI_STRATEGY,
  a2ui_render: A2UI_STRATEGY,
  ui_presentation: HYBRID_STRATEGY,
  ui_blueprint: HYBRID_STRATEGY,
  blueprint: HYBRID_STRATEGY,
  ledger_diff: HYBRID_STRATEGY,
  ledger_board: HYBRID_STRATEGY,
  multi_edit: HYBRID_STRATEGY,
  shell_result: HYBRID_STRATEGY,
  planning_result: HYBRID_STRATEGY,
  export_request: HYBRID_STRATEGY,
  export_result: HYBRID_STRATEGY,
  inbox_canvas: HYBRID_STRATEGY,
  inbox_thread_dashboard: SOLID_SHELL_STRATEGY,
  parsed_document: HYBRID_STRATEGY,
  transcript: HYBRID_STRATEGY,
  supertag_grid: SOLID_SHELL_STRATEGY,
  formula: HYBRID_STRATEGY,
  unknown: HYBRID_STRATEGY,
};

export function uiRenderStrategyForFormat(format: string): UiRenderStrategy {
  return STRATEGY_BY_FORMAT[format] ?? HYBRID_STRATEGY;
}
