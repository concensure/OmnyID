import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { createEffect, onCleanup, onMount } from "solid-js";

function languageExtension(language: string) {
  if (language === "python") {
    return python();
  }
  if (language === "json") {
    return json();
  }
  return [];
}

export function CodeEditor(props: {
  value: string;
  language: string;
  onChange: (value: string) => void;
}) {
  let host!: HTMLDivElement;
  let view: EditorView | undefined;

  onMount(() => {
    view = new EditorView({
      state: EditorState.create({
        doc: props.value,
        extensions: [
          lineNumbers(),
          keymap.of([]),
          languageExtension(props.language),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              props.onChange(update.state.doc.toString());
            }
          })
        ]
      }),
      parent: host
    });
  });

  createEffect(() => {
    const nextValue = props.value;
    if (!view) {
      return;
    }
    const currentValue = view.state.doc.toString();
    if (currentValue === nextValue) {
      return;
    }
    view.dispatch({
      changes: { from: 0, to: currentValue.length, insert: nextValue }
    });
  });

  onCleanup(() => view?.destroy());

  return <div ref={host!} class="h-full min-h-[420px] overflow-hidden rounded-[20px] border border-white/35 bg-[#f5f7fb]" />;
}
