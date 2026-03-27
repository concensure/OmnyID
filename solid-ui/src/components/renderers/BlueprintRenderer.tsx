import { For, Show } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";

type BlueprintBlock =
  | {
      type: "text";
      text: string;
      tone?: "default" | "muted" | "danger" | "success" | "warning";
    }
  | {
      type: "code";
      code: string;
      language?: string;
    }
  | {
      type: "stats";
      items: Array<{ label: string; value: string; hint?: string }>;
    }
  | {
      type: "links";
      items: Array<{ title: string; url: string; subtitle?: string }>;
    }
  | {
      type: "table";
      columns: string[];
      rows: Array<Array<string | number | boolean | null>>;
      caption?: string;
    };

type BlueprintContent = {
  title?: string;
  subtitle?: string;
  blocks?: BlueprintBlock[];
};

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function normalizeBlocks(v: unknown): BlueprintBlock[] {
  if (!Array.isArray(v)) return [];

  const out: BlueprintBlock[] = [];
  for (const raw of v) {
    if (!isRecord(raw)) continue;
    const t = asString(raw.type);
    if (t === "text") {
      out.push({
        type: "text",
        text: asString(raw.text),
        tone: (asString(raw.tone) as any) || "default",
      });
      continue;
    }
    if (t === "code") {
      out.push({
        type: "code",
        code: asString(raw.code),
        language: asString(raw.language) || undefined,
      });
      continue;
    }
    if (t === "stats" && Array.isArray(raw.items)) {
      const items = raw.items
        .filter(isRecord)
        .map((it) => ({
          label: asString(it.label),
          value: asString(it.value),
          hint: asString(it.hint) || undefined,
        }))
        .filter((it) => it.label && it.value);
      out.push({ type: "stats", items });
      continue;
    }
    if (t === "links" && Array.isArray(raw.items)) {
      const items = raw.items
        .filter(isRecord)
        .map((it) => ({
          title: asString(it.title),
          url: asString(it.url),
          subtitle: asString(it.subtitle) || undefined,
        }))
        .filter((it) => it.url);
      out.push({ type: "links", items });
      continue;
    }
    if (t === "table" && Array.isArray(raw.columns) && Array.isArray(raw.rows)) {
      const columns = raw.columns.map((c) => asString(c)).filter(Boolean);
      const rows = raw.rows
        .filter(Array.isArray)
        .map((r) => r.map((cell) => (cell === null ? "" : String(cell))));
      if (columns.length > 0 && rows.length > 0) {
        out.push({
          type: "table",
          columns,
          rows,
          caption: asString(raw.caption) || undefined,
        });
      }
      continue;
    }
  }

  return out;
}

function normalizeBlueprint(
  viewContent: Record<string, unknown>,
  msgContent: Record<string, unknown>
): BlueprintContent {
  const title = asString(viewContent.title ?? msgContent.title);
  const subtitle = asString(viewContent.subtitle ?? msgContent.subtitle);
  const blocks = normalizeBlocks(viewContent.blocks ?? msgContent.blocks);
  return {
    title: title || undefined,
    subtitle: subtitle || undefined,
    blocks,
  };
}

function toneClass(tone: string | undefined): string {
  switch (tone) {
    case "muted":
      return "text-on-surface-variant";
    case "danger":
      return "text-red-700";
    case "success":
      return "text-emerald-700";
    case "warning":
      return "text-amber-800";
    default:
      return "text-on-surface";
  }
}

export function BlueprintRenderer(props: { message: AfpMessage; view?: AfpView }) {
  const viewContent = () => (props.view?.content ?? {}) as Record<string, unknown>;
  const msgContent = () => (props.message.content ?? {}) as Record<string, unknown>;
  const blueprint = () => normalizeBlueprint(viewContent(), msgContent());

  return (
    <div class="space-y-4">
      <Show when={blueprint().title || blueprint().subtitle}>
        <header class="space-y-1">
          <Show when={blueprint().title}>
            <h3 class="text-base font-semibold tracking-tight text-on-surface">{blueprint().title}</h3>
          </Show>
          <Show when={blueprint().subtitle}>
            <p class="text-sm leading-6 text-on-surface-variant">{blueprint().subtitle}</p>
          </Show>
        </header>
      </Show>

      <Show when={blueprint().blocks && blueprint().blocks!.length > 0}>
        <div class="space-y-4">
          <For each={blueprint().blocks ?? []}>
            {(block) => (
              <Show
                when={block.type}
                fallback={
                  <div class="rounded-lg border border-white/20 bg-white/10 p-3 text-sm text-on-surface-variant">
                    Unsupported blueprint block
                  </div>
                }
              >
                <Show when={block.type === "text"}>
                  <p class={`text-sm leading-6 ${toneClass((block as any).tone)}`}>{(block as any).text}</p>
                </Show>

                <Show when={block.type === "code"}>
                  <div class="rounded-xl border border-white/20 bg-surface-container-high/70 p-3">
                    <Show when={(block as any).language}>
                      <div class="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-outline">
                        {(block as any).language}
                      </div>
                    </Show>
                    <pre class="overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-on-surface">
                      {(block as any).code}
                    </pre>
                  </div>
                </Show>

                <Show when={block.type === "stats"}>
                  <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <For each={(block as any).items ?? []}>
                      {(it: any) => (
                        <div class="rounded-xl border border-white/25 bg-white/15 p-3">
                          <div class="text-xs text-on-surface-variant">{it.label}</div>
                          <div class="mt-1 text-sm font-semibold text-on-surface">{it.value}</div>
                          <Show when={it.hint}>
                            <div class="mt-1 text-xs text-outline">{it.hint}</div>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                <Show when={block.type === "links"}>
                  <div class="flex flex-col gap-2">
                    <For each={(block as any).items ?? []}>
                      {(it: any) => (
                        <a
                          href={it.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          class="rounded-xl border border-white/25 bg-white/15 p-3 transition hover:bg-white/25"
                        >
                          <div class="text-sm font-medium text-on-surface">{it.title || it.url}</div>
                          <Show when={it.subtitle}>
                            <div class="mt-1 text-xs text-on-surface-variant">{it.subtitle}</div>
                          </Show>
                          <div class="mt-1 text-xs text-outline break-all">{it.url}</div>
                        </a>
                      )}
                    </For>
                  </div>
                </Show>

                <Show when={block.type === "table"}>
                  <div class="rounded-xl border border-white/20 bg-white/10 p-3 overflow-auto">
                    <Show when={(block as any).caption}>
                      <div class="mb-2 text-xs text-on-surface-variant">{(block as any).caption}</div>
                    </Show>
                    <table class="w-full text-left text-sm">
                      <thead class="text-xs uppercase tracking-[0.14em] text-outline">
                        <tr>
                          <For each={(block as any).columns ?? []}>
                            {(c: string) => <th class="pb-2 pr-3 font-mono">{c}</th>}
                          </For>
                        </tr>
                      </thead>
                      <tbody class="text-on-surface">
                        <For each={(block as any).rows ?? []}>
                          {(row: string[]) => (
                            <tr class="border-t border-white/10">
                              <For each={row}>
                                {(cell: string) => <td class="py-2 pr-3 align-top">{cell}</td>}
                              </For>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </Show>
              </Show>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

