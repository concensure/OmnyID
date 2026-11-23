// @locs-version: 1.0
export type CommandPreviewSourceLink = {
  title: string;
  url: string;
  snippet: string;
  origin?: string | null;
};

export declare function createCommandPreviewMessageBase(copy: {
  intent: string;
  timestamp?: string | null;
}): Record<string, unknown>;

export declare function normalizeCommandPreviewSourceLinks(
  links: Array<{ title: string; url: string; kind: string; origin?: string | null }> | null | undefined,
): CommandPreviewSourceLink[];

export declare function buildSearchPreviewMessageState(copy: {
  base: Record<string, unknown>;
  intent: string;
  query: string;
  summary: string;
  bullets?: string[] | null;
  sourceLinks: CommandPreviewSourceLink[];
  localRouterPreview?: Record<string, unknown> | null;
  a2uiCompanion: Record<string, unknown>;
}): Record<string, unknown>;

export declare function buildTaskPreviewMessageState(copy: {
  base: Record<string, unknown>;
  intent: string;
  query: string;
  summary: string;
  bullets?: string[] | null;
}): Record<string, unknown>;

export declare function buildNotePreviewMessageState(copy: {
  base: Record<string, unknown>;
  intent: string;
  query: string;
  summary: string;
}): Record<string, unknown>;

export declare function buildSchedulePreviewMessageState(copy: {
  base: Record<string, unknown>;
  intent: string;
  query: string;
  summary: string;
  bullets?: string[] | null;
  timestamp: string;
}): Record<string, unknown>;

export declare function buildPresentationPreviewMessageState(copy: {
  base: Record<string, unknown>;
  intent: string;
  query: string;
  summary: string;
  bullets?: string[] | null;
  links?: Array<{ title: string; url: string }> | null;
}): Record<string, unknown>;

export declare function buildOrchestrationPreviewMessageState(copy: {
  base: Record<string, unknown>;
  intent: string;
  query: string;
  summary: string;
  bullets?: string[] | null;
  cardId?: string | null;
  a2uiCompanion: Record<string, unknown>;
}): Record<string, unknown>;

export declare function buildPanelPreviewMessageState(copy: {
  base: Record<string, unknown>;
  intent: string;
  subtype: string;
  panel: Record<string, unknown>;
}): Record<string, unknown>;
