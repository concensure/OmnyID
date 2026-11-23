-- Operator data load (not a migration): vendor replies received 2026-10-06 plus removal of
-- directory/listicle pages that had been cached as vendors. Idempotent; requires migration 0100.
BEGIN;

INSERT INTO wedding_vendors (vendor_id, vendor_slug, vendor_name, category, service_area, address,
    website_url, contact_phone, contact_email, source_url, source_label, source_checked_at,
    status, notes, evidence, caveat_labels)
VALUES
('venue-yarramalong-valley-farmstay', 'yarramalong-valley-farmstay', 'Yarramalong Valley Farmstay',
 'Venue', 'Yarramalong Valley, Central Coast NSW', NULL,
 'https://yarramalongvalleyfarmstay.com.au', '0417 687 475',
 'info@yarramalongvalleyfarmstay.com.au', 'https://yarramalongvalleyfarmstay.com.au',
 'Vendor email reply 2026-10-06', '2026-10-06', 'active',
 'Contact: Briony (owner, lives on site, acts as day-of coordinator). BYO alcohol, own caterers and vendors allowed. Viewings most days and evenings.',
 '{"source":"vendor_reply","received":"2026-10-06","guests_quoted_for":100,"facebook":"https://www.facebook.com/yarramalongvalleyfarmstay","instagram":"https://www.instagram.com/yarramalongvalleyfarmstay","micro_wedding":"Midweek micro weddings from $5,000","address":"Not stated in reply"}',
 ARRAY['vendor-reply','verify-before-booking']),
('venue-somersby-gardens-estate', 'somersby-gardens-estate', 'Somersby Gardens Estate',
 'Venue', 'Somersby, Central Coast NSW', NULL, 'https://www.somersbygardens.com.au',
 '0456 787 123', 'information@somersbygardens.com.au', 'https://www.somersbygardens.com.au',
 'Vendor email reply 2026-10-06', '2026-10-06', 'active',
 'Contact: Leanne Jones (Manager). Private estate with accommodation; works with accredited suppliers. Viewings by booking, most Tue/Thu/Fri/Sat/Sun.',
 '{"source":"vendor_reply","received":"2026-10-06","guide":"https://www.canva.com/design/DAGrP7i9yoU/1bBmeVSy5vPQ6U_gEpgVHA/view","payment_plan":"Package total split into 4 payments; first payment is the deposit that secures the date","pricing":"Not in email; see Canva wedding guide"}',
 ARRAY['vendor-reply','verify-before-booking','quote-required']),
('venue-the-grange-wollongong', 'the-grange-wollongong', 'The Grange', 'Venue',
 'Wollongong, Illawarra NSW', 'Princes Highway, Wollongong NSW', 'https://thegrangegolfclub.com.au/weddings/',
 '02 4261 1333', 'events@thegrangegolfclub.com.au', 'https://thegrangegolfclub.com.au/weddings/',
 'Vendor email reply 2026-10-06', '2026-10-06', 'active',
 'Contact: Amanda Floro (Wedding and Event Planner). Reply did not answer deposit policy, minimum spend or Nov/Dec 2027 availability; pricing is in the Wedding Packages 2027-2028 PDF.',
 '{"source":"vendor_reply","received":"2026-10-06","via":"Easy Weddings enquiry","packages_pdf":"https://thegrangegolfclub-my.sharepoint.com/:b:/g/personal/events_thegrangegolfclub_com_au/IQD1jtlw0F2XSIU1YrsobeenAWRaliSL8xfB4qDb95EkUO8","gallery":"https://thegrangegolfclub.com.au/weddings/gallery-weddings/","packages":"All-inclusive reception packages (catering, beverages, florals); tailorable"}',
 ARRAY['vendor-reply','verify-before-booking','quote-required'])
ON CONFLICT (vendor_id) DO NOTHING;

INSERT INTO wedding_vendor_attributes (vendor_id, attribute_key, value, status, confidence,
    authority, source_label, retrieved_at, notes)
VALUES
('venue-yarramalong-valley-farmstay','price_from_cents','1550000','known',0.9,'vendor_reply','Vendor email reply 2026-10-06','2026-10-06T00:00:00Z','Harvest Haven Package, ~100 guests, 3 days / 2 nights exclusive use incl. accommodation for up to 15. Midweek micro weddings from $5,000.'),
('venue-yarramalong-valley-farmstay','minimum_spend_note','"No minimum spend stated; BYO alcohol and own caterers allowed"','known',0.7,'vendor_reply','Vendor email reply 2026-10-06','2026-10-06T00:00:00Z','Inferred from reply: catering and alcohol are not tied to the venue.'),
('venue-yarramalong-valley-farmstay','availability_note','"Available weekends 5-7 and 26-28 Nov 2027; any weekend in Dec 2027 (as at 2026-10-06)"','known',0.8,'vendor_reply','Vendor email reply 2026-10-06','2026-10-06T00:00:00Z',NULL),
('venue-somersby-gardens-estate','minimum_spend_note','"No minimum spend attached to bookings"','known',0.9,'vendor_reply','Vendor email reply 2026-10-06','2026-10-06T00:00:00Z','Package split in 4 payments, first is the deposit.'),
('venue-somersby-gardens-estate','availability_note','"Availabilities through November and early December 2027 (as at 2026-10-06)"','known',0.8,'vendor_reply','Vendor email reply 2026-10-06','2026-10-06T00:00:00Z',NULL),
('venue-the-grange-wollongong','minimum_spend_note',NULL,'unknown',NULL,'vendor_reply','Vendor email reply 2026-10-06','2026-10-06T00:00:00Z','Asked in enquiry; not answered. Check Wedding Packages 2027-2028 PDF.')
ON CONFLICT (vendor_id, attribute_key) DO NOTHING;

INSERT INTO wedding_vendor_rooms (room_id, vendor_id, room_name, sort_order, description,
    pricing_label, price_from_cents, minimum_spend_note, inclusions, availability_note,
    source_url, source_label, source_checked_at)
VALUES
('room-yarramalong-barn-reception','venue-yarramalong-valley-farmstay','Barn reception',1,
 'Barn reception with lake views, with ceremony-to-dancing all on the property.',
 'Harvest Haven Package $15,500 for ~100 guests (covers the whole property, 3 days / 2 nights)',1550000,
 'No minimum spend stated',
 ARRAY['Exclusive use of property for 3 days / 2 nights','Onsite accommodation for up to 15 guests','Day-of wedding coordination','Ceremony and reception furniture','Arbours, benches, signing tables and chairs','Vintage decor, rugs, lighting and fairy lights','Cool room, toilets and rubbish removal','Lawn games','50 acres of photo locations incl. farm animals','Early check-in and late check-out','Access to decor, props and styling pieces'],
 'Weekends 5-7 and 26-28 Nov 2027; any weekend Dec 2027',
 'https://yarramalongvalleyfarmstay.com.au','Vendor email reply 2026-10-06','2026-10-06'),
('room-yarramalong-ceremony-locations','venue-yarramalong-valley-farmstay','Ceremony locations',2,
 'Several ceremony locations including a wet-weather lake-view option.',
 'Included in Harvest Haven Package',NULL,NULL,
 ARRAY['Ceremony furniture, arbours and benches','Wet-weather lake-view option'],NULL,
 'https://yarramalongvalleyfarmstay.com.au','Vendor email reply 2026-10-06','2026-10-06'),
('room-yarramalong-accommodation','venue-yarramalong-valley-farmstay','Onsite accommodation',3,
 'Award-winning onsite accommodation for up to 15 guests.',
 'Included in Harvest Haven Package; tailored package available without accommodation',NULL,NULL,
 ARRAY['Sleeps up to 15 guests','Early check-in and late check-out'],NULL,
 'https://yarramalongvalleyfarmstay.com.au','Vendor email reply 2026-10-06','2026-10-06')
ON CONFLICT (vendor_id, room_name) DO NOTHING;

DELETE FROM wedding_vendors WHERE vendor_id IN (
 '01M3QCKX7DD0C04M9AVQPKRJSJ','01M3QCKX7R7ZS3ZAQWPWH1MPCT','01M3QCKX8P8EQ5BJQ856J0ZEJ4',
 '01M3QVS4RQH6Y83HTJQT3KW844','01M3QVS4S3D0EZ13F3KP7ATP3W','01M3QVS4S9A9VMPBMZ69QHK24A',
 '01M3QVS4VFEE578FHVMAZ8TXDC','01M3QVS4VNY0CZQGCM9RGXMKQS','01M3TBE6JZZSBVJ5Q8651EEV47',
 '01M3TBE6KT7R9S11VX3EXTSZV1','01M3TBE6M0EWRYZAKS11B7B4HB','01M3TBE6NYF7B33ATD10ZRXAE3',
 '01M3TBE6P5R8HHASSVH4VEJHRJ','01M47AZNZP36TY3P9X6CDW206B');

COMMIT;
