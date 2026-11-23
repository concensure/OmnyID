import assert from "node:assert/strict";
import test from "node:test";

import { tileThumbnailUrl } from "../src/lib/tileImageUrl.ts";

test("tileThumbnailUrl adds a width hint to internal attachment paths", () => {
  assert.equal(
    tileThumbnailUrl("/attachments/file-123?token=abc"),
    "/attachments/file-123?token=abc&w=400",
  );
});

test("tileThumbnailUrl preserves existing width hints", () => {
  assert.equal(
    tileThumbnailUrl("/api/files/upload-preview?id=1&w=800"),
    "/api/files/upload-preview?id=1&w=800",
  );
});

test("tileThumbnailUrl leaves external urls unchanged", () => {
  assert.equal(
    tileThumbnailUrl("https://example.com/image.jpg"),
    "https://example.com/image.jpg",
  );
});

test("tileThumbnailUrl leaves data urls unchanged", () => {
  assert.equal(
    tileThumbnailUrl("data:image/png;base64,abc123"),
    "data:image/png;base64,abc123",
  );
});
