// @locs-version: 1.0
import type { EditorMode } from "@/lib/editorMode";

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asOptionalTrimmedString(value: unknown): string | undefined {
  const normalized = asTrimmedString(value);
  return normalized ? normalized : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asTrimmedString(entry))
    .filter(Boolean);
}

export type A2UIRichTextEditorState = {
  mode: EditorMode;
  threadId: string;
  initialContent: string;
  placeholder?: string;
  submitLabel?: string;
  emailTo?: string;
  emailSubject?: string;
  supertags: string[];
};

export function normalizeA2UIRichTextEditorMode(value: unknown): EditorMode {
  const mode = asTrimmedString(value);
  if (mode === "compact" || mode === "full" || mode === "email") return mode;
  return "full";
}

export function resolveA2UIRichTextEditorState(
  props: Record<string, unknown>,
  fallbackThreadId?: string | null,
): A2UIRichTextEditorState {
  return {
    mode: normalizeA2UIRichTextEditorMode(props.mode),
    threadId: asTrimmedString(props.thread_id) || asTrimmedString(fallbackThreadId),
    initialContent: typeof props.initial_content === "string" ? props.initial_content : "",
    placeholder: asOptionalTrimmedString(props.placeholder),
    submitLabel: asOptionalTrimmedString(props.submit_label),
    emailTo: asOptionalTrimmedString(props.email_to),
    emailSubject: asOptionalTrimmedString(props.email_subject),
    supertags: asStringArray(props.supertags),
  };
}
