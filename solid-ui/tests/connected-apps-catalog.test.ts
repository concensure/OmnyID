import assert from "node:assert/strict";
import test from "node:test";

import { AVAILABLE_CONNECTED_APPS } from "../src/lib/connectedAppsCatalog.ts";

test("connected apps catalog exposes Brave Search API for wedding vendor research", () => {
  const brave = AVAILABLE_CONNECTED_APPS.find((app) => app.id === "brave-search-api");

  assert.ok(brave);
  assert.equal(brave.name, "Brave Search API");
  assert.equal(brave.category, "AI & Research");
  assert.equal(brave.authType, "api_key");
  assert.equal(brave.connectionProvider, "mcp");
  assert.ok(brave.capabilities.includes("search_web"));
  assert.ok(brave.capabilities.includes("search_images"));
});

test("connected apps catalog exposes live place providers for wedding vendor research", () => {
  const googlePlaces = AVAILABLE_CONNECTED_APPS.find((app) => app.id === "google-places-api");
  const overpass = AVAILABLE_CONNECTED_APPS.find((app) => app.id === "overpass-api");

  assert.ok(googlePlaces);
  assert.equal(googlePlaces.name, "Google Places API");
  assert.equal(googlePlaces.category, "AI & Research");
  assert.equal(googlePlaces.authType, "api_key");
  assert.ok(googlePlaces.capabilities.includes("place_search"));
  assert.ok(googlePlaces.capabilities.includes("place_details"));

  assert.ok(overpass);
  assert.equal(overpass.name, "OSM / Overpass API");
  assert.equal(overpass.category, "AI & Research");
  assert.equal(overpass.authType, "none");
  assert.ok(overpass.capabilities.includes("osm_place_search"));
  assert.ok(overpass.capabilities.includes("osm_tag_search"));
});

test("connected apps catalog exposes wedding execution stack providers", () => {
  const ids = new Set(AVAILABLE_CONNECTED_APPS.map((app) => app.id));

  assert.equal(ids.has("google-maps-platform"), true);
  assert.equal(ids.has("weatherapi"), true);
  assert.equal(ids.has("twilio-messaging"), true);
  assert.equal(ids.has("stripe"), true);
  assert.equal(ids.has("cloudinary"), true);

  const maps = AVAILABLE_CONNECTED_APPS.find((app) => app.id === "google-maps-platform");
  const weather = AVAILABLE_CONNECTED_APPS.find((app) => app.id === "weatherapi");
  const twilio = AVAILABLE_CONNECTED_APPS.find((app) => app.id === "twilio-messaging");
  const cloudinary = AVAILABLE_CONNECTED_APPS.find((app) => app.id === "cloudinary");

  assert.ok(maps?.capabilities.includes("distance_matrix"));
  assert.ok(weather?.capabilities.includes("weather_forecast"));
  assert.ok(twilio?.capabilities.includes("send_sms"));
  assert.ok(cloudinary?.capabilities.includes("image_thumbnail"));
});
