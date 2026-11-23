// @locs-version: 2.0
import { For, Show, createSignal } from "solid-js";
import {
  deleteAdminWeddingVendorRoom,
  uploadAdminWeddingVendorRoomPhoto,
  upsertAdminWeddingVendorRoom,
} from "@/lib/adminWeddingVendorRoomApi";
import {
  adminWeddingVendorRoomDraftFromRoom,
  buildAdminWeddingVendorRoomPayload,
  emptyAdminWeddingVendorRoomDraft,
  type AdminWeddingVendorRoom,
  type AdminWeddingVendorRoomDraft,
} from "@/lib/adminWeddingVendorRoomState";
import { API_BASE, type WeddingVendor } from "@/lib/api";
import { weddingVendorRoomPhotoSrc } from "@/lib/weddingVendorRoomState";

const INPUT_CLASS = "min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900";
const BUTTON_CLASS = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-60";

type TextDraftKey = Exclude<keyof AdminWeddingVendorRoomDraft, "roomId" | "photoUrls">;

export default function UsageAdminWeddingVendorRoomsEditor(props: {
  vendor: WeddingVendor;
  disabled?: boolean;
  onVendorChanged: (vendor: WeddingVendor | null) => void;
}) {
  const [draft, setDraft] = createSignal<AdminWeddingVendorRoomDraft | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const locked = () => props.disabled === true || busy();
  const editingRoom = (): AdminWeddingVendorRoom | undefined =>
    props.vendor.rooms.find((room) => room.roomId === draft()?.roomId);

  function patch(key: TextDraftKey, value: string) {
    setError(null);
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function patchPhotoUrl(index: number, value: string) {
    setDraft((current) => {
      if (!current) return current;
      const photoUrls = [...current.photoUrls] as AdminWeddingVendorRoomDraft["photoUrls"];
      photoUrls[index] = value;
      return { ...current, photoUrls };
    });
  }

  async function run(action: () => Promise<{ vendor: WeddingVendor | null }>, afterSuccess?: () => void) {
    setBusy(true);
    setError(null);
    try {
      const response = await action();
      props.onVendorChanged(response.vendor);
      afterSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Room change failed.");
    } finally {
      setBusy(false);
    }
  }

  // A div (not a form) wraps the fields: this editor renders inside the vendor form.
  function save() {
    const current = draft();
    if (!current) return;
    const { payload, errors } = buildAdminWeddingVendorRoomPayload(current);
    if (!payload) {
      setError(errors.join(" "));
      return;
    }
    void run(() => upsertAdminWeddingVendorRoom(props.vendor.vendorId, payload), () => setDraft(null));
  }

  function remove(room: AdminWeddingVendorRoom) {
    if (typeof window !== "undefined" && !window.confirm(`Delete room "${room.roomName}" and its photos?`)) return;
    void run(() => deleteAdminWeddingVendorRoom(props.vendor.vendorId, room.roomId), () => {
      if (draft()?.roomId === room.roomId) setDraft(null);
    });
  }

  function upload(roomId: string, slot: number, file: File | undefined) {
    if (!file) return;
    void run(() => uploadAdminWeddingVendorRoomPhoto(props.vendor.vendorId, roomId, slot, file));
  }

  return (
    <details class="mt-3 rounded-xl border border-slate-200 bg-white/80 p-3" data-testid="admin-vendor-rooms">
      <summary class="cursor-pointer text-sm font-semibold text-slate-950">
        Rooms and pricing ({props.vendor.rooms.length})
      </summary>
      <p class="mt-2 text-xs leading-5 text-slate-600">
        Spaces within this vendor, each with its own pricing, inclusions and up to three photos. Couples see these on the vendor card and in the comparison.
      </p>
      <Show when={error()}>
        {(message) => <p class="mt-2 rounded-lg bg-rose-50 px-2 py-1.5 text-xs text-rose-800" role="alert">{message()}</p>}
      </Show>
      <ul class="mt-2 grid gap-2">
        <For each={props.vendor.rooms}>
          {(room) => (
            <li class="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-2">
              <div class="min-w-0">
                <p class="break-words text-xs font-semibold text-slate-900">{room.roomName}</p>
                <p class="break-words text-[11px] text-slate-600">{room.pricingLabel ?? "No pricing text"} · {room.photos.length} photo(s)</p>
              </div>
              <div class="flex gap-1.5">
                <button type="button" class={BUTTON_CLASS} disabled={locked()} onClick={() => setDraft(adminWeddingVendorRoomDraftFromRoom(room))}>Edit</button>
                <button type="button" class={BUTTON_CLASS} disabled={locked()} onClick={() => remove(room)}>Delete</button>
              </div>
            </li>
          )}
        </For>
      </ul>
      <Show when={!draft()}>
        <button type="button" class={`${BUTTON_CLASS} mt-2`} disabled={locked()} onClick={() => setDraft(emptyAdminWeddingVendorRoomDraft())}>
          Add room
        </button>
      </Show>
      <Show when={draft()}>
        {(current) => (
          <div
            class="mt-3 grid min-w-0 gap-2"
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.target instanceof HTMLTextAreaElement) return;
              event.preventDefault();
              save();
            }}
          >
            <div class="grid gap-2 sm:grid-cols-[minmax(0,2fr)_6rem]">
              <input class={INPUT_CLASS} placeholder="Room name (required)" value={current().roomName} onInput={(event) => patch("roomName", event.currentTarget.value)} />
              <input class={INPUT_CLASS} placeholder="Order" inputmode="numeric" value={current().sortOrder} onInput={(event) => patch("sortOrder", event.currentTarget.value)} />
            </div>
            <input class={INPUT_CLASS} placeholder='Pricing text as the vendor stated it, e.g. "From $15,500 for ~100 guests"' value={current().pricingLabel} onInput={(event) => patch("pricingLabel", event.currentTarget.value)} />
            <div class="grid gap-2 sm:grid-cols-2">
              <input class={INPUT_CLASS} placeholder="Price from (AUD, optional)" inputmode="decimal" value={current().priceFrom} onInput={(event) => patch("priceFrom", event.currentTarget.value)} />
              <input class={INPUT_CLASS} placeholder="Minimum spend (AUD, optional)" inputmode="decimal" value={current().minimumSpend} onInput={(event) => patch("minimumSpend", event.currentTarget.value)} />
            </div>
            <input class={INPUT_CLASS} placeholder="Minimum spend note" value={current().minimumSpendNote} onInput={(event) => patch("minimumSpendNote", event.currentTarget.value)} />
            <div class="grid gap-2 sm:grid-cols-2">
              <input class={INPUT_CLASS} placeholder="Seated capacity" inputmode="numeric" value={current().capacitySeated} onInput={(event) => patch("capacitySeated", event.currentTarget.value)} />
              <input class={INPUT_CLASS} placeholder="Standing capacity" inputmode="numeric" value={current().capacityStanding} onInput={(event) => patch("capacityStanding", event.currentTarget.value)} />
            </div>
            <textarea class={`${INPUT_CLASS} min-h-16`} placeholder="Inclusions, one per line" value={current().inclusions} onInput={(event) => patch("inclusions", event.currentTarget.value)} />
            <textarea class={`${INPUT_CLASS} min-h-16`} placeholder="Description" value={current().description} onInput={(event) => patch("description", event.currentTarget.value)} />
            <input class={INPUT_CLASS} placeholder="Availability note" value={current().availabilityNote} onInput={(event) => patch("availabilityNote", event.currentTarget.value)} />
            <div class="grid gap-2 sm:grid-cols-3">
              <input class={INPUT_CLASS} placeholder="Source URL" type="url" value={current().sourceUrl} onInput={(event) => patch("sourceUrl", event.currentTarget.value)} />
              <input class={INPUT_CLASS} placeholder="Source label" value={current().sourceLabel} onInput={(event) => patch("sourceLabel", event.currentTarget.value)} />
              <input class={INPUT_CLASS} type="date" aria-label="Source checked date" value={current().sourceCheckedAt} onInput={(event) => patch("sourceCheckedAt", event.currentTarget.value)} />
            </div>
            <fieldset class="grid gap-2">
              <legend class="text-[11px] font-semibold uppercase text-slate-500">Photos (up to 3)</legend>
              <For each={[1, 2, 3] as const}>
                {(slot) => {
                  const existing = () => editingRoom()?.photos.find((photo) => photo.slot === slot);
                  const roomId = () => current().roomId;
                  return (
                    <div class="grid min-w-0 items-center gap-2 sm:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)]">
                      <Show when={weddingVendorRoomPhotoSrc(existing()?.photoUrl ?? null, API_BASE)} fallback={<span class="text-[11px] text-slate-500">Slot {slot}</span>}>
                        {(src) => <img src={src()} alt={`Room photo ${slot}`} class="h-12 w-12 rounded-md object-cover" />}
                      </Show>
                      <input class={INPUT_CLASS} type="url" placeholder="Replace with photo URL" value={current().photoUrls[slot - 1]} onInput={(event) => patchPhotoUrl(slot - 1, event.currentTarget.value)} />
                      <Show when={roomId()} fallback={<span class="text-[11px] text-slate-500">Save the room to upload files</span>}>
                        {(id) => (
                          <input
                            class="min-w-0 text-xs"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={locked()}
                            aria-label={`Upload photo for slot ${slot}`}
                            onChange={(event) => {
                              upload(id(), slot, event.currentTarget.files?.[0]);
                              event.currentTarget.value = "";
                            }}
                          />
                        )}
                      </Show>
                    </div>
                  );
                }}
              </For>
            </fieldset>
            <div class="flex gap-2">
              <button type="button" onClick={save} class="rounded-lg border border-rose-300 bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60" disabled={locked()}>
                {busy() ? "Saving..." : "Save room"}
              </button>
              <button type="button" class={BUTTON_CLASS} disabled={locked()} onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Show>
    </details>
  );
}
