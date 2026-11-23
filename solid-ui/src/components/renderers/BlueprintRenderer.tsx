import { createMemo, For, Show } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";
import { safeHref } from "@/lib/api";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";

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

type BlueprintTextTone = "default" | "muted" | "danger" | "success" | "warning";

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeBlocks(value: unknown): BlueprintBlock[] {
  if (!Array.isArray(value)) return [];

  const blocks: BlueprintBlock[] = [];
  for (const rawBlock of value) {
    if (!isRecord(rawBlock)) continue;
    const blockType = asString(rawBlock.type);

    if (blockType === "text") {
      blocks.push({
        type: "text",
        text: asString(rawBlock.text),
        tone: (asString(rawBlock.tone) as BlueprintTextTone) || "default",
      });
      continue;
    }

    if (blockType === "code") {
      blocks.push({
        type: "code",
        code: asString(rawBlock.code),
        language: asString(rawBlock.language) || undefined,
      });
      continue;
    }

    if (blockType === "stats" && Array.isArray(rawBlock.items)) {
      const items = rawBlock.items
        .filter(isRecord)
        .map((item) => ({
          label: asString(item.label),
          value: asString(item.value),
          hint: asString(item.hint) || undefined,
        }))
        .filter((item) => item.label && item.value);
      blocks.push({ type: "stats", items });
      continue;
    }

    if (blockType === "links" && Array.isArray(rawBlock.items)) {
      const items = rawBlock.items
        .filter(isRecord)
        .map((item) => ({
          title: asString(item.title),
          url: asString(item.url),
          subtitle: asString(item.subtitle) || undefined,
        }))
        .filter((item) => item.url);
      blocks.push({ type: "links", items });
      continue;
    }

    if (blockType === "table" && Array.isArray(rawBlock.columns) && Array.isArray(rawBlock.rows)) {
      const columns = rawBlock.columns.map((column) => asString(column)).filter(Boolean);
      const rows = rawBlock.rows
        .filter(Array.isArray)
        .map((row) => row.map((cell) => (cell === null ? "" : String(cell))));
      if (columns.length > 0 && rows.length > 0) {
        blocks.push({
          type: "table",
          columns,
          rows,
          caption: asString(rawBlock.caption) || undefined,
        });
      }
    }
  }

  return blocks;
}

function normalizeBlueprint(
  viewContent: Record<string, unknown>,
  messageContent: Record<string, unknown>,
): BlueprintContent {
  const title = asString(viewContent.title ?? messageContent.title);
  const subtitle = asString(viewContent.subtitle ?? messageContent.subtitle);
  const blocks = normalizeBlocks(viewContent.blocks ?? messageContent.blocks);
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
  const rendererState = createMemo(() => {
    const viewContent = afpRecord(props.message.encryption ? undefined : props.view?.content);
    const messageContent = afpRecord(decryptedDisplayContent(props.message));
    const blueprint = normalizeBlueprint(viewContent, messageContent);
    return {
      blueprint,
      showHeader: Boolean(blueprint.title || blueprint.subtitle),
      showBlocks: Boolean(blueprint.blocks && blueprint.blocks.length > 0),
      blocks: blueprint.blocks ?? [],
    };
  });

  return (
    <div class="space-y-4">
      <Show when={rendererState().showHeader}>
        <header class="space-y-1">
          <Show when={rendererState().blueprint.title}>
            <h3 class="text-base font-semibold tracking-tight text-on-surface">
              {rendererState().blueprint.title}
            </h3>
          </Show>
          <Show when={rendererState().blueprint.subtitle}>
            <p class="text-sm leading-6 text-on-surface-variant">
              {rendererState().blueprint.subtitle}
            </p>
          </Show>
        </header>
      </Show>

      <Show when={rendererState().showBlocks}>
        <div class="space-y-4">
          <For each={rendererState().blocks}>
            {(block) => {
              const blockState = createMemo(() => ({
                block,
                showText: block.type === "text",
                showCode: block.type === "code",
                showStats: block.type === "stats",
                showLinks: block.type === "links",
                showTable: block.type === "table",
                textToneClass:
                  block.type === "text"
                    ? toneClass((block as Extract<BlueprintBlock, { type: "text" }>).tone)
                    : "",
                showCaption: block.type === "table" && Boolean(block.caption),
              }));

              return (
                <Show
                  when={
                    blockState().showText
                    || blockState().showCode
                    || blockState().showStats
                    || blockState().showLinks
                    || blockState().showTable
                  }
                  fallback={
                    <div class="rounded-lg border border-white/20 bg-white/10 p-3 text-sm text-on-surface-variant">
                      Unsupported blueprint block
                    </div>
                  }
                >
                  <Show when={blockState().showText}>
                    <p class={`text-sm leading-6 ${blockState().textToneClass}`}>
                      {(block as Extract<BlueprintBlock, { type: "text" }>).text}
                    </p>
                  </Show>

                  <Show when={blockState().showCode}>
                    <div class="rounded-xl border border-white/20 bg-surface-container-high/70 p-3">
                      <Show when={(block as Extract<BlueprintBlock, { type: "code" }>).language}>
                        <div class="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-outline">
                          {(block as Extract<BlueprintBlock, { type: "code" }>).language}
                        </div>
                      </Show>
                      <pre class="overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-on-surface">
                        {(block as Extract<BlueprintBlock, { type: "code" }>).code}
                      </pre>
                    </div>
                  </Show>

                  <Show when={blockState().showStats}>
                    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <For each={(block as Extract<BlueprintBlock, { type: "stats" }>).items}>
                        {(item) => (
                          <div class="rounded-xl border border-white/25 bg-white/15 p-3">
                            <div class="text-xs text-on-surface-variant">{item.label}</div>
                            <div class="mt-1 text-sm font-semibold text-on-surface">{item.value}</div>
                            <Show when={item.hint}>
                              <div class="mt-1 text-xs text-outline">{item.hint}</div>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>

                  <Show when={blockState().showLinks}>
                    <div class="flex flex-col gap-2">
                      <For each={(block as Extract<BlueprintBlock, { type: "links" }>).items}>
                        {(item) => (
                          <a
                            href={safeHref(item.url)}
                            target="_blank"
                            rel="noreferrer noopener"
                            class="rounded-xl border border-white/25 bg-white/15 p-3 transition hover:bg-white/25"
                          >
                            <div class="text-sm font-medium text-on-surface">{item.title || item.url}</div>
                            <Show when={item.subtitle}>
                              <div class="mt-1 text-xs text-on-surface-variant">{item.subtitle}</div>
                            </Show>
                            <div class="mt-1 break-all text-xs text-outline">{item.url}</div>
                          </a>
                        )}
                      </For>
                    </div>
                  </Show>

                  <Show when={blockState().showTable}>
                    <div class="overflow-auto rounded-xl border border-white/20 bg-white/10 p-3">
                      <Show when={blockState().showCaption}>
                        <div class="mb-2 text-xs text-on-surface-variant">
                          {(block as Extract<BlueprintBlock, { type: "table" }>).caption}
                        </div>
                      </Show>
                      <table class="w-full text-left text-sm">
                        <thead class="text-xs uppercase tracking-[0.14em] text-outline">
                          <tr>
                            <For each={(block as Extract<BlueprintBlock, { type: "table" }>).columns}>
                              {(column) => <th class="pb-2 pr-3 font-mono">{column}</th>}
                            </For>
                          </tr>
                        </thead>
                        <tbody class="text-on-surface">
                          <For each={(block as Extract<BlueprintBlock, { type: "table" }>).rows}>
                            {(row) => (
                              <tr class="border-t border-white/10">
                                <For each={row}>
                                  {(cell) => <td class="py-2 pr-3 align-top">{String(cell)}</td>}
                                </For>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    </div>
                  </Show>
                </Show>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
