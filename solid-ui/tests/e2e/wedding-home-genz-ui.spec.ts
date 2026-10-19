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
    await expect(page.getByLabel(/1 of 4 planning tasks complete/)).toBeVisible();
    await expect(page.getByText("Invalid AFP payload from provider")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "A wedding decision to review" })).toBeVisible();

    const brandStyles = await page.evaluate(() => {
      const styles = (selector: string) => getComputedStyle(document.querySelector(selector)!);
      const search = styles('[data-wedding-surface="vendor-search"]');
      const countdown = styles('[data-wedding-surface="countdown"]');
      const decision = styles('[data-wedding-brand="v2"]');
      const primary = styles('button[aria-label="Search vendors"]');
      return {
        search: [search.backgroundColor, search.borderRadius, search.borderColor],
        countdown: [countdown.backgroundColor, countdown.borderRadius],
        decision: [decision.backgroundColor, decision.borderRadius, decision.borderLeftColor],
        primary: [primary.backgroundColor, primary.borderRadius],
      };
    });
    expect(brandStyles).toEqual({
      search: ["rgb(255, 255, 255)", "12px", "rgb(232, 226, 217)"],
      countdown: ["rgb(255, 255, 255)", "12px"],
      decision: ["rgb(255, 255, 255)", "12px", "rgb(15, 95, 90)"],
      primary: ["rgb(15, 95, 90)", "8px"],
    });

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
