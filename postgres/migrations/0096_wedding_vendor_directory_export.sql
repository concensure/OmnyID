-- Keep the Oracle vendor-directory CSV contract available without storing a
-- denormalized count. `photo_count` remains derived from the stable photo slots,
-- so it cannot drift when an operator adds, replaces, or removes a photo.
CREATE OR REPLACE VIEW wedding_vendor_directory_export AS
SELECT
    vendor.vendor_id,
    vendor.vendor_name,
    vendor.category,
    vendor.service_area,
    vendor.website_url,
    vendor.source_url,
    vendor.status,
    COUNT(photo.photo_id)::INTEGER AS photo_count
FROM wedding_vendors AS vendor
LEFT JOIN wedding_vendor_photos AS photo
    ON photo.vendor_id = vendor.vendor_id
GROUP BY
    vendor.vendor_id,
    vendor.vendor_name,
    vendor.category,
    vendor.service_area,
    vendor.website_url,
    vendor.source_url,
    vendor.status;
