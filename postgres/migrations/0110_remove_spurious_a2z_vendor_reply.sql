-- An older browser projection could mistake its own A2Z outreach draft for an
-- inbound reply. It wrote this exact synthetic marker even though the directory
-- record has no vendor email. Remove only that demonstrably synthetic row for
-- every account; real vendor contact or reply records are untouched.
DELETE FROM wedding_vendor_user_contacts AS contact
USING wedding_vendors AS vendor
WHERE contact.vendor_id = vendor.vendor_id
  AND lower(trim(vendor.vendor_name)) = 'a2z weddings'
  AND contact.contact_method = 'other'
  AND contact.vendor_email IS NULL
  AND contact.notes = 'AFP vendor reply | Subject: Wedding photography enquiry for A2Z Weddings';
