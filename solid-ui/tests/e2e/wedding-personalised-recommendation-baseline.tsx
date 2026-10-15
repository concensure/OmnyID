import { render } from "solid-js/web";

import "../../src/index.css";
import { WeddingVendorDeckCard } from "../../src/components/WeddingVendorDeckCard";
import type { WeddingVendorChoiceCardData } from "../../src/components/WeddingVendorChoiceCard";
import { rankWeddingVendorCandidates } from "../../src/lib/weddingVendorRankingState";
import type { FocusDeckItem } from "../../src/lib/mobileFocusHomeState";
import { weddingVendorAnchorRows, weddingVendorVerifyQuestions } from "../../src/lib/weddingVendorAnchorRowState";
import {
  WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS,
  WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE,
} from "../fixtures/wedding-vendor-personalised-recommendation-baseline";

const ranked = rankWeddingVendorCandidates({
  sources: [WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE],
  requirements: WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS,
  now: new Date("2026-10-15T00:00:00Z"),
}).verify[0]!;
const anchorRows = weddingVendorAnchorRows(ranked, WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS);

const card: WeddingVendorChoiceCardData = {
  choiceId: ranked.id,
  rank: 1,
  comparisonCount: 1,
  title: ranked.title,
  imageUrl: ranked.imageUrl,
  imageAlt: null,
  scoreLabel: `${ranked.fit} fit · ${ranked.confidenceBucket} confidence`,
  provider: ranked.provider,
  sourceUrl: ranked.url,
  websiteUrl: ranked.websiteUrl,
  mapUrl: ranked.mapUrl,
  instagramUrl: ranked.instagramUrl,
  email: ranked.email,
  phone: ranked.phone,
  address: ranked.address,
  rationaleLabels: ranked.rationaleLabels,
  preferenceMatch: ranked.preferenceMatchLabel,
  situationFit: ranked.situationFitLabel,
  verificationLabel: ranked.unknownHardConstraints.join(", "),
  checkedFactsCount: ranked.components.filter((component) => component.known).length,
  anchorRows,
  verifyQuestions: weddingVendorVerifyQuestions(anchorRows, ranked.unknownHardConstraints),
  group: ranked.group,
  availabilityState: ranked.availabilityState,
  availabilityLabel: ranked.availabilityLabel,
  confidenceLabel: ranked.confidenceLabel,
  vendorId: ranked.vendorId,
  unknownConstraints: ranked.unknownHardConstraints,
  weddingPlanId: "baseline-fixture",
  qualityScoreLabel: null,
  sentimentScoreLabel: null,
  valueScoreLabel: null,
  seasonalNote: null,
  rooms: ranked.rooms,
};

const item: FocusDeckItem = {
  id: "comparison:bondi-baseline",
  kind: "vendor_comparison",
  sourceSurface: "wedding_vendor_comparison",
  title: "Bondi vendor ranking baseline",
  recommendedActionLabel: "Check availability",
  whyNowLabel: "Controlled regression fixture.",
  dueAt: null,
  evidenceLabels: ["Synthetic fixture"],
  deferCount: 0,
  returnedFromLater: false,
  external: false,
  vendorComparison: { artifactId: "artifact:bondi-baseline", cards: [card] },
};

render(() => (
  <div class="mx-auto min-h-screen max-w-md bg-wedding-surface p-3 text-wedding-text">
    <h1 class="mb-3 text-lg font-bold">Bondi vendor ranking baseline</h1>
    <WeddingVendorDeckCard item={item} onContactVendor={() => undefined} onDone={() => undefined} />
  </div>
), document.getElementById("root")!);
