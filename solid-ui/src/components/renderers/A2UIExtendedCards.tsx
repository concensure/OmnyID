// @locs-version: 1.0
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  dispatchA2uiCopyFallbackEvent,
  dispatchA2uiShareEvent,
  dispatchSocialComposeActionEvent,
  dispatchSpaceFeedComposeEvent,
} from "@/lib/a2uiEvents";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function normalizeMetricEntries(props: Record<string, unknown>): Array<{ label: string; value: string }> {
  const explicit = asRecordArray(props.metrics).map((entry) => ({
    label: asString(entry.label),
    value: asString(entry.value),
  })).filter((entry) => entry.label && entry.value);
  if (explicit.length > 0) return explicit;

  const fallback: Array<{ label: string; value: string }> = [];
  const pairs: Array<[string, unknown, string?]> = [
    ["Duration", props.duration ?? props.eta],
    ["Cost", props.cost ?? props.fare_estimate],
    ["Transfers", props.transfers ?? props.stop_count],
    ["Walking", props.walking_burden ?? props.walking_time],
    ["Reliability", props.reliability],
    ["Departure", props.departure],
    ["Arrival", props.arrival],
  ];
  for (const [label, raw] of pairs) {
    const value = asString(raw);
    if (value) fallback.push({ label, value });
  }
  return fallback;
}

function normalizeTradeoffs(value: unknown): Array<{ title: string; body: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return { title: "Trade-off", body: entry };
      if (!isRecord(entry)) return null;
      return {
        title: asString(entry.title, asString(entry.label, "Trade-off")),
        body: asString(entry.body, asString(entry.value)),
      };
    })
    .filter((entry): entry is { title: string; body: string } => Boolean(entry?.body));
}

type ComparisonRow = {
  label: string;
  values: string[];
  winner: boolean;
  confidenceDelta?: string;
  conflict?: string;
  note?: string;
};

type RouteMetricEntry = { label: string; value: string };
type RouteTradeoffEntry = { title: string; body: string };

type RouteCardState = {
  routeId: string;
  showRouteId: boolean;
  confidencePercent: number;
  showConfidence: boolean;
  confidenceLabel: string;
  title: string;
  summary: string;
  showSummary: boolean;
  copyText: string;
  shareUrl: string;
  showCopyAction: boolean;
  showShareAction: boolean;
  metrics: RouteMetricEntry[];
  tradeoffs: RouteTradeoffEntry[];
  showTradeoffs: boolean;
  assumptions: string[];
  showAssumptions: boolean;
  notes: string[];
  showNotes: boolean;
  showAssumptionGrid: boolean;
};

type ComparisonSignalChip = {
  label: string;
  className: string;
};

type ComparisonRowView = {
  label: string;
  values: string[];
  note: string;
  showNote: boolean;
  rowClass: string;
  signalChips: ComparisonSignalChip[];
  showSignals: boolean;
};

type ComparisonTableState = {
  title: string;
  showTitle: boolean;
  description: string;
  showDescription: boolean;
  columns: string[];
  rows: ComparisonRowView[];
};

type SocialPlatform = { label: string; id: string };
type SocialPreview = {
  platform: string;
  status: string;
  showStatus: boolean;
  title: string;
  showTitle: boolean;
  body: string;
};

type SocialComposerState = {
  title: string;
  description: string;
  showDescription: boolean;
  platforms: SocialPlatform[];
  showPlatforms: boolean;
  selectedPlatformId: string;
  draftText: string;
  copyButtonText: string;
  suggestions: string[];
  showSuggestions: boolean;
  previews: SocialPreview[];
  showPreviews: boolean;
};

type SpaceMemberView = {
  label: string;
  role: string;
  showRole: boolean;
};

type SpaceMessageView = {
  author: string;
  type: string;
  showType: boolean;
  timestamp: string;
  showTimestamp: boolean;
  body: string;
};

type SpaceComposerState = {
  draftText: string;
  showComposer: boolean;
  canPost: boolean;
  spaceId: string;
  spaceName: string;
};

type SpaceFeedState = {
  title: string;
  description: string;
  showDescription: boolean;
  members: SpaceMemberView[];
  visibleMembers: SpaceMemberView[];
  showMembers: boolean;
  messages: SpaceMessageView[];
  showMessages: boolean;
  composer: SpaceComposerState;
};

function normalizeComparisonRows(value: unknown): ComparisonRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map<ComparisonRow | null>((entry, index) => {
      if (Array.isArray(entry)) {
        return {
          label: `Row ${index + 1}`,
          values: entry.map((cell) => String(cell ?? "")),
          winner: false,
        };
      }
      if (!isRecord(entry)) return null;
      const values = Array.isArray(entry.values)
        ? entry.values.map((cell) => String(cell ?? ""))
        : [];
      return {
        label: asString(entry.label, asString(entry.metric, `Row ${index + 1}`)),
        values,
        winner: Boolean(entry.winner),
        confidenceDelta: asString(entry.confidence_delta),
        conflict: entry.conflict === true ? "Conflicting data" : asString(entry.conflict),
        note: asString(entry.note),
      };
    })
    .filter((entry): entry is ComparisonRow => entry !== null);
}

function normalizeRouteMetrics(props: Record<string, unknown>): RouteMetricEntry[] {
  return normalizeMetricEntries(props);
}

function normalizeRouteTradeoffs(props: Record<string, unknown>): RouteTradeoffEntry[] {
  return normalizeTradeoffs(props);
}

function routeConfidencePercent(raw: unknown): number {
  if (typeof raw === "number") return Math.max(0, Math.min(100, raw <= 1 ? raw * 100 : raw));
  const value = asString(raw).toLowerCase();
  if (value === "high") return 86;
  if (value === "medium") return 62;
  if (value === "low") return 34;
  return 0;
}

function routeConfidenceLabel(raw: unknown, confidencePercent: number): string {
  if (typeof raw === "number") return `${Math.round(confidencePercent)}% confidence`;
  return asString(raw, "Confidence pending");
}

function routeCardState(
  data: Record<string, unknown>,
  copied: boolean
): RouteCardState {
  const actions = asStringArray(data.actions);
  const assumptions = asStringArray(data.assumptions);
  const notes = asStringArray(data.dependency_notes ?? data.notes);
  const metrics = normalizeRouteMetrics(data);
  const tradeoffs = normalizeRouteTradeoffs(data);
  const confidenceRaw = data.confidence;
  const confidencePercent = routeConfidencePercent(confidenceRaw);
  const routeId = asString(data.route_id, asString(data.id));
  const summary = asString(data.summary || data.description);
  const copyText = asString(data.share_text, asString(data.copy_text, summary));
  const shareUrl = asString(data.share_url);

  return {
    routeId,
    showRouteId: Boolean(routeId),
    confidencePercent,
    showConfidence: confidencePercent > 0,
    confidenceLabel: routeConfidenceLabel(confidenceRaw, confidencePercent),
    title: asString(data.title, "Route option"),
    summary,
    showSummary: Boolean(summary),
    copyText,
    shareUrl,
    showCopyAction: actions.includes("copy") || Boolean(copyText),
    showShareAction: actions.includes("share") || Boolean(shareUrl) || Boolean(copyText),
    metrics,
    tradeoffs,
    showTradeoffs: tradeoffs.length > 0,
    assumptions,
    showAssumptions: assumptions.length > 0,
    notes,
    showNotes: notes.length > 0,
    showAssumptionGrid: assumptions.length > 0 || notes.length > 0,
  };
}

function comparisonSignalChips(row: ComparisonRow): ComparisonSignalChip[] {
  const chips: ComparisonSignalChip[] = [];
  if (row.winner) {
    chips.push({
      label: "Winner",
      className: "rounded-full bg-emerald-400/15 px-2 py-1 text-[10px] font-semibold text-emerald-200",
    });
  }
  if (row.confidenceDelta) {
    chips.push({
      label: `Delta ${row.confidenceDelta}`,
      className: "rounded-full bg-sky-400/15 px-2 py-1 text-[10px] font-semibold text-sky-200",
    });
  }
  if (row.conflict) {
    chips.push({
      label: row.conflict,
      className: "rounded-full bg-rose-400/15 px-2 py-1 text-[10px] font-semibold text-rose-200",
    });
  }
  return chips;
}

function comparisonTableState(data: Record<string, unknown>): ComparisonTableState {
  const title = asString(data.title);
  const description = asString(data.description || data.caption);
  const rows = normalizeComparisonRows(data.rows).map((row) => {
    const note = row.note ?? "";
    const signalChips = comparisonSignalChips(row);
    return {
      label: row.label,
      values: row.values,
      note,
      showNote: Boolean(note),
      rowClass: row.winner ? "bg-emerald-400/6" : "",
      signalChips,
      showSignals: signalChips.length > 0,
    };
  });
  return {
    title,
    showTitle: Boolean(title),
    description,
    showDescription: Boolean(description),
    columns: asStringArray(data.columns),
    rows,
  };
}

function socialPlatforms(data: Record<string, unknown>): SocialPlatform[] {
  const raw = data.platforms;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === "string") return { label: entry, id: entry.toLowerCase() };
      if (!isRecord(entry)) return null;
      const label = asString(entry.label, asString(entry.platform, asString(entry.id)));
      const id = asString(entry.id, label.toLowerCase());
      return label ? { label, id } : null;
    })
    .filter((entry): entry is SocialPlatform => Boolean(entry));
}

function socialSuggestions(data: Record<string, unknown>): string[] {
  const raw = data.suggestions;
  if (Array.isArray(raw)) return raw.map((item) => String(item ?? "")).filter(Boolean);
  if (!isRecord(raw)) return [];
  const chips = [
    asString(raw.tone) ? `Tone: ${asString(raw.tone)}` : "",
    asString(raw.best_time) ? `Best time: ${asString(raw.best_time)}` : "",
    ...asStringArray(raw.hashtags).map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)),
  ];
  return chips.filter(Boolean);
}

function socialPreviews(data: Record<string, unknown>, draftText: string): SocialPreview[] {
  return asRecordArray(data.preview ?? data.previews).map((preview) => {
    const status = asString(preview.status);
    const title = asString(preview.title);
    return {
      platform: asString(preview.platform, "Platform"),
      status,
      showStatus: Boolean(status),
      title,
      showTitle: Boolean(title),
      body: asString(preview.body, draftText),
    };
  });
}

function socialComposerState(data: Record<string, unknown>, copied: boolean): SocialComposerState {
  const title = asString(data.title, "Draft for review");
  const description = asString(data.description);
  const draftText = asString(data.draft_text ?? data.body, "Draft pending");
  const platforms = socialPlatforms(data);
  const suggestions = socialSuggestions(data);
  const previews = socialPreviews(data, draftText);
  return {
    title,
    description,
    showDescription: Boolean(description),
    platforms,
    showPlatforms: platforms.length > 0,
    selectedPlatformId: asString(data.selected_platform).toLowerCase(),
    draftText,
    copyButtonText: copied ? "Copied" : "Copy draft",
    suggestions,
    showSuggestions: suggestions.length > 0,
    previews,
    showPreviews: previews.length > 0,
  };
}

function spaceMemberViews(data: Record<string, unknown>): SpaceMemberView[] {
  return asRecordArray(data.members).map((member) => {
    const role = asString(member.role);
    return {
      label: asString(member.name, asString(member.user_id, "member")),
      role,
      showRole: Boolean(role),
    };
  });
}

function spaceMessageViews(data: Record<string, unknown>): SpaceMessageView[] {
  return asRecordArray(data.messages ?? data.items).map((message) => {
    const type = asString(message.type);
    const timestamp = asString(message.timestamp, asString(message.created_at));
    return {
      author: asString(
        message.author,
        asString(message.from_agent, asString(message.author_user_id, "Participant"))
      ),
      type,
      showType: Boolean(type),
      timestamp,
      showTimestamp: Boolean(timestamp),
      body: asString(message.body, asString(message.text, asString(message.preview))),
    };
  });
}

function spaceComposerState(data: Record<string, unknown>): SpaceComposerState {
  const draftText = asString(
    data.composer_draft,
    asString(data.composer_placeholder, "Write an update to the space...")
  );
  const canPost = Boolean(data.can_post);
  return {
    draftText,
    showComposer: canPost || Boolean(draftText),
    canPost,
    spaceId: asString(data.space_id),
    spaceName: asString(data.space_name, asString(data.title)),
  };
}

function spaceFeedState(data: Record<string, unknown>): SpaceFeedState {
  const members = spaceMemberViews(data);
  const messages = spaceMessageViews(data);
  const description = asString(data.space_description || data.description);
  return {
    title: asString(data.space_name, asString(data.title, "Space")),
    description,
    showDescription: Boolean(description),
    members,
    visibleMembers: members.slice(0, 6),
    showMembers: members.length > 0,
    messages,
    showMessages: messages.length > 0,
    composer: spaceComposerState(data),
  };
}

async function copyText(value: string, onDone?: () => void): Promise<void> {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    onDone?.();
  } catch {
    dispatchA2uiCopyFallbackEvent({ text: value });
  }
}

async function sharePayload(detail: Record<string, unknown>): Promise<void> {
  const text = asString(detail.text);
  const title = asString(detail.title);
  const url = asString(detail.url);
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url: url || undefined });
      return;
    } catch {
      // Fall through to app-level event handling.
    }
  }
  dispatchA2uiShareEvent(detail);
}

export function A2UIRouteCard(props: { data: Record<string, unknown> }) {
  const data = () => props.data;
  const [copied, setCopied] = createSignal(false);
  const cardState = createMemo(() => routeCardState(data(), copied()));

  return (
    <div class="space-y-4 rounded-2xl border border-sky-500/20 bg-[linear-gradient(180deg,rgba(14,116,144,0.14),rgba(15,23,42,0.16))] p-4 shadow-[0_24px_80px_-48px_rgba(56,189,248,0.65)]">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <Show when={cardState().showRouteId}>
              <span class="rounded-full border border-sky-400/25 bg-sky-400/12 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-sky-200">
                {cardState().routeId}
              </span>
            </Show>
            <Show when={cardState().showConfidence}>
              <span class="rounded-full border border-emerald-400/25 bg-emerald-400/12 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                {cardState().confidenceLabel}
              </span>
            </Show>
          </div>
          <h3 class="text-base font-semibold text-on-surface">{cardState().title}</h3>
          <Show when={cardState().showSummary}>
            <p class="max-w-3xl text-sm leading-6 text-on-surface-variant">
              {cardState().summary}
            </p>
          </Show>
        </div>
        <div class="flex items-center gap-2">
          <Show when={cardState().showCopyAction}>
            <button
              type="button"
              class="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white/10"
              onClick={async () => {
                await copyText(cardState().copyText, () => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied() ? "Copied" : "Copy"}
            </button>
          </Show>
          <Show when={cardState().showShareAction}>
            <button
              type="button"
              class="rounded-full bg-sky-500/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-400"
              onClick={() => void sharePayload({
                kind: "route_card",
                title: cardState().title,
                text: cardState().copyText,
                url: cardState().shareUrl,
                route_id: cardState().routeId,
              })}
            >
              Share
            </button>
          </Show>
        </div>
      </div>

      <Show when={cardState().metrics.length > 0}>
        <div class="grid grid-cols-2 gap-2 md:grid-cols-4">
          <For each={cardState().metrics}>
            {(metric) => (
              <div class="rounded-xl border border-white/12 bg-white/8 px-3 py-2">
                <p class="text-[10px] uppercase tracking-[0.12em] text-on-surface-variant/70">{metric.label}</p>
                <p class="mt-1 text-sm font-semibold text-on-surface">{metric.value}</p>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={cardState().showConfidence}>
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-xs text-on-surface-variant">
            <span>Route confidence</span>
            <span>{Math.round(cardState().confidencePercent)}%</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-white/10">
            <div class="h-full rounded-full bg-emerald-400" style={`width:${cardState().confidencePercent}%`} />
          </div>
        </div>
      </Show>

      <Show when={cardState().showTradeoffs}>
        <div class="space-y-2">
          <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">Trade-offs</p>
          <div class="grid gap-2 md:grid-cols-2">
            <For each={cardState().tradeoffs}>
              {(tradeoff) => (
                <div class="rounded-xl border border-amber-400/15 bg-amber-400/6 px-3 py-2">
                  <p class="text-xs font-semibold text-amber-200">{tradeoff.title}</p>
                  <p class="mt-1 text-xs leading-5 text-on-surface-variant">{tradeoff.body}</p>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={cardState().showAssumptionGrid}>
        <div class="grid gap-3 md:grid-cols-2">
          <Show when={cardState().showAssumptions}>
            <div class="rounded-xl border border-white/12 bg-white/6 px-3 py-3">
              <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">Assumptions</p>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <For each={cardState().assumptions}>
                  {(assumption) => (
                    <span class="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] text-primary">
                      {assumption}
                    </span>
                  )}
                </For>
              </div>
            </div>
          </Show>
          <Show when={cardState().showNotes}>
            <div class="rounded-xl border border-white/12 bg-white/6 px-3 py-3">
              <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">Dependencies</p>
              <ul class="mt-2 space-y-1 text-xs leading-5 text-on-surface-variant">
                <For each={cardState().notes}>{(note) => <li>{note}</li>}</For>
              </ul>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

export function A2UIComparisonTable(props: { data: Record<string, unknown> }) {
  const data = () => props.data;
  const tableState = createMemo(() => comparisonTableState(data()));

  return (
    <div class="space-y-3 rounded-2xl border border-white/15 bg-white/6 p-4">
      <div class="space-y-1">
        <Show when={tableState().showTitle}>
          <h3 class="text-sm font-semibold text-on-surface">{tableState().title}</h3>
        </Show>
        <Show when={tableState().showDescription}>
          <p class="text-xs leading-5 text-on-surface-variant">{tableState().description}</p>
        </Show>
      </div>
      <div class="overflow-x-auto rounded-xl border border-white/10">
        <table class="min-w-full divide-y divide-white/10 text-left text-xs">
          <thead class="bg-white/8">
            <tr>
              <th class="px-3 py-2 font-medium text-on-surface-variant">Metric</th>
              <For each={tableState().columns}>{(column) => <th class="px-3 py-2 font-medium text-on-surface-variant">{column}</th>}</For>
              <th class="px-3 py-2 font-medium text-on-surface-variant">Signals</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/8">
            <For each={tableState().rows}>
              {(row) => (
                <tr class={row.rowClass}>
                  <td class="px-3 py-3 align-top">
                    <div class="space-y-1">
                      <p class="font-medium text-on-surface">{row.label}</p>
                      <Show when={row.showNote}>
                        <p class="text-[11px] leading-4 text-on-surface-variant">{row.note}</p>
                      </Show>
                    </div>
                  </td>
                  <For each={row.values}>
                    {(value) => (
                      <td class="px-3 py-3 align-top text-on-surface-variant">
                        {value}
                      </td>
                    )}
                  </For>
                  <td class="px-3 py-3 align-top">
                    <div class="flex flex-wrap gap-1.5">
                      <For each={row.signalChips}>
                        {(chip) => <span class={chip.className}>{chip.label}</span>}
                      </For>
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function A2UISocialComposer(props: { data: Record<string, unknown> }) {
  const data = () => props.data;
  const [copied, setCopied] = createSignal(false);
  const cardState = createMemo(() => socialComposerState(data(), copied()));

  return (
    <div class="space-y-4 rounded-2xl border border-fuchsia-500/18 bg-[linear-gradient(180deg,rgba(236,72,153,0.12),rgba(15,23,42,0.12))] p-4 shadow-[0_24px_80px_-48px_rgba(217,70,239,0.55)]">
      <div class="space-y-1">
        <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-fuchsia-200/80">Social composer</p>
        <h3 class="text-base font-semibold text-on-surface">{cardState().title}</h3>
        <Show when={cardState().showDescription}>
          <p class="text-sm leading-6 text-on-surface-variant">{cardState().description}</p>
        </Show>
      </div>

      <Show when={cardState().showPlatforms}>
        <div class="flex flex-wrap gap-2">
          <For each={cardState().platforms}>
            {(platform) => (
              <span class={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                platform.id === cardState().selectedPlatformId
                  ? "bg-fuchsia-400/18 text-fuchsia-100"
                  : "bg-white/10 text-on-surface-variant"
              }`}>
                {platform.label}
              </span>
            )}
          </For>
        </div>
      </Show>

      <div class="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.9fr)]">
        <div class="space-y-3 rounded-2xl border border-white/12 bg-white/8 p-3">
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs font-semibold text-on-surface">Composer</p>
            <button
              type="button"
              class="rounded-full border border-white/15 px-3 py-1 text-[11px] text-on-surface-variant transition hover:bg-white/10"
              onClick={async () => {
                await copyText(cardState().draftText, () => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {cardState().copyButtonText}
            </button>
          </div>
          <div class="rounded-2xl border border-white/10 bg-black/15 p-3 text-sm leading-6 text-on-surface whitespace-pre-wrap">
            {cardState().draftText}
          </div>
          <Show when={cardState().showSuggestions}>
            <div class="flex flex-wrap gap-1.5">
              <For each={cardState().suggestions}>
                {(item) => (
                  <span class="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-2 py-1 text-[10px] text-fuchsia-100">
                    {item}
                  </span>
                )}
              </For>
            </div>
          </Show>
        </div>

        <div class="space-y-3">
          <Show when={cardState().showPreviews}>
            <div class="space-y-2">
              <p class="text-xs font-semibold text-on-surface">Preview</p>
              <For each={cardState().previews}>
                {(preview) => (
                  <div class="rounded-2xl border border-white/12 bg-white/8 p-3">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
                        {preview.platform}
                      </span>
                      <Show when={preview.showStatus}>
                        <span class="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-on-surface-variant">
                          {preview.status}
                        </span>
                      </Show>
                    </div>
                    <Show when={preview.showTitle}>
                      <p class="mt-2 text-sm font-semibold text-on-surface">{preview.title}</p>
                    </Show>
                    <p class="mt-1 text-xs leading-5 text-on-surface-variant whitespace-pre-wrap">
                      {preview.body}
                    </p>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <div class="flex flex-wrap gap-2">
            <For each={cardState().platforms}>
              {(platform) => (
                <button
                  type="button"
                  class="rounded-full bg-fuchsia-500/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-fuchsia-400"
                  onClick={() =>
                    dispatchSocialComposeActionEvent({
                      action: "publish",
                      platform: platform.id,
                      draft_text: cardState().draftText,
                      title: cardState().title,
                    })
                  }
                >
                  Publish to {platform.label}
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
}

export function A2UISpaceFeed(props: { data: Record<string, unknown> }) {
  const data = () => props.data;
  const cardState = createMemo(() => spaceFeedState(data()));

  return (
    <div class="space-y-4 rounded-2xl border border-white/16 bg-[linear-gradient(180deg,rgba(59,130,246,0.08),rgba(15,23,42,0.12))] p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-1">
          <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-blue-200/80">Space feed</p>
          <h3 class="text-base font-semibold text-on-surface">{cardState().title}</h3>
          <Show when={cardState().showDescription}>
            <p class="max-w-3xl text-sm leading-6 text-on-surface-variant">
              {cardState().description}
            </p>
          </Show>
        </div>
        <Show when={cardState().showMembers}>
          <div class="flex flex-wrap gap-1.5">
            <For each={cardState().visibleMembers}>
              {(member) => (
                <span class="rounded-full border border-white/12 bg-white/8 px-2 py-1 text-[10px] text-on-surface-variant">
                  {member.label}
                  <Show when={member.showRole}>
                    <span class="ml-1 text-on-surface-variant/70">({member.role})</span>
                  </Show>
                </span>
              )}
            </For>
          </div>
        </Show>
      </div>

      <Show when={cardState().showMessages} fallback={
        <div class="rounded-2xl border border-dashed border-white/12 bg-white/4 px-4 py-6 text-sm text-on-surface-variant">
          No messages yet for this space.
        </div>
      }>
        <div class="space-y-3">
          <For each={cardState().messages}>
            {(message) => (
              <div class="rounded-2xl border border-white/12 bg-white/8 p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-semibold text-on-surface">
                      {message.author}
                    </span>
                    <Show when={message.showType}>
                      <span class="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-on-surface-variant">
                        {message.type}
                      </span>
                    </Show>
                  </div>
                  <Show when={message.showTimestamp}>
                    <span class="text-[10px] text-on-surface-variant/70">{message.timestamp}</span>
                  </Show>
                </div>
                <p class="mt-2 text-sm leading-6 text-on-surface-variant whitespace-pre-wrap">
                  {message.body}
                </p>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={cardState().composer.showComposer}>
        <div class="rounded-2xl border border-white/12 bg-white/6 p-3">
          <p class="text-xs font-semibold text-on-surface">Composer</p>
          <div class="mt-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-sm text-on-surface-variant">
            {cardState().composer.draftText}
          </div>
          <Show when={cardState().composer.canPost}>
            <button
              type="button"
              class="mt-3 rounded-full bg-blue-500/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-400"
              onClick={() =>
                dispatchSpaceFeedComposeEvent({
                  space_id: cardState().composer.spaceId,
                  space_name: cardState().composer.spaceName,
                })
              }
            >
              Compose update
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
}
