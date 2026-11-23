-- Complete public celebrant profiles from reviewed official-site evidence and add
-- a narrow no-account capability for consultation availability only.

CREATE TABLE IF NOT EXISTS wedding_celebrant_management_grants (
    grant_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    token_prefix TEXT NOT NULL,
    token_digest TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','exchanged','rotated','revoked','expired')),
    generation BIGINT NOT NULL CHECK (generation > 0),
    expires_at TIMESTAMPTZ NOT NULL,
    exchanged_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_celebrant_management_grants_vendor
    ON wedding_celebrant_management_grants (vendor_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_celebrant_active_management_grant
    ON wedding_celebrant_management_grants (vendor_id)
    WHERE status IN ('active','exchanged');

CREATE TABLE IF NOT EXISTS wedding_celebrant_management_sessions (
    session_id TEXT PRIMARY KEY,
    grant_id TEXT NOT NULL REFERENCES wedding_celebrant_management_grants(grant_id) ON DELETE CASCADE,
    session_token_digest TEXT NOT NULL UNIQUE,
    csrf_token_digest TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_celebrant_management_sessions_grant
    ON wedding_celebrant_management_sessions (grant_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS wedding_celebrant_management_events (
    event_id TEXT PRIMARY KEY,
    grant_id TEXT REFERENCES wedding_celebrant_management_grants(grant_id) ON DELETE SET NULL,
    vendor_id TEXT NOT NULL REFERENCES wedding_vendors(vendor_id) ON DELETE CASCADE,
    event_kind TEXT NOT NULL CHECK (event_kind IN (
        'link_created','link_exchanged','link_rotated','link_revoked',
        'settings_updated','window_added','window_removed','live_started','live_paused'
    )),
    dedupe_key TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_kind, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_celebrant_management_events_vendor
    ON wedding_celebrant_management_events (vendor_id, occurred_at DESC);

-- The official sites support fifteen celebrant profiles. Enzo's official site
-- describes a venue and cafe, so correct the imported category rather than
-- presenting a false celebrant service.
UPDATE wedding_vendors
SET category='Venue',
    evidence=evidence || jsonb_build_object(
      'category_correction', jsonb_build_object(
        'from','Celebrant','to','Venue','source_url','https://www.enzohuntervalley.com.au/',
        'checked_at','2026-11-11','reason','Official site describes a wedding venue and cafe.'
      )
    ),
    updated_at=NOW()
WHERE vendor_slug='celebrant-enzo-weddings-hunter-valley'
  AND lower(category)='celebrant';

WITH profiles(vendor_slug, summary, strengths, ceremony_types, source_url) AS (VALUES
  ('celebrant-amy-webster-celebrant-mc','Newcastle and Hunter Valley celebrant and MC focused on relaxed, personal ceremonies with practical guidance for vows and the ceremony flow.',ARRAY['relaxed ceremony planning','personal storytelling','MC services','vow guidance']::text[],ARRAY['personalised ceremony','elopement','micro-wedding','vow renewal']::text[],'http://amywebster.au/'),
  ('celebrant-beverly-your-celebrant-mc','Sydney celebrant and MC who develops ceremony wording around each couple''s story and is open to travel beyond Sydney.',ARRAY['couple-led ceremony wording','MC services','travel','storytelling']::text[],ARRAY['personalised ceremony','elopement','micro-wedding','vow renewal']::text[],'http://www.yourcelebrantandceremony.com.au/'),
  ('celebrant-carla-davern-celebrant','Sydney celebrant, MC and singer serving Sydney, the Hunter Valley and Blue Mountains, with experience incorporating a range of cultural traditions.',ARRAY['celebrant and MC','ceremony singing','cultural ceremony experience','regional travel']::text[],ARRAY['personalised ceremony','elopement','large wedding','multicultural ceremony']::text[],'https://www.carladavern.com.au/'),
  ('celebrant-celebrant-melissa-soncini','Surry Hills celebrant offering modern, inclusive ceremonies, including options for international couples, mixed-faith celebrations and friend- or family-led ceremonies.',ARRAY['inclusive ceremonies','international couples','mixed-faith ceremonies','family-led ceremony support']::text[],ARRAY['personalised ceremony','elopement','micro-wedding','registry-style ceremony','LGBTQIA+ wedding']::text[],'http://www.marriagecelebrantonline.com/'),
  ('celebrant-celebrations-by-bev','Sydney celebrant offering customised ceremonies, simple legal weddings and elopements, with an organised and calm approach to the day.',ARRAY['simple legal weddings','calm coordination','custom ceremony planning','elopements']::text[],ARRAY['personalised ceremony','elopement','legal-only ceremony','large wedding']::text[],'https://www.celebrationsbybev.com.au/'),
  ('celebrant-happy-celebrant','Sydney celebrant service centred on fresh, modern ceremonies with planning support for a warm and upbeat wedding day.',ARRAY['modern ceremonies','ceremony planning','upbeat delivery','Sydney service']::text[],ARRAY['personalised ceremony','elopement','micro-wedding','large wedding']::text[],'https://happycelebrant.com.au/'),
  ('celebrant-hungry-hearts-co','Newcastle celebrant-and-photographer team offering ceremony, MC and documentary-style photography packages through one coordinated service.',ARRAY['celebrant and photography team','MC services','documentary photography','coordinated packages']::text[],ARRAY['personalised ceremony','micro-wedding','elopement','large wedding']::text[],'http://www.hungryheartsco.com/'),
  ('celebrant-jaya-bargwanna-celebrant-fun-weddings-for-the-fools-in-love','Newcastle and Hunter Valley celebrant specialising in warm, inclusive storytelling with a light-hearted ceremony style.',ARRAY['inclusive ceremonies','storytelling','light-hearted delivery','Hunter Valley service']::text[],ARRAY['personalised ceremony','elopement','micro-wedding','LGBTQIA+ wedding']::text[],'http://www.jayabargwannacelebrant.com/'),
  ('celebrant-jessie-cacchillo','Full-time Sydney celebrant offering contemporary, personalised ceremonies with detailed planning guidance and regional travel by arrangement.',ARRAY['contemporary ceremonies','detailed planning','personal storytelling','travel by arrangement']::text[],ARRAY['personalised ceremony','elopement','micro-wedding','large wedding']::text[],'http://www.jessiecacchillo.com/'),
  ('celebrant-johan-the-celebrant-and-wedding-mc-sydney','Sydney celebrant and MC offering personalised storytelling, reception MC support and travel across Australia.',ARRAY['celebrant and MC','storytelling','reception coordination','Australia-wide travel']::text[],ARRAY['personalised ceremony','elopement','micro-wedding','large wedding']::text[],'https://www.johanthecelebrant.com.au/'),
  ('celebrant-julie-muir-celebrant','Newcastle and Hunter Valley celebrant offering weddings, elopements, legal-only ceremonies and vow renewals, with an organised event-management background.',ARRAY['event organisation','vow writing','legal-only options','regional service']::text[],ARRAY['personalised ceremony','elopement','legal-only ceremony','vow renewal']::text[],'https://juliemuircelebrant.com.au/'),
  ('celebrant-monty-king-celebrant','Newcastle and Hunter Valley celebrant and MC focused on couple-centred storytelling, humour and an inclusive ceremony experience.',ARRAY['storytelling','celebrant and MC','inclusive ceremonies','light-hearted delivery']::text[],ARRAY['personalised ceremony','elopement','micro-wedding','LGBTQIA+ wedding']::text[],'http://www.montyking.com.au/'),
  ('celebrant-robyn-pattison-marriage-funeral-celebrant','Sydney marriage celebrant and MC offering bespoke, inclusive ceremonies, elopements, mini-weddings and vow renewals.',ARRAY['bespoke ceremonies','celebrant and MC','inclusive ceremonies','elopements']::text[],ARRAY['personalised ceremony','elopement','micro-wedding','vow renewal','LGBTQIA+ wedding']::text[],'http://www.robynpattison.com.au/'),
  ('celebrant-simple-ceremonies','Sydney celebrant service offering legal-only ceremonies, elopements and larger celebrations through a streamlined booking process.',ARRAY['legal-only ceremonies','streamlined booking','elopements','Sydney locations']::text[],ARRAY['legal-only ceremony','elopement','micro-wedding','large wedding']::text[],'https://www.simpleceremonies.com.au/'),
  ('celebrant-tmt-weddings','Sydney marriage celebrant and master of ceremonies service. Its public website provides only a brief service outline, so package details should be confirmed directly.',ARRAY['marriage celebrant','MC services','Sydney service']::text[],ARRAY['personalised ceremony','micro-wedding','large wedding']::text[],'https://www.tmtweddings.com.au/')
)
UPDATE wedding_vendors v
SET category='Celebrant',
    source_checked_at=DATE '2026-11-11',
    evidence=v.evidence || jsonb_build_object(
      'celebrant_profile',jsonb_build_object(
        'editorial_summary',p.summary,
        'strengths',to_jsonb(p.strengths),
        'ceremony_types',to_jsonb(p.ceremony_types),
        'source_url',p.source_url,
        'checked_at','2026-11-11',
        'description_authority','operator-curated from official business site',
        'image_status','awaiting owner licence'
      )
    ),
    updated_at=NOW()
FROM profiles p
WHERE v.vendor_slug=p.vendor_slug;

UPDATE wedding_vendors SET contact_email='amy@amywebster.com.au',updated_at=NOW()
WHERE vendor_slug='celebrant-amy-webster-celebrant-mc' AND COALESCE(contact_email,'')='';
UPDATE wedding_vendors SET contact_email='beverly@yourcelebrantandceremony.com',updated_at=NOW()
WHERE vendor_slug='celebrant-beverly-your-celebrant-mc' AND COALESCE(contact_email,'')='';
UPDATE wedding_vendors SET contact_email='hello@juliemuircelebrant.com.au',updated_at=NOW()
WHERE vendor_slug='celebrant-julie-muir-celebrant' AND COALESCE(contact_email,'')='';

INSERT INTO wedding_celebrant_pilot_profiles (vendor_id)
SELECT vendor_id FROM wedding_vendors
WHERE status='active' AND lower(category)='celebrant'
ON CONFLICT (vendor_id) DO NOTHING;
