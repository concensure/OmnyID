import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function assertAccessible(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations.filter((violation) => (
    violation.impact === "serious" || violation.impact === "critical"
  ))).toEqual([]);
}

async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
}

for (const viewport of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
  test(`decision closure remains keyboard accessible at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/workspace/e2e/quotation-decision-closure-fixture.html", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Booking progress" })).toBeVisible();
    await expect(page.getByText("Records only — OmnyID will not make a payment.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What the vendor will see" })).toBeVisible();
    await expect(page.getByText("guest count")).toBeVisible();
    await expect(page.getByText("private note")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Record deposit request" }).locator("..")).toHaveAttribute("data-swipe-ignore", "true");
    await assertNoHorizontalOverflow(page);
    await assertAccessible(page);

    const action = page.getByRole("button", { name: "Record deposit request" });
    await action.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("closure-action")).toContainText("closure:closure-contract-reviewed:deposit_requested");

    const source = page.getByRole("button", { name: /View source: application\/pdf contract-source-1/ }).first();
    await source.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("closure-source")).toContainText("contract-source-1-v1");

    await page.getByRole("button", { name: "Simulate newer quotation" }).click();
    await expect(page.getByRole("alert")).toContainText("newer quotation version");
    await expect(page.getByRole("button", { name: "Record deposit request" })).toHaveCount(0);
    const refresh = page.getByRole("button", { name: "Refresh quotation state" });
    await expect(refresh).toBeVisible();
    await refresh.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Record deposit request" })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertAccessible(page);
  });
}
