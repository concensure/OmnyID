import assert from "node:assert/strict";
import test from "node:test";

import { loadWeddingHomePhotoCards, saveWeddingHomePhotoCards } from "@/lib/weddingHomePhotoCardState";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  } as Storage;
}

test("Today photo cards stay isolated by signed-in account", () => {
  const storage = memoryStorage();
  const card = { id: "photo-1", imageDataUrl: "data:image/webp;base64,AAAA", alt: "Flowers", width: 520, height: 320 };
  assert.equal(saveWeddingHomePhotoCards("couple-a", [card], storage), true);
  assert.deepEqual(loadWeddingHomePhotoCards("couple-a", storage), [card]);
  assert.deepEqual(loadWeddingHomePhotoCards("couple-b", storage), []);
  assert.equal(saveWeddingHomePhotoCards(null, [card], storage), false);
});

test("Today photo cards reject non-image payloads and clamp unsafe dimensions", () => {
  const storage = memoryStorage();
  saveWeddingHomePhotoCards("couple-a", [
    { id: "large", imageDataUrl: "data:image/jpeg;base64,AAAA", alt: "", width: 9_999, height: 2 },
    { id: "bad", imageDataUrl: "https://example.com/photo.jpg", alt: "Bad", width: 500, height: 300 },
  ], storage);
  assert.deepEqual(loadWeddingHomePhotoCards("couple-a", storage), [{
    id: "large", imageDataUrl: "data:image/jpeg;base64,AAAA", alt: "Wedding photo", width: 960, height: 180,
  }]);
});
