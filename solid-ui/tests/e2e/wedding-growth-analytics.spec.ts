import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("Growth panel keeps typed states and usable tabs at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/workspace/e2e/wedding-growth-analytics.html", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Campaign analytics" })).toBeVisible();
  await expect(page.getByText("Provisional", { exact: true })).toBeVisible();
  await expect(page.getByText("Not available", { exact: true })).toHaveCount(2);
  await page.getByRole("tab", { name: "Campaigns" }).click();
  await expect(page.getByRole("heading", { name: "spring" })).toBeVisible();
  await expect(page.getByRole("article").getByText("First-party visits")).toBeVisible();
  await expect(page.getByRole("article").getByText("Meta views")).toBeVisible();
  await page.getByRole("tab", { name: "Data quality" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Unmatched spend")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Data quality" })).toBeFocused();
  await page.getByRole("tab", { name: "Benchmarks" }).click();
  await page.getByLabel(/Target/).fill("25");
  await page.getByLabel("Rationale").fill("Reviewed internal signup target.");
  await page.getByRole("button", { name: "Save target revision" }).click();
  await expect(page.getByText(/Saved percentage target/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
});
