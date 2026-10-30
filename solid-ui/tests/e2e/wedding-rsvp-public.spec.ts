import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const scope = {
  capability_id: "rsvp-capability-browser-test",
  household_id: "household:rivera",
  host_label: "Alex and Taylor",
  event_id: "event:wedding-day",
  event_label: "Wedding day",
  response_deadline: "2027-10-01",
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
    await route.fulfill({ json: { replayed: false, explanation: "Saved", response: { revision: 2 }, impact_receipt: { effects: ["guest_attendance_updated"] } } });
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
    await expect(page.getByRole("heading", { name: "Thank you — RSVP received" })).toBeFocused();
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
  await expect(page.getByRole("heading", { name: "Thank you — RSVP received" })).toBeVisible();
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
