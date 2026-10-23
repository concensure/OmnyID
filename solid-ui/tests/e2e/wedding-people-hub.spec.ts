import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 320, height: 720 }, { width: 1280, height: 800 }]) {
  test(`People hub stays aligned and actionable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/workspace/e2e/wedding-people-hub.html", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
    await expect(page.getByText("Guests, family boundaries and seating in one place.")).toBeVisible();
    await expect(page.getByRole("button", { name: /17 replies waiting/ })).toBeVisible();
    await expect(page.locator('[data-people-action="guests"]')).toContainText("Manage Guests & Boundaries");
    await expect(page.locator('[data-people-action="seating"]')).toContainText("Open Seating Plan");

    const brand = await page.evaluate(() => {
      const card = getComputedStyle(document.querySelector('[data-people-action="guests"]')!);
      const action = getComputedStyle(document.querySelector('[data-people-cta]')!);
      const attention = getComputedStyle(document.querySelector('[data-people-status="replies"]')!);
      const positive = getComputedStyle(document.querySelector('[data-people-status="rules"]')!);
      return {
        card: [card.backgroundColor, card.borderRadius, card.borderColor],
        action: [action.backgroundColor, action.color, action.borderRadius],
        attention: [attention.backgroundColor, attention.color],
        positive: [positive.backgroundColor, positive.color],
      };
    });
    expect(brand).toEqual({
      card: ["rgb(255, 255, 255)", "12px", "rgb(232, 226, 217)"],
      action: ["rgb(15, 95, 90)", "rgb(250, 247, 242)", "8px"],
      attention: ["rgb(255, 240, 204)", "rgb(122, 74, 0)"],
      positive: ["rgb(221, 243, 230)", "rgb(20, 83, 45)"],
    });

    if (viewport.width >= 640) {
      const ctas = await page.locator("[data-people-cta]").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().y));
      expect(Math.abs(ctas[0]! - ctas[1]!)).toBeLessThan(2);
    }

    await page.getByRole("button", { name: /12 seats unassigned/ }).click();
    await expect(page.getByRole("status")).toHaveText("Opened seating");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
    if (viewport.width < 640) {
      await expect(page.getByRole("navigation", { name: "Wedding planner" }).getByRole("tab")).toHaveCount(5);
    }
  });
}
