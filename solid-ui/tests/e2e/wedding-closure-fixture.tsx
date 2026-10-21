import { render } from "solid-js/web";
import { createSignal, Show } from "solid-js";
import "../../src/index.css";
import { WeddingVendorDeckCard } from "../../src/components/WeddingVendorDeckCard";
import type { FocusDeckItem } from "../../src/lib/mobileFocusHomeState";
import type { WeddingVendorChoiceCardData } from "../../src/components/WeddingVendorChoiceCard";

const card = (rank: number, category = "venue"): WeddingVendorChoiceCardData => ({
  choiceId: `${category}-${rank}`, rank, comparisonCount: 3, title: `${category[0]?.toUpperCase()}${category.slice(1)} ${["Harbour House", "Garden Rooms", "Park Pavilion"][rank - 1]}`,
  imageUrl: rank === 1 ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect width='800' height='600' fill='%23f4e4df'/%3E%3Cpath d='M0 500L260 250l180 170 120-100 240 180z' fill='%237a3038'/%3E%3C/svg%3E" : null,
  imageAlt: "Wedding venue", scoreLabel: `${90 - rank} fit`, provider: "Controlled fixture",
  sourceUrl: "https://example.com/source", websiteUrl: "https://example.com", mapUrl: "https://example.com/map",
  instagramUrl: null, email: "vendor@example.com", phone: null, address: "Sydney NSW",
  rationaleLabels: ["Capacity fits", "Source-backed"], preferenceMatch: "Harbour style", situationFit: "Fits the couple's stated priorities.",
  verificationLabel: "Confirm date availability and final quote.", group: "verify", availabilityState: "unknown",
  availabilityLabel: "Availability unknown", confidenceLabel: "medium confidence", vendorId: `id-${rank}`,
  unknownConstraints: ["date availability"], weddingPlanId: "plan-fixture", qualityScoreLabel: null,
  sentimentScoreLabel: null, valueScoreLabel: null, seasonalNote: null,
  checkedFactsCount: 2, anchorRows: [], verifyQuestions: ["Confirm date availability and final quote."],
  rooms: [],
});
const comparisonItem = (category: string): FocusDeckItem => ({
  id: `comparison:${category}`, kind: "vendor_comparison", sourceSurface: "wedding_vendor_comparison", title: `Sydney ${category} comparison`,
  recommendedActionLabel: "Reach out", whyNowLabel: "Three ranked choices are ready.", dueAt: null,
  evidenceLabels: ["Controlled fixture"], deferCount: 0, returnedFromLater: false, external: false,
  vendorComparison: { artifactId: `artifact-fixture:${category}`, cards: [card(1, category), card(2, category), card(3, category)] },
});

const TRIAGE_KEY = "wedding-closure-fixture:quote-triage";
const DRAFT_KEY = "wedding-closure-fixture:persisted-draft";
type Stage = "comparison" | "draft" | "receipt" | "followup" | "quote" | "deferred" | "resolved" | "blocked";

function Fixture() {
  const [stage, setStage] = createSignal<Stage>(localStorage.getItem(TRIAGE_KEY) === "deferred" ? "deferred" : "comparison");
  const [category, setCategory] = createSignal("venue");
  const [masterCategory, setMasterCategory] = createSignal("");
  const [vendorCategory, setVendorCategory] = createSignal("");
  const [contextCount, setContextCount] = createSignal(1);
  const startDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ body: "Hello, could you confirm availability and send a quote?", persisted: true }));
    setStage("draft");
  };
  const replaceComparison = (value: string) => {
    const next = value.trim().toLowerCase();
    if (!next) return;
    setCategory(next);
    setStage("comparison");
  };
  return (
    <div class="mx-auto min-h-screen max-w-5xl bg-wedding-surface p-4 text-wedding-text">
      <h1 class="mb-4 text-xl font-bold">Wedding vendor closure fixture</h1>
      <div class="mb-4 grid gap-2 rounded-2xl border border-wedding-muted bg-white p-3 sm:grid-cols-2" aria-label="Controlled category requests">
        <label class="grid gap-1 text-xs font-semibold">Master-agent category
          <input class="min-h-11 rounded-lg border border-wedding-muted px-3 text-wedding-text" value={masterCategory()} onInput={(event) => setMasterCategory(event.currentTarget.value)} />
        </label>
        <button type="button" class="min-h-11 rounded-lg border-2 border-wedding-cta bg-white px-3 font-bold text-wedding-text" onClick={() => replaceComparison(masterCategory())}>Search from master agent</button>
        <label class="grid gap-1 text-xs font-semibold">Vendor field category
          <input class="min-h-11 rounded-lg border border-wedding-muted px-3 text-wedding-text" value={vendorCategory()} onInput={(event) => setVendorCategory(event.currentTarget.value)} />
        </label>
        <button type="button" class="min-h-11 rounded-lg border-2 border-wedding-cta bg-white px-3 font-bold text-wedding-text" onClick={() => replaceComparison(vendorCategory())}>Search from vendor field</button>
      </div>
      <Show when={stage() === "comparison"}>
        <p class="mb-2 text-sm" role="status">Exactly three {category()} choices. Context artifacts: <span data-testid="context-count">{contextCount()}</span>.</p>
        <WeddingVendorDeckCard item={comparisonItem(category())} onContactVendor={startDraft} onDone={startDraft} />
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="min-h-11 rounded-lg border border-wedding-muted bg-white px-3 font-bold text-wedding-text" onClick={() => setStage("blocked")}>Simulate shortfall</button>
          <button type="button" class="min-h-11 rounded-lg border border-wedding-muted bg-white px-3 font-bold text-wedding-text" onClick={() => setContextCount(2)}>Add second context</button>
        </div>
      </Show>
      <Show when={stage() === "draft"}>
        <section class="rounded-2xl border border-wedding-muted bg-white p-4" aria-label="Persisted vendor draft">
          <h2 class="font-bold">Draft ready for Harbour House</h2>
          <p class="mt-2 text-sm">Hello, could you confirm availability and send a quote?</p>
          <p class="mt-2 text-xs text-wedding-muted" data-testid="draft-persisted">Persisted before display: {localStorage.getItem(DRAFT_KEY) ? "yes" : "no"}</p>
          <button data-testid="send-draft" class="mt-4 min-h-12 rounded-xl border-2 border-wedding-cta bg-white px-4 font-bold text-wedding-text" onClick={() => setStage("receipt")}>Send with confirmation</button>
        </section>
      </Show>
      <Show when={stage() === "receipt"}>
        <section class="rounded-2xl border border-wedding-muted bg-white p-4" role="status"><h2 class="font-bold">Enquiry sent</h2><p class="mt-2 text-sm">Follow up in five days. Provider receipt fixture-1 saved.</p><button type="button" class="mt-4 min-h-11 rounded-lg border-2 border-wedding-cta bg-white px-3 font-bold text-wedding-text" onClick={() => setStage("followup")}>Receive vendor reply</button></section>
      </Show>
      <Show when={stage() === "followup"}>
        <section class="rounded-2xl border border-wedding-muted bg-white p-4"><p class="inline-flex rounded-full border border-wedding-accent bg-wedding-surface-blush px-2 py-1 text-xs font-bold text-wedding-text">Needs your response</p><h2 class="mt-3 font-bold">Vendor replied with a quote</h2><button type="button" class="mt-4 min-h-11 rounded-lg border-2 border-wedding-accent bg-white px-3 font-bold text-wedding-text" onClick={() => setStage("quote")}>Open quote decision</button></section>
      </Show>
      <Show when={stage() === "quote"}>
        <section class="rounded-2xl border border-wedding-muted bg-white p-4" aria-label="DecisionOS quote item"><h2 class="font-bold">Review Harbour House quote</h2><p class="mt-2 text-sm">A$35,700 indicative comparison; verify the attached vendor quote.</p><button type="button" class="mt-4 min-h-11 rounded-lg border-2 border-wedding-cta bg-white px-3 font-bold text-wedding-text" onClick={() => { localStorage.setItem(TRIAGE_KEY, "deferred"); setStage("deferred"); }}>Defer until later</button></section>
      </Show>
      <Show when={stage() === "deferred"}>
        <section class="rounded-2xl border border-wedding-muted bg-white p-4" aria-label="Deferred DecisionOS item"><h2 class="font-bold">Quote deferred</h2><p class="mt-2 text-sm">The durable triage projection kept this item deferred across reload.</p><button type="button" class="mt-4 min-h-11 rounded-lg border-2 border-wedding-cta bg-white px-3 font-bold text-wedding-text" onClick={() => { localStorage.removeItem(TRIAGE_KEY); setStage("resolved"); }}>Resolve quote</button></section>
      </Show>
      <Show when={stage() === "resolved"}>
        <section class="rounded-2xl border border-wedding-muted bg-white p-4" role="status"><h2 class="font-bold">Quote resolved</h2><p class="mt-2 text-sm">Resolution saved without rewriting the quote history.</p></section>
      </Show>
      <Show when={stage() === "blocked"}>
        <section class="rounded-2xl border border-wedding-muted bg-white p-4" role="alert"><h2 class="font-bold">Only two suitable choices found</h2><p class="mt-2 text-sm">The shortlist is blocked instead of padding the comparison.</p><button type="button" class="mt-4 min-h-11 rounded-lg border-2 border-wedding-cta bg-white px-3 font-bold text-wedding-text" onClick={() => setStage("comparison")}>Retry directory and online</button></section>
      </Show>
    </div>
  );
}
render(() => <Fixture />, document.getElementById("root")!);
