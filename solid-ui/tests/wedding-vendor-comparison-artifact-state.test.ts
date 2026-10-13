import test from "node:test";
import assert from "node:assert/strict";

import {
  isActionableVendorComparisonCard,
  vendorComparisonCardsForArtifact,
} from "@/lib/weddingVendorComparisonArtifactState";

test("category pages and aggregate directories are never actionable vendor cards", () => {
  assert.equal(isActionableVendorComparisonCard({
    title: "VenueGuide.au",
    source_url: "https://venueguide.au",
  }), false);
  assert.equal(isActionableVendorComparisonCard({
    title: "Easy Weddings",
    source_url: "https://www.easyweddings.com.au/",
  }), false);
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

test("comparison cards only render direct Unsplash image URLs", () => {
  const [card] = vendorComparisonCardsForArtifact({
    topChoiceCards: [{
      rank: 1,
      title: "Mackay Family Estate",
      source_url: "https://mackay-family-estate.example",
      image_url: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format",
    }, {
      rank: 2,
      title: "Other Venue",
      source_url: "https://other-venue.example",
      image_url: "/wedding/vendor-photo/google?name=places%2Fexample%2Fphotos%2Fphoto_abc",
    }],
  });
  assert.match(card.imageUrl ?? "", /^https:\/\/images\.unsplash\.com\//);
  const cards = vendorComparisonCardsForArtifact({
    topChoiceCards: [{ rank: 1, title: "Other Venue", source_url: "https://other-venue.example", image_url: "https://cdn.example/venue.jpg" }],
  });
  assert.equal(cards[0]?.imageUrl, null);
});
