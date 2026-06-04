// @locs-version: 2.0
// @module-id: ui.bento-grid
// @primary-capability: home-workspace-bento-layout
// @stability: beta
import { createMemo, createSignal, For, Show, Switch, Match } from "solid-js";
import type { DashboardBootstrap } from "@/lib/api";
import type { ViewName } from "@/components/NavBar";
import { RailIcon } from "@/components/RailIcons";
import { Tip } from "@/components/Tip";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TileConfig {
  id: string;
  viewId: ViewName;
  colSpan: 1 | 2;
  rowSpan: 1 | 2;
}

const TILE_META: Record<string, { label: string; desc: string }> = {
  search:        { label: "Chat",      desc: "AI assistant and command interface" },
  email:         { label: "Email",     desc: "Inbox and threaded conversations" },
  workflows:     { label: "Workflows", desc: "Agent blueprints and run history" },
  calendar:      { label: "Calendar",  desc: "Events and scheduled reminders" },
  note:          { label: "Notes",     desc: "Knowledge base and saved ideas" },
  threads:       { label: "Threads",   desc: "Conversation threads" },
  database:      { label: "Data",      desc: "Structured data and tables" },
  diary:         { label: "Diary",     desc: "Daily reflections and journal" },
  discover:      { label: "Discover",  desc: "Knowledge graph and connections" },
};

const ACCENT: Record<string, string> = {
  search:    "from-blue-50/80 via-indigo-50/50 to-blue-50/30 border-blue-200/40",
  email:     "from-violet-50/80 via-purple-50/50 to-violet-50/30 border-violet-200/40",
  workflows: "from-emerald-50/80 via-teal-50/50 to-emerald-50/30 border-emerald-200/40",
  calendar:  "from-[#cef264]/30 via-[#cef264]/10 to-white/30 border-[#cef264]/50",
  note:      "from-[#a8f0c6]/40 via-[#a8f0c6]/15 to-white/30 border-[#a8f0c6]/50",
  threads:   "from-amber-50/80 via-yellow-50/50 to-amber-50/30 border-amber-200/40",
  database:  "from-slate-50/80 via-gray-50/50 to-slate-50/30 border-slate-200/40",
  diary:     "from-rose-50/80 via-pink-50/50 to-rose-50/30 border-rose-200/40",
  discover:  "from-sky-50/80 via-cyan-50/50 to-sky-50/30 border-sky-200/40",
};

const DEFAULT_TILES: TileConfig[] = [
  { id: "t-chat",      viewId: "search",    colSpan: 2, rowSpan: 2 },
  { id: "t-email",     viewId: "email",     colSpan: 1, rowSpan: 1 },
  { id: "t-workflows", viewId: "workflows", colSpan: 1, rowSpan: 1 },
  { id: "t-calendar",  viewId: "calendar",  colSpan: 1, rowSpan: 1 },
  { id: "t-notes",     viewId: "note",      colSpan: 1, rowSpan: 1 },
];

const LAYOUT_KEY = "omnyid.tile.bento-v1";

function loadLayout(): TileConfig[] {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) return JSON.parse(raw) as TileConfig[];
  } catch { /* ignore */ }
  return DEFAULT_TILES;
}

function saveLayout(tiles: TileConfig[]) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(tiles));
}

// ── Compact tile content ───────────────────────────────────────────────────────

type ContentBody = { body?: string; text?: string; title?: string; subject?: string };

function msgText(m: { content: unknown }): string {
  const c = m.content as ContentBody;
  return c?.subject ?? c?.title ?? c?.body?.slice(0, 80) ?? c?.text?.slice(0, 80) ?? "—";
}

function ChatTile(props: { msgs: { type: string; content: unknown }[] }) {
  const recent = () => props.msgs.slice(0, 3);
  return (
    <div class="flex flex-col gap-2">
      <Show when={recent().length > 0} fallback={
        <p class="text-xs text-on-surface-variant/50 italic">No recent messages yet</p>
      }>
        <For each={recent()}>
          {(m) => (
            <div class="rounded-xl border border-white/50 bg-white/50 px-3 py-2">
              <p class="font-mono text-[9px] uppercase tracking-wider text-outline/50 truncate">
                {m.type.replace(/_/g, " ")}
              </p>
              <p class="mt-0.5 line-clamp-2 text-xs text-on-surface">{msgText(m)}</p>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}

function EmailTile(props: { msgs: { type: string; content: unknown }[] }) {
  return (
    <div class="flex flex-col gap-1.5">
      <p class="text-xs text-on-surface-variant">
        {props.msgs.length > 0 ? `${props.msgs.length} thread${props.msgs.length === 1 ? "" : "s"}` : "Inbox empty"}
      </p>
      <For each={props.msgs.slice(0, 2)} fallback={
        <p class="text-[11px] text-on-surface-variant/40 italic">No email messages</p>
      }>
        {(m) => (
          <p class="line-clamp-1 rounded-lg border border-white/45 bg-white/45 px-2 py-1 text-xs text-on-surface">
            {msgText(m)}
          </p>
        )}
      </For>
    </div>
  );
}

function WorkflowsTile(props: { msgs: { type: string; content: unknown }[] }) {
  return (
    <div class="flex flex-col gap-1.5">
      <p class="text-xs text-on-surface-variant">
        {props.msgs.length > 0
          ? `${props.msgs.length} workflow event${props.msgs.length === 1 ? "" : "s"}`
          : "No active runs"}
      </p>
      <For each={props.msgs.slice(0, 2)} fallback={
        <p class="text-[11px] text-on-surface-variant/40 italic">Build your first blueprint →</p>
      }>
        {(m) => (
          <p class="line-clamp-1 rounded-lg border border-white/45 bg-white/45 px-2 py-1 text-xs text-on-surface">
            {m.type.replace(/_/g, " ")}
          </p>
        )}
      </For>
    </div>
  );
}

function CalendarTile() {
  const now = new Date();
  const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return (
    <div class="flex flex-col items-center gap-2">
      <div class="w-full rounded-xl border border-white/45 bg-white/50 p-3 text-center">
        <p class="text-[10px] uppercase tracking-widest text-outline/60">{DAYS[now.getDay()]}</p>
        <p class="text-4xl font-bold text-on-surface leading-tight">{now.getDate()}</p>
        <p class="text-xs text-on-surface-variant">{MONTHS[now.getMonth()]} {now.getFullYear()}</p>
      </div>
    </div>
  );
}

function GenericTile(props: { msgs: { type: string; content: unknown }[] }) {
  return (
    <div class="flex flex-col gap-1.5">
      <For each={props.msgs.slice(0, 2)} fallback={
        <p class="text-[11px] text-on-surface-variant/40 italic">No content yet</p>
      }>
        {(m) => (
          <p class="line-clamp-2 rounded-lg border border-white/45 bg-white/45 px-2 py-1 text-xs text-on-surface">
            {msgText(m)}
          </p>
        )}
      </For>
    </div>
  );
}

// ── BentoTile ──────────────────────────────────────────────────────────────────

function BentoTile(props: {
  config: TileConfig;
  bootstrap: DashboardBootstrap | null;
  isDragging: boolean;
  isDropTarget: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onResize: (colSpan: 1 | 2, rowSpan: 1 | 2) => void;
  onDragStart: () => void;
  ref: (el: HTMLDivElement) => void;
}) {
  const meta = () => TILE_META[props.config.viewId] ?? { label: props.config.viewId, desc: "" };
  const accent = () => ACCENT[props.config.viewId] ?? "from-gray-50/80 to-white/60 border-gray-200/40";

  const msgs = createMemo(() => {
    const id = props.config.viewId;
    const all = props.bootstrap?.messages ?? [];
    if (id === "search") return all;
    if (id === "email")  return all.filter((m) => m.type.includes("email"));
    if (id === "workflows") return all.filter((m) =>
      m.type.includes("workflow") || m.type.includes("blueprint") || m.type.includes("run")
    );
    if (id === "note") return all.filter((m) => m.type.includes("note"));
    if (id === "threads") return all.filter((m) => m.type.includes("thread"));
    return all.filter((m) => m.type.includes(id));
  });

  return (
    <div
      ref={props.ref}
      class={`group/tile relative flex flex-col rounded-[22px] border bg-gradient-to-br transition-all duration-200 ${accent()} ${
        props.isDropTarget
          ? "ring-2 ring-primary/40 shadow-lg scale-[1.01]"
          : "shadow-card hover:shadow-md"
      } ${props.isDragging ? "opacity-30 scale-95" : ""}`}
      style={{
        "grid-column": `span ${props.config.colSpan}`,
        "grid-row": `span ${props.config.rowSpan}`,
        "min-height": props.config.rowSpan === 2 ? "300px" : "160px",
      }}
    >
      {/* Header — grip handle */}
      <div
        class="flex cursor-grab items-center gap-2 px-4 pt-4 pb-2 select-none active:cursor-grabbing"
        onPointerDown={(e) => {
          e.preventDefault();
          props.onDragStart();
        }}
      >
        <span class="text-on-surface/60 flex-shrink-0">
          <RailIcon id={props.config.viewId as Parameters<typeof RailIcon>[0]["id"]} />
        </span>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold text-on-surface truncate">{meta().label}</p>
        </div>
        <div class="flex items-center gap-0.5 opacity-0 transition group-hover/tile:opacity-100">
          <Tip label={props.config.colSpan === 2 ? "Make narrow (1 col)" : "Make wide (2 cols)"} side="top">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); props.onResize(props.config.colSpan === 2 ? 1 : 2, props.config.rowSpan); }}
              class="flex h-5 w-5 items-center justify-center rounded-full text-[9px] text-outline/40 hover:bg-on-surface/8 hover:text-on-surface"
              aria-label="Toggle column span"
            >
              {props.config.colSpan === 2 ? "⇥" : "↔"}
            </button>
          </Tip>
          <Tip label={props.config.rowSpan === 2 ? "Make shorter (1 row)" : "Make taller (2 rows)"} side="top">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); props.onResize(props.config.colSpan, props.config.rowSpan === 2 ? 1 : 2); }}
              class="flex h-5 w-5 items-center justify-center rounded-full text-[9px] text-outline/40 hover:bg-on-surface/8 hover:text-on-surface"
              aria-label="Toggle row span"
            >
              {props.config.rowSpan === 2 ? "⇤" : "↕"}
            </button>
          </Tip>
          <Tip label={`Remove ${meta().label} tile`} side="left">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); props.onRemove(); }}
              class="flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-outline/40 hover:bg-on-surface/8 hover:text-on-surface"
              aria-label={`Remove ${meta().label} tile`}
            >
              ×
            </button>
          </Tip>
        </div>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-hidden px-4 py-1">
        <Switch>
          <Match when={props.config.viewId === "search"}>
            <ChatTile msgs={msgs()} />
          </Match>
          <Match when={props.config.viewId === "email"}>
            <EmailTile msgs={msgs()} />
          </Match>
          <Match when={props.config.viewId === "workflows"}>
            <WorkflowsTile msgs={msgs()} />
          </Match>
          <Match when={props.config.viewId === "calendar"}>
            <CalendarTile />
          </Match>
          <Match when={true}>
            <GenericTile msgs={msgs()} />
          </Match>
        </Switch>
      </div>

      {/* Footer */}
      <div class="mt-2 border-t border-white/30 px-4 py-2.5">
        <Tip label={`Open ${meta().label} in full view`} side="top">
          <button
            type="button"
            onClick={props.onOpen}
            class="text-[11px] font-medium text-primary/70 transition hover:text-primary"
          >
            Open {meta().label} →
          </button>
        </Tip>
      </div>
    </div>
  );
}

// ── Widget tray ────────────────────────────────────────────────────────────────

function WidgetTray(props: {
  activeTiles: TileConfig[];
  onAdd: (viewId: ViewName) => void;
  onClose: () => void;
}) {
  const available = createMemo(() =>
    (Object.keys(TILE_META) as ViewName[]).filter(
      (v) => !props.activeTiles.some((t) => t.viewId === v)
    )
  );

  return (
    <>
      <div class="fixed inset-0 z-40" onClick={props.onClose} />
      <div class="absolute right-0 top-full z-50 mt-2 min-w-[200px] animate-fade-in rounded-2xl border border-white/45 bg-white/96 p-3 shadow-panel backdrop-blur-xl">
        <p class="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-outline">Add tile</p>
        <Show when={available().length === 0}>
          <p class="text-xs text-on-surface-variant/60">All views already pinned</p>
        </Show>
        <For each={available()}>
          {(viewId) => {
            const meta = TILE_META[viewId];
            return (
              <button
                type="button"
                onClick={() => { props.onAdd(viewId); props.onClose(); }}
                class="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-xs transition hover:bg-on-surface/6"
              >
                <span class="text-outline/70 flex-shrink-0">
                  <RailIcon id={viewId as Parameters<typeof RailIcon>[0]["id"]} />
                </span>
                <div>
                  <p class="font-medium text-on-surface">{meta.label}</p>
                  <p class="text-[10px] text-on-surface-variant/60">{meta.desc}</p>
                </div>
              </button>
            );
          }}
        </For>
      </div>
    </>
  );
}

// ── BentoGrid (main export) ────────────────────────────────────────────────────

export function BentoGrid(props: {
  bootstrap: DashboardBootstrap | null;
  onOpenView: (view: ViewName) => void;
}) {
  const [tiles, setTiles] = createSignal<TileConfig[]>(loadLayout());
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  const [dropTargetId, setDropTargetId] = createSignal<string | null>(null);
  const [showTray, setShowTray] = createSignal(false);
  const tileRefs = new Map<string, HTMLDivElement>();

  function startDrag(tileId: string) {
    setDraggingId(tileId);

    let rafId = 0;

    function onMove(e: PointerEvent) {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        let hit: string | null = null;
        for (const [id, el] of tileRefs) {
          if (id === tileId) continue;
          const r = el.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            hit = id;
            break;
          }
        }
        setDropTargetId(hit);
      });
    }

    function onUp() {
      cancelAnimationFrame(rafId);
      const to = dropTargetId();
      if (to) {
        setTiles((prev) => {
          const arr = [...prev];
          const fi = arr.findIndex((t) => t.id === tileId);
          const ti = arr.findIndex((t) => t.id === to);
          if (fi !== -1 && ti !== -1) [arr[fi], arr[ti]] = [arr[ti], arr[fi]];
          saveLayout(arr);
          return arr;
        });
      }
      setDraggingId(null);
      setDropTargetId(null);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  function addTile(viewId: ViewName) {
    const id = `t-${viewId}-${Date.now()}`;
    setTiles((prev) => {
      const next = [...prev, { id, viewId, colSpan: 1, rowSpan: 1 } as TileConfig];
      saveLayout(next);
      return next;
    });
  }

  function removeTile(tileId: string) {
    setTiles((prev) => {
      const next = prev.filter((t) => t.id !== tileId);
      saveLayout(next);
      return next;
    });
  }

  function resizeTile(tileId: string, colSpan: 1 | 2, rowSpan: 1 | 2) {
    setTiles((prev) => {
      const next = prev.map((t) => t.id === tileId ? { ...t, colSpan, rowSpan } : t);
      saveLayout(next);
      return next;
    });
  }

  return (
    <div class="flex flex-col gap-4">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h1 class="heading-tight text-xl font-bold text-on-surface">Workspace</h1>
          <p class="mt-0.5 text-xs text-on-surface-variant/60">Drag tiles to reorder · click to open full view</p>
        </div>
        <div class="relative">
          <Tip label="Add a new tile to your workspace" side="left">
            <button
              type="button"
              onClick={() => setShowTray((v) => !v)}
              class="glass-button flex h-9 w-9 items-center justify-center rounded-2xl border border-white/40 bg-white/60 text-lg font-light text-on-surface-variant shadow-card hover:bg-white/80 hover:text-on-surface"
              aria-label="Add tile"
            >
              +
            </button>
          </Tip>
          <Show when={showTray()}>
            <WidgetTray
              activeTiles={tiles()}
              onAdd={addTile}
              onClose={() => setShowTray(false)}
            />
          </Show>
        </div>
      </div>

      {/* Grid */}
      <div
        class="grid gap-4"
        style={{ "grid-template-columns": "repeat(4, minmax(0, 1fr))" }}
      >
        <For each={tiles()}>
          {(tile) => (
            <BentoTile
              config={tile}
              bootstrap={props.bootstrap}
              isDragging={draggingId() === tile.id}
              isDropTarget={dropTargetId() === tile.id}
              onOpen={() => props.onOpenView(tile.viewId)}
              onRemove={() => removeTile(tile.id)}
              onResize={(col, row) => resizeTile(tile.id, col, row)}
              onDragStart={() => startDrag(tile.id)}
              ref={(el) => tileRefs.set(tile.id, el)}
            />
          )}
        </For>
      </div>

      <Show when={tiles().length === 0}>
        <div class="flex flex-col items-center gap-3 py-16 text-center">
          <p class="text-2xl">⊞</p>
          <p class="text-sm font-medium text-on-surface">Your workspace is empty</p>
          <p class="text-xs text-on-surface-variant/60">Click + to add views as tiles</p>
        </div>
      </Show>
    </div>
  );
}
