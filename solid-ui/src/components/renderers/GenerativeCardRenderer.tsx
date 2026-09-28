import { createEffect, createSignal, createMemo, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import type { AfpMessage } from "@/lib/api";
import { memoryScopeFromMetadata, submitDecision, safeHref } from "@/lib/api";
import { A2UIRenderer } from "@/components/renderers/A2UIRenderer";
import { toast } from "@/components/Toast";
import { buildGenerativeCardFailureReceipt } from "@/lib/generativeCardFailureState";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import {
  loadReasoningTraceExpanded,
  reasoningTraceStorageKey,
  saveReasoningTraceExpanded,
} from "@/lib/generativeCardLocalState";

/**
 * GenerativeCardRenderer ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â renders one streaming generative card per agent query.
 *
 * Architecture:
 *  - One `generative_card` AFP message creates the card.
 *  - Subsequent `card_section_update` messages are merged into the card by section.id.
 *  - Sections are sorted by their `order` field and rendered by type.
 *  - User decisions are submitted via POST /ui/decision.
 */

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ Types ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬

export type CardSection = {
  id: string;
  type: string;
  order: number;
  content: Record<string, unknown>;
  status: "streaming" | "complete" | "awaiting_input" | "error";
};

type CardState = {
  cardId: string;
  query: string;
  status: "streaming" | "complete" | "error";
  optimizationMode: string;
  provider: string;
  model: string;
  costSoFarCents: number;
  tokensUsed: number;
};

type FooterMetricItem = {
  value: string;
  className?: string;
};

type CardShellHeaderProps = {
  query: string;
  optimizationMode: string;
  showOptimizationMode: boolean;
  showStreaming: boolean;
};

type CardShellBodyProps = {
  sectionItems: CardSection[];
  onDecision: (dpId: string, optionId: string) => void;
  threadId: string;
  cardId: string;
  fallbackCardId: string;
};

type CardShellFooterProps = {
  footerItems: FooterMetricItem[];
};

type GenerativeCardRendererState = CardState & {
  showOptimizationMode: boolean;
  showStreaming: boolean;
  sectionItems: CardSection[];
  responseCharacterCount: number;
  footerItems: FooterMetricItem[];
  showFooter: boolean;
};

type SectionRendererState = {
  section: CardSection;
  sectionType: string;
  reasoningTraceKey: string;
  renderedSection: JSX.Element | null;
};

type CostEstimateStrategyViewItem = {
  label: string;
  costText: string;
  runtimeText: string;
  tokenText: string;
  showTokenText: boolean;
  rowClass: string;
  markerStyle: string;
};

type DecisionOptionViewItem = {
  id: string;
  label: string;
  description: string;
  showDescription: boolean;
  pros: string[];
  showPros: boolean;
  cons: string[];
  showCons: boolean;
  chosen: boolean;
  rowClass: string;
};

type CompactSectionShellProps = {
  className?: string;
  children: JSX.Element;
};

type CompactSectionHeaderProps = {
  label?: string;
  labelClassName?: string;
  title: string;
  titleClassName?: string;
  metaText?: string;
  showMeta?: boolean;
};

type StatusTextProps = {
  className: string;
  text: string;
};

type CollectionSectionFrameProps = {
  summary?: string | null;
  showSummary?: boolean;
  showItems: boolean;
  emptyText: string;
  className?: string;
  children: JSX.Element;
};

const COMPACT_SECTION_SHELL_BASE_CLASS = "rounded-lg p-3 space-y-2";
const COMPACT_SECTION_HEADER_CLASS = "flex items-center gap-2";
const COMPACT_SECTION_TITLE_CLASS = "text-sm font-medium text-on-surface";
const THINKING_TOGGLE_BUTTON_CLASS =
  "flex items-center gap-1 text-on-surface-variant/60 hover:text-on-surface-variant transition";
const PRIMARY_ACTION_BUTTON_CLASS =
  "rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white transition hover:bg-primary/80";
const SUCCESS_STATUS_TEXT_CLASS = "text-xs text-green-400";
const CONTENT_EMPTY_STATE_CLASS =
  "rounded-lg border border-dashed border-white/10 bg-white/5 px-3 py-4 text-sm text-on-surface-variant/60";
const CARD_SHELL_ARTICLE_CLASS =
  "card-progressive-shell glass-surface rounded-xl border border-white/35 p-5 shadow-panel space-y-4";
const CARD_SHELL_HEADER_CLASS = "card-progressive-header flex items-start justify-between gap-3";
const CARD_SHELL_BODY_CLASS = "card-progressive-body space-y-3";
const CARD_SHELL_FOOTER_CLASS =
  "card-progressive-footer flex items-center gap-3 pt-2 border-t border-white/10 text-[10px] text-on-surface-variant/60 font-mono";
const AGENT_BADGE_CLASS =
  "rounded-full bg-primary/20 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-primary";
const OPTIMIZATION_BADGE_CLASS =
  "rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface-variant";
const STREAMING_BADGE_CLASS = "flex items-center gap-1 text-[10px] text-on-surface-variant";
const QUERY_TEXT_CLASS = "text-sm font-medium text-on-surface break-words";

function CompactSectionShell(props: CompactSectionShellProps) {
  return <div class={`${COMPACT_SECTION_SHELL_BASE_CLASS} ${props.className ?? ""}`}>{props.children}</div>;
}

function CompactSectionHeader(props: CompactSectionHeaderProps) {
  return (
    <div class={COMPACT_SECTION_HEADER_CLASS}>
      <Show when={props.label}>
        <span class={props.labelClassName}>{props.label}</span>
      </Show>
      <p class={props.titleClassName ?? COMPACT_SECTION_TITLE_CLASS}>{props.title}</p>
      <Show when={props.showMeta}>
        <span class="font-mono text-on-surface-variant/60">{props.metaText}</span>
      </Show>
    </div>
  );
}

function StatusText(props: StatusTextProps) {
  return <p class={props.className}>{props.text}</p>;
}

function ContentEmptyState(props: { text: string }) {
  return <div class={CONTENT_EMPTY_STATE_CLASS}>{props.text}</div>;
}

function CollectionSectionFrame(props: CollectionSectionFrameProps) {
  return (
    <div class={props.className ?? "space-y-2"}>
      <ContentSectionSummary text={props.summary} showText={props.showSummary} />
      <Show when={props.showItems} fallback={<ContentEmptyState text={props.emptyText} />}>
        {props.children}
      </Show>
    </div>
  );
}

function CardShellHeader(props: CardShellHeaderProps) {
  return (
    <div class={CARD_SHELL_HEADER_CLASS}>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class={AGENT_BADGE_CLASS}>Agent</span>
          <Show when={props.showOptimizationMode}>
            <span class={OPTIMIZATION_BADGE_CLASS}>{props.optimizationMode}</span>
          </Show>
          <Show when={props.showStreaming}>
            <span class={STREAMING_BADGE_CLASS}>
              <span class="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              thinking...
            </span>
          </Show>
        </div>
        <p class={QUERY_TEXT_CLASS}>{props.query}</p>
      </div>
    </div>
  );
}

function CardShellBody(props: CardShellBodyProps) {
  return (
    <div class={CARD_SHELL_BODY_CLASS}>
      <For each={props.sectionItems}>
        {(section) => (
          <SectionRenderer
            section={section}
            onDecision={props.onDecision}
            threadId={props.threadId}
            cardId={props.cardId || props.fallbackCardId}
          />
        )}
      </For>
    </div>
  );
}

function CardShellFooter(props: CardShellFooterProps) {
  return (
    <div class={CARD_SHELL_FOOTER_CLASS}>
      <For each={props.footerItems}>
        {(item) => <span class={item.className}>{item.value}</span>}
      </For>
    </div>
  );
}

type SectionRendererProps = {
  section: CardSection;
  onDecision: (dpId: string, optionId: string) => void;
  threadId: string;
  cardId: string;
};

function renderSectionContent(
  props: SectionRendererProps,
  state: Pick<SectionRendererState, "section" | "sectionType" | "reasoningTraceKey">,
): JSX.Element | null {
  switch (state.sectionType) {
    case "thinking":
      return <ThinkingSection section={state.section} storageKey={state.reasoningTraceKey} />;
    case "cost_estimate":
      return <CostEstimateSection section={state.section} />;
    case "decision_point":
      return <DecisionPointSection section={state.section} onDecision={props.onDecision} />;
    case "progress":
      return <ProgressSection section={state.section} />;
    case "callout":
      return <CalloutSection section={state.section} />;
    case "strategy_summary":
      return <StrategySummarySection section={state.section} />;
    case "execution_summary":
      return <ExecutionSummarySection section={state.section} />;
    case "execution_failure":
      return <ExecutionFailureSection section={state.section} />;
    case "reflection_summary":
      return <ReflectionSummarySection section={state.section} />;
    case "planning_guardrail":
      return <PlanningGuardrailSection section={state.section} />;
    case "replan_summary":
      return <ReplanSummarySection section={state.section} />;
    case "retry_summary":
      return <RetrySummarySection section={state.section} />;
    case "search_results":
      return <SearchResultsSection section={state.section} />;
    case "code":
      return <CodeSection section={state.section} />;
    case "canvas":
      return <CanvasSection section={state.section} />;
    case "comparison":
      return <ComparisonSection section={state.section} />;
    case "table":
      return <TableSection section={state.section} />;
    case "attachments":
      return <AttachmentsSection section={state.section} />;
    case "final_answer":
      return <FinalAnswerSection section={state.section} />;
    case "error":
      return <ErrorSection section={state.section} />;
    default:
      return null;
  }
}

function collectStringContentFragments(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStringContentFragments);
  if (isRecord(value)) {
    return Object.values(value).flatMap(collectStringContentFragments);
  }
  return [];
}

function normalizedExecutorName(value: unknown) {
  return String(value ?? "").replaceAll("_", " ");
}

function selectionModeLabel(value: unknown) {
  const selectionMode = String(value ?? "single_path");
  return selectionMode === "user_selected"
    ? "Chosen by you"
    : selectionMode === "auto_selected"
      ? "Auto-selected"
      : "Default path";
}

function heuristicPlannerSourceLabel(value: unknown) {
  return String(value ?? "llm") === "heuristic_policy" ? "System policy" : "Planner judgment";
}

function retrySourceLabel(value: unknown) {
  return String(value ?? "llm") === "heuristic_policy" ? "Policy-driven" : "Planner-driven";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function arrayItems(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function recordItems(value: unknown): Record<string, unknown>[] {
  return arrayItems(value).filter(isRecord);
}

function scalarString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : NaN;
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function displayValue(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function stringItems(value: unknown): string[] {
  return arrayItems(value)
    .map((item) => scalarString(item).trim())
    .filter((item) => item.length > 0);
}

function nullableString(value: unknown): string | null {
  const stringValue = scalarString(value);
  return stringValue ? stringValue : null;
}

function isCardSectionStatus(value: unknown): value is CardSection["status"] {
  return value === "streaming" || value === "complete" || value === "awaiting_input" || value === "error";
}

function isCardStatus(value: unknown): value is CardState["status"] {
  return value === "streaming" || value === "complete" || value === "error";
}

function normalizeCardSection(value: unknown): CardSection | null {
  if (!isRecord(value)) return null;
  return {
    id: scalarString(value.id),
    type: scalarString(value.type),
    order: finiteNumber(value.order),
    content: optionalRecord(value.content) ?? {},
    status: isCardSectionStatus(value.status) ? value.status : "complete",
  };
}

function cardSectionItems(value: unknown): CardSection[] {
  return arrayItems(value).map(normalizeCardSection).filter((section): section is CardSection =>
    Boolean(section?.id),
  );
}

function normalizeCardStatus(value: unknown): CardState["status"] {
  return isCardStatus(value) ? value : "streaming";
}

function textSectionState(
  section: CardSection,
  options?: { includeTitle?: boolean },
) {
  const content = section.content;
  const title = scalarString(content.title);
  return {
    a2ui: optionalRecord(content.a2ui),
    title,
    showTitle: Boolean(options?.includeTitle && title),
    text: scalarString(content.text),
  };
}

function decisionCategoryToneClass(value: unknown) {
  const category = scalarString(value, "clarification");
  const toneClassByCategory: Record<string, string> = {
    clarification: "text-blue-400",
    strategy: "text-yellow-400",
    confirmation: "text-red-400",
  };
  return toneClassByCategory[category] ?? "text-on-surface-variant";
}

function normalizeCostEstimateStrategyItems(
  strategies: unknown,
  provider: string,
  selectedStrategyLabel: string,
): CostEstimateStrategyViewItem[] {
  return recordItems(strategies).map((strategy) => {
    const strategyLabel = scalarString(strategy.strategy_label);
    const dollarCostCents = finiteNumber(strategy.dollar_cost_cents);
    const timeSeconds = finiteNumber(strategy.time_seconds);
    const tokenCost = finiteNumber(strategy.token_cost);
    const selectedRow = strategyLabel === selectedStrategyLabel;
    const costText = dollarCostCents > 0
      ? `$${(dollarCostCents / 100).toFixed(4)}`
      : provider === "ollama"
        ? "free (local)"
        : "$0";
    return {
      label: strategyLabel,
      costText,
      runtimeText: `~${timeSeconds.toFixed(0)}s`,
      tokenText: `${tokenCost.toLocaleString()} tok`,
      showTokenText: tokenCost > 0,
      rowClass: selectedRow ? "bg-primary/10 border border-primary/30" : "",
      markerStyle: `background:${selectedRow ? "var(--color-primary)" : "transparent"}; border: 1px solid currentColor`,
    };
  });
}

function normalizeDecisionOptionItems(
  options: unknown,
  selectedValue: string,
): DecisionOptionViewItem[] {
  return recordItems(options).map((option) => {
    const chosen = selectedValue === option.id || (!selectedValue && Boolean(option.is_default));
    const pros = stringItems(option.pros);
    const cons = stringItems(option.cons);
    return {
      id: scalarString(option.id),
      label: scalarString(option.label),
      description: scalarString(option.description),
      showDescription: Boolean(scalarString(option.description)),
      pros,
      showPros: pros.length > 0,
      cons,
      showCons: cons.length > 0,
      chosen,
      rowClass: chosen
        ? "bg-primary/10 border border-primary/30"
        : "border border-transparent hover:bg-white/5",
    };
  });
}

function StrategyEstimateRow(props: {
  strategy: CostEstimateStrategyViewItem;
}) {
  return (
    <div class={`flex items-center gap-2 rounded px-2 py-1 ${props.strategy.rowClass}`}>
      <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style={props.strategy.markerStyle} />
      <span class="font-mono flex-1">{props.strategy.label}</span>
      <span class="text-on-surface-variant">{props.strategy.costText}</span>
      <span class="text-on-surface-variant">{props.strategy.runtimeText}</span>
      <Show when={props.strategy.showTokenText}>
        <span class="text-on-surface-variant/50">{props.strategy.tokenText}</span>
      </Show>
    </div>
  );
}

function DecisionOptionCard(props: {
  decisionPointId: string;
  option: DecisionOptionViewItem;
  disabled: boolean;
  onSelect: (optionId: string) => void;
}) {
  return (
    <label class={`flex items-start gap-3 cursor-pointer rounded-lg p-2 transition ${props.option.rowClass}`}>
      <input
        type="radio"
        name={props.decisionPointId}
        value={props.option.id}
        checked={props.option.chosen}
        onChange={() => props.onSelect(props.option.id)}
        class="mt-0.5 accent-primary"
        disabled={props.disabled}
      />
      <div class="flex-1 min-w-0">
        <p class="text-sm text-on-surface">{props.option.label}</p>
        <Show when={props.option.showDescription}>
          <p class="text-xs text-on-surface-variant/60 mt-0.5">{props.option.description}</p>
        </Show>
        <Show when={props.option.showPros || props.option.showCons}>
          <div class="mt-1 flex gap-4 text-[11px]">
            <Show when={props.option.showPros}>
              <ul class="space-y-0.5">
                <For each={props.option.pros}>{(pro) => <li class="text-green-400">+ {pro}</li>}</For>
              </ul>
            </Show>
            <Show when={props.option.showCons}>
              <ul class="space-y-0.5">
                <For each={props.option.cons}>{(con) => <li class="text-red-400">- {con}</li>}</For>
              </ul>
            </Show>
          </div>
        </Show>
      </div>
    </label>
  );
}

function ProgressMeter(props: {
  text: string;
  percentage: number;
  progressStyle: string;
}) {
  return (
    <div class="space-y-1">
      <div class="flex items-center justify-between text-[11px] text-on-surface-variant">
        <span>{props.text}</span>
        <span class="font-mono">{props.percentage}%</span>
      </div>
      <div class="h-1 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          class="h-full rounded-full bg-primary transition-all duration-500"
          style={props.progressStyle}
        />
      </div>
    </div>
  );
}

function ToneMessageCard(props: {
  className: string;
  title?: string;
  showTitle?: boolean;
  text: string;
}) {
  return (
    <div class={props.className}>
      <Show when={props.showTitle}>
        <h3 class="text-sm font-semibold">{props.title}</h3>
      </Show>
      <p class="text-sm whitespace-pre-wrap text-on-surface/90">{props.text}</p>
    </div>
  );
}

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ Main component ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬

export function GenerativeCardRenderer(props: {
  message: AfpMessage;
  updates: AfpMessage[];
  onDecision?: (cardId: string, dpId: string, optionId: string) => void;
}) {
  const messageContent = createMemo(() => decryptedDisplayContent(props.message));
  const latestUpdateContent = createMemo(() => {
    const latestUpdate = props.updates[props.updates.length - 1];
    return latestUpdate ? decryptedDisplayContent(latestUpdate) : undefined;
  });

  const sectionItems = createMemo<CardSection[]>(() => {
    const sectionMap = new Map<string, CardSection>();

    for (const section of cardSectionItems(messageContent().sections)) {
      sectionMap.set(section.id, section);
    }

    for (const update of props.updates) {
      const updateContent = decryptedDisplayContent(update);
      const section = normalizeCardSection(updateContent.section);
      if (section?.id) {
        sectionMap.set(section.id, section);
      }
    }

    return [...sectionMap.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  });

  const rendererState = createMemo<GenerativeCardRendererState>(() => {
    const content = messageContent();
    const latestUpdate = latestUpdateContent();
    const resolvedSections = sectionItems();
    const responseCharacterCount = resolvedSections
      .flatMap((section) => collectStringContentFragments(section.content))
      .join("")
      .trim()
      .length;
    return {
      cardId: scalarString(content.card_id),
      query: scalarString(content.query),
      status: normalizeCardStatus(content.status),
      optimizationMode: scalarString(content.optimization_mode, "balanced"),
      provider: scalarString(content.provider),
      model: scalarString(content.model),
      costSoFarCents: finiteNumber(latestUpdate?.cost_so_far_cents ?? content.cost_so_far_cents),
      tokensUsed: finiteNumber(latestUpdate?.tokens_used ?? content.tokens_used),
      showOptimizationMode: scalarString(content.optimization_mode, "balanced") !== "balanced",
      showStreaming:
        scalarString(content.status, "streaming") === "streaming" ||
        resolvedSections.some((section) => section.status === "streaming"),
      sectionItems: resolvedSections,
      responseCharacterCount,
      footerItems: [
        ...(responseCharacterCount > 0
          ? [{ value: `${responseCharacterCount.toLocaleString()} chars` }]
          : []),
        ...(finiteNumber(latestUpdate?.tokens_used ?? content.tokens_used) > 0
          ? [{ value: `${finiteNumber(latestUpdate?.tokens_used ?? content.tokens_used).toLocaleString()} tokens` }]
          : []),
        ...(finiteNumber(latestUpdate?.cost_so_far_cents ?? content.cost_so_far_cents) > 0
          ? [{ value: `$${(finiteNumber(latestUpdate?.cost_so_far_cents ?? content.cost_so_far_cents) / 100).toFixed(4)}` }]
          : []),
        ...(scalarString(content.model)
          ? [{ value: scalarString(content.model), className: "opacity-60" }]
          : []),
      ],
      showFooter:
        responseCharacterCount > 0 ||
        finiteNumber(latestUpdate?.tokens_used ?? content.tokens_used) > 0 ||
        finiteNumber(latestUpdate?.cost_so_far_cents ?? content.cost_so_far_cents) > 0,
    };
  });

  async function handleDecision(dpId: string, optionId: string) {
    const state = rendererState();
    const threadId = props.message.thread_id;
    try {
      await submitDecision({
        card_id: state.cardId,
        decision_point_id: dpId,
        selected_option_id: optionId,
        thread_id: threadId,
        memory_scope: memoryScopeFromMetadata(props.message.metadata, {
          author_type: "human",
        }),
      });
      props.onDecision?.(state.cardId, dpId, optionId);
    } catch (err) {
      console.error("Failed to submit decision:", err);
    }
  }

  return (
    <article class={CARD_SHELL_ARTICLE_CLASS}>
      <CardShellHeader
        query={rendererState().query}
        optimizationMode={rendererState().optimizationMode}
        showOptimizationMode={rendererState().showOptimizationMode}
        showStreaming={rendererState().showStreaming}
      />
      <CardShellBody
        sectionItems={rendererState().sectionItems}
        onDecision={handleDecision}
        threadId={props.message.thread_id}
        cardId={rendererState().cardId}
        fallbackCardId={props.message.id}
      />
      <Show when={rendererState().showFooter}>
        <CardShellFooter footerItems={rendererState().footerItems} />
      </Show>
    </article>
  );
}

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ Section dispatcher ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬

function SectionRenderer(props: SectionRendererProps) {
  const state = createMemo<SectionRendererState>(() => {
    const section = props.section;
    const sectionType = section.type;
    const reasoningTraceKey = reasoningTraceStorageKey(props.threadId, props.cardId, section.id);
    return {
      section,
      sectionType,
      reasoningTraceKey,
      renderedSection: renderSectionContent(props, {
        section,
        sectionType,
        reasoningTraceKey,
      }),
    };
  });

  return state().renderedSection;
}

// ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬ Section renderers ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚¬

type ThinkingSectionState = {
  text: string;
  toggleLabel: string;
  statusSuffix: string;
  expandedIcon: string;
  showText: boolean;
};

function ThinkingSection(props: { section: CardSection; storageKey?: string | null }) {
  const [expanded, setExpanded] = createSignal(loadReasoningTraceExpanded(props.storageKey ?? null));
  const sectionState = createMemo<ThinkingSectionState>(() => ({
    text: String(props.section.content.text ?? ""),
    toggleLabel: expanded() ? "Hide steps" : "Show steps",
    statusSuffix: props.section.status === "complete" ? "" : "...",
    expandedIcon: expanded() ? "v" : ">",
    showText: expanded(),
  }));

  createEffect(() => {
    saveReasoningTraceExpanded(props.storageKey ?? null, expanded());
  });

  return (
    <div class="text-xs">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        class={THINKING_TOGGLE_BUTTON_CLASS}
      >
        <span class="text-[10px]">{sectionState().expandedIcon}</span>
        <span class="font-mono">{sectionState().toggleLabel}{sectionState().statusSuffix}</span>
      </button>
      <Show when={sectionState().showText}>
        <p class="mt-1 pl-3 italic text-on-surface-variant/70 border-l border-white/10 whitespace-pre-wrap">
          {sectionState().text}
        </p>
      </Show>
    </div>
  );
}

type CostEstimateSectionState = {
  providerModelText: string;
  showSelectedPath: boolean;
  selectionModeLabel: string;
  selectedLabel: string;
  selectedExecutorText: string;
  showSelectedExecutor: boolean;
  selectedOutcome: string;
  showSelectedOutcome: boolean;
  selectedSummary: string;
  showSelectedSummary: boolean;
  strategyItems: CostEstimateStrategyViewItem[];
  budgetText: string;
  showBudget: boolean;
  userMessage: string;
  showUserMessage: boolean;
};

function CostEstimateSection(props: { section: CardSection }) {
  const sectionState = createMemo<CostEstimateSectionState>(() => {
    const content = props.section.content;
    const provider = scalarString(content.provider);
    const model = scalarString(content.model);
    const selected = optionalRecord(content.selected);
    const selectedLabel = scalarString(content.selected_strategy_label, scalarString(selected?.strategy_label));
    const selectedOutcome = scalarString(content.selected_strategy_outcome);
    const selectedSummary = scalarString(content.selected_strategy_summary);
    const selectedExecutor = scalarString(content.selected_strategy_executor);
    const budget = finiteNumber(content.budget_remaining_cents);
    const userMessage = scalarString(content.user_message);
    const selectedStrategyLabel = scalarString(selected?.strategy_label);
    return {
      providerModelText: `${provider} | ${model}`,
      showSelectedPath: Boolean(selectedLabel),
      selectionModeLabel: selectionModeLabel(content.strategy_selection_mode),
      selectedLabel,
      selectedExecutorText: `for ${selectedExecutor}`,
      showSelectedExecutor: Boolean(selectedExecutor),
      selectedOutcome,
      showSelectedOutcome: Boolean(selectedOutcome),
      selectedSummary,
      showSelectedSummary: Boolean(selectedSummary) && selectedSummary !== selectedOutcome,
      strategyItems: normalizeCostEstimateStrategyItems(content.strategies, provider, selectedStrategyLabel),
      budgetText: `Budget: $${(budget / 100).toFixed(2)} remaining`,
      showBudget: budget > 0,
      userMessage,
      showUserMessage: Boolean(userMessage),
    };
  });

  return (
    <CompactSectionShell className="border border-white/15 bg-white/5 text-xs">
      <CompactSectionHeader
        title="Cost Estimate"
        titleClassName="font-semibold text-on-surface"
        metaText={sectionState().providerModelText}
        showMeta={true}
      />
      <Show when={sectionState().showSelectedPath}>
        <div class="rounded-lg border border-primary/25 bg-primary/8 px-3 py-2 space-y-1">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[10px] font-mono uppercase tracking-[0.18em] text-primary/90">
              Selected Path
            </span>
            <span class="text-[10px] font-mono text-on-surface-variant/70">
              {sectionState().selectionModeLabel}
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-white/60 px-2 py-0.5 font-medium text-on-surface">
              {sectionState().selectedLabel}
            </span>
            <Show when={sectionState().showSelectedExecutor}>
              <span class="text-on-surface-variant/70">{sectionState().selectedExecutorText}</span>
            </Show>
          </div>
          <Show when={sectionState().showSelectedOutcome}>
            <p class="text-on-surface-variant/80">{sectionState().selectedOutcome}</p>
          </Show>
          <Show when={sectionState().showSelectedSummary}>
            <p class="text-on-surface-variant/65">{sectionState().selectedSummary}</p>
          </Show>
        </div>
      </Show>
      <For each={sectionState().strategyItems}>
        {(strategy) => <StrategyEstimateRow strategy={strategy} />}
      </For>
      <Show when={sectionState().showBudget}>
        <p class="text-on-surface-variant/50 font-mono">{sectionState().budgetText}</p>
      </Show>
      <Show when={sectionState().showUserMessage}>
        <p class="text-on-surface-variant/70">{sectionState().userMessage}</p>
      </Show>
    </CompactSectionShell>
  );
}

type DecisionPointSectionState = {
  decisionPointId: string;
  question: string;
  category: string;
  categoryClass: string;
  context: string;
  showContext: boolean;
  optionItems: DecisionOptionViewItem[];
  submitLabel: string;
  submittedText: string;
  showSubmitAction: boolean;
  showSubmittedText: boolean;
};

function DecisionPointSection(props: {
  section: CardSection;
  onDecision: (dpId: string, optionId: string) => void;
}) {
  const [selected, setSelected] = createSignal<string>("");
  const [submitted, setSubmitted] = createSignal(false);
  const sectionState = createMemo<DecisionPointSectionState>(() => {
    const content = props.section.content;
    const decisionPointId = scalarString(content.id, props.section.id);
    const category = scalarString(content.category, "clarification");
    const context = scalarString(content.context);
    return {
      decisionPointId,
      question: scalarString(content.question),
      category,
      categoryClass: decisionCategoryToneClass(category),
      context,
      showContext: Boolean(context),
      optionItems: normalizeDecisionOptionItems(content.options, selected()),
      submitLabel: "Confirm",
      submittedText: "Done. Decision recorded",
      showSubmitAction: !submitted(),
      showSubmittedText: submitted(),
    };
  });

  function handleSubmit() {
    const opt = selected() || sectionState().optionItems.find((option) => option.chosen)?.id || "";
    if (!opt) return;
    setSubmitted(true);
    props.onDecision(sectionState().decisionPointId, opt);
  }

  return (
    <CompactSectionShell className="border border-white/20 bg-white/5 space-y-3">
      <CompactSectionHeader
        label={sectionState().category}
        labelClassName={`text-[10px] font-mono uppercase tracking-wide ${sectionState().categoryClass}`}
        title={sectionState().question}
      />

      <Show when={sectionState().showContext}>
        <p class="text-xs text-on-surface-variant/70">{sectionState().context}</p>
      </Show>

      <div class="space-y-2">
        <For each={sectionState().optionItems}>
          {(option) => (
            <DecisionOptionCard
              decisionPointId={sectionState().decisionPointId}
              option={option}
              disabled={submitted()}
              onSelect={setSelected}
            />
          )}
        </For>
      </div>

      <Show when={sectionState().showSubmitAction}>
        <button
          type="button"
          onClick={handleSubmit}
          class={PRIMARY_ACTION_BUTTON_CLASS}
        >
          {sectionState().submitLabel}
        </button>
      </Show>
      <Show when={sectionState().showSubmittedText}>
        <StatusText className={SUCCESS_STATUS_TEXT_CLASS} text={sectionState().submittedText} />
      </Show>
    </CompactSectionShell>
  );
}

type ProgressSectionState = {
  a2ui: Record<string, unknown> | undefined;
  text: string;
  percentage: number;
  showProgress: boolean;
  progressStyle: string;
};

function ProgressSection(props: { section: CardSection }) {
  const sectionState = createMemo<ProgressSectionState>(() => {
    const content = props.section.content;
    const percentage = finiteNumber(content.pct);
    return {
      a2ui: optionalRecord(content.a2ui),
      text: scalarString(content.text),
      percentage,
      showProgress: props.section.status !== "complete" || percentage < 100,
      progressStyle: `width: ${percentage}%`,
    };
  });

  return (
    <SectionWithA2UIFallback a2uiContent={sectionState().a2ui} sectionId={props.section.id}>
      <Show when={sectionState().showProgress}>
        <ProgressMeter
          text={sectionState().text}
          percentage={sectionState().percentage}
          progressStyle={sectionState().progressStyle}
        />
      </Show>
    </SectionWithA2UIFallback>
  );
}

type CalloutSectionState = {
  title: string;
  showTitle: boolean;
  text: string;
  toneClass: string;
};

function CalloutSection(props: { section: CardSection }) {
  const sectionState = createMemo<CalloutSectionState>(() => {
    const content = props.section.content;
    const tone = scalarString(content.tone, "info");
    const title = scalarString(content.title);
    const toneClassByKind: Record<string, string> = {
      info: "border-primary/30 bg-primary/10 text-on-surface",
      strategy: "border-amber-400/30 bg-amber-400/10 text-on-surface",
      confirmation: "border-green-400/30 bg-green-400/10 text-on-surface",
      warning: "border-red-400/30 bg-red-400/10 text-on-surface",
    };
    const toneClass = toneClassByKind[tone] ?? "border-primary/30 bg-primary/10 text-on-surface";
    return {
      title,
      showTitle: Boolean(title),
      text: scalarString(content.text),
      toneClass,
    };
  });

  return (
    <CompactSectionShell className={`border space-y-1 ${sectionState().toneClass}`}>
      <ToneMessageCard
        className="space-y-1"
        title={sectionState().title}
        showTitle={sectionState().showTitle}
        text={sectionState().text}
      />
    </CompactSectionShell>
  );
}

type StrategySummaryState = {
  title: string;
  text: string;
  executorName: string;
  showExecutorName: boolean;
  strategyLabel: string;
  showStrategyLabel: boolean;
};

function StrategySummarySection(props: { section: CardSection }) {
  const cardState = createMemo<StrategySummaryState>(() => {
    const content = props.section.content;
    const executorName = scalarString(content.executor_name);
    const strategyLabel = scalarString(content.strategy_label);
    return {
      title: scalarString(content.title),
      text: scalarString(content.text),
      executorName: normalizedExecutorName(executorName),
      showExecutorName: Boolean(executorName),
      strategyLabel,
      showStrategyLabel: Boolean(strategyLabel),
    };
  });

  return (
    <SummarySectionShell className="rounded-xl border border-amber-400/25 bg-[linear-gradient(135deg,rgba(201,149,58,0.14),rgba(255,255,255,0.06))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <SummarySectionHeader
        badgeLabel="Strategy"
        badgeClass="rounded-full bg-amber-400/15 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-amber-300"
        leftMetaText={cardState().executorName}
        showLeftMeta={cardState().showExecutorName}
      />
      <SummarySectionTitle title={cardState().title} className="mt-3 text-sm font-semibold text-on-surface" />
      <SummaryBodyText
        text={cardState().text}
        className="mt-2 text-sm leading-6 whitespace-pre-wrap text-on-surface/90"
      />
      <Show when={cardState().showStrategyLabel}>
        <SummaryDetailCard
          label="Expected Path"
          value={cardState().strategyLabel}
          className="mt-3 rounded-lg border border-white/10 bg-black/10 px-3 py-2"
        />
      </Show>
    </SummarySectionShell>
  );
}

type ExecutionSummaryState = {
  title: string;
  executorName: string;
  showExecutorName: boolean;
  selectionLabel: string;
  alignmentToneClass: string;
  alignmentLabel: string;
  alignmentReason: string;
  showAlignmentReason: boolean;
  expectedOutcome: string;
  showExpectedOutcome: boolean;
  resultSummary: string;
  showResultSummary: boolean;
  strategyLabel: string;
  showStrategyLabel: boolean;
  runtimeText: string;
  estimatedRuntimeText: string;
  showEstimatedRuntime: boolean;
  spendText: string;
  estimatedSpendText: string;
  showEstimatedSpend: boolean;
  tokensText: string;
  showTokens: boolean;
  estimatedTokensText: string;
  showEstimatedTokens: boolean;
};

function ExecutionSummarySection(props: { section: CardSection }) {
  const cardState = createMemo<ExecutionSummaryState>(() => {
    const content = props.section.content;
    const alignment = scalarString(content.alignment, "completed_default_path");
    const executorName = scalarString(content.executor_name);
    const strategyLabel = scalarString(content.strategy_label);
    const alignmentReason = scalarString(content.alignment_reason);
    const expectedOutcome = scalarString(content.expected_outcome);
    const resultSummary = scalarString(content.result_summary);
    const estimatedTime = finiteNumber(content.estimated_time_seconds);
    const estimatedCost = finiteNumber(content.estimated_cost_cents);
    const estimatedTokens = finiteNumber(content.estimated_tokens);
    const timeElapsed = finiteNumber(content.time_elapsed);
    const costCents = finiteNumber(content.cost_cents);
    const tokensUsed = finiteNumber(content.tokens_used);
    const alignmentLabel = (() => {
      switch (alignment) {
        case "matched_strategy":
          return "Delivered against selected path";
        case "drifted_budget":
          return "Completed, but over budget envelope";
        case "drifted_time":
          return "Completed, but slower than expected";
        case "drifted_tokens":
          return "Completed, but used more model tokens";
        case "drifted_time_and_budget":
          return "Completed outside time and budget envelope";
        default:
          return "Completed default path";
      }
    })();
    const alignmentToneClass = (() => {
      switch (alignment) {
        case "matched_strategy":
        case "completed_default_path":
          return "border-emerald-400/20 bg-emerald-400/8";
        case "drifted_budget":
        case "drifted_time":
        case "drifted_tokens":
        case "drifted_time_and_budget":
          return "border-amber-400/30 bg-amber-400/10";
        default:
          return "border-white/10 bg-black/10";
      }
    })();
    return {
      title: scalarString(content.title),
      executorName: normalizedExecutorName(executorName),
      showExecutorName: Boolean(executorName),
      selectionLabel: selectionModeLabel(content.selection_mode),
      alignmentToneClass,
      alignmentLabel,
      alignmentReason,
      showAlignmentReason: Boolean(alignmentReason),
      expectedOutcome,
      showExpectedOutcome: Boolean(expectedOutcome),
      resultSummary,
      showResultSummary: Boolean(resultSummary),
      strategyLabel,
      showStrategyLabel: Boolean(strategyLabel),
      runtimeText: `~${timeElapsed.toFixed(1)}s`,
      estimatedRuntimeText: `Estimated ~${estimatedTime.toFixed(1)}s`,
      showEstimatedRuntime: estimatedTime > 0,
      spendText: costCents > 0 ? `$${(costCents / 100).toFixed(4)}` : "No direct cost",
      estimatedSpendText: `Estimated $${(estimatedCost / 100).toFixed(4)}`,
      showEstimatedSpend: estimatedCost > 0,
      tokensText: `${tokensUsed.toLocaleString()} tokens`,
      showTokens: tokensUsed > 0,
      estimatedTokensText: `Estimated ${estimatedTokens.toLocaleString()} tokens`,
      showEstimatedTokens: estimatedTokens > 0,
    };
  });

  return (
    <SummarySectionShell className="rounded-xl border border-emerald-400/25 bg-[linear-gradient(135deg,rgba(45,143,99,0.16),rgba(255,255,255,0.06))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] space-y-3">
      <SummarySectionHeader
        badgeLabel="Execution"
        badgeClass="rounded-full bg-emerald-400/15 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-300"
        leftMetaText={cardState().executorName}
        showLeftMeta={cardState().showExecutorName}
        rightMetaText={cardState().selectionLabel}
        showRightMeta={true}
      />
      <SummarySectionTitle title={cardState().title} />
      <SummaryOutcomePanel
        className={`rounded-lg px-3 py-2 space-y-1 ${cardState().alignmentToneClass}`}
        label="Outcome Check"
        value={cardState().alignmentLabel}
        primaryDetailText={cardState().alignmentReason}
        showPrimaryDetailText={cardState().showAlignmentReason}
        secondaryDetailText={`Expected: ${cardState().expectedOutcome}`}
        showSecondaryDetailText={cardState().showExpectedOutcome}
        tertiaryDetailText={`Delivered: ${cardState().resultSummary}`}
        showTertiaryDetailText={cardState().showResultSummary}
      />
      <SummaryMetricsGrid>
        <Show when={cardState().showStrategyLabel}>
          <SummaryDetailCard label="Path" value={cardState().strategyLabel} />
        </Show>
        <SummaryDetailCard
          label="Runtime"
          value={cardState().runtimeText}
          detailText={cardState().estimatedRuntimeText}
          showDetailText={cardState().showEstimatedRuntime}
        />
        <SummarySpendCard
          label="Spend"
          value={cardState().spendText}
          detailText={cardState().estimatedSpendText}
          showDetailText={cardState().showEstimatedSpend}
          supplementalText={
            cardState().showTokens
              ? cardState().showEstimatedTokens
                ? `${cardState().tokensText}\n${cardState().estimatedTokensText}`
                : cardState().tokensText
              : cardState().estimatedTokensText
          }
          showSupplementalText={cardState().showTokens || cardState().showEstimatedTokens}
        />
      </SummaryMetricsGrid>
    </SummarySectionShell>
  );
}

type ExecutionFailureState = {
  title: string;
  executorName: string;
  showExecutorName: boolean;
  strategyLabel: string;
  showStrategyLabel: boolean;
  expectedOutcome: string;
  showExpectedOutcome: boolean;
  failureLabel: string;
  selectionLabel: string;
  receiptTitle: string;
  receiptSummary: string;
  receiptNextStep: string;
  receiptToneClass: string;
  failureReason: string;
  showFailureReason: boolean;
  expectedRuntimeText: string;
  expectedSpendText: string;
  estimatedTokensText: string;
  showEstimatedTokens: boolean;
};

function ExecutionFailureSection(props: { section: CardSection }) {
  const cardState = createMemo<ExecutionFailureState>(() => {
    const content = props.section.content;
    const failureKind = scalarString(content.failure_kind, "executor_error");
    const title = scalarString(content.title);
    const failureReason = scalarString(content.failure_reason);
    const errorText = scalarString(content.error_text);
    const strategyLabel = scalarString(content.strategy_label);
    const expectedOutcome = scalarString(content.expected_outcome);
    const executorName = scalarString(content.executor_name);
    const estimatedTime = finiteNumber(content.estimated_time_seconds);
    const estimatedCost = finiteNumber(content.estimated_cost_cents);
    const estimatedTokens = finiteNumber(content.estimated_tokens);
    const failureLabel = (() => {
      switch (failureKind) {
        case "timeout":
          return "Timed out";
        case "permission":
          return "Blocked by policy";
        default:
          return "Execution failed";
      }
    })();
    const receipt = buildGenerativeCardFailureReceipt(
      title || failureLabel,
      [failureReason, errorText].filter(Boolean).join(" "),
    );
    return {
      title,
      executorName: normalizedExecutorName(executorName),
      showExecutorName: Boolean(executorName),
      strategyLabel,
      showStrategyLabel: Boolean(strategyLabel),
      expectedOutcome,
      showExpectedOutcome: Boolean(expectedOutcome),
      failureLabel,
      selectionLabel: selectionModeLabel(content.selection_mode),
      receiptTitle: receipt.title,
      receiptSummary: receipt.summary,
      receiptNextStep: receipt.nextStep,
      receiptToneClass: receipt.tone === "danger"
        ? "border border-red-400/25 bg-red-400/10"
        : "border border-amber-400/25 bg-amber-400/10",
      failureReason,
      showFailureReason: Boolean(failureReason),
      expectedRuntimeText: estimatedTime > 0 ? `~${estimatedTime.toFixed(1)}s` : "Not estimated",
      expectedSpendText: estimatedCost > 0 ? `$${(estimatedCost / 100).toFixed(4)}` : "No direct cost",
      estimatedTokensText: `${estimatedTokens.toLocaleString()} est. tokens`,
      showEstimatedTokens: estimatedTokens > 0,
    };
  });

  return (
    <SummarySectionShell className="rounded-xl border border-red-400/30 bg-[linear-gradient(135deg,rgba(172,52,69,0.16),rgba(255,255,255,0.06))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] space-y-3">
      <SummarySectionHeader
        badgeLabel="Failure"
        badgeClass="rounded-full bg-red-400/15 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-red-300"
        leftMetaText={cardState().executorName}
        showLeftMeta={cardState().showExecutorName}
        rightMetaText={cardState().selectionLabel}
        showRightMeta={true}
      />
      <SummarySectionTitle title={cardState().title} />
      <SummaryOutcomePanel
        className={`rounded-lg px-3 py-2 space-y-1 ${cardState().receiptToneClass}`}
        label={cardState().failureLabel}
        value={cardState().receiptTitle}
        primaryDetailText={cardState().failureReason}
        showPrimaryDetailText={cardState().showFailureReason}
        secondaryDetailText={cardState().receiptSummary}
        showSecondaryDetailText={true}
        tertiaryDetailText={`${cardState().showExpectedOutcome ? `Expected: ${cardState().expectedOutcome}\n` : ""}${cardState().receiptNextStep}`}
        showTertiaryDetailText={true}
      />
      <SummaryMetricsGrid>
        <Show when={cardState().showStrategyLabel}>
          <SummaryDetailCard label="Path" value={cardState().strategyLabel} />
        </Show>
        <SummaryDetailCard label="Expected runtime" value={cardState().expectedRuntimeText} />
        <SummaryDetailCard
          label="Expected spend"
          value={cardState().expectedSpendText}
          detailText={cardState().estimatedTokensText}
          showDetailText={cardState().showEstimatedTokens}
        />
      </SummaryMetricsGrid>
    </SummarySectionShell>
  );
}

type RetrySummaryState = {
  a2ui: Record<string, unknown> | undefined;
  title: string;
  text: string;
  badgeLabel: string;
  toneClass: string;
  attemptText: string;
  sourceLabel: string;
  previousPath: string;
  retryPath: string;
  showStrategyGrid: boolean;
};

function RetrySummarySection(props: { section: CardSection }) {
  const cardState = createMemo<RetrySummaryState>(() => {
    const content = props.section.content;
    const mode = scalarString(content.mode, "same_path");
    const previousPath = scalarString(content.from_strategy);
    const retryPath = scalarString(content.to_strategy, previousPath || "Unspecified");
    return {
      a2ui: optionalRecord(content.a2ui),
      title: scalarString(content.title),
      text: scalarString(content.text),
      badgeLabel: mode === "downgraded_path" ? "Fallback retry" : "Retry",
      toneClass: mode === "downgraded_path"
        ? "border-amber-400/25 bg-amber-400/10"
        : "border-sky-400/25 bg-sky-400/10",
      attemptText: `Attempt ${finiteNumber(content.retry_count)} of ${finiteNumber(content.max_retries)}`,
      sourceLabel: retrySourceLabel(content.source),
      previousPath: previousPath || "Unspecified",
      retryPath,
      showStrategyGrid: Boolean(previousPath || retryPath),
    };
  });

  return (
    <SummaryA2UISection
      a2uiContent={cardState().a2ui}
      sectionId={props.section.id}
      shellClassName={`rounded-xl border p-4 space-y-3 ${cardState().toneClass}`}
      badgeLabel={cardState().badgeLabel}
      badgeClass="rounded-full bg-white/50 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface"
      title={cardState().title}
      bodyText={cardState().text}
      bodyClassName="text-sm whitespace-pre-wrap text-on-surface/90"
      leftMetaText={cardState().attemptText}
      showLeftMeta={true}
      rightMetaText={cardState().sourceLabel}
      showRightMeta={true}
    >
        <Show when={cardState().showStrategyGrid}>
          <div class="grid gap-2 sm:grid-cols-2">
            <SummaryDetailCard label="Previous path" value={cardState().previousPath} />
            <SummaryDetailCard label="Retry path" value={cardState().retryPath} />
          </div>
        </Show>
    </SummaryA2UISection>
  );
}

type ReflectionSummaryState = {
  a2ui: Record<string, unknown> | undefined;
  title: string;
  reason: string;
  decisionText: string;
  sourceLabel: string;
  executorName: string;
  showExecutorName: boolean;
};

function ReflectionSummarySection(props: { section: CardSection }) {
  const cardState = createMemo<ReflectionSummaryState>(() => {
    const content = props.section.content;
    const executorName = scalarString(content.executor_name);
    return {
      a2ui: optionalRecord(content.a2ui),
      title: scalarString(content.title),
      reason: scalarString(content.reason),
      decisionText: scalarString(content.decision, "continue").replaceAll("_", " "),
      sourceLabel: heuristicPlannerSourceLabel(content.source),
      executorName: normalizedExecutorName(executorName),
      showExecutorName: Boolean(executorName),
    };
  });

  return (
    <SummaryA2UISection
      a2uiContent={cardState().a2ui}
      sectionId={props.section.id}
      shellClassName="rounded-lg border border-white/15 bg-white/5 p-3 space-y-2"
      badgeLabel="Reflection"
      badgeClass="rounded-full bg-white/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface"
      title={cardState().title}
      bodyText={cardState().reason}
      leftMetaText={cardState().executorName}
      showLeftMeta={cardState().showExecutorName}
      rightMetaText={cardState().sourceLabel}
      showRightMeta={true}
    >
        <p class="text-[11px] font-mono uppercase tracking-[0.14em] text-on-surface-variant/65">
          Decision: {cardState().decisionText}
        </p>
    </SummaryA2UISection>
  );
}

type PlanningGuardrailState = {
  a2ui: Record<string, unknown> | undefined;
  toneClass: string;
  modeLabel: string;
  sourceLabel: string;
  title: string;
  text: string;
  capabilityName: string;
  showCapabilityName: boolean;
};

function PlanningGuardrailSection(props: { section: CardSection }) {
  const cardState = createMemo<PlanningGuardrailState>(() => {
    const content = props.section.content;
    const mode = scalarString(content.mode, "biased_faster");
    const capabilityName = scalarString(content.capability_name);
    const source = scalarString(content.source, "reflection_history");
    return {
      a2ui: optionalRecord(content.a2ui),
      toneClass: mode === "blocked" ? "border-red-400/25 bg-red-400/10" : "border-primary/25 bg-primary/10",
      modeLabel: mode === "blocked" ? "Blocked" : "Adjusted",
      sourceLabel: source === "reflection_history"
        ? "From recent failures"
        : source,
      title: scalarString(content.title),
      text: scalarString(content.text),
      capabilityName: normalizedExecutorName(capabilityName),
      showCapabilityName: Boolean(capabilityName),
    };
  });

  return (
    <SummaryA2UISection
      a2uiContent={cardState().a2ui}
      sectionId={props.section.id}
      shellClassName={`rounded-lg border p-3 space-y-2 ${cardState().toneClass}`}
      badgeLabel="Planner Guardrail"
      badgeClass="rounded-full bg-white/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface"
      title={cardState().title}
      bodyText={cardState().text}
      leftMetaText={cardState().capabilityName}
      showLeftMeta={cardState().showCapabilityName}
      rightMetaText={cardState().sourceLabel}
      showRightMeta={true}
    >
        <p class="text-[11px] font-mono uppercase tracking-[0.14em] text-on-surface-variant/65">
          Mode: {cardState().modeLabel}
        </p>
    </SummaryA2UISection>
  );
}

type ReplanSummaryState = {
  a2ui: Record<string, unknown> | undefined;
  sourceLabel: string;
  title: string;
  text: string;
  nextPlan: string;
  showNextPlan: boolean;
  executorName: string;
  showExecutorName: boolean;
};

function ReplanSummarySection(props: { section: CardSection }) {
  const cardState = createMemo<ReplanSummaryState>(() => {
    const content = props.section.content;
    const nextPlan = scalarString(content.next_plan);
    const executorName = scalarString(content.executor_name);
    return {
      a2ui: optionalRecord(content.a2ui),
      sourceLabel: heuristicPlannerSourceLabel(content.source),
      title: scalarString(content.title),
      text: scalarString(content.text),
      nextPlan,
      showNextPlan: Boolean(nextPlan),
      executorName: normalizedExecutorName(executorName),
      showExecutorName: Boolean(executorName),
    };
  });

  return (
    <SummaryA2UISection
      a2uiContent={cardState().a2ui}
      sectionId={props.section.id}
      shellClassName="rounded-lg border border-indigo-400/25 bg-indigo-400/10 p-3 space-y-2"
      badgeLabel="Replan"
      badgeClass="rounded-full bg-white/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface"
      title={cardState().title}
      bodyText={cardState().text}
      leftMetaText={cardState().executorName}
      showLeftMeta={cardState().showExecutorName}
      rightMetaText={cardState().sourceLabel}
      showRightMeta={true}
    >
        <Show when={cardState().showNextPlan}>
          <SummaryDetailCard label="Next plan" value={cardState().nextPlan} />
        </Show>
    </SummaryA2UISection>
  );
}

function EmbeddedA2UI(props: { content: Record<string, unknown>; sectionId: string }) {
  const message: AfpMessage = {
    id: `embedded-a2ui-${props.sectionId}`,
    thread_id: "embedded",
    from: "agent",
    timestamp: new Date(0).toISOString(),
    type: "a2ui_embedded",
    content: {},
    views: [{ format: "a2ui.v1", content: props.content, priority: 100 }],
    attachments: [],
  };

  return <A2UIRenderer message={message} view={message.views[0]} />;
}

function SectionWithA2UIFallback(props: {
  a2uiContent: Record<string, unknown> | undefined;
  sectionId: string;
  children: JSX.Element;
}) {
  return (
    <Show
      when={!props.a2uiContent}
      fallback={<EmbeddedA2UI content={props.a2uiContent!} sectionId={props.sectionId} />}
    >
      {props.children}
    </Show>
  );
}

function SummarySectionHeader(props: {
  badgeLabel: string;
  badgeClass: string;
  leftMetaText?: string;
  showLeftMeta?: boolean;
  rightMetaText?: string;
  showRightMeta?: boolean;
}) {
  return (
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span class={props.badgeClass}>{props.badgeLabel}</span>
        <Show when={props.showLeftMeta}>
          <span class="font-mono text-[10px] text-on-surface-variant/70">
            {props.leftMetaText}
          </span>
        </Show>
      </div>
      <Show when={props.showRightMeta}>
        <span class="text-[10px] font-mono text-on-surface-variant/70">
          {props.rightMetaText}
        </span>
      </Show>
    </div>
  );
}

function SummarySectionTitle(props: {
  title: string;
  className?: string;
}) {
  return (
    <Show when={props.title}>
      <h3 class={props.className ?? "text-sm font-semibold text-on-surface"}>{props.title}</h3>
    </Show>
  );
}

function SummaryDetailCard(props: {
  label: string;
  value: string;
  detailText?: string;
  showDetailText?: boolean;
  className?: string;
}) {
  return (
    <div class={props.className ?? "rounded-lg border border-white/10 bg-white/5 px-3 py-2"}>
      <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
        {props.label}
      </p>
      <p class="mt-1 text-sm text-on-surface whitespace-pre-wrap">{props.value}</p>
      <Show when={props.showDetailText}>
        <p class="mt-0.5 text-xs text-on-surface-variant/70">{props.detailText}</p>
      </Show>
    </div>
  );
}

function SummaryMetricsGrid(props: {
  children: JSX.Element;
}) {
  return <div class="grid gap-2 sm:grid-cols-3">{props.children}</div>;
}

function SummarySectionShell(props: {
  className: string;
  children: JSX.Element;
}) {
  return <div class={props.className}>{props.children}</div>;
}

function SummaryBodyText(props: {
  text: string;
  className?: string;
}) {
  return <p class={props.className ?? "text-sm text-on-surface/90"}>{props.text}</p>;
}

function SummaryA2UISection(props: {
  a2uiContent: Record<string, unknown> | undefined;
  sectionId: string;
  shellClassName: string;
  badgeLabel: string;
  badgeClass: string;
  title: string;
  bodyText: string;
  bodyClassName?: string;
  leftMetaText?: string;
  showLeftMeta?: boolean;
  rightMetaText?: string;
  showRightMeta?: boolean;
  children?: JSX.Element;
}) {
  return (
    <SectionWithA2UIFallback a2uiContent={props.a2uiContent} sectionId={props.sectionId}>
      <SummarySectionShell className={props.shellClassName}>
        <SummarySectionHeader
          badgeLabel={props.badgeLabel}
          badgeClass={props.badgeClass}
          leftMetaText={props.leftMetaText}
          showLeftMeta={props.showLeftMeta}
          rightMetaText={props.rightMetaText}
          showRightMeta={props.showRightMeta}
        />
        <SummarySectionTitle title={props.title} />
        <SummaryBodyText text={props.bodyText} className={props.bodyClassName} />
        {props.children}
      </SummarySectionShell>
    </SectionWithA2UIFallback>
  );
}

function SummarySpendCard(props: {
  label: string;
  value: string;
  detailText?: string;
  showDetailText?: boolean;
  supplementalText?: string;
  showSupplementalText?: boolean;
}) {
  return (
    <div class="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
        {props.label}
      </p>
      <p class="mt-1 text-sm text-on-surface">{props.value}</p>
      <Show when={props.showDetailText}>
        <p class="mt-0.5 text-xs text-on-surface-variant/70">{props.detailText}</p>
      </Show>
      <Show when={props.showSupplementalText}>
        <p class="text-xs text-on-surface-variant/60">{props.supplementalText}</p>
      </Show>
    </div>
  );
}

function SummaryOutcomePanel(props: {
  className: string;
  label: string;
  value: string;
  primaryDetailText?: string;
  showPrimaryDetailText?: boolean;
  secondaryDetailText?: string;
  showSecondaryDetailText?: boolean;
  tertiaryDetailText?: string;
  showTertiaryDetailText?: boolean;
}) {
  return (
    <div class={props.className}>
      <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
        {props.label}
      </p>
      <p class="text-sm text-on-surface">{props.value}</p>
      <Show when={props.showPrimaryDetailText}>
        <p class="text-xs text-on-surface-variant/80">{props.primaryDetailText}</p>
      </Show>
      <Show when={props.showSecondaryDetailText}>
        <p class="text-xs text-on-surface-variant/75">{props.secondaryDetailText}</p>
      </Show>
      <Show when={props.showTertiaryDetailText}>
        <p class="text-sm leading-6 whitespace-pre-wrap text-on-surface/90">{props.tertiaryDetailText}</p>
      </Show>
    </div>
  );
}

function ContentCard(props: {
  className?: string;
  children: JSX.Element;
}) {
  return (
    <div class={props.className ?? "rounded-lg border border-white/15 bg-white/5 p-3"}>
      {props.children}
    </div>
  );
}

function ContentA2UISection(props: {
  a2uiContent: Record<string, unknown> | undefined;
  sectionId: string;
  children: JSX.Element;
}) {
  return (
    <SectionWithA2UIFallback a2uiContent={props.a2uiContent} sectionId={props.sectionId}>
      {props.children}
    </SectionWithA2UIFallback>
  );
}

function ContentSectionText(props: {
  title?: string;
  showTitle?: boolean;
  text: string;
  textClassName?: string;
}) {
  return (
    <div class="space-y-1">
      <Show when={props.showTitle}>
        <h3 class="text-sm font-semibold text-on-surface">{props.title}</h3>
      </Show>
      <p class={props.textClassName ?? "text-sm text-on-surface/90 whitespace-pre-wrap"}>
        {props.text}
      </p>
    </div>
  );
}

function ContentMessageCard(props: {
  shellClassName: string;
  text: string;
  textClassName: string;
}) {
  return (
    <ContentCard className={props.shellClassName}>
      <p class={props.textClassName}>{props.text}</p>
    </ContentCard>
  );
}

function ContentSectionSummary(props: {
  text?: string | null;
  showText?: boolean;
}) {
  return (
    <Show when={props.showText}>
      <p class="text-sm text-on-surface">{props.text}</p>
    </Show>
  );
}

function ContentLinkCard(props: {
  href: string | undefined;
  title: string;
  className?: string;
  children?: JSX.Element;
}) {
  return (
    <ContentCard className={props.className ?? "rounded-lg border border-white/15 bg-white/5 p-3 text-xs space-y-1"}>
      <a
        href={props.href}
        target="_blank"
        rel="noopener noreferrer"
        class="block break-words font-medium text-primary hover:underline"
      >
        {props.title}
      </a>
      {props.children}
    </ContentCard>
  );
}

function DataTableShell(props: {
  headers: string[];
  rowItems: TableRowViewItem[];
}) {
  return (
    <div class="overflow-x-auto rounded-lg border border-white/15">
      <table class="w-full text-xs">
        <thead>
          <tr class="border-b border-white/15 bg-white/5">
            <For each={props.headers}>
              {(header) => <th class="px-3 py-2 text-left font-semibold text-on-surface-variant">{header}</th>}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={props.rowItems}>
            {(row) => (
              <tr class={`border-b border-white/10 ${row.rowClass}`}>
                <For each={row.cells}>
                  {(cell) => <td class="px-3 py-2 text-on-surface">{cell.value}</td>}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

type SearchResultViewItem = {
  title: string;
  href: string | undefined;
  snippet: string;
};

function normalizeSearchResultItems(results: unknown): SearchResultViewItem[] {
  return recordItems(results).slice(0, 5).map((result) => ({
    title: scalarString(result.title),
    href: safeHref(result.url),
    snippet: scalarString(result.snippet),
  }));
}

type SearchResultsState = {
  summary: string | null;
  showSummary: boolean;
  resultItems: SearchResultViewItem[];
  showResultItems: boolean;
  emptyText: string;
};

function SearchResultsSection(props: { section: CardSection }) {
  const sectionState = createMemo<SearchResultsState>(() => {
    const content = props.section.content;
    const summary = nullableString(content.summary);
    const resultItems = normalizeSearchResultItems(content.results);
    return {
      summary,
      showSummary: Boolean(summary),
      resultItems,
      showResultItems: resultItems.length > 0,
      emptyText: "No search results available.",
    };
  });

  return (
    <CollectionSectionFrame
      summary={sectionState().summary}
      showSummary={sectionState().showSummary}
      showItems={sectionState().showResultItems}
      emptyText={sectionState().emptyText}
    >
      <div class="space-y-2">
        <For each={sectionState().resultItems}>
          {(result) => (
            <ContentLinkCard
              href={result.href}
              title={result.title}
              className="rounded-lg border border-white/10 bg-white/5 p-2.5 text-xs"
            >
              <p class="mt-0.5 break-words text-on-surface-variant">{result.snippet}</p>
            </ContentLinkCard>
          )}
        </For>
      </div>
    </CollectionSectionFrame>
  );
}

type CodeSectionState = {
  code: string;
  headerLabel: string;
  copyButtonText: string;
  copyButtonClass: string;
};

function CodeSection(props: { section: CardSection }) {
  const [copied, setCopied] = createSignal(false);
  const sectionState = createMemo<CodeSectionState>(() => {
    const content = props.section.content;
    const label = scalarString(content.label);
    const language = scalarString(content.language, "text");
    const copiedNow = copied();
    return {
      code: scalarString(content.code),
      headerLabel: label || language,
      copyButtonText: copiedNow ? "Copied" : "Copy code",
      copyButtonClass: copiedNow
        ? "border-primary/30 bg-primary/10 text-primary opacity-100"
        : "border-white/10 bg-black/15 text-on-surface-variant/60 opacity-0 hover:border-white/20 hover:text-on-surface-variant group-hover:opacity-100 focus:opacity-100",
    };
  });

  function copy() {
    navigator.clipboard.writeText(sectionState().code).then(() => {
      setCopied(true);
      toast.success("Code copied");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast.error("Could not copy code");
    });
  }

  return (
    <ContentCard className="group rounded-lg border border-white/15 bg-black/30 overflow-hidden text-xs p-0">
      <div class="flex items-center justify-between px-3 py-1.5 bg-white/5 border-b border-white/10">
        <span class="font-mono text-on-surface-variant/60">
          {sectionState().headerLabel}
        </span>
        <button
          type="button"
          onClick={copy}
          class={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide transition ${sectionState().copyButtonClass}`}
        >
          {sectionState().copyButtonText}
        </button>
      </div>
      <pre class="p-3 overflow-x-auto text-on-surface/90 font-mono whitespace-pre-wrap break-words">
        <code>{sectionState().code}</code>
      </pre>
    </ContentCard>
  );
}

type CanvasSectionState = ReturnType<typeof textSectionState>;

function CanvasSection(props: { section: CardSection }) {
  const sectionState = createMemo<CanvasSectionState>(() =>
    textSectionState(props.section, { includeTitle: true }),
  );

  return (
    <ContentA2UISection a2uiContent={sectionState().a2ui} sectionId={props.section.id}>
      <ContentSectionText
        title={sectionState().title}
        showTitle={sectionState().showTitle}
        text={sectionState().text}
      />
    </ContentA2UISection>
  );
}

type ComparisonFieldViewItem = {
  key: string;
  value: string;
};

type ComparisonProductViewItem = {
  title: string;
  href: string | undefined;
  fields: ComparisonFieldViewItem[];
};

function normalizeComparisonProductItems(products: unknown): ComparisonProductViewItem[] {
  return recordItems(products).map((product) => ({
    title: scalarString(product.title),
    href: safeHref(product.url),
    fields: Object.entries(optionalRecord(product.data) ?? {}).map(([key, value]) => ({
      key,
      value: displayValue(value),
    })),
  }));
}

type ComparisonSectionState = {
  summary: string;
  showSummary: boolean;
  productItems: ComparisonProductViewItem[];
  showProductItems: boolean;
  gridColumns: string;
  emptyText: string;
};

function ComparisonSection(props: { section: CardSection }) {
  const sectionState = createMemo<ComparisonSectionState>(() => {
    const content = props.section.content;
    const summary = scalarString(content.summary);
    const productItems = normalizeComparisonProductItems(content.products);
    return {
      summary,
      showSummary: Boolean(summary),
      showProductItems: productItems.length > 0,
      gridColumns: `repeat(${Math.max(1, Math.min(productItems.length, 3))}, 1fr)`,
      productItems,
      emptyText: "No comparison data available.",
    };
  });

  return (
    <CollectionSectionFrame
      summary={sectionState().summary}
      showSummary={sectionState().showSummary}
      showItems={sectionState().showProductItems}
      emptyText={sectionState().emptyText}
      className="space-y-3"
    >
      <div class="grid gap-3 md:[grid-template-columns:var(--comparison-grid-columns)]" style={{ "--comparison-grid-columns": sectionState().gridColumns }}>
        <For each={sectionState().productItems}>
          {(product) => (
            <ContentLinkCard href={product.href} title={product.title}>
              <For each={product.fields}>
                {(field) => (
                  <div class="flex min-w-0 flex-col gap-1 sm:flex-row sm:justify-between sm:gap-2">
                    <span class="break-words text-on-surface-variant/60 capitalize">{field.key}:</span>
                    <span class="break-words text-on-surface">{field.value}</span>
                  </div>
                )}
              </For>
            </ContentLinkCard>
          )}
        </For>
      </div>
    </CollectionSectionFrame>
  );
}

type TableCellViewItem = {
  value: string;
};

type TableRowViewItem = {
  cells: TableCellViewItem[];
  rowClass: string;
};

function normalizeTableRowItems(rows: unknown): TableRowViewItem[] {
  return arrayItems(rows).filter(Array.isArray).map((row, index) => ({
    cells: row.map((cell) => ({ value: displayValue(cell) })),
    rowClass: index % 2 === 0 ? "" : "bg-white/5",
  }));
}

type TableSectionState = {
  a2ui: Record<string, unknown> | undefined;
  headers: string[];
  rowItems: TableRowViewItem[];
  showRows: boolean;
  emptyText: string;
};

function TableSection(props: { section: CardSection }) {
  const sectionState = createMemo<TableSectionState>(() => {
    const content = props.section.content;
    const rowItems = normalizeTableRowItems(content.rows);
    return {
      a2ui: optionalRecord(content.a2ui),
      headers: stringItems(content.headers),
      rowItems,
      showRows: rowItems.length > 0,
      emptyText: "No table rows available.",
    };
  });

  return (
    <SectionWithA2UIFallback a2uiContent={sectionState().a2ui} sectionId={props.section.id}>
      <Show when={sectionState().showRows} fallback={<ContentEmptyState text={sectionState().emptyText} />}>
        <DataTableShell headers={sectionState().headers} rowItems={sectionState().rowItems} />
      </Show>
    </SectionWithA2UIFallback>
  );
}

type AttachmentViewItem = {
  name: string;
  sizeText: string;
  showSize: boolean;
  downloadHref: string;
  showDownload: boolean;
};

function normalizeAttachmentItems(files: unknown): AttachmentViewItem[] {
  return recordItems(files).map((file) => {
    const path = scalarString(file.path);
    const sizeBytes = finiteNumber(file.size_bytes);
    return {
      name: scalarString(file.name),
      sizeText: `${(sizeBytes / 1024).toFixed(1)} KB`,
      showSize: sizeBytes > 0,
      downloadHref: `/workspace/download?path=${encodeURIComponent(path)}`,
      showDownload: Boolean(path),
    };
  });
}

type AttachmentsSectionState = {
  fileItems: AttachmentViewItem[];
  showFileItems: boolean;
  emptyText: string;
};

function AttachmentsSection(props: { section: CardSection }) {
  const sectionState = createMemo<AttachmentsSectionState>(() => {
    const fileItems = normalizeAttachmentItems(props.section.content.files);
    return {
      fileItems,
      showFileItems: fileItems.length > 0,
      emptyText: "No attachments available.",
    };
  });

  return (
    <CollectionSectionFrame
      showItems={sectionState().showFileItems}
      emptyText={sectionState().emptyText}
    >
      <For each={sectionState().fileItems}>
        {(file) => (
          <ContentCard className="flex min-w-0 flex-col gap-3 rounded-lg border border-white/15 bg-white/5 p-2.5 text-xs sm:flex-row sm:items-center">
            <span class="text-2xl">[]</span>
            <div class="flex-1 min-w-0">
              <p class="break-words font-medium text-on-surface">{file.name}</p>
              <Show when={file.showSize}>
                <p class="text-on-surface-variant/60">{file.sizeText}</p>
              </Show>
            </div>
            <Show when={file.showDownload}>
              <a href={file.downloadHref}
                class="w-full rounded bg-primary/20 px-2 py-2 text-center font-mono text-primary transition hover:bg-primary/30 sm:w-auto sm:py-1">
                Download
              </a>
            </Show>
          </ContentCard>
        )}
      </For>
    </CollectionSectionFrame>
  );
}

type FinalAnswerSectionState = ReturnType<typeof textSectionState>;

function FinalAnswerSection(props: { section: CardSection }) {
  const sectionState = createMemo<FinalAnswerSectionState>(() => textSectionState(props.section));
  return (
    <ContentA2UISection a2uiContent={sectionState().a2ui} sectionId={props.section.id}>
      <ContentMessageCard
        shellClassName="rounded-lg border border-primary/20 bg-primary/5 p-3"
        text={sectionState().text}
        textClassName="text-sm font-medium text-on-surface whitespace-pre-wrap"
      />
    </ContentA2UISection>
  );
}

type ErrorSectionState = ReturnType<typeof textSectionState>;

function ErrorSection(props: { section: CardSection }) {
  const sectionState = createMemo<ErrorSectionState>(() => textSectionState(props.section));
  return (
    <ContentA2UISection a2uiContent={sectionState().a2ui} sectionId={props.section.id}>
      <ContentMessageCard
        shellClassName="rounded-lg border border-red-500/30 bg-red-500/10 p-3"
        text={sectionState().text}
        textClassName="text-sm text-red-400"
      />
    </ContentA2UISection>
  );
}
