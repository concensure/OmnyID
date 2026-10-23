// @locs-version: 1.0
import type { Editor } from "@tiptap/core";
import type { EditorMode } from "@/lib/editorMode";
import type { EditorPayload } from "@/lib/editorPayload";

export type EditorState = {
  bold: boolean; italic: boolean; strike: boolean; underline: boolean; code: boolean;
  link: boolean; h1: boolean; h2: boolean; h3: boolean;
  bulletList: boolean; orderedList: boolean; taskList: boolean;
  blockquote: boolean; codeBlock: boolean;
  alignLeft: boolean; alignCenter: boolean; alignRight: boolean;
  highlight: boolean; canUndo: boolean; canRedo: boolean;
};

export type MentionSuggestion = { id: string; label: string };

export type TiptapEditorHandle = {
  focus: () => void;
  clear: () => void;
  setPlainText: (text: string) => void;
  getText: () => string;
};

export type TiptapEditorKeyContext = {
  editor: Editor;
  text: string;
  isEmpty: boolean;
};

export type TiptapEditorProps = {
  mode: EditorMode;
  class?: string;
  contentClass?: string;
  disabled?: boolean;
  readOnly?: boolean;
  threadId?: string;
  supertags?: string[];
  emailTo?: string;
  emailSubject?: string;
  initialContent?: string;
  placeholder?: string;
  ariaLabel?: string;
  submitLabel?: string;
  mentionSuggestions?: MentionSuggestion[];
  onChange?: (text: string, markdown: string, html: string) => void;
  onSend: (payload: EditorPayload) => Promise<void>;
  onCancel?: () => void;
  clearOnSend?: boolean;
  appearance?: "default" | "minimal";
  showToolbar?: boolean;
  showFooter?: boolean;
  enableSlashCommands?: boolean;
  submitShortcut?: "mod-enter" | "enter" | "none";
  onFocus?: () => void;
  onBlur?: () => void;
  onReady?: (handle: TiptapEditorHandle) => void;
  onKeyDown?: (event: KeyboardEvent, context: TiptapEditorKeyContext) => boolean | void;
};
