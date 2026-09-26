// @locs-version: 1.0
import { For, Show } from "solid-js";
import type { Editor } from "@tiptap/core";
import type { EditorMode } from "@/lib/editorMode";
import type { EditorState } from "./tiptapEditorTypes";
import type { AgentPersona } from "@/lib/api";

// â”€â”€ Toolbar button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ToolBtn(props: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      class={`flex h-7 min-w-[28px] items-center justify-center rounded-md px-1.5 text-[12px] font-medium transition select-none ${
        props.active
          ? "bg-primary/10 text-primary"
          : "text-on-surface-variant hover:bg-black/5 hover:text-on-surface"
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {props.children}
    </button>
  );
}

function Sep() {
  return <div class="mx-1 h-5 w-px bg-black/10" />;
}

// â”€â”€ Heading select â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function HeadingSelect(props: { editor: Editor; state: EditorState }) {
  const current = () =>
    props.state.h1 ? "H1" : props.state.h2 ? "H2" : props.state.h3 ? "H3" : "P";

  return (
    <select
      aria-label="Text style"
      class="h-7 rounded-md border-none bg-transparent px-1.5 text-[12px] font-medium text-on-surface-variant hover:bg-black/5 focus:outline-none cursor-pointer"
      value={current()}
      onChange={(e) => {
        const v = e.currentTarget.value;
        if (v === "H1") props.editor.chain().focus().toggleHeading({ level: 1 }).run();
        else if (v === "H2") props.editor.chain().focus().toggleHeading({ level: 2 }).run();
        else if (v === "H3") props.editor.chain().focus().toggleHeading({ level: 3 }).run();
        else props.editor.chain().focus().setParagraph().run();
      }}
    >
      <option value="P">Normal</option>
      <option value="H1">Heading 1</option>
      <option value="H2">Heading 2</option>
      <option value="H3">Heading 3</option>
    </select>
  );
}

// â”€â”€ Color picker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const COLORS = ["#1c1b1f", "#635bff", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

function ColorPicker(props: { editor: Editor }) {
  return (
    <div class="flex items-center gap-0.5">
      <For each={COLORS}>
        {(color) => (
          <button
            type="button"
            title={`Text color ${color}`}
            aria-label={`Set text color ${color}`}
            onClick={() => props.editor.chain().focus().setColor(color).run()}
            style={{ background: color }}
            class="h-4 w-4 rounded-full border border-white/60 shadow-sm hover:scale-110 transition"
          />
        )}
      </For>
      <button
        type="button"
        title="Remove color"
        aria-label="Remove text color"
        onClick={() => props.editor.chain().focus().unsetColor().run()}
        class="h-4 w-4 rounded-full border border-black/10 bg-white text-[8px] text-on-surface-variant hover:bg-black/5 transition"
      >
        âœ•
      </button>
    </div>
  );
}

// â”€â”€ Link dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function insertLink(editor: Editor) {
  const prev = editor.getAttributes("link").href ?? "";
  const url = window.prompt("Enter URL", prev);
  if (url === null) return;
  if (!url) {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href: url, target: "_blank" }).run();
}

// â”€â”€ Table insert helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function insertTable(editor: Editor) {
  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
}

// â”€â”€ Image insert â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function insertImage(editor: Editor) {
  const url = window.prompt("Image URL or paste data URI");
  if (url) editor.chain().focus().setImage({ src: url }).run();
}

// â”€â”€ Email signature â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function insertSignature(editor: Editor) {
  editor.chain().focus().insertContent(
    `<p><br/></p><div class="email-signature">â€”<br/>Sent via OmnyID</div>`
  ).run();
}

const STYLE_DOT: Record<string, string> = {
  balanced:   "bg-slate-400",
  concise:    "bg-sky-400",
  warm:       "bg-amber-400",
  formal:     "bg-indigo-400",
  creative:   "bg-purple-400",
  analytical: "bg-emerald-400",
};

// â”€â”€ Main toolbar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function EditorToolbar(props: {
  editor: Editor;
  state: EditorState;
  mode: EditorMode;
  activePersona?: AgentPersona | null;
  onPersonaPickerOpen?: () => void;
}) {
  const e = () => props.editor;
  const s = () => props.state;

  return (
    <div class="flex flex-wrap items-center gap-0.5 border-b border-black/[0.06] bg-black/[0.02] px-2 py-1.5">

      {/* Compact + Full + Email: basic formatting */}
      <ToolBtn active={s().bold} title="Bold (Ctrl+B)" onClick={() => e().chain().focus().toggleBold().run()}>B</ToolBtn>
      <ToolBtn active={s().italic} title="Italic (Ctrl+I)" onClick={() => e().chain().focus().toggleItalic().run()}>I</ToolBtn>
      <ToolBtn active={s().strike} title="Strike" onClick={() => e().chain().focus().toggleStrike().run()}>SÌ¶</ToolBtn>

      {/* Full + Email: underline */}
      <Show when={props.mode !== "compact"}>
        <ToolBtn active={s().underline} title="Underline (Ctrl+U)" onClick={() => e().chain().focus().toggleUnderline().run()}>U</ToolBtn>
      </Show>

      <ToolBtn active={s().code} title="Inline code" onClick={() => e().chain().focus().toggleCode().run()}>{"`"}</ToolBtn>

      <Sep />

      {/* Compact: just link */}
      <Show when={props.mode === "compact"}>
        <ToolBtn active={s().link} title="Insert link" onClick={() => insertLink(e())}>ðŸ”—</ToolBtn>
      </Show>

      {/* Full + Email: headings, alignment, lists */}
      <Show when={props.mode !== "compact"}>
        <HeadingSelect editor={e()} state={s()} />
        <Sep />

        <ToolBtn active={s().alignLeft} title="Align left" onClick={() => e().chain().focus().setTextAlign("left").run()}>â¬…</ToolBtn>
        <ToolBtn active={s().alignCenter} title="Align center" onClick={() => e().chain().focus().setTextAlign("center").run()}>â˜°</ToolBtn>
        <ToolBtn active={s().alignRight} title="Align right" onClick={() => e().chain().focus().setTextAlign("right").run()}>âž¡</ToolBtn>
        <Sep />

        <ToolBtn active={s().bulletList} title="Bullet list" onClick={() => e().chain().focus().toggleBulletList().run()}>â€¢ â€“</ToolBtn>
        <ToolBtn active={s().orderedList} title="Ordered list" onClick={() => e().chain().focus().toggleOrderedList().run()}>1.</ToolBtn>

        {/* Full only: task list, code block, blockquote, table, mention */}
        <Show when={props.mode === "full"}>
          <ToolBtn active={s().taskList} title="Task list" onClick={() => e().chain().focus().toggleTaskList().run()}>â˜‘</ToolBtn>
          <Sep />
          <ToolBtn active={s().blockquote} title="Blockquote" onClick={() => e().chain().focus().toggleBlockquote().run()}>â</ToolBtn>
          <ToolBtn active={s().codeBlock} title="Code block" onClick={() => e().chain().focus().toggleCodeBlock().run()}>{ "</>" }</ToolBtn>
          <Sep />
          <ToolBtn active={false} title="Insert table" onClick={() => insertTable(e())}>âŠž</ToolBtn>
          <ToolBtn active={false} title="Insert image" onClick={() => insertImage(e())}>ðŸ–¼</ToolBtn>
        </Show>

        <Sep />
        <ToolBtn active={s().link} title="Insert link" onClick={() => insertLink(e())}>ðŸ”—</ToolBtn>
        <ToolBtn active={s().highlight} title="Highlight" onClick={() => e().chain().focus().toggleHighlight().run()}>ðŸ–</ToolBtn>

        {/* Email only: signature */}
        <Show when={props.mode === "email"}>
          <Sep />
          <ToolBtn active={false} title="Insert signature" onClick={() => insertSignature(e())}>âœ’</ToolBtn>
          <ToolBtn active={false} title="Insert image" onClick={() => insertImage(e())}>ðŸ–¼</ToolBtn>
        </Show>

        <Sep />
        <ColorPicker editor={e()} />
      </Show>

      {/* Undo/Redo + Persona chip â€” all modes */}
      <div class="ml-auto flex items-center gap-1.5">
        <ToolBtn disabled={!s().canUndo} title="Undo (Ctrl+Z)" onClick={() => e().chain().focus().undo().run()}>â†©</ToolBtn>
        <ToolBtn disabled={!s().canRedo} title="Redo (Ctrl+Y)" onClick={() => e().chain().focus().redo().run()}>â†ª</ToolBtn>

        {/* Persona chip â€” shows active persona, opens picker on click */}
        <Show when={props.onPersonaPickerOpen}>
          <div class="ml-1 h-5 w-px bg-black/10" />
          <button
            type="button"
            title={props.activePersona
              ? `Active persona: ${props.activePersona.name} Â· Click to switch Â· or type /persona`
              : "No active persona Â· Click to select one Â· or type /persona"}
            aria-label={props.activePersona
              ? `Active persona ${props.activePersona.name}. Open persona picker`
              : "No active persona. Open persona picker"}
            onClick={() => props.onPersonaPickerOpen?.()}
            class={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition select-none ${
              props.activePersona
                ? "bg-primary/8 text-primary hover:bg-primary/15"
                : "text-on-surface-variant/50 hover:bg-black/5 hover:text-on-surface-variant"
            }`}
          >
            <Show when={props.activePersona}>
              <span
                class={`inline-block h-2 w-2 rounded-full ${STYLE_DOT[props.activePersona!.writing_style] ?? "bg-slate-400"}`}
              />
            </Show>
            <span>
              {props.activePersona ? props.activePersona.name : "No persona"}
            </span>
            <span class="opacity-40 text-[9px]">â–¾</span>
          </button>
        </Show>
      </div>
    </div>
  );
}
