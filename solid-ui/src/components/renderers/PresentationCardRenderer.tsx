import { createMemo, createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { AfpMessage, AfpView } from "@/lib/api";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import {
  createPresentationState,
  detectDomain,
  DOMAIN_DEFAULT_CARDS,
  extractSubjects,
  parseKeyFacts,
  type CardSpec,
  type CardType,
  type PresentationContent,
} from "@/lib/presentationState";
import { CARD_REGISTRY } from "@/components/renderers/PresentationCards";

const CARD_META: Record<CardType, { label: string; icon: string; description: string }> = {
  summary: { label: "Overview", icon: "◆", description: "Summary of results" },
  key_facts: { label: "Key Facts", icon: "⊞", description: "Structured key-value data" },
  sources: { label: "Sources", icon: "↗", description: "Reference links" },
  timeline: { label: "Timeline", icon: "◎", description: "Chronological events" },
  definition: { label: "Definition", icon: "≡", description: "Concept explanation" },
  comparison: { label: "Comparison", icon: "⇌", description: "Side-by-side comparison" },
  compound: { label: "Compound", icon: "□", description: "Chemical compound" },
  element_breakdown: { label: "Structure", icon: "⬢", description: "Elemental breakdown" },
  properties_table: { label: "Properties", icon: "⊟", description: "Scientific properties" },
  map: { label: "Location", icon: "Map", description: "Map and location" },
  weather: { label: "Weather", icon: "Sun", description: "Climate conditions" },
  flights: { label: "Flights", icon: "Flight", description: "Flight options" },
  accommodation: { label: "Stays", icon: "Stay", description: "Accommodation options" },
  activities: { label: "Activities", icon: "Leaf", description: "Things to do" },
  itinerary: { label: "Itinerary", icon: "Plan", description: "Day-by-day plan" },
  price_metrics: { label: "Price", icon: "◇", description: "Price and metrics" },
  ingredients: { label: "Ingredients", icon: "⊕", description: "Recipe ingredients" },
  steps: { label: "Steps", icon: "→", description: "Step-by-step guide" },
  code_snippet: { label: "Code", icon: "⌥", description: "Code example" },
  profile: { label: "Profile", icon: "◉", description: "Entity profile" },
};

const SUBJECT_SEPARATOR = "·";
const CARD_COLLAPSE_ICON = "▲";
const CARD_EXPAND_ICON = "▼";
const CARD_SAVE_ICON = "♡";
const CARD_SAVED_ICON = "♥";
const CARD_CLOSE_ICON = "×";
const SHOW_MORE_SUFFIX = "▾";
const PRESENTATION_SUBJECT_BOUND_TYPES: CardType[] = [
  "map",
  "weather",
  "accommodation",
  "activities",
  "compound",
  "element_breakdown",
  "properties_table",
  "profile",
];
const MAX_PRIMARY = 4;

function activateOnEnterOrSpace(event: KeyboardEvent, action: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function scalarString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function stringItems(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => scalarString(item).trim()).filter((item) => item.length > 0)
    : [];
}

function linkItems(value: unknown): Array<{ title: string; url: string }> {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((link) => {
    const url = scalarString(link.url);
    if (!url) return [];
    return [{ title: scalarString(link.title), url }];
  });
}

function isCardType(value: unknown): value is CardType {
  return typeof value === "string" && value in CARD_META;
}

function isPresentationDomain(value: unknown): value is PresentationContent["domain"] {
  return typeof value === "string" && value in DOMAIN_DEFAULT_CARDS;
}

function normalizePresentationDomain(value: unknown, query: string): PresentationContent["domain"] {
  return isPresentationDomain(value) ? value : detectDomain(query);
}

function normalizeCardSpec(value: unknown): CardSpec | null {
  if (!isRecord(value) || !isCardType(value.type)) return null;
  const id = scalarString(value.id);
  if (!id) return null;
  return {
    id,
    type: value.type,
    subject: typeof value.subject === "string" ? value.subject : undefined,
    title: scalarString(value.title, CARD_META[value.type].label),
    data: isRecord(value.data) ? value.data : {},
  };
}

function presentationContentFromMountedCards(
  content: Record<string, unknown>,
  query: string,
): PresentationContent | null {
  if (!Array.isArray(content.cards)) return null;
  const cards = content.cards.map(normalizeCardSpec).filter((card): card is CardSpec => Boolean(card));
  if (cards.length === 0) return null;
  return {
    presentation_id: scalarString(content.presentation_id, `pres.${Date.now()}`),
    query: typeof content.query === "string" ? content.query : query,
    summary: typeof content.summary === "string" ? content.summary : query,
    domain: normalizePresentationDomain(content.domain, query),
    subjects: stringItems(content.subjects),
    cards,
  };
}

function parsePresentationContent(
  content: Record<string, unknown>,
  query: string,
): PresentationContent {
  const mountedContent = presentationContentFromMountedCards(content, query);
  if (mountedContent) return mountedContent;

  const summary = typeof content.summary === "string" ? content.summary : query;
  const bullets = stringItems(content.bullets);
  const links = linkItems(Array.isArray(content.sources) ? content.sources : content.links);

  const domain = detectDomain(query);
  const mountedSubjects = stringItems(content.subjects);
  const subjects = mountedSubjects.length > 0 ? mountedSubjects : extractSubjects(query);
  const cardTypes = DOMAIN_DEFAULT_CARDS[domain];
  const keyFacts = parseKeyFacts(bullets);
  const cards: CardSpec[] = [];

  for (const type of cardTypes) {
    if (PRESENTATION_SUBJECT_BOUND_TYPES.includes(type) && subjects.length > 1) {
      for (const subject of subjects) {
        cards.push({
          id: `${type}_${subject.toLowerCase().replace(/\s+/g, "_")}`,
          type,
          subject,
          title: `${CARD_META[type].label} ${SUBJECT_SEPARATOR} ${subject}`,
          data: extractCardData(type, subject, bullets, summary, links, keyFacts),
        });
      }
      continue;
    }

    cards.push({
      id: type,
      type,
      subject: subjects[0],
      title: CARD_META[type].label,
      data: extractCardData(type, subjects[0] ?? query, bullets, summary, links, keyFacts),
    });
  }

  return {
    presentation_id: `pres.${Date.now()}`,
    query,
    summary,
    domain,
    subjects,
    cards,
  };
}

function extractCardData(
  type: CardType,
  subject: string,
  bullets: string[],
  summary: string,
  links: Array<{ title: string; url: string }> = [],
  keyFacts: Array<{ key: string; value: string }> = [],
): Record<string, unknown> {
  switch (type) {
    case "summary":
      return { summary, bullets };
    case "key_facts":
      return { facts: keyFacts, bullets };
    case "sources":
      return { sources: links.map((link) => ({ title: link.title, url: link.url, snippet: "" })) };
    case "definition":
      return { term: subject, definition: summary };
    case "compound":
      return { name: subject, formula: subject, description: summary };
    case "element_breakdown": {
      const elements: Array<{ symbol: string; count: number }> = [];
      const elementRegex = /([A-Z][a-z]?)(\d*)/g;
      let match: RegExpExecArray | null;
      while ((match = elementRegex.exec(subject)) !== null) {
        if (match[1]) {
          elements.push({ symbol: match[1], count: parseInt(match[2] || "1", 10) });
        }
      }
      const bondBullet = bullets.find((bullet) => /bond/i.test(bullet));
      const bonds = bondBullet ? [{ type: bondBullet.split(":")[1]?.trim() ?? bondBullet }] : [];
      return { elements, bonds };
    }
    case "map":
      return { location: subject };
    case "weather":
      return { conditions: "See forecast", avg_temp: "-", subject };
    case "flights":
      return { options: [] };
    case "accommodation":
      return { options: [] };
    case "activities":
      return { activities: bullets.slice(0, 5).map((bullet) => ({ name: bullet })) };
    case "itinerary":
      return { days: [] };
    case "timeline":
      return { events: bullets.slice(0, 6).map((bullet, index) => ({ date: `${index + 1}`, label: bullet })) };
    case "comparison":
      return {
        headers: [subject],
        rows: keyFacts.map((fact) => ({ attribute: fact.key, values: [fact.value] })),
      };
    case "price_metrics":
      return { price: "-", change_pct: 0, facts: keyFacts, bullets };
    case "ingredients":
      return {
        ingredients: bullets.map((bullet) => ({ name: bullet, amount: "", unit: "" })),
        servings: 4,
      };
    case "steps":
      return { steps: bullets.map((bullet, index) => ({ step: index + 1, instruction: bullet })) };
    case "code_snippet":
      return { code: bullets.join("\n"), language: "text", explanation: summary };
    case "profile":
      return { name: subject, bio: summary };
    case "properties_table":
      return { properties: keyFacts.map((fact) => ({ property: fact.key, value: fact.value })) };
    default:
      return { summary, bullets };
  }
}

function CardShell(props: {
  id: string;
  label: string;
  icon: string;
  description: string;
  subject?: string;
  ctx: ReturnType<typeof createPresentationState>;
  children: JSX.Element;
}) {
  const shellState = createMemo(() => {
    const state = props.ctx.state();
    return {
      expanded: state.expanded.has(props.id),
      saved: state.saved.has(props.id),
      subjectText: props.subject ?? null,
      showSubject: Boolean(props.subject),
      showDescription: !state.expanded.has(props.id),
      saveLabel: state.saved.has(props.id) ? "Unsave" : "Save",
      saveIcon: state.saved.has(props.id) ? CARD_SAVED_ICON : CARD_SAVE_ICON,
      expandIcon: state.expanded.has(props.id) ? CARD_COLLAPSE_ICON : CARD_EXPAND_ICON,
    };
  });

  const toggleExpanded = () => {
    if (shellState().expanded) {
      props.ctx.collapse(props.id);
      return;
    }
    props.ctx.expand(props.id);
  };

  return (
    <div class="group glass-card card-hover overflow-hidden rounded-2xl shadow-card">
      <div
        role="button"
        tabindex={0}
        class="flex w-full items-center gap-2.5 px-4 pt-4 pb-2 text-left"
        onClick={toggleExpanded}
        onKeyDown={(event) => activateOnEnterOrSpace(event, toggleExpanded)}
        aria-expanded={shellState().expanded}
      >
        <span class="shrink-0 text-base leading-none text-on-surface-variant">{props.icon}</span>
        <div class="min-w-0 flex-1">
          <p class="break-words text-xs font-semibold text-on-surface">
            {props.label}
            <Show when={shellState().showSubject}>
              <span class="ml-1 font-normal text-on-surface-variant">
                {SUBJECT_SEPARATOR} {shellState().subjectText}
              </span>
            </Show>
          </p>
          <Show when={shellState().showDescription}>
            <p class="break-words text-[10px] text-on-surface-variant">{props.description}</p>
          </Show>
        </div>

        <div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            title={shellState().saveLabel}
            class="flex h-6 w-6 items-center justify-center rounded-lg text-xs text-outline transition hover:text-primary"
            onClick={(event) => {
              event.stopPropagation();
              props.ctx.toggleSaved(props.id);
            }}
          >
            {shellState().saveIcon}
          </button>
          <button
            type="button"
            title="Remove card"
            class="flex h-6 w-6 items-center justify-center rounded-lg text-xs text-outline transition hover:text-error"
            onClick={(event) => {
              event.stopPropagation();
              props.ctx.hide(props.id);
            }}
          >
            {CARD_CLOSE_ICON}
          </button>
          <span class="ml-1 text-[11px] text-outline transition">
            {shellState().expandIcon}
          </span>
        </div>
      </div>

      <Show when={shellState().expanded}>
        <div class="animate-fade-in px-4 pb-4">
          <div class="mb-3 h-px w-full bg-outline-variant/20" />
          {props.children}
        </div>
      </Show>
    </div>
  );
}

function CardGrid(props: {
  cards: CardSpec[];
  ctx: ReturnType<typeof createPresentationState>;
}) {
  const [showAll, setShowAll] = createSignal(false);
  const gridState = createMemo(() => {
    const visibleCards = props.cards.filter((card) => !props.ctx.state().hidden.has(card.id));
    const primaryCards = visibleCards.slice(0, MAX_PRIMARY);
    const secondaryCards = visibleCards.slice(MAX_PRIMARY);
    return {
      primaryCards,
      secondaryCards,
      showSecondaryCards: showAll(),
      showSecondaryToggle: secondaryCards.length > 0 && !showAll(),
      showSecondaryGrid: secondaryCards.length > 0 && showAll(),
      showMoreLabel: `Show ${secondaryCards.length} more card${secondaryCards.length > 1 ? "s" : ""} ${SHOW_MORE_SUFFIX}`,
    };
  });

  return (
    <div class="space-y-3">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2">
        <For each={gridState().primaryCards}>
          {(card) => {
            const Component = CARD_REGISTRY[card.type];
            const meta = CARD_META[card.type];
            return (
              <CardShell
                id={card.id}
                label={meta.label}
                icon={meta.icon}
                description={meta.description}
                subject={card.subject}
                ctx={props.ctx}
              >
                <Dynamic
                  component={Component}
                  id={card.id}
                  data={card.data}
                  ctx={props.ctx}
                  subject={card.subject}
                />
              </CardShell>
            );
          }}
        </For>
      </div>

      <Show when={gridState().showSecondaryToggle}>
        <button
          type="button"
          class="w-full rounded-xl border border-outline-variant/30 bg-white/30 py-2 text-xs font-medium text-on-surface-variant transition hover:bg-white/50"
          onClick={() => setShowAll(true)}
        >
          {gridState().showMoreLabel}
        </button>
      </Show>

      <Show when={gridState().showSecondaryGrid}>
        <div class="grid animate-fade-in grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2">
          <For each={gridState().secondaryCards}>
            {(card) => {
              const Component = CARD_REGISTRY[card.type];
              const meta = CARD_META[card.type];
              return (
                <CardShell
                  id={card.id}
                  label={meta.label}
                  icon={meta.icon}
                  description={meta.description}
                  subject={card.subject}
                  ctx={props.ctx}
                >
                  <Dynamic
                    component={Component}
                    id={card.id}
                    data={card.data}
                    ctx={props.ctx}
                    subject={card.subject}
                  />
                </CardShell>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

function PresentationHeader(props: {
  summary: string;
  domain: string;
  subjects: string[];
  onViewWorkflow?: () => void;
}) {
  const headerState = createMemo(() => ({
    summaryText: props.summary,
    domainText: props.domain,
    visibleSubjects: props.subjects.slice(0, 3),
    showSubjects: props.subjects.length > 0,
    showWorkflowAction: Boolean(props.onViewWorkflow),
  }));

  return (
    <div class="mb-6 space-y-3">
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <span class="max-w-full break-words rounded-full bg-primary-fixed/60 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-primary">
          {headerState().domainText}
        </span>
        <Show when={headerState().showSubjects}>
          <For each={headerState().visibleSubjects}>
            {(subject) => (
              <span class="max-w-full break-words rounded-full border border-outline-variant/30 bg-white/60 px-2 py-1 text-[11px] text-on-surface-variant">
                {subject}
              </span>
            )}
          </For>
        </Show>
        <Show when={headerState().showWorkflowAction}>
          <button
            type="button"
            class="w-full rounded-full border border-outline-variant/40 bg-white/50 px-3 py-2 text-[11px] font-medium text-on-surface-variant transition hover:border-primary/40 hover:text-primary sm:ml-auto sm:w-auto sm:py-1"
            onClick={() => props.onViewWorkflow?.()}
          >
            View workflow →
          </button>
        </Show>
      </div>

      <p class="max-w-prose text-sm leading-[1.75] text-on-surface">
        {headerState().summaryText}
      </p>
    </div>
  );
}

export function PresentationCardRenderer(props: {
  message: AfpMessage;
  view?: AfpView;
  onViewWorkflow?: () => void;
}) {
  const rendererState = createMemo(() => {
    const presentationView =
      props.view ?? props.message.views.find((view) => view.format === "ui_presentation");
    const safeMessageContent = decryptedDisplayContent(props.message);
    const candidateContent = props.message.encryption
      ? safeMessageContent
      : presentationView?.content ?? safeMessageContent;
    const rawContent = isRecord(candidateContent) ? candidateContent : {};
    const messageContent = isRecord(safeMessageContent) ? safeMessageContent : {};
    const query =
      typeof rawContent.query === "string"
        ? rawContent.query
        : typeof messageContent.query === "string"
          ? messageContent.query
          : "";
    const content = parsePresentationContent(rawContent, query);
    return {
      rawContent,
      query,
      content,
    };
  });

  const ctx = createPresentationState({
    query: rendererState().query,
    domain: rendererState().content.domain,
    subjects: rendererState().content.subjects,
    expanded: new Set(rendererState().content.cards.slice(0, 4).map((card) => card.id)),
  });

  return (
    <div class="view-enter space-y-2">
      <PresentationHeader
        summary={rendererState().content.summary}
        domain={rendererState().content.domain}
        subjects={rendererState().content.subjects}
        onViewWorkflow={props.onViewWorkflow}
      />
      <CardGrid cards={rendererState().content.cards} ctx={ctx} />
    </div>
  );
}
