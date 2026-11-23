CREATE TABLE IF NOT EXISTS wedding_vendors (
    vendor_id TEXT PRIMARY KEY,
    vendor_slug TEXT NOT NULL UNIQUE,
    vendor_name TEXT NOT NULL,
    category TEXT NOT NULL,
    service_area TEXT NOT NULL,
    address TEXT,
    website_url TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    source_url TEXT,
    source_label TEXT,
    source_checked_at DATE,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'hidden', 'archived')),
    notes TEXT,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    caveat_labels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wedding_vendors_category
    ON wedding_vendors (category);

CREATE INDEX IF NOT EXISTS idx_wedding_vendors_service_area
    ON wedding_vendors (service_area);

CREATE INDEX IF NOT EXISTS idx_wedding_vendors_status
    ON wedding_vendors (status);

CREATE TABLE IF NOT EXISTS wedding_vendor_photos (
    photo_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 3),
    photo_url TEXT NOT NULL,
    alt_text TEXT,
    source_label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (vendor_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_wedding_vendor_photos_vendor
    ON wedding_vendor_photos (vendor_id, slot);

CREATE TABLE IF NOT EXISTS wedding_vendor_user_contacts (
    contact_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    contact_method TEXT NOT NULL
        CHECK (contact_method IN ('master_agent', 'agent_email_draft', 'personal_email', 'phone', 'website_form', 'other')),
    last_contact_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    response_received_at TIMESTAMPTZ,
    follow_up_due_at TIMESTAMPTZ,
    thread_id TEXT,
    receipt_ref TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_wedding_vendor_user_contacts_user_due
    ON wedding_vendor_user_contacts (user_id, follow_up_due_at)
    WHERE response_received_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wedding_vendor_user_contacts_vendor
    ON wedding_vendor_user_contacts (vendor_id, last_contact_at DESC);
