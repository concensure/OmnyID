-- ─────────────────────────────────────────────────────────────────────────────
-- 0050_map_provider.sql
-- Map service integration: provider selection per user + location event log
--
-- Tables:
--   map_provider_configs  — per-user map provider preference + API key ref
--   location_events       — continuous stream of user location snapshots
--   geofence_zones        — user-defined safe/trigger zones
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Map provider config ───────────────────────────────────────────────────────
-- Stores which map provider a user has chosen and whether they've supplied a key.
CREATE TABLE IF NOT EXISTS map_provider_configs (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      TEXT         NOT NULL UNIQUE,
    -- 'google_maps' | 'mapbox' | 'osm'
    provider     TEXT         NOT NULL DEFAULT 'google_maps'
                 CHECK (provider IN ('google_maps', 'mapbox', 'osm')),
    -- Reference to secret_manager key name, NOT the key itself
    api_key_ref  TEXT,
    enabled      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS map_provider_configs_user_id_idx ON map_provider_configs(user_id);

-- ── Location events ───────────────────────────────────────────────────────────
-- Append-only stream of user location snapshots ingested by the watcher agent
-- or from passive event ingest (/ingest/location). Used by heuristic packs
-- to detect proximity to POIs and calculate travel buffers.
CREATE TABLE IF NOT EXISTS location_events (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      TEXT         NOT NULL,
    -- AFP message that carried this event, for lineage
    message_id   TEXT,
    lat          DOUBLE PRECISION NOT NULL,
    lng          DOUBLE PRECISION NOT NULL,
    accuracy_m   DOUBLE PRECISION,
    -- e.g. 'gps', 'network', 'passive', 'manual'
    source       TEXT         NOT NULL DEFAULT 'passive',
    -- optional semantic label resolved by reverse geocode
    label        TEXT,
    -- raw metadata from the client (speed, heading, altitude, etc.)
    metadata     JSONB        NOT NULL DEFAULT '{}',
    recorded_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS location_events_user_id_idx ON location_events(user_id);
CREATE INDEX IF NOT EXISTS location_events_recorded_at_idx ON location_events(recorded_at DESC);
-- Geo-proximity queries: find events within bounding box
CREATE INDEX IF NOT EXISTS location_events_lat_lng_idx ON location_events(lat, lng);

-- ── Geofence zones ────────────────────────────────────────────────────────────
-- User-defined trigger zones. The heuristic engine checks whether the latest
-- location event is inside any zone and fires the linked heuristic if so.
CREATE TABLE IF NOT EXISTS geofence_zones (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      TEXT         NOT NULL,
    name         TEXT         NOT NULL,
    lat          DOUBLE PRECISION NOT NULL,
    lng          DOUBLE PRECISION NOT NULL,
    radius_m     DOUBLE PRECISION NOT NULL DEFAULT 200.0,
    -- 'home' | 'work' | 'errand' | 'custom'
    zone_type    TEXT         NOT NULL DEFAULT 'custom',
    -- heuristic id to trigger on enter/exit, or NULL for info-only
    trigger_heuristic_id TEXT,
    -- 'enter' | 'exit' | 'both'
    trigger_on   TEXT         NOT NULL DEFAULT 'enter',
    enabled      BOOLEAN      NOT NULL DEFAULT TRUE,
    metadata     JSONB        NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS geofence_zones_user_id_idx ON geofence_zones(user_id);

-- ── Update api_tier_registry to add mapbox and osm entries ───────────────────
INSERT INTO api_tier_registry (name, tier, task_types, cost_usd_per_call, requires_key, notes)
VALUES
  ('mapbox',             2, '{map,routing,geocoding}',   0.000500, TRUE,  'Mapbox Directions + Geocoding API'),
  ('osm_nominatim',      1, '{geocoding}',               0.000000, FALSE, 'OpenStreetMap Nominatim geocoder (free, rate-limited)'),
  ('osm_osrm',           1, '{routing}',                 0.000000, FALSE, 'OSRM public routing server (free, no key required)'),
  ('osm_overpass',       1, '{map,activities}',          0.000000, FALSE, 'OpenStreetMap Overpass API for POI queries (free)')
ON CONFLICT (name) DO NOTHING;
