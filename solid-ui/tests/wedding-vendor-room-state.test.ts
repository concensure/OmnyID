import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWeddingVendorRooms,
  weddingVendorRoomCardRows,
  weddingVendorRoomCardRowsFromRecord,
  weddingVendorRoomCardRowsToRecords,
  weddingVendorRoomPhotoSrc,
  weddingVendorRoomsComparisonLabel,
} from "../src/lib/weddingVendorRoomState.ts";
import { normalizeWeddingVendorSourceEvidence, weddingVendorRankingCardFieldsFromRecord } from "../src/lib/weddingVendorRankingState.ts";

const serverRooms = [
  {
    room_id: "room-1",
    name: "Harvest Haven",
    pricing_label: "From $15,500 for ~100 guests",
    price_from_cents: 1_550_000,
    capacity_seated: 100,
    inclusions: ["Tables and chairs", "Cake table", "Bar", "Lighting", "Extra"],
    photo_urls: [
      "/api/public/wedding/vendor/room-photos/room-1/1",
      "javascript:alert(1)",
      "http://localhost/x.jpg",
      "https://cdn.example/barn.jpg",
    ],
  },
  { name: "  " },
  { name: "Lawn", price_from_cents: 500_000, minimum_spend_cents: -5 },
];

test("rooms keep the vendor's own price text and drop unsafe photo urls", () => {
  const rooms = normalizeWeddingVendorRooms(serverRooms);
  assert.equal(rooms?.length, 2);
  assert.deepEqual(rooms?.[0].photo_urls, [
    "/api/public/wedding/vendor/room-photos/room-1/1",
    "https://cdn.example/barn.jpg",
  ]);
  const rows = weddingVendorRoomCardRows(rooms);
  assert.equal(
    rows[0].summary,
    "From $15,500 for ~100 guests · Seats 100 · Includes Tables and chairs, Cake table, Bar, Lighting…",
  );
  assert.equal(rows[0].imageUrl, "/api/public/wedding/vendor/room-photos/room-1/1");
});

test("derived price fills in only when no label exists and negatives are ignored", () => {
  const rows = weddingVendorRoomCardRows(normalizeWeddingVendorRooms(serverRooms));
  assert.equal(rows[1].summary, "From $5,000");
  assert.equal(weddingVendorRoomCardRows(normalizeWeddingVendorRooms([{ name: "Bare" }])).at(0)?.summary, "Pricing not provided");
  assert.equal(normalizeWeddingVendorRooms([]), null);
  assert.equal(normalizeWeddingVendorRooms("nope"), null);
});

test("room rows survive the persisted card round trip", () => {
  const rows = weddingVendorRoomCardRows(normalizeWeddingVendorRooms(serverRooms));
  const restored = weddingVendorRoomCardRowsFromRecord(weddingVendorRoomCardRowsToRecords(rows));
  assert.deepEqual(restored, rows);
  assert.deepEqual(weddingVendorRankingCardFieldsFromRecord({ rooms: weddingVendorRoomCardRowsToRecords(rows) }).rooms, rows);
  assert.deepEqual(weddingVendorRankingCardFieldsFromRecord({}).rooms, []);
});

test("source evidence carries rooms only when present", () => {
  assert.equal(normalizeWeddingVendorSourceEvidence({}).rooms, undefined);
  assert.equal(normalizeWeddingVendorSourceEvidence({ rooms: serverRooms }).rooms?.length, 2);
});

test("stored photo paths resolve against the API origin and comparison text is readable", () => {
  assert.equal(
    weddingVendorRoomPhotoSrc("/api/public/wedding/vendor/room-photos/room-1/1", "https://api.omnyid.com/"),
    "https://api.omnyid.com/api/public/wedding/vendor/room-photos/room-1/1",
  );
  assert.equal(weddingVendorRoomPhotoSrc("https://cdn.example/a.jpg", "https://api.omnyid.com"), "https://cdn.example/a.jpg");
  assert.equal(weddingVendorRoomPhotoSrc(null, "https://api.omnyid.com"), null);
  assert.equal(weddingVendorRoomsComparisonLabel([]), "No room details yet");
  assert.equal(
    weddingVendorRoomsComparisonLabel([{ name: "Lawn", summary: "From $5,000", imageUrl: null }]),
    "Lawn: From $5,000",
  );
});
