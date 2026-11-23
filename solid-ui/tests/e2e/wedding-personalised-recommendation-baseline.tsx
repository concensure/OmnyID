import { createSignal, For } from "solid-js";
import { render } from "solid-js/web";

import "../../src/index.css";
import { DecisionCard } from "../../src/components/DecisionCard";
import {
  WeddingVendorChoiceCard,
  type WeddingVendorChoiceCardData,
} from "../../src/components/WeddingVendorChoiceCard";
import { decisionCardFromWeddingVendorComparison } from "../../src/lib/decisionCardState";
import { comparisonRecommendationHandoff } from "../../src/lib/weddingVendorComparisonPresentationState";
import { weddingVendorAnchorRows, weddingVendorVerifyQuestions } from "../../src/lib/weddingVendorAnchorRowState";
import {
  type WeddingVendorOutreachFlowState,
  weddingVendorOutreachBodyChanged,
  weddingVendorOutreachDraftSucceeded,
  weddingVendorOutreachIdleFlow,
  weddingVendorOutreachSendSucceeded,
} from "../../src/lib/weddingVendorOutreachFlowState";
import {
  rankWeddingVendorCandidates,
  type WeddingVendorRankedCandidate,
} from "../../src/lib/weddingVendorRankingState";
import type { WeddingWorkspaceArtifactPreview } from "../../src/lib/weddingResponseWorkspaceViewState";
import {
  WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS,
  WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE,
} from "../fixtures/wedding-vendor-personalised-recommendation-baseline";

const ranking = rankWeddingVendorCandidates({
  sources: [WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE],
  requirements: WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS,
  now: new Date("2026-10-15T00:00:00Z"),
});
const baseline = ranking.verify[0]!;
const ranked: WeddingVendorRankedCandidate = {
  ...baseline,
  title: "Bondi Icebergs Club Wedding Reception and Events",
};
const runnerUp: WeddingVendorRankedCandidate = {
  ...baseline,
  id: "venue-coastal-pavilion-fixture",
  vendorId: "venue-coastal-pavilion-fixture",
  title: "Coastal Pavilion Sydney",
  rank: 2,
  matchedPreferenceTokens: [],
};
const rankedChoices = [ranked, runnerUp];
const comparisonResult = { ...ranking, verify: rankedChoices };
const handoff = comparisonRecommendationHandoff({
  choices: rankedChoices,
  result: comparisonResult,
  providerLabel: "Directory",
  location: WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS.location,
  topPriorities: WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS.topPriorities,
}) as unknown as NonNullable<WeddingWorkspaceArtifactPreview["vendorComparisonHandoff"]>;

const FIXTURE_PHOTO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600' viewBox='0 0 800 600'%3E%3Crect width='800' height='600' fill='%23c5dce5'/%3E%3Cpath d='M0 420q180-90 360 0t440 0v180H0z' fill='%232f6f86'/%3E%3Ccircle cx='650' cy='125' r='55' fill='%23fff3c4'/%3E%3C/svg%3E";

function choiceCard(choice: WeddingVendorRankedCandidate, imageUrl: string | null): WeddingVendorChoiceCardData {
  const anchorRows = weddingVendorAnchorRows(choice, WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS);
  return {
    choiceId: choice.id,
    rank: choice.rank,
    comparisonCount: rankedChoices.length,
    title: choice.title,
    imageUrl,
    imageAlt: imageUrl ? `${choice.title} waterfront reception` : null,
    scoreLabel: `${choice.fit} fit · ${choice.confidenceBucket} confidence`,
    provider: choice.provider,
    sourceUrl: choice.url,
    websiteUrl: choice.websiteUrl,
    mapUrl: choice.mapUrl,
    instagramUrl: choice.instagramUrl,
    email: choice.id === ranked.id ? "events@bondi-icebergs.example.test" : null,
    phone: choice.phone,
    address: choice.address,
    rationaleLabels: choice.rationaleLabels,
    preferenceMatch: choice.preferenceMatchLabel,
    situationFit: choice.situationFitLabel,
    verificationLabel: choice.unknownHardConstraints.join(", "),
    checkedFactsCount: choice.components.filter((component) => component.known).length,
    anchorRows,
    verifyQuestions: weddingVendorVerifyQuestions(anchorRows, choice.unknownHardConstraints),
    group: choice.group,
    availabilityState: choice.availabilityState,
    availabilityLabel: choice.availabilityLabel,
    confidenceLabel: choice.confidenceLabel,
    vendorId: choice.vendorId,
    unknownConstraints: choice.unknownHardConstraints,
    weddingPlanId: "baseline-fixture",
    qualityScoreLabel: null,
    sentimentScoreLabel: null,
    valueScoreLabel: null,
    seasonalNote: null,
    rooms: choice.rooms,
  };
}

const cards = [choiceCard(ranked, FIXTURE_PHOTO), choiceCard(runnerUp, null)];
const preview = {
  artifactId: "artifact:bondi-baseline",
  title: "Bondi vendor ranking baseline",
  sourceLinks: rankedChoices.map((choice) => ({ label: `${choice.title} source`, url: choice.url })),
  vendorComparisonCards: cards,
  vendorComparisonHandoff: handoff,
  evidenceSummary: { statusLabel: "Two source records checked", warningLabel: null },
} as WeddingWorkspaceArtifactPreview;
const decisionCard = decisionCardFromWeddingVendorComparison(preview);

function Fixture() {
  const [flow, setFlow] = createSignal<WeddingVendorOutreachFlowState | null>(null);
  const beginDraft = () => {
    const idle = weddingVendorOutreachIdleFlow({
      choiceId: cards[0]!.choiceId,
      vendorName: cards[0]!.title,
      recipientEmail: cards[0]!.email,
    });
    setFlow(weddingVendorOutreachDraftSucceeded(idle, {
      subject: "Wedding availability enquiry",
      bodyMarkdown: "Hello, could you confirm availability and send a quotation?",
      groundedOnLabels: ["your wedding is in Bondi, Sydney"],
    }));
  };
  const updateBody = (bodyMarkdown: string) => {
    const current = flow();
    if (current) setFlow(weddingVendorOutreachBodyChanged(current, bodyMarkdown));
  };
  const send = () => {
    const current = flow();
    if (current) {
      setFlow(weddingVendorOutreachSendSucceeded(current, {
        sentAtIso: "2026-10-18T02:00:00Z",
        receiptRef: "fixture-receipt-1",
        threadId: "fixture-thread-1",
      }));
    }
  };

  return (
    <main class="mx-auto min-h-screen max-w-5xl bg-wedding-surface p-3 text-wedding-text">
      <h1 class="mb-3 text-lg font-bold">Bondi vendor ranking baseline</h1>
      <DecisionCard
        card={decisionCard}
        mode="standard"
        showActions={false}
        hero={(
          <div class="grid gap-2 lg:grid-cols-3" data-testid="vendor-comparison-grid">
            <For each={cards}>{(card) => (
              <WeddingVendorChoiceCard
                card={card}
                outreachFlow={card.choiceId === cards[0]!.choiceId ? flow() : null}
                gmailConnected
                onContactVendor={beginDraft}
                onOutreachBodyChange={(_choiceId, bodyMarkdown) => updateBody(bodyMarkdown)}
                onSendOutreach={send}
                onCancelOutreach={() => setFlow(null)}
              />
            )}</For>
          </div>
        )}
      />
    </main>
  );
}

render(() => <Fixture />, document.getElementById("root")!);
