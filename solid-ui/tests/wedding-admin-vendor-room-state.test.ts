import test from "node:test";
import assert from "node:assert/strict";
import {
  adminWeddingVendorRoomDraftFromRoom,
  buildAdminWeddingVendorRoomPayload,
  emptyAdminWeddingVendorRoomDraft,
  normalizeAdminWeddingVendorRooms,
} from "../src/lib/adminWeddingVendorRoomState.ts";

const serverRoom = {
  room_id: "room-1",
  room_name: "Harvest Haven",
  sort_order: 2,
  pricing_label: "From $15,500 for ~100 guests",
  price_from_cents: 1_550_000,
  inclusions: ["Tables", " "],
  photos: [
    { slot: 1, stored: true },
    { slot: 2, photo_url: "https://cdn.example/barn.jpg", stored: false },
  ],
};

test("admin rooms map stored photos to the public route and never expose storage keys", () => {
  const [room] = normalizeAdminWeddingVendorRooms([serverRoom, { room_name: "no id" }]);
  assert.equal(room.photos[0].photoUrl, "/api/public/wedding/vendor/room-photos/room-1/1");
  assert.equal(room.photos[0].stored, true);
  assert.equal(room.photos[1].photoUrl, "https://cdn.example/barn.jpg");
  assert.deepEqual(room.inclusions, ["Tables"]);
  assert.equal(normalizeAdminWeddingVendorRooms(undefined).length, 0);
});

test("an edited room round-trips without losing order, prices or stored photos", () => {
  const [room] = normalizeAdminWeddingVendorRooms([serverRoom]);
  const { payload } = buildAdminWeddingVendorRoomPayload(adminWeddingVendorRoomDraftFromRoom(room));
  assert.equal(payload?.sort_order, 2);
  assert.equal(payload?.price_from_cents, 1_550_000);
  assert.equal(payload?.pricing_label, "From $15,500 for ~100 guests");
  assert.deepEqual(payload?.inclusions, ["Tables"]);
  assert.equal("photos" in (payload ?? {}), false, "untouched photo slots must not be re-sent");
});

test("room payload validates the name and numbers and only sends photos that were typed", () => {
  const bad = { ...emptyAdminWeddingVendorRoomDraft(), capacitySeated: "-3", priceFrom: "abc" };
  const rejected = buildAdminWeddingVendorRoomPayload(bad);
  assert.equal(rejected.payload, null);
  assert.equal(rejected.errors.length, 3);

  const good = {
    ...emptyAdminWeddingVendorRoomDraft(),
    roomName: " Lawn ",
    priceFrom: "$5,000.50",
    photoUrls: ["", " https://cdn.example/lawn.jpg ", ""] as [string, string, string],
  };
  const { payload } = buildAdminWeddingVendorRoomPayload(good);
  assert.equal(payload?.room_name, "Lawn");
  assert.equal(payload?.price_from_cents, 500_050);
  assert.deepEqual(payload?.photos, [{ slot: 2, photo_url: "https://cdn.example/lawn.jpg" }]);
});
