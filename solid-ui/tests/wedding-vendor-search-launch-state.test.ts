import assert from "node:assert/strict";
import test from "node:test";

import {
  clearWeddingVendorSearchLaunch,
  consumeWeddingVendorSearchLaunch,
  dispatchWeddingVendorSearchLaunch,
  dispatchWeddingVendorSearchLaunchResult,
  isWeddingVendorSearchIntent,
  loadWeddingVendorSearchLaunch,
  saveWeddingVendorSearchLaunch,
  WEDDING_VENDOR_SEARCH_LAUNCH_KEY,
  weddingVendorSearchEffectiveQuery,
  weddingVendorSearchEffectiveQueryState,
  weddingVendorSearchApproximateLocationFromTimezone,
  weddingVendorSearchQueryFromIntake,
  weddingAutomaticShortlistEnabled,
  weddingVendorSearchLaunchFromEvent,
  weddingVendorSearchLaunchResultFromEvent,
} from "../src/lib/weddingVendorSearchLaunchState.ts";

test("automatic shortlist kill switch defaults on and accepts explicit off values", () => {
  assert.equal(weddingAutomaticShortlistEnabled(undefined), true);
  assert.equal(weddingAutomaticShortlistEnabled("true"), true);
  assert.equal(weddingAutomaticShortlistEnabled(" FALSE "), false);
  assert.equal(weddingAutomaticShortlistEnabled("off"), false);
});

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as Storage;
}

function throwingStorage(): Storage {
  return {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  } as unknown as Storage;
}

test("isWeddingVendorSearchIntent detects concrete vendor search phrasing", () => {
  assert.equal(isWeddingVendorSearchIntent("florist in Sydney specialising in wedding"), true);
  assert.equal(isWeddingVendorSearchIntent("find wedding photographers near Surry Hills"), true);
  assert.equal(isWeddingVendorSearchIntent("compare celebrant quotes in Melbourne"), true);
});

test("isWeddingVendorSearchIntent leaves general wedding questions on normal search", () => {
  assert.equal(isWeddingVendorSearchIntent("how should I structure my wedding budget"), false);
  assert.equal(isWeddingVendorSearchIntent("write vows for the ceremony"), false);
  assert.equal(isWeddingVendorSearchIntent("what is the weather in Sydney tomorrow"), false);
});

test("save and consumeWeddingVendorSearchLaunch stores a normalized one-shot query", () => {
  const storage = memoryStorage();
  const saved = saveWeddingVendorSearchLaunch("  wedding   cake vendors in Sydney  ", {
    storage,
    nowIso: "2026-09-29T00:00:00.000Z",
  });

  assert.equal(saved?.query, "wedding cake vendors in Sydney");
  assert.equal(loadWeddingVendorSearchLaunch(storage)?.savedAt, "2026-09-29T00:00:00.000Z");

  const consumed = consumeWeddingVendorSearchLaunch(storage);

  assert.equal(consumed?.query, "wedding cake vendors in Sydney");
  assert.equal(loadWeddingVendorSearchLaunch(storage), null);
});

test("weddingVendorSearchQueryFromIntake builds a concrete query from selected intake vendors", () => {
  assert.equal(
    weddingVendorSearchQueryFromIntake({
      location: " Sydney ",
      vendorLabels: ["Florist", "Photographer", "Venue", "Cake"],
      priorities: "low budget, reliable reviews",
      atmosphere: "garden ceremony",
    }),
    "Florist, Photographer, Venue searches near Sydney for low budget, reliable reviews with garden ceremony",
  );
});

test("weddingVendorSearchQueryFromIntake biases venue searches to the venue area or approximate location", () => {
  assert.equal(
    weddingVendorSearchQueryFromIntake({
      location: "Southern Highlands",
      vendorLabels: ["Venue"],
      priorities: "low budget",
      atmosphere: "",
    }),
    "Venue near Southern Highlands for low budget",
  );

  assert.equal(
    weddingVendorSearchQueryFromIntake({
      location: "",
      approximateLocation: "Sydney, Australia",
      vendorLabels: ["Venue"],
      priorities: "",
      atmosphere: "garden ceremony",
    }),
    "Venue near Sydney, Australia with garden ceremony",
  );
});

test("weddingVendorSearchApproximateLocationFromTimezone creates coarse area labels", () => {
  assert.equal(weddingVendorSearchApproximateLocationFromTimezone("Australia/Sydney"), "Sydney, Australia");
  assert.equal(weddingVendorSearchApproximateLocationFromTimezone("Europe/London"), "London");
  assert.equal(weddingVendorSearchApproximateLocationFromTimezone(""), "");
});

test("weddingVendorSearchQueryFromIntake still searches when no vendor category was selected", () => {
  assert.equal(
    weddingVendorSearchQueryFromIntake({
      location: "Melbourne",
      vendorLabels: [],
      priorities: "",
      atmosphere: "relaxed dinner",
    }),
    "wedding vendors in Melbourne with relaxed dinner",
  );
});

test("weddingVendorSearchEffectiveQuery prefers user edits and falls back to onboarding query", () => {
  assert.equal(
    weddingVendorSearchEffectiveQuery("  florist in Sydney specialising in wedding  ", "Photographer in Sydney"),
    "florist in Sydney specialising in wedding",
  );
  assert.equal(
    weddingVendorSearchEffectiveQuery("   ", "Photographer in Sydney with garden ceremony"),
    "Photographer in Sydney with garden ceremony",
  );
  assert.equal(weddingVendorSearchEffectiveQuery("", ""), "");
});

test("weddingVendorSearchEffectiveQueryState explains the active query source", () => {
  assert.deepEqual(
    weddingVendorSearchEffectiveQueryState("  florist in Sydney  ", "Photographer in Sydney"),
    {
      query: "florist in Sydney",
      source: "manual",
      sourceLabel: "Using your edited query",
    },
  );

  assert.deepEqual(
    weddingVendorSearchEffectiveQueryState("   ", "Photographer in Sydney with garden ceremony"),
    {
      query: "Photographer in Sydney with garden ceremony",
      source: "onboarding",
      sourceLabel: "Using your onboarding answers",
    },
  );

  assert.deepEqual(weddingVendorSearchEffectiveQueryState("", ""), {
    query: "",
    source: "empty",
    sourceLabel: "No vendor search query yet",
  });
});

test("loadWeddingVendorSearchLaunch clears malformed values", () => {
  const storage = memoryStorage();
  storage.setItem(WEDDING_VENDOR_SEARCH_LAUNCH_KEY, "{bad-json");

  assert.equal(loadWeddingVendorSearchLaunch(storage), null);
  assert.equal(storage.getItem(WEDDING_VENDOR_SEARCH_LAUNCH_KEY), null);

  storage.setItem(WEDDING_VENDOR_SEARCH_LAUNCH_KEY, JSON.stringify({ source: "master_search" }));

  assert.equal(loadWeddingVendorSearchLaunch(storage), null);
  assert.equal(storage.getItem(WEDDING_VENDOR_SEARCH_LAUNCH_KEY), null);
});

test("wedding vendor search launch state tolerates unavailable storage", () => {
  const storage = throwingStorage();

  assert.equal(saveWeddingVendorSearchLaunch("wedding florist in Sydney", { storage }), null);
  assert.equal(loadWeddingVendorSearchLaunch(storage), null);
  assert.equal(consumeWeddingVendorSearchLaunch(storage), null);
  assert.doesNotThrow(() => clearWeddingVendorSearchLaunch(storage));
});

test("dispatchWeddingVendorSearchLaunch emits normalized launch details", () => {
  const target = new EventTarget() as Window;
  let captured: unknown = null;
  target.addEventListener("omnyid:wedding-vendor-search-launch", (event) => {
    captured = weddingVendorSearchLaunchFromEvent(event);
  });

  dispatchWeddingVendorSearchLaunch({
    query: "wedding venues near Sydney",
    source: "master_search",
    savedAt: "2026-09-29T00:00:00.000Z",
  }, target);

  assert.deepEqual(captured, {
    query: "wedding venues near Sydney",
    source: "master_search",
    savedAt: "2026-09-29T00:00:00.000Z",
  });
});

test("background decision launches retain their category and run intent", () => {
  const storage = memoryStorage();
  const launch = saveWeddingVendorSearchLaunch("wedding hair and makeup artists", {
    storage,
    source: "wedding_home",
    nowIso: "2026-11-06T00:00:00.000Z",
    runImmediately: true,
    background: true,
    category: "hair and makeup artists",
    sourceDecisionId: "task:beauty-timeline",
  });

  assert.deepEqual(launch, {
    query: "wedding hair and makeup artists",
    source: "wedding_home",
    savedAt: "2026-11-06T00:00:00.000Z",
    runImmediately: true,
    background: true,
    category: "hair and makeup artists",
    sourceDecisionId: "task:beauty-timeline",
  });
  assert.deepEqual(loadWeddingVendorSearchLaunch(storage), launch);
});

test("background shortlist completion is correlated to the source decision", () => {
  const target = new EventTarget() as Window;
  let captured: unknown = null;
  target.addEventListener("omnyid:wedding-vendor-search-launch-result", (event) => {
    captured = weddingVendorSearchLaunchResultFromEvent(event);
  });
  dispatchWeddingVendorSearchLaunchResult({ sourceDecisionId: "task:beauty-timeline", ok: false }, target);
  assert.deepEqual(captured, { sourceDecisionId: "task:beauty-timeline", ok: false });
});
