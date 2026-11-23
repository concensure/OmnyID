// @locs-version: 1.0
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { blobAsDataUrl, compressImageCardUpload } from "@/lib/imageCardCompression";
import { loadWeddingHomePhotoCards, saveWeddingHomePhotoCards, type WeddingHomePhotoCard } from "@/lib/weddingHomePhotoCardState";

export function WeddingHomePhotoCards(props: { userId?: string | null }) {
  const [cards, setCards] = createSignal<WeddingHomePhotoCard[]>([]);
  const [notice, setNotice] = createSignal<string | null>(null);
  let input: HTMLInputElement | undefined;
  let addButton: HTMLButtonElement | undefined;

  onMount(() => {
    const openPicker = () => { addButton?.focus(); input?.click(); };
    window.addEventListener("omnyid:wedding-add-photo", openPicker);
    onCleanup(() => window.removeEventListener("omnyid:wedding-add-photo", openPicker));
  });

  createEffect(() => setCards(loadWeddingHomePhotoCards(props.userId)));
  const persist = (next: WeddingHomePhotoCard[]) => {
    setCards(next);
    setNotice(saveWeddingHomePhotoCards(props.userId, next) ? null : "Sign in, or free some browser storage, to keep this photo on Today.");
  };
  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= cards().length) return;
    const next = [...cards()];
    [next[index], next[target]] = [next[target]!, next[index]!];
    persist(next);
  };
  const remove = (id: string) => persist(cards().filter((card) => card.id !== id));
  const updateSize = (id: string, element: HTMLElement) => persist(cards().map((card) => card.id === id ? {
    ...card, width: Math.round(element.getBoundingClientRect().width), height: Math.round(element.getBoundingClientRect().height),
  } : card));
  const add = async (event: Event) => {
    const control = event.currentTarget as HTMLInputElement;
    const file = control.files?.[0]; control.value = "";
    if (!file?.type.startsWith("image/")) return;
    setNotice("Optimising this photo for Today…");
    try {
      const imageDataUrl = await blobAsDataUrl(await compressImageCardUpload(file, { maxDimension: 1600, targetBytes: 700_000 }));
      persist([...cards(), { id: `wedding-photo-${Date.now()}`, imageDataUrl, alt: file.name.replace(/\.[^.]+$/, "") || "Wedding photo", width: 520, height: 320 }]);
    } catch { setNotice("That photo could not be prepared on this device."); }
  };

  return <section class="rounded-[24px] border border-dashed border-wedding-border bg-white/75 p-3 sm:rounded-[28px] sm:p-4" aria-label="Wedding photo cards">
    <div class="grid gap-3"><For each={cards()}>{(card, index) => {
      let element: HTMLElement | undefined;
      return <article ref={(node: HTMLElement) => { element = node; }} class="relative max-w-full resize overflow-hidden rounded-2xl border border-wedding-border bg-wedding-page shadow-card" style={{ width: `${card.width}px`, height: `${card.height}px`, "min-width": "240px", "min-height": "180px" }}>
        <img src={card.imageDataUrl} alt={card.alt} class="h-full w-full bg-wedding-page object-contain" />
        <div class="absolute right-2 top-2 flex gap-1 rounded-full bg-white/95 p-1 shadow-sm">
          <button type="button" aria-label="Move photo up" disabled={index() === 0} class="h-8 w-8 rounded-full text-sm font-bold disabled:opacity-35" onClick={() => move(index(), -1)}>↑</button>
          <button type="button" aria-label="Move photo down" disabled={index() === cards().length - 1} class="h-8 w-8 rounded-full text-sm font-bold disabled:opacity-35" onClick={() => move(index(), 1)}>↓</button>
          <button type="button" aria-label="Remove photo" class="h-8 w-8 rounded-full text-sm font-bold text-rose-700" onClick={() => remove(card.id)}>×</button>
        </div>
        <button type="button" class="absolute bottom-2 right-2 rounded-lg bg-white/95 px-2 py-1 text-[11px] font-semibold shadow-sm" onClick={() => element && updateSize(card.id, element)}>Save size</button>
      </article>;
    }}</For></div>
    <button ref={addButton} type="button" class="mt-3 flex min-h-28 w-full items-center justify-center rounded-2xl border border-dashed border-wedding-primary/45 bg-wedding-page text-wedding-primary transition hover:bg-wedding-slate" onClick={() => input?.click()} aria-label={cards().length ? "Add another wedding photo" : "Add a wedding photo"}>
      <span class="flex flex-col items-center gap-2"><span class="flex h-11 w-11 items-center justify-center rounded-full border border-current text-2xl">+</span><span class="text-sm font-semibold">{cards().length ? "Add another photo" : "Add a photo"}</span></span>
    </button>
    <input ref={input} type="file" accept="image/*" class="hidden" onChange={(event) => void add(event)} />
    <Show when={notice()}>{(message) => <p class="mt-2 text-xs text-wedding-ink/70" role="status">{message()}</p>}</Show>
  </section>;
}
