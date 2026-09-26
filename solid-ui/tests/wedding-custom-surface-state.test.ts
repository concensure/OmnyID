import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeWeddingCustomSurfaceItem,
  weddingCustomSurfaceItemToAfpMessage,
  weddingCustomSurfaceItemToAfpSendInput,
  type WeddingCustomSurfaceItem,
} from "@/lib/weddingCustomSurfaceState";

const metadata = {
  weddingPlanId: "wedding_plan:custom_surface",
  responseWorkspaceId: "response_workspace:custom_surface",
  sourceResponseId: "response:custom_surface",
  supertags: ["template:wedding_planning", "event:wedding"],
};

const item: WeddingCustomSurfaceItem = {
  id: "custom-item-1",
  menu: "budget",
  kind: "text",
  title: "Ask venue about service fee",
  body: "Check whether the quote includes GST, service charge, and overtime.",
  imageUrl: null,
  storageRef: null,
  order: 2,
  createdAt: "2026-09-26T00:00:00.000Z",
  updatedAt: "2026-09-26T00:05:00.000Z",
};

test("weddingCustomSurfaceItemToAfpMessage creates a private A2UI ledger object", () => {
  const message = weddingCustomSurfaceItemToAfpMessage({
    item,
    metadata,
    action: "upsert",
    createdAt: "2026-09-26T00:10:00.000Z",
  });

  assert.equal(message.type, "ledger");
  assert.equal(message.kind, "wedding_custom_surface_item");
  assert.equal(message.subtype, "wedding_custom_surface_item");
  assert.ok(message.supertags?.includes("wedding_custom_surface"));
  assert.ok(message.supertags?.includes("wedding_workspace_menu:budget"));
  assert.equal(message.metadata?.e2ee_required, true);
  assert.equal(message.metadata?.wedding_workspace_menu, "budget");
  assert.ok(message.references?.some((reference) => reference.type === "wedding_workspace_menu" && reference.target === "budget"));
  assert.ok(message.views?.some((view) => (view as Record<string, unknown>).format === "a2ui"));
});

test("weddingCustomSurfaceItemToAfpMessage keeps browser-only image data out of AFP", () => {
  const imageItem: WeddingCustomSurfaceItem = {
    ...item,
    id: "custom-image-1",
    kind: "image",
    title: "Table inspiration",
    body: "",
    imageUrl: "data:image/png;base64,very-large-browser-preview",
  };
  const message = weddingCustomSurfaceItemToAfpMessage({ item: imageItem, metadata });
  const content = message.content as Record<string, unknown>;
  const contentItem = content.item as Record<string, unknown>;

  assert.equal(contentItem.image_url, null);
  assert.equal(contentItem.image_upload_needed, true);
  assert.equal(JSON.stringify(message).includes("very-large-browser-preview"), false);
});

test("weddingCustomSurfaceItemToAfpSendInput is ready for projection saving", () => {
  const input = weddingCustomSurfaceItemToAfpSendInput({ item, metadata, action: "reorder" });

  assert.equal(input.store_in_relational, true);
  assert.equal(input.kind, "wedding_custom_surface_item");
  assert.equal(input.metadata?.custom_surface_action, "reorder");
});

test("normalizeWeddingCustomSurfaceItem accepts older local drafts and fills timestamps", () => {
  const parsed = normalizeWeddingCustomSurfaceItem({
    id: "legacy-local-item",
    menu: "inspiration",
    kind: "image",
    title: "Dress idea",
    imageUrl: "https://example.test/dress.jpg",
  }, 4);

  assert.equal(parsed?.menu, "inspiration");
  assert.equal(parsed?.order, 4);
  assert.equal(parsed?.imageUrl, "https://example.test/dress.jpg");
  assert.ok(parsed?.createdAt);
});
