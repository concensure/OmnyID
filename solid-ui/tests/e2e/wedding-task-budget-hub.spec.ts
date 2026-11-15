import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 320, height: 720 }, { width: 1280, height: 800 }]) {
  test(`task decisions and budget evidence stay usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/workspace/e2e/wedding-task-budget-hub.html", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Decisions and to-dos" })).toBeVisible();
    await page.getByRole("button", { name: /Choose and book the venue/ }).click();
    await expect(page.getByText("Decision 1")).toBeVisible();
    await expect(page.getByText("Decision 2")).toBeVisible();
    await expect(page.getByText("Harbour House", { exact: true })).toBeVisible();
    await expect(page.getByText("Chosen option")).toHaveCount(2);

    if (viewport.width < 640) {
      const nextBudgetTabs = page.getByRole("button", { name: "Show later budget tabs" });
      await expect(nextBudgetTabs).toBeVisible();
      await nextBudgetTabs.click();
      await expect(page.getByRole("button", { name: "Show earlier budget tabs" })).toBeVisible();
    }
    await page.getByRole("tab", { name: /Contracts/ }).click();
    await expect(page.getByText("Garden Hall booking contract")).toBeVisible();
    await page.getByRole("button", { name: "Open in Documents" }).click();
    await expect(page.getByRole("status")).toContainText("artifact:contract");

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
    if (viewport.width < 640) await expect(page.getByRole("navigation", { name: "Wedding planner" }).getByRole("tab")).toHaveCount(5);
  });
}
