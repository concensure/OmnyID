// @locs-version: 1.0
import { createMemo, createSignal, Show, type JSX } from "solid-js";
import {
  decisionOsSwipeAxisLock,
  decisionOsSwipeDirection,
  decisionOsSwipeProgress,
} from "@/lib/decisionOsSwipeState";
import { FOCUS_DECK_HORIZONTAL_MAPPING, type FocusDeckItem } from "@/lib/mobileFocusHomeState";

type InputMethod = "swipe" | "button" | "keyboard";
export function MobileFocusDeck(props: {
  items: FocusDeckItem[];
  position: number;
  onPositionChange: (position: number) => void;
  onApprove: (item: FocusDeckItem, method: InputMethod) => void;
  onDefer: (item: FocusDeckItem, method: InputMethod) => void;
  renderCard: (item: FocusDeckItem) => JSX.Element;
  renderEnd: () => JSX.Element;
  label: "Decision" | "Response";
}) {
  const [drag, setDrag] = createSignal<{ x: number; y: number; startedAt: number; pointerId: number; width: number; height: number } | null>(null);
  const [offset, setOffset] = createSignal({ x: 0, y: 0 });
  const [announcement, setAnnouncement] = createSignal("");
  const item = createMemo(() => props.items[Math.min(Math.max(0, props.position), props.items.length - 1)]);
  const atEnd = () => props.position >= props.items.length || props.items.length === 0;
  const action = createMemo(() => {
    const state = drag();
    if (!state) return null;
    return decisionOsSwipeDirection({ dx: offset().x, dy: offset().y, elapsedMs: performance.now() - state.startedAt, cardWidth: state.width, cardHeight: state.height, mapping: FOCUS_DECK_HORIZONTAL_MAPPING });
  });
  const progress = createMemo(() => {
    const state = drag();
    return state ? decisionOsSwipeProgress({ dx: offset().x, dy: offset().y, cardWidth: state.width, cardHeight: state.height }) : 0;
  });
  const edgeLabel = () => {
    const direction = action();
    if (direction === "approve") return `↓ Approve: ${item()?.recommendedActionLabel ?? "recommendation"}`;
    if (direction === "defer") return "↑ Later";
    if (offset().x < 0) return "‹ Previous";
    return "Next ›";
  };
  const navigate = (delta: number) => {
    const next = props.position + delta;
    if (next < 0) { setAnnouncement(`This is the first ${props.label.toLowerCase()}.`); return; }
    if (next > props.items.length) { setAnnouncement(`No more ${props.label.toLowerCase()}s.`); return; }
    props.onPositionChange(next);
    setAnnouncement(next >= props.items.length ? `All ${props.label.toLowerCase()}s reviewed.` : `${props.label} ${next + 1} of ${props.items.length}: ${props.items[next]?.title ?? ""}`);
  };
  const commit = (direction: ReturnType<typeof action>, method: InputMethod) => {
    const active = item();
    if (!direction) return;
    if (direction === "prev") navigate(-1);
    if (direction === "next") navigate(1);
    // Approval is deliberately two-step. The parent opens a confirmation and
    // advances only after the person has explicitly confirmed that decision.
    if (direction === "approve" && active) { props.onApprove(active, method); navigator.vibrate?.(8); }
    if (direction === "defer" && active) { props.onDefer(active, method); navigate(1); navigator.vibrate?.(8); }
  };
  function pointerDown(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ x: event.clientX, y: event.clientY, startedAt: performance.now(), pointerId: event.pointerId, width: rect.width, height: rect.height });
    setOffset({ x: 0, y: 0 });
  }
  function pointerMove(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    const current = drag();
    if (!current || current.pointerId !== event.pointerId) return;
    const next = { x: event.clientX - current.x, y: event.clientY - current.y };
    const axis = decisionOsSwipeAxisLock({ dx: next.x, dy: next.y });
    setOffset(axis === "horizontal" ? { x: next.x, y: 0 } : axis === "vertical" ? { x: 0, y: next.y } : next);
  }
  function pointerEnd(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    const current = drag();
    if (!current || current.pointerId !== event.pointerId) return;
    const direction = decisionOsSwipeDirection({ dx: offset().x, dy: offset().y, elapsedMs: performance.now() - current.startedAt, cardWidth: current.width, cardHeight: current.height, mapping: FOCUS_DECK_HORIZONTAL_MAPPING });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag(null); setOffset({ x: 0, y: 0 }); commit(direction, "swipe");
  }
  function keyDown(event: KeyboardEvent) {
    if (event.key === "ArrowLeft") { event.preventDefault(); navigate(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); navigate(1); }
    if (event.key.toLowerCase() === "l" && item()) { event.preventDefault(); commit("defer", "keyboard"); }
    if (event.key.toLowerCase() === "a" && item()) { event.preventDefault(); commit("approve", "keyboard"); }
  }
  return (
    <section class="flex min-h-0 flex-1 flex-col overscroll-contain" role="region" aria-roledescription="deck" aria-label={`${props.label} deck`} tabIndex={0} onKeyDown={keyDown}>
      <p class="sr-only" aria-live="polite">{announcement()}</p>
      <Show when={!atEnd()} fallback={<div class="flex min-h-0 flex-1 items-center">{props.renderEnd()}</div>}>
        <div class="relative min-h-0 flex-1 overflow-hidden">
          <div class="pointer-events-none absolute inset-x-3 top-3 z-10 rounded-full bg-white px-3 py-2 text-center text-xs font-semibold text-wedding-text shadow-card transition-opacity" style={{ opacity: String(progress() >= 0.3 ? 1 : 0) }}>
            {edgeLabel()}<Show when={progress() >= 1}> ✓</Show>
          </div>
          <div
            class="flex h-full min-h-0 touch-none select-none flex-col rounded-[24px] border border-wedding-muted bg-white p-4 shadow-card transition-transform duration-200 motion-reduce:transition-opacity"
            style={{ transform: `translate(${offset().x}px, ${offset().y}px) rotate(${Math.max(-3, Math.min(3, offset().x / 40))}deg)` }}
            role="group"
            aria-label={`${props.label} ${props.position + 1} of ${props.items.length}: ${item()?.title ?? ""}`}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerEnd}
            onPointerCancel={pointerEnd}
          >
            <Show when={item()}>{(current) => props.renderCard(current())}</Show>
          </div>
        </div>
        <nav class="grid grid-cols-4 gap-2 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" aria-label={`${props.label} actions`}>
          <button type="button" class="min-h-12 rounded-xl border border-wedding-muted bg-white px-2 text-xs font-semibold text-wedding-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-accent focus-visible:ring-offset-2" onClick={() => navigate(-1)}>‹ Prev</button>
          <button type="button" class="min-h-12 rounded-xl border border-wedding-muted bg-white px-2 text-xs font-semibold text-wedding-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-accent focus-visible:ring-offset-2" onClick={() => commit("defer", "button")}>↑ Later</button>
          <button type="button" class="min-h-12 rounded-xl bg-wedding-cta px-2 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-accent focus-visible:ring-offset-2" aria-label={`Approve: ${item()?.recommendedActionLabel ?? "recommendation"}`} onClick={() => commit("approve", "button")}>↓ Approve</button>
          <button type="button" class="min-h-12 rounded-xl border border-wedding-muted bg-white px-2 text-xs font-semibold text-wedding-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-accent focus-visible:ring-offset-2" onClick={() => navigate(1)}>Next ›</button>
        </nav>
      </Show>
    </section>
  );
}
