// @locs-version: 2.0
// Operator-side shape of a vendor room plus the draft/payload mapping for the rooms editor.

export type AdminWeddingVendorRoomPhoto = {
  slot: number;
  photoUrl: string | null;
  stored: boolean;
  altText: string | null;
};

export type AdminWeddingVendorRoom = {
  roomId: string;
  roomName: string;
  sortOrder: number;
  description: string | null;
  capacitySeated: number | null;
  capacityStanding: number | null;
  pricingLabel: string | null;
  priceFromCents: number | null;
  minimumSpendCents: number | null;
  minimumSpendNote: string | null;
  inclusions: string[];
  availabilityNote: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  sourceCheckedAt: string | null;
  photos: AdminWeddingVendorRoomPhoto[];
};

export type AdminWeddingVendorRoomDraft = {
  roomId: string | null;
  roomName: string;
  sortOrder: string;
  description: string;
  capacitySeated: string;
  capacityStanding: string;
  pricingLabel: string;
  priceFrom: string;
  minimumSpend: string;
  minimumSpendNote: string;
  inclusions: string;
  availabilityNote: string;
  sourceUrl: string;
  sourceLabel: string;
  sourceCheckedAt: string;
  photoUrls: [string, string, string];
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeAdminWeddingVendorRooms(value: unknown): AdminWeddingVendorRoom[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AdminWeddingVendorRoom[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const roomId = text(record.room_id);
    const roomName = text(record.room_name);
    if (!roomId || !roomName) return [];
    return [{
      roomId,
      roomName,
      sortOrder: count(record.sort_order) ?? 0,
      description: text(record.description),
      capacitySeated: count(record.capacity_seated),
      capacityStanding: count(record.capacity_standing),
      pricingLabel: text(record.pricing_label),
      priceFromCents: count(record.price_from_cents),
      minimumSpendCents: count(record.minimum_spend_cents),
      minimumSpendNote: text(record.minimum_spend_note),
      inclusions: Array.isArray(record.inclusions)
        ? record.inclusions.flatMap((entry) => text(entry) ?? [])
        : [],
      availabilityNote: text(record.availability_note),
      sourceUrl: text(record.source_url),
      sourceLabel: text(record.source_label),
      sourceCheckedAt: text(record.source_checked_at),
      photos: Array.isArray(record.photos)
        ? record.photos.flatMap((photo): AdminWeddingVendorRoomPhoto[] => {
          if (!photo || typeof photo !== "object" || Array.isArray(photo)) return [];
          const entry = photo as Record<string, unknown>;
          const slot = count(entry.slot);
          if (slot === null) return [];
          const stored = entry.stored === true;
          return [{
            slot,
            photoUrl: text(entry.photo_url)
              ?? (stored ? `/api/public/wedding/vendor/room-photos/${roomId}/${slot}` : null),
            stored,
            altText: text(entry.alt_text),
          }];
        })
        : [],
    }];
  });
}

export function emptyAdminWeddingVendorRoomDraft(): AdminWeddingVendorRoomDraft {
  return {
    roomId: null,
    roomName: "",
    sortOrder: "0",
    description: "",
    capacitySeated: "",
    capacityStanding: "",
    pricingLabel: "",
    priceFrom: "",
    minimumSpend: "",
    minimumSpendNote: "",
    inclusions: "",
    availabilityNote: "",
    sourceUrl: "",
    sourceLabel: "",
    sourceCheckedAt: "",
    photoUrls: ["", "", ""],
  };
}

const centsToDollars = (cents: number | null): string => (cents === null ? "" : String(cents / 100));
const numberToText = (value: number | null): string => (value === null ? "" : String(value));

export function adminWeddingVendorRoomDraftFromRoom(room: AdminWeddingVendorRoom): AdminWeddingVendorRoomDraft {
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    sortOrder: String(room.sortOrder),
    description: room.description ?? "",
    capacitySeated: numberToText(room.capacitySeated),
    capacityStanding: numberToText(room.capacityStanding),
    pricingLabel: room.pricingLabel ?? "",
    priceFrom: centsToDollars(room.priceFromCents),
    minimumSpend: centsToDollars(room.minimumSpendCents),
    minimumSpendNote: room.minimumSpendNote ?? "",
    inclusions: room.inclusions.join("\n"),
    availabilityNote: room.availabilityNote ?? "",
    sourceUrl: room.sourceUrl ?? "",
    sourceLabel: room.sourceLabel ?? "",
    sourceCheckedAt: room.sourceCheckedAt ?? "",
    // Existing photos stay as they are; a URL here replaces that slot on save.
    photoUrls: ["", "", ""],
  };
}

function parseWholeNumber(raw: string, label: string, errors: string[]): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0) {
    errors.push(`${label} must be a whole number of zero or more.`);
    return null;
  }
  return value;
}

function parseDollarsToCents(raw: string, label: string, errors: string[]): number | null {
  const trimmed = raw.trim().replace(/[$,\s]/g, "");
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) {
    errors.push(`${label} must be a dollar amount of zero or more, for example 15500.`);
    return null;
  }
  return Math.round(value * 100);
}

export function buildAdminWeddingVendorRoomPayload(
  draft: AdminWeddingVendorRoomDraft,
): { payload: Record<string, unknown> | null; errors: string[] } {
  const errors: string[] = [];
  const roomName = draft.roomName.trim();
  if (!roomName) errors.push("Room name is required.");
  const sortOrder = parseWholeNumber(draft.sortOrder, "Sort order", errors) ?? 0;
  const capacitySeated = parseWholeNumber(draft.capacitySeated, "Seated capacity", errors);
  const capacityStanding = parseWholeNumber(draft.capacityStanding, "Standing capacity", errors);
  const priceFromCents = parseDollarsToCents(draft.priceFrom, "Price from", errors);
  const minimumSpendCents = parseDollarsToCents(draft.minimumSpend, "Minimum spend", errors);
  if (errors.length > 0) return { payload: null, errors };
  const optional = (value: string): string | null => value.trim() || null;
  const photos = draft.photoUrls.flatMap((url, index) =>
    url.trim() ? [{ slot: index + 1, photo_url: url.trim() }] : []);
  return {
    errors,
    payload: {
      room_name: roomName,
      sort_order: sortOrder,
      description: optional(draft.description),
      capacity_seated: capacitySeated,
      capacity_standing: capacityStanding,
      pricing_label: optional(draft.pricingLabel),
      price_from_cents: priceFromCents,
      minimum_spend_cents: minimumSpendCents,
      minimum_spend_note: optional(draft.minimumSpendNote),
      inclusions: draft.inclusions.split("\n").map((line) => line.trim()).filter(Boolean),
      availability_note: optional(draft.availabilityNote),
      source_url: optional(draft.sourceUrl),
      source_label: optional(draft.sourceLabel),
      source_checked_at: optional(draft.sourceCheckedAt),
      ...(photos.length > 0 ? { photos } : {}),
    },
  };
}
