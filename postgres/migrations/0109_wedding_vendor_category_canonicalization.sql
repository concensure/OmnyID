-- Keep comparable vendor records in one stable category. Do not merge
-- celebrants and officiants: they represent different services and workflows.
UPDATE wedding_vendors
SET category = CASE lower(trim(category))
    WHEN 'photography' THEN 'photographer'
    WHEN 'photo' THEN 'photographer'
    WHEN 'photographer' THEN 'photographer'
    WHEN 'venues' THEN 'venue'
    WHEN 'venue' THEN 'venue'
    WHEN 'floristry' THEN 'florist'
    WHEN 'flowers' THEN 'florist'
    WHEN 'florist' THEN 'florist'
    WHEN 'catering' THEN 'caterer'
    WHEN 'caterer' THEN 'caterer'
    ELSE lower(trim(category))
END
WHERE category <> CASE lower(trim(category))
    WHEN 'photography' THEN 'photographer'
    WHEN 'photo' THEN 'photographer'
    WHEN 'photographer' THEN 'photographer'
    WHEN 'venues' THEN 'venue'
    WHEN 'venue' THEN 'venue'
    WHEN 'floristry' THEN 'florist'
    WHEN 'flowers' THEN 'florist'
    WHEN 'florist' THEN 'florist'
    WHEN 'catering' THEN 'caterer'
    WHEN 'caterer' THEN 'caterer'
    ELSE lower(trim(category))
END;

-- Owner/admin-created records predate the category normalizer. Classify this
-- known business explicitly so it participates in photography comparisons.
UPDATE wedding_vendors
SET category = 'photographer'
WHERE lower(trim(vendor_name)) = 'a2z weddings'
  AND category <> 'photographer';
