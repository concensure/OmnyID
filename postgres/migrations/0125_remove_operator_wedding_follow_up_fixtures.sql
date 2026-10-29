-- Remove two receipt-bound follow-up rows created during operator testing.
-- The vendor listings remain available and genuine contacts for these vendors
-- are untouched. Exact receipt matching prevents a later real enquiry from
-- being removed merely because it uses the same account or vendor.
DELETE FROM wedding_vendor_user_contacts AS contact
USING wedding_vendors AS vendor, users AS account
WHERE contact.vendor_id = vendor.vendor_id
  AND contact.user_id = account.id
  AND lower(account.email) = 'concensure@gmail.com'
  AND (
    (vendor.vendor_id = 'venue-bells-at-killcare'
      AND contact.receipt_ref = '01M55527294XTQFNCQEFKCJE3Q')
    OR
    (vendor.vendor_id = 'venue-mackay-family-estate'
      AND contact.receipt_ref = '01M4Z5RNXQ9F7PK9TNHGCZR034')
  );
