// @locs-version: 2.0
import type {
  WeddingPresentationAction,
  WeddingPresentationCard,
  WeddingPresentationSection,
  WeddingPresentationSectionId,
  WeddingPresentationState,
} from "@/lib/weddingPresentationState";

export type WeddingRichResponseBlockKind =
  | "text"
  | "map"
  | "timeline"
  | "legal"
  | "table"
  | "task"
  | "draft"
  | "artifact"
  | "continue";

export type WeddingRichResponseAction = WeddingPresentationAction & {
  actionId: string;
  accessibleLabel: string;
};

export type WeddingRichResponseBlock = {
  id: string;
  kind: WeddingRichResponseBlockKind;
  sectionId: WeddingPresentationSectionId;
  title: string;
  body: string;
  badges: string[];
  evidenceLabel: string;
  layoutHint: "hero" | "wide" | "split" | "compact";
  primaryAction: WeddingRichResponseAction | null;
  secondaryAction: WeddingRichResponseAction | null;
};

export type WeddingRichResponseSection = {
  id: WeddingPresentationSectionId;
  title: string;
  description: string;
  layoutHint: "hero" | "media" | "timeline" | "cards" | "actions";
  blocks: WeddingRichResponseBlock[];
};

export type WeddingRichResponseRendererState = {
  renderer: "wedding_travel_style_response";
  title: string;
  subtitle: string;
  heroLabel: string;
  workspaceId: string;
  weddingPlanId: string;
  sourceResponseId: string | null;
  primaryAction: WeddingRichResponseAction;
  sections: WeddingRichResponseSection[];
  continueChatAction: WeddingRichResponseAction | null;
  accessibilityFallbackLabel: string;
};

const SECTION_LAYOUT: Record<WeddingPresentationSectionId, WeddingRichResponseSection["layoutHint"]> = {
  overview: "hero",
  map: "media",
  timeline: "timeline",
  legal: "cards",
  budget: "cards",
  vendors: "cards",
  recommendations: "cards",
  decisions: "cards",
  tasks: "actions",
  drafts: "actions",
  artifacts: "cards",
  continue: "actions",
};

const BLOCK_KIND: Record<WeddingPresentationSectionId, WeddingRichResponseBlockKind> = {
  overview: "text",
  map: "map",
  timeline: "timeline",
  legal: "legal",
  budget: "table",
  vendors: "table",
  recommendations: "text",
  decisions: "artifact",
  tasks: "task",
  drafts: "draft",
  artifacts: "artifact",
  continue: "continue",
};

function actionId(action: WeddingPresentationAction): string {
  return [
    "wedding",
    action.kind,
    action.sectionId ?? "section",
    action.artifactId ?? action.responseWorkspaceId,
  ].join(":");
}

function richAction(action: WeddingPresentationAction | null): WeddingRichResponseAction | null {
  if (!action) return null;
  return {
    ...action,
    actionId: actionId(action),
    accessibleLabel: `${action.label} for ${action.sectionId?.replace(/_/g, " ") ?? "wedding planning"}`,
  };
}

function blockLayout(sectionId: WeddingPresentationSectionId, cardIndex: number): WeddingRichResponseBlock["layoutHint"] {
  if (sectionId === "overview" && cardIndex === 0) return "hero";
  if (sectionId === "map" || sectionId === "timeline" || sectionId === "legal") return "wide";
  if (sectionId === "budget" || sectionId === "vendors") return "split";
  return "compact";
}

function blockFromCard(card: WeddingPresentationCard, cardIndex: number): WeddingRichResponseBlock {
  return {
    id: card.id,
    kind: BLOCK_KIND[card.sectionId],
    sectionId: card.sectionId,
    title: card.title,
    body: card.body,
    badges: card.badges,
    evidenceLabel: card.evidenceLabel,
    layoutHint: blockLayout(card.sectionId, cardIndex),
    primaryAction: richAction(card.primaryAction),
    secondaryAction: richAction(card.secondaryAction),
  };
}

function sectionFromPresentation(section: WeddingPresentationSection): WeddingRichResponseSection {
  return {
    id: section.id,
    title: section.title,
    description: section.description,
    layoutHint: SECTION_LAYOUT[section.id],
    blocks: section.cards.map(blockFromCard),
  };
}

export function buildWeddingRichResponseRendererState(
  presentation: WeddingPresentationState,
): WeddingRichResponseRendererState {
  const sections = presentation.sections.map(sectionFromPresentation);
  const continueChatAction = sections
    .flatMap((section) => section.blocks)
    .map((block) => block.primaryAction)
    .find((action) => action?.kind === "continue_chat") ?? null;
  return {
    renderer: "wedding_travel_style_response",
    title: presentation.title,
    subtitle: presentation.subtitle,
    heroLabel: presentation.heroLabel,
    workspaceId: presentation.workspace.metadata.responseWorkspaceId,
    weddingPlanId: presentation.workspace.metadata.weddingPlanId,
    sourceResponseId: presentation.workspace.metadata.sourceResponseId,
    primaryAction: richAction(presentation.primaryAction) as WeddingRichResponseAction,
    sections,
    continueChatAction,
    accessibilityFallbackLabel: "",
  };
}
