import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const scope = {
  capability_id: "rsvp-capability-browser-test",
  household_id: "household:rivera",
  host_label: "Alex and Taylor",
  event_id: "event:wedding-day",
  event_label: "Wedding day",
  response_deadline: "2027-10-01",
  event_date: "2027-11-15",
  event_local_time: "16:30",
  event_time_zone: "Australia/Sydney",
  venue_name: "Garden Room",
  venue_address: "1 Harbour Street, Sydney NSW",
  encryption_key_id: "wedding-rsvp-browser-test",
  encryption_public_key_hex: "11".repeat(32),
  expires_at: "2027-10-02T00:00:00Z",
  questions: [
    { id: "attendance", label: "Attendance", required: true, sensitive: false, options: [] },
    { id: "meal_choice", label: "Meal choice", required: true, sensitive: false, options: ["Chicken", "Vegetarian"] },
    { id: "dietary_requirements", label: "Dietary or allergy requirements", required: false, sensitive: true, options: [] },
  ],
  invitations: [
    { invitation_id: "invite:alex", person_id: "person:alex", event_id: "event:wedding-day", display_name: "Alex Rivera", invitation_status: "invited", response_revision: 1, plus_one_allowed: true, children_invited: false },
    { invitation_id: "invite:sam", person_id: "person:sam", event_id: "event:wedding-day", display_name: "Sam Rivera", invitation_status: "invited", response_revision: 1, plus_one_allowed: false, children_invited: true },
  ],
  latest_responses: [],
};

async function mockRsvp(page: Page, delay = 0) {
  await page.route("**/wedding/rsvp/capabilities/open", async (route) => {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    await route.fulfill({ json: scope });
  });
  await page.route("**/wedding/rsvp/capabilities/respond", async (route) => {
    const body = route.request().postDataJSON() as { attendance: string; answers: Record<string, string> };
    expect(["attending", "not_attending"]).toContain(body.attendance);
    if (body.attendance === "not_attending") expect(body.answers).toEqual({});
    await route.fulfill({ json: { replayed: false, explanation: "Saved", response: { revision: 2, responded_at: "2027-09-02T03:04:05Z" }, impact_receipt: { effects: ["guest_attendance_updated"] } } });
  });
}

for (const viewport of [{ width: 320, height: 720 }, { width: 375, height: 812 }, { width: 1280, height: 800 }]) {
  test(`public RSVP is mobile-safe and submits named per-person answers at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockRsvp(page);
    await page.goto("/workspace/rsvp.html#browser-test-token", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/workspace\/rsvp\.html$/);
    await expect(page.getByRole("heading", { name: "RSVP for Wedding day" })).toBeVisible();
    await page.getByRole("button", { name: "Everyone is attending" }).click();
    const meals = page.getByLabel(/Meal choice/);
    await expect(meals).toHaveCount(2);
    await meals.nth(0).selectOption("Vegetarian");
    await meals.nth(1).selectOption("Chicken");
    await page.getByRole("button", { name: "Review RSVP" }).click();
    await expect(page.getByRole("heading", { name: "Review before sending" })).toBeFocused();
    await page.getByRole("button", { name: "Submit RSVP" }).click();
    await expect(page.getByRole("heading", { name: "Your RSVP confirmation" })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
  });
}

test("declining skips attendee questions and validation restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockRsvp(page);
  await page.goto("/workspace/rsvp.html#browser-test-token", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Review RSVP" }).click();
  await expect(page.getByRole("alert")).toContainText("Choose whether Alex Rivera is attending");
  await expect(page.locator("#attendance-invite\\:alex")).toBeFocused();
  await page.getByRole("button", { name: "No one can attend" }).click();
  await expect(page.getByLabel(/Meal choice/)).toHaveCount(0);
  await page.getByRole("button", { name: "Review RSVP" }).click();
  await page.getByRole("button", { name: "Submit RSVP" }).click();
  await expect(page.getByRole("heading", { name: "Your RSVP confirmation" })).toBeVisible();
});

test("returning link shows the latest guest-safe confirmation and keeps private plaintext hidden", async ({ page }) => {
  await page.route("**/wedding/rsvp/capabilities/open", (route) => route.fulfill({ json: {
    ...scope,
    latest_responses: [{ invitation_id: "invite:alex", person_id: "person:alex", event_id: "event:wedding-day", attendance: "attending", answers: { meal_choice: "Vegetarian" }, private_answer_question_ids: ["dietary_requirements"], has_private_answers: true, revision: 2, submitted_at: "2027-09-02T03:04:05Z", complete: true }],
  } }));
  await page.goto("/workspace/rsvp.html#returning-token", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Your RSVP confirmation" })).toBeVisible();
  await expect(page.getByText("Vegetarian")).toBeVisible();
  await expect(page.getByText("Private detail saved")).toBeVisible();
  await expect(page.getByText("No response saved yet")).toBeVisible();
  await expect(page.getByText(/encrypted:v1|must never/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Edit RSVP" }).click();
  await expect(page.getByText(/private details are saved/i)).toBeVisible();
  await expect(page.getByLabel(/Meal choice/).first()).toHaveValue("Vegetarian");
});

test("editing one named guest appends only that response and preserves unchanged household members", async ({ page }) => {
  const submitted: string[] = [];
  await page.route("**/wedding/rsvp/capabilities/open", (route) => route.fulfill({ json: {
    ...scope,
    latest_responses: [
      { invitation_id: "invite:alex", person_id: "person:alex", event_id: "event:wedding-day", attendance: "attending", answers: { meal_choice: "Vegetarian" }, private_answer_question_ids: ["dietary_requirements"], has_private_answers: true, revision: 2, submitted_at: "2027-09-02T03:04:05Z", complete: true },
      { invitation_id: "invite:sam", person_id: "person:sam", event_id: "event:wedding-day", attendance: "attending", answers: { meal_choice: "Chicken" }, private_answer_question_ids: [], has_private_answers: false, revision: 2, submitted_at: "2027-09-02T03:04:05Z", complete: true },
    ],
  } }));
  await page.route("**/wedding/rsvp/capabilities/respond", async (route) => {
    const body = route.request().postDataJSON() as { invitation_id: string };
    submitted.push(body.invitation_id);
    await route.fulfill({ json: { replayed: false, explanation: "Saved", response: { revision: 3, responded_at: "2027-09-03T03:04:05Z" }, impact_receipt: { effects: ["guest_attendance_updated"] } } });
  });
  await page.goto("/workspace/rsvp.html#returning-token", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Edit RSVP" }).click();
  await page.getByLabel(/Meal choice/).nth(1).selectOption("Vegetarian");
  await page.getByRole("button", { name: "Review RSVP" }).click();
  await page.getByRole("button", { name: "Submit RSVP" }).click();
  await expect(page.getByRole("heading", { name: "Your RSVP confirmation" })).toBeVisible();
  expect(submitted).toEqual(["invite:sam"]);
});

test("public RSVP keeps a loading state and reflows at 200 percent text zoom", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await mockRsvp(page, 500);
  await page.goto("/workspace/rsvp.html#browser-test-token", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("status")).toContainText("Opening your private RSVP");
  await expect(page.getByRole("heading", { name: "RSVP for Wedding day" })).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).not.toHaveCount(0);
});

test("invalid and expired links use one generic safe state", async ({ page }) => {
  await page.route("**/wedding/rsvp/capabilities/open", (route) => route.fulfill({ status: 404, body: "This RSVP invitation is not available." }));
  await page.goto("/workspace/rsvp.html#invalid-token", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "RSVP unavailable" })).toBeVisible();
  await expect(page.getByText(/expired or been replaced/i)).toBeVisible();
  await expect(page).toHaveURL(/\/workspace\/rsvp\.html$/);
});

test("short-lived Test view is labelled, accessible and makes no production RSVP request", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  let productionRequests = 0;
  await page.route("**/wedding/rsvp/capabilities/**", (route) => { productionRequests += 1; return route.abort(); });
  const envelope = {
    version: 1, mode: "test", issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    experience: { mode: "test", householdLabel: "Rivera household", recipientLabels: ["Alex Rivera", "Sam Rivera"], hostLabel: "Alex and Taylor", eventLabel: "Wedding day", responseDeadline: "2027-10-01", eventDate: "2027-11-15", eventLocalTime: "16:30", eventTimeZone: "Australia/Sydney", venueName: "Garden Room", venueAddress: null, questions: [{ label: "Attendance", required: true, sensitive: false }], expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() },
  };
  const fragment = Buffer.from(JSON.stringify(envelope)).toString("base64url");
  await page.goto(`/workspace/rsvp.html#test.${fragment}`, { waitUntil: "networkidle" });
  await expect(page).toHaveTitle(/Test RSVP/);
  await expect(page.getByRole("heading", { name: "RSVP for Wedding day" })).toBeVisible();
  await expect(page.getByText(/nothing can be submitted/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "RSVP" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Directions" })).toHaveCount(0);
  expect(productionRequests).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
});

test("locked returning RSVP routes changes to the couple instead of overwriting", async ({ page }) => {
  await page.route("**/wedding/rsvp/capabilities/open", (route) => route.fulfill({ json: {
    ...scope,
    latest_responses: [{ invitation_id: "invite:alex", person_id: "person:alex", event_id: "event:wedding-day", attendance: "attending", answers: { meal_choice: "Vegetarian" }, private_answer_question_ids: [], has_private_answers: false, revision: 4, submitted_at: "2027-09-02T03:04:05Z", complete: true, locked_at: "2027-09-10T00:00:00Z" }],
  } }));
  await page.goto("/workspace/rsvp.html#locked-token", { waitUntil: "networkidle" });
  await expect(page.getByText(/Contact the couple to request a late-change review/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit RSVP" })).toHaveCount(0);
});
