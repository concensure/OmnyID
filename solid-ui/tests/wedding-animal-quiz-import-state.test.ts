import assert from "node:assert/strict";
import test from "node:test";

import {
  importWeddingAnimalQuizHandoff,
  readWeddingAnimalQuizHandoff,
  WEDDING_ANIMAL_QUIZ_BRIEF_KEY,
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
  budget_stretch: "$45,000–$60,000",
  location: "Sydney and surrounds",
  date_or_season: "Spring 2027",
  top_priorities: ["Photography", "Food and drink", "People"],
  atmosphere_keywords: ["lively", "natural"],
  venue_vibes: ["Garden", "Waterside"],
  values: ["family-first"],
  deal_breakers: ["Going into debt"],
  family_involvement: "Family co-hosts",
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
  assert.equal(saved.length, 3);
  assert.equal(saved[0]?.subtype, "wedding_preference_profile");
  assert.equal(saved[1]?.subtype, "wedding_intake_profile");
  assert.equal(saved[2]?.subtype, "wedding_deal_breaker");
  const intake = saved[1]?.content as Record<string, unknown>;
  assert.equal(intake.location, "Existing location");
  assert.equal(intake.guest_count, "80–100");
  assert.equal(intake.budget_comfort, "$30,000–$45,000; stretch $45,000–$60,000");
  assert.equal((saved[2]?.content as Record<string, unknown>).label, "Going into debt");
  assert.equal(saved.every((message) => (message.metadata as Record<string, unknown>).import_source === "wedding_animal_quiz"), true);
  assert.equal(JSON.stringify(saved).includes("partner_a"), false);
  assert.equal(storage.getItem(WEDDING_ANIMAL_QUIZ_HANDOFF_KEY), null);
});

test("legacy couple brief is reduced to bounded planning facts without raw answers or names", async () => {
  const storage = new MemoryStorage();
  storage.setItem(WEDDING_ANIMAL_QUIZ_BRIEF_KEY, JSON.stringify({
    schema: "omnyid.wedding.couple_brief",
    version: 1,
    source: "wedding_animal_quiz",
    created_at: "2026-10-26T00:00:00.000Z",
    couple: { nicknames: ["Private A", "Private B"], animal: { title: "The Otter Couple" } },
    budget: { comfort: { label: "$30k – $50k" }, stretch: { label: "$50k – $80k" } },
    guests: { range: { min: 60, max: 100 } },
    location: { region_label: "Sydney", venue_vibe_labels: ["A garden or lawn"] },
    timeframe: { label: "12–18 months" },
    style: { keywords: ["warm", "lively"] },
    priorities: { top3: ["food", "photos", "people"] },
    values: ["family-first"],
    dealbreakers: ["stress"],
    family_involvement: "cohost",
    raw: { partner_a: "secret-encoded-answers", partner_b: "also-secret" },
  }));
  const parsed = readWeddingAnimalQuizHandoff(storage, new Date("2026-10-29T00:00:00.000Z"));
  assert.deepEqual(parsed?.top_priorities, ["Food & drink", "Photos & video", "Everyone there & comfortable"]);
  assert.deepEqual(parsed?.deal_breakers, ["Planning stress"]);
  assert.equal(parsed?.family_involvement, "Family co-hosts");
  assert.equal(JSON.stringify(parsed).includes("Private A"), false);
  assert.equal(JSON.stringify(parsed).includes("secret-encoded-answers"), false);
});

test("failed AFP import retains the browser handoff and retries use stable logical ids", async () => {
  const storage = new MemoryStorage();
  storage.setItem(WEDDING_ANIMAL_QUIZ_HANDOFF_KEY, JSON.stringify(handoff));
  const ids: string[] = [];
  await assert.rejects(importWeddingAnimalQuizHandoff({
    storage,
    metadata: {
      template: "wedding_planning", weddingPlanId: "wedding_plan:test",
      responseWorkspaceId: "response_workspace:test", sourceResponseId: null,
      artifactKind: null, supertags: ["template:wedding_planning"], privacyScope: "private", approvalState: "draft",
    },
    existingPlanning: {},
    saveProjection: async (message) => {
      ids.push(message.id ?? "");
      if (message.subtype === "wedding_intake_profile") throw new Error("offline");
      return { message_id: message.id };
    },
    now: new Date("2026-10-26T00:00:00.000Z"),
  }));
  assert.ok(storage.getItem(WEDDING_ANIMAL_QUIZ_HANDOFF_KEY));
  assert.equal(ids.every(Boolean), true);
  assert.equal(new Set(ids).size, ids.length);
});
