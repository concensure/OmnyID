// @locs-version: 1.0
import { Show, createSignal } from "solid-js";

type TagInputProps = {
  workflowId: string;
  tags: Record<string, string[]>;
  onSave: (id: string, tags: string[]) => void;
};

export function TagInput(props: TagInputProps) {
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const reset = () => {
    setDraft("");
    setEditing(false);
  };
  const commitDraft = () => {
    const tag = draft().trim();
    if (!tag) {
      reset();
      return;
    }
    const currentTags = props.tags[props.workflowId] ?? [];
    if (!currentTags.includes(tag)) props.onSave(props.workflowId, [...currentTags, tag]);
    reset();
  };
  return (
    <Show when={editing()} fallback={
      <button
        type="button"
        aria-label="Add workflow tag"
        title="Add workflow tag"
        onClick={() => setEditing(true)}
        class="rounded-full border border-dashed border-white/30 px-1.5 py-0.5 text-[9px] text-on-surface-variant/40 hover:border-primary/40 hover:text-primary/60 transition">
        + tag
      </button>
    }>
      <input
        type="text" value={draft()} placeholder="tag name"
        aria-label="Workflow tag name"
        onInput={e => setDraft(e.currentTarget.value)}
        onKeyDown={e => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            commitDraft();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            reset();
          }
        }}
        onBlur={commitDraft}
        class="w-20 rounded-full border border-primary/40 bg-white/50 px-2 py-0.5 text-[9px] outline-none"
        autofocus
      />
    </Show>
  );
}
