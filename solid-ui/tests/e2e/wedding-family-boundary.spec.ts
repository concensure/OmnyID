import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 320, height: 720 }, { width: 375, height: 812 }]) {
  test(`Family boundaries reflows and restores focus at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/workspace/e2e/wedding-family-boundary.html", { waitUntil: "networkidle" });

    await expect(page.getByText("Family boundaries", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Requests 1 Need review/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Households 1 Invitation groups/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const disclosure = page.getByRole("button", { name: "Open family boundaries" });
    await disclosure.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#wedding-family-boundary-details")).toBeFocused();
    await expect(page.getByText("Included for sharing")).toBeVisible();
    await page.getByRole("button", { name: "Close family boundaries" }).click();
    await expect(page.getByRole("button", { name: "Open family boundaries" })).toBeFocused();

    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    const overflow = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1;
      })
      .map((element) => ({ tag: element.tagName, text: element.textContent?.trim().slice(0, 80), className: element.className }))
      .slice(0, 8));
    expect(overflow).toEqual([]);
    await expect(page.getByText("Family boundaries", { exact: true })).toBeVisible();

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
  });
}
