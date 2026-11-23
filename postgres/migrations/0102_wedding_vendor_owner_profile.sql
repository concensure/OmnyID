-- Owner data is intentionally separate from the public source-derived listing.
-- A revoked claim can therefore be hidden without destroying source provenance.
CREATE TABLE IF NOT EXISTS wedding_vendor_owner_profile (
    vendor_id TEXT PRIMARY KEY REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    description TEXT CHECK (char_length(description) <= 4000),
    price_tier TEXT CHECK (price_tier IN ('$', '$$', '$$$', '$$$$')),
    price_from_cents INTEGER CHECK (price_from_cents IS NULL OR price_from_cents >= 0),
    price_to_cents INTEGER CHECK (price_to_cents IS NULL OR price_to_cents >= 0),
    capacity_min INTEGER CHECK (capacity_min IS NULL OR capacity_min >= 0),
    capacity_max INTEGER CHECK (capacity_max IS NULL OR capacity_max >= 0),
    styles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    service_regions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    availability JSONB NOT NULL DEFAULT '[]'::jsonb,
    public_contact JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (price_from_cents IS NULL OR price_to_cents IS NULL OR price_from_cents <= price_to_cents),
    CHECK (capacity_min IS NULL OR capacity_max IS NULL OR capacity_min <= capacity_max)
);

CREATE INDEX IF NOT EXISTS idx_wvop_flags ON wedding_vendor_owner_profile USING GIN (flags);
CREATE INDEX IF NOT EXISTS idx_wvop_styles ON wedding_vendor_owner_profile USING GIN (styles);
CREATE INDEX IF NOT EXISTS idx_wvop_regions ON wedding_vendor_owner_profile USING GIN (service_regions);
CREATE INDEX IF NOT EXISTS idx_wvop_capacity ON wedding_vendor_owner_profile (capacity_min, capacity_max);

CREATE TABLE IF NOT EXISTS wedding_vendor_owner_assets (
    asset_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    uploaded_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    is_cover BOOLEAN NOT NULL DEFAULT FALSE,
    seaweed_fid_full TEXT NOT NULL,
    seaweed_fid_medium TEXT NOT NULL,
    seaweed_fid_thumb TEXT NOT NULL,
    width INTEGER NOT NULL CHECK (width > 0),
    height INTEGER NOT NULL CHECK (height > 0),
    bytes INTEGER NOT NULL CHECK (bytes > 0),
    alt_text TEXT CHECK (char_length(alt_text) <= 500),
    status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'hidden', 'removed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wvoa_vendor
    ON wedding_vendor_owner_assets (vendor_id, position) WHERE status = 'live';
CREATE UNIQUE INDEX IF NOT EXISTS uq_wvoa_live_cover
    ON wedding_vendor_owner_assets (vendor_id) WHERE is_cover AND status = 'live';

CREATE TABLE IF NOT EXISTS wedding_vendor_agent_links (
    vendor_id TEXT PRIMARY KEY REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES managed_agents(agent_id) ON DELETE CASCADE,
    agent_card JSONB NOT NULL,
    card_verified_at TIMESTAMPTZ NOT NULL,
    last_heartbeat_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_vendor_agent_links_agent
    ON wedding_vendor_agent_links (agent_id);
