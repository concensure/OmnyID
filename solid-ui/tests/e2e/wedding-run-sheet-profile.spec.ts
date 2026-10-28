import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 320, height: 720 }, { width: 375, height: 812 }, { width: 1280, height: 800 }]) {
  test(`run-sheet profile reflows and remains operable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/workspace/e2e/wedding-run-sheet-profile.html", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Run sheet" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Run-sheet controls" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add run-sheet item" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    if (viewport.width < 768) {
      await expect(page.getByRole("article")).toHaveCount(2);
      await page.getByRole("button", { name: "15 min earlier" }).first().click();
      await expect(page.getByRole("status")).toHaveText("Moved earlier");
    } else {
      await expect(page.getByRole("article")).toHaveCount(0);
    }

    await page.getByRole("button", { name: "Add run-sheet item" }).click();
    await expect(page.getByRole("dialog", { name: "Add run-sheet item" })).toBeVisible();
    await expect(page.getByLabel("Item name")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add run-sheet item" })).toBeFocused();

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
  });
}
