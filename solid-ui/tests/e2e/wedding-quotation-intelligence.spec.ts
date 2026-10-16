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
  test(`quotation review and closure remain accessible at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/workspace/e2e/quotation-intelligence-fixture.html", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Review Harbour House quotation" })).toBeVisible();
    await expect(page.getByText("Recording a deposit does not send or execute a payment.")).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertAccessible(page);

    const sourceButton = page.getByRole("button", { name: "View source" });
    await sourceButton.click();
    const drawer = page.getByRole("dialog", { name: "Venue hire evidence" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Venue hire is AUD 12,500", { exact: false })).toBeVisible();
    await expect(drawer.locator("img")).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    await assertAccessible(page);
    await page.getByRole("button", { name: "Close source evidence" }).click();
    await expect(sourceButton).toBeFocused();

    await page.getByLabel("Recipient").fill("updated@example.test");
    await expect(page.getByTestId("clarification-status")).toContainText("editing");
    await expect(page.getByRole("button", { name: "Send approved questions" })).toBeDisabled();
    await page.getByRole("button", { name: "Review approval" }).click();
    await page.getByRole("button", { name: "Send approved questions" }).click();
    await expect(page.getByTestId("clarification-status")).toContainText("sent · provider-fixture-1");

    await page.getByRole("button", { name: "Record deposit request" }).click();
    await expect(page.getByTestId("closure-action")).toContainText("record-deposit:closure-3");
    await assertAccessible(page);
  });
}
