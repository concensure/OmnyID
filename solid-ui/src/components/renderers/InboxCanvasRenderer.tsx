// @locs-version: 1.0
import { createMemo, createSignal, For, Show } from "solid-js";
import type { AfpMessage } from "@/lib/api";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import { isRecord } from "@/lib/eventDetail";
import { confColor } from "@/lib/format";

type Card = {
  id: string;
  from: string;
  subject: string;
  summary?: string;
  confidence?: number;
  labels?: string[];
  starred?: boolean;
  suggested_column?: string;
  suggest_reason?: string;
};

type Column = {
  id: string;
  label: string;
  tone?: string;
  cards: Card[];
};

type Suggestion = {
  card_id: string;
  to_column: string;
  reason: string;
};

type SuggestionViewItem = {
  cardId: string;
  reason: string;
  moveLabel: string;
};

type ColumnViewItem = {
  id: string;
  label: string;
  toneClass: string;
  labelClass: string;
  cards: Card[];
  cardCount: number;
  showEmptyDropTarget: boolean;
};

type RendererState = {
  suggestions: SuggestionViewItem[];
  showSuggestions: boolean;
  columns: ColumnViewItem[];
};

type CanvasCardState = {
  from: string;
  subject: string;
  summary: string;
  showSummary: boolean;
  labels: string[];
  showLabels: boolean;
  showConfidence: boolean;
  confidenceText: string;
  confidenceClass: string;
  starTitle: string;
  starGlyph: string;
  archiveTitle: string;
  archiveGlyph: string;
};

type CanvasCardProps = {
  card: Card;
  colId: string;
  onDragStart: (cardId: string, colId: string) => void;
  onStar: (colId: string, cardId: string) => void;
  onArchive: (colId: string, cardId: string) => void;
};

const COLUMN_TONE_STYLES: Record<string, string> = {
  urgent: "border-red-400/40 text-red-300",
  today: "border-primary/40 text-primary",
  this_week: "border-amber-400/40 text-amber-300",
  later: "border-white/25 text-on-surface-variant",
  archive: "border-white/15 text-on-surface-variant/60",
};

const DEFAULT_TONE_MAP: Record<string, string> = {
  today: "today",
  this_week: "this_week",
  later: "later",
  archive: "archive",
};

const DEFAULT_COLUMN_TONE = COLUMN_TONE_STYLES["later"];
const EMPTY_DROP_TARGET_TEXT = "Drop here";
const SUGGESTION_PREFIX_TEXT = "Agent suggests:";
const SUGGESTION_ICON_TEXT = "Hint";
const MOVE_BUTTON_TEXT = "Move";
const DISMISS_BUTTON_TEXT = "Dismiss";
const STAR_GLYPH = "Star";
const UNSTAR_GLYPH = "Unstar";
const ARCHIVE_GLYPH = "Archive";

function parseColumns(content: Record<string, unknown>): Column[] {
  const raw = content["columns"];
  if (!Array.isArray(raw)) return [];
  return raw.map((column): Column => {
    const source = isRecord(column) ? column : {};
    const cards = Array.isArray(source["cards"])
      ? source["cards"].map((row): Card => {
          const card = isRecord(row) ? row : {};
          return {
            id: String(card["id"] ?? ""),
            from: String(card["from"] ?? ""),
            subject: String(card["subject"] ?? ""),
            summary: card["summary"] ? String(card["summary"]) : undefined,
            confidence: typeof card["confidence"] === "number" ? card["confidence"] : undefined,
            labels: Array.isArray(card["labels"]) ? card["labels"].map(String) : [],
            starred: Boolean(card["starred"]),
            suggested_column: card["suggested_column"] ? String(card["suggested_column"]) : undefined,
            suggest_reason: card["suggest_reason"] ? String(card["suggest_reason"]) : undefined,
          };
        })
      : [];
    const id = String(source["id"] ?? "");
    return {
      id,
      label: String(source["label"] ?? ""),
      tone: source["tone"] ? String(source["tone"]) : DEFAULT_TONE_MAP[id] ?? "later",
      cards,
    };
  });
}

function parseSuggestions(content: Record<string, unknown>): Suggestion[] {
  const raw = content["suggestions"];
  if (!Array.isArray(raw)) return [];
  return raw.map((entry): Suggestion => {
    const source = isRecord(entry) ? entry : {};
    return {
      card_id: String(source["card_id"] ?? ""),
      to_column: String(source["to_column"] ?? ""),
      reason: String(source["reason"] ?? ""),
    };
  });
}

function columnLabelClass(toneClass: string): string {
  return toneClass.split(" ")[1] ?? "text-on-surface-variant";
}

function suggestionViewItems(suggestions: Suggestion[]): SuggestionViewItem[] {
  return suggestions.map((suggestion) => ({
    cardId: suggestion.card_id,
    reason: suggestion.reason,
    moveLabel: MOVE_BUTTON_TEXT,
  }));
}

function columnViewItems(columns: Column[]): ColumnViewItem[] {
  return columns.map((column) => {
    const toneClass = COLUMN_TONE_STYLES[column.tone ?? ""] ?? DEFAULT_COLUMN_TONE;
    return {
      id: column.id,
      label: column.label,
      toneClass,
      labelClass: columnLabelClass(toneClass),
      cards: column.cards,
      cardCount: column.cards.length,
      showEmptyDropTarget: column.cards.length === 0,
    };
  });
}

function rendererState(columns: Column[], suggestions: Suggestion[]): RendererState {
  const suggestionItems = suggestionViewItems(suggestions);
  return {
    suggestions: suggestionItems,
    showSuggestions: suggestionItems.length > 0,
    columns: columnViewItems(columns),
  };
}

function canvasCardState(card: Card): CanvasCardState {
  const summary = card.summary ?? "";
  const labels = card.labels ?? [];
  const showConfidence = card.confidence !== undefined;
  return {
    from: card.from,
    subject: card.subject,
    summary,
    showSummary: Boolean(summary),
    labels,
    showLabels: labels.length > 0,
    showConfidence,
    confidenceText: showConfidence ? `${Math.round((card.confidence ?? 0) * 100)}%` : "",
    confidenceClass: showConfidence ? confColor(card.confidence ?? 0) : "",
    starTitle: card.starred ? "Unstar" : "Star",
    starGlyph: card.starred ? UNSTAR_GLYPH : STAR_GLYPH,
    archiveTitle: "Archive",
    archiveGlyph: ARCHIVE_GLYPH,
  };
}

export function InboxCanvasRenderer(props: { message: AfpMessage }) {
  const content = () => afpRecord(decryptedDisplayContent(props.message));

  const [columns, setColumns] = createSignal<Column[]>(parseColumns(content()));
  const [dismissedSuggestions, setDismissedSuggestions] = createSignal<Set<string>>(new Set());
  const parsedSuggestions = createMemo(() => parseSuggestions(content()));
  const activeSuggestions = createMemo(() =>
    parsedSuggestions().filter((suggestion) => !dismissedSuggestions().has(suggestion.card_id))
  );
  const viewState = createMemo(() => rendererState(columns(), activeSuggestions()));

  let draggingCardId = "";
  let draggingFromColId = "";

  function onDragStart(cardId: string, colId: string) {
    draggingCardId = cardId;
    draggingFromColId = colId;
  }

  function onDrop(targetColId: string) {
    if (!draggingCardId || draggingFromColId === targetColId) return;
    setColumns((previousColumns) => {
      const nextColumns = previousColumns.map((column) => ({ ...column, cards: [...column.cards] }));
      const sourceColumn = nextColumns.find((column) => column.id === draggingFromColId);
      const targetColumn = nextColumns.find((column) => column.id === targetColId);
      if (!sourceColumn || !targetColumn) return previousColumns;
      const cardIndex = sourceColumn.cards.findIndex((card) => card.id === draggingCardId);
      if (cardIndex === -1) return previousColumns;
      const [card] = sourceColumn.cards.splice(cardIndex, 1);
      targetColumn.cards.push(card);
      return nextColumns;
    });
    draggingCardId = "";
    draggingFromColId = "";
  }

  function acceptSuggestion(suggestion: Suggestion) {
    setColumns((previousColumns) => {
      const nextColumns = previousColumns.map((column) => ({ ...column, cards: [...column.cards] }));
      const sourceColumn = nextColumns.find((column) =>
        column.cards.some((card) => card.id === suggestion.card_id)
      );
      const targetColumn = nextColumns.find((column) => column.id === suggestion.to_column);
      if (!sourceColumn || !targetColumn) return previousColumns;
      const cardIndex = sourceColumn.cards.findIndex((card) => card.id === suggestion.card_id);
      if (cardIndex === -1) return previousColumns;
      const [card] = sourceColumn.cards.splice(cardIndex, 1);
      targetColumn.cards.push(card);
      return nextColumns;
    });
    setDismissedSuggestions((previousSuggestions) => new Set([...previousSuggestions, suggestion.card_id]));
  }

  function dismissSuggestion(cardId: string) {
    setDismissedSuggestions((previousSuggestions) => new Set([...previousSuggestions, cardId]));
  }

  function toggleStar(colId: string, cardId: string) {
    setColumns((previousColumns) =>
      previousColumns.map((column) =>
        column.id !== colId
          ? column
          : {
              ...column,
              cards: column.cards.map((card) =>
                card.id === cardId ? { ...card, starred: !card.starred } : card
              ),
            }
      )
    );
  }

  function archiveCard(colId: string, cardId: string) {
    setColumns((previousColumns) => {
      const nextColumns = previousColumns.map((column) => ({ ...column, cards: [...column.cards] }));
      const sourceColumn = nextColumns.find((column) => column.id === colId);
      const archiveColumn = nextColumns.find((column) => column.id === "archive");
      if (!sourceColumn) return previousColumns;
      const cardIndex = sourceColumn.cards.findIndex((card) => card.id === cardId);
      if (cardIndex === -1) return previousColumns;
      const [card] = sourceColumn.cards.splice(cardIndex, 1);
      if (archiveColumn && colId !== "archive") {
        archiveColumn.cards.push(card);
      }
      return nextColumns;
    });
  }

  return (
    <div class="space-y-3">
      <Show when={viewState().showSuggestions}>
        <div class="space-y-1.5">
          <For each={viewState().suggestions}>
            {(suggestion) => (
              <div class="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/8 px-4 py-2.5">
                <span class="text-[11px] font-semibold uppercase tracking-wide text-primary">
                  {SUGGESTION_ICON_TEXT}
                </span>
                <p class="flex-1 text-xs text-on-surface-variant">
                  <span class="font-medium text-on-surface">{SUGGESTION_PREFIX_TEXT} </span>
                  {suggestion.reason}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    acceptSuggestion(
                      activeSuggestions().find((entry) => entry.card_id === suggestion.cardId) as Suggestion
                    )
                  }
                  class="rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-white hover:opacity-90"
                >
                  {suggestion.moveLabel}
                </button>
                <button
                  type="button"
                  onClick={() => dismissSuggestion(suggestion.cardId)}
                  class="rounded-full border border-white/20 px-3 py-1 text-[11px] text-on-surface-variant hover:bg-white/10"
                >
                  {DISMISS_BUTTON_TEXT}
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <For each={viewState().columns}>
          {(column) => (
            <div
              class={`rounded-xl border bg-white/5 p-3 transition-colors ${column.toneClass}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDrop(column.id)}
            >
              <div class="mb-3 flex items-center justify-between">
                <p
                  class={`font-mono text-[10px] font-semibold uppercase tracking-[0.18em] ${column.labelClass}`}
                >
                  {column.label}
                </p>
                <span class="max-w-full break-words rounded-full bg-white/10 px-1.5 py-1 text-[10px] text-on-surface-variant">
                  {column.cardCount}
                </span>
              </div>

              <div class="min-h-[48px] space-y-2">
                <For each={column.cards}>
                  {(card) => (
                    <CanvasCard
                      card={card}
                      colId={column.id}
                      onDragStart={onDragStart}
                      onStar={toggleStar}
                      onArchive={archiveCard}
                    />
                  )}
                </For>
                <Show when={column.showEmptyDropTarget}>
                  <p class="py-4 text-center text-[11px] text-on-surface-variant/40">
                    {EMPTY_DROP_TARGET_TEXT}
                  </p>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

function CanvasCard(props: CanvasCardProps) {
  const cardState = createMemo(() => canvasCardState(props.card));

  return (
    <div
      draggable="true"
      onDragStart={() => props.onDragStart(props.card.id, props.colId)}
      class="cursor-grab select-none rounded-lg border border-white/15 bg-white/8 p-3 transition hover:border-white/30 hover:bg-white/12 active:cursor-grabbing active:opacity-70"
    >
      <div class="flex items-start justify-between gap-1.5">
        <p class="min-w-0 break-words text-[11px] font-medium text-on-surface">{cardState().from}</p>
        <div class="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            title={cardState().starTitle}
            onClick={() => props.onStar(props.colId, props.card.id)}
            class="text-[11px] font-medium leading-none text-on-surface-variant transition hover:text-on-surface hover:scale-105"
          >
            {cardState().starGlyph}
          </button>
          <button
            type="button"
            title={cardState().archiveTitle}
            onClick={() => props.onArchive(props.colId, props.card.id)}
            class="text-[10px] leading-none text-on-surface-variant/60 transition hover:text-on-surface-variant"
          >
            {cardState().archiveGlyph}
          </button>
        </div>
      </div>

      <p class="mt-1 break-words text-[11px] leading-4 text-on-surface-variant">
        {cardState().subject}
      </p>

      <Show when={cardState().showSummary}>
        <p class="mt-1.5 break-words text-[10px] italic leading-4 text-on-surface-variant/70">
          {cardState().summary}
        </p>
      </Show>

      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <Show when={cardState().showLabels}>
          <For each={cardState().labels}>
            {(label) => (
              <span class="max-w-full break-words rounded-full bg-white/10 px-1.5 py-1 text-[9px] text-on-surface-variant">
                {label}
              </span>
            )}
          </For>
        </Show>
        <Show when={cardState().showConfidence}>
          <span class={`ml-auto text-[10px] font-medium ${cardState().confidenceClass}`}>
            {cardState().confidenceText}
          </span>
        </Show>
      </div>
    </div>
  );
}
