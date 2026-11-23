import assert from "node:assert/strict";
import test from "node:test";

import { personaAvatarDataUrlByteLength, personaAvatarFileError } from "@/lib/personaAvatarState";

test("persona avatars accept bounded web images", () => {
  assert.equal(personaAvatarFileError({ type: "image/webp", size: 42_000 }), null);
  assert.match(personaAvatarFileError({ type: "image/svg+xml", size: 100 }) ?? "", /WebP/);
  assert.match(personaAvatarFileError({ type: "image/png", size: 9 * 1024 * 1024 }) ?? "", /8 MB/);
});

test("persona avatar data URL sizing ignores base64 padding", () => {
  assert.equal(personaAvatarDataUrlByteLength("data:image/png;base64,YQ=="), 1);
  assert.equal(personaAvatarDataUrlByteLength("data:image/png;base64,YWI="), 2);
});
