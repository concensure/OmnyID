import { For, Show } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";
import { safeHref } from "@/lib/api";
import { useViewport } from "@/context/ViewportContext";
import { renderMarkdown } from "@/lib/markdownRenderer";

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function normalizeNodes(v: unknown): A2UINode[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isRecord)
    .map((node) => ({
      id: asString(node.id),
      type: asString(node.type),
      props: isRecord(node.props) ? node.props : {},
      children: normalizeNodes(node.children),
    }))
    .filter((node) => node.id && node.type);
}

const SINGLE_NODE_KINDS = new Set(["insight_line", "action_chips", "stat_row"]);

function normalizeA2UI(
  viewContent: Record<string, unknown>,
  msgContent: Record<string, unknown>,
): A2UIContent {
  const raw = isRecord(viewContent) && Object.keys(viewContent).length > 0 ? viewContent : msgContent;
  let nodes = normalizeNodes(raw.nodes);

  // Backend agents emit single-node views as { kind/format, props } without a nodes array.
  // Synthesise a root node so A2UINodeRenderer can handle it uniformly.
  if (nodes.length === 0) {
    const kind = asString(raw.kind) || asString(raw.format);
    if (SINGLE_NODE_KINDS.has(kind)) {
      nodes = [{ id: "root", type: kind, props: isRecord(raw.props) ? raw.props : {} }];
    }
  }

  return {
    schema_version: asString(raw.schema_version),
    kind: asString(raw.kind),
    title: asString(raw.title) || undefined,
    description: asString(raw.description) || undefined,
    layout: isRecord(raw.layout) ? (raw.layout as A2UILayout) : { type: "stack", gap: "md" },
    nodes,
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

function calloutToneClass(tone: string): string {
  switch (tone) {
    case "success":  return "border-emerald-400/25 bg-emerald-400/10";
    case "warning":  return "border-amber-400/25 bg-amber-400/10";
    case "danger":   return "border-red-400/25 bg-red-400/10";
    case "strategy": return "border-indigo-400/25 bg-indigo-400/10";
    default:         return "border-white/20 bg-white/10";
  }
}

// ── Node renderer ─────────────────────────────────────────────────────────────

function A2UINodeRenderer(props: {
  node: A2UINode;
  renderMode: () => RenderMode;
}) {
  const node = () => props.node;
  const p    = () => node().props ?? {};
  const rm   = () => props.renderMode();

  switch (node().type) {
    case "text":
      return (
        <div class="space-y-1">
          <Show when={rm() !== "glance" && asString(p().label)}>
            <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
              {asString(p().label)}
            </p>
          </Show>
          <p class={`leading-6 text-on-surface whitespace-pre-wrap ${rm() === "glance" ? "text-xs line-clamp-2" : "text-sm"}`}>
            {asString(p().value)}
          </p>
        </div>
      );

    case "rich_text": {
      // Agents embed Markdown in props.markdown for inline rich content.
      const md = asString(p().markdown);
      if (!md) return <></>;
      if (rm() === "glance") {
        // Strip tags for glance preview
        const plainText = md.replace(/[#*_`>~\[\]()]/g, "").trim();
        return <p class="text-xs text-on-surface-variant line-clamp-2">{plainText}</p>;
      }
      return <div class="md-prose" innerHTML={renderMarkdown(md)} />;
    }

    case "callout": {
      const tone  = asString(p().tone, "info");
      const title = asString(p().title);
      const body  = asString(p().body);

      // Glance: title only (or first 8 words of body when no title)
      if (rm() === "glance") {
        return (
          <div class={`rounded-lg border p-2 ${calloutToneClass(tone)}`}>
            <p class="text-xs font-semibold text-on-surface line-clamp-1">
              {title || body.split(" ").slice(0, 8).join(" ")}
            </p>
          </div>
        );
      }

      return (
        <div class={`rounded-lg border p-3 space-y-1 ${calloutToneClass(tone)}`}>
          <Show when={title}>
            <h3 class="text-sm font-semibold text-on-surface">{title}</h3>
          </Show>
          <p class={`text-sm text-on-surface/90 whitespace-pre-wrap ${rm() === "compact" ? "line-clamp-2" : ""}`}>
            {body}
          </p>
        </div>
      );
    }

    case "stats_grid": {
      const rawItems = p()["items"];
      const items = Array.isArray(rawItems) ? rawItems.filter(isRecord) : [];

      // Glance: single stat, centred, large value
      if (rm() === "glance") {
        const first = items[0];
        return (
          <Show when={first} fallback={<></>}>
            <div class="flex flex-col items-center justify-center py-2">
              <span style="font-size: var(--text-lg, 1.25rem)" class="font-bold text-on-surface leading-none">
                {asString(first?.value)}
              </span>
              <span style="font-size: var(--text-nano, 11px)" class="mt-0.5 uppercase tracking-wide text-on-surface-variant/70">
                {asString(first?.label)}
              </span>
            </div>
          </Show>
        );
      }

      // Compact: always 2-col, no responsive breakpoint
      const gridClass = rm() === "compact"
        ? "grid grid-cols-2 gap-2"
        : "grid grid-cols-1 gap-2 sm:grid-cols-2";

      return (
        <div class={gridClass}>
          <For each={items}>
            {(item) => (
              <div class="rounded-lg border border-white/15 bg-white/8 px-3 py-2">
                <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
                  {asString(item.label)}
                </p>
                <p class="mt-1 text-sm font-medium text-on-surface">{asString(item.value)}</p>
              </div>
            )}
          </For>
        </div>
      );
    }

    case "table": {
      const rawColumns = p()["columns"];
      const rawRows    = p()["rows"];
      const columns = Array.isArray(rawColumns) ? rawColumns.map((c: unknown) => String(c)) : [];
      const rows    = Array.isArray(rawRows)    ? rawRows.filter(Array.isArray)             : [];

      // Glance: first row, first two columns, stacked vertically
      if (rm() === "glance") {
        const firstRow = rows[0] as unknown[] | undefined;
        return (
          <div class="rounded-lg border border-white/15 bg-white/8 px-3 py-2">
            <Show when={asString(p().caption)}>
              <p class="mb-1 text-[10px] text-on-surface-variant">{asString(p().caption)}</p>
            </Show>
            <div class="flex flex-col gap-1 text-xs">
              <Show when={columns[0]}>
                <div class="flex items-center justify-between gap-2">
                  <span class="text-on-surface-variant">{columns[0]}</span>
                  <span class="font-medium text-on-surface">
                    {firstRow?.[0] == null ? "" : String(firstRow[0])}
                  </span>
                </div>
              </Show>
              <Show when={columns[1]}>
                <div class="flex items-center justify-between gap-2">
                  <span class="text-on-surface-variant">{columns[1]}</span>
                  <span class="font-medium text-on-surface">
                    {firstRow?.[1] == null ? "" : String(firstRow[1])}
                  </span>
                </div>
              </Show>
            </div>
          </div>
        );
      }

      // Compact: key-value vertical list (first column = key, second = value)
      if (rm() === "compact") {
        return (
          <div class="rounded-lg border border-white/15 bg-white/8 p-3 space-y-1">
            <Show when={asString(p().caption)}>
              <p class="mb-2 text-xs text-on-surface-variant">{asString(p().caption)}</p>
            </Show>
            <For each={rows}>
              {(row) => {
                const cells = row as unknown[];
                return (
                  <div class="flex items-start justify-between gap-2 py-1 border-t border-white/10 first:border-t-0">
                    <span class="text-xs text-on-surface-variant shrink-0">
                      {cells[0] == null ? "" : String(cells[0])}
                    </span>
                    <span class="text-xs font-medium text-on-surface text-right">
                      {cells[1] == null ? "" : String(cells[1])}
                    </span>
                  </div>
                );
              }}
            </For>
          </div>
        );
      }

      // Standard / full: scrollable horizontal table
      return (
        <div class="rounded-lg border border-white/15 bg-white/8 p-3 overflow-auto">
          <Show when={asString(p().caption)}>
            <p class="mb-2 text-xs text-on-surface-variant">{asString(p().caption)}</p>
          </Show>
          <table class="w-full text-left text-sm">
            <thead class="text-xs uppercase tracking-[0.14em] text-outline">
              <tr>
                <For each={columns}>{(column) => <th class="pb-2 pr-3 font-mono">{column}</th>}</For>
              </tr>
            </thead>
            <tbody class="text-on-surface">
              <For each={rows}>
                {(row) => (
                  <tr class="border-t border-white/10">
                    <For each={row as unknown[]}>
                      {(cell) => <td class="py-2 pr-3 align-top">{cell === null ? "" : String(cell)}</td>}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      );
    }

    case "code":
      return (
        <div class="space-y-2">
          <Show when={asString(p().title)}>
            <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
              {asString(p().title)}
            </p>
          </Show>
          <pre class="overflow-auto rounded-lg border border-white/15 bg-surface-container-high px-3 py-3 text-xs leading-6 text-on-surface">
            <code>{asString(p().code)}</code>
          </pre>
        </div>
      );

    case "link_list": {
      const rawItems = p()["items"];
      const items    = Array.isArray(rawItems) ? rawItems.filter(isRecord) : [];
      const visible  = () => rm() === "glance" ? items.slice(0, 1) : items;

      return (
        <div class="space-y-2">
          <Show when={rm() !== "glance" && asString(p().title)}>
            <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
              {asString(p().title)}
            </p>
          </Show>
          <div class="space-y-2">
            <For each={visible()}>
              {(item) => (
                <a
                  href={safeHref(item.url)}
                  target="_blank"
                  rel="noreferrer noopener"
                  class="block rounded-lg border border-white/15 bg-white/8 px-3 py-2 transition-colors hover:border-primary/30 hover:bg-primary/10"
                >
                  <p class="text-sm font-medium text-on-surface">
                    {asString(item.title, asString(item.url, "Link"))}
                  </p>
                  <Show when={rm() !== "glance" && asString(item.subtitle)}>
                    <p class="mt-1 text-sm text-on-surface-variant">{asString(item.subtitle)}</p>
                  </Show>
                  <Show when={rm() !== "glance"}>
                    <p class="mt-1 text-xs text-primary/80">{asString(item.url)}</p>
                  </Show>
                </a>
              )}
            </For>
          </div>
        </div>
      );
    }

    case "constraint_badges": {
      const rawItems = p()["items"];
      const items    = Array.isArray(rawItems) ? rawItems.filter(isRecord) : [];

      // Glance: single count chip
      if (rm() === "glance") {
        return (
          <span class="rounded-full border border-red-400/25 bg-red-400/10 px-2.5 py-1 text-xs text-red-200">
            ⚡ {items.length} active
          </span>
        );
      }

      return (
        <div class="flex flex-wrap gap-2">
          <For each={items}>
            {(item) => (
              <span class={`rounded-full border border-red-400/25 bg-red-400/10 text-red-200 px-2.5 py-1 ${rm() === "compact" ? "text-[10px]" : "text-xs"}`}>
                {asString(item.kind).replaceAll("_", " ")}: {asString(item.label)}
              </span>
            )}
          </For>
        </div>
      );
    }

    case "insight_line": {
      // Supports both watcher_alert style (primary/secondary/confidence/severity)
      // and behavior_pattern style (title/badge/badge_tone/action_chips).
      const icon         = asString(p().icon);
      const title        = asString(p().title) || asString(p().primary);
      const secondary    = asString(p().secondary);
      const badge        = asString(p().badge);
      const badgeTone    = asString(p().badge_tone);
      const confidence   = asString(p().confidence);
      const rawChips     = p().action_chips;
      const actionChips  = Array.isArray(rawChips) ? rawChips.map(String) : [];

      const badgeClass = () => {
        const t = badgeTone || (confidence === "high" ? "success" : confidence === "low" ? "warning" : "");
        switch (t) {
          case "success": return "border-emerald-400/25 bg-emerald-400/15 text-emerald-300";
          case "warning": return "border-amber-400/25 bg-amber-400/15 text-amber-300";
          case "danger":  return "border-red-400/25 bg-red-400/15 text-red-300";
          default:        return "border-primary/25 bg-primary/15 text-primary";
        }
      };

      if (rm() === "glance") {
        return (
          <div class="flex items-center gap-2 py-1">
            <Show when={icon}><span class="text-base leading-none">{icon}</span></Show>
            <span class="line-clamp-1 text-xs font-medium text-on-surface">{title}</span>
          </div>
        );
      }

      return (
        <div class="flex items-start gap-3 rounded-lg border border-white/15 bg-white/8 px-3 py-2.5">
          <Show when={icon}>
            <span class="mt-0.5 shrink-0 text-lg leading-none">{icon}</span>
          </Show>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-medium leading-snug text-on-surface">{title}</p>
              <Show when={badge || confidence}>
                <span class={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${badgeClass()}`}>
                  {badge || confidence}
                </span>
              </Show>
            </div>
            <Show when={secondary}>
              <p class="mt-0.5 text-xs text-on-surface-variant">{secondary}</p>
            </Show>
            <Show when={actionChips.length > 0 && rm() !== "compact"}>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <For each={actionChips}>
                  {(chip) => (
                    <span class="cursor-pointer rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs text-on-surface-variant transition-colors hover:bg-white/20">
                      {chip}
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
      const rawActions = p().actions;
      const actions = Array.isArray(rawActions) ? rawActions.map(String) : [];

      if (rm() === "glance") {
        return (
          <span class="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs text-on-surface-variant">
            {actions.length} action{actions.length !== 1 ? "s" : ""}
          </span>
        );
      }

      return (
        <div class="flex flex-wrap gap-2">
          <For each={actions}>
            {(action) => (
              <button
                type="button"
                class="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white/20 active:scale-95"
              >
                {action}
              </button>
            )}
          </For>
        </div>
      );
    }

    case "stat_row": {
      const tone       = asString(p().tone, "info");
      const title      = asString(p().title);
      const rawStats   = p().stats;
      const stats      = Array.isArray(rawStats) ? rawStats.filter(isRecord) : [];
      const rawItems   = p().items;
      const focusItems = Array.isArray(rawItems) ? rawItems.map(String) : [];

      const toneClass = () => {
        switch (tone) {
          case "warning": return "border-amber-400/25 bg-amber-400/8";
          case "success": return "border-emerald-400/25 bg-emerald-400/8";
          case "danger":  return "border-red-400/25 bg-red-400/8";
          case "strategy": return "border-indigo-400/25 bg-indigo-400/8";
          default:        return "border-white/20 bg-white/8";
        }
      };

      if (rm() === "glance") {
        const first = stats[0];
        return (
          <div class={`rounded-lg border px-3 py-2 ${toneClass()}`}>
            <p class="line-clamp-1 text-xs font-medium text-on-surface">{title}</p>
            <Show when={first}>
              <p class="mt-0.5 text-[10px] text-on-surface-variant">
                {asString(first.label)}:{" "}
                <span class="font-medium text-on-surface">{String(first.value)}</span>
              </p>
            </Show>
          </div>
        );
      }

      return (
        <div class={`space-y-3 rounded-lg border p-3 ${toneClass()}`}>
          <Show when={title}>
            <p class="text-sm font-semibold text-on-surface">{title}</p>
          </Show>
          <Show when={stats.length > 0}>
            <div class={`grid gap-2 ${rm() === "compact" ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
              <For each={stats}>
                {(stat) => (
                  <div class="text-center">
                    <p class="text-base font-bold text-on-surface">{String(stat.value)}</p>
                    <p class="mt-0.5 text-[10px] uppercase tracking-wide text-on-surface-variant/70">
                      {asString(stat.label)}
                    </p>
                  </div>
                )}
              </For>
            </div>
          </Show>
          <Show when={focusItems.length > 0 && rm() !== "compact"}>
            <ul class="space-y-1">
              <For each={focusItems}>
                {(item) => (
                  <li class="flex items-start gap-1.5 text-xs text-on-surface-variant">
                    <span class="mt-0.5 shrink-0 text-primary/70">→</span>
                    <span>{item}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      );
    }

    case "diff_view":
      // diff_view is suppressed on watch — complex diffs need a larger screen
      if (rm() === "glance") {
        return (
          <div class="rounded-lg border border-white/20 bg-white/10 p-2 text-xs text-on-surface-variant">
            Behaviour change preview — open on a larger screen.
          </div>
        );
      }
      return (
        <div class="rounded-lg border border-white/20 bg-white/10 p-3 text-sm text-on-surface-variant">
          [diff view not yet rendered]
        </div>
      );

    case "section":
      return (
        <section class="space-y-3">
          <Show when={asString(p().title)}>
            <h3 class="text-sm font-semibold text-on-surface">{asString(p().title)}</h3>
          </Show>
          <div class={layoutClass((p().layout as A2UILayout | undefined) ?? { type: "stack", gap: "md" })}>
            <For each={node().children ?? []}>
              {(child) => <A2UINodeRenderer node={child} renderMode={props.renderMode} />}
            </For>
          </div>
        </section>
      );

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

  const renderMode = (): RenderMode => {
    switch (viewport()) {
      case "watch":  return "glance";
      case "phone":  return "compact";
      case "tablet": return "standard";
      default:       return "full";
    }
  };

  const viewContent = () => (props.view?.content ?? {}) as Record<string, unknown>;
  const msgContent  = () => (props.message.content ?? {}) as Record<string, unknown>;
  const ui          = () => normalizeA2UI(viewContent(), msgContent());

  return (
    <div class="space-y-4">
      <Show when={ui().title || ui().description}>
        <header class="space-y-1">
          <Show when={ui().title}>
            <h3 class="text-base font-semibold tracking-tight text-on-surface">{ui().title}</h3>
          </Show>
          {/* Description suppressed in glance mode to save space */}
          <Show when={ui().description && renderMode() !== "glance"}>
            <p class="text-sm leading-6 text-on-surface-variant">{ui().description}</p>
          </Show>
        </header>
      </Show>

      <div class={layoutClass(ui().layout)}>
        <For each={ui().nodes ?? []}>
          {(node) => <A2UINodeRenderer node={node} renderMode={renderMode} />}
        </For>
      </div>
    </div>
  );
}
