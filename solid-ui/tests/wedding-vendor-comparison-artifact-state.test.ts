import test from "node:test";
import assert from "node:assert/strict";

import {
  isActionableVendorComparisonCard,
  vendorComparisonCardsForArtifact,
} from "@/lib/weddingVendorComparisonArtifactState";

test("category pages and aggregate directories are never actionable vendor cards", () => {
  assert.equal(isActionableVendorComparisonCard({
    title: "Live Music Venues in Sydney | SydneyMusic.net - Sydney's live music community guide",
    source_url: "https://sydneymusic.net/live-music-venues-sydney",
  }), false);
  assert.equal(isActionableVendorComparisonCard({
    title: "The 16 Best Concert Venues for Hire in Sydney | Tagvenue Australia",
    source_url: "https://www.tagvenue.com/au/hire/concert-venues/sydney",
  }), false);
  assert.equal(isActionableVendorComparisonCard({
    title: "Harbour Lights Events",
    source_url: "https://harbourlightsevents.example/weddings",
  }), true);
});

test("reopened comparison artifacts hide previously persisted category pages", () => {
  const cards = vendorComparisonCardsForArtifact({
    topChoiceCards: [
      { rank: 1, title: "The 16 Best Concert Venues for Hire in Sydney | Tagvenue Australia", source_url: "https://tagvenue.com/au/hire/concert-venues/sydney" },
      { rank: 2, title: "Harbour Lights Events", source_url: "https://harbourlightsevents.example/weddings" },
    ],
  });
  assert.deepEqual(cards.map((card) => card.title), ["Harbour Lights Events"]);
});
