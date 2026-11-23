-- Rooms/spaces within a vendor (e.g. a venue's barn vs. ceremony lawn), each with its own
-- pricing, inclusions and photo. Additive: vendors without rooms behave exactly as before.
CREATE TABLE IF NOT EXISTS wedding_vendor_rooms (
    room_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    room_name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    capacity_seated INTEGER CHECK (capacity_seated IS NULL OR capacity_seated >= 0),
    capacity_standing INTEGER CHECK (capacity_standing IS NULL OR capacity_standing >= 0),
    -- Display text stays authoritative ("From $15,500 for ~100 guests"); cents are optional
    -- machine-readable values for ranking and are NULL whenever the vendor did not state them.
    pricing_label TEXT,
    price_from_cents BIGINT CHECK (price_from_cents IS NULL OR price_from_cents >= 0),
    minimum_spend_cents BIGINT CHECK (minimum_spend_cents IS NULL OR minimum_spend_cents >= 0),
    minimum_spend_note TEXT,
    inclusions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    availability_note TEXT,
    source_url TEXT,
    source_label TEXT,
    source_checked_at DATE,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (vendor_id, room_name)
);

CREATE INDEX IF NOT EXISTS idx_wedding_vendor_rooms_vendor
    ON wedding_vendor_rooms (vendor_id, sort_order);

-- One photo per slot per room. Bytes live in Seaweed FS (storage_bucket/storage_key); photo_url
-- is only for externally hosted images, so exactly one of the two must be present.
CREATE TABLE IF NOT EXISTS wedding_vendor_room_photos (
    photo_id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES wedding_vendor_rooms(room_id) ON DELETE CASCADE,
    slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 3),
    storage_bucket TEXT,
    storage_key TEXT,
    photo_url TEXT,
    content_type TEXT,
    alt_text TEXT,
    source_label TEXT,
    source_url TEXT,
    retrieved_at TIMESTAMPTZ,
    licence_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (room_id, slot),
    CHECK ((storage_key IS NOT NULL AND storage_bucket IS NOT NULL) <> (photo_url IS NOT NULL))
);
