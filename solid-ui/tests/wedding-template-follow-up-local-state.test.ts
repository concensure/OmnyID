import assert from "node:assert/strict";
import test from "node:test";

import {
  clearWeddingTemplateFollowUpDraft,
  loadWeddingTemplateFollowUpDraft,
  saveWeddingTemplateFollowUpDraft,
  WEDDING_TEMPLATE_FOLLOW_UP_KEY_PREFIX,
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
