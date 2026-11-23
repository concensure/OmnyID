-- Operator data load (not a migration): summarised listing details for six venues plus the
-- PLYNLIMMON website fix. Idempotent. Requires migration 0100 and the 2026-10-06 load.
-- Listing-sourced facts use authority 'directory' and never overwrite vendor_reply/operator rows.
BEGIN;

UPDATE wedding_vendors
SET website_url = 'https://plynlimmon-the-cottage-at.newsouthwaleshotels.net/en/', updated_at = NOW()
WHERE vendor_id = 'venue-plynlimmon-1860-heritage-cottage';

UPDATE wedding_vendors
SET address = COALESCE(address, '798 Yarramalong Rd, Wyong Creek NSW'), updated_at = NOW()
WHERE vendor_id = 'venue-yarramalong-valley-farmstay';

INSERT INTO wedding_vendors (vendor_id, vendor_slug, vendor_name, category, service_area, address,
    website_url, contact_phone, contact_email, source_url, source_label, source_checked_at,
    status, notes, evidence, caveat_labels)
VALUES
('venue-the-tea-room-qvb', 'the-tea-room-qvb', 'The Tea Room QVB', 'Venue',
 'Sydney CBD, NSW', 'Level 3, North End, Queen Victoria Building, 455 George St, Sydney NSW',
 NULL, NULL, NULL, NULL, 'Operator-supplied listing summary 2026-10-07', '2026-10-07', 'active',
 'Heritage ballroom in the Queen Victoria Building. Price per head $130-$160 (in-house or third-party catering); 6 hours included.',
 '{"source":"operator_listing","received":"2026-10-07","price_per_head_aud_range":[130,160],"website":"Not provided"}',
 ARRAY['listing-summary','verify-before-booking']),
('venue-zest-boathouse-the-spit', 'zest-boathouse-the-spit', 'Zest Waterfront Venues - Boathouse at The Spit',
 'Venue', 'Mosman, Sydney NSW', '237 Spit Road, Mosman NSW', NULL, NULL, NULL, NULL,
 'Operator-supplied listing summary 2026-10-07', '2026-10-07', 'active',
 'Harbourside boathouse on Middle Harbour. Price per head $170-$220; 5 hours included; in-house catering only.',
 '{"source":"operator_listing","received":"2026-10-07","price_per_head_aud_range":[170,220],"capacity_note":"Listing box says 30-300 reception guests; marketing copy says up to 450 guests","website":"Not provided"}',
 ARRAY['listing-summary','verify-before-booking']),
('venue-waterview-bicentennial-park', 'waterview-bicentennial-park', 'Waterview in Bicentennial Park',
 'Venue', 'Sydney Olympic Park, Sydney NSW', 'Bicentennial Dr, Sydney Olympic Park NSW 2127',
 'https://www.waterviewvenue.com.au/', '02 9764 9900', NULL, 'https://www.waterviewvenue.com.au/',
 'Operator-supplied listing summary 2026-10-07', '2026-10-07', 'active',
 'Parkland and lake venue with three event spaces or exclusive whole-venue hire. 5 hours included; in-house or third-party catering.',
 '{"source":"operator_listing","received":"2026-10-07","capacity_note":"Copy says up to 816 seated / 1,500 cocktail; listing box says 110-700 reception guests and 110-200 ceremony guests"}',
 ARRAY['listing-summary','verify-before-booking']),
('venue-crowne-plaza-hawkesbury-valley', 'crowne-plaza-hawkesbury-valley', 'Crowne Plaza Hawkesbury Valley',
 'Venue', 'Windsor, Hawkesbury NSW', '61 Hawkesbury Valley Way, Windsor NSW', NULL, NULL, NULL, NULL,
 'Operator-supplied listing summary 2026-10-07', '2026-10-07', 'active',
 'Hotel venue with three ceremony settings and five reception rooms. Hawkesbury Luxe all-inclusive package $205 pp (5 hours) or $234 pp (6 hours) for 2026/2027.',
 '{"source":"operator_listing","received":"2026-10-07","package":"Hawkesbury Luxe all-inclusive","website":"Not provided"}',
 ARRAY['listing-summary','verify-before-booking']),
('venue-mackay-family-estate', 'mackay-family-estate', 'Mackay Family Estate', 'Venue',
 'Ourimbah, Central Coast NSW', '10 Frederick St, Ourimbah NSW 2258', 'http://mackayfamilyestate.com/',
 '0412 621 765', NULL, 'http://mackayfamilyestate.com/', 'Operator-supplied listing summary 2026-10-07',
 '2026-10-07', 'active',
 'Garden estate with a stone outdoor fireplace terrace, pond and carousel pavilion. Only contact details and photos supplied so far.',
 '{"source":"operator_listing","received":"2026-10-07"}',
 ARRAY['listing-summary','verify-before-booking','details-incomplete'])
ON CONFLICT (vendor_id) DO NOTHING;

INSERT INTO wedding_vendor_attributes (vendor_id, attribute_key, value, status, confidence, authority,
    source_label, retrieved_at, notes)
SELECT t.v, t.k, t.val::jsonb, t.st, t.conf, 'directory', 'Operator-supplied listing summary 2026-10-07',
    TIMESTAMPTZ '2026-10-07 00:00:00+00', t.n
FROM (VALUES
 -- The Tea Room QVB
 ('venue-the-tea-room-qvb','location_setting_class','"premium_city"','known',0.8::real,'Heritage building in the Sydney CBD'),
 ('venue-the-tea-room-qvb','style_tags','["heritage","ballroom","grand","glamorous","european-inspired","chandeliers","ornate","romantic","fairy-tale"]','known',0.8,'Atmosphere words from the listing'),
 ('venue-the-tea-room-qvb','editorial_summary','"Palatial heritage-listed ballroom in central Sydney with chandeliers, ornate detailing and historic charm. Reviewers describe an effortless, elegant look needing little styling, calm and responsive planning, attentive floor staff, and generous, well-presented food that handles many dietary needs."','known',0.7,'Own-words summary of listing and review themes'),
 ('venue-the-tea-room-qvb','capacity_seated_min','50','known',0.8,NULL),
 ('venue-the-tea-room-qvb','capacity_seated_max','200','known',0.8,'Ceremony also 50-200'),
 ('venue-the-tea-room-qvb','capacity_standing_max','300','known',0.8,'Cocktail style'),
 ('venue-the-tea-room-qvb','price_structure','"per_head"','known',0.8,NULL),
 ('venue-the-tea-room-qvb','price_per_head_aud','130','known',0.8,'Low end of $130-$160 range'),
 ('venue-the-tea-room-qvb','hours_included','6','known',0.8,'Event time included'),
 ('venue-the-tea-room-qvb','curfew_time','"00:00"','known',0.8,'Music ends at midnight'),
 ('venue-the-tea-room-qvb','ceremony_on_site','true','known',0.8,'Indoor ceremony'),
 ('venue-the-tea-room-qvb','reception_on_site','true','known',0.8,NULL),
 ('venue-the-tea-room-qvb','indoor_space','true','known',0.8,NULL),
 ('venue-the-tea-room-qvb','in_house_catering','true','known',0.8,'Bespoke menus by head chef'),
 ('venue-the-tea-room-qvb','external_catering_allowed','true','known',0.7,'Listing says in-house or third-party catering'),
 ('venue-the-tea-room-qvb','parking','true','known',0.6,'Ample car parking'),
 ('venue-the-tea-room-qvb','cultural_religious_capabilities','["halal","vegetarian","dairy-free","allergy-friendly"]','known',0.6,'Dietary needs reviewers say were handled'),
 ('venue-the-tea-room-qvb','inclusions','["dedicated event professional","professional stylists","dancefloor","microphone and PA system","bespoke menu design"]','known',0.7,NULL),
 -- Zest Boathouse at The Spit
 ('venue-zest-boathouse-the-spit','location_setting_class','"iconic_waterfront"','known',0.8,'Middle Harbour waterfront'),
 ('venue-zest-boathouse-the-spit','style_tags','["waterfront","harbour views","rustic-glam","coastal","relaxed luxury","warm timber","gold-leaf ceiling","unique per wedding"]','known',0.8,NULL),
 ('venue-zest-boathouse-the-spit','editorial_summary','"Relaxed-luxury boathouse on Middle Harbour with harbour views, warm timber and a gold-leaf ceiling. Ceremonies can be held over the water on the lower deck or on the outdoor harbour-view space. Known for bold, creative, award-winning catering and complimentary in-house styling; guests praise the views and the food."','known',0.7,'Own-words summary'),
 ('venue-zest-boathouse-the-spit','capacity_seated_min','30','known',0.8,NULL),
 ('venue-zest-boathouse-the-spit','capacity_seated_max','300','known',0.7,'Listing box: 30-300 reception; ceremony 30-300'),
 ('venue-zest-boathouse-the-spit','capacity_standing_max','450','estimated',0.5,'Marketing copy says up to 450 guests without stating style; treat as unconfirmed'),
 ('venue-zest-boathouse-the-spit','price_structure','"per_head"','known',0.8,NULL),
 ('venue-zest-boathouse-the-spit','price_per_head_aud','170','known',0.8,'Low end of $170-$220 range'),
 ('venue-zest-boathouse-the-spit','hours_included','5','known',0.8,NULL),
 ('venue-zest-boathouse-the-spit','curfew_time','"04:00"','known',0.7,'Listing says music must end by 4:00 AM; verify local licence limits'),
 ('venue-zest-boathouse-the-spit','ceremony_on_site','true','known',0.8,'Multiple ceremony options'),
 ('venue-zest-boathouse-the-spit','reception_on_site','true','known',0.8,NULL),
 ('venue-zest-boathouse-the-spit','indoor_space','true','known',0.8,NULL),
 ('venue-zest-boathouse-the-spit','outdoor_space','true','known',0.8,NULL),
 ('venue-zest-boathouse-the-spit','in_house_catering','true','known',0.8,NULL),
 ('venue-zest-boathouse-the-spit','external_catering_allowed','false','estimated',0.5,'Listing shows in-house catering only'),
 ('venue-zest-boathouse-the-spit','cultural_religious_capabilities','["LGBTQIA+ friendly"]','known',0.8,NULL),
 ('venue-zest-boathouse-the-spit','inclusions','["complimentary in-house styling","licensed for live bands","multiple ceremony options"]','known',0.8,NULL),
 -- Waterview in Bicentennial Park
 ('venue-waterview-bicentennial-park','location_setting_class','"parkland_garden"','known',0.8,'40 hectares of parkland, lakes and ponds'),
 ('venue-waterview-bicentennial-park','style_tags','["lakeside","parkland","blank canvas","natural light","floor-to-ceiling windows","wrap-around terrace","indoor-outdoor","versatile"]','known',0.8,NULL),
 ('venue-waterview-bicentennial-park','editorial_summary','"Light-filled venue beside lakes and gardens at Sydney Olympic Park, close to Rhodes, with a covered wrap-around terrace and three event spaces or exclusive whole-venue hire. Couples praise the wedding coordinator, calm support on the day, standout food that handles dietary needs, and good value; a few mention minor parking, bathroom or coordination hiccups."','known',0.7,'Own-words summary'),
 ('venue-waterview-bicentennial-park','capacity_seated_min','110','known',0.7,'Listing box minimum'),
 ('venue-waterview-bicentennial-park','capacity_seated_max','816','known',0.6,'Copy says 816 seated; listing box says 700 reception'),
 ('venue-waterview-bicentennial-park','capacity_standing_max','1500','known',0.6,'Cocktail style'),
 ('venue-waterview-bicentennial-park','hours_included','5','known',0.8,NULL),
 ('venue-waterview-bicentennial-park','curfew_time','"00:00"','known',0.8,NULL),
 ('venue-waterview-bicentennial-park','ceremony_on_site','true','known',0.8,'Ceremony up to 200 guests'),
 ('venue-waterview-bicentennial-park','reception_on_site','true','known',0.8,NULL),
 ('venue-waterview-bicentennial-park','indoor_space','true','known',0.8,NULL),
 ('venue-waterview-bicentennial-park','outdoor_space','true','known',0.8,NULL),
 ('venue-waterview-bicentennial-park','in_house_catering','true','known',0.8,NULL),
 ('venue-waterview-bicentennial-park','external_catering_allowed','true','known',0.7,'Listing says in-house or third-party catering'),
 ('venue-waterview-bicentennial-park','photo_locations_on_site','true','known',0.8,'Gardens, pathways and water views'),
 ('venue-waterview-bicentennial-park','exclusive_use','true','known',0.7,'Whole venue can be booked'),
 -- Crowne Plaza Hawkesbury Valley
 ('venue-crowne-plaza-hawkesbury-valley','location_setting_class','"parkland_garden"','estimated',0.5,'Lakeside grounds, rose gardens and woodland deck'),
 ('venue-crowne-plaza-hawkesbury-valley','style_tags','["lakeside","hotel","woodland deck","rose garden chapel","fairy lights","Blue Mountains views","ornate","chandeliers","old-world luxury","fairy-tale"]','known',0.8,NULL),
 ('venue-crowne-plaza-hawkesbury-valley','editorial_summary','"Hotel wedding venue on the Hawkesbury with three ceremony settings (lakeside lawn with Blue Mountains views, a tree-canopied deck with fairy lights, and an air-conditioned rose-garden chapel) and five reception rooms from a glass conservatory to an ornate ballroom. Offers an all-inclusive package, a dedicated wedding specialist, a complimentary couple suite and discounted guest rooms."','known',0.7,'Own-words summary'),
 ('venue-crowne-plaza-hawkesbury-valley','capacity_seated_min','50','known',0.8,'Smallest room minimum'),
 ('venue-crowne-plaza-hawkesbury-valley','capacity_seated_max','140','known',0.8,'Oval tables in Windsor and Richmond rooms'),
 ('venue-crowne-plaza-hawkesbury-valley','capacity_standing_max','250','known',0.8,'Cocktail style'),
 ('venue-crowne-plaza-hawkesbury-valley','price_structure','"mixed"','known',0.8,'Per-head package plus room hire and ceremony fee'),
 ('venue-crowne-plaza-hawkesbury-valley','price_per_head_aud','205','known',0.8,'Hawkesbury Luxe 5-hour 2026/27; 6-hour is $234'),
 ('venue-crowne-plaza-hawkesbury-valley','hours_included','5','known',0.8,NULL),
 ('venue-crowne-plaza-hawkesbury-valley','ceremony_on_site','true','known',0.9,'Ceremony only $3,500, or $2,500 added to a reception package'),
 ('venue-crowne-plaza-hawkesbury-valley','reception_on_site','true','known',0.9,NULL),
 ('venue-crowne-plaza-hawkesbury-valley','indoor_space','true','known',0.9,NULL),
 ('venue-crowne-plaza-hawkesbury-valley','outdoor_space','true','known',0.9,NULL),
 ('venue-crowne-plaza-hawkesbury-valley','in_house_catering','true','known',0.9,NULL),
 ('venue-crowne-plaza-hawkesbury-valley','wet_weather_option','true','known',0.8,'Alternate weather backup for ceremonies'),
 ('venue-crowne-plaza-hawkesbury-valley','accommodation_on_site','true','known',0.9,'Hotel; couple suite included and discounted guest rooms'),
 ('venue-crowne-plaza-hawkesbury-valley','wheelchair_accessible','true','known',0.6,'Disabled access stated for the Windsor Room; confirm other spaces'),
 ('venue-crowne-plaza-hawkesbury-valley','parking','true','known',0.8,'Complimentary car parking in the Luxe package'),
 ('venue-crowne-plaza-hawkesbury-valley','photo_locations_on_site','true','known',0.8,'Hotel grounds can be used for photography'),
 ('venue-crowne-plaza-hawkesbury-valley','inclusions','["5-hour room hire","dance floor","canapes and pre-dinner drinks","3-course alternate menu","premium wine and beer package","wedding trial dinner","couple suite with breakfast","dedicated wedding specialist","styling package","complimentary parking"]','known',0.8,'Hawkesbury Luxe package'),
 -- Yarramalong Valley Farmstay (listing details; vendor_reply rows are preserved)
 ('venue-yarramalong-valley-farmstay','style_tags','["rustic","farm","relaxed","family-run","fairy-lit barn","lake views","DIY-friendly","romantic","hinterland","intimate or large"]','known',0.8,NULL),
 ('venue-yarramalong-valley-farmstay','editorial_summary','"Family-run farm venue in the Central Coast hinterland, hosting relaxed, personalised weddings for over 15 years. A fairy-lit barn and a secluded lake-view ceremony spot, with wet-weather options, midweek weddings and micro/elopement packages. DIY-friendly with a large prop collection included; guests can stay in a timber farmhouse that sleeps 15 and decorate the day before."','known',0.8,'Own-words summary'),
 ('venue-yarramalong-valley-farmstay','capacity_seated_min','5','known',0.8,NULL),
 ('venue-yarramalong-valley-farmstay','capacity_seated_max','100','known',0.8,NULL),
 ('venue-yarramalong-valley-farmstay','price_structure','"package"','known',0.8,'Weekend, midweek, micro and elopement packages'),
 ('venue-yarramalong-valley-farmstay','price_estimate_total_aud','15500','known',0.8,'Weekend Harvest Haven package, about 100 guests'),
 ('venue-yarramalong-valley-farmstay','curfew_time','"22:30"','known',0.7,'Venue closes 10:30 PM; music ends 10:00 PM'),
 ('venue-yarramalong-valley-farmstay','ceremony_on_site','true','known',0.9,NULL),
 ('venue-yarramalong-valley-farmstay','reception_on_site','true','known',0.9,NULL),
 ('venue-yarramalong-valley-farmstay','indoor_space','true','known',0.8,'Rustic barn'),
 ('venue-yarramalong-valley-farmstay','outdoor_space','true','known',0.9,NULL),
 ('venue-yarramalong-valley-farmstay','in_house_catering','false','known',0.8,'Bring your own caterer'),
 ('venue-yarramalong-valley-farmstay','external_catering_allowed','true','known',0.9,NULL),
 ('venue-yarramalong-valley-farmstay','byo_alcohol_allowed','true','known',0.8,'Confirmed in vendor email'),
 ('venue-yarramalong-valley-farmstay','accommodation_on_site','true','known',0.9,'Farmstay house sleeps 15'),
 ('venue-yarramalong-valley-farmstay','exclusive_use','true','known',0.9,'Whole property reserved for your booking'),
 ('venue-yarramalong-valley-farmstay','wet_weather_option','true','known',0.9,'Wet-weather ceremony location'),
 ('venue-yarramalong-valley-farmstay','parking','true','known',0.8,NULL),
 ('venue-yarramalong-valley-farmstay','photo_locations_on_site','true','known',0.9,'50 acres plus farm animals')
) AS t(v, k, val, st, conf, n)
ON CONFLICT (vendor_id, attribute_key) DO UPDATE SET
    value = EXCLUDED.value, status = EXCLUDED.status, confidence = EXCLUDED.confidence,
    authority = EXCLUDED.authority, source_label = EXCLUDED.source_label,
    retrieved_at = EXCLUDED.retrieved_at, notes = EXCLUDED.notes
WHERE wedding_vendor_attributes.authority = 'directory';

-- The earlier cents-based attribute is not a catalog key; price_estimate_total_aud replaces it.
DELETE FROM wedding_vendor_attributes
WHERE vendor_id = 'venue-yarramalong-valley-farmstay' AND attribute_key = 'price_from_cents';

UPDATE wedding_vendors SET evidence = evidence || '{"packages":[
 {"name":"Harvest Haven (weekend)","price_aud":15500,"guests":"about 100","note":"3 days / 2 nights, accommodation for 15"},
 {"name":"Magic Midweek","price_aud":8000,"gst":"plus GST","days":"Mon-Thu","hours":5,"max_guests":75,"note":"Venue hire only; includes one night in the farmhouse; extra night $1,100"},
 {"name":"Micro wedding - Forever Yours","price_aud":5000,"gst":"plus GST","days":"Mon-Thu","hours":4,"max_guests":25,"note":"Couple stays the wedding night; farmhouse 3 hours before ceremony $440"},
 {"name":"Elopement - Say I Do","price_aud":1550,"gst":"plus GST","days":"Mon-Thu","hours":2,"guests":"2-10","note":"Celebrant +$600; extra hour from $550; BYO drinks and nibbles"}]}'::jsonb,
 updated_at = NOW()
WHERE vendor_id = 'venue-yarramalong-valley-farmstay';

INSERT INTO wedding_vendor_rooms (room_id, vendor_id, room_name, sort_order, description,
    capacity_seated, capacity_standing, pricing_label, price_from_cents, minimum_spend_note,
    inclusions, source_label, source_checked_at)
VALUES
('room-tea-room-qvb-ballroom','venue-the-tea-room-qvb','Tea Room ballroom',1,
 'Heritage-listed ballroom with chandeliers, ornate ceilings and hand-printed wallpaper.',200,300,
 '$130-$160 per head; 6 hours included',13000,NULL,
 ARRAY['Dancefloor','Microphone and PA system','Professional stylists','Dedicated event professional'],
 'Operator-supplied listing summary 2026-10-07','2026-10-07'),
('room-zest-spit-boathouse','venue-zest-boathouse-the-spit','Boathouse reception',1,
 'Timber-and-gold boathouse with harbour views and in-house styling.',300,450,
 '$170-$220 per head; 5 hours included',17000,NULL,
 ARRAY['Complimentary in-house styling','Licensed for live bands'],
 'Operator-supplied listing summary 2026-10-07','2026-10-07'),
('room-zest-spit-lower-deck','venue-zest-boathouse-the-spit','Lower deck ceremony',2,
 'Ceremony floating over the water on the lower deck.',NULL,NULL,'Part of venue package',NULL,NULL,
 ARRAY[]::TEXT[],'Operator-supplied listing summary 2026-10-07','2026-10-07'),
('room-zest-spit-outdoor-ceremony','venue-zest-boathouse-the-spit','Outdoor ceremony space',3,
 'Open-air ceremony space with sweeping Middle Harbour views.',NULL,NULL,'Part of venue package',NULL,NULL,
 ARRAY[]::TEXT[],'Operator-supplied listing summary 2026-10-07','2026-10-07'),
('room-waterview-lake-room','venue-waterview-bicentennial-park','Lake Room',1,'Event space with lake and parkland views.',
 NULL,NULL,'Included in venue hire; pricing on request',NULL,NULL,ARRAY[]::TEXT[],
 'Operator-supplied listing summary 2026-10-07','2026-10-07'),
('room-waterview-park-room','venue-waterview-bicentennial-park','Park Room',2,'Event space with parkland views.',
 NULL,NULL,'Included in venue hire; pricing on request',NULL,NULL,ARRAY[]::TEXT[],
 'Operator-supplied listing summary 2026-10-07','2026-10-07'),
('room-waterview-bel-parco','venue-waterview-bicentennial-park','Bel Parco',3,'Event space for larger celebrations.',
 NULL,NULL,'Included in venue hire; pricing on request',NULL,NULL,ARRAY[]::TEXT[],
 'Operator-supplied listing summary 2026-10-07','2026-10-07'),
('room-waterview-whole-venue','venue-waterview-bicentennial-park','Exclusive whole venue',4,
 'All spaces plus the wrap-around terrace for a large celebration.',816,1500,'Pricing on request',NULL,NULL,
 ARRAY['Covered wrap-around terrace','Dedicated wedding specialists'],
 'Operator-supplied listing summary 2026-10-07','2026-10-07'),
('room-crowne-governor-phillip','venue-crowne-plaza-hawkesbury-valley','Governor Phillip Ballroom',1,
 'Fairy-tale, old-world ballroom with ornate ceilings, chandeliers, a private entrance and a pre-function area.',
 130,200,'Room hire $1,800 (5 hours); min 50 adults',180000,NULL,
 ARRAY['Private entrance','Pre-function area for exclusive use'],'Operator-supplied listing summary 2026-10-07','2026-10-07'),
('room-crowne-windsor','venue-crowne-plaza-hawkesbury-valley','Windsor Room',2,
 'Ornate ceilings, natural light, courtyard over gardens, undercover veranda and disabled access.',
 140,250,'Room hire $1,800 (5 hours); min 80 adults',180000,NULL,
 ARRAY['Outdoor courtyard for pre-dinner drinks','Disabled access'],'Operator-supplied listing summary 2026-10-07','2026-10-07'),
('room-crowne-richmond','venue-crowne-plaza-hawkesbury-valley','Richmond Room',3,
 'Ornate ceilings opening onto a courtyard with a fairy-light canopy.',140,250,
 'Room hire $1,800 (5 hours); min 80 adults',180000,NULL,
 ARRAY['Courtyard with fairy-light canopy'],'Operator-supplied listing summary 2026-10-07','2026-10-07'),
('room-crowne-gazebo','venue-crowne-plaza-hawkesbury-valley','Gazebo Glasshouse',4,
 'Fully glass-enclosed, air-conditioned conservatory with an outdoor courtyard and plenty of natural light.',
 120,150,'Room hire $2,000 (5 hours); min 80 adults',200000,NULL,
 ARRAY['Air-conditioning','Outdoor courtyard'],'Operator-supplied listing summary 2026-10-07','2026-10-07'),
('room-crowne-lachlan-macquarie','venue-crowne-plaza-hawkesbury-valley','Lachlan Macquarie Room',5,
 'Smaller room for intimate receptions.',70,NULL,'Room hire $1,000 (5 hours); min 50 adults',100000,NULL,
 ARRAY[]::TEXT[],'Operator-supplied listing summary 2026-10-07','2026-10-07'),
('room-crowne-lakeside-reception','venue-crowne-plaza-hawkesbury-valley','Lakeside reception',6,
 'Outdoor natural setting for dancing under the stars; a marquee can be hired. Buffet or cocktail only.',
 130,250,'Pricing on request',NULL,NULL,ARRAY[]::TEXT[],'Operator-supplied listing summary 2026-10-07','2026-10-07'),
('room-crowne-lakeside-ceremony','venue-crowne-plaza-hawkesbury-valley','Lakeside ceremony',7,
 'Waters-edge lawn ceremony with views towards the Blue Mountains.',40,NULL,
 'Ceremony only $3,500; $2,500 when added to a reception package (2026/27)',250000,NULL,
 ARRAY['40 white garden chairs','Signing table','Optional red carpet','Hotel grounds for photography','Alternate weather backup','Dedicated wedding coordinator','Complimentary rehearsal'],
 'Operator-supplied listing summary 2026-10-07','2026-10-07'),
('room-crowne-woods-ceremony','venue-crowne-plaza-hawkesbury-valley','The Woods ceremony deck',8,
 'Wooden deck over the water edge under a tree canopy with a fairy-light ceiling for twilight ceremonies.',40,NULL,
 'Ceremony only $3,500; $2,500 when added to a reception package (2026/27)',250000,NULL,
 ARRAY['40 white garden chairs','Signing table','Festoon light canopy','Alternate weather backup','Dedicated wedding coordinator','Complimentary rehearsal'],
 'Operator-supplied listing summary 2026-10-07','2026-10-07'),
('room-crowne-chapel','venue-crowne-plaza-hawkesbury-valley','The Chapel',9,
 'Rose-garden chapel with high ceilings, exposed rafters and air-conditioning.',100,NULL,
 'Ceremony only $3,500; $2,500 when added to a reception package (2026/27)',250000,NULL,
 ARRAY['100 white chairs','Signing table','Optional red carpet','Fully air-conditioned and heated','Dedicated wedding coordinator','Complimentary rehearsal'],
 'Operator-supplied listing summary 2026-10-07','2026-10-07')
ON CONFLICT (vendor_id, room_name) DO UPDATE SET
    description = EXCLUDED.description, capacity_seated = EXCLUDED.capacity_seated,
    capacity_standing = EXCLUDED.capacity_standing, pricing_label = EXCLUDED.pricing_label,
    price_from_cents = EXCLUDED.price_from_cents, inclusions = EXCLUDED.inclusions,
    sort_order = EXCLUDED.sort_order, updated_at = NOW();

UPDATE wedding_vendor_rooms SET
    description = 'Fairy-lit rustic barn with chandeliers and lake-view lawns; also a secluded lake-view ceremony spot.',
    capacity_seated = 100, updated_at = NOW()
WHERE room_id = 'room-yarramalong-barn-reception';
UPDATE wedding_vendor_rooms SET
    description = 'Timber farmhouse by a noted Australian architect sleeping 15; lets you style the venue the day before.',
    pricing_label = 'Included in weekend and midweek packages; extra night $1,100; 3 hours before ceremony $440',
    capacity_seated = 15, updated_at = NOW()
WHERE room_id = 'room-yarramalong-accommodation';

INSERT INTO wedding_vendor_photos (photo_id, vendor_id, slot, photo_url, alt_text, source_label, source_url)
VALUES
('photo-mackay-family-estate-1','venue-mackay-family-estate',1,
 'https://omnyid.com/wedding/assets/venue-photos/mackay-family-estate-1.png',
 'Garden terrace with stone outdoor fireplace, cafe tables, festoon lights, a pond and a carousel pavilion',
 'Operator upload', 'http://mackayfamilyestate.com/'),
('photo-mackay-family-estate-2','venue-mackay-family-estate',2,
 'https://omnyid.com/wedding/assets/venue-photos/mackay-family-estate-2.png',
 'Single-storey brick homestead with a circular driveway and blooming roses',
 'Operator upload', 'http://mackayfamilyestate.com/')
ON CONFLICT (vendor_id, slot) DO NOTHING;

COMMIT;
