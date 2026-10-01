-- Migration: 0094_wedding_vendor_ranking_evidence
-- Purpose: per-attribute vendor evidence (value + status + confidence + authority)
--          and per-couple, per-date vendor availability state.
-- Rules: additive only.

CREATE TABLE IF NOT EXISTS wedding_vendor_attributes (
    vendor_id      TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    attribute_key  TEXT NOT NULL,
    value          JSONB,                        -- NULL when status is unknown / not_applicable
    status         TEXT NOT NULL DEFAULT 'unknown'
        CHECK (status IN ('known', 'estimated', 'unknown', 'not_applicable')),
    confidence     REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    authority      TEXT NOT NULL
        CHECK (authority IN ('operator', 'vendor_reply', 'primary_official',
                             'independent_aggregate', 'directory', 'editorial', 'inferred')),
    source_url     TEXT,
    source_label   TEXT,
    retrieved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until    TIMESTAMPTZ,
    notes          TEXT,
    updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (vendor_id, attribute_key)
);

CREATE TABLE IF NOT EXISTS wedding_vendor_availability (
    availability_id TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vendor_id       TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    wedding_plan_id TEXT NOT NULL,
    state           TEXT NOT NULL CHECK (state IN (
        'confirmed_available', 'likely_available', 'unknown', 'enquiry_sent',
        'awaiting_response', 'temporary_hold', 'confirmed_unavailable', 'booked')),
    date_from       DATE,
    date_to         DATE,
    source          TEXT NOT NULL,   -- 'user', 'operator', 'outreach', 'vendor_reply'
    source_ref      TEXT,            -- AFP message id / receipt id when derived from one
    confidence      REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until     TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Append-only: the latest row per (user, plan, vendor) is the current state.
CREATE INDEX IF NOT EXISTS idx_wedding_vendor_availability_latest
    ON wedding_vendor_availability (user_id, wedding_plan_id, vendor_id, checked_at DESC);

-- Seed backfill: only figures the 0089 seed recorded as explicit numbers from each
-- venue's official site (2026-09-20). Venues whose capacity text was "Not published",
-- ambiguous about seating style, or not reception-specific are deliberately skipped:
-- unknown is implicit, never guessed.
INSERT INTO wedding_vendor_attributes (
    vendor_id, attribute_key, value, status, confidence, authority,
    source_url, source_label, retrieved_at, notes
)
SELECT
    v.vendor_id,
    s.attribute_key,
    to_jsonb(s.numeric_value),
    'known',
    0.9,
    'primary_official',
    s.source_url,
    'Official venue website (seed 0089)',
    TIMESTAMPTZ '2026-09-20 00:00:00+00',
    s.notes
FROM (VALUES
    ('venue-the-grounds-of-alexandria', 'capacity_seated_max', 380,
     'https://thegrounds.com.au/events/weddings/',
     'Largest single space (Linseed House). Per space: Linseed House 200-380 seated; The Garden 110-180 seated; The Atrium 40-80 seated.'),
    ('venue-the-grounds-of-alexandria', 'capacity_standing_max', 600,
     'https://thegrounds.com.au/events/weddings/',
     'Largest single space (Linseed House). Per space: Linseed House 250-600 cocktail; The Garden 150-380 cocktail.'),
    ('venue-curzon-hall', 'capacity_standing_max', 800,
     'https://navarravenues.com.au/venues/curzon-hall/weddings-at-curzon-hall/',
     'Largest single space (Lady Mary''s Pavilion) up to 800 cocktail; The Cellars up to 200 cocktail. Theatre-style figures are not seated-reception capacity and were not recorded.'),
    ('venue-icebergs-dining-room-and-bar', 'capacity_seated_max', 120,
     'https://idrb.com/weddings/',
     'Full restaurant exclusive hire. Pacific Dining Room (private) up to 40; Bar up to 60 (100 with furniture removed).'),
    ('venue-icebergs-dining-room-and-bar', 'capacity_standing_max', 250,
     'https://idrb.com/weddings/',
     'Full restaurant exclusive hire.'),
    ('venue-centennial-homestead', 'capacity_seated_max', 670,
     'https://centennialhomestead.com.au/events/weddings/',
     'Site states up to 670 guests seated.'),
    ('venue-centennial-homestead', 'capacity_standing_max', 1000,
     'https://centennialhomestead.com.au/events/weddings/',
     'Site states up to 1000 guests cocktail style.'),
    ('venue-sergeants-mess', 'capacity_seated_max', 250,
     'https://sergeantsmess.com.au/wedding-venue/',
     'Site states 50 to 250 guests for a seated reception; smaller numbers accommodated in the bar area.'),
    ('venue-sergeants-mess', 'capacity_seated_min', 50,
     'https://sergeantsmess.com.au/wedding-venue/',
     'Site states 50 to 250 guests for a seated reception; smaller numbers accommodated in the bar area.'),
    ('venue-estate-vaucluse-house', 'capacity_seated_max', 220,
     'https://www.estatevauclusehouse.com.au/weddings/',
     'Site states up to 220 guests seated; maximum varies with guest numbers and celebration style.'),
    ('venue-estate-vaucluse-house', 'capacity_standing_max', 150,
     'https://www.estatevauclusehouse.com.au/weddings/',
     'Site states up to 150 guests cocktail; maximum varies with guest numbers and celebration style.'),
    ('venue-bells-at-killcare', 'capacity_seated_max', 120,
     'https://www.bellsatkillcare.com.au/central-coast-weddings/',
     'The Conservatory: approximately 120 guests seated.'),
    ('venue-bells-at-killcare', 'capacity_standing_max', 220,
     'https://www.bellsatkillcare.com.au/central-coast-weddings/',
     'The Conservatory: up to 220 cocktail-style.')
) AS s(vendor_id, attribute_key, numeric_value, source_url, notes)
JOIN wedding_vendors v ON v.vendor_id = s.vendor_id
ON CONFLICT DO NOTHING;

INSERT INTO wedding_vendor_attributes (
    vendor_id, attribute_key, value, status, confidence, authority,
    source_url, source_label, retrieved_at
)
SELECT
    vendor_id,
    'official_website',
    to_jsonb(website_url),
    'known',
    0.95,
    'primary_official',
    website_url,
    'Official venue website (seed 0089)',
    TIMESTAMPTZ '2026-09-20 00:00:00+00'
FROM wedding_vendors
WHERE vendor_id IN (
    'venue-the-grounds-of-alexandria', 'venue-doltone-house-jones-bay-wharf',
    'venue-curzon-hall', 'venue-gunners-barracks', 'venue-shangri-la-sydney',
    'venue-icebergs-dining-room-and-bar', 'venue-centennial-homestead',
    'venue-taronga-zoo-sydney', 'venue-sergeants-mess', 'venue-estate-vaucluse-house',
    'venue-wandin-valley-estate', 'venue-tower-lodge',
    'venue-centennial-vineyards-restaurant', 'venue-bendooley-estate',
    'venue-fairmont-resort-blue-mountains', 'venue-cupitts-estate',
    'venue-tizzana-winery', 'venue-fig-tree-restaurant-and-rooms',
    'venue-bells-at-killcare', 'venue-merewether-surfhouse'
)
  AND website_url IS NOT NULL
ON CONFLICT DO NOTHING;
