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
  await expect(page.getByText("Research photographers", { exact: true })).toBeVisible();
  await expect(page.getByText("Swipe up for later, swipe down to approve", { exact: true })).toBeVisible();

  await verticalSwipe(page, "down");
  await expect(page.getByRole("status")).toHaveText("Opened Search vendors by swipe");
  await expect(page.getByText("Swipe up for later, swipe down to approve", { exact: true })).toHaveCount(0);

  await page.reload({ waitUntil: "networkidle" });
  await verticalSwipe(page, "up");
  await expect(page.getByRole("status")).toHaveText("Deferred Research photographers by swipe");
  await expect(page.getByText("Confirm catering", { exact: true })).toBeVisible();
});
