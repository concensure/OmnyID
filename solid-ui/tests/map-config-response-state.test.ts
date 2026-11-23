import test from "node:test";
import assert from "node:assert/strict";

import {
  OSM_TILE_CONFIG,
  normalizeGeocodeResponse,
  normalizeGeofenceZoneResponse,
  normalizeGeofenceZonesResponse,
  normalizeMapProviderConfig,
  normalizePlacesResponse,
  normalizeRouteResponse,
} from "../src/lib/mapConfig.ts";

test("normalizeMapProviderConfig falls back to OSM for malformed provider payloads", () => {
  assert.deepEqual(normalizeMapProviderConfig({ provider: "bad", tile_config: null, available_providers: ["bad"] }), {
    provider: "osm",
    tile_config: OSM_TILE_CONFIG,
    available_providers: ["osm"],
  });
});

test("normalizeGeocodeResponse filters malformed geocode rows", () => {
  assert.deepEqual(normalizeGeocodeResponse({
    provider: "mapbox",
    message_id: 123,
    results: [
      { display_name: "Sydney", lat: -33.8688, lng: 151.2093, place_id: "syd", country: "AU" },
      { display_name: "missing coords", lat: Number.NaN, lng: 1 },
      { lat: 1, lng: 2 },
    ],
  }), {
    provider: "mapbox",
    message_id: "123",
    results: [{
      display_name: "Sydney",
      lat: -33.8688,
      lng: 151.2093,
      place_id: "syd",
      country: "AU",
    }],
  });
});

test("normalizeRouteResponse drops invalid steps and default-labels partial route copy", () => {
  const response = normalizeRouteResponse({
    provider: "google_maps",
    route: {
      distance_m: 1200,
      duration_s: 360,
      steps: [
        { instruction: "", distance_m: Number.NaN, duration_s: 30, start: { lat: 1, lng: 2 }, end: { lat: 3, lng: 4 } },
        { instruction: "bad", start: { lat: 1 }, end: { lat: 2, lng: 3 } },
      ],
    },
  });

  assert.equal(response.provider, "google_maps");
  assert.equal(response.route?.distance_text, "1200 m");
  assert.equal(response.route?.duration_text, "360 s");
  assert.deepEqual(response.route?.steps, [{
    instruction: "Continue",
    distance_m: 0,
    duration_s: 30,
    start: { lat: 1, lng: 2 },
    end: { lat: 3, lng: 4 },
  }]);
});

test("normalizePlacesResponse keeps only usable places and scalar type labels", () => {
  assert.deepEqual(normalizePlacesResponse({
    provider: "unsupported",
    places: [
      { name: "Cafe", lat: 1, lng: 2, types: ["food", "", 42], distance_m: Number.POSITIVE_INFINITY, vicinity: true },
      { name: "", lat: 1, lng: 2 },
    ],
  }), {
    provider: "osm",
    message_id: "",
    places: [{
      name: "Cafe",
      lat: 1,
      lng: 2,
      place_id: undefined,
      types: ["food", "42"],
      distance_m: undefined,
      vicinity: "true",
    }],
  });
});

test("geofence response normalizers filter malformed zones and default unsupported trigger fields", () => {
  assert.deepEqual(normalizeGeofenceZonesResponse({
    zones: [
      {
        id: "zone_1",
        name: "Home",
        lat: -33,
        lng: 151,
        radius_m: 100,
        zone_type: "",
        trigger_on: "sideways",
        enabled: "yes",
        created_at: 1,
        updated_at: 2,
      },
      { id: "missing coords", name: "Bad" },
    ],
  }), [{
    id: "zone_1",
    name: "Home",
    lat: -33,
    lng: 151,
    radius_m: 100,
    zone_type: "custom",
    trigger_heuristic_id: undefined,
    trigger_on: "both",
    enabled: true,
    created_at: "1",
    updated_at: "2",
  }]);

  assert.equal(normalizeGeofenceZoneResponse({ zone: { name: "No id" } }), null);
});
