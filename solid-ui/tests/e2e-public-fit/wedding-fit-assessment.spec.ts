import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("qualified Wedding proof and guest preview work at phone width", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Less wedding admin. More wedding." })).toBeVisible();
  await expect(page.getByText("Illustrative scenario, not a customer story.")).toBeVisible();
  await expect(page.getByText("Renee and Kai are fictional", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Guests" }).click();
  await expect(page.getByRole("heading", { name: "Guest replies", exact: true })).toBeVisible();
  await expect(page.getByText("One guest record, connected")).toBeVisible();
  await page.locator('[data-pane="guests"]').evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished));
  });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});

test("pricing and directory avoid unsupported claims", async ({ page }) => {
  await page.goto("/pricing.html");
  await expect(page.getByText("Most couples choose this")).toHaveCount(0);
  await expect(page.getByText(/monthly limit/i)).toHaveCount(0);

  await page.goto("/vendors.html");
  await expect(page.getByRole("heading", { name: "Find a vendor you can actually talk to." })).toBeVisible();
  await expect(page.getByText("NSW-first wedding directory")).toBeVisible();
  await expect(page.getByText("not that a vendor suits your wedding or is available", { exact: false })).toBeVisible();
});
