// @locs-version: 1.0
/**
 * TiptapEditor — shared rich text editor for OmnyID.
 *
 * Modes:
 *   compact — minimal toolbar; used in chat composers and short replies
 *   full    — full Notion-like toolbar with headings, tables, images, mentions
 *   email   — email-optimised toolbar with alignment, signature, inline images
 *
 * On submit: fires onSend(payload) with html + text + json + a pre-built AFP
 * message (type: "note" or "email_draft") ready to POST.
 *
 * A2UI: agents pre-fill via type:"rich_text_editor" in an a2ui_render message.
 */

import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { Editor, Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";

import { EditorToolbar } from "./EditorToolbar";
import { PersonaPickerDropdown } from "./PersonaPickerDropdown";
import type { EditorMode } from "@/lib/editorMode";
import type { EditorPayload } from "@/lib/editorPayload";
import type {
  EditorState,
  MentionSuggestion,
  TiptapEditorHandle,
  TiptapEditorKeyContext,
  TiptapEditorProps,
} from "./tiptapEditorTypes";
import { buildEditorAfpMessage } from "@/lib/afpEditor";
import { tiptapToMarkdown } from "@/lib/tiptapMarkdown";
import { sanitizeEmailHtml } from "@/lib/htmlSanitizer";
import { listPersonas, type AgentPersona } from "@/lib/api";
import { stripTrackingParamsFromText } from "@/lib/editorUrlCleanup";
import { toggleSelectedHtmlComment } from "@/lib/editorCommentToggle";
import { formatEditorDatetime, loadEditorDatetimePreference } from "@/lib/editorDatetimePreference";
import { dispatchEditorSubmitEvent } from "@/lib/editorSubmitEvent";
import "./editor.css";

// ── Active persona store (module-level so all editors share it) ───────────

let _activePersona: AgentPersona | null = null;
const _personaListeners: Array<(p: AgentPersona | null) => void> = [];

function setGlobalPersona(p: AgentPersona | null) {
  _activePersona = p;
  _personaListeners.forEach((fn) => fn(p));
}

function onGlobalPersonaChange(fn: (p: AgentPersona | null) => void) {
  _personaListeners.push(fn);
  return () => {
    const i = _personaListeners.indexOf(fn);
    if (i >= 0) _personaListeners.splice(i, 1);
  };
}

async function refreshActivePersona() {
  const data = await listPersonas();
  const active = data.personas.find((p: AgentPersona) => p.is_active) ?? null;
  setGlobalPersona(active);
}

// ── Default editor state ───────────────────────────────────────────────────

const DEFAULT_STATE: EditorState = {
  bold: false, italic: false, strike: false, underline: false, code: false,
  link: false, h1: false, h2: false, h3: false,
  bulletList: false, orderedList: false, taskList: false,
  blockquote: false, codeBlock: false,
  alignLeft: true, alignCenter: false, alignRight: false,
  highlight: false, canUndo: false, canRedo: false,
};

// ── Snapshot editor state from Tiptap ─────────────────────────────────────

function snapshotState(editor: Editor): EditorState {
  return {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    strike: editor.isActive("strike"),
    underline: editor.isActive("underline"),
    code: editor.isActive("code"),
    link: editor.isActive("link"),
    h1: editor.isActive("heading", { level: 1 }),
    h2: editor.isActive("heading", { level: 2 }),
    h3: editor.isActive("heading", { level: 3 }),
    bulletList: editor.isActive("bulletList"),
    orderedList: editor.isActive("orderedList"),
    taskList: editor.isActive("taskList"),
    blockquote: editor.isActive("blockquote"),
    codeBlock: editor.isActive("codeBlock"),
    alignLeft: editor.isActive({ textAlign: "left" }),
    alignCenter: editor.isActive({ textAlign: "center" }),
    alignRight: editor.isActive({ textAlign: "right" }),
    highlight: editor.isActive("highlight"),
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
  };
}

// ── Build mention suggestion renderer ─────────────────────────────────────

function buildMentionSuggestion(suggestions: MentionSuggestion[]) {
  let dropdown: HTMLDivElement | null = null;
  let selectedIndex = 0;
  let currentItems: MentionSuggestion[] = [];

  function renderDropdown(items: MentionSuggestion[], props: SuggestionProps<MentionSuggestion>) {
    dropdown?.remove();
    if (items.length === 0) return;
    currentItems = items;

    dropdown = document.createElement("div");
    dropdown.className = "tiptap-mention-dropdown";
    items.forEach((item, i) => {
      const btn = document.createElement("button");
      btn.textContent = item.label;
      btn.className = i === selectedIndex ? "is-selected" : "";
      btn.onclick = () => {
        props.command({ id: item.id, label: item.label });
        dropdown?.remove();
        dropdown = null;
      };
      dropdown!.appendChild(btn);
    });

    const { clientRect } = props;
    if (clientRect) {
      const rect = clientRect();
      if (rect) {
        dropdown.style.top = `${rect.bottom + 6}px`;
        dropdown.style.left = `${rect.left}px`;
      }
    }
    document.body.appendChild(dropdown);
  }

  return {
    items: ({ query }: { query: string }) => {
      const q = query.toLowerCase();
      return suggestions.filter((s) => s.label.toLowerCase().includes(q)).slice(0, 8);
    },
    render: () => ({
      onStart: (suggestionProps: SuggestionProps<MentionSuggestion>) => {
        selectedIndex = 0;
        renderDropdown(suggestionProps.items, suggestionProps);
      },
      onUpdate: (suggestionProps: SuggestionProps<MentionSuggestion>) => {
        selectedIndex = 0;
        renderDropdown(suggestionProps.items, suggestionProps);
      },
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (!dropdown) return false;
        if (event.key === "ArrowDown") {
          selectedIndex = (selectedIndex + 1) % currentItems.length;
          dropdown.querySelectorAll("button").forEach((b, i) => b.className = i === selectedIndex ? "is-selected" : "");
          return true;
        }
        if (event.key === "ArrowUp") {
          selectedIndex = (selectedIndex - 1 + currentItems.length) % currentItems.length;
          dropdown.querySelectorAll("button").forEach((b, i) => b.className = i === selectedIndex ? "is-selected" : "");
          return true;
        }
        if (event.key === "Enter") {
          dropdown.querySelectorAll("button")[selectedIndex]?.click();
          return true;
        }
        if (event.key === "Escape") {
          dropdown.remove();
          dropdown = null;
          return true;
        }
        return false;
      },
      onExit: () => {
        dropdown?.remove();
        dropdown = null;
      },
    }),
  };
}

// ── Build extension list per mode ──────────────────────────────────────────

const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (element) => element.style.fontSize || null,
          renderHTML: (attributes) => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
        },
      },
    }];
  },
});

function buildExtensions(mode: EditorMode, placeholder: string, mentionSuggestions?: MentionSuggestion[]) {
  const base = [
    StarterKit.configure({
      // Email mode: disable codeBlock for cleaner email HTML
      codeBlock: mode === "email" ? false : undefined,
    }),
    Placeholder.configure({ placeholder }),
  ];

  if (mode === "compact") return base;

  const shared = [
    ...base,
    Underline,
    TextStyle,
    FontSize,
    Color,
    Highlight.configure({ multicolor: false }),
    Link.configure({ openOnClick: false, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Image.configure({ inline: false, allowBase64: true }),
    CharacterCount,
  ];

  if (mode === "email") return shared;

  // Full mode: add table, task list, mentions
  return [
    ...shared,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    ...(mentionSuggestions
      ? [Mention.configure({ HTMLAttributes: { class: "mention" }, suggestion: buildMentionSuggestion(mentionSuggestions) })]
      : []),
  ];
}

// ── Component ─────────────────────────────────────────────────────────────

type SlashCommandEntry = {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  modes: EditorMode[];
  run: (editor: Editor, openPersonaPicker: () => void) => void;
};

type SlashMenuState = {
  x: number;
  y: number;
  from: number;
  to: number;
  query: string;
};

type PendingTablePaste = {
  rows: string[][];
  from: number;
  to: number;
};

function parseDelimitedTableText(text: string): string[][] | null {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized.includes("\n")) return null;
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const delimiter = lines.some((line) => line.includes("\t"))
    ? "\t"
    : lines.every((line) => line.includes(","))
      ? ","
      : null;
  if (!delimiter) return null;

  const rows = lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
  const columnCount = rows[0]?.length ?? 0;
  if (columnCount < 2) return null;
  if (rows.some((row) => row.length !== columnCount)) return null;
  return rows;
}

function escapeTableCellHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildTableHtml(rows: string[][]): string {
  const [header, ...body] = rows;
  const headerHtml = `<tr>${header.map((cell) => `<th><p>${escapeTableCellHtml(cell)}</p></th>`).join("")}</tr>`;
  const bodyHtml = body
    .map((row) => `<tr>${row.map((cell) => `<td><p>${escapeTableCellHtml(cell)}</p></td>`).join("")}</tr>`)
    .join("");
  return `<table><tbody>${headerHtml}${bodyHtml}</tbody></table>`;
}

function isCommentToggleShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.code === "Slash";
}

function isInsertDatetimeShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "k";
}

function detectSlashMenuState(editor: Editor): SlashMenuState | null {
  const { from, empty } = editor.state.selection;
  if (!empty || editor.isActive("codeBlock")) return null;
  const textBefore = editor.state.doc.textBetween(Math.max(0, from - 60), from, "\n");
  const match = textBefore.match(/(?:^|\s)\/([a-z0-9-]*)$/i);
  if (!match) return null;
  const slashIndex = textBefore.lastIndexOf(`/${match[1]}`);
  if (slashIndex < 0) return null;
  const slashFrom = from - (textBefore.length - slashIndex);
  const rect = editor.view.coordsAtPos(from);
  return {
    x: rect.left,
    y: rect.bottom,
    from: slashFrom,
    to: from,
    query: match[1] ?? "",
  };
}

function insertSlashImage(editor: Editor) {
  const url = window.prompt("Image URL or paste data URI");
  if (url) editor.chain().focus().setImage({ src: url }).run();
}

function insertSlashSignature(editor: Editor) {
  editor.chain().focus().insertContent(
    `<p><br/></p><div class="email-signature">--<br/>Sent via OmnyID</div>`
  ).run();
}

function slashCommandsForMode(mode: EditorMode): SlashCommandEntry[] {
  const commands: SlashCommandEntry[] = [
    {
      id: "paragraph",
      title: "Text",
      description: "Continue with a plain paragraph.",
      keywords: ["text", "paragraph", "plain"],
      modes: ["compact", "full", "email"],
      run: (editor) => editor.chain().focus().setParagraph().run(),
    },
    {
      id: "persona",
      title: "Switch persona",
      description: "Pick the active writing persona for this editor.",
      keywords: ["persona", "style", "voice", "tone"],
      modes: ["compact", "full", "email"],
      run: (_editor, openPersonaPicker) => openPersonaPicker(),
    },
    {
      id: "heading-1",
      title: "Heading 1",
      description: "Insert a primary section heading.",
      keywords: ["heading", "title", "h1"],
      modes: ["full", "email"],
      run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      id: "heading-2",
      title: "Heading 2",
      description: "Insert a secondary section heading.",
      keywords: ["heading", "subtitle", "h2"],
      modes: ["full", "email"],
      run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      id: "heading-3",
      title: "Heading 3",
      description: "Insert a compact section heading.",
      keywords: ["heading", "label", "h3"],
      modes: ["full", "email"],
      run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      id: "bullet-list",
      title: "Bullet list",
      description: "Start an unordered list.",
      keywords: ["list", "bullet", "items"],
      modes: ["full", "email"],
      run: (editor) => editor.chain().focus().toggleBulletList().run(),
    },
    {
      id: "ordered-list",
      title: "Numbered list",
      description: "Start an ordered list.",
      keywords: ["list", "numbered", "steps"],
      modes: ["full", "email"],
      run: (editor) => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      id: "divider",
      title: "Divider",
      description: "Insert a horizontal divider.",
      keywords: ["divider", "line", "rule", "separator"],
      modes: ["full", "email"],
      run: (editor) => editor.chain().focus().setHorizontalRule().run(),
    },
    {
      id: "image",
      title: "Image",
      description: "Insert an image from URL or data URI.",
      keywords: ["image", "photo", "media"],
      modes: ["full", "email"],
      run: (editor) => insertSlashImage(editor),
    },
    {
      id: "task-list",
      title: "Task list",
      description: "Track checklist items.",
      keywords: ["task", "todo", "checklist"],
      modes: ["full"],
      run: (editor) => editor.chain().focus().toggleTaskList().run(),
    },
    {
      id: "blockquote",
      title: "Quote",
      description: "Call out quoted or reflective text.",
      keywords: ["quote", "blockquote", "callout"],
      modes: ["full"],
      run: (editor) => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      id: "code-block",
      title: "Code block",
      description: "Insert a fenced code block.",
      keywords: ["code", "snippet", "block"],
      modes: ["full"],
      run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      id: "table",
      title: "Table",
      description: "Insert a 3 x 3 table with a header row.",
      keywords: ["table", "grid", "matrix"],
      modes: ["full"],
      run: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      id: "signature",
      title: "Signature",
      description: "Insert the OmnyID email signature block.",
      keywords: ["signature", "email", "footer"],
      modes: ["email"],
      run: (editor) => insertSlashSignature(editor),
    },
  ];
  return commands.filter((command) => command.modes.includes(mode));
}

function filterSlashCommands(commands: SlashCommandEntry[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return commands.slice(0, 8);
  return commands
    .filter((command) => {
      const haystacks = [command.title, command.description, ...command.keywords];
      return haystacks.some((value) => value.toLowerCase().includes(normalized));
    })
    .slice(0, 8);
}

export function TiptapEditor(props: TiptapEditorProps) {
  let containerRef: HTMLDivElement | undefined;
  let editorInstance: Editor | undefined;

  const [state, setState] = createSignal<EditorState>(DEFAULT_STATE);
  const [charCount, setCharCount] = createSignal(0);
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [isEmpty, setIsEmpty] = createSignal(true);
  const [slashMenu, setSlashMenu] = createSignal<SlashMenuState | null>(null);
  const [slashSelectedIndex, setSlashSelectedIndex] = createSignal(0);
  const [personaRefreshError, setPersonaRefreshError] = createSignal<string | null>(null);
  const [pendingTablePaste, setPendingTablePaste] = createSignal<PendingTablePaste | null>(null);

  // ── Persona picker state ────────────────────────────────────────────────
  const [activePersona, setActivePersona] = createSignal<AgentPersona | null>(_activePersona);
  const [personaPicker, setPersonaPicker] = createSignal<{ x: number; y: number } | null>(null);
  const slashCommands = () => filterSlashCommands(slashCommandsForMode(props.mode), slashMenu()?.query ?? "");

  const placeholderText = () => props.placeholder ?? (
    props.mode === "compact" ? "Write a message…" :
    props.mode === "email"   ? "Compose your email…" :
                               "Start writing…"
  );
  const showToolbar = () => props.showToolbar ?? true;
  const showFooter = () => props.showFooter ?? true;
  const slashCommandsEnabled = () => props.enableSlashCommands ?? true;
  const submitShortcut = () => props.submitShortcut ?? "mod-enter";
  const isReadOnly = () => props.readOnly ?? false;
  const isDisabled = () => props.disabled ?? false;
  const isEditable = () => !isDisabled() && !isReadOnly();
  const isInteractionLocked = () => !isEditable() || isSubmitting();

  function openPersonaPickerAtCursor() {
    if (!isEditable()) return;
    const selection = editorInstance?.view.coordsAtPos(editorInstance.state.selection.from);
    setPersonaPicker(selection ? { x: selection.left, y: selection.bottom } : { x: 100, y: 100 });
  }

  async function loadActivePersona() {
    setPersonaRefreshError(null);
    try {
      await refreshActivePersona();
    } catch {
      setPersonaRefreshError("Could not refresh active persona.");
    }
  }

  function closeSlashMenu() {
    setSlashMenu(null);
    setSlashSelectedIndex(0);
  }

  function dismissTablePastePrompt() {
    if (!isEditable()) return;
    setPendingTablePaste(null);
  }

  function convertPendingPasteToTable() {
    const pending = pendingTablePaste();
    const editor = editorInstance;
    if (!pending || !editor || !isEditable()) return;
    editor
      .chain()
      .focus()
      .setTextSelection({ from: pending.from, to: pending.to })
      .deleteSelection()
      .insertContent(buildTableHtml(pending.rows))
      .run();
    setPendingTablePaste(null);
  }

  function executeSlashCommand(command: SlashCommandEntry) {
    const currentMenu = slashMenu();
    if (!editorInstance || !currentMenu || !isEditable()) return;
    editorInstance.chain().focus().deleteRange({ from: currentMenu.from, to: currentMenu.to }).run();
    command.run(editorInstance, openPersonaPickerAtCursor);
    closeSlashMenu();
  }

  onMount(() => {
    // Load the current active persona
    void loadActivePersona();
    const unsub = onGlobalPersonaChange(setActivePersona);

    editorInstance = new Editor({
      element: containerRef!,
      extensions: buildExtensions(props.mode, placeholderText(), props.mentionSuggestions),
      content: props.initialContent ?? "",
      editable: isEditable(),
      editorProps: {
        handleDOMEvents: {
          focus: () => {
            props.onFocus?.();
            return false;
          },
          blur: () => {
            props.onBlur?.();
            return false;
          },
        },
        handleKeyDown: (_view, event) => {
          const editor = editorInstance;
          if (!editor) return false;
          if (!isEditable()) return false;
          if (isInsertDatetimeShortcut(event)) {
            event.preventDefault();
            const stamp = formatEditorDatetime(new Date(), loadEditorDatetimePreference());
            editor.view.dispatch(
              editor.state.tr.insertText(
                stamp,
                editor.state.selection.from,
                editor.state.selection.to,
              ),
            );
            return true;
          }
          if (props.mode === "full" && isCommentToggleShortcut(event)) {
            const selection = editor.state.selection;
            if (selection && !selection.empty) {
              event.preventDefault();
              const selectedText = editor.state.doc.textBetween(selection.from, selection.to, "\n") ?? "";
              const nextText = toggleSelectedHtmlComment(selectedText);
              editor.view.dispatch(
                editor.state.tr.insertText(nextText, selection.from, selection.to),
              );
              return true;
            }
          }
          const slashMenuState = slashCommandsEnabled() ? slashMenu() : null;
          if (slashMenuState) {
            const commands = slashCommands();
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (commands.length > 0) {
                setSlashSelectedIndex((current) => (current + 1) % commands.length);
              }
              return true;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              if (commands.length > 0) {
                setSlashSelectedIndex((current) => (current - 1 + commands.length) % commands.length);
              }
              return true;
            }
            if (event.key === "Enter" && commands.length > 0) {
              event.preventDefault();
              executeSlashCommand(commands[slashSelectedIndex()] ?? commands[0]);
              return true;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              closeSlashMenu();
              return true;
            }
          }
          const keyContext: TiptapEditorKeyContext = {
            editor,
            text: editor.getText(),
            isEmpty: editor.isEmpty,
          };
          if (props.onKeyDown?.(event, keyContext)) {
            return true;
          }
          if (submitShortcut() === "enter" && event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void handleSend();
            return true;
          }
          if (
            submitShortcut() === "mod-enter" &&
            event.key === "Enter" &&
            (event.ctrlKey || event.metaKey)
          ) {
            event.preventDefault();
            void handleSend();
            return true;
          }
          return false;
        },
        handlePaste: (view, event) => {
          if (!isEditable()) return true;
          const text = event.clipboardData?.getData("text/plain") ?? "";
          const html = event.clipboardData?.getData("text/html") ?? "";
          const cleanedText = stripTrackingParamsFromText(text);
          const hasPlainTextOnlyPaste = text.trim().length > 0 && (!html.trim() || html.trim() === text.trim());

          if (props.mode !== "full") {
            if (!hasPlainTextOnlyPaste || cleanedText === text) return false;
            event.preventDefault();
            view.dispatch(view.state.tr.insertText(cleanedText, view.state.selection.from, view.state.selection.to));
            return true;
          }

          const parsedRows = parseDelimitedTableText(cleanedText);
          if (!parsedRows) {
            setPendingTablePaste(null);
            if (!hasPlainTextOnlyPaste || cleanedText === text) return false;
            event.preventDefault();
            view.dispatch(view.state.tr.insertText(cleanedText, view.state.selection.from, view.state.selection.to));
            return true;
          }
          event.preventDefault();
          const from = view.state.selection.from;
          view.dispatch(view.state.tr.insertText(cleanedText, view.state.selection.from, view.state.selection.to));
          setPendingTablePaste({
            rows: parsedRows,
            from,
            to: from + cleanedText.length,
          });
          return true;
        },
      },
      onTransaction: ({ editor }) => {
        setState(snapshotState(editor));
        setIsEmpty(editor.isEmpty);
        if (props.mode !== "compact") {
          const storage = editor.storage.characterCount;
          if (storage) setCharCount(storage.characters());
        }
        props.onChange?.(editor.getText(), tiptapToMarkdown(editor.getJSON()));

        // ── /persona slash command detection ──────────────────────────
        const nextSlashMenu = slashCommandsEnabled() ? detectSlashMenuState(editor) : null;
        setSlashMenu(nextSlashMenu);
        setSlashSelectedIndex((current) => {
          if (!nextSlashMenu) return 0;
          const maxIndex = Math.max(
            0,
            filterSlashCommands(slashCommandsForMode(props.mode), nextSlashMenu.query).length - 1,
          );
          return Math.min(current, maxIndex);
        });
      },
    });

    // Hydrate initial state
    setState(snapshotState(editorInstance));
    setIsEmpty(editorInstance.isEmpty);
    props.onReady?.({
      focus: () => editorInstance?.commands.focus(),
      clear: () => editorInstance?.commands.clearContent(true),
      setPlainText: (text: string) => editorInstance?.commands.setContent(text, false),
      getText: () => editorInstance?.getText() ?? "",
    } satisfies TiptapEditorHandle);

    onCleanup(unsub);
  });

  onCleanup(() => {
    editorInstance?.destroy();
    editorInstance = undefined;
  });

  createEffect(() => {
    const editor = editorInstance;
    if (!editor) return;
    editor.setEditable(isEditable());
    if (!isEditable()) {
      closeSlashMenu();
      setPersonaPicker(null);
      setPendingTablePaste(null);
    }
  });

  function dismissPersonaPicker() {
    setPersonaPicker(null);
    editorInstance?.commands.focus();
  }

  function handlePersonaSelected(persona: AgentPersona) {
    setGlobalPersona(persona);
    setPersonaPicker(null);
  }

  // ── Sync initialContent if it changes (A2UI pre-fill) ─────────────────

  let lastContent = props.initialContent ?? "";
  const syncContent = (newContent: string) => {
    if (!editorInstance || newContent === lastContent) return;
    lastContent = newContent;
    editorInstance.commands.setContent(newContent, false);
  };

  // Reactive effect: if parent updates initialContent (A2UI agent), sync editor
  const watchContent = () => {
    const c = props.initialContent ?? "";
    syncContent(c);
    return c;
  };
  // Call once during render to register dependency
  watchContent();

  // ── Submit ─────────────────────────────────────────────────────────────

  async function handleSend() {
    if (!editorInstance || isEmpty() || !isEditable() || isSubmitting()) return;
    setIsSubmitting(true);
    try {
      const json     = editorInstance.getJSON();
      const text     = editorInstance.getText();
      const markdown = tiptapToMarkdown(json);
      // HTML is generated and sanitized only for email mode where it is required.
      const html = props.mode === "email"
        ? sanitizeEmailHtml(editorInstance.getHTML())
        : undefined;
      const afpMessage = buildEditorAfpMessage({
        mode: props.mode,
        markdown, text, json, html,
        threadId:     props.threadId,
        supertags:    props.supertags,
        emailTo:      props.emailTo,
        emailSubject: props.emailSubject,
      });
      const payload: EditorPayload = { markdown, text, html, afpMessage };
      await props.onSend(payload);
      dispatchEditorSubmitEvent(payload);
      if (props.clearOnSend ?? true) {
        editorInstance.commands.clearContent(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const submitLabel = () => props.submitLabel ?? (
    props.mode === "compact" ? "Send" :
    props.mode === "email"   ? "Send Email" :
                               "Save Note"
  );

  const modeClass = () =>
    props.mode === "compact" ? "tiptap-compact" :
    props.mode === "email"   ? "tiptap-email"   : "tiptap-full";
  const appearanceClass = () =>
    props.appearance === "minimal"
      ? "tiptap-minimal-shell border-none bg-transparent shadow-none backdrop-blur-none"
      : "rounded-[18px] border border-black/[0.08] bg-white/90 shadow-soft backdrop-blur-sm";

  return (
    <>
    <div
      class={`tiptap-editor ${modeClass()} ${appearanceClass()} flex flex-col overflow-hidden ${props.class ?? ""}`}
      aria-disabled={isDisabled() ? "true" : undefined}
      data-readonly={isReadOnly() ? "true" : undefined}
    >

      {/* Toolbar — shown in all modes */}
      <Show when={editorInstance && showToolbar()}>
        <EditorToolbar
          editor={editorInstance!}
          state={state()}
          mode={props.mode}
          activePersona={activePersona()}
          onPersonaPickerOpen={openPersonaPickerAtCursor}
        />
      </Show>

      {/* Email mode: to/subject fields */}
      <Show when={props.mode === "email" && (props.emailTo || props.emailSubject)}>
        <div class="border-b border-black/[0.06] px-4 py-2 space-y-1">
          <Show when={props.emailTo}>
            <div class="flex items-center gap-2 text-xs text-on-surface-variant">
              <span class="w-12 shrink-0 font-medium">To:</span>
              <span class="font-semibold text-on-surface">{props.emailTo}</span>
            </div>
          </Show>
          <Show when={props.emailSubject}>
            <div class="flex items-center gap-2 text-xs text-on-surface-variant">
              <span class="w-12 shrink-0 font-medium">Subject:</span>
              <span class="font-semibold text-on-surface">{props.emailSubject}</span>
            </div>
          </Show>
        </div>
      </Show>

      {/* ProseMirror mount point */}
      <div
        ref={containerRef}
        class={`flex-1 overflow-y-auto ${isEditable() ? "cursor-text" : "cursor-default opacity-80"} ${props.contentClass ?? ""}`}
        style={{ "max-height": props.mode === "full" ? "60vh" : "auto" }}
        onClick={() => {
          if (isEditable()) editorInstance?.commands.focus();
        }}
      />

      <Show when={pendingTablePaste()}>
        <div class="border-t border-black/[0.06] bg-sky-50/80 px-3 py-2 text-xs text-sky-900">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span>Detected pasted tabular data. Convert it to a table?</span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={convertPendingPasteToTable}
                disabled={!isEditable()}
                class="rounded-full border border-sky-300/70 bg-white px-3 py-1 font-medium text-sky-700 transition hover:bg-sky-100"
              >
                Convert to table
              </button>
              <button
                type="button"
                onClick={dismissTablePastePrompt}
                disabled={!isEditable()}
                class="rounded-full border border-transparent px-3 py-1 font-medium text-sky-800/80 transition hover:bg-white/70"
              >
                Keep text
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Footer: char count + action buttons */}
      <Show when={showFooter()}>
      <div class="flex items-center justify-between gap-3 border-t border-black/[0.06] px-3 py-2">
        {/* Left: char count (full/email) */}
        <div class="min-w-0 flex-1 text-[10px] text-on-surface-variant/60">
          <Show when={personaRefreshError()}>
            {(message) => (
              <div class="flex flex-wrap items-center gap-2 rounded-full border border-amber-300/40 bg-amber-50/70 px-2.5 py-1 text-[10px] text-amber-800">
                <span>{message()}</span>
                <button
                  type="button"
                  class="font-semibold underline underline-offset-2"
                  disabled={isInteractionLocked()}
                  onClick={() => void loadActivePersona()}
                >
                  Retry persona
                </button>
              </div>
            )}
          </Show>
          <Show when={!personaRefreshError() && props.mode !== "compact" && charCount() > 0}>
            {charCount()} chars
          </Show>
        </div>

        {/* Right: cancel + send */}
        <div class="flex items-center gap-2">
          <Show when={props.onCancel}>
            <button
              type="button"
              disabled={isInteractionLocked()}
              class="rounded-full border border-black/10 bg-white px-4 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-black/5"
              onClick={() => props.onCancel?.()}
            >
              Cancel
            </button>
          </Show>
          <button
            type="button"
            disabled={isEmpty() || isInteractionLocked()}
            onClick={handleSend}
            class="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting() ? "Sending…" : submitLabel()}
          </button>
        </div>
      </div>
      </Show>
    </div>

    {/* Persona picker portal — rendered outside editor DOM */}
    <Show when={slashCommandsEnabled() && slashMenu()}>
      <Portal>
        <div
          class="tiptap-slash-dropdown"
          style={{ left: `${slashMenu()!.x}px`, top: `${slashMenu()!.y + 6}px` }}
        >
          <Show
            when={slashCommands().length > 0}
            fallback={
              <div class="tiptap-slash-empty">
                No matching blocks. Keep typing to narrow the command.
              </div>
            }
          >
            <For each={slashCommands()}>
              {(command, index) => (
                <button
                  type="button"
                  classList={{ "is-selected": index() === slashSelectedIndex() }}
                  disabled={!isEditable()}
                  onMouseEnter={() => setSlashSelectedIndex(index())}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => executeSlashCommand(command)}
                >
                  <span class="tiptap-slash-copy">
                    <span class="tiptap-slash-title">{command.title}</span>
                    <span class="tiptap-slash-description">{command.description}</span>
                  </span>
                  <span class="tiptap-slash-hint">/{command.keywords[0]}</span>
                </button>
              )}
            </For>
          </Show>
        </div>
      </Portal>
    </Show>

    <Show when={personaPicker()}>
      <Portal>
        <PersonaPickerDropdown
          anchorX={personaPicker()!.x}
          anchorY={personaPicker()!.y}
          onSelect={handlePersonaSelected}
          onClose={dismissPersonaPicker}
        />
      </Portal>
    </Show>
    </>
  );
}
