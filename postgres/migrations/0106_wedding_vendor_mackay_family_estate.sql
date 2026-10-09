-- Promote the vetted operator listing into the migration stream so every
-- environment can satisfy a direct "Mackay" directory search.
INSERT INTO wedding_vendors (
  vendor_id, vendor_slug, vendor_name, category, service_area, address,
  website_url, contact_phone, source_url, source_label, source_checked_at,
  status, notes, evidence, caveat_labels
) VALUES (
  'venue-mackay-family-estate', 'mackay-family-estate', 'Mackay Family Estate',
  'Venue', 'Ourimbah, Central Coast NSW', '10 Frederick St, Ourimbah NSW 2258',
  'http://mackayfamilyestate.com/', '0412 621 765', 'http://mackayfamilyestate.com/',
  'Operator-supplied listing summary 2026-10-07', DATE '2026-10-07', 'active',
  'Garden estate with a stone outdoor fireplace terrace, pond and carousel pavilion.',
  '{"source":"operator_listing","received":"2026-10-07"}'::jsonb,
  ARRAY['listing-summary', 'verify-before-booking', 'details-incomplete']::text[]
)
ON CONFLICT (vendor_id) DO UPDATE SET
  vendor_name = EXCLUDED.vendor_name,
  vendor_slug = EXCLUDED.vendor_slug,
  category = EXCLUDED.category,
  service_area = EXCLUDED.service_area,
  address = EXCLUDED.address,
  website_url = EXCLUDED.website_url,
  contact_phone = EXCLUDED.contact_phone,
  source_url = EXCLUDED.source_url,
  source_label = EXCLUDED.source_label,
  source_checked_at = EXCLUDED.source_checked_at,
  status = 'active',
  notes = EXCLUDED.notes,
  evidence = EXCLUDED.evidence,
  caveat_labels = EXCLUDED.caveat_labels,
  updated_at = NOW();
