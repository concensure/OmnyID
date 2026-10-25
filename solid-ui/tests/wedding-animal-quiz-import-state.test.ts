import assert from "node:assert/strict";
import test from "node:test";

import {
  importWeddingAnimalQuizHandoff,
  readWeddingAnimalQuizHandoff,
  WEDDING_ANIMAL_QUIZ_HANDOFF_KEY,
} from "../src/lib/weddingAnimalQuizImportState.ts";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const handoff = {
  version: 1,
  created_at: "2026-10-26T00:00:00.000Z",
  expires_at: "2026-11-25T00:00:00.000Z",
  animal_title: "The Otter Couple",
  guest_range: { min: 80, max: 100 },
  budget_comfort: "$30,000–$45,000",
  location: "Sydney and surrounds",
  date_or_season: "Spring 2027",
  top_priorities: ["Photography", "Food and drink", "People"],
  atmosphere_keywords: ["lively", "natural"],
  venue_vibes: ["Garden", "Waterside"],
  values: ["family-first"],
};

test("quiz handoff rejects expired or oversized browser input", () => {
  const storage = new MemoryStorage();
  storage.setItem(WEDDING_ANIMAL_QUIZ_HANDOFF_KEY, JSON.stringify({ ...handoff, expires_at: "2026-10-25T00:00:00.000Z" }));
  assert.equal(readWeddingAnimalQuizHandoff(storage, new Date("2026-10-26T00:00:00.000Z")), null);
  storage.setItem(WEDDING_ANIMAL_QUIZ_HANDOFF_KEY, "x".repeat(12_001));
  assert.equal(readWeddingAnimalQuizHandoff(storage), null);
});

test("explicit quiz handoff becomes private AFP profile and intake events then is consumed", async () => {
  const storage = new MemoryStorage();
  storage.setItem(WEDDING_ANIMAL_QUIZ_HANDOFF_KEY, JSON.stringify(handoff));
  const saved: Array<Record<string, unknown>> = [];
  const result = await importWeddingAnimalQuizHandoff({
    storage,
    metadata: {
      template: "wedding_planning",
      weddingPlanId: "wedding_plan:test",
      responseWorkspaceId: "response_workspace:test",
      sourceResponseId: null,
      artifactKind: null,
      supertags: ["template:wedding_planning"],
      privacyScope: "private",
      approvalState: "draft",
    },
    existingPlanning: { location: "Existing location" },
    saveProjection: async (message) => {
      saved.push(message as Record<string, unknown>);
      return { message_id: `saved-${saved.length}` };
    },
    now: new Date("2026-10-26T00:00:00.000Z"),
  });
  assert.equal(result.status, "imported");
  assert.equal(saved.length, 2);
  assert.equal(saved[0]?.subtype, "wedding_preference_profile");
  assert.equal(saved[1]?.subtype, "wedding_intake_profile");
  const intake = saved[1]?.content as Record<string, unknown>;
  assert.equal(intake.location, "Existing location");
  assert.equal(intake.guest_count, "80–100");
  assert.equal(saved.every((message) => (message.metadata as Record<string, unknown>).import_source === "wedding_animal_quiz"), true);
  assert.equal(JSON.stringify(saved).includes("partner_a"), false);
  assert.equal(storage.getItem(WEDDING_ANIMAL_QUIZ_HANDOFF_KEY), null);
});
