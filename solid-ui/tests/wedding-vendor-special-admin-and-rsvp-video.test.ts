import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("operator specials dashboard issues local QR links and compares adoption", () => {
  const panel = source("src/components/UsageAdminWeddingSpecialsPanel.tsx");
  const route = source("../src/server/wedding_vendor_special_offer_routes/admin.rs");
  assert.match(panel, /QRCode\.toDataURL/);
  assert.match(panel, /Signups attributed/);
  assert.match(panel, /Generate link \+ QR/);
  assert.match(route, /wedding_vendor_special_offer_grant_attributions/);
  assert.match(route, /wedding_vendor_special_offer_sessions/);
  assert.doesNotMatch(route, /token_digest.*json!/s);
});

test("vendor calendar keeps open, confirmed, hold and booking evidence distinct", () => {
  const flow = source("src/components/vendor/VendorSpecialManagementFlow.tsx");
  const migration = source("../postgres/migrations/0152_wedding_vendor_special_link_analytics_and_rsvp_video.sql");
  assert.match(flow, /Set calendar open/);
  assert.match(flow, /Vendor confirm date/);
  assert.match(flow, /Temporary hold · 48 hours/);
  assert.match(flow, /Confirmed booking/);
  assert.match(migration, /availability_scope IN \('calendar_open', 'vendor_confirmed'\)/);
});

test("RSVP composer validates, suggests and shares optional Loom greetings", () => {
  const panel = source("src/components/WeddingRsvpPublishingPanel.tsx");
  const guest = source("src/rsvp.tsx");
  const server = source("../src/server/wedding_rsvp_capability_routes.rs");
  assert.match(panel, /priorLoomUrls/);
  assert.match(panel, /https:\/\/www\.loom\.com\/record/);
  assert.match(guest, /Watch the couple's short video/);
  assert.match(server, /loom\.com/);
  assert.match(server, /parsed\.scheme\(\) != "https"/);
});

test("mobile vendor categories start with Venue, Photographer and See all", () => {
  const component = source("src/components/WeddingVendorSearchHomeSections.tsx");
  assert.match(component, /VENDOR_CATEGORY_CHIPS\.slice\(0, 2\)/);
  assert.match(component, /See all/);
  assert.match(component, /VENDOR_CATEGORY_CHIPS\.slice\(2\)/);
});
