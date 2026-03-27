import { For, Show } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";

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

function normalizeA2UI(
  viewContent: Record<string, unknown>,
  msgContent: Record<string, unknown>,
): A2UIContent {
  const raw = isRecord(viewContent) && Object.keys(viewContent).length > 0 ? viewContent : msgContent;
  return {
    schema_version: asString(raw.schema_version),
    kind: asString(raw.kind),
    title: asString(raw.title) || undefined,
    description: asString(raw.description) || undefined,
    layout: isRecord(raw.layout) ? (raw.layout as A2UILayout) : { type: "stack", gap: "md" },
    nodes: normalizeNodes(raw.nodes),
  };
}

function gapClass(gap: string | undefined): string {
  switch (gap) {
    case "sm":
      return "gap-2";
    case "lg":
      return "gap-5";
    default:
      return "gap-3";
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
    case "success":
      return "border-emerald-400/25 bg-emerald-400/10";
    case "warning":
      return "border-amber-400/25 bg-amber-400/10";
    case "danger":
      return "border-red-400/25 bg-red-400/10";
    case "strategy":
      return "border-indigo-400/25 bg-indigo-400/10";
    default:
      return "border-white/20 bg-white/10";
  }
}

function A2UINodeRenderer(props: { node: A2UINode }) {
  const node = () => props.node;
  const p = () => node().props ?? {};

  switch (node().type) {
    case "text":
      return (
        <div class="space-y-1">
          <Show when={asString(p().label)}>
            <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
              {asString(p().label)}
            </p>
          </Show>
          <p class="text-sm leading-6 text-on-surface whitespace-pre-wrap">{asString(p().value)}</p>
        </div>
      );

    case "callout":
      return (
        <div class={`rounded-lg border p-3 space-y-1 ${calloutToneClass(asString(p().tone, "info"))}`}>
          <Show when={asString(p().title)}>
            <h3 class="text-sm font-semibold text-on-surface">{asString(p().title)}</h3>
          </Show>
          <p class="text-sm text-on-surface/90 whitespace-pre-wrap">{asString(p().body)}</p>
        </div>
      );

    case "stats_grid": {
      const rawItems = p()["items"];
      const items = Array.isArray(rawItems) ? rawItems.filter(isRecord) : [];
      return (
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
      const rawRows = p()["rows"];
      const columns = Array.isArray(rawColumns) ? rawColumns.map((c: unknown) => String(c)) : [];
      const rows = Array.isArray(rawRows) ? rawRows.filter(Array.isArray) : [];
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
      const items = Array.isArray(rawItems) ? rawItems.filter(isRecord) : [];
      return (
        <div class="space-y-2">
          <Show when={asString(p().title)}>
            <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
              {asString(p().title)}
            </p>
          </Show>
          <div class="space-y-2">
            <For each={items}>
              {(item) => (
                <a
                  href={asString(item.url)}
                  target="_blank"
                  rel="noreferrer"
                  class="block rounded-lg border border-white/15 bg-white/8 px-3 py-2 transition-colors hover:border-primary/30 hover:bg-primary/10"
                >
                  <p class="text-sm font-medium text-on-surface">
                    {asString(item.title, asString(item.url, "Link"))}
                  </p>
                  <Show when={asString(item.subtitle)}>
                    <p class="mt-1 text-sm text-on-surface-variant">{asString(item.subtitle)}</p>
                  </Show>
                  <p class="mt-1 text-xs text-primary/80">{asString(item.url)}</p>
                </a>
              )}
            </For>
          </div>
        </div>
      );
    }

    case "constraint_badges": {
      const rawItems = p()["items"];
      const items = Array.isArray(rawItems) ? rawItems.filter(isRecord) : [];
      return (
        <div class="flex flex-wrap gap-2">
          <For each={items}>
            {(item) => (
              <span class="rounded-full border border-red-400/25 bg-red-400/10 px-2.5 py-1 text-xs text-red-200">
                {asString(item.kind).replaceAll("_", " ")}: {asString(item.label)}
              </span>
            )}
          </For>
        </div>
      );
    }

    case "section":
      return (
        <section class="space-y-3">
          <Show when={asString(p().title)}>
            <h3 class="text-sm font-semibold text-on-surface">{asString(p().title)}</h3>
          </Show>
          <div class={layoutClass((p().layout as A2UILayout | undefined) ?? { type: "stack", gap: "md" })}>
            <For each={node().children ?? []}>{(child) => <A2UINodeRenderer node={child} />}</For>
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

export function A2UIRenderer(props: { message: AfpMessage; view?: AfpView }) {
  const viewContent = () => (props.view?.content ?? {}) as Record<string, unknown>;
  const msgContent = () => (props.message.content ?? {}) as Record<string, unknown>;
  const ui = () => normalizeA2UI(viewContent(), msgContent());

  return (
    <div class="space-y-4">
      <Show when={ui().title || ui().description}>
        <header class="space-y-1">
          <Show when={ui().title}>
            <h3 class="text-base font-semibold tracking-tight text-on-surface">{ui().title}</h3>
          </Show>
          <Show when={ui().description}>
            <p class="text-sm leading-6 text-on-surface-variant">{ui().description}</p>
          </Show>
        </header>
      </Show>

      <div class={layoutClass(ui().layout)}>
        <For each={ui().nodes ?? []}>{(node) => <A2UINodeRenderer node={node} />}</For>
      </div>
    </div>
  );
}
