// @locs-version: 1.0
// @module-id: ui.floating-format-bar
// @primary-capability: contenteditable-format-toolbar
// @stability: beta
import { createSignal, onCleanup, onMount, Show } from "solid-js";

type FormatCmd = "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList";

interface BarState {
  top: number;
  left: number;
  target: HTMLElement;
}

function execFmt(cmd: FormatCmd) {
  document.execCommand(cmd, false, undefined);
}

function queryFmt(cmd: FormatCmd): boolean {
  return document.queryCommandState(cmd);
}

function FmtBtn(props: {
  cmd: FormatCmd;
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); props.onClick(); }}
      title={props.title}
      class={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-medium transition ${
        props.active
          ? "bg-primary text-white"
          : "text-on-surface hover:bg-on-surface/8"
      }`}
    >
      {props.label}
    </button>
  );
}

export function FloatingFormatBar() {
  const [bar, setBar] = createSignal<BarState | null>(null);
  const [tick, setTick] = createSignal(0);

  function positionBar(target: HTMLElement) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      setBar(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      // No visible selection — position above target
      const trect = target.getBoundingClientRect();
      setBar({ top: trect.top - 44, left: trect.left, target });
      return;
    }
    setBar({ top: rect.top - 44, left: Math.max(rect.left, 72), target });
  }

  onMount(() => {
    function onFocusIn(e: FocusEvent) {
      const el = e.target as HTMLElement;
      if (!el) return;
      if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
        positionBar(el);
        setTick((n) => n + 1);
      }
    }

    function onFocusOut(e: FocusEvent) {
      const related = e.relatedTarget as Node | null;
      const currentBar = bar();
      if (!currentBar) return;
      if (related && currentBar.target.contains(related)) return;
      // Delay so mousedown on toolbar buttons fires before blur hides the bar
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !document.activeElement?.isConnected) {
          setBar(null);
        }
      }, 150);
    }

    function onSelectionChange() {
      const sel = window.getSelection();
      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl?.isContentEditable) {
        positionBar(activeEl);
        setTick((n) => n + 1);
      } else if (!activeEl?.isContentEditable) {
        // keep bar visible while toolbar buttons are focused
      }
    }

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("selectionchange", onSelectionChange);

    onCleanup(() => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("selectionchange", onSelectionChange);
    });
  });

  const isBold      = () => { tick(); return queryFmt("bold"); };
  const isItalic    = () => { tick(); return queryFmt("italic"); };
  const isUnderline = () => { tick(); return queryFmt("underline"); };
  const isList      = () => { tick(); return queryFmt("insertUnorderedList"); };
  const isOList     = () => { tick(); return queryFmt("insertOrderedList"); };

  function changeFontSize(delta: number) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const el = bar()?.target;
    if (!el) return;
    const current = parseFloat(window.getComputedStyle(el).fontSize) || 14;
    const next = Math.min(Math.max(current + delta, 10), 36);
    el.style.fontSize = `${next}px`;
  }

  return (
    <Show when={bar()}>
      {(b) => (
        <div
          class="fixed z-[60] flex items-center gap-0.5 rounded-xl border border-white/50 bg-white/96 px-2 py-1 shadow-panel backdrop-blur-xl animate-fade-in"
          style={{ top: `${b().top}px`, left: `${b().left}px` }}
        >
          <FmtBtn cmd="bold" label="B" title="Bold (Ctrl+B)" active={isBold()} onClick={() => { execFmt("bold"); setTick((n) => n + 1); }} />
          <FmtBtn cmd="italic" label="I" title="Italic (Ctrl+I)" active={isItalic()} onClick={() => { execFmt("italic"); setTick((n) => n + 1); }} />
          <FmtBtn cmd="underline" label="U" title="Underline (Ctrl+U)" active={isUnderline()} onClick={() => { execFmt("underline"); setTick((n) => n + 1); }} />
          <div class="mx-1 h-4 w-px bg-outline/20" />
          <FmtBtn cmd="insertUnorderedList" label="•" title="Bullet list" active={isList()} onClick={() => { execFmt("insertUnorderedList"); setTick((n) => n + 1); }} />
          <FmtBtn cmd="insertOrderedList" label="1." title="Numbered list" active={isOList()} onClick={() => { execFmt("insertOrderedList"); setTick((n) => n + 1); }} />
          <div class="mx-1 h-4 w-px bg-outline/20" />
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); changeFontSize(-1); }}
            title="Decrease font size"
            class="flex h-7 w-6 items-center justify-center rounded-lg text-xs text-on-surface hover:bg-on-surface/8"
          >A−</button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); changeFontSize(1); }}
            title="Increase font size"
            class="flex h-7 w-6 items-center justify-center rounded-lg text-sm font-medium text-on-surface hover:bg-on-surface/8"
          >A+</button>
        </div>
      )}
    </Show>
  );
}
