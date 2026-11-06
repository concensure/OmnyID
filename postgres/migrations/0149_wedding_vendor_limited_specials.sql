-- Vendor-controlled limited-date Wedding offers.
-- Publication is false-default. Applying this migration creates no live offer.
-- Couple-specific availability evidence remains in wedding_vendor_availability.

CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_vendor_rooms_room_vendor
    ON wedding_vendor_rooms (room_id, vendor_id);

CREATE TABLE IF NOT EXISTS wedding_vendor_special_offers (
    offer_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    creation_idempotency_key TEXT NOT NULL CHECK (
        char_length(creation_idempotency_key) BETWEEN 8 AND 160
    ),
    room_id TEXT,
    category TEXT NOT NULL CHECK (char_length(category) BETWEEN 1 AND 120),
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
    summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 1200),
    offer_type TEXT NOT NULL CHECK (offer_type IN (
        'package', 'minimum_spend', 'per_head', 'hire_fee', 'incentive_only'
    )),
    publication_state TEXT NOT NULL DEFAULT 'draft' CHECK (publication_state IN (
        'draft', 'active', 'paused', 'withdrawn', 'expired'
    )),
    guest_min INTEGER CHECK (guest_min IS NULL OR guest_min >= 0),
    guest_max INTEGER CHECK (guest_max IS NULL OR guest_max >= 0),
    currency TEXT NOT NULL DEFAULT 'AUD' CHECK (currency ~ '^[A-Z]{3}$'),
    fixed_total_cents BIGINT CHECK (fixed_total_cents IS NULL OR fixed_total_cents >= 0),
    per_guest_cents BIGINT CHECK (per_guest_cents IS NULL OR per_guest_cents >= 0),
    hire_fee_cents BIGINT CHECK (hire_fee_cents IS NULL OR hire_fee_cents >= 0),
    minimum_spend_cents BIGINT CHECK (minimum_spend_cents IS NULL OR minimum_spend_cents >= 0),
    mandatory_charges_cents BIGINT CHECK (mandatory_charges_cents IS NULL OR mandatory_charges_cents >= 0),
    mandatory_charges_known BOOLEAN NOT NULL DEFAULT FALSE,
    mandatory_charges_summary TEXT CHECK (
        mandatory_charges_summary IS NULL OR char_length(mandatory_charges_summary) <= 1000
    ),
    estimate_min_cents BIGINT CHECK (estimate_min_cents IS NULL OR estimate_min_cents >= 0),
    estimate_max_cents BIGINT CHECK (estimate_max_cents IS NULL OR estimate_max_cents >= 0),
    reference_price_cents BIGINT CHECK (reference_price_cents IS NULL OR reference_price_cents >= 0),
    savings_basis_label TEXT CHECK (savings_basis_label IS NULL OR char_length(savings_basis_label) <= 240),
    savings_evidence_ref TEXT CHECK (savings_evidence_ref IS NULL OR char_length(savings_evidence_ref) <= 500),
    inclusions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    exclusions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    public_conditions TEXT CHECK (public_conditions IS NULL OR char_length(public_conditions) <= 2000),
    approved_package_version TEXT CHECK (
        approved_package_version IS NULL OR char_length(approved_package_version) <= 120
    ),
    approved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    valid_from DATE,
    valid_until DATE,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    approved_revision BIGINT CHECK (approved_revision IS NULL OR approved_revision > 0),
    created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (room_id, vendor_id)
        REFERENCES wedding_vendor_rooms(room_id, vendor_id) ON DELETE RESTRICT,
    CHECK (guest_min IS NULL OR guest_max IS NULL OR guest_min <= guest_max),
    CHECK (estimate_min_cents IS NULL OR estimate_max_cents IS NULL OR estimate_min_cents <= estimate_max_cents),
    CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from <= valid_until),
    CHECK (
        reference_price_cents IS NULL OR (
            savings_basis_label IS NOT NULL AND savings_evidence_ref IS NOT NULL
        )
    ),
    CHECK (
        publication_state <> 'active' OR (
            approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL
            AND approved_revision = revision
        )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_vendor_special_offer_creation
    ON wedding_vendor_special_offers (vendor_id, creation_idempotency_key);

CREATE INDEX IF NOT EXISTS idx_wedding_vendor_special_offers_vendor
    ON wedding_vendor_special_offers (vendor_id, publication_state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_special_offers_discovery
    ON wedding_vendor_special_offers (lower(category), publication_state, valid_from, valid_until)
    WHERE publication_state = 'active';

-- Private pricing is deliberately a separate encrypted record. Couple/public
-- discovery queries must never join or serialize this table.
CREATE TABLE IF NOT EXISTS wedding_vendor_special_offer_private_pricing (
    offer_id TEXT PRIMARY KEY REFERENCES wedding_vendor_special_offers(offer_id) ON DELETE CASCADE,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    schema_version TEXT NOT NULL,
    ciphertext BYTEA NOT NULL,
    encryption_key_ref TEXT NOT NULL CHECK (char_length(encryption_key_ref) BETWEEN 1 AND 240),
    content_digest TEXT NOT NULL CHECK (content_digest ~ '^[a-f0-9]{64}$'),
    revision BIGINT NOT NULL CHECK (revision > 0),
    updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wedding_vendor_special_offer_slots (
    slot_id TEXT PRIMARY KEY,
    offer_id TEXT NOT NULL REFERENCES wedding_vendor_special_offers(offer_id) ON DELETE CASCADE,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    local_date DATE NOT NULL,
    timezone TEXT NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 80),
    starts_at TIME,
    ends_at TIME,
    space_label TEXT NOT NULL DEFAULT '' CHECK (char_length(space_label) <= 160),
    session_label TEXT NOT NULL DEFAULT '' CHECK (char_length(session_label) <= 160),
    maximum_capacity INTEGER CHECK (maximum_capacity IS NULL OR maximum_capacity > 0),
    minimum_spend_cents BIGINT CHECK (
        minimum_spend_cents IS NULL OR minimum_spend_cents >= 0
    ),
    indicative_per_head_cents BIGINT CHECK (
        indicative_per_head_cents IS NULL OR indicative_per_head_cents >= 0
    ),
    inclusions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    public_conditions TEXT CHECK (
        public_conditions IS NULL OR char_length(public_conditions) <= 1200
    ),
    state TEXT NOT NULL DEFAULT 'available' CHECK (state IN (
        'available', 'enquiry_received', 'provisional_hold', 'booked',
        'paused', 'withdrawn', 'stale'
    )),
    hold_expires_at TIMESTAMPTZ,
    last_confirmed_at TIMESTAMPTZ NOT NULL,
    confirmation_expires_at TIMESTAMPTZ NOT NULL,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    source_ref TEXT CHECK (source_ref IS NULL OR char_length(source_ref) <= 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at),
    CHECK (last_confirmed_at < confirmation_expires_at),
    CHECK (state <> 'provisional_hold' OR hold_expires_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wedding_vendor_special_offer_slot_scope
    ON wedding_vendor_special_offer_slots (
        offer_id, local_date, space_label, session_label,
        COALESCE(starts_at, TIME '00:00:00')
    );
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_special_offer_slots_discovery
    ON wedding_vendor_special_offer_slots (local_date, state, confirmation_expires_at, vendor_id)
    WHERE state IN ('available', 'enquiry_received');
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_special_offer_slots_expiry
    ON wedding_vendor_special_offer_slots (confirmation_expires_at)
    WHERE state IN ('available', 'enquiry_received');
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_special_offer_holds_expiry
    ON wedding_vendor_special_offer_slots (hold_expires_at)
    WHERE state = 'provisional_hold';

CREATE TABLE IF NOT EXISTS wedding_vendor_special_offer_grants (
    grant_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    offer_id TEXT REFERENCES wedding_vendor_special_offers(offer_id) ON DELETE CASCADE,
    token_prefix TEXT NOT NULL CHECK (char_length(token_prefix) BETWEEN 6 AND 24),
    token_digest TEXT NOT NULL UNIQUE CHECK (token_digest ~ '^[a-f0-9]{64}$'),
    allowed_operations JSONB NOT NULL CHECK (jsonb_typeof(allowed_operations) = 'array'),
    generation INTEGER NOT NULL DEFAULT 1 CHECK (generation > 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'exchanged', 'revoked', 'rotated', 'expired'
    )),
    expires_at TIMESTAMPTZ NOT NULL,
    exchanged_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_special_offer_grant_lookup
    ON wedding_vendor_special_offer_grants (token_prefix, status, expires_at);

CREATE TABLE IF NOT EXISTS wedding_vendor_special_offer_sessions (
    session_id TEXT PRIMARY KEY,
    grant_id TEXT NOT NULL REFERENCES wedding_vendor_special_offer_grants(grant_id) ON DELETE CASCADE,
    session_token_digest TEXT NOT NULL UNIQUE CHECK (session_token_digest ~ '^[a-f0-9]{64}$'),
    csrf_token_digest TEXT NOT NULL CHECK (csrf_token_digest ~ '^[a-f0-9]{64}$'),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS wedding_vendor_special_offer_enquiries (
    link_id TEXT PRIMARY KEY,
    offer_id TEXT NOT NULL REFERENCES wedding_vendor_special_offers(offer_id) ON DELETE RESTRICT,
    slot_id TEXT NOT NULL REFERENCES wedding_vendor_special_offer_slots(slot_id) ON DELETE RESTRICT,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    enquiry_envelope_ref TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    slot_revision BIGINT NOT NULL CHECK (slot_revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id, idempotency_key),
    UNIQUE (owner_user_id, enquiry_envelope_ref)
);
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_special_offer_enquiries_slot
    ON wedding_vendor_special_offer_enquiries (slot_id, created_at DESC);

-- Content-light operational audit. Couple message bodies and private pricing
-- are excluded; couple-specific authority continues to live in AFP.
CREATE TABLE IF NOT EXISTS wedding_vendor_special_offer_events (
    event_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    offer_id TEXT NOT NULL REFERENCES wedding_vendor_special_offers(offer_id) ON DELETE CASCADE,
    slot_id TEXT REFERENCES wedding_vendor_special_offer_slots(slot_id) ON DELETE CASCADE,
    event_kind TEXT NOT NULL CHECK (event_kind IN (
        'created', 'approved', 'published', 'reconfirmed', 'paused', 'withdrawn',
        'viewed', 'enquiry_received', 'hold_created', 'hold_expired', 'booked',
        'stale', 'delivery_failed'
    )),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN (
        'vendor_user', 'management_capability', 'operator', 'system', 'couple'
    )),
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    source_ref TEXT CHECK (source_ref IS NULL OR char_length(source_ref) <= 500),
    dedupe_key TEXT NOT NULL CHECK (char_length(dedupe_key) BETWEEN 1 AND 240),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (offer_id, event_kind, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_special_offer_events_vendor
    ON wedding_vendor_special_offer_events (vendor_id, occurred_at DESC);
