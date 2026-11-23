// @locs-version: 1.0
// @module-id: ui.view-customizer
// @primary-capability: per-view-image-background-and-overlay-cards
//
// Provides a floating + button for non-home views that lets users:
//   1. Set an image background (URL or file upload) behind the current view
//   2. Add freely-draggable A2UICard overlays to any view
//
// State is persisted per-viewId in localStorage.
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import type { ViewName } from "@/lib/viewNames";
import { A2UICard } from "@/components/A2UICard";
import {
  loadViewCustomizerBg,
  loadViewCustomizerCards,
  saveViewCustomizerBg,
  saveViewCustomizerCards,
  type OverlayCard,
} from "@/lib/viewCustomizerLocalState";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import { blobAsDataUrl, compressImageCardUpload } from "@/lib/imageCardCompression";

// ── Storage helpers ──────────────────────────────────────────────────────────


// ── Component ─────────────────────────────────────────────────────────────

export function ViewCustomizer(props: { viewId: ViewName }) {
  const [bgImage, setBgImage]       = createSignal<string | null>(null);
  const [bgUrl, setBgUrl]           = createSignal("");
  const [cards, setCards]           = createSignal<OverlayCard[]>([]);
  const [menuOpen, setMenuOpen]     = createSignal(false);
  const [showBgPanel, setShowBgPanel] = createSignal(false);
  const [imageCardError, setImageCardError] = createSignal<string | null>(null);

  let fileRef: HTMLInputElement | undefined;
  let cardImageRef: HTMLInputElement | undefined;

  onMount(() => {
    const open = () => setMenuOpen(true);
    window.addEventListener("omnyid:open-view-customizer", open);
    onCleanup(() => window.removeEventListener("omnyid:open-view-customizer", open));
  });

  // Reload state whenever the view changes
  createEffect(() => {
    const v = props.viewId;
    const bg = loadViewCustomizerBg(v);
    setBgImage(bg);
    setBgUrl(bg?.startsWith("http") ? bg : "");
    setCards(loadViewCustomizerCards(v));
    setMenuOpen(false);
    setShowBgPanel(false);
  });

  // ── Background helpers ─────────────────────────────────────────────────

  function applyBg(url: string | null) {
    setBgImage(url);
    saveViewCustomizerBg(props.viewId, url);
  }

  function applyBgUrl() {
    const url = bgUrl().trim();
    if (url) applyBg(url);
  }

  function clearBgDraft() {
    setBgUrl(bgImage()?.startsWith("http") ? bgImage() ?? "" : "");
    setShowBgPanel(false);
  }

  function handleBgFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === "string") applyBg(result);
    };
    reader.readAsDataURL(file);
  }

  // ── Overlay card helpers ───────────────────────────────────────────────

  function addCard() {
    const card: OverlayCard = {
      id: `card-${Date.now()}`,
      // Position near the center-right of the visible area
      x: Math.max(60, Math.min(window.innerWidth - 420, window.innerWidth * 0.35)),
      y: Math.max(80, Math.min(window.innerHeight - 440, window.innerHeight * 0.2)),
      kind: "agent",
    };
    const next = [...cards(), card];
    setCards(next);
    saveViewCustomizerCards(props.viewId, next);
    setMenuOpen(false);
  }

  async function handleImageCardFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageCardError("Choose an image file.");
      return;
    }
    setImageCardError(file.size > 3 * 1024 * 1024 ? "Optimising this image for a responsive card…" : null);
    try {
      const imageDataUrl = await blobAsDataUrl(await compressImageCardUpload(file));
      const next: OverlayCard[] = [...cards(), {
        id: `image-card-${Date.now()}`,
        x: Math.max(16, Math.min(window.innerWidth - 336, window.innerWidth * 0.35)),
        y: Math.max(72, Math.min(window.innerHeight - 260, window.innerHeight * 0.2)),
        kind: "image",
        imageDataUrl,
        imageAlt: file.name.replace(/\.[^.]+$/, "") || "Custom image",
      }];
      setCards(next);
      saveViewCustomizerCards(props.viewId, next);
      setImageCardError(null);
      setMenuOpen(false);
    } catch (error) {
      setImageCardError(error instanceof Error ? error.message : "That image could not be prepared on this device.");
    }
  }

  function removeCard(id: string) {
    const next = cards().filter((c) => c.id !== id);
    setCards(next);
    saveViewCustomizerCards(props.viewId, next);
  }

  function startDragCard(cardId: string, pointerX: number, pointerY: number, originX: number, originY: number) {
    let cx = originX, cy = originY;

    function onMove(e: PointerEvent) {
      e.preventDefault();
      cx = originX + (e.clientX - pointerX);
      cy = originY + (e.clientY - pointerY);
      // Update position reactively (batched in next animation frame for perf)
      setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, x: cx, y: cy } : c));
    }

    function onUp() {
      // Persist final position
      setCards((prev) => {
        saveViewCustomizerCards(props.viewId, prev);
        return prev;
      });
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    onCleanup(() => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    });
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <>
      {/* Subtle image background layer — sits behind view content */}
      <Show when={bgImage()}>
        <Portal>
          <div
            class="pointer-events-none fixed z-[1] transition-opacity duration-500"
            aria-hidden="true"
            style={{
              top: "60px",
              left: "248px",
              right: "0",
              bottom: "0",
              "background-image": `url(${bgImage()})`,
              "background-size": "cover",
              "background-position": "center",
              opacity: "0.13",
            }}
          />
        </Portal>
      </Show>

      {/* Overlay A2UI cards — freely draggable */}
      <For each={cards()}>
        {(card) => (
          <Portal>
            <div
              class={`fixed z-[180] animate-fade-in ${card.kind === "image" ? "touch-none cursor-grab active:cursor-grabbing" : ""}`}
              style={{ left: `${card.x}px`, top: `${card.y}px` }}
              onPointerDown={(event) => {
                if (card.kind !== "image") return;
                event.currentTarget.setPointerCapture?.(event.pointerId);
                event.preventDefault();
                startDragCard(card.id, event.clientX, event.clientY, card.x, card.y);
              }}
            >
              <div class={card.kind === "image"
                ? "group relative h-[220px] w-[min(320px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-white/60 bg-white shadow-panel"
                : "rounded-2xl border border-white/50 bg-white/96 p-4 shadow-panel backdrop-blur-xl"}>
                <Show when={card.kind === "image" && card.imageDataUrl}>
                  <img src={card.imageDataUrl} alt={card.imageAlt ?? "Custom image"} class="absolute inset-0 h-full w-full object-cover" />
                </Show>
                {/* Drag handle */}
                <div
                  class={card.kind === "image"
                    ? "absolute inset-x-0 top-0 z-10 flex cursor-grab items-center justify-between bg-gradient-to-b from-black/55 to-transparent px-3 pb-7 pt-2 text-white opacity-90 select-none active:cursor-grabbing"
                    : "mb-3 flex cursor-grab items-center justify-between select-none active:cursor-grabbing"}
                  onPointerDown={(e) => {
                    if (card.kind === "image") return;
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                    e.preventDefault();
                    startDragCard(card.id, e.clientX, e.clientY, card.x, card.y);
                  }}
                >
                  <span class={`font-mono text-[8px] uppercase tracking-[0.2em] ${card.kind === "image" ? "text-white" : "text-on-surface-variant/35"}`}>
                    {card.kind === "image" ? "Image card · drag to move" : "Custom card · drag to move"}
                  </span>
                  <button
                    type="button"
                    class={`ml-3 flex h-5 w-5 items-center justify-center rounded-full text-[10px] transition ${card.kind === "image" ? "bg-black/30 text-white hover:bg-red-500" : "bg-black/5 text-on-surface-variant hover:bg-red-100 hover:text-red-500"}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => removeCard(card.id)}
                    aria-label="Remove card"
                  >✕</button>
                </div>
                <Show when={card.kind !== "image"}>
                  <A2UICard
                    personaTone={card.personaTone}
                    initialCardType={card.cardType}
                    initialContent={card.generated}
                    onContentChange={(generated, cardType) => {
                      const next = cards().map((candidate) => candidate.id === card.id ? { ...candidate, generated, cardType } : candidate);
                      setCards(next);
                      saveViewCustomizerCards(props.viewId, next);
                    }}
                    onDismiss={() => removeCard(card.id)}
                  />
                </Show>
              </div>
            </div>
          </Portal>
        )}
      </For>

      {/* Options are opened from the Agent Persona control. */}
      <Portal>
        <div class="fixed z-[170]" style={{ bottom: "72px", right: "16px" }}>
          <div class="relative">
            {/* Dropdown menu */}
            <Show when={menuOpen()}>
              <div class="absolute bottom-full right-0 mb-2 w-60 animate-fade-in rounded-2xl border border-white/50 bg-white/96 p-3 shadow-panel backdrop-blur-xl">

                <p class="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant/60">Customize this view</p>

                {/* ── Image Background ────────────────────────────────── */}
                <button
                  type="button"
                  onClick={() => setShowBgPanel((v) => !v)}
                  class="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-xs transition hover:bg-on-surface/6"
                >
                  <span class="text-base leading-none">🖼</span>
                  <div>
                    <p class="font-medium text-on-surface">Image Background</p>
                    <p class="text-[10px] text-on-surface-variant/60">Set a photo behind this view</p>
                  </div>
                  <span class="ml-auto text-[10px] text-on-surface-variant/40">{showBgPanel() ? "▲" : "▼"}</span>
                </button>

                <Show when={showBgPanel()}>
                  <div class="mt-1 flex flex-col gap-1.5 px-2 pb-2">
                    <input
                      type="text"
                      class="w-full rounded-xl border border-black/10 bg-white/70 px-2.5 py-1.5 text-[11px] text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Paste image URL…"
                      value={bgUrl()}
                      onInput={(e) => setBgUrl(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          recordShortcutUse("form_submit");
                          applyBgUrl();
                          return;
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          recordShortcutUse("form_cancel");
                          clearBgDraft();
                        }
                      }}
                    />
                    <div class="flex gap-1.5">
                      <button
                        type="button"
                        onClick={applyBgUrl}
                        disabled={!bgUrl().trim()}
                        class="flex-1 rounded-xl bg-primary py-1.5 text-[10px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={() => fileRef?.click()}
                        class="rounded-xl border border-black/10 bg-white/60 px-3 py-1.5 text-[10px] text-on-surface-variant transition hover:bg-white/90"
                      >
                        Upload
                      </button>
                      <Show when={bgImage()}>
                        <button
                          type="button"
                          onClick={() => { applyBg(null); setBgUrl(""); }}
                          class="rounded-xl border border-red-200/60 bg-red-50/60 px-2.5 py-1.5 text-[10px] text-red-500 transition hover:bg-red-100"
                          title="Remove background"
                        >✕</button>
                      </Show>
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      class="hidden"
                      onChange={handleBgFile}
                    />
                  </div>
                </Show>

                <div class="mx-1 my-1 h-px bg-outline/10" />

                {/* ── Add A2UI card ───────────────────────────────────── */}
                <button
                  type="button"
                  onClick={addCard}
                  class="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-xs transition hover:bg-on-surface/6"
                >
                  <span class="text-base leading-none">✦</span>
                  <div>
                    <p class="font-medium text-on-surface">Add custom card</p>
                    <p class="text-[10px] text-on-surface-variant/60">Agent-generated floating card</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => cardImageRef?.click()}
                  class="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-xs transition hover:bg-on-surface/6"
                >
                  <span class="text-base leading-none">▧</span>
                  <div>
                    <p class="font-medium text-on-surface">Add image card</p>
                    <p class="text-[10px] text-on-surface-variant/60">Upload a movable photo tile</p>
                  </div>
                </button>
                <input ref={cardImageRef} type="file" accept="image/*" class="hidden" onChange={handleImageCardFile} />
                <Show when={imageCardError()}>{(message) => <p role="alert" class="px-2 pt-1 text-[10px] leading-4 text-red-600">{message()}</p>}</Show>
              </div>
            </Show>
          </div>
        </div>

        {/* Click-away backdrop */}
        <Show when={menuOpen()}>
          <div
            class="fixed inset-0 z-[169]"
            onClick={() => { setMenuOpen(false); setShowBgPanel(false); }}
          />
        </Show>
      </Portal>
    </>
  );
}
