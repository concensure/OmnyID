/**
 * PresentationCardRenderer — universal UI Presentation Node.
 *
 * This is the ONLY component responsible for rendering structured results as
 * interactive UI cards. It bridges the AFP agent layer and the visual layer.
 *
 * Extension guide:
 *   • Add a new card type: update CardType in presentationState.ts,
 *     add a component to PresentationCards.tsx, register in CARD_REGISTRY.
 *   • Add a new domain: update DOMAIN_SIGNALS + DOMAIN_DEFAULT_CARDS in presentationState.ts.
 *   • Change layout: edit the CardGrid component below.
 *   • Change card shell controls: edit CardShell below.
 *
 * Responsibilities (UIPresentationNode spec):
 *   ✓ Interprets structured AFP view content → card specs
 *   ✓ Groups cards by subject (multi-instance: Tokyo + Kyoto map cards)
 *   ✓ Manages expand/collapse, hide, save per card
 *   ✓ Shares PresentationStateCtx across all cards reactively
 *   ✗ Does NOT perform research or call tools
 *   ✗ Does NOT replace the master agent
 */

import { createMemo, createSignal, For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { AfpMessage, AfpView } from "@/lib/api";
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

// ── Card metadata (labels, icons, descriptions) ───────────────────────────────
// To add a new card type's label/icon, add one entry here.

const CARD_META: Record<CardType, { label: string; icon: string; description: string }> = {
  summary:           { label: "Overview",         icon: "✦", description: "Summary of results"       },
  key_facts:         { label: "Key Facts",         icon: "⊞", description: "Structured key-value data"},
  sources:           { label: "Sources",           icon: "↗", description: "Reference links"          },
  timeline:          { label: "Timeline",          icon: "◎", description: "Chronological events"     },
  definition:        { label: "Definition",        icon: "≡", description: "Concept explanation"      },
  comparison:        { label: "Comparison",        icon: "⇌", description: "Side-by-side comparison"  },
  compound:          { label: "Compound",          icon: "⬡", description: "Chemical compound"        },
  element_breakdown: { label: "Structure",         icon: "⬢", description: "Elemental breakdown"      },
  properties_table:  { label: "Properties",        icon: "⊟", description: "Scientific properties"   },
  map:               { label: "Location",          icon: "📍", description: "Map & location"           },
  weather:           { label: "Weather",           icon: "🌡", description: "Climate conditions"       },
  flights:           { label: "Flights",           icon: "✈", description: "Flight options"           },
  accommodation:     { label: "Stays",             icon: "🏨", description: "Accommodation options"   },
  activities:        { label: "Activities",        icon: "✿", description: "Things to do"             },
  itinerary:         { label: "Itinerary",         icon: "📅", description: "Day-by-day plan"         },
  price_metrics:     { label: "Price",             icon: "◈", description: "Price & metrics"          },
  ingredients:       { label: "Ingredients",       icon: "⊕", description: "Recipe ingredients"      },
  steps:             { label: "Steps",             icon: "→", description: "Step-by-step guide"       },
  code_snippet:      { label: "Code",              icon: "⌥", description: "Code example"            },
  profile:           { label: "Profile",           icon: "◉", description: "Entity profile"          },
};

// ── Content parser ────────────────────────────────────────────────────────────
// Builds PresentationContent from an AFP view's content blob.
// The server may send a fully-formed PresentationContent, or a raw
// UiCommandResponse-style payload which we normalise here.

function parsePresentationContent(
  content: Record<string, unknown>,
  query: string,
): PresentationContent {
  // If the server already sent a well-formed PresentationContent, use it directly.
  if (Array.isArray(content.cards)) {
    return content as unknown as PresentationContent;
  }

  // Normalise from UiCommandResponse-style payload (bullets, summary, links).
  const summary = typeof content.summary === "string" ? content.summary : query;
  const bullets = Array.isArray(content.bullets) ? (content.bullets as string[]) : [];
  const links = Array.isArray(content.sources)
    ? (content.sources as Array<{ title: string; url: string }>)
    : Array.isArray(content.links)
    ? (content.links as Array<{ title: string; url: string }>)
    : [];

  const domain = detectDomain(query);
  const subjects = Array.isArray(content.subjects)
    ? (content.subjects as string[])
    : extractSubjects(query);

  const cardTypes = DOMAIN_DEFAULT_CARDS[domain];
  const keyFacts = parseKeyFacts(bullets);

  // Build a card spec per type. Cards get data extracted from bullets/summary.
  const cards: CardSpec[] = [];

  for (const type of cardTypes) {
    // Multi-instance: for subject-bound cards, create one per subject.
    const isSubjectBound: CardType[] = ["map", "weather", "accommodation", "activities", "compound", "element_breakdown", "properties_table", "profile"];

    if (isSubjectBound.includes(type) && subjects.length > 1) {
      for (const subject of subjects) {
        cards.push({
          id: `${type}_${subject.toLowerCase().replace(/\s+/g, "_")}`,
          type,
          subject,
          title: `${CARD_META[type].label} — ${subject}`,
          data: extractCardData(type, subject, bullets, summary),
        });
      }
    } else {
      cards.push({
        id: type,
        type,
        subject: subjects[0],
        title: CARD_META[type].label,
        data: extractCardData(type, subjects[0] ?? query, bullets, summary, links, keyFacts),
      });
    }
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

// Extracts card-specific data from the raw bullet/summary payload.
// Override by returning a fully-formed data blob from the server instead.
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
      return { sources: links.map((l) => ({ title: l.title, url: l.url, snippet: "" })) };
    case "definition":
      return { term: subject, definition: summary };
    case "compound":
      return { name: subject, formula: subject, description: summary };
    case "element_breakdown": {
      // Parse element tokens from formula-like subject (e.g. "H2O" → H×2, O×1)
      const elements: Array<{ symbol: string; count: number }> = [];
      const re = /([A-Z][a-z]?)(\d*)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(subject)) !== null) {
        if (m[1]) elements.push({ symbol: m[1], count: parseInt(m[2] || "1", 10) });
      }
      const bondBullet = bullets.find((b) => /bond/i.test(b));
      const bonds = bondBullet ? [{ type: bondBullet.split(":")[1]?.trim() ?? bondBullet }] : [];
      return { elements, bonds };
    }
    case "map":
      return { location: subject };
    case "weather":
      return { conditions: "See forecast", avg_temp: "—", subject };
    case "flights":
      return { options: [] };
    case "accommodation":
      return { options: [] };
    case "activities":
      return { activities: bullets.slice(0, 5).map((b) => ({ name: b })) };
    case "itinerary":
      return { days: [] };
    case "timeline":
      return { events: bullets.slice(0, 6).map((b, i) => ({ date: `${i + 1}`, label: b })) };
    case "comparison":
      return { headers: [subject], rows: keyFacts.map((f) => ({ attribute: f.key, values: [f.value] })) };
    case "price_metrics":
      return { price: "—", change_pct: 0, facts: keyFacts, bullets };
    case "ingredients":
      return { ingredients: bullets.map((b) => ({ name: b, amount: "", unit: "" })), servings: 4 };
    case "steps":
      return { steps: bullets.map((b, i) => ({ step: i + 1, instruction: b })) };
    case "code_snippet":
      return { code: bullets.join("\n"), language: "text", explanation: summary };
    case "profile":
      return { name: subject, bio: summary };
    case "properties_table":
      return { properties: keyFacts.map((f) => ({ property: f.key, value: f.value })) };
    default:
      return { summary, bullets };
  }
}

// ── CardShell — reusable wrapper for every card ───────────────────────────────
// Controls: expand/collapse (click title), hide (×), save (♡), accessible.
// Controls are hidden by default and revealed on hover for minimal clutter.

function CardShell(props: {
  id: string;
  label: string;
  icon: string;
  description: string;
  subject?: string;
  ctx: ReturnType<typeof createPresentationState>;
  children: unknown;
}) {
  const isExpanded = createMemo(() => props.ctx.state().expanded.has(props.id));
  const isSaved    = createMemo(() => props.ctx.state().saved.has(props.id));

  return (
    <div class="group glass-card card-hover rounded-2xl shadow-card overflow-hidden">
      {/* Card header */}
      <button
        type="button"
        class="flex w-full items-center gap-2.5 px-4 pt-4 pb-2 text-left"
        onClick={() => isExpanded() ? props.ctx.collapse(props.id) : props.ctx.expand(props.id)}
        aria-expanded={isExpanded()}
      >
        <span class="shrink-0 text-base leading-none text-on-surface-variant">{props.icon}</span>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold text-on-surface truncate">
            {props.label}
            <Show when={props.subject}>
              <span class="ml-1 font-normal text-on-surface-variant">· {props.subject}</span>
            </Show>
          </p>
          <Show when={!isExpanded()}>
            <p class="text-[10px] text-on-surface-variant truncate">{props.description}</p>
          </Show>
        </div>

        {/* Context controls — hidden until group-hover */}
        <div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            title={isSaved() ? "Unsave" : "Save"}
            class="flex h-6 w-6 items-center justify-center rounded-lg text-xs text-outline transition hover:text-primary"
            onClick={(e) => { e.stopPropagation(); props.ctx.toggleSaved(props.id); }}
          >
            {isSaved() ? "♥" : "♡"}
          </button>
          <button
            type="button"
            title="Remove card"
            class="flex h-6 w-6 items-center justify-center rounded-lg text-xs text-outline transition hover:text-error"
            onClick={(e) => { e.stopPropagation(); props.ctx.hide(props.id); }}
          >
            ×
          </button>
          <span class="ml-1 text-[11px] text-outline transition">
            {isExpanded() ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {/* Card body — shown when expanded */}
      <Show when={isExpanded()}>
        <div class="animate-fade-in px-4 pb-4">
          <div class="h-px w-full bg-outline-variant/20 mb-3" />
          {props.children as unknown as Element}
        </div>
      </Show>
    </div>
  );
}

// ── CardGrid — responsive grid layout ────────────────────────────────────────
// Primary cards (first MAX_PRIMARY) show in a grid.
// Remaining cards stack below in a secondary row.

const MAX_PRIMARY = 4;

function CardGrid(props: {
  cards: CardSpec[];
  ctx: ReturnType<typeof createPresentationState>;
}) {
  const visible = createMemo(() =>
    props.cards.filter((c) => !props.ctx.state().hidden.has(c.id))
  );
  const primary   = createMemo(() => visible().slice(0, MAX_PRIMARY));
  const secondary = createMemo(() => visible().slice(MAX_PRIMARY));
  const [showAll, setShowAll] = createSignal(false);

  return (
    <div class="space-y-3">
      {/* Primary card grid */}
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2">
        <For each={primary()}>
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

      {/* Secondary cards — collapsed by default */}
      <Show when={secondary().length > 0}>
        <Show
          when={showAll()}
          fallback={
            <button
              type="button"
              class="w-full rounded-xl border border-outline-variant/30 bg-white/30 py-2 text-xs font-medium text-on-surface-variant transition hover:bg-white/50"
              onClick={() => setShowAll(true)}
            >
              Show {secondary().length} more card{secondary().length > 1 ? "s" : ""} ▾
            </button>
          }
        >
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 animate-fade-in">
            <For each={secondary()}>
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
      </Show>
    </div>
  );
}

// ── PresentationHeader — summary text + domain badge ─────────────────────────

function PresentationHeader(props: {
  summary: string;
  domain: string;
  subjects: string[];
  onViewWorkflow?: () => void;
}) {
  return (
    <div class="mb-6 space-y-3">
      {/* Domain + workflow toggle */}
      <div class="flex items-center gap-2">
        <span class="rounded-full bg-primary-fixed/60 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-primary">
          {props.domain}
        </span>
        <Show when={props.subjects.length > 0}>
          <For each={props.subjects.slice(0, 3)}>
            {(s) => (
              <span class="rounded-full bg-white/60 border border-outline-variant/30 px-2 py-0.5 text-[11px] text-on-surface-variant">
                {s}
              </span>
            )}
          </For>
        </Show>
        <Show when={props.onViewWorkflow}>
          <button
            type="button"
            class="ml-auto rounded-full border border-outline-variant/40 bg-white/50 px-3 py-0.5 text-[11px] font-medium text-on-surface-variant transition hover:border-primary/40 hover:text-primary"
            onClick={props.onViewWorkflow}
          >
            View workflow →
          </button>
        </Show>
      </div>

      {/* Summary text — generous line-height for readability */}
      <p class="text-sm leading-[1.75] text-on-surface max-w-prose">
        {props.summary}
      </p>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function PresentationCardRenderer(props: {
  message: AfpMessage;
  view?: AfpView;
  /** Called when user clicks "View workflow →" */
  onViewWorkflow?: () => void;
}) {
  const rawContent = createMemo(() => {
    const v = props.view ?? props.message.views.find((v) => v.format === "ui_presentation");
    return (v?.content ?? props.message.content) as Record<string, unknown>;
  });

  const query = createMemo(() =>
    typeof rawContent().query === "string"
      ? (rawContent().query as string)
      : (props.message.content.query as string | undefined) ?? ""
  );

  const content = createMemo(() => parsePresentationContent(rawContent(), query()));

  // Create shared state — all cards read/write this signal
  const ctx = createPresentationState({
    query: query(),
    domain: content().domain,
    subjects: content().subjects,
    // Start with first 4 cards expanded, rest collapsed
    expanded: new Set(content().cards.slice(0, 4).map((c) => c.id)),
  });

  return (
    <div class="view-enter space-y-2">
      <PresentationHeader
        summary={content().summary}
        domain={content().domain}
        subjects={content().subjects}
        onViewWorkflow={props.onViewWorkflow}
      />
      <CardGrid cards={content().cards} ctx={ctx} />
    </div>
  );
}
