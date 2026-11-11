import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeWeddingVendorPreferenceLabels,
  weddingVendorQueryGooglePlaceTypes,
  weddingVendorQueryIntent,
} from "@/lib/weddingVendorQueryIntentState";
import { rankWeddingVendorCandidates } from "@/lib/weddingVendorRankingState";

test("venue prose creates a venue-scoped comparison from only the current request", () => {
  const intent = weddingVendorQueryIntent(
    "wedding venues in east suburbs near the beach, with 90 guests and looking for a natural atmosphere",
  );
  assert.equal(intent.category, "venue");
  assert.equal(intent.categoryLabel, "Venue");
  assert.equal(intent.exactNameLookup, false);
  assert.equal(intent.location, "east suburbs near the beach");
  assert.equal(intent.guestCount, "90 guests");
  assert.equal(intent.budgetComfort, null);
  assert.equal(intent.atmosphere, "natural atmosphere");
  assert.deepEqual(intent.priorities, ["Near the beach", "natural atmosphere"]);
  assert.deepEqual(weddingVendorQueryGooglePlaceTypes(intent.category), ["event_venue", "restaurant", "lodging"]);
});

test("a short vendor name remains a private exact-name directory lookup", () => {
  const intent = weddingVendorQueryIntent("Creek Street Photography");
  assert.equal(intent.category, "photographer");
  assert.equal(intent.exactNameLookup, true);
});

test("query budget is displayed with an explicit AUD dollar sign", () => {
  assert.equal(weddingVendorQueryIntent("venue near Coogee for 90 guests under a 13900 budget").budgetComfort, "AUD $13900");
});

test("descriptive venue wording becomes ranking preferences instead of provider-only text", () => {
  const intent = weddingVendorQueryIntent("rustic & country micro-wedding venues in Sydney");
  assert.equal(intent.category, "venue");
  assert.equal(intent.location, "Sydney");
  assert.deepEqual(intent.priorities, ["rustic", "country", "micro wedding"]);
  assert.equal(intent.preferences, "rustic; country; micro wedding");
});

test("individual musicians and singers use the existing music supplier category", () => {
  const musician = weddingVendorQueryIntent("acoustic musician for our Sydney wedding");
  const singer = weddingVendorQueryIntent("live singer and piano for the reception");
  assert.equal(musician.category, "band");
  assert.equal(musician.categoryLabel, "Music");
  assert.equal(singer.category, "band");
});

test("query descriptors merge with saved Wedding preferences without duplication", () => {
  assert.deepEqual(
    mergeWeddingVendorPreferenceLabels(["rustic", "micro wedding"], "Photos, relaxed", "rustic; garden"),
    ["rustic", "micro wedding", "Photos", "relaxed", "garden"],
  );
});

test("a venue-scoped comparison excludes a known photographer category", () => {
  const result = rankWeddingVendorCandidates({
    sources: [{
      id: "creek-street", title: "Creek Street Photography", category: "Photographer",
      provider: "Admin vendor database", url: "https://creekstreet.example", websiteUrl: null,
      mapUrl: null, imageUrl: null, address: "Avalon Beach NSW", phone: null, email: null,
      instagramUrl: null, snippet: "Wedding photographer",
    }],
    requirements: { vendorCategories: ["Venue"], guestCount: "90 guests" },
  });
  assert.equal(result.verify.length, 0);
  assert.match(result.excluded[0]?.exclusionReason ?? "", /category is photographer, not venue/);
});

test("a venue-scoped comparison excludes an explicit combined hair and makeup category", () => {
  const result = rankWeddingVendorCandidates({
    sources: [{
      id: "beauty", title: "Amy Chan Hair and Makeup Artistry", category: "Hair and Makeup Artist",
      provider: "Admin vendor database", url: "https://beauty.example", snippet: "Sydney hair and makeup artist",
    }, {
      id: "venue", title: "Harbour Room", category: "Venue",
      provider: "Admin vendor database", url: "https://venue.example", snippet: "Sydney metropolitan wedding venue for 60 guests",
    }],
    requirements: { vendorCategories: ["Venue"], location: "Sydney", guestCount: "60 guests" },
  });

  assert.deepEqual([...result.bookable, ...result.verify].map((choice) => choice.title), ["Harbour Room"]);
  assert.match(result.excluded[0]?.exclusionReason ?? "", /hair makeup artist, not venue/);
});
