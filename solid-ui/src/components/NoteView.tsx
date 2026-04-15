/**
 * NoteView — full Note View implementation for OmnyID.
 *
 * Phases implemented:
 *   Phase 0  — Design tokens applied throughout (em units, brand palette, ss01 typography)
 *   Phase 1  — Note data model types (NoteBlock, Note, BacklinkRef, etc.)
 *   Phase 2  — Layout shell: top bar (3.5em), left sidebar (15em ↔ 4em), right panel (20em)
 *   Phase 3  — List view (4.5em cards), grid view (17.5em × 11.25em cards), selection states
 *   Phase 4  — New Note popover with voice / camera / handwriting / text quick actions
 *   Phase 5  — Instant search across title, tags, summary; "Ask your notes" mode
 *   Phase 6  — Knowledge graph using D3 force simulation (click-through to note)
 *   Phase 7  — AI Actions panel: Summarize, Extract Action Items, Create Mind Map, Elaborate
 *   Phase 8  — OCR ingestion UI stub (PaddleOCR queue indicator, confidence badge)
 *   Phase 9  — three.js 3D block type stub (lazy-loaded viewer with fallback)
 *   Phase 10 — min 2.75em touch targets, 4.5:1 contrast, full keyboard nav, responsive collapse
 *
 * Responsive breakpoints:
 *   < 64em  (≈1024px) — left sidebar collapses to icon rail
 *   < 40em  (≈640px)  — single-column stack; right panel becomes bottom sheet
 *
 * All sizing uses "em" so the layout scales correctly with the user's font-size preference.
 * The only exceptions are border widths (1px, 2px) and the 4px accent bar (0.25em).
 *
 * Libraries:
 *   D3 v7  (ISC) — graph view force simulation
 *   three  (MIT) — 3D block rendering (lazy)
 */

import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import * as d3 from "d3";
import {
  sendNoteMessage,
  type AfpMessage,
  type FolderRulePayload,
  type AreaRulesPayload,
} from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Data model
// ─────────────────────────────────────────────────────────────────────────────

export type NoteBlockType =
  | "paragraph"
  | "heading"
  | "image"
  | "ocr"
  | "3d";

export interface NoteBlock {
  type: NoteBlockType;
  text?: string;
  url?: string;
  ocrText?: string;
  ocrConfidence?: number; // 0–1
  modelUrl?: string;      // for 3d blocks
}

export interface BacklinkRef {
  targetId: string;
  targetTitle: string;
  relation: string;
}

export interface Note {
  id: string;
  title: string;
  preview: string;          // first 2 lines / summary
  blocks: NoteBlock[];
  summary: string;
  tags: string[];
  supertags: string[];
  backlinks: BacklinkRef[];
  updatedAt: string;        // ISO string
  createdAt: string;
  folderId?: string;
  areaId?: string;
  metadata: {
    hasVoice?: boolean;
    hasImage?: boolean;
    hasOcr?: boolean;
    has3d?: boolean;
  };
}

/** A named folder in the sidebar. */
export interface Folder {
  id: string;
  name: string;
  /** Area this folder belongs to, if any. */
  areaId?: string;
  /** Latest folder_rule AFP message content, if set. */
  rule?: FolderRulePayload;
}

/** An area grouping that can span multiple folders. */
export interface Area {
  id: string;
  /** Latest area_rules AFP message content. */
  rules: AreaRulesPayload;
}

/** A tag_update AFP message content, used by the client-side resolver. */
interface TagUpdateMsg {
  /** AFP message id of the tag_update. */
  updateId: string;
  /** AFP message id of the original note being updated. */
  sourceId: string;
  timestamp: string;
  removeTags: string[];
  addTags: string[];
  removeSupertags: string[];
  addSupertags: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed demo data so the view is never empty
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_NOTES: Note[] = [
  {
    id: "n1",
    title: "Project kickoff — OmnyID Notes",
    preview: "Define the scope and key milestones for the notes feature launch. Include timeline, owners, and success metrics.",
    blocks: [
      { type: "heading", text: "Scope" },
      { type: "paragraph", text: "Define the scope and key milestones for the notes feature launch." },
      { type: "paragraph", text: "Include timeline, owners, and success metrics." },
    ],
    summary: "Kickoff notes covering scope, milestones, team ownership and launch criteria.",
    tags: ["project", "planning"],
    supertags: ["Work"],
    backlinks: [{ targetId: "n3", targetTitle: "Knowledge graph design", relation: "references" }],
    updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
    createdAt: new Date(Date.now() - 86_400_000 * 3).toISOString(),
    metadata: {},
  },
  {
    id: "n2",
    title: "Brand token decisions",
    preview: "Sunset orange (#FF6B35) is the sole accent color. All spacing is base-8. Typography uses Inter with ss01.",
    blocks: [
      { type: "paragraph", text: "Sunset orange (#FF6B35) is the sole accent color." },
      { type: "paragraph", text: "All spacing is base-8. Typography uses Inter with ss01." },
    ],
    summary: "Design token decisions: color palette, spacing scale, radii, and motion curve.",
    tags: ["design", "tokens"],
    supertags: ["Design"],
    backlinks: [],
    updatedAt: new Date(Date.now() - 7_200_000).toISOString(),
    createdAt: new Date(Date.now() - 86_400_000 * 2).toISOString(),
    metadata: {},
  },
  {
    id: "n3",
    title: "Knowledge graph design",
    preview: "Directed edge model for backlinks. Merge candidates identified by semantic similarity via pgvector cosine distance.",
    blocks: [
      { type: "paragraph", text: "Directed edge model for backlinks." },
      { type: "paragraph", text: "Merge candidates identified by semantic similarity via pgvector." },
    ],
    summary: "Graph model: directed edges, edge types, and merge candidate detection.",
    tags: ["graph", "ai"],
    supertags: ["Engineering"],
    backlinks: [{ targetId: "n1", targetTitle: "Project kickoff — OmnyID Notes", relation: "implements" }],
    updatedAt: new Date(Date.now() - 1_800_000).toISOString(),
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    metadata: {},
  },
  {
    id: "n4",
    title: "Meeting notes — Apr 2026",
    preview: "Discussed OCR pipeline integration with PaddleOCR. Action: prototype image ingestion endpoint by end of sprint.",
    blocks: [
      { type: "paragraph", text: "Discussed OCR pipeline integration with PaddleOCR." },
      { type: "paragraph", text: "Action: prototype image ingestion endpoint by end of sprint." },
    ],
    summary: "Sprint planning meeting: OCR pipeline, API contracts, and sprint commitments.",
    tags: ["meeting", "ocr"],
    supertags: ["Work"],
    backlinks: [],
    updatedAt: new Date(Date.now() - 300_000).toISOString(),
    createdAt: new Date(Date.now() - 600_000).toISOString(),
    metadata: { hasOcr: true },
  },
  {
    id: "n5",
    title: "Accessibility checklist",
    preview: "All touch targets ≥ 2.75em. Contrast ratio ≥ 4.5:1 everywhere. Full keyboard navigation required.",
    blocks: [
      { type: "paragraph", text: "All touch targets ≥ 2.75em." },
      { type: "paragraph", text: "Contrast ratio ≥ 4.5:1 everywhere. Full keyboard navigation required." },
    ],
    summary: "Accessibility requirements: touch targets, contrast ratios, and keyboard nav.",
    tags: ["accessibility", "qa"],
    supertags: ["Design"],
    backlinks: [{ targetId: "n2", targetTitle: "Brand token decisions", relation: "validates" }],
    updatedAt: new Date(Date.now() - 14_400_000).toISOString(),
    createdAt: new Date(Date.now() - 86_400_000 * 4).toISOString(),
    metadata: {},
  },
  {
    id: "n6",
    title: "3D asset pipeline research",
    preview: "three.js r183 supports WebGL2 and WebGPU. DRACO compression reduces model size by ~80%.",
    blocks: [
      { type: "paragraph", text: "three.js r183 supports WebGL2 and WebGPU." },
      { type: "paragraph", text: "DRACO compression reduces model size by ~80%." },
      { type: "3d", modelUrl: "" },
    ],
    summary: "Research on 3D asset rendering with three.js for embedded note blocks.",
    tags: ["3d", "threejs", "research"],
    supertags: ["Engineering"],
    backlinks: [],
    updatedAt: new Date(Date.now() - 28_800_000).toISOString(),
    createdAt: new Date(Date.now() - 86_400_000 * 5).toISOString(),
    metadata: { has3d: true },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Shared style constants (em-based)
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN = {
  accent: "#FF6B35",
  bg: "#F8F5F0",
  surface: "#FFFFFF",
  text: "#1C1C1C",
  textSecondary: "#666666",
  border: "#E5E0D8",
  topBarH: "3.5em",        // 56px
  sidebarW: "15em",        // 240px
  sidebarCollapsed: "4em", // 64px
  rightPanelW: "20em",     // 320px
  searchMaxW: "30em",      // 480px
  searchH: "2.5em",        // 40px
  cardH: "4.5em",          // 72px list card
  gridW: "17.5em",         // 280px
  gridH: "11.25em",        // 180px
  radius: {
    card: "0.75em",        // 12px list card
    gridCard: "1em",       // 16px grid card
    searchBar: "9999px",
    button: "0.5em",
  },
  padding: {
    main: "2em",           // 32px
    sidebar: "1.5em",      // 24px
    card: "1em",           // 16px
    gridCard: "1.25em",    // 20px
  },
  gap: {
    card: "0.75em",        // 12px
    section: "1.5em",      // 24px
  },
  transition: "120ms cubic-bezier(0.4, 0, 0.2, 1)",
  touchTarget: "2.75em",  // 44px
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Top Bar
// ─────────────────────────────────────────────────────────────────────────────

function NoteTopBar(props: {
  query: string;
  onQuery: (q: string) => void;
  viewMode: "list" | "grid" | "graph";
  onViewMode: (v: "list" | "grid" | "graph") => void;
  onNewNote: (kind: "text" | "voice" | "camera" | "handwriting") => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  const [showNewMenu, setShowNewMenu] = createSignal(false);

  return (
    <header
      style={{
        height: TOKEN.topBarH,
        "background": TOKEN.surface,
        "border-bottom": `1px solid ${TOKEN.border}`,
        display: "flex",
        "align-items": "center",
        "padding": `0 ${TOKEN.padding.main}`,
        gap: "1em",
        "flex-shrink": "0",
        "font-feature-settings": '"ss01"',
      }}
    >
      {/* Sidebar toggle */}
      <button
        aria-label={props.sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        onClick={props.onToggleSidebar}
        style={{
          "min-width": TOKEN.touchTarget,
          "min-height": TOKEN.touchTarget,
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          "border-radius": TOKEN.radius.button,
          color: TOKEN.textSecondary,
          transition: TOKEN.transition,
          "flex-shrink": "0",
        }}
        onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = `2px solid ${TOKEN.accent}`; }}
        onBlur={(e) => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
      >
        <svg width="1.125em" height="1.125em" viewBox="0 0 18 18" fill="none" aria-hidden>
          <rect x="2" y="4" width="14" height="1.5" rx="0.75" fill="currentColor" />
          <rect x="2" y="8.25" width="14" height="1.5" rx="0.75" fill="currentColor" />
          <rect x="2" y="12.5" width="14" height="1.5" rx="0.75" fill="currentColor" />
        </svg>
      </button>

      {/* Search bar — Phase 5 */}
      <div style={{ flex: 1, display: "flex", "justify-content": "center" }}>
        <label
          style={{
            display: "flex",
            "align-items": "center",
            gap: "0.5em",
            "max-width": TOKEN.searchMaxW,
            width: "100%",
            height: TOKEN.searchH,
            background: TOKEN.bg,
            border: `1px solid ${TOKEN.border}`,
            "border-radius": TOKEN.radius.searchBar,
            padding: "0 1em",
            transition: TOKEN.transition,
          }}
        >
          <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="6.5" cy="6.5" r="4.5" stroke={TOKEN.textSecondary} stroke-width="1.5" />
            <path d="M10.5 10.5 14 14" stroke={TOKEN.textSecondary} stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Search notes, tags, OCR text…"
            value={props.query}
            onInput={(e) => props.onQuery(e.currentTarget.value)}
            style={{
              border: "none",
              background: "transparent",
              outline: "none",
              flex: 1,
              "font-size": "0.9375em",
              color: TOKEN.text,
              "font-family": "Inter, system-ui, sans-serif",
              "font-feature-settings": '"ss01"',
            }}
            aria-label="Search notes"
          />
        </label>
      </div>

      {/* View toggle — list / grid / graph */}
      <div
        role="group"
        aria-label="View mode"
        style={{
          display: "flex",
          "align-items": "center",
          gap: "0.25em",
          background: TOKEN.bg,
          border: `1px solid ${TOKEN.border}`,
          "border-radius": "0.625em",
          padding: "0.25em",
          "flex-shrink": "0",
        }}
      >
        {(["list", "grid", "graph"] as const).map((mode) => {
          const icons: Record<string, string> = {
            list: "M3 5h10M3 8h10M3 11h10",
            grid: "M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z",
            graph: "M8 8m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M3 4a1 1 0 1 0 2 0 1 1 0 0 0-2 0M11 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0M4 4.5l3.5 3M8.5 9l3 3",
          };
          return (
            <button
              role="radio"
              aria-checked={props.viewMode === mode}
              aria-label={`${mode} view`}
              onClick={() => props.onViewMode(mode)}
              style={{
                "min-width": "2.25em",
                "min-height": "2.25em",
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                border: "none",
                "border-radius": "0.375em",
                cursor: "pointer",
                transition: TOKEN.transition,
                background: props.viewMode === mode ? TOKEN.accent : "transparent",
                color: props.viewMode === mode ? "#fff" : TOKEN.textSecondary,
              }}
              onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = `2px solid ${TOKEN.accent}`; }}
              onBlur={(e) => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
            >
              <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
                <path d={icons[mode]} />
              </svg>
            </button>
          );
        })}
      </div>

      {/* New Note button + popover — Phase 4 */}
      <div style={{ position: "relative", "flex-shrink": "0" }}>
        <button
          aria-label="New note"
          aria-haspopup="true"
          aria-expanded={showNewMenu()}
          onClick={() => setShowNewMenu((v) => !v)}
          style={{
            "min-height": TOKEN.touchTarget,
            padding: "0 1.125em",
            background: TOKEN.accent,
            color: "#fff",
            border: "none",
            "border-radius": "0.625em",
            cursor: "pointer",
            "font-size": "0.9375em",
            "font-weight": "600",
            "font-family": "Inter, system-ui, sans-serif",
            "font-feature-settings": '"ss01"',
            transition: TOKEN.transition,
            display: "flex",
            "align-items": "center",
            gap: "0.4em",
          }}
          onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = `2px solid ${TOKEN.accent}`; (e.currentTarget as HTMLElement).style.outlineOffset = "2px"; }}
          onBlur={(e) => { (e.currentTarget as HTMLElement).style.outline = "none"; setTimeout(() => setShowNewMenu(false), 150); }}
        >
          <span aria-hidden style={{ "font-size": "1.1em", "line-height": 1 }}>+</span>
          New Note
        </button>

        <Show when={showNewMenu()}>
          <div
            role="menu"
            style={{
              position: "absolute",
              top: "calc(100% + 0.5em)",
              right: 0,
              background: TOKEN.surface,
              border: `1px solid ${TOKEN.border}`,
              "border-radius": "0.75em",
              "box-shadow": "0 0.5em 2em rgba(28,28,28,0.12)",
              padding: "0.375em",
              "min-width": "11em",
              "z-index": 50,
            }}
          >
            {(
              [
                { kind: "text" as const, label: "Text note", icon: "T" },
                { kind: "voice" as const, label: "Voice note", icon: "♪" },
                { kind: "camera" as const, label: "Camera / OCR", icon: "□" },
                { kind: "handwriting" as const, label: "Handwriting", icon: "✎" },
              ] as { kind: "text" | "voice" | "camera" | "handwriting"; label: string; icon: string }[]
            ).map((item) => (
              <button
                role="menuitem"
                onClick={() => { setShowNewMenu(false); props.onNewNote(item.kind); }}
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "0.75em",
                  width: "100%",
                  padding: "0.625em 0.875em",
                  border: "none",
                  background: "transparent",
                  "border-radius": "0.5em",
                  cursor: "pointer",
                  "font-size": "0.9375em",
                  color: TOKEN.text,
                  "font-family": "Inter, system-ui, sans-serif",
                  transition: TOKEN.transition,
                  "text-align": "left",
                  "min-height": TOKEN.touchTarget,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = TOKEN.bg; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span aria-hidden style={{ color: TOKEN.accent, "font-weight": "600", width: "1em", "text-align": "center" }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </Show>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Left Sidebar
// ─────────────────────────────────────────────────────────────────────────────

function NoteLeftSidebar(props: {
  open: boolean;
  activeFilter: string;
  onFilter: (f: string) => void;
  allTags: string[];
  allSupertags: string[];
  folders: Folder[];
  areas: Area[];
  onSetFolderRule: (folder: Folder) => void;
  onSetAreaRule: (area?: Area) => void;
}) {
  const [folderCtx, setFolderCtx] = createSignal<Folder | null>(null);

  const navItems = [
    { id: "all", label: "All Notes", icon: "≡" },
    { id: "ai-groups", label: "AI Groups", icon: "✦" },
  ];

  return (
    <aside
      aria-label="Note navigation"
      style={{
        width: props.open ? TOKEN.sidebarW : TOKEN.sidebarCollapsed,
        "min-width": props.open ? TOKEN.sidebarW : TOKEN.sidebarCollapsed,
        "border-right": `1px solid ${TOKEN.border}`,
        background: TOKEN.surface,
        display: "flex",
        "flex-direction": "column",
        "overflow": "hidden",
        transition: `width ${TOKEN.transition}, min-width ${TOKEN.transition}`,
        "flex-shrink": "0",
        "padding-top": "1em",
        "padding-bottom": TOKEN.padding.sidebar,
      }}
    >
      <nav style={{ display: "flex", "flex-direction": "column", gap: "0.125em", padding: "0 0.5em" }}>
        <For each={navItems}>
          {(item) => {
            const isActive = () => props.activeFilter === item.id;
            return (
              <button
                aria-current={isActive() ? "page" : undefined}
                onClick={() => props.onFilter(item.id)}
                title={props.open ? undefined : item.label}
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "0.75em",
                  "min-height": TOKEN.touchTarget,
                  padding: `0 0.75em`,
                  "border-radius": "0.625em",
                  border: "none",
                  cursor: "pointer",
                  transition: TOKEN.transition,
                  background: isActive() ? `rgba(255,107,53,0.1)` : "transparent",
                  color: isActive() ? TOKEN.accent : TOKEN.text,
                  "font-weight": isActive() ? "600" : "400",
                  "font-size": "0.9375em",
                  "font-family": "Inter, system-ui, sans-serif",
                  "font-feature-settings": '"ss01"',
                  "text-align": "left",
                  overflow: "hidden",
                  "white-space": "nowrap",
                }}
                onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = `2px solid ${TOKEN.accent}`; }}
                onBlur={(e) => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
              >
                <span aria-hidden style={{ width: "0.25em", height: "1.125em", "border-radius": "9999px", background: isActive() ? TOKEN.accent : "transparent", "flex-shrink": "0", transition: TOKEN.transition }} />
                <span aria-hidden style={{ "font-size": "1em", "flex-shrink": "0", "text-align": "center", width: "1em" }}>{item.icon}</span>
                <Show when={props.open}><span style={{ overflow: "hidden", "text-overflow": "ellipsis" }}>{item.label}</span></Show>
              </button>
            );
          }}
        </For>
      </nav>

      {/* Tag list */}
      <Show when={props.open && props.allTags.length > 0}>
        <div style={{ padding: `${TOKEN.gap.section} ${TOKEN.padding.sidebar} 0` }}>
          <p style={{ "font-size": "0.6875em", "font-weight": "600", "letter-spacing": "0.1em", "text-transform": "uppercase", color: TOKEN.textSecondary, margin: "0 0 0.5em" }}>Tags</p>
          <div style={{ display: "flex", "flex-wrap": "wrap", gap: "0.375em" }}>
            <For each={props.allTags.slice(0, 12)}>
              {(tag) => (
                <button
                  onClick={() => props.onFilter(`tag:${tag}`)}
                  style={{ padding: "0.25em 0.625em", background: props.activeFilter === `tag:${tag}` ? TOKEN.accent : TOKEN.bg, color: props.activeFilter === `tag:${tag}` ? "#fff" : TOKEN.textSecondary, border: `1px solid ${TOKEN.border}`, "border-radius": "9999px", "font-size": "0.8125em", cursor: "pointer", transition: TOKEN.transition, "font-family": "Inter, system-ui, sans-serif", "min-height": TOKEN.touchTarget, display: "flex", "align-items": "center" }}
                  onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = `2px solid ${TOKEN.accent}`; }}
                  onBlur={(e) => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
                >#{tag}</button>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Folders */}
      <Show when={props.open}>
        <div style={{ padding: `${TOKEN.gap.section} ${TOKEN.padding.sidebar} 0` }}>
          <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", "margin-bottom": "0.5em" }}>
            <p style={{ "font-size": "0.6875em", "font-weight": "600", "letter-spacing": "0.1em", "text-transform": "uppercase", color: TOKEN.textSecondary, margin: 0 }}>Folders</p>
          </div>
          <div style={{ display: "flex", "flex-direction": "column", gap: "0.125em" }}>
            <For each={props.folders} fallback={
              <p style={{ "font-size": "0.8125em", color: TOKEN.textSecondary, margin: 0 }}>No folders yet</p>
            }>
              {(folder) => {
                const isActive = () => props.activeFilter === `folder:${folder.id}`;
                return (
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => props.onFilter(`folder:${folder.id}`)}
                      onContextMenu={(e) => { e.preventDefault(); setFolderCtx(folder); }}
                      style={{ display: "flex", "align-items": "center", gap: "0.5em", width: "100%", "min-height": TOKEN.touchTarget, padding: "0 0.625em", "border-radius": "0.5em", border: "none", cursor: "pointer", background: isActive() ? `rgba(255,107,53,0.1)` : "transparent", color: isActive() ? TOKEN.accent : TOKEN.text, "font-size": "0.9375em", "font-family": "Inter, system-ui, sans-serif", transition: TOKEN.transition, "text-align": "left" }}
                    >
                      <span aria-hidden>📁</span>
                      <span style={{ flex: 1, overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>{folder.name}</span>
                      <Show when={folder.rule}>
                        <span title="Has folder rules" style={{ "font-size": "0.625em", background: TOKEN.accent, color: "#fff", "border-radius": "9999px", padding: "0.15em 0.4em", "font-weight": "700" }}>R</span>
                      </Show>
                    </button>
                    {/* Context menu */}
                    <Show when={folderCtx()?.id === folder.id}>
                      <div
                        style={{ position: "absolute", left: "100%", top: 0, background: TOKEN.surface, border: `1px solid ${TOKEN.border}`, "border-radius": "0.625em", "box-shadow": "0 0.5em 1.5em rgba(28,28,28,0.12)", padding: "0.375em", "min-width": "10em", "z-index": 100 }}
                        onMouseLeave={() => setFolderCtx(null)}
                      >
                        <button
                          onClick={() => { setFolderCtx(null); props.onSetFolderRule(folder); }}
                          style={{ display: "flex", "align-items": "center", gap: "0.5em", width: "100%", padding: "0.5em 0.75em", border: "none", background: "transparent", "border-radius": "0.375em", cursor: "pointer", "font-size": "0.875em", color: TOKEN.text, "font-family": "Inter, system-ui, sans-serif", "min-height": TOKEN.touchTarget }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = TOKEN.bg; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        >Set Folder Rules</button>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </Show>

      {/* Areas */}
      <Show when={props.open}>
        <div style={{ padding: `${TOKEN.gap.section} ${TOKEN.padding.sidebar} ${TOKEN.padding.sidebar}` }}>
          <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", "margin-bottom": "0.5em" }}>
            <p style={{ "font-size": "0.6875em", "font-weight": "600", "letter-spacing": "0.1em", "text-transform": "uppercase", color: TOKEN.textSecondary, margin: 0 }}>Areas</p>
            <button
              title="Create area rule"
              onClick={() => props.onSetAreaRule(undefined)}
              style={{ width: "1.5em", height: "1.5em", border: "none", background: "transparent", cursor: "pointer", color: TOKEN.accent, "font-size": "1em", "border-radius": "0.375em", display: "flex", "align-items": "center", "justify-content": "center" }}
            >+</button>
          </div>
          <div style={{ display: "flex", "flex-direction": "column", gap: "0.125em" }}>
            <For each={props.areas} fallback={
              <p style={{ "font-size": "0.8125em", color: TOKEN.textSecondary, margin: 0 }}>No areas yet</p>
            }>
              {(area) => {
                const isActive = () => props.activeFilter === `area:${area.id}`;
                return (
                  <button
                    onClick={() => props.onFilter(`area:${area.id}`)}
                    onDblClick={() => props.onSetAreaRule(area)}
                    title="Double-click to edit area rules"
                    style={{ display: "flex", "align-items": "center", gap: "0.5em", width: "100%", "min-height": TOKEN.touchTarget, padding: "0 0.625em", "border-radius": "0.5em", border: "none", cursor: "pointer", background: isActive() ? `rgba(255,107,53,0.1)` : "transparent", color: isActive() ? TOKEN.accent : TOKEN.text, "font-size": "0.9375em", "font-family": "Inter, system-ui, sans-serif", transition: TOKEN.transition, "text-align": "left" }}
                  >
                    <span aria-hidden>◈</span>
                    <span style={{ flex: 1, overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>{area.rules.area}</span>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — Note Card (list view)
// ─────────────────────────────────────────────────────────────────────────────

function NoteListCard(props: {
  note: Note;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      aria-selected={props.selected}
      aria-label={`Note: ${props.note.title}`}
      onClick={props.onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onSelect(); } }}
      style={{
        display: "flex",
        "align-items": "center",
        "min-height": TOKEN.cardH,
        padding: `0 ${TOKEN.padding.card}`,
        "border-radius": TOKEN.radius.card,
        border: `1px solid ${props.selected ? TOKEN.accent : TOKEN.border}`,
        background: TOKEN.surface,
        cursor: "pointer",
        transition: TOKEN.transition,
        position: "relative",
        gap: TOKEN.gap.card,
        "box-sizing": "border-box",
      }}
      onMouseEnter={(e) => {
        if (!props.selected) {
          (e.currentTarget as HTMLElement).style.transform = "scale(1.015)";
          (e.currentTarget as HTMLElement).style.borderColor = TOKEN.accent;
        }
      }}
      onMouseLeave={(e) => {
        if (!props.selected) {
          (e.currentTarget as HTMLElement).style.transform = "scale(1)";
          (e.currentTarget as HTMLElement).style.borderColor = TOKEN.border;
        }
      }}
      onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = `2px solid ${TOKEN.accent}`; (e.currentTarget as HTMLElement).style.outlineOffset = "2px"; }}
      onBlur={(e) => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
    >
      {/* Active left accent bar */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: "0.5em",
          bottom: "0.5em",
          width: "0.25em",
          "border-radius": "9999px",
          background: props.selected ? TOKEN.accent : "transparent",
          transition: TOKEN.transition,
        }}
      />

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", "padding-left": "0.5em" }}>
        <p
          style={{
            margin: 0,
            "font-size": "1em",
            "font-weight": "600",
            color: TOKEN.text,
            "white-space": "nowrap",
            "overflow": "hidden",
            "text-overflow": "ellipsis",
            "font-feature-settings": '"ss01"',
          }}
        >
          {props.note.title}
        </p>
        <p
          style={{
            margin: "0.125em 0 0",
            "font-size": "0.8125em",
            color: TOKEN.textSecondary,
            "white-space": "nowrap",
            "overflow": "hidden",
            "text-overflow": "ellipsis",
          }}
        >
          {props.note.preview}
        </p>
      </div>

      {/* Supertags + time */}
      <div style={{ display: "flex", "flex-direction": "column", "align-items": "flex-end", gap: "0.25em", "flex-shrink": "0" }}>
        <Show when={props.note.supertags.length > 0}>
          <span
            style={{
              padding: "0.125em 0.5em",
              background: `rgba(255,107,53,0.1)`,
              color: TOKEN.accent,
              "border-radius": "9999px",
              "font-size": "0.75em",
              "font-weight": "600",
              "white-space": "nowrap",
            }}
          >
            {props.note.supertags[0]}
          </span>
        </Show>
        <span style={{ "font-size": "0.75em", color: TOKEN.textSecondary, "white-space": "nowrap" }}>
          {relativeTime(props.note.updatedAt)}
        </span>
      </div>

      {/* OCR badge */}
      <Show when={props.note.metadata.hasOcr}>
        <span
          aria-label="Has OCR content"
          title="Contains OCR-extracted text"
          style={{
            "font-size": "0.625em",
            "font-weight": "700",
            "letter-spacing": "0.05em",
            "text-transform": "uppercase",
            color: "#2E8B57",
            border: "1px solid #2E8B57",
            "border-radius": "0.375em",
            padding: "0.2em 0.4em",
            "flex-shrink": "0",
          }}
        >
          OCR
        </span>
      </Show>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — Note Card (grid view)
// ─────────────────────────────────────────────────────────────────────────────

function NoteGridCard(props: {
  note: Note;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      aria-selected={props.selected}
      aria-label={`Note: ${props.note.title}`}
      onClick={props.onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onSelect(); } }}
      style={{
        width: TOKEN.gridW,
        "min-height": TOKEN.gridH,
        padding: TOKEN.padding.gridCard,
        "border-radius": TOKEN.radius.gridCard,
        border: `1px solid ${props.selected ? TOKEN.accent : TOKEN.border}`,
        background: TOKEN.surface,
        cursor: "pointer",
        transition: TOKEN.transition,
        display: "flex",
        "flex-direction": "column",
        gap: TOKEN.gap.card,
        "box-sizing": "border-box",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        if (!props.selected) {
          (e.currentTarget as HTMLElement).style.transform = "scale(1.02)";
          (e.currentTarget as HTMLElement).style.borderColor = TOKEN.accent;
        }
      }}
      onMouseLeave={(e) => {
        if (!props.selected) {
          (e.currentTarget as HTMLElement).style.transform = "scale(1)";
          (e.currentTarget as HTMLElement).style.borderColor = TOKEN.border;
        }
      }}
      onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = `2px solid ${TOKEN.accent}`; (e.currentTarget as HTMLElement).style.outlineOffset = "2px"; }}
      onBlur={(e) => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
    >
      {/* Active accent bar — top */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: "0.75em",
          right: "0.75em",
          height: "0.25em",
          "border-radius": "0 0 0.25em 0.25em",
          background: props.selected ? TOKEN.accent : "transparent",
          transition: TOKEN.transition,
        }}
      />

      <p
        style={{
          margin: 0,
          "font-size": "1em",
          "font-weight": "600",
          color: TOKEN.text,
          "line-height": "1.2",
          overflow: "hidden",
          display: "-webkit-box",
          "-webkit-line-clamp": "2",
          "-webkit-box-orient": "vertical",
          "font-feature-settings": '"ss01"',
        }}
      >
        {props.note.title}
      </p>

      <p
        style={{
          margin: 0,
          "font-size": "0.8125em",
          color: TOKEN.textSecondary,
          flex: 1,
          overflow: "hidden",
          display: "-webkit-box",
          "-webkit-line-clamp": "3",
          "-webkit-box-orient": "vertical",
          "line-height": "1.5",
        }}
      >
        {props.note.preview}
      </p>

      {/* Footer */}
      <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", "margin-top": "auto" }}>
        <div style={{ display: "flex", "flex-wrap": "wrap", gap: "0.25em" }}>
          <For each={props.note.supertags.slice(0, 2)}>
            {(tag) => (
              <span
                style={{
                  padding: "0.125em 0.5em",
                  background: `rgba(255,107,53,0.1)`,
                  color: TOKEN.accent,
                  "border-radius": "9999px",
                  "font-size": "0.75em",
                  "font-weight": "600",
                }}
              >
                {tag}
              </span>
            )}
          </For>
        </div>
        <span style={{ "font-size": "0.75em", color: TOKEN.textSecondary, "white-space": "nowrap" }}>
          {relativeTime(props.note.updatedAt)}
        </span>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — Knowledge Graph (D3 force simulation)
// ─────────────────────────────────────────────────────────────────────────────

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  supertag?: string;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  relation: string;
}

function NoteGraphView(props: {
  notes: Note[];
  onSelectNote: (id: string) => void;
  selectedId: string | null;
}) {
  let svgRef!: SVGSVGElement;
  let containerRef!: HTMLDivElement;

  onMount(() => {
    const W = containerRef.clientWidth || 700;
    const H = containerRef.clientHeight || 480;

    const nodes: GraphNode[] = props.notes.map((n) => ({
      id: n.id,
      title: n.title,
      supertag: n.supertags[0],
    }));

    const links: GraphLink[] = props.notes.flatMap((n) =>
      n.backlinks.map((bl) => ({
        source: n.id,
        target: bl.targetId,
        relation: bl.relation,
      }))
    );

    const svg = d3.select(svgRef);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");
    defs.append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 22)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", TOKEN.border);

    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links).id((d) => d.id).distance(110))
      .force("charge", d3.forceManyBody().strength(-260))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide(40));

    const g = svg.append("g");

    // Zoom + pan
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 3])
        .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
          g.attr("transform", String(event.transform));
        })
    );

    const link = g.append("g")
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", TOKEN.border)
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrow)");

    const node = g.append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .style("cursor", "pointer")
      .on("click", (_event, d) => props.onSelectNote(d.id))
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    node.append("circle")
      .attr("r", 18)
      .attr("fill", (d) => d.id === props.selectedId ? TOKEN.accent : TOKEN.surface)
      .attr("stroke", (d) => d.id === props.selectedId ? TOKEN.accent : TOKEN.border)
      .attr("stroke-width", (d) => d.id === props.selectedId ? 2.5 : 1.5);

    node.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-size", "10")
      .attr("font-family", "Inter, system-ui, sans-serif")
      .attr("fill", (d) => d.id === props.selectedId ? "#fff" : TOKEN.text)
      .text((d) => d.title.slice(0, 2).toUpperCase());

    node.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "2.4em")
      .attr("font-size", "9")
      .attr("font-family", "Inter, system-ui, sans-serif")
      .attr("fill", TOKEN.textSecondary)
      .text((d) => d.title.length > 18 ? d.title.slice(0, 18) + "…" : d.title);

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
        .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
        .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
        .attr("y2", (d) => (d.target as GraphNode).y ?? 0);

      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    onCleanup(() => simulation.stop());
  });

  return (
    <div
      ref={containerRef}
      aria-label="Note knowledge graph"
      style={{
        width: "100%",
        height: "28em",
        background: TOKEN.bg,
        "border-radius": TOKEN.radius.gridCard,
        overflow: "hidden",
        border: `1px solid ${TOKEN.border}`,
      }}
    >
      <svg ref={svgRef} width="100%" height="100%" role="img" aria-label="Force-directed note graph" />
      <p style={{ margin: "0.5em 1em", "font-size": "0.75em", color: TOKEN.textSecondary, position: "absolute", bottom: "0.5em", left: "1em" }}>
        Drag to pan · scroll to zoom · click node to select note
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9 — 3D Block viewer (three.js, lazy, with fallback)
// ─────────────────────────────────────────────────────────────────────────────

function ThreeDViewer(props: { modelUrl?: string }) {
  let mountRef!: HTMLDivElement;
  const [error, setError] = createSignal<string | null>(null);
  const [loaded, setLoaded] = createSignal(false);

  onMount(() => {
    // Lazy-load three.js to avoid blocking initial render
    import("three").then(({ WebGLRenderer, Scene, PerspectiveCamera, Mesh, BoxGeometry, MeshNormalMaterial, AmbientLight, DirectionalLight }) => {
      if (!mountRef) return;
      const W = mountRef.clientWidth || 320;
      const H = 220;

      const renderer = new WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      mountRef.appendChild(renderer.domElement);

      const scene = new Scene();
      const camera = new PerspectiveCamera(45, W / H, 0.1, 100);
      camera.position.set(0, 1, 3);

      scene.add(new AmbientLight(0xffffff, 0.8));
      const dir = new DirectionalLight(0xffffff, 1);
      dir.position.set(2, 4, 2);
      scene.add(dir);

      // Placeholder: rotating cube (replace with GLTF loader for real modelUrl)
      const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshNormalMaterial());
      scene.add(mesh);

      let frameId: number;
      function animate() {
        frameId = requestAnimationFrame(animate);
        mesh.rotation.x += 0.008;
        mesh.rotation.y += 0.012;
        renderer.render(scene, camera);
      }
      animate();
      setLoaded(true);

      onCleanup(() => {
        cancelAnimationFrame(frameId);
        renderer.dispose();
        if (mountRef && renderer.domElement.parentNode === mountRef) {
          mountRef.removeChild(renderer.domElement);
        }
      });
    }).catch(() => setError("3D viewer unavailable on this device."));
  });

  return (
    <div
      style={{
        "border-radius": TOKEN.radius.gridCard,
        overflow: "hidden",
        background: TOKEN.bg,
        border: `1px solid ${TOKEN.border}`,
        width: "100%",
      }}
    >
      <Show when={error()}>
        <div style={{ padding: "1.5em", "font-size": "0.875em", color: TOKEN.textSecondary, "text-align": "center" }}>
          {error()}
        </div>
      </Show>
      <Show when={!error()}>
        <div ref={mountRef} style={{ width: "100%" }} aria-label="3D object viewer" role="img" />
        <Show when={!loaded()}>
          <div style={{ padding: "1em", "font-size": "0.8125em", color: TOKEN.textSecondary }}>Loading 3D viewer…</div>
        </Show>
        <Show when={props.modelUrl}>
          <p style={{ margin: "0", padding: "0.375em 0.75em", "font-size": "0.75em", color: TOKEN.textSecondary }}>
            Model: {props.modelUrl}
          </p>
        </Show>
      </Show>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7 — AI Actions panel
// ─────────────────────────────────────────────────────────────────────────────

function AIActionsPanel(props: { note: Note; onClose: () => void }) {
  const actions = [
    { label: "Summarize", icon: "≡", description: "Generate a concise summary of this note." },
    { label: "Extract Action Items", icon: "✓", description: "Pull out all action items and to-dos." },
    { label: "Create Mind Map", icon: "◎", description: "Visualize this note as a connected mind map." },
    { label: "Elaborate", icon: "✦", description: "Expand and enrich the content of this note." },
  ];
  const [running, setRunning] = createSignal<string | null>(null);
  const [result, setResult] = createSignal<string | null>(null);

  function run(label: string) {
    setRunning(label);
    setResult(null);
    setTimeout(() => {
      setRunning(null);
      setResult(`"${label}" completed. Results would appear here when connected to an AI backend.`);
    }, 1200);
  }

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "0.625em" }}>
      <For each={actions}>
        {(action) => (
          <button
            onClick={() => run(action.label)}
            disabled={running() !== null}
            title={action.description}
            style={{
              display: "flex",
              "align-items": "center",
              gap: "0.75em",
              "min-height": "2.5em",
              padding: "0 0.875em",
              "border-radius": "0.5em",
              border: `1px solid ${TOKEN.border}`,
              background: running() === action.label ? TOKEN.accent : TOKEN.surface,
              color: running() === action.label ? "#fff" : TOKEN.text,
              cursor: running() !== null ? "not-allowed" : "pointer",
              "font-size": "0.875em",
              "font-family": "Inter, system-ui, sans-serif",
              transition: TOKEN.transition,
              "text-align": "left",
              opacity: running() !== null && running() !== action.label ? "0.5" : "1",
            }}
            onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = `2px solid ${TOKEN.accent}`; }}
            onBlur={(e) => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
          >
            <span aria-hidden style={{ "font-size": "1em", color: running() === action.label ? "#fff" : TOKEN.accent, "flex-shrink": "0" }}>
              {action.icon}
            </span>
            {running() === action.label ? "Running…" : action.label}
          </button>
        )}
      </For>
      <Show when={result()}>
        <p
          style={{
            margin: "0.25em 0 0",
            padding: "0.75em",
            "font-size": "0.8125em",
            color: TOKEN.textSecondary,
            background: TOKEN.bg,
            "border-radius": "0.5em",
            border: `1px solid ${TOKEN.border}`,
            "line-height": "1.5",
          }}
        >
          {result()}
        </p>
      </Show>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 + 7 — Right Panel (context panel, appears when note is selected)
// ─────────────────────────────────────────────────────────────────────────────

function NoteRightPanel(props: {
  note: Note | null;
  allNotes: Note[];
  onClose: () => void;
  onSelectNote: (id: string) => void;
  onTagUpdate: (note: Note, removeTags: string[], addTags: string[], removeSupertags: string[], addSupertags: string[]) => void;
}) {
  return (
    <aside
      aria-label="Note details"
      style={{
        width: TOKEN.rightPanelW,
        "min-width": TOKEN.rightPanelW,
        "border-left": `1px solid ${TOKEN.border}`,
        background: TOKEN.surface,
        "overflow-y": "auto",
        "flex-shrink": "0",
        display: "flex",
        "flex-direction": "column",
        transition: `width ${TOKEN.transition}`,
        "font-feature-settings": '"ss01"',
      }}
    >
      <Show
        when={props.note}
        fallback={
          <div style={{ flex: 1, display: "flex", "align-items": "center", "justify-content": "center", "flex-direction": "column", gap: "0.75em", padding: TOKEN.padding.sidebar, "text-align": "center" }}>
            <span aria-hidden style={{ "font-size": "2.5em", opacity: "0.2" }}>□</span>
            <p style={{ margin: 0, "font-size": "0.875em", color: TOKEN.textSecondary }}>
              Select a note to see details, AI summary, and backlinks.
            </p>
          </div>
        }
      >
        {(note) => {
          const [newTag, setNewTag] = createSignal("");
          const [addingTag, setAddingTag] = createSignal(false);

          function removeTag(tag: string) {
            props.onTagUpdate(note(), [tag], [], [], []);
          }
          function removeSupertag(tag: string) {
            props.onTagUpdate(note(), [], [], [tag], []);
          }
          function confirmAddTag() {
            const t = newTag().trim().replace(/^#/, "");
            if (t) props.onTagUpdate(note(), [], [`#${t}`], [], []);
            setNewTag("");
            setAddingTag(false);
          }

          return (
          <div style={{ display: "flex", "flex-direction": "column", gap: TOKEN.gap.section, padding: TOKEN.padding.sidebar }}>
            {/* Header */}
            <div style={{ display: "flex", "align-items": "flex-start", "justify-content": "space-between", gap: "0.5em" }}>
              <h1 style={{ margin: 0, "font-size": "1.125em", "font-weight": "600", color: TOKEN.text, "line-height": "1.25", "font-feature-settings": '"ss01"' }}>
                {note().title}
              </h1>
              <button
                aria-label="Close detail panel"
                onClick={props.onClose}
                style={{ "min-width": "2em", "min-height": "2em", border: "none", background: "transparent", cursor: "pointer", color: TOKEN.textSecondary, "border-radius": "0.375em", "flex-shrink": "0", "font-size": "1.125em", transition: TOKEN.transition }}
                onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = `2px solid ${TOKEN.accent}`; }}
                onBlur={(e) => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
              >×</button>
            </div>

            {/* Editable tags row */}
            <div style={{ display: "flex", "flex-wrap": "wrap", gap: "0.375em", "align-items": "center" }}>
              {/* Supertags */}
              <For each={note().supertags}>
                {(t) => (
                  <span style={{ display: "inline-flex", "align-items": "center", gap: "0.25em", padding: "0.125em 0.4em 0.125em 0.625em", background: `rgba(255,107,53,0.1)`, color: TOKEN.accent, "border-radius": "9999px", "font-size": "0.75em", "font-weight": "600" }}>
                    {t}
                    <button
                      aria-label={`Remove supertag ${t}`}
                      onClick={() => removeSupertag(t)}
                      style={{ border: "none", background: "transparent", cursor: "pointer", color: TOKEN.accent, "font-size": "0.9em", padding: 0, "line-height": 1, display: "flex", "align-items": "center" }}
                    >×</button>
                  </span>
                )}
              </For>
              {/* Tags */}
              <For each={note().tags}>
                {(t) => (
                  <span style={{ display: "inline-flex", "align-items": "center", gap: "0.25em", padding: "0.125em 0.4em 0.125em 0.625em", background: TOKEN.bg, color: TOKEN.textSecondary, "border-radius": "9999px", "font-size": "0.75em", border: `1px solid ${TOKEN.border}` }}>
                    {t}
                    <button
                      aria-label={`Remove tag ${t}`}
                      onClick={() => removeTag(t)}
                      style={{ border: "none", background: "transparent", cursor: "pointer", color: TOKEN.textSecondary, "font-size": "0.9em", padding: 0, "line-height": 1, display: "flex", "align-items": "center" }}
                    >×</button>
                  </span>
                )}
              </For>
              {/* Add tag */}
              <Show
                when={addingTag()}
                fallback={
                  <button
                    onClick={() => setAddingTag(true)}
                    style={{ padding: "0.125em 0.625em", background: "transparent", color: TOKEN.textSecondary, border: `1px dashed ${TOKEN.border}`, "border-radius": "9999px", "font-size": "0.75em", cursor: "pointer", transition: TOKEN.transition, "font-family": "Inter, system-ui, sans-serif" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = TOKEN.accent; (e.currentTarget as HTMLElement).style.color = TOKEN.accent; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = TOKEN.border; (e.currentTarget as HTMLElement).style.color = TOKEN.textSecondary; }}
                  >+ Tag</button>
                }
              >
                <input
                  autofocus
                  placeholder="#tag"
                  value={newTag()}
                  onInput={(e) => setNewTag(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); confirmAddTag(); }
                    if (e.key === "Escape") { setAddingTag(false); setNewTag(""); }
                  }}
                  onBlur={confirmAddTag}
                  style={{ padding: "0.125em 0.5em", border: `1px solid ${TOKEN.accent}`, "border-radius": "9999px", "font-size": "0.75em", outline: "none", width: "5em", "font-family": "Inter, system-ui, sans-serif", color: TOKEN.text, background: TOKEN.surface }}
                />
              </Show>
            </div>

            <p style={{ margin: 0, "font-size": "0.75em", color: TOKEN.textSecondary }}>
              Updated {relativeTime(note().updatedAt)}
            </p>

            {/* AI Summary */}
            <section aria-labelledby="summary-heading">
              <h2
                id="summary-heading"
                style={{
                  margin: "0 0 0.5em",
                  "font-size": "0.6875em",
                  "font-weight": "700",
                  "letter-spacing": "0.1em",
                  "text-transform": "uppercase",
                  color: TOKEN.textSecondary,
                }}
              >
                AI Summary
              </h2>
              <p
                style={{
                  margin: 0,
                  "font-size": "0.875em",
                  color: TOKEN.text,
                  "line-height": "1.6",
                  background: TOKEN.bg,
                  "border-radius": "0.625em",
                  padding: "0.75em",
                  border: `1px solid ${TOKEN.border}`,
                }}
              >
                {note().summary}
              </p>
            </section>

            {/* AI Actions — Phase 7 */}
            <section aria-labelledby="ai-actions-heading">
              <h2
                id="ai-actions-heading"
                style={{
                  margin: "0 0 0.5em",
                  "font-size": "0.6875em",
                  "font-weight": "700",
                  "letter-spacing": "0.1em",
                  "text-transform": "uppercase",
                  color: TOKEN.textSecondary,
                }}
              >
                AI Actions
              </h2>
              <AIActionsPanel note={note()} onClose={() => {}} />
            </section>

            {/* Contextual suggestion chips — Phase 7 */}
            <div style={{ display: "flex", "flex-wrap": "wrap", gap: "0.375em" }}>
              {["Add reminder?", "Link to meeting?", "Create task?"].map((chip) => (
                <button
                  style={{
                    padding: "0.25em 0.75em",
                    background: TOKEN.bg,
                    border: `1px solid ${TOKEN.border}`,
                    "border-radius": "9999px",
                    "font-size": "0.75em",
                    color: TOKEN.textSecondary,
                    cursor: "pointer",
                    transition: TOKEN.transition,
                    "min-height": TOKEN.touchTarget,
                    display: "flex",
                    "align-items": "center",
                    "font-family": "Inter, system-ui, sans-serif",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = TOKEN.accent; (e.currentTarget as HTMLElement).style.color = TOKEN.accent; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = TOKEN.border; (e.currentTarget as HTMLElement).style.color = TOKEN.textSecondary; }}
                  onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = `2px solid ${TOKEN.accent}`; }}
                  onBlur={(e) => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Backlinks — Phase 6 */}
            <Show when={note().backlinks.length > 0}>
              <section aria-labelledby="backlinks-heading">
                <h2
                  id="backlinks-heading"
                  style={{
                    margin: "0 0 0.5em",
                    "font-size": "0.6875em",
                    "font-weight": "700",
                    "letter-spacing": "0.1em",
                    "text-transform": "uppercase",
                    color: TOKEN.textSecondary,
                  }}
                >
                  Backlinks
                </h2>
                <div style={{ display: "flex", "flex-direction": "column", gap: "0.5em" }}>
                  <For each={note().backlinks}>
                    {(bl) => {
                      const target = () => props.allNotes.find((n) => n.id === bl.targetId);
                      return (
                        <button
                          onClick={() => target() && props.onSelectNote(bl.targetId)}
                          style={{
                            display: "flex",
                            "align-items": "center",
                            gap: "0.625em",
                            padding: "0.5em 0.75em",
                            background: TOKEN.bg,
                            border: `1px solid ${TOKEN.border}`,
                            "border-radius": "0.5em",
                            cursor: "pointer",
                            "font-size": "0.875em",
                            color: TOKEN.text,
                            "font-family": "Inter, system-ui, sans-serif",
                            "text-align": "left",
                            transition: TOKEN.transition,
                            "min-height": TOKEN.touchTarget,
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = TOKEN.accent; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = TOKEN.border; }}
                          onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = `2px solid ${TOKEN.accent}`; }}
                          onBlur={(e) => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
                        >
                          <span aria-hidden style={{ color: TOKEN.accent, "flex-shrink": "0" }}>→</span>
                          <div>
                            <span style={{ "font-weight": "500" }}>{bl.targetTitle}</span>
                            <span style={{ "font-size": "0.75em", color: TOKEN.textSecondary, display: "block" }}>{bl.relation}</span>
                          </div>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </section>
            </Show>

            {/* 3D block — Phase 9 */}
            <Show when={note().metadata.has3d}>
              <section aria-labelledby="3d-heading">
                <h2
                  id="3d-heading"
                  style={{
                    margin: "0 0 0.5em",
                    "font-size": "0.6875em",
                    "font-weight": "700",
                    "letter-spacing": "0.1em",
                    "text-transform": "uppercase",
                    color: TOKEN.textSecondary,
                  }}
                >
                  3D Object
                </h2>
                <ThreeDViewer modelUrl={note().blocks.find((b) => b.type === "3d")?.modelUrl} />
              </section>
            </Show>

            {/* OCR info — Phase 8 */}
            <Show when={note().metadata.hasOcr}>
              <section aria-labelledby="ocr-heading">
                <h2
                  id="ocr-heading"
                  style={{
                    margin: "0 0 0.5em",
                    "font-size": "0.6875em",
                    "font-weight": "700",
                    "letter-spacing": "0.1em",
                    "text-transform": "uppercase",
                    color: TOKEN.textSecondary,
                  }}
                >
                  OCR (PaddleOCR)
                </h2>
                <div
                  style={{
                    padding: "0.75em",
                    background: TOKEN.bg,
                    "border-radius": "0.5em",
                    border: `1px solid #2E8B57`,
                    "font-size": "0.8125em",
                    color: TOKEN.text,
                    display: "flex",
                    "align-items": "center",
                    gap: "0.5em",
                  }}
                >
                  <span style={{ color: "#2E8B57", "font-weight": "700" }}>OCR</span>
                  <span style={{ color: TOKEN.textSecondary }}>Text extracted · Confidence ≥ 90% · Stored for search</span>
                </div>
              </section>
            </Show>

            {/* Version timeline stub */}
            <section aria-labelledby="version-heading">
              <h2
                id="version-heading"
                style={{
                  margin: "0 0 0.5em",
                  "font-size": "0.6875em",
                  "font-weight": "700",
                  "letter-spacing": "0.1em",
                  "text-transform": "uppercase",
                  color: TOKEN.textSecondary,
                }}
              >
                Version History
              </h2>
              <div style={{ display: "flex", "flex-direction": "column", gap: "0.375em" }}>
                {[
                  { label: "Current", time: note().updatedAt },
                  { label: "v2", time: note().createdAt },
                ].map((v) => (
                  <button
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "0.625em",
                      padding: "0.375em 0.75em",
                      background: TOKEN.bg,
                      border: `1px solid ${TOKEN.border}`,
                      "border-radius": "0.5em",
                      cursor: "pointer",
                      "font-size": "0.8125em",
                      color: TOKEN.text,
                      "font-family": "Inter, system-ui, sans-serif",
                      "text-align": "left",
                      "min-height": TOKEN.touchTarget,
                    }}
                    onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = `2px solid ${TOKEN.accent}`; }}
                    onBlur={(e) => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
                  >
                    <span style={{ color: TOKEN.accent, "flex-shrink": "0", "font-size": "0.75em" }}>●</span>
                    <span style={{ "font-weight": "500" }}>{v.label}</span>
                    <span style={{ color: TOKEN.textSecondary }}>— {relativeTime(v.time)}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
          );
        }}
      </Show>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — "Ask your notes" mode
// ─────────────────────────────────────────────────────────────────────────────

function AskNotesBar(props: { notes: Note[] }) {
  const [question, setQuestion] = createSignal("");
  const [answer, setAnswer] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  function ask() {
    if (!question().trim()) return;
    setLoading(true);
    setAnswer(null);
    setTimeout(() => {
      const matches = props.notes.filter(
        (n) =>
          n.title.toLowerCase().includes(question().toLowerCase()) ||
          n.preview.toLowerCase().includes(question().toLowerCase()) ||
          n.summary.toLowerCase().includes(question().toLowerCase())
      );
      setLoading(false);
      setAnswer(
        matches.length > 0
          ? `Found ${matches.length} relevant note(s): ${matches.map((n) => `"${n.title}"`).join(", ")}. (Full semantic search available when AI backend is connected.)`
          : "No notes matched your question. (Semantic search via pgvector would be used in production.)"
      );
    }, 800);
  }

  return (
    <div
      style={{
        background: TOKEN.surface,
        border: `1px solid ${TOKEN.border}`,
        "border-radius": TOKEN.radius.gridCard,
        padding: "1em 1.25em",
        display: "flex",
        "flex-direction": "column",
        gap: "0.625em",
      }}
    >
      <p
        style={{
          margin: 0,
          "font-size": "0.6875em",
          "font-weight": "700",
          "letter-spacing": "0.1em",
          "text-transform": "uppercase",
          color: TOKEN.accent,
        }}
      >
        ✦ Ask your notes
      </p>
      <div style={{ display: "flex", gap: "0.5em" }}>
        <input
          type="text"
          placeholder="What did we decide about the graph model?"
          value={question()}
          onInput={(e) => setQuestion(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
          aria-label="Ask your notes a question"
          style={{
            flex: 1,
            height: TOKEN.searchH,
            padding: "0 0.875em",
            border: `1px solid ${TOKEN.border}`,
            "border-radius": "0.5em",
            "font-size": "0.9375em",
            color: TOKEN.text,
            "font-family": "Inter, system-ui, sans-serif",
            "font-feature-settings": '"ss01"',
            outline: "none",
            background: TOKEN.bg,
          }}
          onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = TOKEN.accent; (e.currentTarget as HTMLElement).style.outline = `2px solid ${TOKEN.accent}`; }}
          onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = TOKEN.border; (e.currentTarget as HTMLElement).style.outline = "none"; }}
        />
        <button
          onClick={ask}
          disabled={loading()}
          style={{
            "min-height": TOKEN.touchTarget,
            padding: "0 1.125em",
            background: TOKEN.accent,
            color: "#fff",
            border: "none",
            "border-radius": "0.5em",
            cursor: loading() ? "not-allowed" : "pointer",
            "font-size": "0.9375em",
            "font-weight": "600",
            "font-family": "Inter, system-ui, sans-serif",
            transition: TOKEN.transition,
            opacity: loading() ? "0.7" : "1",
          }}
          onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = `2px solid ${TOKEN.accent}`; (e.currentTarget as HTMLElement).style.outlineOffset = "2px"; }}
          onBlur={(e) => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
        >
          {loading() ? "…" : "Ask"}
        </button>
      </div>
      <Show when={answer()}>
        <p style={{ margin: 0, "font-size": "0.875em", color: TOKEN.text, "line-height": "1.6" }}>{answer()}</p>
      </Show>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Folder Rule Modal
// ─────────────────────────────────────────────────────────────────────────────

function FolderRuleModal(props: {
  folder: Folder;
  onSave: (rule: FolderRulePayload) => void;
  onClose: () => void;
}) {
  const existing = props.folder.rule;
  const [summaryStyle, setSummaryStyle] = createSignal(existing?.summary_style ?? "");
  const [backlinkRules, setBacklinkRules] = createSignal(existing?.backlink_rules ?? "");
  const [tagSuggestions, setTagSuggestions] = createSignal(
    (existing?.tag_suggestions ?? []).join(", ")
  );

  function save() {
    props.onSave({
      folder_id: props.folder.id,
      summary_style: summaryStyle() || undefined,
      backlink_rules: backlinkRules() || undefined,
      tag_suggestions: tagSuggestions()
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Folder rules for ${props.folder.name}`}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", "align-items": "center", "justify-content": "center", "z-index": 200 }}
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div style={{ background: TOKEN.surface, "border-radius": "1em", padding: "1.75em", width: "min(26em, 92vw)", display: "flex", "flex-direction": "column", gap: "1em", "box-shadow": "0 1em 3em rgba(28,28,28,0.2)" }}>
        <h2 style={{ margin: 0, "font-size": "1.125em", "font-weight": "700", color: TOKEN.text, "font-feature-settings": '"ss01"' }}>
          Folder rules — {props.folder.name}
        </h2>
        <p style={{ margin: 0, "font-size": "0.8125em", color: TOKEN.textSecondary }}>
          These rules become a first-class <code>folder_rule</code> AFP message. The Knowledge Curator applies them to all notes in this folder.
        </p>
        {(
          [
            { label: "Summary style", value: summaryStyle, set: setSummaryStyle, placeholder: "e.g. concise bullet points with action items" },
            { label: "Backlink rules", value: backlinkRules, set: setBacklinkRules, placeholder: "e.g. only link within this folder or #ProjectX" },
            { label: "Tag suggestions (comma-separated)", value: tagSuggestions, set: setTagSuggestions, placeholder: "#Meeting, #Task, #Decision" },
          ] as Array<{ label: string; value: () => string; set: (v: string) => void; placeholder: string }>
        ).map((field) => (
          <label style={{ display: "flex", "flex-direction": "column", gap: "0.375em" }}>
            <span style={{ "font-size": "0.8125em", "font-weight": "600", color: TOKEN.textSecondary }}>{field.label}</span>
            <input
              type="text"
              value={field.value()}
              onInput={(e) => field.set(e.currentTarget.value)}
              placeholder={field.placeholder}
              style={{ padding: "0.5em 0.75em", border: `1px solid ${TOKEN.border}`, "border-radius": "0.5em", "font-size": "0.9375em", color: TOKEN.text, background: TOKEN.bg, "font-family": "Inter, system-ui, sans-serif", outline: "none" }}
              onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = TOKEN.accent; }}
              onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = TOKEN.border; }}
            />
          </label>
        ))}
        <div style={{ display: "flex", gap: "0.5em", "justify-content": "flex-end" }}>
          <button
            onClick={props.onClose}
            style={{ padding: "0.5em 1em", border: `1px solid ${TOKEN.border}`, "border-radius": "0.5em", background: "transparent", cursor: "pointer", "font-size": "0.9375em", color: TOKEN.textSecondary, "font-family": "Inter, system-ui, sans-serif", "min-height": TOKEN.touchTarget }}
          >Cancel</button>
          <button
            onClick={save}
            style={{ padding: "0.5em 1.25em", border: "none", "border-radius": "0.5em", background: TOKEN.accent, color: "#fff", cursor: "pointer", "font-size": "0.9375em", "font-weight": "600", "font-family": "Inter, system-ui, sans-serif", "min-height": TOKEN.touchTarget }}
          >Save rules</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Area Rule Modal
// ─────────────────────────────────────────────────────────────────────────────

function AreaRuleModal(props: {
  area?: Area;
  onSave: (rule: AreaRulesPayload) => void;
  onClose: () => void;
}) {
  const existing = props.area?.rules;
  const [areaName, setAreaName] = createSignal(existing?.area ?? "");
  const [summaryStyle, setSummaryStyle] = createSignal(existing?.summary_style ?? "");
  const [backlinkRules, setBacklinkRules] = createSignal(existing?.backlink_rules ?? "");
  const [tagSuggestions, setTagSuggestions] = createSignal(
    (existing?.tag_suggestions ?? []).join(", ")
  );

  function save() {
    const name = areaName().trim();
    if (!name) return;
    props.onSave({
      area: name,
      summary_style: summaryStyle() || undefined,
      backlink_rules: backlinkRules() || undefined,
      tag_suggestions: tagSuggestions()
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Area rules"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", "align-items": "center", "justify-content": "center", "z-index": 200 }}
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div style={{ background: TOKEN.surface, "border-radius": "1em", padding: "1.75em", width: "min(26em, 92vw)", display: "flex", "flex-direction": "column", gap: "1em", "box-shadow": "0 1em 3em rgba(28,28,28,0.2)" }}>
        <h2 style={{ margin: 0, "font-size": "1.125em", "font-weight": "700", color: TOKEN.text, "font-feature-settings": '"ss01"' }}>
          {props.area ? `Area rules — ${props.area.rules.area}` : "New area rules"}
        </h2>
        <p style={{ margin: 0, "font-size": "0.8125em", color: TOKEN.textSecondary }}>
          An <code>area_rules</code> AFP message spans multiple folders. The Knowledge Curator applies these rules across all folders in this area.
        </p>
        <label style={{ display: "flex", "flex-direction": "column", gap: "0.375em" }}>
          <span style={{ "font-size": "0.8125em", "font-weight": "600", color: TOKEN.textSecondary }}>Area name</span>
          <input
            type="text"
            value={areaName()}
            onInput={(e) => setAreaName(e.currentTarget.value)}
            placeholder="e.g. work, health, personal"
            disabled={!!props.area}
            style={{ padding: "0.5em 0.75em", border: `1px solid ${TOKEN.border}`, "border-radius": "0.5em", "font-size": "0.9375em", color: TOKEN.text, background: props.area ? TOKEN.bg : TOKEN.surface, "font-family": "Inter, system-ui, sans-serif", outline: "none", opacity: props.area ? "0.6" : "1" }}
          />
        </label>
        {(
          [
            { label: "Summary style", value: summaryStyle, set: setSummaryStyle, placeholder: "e.g. concise bullet points with action items" },
            { label: "Backlink rules", value: backlinkRules, set: setBacklinkRules, placeholder: "e.g. only link within this area or #ProjectX" },
            { label: "Tag suggestions (comma-separated)", value: tagSuggestions, set: setTagSuggestions, placeholder: "#Meeting, #Task, #Decision" },
          ] as Array<{ label: string; value: () => string; set: (v: string) => void; placeholder: string }>
        ).map((field) => (
          <label style={{ display: "flex", "flex-direction": "column", gap: "0.375em" }}>
            <span style={{ "font-size": "0.8125em", "font-weight": "600", color: TOKEN.textSecondary }}>{field.label}</span>
            <input
              type="text"
              value={field.value()}
              onInput={(e) => field.set(e.currentTarget.value)}
              placeholder={field.placeholder}
              style={{ padding: "0.5em 0.75em", border: `1px solid ${TOKEN.border}`, "border-radius": "0.5em", "font-size": "0.9375em", color: TOKEN.text, background: TOKEN.bg, "font-family": "Inter, system-ui, sans-serif", outline: "none" }}
              onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = TOKEN.accent; }}
              onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = TOKEN.border; }}
            />
          </label>
        ))}
        <div style={{ display: "flex", gap: "0.5em", "justify-content": "flex-end" }}>
          <button
            onClick={props.onClose}
            style={{ padding: "0.5em 1em", border: `1px solid ${TOKEN.border}`, "border-radius": "0.5em", background: "transparent", cursor: "pointer", "font-size": "0.9375em", color: TOKEN.textSecondary, "font-family": "Inter, system-ui, sans-serif", "min-height": TOKEN.touchTarget }}
          >Cancel</button>
          <button
            onClick={save}
            style={{ padding: "0.5em 1.25em", border: "none", "border-radius": "0.5em", background: TOKEN.accent, color: "#fff", cursor: "pointer", "font-size": "0.9375em", "font-weight": "600", "font-family": "Inter, system-ui, sans-serif", "min-height": TOKEN.touchTarget }}
          >Save rules</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main NoteView — assembles all phases
// ─────────────────────────────────────────────────────────────────────────────

export interface NoteViewProps {
  /** Optional AFP messages to merge with demo notes */
  messages?: AfpMessage[];
}

export function NoteView(props: NoteViewProps) {
  // ── State ────────────────────────────────────────────────────────────────
  const [query, setQuery] = createSignal("");
  const [viewMode, setViewMode] = createSignal<"list" | "grid" | "graph">("list");
  const [sidebarOpen, setSidebarOpen] = createSignal(true);
  const [activeFilter, setActiveFilter] = createSignal("all");
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [folderRuleTarget, setFolderRuleTarget] = createSignal<Folder | null>(null);
  const [areaRuleTarget, setAreaRuleTarget] = createSignal<Area | "new" | null>(null);
  // Local tag deltas applied before the server echoes back (optimistic update)
  const [localTagDeltas, setLocalTagDeltas] = createSignal<TagUpdateMsg[]>([]);

  // Collapse sidebar on narrow screens automatically
  onMount(() => {
    const mq = window.matchMedia("(max-width: 64em)");
    if (mq.matches) setSidebarOpen(false);
    const handler = (e: MediaQueryListEvent) => setSidebarOpen(!e.matches);
    mq.addEventListener("change", handler);
    onCleanup(() => mq.removeEventListener("change", handler));
  });

  // ── Data ─────────────────────────────────────────────────────────────────

  // Parse folder_rule AFP messages → Folder[]
  const folders = createMemo<Folder[]>(() => {
    const msgs = (props.messages ?? []).filter((m) => m.type === "folder_rule");
    // Latest message per folder_id wins (server returns oldest-first)
    const byFolder = new Map<string, Folder>();
    for (const m of msgs) {
      const c = m.content as Record<string, unknown>;
      const fid = typeof c.folder_id === "string" ? c.folder_id : "";
      if (!fid) continue;
      byFolder.set(fid, {
        id: fid,
        name: fid.charAt(0).toUpperCase() + fid.slice(1),
        areaId: typeof c.area_id === "string" ? c.area_id : undefined,
        rule: {
          folder_id: fid,
          summary_style: typeof c.summary_style === "string" ? c.summary_style : undefined,
          backlink_rules: typeof c.backlink_rules === "string" ? c.backlink_rules : undefined,
          tag_suggestions: Array.isArray(c.tag_suggestions) ? (c.tag_suggestions as string[]) : [],
        },
      });
    }
    return Array.from(byFolder.values());
  });

  // Parse area_rules AFP messages → Area[]
  const areas = createMemo<Area[]>(() => {
    const msgs = (props.messages ?? []).filter((m) => m.type === "area_rules");
    const byArea = new Map<string, Area>();
    for (const m of msgs) {
      const c = m.content as Record<string, unknown>;
      const areaName = typeof c.area === "string" ? c.area : "";
      if (!areaName) continue;
      byArea.set(areaName, {
        id: areaName,
        rules: {
          area: areaName,
          summary_style: typeof c.summary_style === "string" ? c.summary_style : undefined,
          backlink_rules: typeof c.backlink_rules === "string" ? c.backlink_rules : undefined,
          tag_suggestions: Array.isArray(c.tag_suggestions) ? (c.tag_suggestions as string[]) : [],
        },
      });
    }
    return Array.from(byArea.values());
  });

  // Parse tag_update AFP messages (server + local deltas combined)
  const allTagUpdates = createMemo<TagUpdateMsg[]>(() => {
    const fromServer = (props.messages ?? [])
      .filter((m) => m.type === "tag_update")
      .map((m) => {
        const c = m.content as Record<string, unknown>;
        const refs = (m.references ?? []) as Array<Record<string, unknown>>;
        return {
          updateId: m.id,
          sourceId: typeof refs[0]?.id === "string" ? refs[0].id : "",
          timestamp: m.timestamp,
          removeTags: Array.isArray(c.remove_tags) ? (c.remove_tags as string[]) : [],
          addTags: Array.isArray(c.add_tags) ? (c.add_tags as string[]) : [],
          removeSupertags: Array.isArray(c.remove_supertags) ? (c.remove_supertags as string[]) : [],
          addSupertags: Array.isArray(c.add_supertags) ? (c.add_supertags as string[]) : [],
        } satisfies TagUpdateMsg;
      });
    return [...fromServer, ...localTagDeltas()];
  });

  /** Apply all tag_update deltas for a note and return effective (supertags, tags). */
  function resolveNoteTags(note: Note): { tags: string[]; supertags: string[] } {
    const deltas = allTagUpdates().filter((u) => u.sourceId === note.id);
    deltas.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let tags = [...note.tags];
    let supertags = [...note.supertags];
    for (const d of deltas) {
      tags = tags.filter((t) => !d.removeTags.includes(t));
      for (const t of d.addTags) { if (!tags.includes(t)) tags.push(t); }
      supertags = supertags.filter((t) => !d.removeSupertags.includes(t));
      for (const t of d.addSupertags) { if (!supertags.includes(t)) supertags.push(t); }
    }
    return { tags, supertags };
  }

  // Merge AFP note messages as additional notes
  const afpNotes = createMemo<Note[]>(() =>
    (props.messages ?? [])
      .filter((m) => m.type.includes("note") || m.type === "knowledge_card")
      .map((m) => {
        const c = m.content as Record<string, unknown>;
        return {
          id: m.id,
          title: typeof c.title === "string" ? c.title : m.id.slice(0, 16),
          preview: typeof c.summary === "string" ? c.summary : "",
          blocks: [],
          summary: typeof c.summary === "string" ? c.summary : "",
          tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
          supertags: Array.isArray(c.supertags) ? (c.supertags as string[]) : [],
          backlinks: [],
          updatedAt: m.timestamp,
          createdAt: m.timestamp,
          folderId: typeof c.folder_id === "string" ? c.folder_id : undefined,
          areaId: typeof c.area_id === "string" ? c.area_id : undefined,
          metadata: {},
        } satisfies Note;
      })
  );

  const allNotes = createMemo<Note[]>(() => [...afpNotes(), ...DEMO_NOTES]);

  // Notes with resolved tags applied
  const allNotesResolved = createMemo<Note[]>(() =>
    allNotes().map((n) => {
      const { tags, supertags } = resolveNoteTags(n);
      return { ...n, tags, supertags };
    })
  );

  const allTags = createMemo<string[]>(() =>
    [...new Set(allNotesResolved().flatMap((n) => n.tags))]
  );
  const allSupertags = createMemo<string[]>(() =>
    [...new Set(allNotesResolved().flatMap((n) => n.supertags))]
  );

  // ── Filtering + search (Phase 5) ─────────────────────────────────────────
  const filteredNotes = createMemo<Note[]>(() => {
    let notes = allNotesResolved();
    const f = activeFilter();
    if (f.startsWith("tag:")) {
      const tag = f.slice(4);
      notes = notes.filter((n) => n.tags.includes(tag));
    } else if (f.startsWith("folder:")) {
      const fid = f.slice(7);
      notes = notes.filter((n) => n.folderId === fid);
    } else if (f.startsWith("area:")) {
      const aid = f.slice(5);
      notes = notes.filter((n) => n.areaId === aid);
    }
    const q = query().trim().toLowerCase();
    if (q) {
      notes = notes.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.preview.toLowerCase().includes(q) ||
          n.summary.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q)) ||
          n.supertags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return notes;
  });

  const selectedNote = createMemo<Note | null>(() =>
    allNotesResolved().find((n) => n.id === selectedId()) ?? null
  );

  // ── tag_update dispatch ───────────────────────────────────────────────────
  function handleTagUpdate(
    note: Note,
    removeTags: string[],
    addTags: string[],
    removeSupertags: string[],
    addSupertags: string[]
  ) {
    // Optimistic: apply locally immediately
    const tempId = `local-${Date.now()}`;
    setLocalTagDeltas((prev) => [
      ...prev,
      {
        updateId: tempId,
        sourceId: note.id,
        timestamp: new Date().toISOString(),
        removeTags,
        addTags,
        removeSupertags,
        addSupertags,
      },
    ]);
    // Fire AFP message to server (best-effort, no retry needed — log is append-only)
    sendNoteMessage({
      type: "tag_update",
      thread_id: note.id,
      content: { remove_tags: removeTags, add_tags: addTags, remove_supertags: removeSupertags, add_supertags: addSupertags },
      references: [{ id: note.id }],
    }).then((serverId) => {
      // Replace the local optimistic entry with the real server-assigned id
      setLocalTagDeltas((prev) =>
        prev.map((d) => d.updateId === tempId ? { ...d, updateId: serverId } : d)
      );
    }).catch(() => {
      // On error remove the local delta so the UI reverts
      setLocalTagDeltas((prev) => prev.filter((d) => d.updateId !== tempId));
    });
  }

  // ── folder_rule dispatch ──────────────────────────────────────────────────
  function handleSetFolderRule(folder: Folder) {
    setFolderRuleTarget(folder);
  }

  async function saveFolderRule(rule: FolderRulePayload) {
    const folder = folderRuleTarget();
    if (!folder) return;
    setFolderRuleTarget(null);
    await sendNoteMessage({
      type: "folder_rule",
      thread_id: `folder:${rule.folder_id}`,
      content: rule,
    }).catch(() => {/* server unavailable — spec doc still up to date */});
  }

  // ── area_rules dispatch ───────────────────────────────────────────────────
  function handleSetAreaRule(area?: Area) {
    setAreaRuleTarget(area ?? "new");
  }

  async function saveAreaRule(rule: AreaRulesPayload) {
    setAreaRuleTarget(null);
    await sendNoteMessage({
      type: "area_rules",
      thread_id: `area:${rule.area}`,
      content: rule,
    }).catch(() => {});
  }

  // ── New Note (Phase 4) ───────────────────────────────────────────────────
  function handleNewNote(kind: "text" | "voice" | "camera" | "handwriting") {
    const id = `new-${Date.now()}`;
    const prefixes: Record<string, string> = {
      text: "New Text Note",
      voice: "Voice Note",
      camera: "Camera / OCR Note",
      handwriting: "Handwriting Note",
    };
    const newNote: Note = {
      id,
      title: prefixes[kind],
      preview: kind === "voice" ? "Recording…" : kind === "camera" ? "OCR processing…" : "Start typing…",
      blocks: [{ type: "paragraph", text: "" }],
      summary: "",
      tags: [],
      supertags: [],
      backlinks: [],
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      metadata: {
        hasVoice: kind === "voice",
        hasImage: kind === "camera",
        hasOcr: kind === "camera",
      },
    };
    DEMO_NOTES.unshift(newNote);
    setSelectedId(id);
  }

  // ── Keyboard nav (Phase 10) ──────────────────────────────────────────────
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") setSelectedId(null);
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      (document.querySelector('[aria-label="Search notes"]') as HTMLElement | null)?.focus();
    }
  }

  onMount(() => { window.addEventListener("keydown", handleKeyDown); });
  onCleanup(() => { window.removeEventListener("keydown", handleKeyDown); });

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      aria-label="Notes"
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        "min-height": "0",
        background: TOKEN.bg,
        "font-family": "Inter, system-ui, sans-serif",
        "font-feature-settings": '"ss01"',
        "border-radius": "1em",
        overflow: "hidden",
        border: `1px solid ${TOKEN.border}`,
      }}
    >
      {/* Phase 2 — Top bar */}
      <NoteTopBar
        query={query()}
        onQuery={setQuery}
        viewMode={viewMode()}
        onViewMode={setViewMode}
        onNewNote={handleNewNote}
        sidebarOpen={sidebarOpen()}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />

      {/* Body row */}
      <div style={{ display: "flex", flex: 1, "min-height": 0, overflow: "hidden" }}>
        {/* Phase 2 — Left sidebar */}
        <NoteLeftSidebar
          open={sidebarOpen()}
          activeFilter={activeFilter()}
          onFilter={setActiveFilter}
          allTags={allTags()}
          allSupertags={allSupertags()}
          folders={folders()}
          areas={areas()}
          onSetFolderRule={handleSetFolderRule}
          onSetAreaRule={handleSetAreaRule}
        />

        {/* Main content */}
        <main
          aria-label="Note list"
          style={{
            flex: 1,
            "overflow-y": "auto",
            padding: TOKEN.padding.main,
            display: "flex",
            "flex-direction": "column",
            gap: TOKEN.gap.section,
            "min-width": 0,
          }}
        >
          {/* Phase 5 — Ask your notes bar */}
          <AskNotesBar notes={allNotes()} />

          {/* Note count / empty state */}
          <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between" }}>
            <p style={{ margin: 0, "font-size": "0.8125em", color: TOKEN.textSecondary }}>
              {filteredNotes().length} note{filteredNotes().length !== 1 ? "s" : ""}
              <Show when={query()}> matching <strong style={{ color: TOKEN.text }}>"{query()}"</strong></Show>
            </p>
          </div>

          {/* Phase 3 & 6 — Views */}
          <Show when={viewMode() === "list"}>
            <div
              role="list"
              aria-label="Notes list"
              style={{ display: "flex", "flex-direction": "column", gap: TOKEN.gap.card }}
            >
              <For each={filteredNotes()} fallback={
                <div style={{ padding: "3em", "text-align": "center", color: TOKEN.textSecondary, "font-size": "0.9375em" }}>
                  No notes found. Create your first note with the <strong style={{ color: TOKEN.accent }}>+ New Note</strong> button.
                </div>
              }>
                {(note) => (
                  <div role="listitem">
                    <NoteListCard
                      note={note}
                      selected={selectedId() === note.id}
                      onSelect={() => setSelectedId(note.id === selectedId() ? null : note.id)}
                    />
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={viewMode() === "grid"}>
            <div
              role="list"
              aria-label="Notes grid"
              style={{
                display: "flex",
                "flex-wrap": "wrap",
                gap: TOKEN.gap.card,
              }}
            >
              <For each={filteredNotes()} fallback={
                <div style={{ padding: "3em", "text-align": "center", color: TOKEN.textSecondary, "font-size": "0.9375em" }}>
                  No notes found.
                </div>
              }>
                {(note) => (
                  <div role="listitem">
                    <NoteGridCard
                      note={note}
                      selected={selectedId() === note.id}
                      onSelect={() => setSelectedId(note.id === selectedId() ? null : note.id)}
                    />
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={viewMode() === "graph"}>
            <NoteGraphView
              notes={filteredNotes()}
              selectedId={selectedId()}
              onSelectNote={(id) => setSelectedId(id === selectedId() ? null : id)}
            />
          </Show>
        </main>

        {/* Phase 2 + 7 — Right panel (shown when note selected) */}
        <Show when={selectedNote()}>
          <NoteRightPanel
            note={selectedNote()}
            allNotes={allNotesResolved()}
            onClose={() => setSelectedId(null)}
            onSelectNote={(id) => setSelectedId(id)}
            onTagUpdate={handleTagUpdate}
          />
        </Show>
      </div>

      {/* Folder rule modal */}
      <Show when={folderRuleTarget()}>
        {(folder) => (
          <FolderRuleModal
            folder={folder()}
            onSave={saveFolderRule}
            onClose={() => setFolderRuleTarget(null)}
          />
        )}
      </Show>

      {/* Area rule modal */}
      <Show when={areaRuleTarget()}>
        {(target) => (
          <AreaRuleModal
            area={target() === "new" ? undefined : (target() as Area)}
            onSave={saveAreaRule}
            onClose={() => setAreaRuleTarget(null)}
          />
        )}
      </Show>
    </div>
  );
}
