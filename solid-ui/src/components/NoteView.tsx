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
import { recordShortcutUse } from "@/lib/shortcutRecency";
import {
  sendNoteMessage,
  sendAfpMessage,
  fetchThread,
  subscribeThread,
  type AfpMessage,
  type FolderRulePayload,
  type AreaRulesPayload,
  type NoteContentPayload,
} from "@/lib/api";
import type { Area, BacklinkRef, Folder, Note } from "@/lib/noteDomain";
import { noteRelativeTime } from "@/lib/noteRelativeTime";
import { afpRecord } from "@/lib/afpMessageRecord";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import {
  afpNoteFromMessage,
  areaFromRuleMessage,
  folderFromRuleMessage,
  noteFromAfpMessage,
  notePreviewFromBody,
  noteStringArray,
  noteTagUpdateFromMessage,
  resolveNoteTags,
  type NoteTagUpdate,
} from "@/lib/noteViewState";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Data model
// ─────────────────────────────────────────────────────────────────────────────

function backlinkTargetExists(backlink: BacklinkRef, notes: Note[]): boolean {
  return notes.some((note) => note.id === backlink.targetId);
}

interface NoteDraft {
  title: string;
  body: string;
}
type NoteSaveState = {
  state: "idle" | "saving" | "saved" | "warning" | "error";
  message?: string;
  savedAt?: string;
};

type NotePersistedMeta = {
  threadId: string;
  messageId: string;
  savedAt: string;
};

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

function noteBodyFromBlocks(note: Note): string {
  const blockText = note.blocks
    .map((block) => block.text?.trim() || block.ocrText?.trim() || "")
    .filter(Boolean)
    .join("\n\n");
  return blockText || note.summary || note.preview || "";
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
  focusMode: boolean;
  onToggleFocus: () => void;
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
            type="text"
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

      {/* Focus mode toggle */}
      <button
        aria-label={props.focusMode ? "Exit focus mode" : "Enter focus mode (distraction-free writing)"}
        onClick={props.onToggleFocus}
        title={props.focusMode ? "Exit focus mode" : "Focus mode — hide all navigation"}
        style={{
          "min-width": TOKEN.touchTarget,
          "min-height": TOKEN.touchTarget,
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          background: props.focusMode ? TOKEN.accent : "transparent",
          border: props.focusMode ? "none" : `1px solid ${TOKEN.border}`,
          cursor: "pointer",
          "border-radius": TOKEN.radius.button,
          color: props.focusMode ? "#fff" : TOKEN.textSecondary,
          transition: TOKEN.transition,
          "flex-shrink": "0",
        }}
      >
        <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden>
          <Show when={!props.focusMode}>
            <path d="M1 1h4M11 1h4M1 15h4M11 15h4M1 1v4M15 1v4M1 15v-4M15 15v-4" />
          </Show>
          <Show when={props.focusMode}>
            <path d="M5 1H1v4M11 1h4v4M5 15H1v-4M11 15h4v-4" />
          </Show>
        </svg>
      </button>

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
  const prioritySupertags = [
    "Profile",
    "People",
    "Relationships",
    "Objectives",
    "Values",
    "Knowledge",
    "Work",
    "Life",
    "Infrastructure",
  ];
  const visibleSupertags = createMemo(() => {
    const available = new Set(props.allSupertags);
    const ordered = prioritySupertags.filter((tag) => available.has(tag));
    const remaining = props.allSupertags
      .filter((tag) => !prioritySupertags.includes(tag))
      .sort((a, b) => a.localeCompare(b));
    return [...ordered, ...remaining].slice(0, 12);
  });

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

      <Show when={props.open && visibleSupertags().length > 0}>
        <div style={{ padding: `${TOKEN.gap.section} ${TOKEN.padding.sidebar} 0` }}>
          <p style={{ "font-size": "0.6875em", "font-weight": "600", "letter-spacing": "0.1em", "text-transform": "uppercase", color: TOKEN.textSecondary, margin: "0 0 0.5em" }}>Seeded domains</p>
          <div style={{ display: "flex", "flex-wrap": "wrap", gap: "0.375em" }}>
            <For each={visibleSupertags()}>
              {(tag) => (
                <button
                  onClick={() => props.onFilter(`supertag:${tag}`)}
                  style={{ padding: "0.25em 0.625em", background: props.activeFilter === `supertag:${tag}` ? TOKEN.accent : TOKEN.bg, color: props.activeFilter === `supertag:${tag}` ? "#fff" : TOKEN.textSecondary, border: `1px solid ${TOKEN.border}`, "border-radius": "9999px", "font-size": "0.8125em", cursor: "pointer", transition: TOKEN.transition, "font-family": "Inter, system-ui, sans-serif", "min-height": TOKEN.touchTarget, display: "flex", "align-items": "center" }}
                  onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = `2px solid ${TOKEN.accent}`; }}
                  onBlur={(e) => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
                >{tag}</button>
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
              <div style={{ display: "flex", "flex-direction": "column", gap: "0.4em", padding: "0.25em 0.625em" }}>
                <p style={{ "font-size": "0.8125em", color: TOKEN.textSecondary, margin: 0 }}>No folders yet</p>
                <p style={{ "font-size": "0.75em", color: TOKEN.textSecondary, margin: 0, "line-height": 1.5 }}>
                  Folder groups appear when notes are organized into recurring buckets.
                </p>
              </div>
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
              <div style={{ display: "flex", "flex-direction": "column", gap: "0.45em", padding: "0.25em 0.625em" }}>
                <p style={{ "font-size": "0.8125em", color: TOKEN.textSecondary, margin: 0 }}>No areas yet</p>
                <button
                  type="button"
                  onClick={() => props.onSetAreaRule(undefined)}
                  style={{
                    width: "fit-content",
                    border: `1px solid ${TOKEN.border}`,
                    background: TOKEN.bg,
                    color: TOKEN.text,
                    "border-radius": "9999px",
                    padding: "0.35em 0.7em",
                    cursor: "pointer",
                    "font-size": "0.75em",
                    "font-weight": 600,
                    "min-height": TOKEN.touchTarget,
                  }}
                >
                  Create area rule
                </button>
              </div>
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
          {noteRelativeTime(props.note.updatedAt)}
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
          {noteRelativeTime(props.note.updatedAt)}
        </span>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — Knowledge Graph
// ─────────────────────────────────────────────────────────────────────────────

function NoteGraphView(props: {
  notes: Note[];
  onSelectNote: (id: string) => void;
  selectedId: string | null;
}) {
  const graphNodes = createMemo(() => {
    const count = Math.max(props.notes.length, 1);
    const radius = Math.min(140, 62 + count * 10);
    return props.notes.map((note, index) => {
      const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
      return {
        note,
        x: 400 + radius * Math.cos(angle),
        y: 190 + radius * Math.sin(angle),
        label: note.title.length > 22 ? `${note.title.slice(0, 21)}…` : note.title,
      };
    });
  });
  const graphEdges = createMemo(() => {
    const byId = new Map(graphNodes().map((node) => [node.note.id, node]));
    return graphNodes().flatMap((source) => source.note.backlinks.flatMap((link) => {
      const target = byId.get(link.targetId);
      return target ? [{ source, target, relation: link.relation }] : [];
    }));
  });

  return (
    <div
      aria-label="Note knowledge graph"
      style={{
        width: "100%",
        background: TOKEN.surface,
        "border-radius": TOKEN.radius.gridCard,
        border: `1px solid ${TOKEN.border}`,
        padding: "1em",
        display: "flex",
        "flex-direction": "column",
        gap: "0.75em",
      }}
    >
      <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", gap: "1em" }}>
        <div>
          <h2 style={{ margin: 0, "font-size": "0.9375em", "font-weight": "600", color: TOKEN.text }}>Knowledge graph</h2>
          <p style={{ margin: "0.25em 0 0", "font-size": "0.75em", color: TOKEN.textSecondary }}>
            Each note is a node. Saved links between notes are shown as edges.
          </p>
        </div>
      </div>
      <Show
        when={graphNodes().length > 0}
        fallback={<div style={{ padding: "2em", "text-align": "center", color: TOKEN.textSecondary, "font-size": "0.875em" }}>Create a note to start your graph.</div>}
      >
        <div style={{ overflow: "auto", "border-radius": "0.875em", background: TOKEN.bg, border: `1px solid ${TOKEN.border}` }}>
          <svg viewBox="0 0 800 380" role="img" aria-label="Knowledge graph of linked notes" style={{ display: "block", width: "100%", "min-width": "34em", height: "auto" }}>
            <defs><marker id="note-edge-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L0,7 L7,3.5 z" fill={TOKEN.textSecondary} /></marker></defs>
            <For each={graphEdges()}>{(edge) => <line x1={edge.source.x} y1={edge.source.y} x2={edge.target.x} y2={edge.target.y} stroke={TOKEN.textSecondary} stroke-opacity="0.5" stroke-width="1.5" marker-end="url(#note-edge-arrow)"><title>{edge.relation || "linked"}</title></line>}</For>
            <For each={graphNodes()}>{(node) => (
              <g
                role="button"
                tabindex="0"
                aria-label={`Open note ${node.note.title}`}
                onClick={() => props.onSelectNote(node.note.id)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onSelectNote(node.note.id); } }}
                style={{ cursor: "pointer" }}
              >
                <circle cx={node.x} cy={node.y} r={props.selectedId === node.note.id ? "31" : "27"} fill={props.selectedId === node.note.id ? TOKEN.accent : TOKEN.surface} stroke={props.selectedId === node.note.id ? TOKEN.accent : TOKEN.border} stroke-width="2" />
                <text x={node.x} y={node.y + 4} text-anchor="middle" fill={props.selectedId === node.note.id ? "#fff" : TOKEN.text} style={{ "font-size": "11px", "font-weight": "600", "pointer-events": "none" }}>{node.label}</text>
              </g>
            )}</For>
          </svg>
        </div>
        <p style={{ margin: 0, "font-size": "0.75em", color: TOKEN.textSecondary }}>{graphNodes().length} note{graphNodes().length === 1 ? "" : "s"} · {graphEdges().length} link{graphEdges().length === 1 ? "" : "s"}. Select a node to open it.</p>
      </Show>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9 — 3D Block viewer (three.js, lazy, with fallback)
// ─────────────────────────────────────────────────────────────────────────────

function NoteGraphAccessPane(props: {
  open: boolean;
  onToggle: () => void;
  notes: Note[];
  selectedId: string | null;
  onSelectNote: (id: string) => void;
  folders: Folder[];
  areas: Area[];
  tags: string[];
  supertags: string[];
  activeBrowserFilter: string;
  onApplyBrowserFilter: (filter: string) => void;
}) {
  const [scopeMenu, setScopeMenu] = createSignal<"all" | "areas" | "folders" | "tags" | "supertags">("all");
  const [scopeFilter, setScopeFilter] = createSignal("all");
  const [lastSyncedBrowserFilter, setLastSyncedBrowserFilter] = createSignal("all");
  const [localNeighborhoodOnly, setLocalNeighborhoodOnly] = createSignal(false);
  const [showAllNeighborhoodPreview, setShowAllNeighborhoodPreview] = createSignal(false);
  const [neighborhoodRelationFilter, setNeighborhoodRelationFilter] =
    createSignal<"mutual" | "outgoing" | "incoming" | "linked" | null>(null);

  function menuFromFilter(filter: string): "all" | "areas" | "folders" | "tags" | "supertags" {
    if (filter.startsWith("area:")) return "areas";
    if (filter.startsWith("folder:")) return "folders";
    if (filter.startsWith("tag:")) return "tags";
    if (filter.startsWith("supertag:")) return "supertags";
    return "all";
  }

  function applyGraphScope(filter: string, options?: { keepNeighborhood?: boolean }) {
    setScopeMenu(menuFromFilter(filter));
    setScopeFilter(filter);
    setShowAllNeighborhoodPreview(false);
    setNeighborhoodRelationFilter(null);
    if (!options?.keepNeighborhood) {
      setLocalNeighborhoodOnly(false);
    }
  }

  createEffect(() => {
    if (scopeMenu() === "all") setScopeFilter("all");
  });

  createEffect(() => {
    if (!selectedNote() && localNeighborhoodOnly()) {
      setLocalNeighborhoodOnly(false);
    }
  });

  createEffect(() => {
    if (!localNeighborhoodOnly()) {
      setShowAllNeighborhoodPreview(false);
      setNeighborhoodRelationFilter(null);
    }
  });

  createEffect(() => {
    if (!props.open) return;
    const browserFilter = props.activeBrowserFilter || "all";
    const currentlyFollowingBrowser =
      scopeFilter() === "all"
      || scopeFilter() === lastSyncedBrowserFilter();
    if (!currentlyFollowingBrowser) return;
    applyGraphScope(browserFilter);
    setLastSyncedBrowserFilter(browserFilter);
  });

  const scopedNotes = createMemo<Note[]>(() => {
    const filter = scopeFilter();
    if (filter === "all") return props.notes;
    if (filter.startsWith("area:")) return props.notes.filter((note) => note.areaId === filter.slice(5));
    if (filter.startsWith("folder:")) return props.notes.filter((note) => note.folderId === filter.slice(7));
    if (filter.startsWith("tag:")) return props.notes.filter((note) => note.tags.includes(filter.slice(4)));
    if (filter.startsWith("supertag:")) return props.notes.filter((note) => note.supertags.includes(filter.slice(9)));
    return props.notes;
  });

  const scopeLabel = createMemo(() => {
    const filter = scopeFilter();
    if (filter === "all") return "All notes";
    if (filter.startsWith("area:")) return `Area: ${filter.slice(5)}`;
    if (filter.startsWith("folder:")) return `Folder: ${filter.slice(7)}`;
    if (filter.startsWith("tag:")) return `Tag: ${filter.slice(4)}`;
    if (filter.startsWith("supertag:")) return `Supertag: ${filter.slice(9)}`;
    return "All notes";
  });

  const browserScopeLabel = createMemo(() => {
    const filter = props.activeBrowserFilter || "all";
    if (filter === "all") return "All notes";
    if (filter.startsWith("area:")) return `Area: ${filter.slice(5)}`;
    if (filter.startsWith("folder:")) return `Folder: ${filter.slice(7)}`;
    if (filter.startsWith("tag:")) return `Tag: ${filter.slice(4)}`;
    if (filter.startsWith("supertag:")) return `Supertag: ${filter.slice(9)}`;
    return "All notes";
  });

  const selectedNote = createMemo(() =>
    props.notes.find((note) => note.id === props.selectedId) ?? null,
  );

  const selectedNeighborhoodIds = createMemo<Set<string>>(() => {
    const note = selectedNote();
    if (!note) return new Set<string>();
    const ids = new Set<string>([note.id]);
    for (const backlink of note.backlinks) ids.add(backlink.targetId);
    for (const candidate of props.notes) {
      if (candidate.backlinks.some((backlink) => backlink.targetId === note.id)) {
        ids.add(candidate.id);
      }
    }
    return ids;
  });

  const selectedNoteScopeOptions = createMemo<Array<{ label: string; filter: string }>>(() => {
    const note = selectedNote();
    if (!note) return [];
    const options: Array<{ label: string; filter: string }> = [];
    if (note.areaId) options.push({ label: `Area: ${note.areaId}`, filter: `area:${note.areaId}` });
    if (note.folderId) {
      const folderName = props.folders.find((folder) => folder.id === note.folderId)?.name ?? note.folderId;
      options.push({ label: `Folder: ${folderName}`, filter: `folder:${note.folderId}` });
    }
    for (const tag of note.tags.slice(0, 4)) {
      options.push({ label: `Tag: ${tag}`, filter: `tag:${tag}` });
    }
    for (const tag of note.supertags.slice(0, 4)) {
      options.push({ label: `Supertag: ${tag}`, filter: `supertag:${tag}` });
    }
    return options.filter(
      (option, index, array) => array.findIndex((entry) => entry.filter === option.filter) === index,
    );
  });

  const browserHandoffLabel = createMemo(() => {
    if (scopeFilter() === "all") return "Open selection in browser";
    if (scopeFilter().startsWith("area:")) return `Open area in browser`;
    if (scopeFilter().startsWith("folder:")) return `Open folder in browser`;
    if (scopeFilter().startsWith("tag:")) return `Open tag in browser`;
    if (scopeFilter().startsWith("supertag:")) return `Open supertag in browser`;
    return "Open selection in browser";
  });

  const selectedNotePrimaryScope = createMemo<{ label: string; filter: string } | null>(() =>
    selectedNoteScopeOptions()[0] ?? null,
  );

  const selectedNoteMatchReasons = createMemo<string[]>(() => {
    const note = selectedNote();
    if (!note) return [];
    const filter = scopeFilter();
    if (filter === "all") return ["Visible in the current all-notes graph slice."];
    if (filter.startsWith("area:") && note.areaId === filter.slice(5)) {
      return [`Matches area ${filter.slice(5)}.`];
    }
    if (filter.startsWith("folder:") && note.folderId === filter.slice(7)) {
      const folderName = props.folders.find((folder) => folder.id === note.folderId)?.name ?? filter.slice(7);
      return [`Matches folder ${folderName}.`];
    }
    if (filter.startsWith("tag:") && note.tags.includes(filter.slice(4))) {
      return [`Carries tag ${filter.slice(4)}.`];
    }
    if (filter.startsWith("supertag:") && note.supertags.includes(filter.slice(9))) {
      return [`Carries supertag ${filter.slice(9)}.`];
    }
    const reasons: string[] = [];
    if (note.areaId) reasons.push(`Area ${note.areaId}`);
    if (note.folderId) {
      reasons.push(`Folder ${props.folders.find((folder) => folder.id === note.folderId)?.name ?? note.folderId}`);
    }
    for (const tag of note.tags.slice(0, 2)) reasons.push(`Tag ${tag}`);
    for (const tag of note.supertags.slice(0, 2)) reasons.push(`Supertag ${tag}`);
    return reasons.length > 0
      ? [`Visible here, with stronger context available through ${reasons.join(", ")}.`]
      : ["Visible in the current graph slice."];
  });

  const currentOptions = createMemo<Array<{ id: string; label: string; filter: string }>>(() => {
    if (scopeMenu() === "areas") {
      return props.areas.map((area) => ({ id: area.id, label: area.id, filter: `area:${area.id}` }));
    }
    if (scopeMenu() === "folders") {
      return props.folders.map((folder) => ({ id: folder.id, label: folder.name, filter: `folder:${folder.id}` }));
    }
    if (scopeMenu() === "tags") {
      return props.tags.map((tag) => ({ id: tag, label: tag, filter: `tag:${tag}` }));
    }
    if (scopeMenu() === "supertags") {
      return props.supertags.map((tag) => ({ id: tag, label: tag, filter: `supertag:${tag}` }));
    }
    return [{ id: "all", label: "All notes", filter: "all" }];
  });

  const menuHint = createMemo(() => {
    if (scopeMenu() === "areas") return "PARA-adjacent access via existing note areas.";
    if (scopeMenu() === "folders") return "Folder-scoped graph access inside the current note model.";
    if (scopeMenu() === "tags") return "Tag-based graph narrowing.";
    if (scopeMenu() === "supertags") return "Higher-level topic narrowing through supertags.";
    return "Open the graph without leaving the editor flow.";
  });

  const neighborhoodHint = createMemo(() =>
    localNeighborhoodOnly()
      ? "Showing the selected note and its nearby links only."
      : "Broad graph scope."
  );

  const graphNotes = createMemo<Note[]>(() => {
    const base = scopedNotes();
    if (!localNeighborhoodOnly()) return base;
    const neighborhoodIds = selectedNeighborhoodIds();
    if (neighborhoodIds.size === 0) return base;
    return base.filter((note) => neighborhoodIds.has(note.id));
  });

  const neighborhoodSummary = createMemo(() => {
    if (!localNeighborhoodOnly()) return null;
    const selectedId = props.selectedId;
    const linkedCount = graphNotes().filter((note) => note.id !== selectedId).length;
    if (linkedCount <= 0) return "No nearby linked notes yet.";
    if (linkedCount === 1) return "1 linked note in this local neighborhood.";
    return `${linkedCount} linked notes in this local neighborhood.`;
  });

  const neighborhoodLinkedPreview = createMemo(() => {
    if (!localNeighborhoodOnly()) return [];
    const selectedId = props.selectedId;
    const relationFilter = neighborhoodRelationFilter();
    const ranked = graphNotes()
      .filter((note) => note.id !== selectedId)
      .filter((note) => !relationFilter || neighborhoodRelationLabel(note) === relationFilter)
      .sort((a, b) => {
        const score = (note: Note) => {
          const relation = neighborhoodRelationLabel(note);
          if (relation === "mutual") return 0;
          if (relation === "outgoing") return 1;
          if (relation === "incoming") return 2;
          return 3;
        };
        return score(a) - score(b) || a.title.localeCompare(b.title);
      });
    return showAllNeighborhoodPreview() ? ranked : ranked.slice(0, 4);
  });

  const neighborhoodLinkedOverflow = createMemo(() => {
    if (!localNeighborhoodOnly()) return 0;
    const selectedId = props.selectedId;
    const totalLinked = graphNotes().filter((note) => note.id !== selectedId).length;
    return Math.max(0, totalLinked - neighborhoodLinkedPreview().length);
  });

  const neighborhoodPreviewLabel = createMemo(() => {
    const shown = neighborhoodLinkedPreview().length;
    const total = graphNotes().filter((note) => note.id !== props.selectedId).length;
    if (!showAllNeighborhoodPreview()) return `Nearby strongest: ${shown} of ${total}`;
    return `All nearby: ${shown}`;
  });

  const neighborhoodRelationMix = createMemo(() => {
    if (!localNeighborhoodOnly()) return [];
    const totals = {
      mutual: 0,
      outgoing: 0,
      incoming: 0,
      linked: 0,
    };
    for (const note of graphNotes()) {
      if (note.id === props.selectedId) continue;
      const relation = neighborhoodRelationLabel(note);
      totals[relation] += 1;
    }
    return [
      totals.mutual > 0 ? { relation: "mutual" as const, label: `${totals.mutual} mutual` } : null,
      totals.outgoing > 0 ? { relation: "outgoing" as const, label: `${totals.outgoing} outgoing` } : null,
      totals.incoming > 0 ? { relation: "incoming" as const, label: `${totals.incoming} incoming` } : null,
      totals.linked > 0 ? { relation: "linked" as const, label: `${totals.linked} linked` } : null,
    ].filter((value): value is { relation: "mutual" | "outgoing" | "incoming" | "linked"; label: string } => Boolean(value));
  });

  const activeNeighborhoodRelationFilterLabel = createMemo(() => {
    const active = neighborhoodRelationFilter();
    if (!active) return null;
    const total = graphNotes().filter((note) => note.id !== props.selectedId).length;
    const shown = neighborhoodLinkedPreview().length;
    if (active === "mutual") return `Filtered: mutual only ${shown} of ${total}`;
    if (active === "outgoing") return `Filtered: outgoing only ${shown} of ${total}`;
    if (active === "incoming") return `Filtered: incoming only ${shown} of ${total}`;
    return `Filtered: linked only ${shown} of ${total}`;
  });

  const activeNeighborhoodRelationEmptyLabel = createMemo(() => {
    const active = neighborhoodRelationFilter();
    if (!active || neighborhoodLinkedPreview().length > 0) return null;
    if (active === "mutual") return "No mutual nearby notes in this local neighborhood.";
    if (active === "outgoing") return "No outgoing nearby notes in this local neighborhood.";
    if (active === "incoming") return "No incoming nearby notes in this local neighborhood.";
    return "No nearby notes match this local link filter.";
  });

  const neighborhoodPreviewStateLabel = createMemo(() => {
    const parts: string[] = [];
    if (showAllNeighborhoodPreview()) {
      parts.push("all nearby expanded");
    } else {
      parts.push("strongest nearby");
    }
    const relation = neighborhoodRelationFilter();
    if (relation) {
      parts.push(`${relation} only`);
    }
    return parts.join(" · ");
  });

  const neighborhoodRelationLabel = (note: Note) => {
    const current = selectedNote();
    if (!current) return "linked";
    const outgoing = current.backlinks.some((backlink) => backlink.targetId === note.id);
    const incoming = note.backlinks.some((backlink) => backlink.targetId === current.id);
    if (outgoing && incoming) return "mutual";
    if (outgoing) return "outgoing";
    if (incoming) return "incoming";
    return "linked";
  };

  return (
    <section
      aria-label="Knowledge graph access"
      style={{
        background: TOKEN.surface,
        border: `1px solid ${TOKEN.border}`,
        "border-radius": TOKEN.radius.gridCard,
        padding: "1em 1.25em",
        display: "flex",
        "flex-direction": "column",
        gap: "0.875em",
      }}
    >
      <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", gap: "1em", "flex-wrap": "wrap" }}>
        <div>
          <p style={{ margin: 0, "font-size": "0.6875em", "font-weight": "700", "letter-spacing": "0.1em", "text-transform": "uppercase", color: TOKEN.textSecondary }}>
            Knowledge graph access
          </p>
          <p style={{ margin: "0.25em 0 0", "font-size": "0.8125em", color: TOKEN.textSecondary }}>
            Explore links between your notes, then select a node to continue editing.
          </p>
        </div>
        <div style={{ display: "flex", "align-items": "center", gap: "0.5em", "flex-wrap": "wrap" }}>
          <Show when={scopeFilter() !== props.activeBrowserFilter}>
            <button
              type="button"
              onClick={() => props.onApplyBrowserFilter(scopeFilter())}
              style={{
                "min-height": TOKEN.touchTarget,
                padding: "0 0.875em",
                border: `1px solid ${TOKEN.border}`,
                "border-radius": "9999px",
                background: TOKEN.bg,
                color: TOKEN.textSecondary,
                cursor: "pointer",
                "font-size": "0.75em",
                "font-family": "Inter, system-ui, sans-serif",
              }}
            >
              Use in browser
            </button>
          </Show>
          <button
            type="button"
            onClick={props.onToggle}
            style={{
              "min-height": TOKEN.touchTarget,
              padding: "0 0.875em",
              border: `1px solid ${TOKEN.border}`,
              "border-radius": "9999px",
              background: props.open ? TOKEN.accent : TOKEN.surface,
              color: props.open ? "#fff" : TOKEN.textSecondary,
              cursor: "pointer",
              "font-size": "0.75em",
              "font-family": "Inter, system-ui, sans-serif",
            }}
          >
            {props.open ? "Hide graph pane" : "Show graph pane"}
          </button>
        </div>
      </div>

      <Show when={props.open}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "0.875em" }}>
          <div style={{ display: "flex", "align-items": "center", gap: "0.5em", "flex-wrap": "wrap" }}>
            <For each={["all", "areas", "folders", "tags", "supertags"] as const}>
              {(menu) => (
                <button
                  type="button"
                  onClick={() => setScopeMenu(menu)}
                  style={{
                    "min-height": TOKEN.touchTarget,
                    padding: "0 0.875em",
                    border: `1px solid ${TOKEN.border}`,
                    "border-radius": "9999px",
                    background: scopeMenu() === menu ? TOKEN.accent : TOKEN.surface,
                    color: scopeMenu() === menu ? "#fff" : TOKEN.textSecondary,
                    cursor: "pointer",
                    "font-size": "0.75em",
                    "font-family": "Inter, system-ui, sans-serif",
                    "text-transform": menu === "all" ? "none" : "capitalize",
                  }}
                >
                  {menu === "all" ? "All notes" : menu}
                </button>
              )}
            </For>
            <Show when={selectedNote()}>
              <button
                type="button"
                onClick={() => setLocalNeighborhoodOnly((value) => !value)}
                style={{
                  "min-height": TOKEN.touchTarget,
                  padding: "0 0.875em",
                  border: `1px solid ${TOKEN.border}`,
                  "border-radius": "9999px",
                  background: localNeighborhoodOnly() ? TOKEN.accent : TOKEN.surface,
                  color: localNeighborhoodOnly() ? "#fff" : TOKEN.textSecondary,
                  cursor: "pointer",
                  "font-size": "0.75em",
                  "font-family": "Inter, system-ui, sans-serif",
                }}
              >
                {localNeighborhoodOnly() ? "Showing linked only" : "Show linked only"}
              </button>
            </Show>
            <Show when={localNeighborhoodOnly()}>
              <button
                type="button"
                onClick={() => setLocalNeighborhoodOnly(false)}
                style={{
                  "min-height": TOKEN.touchTarget,
                  padding: "0 0.875em",
                  border: `1px solid ${TOKEN.border}`,
                  "border-radius": "9999px",
                  background: TOKEN.bg,
                  color: TOKEN.textSecondary,
                  cursor: "pointer",
                  "font-size": "0.75em",
                  "font-family": "Inter, system-ui, sans-serif",
                }}
              >
                Return to broad slice
              </button>
            </Show>
          </div>
          <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", gap: "1em", "flex-wrap": "wrap" }}>
            <p style={{ margin: 0, "font-size": "0.75em", color: TOKEN.textSecondary }}>
              {menuHint()} {neighborhoodHint()}
            </p>
            <span style={{ "font-size": "0.75em", color: TOKEN.textSecondary }}>
              {scopeLabel()} · {graphNotes().length} note{graphNotes().length !== 1 ? "s" : ""}
            </span>
          </div>
          <Show when={neighborhoodSummary()}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "0.5em", "align-items": "flex-start" }}>
              <span
                style={{
                  padding: "0.25em 0.625em",
                  background: TOKEN.bg,
                  color: TOKEN.textSecondary,
                  border: `1px solid ${TOKEN.border}`,
                  "border-radius": "9999px",
                  "font-size": "0.75em",
                  display: "inline-flex",
                  "align-items": "center",
                }}
              >
                {neighborhoodSummary()}
              </span>
              <Show when={neighborhoodLinkedPreview().length > 0}>
                <div style={{ display: "flex", "align-items": "center", gap: "0.4em", "flex-wrap": "wrap" }}>
                  <span style={{ "font-size": "0.72em", color: TOKEN.textSecondary }}>
                    {neighborhoodPreviewLabel()}
                  </span>
                  <Show when={showAllNeighborhoodPreview() || neighborhoodRelationFilter()}>
                    <span
                      style={{
                        padding: "0.18em 0.5em",
                        background: TOKEN.bg,
                        color: TOKEN.textSecondary,
                        border: `1px solid ${TOKEN.border}`,
                        "border-radius": "9999px",
                        "font-size": "0.68em",
                      }}
                    >
                      {neighborhoodPreviewStateLabel()}
                    </span>
                    <Show when={neighborhoodRelationFilter()}>
                      <button
                        type="button"
                        onClick={() => setNeighborhoodRelationFilter(null)}
                        style={{
                          padding: "0.18em 0.5em",
                          background: TOKEN.surface,
                          color: TOKEN.textSecondary,
                          border: `1px solid ${TOKEN.border}`,
                          "border-radius": "9999px",
                          "font-size": "0.68em",
                          cursor: "pointer",
                          "font-family": "Inter, system-ui, sans-serif",
                        }}
                      >
                        Show all relations
                      </button>
                    </Show>
                    <Show when={showAllNeighborhoodPreview() && neighborhoodLinkedPreview().length > 4}>
                      <button
                        type="button"
                        onClick={() => setShowAllNeighborhoodPreview(false)}
                        style={{
                          padding: "0.18em 0.5em",
                          background: TOKEN.surface,
                          color: TOKEN.textSecondary,
                          border: `1px solid ${TOKEN.border}`,
                          "border-radius": "9999px",
                          "font-size": "0.68em",
                          cursor: "pointer",
                          "font-family": "Inter, system-ui, sans-serif",
                        }}
                      >
                        Show strongest only
                      </button>
                    </Show>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAllNeighborhoodPreview(false);
                        setNeighborhoodRelationFilter(null);
                      }}
                      style={{
                        padding: "0.18em 0.5em",
                        background: TOKEN.surface,
                        color: TOKEN.textSecondary,
                        border: `1px solid ${TOKEN.border}`,
                        "border-radius": "9999px",
                        "font-size": "0.68em",
                        cursor: "pointer",
                        "font-family": "Inter, system-ui, sans-serif",
                      }}
                    >
                      Reset local preview
                    </button>
                  </Show>
                  <For each={neighborhoodRelationMix()}>
                    {(item) => (
                      <button
                        type="button"
                        onClick={() =>
                          setNeighborhoodRelationFilter((current) =>
                            current === item.relation ? null : item.relation,
                          )
                        }
                        style={{
                          padding: "0.18em 0.5em",
                          background:
                            neighborhoodRelationFilter() === item.relation ? TOKEN.accent : TOKEN.surface,
                          color:
                            neighborhoodRelationFilter() === item.relation ? "#fff" : TOKEN.textSecondary,
                          border: `1px solid ${TOKEN.border}`,
                          "border-radius": "9999px",
                          "font-size": "0.68em",
                          cursor: "pointer",
                          "font-family": "Inter, system-ui, sans-serif",
                        }}
                      >
                        {item.label}
                      </button>
                    )}
                  </For>
                  <Show when={!showAllNeighborhoodPreview()}>
                    <span
                      style={{
                        padding: "0.18em 0.5em",
                        background: TOKEN.surface,
                        color: TOKEN.textSecondary,
                        border: `1px solid ${TOKEN.border}`,
                        "border-radius": "9999px",
                        "font-size": "0.68em",
                      }}
                    >
                      mutual → outgoing → incoming
                    </span>
                  </Show>
                  <For each={neighborhoodLinkedPreview()}>
                    {(note) => (
                      <button
                        type="button"
                        onClick={() => props.onSelectNote(note.id)}
                        style={{
                          padding: "0.2em 0.55em",
                          background: TOKEN.bg,
                          color: props.selectedId === note.id ? TOKEN.accent : TOKEN.textSecondary,
                          border: `1px solid ${TOKEN.border}`,
                          "border-radius": "9999px",
                          "font-size": "0.72em",
                          cursor: "pointer",
                          "font-family": "Inter, system-ui, sans-serif",
                        }}
                      >
                        {(note.title.trim() || "Untitled note")} · {neighborhoodRelationLabel(note)}
                      </button>
                    )}
                  </For>
                  <Show when={neighborhoodLinkedOverflow() > 0}>
                    <button
                      type="button"
                      onClick={() => setShowAllNeighborhoodPreview(true)}
                      style={{
                        padding: "0.2em 0.55em",
                        background: TOKEN.surface,
                        color: TOKEN.textSecondary,
                        border: `1px dashed ${TOKEN.border}`,
                        "border-radius": "9999px",
                        "font-size": "0.72em",
                        cursor: "pointer",
                        "font-family": "Inter, system-ui, sans-serif",
                      }}
                    >
                      +{neighborhoodLinkedOverflow()} more nearby
                    </button>
                  </Show>
                </div>
              </Show>
              <Show when={activeNeighborhoodRelationEmptyLabel()}>
                <div style={{ display: "flex", "align-items": "center", gap: "0.45em", "flex-wrap": "wrap" }}>
                  <Show when={showAllNeighborhoodPreview() || neighborhoodRelationFilter()}>
                    <span
                      style={{
                        padding: "0.18em 0.5em",
                        background: TOKEN.bg,
                        color: TOKEN.textSecondary,
                        border: `1px solid ${TOKEN.border}`,
                        "border-radius": "9999px",
                        "font-size": "0.68em",
                      }}
                    >
                      {neighborhoodPreviewStateLabel()}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAllNeighborhoodPreview(false);
                        setNeighborhoodRelationFilter(null);
                      }}
                      style={{
                        padding: "0.18em 0.5em",
                        background: TOKEN.surface,
                        color: TOKEN.textSecondary,
                        border: `1px solid ${TOKEN.border}`,
                        "border-radius": "9999px",
                        "font-size": "0.68em",
                        cursor: "pointer",
                        "font-family": "Inter, system-ui, sans-serif",
                      }}
                    >
                      Reset local preview
                    </button>
                  </Show>
                  <span
                    style={{
                      padding: "0.18em 0.5em",
                      background: TOKEN.bg,
                      color: TOKEN.textSecondary,
                      border: `1px solid ${TOKEN.border}`,
                      "border-radius": "9999px",
                      "font-size": "0.68em",
                    }}
                  >
                    {activeNeighborhoodRelationEmptyLabel()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setNeighborhoodRelationFilter(null)}
                    style={{
                      padding: "0.18em 0.5em",
                      background: TOKEN.surface,
                      color: TOKEN.textSecondary,
                      border: `1px solid ${TOKEN.border}`,
                      "border-radius": "9999px",
                      "font-size": "0.68em",
                      cursor: "pointer",
                      "font-family": "Inter, system-ui, sans-serif",
                    }}
                  >
                    Show all relations
                  </button>
                </div>
              </Show>
            </div>
          </Show>
          <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", gap: "1em", "flex-wrap": "wrap" }}>
            <span style={{ "font-size": "0.75em", color: TOKEN.textSecondary }}>
              Browser scope: {browserScopeLabel()}
            </span>
            <div style={{ display: "flex", "align-items": "center", gap: "0.5em", "flex-wrap": "wrap" }}>
              <Show when={props.selectedId && scopeFilter() !== "all"}>
                <button
                  type="button"
                  onClick={() => props.onApplyBrowserFilter(scopeFilter())}
                  style={{
                    "min-height": TOKEN.touchTarget,
                    padding: "0 0.875em",
                    border: `1px solid ${TOKEN.border}`,
                    "border-radius": "9999px",
                    background: TOKEN.bg,
                    color: TOKEN.textSecondary,
                    cursor: "pointer",
                    "font-size": "0.75em",
                    "font-family": "Inter, system-ui, sans-serif",
                  }}
                >
                  {browserHandoffLabel()}
                </button>
              </Show>
              <Show when={selectedNotePrimaryScope()}>
                <button
                  type="button"
                  onClick={() => {
                    const primaryScope = selectedNotePrimaryScope();
                    if (!primaryScope) return;
                    props.onApplyBrowserFilter(primaryScope.filter);
                  }}
                  style={{
                    "min-height": TOKEN.touchTarget,
                    padding: "0 0.875em",
                    border: `1px solid ${TOKEN.border}`,
                    "border-radius": "9999px",
                    background: TOKEN.bg,
                    color: TOKEN.textSecondary,
                    cursor: "pointer",
                    "font-size": "0.75em",
                    "font-family": "Inter, system-ui, sans-serif",
                  }}
                >
                  Open selected note context
                </button>
              </Show>
              <Show when={scopeFilter() !== (props.activeBrowserFilter || "all")}>
                <button
                  type="button"
                  onClick={() => {
                    const browserFilter = props.activeBrowserFilter || "all";
                    applyGraphScope(browserFilter);
                    setLastSyncedBrowserFilter(browserFilter);
                  }}
                  style={{
                    "min-height": TOKEN.touchTarget,
                    padding: "0 0.875em",
                    border: `1px solid ${TOKEN.border}`,
                    "border-radius": "9999px",
                    background: TOKEN.bg,
                    color: TOKEN.textSecondary,
                    cursor: "pointer",
                    "font-size": "0.75em",
                    "font-family": "Inter, system-ui, sans-serif",
                  }}
                >
                  Follow browser scope
                </button>
              </Show>
            </div>
          </div>
          <Show when={selectedNoteScopeOptions().length > 0}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "0.5em" }}>
              <span style={{ "font-size": "0.75em", color: TOKEN.textSecondary }}>
                Current note context: {selectedNote()?.title}
              </span>
              <div style={{ display: "flex", "flex-wrap": "wrap", gap: "0.5em" }}>
                <For each={selectedNoteScopeOptions()}>
                  {(option) => (
                    <button
                      type="button"
                      onClick={() => {
                        applyGraphScope(option.filter);
                      }}
                      style={{
                        padding: "0.25em 0.625em",
                        background: scopeFilter() === option.filter ? TOKEN.accent : TOKEN.bg,
                        color: scopeFilter() === option.filter ? "#fff" : TOKEN.textSecondary,
                        border: `1px solid ${TOKEN.border}`,
                        "border-radius": "9999px",
                        "font-size": "0.8125em",
                        cursor: "pointer",
                        transition: TOKEN.transition,
                        "font-family": "Inter, system-ui, sans-serif",
                        "min-height": TOKEN.touchTarget,
                        display: "flex",
                        "align-items": "center",
                      }}
                    >
                      {option.label}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>
          <Show when={selectedNote()}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "0.5em" }}>
              <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", gap: "1em", "flex-wrap": "wrap" }}>
                <span style={{ "font-size": "0.75em", color: TOKEN.textSecondary }}>
                  Selected graph note fit
                </span>
                <Show when={selectedNotePrimaryScope() && selectedNotePrimaryScope()!.filter !== scopeFilter()}>
                  <button
                    type="button"
                    onClick={() => {
                      const primaryScope = selectedNotePrimaryScope();
                      if (!primaryScope) return;
                      applyGraphScope(primaryScope.filter);
                    }}
                    style={{
                      "min-height": TOKEN.touchTarget,
                      padding: "0 0.875em",
                      border: `1px solid ${TOKEN.border}`,
                      "border-radius": "9999px",
                      background: TOKEN.bg,
                      color: TOKEN.textSecondary,
                      cursor: "pointer",
                      "font-size": "0.75em",
                      "font-family": "Inter, system-ui, sans-serif",
                    }}
                  >
                    Focus graph on selected note
                  </button>
                </Show>
              </div>
              <div style={{ display: "flex", "flex-wrap": "wrap", gap: "0.5em" }}>
                <For each={selectedNoteMatchReasons()}>
                  {(reason) => (
                    <span
                      style={{
                        padding: "0.25em 0.625em",
                        background: TOKEN.bg,
                        color: TOKEN.textSecondary,
                        border: `1px solid ${TOKEN.border}`,
                        "border-radius": "9999px",
                        "font-size": "0.75em",
                        display: "flex",
                        "align-items": "center",
                      }}
                    >
                      {reason}
                    </span>
                  )}
                </For>
              </div>
            </div>
          </Show>
          <div style={{ display: "flex", "flex-wrap": "wrap", gap: "0.5em" }}>
            <For each={currentOptions()} fallback={
              <span style={{ "font-size": "0.75em", color: TOKEN.textSecondary }}>
                No options in this scope yet.
              </span>
            }>
              {(option) => (
                <button
                  type="button"
                  onClick={() => applyGraphScope(option.filter)}
                  style={{
                    padding: "0.25em 0.625em",
                    background: scopeFilter() === option.filter ? TOKEN.accent : TOKEN.bg,
                    color: scopeFilter() === option.filter ? "#fff" : TOKEN.textSecondary,
                    border: `1px solid ${TOKEN.border}`,
                    "border-radius": "9999px",
                    "font-size": "0.8125em",
                    cursor: "pointer",
                    transition: TOKEN.transition,
                    "font-family": "Inter, system-ui, sans-serif",
                    "min-height": TOKEN.touchTarget,
                    display: "flex",
                    "align-items": "center",
                  }}
                >
                  {option.label}
                </button>
              )}
            </For>
          </div>
          <NoteGraphView
            notes={graphNotes()}
            selectedId={props.selectedId}
            onSelectNote={props.onSelectNote}
          />
        </div>
      </Show>
    </section>
  );
}
function ThreeDViewer(props: { modelUrl?: string }) {
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
      <div
        aria-label="3D object viewer"
        role="img"
        style={{
          width: "100%",
          height: "13.75em",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          background:
            "radial-gradient(circle at 30% 30%, rgba(255,107,53,0.18), transparent 45%), linear-gradient(135deg, rgba(28,28,28,0.04), rgba(28,28,28,0.12))",
          color: TOKEN.textSecondary,
          "font-size": "0.875em",
        }}
      >
        3D preview placeholder
      </div>
      <Show when={props.modelUrl}>
        <p style={{ margin: "0", padding: "0.375em 0.75em", "font-size": "0.75em", color: TOKEN.textSecondary }}>
          Model: {props.modelUrl}
        </p>
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

function NoteSupportSection(props: {
  title: string;
  defaultOpen?: boolean;
  children: any;
}) {
  const [open, setOpen] = createSignal(props.defaultOpen ?? false);

  return (
    <section
      aria-label={props.title}
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "0.5em",
        padding: "0.75em",
        background: TOKEN.bg,
        border: `1px solid ${TOKEN.border}`,
        "border-radius": "0.75em",
      }}
    >
      <button
        onClick={() => setOpen((value) => !value)}
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          gap: "0.75em",
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: TOKEN.text,
          "font-size": "0.75em",
          "font-weight": "700",
          "letter-spacing": "0.1em",
          "text-transform": "uppercase",
          "text-align": "left",
          "font-family": "Inter, system-ui, sans-serif",
        }}
      >
        <span>{props.title}</span>
        <span aria-hidden style={{ color: TOKEN.textSecondary, "font-size": "0.9em" }}>
          {open() ? "-" : "+"}
        </span>
      </button>
      <Show when={open()}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "0.625em" }}>{props.children}</div>
      </Show>
    </section>
  );
}

function NoteRightPanel(props: {
  note: Note | null;
  allNotes: Note[];
  onClose: () => void;
  onSelectNote: (id: string) => void;
  onFilter: (filter: string) => void;
  onTagUpdate: (note: Note, removeTags: string[], addTags: string[], removeSupertags: string[], addSupertags: string[]) => void;
  onQuickAction: (note: Note, action: "reminder" | "meeting" | "task") => Promise<void>;
}) {
  return (
    <aside
      aria-label="Note details"
      style={{
        width: "16.5em",
        "min-width": "16.5em",
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
          const [supertagMenu, setSupertagMenu] = createSignal<{ tag: string; x: number; y: number } | null>(null);
          const [quickActionNotice, setQuickActionNotice] = createSignal<string | null>(null);
          const [quickActionBusy, setQuickActionBusy] = createSignal<"reminder" | "meeting" | "task" | null>(null);

          async function runQuickAction(action: "reminder" | "meeting" | "task") {
            setQuickActionBusy(action);
            setQuickActionNotice(null);
            try {
              await props.onQuickAction(note(), action);
              setQuickActionNotice(action === "reminder" ? "Reminder created and linked to this note." : action === "meeting" ? "Meeting follow-up linked to this note." : "Open task created and linked to this note.");
            } catch {
              setQuickActionNotice("This action could not be saved. Please try again.");
            } finally {
              setQuickActionBusy(null);
            }
          }

          function removeTag(tag: string) {
            props.onTagUpdate(note(), [tag], [], [], []);
          }
          function removeSupertag(tag: string) {
            props.onTagUpdate(note(), [], [], [tag], []);
            setSupertagMenu(null);
          }
          function confirmAddTag() {
            const t = newTag().trim().replace(/^#/, "");
            if (t) props.onTagUpdate(note(), [], [`#${t}`], [], []);
            setNewTag("");
            setAddingTag(false);
          }
          createEffect(() => {
            if (!supertagMenu()) return;
            const close = () => setSupertagMenu(null);
            const handleKeyDown = (event: KeyboardEvent) => {
              if (event.key === "Escape") close();
            };
            window.addEventListener("pointerdown", close);
            window.addEventListener("scroll", close, true);
            window.addEventListener("resize", close);
            window.addEventListener("keydown", handleKeyDown);
            onCleanup(() => {
              window.removeEventListener("pointerdown", close);
              window.removeEventListener("scroll", close, true);
              window.removeEventListener("resize", close);
              window.removeEventListener("keydown", handleKeyDown);
            });
          });

          return (
          <div style={{ display: "flex", "flex-direction": "column", gap: "0.875em", padding: "1em" }}>
            {/* Header */}
            <div style={{ display: "flex", "align-items": "flex-start", "justify-content": "space-between", gap: "0.5em" }}>
              <div style={{ display: "flex", "flex-direction": "column", gap: "0.25em" }}>
                <p style={{ margin: 0, "font-size": "0.6875em", "font-weight": "700", "letter-spacing": "0.1em", "text-transform": "uppercase", color: TOKEN.textSecondary }}>
                  Support rail
                </p>
                <h1 style={{ margin: 0, "font-size": "1em", "font-weight": "600", color: TOKEN.text, "line-height": "1.25", "font-feature-settings": '"ss01"' }}>
                  {note().title}
                </h1>
              </div>
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
                    <button
                      type="button"
                      onClick={() => props.onFilter(`supertag:${t}`)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setSupertagMenu({
                          tag: t,
                          x: Math.min(event.clientX, window.innerWidth - 220),
                          y: Math.min(event.clientY, window.innerHeight - 190),
                        });
                      }}
                      style={{ border: "none", background: "transparent", cursor: "pointer", color: TOKEN.accent, padding: 0, margin: 0, "font-size": "1em", "font-weight": "600", "line-height": 1.2, "font-family": "Inter, system-ui, sans-serif" }}
                      title={`Filter to supertag ${t}`}
                    >
                      {t}
                    </button>
                    <button
                      aria-label={`Remove supertag ${t}`}
                      onClick={() => removeSupertag(t)}
                      style={{ border: "none", background: "transparent", cursor: "pointer", color: TOKEN.accent, "font-size": "0.9em", padding: 0, "line-height": 1, display: "flex", "align-items": "center" }}
                    >×</button>
                  </span>
                )}
              </For>
              <Show when={supertagMenu()}>
                {(menu) => {
                  const relatedCount = () => props.allNotes.filter((entry) => entry.supertags.includes(menu().tag)).length;
                  return (
                    <div
                      style={{
                        position: "fixed",
                        left: `${menu().x}px`,
                        top: `${menu().y}px`,
                        width: "13.5em",
                        padding: "0.5em",
                        background: "rgba(255,255,255,0.98)",
                        border: `1px solid ${TOKEN.border}`,
                        "border-radius": "1em",
                        "box-shadow": "0 0.75em 2.5em rgba(28,28,28,0.18)",
                        "backdrop-filter": "blur(18px)",
                        "z-index": "140",
                        display: "flex",
                        "flex-direction": "column",
                        gap: "0.25em",
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onContextMenu={(event) => event.preventDefault()}
                    >
                      <div style={{ padding: "0.25em 0.5em 0.375em 0.5em" }}>
                        <p style={{ margin: 0, "font-size": "0.75em", "font-weight": "600", color: TOKEN.text }}>{menu().tag}</p>
                        <p style={{ margin: "0.25em 0 0 0", "font-size": "0.625em", color: TOKEN.textSecondary }}>
                          Higher-level topic narrowing through supertags. Used by {relatedCount()} note{relatedCount() === 1 ? "" : "s"}.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { props.onFilter(`supertag:${menu().tag}`); setSupertagMenu(null); }}
                        style={{ border: "none", background: "transparent", cursor: "pointer", "text-align": "left", padding: "0.5em 0.75em", "border-radius": "0.75em", color: TOKEN.text, "font-size": "0.75em", transition: TOKEN.transition }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = TOKEN.bg; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        Filter to this tag
                      </button>
                      <button
                        type="button"
                        onClick={() => { removeSupertag(menu().tag); }}
                        style={{ border: "none", background: "transparent", cursor: "pointer", "text-align": "left", padding: "0.5em 0.75em", "border-radius": "0.75em", color: "#c2410c", "font-size": "0.75em", transition: TOKEN.transition }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(254,215,170,0.35)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        Remove from this note
                      </button>
                    </div>
                  );
                }}
              </Show>
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
              Updated {noteRelativeTime(note().updatedAt)}
            </p>
            <p style={{ margin: 0, "font-size": "0.8125em", color: TOKEN.textSecondary, "line-height": "1.5" }}>
              Secondary support for summary, backlinks, AI actions, and note metadata.
            </p>

            {/* AI Summary */}
            <NoteSupportSection title="AI Summary" defaultOpen={true}>
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
            </NoteSupportSection>

            {/* AI Actions — Phase 7 */}
            <NoteSupportSection title="AI Actions">
              <AIActionsPanel note={note()} onClose={() => {}} />
            </NoteSupportSection>

            {/* Contextual suggestion chips — Phase 7 */}
            <div style={{ display: "flex", "flex-wrap": "wrap", gap: "0.375em" }}>
              {([
                { action: "reminder" as const, label: "Add reminder", title: "Create a reminder task linked to this note" },
                { action: "meeting" as const, label: "Link to meeting", title: "Create a meeting follow-up linked to this note" },
                { action: "task" as const, label: "Create task", title: "Create an open task linked to this note" },
              ]).map((chip) => (
                <button
                  type="button"
                  title={chip.title}
                  disabled={quickActionBusy() !== null}
                  onClick={() => void runQuickAction(chip.action)}
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
                  {quickActionBusy() === chip.action ? "Saving…" : chip.label}
                </button>
              ))}
            </div>
            <Show when={quickActionNotice()}>
              <p style={{ margin: 0, "font-size": "0.75em", color: TOKEN.textSecondary }}>{quickActionNotice()}</p>
            </Show>

            {/* Backlinks — Phase 6 */}
            <Show when={note().backlinks.length > 0}>
              <NoteSupportSection title="Backlinks" defaultOpen={true}>
                <div style={{ display: "flex", "flex-direction": "column", gap: "0.5em" }}>
                  <For each={note().backlinks}>
                    {(bl) => {
                      const target = () => props.allNotes.find((n) => n.id === bl.targetId);
                      const isBroken = () => !target();
                      return (
                        <button
                          type="button"
                          disabled={isBroken()}
                          title={isBroken() ? "This link is broken" : undefined}
                          onClick={() => target() && props.onSelectNote(bl.targetId)}
                          style={{
                            display: "flex",
                            "align-items": "center",
                            gap: "0.625em",
                            padding: "0.5em 0.75em",
                            background: TOKEN.bg,
                            border: `1px solid ${isBroken() ? "#f2cbc0" : TOKEN.border}`,
                            "border-radius": "0.5em",
                            cursor: isBroken() ? "not-allowed" : "pointer",
                            "font-size": "0.875em",
                            color: isBroken() ? "#9b8f84" : TOKEN.text,
                            "font-family": "Inter, system-ui, sans-serif",
                            "text-align": "left",
                            transition: TOKEN.transition,
                            "min-height": TOKEN.touchTarget,
                            opacity: isBroken() ? "0.78" : "1",
                          }}
                          onMouseEnter={(e) => {
                            if (isBroken()) return;
                            (e.currentTarget as HTMLElement).style.borderColor = TOKEN.accent;
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.borderColor = isBroken() ? "#f2cbc0" : TOKEN.border;
                          }}
                          onFocus={(e) => { (e.currentTarget as HTMLElement).style.outline = `2px solid ${TOKEN.accent}`; }}
                          onBlur={(e) => { (e.currentTarget as HTMLElement).style.outline = "none"; }}
                        >
                          <span aria-hidden style={{ color: isBroken() ? "#b2644b" : TOKEN.accent, "flex-shrink": "0" }}>
                            {isBroken() ? "!" : "->"}
                          </span>
                          <div>
                            <span
                              style={{
                                "font-weight": "500",
                                "text-decoration": isBroken() ? "line-through" : "none",
                                "text-decoration-thickness": isBroken() ? "1px" : undefined,
                              }}
                            >
                              {bl.targetTitle}
                            </span>
                            <span style={{ "font-size": "0.75em", color: TOKEN.textSecondary, display: "block" }}>{bl.relation}</span>
                            <Show when={isBroken()}>
                              <span style={{ "font-size": "0.75em", color: "#b2644b", display: "block" }}>
                                This link is broken
                              </span>
                            </Show>
                          </div>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </NoteSupportSection>
            </Show>

            {/* 3D block — Phase 9 */}
            <Show when={note().metadata.has3d}>
              <NoteSupportSection title="3D Object">
                <ThreeDViewer modelUrl={note().blocks.find((b) => b.type === "3d")?.modelUrl} />
              </NoteSupportSection>
            </Show>

            {/* OCR info — Phase 8 */}
            <Show when={note().metadata.hasOcr}>
              <NoteSupportSection title="OCR">
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
              </NoteSupportSection>
            </Show>

            {/* Version timeline stub */}
            <NoteSupportSection title="Version History">
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
                    <span style={{ color: TOKEN.textSecondary }}>— {noteRelativeTime(v.time)}</span>
                  </button>
                ))}
              </div>
            </NoteSupportSection>
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

function NoteEditorWorkspace(props: {
  note: Note | null;
  onUpdateDraft: (noteId: string, draft: NoteDraft) => void;
  onSaveDraft?: (note: Note) => void;
  onReloadLatest?: (note: Note) => void;
  onKeepDraft?: (note: Note) => void;
  saveState?: NoteSaveState;
  hasLocalDraft?: boolean;
  compactScreen?: boolean;
  browserOpen?: boolean;
  supportOpen?: boolean;
  onToggleBrowser?: () => void;
  onToggleSupport?: () => void;
}) {
  return (
    <Show
      when={props.note}
      fallback={
        <section
          aria-label="Note editor"
          style={{
            background: TOKEN.surface,
            border: `1px solid ${TOKEN.border}`,
            "border-radius": TOKEN.radius.gridCard,
            padding: "1.25em",
          }}
        >
          <p style={{ margin: 0, "font-size": "0.9375em", color: TOKEN.textSecondary }}>
            Select a note to start editing.
          </p>
        </section>
      }
    >
      {(note) => {
        const body = () => noteBodyFromBlocks(note());
        const canSave = () => props.saveState?.state === "warning" || Boolean(props.hasLocalDraft);
        const statusTone = () => {
          if (props.saveState?.state === "saving") {
            return { label: "Saving", bg: `${TOKEN.accent}1A`, color: TOKEN.accent };
          }
          if (props.saveState?.state === "warning") {
            return { label: "Remote update", bg: "#FFF7ED", color: "#B54708" };
          }
          if (props.saveState?.state === "error") {
            return { label: "Save error", bg: "#FEF3F2", color: "#B42318" };
          }
          if (props.hasLocalDraft) {
            return { label: "Draft", bg: `${TOKEN.accent}14`, color: TOKEN.accent };
          }
          if (props.saveState?.state === "saved") {
            return { label: "Synced", bg: "#E8F5EC", color: "#2E8B57" };
          }
          return { label: "Ready", bg: TOKEN.bg, color: TOKEN.textSecondary };
        };
        return (
          <section
            aria-label="Note editor"
            style={{
              background: TOKEN.surface,
              border: `1px solid ${TOKEN.border}`,
              "border-radius": TOKEN.radius.gridCard,
              padding: "1.25em",
              display: "flex",
              "flex-direction": "column",
              gap: "0.875em",
            }}
          >
            <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", gap: "1em" }}>
              <div>
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
                  Editor
                </p>
                <p style={{ margin: "0.25em 0 0", "font-size": "0.8125em", color: TOKEN.textSecondary }}>
                  Primary note workspace. Search, graph, and AI tools stay secondary.
                </p>
              </div>
              <div style={{ display: "flex", "align-items": "center", gap: "0.5em", "flex-wrap": "wrap", "justify-content": "flex-end" }}>
                <Show when={props.compactScreen}>
                  <button
                    onClick={() => props.onToggleBrowser?.()}
                    style={{
                      "min-height": "2.25em",
                      padding: "0 0.75em",
                      border: `1px solid ${TOKEN.border}`,
                      "border-radius": "9999px",
                      background: props.browserOpen ? TOKEN.accent : TOKEN.surface,
                      color: props.browserOpen ? "#fff" : TOKEN.textSecondary,
                      cursor: "pointer",
                      "font-size": "0.75em",
                      "font-family": "Inter, system-ui, sans-serif",
                    }}
                  >
                    {props.browserOpen ? "Hide browser" : "Show browser"}
                  </button>
                  <button
                    onClick={() => props.onToggleSupport?.()}
                    style={{
                      "min-height": "2.25em",
                      padding: "0 0.75em",
                      border: `1px solid ${TOKEN.border}`,
                      "border-radius": "9999px",
                      background: props.supportOpen ? TOKEN.accent : TOKEN.surface,
                      color: props.supportOpen ? "#fff" : TOKEN.textSecondary,
                      cursor: "pointer",
                      "font-size": "0.75em",
                      "font-family": "Inter, system-ui, sans-serif",
                    }}
                  >
                    {props.supportOpen ? "Hide support" : "Show support"}
                  </button>
                </Show>
                <span
                  style={{
                    display: "inline-flex",
                    "align-items": "center",
                    "min-height": "2.1em",
                    padding: "0 0.75em",
                    "border-radius": "9999px",
                    background: statusTone().bg,
                    color: statusTone().color,
                    "font-size": "0.75em",
                    "font-weight": "600",
                    "font-family": "Inter, system-ui, sans-serif",
                  }}
                >
                  {statusTone().label}
                </span>
                <span style={{ "font-size": "0.75em", color: TOKEN.textSecondary }}>
                  Updated {noteRelativeTime(note().updatedAt)}
                </span>
                <button
                  onClick={() => props.onSaveDraft?.(note())}
                  disabled={props.saveState?.state === "saving" || !canSave()}
                  style={{
                    "min-height": "2.25em",
                    padding: "0 0.9em",
                    border: "none",
                    "border-radius": "9999px",
                    background: TOKEN.accent,
                    color: "#fff",
                    cursor: props.saveState?.state === "saving" || !canSave() ? "not-allowed" : "pointer",
                    "font-size": "0.75em",
                    "font-weight": "600",
                    "font-family": "Inter, system-ui, sans-serif",
                    opacity: props.saveState?.state === "saving" || !canSave() ? "0.6" : "1",
                  }}
                >
                  {props.saveState?.state === "saving"
                    ? "Saving..."
                    : props.saveState?.state === "warning"
                      ? "Overwrite latest"
                    : props.hasLocalDraft
                      ? "Save changes"
                      : "No changes"}
                </button>
              </div>
            </div>
            <Show when={props.saveState && (props.saveState.state !== "idle" || Boolean(props.saveState.message))}>
              <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", gap: "0.75em", "flex-wrap": "wrap" }}>
                <p
                  style={{
                    margin: 0,
                    "font-size": "0.75em",
                    color:
                      props.saveState?.state === "error"
                        ? "#B42318"
                        : props.saveState?.state === "warning"
                          ? "#B54708"
                          : props.hasLocalDraft
                            ? TOKEN.accent
                          : TOKEN.textSecondary,
                  }}
                >
                  {props.saveState?.message ??
                    (props.saveState?.state === "saved"
                      ? "Saved to AFP note lane."
                      : props.saveState?.state === "warning"
                        ? "A newer AFP note update is available."
                      : props.saveState?.state === "saving"
                        ? "Saving to AFP note lane..."
                        : "")}
                </p>
                <Show when={props.saveState?.state === "warning"}>
                  <div style={{ display: "flex", "align-items": "center", gap: "0.5em", "flex-wrap": "wrap" }}>
                    <button
                      onClick={() => props.onKeepDraft?.(note())}
                      style={{
                        "min-height": "2em",
                        padding: "0 0.75em",
                        border: `1px solid ${TOKEN.border}`,
                        "border-radius": "9999px",
                        background: TOKEN.bg,
                        color: TOKEN.textSecondary,
                        cursor: "pointer",
                        "font-size": "0.75em",
                        "font-weight": "600",
                        "font-family": "Inter, system-ui, sans-serif",
                      }}
                    >
                      Keep draft
                    </button>
                    <button
                      onClick={() => props.onReloadLatest?.(note())}
                      style={{
                        "min-height": "2em",
                        padding: "0 0.75em",
                        border: `1px solid ${TOKEN.border}`,
                        "border-radius": "9999px",
                        background: TOKEN.surface,
                        color: TOKEN.text,
                        cursor: "pointer",
                        "font-size": "0.75em",
                        "font-weight": "600",
                        "font-family": "Inter, system-ui, sans-serif",
                      }}
                    >
                      Load latest
                    </button>
                  </div>
                </Show>
              </div>
            </Show>
            <div
              style={{
                width: "100%",
                "max-width": "65ch",
              }}
            >
              <input
                type="text"
                value={note().title}
                disabled={props.saveState?.state === "saving"}
                onInput={(e) =>
                  props.onUpdateDraft(note().id, {
                    title: e.currentTarget.value,
                    body: body(),
                  })
                }
                aria-label="Note title"
                style={{
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  outline: "none",
                  padding: 0,
                  "font-size": "1.5em",
                  "font-weight": "700",
                  color: TOKEN.text,
                  "font-family": "var(--font-body)",
                }}
              />
              <div style={{ "margin-top": "0.875em" }}>
                <TiptapEditor
                  mode="full"
                  showToolbar={true}
                  initialContent={body()}
                  disabled={props.saveState?.state === "saving"}
                  placeholder="Start writing..."
                  submitLabel={
                    props.saveState?.state === "warning"
                      ? "Overwrite latest"
                      : "Save note"
                  }
                  clearOnSend={false}
                  onChange={(_, markdown) =>
                    props.onUpdateDraft(note().id, {
                      title: note().title,
                      body: markdown,
                    })
                  }
                  onSend={async () => {
                    props.onSaveDraft?.(note());
                  }}
                />
              </div>
            </div>
          </section>
        );
      }}
    </Show>
  );
}

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
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              recordShortcutUse("form_submit");
              ask();
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              recordShortcutUse("form_cancel");
              setQuestion("");
            }
          }}
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
          These rules become a first-class <code style={{ padding: "0.1em 0.35em", "border-radius": "0.35em", background: TOKEN.bg, color: TOKEN.text, "font-family": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace", "font-size": "0.95em" }}>folder_rule</code> AFP message. The Knowledge Curator applies them to all notes in this folder.
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
          An <code style={{ padding: "0.1em 0.35em", "border-radius": "0.35em", background: TOKEN.bg, color: TOKEN.text, "font-family": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace", "font-size": "0.95em" }}>area_rules</code> AFP message spans multiple folders. The Knowledge Curator applies these rules across all folders in this area.
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
  const [focusMode, setFocusMode] = createSignal(false);
  const [activeFilter, setActiveFilter] = createSignal("all");
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [compactScreen, setCompactScreen] = createSignal(false);
  const [browserSectionOpen, setBrowserSectionOpen] = createSignal(true);
  const [supportRailOpen, setSupportRailOpen] = createSignal(true);
  const [graphPaneOpen, setGraphPaneOpen] = createSignal(false);
  const [noteSaveStates, setNoteSaveStates] = createSignal<Record<string, NoteSaveState>>({});
  const [persistedNoteMeta, setPersistedNoteMeta] = createSignal<Record<string, NotePersistedMeta>>({});
  const [refreshedNoteMessages, setRefreshedNoteMessages] = createSignal<Record<string, AfpMessage>>({});
  const [acknowledgedRemoteNoteIds, setAcknowledgedRemoteNoteIds] = createSignal<Record<string, string>>({});
  const [folderRuleTarget, setFolderRuleTarget] = createSignal<Folder | null>(null);
  const [areaRuleTarget, setAreaRuleTarget] = createSignal<Area | "new" | null>(null);
  const [noteDrafts, setNoteDrafts] = createSignal<Record<string, NoteDraft>>({});
  // Local tag deltas applied before the server echoes back (optimistic update)
  const [localTagDeltas, setLocalTagDeltas] = createSignal<NoteTagUpdate[]>([]);

  // Collapse sidebar on narrow screens automatically
  onMount(() => {
    const mq = window.matchMedia("(max-width: 64em)");
    if (mq.matches) setSidebarOpen(false);
    const handler = (e: MediaQueryListEvent) => setSidebarOpen(!e.matches);
    mq.addEventListener("change", handler);

    const compactMq = window.matchMedia("(max-width: 40em)");
    const applyCompactState = (matches: boolean) => {
      setCompactScreen(matches);
      if (matches) {
        setBrowserSectionOpen(false);
        setSupportRailOpen(false);
      } else {
        setBrowserSectionOpen(true);
        setSupportRailOpen(true);
      }
    };
    applyCompactState(compactMq.matches);
    const compactHandler = (e: MediaQueryListEvent) => applyCompactState(e.matches);
    compactMq.addEventListener("change", compactHandler);

    onCleanup(() => {
      mq.removeEventListener("change", handler);
      compactMq.removeEventListener("change", compactHandler);
    });
  });

  // ── Data ─────────────────────────────────────────────────────────────────

  // Parse folder_rule AFP messages → Folder[]
  const folders = createMemo<Folder[]>(() => {
    const msgs = (props.messages ?? []).filter((m) => m.type === "folder_rule");
    const byFolder = new Map<string, Folder>();
    for (const m of msgs) {
      const folder = folderFromRuleMessage(m);
      if (!folder) continue;
      byFolder.set(folder.id, folder);
    }
    return Array.from(byFolder.values());
  });

  // Parse area_rules AFP messages → Area[]
  const areas = createMemo<Area[]>(() => {
    const msgs = (props.messages ?? []).filter((m) => m.type === "area_rules");
    const byArea = new Map<string, Area>();
    for (const m of msgs) {
      const area = areaFromRuleMessage(m);
      if (!area) continue;
      byArea.set(area.id, area);
    }
    return Array.from(byArea.values());
  });

  // Parse tag_update AFP messages (server + local deltas combined)
  const allTagUpdates = createMemo<NoteTagUpdate[]>(() => {
    const fromServer = (props.messages ?? [])
      .filter((m) => m.type === "tag_update")
      .map((m) => noteTagUpdateFromMessage(m));
    return [...fromServer, ...localTagDeltas()];
  });

  // Merge AFP note messages as additional notes
  const afpNotes = createMemo<Note[]>(() =>
    (props.messages ?? [])
      .filter((m) => m.type.includes("note") || m.type === "knowledge_card")
      .map((m) => afpNoteFromMessage(m))
  );

  const allNotes = createMemo<Note[]>(() => [...afpNotes(), ...DEMO_NOTES]);

  // Notes with resolved tags applied
  const allNotesResolved = createMemo<Note[]>(() =>
    allNotes().map((n) => {
      const refreshed = refreshedNoteMessages()[n.id];
      const serverBackedNote = refreshed
        ? {
            ...n,
            ...noteFromAfpMessage(refreshed),
          }
        : n;
      const { tags, supertags } = resolveNoteTags(serverBackedNote, allTagUpdates());
      const draft = noteDrafts()[n.id];
      const persisted = persistedNoteMeta()[n.id];
      if (!draft) {
        return {
          ...serverBackedNote,
          threadId: persisted?.threadId ?? serverBackedNote.threadId,
          messageId: persisted?.messageId ?? serverBackedNote.messageId,
          updatedAt: persisted?.savedAt ?? serverBackedNote.updatedAt,
          tags,
          supertags,
        };
      }
      const preview = notePreviewFromBody(draft.body);
      return {
        ...serverBackedNote,
        threadId: persisted?.threadId ?? serverBackedNote.threadId,
        messageId: persisted?.messageId ?? serverBackedNote.messageId,
        title: draft.title,
        preview: preview || serverBackedNote.preview,
        summary: preview || serverBackedNote.summary,
        blocks: [{ type: "paragraph", text: draft.body }],
        updatedAt: persisted?.savedAt ?? serverBackedNote.updatedAt,
        tags,
        supertags,
      };
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
    } else if (f.startsWith("supertag:")) {
      const supertag = f.slice(9);
      notes = notes.filter((n) => n.supertags.includes(supertag));
    } else if (f.startsWith("folder:")) {
      const fid = f.slice(7);
      notes = notes.filter((n) => n.folderId === fid);
    } else if (f.startsWith("area:")) {
      const aid = f.slice(5);
      notes = notes.filter((n) => n.areaId === aid);
    } else if (f === "ai-groups") {
      notes = notes.filter((n) => n.supertags.length > 0 || n.tags.length > 0);
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

  // filteredNotes is evaluated synchronously by createMemo, so this dependent
  // memo must be declared after it to support opening Notes directly.
  const noteEditorPrimaryId = createMemo<string | null>(() =>
    filteredNotes()[0]?.id ?? allNotesResolved()[0]?.id ?? null
  );

  const selectedNote = createMemo<Note | null>(() =>
    allNotesResolved().find((n) => n.id === selectedId()) ?? null
  );
  const noteBrowserLabel = createMemo(() => {
    const mode = viewMode();
    if (mode === "grid") return "Grid browser";
    if (mode === "graph") return "Graph lens";
    return "List browser";
  });

  function handleReloadLatestNote(note: Note) {
    const refreshed = refreshedNoteMessages()[note.id];
    if (!refreshed) return;
    setNoteDrafts((current) => {
      const next = { ...current };
      delete next[note.id];
      return next;
    });
    setPersistedNoteMeta((current) => ({
      ...current,
      [note.id]: {
        threadId: refreshed.thread_id,
        messageId: refreshed.id,
        savedAt: refreshed.timestamp,
      },
    }));
    setNoteSaveStates((current) => ({
      ...current,
      [note.id]: {
        state: "saved",
        message: "Loaded latest AFP note update.",
        savedAt: refreshed.timestamp,
      },
    }));
    setAcknowledgedRemoteNoteIds((current) => {
      const next = { ...current };
      delete next[note.id];
      return next;
    });
  }

  function handleKeepLocalDraft(note: Note) {
    const refreshed = refreshedNoteMessages()[note.id];
    if (refreshed) {
      setAcknowledgedRemoteNoteIds((current) => ({
        ...current,
        [note.id]: refreshed.id,
      }));
    }
    setNoteSaveStates((current) => ({
      ...current,
      [note.id]: {
        state: "idle",
        message: "Unsaved local edits.",
      },
    }));
  }

  createEffect(() => {
    const primaryId = noteEditorPrimaryId();
    if (!primaryId) return;
    if (selectedId() === null) {
      setSelectedId(primaryId);
    }
  });

  createEffect(() => {
    const currentSelectedId = selectedId();
    if (!currentSelectedId) return;
    const filtered = filteredNotes();
    if (filtered.length === 0) return;
    if (!filtered.some((note) => note.id === currentSelectedId)) {
      setSelectedId(filtered[0]!.id);
    }
  });

  createEffect(() => {
    if (!compactScreen()) return;
    if (selectedNote()) {
      setBrowserSectionOpen(false);
    }
  });

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

  async function handleQuickNoteAction(note: Note, action: "reminder" | "meeting" | "task") {
    const title = note.title.trim() || "Untitled note";
    const actionLabel = action === "reminder" ? "Reminder" : action === "meeting" ? "Meeting follow-up" : "Task";
    await sendAfpMessage({
      thread_id: note.threadId ?? note.id,
      from: "user@omnyid.local",
      to: ["agent://notes"],
      type: action === "meeting" ? "note:ledger_update" : "task",
      kind: action === "meeting" ? "note_meeting_link" : "note_task",
      subtype: `note_${action}`,
      content: {
        kind: action === "meeting" ? "note_meeting_link" : "note_task",
        title: `${actionLabel}: ${title}`,
        source_note_id: note.id,
        source_note_title: title,
        status: "open",
        reminder: action === "reminder",
      },
      references: note.messageId ? [{ id: note.messageId, rel: "source_note" }] : undefined,
      metadata: { origin: "notes_quick_action", note_id: note.id, action },
      memory_scope: { memory_space: "personal", author_mask: "private", author_type: "human", human_only: true },
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

  function clearNoteBrowserFilters() {
    setQuery("");
    setActiveFilter("all");
    setBrowserSectionOpen(true);
  }

  function renderNoteBrowserEmptyState() {
    const filtered = activeFilter() !== "all" || query().trim().length > 0;
    return (
      <div style={{ padding: "3em", "text-align": "center", color: TOKEN.textSecondary, "font-size": "0.9375em" }}>
        <p style={{ margin: 0 }}>
          {filtered
            ? "No notes match the current search or filter."
            : "No notes found yet."}
        </p>
        <div style={{ display: "flex", gap: "0.75em", "justify-content": "center", "flex-wrap": "wrap", "margin-top": "1em" }}>
          <button
            type="button"
            onClick={() => handleNewNote("text")}
            style={{
              border: "none",
              background: TOKEN.accent,
              color: "#fff",
              "border-radius": "0.75em",
              padding: "0.8em 1em",
              cursor: "pointer",
              "font-size": "0.875em",
              "font-weight": 600,
              "min-height": TOKEN.touchTarget,
            }}
          >
            New Note
          </button>
          <Show when={filtered}>
            <button
              type="button"
              onClick={clearNoteBrowserFilters}
              style={{
                border: `1px solid ${TOKEN.border}`,
                background: TOKEN.bg,
                color: TOKEN.text,
                "border-radius": "0.75em",
                padding: "0.8em 1em",
                cursor: "pointer",
                "font-size": "0.875em",
                "font-weight": 500,
                "min-height": TOKEN.touchTarget,
              }}
            >
              Clear filters
            </button>
          </Show>
        </div>
      </div>
    );
  }

  function handleUpdateDraft(noteId: string, draft: NoteDraft) {
    setNoteDrafts((current) => ({
      ...current,
      [noteId]: draft,
    }));
    setNoteSaveStates((current) => ({
      ...current,
      [noteId]: {
        state: "idle",
        message: "Unsaved local edits.",
      },
    }));
  }

  async function refreshNoteFromThread(noteId: string, threadId: string): Promise<AfpMessage | null> {
    const threadMessages = await fetchThread(threadId);
    const latestSavedNote = [...threadMessages]
      .reverse()
      .find((message) => message.type === "note");
    if (!latestSavedNote) return null;
    setRefreshedNoteMessages((current) => ({
      ...current,
      [noteId]: latestSavedNote,
    }));
    setPersistedNoteMeta((current) => ({
      ...current,
      [noteId]: {
        threadId,
        messageId: latestSavedNote.id,
        savedAt: latestSavedNote.timestamp,
      },
    }));
    setAcknowledgedRemoteNoteIds((current) => {
      if (!current[noteId]) return current;
      const next = { ...current };
      delete next[noteId];
      return next;
    });
    return latestSavedNote;
  }

  async function handleSaveNote(note: Note) {
    const draft = noteDrafts()[note.id];
    const body = draft?.body ?? noteBodyFromBlocks(note);
    const title = (draft?.title ?? note.title).trim();
    const summary = notePreviewFromBody(body);
    const threadId = note.threadId ?? note.id;
    const content: NoteContentPayload = {
      title: title || "Untitled note",
      body,
      summary,
      tags: note.tags,
      supertags: note.supertags,
      folder_id: note.folderId,
      area_id: note.areaId,
    };

    setNoteSaveStates((current) => ({
      ...current,
      [note.id]: {
        state: "saving",
        message: "Saving to AFP note lane...",
      },
    }));

    try {
      const messageId = await sendNoteMessage({
        type: "note",
        thread_id: threadId,
        content,
        references: note.messageId ? [{ id: note.messageId }] : undefined,
      });
      const savedAt = new Date().toISOString();
      setPersistedNoteMeta((current) => ({
        ...current,
        [note.id]: {
          threadId,
          messageId,
          savedAt,
        },
      }));
      setNoteSaveStates((current) => ({
        ...current,
        [note.id]: {
          state: "saved",
          message: `Saved to AFP note lane as ${messageId.slice(0, 8)}...`,
          savedAt,
        },
      }));

      try {
        const latestSavedNote = await refreshNoteFromThread(note.id, threadId);
        if (latestSavedNote) {
          setNoteDrafts((current) => {
            const next = { ...current };
            delete next[note.id];
            return next;
          });
          setNoteSaveStates((current) => ({
            ...current,
            [note.id]: {
              state: "saved",
              message: "Saved and refreshed from AFP note lane.",
              savedAt: latestSavedNote.timestamp,
            },
          }));
        }
      } catch {
        setNoteSaveStates((current) => ({
          ...current,
          [note.id]: {
            state: "saved",
            message: "Saved to AFP note lane. Refresh pending.",
            savedAt,
          },
        }));
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save note.";
      setNoteSaveStates((current) => ({
        ...current,
        [note.id]: {
          state: "error",
          message,
        },
      }));
    }
  }

  // ── Keyboard nav (Phase 10) ──────────────────────────────────────────────
  createEffect(() => {
    const note = selectedNote();
    const threadId = note?.threadId;
    if (!note || !threadId) return;

    let cancelled = false;
    const refreshSelectedNote = async () => {
      try {
        const previousMessageId = persistedNoteMeta()[note.id]?.messageId ?? note.messageId ?? null;
        const acknowledgedRemoteId = acknowledgedRemoteNoteIds()[note.id] ?? null;
        const latestSavedNote = await refreshNoteFromThread(note.id, threadId);
        if (!latestSavedNote || cancelled) return;
        if (!noteDrafts()[note.id]) {
          setNoteSaveStates((current) => {
            const previous = current[note.id];
            if (!previous || previous.state === "saving") return current;
            return {
              ...current,
              [note.id]: {
                state: "saved",
                message: "Reconciled with latest AFP note update.",
                savedAt: latestSavedNote.timestamp,
              },
            };
          });
        } else if (
          latestSavedNote.id !== previousMessageId &&
          latestSavedNote.id !== acknowledgedRemoteId
        ) {
          setNoteSaveStates((current) => {
            const previous = current[note.id];
            if (previous?.state === "saving") return current;
            return {
              ...current,
              [note.id]: {
                state: "warning",
                message: "A newer AFP note update arrived while local edits are open. Save to overwrite or keep editing before reloading.",
                savedAt: latestSavedNote.timestamp,
              },
            };
          });
        }
      } catch {
        // Keep the editor stable if background reconciliation misses a frame.
      }
    };

    const unsubscribe = subscribeThread(threadId, () => {
      void refreshSelectedNote();
    });

    onCleanup(() => {
      cancelled = true;
      unsubscribe();
    });
  });

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") setFocusMode(false);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      const note = selectedNote();
      if (!note) return;
      e.preventDefault();
      const saveState = note ? noteSaveStates()[note.id] : undefined;
      const hasLocalDraft = Boolean(note && noteDrafts()[note.id]);
      const canSave = Boolean(
        note &&
        saveState?.state !== "saving" &&
        (saveState?.state === "warning" || hasLocalDraft)
      );
      if (canSave) {
        void handleSaveNote(note);
        return;
      }
      setNoteSaveStates((current) => ({
        ...current,
        [note.id]: {
          state: "idle",
          message: "No local changes to save.",
        },
      }));
      window.setTimeout(() => {
        setNoteSaveStates((current) => {
          const existing = current[note.id];
          if (!existing || existing.message !== "No local changes to save.") {
            return current;
          }
          return {
            ...current,
            [note.id]: {
              state: "idle",
            },
          };
        });
      }, 1800);
    }
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
      <Show when={!focusMode()}>
        <NoteTopBar
          query={query()}
          onQuery={setQuery}
          viewMode={viewMode()}
          onViewMode={setViewMode}
          onNewNote={handleNewNote}
          sidebarOpen={sidebarOpen()}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          focusMode={focusMode()}
          onToggleFocus={() => setFocusMode((v) => !v)}
        />
      </Show>
      <Show when={focusMode()}>
        {/* Minimal focus bar — just title + exit button */}
        <div style={{ display: "flex", "align-items": "center", "justify-content": "flex-end", padding: "0.5em 1em", "flex-shrink": "0", "border-bottom": `1px solid ${TOKEN.border}` }}>
          <button
            onClick={() => setFocusMode(false)}
            title="Exit focus mode"
            style={{ background: "transparent", border: `1px solid ${TOKEN.border}`, "border-radius": TOKEN.radius.button, padding: "0.25em 0.75em", "font-size": "0.8125em", color: TOKEN.textSecondary, cursor: "pointer", "font-family": "Inter, system-ui, sans-serif", transition: TOKEN.transition }}
          >
            ✕ Exit focus
          </button>
        </div>
      </Show>

      {/* Body row */}
      <div style={{ display: "flex", flex: 1, "min-height": 0, overflow: "hidden" }}>
        {/* Phase 2 — Left sidebar (hidden in focus mode) */}
        <NoteLeftSidebar
          open={sidebarOpen() && !focusMode()}
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
          <NoteEditorWorkspace
            note={selectedNote()}
            onUpdateDraft={handleUpdateDraft}
            onSaveDraft={handleSaveNote}
            onReloadLatest={handleReloadLatestNote}
            onKeepDraft={handleKeepLocalDraft}
            saveState={selectedNote() ? noteSaveStates()[selectedNote()!.id] : undefined}
            hasLocalDraft={Boolean(selectedNote() && noteDrafts()[selectedNote()!.id])}
            compactScreen={compactScreen()}
            browserOpen={browserSectionOpen()}
            supportOpen={supportRailOpen()}
            onToggleBrowser={() => setBrowserSectionOpen((value) => !value)}
            onToggleSupport={() => setSupportRailOpen((value) => !value)}
          />
          <NoteGraphAccessPane
            open={graphPaneOpen()}
            onToggle={() => setGraphPaneOpen((value) => !value)}
            notes={allNotesResolved()}
            selectedId={selectedId()}
            onSelectNote={(id) => setSelectedId(id)}
            folders={folders()}
            areas={areas()}
            tags={allTags()}
            supertags={allSupertags()}
            activeBrowserFilter={activeFilter()}
            onApplyBrowserFilter={(filter) => {
              setActiveFilter(filter);
              setBrowserSectionOpen(true);
            }}
          />
          <AskNotesBar notes={allNotesResolved()} />

          <Show when={!compactScreen() || browserSectionOpen()}>
          <section
            aria-label="Note browser"
            style={{
              background: TOKEN.surface,
              border: `1px solid ${TOKEN.border}`,
              "border-radius": TOKEN.radius.gridCard,
              padding: "1em 1.25em",
              display: "flex",
              "flex-direction": "column",
              gap: "0.875em",
            }}
          >
          {/* Note count / empty state */}
          <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between" }}>
            <div>
              <p style={{ margin: 0, "font-size": "0.6875em", "font-weight": "700", "letter-spacing": "0.1em", "text-transform": "uppercase", color: TOKEN.textSecondary }}>
                {noteBrowserLabel()}
              </p>
              <p style={{ margin: "0.25em 0 0", "font-size": "0.8125em", color: TOKEN.textSecondary }}>
                {filteredNotes().length} note{filteredNotes().length !== 1 ? "s" : ""}
                <Show when={query()}> matching <strong style={{ color: TOKEN.text }}>"{query()}"</strong></Show>
              </p>
            </div>
            <p style={{ margin: 0, "font-size": "0.8125em", color: TOKEN.textSecondary }}>
              <Show when={selectedNote()} fallback={<>Select a note to move from browse into edit.</>}>
                Browse stays secondary while the editor is open.
              </Show>
            </p>
          </div>

          {/* Phase 3 & 6 — Views */}
          <div
            style={{
              "max-height": selectedNote() ? "18em" : "none",
              overflow: "auto",
              display: "flex",
              "flex-direction": "column",
              gap: TOKEN.gap.card,
            }}
          >
          <Show when={viewMode() === "list"}>
            <div
              role="list"
              aria-label="Notes list"
              style={{ display: "flex", "flex-direction": "column", gap: TOKEN.gap.card }}
            >
              <For each={filteredNotes()} fallback={renderNoteBrowserEmptyState()}>
                {(note) => (
                  <div role="listitem">
                    <NoteListCard
                      note={note}
                      selected={selectedId() === note.id}
                      onSelect={() => setSelectedId(note.id)}
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
              <For each={filteredNotes()} fallback={renderNoteBrowserEmptyState()}>
                {(note) => (
                  <div role="listitem">
                    <NoteGridCard
                      note={note}
                      selected={selectedId() === note.id}
                      onSelect={() => setSelectedId(note.id)}
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
              onSelectNote={(id) => setSelectedId(id)}
            />
          </Show>
          </div>
          </section>
          </Show>
        </main>

        {/* Phase 2 + 7 — Right panel (shown when note selected) */}
        <Show when={selectedNote() && (!compactScreen() || supportRailOpen())}>
          <NoteRightPanel
            note={selectedNote()}
            allNotes={allNotesResolved()}
            onClose={() => setSelectedId(noteEditorPrimaryId())}
            onSelectNote={(id) => setSelectedId(id)}
            onFilter={(filter) => {
              setActiveFilter(filter);
              setBrowserSectionOpen(true);
            }}
            onTagUpdate={handleTagUpdate}
            onQuickAction={handleQuickNoteAction}
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
