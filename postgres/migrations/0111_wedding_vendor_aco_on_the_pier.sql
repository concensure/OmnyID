-- Official venue contact supplied for a wedding enquiry. Keep the subject in
-- the UI mailto hand-off so the database remains a normal contact directory.
INSERT INTO wedding_vendors (
  vendor_id, vendor_slug, vendor_name, category, service_area, address,
  website_url, contact_email, source_url, source_label, source_checked_at,
  status, notes, evidence, caveat_labels
) VALUES (
  'venue-aco-on-the-pier', 'aco-on-the-pier', 'ACO On The Pier', 'venue',
  'Walsh Bay, Sydney NSW', 'Suite 3, 13A Hickson Road, Dawes Point NSW 2000',
  'https://www.aco.com.au/', 'Bianca.Astwood@aco.com.au', 'https://www.aco.com.au/',
  'Australian Chamber Orchestra official venue page', DATE '2026-10-15', 'active',
  'Pier 2/3 venue hire contact.',
  '{"source":"official_website","venue":"ACO On The Pier","checked":"2026-10-15"}'::jsonb,
  ARRAY['verify-availability-and-package-details']::text[]
)
ON CONFLICT (vendor_id) DO UPDATE SET
  vendor_name = EXCLUDED.vendor_name,
  vendor_slug = EXCLUDED.vendor_slug,
  category = EXCLUDED.category,
  service_area = EXCLUDED.service_area,
  address = EXCLUDED.address,
  website_url = EXCLUDED.website_url,
  contact_email = EXCLUDED.contact_email,
  source_url = EXCLUDED.source_url,
  source_label = EXCLUDED.source_label,
  source_checked_at = EXCLUDED.source_checked_at,
  status = 'active',
  notes = EXCLUDED.notes,
  evidence = EXCLUDED.evidence,
  caveat_labels = EXCLUDED.caveat_labels,
  updated_at = NOW();
