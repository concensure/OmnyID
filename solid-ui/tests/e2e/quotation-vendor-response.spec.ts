import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
  test(`claimed vendor response is scoped and accessible at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/workspace/e2e/quotation-vendor-response-fixture.html", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Quotation responses" })).toBeVisible();
    await expect(page.getByText("Quotation quote-synthetic-1")).toBeVisible();
    await expect(page.getByText("private note")).toHaveCount(0);
    await expect(page.getByText("competitor")).toHaveCount(0);
    await page.getByRole("button", { name: "Unlock on this device" }).click();
    await expect(page.getByText("guest count")).toBeVisible();
    await expect(page.getByText(/does not accept a booking, contract, or payment/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /book|pay|accept contract/i })).toHaveCount(0);
    await page.getByLabel("Are you available on the requested date?").fill("Yes, the package is available.");
    await page.getByLabel("Authorised representative").fill("Synthetic Vendor");
    await page.getByRole("button", { name: "Send response for review" }).click();
    await expect(page.getByRole("status")).toContainText("receipt-synthetic-1");

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
  });
}
