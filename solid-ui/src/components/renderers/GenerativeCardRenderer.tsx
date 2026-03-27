import { createSignal, createMemo, For, Show } from "solid-js";
import type { AfpMessage } from "@/lib/api";
import { submitDecision } from "@/lib/api";
import { A2UIRenderer } from "@/components/renderers/A2UIRenderer";

/**
 * GenerativeCardRenderer — renders one streaming generative card per agent query.
 *
 * Architecture:
 *  - One `generative_card` AFP message creates the card.
 *  - Subsequent `card_section_update` messages are merged into the card by section.id.
 *  - Sections are sorted by their `order` field and rendered by type.
 *  - User decisions are submitted via POST /ui/decision.
 */

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── Main component ─────────────────────────────────────────────────────────

export function GenerativeCardRenderer(props: {
  message: AfpMessage;
  updates: AfpMessage[];
  onDecision?: (cardId: string, dpId: string, optionId: string) => void;
}) {
  const cardContent = () => props.message.content as Record<string, unknown>;

  const cardState = createMemo<CardState>(() => {
    const c = cardContent();
    // Merge cost/token tracking from latest update
    const lastUpdate = props.updates[props.updates.length - 1];
    const lu = lastUpdate?.content as Record<string, unknown> | undefined;
    return {
      cardId:           String(c.card_id ?? ""),
      query:            String(c.query ?? ""),
      status:           String(c.status ?? "streaming") as CardState["status"],
      optimizationMode: String(c.optimization_mode ?? "balanced"),
      provider:         String(c.provider ?? ""),
      model:            String(c.model ?? ""),
      costSoFarCents:   Number(lu?.cost_so_far_cents ?? c.cost_so_far_cents ?? 0),
      tokensUsed:       Number(lu?.tokens_used ?? c.tokens_used ?? 0),
    };
  });

  // Accumulate sections from card init + all updates
  const sections = createMemo<CardSection[]>(() => {
    const sectionMap = new Map<string, CardSection>();

    // Seed from card init message
    const initSections = (cardContent().sections as CardSection[] | undefined) ?? [];
    for (const s of initSections) {
      sectionMap.set(s.id, s);
    }

    // Merge updates
    for (const upd of props.updates) {
      const uc = upd.content as Record<string, unknown>;
      if (uc.section) {
        const sec = uc.section as CardSection;
        sectionMap.set(sec.id, sec);
      }
    }

    return [...sectionMap.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  });

  const isStreaming = () => cardState().status === "streaming" ||
    sections().some(s => s.status === "streaming");

  async function handleDecision(dpId: string, optionId: string) {
    const cs = cardState();
    // Find thread_id from the originating message
    const threadId = props.message.thread_id;
    try {
      await submitDecision({
        card_id: cs.cardId,
        decision_point_id: dpId,
        selected_option_id: optionId,
        thread_id: threadId,
      });
      props.onDecision?.(cs.cardId, dpId, optionId);
    } catch (err) {
      console.error("Failed to submit decision:", err);
    }
  }

  return (
    <article class="glass-surface rounded-xl border border-white/35 p-5 shadow-panel space-y-4">
      {/* Card header */}
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="rounded-full bg-primary/20 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-primary">
              Agent
            </span>
            <Show when={cardState().optimizationMode !== "balanced"}>
              <span class="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface-variant">
                {cardState().optimizationMode}
              </span>
            </Show>
            <Show when={isStreaming()}>
              <span class="flex items-center gap-1 text-[10px] text-on-surface-variant">
                <span class="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                thinking…
              </span>
            </Show>
          </div>
          <p class="text-sm font-medium text-on-surface break-words">{cardState().query}</p>
        </div>
      </div>

      {/* Sections */}
      <div class="space-y-3">
        <For each={sections()}>
          {(section) => <SectionRenderer section={section} onDecision={handleDecision} />}
        </For>
      </div>

      {/* Footer: cost + token tracking */}
      <Show when={cardState().tokensUsed > 0 || cardState().costSoFarCents > 0}>
        <div class="flex items-center gap-3 pt-2 border-t border-white/10 text-[10px] text-on-surface-variant/60 font-mono">
          <Show when={cardState().tokensUsed > 0}>
            <span>{cardState().tokensUsed.toLocaleString()} tokens</span>
          </Show>
          <Show when={cardState().costSoFarCents > 0}>
            <span>${(cardState().costSoFarCents / 100).toFixed(4)}</span>
          </Show>
          <Show when={cardState().model}>
            <span class="opacity-60">{cardState().model}</span>
          </Show>
        </div>
      </Show>
    </article>
  );
}

// ── Section dispatcher ─────────────────────────────────────────────────────

function SectionRenderer(props: {
  section: CardSection;
  onDecision: (dpId: string, optionId: string) => void;
}) {
  const s = props.section;
  switch (s.type) {
    case "thinking":       return <ThinkingSection section={s} />;
    case "cost_estimate":  return <CostEstimateSection section={s} />;
    case "decision_point": return <DecisionPointSection section={s} onDecision={props.onDecision} />;
    case "progress":       return <ProgressSection section={s} />;
    case "callout":        return <CalloutSection section={s} />;
    case "strategy_summary": return <StrategySummarySection section={s} />;
    case "execution_summary": return <ExecutionSummarySection section={s} />;
    case "execution_failure": return <ExecutionFailureSection section={s} />;
    case "reflection_summary": return <ReflectionSummarySection section={s} />;
    case "planning_guardrail": return <PlanningGuardrailSection section={s} />;
    case "replan_summary": return <ReplanSummarySection section={s} />;
    case "retry_summary": return <RetrySummarySection section={s} />;
    case "search_results": return <SearchResultsSection section={s} />;
    case "code":           return <CodeSection section={s} />;
    case "canvas":         return <CanvasSection section={s} />;
    case "comparison":     return <ComparisonSection section={s} />;
    case "table":          return <TableSection section={s} />;
    case "attachments":    return <AttachmentsSection section={s} />;
    case "final_answer":   return <FinalAnswerSection section={s} />;
    case "error":          return <ErrorSection section={s} />;
    default:               return null;
  }
}

// ── Section renderers ──────────────────────────────────────────────────────

function ThinkingSection(props: { section: CardSection }) {
  const [expanded, setExpanded] = createSignal(false);
  const text = () => String(props.section.content.text ?? "");
  const isComplete = () => props.section.status === "complete";

  return (
    <div class="text-xs">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        class="flex items-center gap-1 text-on-surface-variant/60 hover:text-on-surface-variant transition"
      >
        <span class="text-[10px]">{expanded() ? "▾" : "▸"}</span>
        <span class="font-mono">Thinking{isComplete() ? "" : "…"}</span>
      </button>
      <Show when={expanded()}>
        <p class="mt-1 pl-3 italic text-on-surface-variant/70 border-l border-white/10 whitespace-pre-wrap">
          {text()}
        </p>
      </Show>
    </div>
  );
}

function CostEstimateSection(props: { section: CardSection }) {
  const c = () => props.section.content;
  const strategies = () => (c().strategies as any[]) ?? [];
  const selected = () => c().selected as any;
  const provider = () => String(c().provider ?? "");
  const model = () => String(c().model ?? "");
  const mode = () => String(c().optimization_mode ?? "balanced");
  const budget = () => Number(c().budget_remaining_cents ?? 0);
  const selectedExecutor = () => String(c().selected_strategy_executor ?? "");
  const selectedLabel = () => String(c().selected_strategy_label ?? selected()?.strategy_label ?? "");
  const selectedOutcome = () => String(c().selected_strategy_outcome ?? "");
  const selectedSummary = () => String(c().selected_strategy_summary ?? "");
  const selectionMode = () => String(c().strategy_selection_mode ?? "single_path");
  const userMsg = () => String(c().user_message ?? "");

  function costLabel(est: any): string {
    if (est?.dollar_cost_cents > 0) return `$${(est.dollar_cost_cents / 100).toFixed(4)}`;
    if (provider() === "ollama") return "free (local)";
    return "$0";
  }

  function selectionModeLabel(modeValue: string): string {
    switch (modeValue) {
      case "user_selected":
        return "Chosen by you";
      case "auto_selected":
        return "Auto-selected";
      default:
        return "Default path";
    }
  }

  return (
    <div class="rounded-lg border border-white/15 bg-white/5 p-3 text-xs space-y-2">
      <div class="flex items-center gap-2">
        <span class="font-semibold text-on-surface">Cost Estimate</span>
        <span class="font-mono text-on-surface-variant/60">{provider()} · {model()}</span>
      </div>
      <Show when={selectedLabel()}>
        <div class="rounded-lg border border-primary/25 bg-primary/8 px-3 py-2 space-y-1">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[10px] font-mono uppercase tracking-[0.18em] text-primary/90">
              Selected Path
            </span>
            <span class="text-[10px] font-mono text-on-surface-variant/70">
              {selectionModeLabel(selectionMode())}
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-white/60 px-2 py-0.5 font-medium text-on-surface">
              {selectedLabel()}
            </span>
            <Show when={selectedExecutor()}>
              <span class="text-on-surface-variant/70">for {selectedExecutor()}</span>
            </Show>
          </div>
          <Show when={selectedOutcome()}>
            <p class="text-on-surface-variant/80">{selectedOutcome()}</p>
          </Show>
          <Show when={selectedSummary() && selectedSummary() !== selectedOutcome()}>
            <p class="text-on-surface-variant/65">{selectedSummary()}</p>
          </Show>
        </div>
      </Show>
      <For each={strategies()}>
        {(est) => {
          const isSelected = () => est.strategy_label === selected()?.strategy_label;
          return (
            <div class={`flex items-center gap-2 rounded px-2 py-1 ${isSelected() ? "bg-primary/10 border border-primary/30" : ""}`}>
              <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style={`background:${isSelected() ? "var(--color-primary)" : "transparent"}; border: 1px solid currentColor`} />
              <span class="font-mono flex-1">{est.strategy_label}</span>
              <span class="text-on-surface-variant">{costLabel(est)}</span>
              <span class="text-on-surface-variant">~{est.time_seconds?.toFixed(0)}s</span>
              <Show when={est.token_cost > 0}>
                <span class="text-on-surface-variant/50">{est.token_cost?.toLocaleString()} tok</span>
              </Show>
            </div>
          );
        }}
      </For>
      <Show when={budget() > 0}>
        <p class="text-on-surface-variant/50 font-mono">Budget: ${(budget() / 100).toFixed(2)} remaining</p>
      </Show>
      <Show when={userMsg()}>
        <p class="text-on-surface-variant/70">{userMsg()}</p>
      </Show>
    </div>
  );
}

function DecisionPointSection(props: {
  section: CardSection;
  onDecision: (dpId: string, optionId: string) => void;
}) {
  const [selected, setSelected] = createSignal<string>("");
  const [submitted, setSubmitted] = createSignal(false);
  const c = () => props.section.content;
  const dpId = () => String(c().id ?? props.section.id);
  const question = () => String(c().question ?? "");
  const options = () => (c().options as any[]) ?? [];
  const category = () => String(c().category ?? "clarification");

  const categoryColor: Record<string, string> = {
    clarification: "text-blue-400",
    strategy:      "text-yellow-400",
    confirmation:  "text-red-400",
  };

  function handleSubmit() {
    const opt = selected() || String((options().find((o: any) => o.is_default) ?? options()[0])?.id ?? "");
    if (!opt) return;
    setSubmitted(true);
    props.onDecision(dpId(), opt);
  }

  return (
    <div class="rounded-lg border border-white/20 bg-white/5 p-3 space-y-3">
      <div class="flex items-center gap-2">
        <span class={`text-[10px] font-mono uppercase tracking-wide ${categoryColor[category()] ?? "text-on-surface-variant"}`}>
          {category()}
        </span>
        <p class="text-sm font-medium text-on-surface">{question()}</p>
      </div>

      <Show when={String(c().context ?? "")}>
        <p class="text-xs text-on-surface-variant/70">{String(c().context)}</p>
      </Show>

      <div class="space-y-2">
        <For each={options()}>
          {(opt: any) => {
            const isChosen = () => selected() === opt.id ||
              (!selected() && opt.is_default);
            return (
              <label class={`flex items-start gap-3 cursor-pointer rounded-lg p-2 transition ${isChosen() ? "bg-primary/10 border border-primary/30" : "border border-transparent hover:bg-white/5"}`}>
                <input
                  type="radio"
                  name={dpId()}
                  value={opt.id}
                  checked={isChosen()}
                  onChange={() => setSelected(opt.id)}
                  class="mt-0.5 accent-primary"
                  disabled={submitted()}
                />
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-on-surface">{opt.label}</p>
                  <Show when={opt.description}>
                    <p class="text-xs text-on-surface-variant/60 mt-0.5">{opt.description}</p>
                  </Show>
                  <Show when={opt.pros?.length || opt.cons?.length}>
                    <div class="mt-1 flex gap-4 text-[11px]">
                      <Show when={opt.pros?.length}>
                        <ul class="space-y-0.5">
                          <For each={opt.pros}>{(p: string) =>
                            <li class="text-green-400">+ {p}</li>
                          }</For>
                        </ul>
                      </Show>
                      <Show when={opt.cons?.length}>
                        <ul class="space-y-0.5">
                          <For each={opt.cons}>{(c: string) =>
                            <li class="text-red-400">− {c}</li>
                          }</For>
                        </ul>
                      </Show>
                    </div>
                  </Show>
                </div>
              </label>
            );
          }}
        </For>
      </div>

      <Show when={!submitted()}>
        <button
          type="button"
          onClick={handleSubmit}
          class="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white transition hover:bg-primary/80"
        >
          Confirm
        </button>
      </Show>
      <Show when={submitted()}>
        <p class="text-xs text-green-400">✓ Decision recorded</p>
      </Show>
    </div>
  );
}

function ProgressSection(props: { section: CardSection }) {
  const c = () => props.section.content;
  const a2ui = () => c().a2ui as Record<string, unknown> | undefined;
  const text = () => String(c().text ?? "");
  const pct = () => Number(c().pct ?? 0);
  const isComplete = () => props.section.status === "complete";

  return (
    <Show
      when={!a2ui()}
      fallback={<EmbeddedA2UI content={a2ui()!} sectionId={props.section.id} />}
    >
      <Show when={!isComplete() || pct() < 100}>
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[11px] text-on-surface-variant">
            <span>{text()}</span>
            <span class="font-mono">{pct()}%</span>
          </div>
          <div class="h-1 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              class="h-full rounded-full bg-primary transition-all duration-500"
              style={`width: ${pct()}%`}
            />
          </div>
        </div>
      </Show>
    </Show>
  );
}

function CalloutSection(props: { section: CardSection }) {
  const c = () => props.section.content;
  const title = () => String(c().title ?? "");
  const text = () => String(c().text ?? "");
  const tone = () => String(c().tone ?? "info");

  const toneClasses: Record<string, string> = {
    info: "border-primary/30 bg-primary/10 text-on-surface",
    strategy: "border-amber-400/30 bg-amber-400/10 text-on-surface",
    confirmation: "border-green-400/30 bg-green-400/10 text-on-surface",
    warning: "border-red-400/30 bg-red-400/10 text-on-surface",
  };

  return (
    <div class={`rounded-lg border p-3 space-y-1 ${toneClasses[tone()] ?? toneClasses.info}`}>
      <Show when={title()}>
        <h3 class="text-sm font-semibold">{title()}</h3>
      </Show>
      <p class="text-sm whitespace-pre-wrap text-on-surface/90">{text()}</p>
    </div>
  );
}

function StrategySummarySection(props: { section: CardSection }) {
  const c = () => props.section.content;
  const title = () => String(c().title ?? "");
  const text = () => String(c().text ?? "");
  const executorName = () => String(c().executor_name ?? "");
  const strategyLabel = () => String(c().strategy_label ?? "");

  return (
    <div class="rounded-xl border border-amber-400/25 bg-[linear-gradient(135deg,rgba(201,149,58,0.14),rgba(255,255,255,0.06))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div class="flex items-center gap-2">
        <span class="rounded-full bg-amber-400/15 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-amber-300">
          Strategy
        </span>
        <Show when={executorName()}>
          <span class="font-mono text-[10px] text-on-surface-variant/70">
            {executorName().replaceAll("_", " ")}
          </span>
        </Show>
      </div>
      <Show when={title()}>
        <h3 class="mt-3 text-sm font-semibold text-on-surface">{title()}</h3>
      </Show>
      <p class="mt-2 text-sm leading-6 text-on-surface/90 whitespace-pre-wrap">{text()}</p>
      <Show when={strategyLabel()}>
        <div class="mt-3 rounded-lg border border-white/10 bg-black/10 px-3 py-2">
          <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
            Expected Path
          </p>
          <p class="mt-1 text-sm text-on-surface">{strategyLabel()}</p>
        </div>
      </Show>
    </div>
  );
}

function ExecutionSummarySection(props: { section: CardSection }) {
  const c = () => props.section.content;
  const title = () => String(c().title ?? "");
  const executorName = () => String(c().executor_name ?? "");
  const strategyLabel = () => String(c().strategy_label ?? "");
  const expectedOutcome = () => String(c().expected_outcome ?? "");
  const resultSummary = () => String(c().result_summary ?? "");
  const alignment = () => String(c().alignment ?? "completed_default_path");
  const alignmentReason = () => String(c().alignment_reason ?? "");
  const estimatedTime = () => Number(c().estimated_time_seconds ?? 0);
  const estimatedCost = () => Number(c().estimated_cost_cents ?? 0);
  const estimatedTokens = () => Number(c().estimated_tokens ?? 0);
  const selectionMode = () => String(c().selection_mode ?? "single_path");
  const timeElapsed = () => Number(c().time_elapsed ?? 0);
  const costCents = () => Number(c().cost_cents ?? 0);
  const tokensUsed = () => Number(c().tokens_used ?? 0);

  const alignmentLabel = () => {
    switch (alignment()) {
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
  };
  const selectionLabel = () =>
    selectionMode() === "user_selected"
      ? "Chosen by you"
      : selectionMode() === "auto_selected"
        ? "Auto-selected"
        : "Default path";
  const alignmentTone = () => {
    switch (alignment()) {
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
  };

  return (
    <div class="rounded-xl border border-emerald-400/25 bg-[linear-gradient(135deg,rgba(45,143,99,0.16),rgba(255,255,255,0.06))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] space-y-3">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="rounded-full bg-emerald-400/15 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-300">
            Execution
          </span>
          <Show when={executorName()}>
            <span class="font-mono text-[10px] text-on-surface-variant/70">
              {executorName().replaceAll("_", " ")}
            </span>
          </Show>
        </div>
        <span class="text-[10px] font-mono text-on-surface-variant/70">{selectionLabel()}</span>
      </div>
      <Show when={title()}>
        <h3 class="text-sm font-semibold text-on-surface">{title()}</h3>
      </Show>
      <div class={`rounded-lg px-3 py-2 space-y-1 ${alignmentTone()}`}>
        <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
          Outcome Check
        </p>
        <p class="text-sm text-on-surface">{alignmentLabel()}</p>
        <Show when={alignmentReason()}>
          <p class="text-xs text-on-surface-variant/80">{alignmentReason()}</p>
        </Show>
        <Show when={expectedOutcome()}>
          <p class="text-xs text-on-surface-variant/75">Expected: {expectedOutcome()}</p>
        </Show>
        <Show when={resultSummary()}>
          <p class="text-sm leading-6 text-on-surface/90 whitespace-pre-wrap">Delivered: {resultSummary()}</p>
        </Show>
      </div>
      <div class="grid gap-2 sm:grid-cols-3">
        <Show when={strategyLabel()}>
          <div class="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">Path</p>
            <p class="mt-1 text-sm text-on-surface">{strategyLabel()}</p>
          </div>
        </Show>
        <div class="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">Runtime</p>
          <p class="mt-1 text-sm text-on-surface">~{timeElapsed().toFixed(1)}s</p>
          <Show when={estimatedTime() > 0}>
            <p class="mt-0.5 text-xs text-on-surface-variant/70">Estimated ~{estimatedTime().toFixed(1)}s</p>
          </Show>
        </div>
        <div class="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">Spend</p>
          <p class="mt-1 text-sm text-on-surface">
            {costCents() > 0 ? `$${(costCents() / 100).toFixed(4)}` : "No direct cost"}
          </p>
          <Show when={estimatedCost() > 0}>
            <p class="mt-0.5 text-xs text-on-surface-variant/70">
              Estimated ${ (estimatedCost() / 100).toFixed(4) }
            </p>
          </Show>
          <Show when={tokensUsed() > 0}>
            <p class="mt-0.5 text-xs text-on-surface-variant/70">{tokensUsed().toLocaleString()} tokens</p>
          </Show>
          <Show when={estimatedTokens() > 0}>
            <p class="text-xs text-on-surface-variant/60">Estimated {estimatedTokens().toLocaleString()} tokens</p>
          </Show>
        </div>
      </div>
    </div>
  );
}

function ExecutionFailureSection(props: { section: CardSection }) {
  const c = () => props.section.content;
  const title = () => String(c().title ?? "");
  const executorName = () => String(c().executor_name ?? "");
  const strategyLabel = () => String(c().strategy_label ?? "");
  const expectedOutcome = () => String(c().expected_outcome ?? "");
  const failureKind = () => String(c().failure_kind ?? "executor_error");
  const failureReason = () => String(c().failure_reason ?? "");
  const errorText = () => String(c().error_text ?? "");
  const estimatedTime = () => Number(c().estimated_time_seconds ?? 0);
  const estimatedCost = () => Number(c().estimated_cost_cents ?? 0);
  const estimatedTokens = () => Number(c().estimated_tokens ?? 0);
  const selectionMode = () => String(c().selection_mode ?? "single_path");

  const failureLabel = () => {
    switch (failureKind()) {
      case "timeout":
        return "Timed out";
      case "permission":
        return "Blocked by policy";
      default:
        return "Execution failed";
    }
  };

  const selectionLabel = () =>
    selectionMode() === "user_selected"
      ? "Chosen by you"
      : selectionMode() === "auto_selected"
        ? "Auto-selected"
        : "Default path";

  return (
    <div class="rounded-xl border border-red-400/30 bg-[linear-gradient(135deg,rgba(172,52,69,0.16),rgba(255,255,255,0.06))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] space-y-3">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="rounded-full bg-red-400/15 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-red-300">
            Failure
          </span>
          <Show when={executorName()}>
            <span class="font-mono text-[10px] text-on-surface-variant/70">
              {executorName().replaceAll("_", " ")}
            </span>
          </Show>
        </div>
        <span class="text-[10px] font-mono text-on-surface-variant/70">{selectionLabel()}</span>
      </div>
      <Show when={title()}>
        <h3 class="text-sm font-semibold text-on-surface">{title()}</h3>
      </Show>
      <div class="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 space-y-1">
        <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-red-200/80">
          {failureLabel()}
        </p>
        <Show when={failureReason()}>
          <p class="text-sm text-on-surface/90">{failureReason()}</p>
        </Show>
        <Show when={expectedOutcome()}>
          <p class="text-xs text-on-surface-variant/75">Expected: {expectedOutcome()}</p>
        </Show>
        <Show when={errorText()}>
          <p class="text-sm leading-6 text-red-100/90 whitespace-pre-wrap">Details: {errorText()}</p>
        </Show>
      </div>
      <div class="grid gap-2 sm:grid-cols-3">
        <Show when={strategyLabel()}>
          <div class="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">Path</p>
            <p class="mt-1 text-sm text-on-surface">{strategyLabel()}</p>
          </div>
        </Show>
        <div class="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">Expected runtime</p>
          <p class="mt-1 text-sm text-on-surface">{estimatedTime() > 0 ? `~${estimatedTime().toFixed(1)}s` : "Not estimated"}</p>
        </div>
        <div class="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">Expected spend</p>
          <p class="mt-1 text-sm text-on-surface">
            {estimatedCost() > 0 ? `$${(estimatedCost() / 100).toFixed(4)}` : "No direct cost"}
          </p>
          <Show when={estimatedTokens() > 0}>
            <p class="mt-0.5 text-xs text-on-surface-variant/70">{estimatedTokens().toLocaleString()} est. tokens</p>
          </Show>
        </div>
      </div>
    </div>
  );
}

function RetrySummarySection(props: { section: CardSection }) {
  const c = () => props.section.content;
  const a2ui = () => c().a2ui as Record<string, unknown> | undefined;
  const title = () => String(c().title ?? "");
  const text = () => String(c().text ?? "");
  const mode = () => String(c().mode ?? "same_path");
  const source = () => String(c().source ?? "llm");
  const retryCount = () => Number(c().retry_count ?? 0);
  const maxRetries = () => Number(c().max_retries ?? 0);
  const fromStrategy = () => String(c().from_strategy ?? "");
  const toStrategy = () => String(c().to_strategy ?? "");

  const modeLabel = () =>
    mode() === "downgraded_path" ? "Fallback retry" : "Retry";
  const toneClass = () =>
    mode() === "downgraded_path"
      ? "border-amber-400/25 bg-amber-400/10"
      : "border-sky-400/25 bg-sky-400/10";

  return (
    <Show
      when={!a2ui()}
      fallback={<EmbeddedA2UI content={a2ui()!} sectionId={props.section.id} />}
    >
    <div class={`rounded-xl border p-4 space-y-3 ${toneClass()}`}>
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="rounded-full bg-white/50 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface">
            {modeLabel()}
          </span>
          <span class="font-mono text-[10px] text-on-surface-variant/70">
            Attempt {retryCount()} of {maxRetries()}
          </span>
          <span class="font-mono text-[10px] text-on-surface-variant/70">
            {source() === "heuristic_policy" ? "Policy-driven" : "Planner-driven"}
          </span>
        </div>
      </div>
      <Show when={title()}>
        <h3 class="text-sm font-semibold text-on-surface">{title()}</h3>
      </Show>
      <p class="text-sm text-on-surface/90 whitespace-pre-wrap">{text()}</p>
      <Show when={fromStrategy() || toStrategy()}>
        <div class="grid gap-2 sm:grid-cols-2">
          <div class="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">Previous path</p>
            <p class="mt-1 text-sm text-on-surface">{fromStrategy() || "Unspecified"}</p>
          </div>
          <div class="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">Retry path</p>
            <p class="mt-1 text-sm text-on-surface">{toStrategy() || fromStrategy() || "Unspecified"}</p>
          </div>
        </div>
      </Show>
    </div>
    </Show>
  );
}

function ReflectionSummarySection(props: { section: CardSection }) {
  const c = () => props.section.content;
  const a2ui = () => c().a2ui as Record<string, unknown> | undefined;
  const title = () => String(c().title ?? "");
  const decision = () => String(c().decision ?? "continue");
  const source = () => String(c().source ?? "llm");
  const reason = () => String(c().reason ?? "");
  const executorName = () => String(c().executor_name ?? "");

  return (
    <Show
      when={!a2ui()}
      fallback={<EmbeddedA2UI content={a2ui()!} sectionId={props.section.id} />}
    >
    <div class="rounded-lg border border-white/15 bg-white/5 p-3 space-y-2">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="rounded-full bg-white/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface">
            Reflection
          </span>
          <Show when={executorName()}>
            <span class="font-mono text-[10px] text-on-surface-variant/70">
              {executorName().replaceAll("_", " ")}
            </span>
          </Show>
        </div>
        <span class="text-[10px] font-mono text-on-surface-variant/70">
          {source() === "heuristic_policy" ? "System policy" : "Planner judgment"}
        </span>
      </div>
      <Show when={title()}>
        <h3 class="text-sm font-semibold text-on-surface">{title()}</h3>
      </Show>
      <p class="text-sm text-on-surface/90">{reason()}</p>
      <p class="text-[11px] font-mono uppercase tracking-[0.14em] text-on-surface-variant/65">
        Decision: {decision().replaceAll("_", " ")}
      </p>
    </div>
    </Show>
  );
}

function PlanningGuardrailSection(props: { section: CardSection }) {
  const c = () => props.section.content;
  const a2ui = () => c().a2ui as Record<string, unknown> | undefined;
  const mode = () => String(c().mode ?? "biased_faster");
  const source = () => String(c().source ?? "reflection_history");
  const title = () => String(c().title ?? "");
  const text = () => String(c().text ?? "");
  const capabilityName = () => String(c().capability_name ?? "");

  const modeLabel = () =>
    mode() === "blocked" ? "Blocked" : "Adjusted";
  const toneClass = () =>
    mode() === "blocked"
      ? "border-red-400/25 bg-red-400/10"
      : "border-primary/25 bg-primary/10";

  return (
    <Show
      when={!a2ui()}
      fallback={<EmbeddedA2UI content={a2ui()!} sectionId={props.section.id} />}
    >
    <div class={`rounded-lg border p-3 space-y-2 ${toneClass()}`}>
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="rounded-full bg-white/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface">
            Planner Guardrail
          </span>
          <Show when={capabilityName()}>
            <span class="font-mono text-[10px] text-on-surface-variant/70">
              {capabilityName().replaceAll("_", " ")}
            </span>
          </Show>
        </div>
        <span class="text-[10px] font-mono text-on-surface-variant/70">
          {source() === "reflection_history" ? "From recent failures" : source()}
        </span>
      </div>
      <Show when={title()}>
        <h3 class="text-sm font-semibold text-on-surface">{title()}</h3>
      </Show>
      <p class="text-sm text-on-surface/90">{text()}</p>
      <p class="text-[11px] font-mono uppercase tracking-[0.14em] text-on-surface-variant/65">
        Mode: {modeLabel()}
      </p>
    </div>
    </Show>
  );
}

function ReplanSummarySection(props: { section: CardSection }) {
  const c = () => props.section.content;
  const a2ui = () => c().a2ui as Record<string, unknown> | undefined;
  const source = () => String(c().source ?? "llm");
  const title = () => String(c().title ?? "");
  const text = () => String(c().text ?? "");
  const nextPlan = () => String(c().next_plan ?? "");
  const executorName = () => String(c().executor_name ?? "");

  return (
    <Show
      when={!a2ui()}
      fallback={<EmbeddedA2UI content={a2ui()!} sectionId={props.section.id} />}
    >
    <div class="rounded-lg border border-indigo-400/25 bg-indigo-400/10 p-3 space-y-2">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="rounded-full bg-white/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface">
            Replan
          </span>
          <Show when={executorName()}>
            <span class="font-mono text-[10px] text-on-surface-variant/70">
              {executorName().replaceAll("_", " ")}
            </span>
          </Show>
        </div>
        <span class="text-[10px] font-mono text-on-surface-variant/70">
          {source() === "heuristic_policy" ? "System policy" : "Planner judgment"}
        </span>
      </div>
      <Show when={title()}>
        <h3 class="text-sm font-semibold text-on-surface">{title()}</h3>
      </Show>
      <p class="text-sm text-on-surface/90">{text()}</p>
      <Show when={nextPlan()}>
        <div class="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
            Next plan
          </p>
          <p class="mt-1 text-sm text-on-surface whitespace-pre-wrap">{nextPlan()}</p>
        </div>
      </Show>
    </div>
    </Show>
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

function SearchResultsSection(props: { section: CardSection }) {
  const c = () => props.section.content;
  const results = () => (c().results as any[]) ?? [];
  const summary = () => c().summary as string | null;
  const query = () => String(c().query ?? "");

  return (
    <div class="space-y-2">
      <Show when={summary()}>
        <p class="text-sm text-on-surface">{summary()}</p>
      </Show>
      <div class="space-y-2">
        <For each={results().slice(0, 5)}>
          {(r: any) => (
            <div class="rounded-lg border border-white/10 bg-white/5 p-2.5 text-xs">
              <a href={r.url} target="_blank" rel="noopener noreferrer"
                class="text-primary hover:underline font-medium block truncate">
                {r.title}
              </a>
              <p class="mt-0.5 text-on-surface-variant line-clamp-2">{r.snippet}</p>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

function CodeSection(props: { section: CardSection }) {
  const c = () => props.section.content;
  const code = () => String(c().code ?? "");
  const language = () => String(c().language ?? "text");
  const label = () => String(c().label ?? "");
  const [copied, setCopied] = createSignal(false);

  function copy() {
    navigator.clipboard.writeText(code()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div class="rounded-lg border border-white/15 bg-black/30 overflow-hidden text-xs">
      <div class="flex items-center justify-between px-3 py-1.5 bg-white/5 border-b border-white/10">
        <span class="font-mono text-on-surface-variant/60">
          {label() || language()}
        </span>
        <button type="button" onClick={copy}
          class="text-[10px] font-mono text-on-surface-variant/60 hover:text-on-surface-variant transition">
          {copied() ? "copied!" : "copy"}
        </button>
      </div>
      <pre class="p-3 overflow-x-auto text-on-surface/90 font-mono whitespace-pre-wrap break-words">
        <code>{code()}</code>
      </pre>
    </div>
  );
}

function CanvasSection(props: { section: CardSection }) {
  const c = () => props.section.content;
  const a2ui = () => c().a2ui as Record<string, unknown> | undefined;
  const text = () => String(c().text ?? "");
  const title = () => c().title as string | undefined;

  return (
    <Show
      when={!a2ui()}
      fallback={<EmbeddedA2UI content={a2ui()!} sectionId={props.section.id} />}
    >
      <div class="space-y-1">
        <Show when={title()}>
          <h3 class="text-sm font-semibold text-on-surface">{title()}</h3>
        </Show>
        <p class="text-sm text-on-surface/90 whitespace-pre-wrap">{text()}</p>
      </div>
    </Show>
  );
}

function ComparisonSection(props: { section: CardSection }) {
  const c = () => props.section.content;
  const products = () => (c().products as any[]) ?? [];
  const summary = () => c().summary as string | undefined;

  return (
    <div class="space-y-3">
      <Show when={summary()}>
        <p class="text-sm text-on-surface">{summary()}</p>
      </Show>
      <div class="grid gap-3" style={`grid-template-columns: repeat(${Math.min(products().length, 3)}, 1fr)`}>
        <For each={products()}>
          {(p: any) => (
            <div class="rounded-lg border border-white/15 bg-white/5 p-3 text-xs space-y-1">
              <a href={p.url} target="_blank" rel="noopener noreferrer"
                class="text-primary hover:underline font-medium block truncate">
                {p.title}
              </a>
              <For each={Object.entries(p.data ?? {})}>
                {([k, v]) => (
                  <div class="flex justify-between gap-2">
                    <span class="text-on-surface-variant/60 capitalize">{k}:</span>
                    <span class="text-on-surface truncate">{String(v)}</span>
                  </div>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

function TableSection(props: { section: CardSection }) {
  const c = () => props.section.content;
  const a2ui = () => c().a2ui as Record<string, unknown> | undefined;
  const headers = () => (c().headers as string[]) ?? [];
  const rows = () => (c().rows as any[][]) ?? [];

  return (
    <Show
      when={!a2ui()}
      fallback={<EmbeddedA2UI content={a2ui()!} sectionId={props.section.id} />}
    >
      <div class="overflow-x-auto rounded-lg border border-white/15">
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-white/15 bg-white/5">
              <For each={headers()}>
                {(h) => <th class="px-3 py-2 text-left font-semibold text-on-surface-variant">{h}</th>}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={rows()}>
              {(row, i) => (
                <tr class={`border-b border-white/10 ${i() % 2 === 0 ? "" : "bg-white/5"}`}>
                  <For each={row}>
                    {(cell) => <td class="px-3 py-2 text-on-surface">{String(cell ?? "")}</td>}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  );
}

function AttachmentsSection(props: { section: CardSection }) {
  const files = () => (props.section.content.files as any[]) ?? [];

  return (
    <div class="space-y-2">
      <For each={files()}>
        {(f: any) => (
          <div class="flex items-center gap-3 rounded-lg border border-white/15 bg-white/5 p-2.5 text-xs">
            <span class="text-2xl">📄</span>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-on-surface truncate">{f.name}</p>
              <Show when={f.size_bytes}>
                <p class="text-on-surface-variant/60">{(f.size_bytes / 1024).toFixed(1)} KB</p>
              </Show>
            </div>
            <Show when={f.path}>
              <a href={`/workspace/download?path=${encodeURIComponent(f.path)}`}
                class="rounded px-2 py-1 bg-primary/20 text-primary hover:bg-primary/30 transition font-mono">
                Download
              </a>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}

function FinalAnswerSection(props: { section: CardSection }) {
  const c = () => props.section.content;
  const a2ui = () => c().a2ui as Record<string, unknown> | undefined;
  const text = () => String(c().text ?? "");
  return (
    <Show
      when={!a2ui()}
      fallback={<EmbeddedA2UI content={a2ui()!} sectionId={props.section.id} />}
    >
      <div class="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <p class="text-sm font-medium text-on-surface whitespace-pre-wrap">{text()}</p>
      </div>
    </Show>
  );
}

function ErrorSection(props: { section: CardSection }) {
  const c = () => props.section.content;
  const a2ui = () => c().a2ui as Record<string, unknown> | undefined;
  const text = () => String(c().text ?? "");
  return (
    <Show
      when={!a2ui()}
      fallback={<EmbeddedA2UI content={a2ui()!} sectionId={props.section.id} />}
    >
      <div class="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
        <p class="text-sm text-red-400">{text()}</p>
      </div>
    </Show>
  );
}
