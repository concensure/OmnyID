// @locs-version: 1.0
import { createMemo, createSignal, Show, type JSX } from "solid-js";
import { formatWeddingDecisionDate } from "@/lib/weddingDecisionCardContentState";
import {
  decisionOsSwipeAxisLock,
  decisionOsSwipeDirection,
  decisionOsSwipeProgress,
} from "@/lib/decisionOsSwipeState";
import { FOCUS_DECK_HORIZONTAL_MAPPING, type FocusDeckItem } from "@/lib/mobileFocusHomeState";

type InputMethod = "swipe" | "button" | "keyboard";
const ICON_BUTTON_CLASS = "inline-flex h-11 w-11 items-center justify-center rounded-lg text-wedding-accent active:bg-wedding-surface-blush focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-accent";

function DeckIcon(props: { d: string }) {
  return <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={props.d} /></svg>;
}

export function MobileFocusDeck(props: {
  items: FocusDeckItem[];
  position: number;
  onPositionChange: (position: number) => void;
  onApprove: (item: FocusDeckItem, method: InputMethod) => void;
  onDefer: (item: FocusDeckItem, method: InputMethod, deferredUntilAt?: string | null) => boolean | void | Promise<boolean | void>;
  renderCard: (item: FocusDeckItem) => JSX.Element;
  renderEnd: () => JSX.Element;
  label: "Decision" | "Response";
  sequential?: boolean;
  primaryActionLabel?: (item: FocusDeckItem) => string;
  defaultReminderAt?: (item: FocusDeckItem) => string;
}) {
  const [drag, setDrag] = createSignal<{ x: number; y: number; startedAt: number; pointerId: number; width: number; height: number; axis: ReturnType<typeof decisionOsSwipeAxisLock> } | null>(null);
  const [exiting, setExiting] = createSignal(false);
  const [offset, setOffset] = createSignal({ x: 0, y: 0 });
  const [announcement, setAnnouncement] = createSignal("");
  const [showGestureHint, setShowGestureHint] = createSignal(true);
  const [reminderItem, setReminderItem] = createSignal<FocusDeckItem | null>(null);
  const [reminderDate, setReminderDate] = createSignal("");
  const item = createMemo(() => props.items[Math.min(Math.max(0, props.position), props.items.length - 1)]);
  const atEnd = () => props.position >= props.items.length || props.items.length === 0;
  const primaryActionLabel = () => {
    const current = item();
    if (current && props.primaryActionLabel) return props.primaryActionLabel(current);
    return props.label === "Response" ? "Review response" : "Review decision";
  };
  const defaultReminderAt = () => {
    const current = item();
    return current && props.defaultReminderAt ? props.defaultReminderAt(current) : "";
  };
  const reminderLabel = () => formatWeddingDecisionDate(defaultReminderAt()) ?? "later";
  const openReminder = () => {
    const current = item();
    if (!current) return;
    const defaultAt = defaultReminderAt();
    setReminderItem(current);
    setReminderDate(defaultAt ? defaultAt.slice(0, 10) : "");
  };
  const saveReminder = async () => {
    const current = reminderItem();
    if (!current || !reminderDate()) return;
    const localMidday = new Date(`${reminderDate()}T12:00:00`);
    const requested = Number.isFinite(localMidday.getTime()) ? localMidday.toISOString() : null;
    const saved = await props.onDefer(current, "button", requested);
    if (saved !== false) navigate(1);
    setAnnouncement(`${current.title} will return on ${formatWeddingDecisionDate(requested) ?? reminderDate()}.`);
    setReminderItem(null);
  };
  const action = createMemo(() => {
    const state = drag();
    if (!state) return null;
    const direction = decisionOsSwipeDirection({ dx: offset().x, dy: offset().y, elapsedMs: performance.now() - state.startedAt, cardWidth: state.width, cardHeight: state.height, mapping: FOCUS_DECK_HORIZONTAL_MAPPING });
    return props.sequential && (direction === "prev" || direction === "next") ? null : direction;
  });
  const progress = createMemo(() => {
    const state = drag();
    return state ? decisionOsSwipeProgress({ dx: offset().x, dy: offset().y, cardWidth: state.width, cardHeight: state.height }) : 0;
  });
  const edgeLabel = () => {
    const direction = action();
    if (direction === "approve") return "Approve";
    if (direction === "defer") return "Later";
    if (offset().x < 0) return "Previous";
    return "Next";
  };
  const interactiveTarget = (target: EventTarget | null): boolean => typeof Element !== "undefined"
    && target instanceof Element
    && Boolean(target.closest("button, a, input, textarea, select, [data-deck-interactive]"));
  const navigate = (delta: number) => {
    const next = props.position + delta;
    if (next < 0) { setAnnouncement(`This is the first ${props.label.toLowerCase()}.`); return; }
    if (next > props.items.length) { setAnnouncement(`No more ${props.label.toLowerCase()}s.`); return; }
    props.onPositionChange(next);
    setAnnouncement(next >= props.items.length ? `All ${props.label.toLowerCase()}s reviewed.` : `${props.label} ${next + 1} of ${props.items.length}: ${props.items[next]?.title ?? ""}`);
  };
  const commit = async (direction: ReturnType<typeof action>, method: InputMethod) => {
    const active = item();
    if (!direction) return;
    setShowGestureHint(false);
    if (direction === "prev") navigate(-1);
    if (direction === "next") navigate(1);
    // The parent owns the consequence: a swipe may execute the presented
    // recommendation immediately, while a visible button can open its review
    // surface before anything external is sent.
    if (direction === "approve" && active) {
      setAnnouncement(`${primaryActionLabel()} opened for ${active.title}.`);
      props.onApprove(active, method);
      navigator.vibrate?.(8);
    }
    if (direction === "defer" && active) {
      const saved = await props.onDefer(active, method);
      if (saved !== false) {
        setAnnouncement(`${active.title} will return on ${reminderLabel()}.`);
        navigate(1);
      }
      navigator.vibrate?.(8);
    }
  };
  function pointerDown(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    // Vendor CTAs, links, and form controls own their tap. Without this guard the
    // deck captures their pointer before the browser can synthesize a click.
    if (interactiveTarget(event.target) || exiting()) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // Some mobile WebViews expose Pointer Events but reject capture on the
    // initial touch. The gesture still works without capture while it remains
    // in the card, so never let that implementation detail discard a swipe.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Best-effort capture only.
    }
    setDrag({ x: event.clientX, y: event.clientY, startedAt: performance.now(), pointerId: event.pointerId, width: rect.width, height: rect.height, axis: null });
    setOffset({ x: 0, y: 0 });
  }
  function pointerMove(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    const current = drag();
    if (!current || current.pointerId !== event.pointerId) return;
    const next = { x: event.clientX - current.x, y: event.clientY - current.y };
    const axis = decisionOsSwipeAxisLock({ dx: next.x, dy: next.y, lockedAxis: current.axis });
    if (axis !== current.axis) setDrag({ ...current, axis });
    setOffset(axis === "horizontal" ? { x: next.x, y: 0 } : axis === "vertical" ? { x: 0, y: next.y } : next);
  }
  function pointerEnd(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    const current = drag();
    if (!current || current.pointerId !== event.pointerId) return;
    const swipeDirection = decisionOsSwipeDirection({ dx: offset().x, dy: offset().y, elapsedMs: performance.now() - current.startedAt, cardWidth: current.width, cardHeight: current.height, mapping: FOCUS_DECK_HORIZONTAL_MAPPING });
    const direction = props.sequential && (swipeDirection === "prev" || swipeDirection === "next") ? null : swipeDirection;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag(null);
    if (!direction) {
      setOffset({ x: 0, y: 0 });
      return;
    }
    setExiting(true);
    const exitOffset = direction === "prev" ? { x: -current.width * 1.08, y: 0 }
      : direction === "next" ? { x: current.width * 1.08, y: 0 }
        : direction === "defer" ? { x: 0, y: -current.height * 1.04 }
          : { x: 0, y: current.height * 1.04 };
    setOffset(exitOffset);
    window.setTimeout(() => {
      setOffset({ x: 0, y: 0 });
      setExiting(false);
      void commit(direction, "swipe");
    }, 170);
  }
  function pointerCancel(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    const current = drag();
    if (!current || current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag(null);
    setOffset({ x: 0, y: 0 });
  }
  function keyDown(event: KeyboardEvent) {
    if (!props.sequential && event.key === "ArrowLeft") { event.preventDefault(); navigate(-1); }
    if (!props.sequential && event.key === "ArrowRight") { event.preventDefault(); navigate(1); }
    if (event.key.toLowerCase() === "l" && item()) { event.preventDefault(); void commit("defer", "keyboard"); }
    if (event.key.toLowerCase() === "a" && item()) { event.preventDefault(); void commit("approve", "keyboard"); }
  }
  return (
    <section class="flex min-h-0 flex-1 flex-col overscroll-contain" role="region" aria-roledescription="deck" aria-label={`${props.label} deck`} tabIndex={0} onKeyDown={keyDown}>
      <p class="sr-only" aria-live="polite">{announcement()}</p>
      <Show when={!atEnd()} fallback={<div class="flex min-h-0 flex-1 items-center">{props.renderEnd()}</div>}>
        <Show when={showGestureHint() && props.position === 0}>
          <p class="shrink-0 px-3 pb-2 pt-1 text-center text-xs font-medium text-wedding-muted" aria-hidden="true">Swipe up for later, swipe down to approve</p>
        </Show>
        <div class="relative min-h-0 flex-1 overflow-hidden">
          <div class="pointer-events-none absolute inset-x-3 top-3 z-10 rounded-full bg-white px-3 py-2 text-center text-xs font-semibold text-wedding-text shadow-card transition-opacity" style={{ opacity: String(progress() >= 0.3 ? 1 : 0) }}>
            {edgeLabel()}<Show when={progress() >= 1}> ✓</Show>
          </div>
          <div
            class={`flex h-full min-h-0 touch-none select-none flex-col rounded-[24px] border border-wedding-muted bg-white p-4 shadow-card will-change-transform phone:rounded-none phone:border-0 phone:bg-transparent phone:px-0 phone:shadow-none ${drag() ? "transition-none" : "transition-transform duration-150 ease-out"} motion-reduce:transition-opacity`}
            style={{
              transform: `translate(${offset().x}px, ${offset().y}px) rotate(${Math.max(-3, Math.min(3, offset().x / 40))}deg)`,
              // Keep browsers from treating a deliberate card gesture as page
              // scroll. This also covers builds where the utility class is not
              // emitted by the Tailwind scanner.
              "touch-action": "none",
            }}
            role="group"
            aria-label={`${props.label} ${props.position + 1} of ${props.items.length}: ${item()?.title ?? ""}`}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerEnd}
            onPointerCancel={pointerCancel}
          >
            <Show keyed when={item()}>{(current) => props.renderCard(current)}</Show>
          </div>
        </div>
        <Show when={!props.sequential}>
          <div class="flex items-center justify-between pt-2">
            <button type="button" class={ICON_BUTTON_CLASS} aria-label={`Previous ${props.label.toLowerCase()}`} onClick={() => navigate(-1)}><DeckIcon d="M15 19l-7-7 7-7" /></button>
            <button type="button" class={ICON_BUTTON_CLASS} aria-label={`Next ${props.label.toLowerCase()}`} onClick={() => navigate(1)}><DeckIcon d="M9 5l7 7-7 7" /></button>
          </div>
        </Show>
        <nav class="flex shrink-0 gap-2 px-2 pb-2 pt-2" aria-label={`${props.label} actions`}>
          <button type="button" class="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-lg border border-wedding-muted bg-white px-3 text-sm font-semibold text-wedding-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-accent focus-visible:ring-offset-2" onClick={openReminder}><DeckIcon d="M12 6v6l4 2M12 21a9 9 0 100-18 9 9 0 000 18z" />Remind me {reminderLabel()}</button>
          <button type="button" class="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-lg border-2 border-wedding-cta bg-white px-4 text-sm font-bold text-wedding-text hover:bg-wedding-surface-blush focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-accent focus-visible:ring-offset-2" aria-label={primaryActionLabel()} onClick={() => commit("approve", "button")}><DeckIcon d="M5 13l4 4L19 7" />{primaryActionLabel()}</button>
        </nav>
        <Show when={reminderItem()}>
          <div class="fixed inset-0 z-[80] flex items-end bg-black/35 p-3" role="presentation" onClick={() => setReminderItem(null)}>
            <section class="w-full rounded-2xl bg-white p-4 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="wedding-reminder-title" data-deck-interactive onClick={(event) => event.stopPropagation()}>
              <h3 id="wedding-reminder-title" class="text-base font-semibold text-wedding-text">When should this return?</h3>
              <p class="mt-1 text-sm leading-5 text-wedding-muted">The suggested date is {reminderLabel()}. Change it here if another day suits you.</p>
              <label class="mt-3 block text-xs font-semibold text-wedding-text" for="wedding-reminder-date">Reminder date</label>
              <input id="wedding-reminder-date" type="date" min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)} value={reminderDate()} onInput={(event) => setReminderDate(event.currentTarget.value)} class="mt-1 min-h-12 w-full rounded-lg border border-wedding-muted px-3 text-base text-wedding-text" />
              <div class="mt-4 grid grid-cols-2 gap-2">
                <button type="button" class="min-h-12 rounded-lg border border-wedding-muted bg-white text-sm font-semibold text-wedding-text" onClick={() => setReminderItem(null)}>Keep it here</button>
                <button type="button" disabled={!reminderDate()} class="min-h-12 rounded-lg border-2 border-wedding-cta bg-white text-sm font-bold text-wedding-text disabled:opacity-50" onClick={() => void saveReminder()}>Set reminder</button>
              </div>
            </section>
          </div>
        </Show>
      </Show>
    </section>
  );
}
