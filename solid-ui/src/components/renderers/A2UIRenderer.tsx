import { createMemo, createSignal, For, Show } from "solid-js";
import {
  watcherMessageSummary,
} from "afp-ts/continuity";
import type { AfpMessage, AfpView } from "@/lib/api";
import { apiUrlForPath, safeHref, saveThreadMessage } from "@/lib/api";
import type { EditorPayload } from "@/lib/editorPayload";
import { useViewport } from "@/context/ViewportContext";
import { renderMarkdown } from "@/lib/markdownRenderer";
import { TrustSummaryBlocks } from "@/components/renderers/TrustSummaryBlocks";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { normalizeA2UIRootNodes } from "@/lib/a2uiContentState";
import { resolveA2UIDiffViewState } from "@/lib/a2uiDiffViewState";
import { resolveA2UIRichTextEditorState } from "@/lib/a2uiRichTextEditorState";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import {
  trustSummaryStateFromRecord,
  type TrustSummaryState,
} from "@/lib/trustFieldState";

// Maps viewport class to an AFP render mode string
type RenderMode = "glance" | "compact" | "standard" | "full";

type A2UILayout =
  | { type: "stack"; gap?: "sm" | "md" | "lg" }
  | { type: "grid"; columns?: number; gap?: "sm" | "md" | "lg" };

type A2UINode = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: A2UINode[];
};

type A2UIContent = {
  schema_version?: string;
  kind?: string;
  title?: string;
  description?: string;
  layout?: A2UILayout;
  nodes?: A2UINode[];
};

type A2UIRendererState = {
  renderMode: RenderMode;
  title: string;
  description: string;
  headerClass: string;
  titleClass: string;
  descriptionClass: string;
  showHeader: boolean;
  showDescription: boolean;
  watcherSummary: string;
  watcherSummaryClass: string;
  showWatcherSummary: boolean;
  layoutClass: string;
  nodes: A2UINode[];
  showNodes: boolean;
};

const A2UI_SECTION_CLASS = "space-y-3";
const A2UI_SECTION_TITLE_CLASS = "text-sm font-semibold text-on-surface";
const A2UI_UNSUPPORTED_NODE_CLASS =
  "rounded-lg border border-white/20 bg-white/10 p-3 text-sm text-on-surface-variant";
const A2UI_ROOT_CLASS = "space-y-4";
const A2UI_STAT_ROW_FOCUS_MARKER = "->";

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function normalizeA2UILayout(value: unknown): A2UILayout {
  if (!isRecord(value)) return { type: "stack", gap: "md" };
  const gap = value.gap === "sm" || value.gap === "md" || value.gap === "lg" ? value.gap : "md";
  if (value.type === "grid") {
    return { type: "grid", columns: asNumber(value.columns, 2), gap };
  }
  return { type: "stack", gap };
}

type ComparisonRow = { label: string; values: string[] };
type TableColumnView = { label: string };
type TableCellView = { text: string };
type TableRowView = { cells: TableCellView[] };
type ComparisonTableRowView = { label: string; cells: TableCellView[] };
type ComparisonActionView = {
  key: string;
  label: string;
  href: string;
  enabled: boolean;
  external: boolean;
  advisory: boolean;
};
type ComparisonSelectionView = {
  modeLabel: string;
  minimumLabel: string;
  confirmLabel: string;
  showSelection: boolean;
};
type TablePairView = { label: string; value: string };
type TableCompactRowView = { keyText: string; valueText: string };

type StatsGridItemView = { label: string; value: string };
type TableState = { caption: string; columns: string[]; rows: unknown[][] };
type MetadataBadgeViewItem = { text: string; className: string };
type LinkListItemView = {
  title: string;
  subtitle: string;
  url: string;
  safeUrl: string;
  showSubtitle: boolean;
  showUrl: boolean;
};
type VendorRecommendationCardView = {
  choiceId: string;
  rank: number;
  title: string;
  imageUrl: string;
  imageAlt: string;
  scoreLabel: string;
  provider: string;
  sourceUrl: string;
  websiteUrl: string;
  mapUrl: string;
  rationaleLabels: string[];
  preferenceMatch: string;
  situationFit: string;
  verificationLabel: string;
  showImage: boolean;
  showWebsite: boolean;
  showMap: boolean;
};
type VendorRecommendationCardsNodeState = {
  renderMode: RenderMode;
  title: string;
  description: string;
  cards: VendorRecommendationCardView[];
  visibleCards: VendorRecommendationCardView[];
  firstCard: VendorRecommendationCardView | null;
  showTitle: boolean;
  showDescription: boolean;
  showCards: boolean;
  gridClass: string;
};
type ConstraintBadgeItem = { kind: string; label: string };
type InsightChipViewItem = { label: string };
type StatRowMetricView = { label: string; value: string };
type StatRowFocusItemView = { text: string };
type BulletListItemView = { text: string };
type ActionChipViewItem = { label: string };
type ConstraintBadgeViewItem = { text: string };
type NoteNodeState = {
  renderMode: RenderMode;
  title: string;
  summary: string;
  body: string;
  glanceTitle: string;
  glanceSummaryLines: string[];
  metadataBadges: MetadataBadgeViewItem[];
  trustSummary: TrustSummaryState;
  showTitle: boolean;
  showSummary: boolean;
  showBody: boolean;
  showMetadataBadges: boolean;
};
type CalloutNodeState = {
  renderMode: RenderMode;
  toneClass: string;
  title: string;
  body: string;
  glanceTitle: string;
  glanceBodyText: string;
  bodyClass: string;
  showTitle: boolean;
  showBody: boolean;
};
type ComparisonTableNodeState = {
  renderMode: RenderMode;
  title: string;
  description: string;
  headerColumns: TableColumnView[];
  rows: ComparisonTableRowView[];
  columnActions: Array<{ vendorLabel: string; actions: ComparisonActionView[] }>;
  footerActions: ComparisonActionView[];
  selection: ComparisonSelectionView;
  glanceTitle: string;
  glanceSummaryLines: string[];
  trustSummary: TrustSummaryState;
  showTitle: boolean;
  showDescription: boolean;
  showActions: boolean;
};
type BulletListNodeState = {
  renderMode: RenderMode;
  title: string;
  items: BulletListItemView[];
  firstItem: string;
  glanceText: string;
  showTitle: boolean;
  showItems: boolean;
};
type TextNodeState = {
  renderMode: RenderMode;
  label: string;
  value: string;
  glanceValue: string;
  showLabel: boolean;
  showValue: boolean;
  valueClass: string;
};
type RichTextNodeState = {
  renderMode: RenderMode;
  markdown: string;
  plainTextPreview: string;
  displayText: string;
  showMarkdown: boolean;
};
type CodeNodeState = {
  title: string;
  code: string;
  codeClass: string;
  showTitle: boolean;
  showCode: boolean;
};
type DiffViewNodeState = {
  renderMode: RenderMode;
  title: string;
  description: string;
  beforePanel: { label: string; body: string; className: string; labelClass: string };
  afterPanel: { label: string; body: string; className: string; labelClass: string };
  patch: string;
  patchLabel: string;
  patchPanelClass: string;
  patchCodeClass: string;
  emptyStateText: string;
  emptyStateClass: string;
  glanceFallbackText: string;
  showGlanceFallback: boolean;
  showDescription: boolean;
  showBeforeAfter: boolean;
  showPatch: boolean;
  showEmptyState: boolean;
  splitClass: string;
};
type SectionNodeState = {
  title: string;
  layoutClass: string;
  childNodes: A2UINode[];
  showTitle: boolean;
  showChildren: boolean;
};
type RichTextEditorNodeState = {
  renderMode: RenderMode;
  editorClass: string;
  showGlanceFallback: boolean;
  showSubmitError: boolean;
  showSavedNotice: boolean;
  submitErrorText: string;
  savedNoticeText: string;
} & ReturnType<typeof resolveA2UIRichTextEditorState>;
type A2UINodeRendererState = {
  node: A2UINode;
  props: Record<string, unknown>;
  renderMode: RenderMode;
  children: A2UINode[];
  isGlance: boolean;
  isCompact: boolean;
};
type InsightLineState = {
  renderMode: RenderMode;
  icon: string;
  title: string;
  glanceText: string;
  secondary: string;
  badgeText: string;
  badgeClass: string;
  actionChips: InsightChipViewItem[];
  actionChipClass: string;
  showIcon: boolean;
  showBadge: boolean;
  showSecondary: boolean;
  showActionChips: boolean;
  showContent: boolean;
};
type StatsGridState = {
  renderMode: RenderMode;
  items: StatsGridItemView[];
  firstItem: StatsGridItemView | null;
  gridClass: string;
  showItems: boolean;
};
type TableViewState = {
  renderMode: RenderMode;
  caption: string;
  columns: TableColumnView[];
  rows: TableRowView[];
  glancePairs: TablePairView[];
  compactRows: TableCompactRowView[];
  showCaption: boolean;
  showRows: boolean;
};
type LinkListState = {
  renderMode: RenderMode;
  title: string;
  visibleItems: LinkListItemView[];
  showTitle: boolean;
  showItems: boolean;
};
type ConstraintBadgesState = {
  renderMode: RenderMode;
  items: ConstraintBadgeViewItem[];
  countLabel: string;
  glanceText: string;
  chipClass: string;
  showItems: boolean;
};
type ActionChipsState = {
  renderMode: RenderMode;
  actions: ActionChipViewItem[];
  countLabel: string;
  glanceText: string;
  buttonClass: string;
  showActions: boolean;
};
type StatRowState = {
  renderMode: RenderMode;
  title: string;
  metrics: StatRowMetricView[];
  firstMetric: StatRowMetricView | null;
  focusItems: StatRowFocusItemView[];
  toneClass: string;
  metricsGridClass: string;
  glanceMetricText: string;
  showTitle: boolean;
  showMetrics: boolean;
  showFocusItems: boolean;
};

function normalizeComparisonRows(value: unknown): ComparisonRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!isRecord(entry)) return null;
      return {
        label: asString(entry.label),
        values: Array.isArray(entry.values)
          ? entry.values.map((cell) => String(cell ?? ""))
          : [],
      };
    })
    .filter((row): row is ComparisonRow => Boolean(row?.label));
}

function normalizeRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function normalizeStatsGridItems(value: unknown): StatsGridItemView[] {
  return normalizeRecordArray(value).map((item) => ({
    label: asString(item.label),
    value: asString(item.value),
  }));
}

function normalizeTableColumnViews(value: unknown): TableColumnView[] {
  return Array.isArray(value) ? value.map((column) => ({ label: String(column) })) : [];
}

function normalizeTableRowViews(value: unknown): TableRowView[] {
  return Array.isArray(value)
    ? value
        .filter(Array.isArray)
        .map((row) => ({
          cells: row.map((cell) => ({ text: cell == null ? "" : String(cell) })),
        }))
    : [];
}

function normalizeTableGlancePairs(
  columns: TableColumnView[],
  firstRow: TableRowView | null,
): TablePairView[] {
  return columns
    .slice(0, 2)
    .map((column, index) => ({
      label: column.label,
      value: firstRow?.cells[index]?.text ?? "",
    }))
    .filter((pair) => Boolean(pair.label || pair.value));
}

function normalizeTableCompactRows(rows: TableRowView[]): TableCompactRowView[] {
  return rows.map((row) => ({
    keyText: row.cells[0]?.text ?? "",
    valueText: row.cells[1]?.text ?? "",
  }));
}

function normalizeComparisonTableRowViews(value: unknown): ComparisonTableRowView[] {
  return normalizeComparisonRows(value).map((row) => ({
    label: row.label,
    cells: row.values.map((cell) => ({ text: cell })),
  }));
}

function normalizeComparisonActionViews(value: unknown, keyPrefix: string): ComparisonActionView[] {
  return normalizeRecordArray(value).flatMap((action, index): ComparisonActionView[] => {
    const label = asString(action.label).trim();
    const kind = asString(action.kind, "action").trim();
    if (!label && !kind) return [];
    const href = safeExternalHref(action.href);
    return [{
      key: `${keyPrefix}:${kind || "action"}:${index}`,
      label: label || kind.replaceAll("_", " "),
      href,
      enabled: action.enabled !== false,
      external: action.external === true || Boolean(href),
      advisory: !href,
    }];
  });
}

function normalizeComparisonColumnActionViews(value: unknown): Array<{ vendorLabel: string; actions: ComparisonActionView[] }> {
  return normalizeRecordArray(value).flatMap((entry, index): Array<{ vendorLabel: string; actions: ComparisonActionView[] }> => {
    const vendorLabel = asString(entry.vendor_label, asString(entry.choice_id, `Choice ${index + 1}`));
    const actions = normalizeComparisonActionViews(entry.actions, `column:${index}`);
    return actions.length > 0 ? [{ vendorLabel, actions }] : [];
  });
}

function normalizeComparisonSelectionView(value: unknown): ComparisonSelectionView {
  if (!isRecord(value)) {
    return { modeLabel: "", minimumLabel: "", confirmLabel: "", showSelection: false };
  }
  const mode = asString(value.mode).trim().toLowerCase();
  const minSelected = Math.max(0, Math.floor(asNumber(value.min_selected, 0)));
  const confirmAction = isRecord(value.confirm_action) ? value.confirm_action : {};
  const confirmLabel = asString(confirmAction.label).trim();
  const modeLabel = mode === "multi"
    ? "Choose one or more vendors"
    : mode === "single"
      ? "Choose one vendor"
      : "";
  const minimumLabel = minSelected > 0
    ? `Minimum ${minSelected} selection${minSelected === 1 ? "" : "s"}`
    : "";
  return {
    modeLabel,
    minimumLabel,
    confirmLabel,
    showSelection: Boolean(modeLabel || minimumLabel || confirmLabel),
  };
}

function normalizeTableState(props: Record<string, unknown>): TableState {
  const rawColumns = props["columns"];
  const rawRows = props["rows"];
  return {
    caption: asString(props.caption),
    columns: Array.isArray(rawColumns) ? rawColumns.map((column) => String(column)) : [],
    rows: Array.isArray(rawRows) ? rawRows.filter(Array.isArray) as unknown[][] : [],
  };
}

function normalizeLinkListItems(value: unknown): LinkListItemView[] {
  return normalizeRecordArray(value).map((item) => ({
    title: asString(item.title, asString(item.url, "Link")),
    subtitle: asString(item.subtitle),
    url: asString(item.url),
    safeUrl: safeHref(asString(item.url)),
    showSubtitle: Boolean(asString(item.subtitle)),
    showUrl: Boolean(asString(item.url)),
  }));
}

function normalizeConstraintBadgeItems(value: unknown): ConstraintBadgeItem[] {
  return normalizeRecordArray(value).map((item) => ({
    kind: asString(item.kind).replaceAll("_", " "),
    label: asString(item.label),
  }));
}

function normalizeActionItems(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function normalizeBulletListItemViews(value: unknown): BulletListItemView[] {
  return asStringArray(value).map((text) => ({ text }));
}

function normalizeConstraintBadgeViewItems(value: unknown): ConstraintBadgeViewItem[] {
  return normalizeConstraintBadgeItems(value).map((item) => ({
    text: `${item.kind}: ${item.label}`,
  }));
}

function normalizeActionChipViewItems(value: unknown): ActionChipViewItem[] {
  return normalizeActionItems(value).map((label) => ({ label }));
}

function resolveTrustSummaryState(props: Record<string, unknown>): TrustSummaryState {
  return trustSummaryStateFromRecord(props);
}

function resolveGlanceSummaryLines(trustSummary: TrustSummaryState): string[] {
  const lines: string[] = [];
  if (trustSummary.boundedReason) lines.push(trustSummary.boundedReason);
  if (trustSummary.showSelectionReason && trustSummary.selectionReason) {
    lines.push(trustSummary.selectionReason);
  }
  return lines;
}

function resolveNoteMetadataBadges(props: Record<string, unknown>): MetadataBadgeViewItem[] {
  const badges: MetadataBadgeViewItem[] = [];
  const channel = asString(props.channel);
  const status = asString(props.status);
  const reviewRequired = props.review_required === true;

  if (channel) {
    badges.push({
      text: channel,
      className:
        "rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/80",
    });
  }
  if (status) {
    badges.push({
      text: status,
      className:
        "rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-primary",
    });
  }
  if (reviewRequired) {
    badges.push({
      text: "review required",
      className:
        "rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-amber-200",
    });
  }

  return badges;
}

function normalizeA2UI(
  viewContent: Record<string, unknown>,
  msgContent: Record<string, unknown>,
): A2UIContent {
  const raw = isRecord(viewContent) && Object.keys(viewContent).length > 0 ? viewContent : msgContent;
  const nodes = normalizeA2UIRootNodes(raw);

  return {
    schema_version: asString(raw.schema_version),
    kind: asString(raw.kind),
    title: asString(raw.title) || undefined,
    description: asString(raw.description) || undefined,
    layout: normalizeA2UILayout(raw.layout),
    nodes,
  };
}

function safeExternalHref(value: unknown): string {
  const href = safeHref(value);
  if (/^\/wedding\/vendor-photo\/google\?name=/i.test(href)) return apiUrlForPath(href);
  if (!/^https?:\/\//i.test(href)) return "";
  return href;
}

function normalizeVendorRecommendationCards(value: unknown): VendorRecommendationCardView[] {
  return asRecordArray(value).flatMap((card): VendorRecommendationCardView[] => {
    const title = asString(card.title).trim();
    if (!title) return [];
    const sourceUrl = safeExternalHref(card.source_url);
    const websiteUrl = safeExternalHref(card.website_url);
    const mapUrl = safeExternalHref(card.map_url);
    const imageUrl = safeExternalHref(card.image_url);
    const rank = Math.max(1, asNumber(card.rank, 1));
    return [{
      choiceId: asString(card.choice_id, `${rank}:${title}`),
      rank,
      title,
      imageUrl,
      imageAlt: asString(card.image_alt, `${title} venue image`),
      scoreLabel: asString(card.score_label, "Ranked option"),
      provider: asString(card.provider, "Search"),
      sourceUrl,
      websiteUrl,
      mapUrl,
      rationaleLabels: asStringArray(card.rationale_labels).slice(0, 5),
      preferenceMatch: asString(card.preference_match, "Review manually"),
      situationFit: asString(card.situation_fit, "Fit requires source-page review."),
      verificationLabel: asString(card.verification_label, "Confirm availability, inclusions, and quote before outreach."),
      showImage: Boolean(imageUrl),
      showWebsite: Boolean(websiteUrl || sourceUrl),
      showMap: Boolean(mapUrl),
    }];
  }).sort((left, right) => left.rank - right.rank).slice(0, 5);
}

function resolveVendorRecommendationCardsNodeState(
  props: Record<string, unknown>,
  renderMode: RenderMode,
): VendorRecommendationCardsNodeState {
  const cards = normalizeVendorRecommendationCards(props.cards);
  const visibleCards = renderMode === "glance" ? cards.slice(0, 1) : renderMode === "compact" ? cards.slice(0, 3) : cards;
  return {
    renderMode,
    title: asString(props.title, "Recommended vendors"),
    description: asString(props.description),
    cards,
    visibleCards,
    firstCard: cards[0] ?? null,
    showTitle: Boolean(asString(props.title, "Recommended vendors")) && renderMode !== "glance",
    showDescription: Boolean(asString(props.description)) && renderMode !== "glance",
    showCards: visibleCards.length > 0,
    gridClass: renderMode === "compact" ? "grid gap-3" : "grid gap-3 lg:grid-cols-3",
  };
}

function gapClass(gap: string | undefined): string {
  switch (gap) {
    case "sm": return "gap-2";
    case "lg": return "gap-5";
    default:   return "gap-3";
  }
}

function layoutClass(layout: A2UILayout | undefined): string {
  if (!layout || layout.type === "stack") return `flex flex-col ${gapClass(layout?.gap)}`;
  const columns = Math.min(Math.max(asNumber(layout.columns, 2), 1), 4);
  const gridCols = ["grid-cols-1", "grid-cols-2", "grid-cols-3", "grid-cols-4"][columns - 1] ?? "grid-cols-2";
  return `grid ${gridCols} ${gapClass(layout.gap)}`;
}

function renderModeFromViewport(viewport: ReturnType<typeof useViewport>["viewport"] extends () => infer T ? T : never): RenderMode {
  switch (viewport) {
    case "watch": return "glance";
    case "phone": return "compact";
    case "tablet": return "standard";
    default: return "full";
  }
}

function resolveA2UIRendererState(props: {
  message: AfpMessage;
  view?: AfpView;
  viewport: ReturnType<typeof useViewport>["viewport"] extends () => infer T ? T : never;
}): A2UIRendererState {
  const viewContent = afpRecord(props.message.encryption ? undefined : props.view?.content);
  const messageContent = afpRecord(decryptedDisplayContent(props.message));
  const ui = normalizeA2UI(viewContent, messageContent);
  const renderMode = renderModeFromViewport(props.viewport);
  const title = ui.title ?? "";
  const description = ui.description ?? "";
  const watcherSummary = watcherMessageSummary(props.message) ?? "";

  return {
    renderMode,
    title,
    description,
    headerClass: "space-y-1",
    titleClass: "text-base font-semibold tracking-tight text-on-surface",
    descriptionClass: "text-sm leading-6 text-on-surface-variant",
    showHeader: Boolean(title || description),
    showDescription: Boolean(description) && renderMode !== "glance",
    watcherSummary,
    watcherSummaryClass:
      "rounded-lg border border-sky-300/18 bg-sky-400/8 px-3 py-2 text-xs leading-5 text-sky-50/90",
    showWatcherSummary: Boolean(watcherSummary) && renderMode !== "glance",
    layoutClass: layoutClass(ui.layout),
    nodes: ui.nodes ?? [],
    showNodes: (ui.nodes ?? []).length > 0,
  };
}

function calloutToneClass(tone: string): string {
  switch (tone) {
    case "success":  return "border-emerald-400/25 bg-emerald-400/10";
    case "warning":  return "border-amber-400/25 bg-amber-400/10";
    case "danger":   return "border-red-400/25 bg-red-400/10";
    case "strategy": return "border-indigo-400/25 bg-indigo-400/10";
    default:         return "border-white/20 bg-white/10";
  }
}

function insightBadgeClass(tone: string): string {
  switch (tone) {
    case "success": return "border-emerald-400/25 bg-emerald-400/15 text-emerald-300";
    case "warning": return "border-amber-400/25 bg-amber-400/15 text-amber-300";
    case "danger": return "border-red-400/25 bg-red-400/15 text-red-300";
    default: return "border-primary/25 bg-primary/15 text-primary";
  }
}

function statRowToneClass(tone: string): string {
  switch (tone) {
    case "warning": return "border-amber-400/25 bg-amber-400/8";
    case "success": return "border-emerald-400/25 bg-emerald-400/8";
    case "danger": return "border-red-400/25 bg-red-400/8";
    case "strategy": return "border-indigo-400/25 bg-indigo-400/8";
    default: return "border-white/20 bg-white/8";
  }
}

function resolveStatsGridState(props: Record<string, unknown>, renderMode: RenderMode): StatsGridState {
  const items = normalizeStatsGridItems(props.items);
  return {
    renderMode,
    items,
    firstItem: items[0] ?? null,
    gridClass:
      renderMode === "compact"
        ? "grid grid-cols-2 gap-2"
        : "grid grid-cols-1 gap-2 sm:grid-cols-2",
    showItems: items.length > 0,
  };
}

function resolveTableViewState(props: Record<string, unknown>, renderMode: RenderMode): TableViewState {
  const tableState = normalizeTableState(props);
  const columns = normalizeTableColumnViews(tableState.columns);
  const rows = normalizeTableRowViews(tableState.rows);
  const firstRow = rows[0] ?? null;
  return {
    renderMode,
    caption: tableState.caption,
    columns,
    rows,
    glancePairs: normalizeTableGlancePairs(columns, firstRow),
    compactRows: normalizeTableCompactRows(rows),
    showCaption: Boolean(tableState.caption),
    showRows: rows.length > 0,
  };
}

function resolveLinkListState(props: Record<string, unknown>, renderMode: RenderMode): LinkListState {
  const items = normalizeLinkListItems(props.items);
  const visibleItems = renderMode === "glance" ? items.slice(0, 1) : items;
  return {
    renderMode,
    title: asString(props.title),
    visibleItems,
    showTitle: renderMode !== "glance" && Boolean(asString(props.title)),
    showItems: visibleItems.length > 0,
  };
}

function resolveConstraintBadgesState(props: Record<string, unknown>, renderMode: RenderMode): ConstraintBadgesState {
  const items = normalizeConstraintBadgeViewItems(props.items);
  return {
    renderMode,
    items,
    countLabel: `${items.length} active`,
    glanceText: `⚡ ${items.length} active`,
    chipClass: `rounded-full border border-red-400/25 bg-red-400/10 text-red-200 px-2.5 py-1 ${renderMode === "compact" ? "text-[10px]" : "text-xs"}`,
    showItems: items.length > 0,
  };
}

function resolveInsightLineState(props: Record<string, unknown>, renderMode: RenderMode): InsightLineState {
  const confidence = asString(props.confidence);
  const badge = asString(props.badge);
  const badgeTone = asString(props.badge_tone);
  const actionChips = normalizeActionChipViewItems(props.action_chips);
  const resolvedTone = badgeTone || (confidence === "high" ? "success" : confidence === "low" ? "warning" : "");
  const badgeText = badge || confidence;
  const title = asString(props.title) || asString(props.primary);

  return {
    renderMode,
    icon: asString(props.icon),
    title,
    glanceText: title,
    secondary: asString(props.secondary),
    badgeText,
    badgeClass: insightBadgeClass(resolvedTone),
    actionChips,
    actionChipClass:
      "cursor-pointer rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs text-on-surface-variant transition-colors hover:bg-white/20",
    showIcon: Boolean(asString(props.icon)),
    showBadge: Boolean(badgeText),
    showSecondary: Boolean(asString(props.secondary)),
    showActionChips: actionChips.length > 0 && renderMode !== "compact",
    showContent: Boolean(title || asString(props.secondary) || badgeText || actionChips.length > 0),
  };
}

function resolveActionChipsState(props: Record<string, unknown>, renderMode: RenderMode): ActionChipsState {
  const actions = normalizeActionChipViewItems(props.actions);
  return {
    renderMode,
    actions,
    countLabel: `${actions.length} action${actions.length !== 1 ? "s" : ""}`,
    glanceText: `${actions.length} action${actions.length !== 1 ? "s" : ""}`,
    buttonClass:
      "rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white/20 active:scale-95",
    showActions: actions.length > 0,
  };
}

function resolveStatRowState(props: Record<string, unknown>, renderMode: RenderMode): StatRowState {
  const metrics = normalizeRecordArray(props.stats).map((stat) => ({
    label: asString(stat.label),
    value: String(stat.value ?? ""),
  }));
  const focusItems = Array.isArray(props.items)
    ? props.items.map((item) => ({ text: String(item) }))
    : [];
  const title = asString(props.title);
  return {
    renderMode,
    title,
    metrics,
    firstMetric: metrics[0] ?? null,
    focusItems,
    toneClass: statRowToneClass(asString(props.tone, "info")),
    metricsGridClass:
      renderMode === "compact"
        ? "grid grid-cols-2 gap-2"
        : "grid grid-cols-2 gap-2 sm:grid-cols-4",
    glanceMetricText: metrics[0] ? `${metrics[0].label}: ${metrics[0].value}` : "",
    showTitle: Boolean(title),
    showMetrics: metrics.length > 0,
    showFocusItems: focusItems.length > 0 && renderMode !== "compact",
  };
}

function resolveNoteNodeState(props: Record<string, unknown>, renderMode: RenderMode): NoteNodeState {
  const title = asString(props.title);
  const summary = asString(props.summary);
  const body = asString(props.body);
  const trustSummary = resolveTrustSummaryState(props);
  const metadataBadges = resolveNoteMetadataBadges(props);
  return {
    renderMode,
    title,
    summary,
    body,
    glanceTitle: title || "Draft note",
    glanceSummaryLines: resolveGlanceSummaryLines(trustSummary),
    metadataBadges,
    trustSummary,
    showTitle: Boolean(title),
    showSummary: Boolean(summary),
    showBody: Boolean(body),
    showMetadataBadges: metadataBadges.length > 0,
  };
}

function resolveCalloutNodeState(props: Record<string, unknown>, renderMode: RenderMode): CalloutNodeState {
  const title = asString(props.title);
  const body = asString(props.body);
  return {
    renderMode,
    toneClass: calloutToneClass(asString(props.tone, "info")),
    title,
    body,
    glanceTitle: title || body.split(" ").slice(0, 8).join(" "),
    glanceBodyText: body,
    bodyClass: `text-sm text-on-surface/90 whitespace-pre-wrap ${renderMode === "compact" ? "line-clamp-2" : ""}`,
    showTitle: Boolean(title),
    showBody: Boolean(body),
  };
}

function resolveComparisonTableNodeState(
  props: Record<string, unknown>,
  renderMode: RenderMode,
): ComparisonTableNodeState {
  const title = asString(props.title);
  const description = asString(props.description);
  const trustSummary = resolveTrustSummaryState(props);
  const columnActions = normalizeComparisonColumnActionViews(props.column_actions);
  const footerActions = normalizeComparisonActionViews(props.footer_actions, "footer");
  const selection = normalizeComparisonSelectionView(props.selection);
  const headerColumns = [
    { label: "Option" },
    ...normalizeTableColumnViews(props.columns),
  ];
  return {
    renderMode,
    title,
    description,
    headerColumns,
    rows: normalizeComparisonTableRowViews(props.rows),
    columnActions,
    footerActions,
    selection,
    glanceTitle: title || "Comparison",
    glanceSummaryLines: resolveGlanceSummaryLines(trustSummary),
    trustSummary,
    showTitle: Boolean(title),
    showDescription: Boolean(description),
    showActions: renderMode !== "glance" && (columnActions.length > 0 || footerActions.length > 0),
  };
}

function resolveBulletListNodeState(props: Record<string, unknown>, renderMode: RenderMode): BulletListNodeState {
  const title = asString(props.title);
  const items = normalizeBulletListItemViews(props.items);
  const firstItem = items[0]?.text ?? "";
  return {
    renderMode,
    title,
    items,
    firstItem,
    glanceText: firstItem,
    showTitle: Boolean(title),
    showItems: items.length > 0,
  };
}

function resolveCodeNodeState(props: Record<string, unknown>): CodeNodeState {
  const title = asString(props.title);
  const code = asString(props.code);
  return {
    title,
    code,
    codeClass:
      "overflow-auto rounded-lg border border-white/15 bg-surface-container-high px-3 py-3 text-xs leading-6 text-on-surface",
    showTitle: Boolean(title),
    showCode: Boolean(code),
  };
}

function resolveTextNodeState(props: Record<string, unknown>, renderMode: RenderMode): TextNodeState {
  const label = asString(props.label);
  const value = asString(props.value);
  return {
    renderMode,
    label,
    value,
    glanceValue: value,
    showLabel: renderMode !== "glance" && Boolean(label),
    showValue: Boolean(value),
    valueClass: `leading-6 text-on-surface whitespace-pre-wrap ${renderMode === "glance" ? "text-xs line-clamp-2" : "text-sm"}`,
  };
}

function resolveRichTextNodeState(props: Record<string, unknown>, renderMode: RenderMode): RichTextNodeState {
  const markdown = asString(props.markdown);
  const plainTextPreview = markdown.replace(/[#*_`>~\[\]()]/g, "").trim();
  return {
    renderMode,
    markdown,
    plainTextPreview,
    displayText: renderMode === "glance" ? plainTextPreview : markdown,
    showMarkdown: Boolean(markdown),
  };
}

function resolveDiffViewNodeState(props: Record<string, unknown>, renderMode: RenderMode): DiffViewNodeState {
  const diff = resolveA2UIDiffViewState(props);
  const showBeforeAfter = Boolean(diff.beforeBody || diff.afterBody);
  const showPatch = Boolean(diff.patch);
  return {
    renderMode,
    title: diff.title,
    description: diff.description,
    beforePanel: {
      label: diff.beforeLabel,
      body: diff.beforeBody || "No prior content provided.",
      className: "space-y-2 rounded-lg border border-red-400/20 bg-red-400/8 p-3",
      labelClass: "font-mono text-[10px] uppercase tracking-[0.16em] text-red-200/85",
    },
    afterPanel: {
      label: diff.afterLabel,
      body: diff.afterBody || "No updated content provided.",
      className: "space-y-2 rounded-lg border border-emerald-400/20 bg-emerald-400/8 p-3",
      labelClass: "font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-200/85",
    },
    patch: diff.patch,
    patchLabel: "Unified diff",
    patchPanelClass: "space-y-2 rounded-lg border border-white/15 bg-surface-container-high p-3",
    patchCodeClass: "overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-on-surface",
    emptyStateText: "No before/after content was provided for this diff.",
    emptyStateClass: "rounded-lg border border-white/15 bg-white/6 p-3 text-xs text-on-surface-variant",
    glanceFallbackText: "Behaviour change preview — open on a larger screen.",
    showGlanceFallback: renderMode === "glance",
    showDescription: Boolean(diff.description),
    showBeforeAfter,
    showPatch,
    showEmptyState: !showBeforeAfter && !showPatch,
    splitClass:
      renderMode === "compact"
        ? "grid grid-cols-1 gap-3"
        : "grid grid-cols-1 gap-3 lg:grid-cols-2",
  };
}

function resolveSectionNodeState(props: Record<string, unknown>, children: A2UINode[]): SectionNodeState {
  const title = asString(props.title);
  return {
    title,
    layoutClass: layoutClass(normalizeA2UILayout(props.layout)),
    childNodes: children,
    showTitle: Boolean(title),
    showChildren: children.length > 0,
  };
}

function resolveRichTextEditorNodeState(props: {
  node: A2UINode;
  message: AfpMessage;
  renderMode: RenderMode;
  submitError: string;
  savedNotice: string;
}): RichTextEditorNodeState {
  const editorState = resolveA2UIRichTextEditorState(props.node.props ?? {}, props.message.thread_id);
  return {
    ...editorState,
    renderMode: props.renderMode,
    editorClass: props.renderMode === "compact" ? "min-h-[180px]" : "min-h-[260px]",
    showGlanceFallback: props.renderMode === "glance",
    showSubmitError: Boolean(props.submitError),
    showSavedNotice: Boolean(props.savedNotice),
    submitErrorText: props.submitError,
    savedNoticeText: props.savedNotice,
  };
}

function resolveA2UINodeRendererState(props: {
  node: A2UINode;
  renderMode: RenderMode;
}): A2UINodeRendererState {
  return {
    node: props.node,
    props: props.node.props ?? {},
    renderMode: props.renderMode,
    children: props.node.children ?? [],
    isGlance: props.renderMode === "glance",
    isCompact: props.renderMode === "compact",
  };
}

// ── Node renderer ─────────────────────────────────────────────────────────────

function A2UIRichTextEditorNode(props: {
  node: A2UINode;
  message: AfpMessage;
  renderMode: () => RenderMode;
}) {
  const [submitError, setSubmitError] = createSignal("");
  const [savedNotice, setSavedNotice] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const editorState = createMemo(() =>
    resolveRichTextEditorNodeState({
      node: props.node,
      message: props.message,
      renderMode: props.renderMode(),
      submitError: submitError(),
      savedNotice: savedNotice(),
    }),
  );

  async function handleSend(payload: EditorPayload) {
    if (saving()) return;
    const state = editorState();
    if (!state.threadId) {
      setSubmitError("This editor needs a thread context before it can save.");
      return;
    }
    setSubmitError("");
    setSavedNotice("");
    setSaving(true);
    try {
      await saveThreadMessage(payload.afpMessage as Record<string, unknown>);
      setSavedNotice(state.mode === "email" ? "Draft saved to this thread." : "Saved to this thread.");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not save this editor content.");
    } finally {
      setSaving(false);
    }
  }

  if (editorState().showGlanceFallback) {
    return (
      <div class="rounded-lg border border-white/20 bg-white/10 p-3 text-xs text-on-surface-variant">
        Rich text editor available on a larger screen.
      </div>
    );
  }

  return (
    <div class="space-y-2 rounded-xl border border-white/15 bg-white/6 p-3">
      <Show when={editorState().showSubmitError}>
        <p class="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs text-red-200">
          {editorState().submitErrorText}
        </p>
      </Show>
      <Show when={editorState().showSavedNotice}>
        <p class="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">
          {editorState().savedNoticeText}
        </p>
      </Show>
      <TiptapEditor
        mode={editorState().mode}
        class={editorState().editorClass}
        threadId={editorState().threadId}
        supertags={editorState().supertags}
        emailTo={editorState().emailTo}
        emailSubject={editorState().emailSubject}
        initialContent={editorState().initialContent}
        disabled={saving()}
        placeholder={editorState().placeholder}
        submitLabel={
          saving()
            ? editorState().mode === "email"
              ? "Saving draft..."
              : "Saving..."
            : editorState().submitLabel
        }
        onSend={handleSend}
      />
    </div>
  );
}

function A2UINodeRenderer(props: {
  node: A2UINode;
  message: AfpMessage;
  renderMode: () => RenderMode;
}) {
  const rendererState = createMemo(() =>
    resolveA2UINodeRendererState({
      node: props.node,
      renderMode: props.renderMode(),
    }),
  );
  const node = () => rendererState().node;
  const p = () => rendererState().props;
  const rm = () => rendererState().renderMode;
  const children = () => rendererState().children;

  switch (node().type) {
    case "rich_text_editor":
      return <A2UIRichTextEditorNode node={node()} message={props.message} renderMode={props.renderMode} />;

    case "text": {
      const state = resolveTextNodeState(p(), rm());
      if (!state.showValue) return <></>;
      return (
        <div class="space-y-1">
          <Show when={state.showLabel}>
            <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
              {state.label}
            </p>
          </Show>
          <p class={state.valueClass}>{state.value}</p>
        </div>
      );
    }

    case "note": {
      const state = resolveNoteNodeState(p(), rm());

      if (state.renderMode === "glance") {
        return (
          <div class="space-y-1 rounded-lg border border-white/15 bg-white/8 p-3">
            <p class="line-clamp-1 text-xs font-semibold text-on-surface">{state.glanceTitle}</p>
            <For each={state.glanceSummaryLines}>
              {(line) => <p class="line-clamp-2 text-[10px] text-primary/85">{line}</p>}
            </For>
          </div>
        );
      }

      return (
        <div class="space-y-3 rounded-lg border border-white/15 bg-white/8 p-4">
          <Show when={state.showMetadataBadges}>
            <div class="flex flex-wrap items-center gap-2">
              <For each={state.metadataBadges}>
                {(badge) => <span class={badge.className}>{badge.text}</span>}
              </For>
            </div>
          </Show>
          <Show when={state.showTitle}>
            <h3 class="text-sm font-semibold text-on-surface">{state.title}</h3>
          </Show>
          <Show when={state.showSummary}>
            <p class="text-sm leading-6 text-on-surface-variant">{state.summary}</p>
          </Show>
          <TrustSummaryBlocks
            boundedReason={state.trustSummary.boundedReason}
            selectionReason={state.trustSummary.selectionReason}
            showSelectionReason={state.trustSummary.showSelectionReason}
            consequencePreview={state.trustSummary.consequencePreview}
            provenanceCue={state.trustSummary.provenanceCue}
            sourceSummary={state.trustSummary.sourceSummary}
          />
          <Show when={state.showBody}>
            <div class="md-prose" innerHTML={renderMarkdown(state.body)} />
          </Show>
        </div>
      );
    }

    case "rich_text": {
      const state = resolveRichTextNodeState(p(), rm());
      if (!state.showMarkdown) return <></>;
      if (state.renderMode === "glance") {
        return <p class="text-xs text-on-surface-variant line-clamp-2">{state.displayText}</p>;
      }
      return <div class="md-prose" innerHTML={renderMarkdown(state.markdown)} />;
    }

    case "callout": {
      const state = resolveCalloutNodeState(p(), rm());

      if (state.renderMode === "glance") {
        return (
          <div class={`rounded-lg border p-2 ${state.toneClass}`}>
            <p class="text-xs font-semibold text-on-surface line-clamp-1">{state.glanceTitle}</p>
          </div>
        );
      }

      return (
        <div class={`rounded-lg border p-3 space-y-1 ${state.toneClass}`}>
          <Show when={state.showTitle}>
            <h3 class="text-sm font-semibold text-on-surface">{state.title}</h3>
          </Show>
          <Show when={state.showBody}>
            <p class={state.bodyClass}>{state.body}</p>
          </Show>
        </div>
      );
    }

    case "stats_grid": {
      const state = resolveStatsGridState(p(), rm());
      if (!state.showItems) return <></>;

      // Glance: single stat, centred, large value
      if (state.renderMode === "glance") {
        return (
          <Show when={state.firstItem} fallback={<></>}>
            <div class="flex flex-col items-center justify-center py-2">
              <span style="font-size: var(--text-lg, 1.25rem)" class="font-bold text-on-surface leading-none">
                {state.firstItem?.value}
              </span>
              <span style="font-size: var(--text-nano, 11px)" class="mt-0.5 uppercase tracking-wide text-on-surface-variant/70">
                {state.firstItem?.label}
              </span>
            </div>
          </Show>
        );
      }

      return (
        <div class={state.gridClass}>
          <For each={state.items}>
            {(item) => (
              <div class="rounded-lg border border-white/15 bg-white/8 px-3 py-2">
                <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
                  {item.label}
                </p>
                <p class="mt-1 text-sm font-medium text-on-surface">{item.value}</p>
              </div>
            )}
          </For>
        </div>
      );
    }

    case "table": {
      const state = resolveTableViewState(p(), rm());
      if (!state.showRows) return <></>;

      // Glance: first row, first two columns, stacked vertically
      if (state.renderMode === "glance") {
        return (
          <div class="rounded-lg border border-white/15 bg-white/8 px-3 py-2">
            <Show when={state.showCaption}>
              <p class="mb-1 text-[10px] text-on-surface-variant">{state.caption}</p>
            </Show>
            <div class="flex flex-col gap-1 text-xs">
              <For each={state.glancePairs}>
                {(pair) => (
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-on-surface-variant">{pair.label}</span>
                    <span class="font-medium text-on-surface">{pair.value}</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        );
      }

      // Compact: key-value vertical list (first column = key, second = value)
      if (state.renderMode === "compact") {
        return (
          <div class="rounded-lg border border-white/15 bg-white/8 p-3 space-y-1">
            <Show when={state.showCaption}>
              <p class="mb-2 text-xs text-on-surface-variant">{state.caption}</p>
            </Show>
            <For each={state.compactRows}>
              {(row) => (
                <div class="flex items-start justify-between gap-2 py-1 border-t border-white/10 first:border-t-0">
                  <span class="text-xs text-on-surface-variant shrink-0">
                    {row.keyText}
                  </span>
                  <span class="text-xs font-medium text-on-surface text-right">
                    {row.valueText}
                  </span>
                </div>
              )}
            </For>
          </div>
        );
      }

      // Standard / full: scrollable horizontal table
      return (
        <div class="rounded-lg border border-white/15 bg-white/8 p-3 overflow-auto">
          <Show when={state.showCaption}>
            <p class="mb-2 text-xs text-on-surface-variant">{state.caption}</p>
          </Show>
          <table class="w-full text-left text-sm">
            <thead class="text-xs uppercase tracking-[0.14em] text-outline">
              <tr>
                <For each={state.columns}>{(column) => <th class="pb-2 pr-3 font-mono">{column.label}</th>}</For>
              </tr>
            </thead>
            <tbody class="text-on-surface">
              <For each={state.rows}>
                {(row) => (
                  <tr class="border-t border-white/10">
                    <For each={row.cells}>
                      {(cell) => <td class="py-2 pr-3 align-top">{cell.text}</td>}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      );
    }

    case "comparison_table": {
      const state = resolveComparisonTableNodeState(p(), rm());

      if (state.renderMode === "glance") {
        return (
          <div class="rounded-lg border border-white/15 bg-white/8 px-3 py-2">
            <p class="line-clamp-1 text-xs font-semibold text-on-surface">
              {state.glanceTitle}
            </p>
            <For each={state.glanceSummaryLines}>
              {(line) => <p class="line-clamp-2 text-[10px] text-primary/85">{line}</p>}
            </For>
          </div>
        );
      }

      return (
        <div class="space-y-3 rounded-lg border border-white/15 bg-white/8 p-4">
          <Show when={state.showTitle}>
            <h3 class="text-sm font-semibold text-on-surface">{state.title}</h3>
          </Show>
          <Show when={state.showDescription}>
            <p class="text-sm leading-6 text-on-surface-variant">{state.description}</p>
          </Show>
          <TrustSummaryBlocks
            boundedReason={state.trustSummary.boundedReason}
            selectionReason={state.trustSummary.selectionReason}
            showSelectionReason={state.trustSummary.showSelectionReason}
            consequencePreview={state.trustSummary.consequencePreview}
            provenanceCue={state.trustSummary.provenanceCue}
            sourceSummary={state.trustSummary.sourceSummary}
          />
          <Show when={state.selection.showSelection}>
            <div class="flex flex-wrap items-center gap-1.5 rounded-lg border border-primary/15 bg-primary/8 px-3 py-2">
              <Show when={state.selection.modeLabel}>
                <span class="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-on-surface">
                  {state.selection.modeLabel}
                </span>
              </Show>
              <Show when={state.selection.minimumLabel}>
                <span class="rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-xs font-semibold text-on-surface-variant">
                  {state.selection.minimumLabel}
                </span>
              </Show>
              <Show when={state.selection.confirmLabel}>
                <span class="max-w-full break-words text-xs font-medium text-on-surface-variant">
                  {state.selection.confirmLabel}
                </span>
              </Show>
            </div>
          </Show>
          <div class="overflow-auto rounded-lg border border-white/12 bg-white/6 p-3">
            <table class="w-full text-left text-sm">
              <thead class="text-xs uppercase tracking-[0.14em] text-outline">
                <tr>
                  <For each={state.headerColumns}>
                    {(column) => <th class="pb-2 pr-3 font-mono">{column.label}</th>}
                  </For>
                </tr>
              </thead>
              <tbody class="text-on-surface">
                <For each={state.rows}>
                  {(row) => (
                    <tr class="border-t border-white/10">
                      <td class="py-2 pr-3 align-top font-medium">{row.label}</td>
                      <For each={row.cells}>
                        {(cell) => <td class="py-2 pr-3 align-top">{cell.text}</td>}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <Show when={state.showActions}>
            <div class="space-y-3 rounded-lg border border-white/12 bg-white/6 p-3">
              <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
                Actions
              </p>
              <For each={state.columnActions}>
                {(group) => (
                  <div class="space-y-1.5">
                    <p class="break-words text-xs font-semibold text-on-surface">{group.vendorLabel}</p>
                    <div class="flex flex-wrap gap-1.5">
                      <For each={group.actions}>
                        {(action) => (
                          <Show
                            when={action.href && action.enabled}
                            fallback={
                              <span class={`max-w-full break-words rounded-full border px-2.5 py-1.5 text-xs font-semibold ${
                                action.enabled
                                  ? "border-white/12 bg-white/8 text-on-surface-variant"
                                  : "border-white/8 bg-white/4 text-on-surface-variant/55"
                              }`}>
                                {action.label}
                              </span>
                            }
                          >
                            <a
                              href={action.href}
                              target={action.external ? "_blank" : undefined}
                              rel={action.external ? "noreferrer noopener" : undefined}
                              class="max-w-full break-words rounded-full border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-on-surface transition hover:border-primary/30 hover:bg-primary/10"
                            >
                              {action.label}
                            </a>
                          </Show>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </For>
              <Show when={state.footerActions.length > 0}>
                <div class="flex flex-wrap gap-1.5 border-t border-white/10 pt-3">
                  <For each={state.footerActions}>
                    {(action) => (
                      <Show
                        when={action.href && action.enabled}
                        fallback={
                          <span class={`max-w-full break-words rounded-full border px-2.5 py-1.5 text-xs font-semibold ${
                            action.enabled
                              ? "border-white/12 bg-white/8 text-on-surface-variant"
                              : "border-white/8 bg-white/4 text-on-surface-variant/55"
                          }`}>
                            {action.label}
                          </span>
                        }
                      >
                        <a
                          href={action.href}
                          target={action.external ? "_blank" : undefined}
                          rel={action.external ? "noreferrer noopener" : undefined}
                          class="max-w-full break-words rounded-full border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-on-surface transition hover:border-primary/30 hover:bg-primary/10"
                        >
                          {action.label}
                        </a>
                      </Show>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      );
    }

    case "vendor_recommendation_cards": {
      const state = resolveVendorRecommendationCardsNodeState(p(), rm());
      if (!state.showCards) return <></>;

      if (state.renderMode === "glance") {
        return (
          <Show when={state.firstCard}>
            {(card) => (
              <div class="rounded-lg border border-white/15 bg-white/8 px-3 py-2">
                <p class="line-clamp-1 text-xs font-semibold text-on-surface">
                  #{card().rank} {card().title}
                </p>
                <p class="line-clamp-2 text-[10px] text-primary/85">{card().situationFit}</p>
              </div>
            )}
          </Show>
        );
      }

      return (
        <div class="space-y-3 rounded-lg border border-white/15 bg-white/8 p-4">
          <div class="space-y-1">
            <Show when={state.showTitle}>
              <h3 class="text-sm font-semibold text-on-surface">{state.title}</h3>
            </Show>
            <Show when={state.showDescription}>
              <p class="text-sm leading-6 text-on-surface-variant">{state.description}</p>
            </Show>
          </div>
          <div class={state.gridClass}>
            <For each={state.visibleCards}>
              {(card) => (
                <article class="min-w-0 overflow-hidden rounded-xl border border-white/12 bg-white/8">
                  <Show
                    when={card.showImage}
                    fallback={
                      <div class="flex aspect-[4/3] items-center justify-center bg-white/8 px-3 text-center text-xs font-semibold text-on-surface-variant">
                        Image pending from source
                      </div>
                    }
                  >
                    <img
                      src={card.imageUrl}
                      alt={card.imageAlt}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      class="aspect-[4/3] w-full object-cover"
                    />
                  </Show>
                  <div class="space-y-2 p-3">
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0">
                        <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary/80">
                          #{card.rank} recommendation
                        </p>
                        <h4 class="mt-0.5 break-words text-sm font-semibold text-on-surface">{card.title}</h4>
                      </div>
                      <span class="shrink-0 rounded-full border border-white/12 bg-white/10 px-2 py-1 text-[10px] font-semibold text-on-surface-variant">
                        {card.scoreLabel}
                      </span>
                    </div>
                    <p class="break-words text-xs leading-5 text-on-surface-variant">{card.situationFit}</p>
                    <Show when={card.rationaleLabels.length > 0}>
                      <div class="flex flex-wrap gap-1">
                        <For each={card.rationaleLabels.slice(0, 3)}>
                          {(label) => (
                            <span class="max-w-full break-words rounded-full border border-white/12 bg-white/10 px-2 py-1 text-[10px] font-medium text-on-surface-variant">
                              {label}
                            </span>
                          )}
                        </For>
                      </div>
                    </Show>
                    <p class="break-words text-[11px] leading-4 text-on-surface-variant/85">
                      {card.verificationLabel}
                    </p>
                    <div class="flex flex-wrap gap-1.5">
                      <Show when={card.showWebsite}>
                        <a
                          href={card.websiteUrl || card.sourceUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          class="rounded-full border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-on-surface transition hover:border-primary/30 hover:bg-primary/10"
                        >
                          Open website
                        </a>
                      </Show>
                      <Show when={card.showMap}>
                        <a
                          href={card.mapUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          class="rounded-full border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-on-surface transition hover:border-primary/30 hover:bg-primary/10"
                        >
                          Open map
                        </a>
                      </Show>
                    </div>
                  </div>
                </article>
              )}
            </For>
          </div>
        </div>
      );
    }

    case "bullet_list": {
      const state = resolveBulletListNodeState(p(), rm());

      if (!state.showItems) return <></>;

      if (state.renderMode === "glance") {
        return (
          <div class="rounded-lg border border-white/15 bg-white/8 px-3 py-2">
            <Show when={state.showTitle}>
              <p class="text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/70">{state.title}</p>
            </Show>
            <p class="mt-1 line-clamp-2 text-xs text-on-surface">{state.glanceText}</p>
          </div>
        );
      }

      return (
        <div class="space-y-2 rounded-lg border border-white/15 bg-white/8 p-4">
          <Show when={state.showTitle}>
            <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
              {state.title}
            </p>
          </Show>
          <ul class="space-y-2">
            <For each={state.items}>
              {(item) => (
                <li class="flex items-start gap-2 text-sm leading-6 text-on-surface">
                  <span class="mt-[6px] h-1.5 w-1.5 rounded-full bg-primary/80" />
                  <span>{item.text}</span>
                </li>
              )}
            </For>
          </ul>
        </div>
      );
    }

    case "code": {
      const state = resolveCodeNodeState(p());
      if (!state.showCode) return <></>;
      return (
        <div class="space-y-2">
          <Show when={state.showTitle}>
            <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
              {state.title}
            </p>
          </Show>
          <pre class={state.codeClass}>
            <code>{state.code}</code>
          </pre>
        </div>
      );
    }

    case "link_list": {
      const state = resolveLinkListState(p(), rm());
      if (!state.showItems) return <></>;

      return (
        <div class="space-y-2">
          <Show when={state.showTitle}>
            <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
              {state.title}
            </p>
          </Show>
          <div class="space-y-2">
            <For each={state.visibleItems}>
              {(item) => (
                <a
                  href={item.safeUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  class="block rounded-lg border border-white/15 bg-white/8 px-3 py-2 transition-colors hover:border-primary/30 hover:bg-primary/10"
                >
                  <p class="text-sm font-medium text-on-surface">
                    {item.title}
                  </p>
                  <Show when={item.showSubtitle}>
                    <p class="mt-1 text-sm text-on-surface-variant">{item.subtitle}</p>
                  </Show>
                  <Show when={item.showUrl}>
                    <p class="mt-1 text-xs text-primary/80">{item.url}</p>
                  </Show>
                </a>
              )}
            </For>
          </div>
        </div>
      );
    }

    case "constraint_badges": {
      const state = resolveConstraintBadgesState(p(), rm());
      if (!state.showItems) return <></>;

      // Glance: single count chip
      if (state.renderMode === "glance") {
        return (
          <span class={state.chipClass}>{state.glanceText}</span>
        );
      }

      return (
        <div class="flex flex-wrap gap-2">
          <For each={state.items}>
            {(item) => (
              <span class={state.chipClass}>
                {item.text}
              </span>
            )}
          </For>
        </div>
      );
    }

    case "insight_line": {
      const state = resolveInsightLineState(p(), rm());
      if (!state.showContent) return <></>;

      if (state.renderMode === "glance") {
        return (
          <div class="flex items-center gap-2 py-1">
            <Show when={state.showIcon}><span class="text-base leading-none">{state.icon}</span></Show>
            <span class="line-clamp-1 text-xs font-medium text-on-surface">{state.glanceText}</span>
          </div>
        );
      }

      return (
        <div class="flex items-start gap-3 rounded-lg border border-white/15 bg-white/8 px-3 py-2.5">
          <Show when={state.showIcon}>
            <span class="mt-0.5 shrink-0 text-lg leading-none">{state.icon}</span>
          </Show>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-medium leading-snug text-on-surface">{state.title}</p>
              <Show when={state.showBadge}>
                <span class={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${state.badgeClass}`}>
                  {state.badgeText}
                </span>
              </Show>
            </div>
            <Show when={state.showSecondary}>
              <p class="mt-0.5 text-xs text-on-surface-variant">{state.secondary}</p>
            </Show>
            <Show when={state.showActionChips}>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <For each={state.actionChips}>
                  {(chip) => (
                    <span class={state.actionChipClass}>
                      {chip.label}
                    </span>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      );
    }

    case "action_chips": {
      const state = resolveActionChipsState(p(), rm());
      if (!state.showActions) return <></>;

      if (state.renderMode === "glance") {
        return (
          <span class="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs text-on-surface-variant">
            {state.glanceText}
          </span>
        );
      }

      return (
        <div class="flex flex-wrap gap-2">
          <For each={state.actions}>
            {(action) => (
              <button
                type="button"
                class={state.buttonClass}
              >
                {action.label}
              </button>
            )}
          </For>
        </div>
      );
    }

    case "stat_row": {
      const state = resolveStatRowState(p(), rm());

      if (state.renderMode === "glance") {
        return (
          <div class={`rounded-lg border px-3 py-2 ${state.toneClass}`}>
            <p class="line-clamp-1 text-xs font-medium text-on-surface">{state.title}</p>
            <Show when={state.firstMetric}>
              <p class="mt-0.5 text-[10px] text-on-surface-variant">
                <span class="font-medium text-on-surface">{state.glanceMetricText}</span>
              </p>
            </Show>
          </div>
        );
      }

      return (
        <div class={`space-y-3 rounded-lg border p-3 ${state.toneClass}`}>
          <Show when={state.showTitle}>
            <p class="text-sm font-semibold text-on-surface">{state.title}</p>
          </Show>
          <Show when={state.showMetrics}>
            <div class={state.metricsGridClass}>
              <For each={state.metrics}>
                {(stat) => (
                  <div class="text-center">
                    <p class="text-base font-bold text-on-surface">{stat.value}</p>
                    <p class="mt-0.5 text-[10px] uppercase tracking-wide text-on-surface-variant/70">
                      {stat.label}
                    </p>
                  </div>
                )}
              </For>
            </div>
          </Show>
          <Show when={state.showFocusItems}>
            <ul class="space-y-1">
              <For each={state.focusItems}>
                {(item) => (
                  <li class="flex items-start gap-1.5 text-xs text-on-surface-variant">
                    <span class="mt-0.5 shrink-0 text-primary/70">→</span>
                    <span>{item.text}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      );
    }

    case "diff_view": {
      const state = resolveDiffViewNodeState(p(), rm());
      // diff_view is suppressed on watch — complex diffs need a larger screen
      if (state.showGlanceFallback) {
        return (
          <div class="rounded-lg border border-white/20 bg-white/10 p-2 text-xs text-on-surface-variant">
            {state.glanceFallbackText}
          </div>
        );
      }
      return (
        <div class="space-y-3 rounded-lg border border-white/20 bg-white/10 p-3">
          <div class="space-y-1">
            <p class="text-sm font-semibold text-on-surface">{state.title}</p>
            <Show when={state.showDescription}>
              <p class="text-xs leading-5 text-on-surface-variant">{state.description}</p>
            </Show>
          </div>
          <Show when={state.showBeforeAfter}>
            <div class={state.splitClass}>
              <div class={state.beforePanel.className}>
                <p class={state.beforePanel.labelClass}>
                  {state.beforePanel.label}
                </p>
                <pre class={state.patchCodeClass}>
                  <code>{state.beforePanel.body}</code>
                </pre>
              </div>
              <div class={state.afterPanel.className}>
                <p class={state.afterPanel.labelClass}>
                  {state.afterPanel.label}
                </p>
                <pre class={state.patchCodeClass}>
                  <code>{state.afterPanel.body}</code>
                </pre>
              </div>
            </div>
          </Show>
          <Show when={state.showPatch}>
            <div class={state.patchPanelClass}>
              <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
                {state.patchLabel}
              </p>
              <pre class={state.patchCodeClass}>
                <code>{state.patch}</code>
              </pre>
            </div>
          </Show>
          <Show when={state.showEmptyState}>
            <div class={state.emptyStateClass}>
              {state.emptyStateText}
            </div>
          </Show>
        </div>
      );
    }

    case "section": {
      const state = resolveSectionNodeState(p(), node().children ?? []);
      if (!state.showChildren) return <></>;

      return (
        <section class="space-y-3">
          <Show when={state.showTitle}>
            <h3 class="text-sm font-semibold text-on-surface">{state.title}</h3>
          </Show>
          <div class={state.layoutClass}>
            <For each={state.childNodes}>
              {(child) => <A2UINodeRenderer node={child} message={props.message} renderMode={props.renderMode} />}
            </For>
          </div>
        </section>
      );
    }

    default:
      return (
        <div class="rounded-lg border border-white/20 bg-white/10 p-3 text-sm text-on-surface-variant">
          Unsupported A2UI node: {node().type}
        </div>
      );
  }
}

// ── Root renderer ─────────────────────────────────────────────────────────────

export function A2UIRenderer(props: { message: AfpMessage; view?: AfpView }) {
  const { viewport } = useViewport();
  const rendererState = createMemo(() =>
    resolveA2UIRendererState({
      message: props.message,
      view: props.view,
      viewport: viewport(),
    }),
  );
  const renderMode = () => rendererState().renderMode;

  return (
    <div class="space-y-4">
      <Show when={rendererState().showHeader}>
        <header class={rendererState().headerClass}>
          <Show when={rendererState().title}>
            <h3 class={rendererState().titleClass}>{rendererState().title}</h3>
          </Show>
          {/* Description suppressed in glance mode to save space */}
          <Show when={rendererState().showDescription}>
            <p class={rendererState().descriptionClass}>{rendererState().description}</p>
          </Show>
        </header>
      </Show>

      <Show when={rendererState().showWatcherSummary}>
        <p class={rendererState().watcherSummaryClass}>
          {rendererState().watcherSummary}
        </p>
      </Show>

      <Show when={rendererState().showNodes}>
        <div class={rendererState().layoutClass}>
          <For each={rendererState().nodes}>
            {(node) => <A2UINodeRenderer node={node} message={props.message} renderMode={renderMode} />}
          </For>
        </div>
      </Show>
    </div>
  );
}
