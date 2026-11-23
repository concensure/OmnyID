import { expect, test, type Page } from "@playwright/test";

async function verticalSwipe(page: Page, direction: "up" | "down") {
  const deck = page.getByRole("group", { name: /Decision 1 of 2/ });
  const box = await deck.boundingBox();
  if (!box) throw new Error("Decision deck was not measurable.");
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, 220);
  await page.mouse.move(x, y);
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.mouse.move(x, y + (direction === "down" ? 100 : -105), { steps: 8 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(250);
}

test("mobile vertical swipes perform the action they advertise", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/workspace/e2e/wedding-mobile-focus-deck.html", { waitUntil: "networkidle" });
  await expect(page.getByText("How should your wedding party travel?", { exact: true })).toBeVisible();
  await expect(page.getByText(/Who needs a lift, between which locations/)).toBeVisible();
  await expect(page.getByText(/saved evidence|hard constraints|ready to review/i)).toHaveCount(0);
  await expect(page.getByText("Remind me 15 September 2028", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm who needs transport" })).toBeVisible();
  await expect(page.getByText("Swipe up for later, swipe down to approve", { exact: true })).toBeVisible();

  await verticalSwipe(page, "down");
  await expect(page.getByRole("status")).toHaveText("Opened Confirm who needs transport by swipe");
  await expect(page.getByText("Swipe up for later, swipe down to approve", { exact: true })).toHaveCount(0);

  await page.reload({ waitUntil: "networkidle" });
  await verticalSwipe(page, "up");
  await expect(page.getByRole("status")).toContainText("Deferred Book limousine or wedding transport and pickup schedule by swipe");
  await expect(page.getByText("Confirm catering", { exact: true })).toBeVisible();
});

test("mobile card keeps actions visible and allows an explicit reminder date", async ({ page }) => {
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/workspace/e2e/wedding-mobile-focus-deck.html", { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "Remind me 15 September 2028" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Confirm who needs transport" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }

  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await expect(page.getByRole("button", { name: "Remind me 15 September 2028" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Confirm who needs transport" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  const remind = page.getByRole("button", { name: "Remind me 15 September 2028" });
  await remind.click();
  await expect(page.getByRole("dialog", { name: "When should this return?" })).toBeVisible();
  await page.getByLabel("Reminder date").fill("2028-09-20");
  await page.getByRole("button", { name: "Set reminder" }).click();
  await expect(page.getByRole("status")).toContainText("until 2028-09-20");
});
