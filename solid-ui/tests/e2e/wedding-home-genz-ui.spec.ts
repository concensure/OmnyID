import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function openFixture(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/workspace/e2e/wedding-home-genz-ui.html", { waitUntil: "networkidle" });
}

for (const viewport of [{ width: 320, height: 720 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`wedding home remains native-feeling and bounded at ${viewport.width}px`, async ({ page }, testInfo) => {
    await openFixture(page, viewport.width, viewport.height);
    await expect(page.getByText("Find vendors", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/25% of planning tasks complete/)).toBeVisible();
    await expect(page.getByText("Invalid AFP payload from provider")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "A wedding decision to review" })).toBeVisible();

    await page.getByRole("button", { name: "Photographers" }).click();
    await expect(page.getByPlaceholder("Search photographers, venues, bands…")).toHaveValue("wedding photographers");
    await expect(page.getByText(/couldn't refresh vendor matches/i)).toBeVisible();
    await expect(page.getByText(/HTTP|provider_token|payload/i)).toHaveCount(0);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);

    if (viewport.width < 640) {
      const tabs = page.getByRole("navigation", { name: "Wedding planner" }).getByRole("tab");
      await expect(tabs).toHaveCount(5);
      await expect(page.getByRole("tab", { name: "Home" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Vendors" })).toBeVisible();
      const navBox = await page.getByRole("navigation", { name: "Wedding planner" }).boundingBox();
      expect(navBox?.y).toBeGreaterThanOrEqual(viewport.height - 80);
    }
    if (viewport.width === 320) await page.screenshot({ path: testInfo.outputPath("wedding-home-320.png"), fullPage: true });
  });
}
