import assert from "node:assert/strict";
import test from "node:test";

import {
  clearWeddingTemplateFollowUpDraft,
  loadWeddingTemplateFollowUpDraft,
  mergeWeddingTemplateFollowUpDraftWithApprovedContext,
  saveWeddingTemplateFollowUpDraft,
  WEDDING_TEMPLATE_FOLLOW_UP_KEY_PREFIX,
  weddingTemplateFollowUpDraftFromPlanningContext,
} from "@/lib/weddingTemplateFollowUpLocalState";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
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

test("wedding follow-up local state saves normalized draft answers per workspace", () => {
  const storage = memoryStorage();
  const saved = saveWeddingTemplateFollowUpDraft({
    responseWorkspaceId: " response_workspace:harbour ",
    dateOrSeason: " October 2027 ",
    location: " Sydney NSW ",
    guestCount: " 80 ",
    budgetComfort: " Keep it lean ",
    prioritiesCsv: " food, photos ",
    atmosphereDescription: " Relaxed garden dinner ",
    inspirationImageUrlsText: " https://example.com/wedding.jpg\nhttps://example.com/table.jpg ",
    coupleNames: " Alex and Sam ",
    vendorCategoryIds: [" Venue ", "photographer", "bad"],
    vowPreference: "create",
    vowStyle: "warm_personal",
    relationshipFactsCsv: " Met at uni \n First trip was Tasmania ",
    vowChecklistCsv: " Keep under two minutes ",
    noimDownloaded: "no",
    celebrantPath: "need_options",
    requested: true,
    nowIso: "2026-09-12T00:00:00.000Z",
  }, storage);
  const loaded = loadWeddingTemplateFollowUpDraft("response_workspace:harbour", storage);

  assert.equal(saved?.location, "Sydney NSW");
  assert.equal(loaded?.dateOrSeason, "October 2027");
  assert.equal(loaded?.noimDownloaded, "no");
  assert.equal(loaded?.coupleNames, "Alex and Sam");
  assert.equal(loaded?.atmosphereDescription, "Relaxed garden dinner");
  assert.equal(loaded?.inspirationImageUrlsText, "https://example.com/wedding.jpg\nhttps://example.com/table.jpg");
  assert.deepEqual(loaded?.vendorCategoryIds, ["venue", "photographer"]);
  assert.equal(loaded?.vowPreference, "create");
  assert.equal(loaded?.vowStyle, "warm_personal");
  assert.equal(loaded?.relationshipFactsCsv, "Met at uni \n First trip was Tasmania");
  assert.equal(loaded?.vowChecklistCsv, "Keep under two minutes");
  assert.equal(loaded?.requested, true);
  assert.equal(loaded?.savedAt, "2026-09-12T00:00:00.000Z");
});

test("wedding follow-up local state isolates response workspaces", () => {
  const storage = memoryStorage();
  saveWeddingTemplateFollowUpDraft({ responseWorkspaceId: "response_workspace:a", location: "Sydney" }, storage);
  saveWeddingTemplateFollowUpDraft({ responseWorkspaceId: "response_workspace:b", location: "Melbourne" }, storage);

  assert.equal(loadWeddingTemplateFollowUpDraft("response_workspace:a", storage)?.location, "Sydney");
  assert.equal(loadWeddingTemplateFollowUpDraft("response_workspace:b", storage)?.location, "Melbourne");
});

test("wedding follow-up draft can hydrate from approved planning context", () => {
  const draft = weddingTemplateFollowUpDraftFromPlanningContext("response_workspace:harbour", {
    dateOrSeason: "October 2027",
    location: "Sydney NSW",
    guestCount: 80,
    budgetComfort: "Keep it lean",
    topPriorities: ["food", "photos"],
    atmosphereDescription: "Relaxed garden dinner",
    inspirationImageUrls: ["https://example.com/wedding.jpg", "https://example.com/table.jpg"],
    familyOrStakeholderRoles: "Alex and Sam",
    vendorCategories: ["venue", "photographer"],
    vowPreference: "create",
    vowStyle: "warm_personal",
    relationshipFactLabels: ["Met at uni", "First trip was Tasmania"],
    vowChecklistItems: ["Keep under two minutes"],
    noimDownloaded: false,
    celebrantPath: "need_options",
  }, {
    nowIso: "2026-09-29T00:00:00.000Z",
  });

  assert.equal(draft.dateOrSeason, "October 2027");
  assert.equal(draft.location, "Sydney NSW");
  assert.equal(draft.guestCount, "80");
  assert.equal(draft.prioritiesCsv, "food, photos");
  assert.equal(draft.inspirationImageUrlsText, "https://example.com/wedding.jpg\nhttps://example.com/table.jpg");
  assert.deepEqual(draft.vendorCategoryIds, ["venue", "photographer"]);
  assert.equal(draft.noimDownloaded, "no");
  assert.equal(draft.requested, true);
  assert.equal(draft.savedAt, "2026-09-29T00:00:00.000Z");
});

test("approved wedding planning context overrides stale local draft answers", () => {
  const current = weddingTemplateFollowUpDraftFromPlanningContext("response_workspace:harbour", {
    dateOrSeason: "June 2027",
    location: "Melbourne VIC",
    guestCount: 120,
    budgetComfort: "Luxury is fine",
    topPriorities: ["drama"],
    atmosphereDescription: "Black tie ballroom",
    inspirationImageUrls: ["https://example.com/old.jpg"],
    vendorCategories: ["venue"],
    noimDownloaded: "unknown",
  }, {
    nowIso: "2026-09-01T00:00:00.000Z",
    requested: false,
  });
  const approved = weddingTemplateFollowUpDraftFromPlanningContext("response_workspace:harbour", {
    dateOrSeason: "October 2027",
    location: "Sydney NSW",
    guestCount: 80,
    budgetComfort: "Keep it lean",
    topPriorities: ["food", "photos"],
    atmosphereDescription: "Relaxed garden dinner",
    inspirationImageUrls: ["https://example.com/wedding.jpg"],
    vendorCategories: ["photographer", "floral_designer"],
    noimDownloaded: false,
  }, {
    nowIso: "2026-09-29T00:00:00.000Z",
  });

  const merged = mergeWeddingTemplateFollowUpDraftWithApprovedContext({ current, approved });

  assert.equal(merged.dateOrSeason, "October 2027");
  assert.equal(merged.location, "Sydney NSW");
  assert.equal(merged.guestCount, "80");
  assert.equal(merged.budgetComfort, "Keep it lean");
  assert.equal(merged.prioritiesCsv, "food, photos");
  assert.equal(merged.atmosphereDescription, "Relaxed garden dinner");
  assert.equal(merged.inspirationImageUrlsText, "https://example.com/wedding.jpg");
  assert.deepEqual(merged.vendorCategoryIds, ["photographer", "floral_designer"]);
  assert.equal(merged.noimDownloaded, "no");
  assert.equal(merged.requested, true);
});

test("approved wedding planning context preserves local fields when approval has no answer", () => {
  const current = weddingTemplateFollowUpDraftFromPlanningContext("response_workspace:harbour", {
    dateOrSeason: "October 2027",
    location: "Sydney NSW",
    vendorCategories: ["venue"],
    vowStyle: "warm_personal",
    relationshipFactLabels: ["Met at uni"],
  }, {
    nowIso: "2026-09-01T00:00:00.000Z",
  });
  const approved = weddingTemplateFollowUpDraftFromPlanningContext("response_workspace:harbour", {
    location: "Sydney NSW",
  }, {
    nowIso: "2026-09-29T00:00:00.000Z",
  });

  const merged = mergeWeddingTemplateFollowUpDraftWithApprovedContext({ current, approved });

  assert.equal(merged.dateOrSeason, "October 2027");
  assert.equal(merged.location, "Sydney NSW");
  assert.deepEqual(merged.vendorCategoryIds, ["venue"]);
  assert.equal(merged.vowStyle, "warm_personal");
  assert.equal(merged.relationshipFactsCsv, "Met at uni");
});

test("wedding follow-up local state removes malformed drafts", () => {
  const storage = memoryStorage();
  const key = `${WEDDING_TEMPLATE_FOLLOW_UP_KEY_PREFIX}:response_workspace:bad`;
  storage.setItem(key, "{bad-json");

  assert.equal(loadWeddingTemplateFollowUpDraft("response_workspace:bad", storage), null);
  assert.equal(storage.getItem(key), null);
});

test("wedding follow-up local state clears drafts and tolerates unavailable storage", () => {
  const storage = memoryStorage();
  saveWeddingTemplateFollowUpDraft({ responseWorkspaceId: "response_workspace:clear", location: "Sydney" }, storage);

  clearWeddingTemplateFollowUpDraft("response_workspace:clear", storage);

  assert.equal(loadWeddingTemplateFollowUpDraft("response_workspace:clear", storage), null);
  assert.equal(saveWeddingTemplateFollowUpDraft({ responseWorkspaceId: "response_workspace:x" }, throwingStorage()), null);
  assert.equal(loadWeddingTemplateFollowUpDraft("response_workspace:x", throwingStorage()), null);
  assert.doesNotThrow(() => clearWeddingTemplateFollowUpDraft("response_workspace:x", throwingStorage()));
});
