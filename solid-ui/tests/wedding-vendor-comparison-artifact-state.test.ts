import test from "node:test";
import assert from "node:assert/strict";

import {
  isActionableVendorComparisonCard,
  vendorComparisonCardsForArtifact,
  vendorComparisonHandoffForArtifact,
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

test("legacy generic recommendation is rebuilt from saved source evidence", () => {
  const handoff = vendorComparisonHandoffForArtifact({
    vendorComparisonHandoff: {
      recommendationLabel: "Start by reviewing Harbour Studio, then select every vendor you want OmnyID to pursue.",
      whyLabels: ["2 source-backed vendors found"],
      confidenceLabel: "Confidence: developing",
    },
    topChoiceCards: [
      { rank: 1, title: "Harbour Studio", source_url: "https://harbour.example", preference_match: "a waterfront ceremony", checked_facts_count: 4 },
      { rank: 2, title: "Garden House", source_url: "https://garden.example", preference_match: "a garden reception" },
    ],
  });
  assert.match(handoff?.recommendationLabel ?? "", /Harbour Studio.*4 checked facts/i);
  assert.doesNotMatch(handoff?.recommendationLabel ?? "", /Start by reviewing/i);
  assert.doesNotMatch(handoff?.recommendationLabel ?? "", /stronger fit|alternative/i);
});

test("reopened venue comparisons hide legacy photography cards", () => {
  const cards = vendorComparisonCardsForArtifact({
    vendorCategories: ["Venue"],
    topChoiceCards: [
      { rank: 1, title: "A2Z Weddings", vendor_id: "photographer-a2z-weddings", source_url: "https://a2z.example" },
      { rank: 2, title: "Bondi Beach Venue", vendor_id: "venue-bondi-beach", source_url: "https://bondi.example" },
    ],
  });

  assert.deepEqual(cards.map((card) => card.title), ["Bondi Beach Venue"]);
});

test("persisted compare-the-options copy is replaced with an evidence-specific lead", () => {
  const handoff = vendorComparisonHandoffForArtifact({
    vendorComparisonHandoff: { recommendationLabel: "Compare the 3 options below.", whyLabels: ["3 source-backed vendors"], confidenceLabel: "Confidence: developing" },
    topChoiceCards: [
      { rank: 1, title: "Harbour Studio", source_url: "https://harbour.example", checked_facts_count: 2 },
      { rank: 2, title: "Garden House", source_url: "https://garden.example", checked_facts_count: 1 },
      { rank: 3, title: "City Loft", source_url: "https://city.example", checked_facts_count: 1 },
    ],
  });
  assert.match(handoff?.recommendationLabel ?? "", /Harbour Studio.*2 checked facts/i);
  assert.doesNotMatch(handoff?.recommendationLabel ?? "", /^Compare the/i);
});

test("comparison cards render approved public, proxy, and bounded first-party photos only", () => {
  const cardsWithSafePhotos = vendorComparisonCardsForArtifact({
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
    }, {
      rank: 3,
      title: "Harbour Venue",
      source_url: "https://harbour-venue.example",
      image_url: "https://omnyid.com/wedding/assets/venue-photos/harbour-venue.jpg",
    }],
  });
  assert.match(cardsWithSafePhotos[0]?.imageUrl ?? "", /^https:\/\/images\.unsplash\.com\//);
  assert.match(cardsWithSafePhotos[1]?.imageUrl ?? "", /^\/wedding\/vendor-photo\/google\?/);
  assert.equal(cardsWithSafePhotos[2]?.imageUrl, "https://omnyid.com/wedding/assets/venue-photos/harbour-venue.jpg");
  const cards = vendorComparisonCardsForArtifact({
    topChoiceCards: [{ rank: 1, title: "Other Venue", source_url: "https://other-venue.example", image_url: "https://cdn.example/venue.jpg" }],
  });
  assert.equal(cards[0]?.imageUrl, null);
});
