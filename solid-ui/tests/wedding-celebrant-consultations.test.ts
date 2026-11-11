import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");

test("public celebrant calls are false-default and do not expose phone data in events", async () => {
  const [routes, migration] = await Promise.all([
    read("src/server/wedding_celebrant_consultation_routes.rs"),
    read("postgres/migrations/0158_wedding_celebrant_consultations.sql"),
  ]);
  assert.match(routes, /OMNYID_CELEBRANT_CONSULTATIONS_ENABLED/);
  assert.match(routes, /OMNYID_TWILIO_VERIFY_SERVICE_SID/);
  assert.match(routes, /encrypt_secret/);
  assert.match(routes, /phone_hash,provider_ref,phone_ciphertext/);
  assert.match(routes, /status='accepted'/);
  const events = migration.split("wedding_celebrant_consultation_events")[1] ?? "";
  assert.doesNotMatch(events, /verification_code|phone_ciphertext/);
});

test("vendor portal separates wedding dates from phone consultations", async () => {
  const [dashboard, panel] = await Promise.all([
    read("solid-ui/src/components/vendor/VendorProfileDashboard.tsx"),
    read("solid-ui/src/components/vendor/VendorCelebrantConsultationsPanel.tsx"),
  ]);
  assert.match(dashboard, /VendorSpecialOffersPanel/);
  assert.match(dashboard, /VendorCelebrantConsultationsPanel/);
  assert.match(dashboard, /category\.toLowerCase\(\)\.includes\("celebrant"\)/);
  assert.match(panel, /Wedding-date availability stays in Wedding dates above/);
  assert.match(panel, /Register check/);
  assert.match(panel, /Go live/);
  assert.match(panel, /Callback accepted/);
  assert.match(panel, /One-off date/);
  assert.match(panel, /Propose new time/);
});

test("public page remains useful without a live celebrant or an account", async () => {
  const [page, script] = await Promise.all([
    read("wedding/talk-to-a-celebrant.html"),
    read("wedding/assets/js/celebrant-consultations.js"),
  ]);
  assert.match(page, /A phone-consultation time is not confirmation/);
  assert.match(page, /Request a callback/);
  assert.match(page, /Send verification code/);
  assert.match(page, /id="startPhoneVerification"/);
  assert.match(script, /No consultation times are published yet/);
  assert.match(script, /openForm\(preferred\.vendor_slug/);
  assert.match(script, /First available celebrant/);
  assert.match(script, /celebrant-consultations\/verify\/start/);
  assert.match(script, /acceptRescheduleButton/);
  assert.match(script, /askWeddingDateLink/);
  assert.doesNotMatch(page, /You must create an account/);
});
