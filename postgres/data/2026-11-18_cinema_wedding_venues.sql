-- Operator data load (not a migration): two source-checked cinema wedding starting points.
-- Idempotent. Existing vendor data is never overwritten.
BEGIN;

INSERT INTO wedding_vendors (vendor_id, vendor_slug, vendor_name, category, service_area, address,
    website_url, contact_phone, contact_email, source_url, source_label, source_checked_at, status,
    notes, evidence, caveat_labels)
VALUES
('venue-james-theatre-dungog', 'james-theatre-dungog', 'James Theatre Dungog', 'Venue', 'Dungog, Hunter Region NSW', '6 Brown Street, Dungog NSW 2420', 'https://www.jamestheatre.com.au/hire', NULL, 'contact@jamestheatre.com.au', 'https://www.jamestheatre.com.au/hire', 'Cinema wedding venues refresh 2026-11-18', '2026-11-18', 'active', 'Capacity is not published. The official hire page describes a divisible auditorium, two cinema screens, tiered cinema seating, a dance floor, movable tables and chairs, a stage, a kiosk and a food preparation area. Wedding pricing is not published; confirm the current terms and availability directly.', '{"source":"cinema_wedding_venues_refresh","imported":"2026-11-18","special_category":["entertainment"],"special_subtype":["historic cinema","community theatre","function hall"],"sources":["https://www.jamestheatre.com.au/hire"],"flags":["outside_sydney","capacity_not_published","wedding_price_not_published","verify_before_booking"]}'::jsonb, ARRAY['cinema-wedding-starting-point', 'verify-before-booking']),
('venue-the-roxy-theatre-bingara', 'the-roxy-theatre-bingara', 'The Roxy Theatre Bingara', 'Venue', 'Bingara, Gwydir Shire, North West Slopes NSW', '74 Maitland Street, Bingara NSW 2404', 'https://visitgwydir.com.au/the-roxy-theatre/', '(02) 6724 0066', 'btourism@gwydir.nsw.gov.au', 'https://visitgwydir.com.au/the-roxy-theatre/', 'Cinema wedding venues refresh 2026-11-18', '2026-11-18', 'active', 'The official council tourism page describes this 1936 Art Deco theatre as a function centre for weddings and other events. Wedding capacity, pricing and current availability are not published; confirm them directly with the venue.', '{"source":"cinema_wedding_venues_refresh","imported":"2026-11-18","special_category":["entertainment"],"special_subtype":["historic cinema","art deco theatre","function centre"],"sources":["https://visitgwydir.com.au/the-roxy-theatre/"],"flags":["outside_sydney","capacity_not_published","price_not_published","verify_before_booking"]}'::jsonb, ARRAY['cinema-wedding-starting-point', 'verify-before-booking'])
ON CONFLICT DO NOTHING;

INSERT INTO wedding_vendor_attributes
    (vendor_id, attribute_key, value_json, value_state, confidence, provenance_kind, source_url,
     source_label, observed_at, expires_at, caveat)
VALUES
('venue-james-theatre-dungog', 'style_tags', '["cinema","unconventional","dungog","hunter region","regional nsw","heritage","spanish mission","community run","dance floor","garden"]'::jsonb, 'known', 0.8, 'primary_official', 'https://www.jamestheatre.com.au/hire', 'Cinema wedding venues refresh 2026-11-18', TIMESTAMPTZ '2026-11-18 00:00:00+00', NULL, NULL),
('venue-james-theatre-dungog', 'editorial_summary', '"A volunteer-run heritage picture house in Dungog with cinema seating, a stage, dance floor, food-preparation space and an outdoor barbecue garden. It is a practical starting point for couples considering a cinema celebration in regional NSW, subject to the venue confirming current wedding terms."'::jsonb, 'known', 0.8, 'primary_official', 'https://www.jamestheatre.com.au/hire', 'Cinema wedding venues refresh 2026-11-18', TIMESTAMPTZ '2026-11-18 00:00:00+00', NULL, NULL),
('venue-the-roxy-theatre-bingara', 'style_tags', '["cinema","unconventional","bingara","regional nsw","art deco","heritage listed","function centre"]'::jsonb, 'known', 0.8, 'primary_official', 'https://visitgwydir.com.au/the-roxy-theatre/', 'Cinema wedding venues refresh 2026-11-18', TIMESTAMPTZ '2026-11-18 00:00:00+00', NULL, NULL),
('venue-the-roxy-theatre-bingara', 'editorial_summary', '"A restored 1936 Art Deco picture palace in Bingara that the council describes as a function centre for weddings and other events. It offers a distinctive cinema setting, while capacity, packages and current wedding availability still need a direct enquiry."'::jsonb, 'known', 0.8, 'primary_official', 'https://visitgwydir.com.au/the-roxy-theatre/', 'Cinema wedding venues refresh 2026-11-18', TIMESTAMPTZ '2026-11-18 00:00:00+00', NULL, NULL)
ON CONFLICT DO NOTHING;

COMMIT;
