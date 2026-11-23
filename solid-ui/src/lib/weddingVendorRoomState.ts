// @locs-version: 2.0
// Rooms (e.g. a venue's barn vs. ceremony lawn) carry their own price, inclusions and photo.
// Cards persist display strings only, so a saved comparison still reads the same after the
// vendor's room data changes.

export type WeddingVendorRoomEvidence = {
  room_id: string;
  name: string;
  pricing_label: string | null;
  price_from_cents: number | null;
  minimum_spend_cents: number | null;
  minimum_spend_note: string | null;
  capacity_seated: number | null;
  capacity_standing: number | null;
  inclusions: string[];
  availability_note: string | null;
  photo_urls: string[];
};

export type WeddingVendorRoomCardRow = {
  name: string;
  summary: string;
  imageUrl: string | null;
};

const MAX_ROOM_ROWS = 4;
const MAX_INLINE_INCLUSIONS = 4;
const STORED_PHOTO_PATH = /^\/api\/public\/wedding\/vendor\/room-photos\/[\w-]+\/[1-3]$/;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function roomPhotoUrl(value: unknown): string | null {
  const url = clean(value);
  if (STORED_PHOTO_PATH.test(url)) return url;
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname) ? null : url;
  } catch {
    return null;
  }
}

export function normalizeWeddingVendorRooms(value: unknown): WeddingVendorRoomEvidence[] | null {
  if (!Array.isArray(value)) return null;
  const rooms = value.flatMap((item): WeddingVendorRoomEvidence[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const name = clean(record.name);
    if (!name) return [];
    return [{
      room_id: clean(record.room_id),
      name,
      pricing_label: clean(record.pricing_label) || null,
      price_from_cents: nullableNumber(record.price_from_cents),
      minimum_spend_cents: nullableNumber(record.minimum_spend_cents),
      minimum_spend_note: clean(record.minimum_spend_note) || null,
      capacity_seated: nullableNumber(record.capacity_seated),
      capacity_standing: nullableNumber(record.capacity_standing),
      inclusions: Array.isArray(record.inclusions) ? record.inclusions.map(clean).filter(Boolean) : [],
      availability_note: clean(record.availability_note) || null,
      photo_urls: Array.isArray(record.photo_urls)
        ? record.photo_urls.flatMap((url) => roomPhotoUrl(url) ?? [])
        : [],
    }];
  });
  return rooms.length > 0 ? rooms : null;
}

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-AU")}`;
}

/** The vendor's own pricing text wins; derived figures only fill in when it is absent. */
function roomSummary(room: WeddingVendorRoomEvidence): string {
  const price = room.pricing_label
    ?? (room.price_from_cents !== null ? `From ${dollars(room.price_from_cents)}` : null);
  const minimumSpend = room.minimum_spend_note
    ?? (room.minimum_spend_cents !== null ? `Minimum spend ${dollars(room.minimum_spend_cents)}` : null);
  const capacity = room.capacity_seated !== null
    ? `Seats ${room.capacity_seated}`
    : room.capacity_standing !== null ? `Standing ${room.capacity_standing}` : null;
  const inclusions = room.inclusions.length > 0
    ? `Includes ${room.inclusions.slice(0, MAX_INLINE_INCLUSIONS).join(", ")}`
      + (room.inclusions.length > MAX_INLINE_INCLUSIONS ? "…" : "")
    : null;
  return [price, minimumSpend, capacity, inclusions, room.availability_note]
    .filter((part): part is string => Boolean(part))
    .join(" · ") || "Pricing not provided";
}

export function weddingVendorRoomCardRows(
  rooms: readonly WeddingVendorRoomEvidence[] | null | undefined,
): WeddingVendorRoomCardRow[] {
  return (rooms ?? []).slice(0, MAX_ROOM_ROWS).map((room) => ({
    name: room.name,
    summary: roomSummary(room),
    imageUrl: room.photo_urls[0] ?? null,
  }));
}

export function weddingVendorRoomCardRowsFromRecord(value: unknown): WeddingVendorRoomCardRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): WeddingVendorRoomCardRow[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const name = clean(record.name);
    if (!name) return [];
    return [{
      name,
      summary: clean(record.summary) || "Pricing not provided",
      imageUrl: roomPhotoUrl(record.image_url),
    }];
  }).slice(0, MAX_ROOM_ROWS);
}

export function weddingVendorRoomCardRowsToRecords(
  rows: readonly WeddingVendorRoomCardRow[],
): Array<Record<string, unknown>> {
  return rows.map((row) => ({ name: row.name, summary: row.summary, image_url: row.imageUrl }));
}

/** Stored photos are served by the API origin, so the relative path needs that origin in front. */
export function weddingVendorRoomPhotoSrc(imageUrl: string | null, apiBase: string): string | null {
  if (!imageUrl) return null;
  return imageUrl.startsWith("/") ? `${apiBase.replace(/\/+$/, "")}${imageUrl}` : imageUrl;
}

export function weddingVendorRoomsComparisonLabel(rows: readonly WeddingVendorRoomCardRow[]): string {
  return rows.length > 0 ? rows.map((row) => `${row.name}: ${row.summary}`).join("; ") : "No room details yet";
}
