-- Two Sydney music suppliers supplied for inclusion in the claimable Wedding
-- vendor directory. The official business pages are the source of location
-- and service descriptions; availability, pricing and suitability stay
-- unknown until the vendor confirms them.
INSERT INTO wedding_vendors (
    vendor_id, vendor_slug, vendor_name, category, service_area, address,
    website_url, contact_phone, contact_email, source_url, source_label,
    source_checked_at, status, notes, evidence, caveat_labels
) VALUES
(
    'music-linda-dagher-sydney', 'linda-dagher-music', 'Linda Dagher Music',
    'band', 'Sydney and Greater NSW', NULL,
    'https://www.lindadaghermusic.com.au/', NULL, 'Lindadaghermusic@hotmail.com',
    'https://www.lindadaghermusic.com.au/', 'Linda Dagher Music official website',
    DATE '2026-11-05', 'active',
    'Live music, acoustic duo and trio, DJ, live singer and MC services for weddings and events.',
    '{"source":"official_website","instagram_url":"https://www.instagram.com/lindadaghermusic","services":["acoustic duo","acoustic trio","DJ","live singer","MC"]}'::jsonb,
    ARRAY['verify-availability-pricing-and-package-details']::text[]
),
(
    'music-jessica-zammit-sydney', 'jessica-zammit-music', 'Jessica Zammit',
    'band', 'Sydney NSW', NULL,
    'https://www.instagram.com/jzmusic__/', '0491736383', 'jzmusic05@gmail.com',
    'https://www.instagram.com/jzmusic__/', 'Jessica Zammit official Instagram profile',
    DATE '2026-11-05', 'active',
    'Sydney-based vocal and piano performer for weddings and events.',
    '{"source":"official_social_profile","instagram_url":"https://www.instagram.com/jzmusic__/","services":["vocal performer","piano performer"]}'::jsonb,
    ARRAY['verify-availability-pricing-and-package-details']::text[]
)
ON CONFLICT (vendor_slug) DO UPDATE SET
    vendor_name = EXCLUDED.vendor_name,
    category = EXCLUDED.category,
    service_area = EXCLUDED.service_area,
    website_url = EXCLUDED.website_url,
    contact_phone = EXCLUDED.contact_phone,
    contact_email = EXCLUDED.contact_email,
    source_url = EXCLUDED.source_url,
    source_label = EXCLUDED.source_label,
    source_checked_at = EXCLUDED.source_checked_at,
    status = 'active',
    notes = EXCLUDED.notes,
    evidence = EXCLUDED.evidence,
    caveat_labels = EXCLUDED.caveat_labels,
    updated_at = NOW();

INSERT INTO wedding_vendor_attributes (
    vendor_id, attribute_key, value, status, confidence, authority,
    source_url, source_label, retrieved_at, notes
)
SELECT
    vendor.vendor_id, supplied.attribute_key, supplied.value, 'known', supplied.confidence, 'primary_official',
    supplied.source_url, supplied.source_label, TIMESTAMPTZ '2026-11-05 00:00:00+11', supplied.notes
FROM (
    VALUES
        ('linda-dagher-music', 'official_website', '"https://www.lindadaghermusic.com.au/"'::jsonb, 1.0::real,
         'https://www.lindadaghermusic.com.au/', 'Linda Dagher Music official website', 'Official website identifies the business and Sydney/Greater NSW service area.'),
        ('linda-dagher-music', 'style_tags', '["live music","acoustic","vocal","DJ","MC"]'::jsonb, 0.95::real,
         'https://www.lindadaghermusic.com.au/', 'Linda Dagher Music official website', 'Service labels published by the business; not a suitability or availability claim.'),
        ('jessica-zammit-music', 'style_tags', '["live music","vocal","piano"]'::jsonb, 0.95::real,
         'https://www.instagram.com/jzmusic__/', 'Jessica Zammit official Instagram profile', 'Official profile describes weddings and events, vocal and piano performance, and Sydney location.')
) AS supplied(vendor_slug, attribute_key, value, confidence, source_url, source_label, notes)
JOIN wedding_vendors vendor ON vendor.vendor_slug = supplied.vendor_slug
ON CONFLICT (vendor_id, attribute_key) DO UPDATE SET
    value = EXCLUDED.value,
    status = EXCLUDED.status,
    confidence = EXCLUDED.confidence,
    authority = EXCLUDED.authority,
    source_url = EXCLUDED.source_url,
    source_label = EXCLUDED.source_label,
    retrieved_at = EXCLUDED.retrieved_at,
    notes = EXCLUDED.notes;
