import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PRIMARY_VENDOR = "Bondi Icebergs Club Wedding Reception and Events";

async function openFixture(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/workspace/e2e/wedding-personalised-recommendation-baseline.html", { waitUntil: "networkidle" });
}

for (const viewport of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
  test(`keeps personalised comparison evidence visible after outreach at ${viewport.width}px`, async ({ page }, testInfo) => {
    await openFixture(page, viewport.width, viewport.height);

    const vendorHeading = page.getByRole("heading", { name: PRIMARY_VENDOR });
    const photo = page.getByRole("img", { name: `${PRIMARY_VENDOR} waterfront reception` });
    const recommendation = page.getByText(/currently ranks first on \d+ checked factors; compare its open questions/i);
    await expect(vendorHeading).toBeVisible();
    await expect(photo).toBeVisible();
    await expect(recommendation).toBeVisible();
    await expect(page.getByText(/venue fits what you've told us so far/i)).toHaveCount(0);

    const layout = await vendorHeading.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height };
    });
    expect(layout.width).toBeGreaterThan(180);
    expect(layout.height).toBeLessThan(80);
    expect(await photo.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    await page.locator('[data-wedding-vendor-intent="CHECK_AVAILABILITY_AND_REQUEST_QUOTE"]').first().click();
    await expect(page.getByLabel(`Suggested message for ${PRIMARY_VENDOR}`)).toBeVisible();
    await page.getByRole("button", { name: `Send to ${PRIMARY_VENDOR}` }).click();

    await expect(page.getByText("Message sent!", { exact: true })).toBeVisible();
    await expect(page.getByTestId("vendor-comparison-grid").locator(":scope > article")).toHaveCount(2);
    await expect(vendorHeading).toBeVisible();
    await expect(photo).toBeVisible();
    await expect(recommendation).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
    if (viewport.width === 360) {
      await page.screenshot({ path: testInfo.outputPath("bondi-vendor-post-send-mobile.png"), fullPage: true });
    }
  });
}
