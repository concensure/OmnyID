import test from "node:test";
import assert from "node:assert/strict";

import {
  CLAIM_NEIGHBORHOOD_PREF_KEY,
  claimNeighborhoodDebugContext,
  readClaimNeighborhoodPreferences,
  readClaimNeighborhoodSelection,
  saveClaimNeighborhoodSelection,
} from "../src/lib/claimNeighborhoodPreferenceState.ts";

const localStorageState = new Map<string, string>();

Object.assign(globalThis, {
  localStorage: {
    getItem(key: string) {
      return localStorageState.has(key) ? localStorageState.get(key)! : null;
    },
    setItem(key: string, value: string) {
      localStorageState.set(key, value);
    },
    removeItem(key: string) {
      localStorageState.delete(key);
    },
  },
});

test("readClaimNeighborhoodPreferences keeps only valid trimmed scope preference rows", () => {
  localStorageState.set(
    CLAIM_NEIGHBORHOOD_PREF_KEY,
    JSON.stringify({
      " notes ": { stance: "supports", depth: 2 },
      badStance: { stance: "unknown", depth: 2 },
      badDepth: { stance: "mentions", depth: 7 },
      blankScope: { stance: "all", depth: 1 },
      "   ": { stance: "all", depth: 1 },
      primitive: 7,
    }),
  );

  assert.deepEqual(readClaimNeighborhoodPreferences(), {
    notes: {
      preferenceScope: "notes",
      stance: "supports",
      depth: 2,
    },
    blankScope: {
      preferenceScope: "blankScope",
      stance: "all",
      depth: 1,
    },
  });
  assert.equal(
    localStorageState.get(CLAIM_NEIGHBORHOOD_PREF_KEY),
    JSON.stringify({
      notes: {
        preferenceScope: "notes",
        stance: "supports",
        depth: 2,
      },
      blankScope: {
        preferenceScope: "blankScope",
        stance: "all",
        depth: 1,
      },
    }),
  );
});

test("readClaimNeighborhoodPreferences clears unparseable persisted preferences", () => {
  localStorageState.set(CLAIM_NEIGHBORHOOD_PREF_KEY, "{bad-json");

  assert.deepEqual(readClaimNeighborhoodPreferences(), {});
  assert.equal(localStorageState.has(CLAIM_NEIGHBORHOOD_PREF_KEY), false);
});

test("readClaimNeighborhoodSelection falls back to normalized defaults", () => {
  localStorageState.set(CLAIM_NEIGHBORHOOD_PREF_KEY, JSON.stringify({}));

  assert.deepEqual(readClaimNeighborhoodSelection(" notes "), {
    preferenceScope: "notes",
    stance: "all",
    depth: 1,
  });
  assert.deepEqual(claimNeighborhoodDebugContext("notes"), {
    claim_neighborhood: {
      preferenceScope: "notes",
      stance: "all",
      depth: 1,
    },
  });
});

test("saveClaimNeighborhoodSelection rewrites storage through the normalized preference contract", () => {
  localStorageState.set(
    CLAIM_NEIGHBORHOOD_PREF_KEY,
    JSON.stringify({
      legacy: { stance: "refutes", depth: 3 },
      badDepth: { stance: "all", depth: 9 },
    }),
  );

  saveClaimNeighborhoodSelection({
    preferenceScope: " notes ",
    stance: "mentions",
    depth: 2,
  });

  assert.deepEqual(JSON.parse(localStorageState.get(CLAIM_NEIGHBORHOOD_PREF_KEY) ?? "null"), {
    legacy: {
      preferenceScope: "legacy",
      stance: "refutes",
      depth: 3,
    },
    notes: {
      preferenceScope: "notes",
      stance: "mentions",
      depth: 2,
    },
  });
});
