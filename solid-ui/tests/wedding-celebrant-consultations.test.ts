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
  assert.match(panel, /Wedding-date availability is managed separately/);
  assert.match(panel, /resource\.error \? undefined : resource\(\)/);
  assert.match(panel, /Phone consultations are not open yet/);
  assert.match(panel, /Register check/);
  assert.match(panel, /Go live/);
  assert.match(panel, /Both calendars were updated and the couple was emailed/);
  assert.match(panel, /One-off date/);
  assert.match(panel, /Propose new time/);
});

test("ranked celebrants expose a vendor-scoped slot-first enquiry and preserve approval boundaries", async () => {
  const [panel, detail, card, outreach, ranking, management, migration] = await Promise.all([
    read("solid-ui/src/components/WeddingCelebrantConsultationShortlistPanel.tsx"),
    read("solid-ui/src/components/WeddingArtifactDetailPanel.tsx"),
    read("solid-ui/src/components/WeddingVendorChoiceCard.tsx"),
    read("solid-ui/src/lib/useWeddingVendorOutreachOwner.ts"),
    read("solid-ui/src/lib/weddingVendorRankingState.ts"),
    read("solid-ui/src/components/vendor/CelebrantManagementFlow.tsx"),
    read("postgres/migrations/0174_wedding_celebrant_consultation_approval.sql"),
  ]);
  assert.match(detail, /vendorComparisonCards\.slice\(0, 3\)/);
  assert.match(panel, /vendor_slug=/);
  assert.match(panel, /available_slots/);
  assert.match(panel, /requestedVendorSlug/);
  assert.match(panel, /Confirm this time and prepare draft/);
  assert.match(panel, /onPrepareDraft/);
  assert.match(card, /onRevealCelebrantConsultation/);
  assert.match(detail, /ranked-celebrant-consultation/);
  assert.match(outreach, /withWeddingCelebrantConsultationContext/);
  assert.match(outreach, /forceRegeneration \|\| Boolean\(consultationContext\)/);
  assert.match(panel, /Wedding-date availability:/);
  assert.match(panel, /verify\/start/);
  assert.match(panel, /Verify and request this time/);
  assert.match(panel, /Awaiting celebrant approval/);
  assert.match(panel, /pollRequestStatus/);
  assert.match(panel, /Consultation approved/);
  assert.match(ranking, /vendorSlug/);
  assert.match(management, /Sign in to review and approve requests/);
  assert.match(management, /auth=register&source=vendor_claim&vendor_slug=/);
  assert.match(management, /request_summary/);
  assert.match(management, /date_slot_upsert/);
  assert.match(management, /Wedding-date availability/);
  assert.doesNotMatch(management, /current\.requests|requester_name/);
  assert.match(management, /cannot open couple details, messages, phone numbers or another listing/);
  assert.match(migration, /requester_user_id/);
  assert.match(migration, /confirmation_email_status/);
});

test("celebrant consultation draft names the selected time and persists scoped provenance", async () => {
  const [state, afp] = await Promise.all([
    import("../src/lib/weddingCelebrantConsultationDraftState.ts"),
    read("solid-ui/src/lib/weddingVendorOutreachAfpState.ts"),
  ]);
  const context = {
    vendorSlug: "celebrant-simple-ceremonies",
    scheduledStart: "2026-11-19T07:30:00.000Z",
    timezone: "Australia/Sydney" as const,
    consultationMinutes: 10 as const,
  };
  const body = state.withWeddingCelebrantConsultationContext("Hello", context);
  assert.match(body, /10-minute phone consultation/);
  assert.match(body, /19 November 2026/);
  assert.match(afp, /celebrant_consultation_vendor_slug/);
  assert.match(afp, /celebrant_consultation_scheduled_start/);
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
